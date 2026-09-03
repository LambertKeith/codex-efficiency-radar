import { spawn } from "node:child_process";
import { closeSync, mkdirSync, openSync } from "node:fs";
import { appendFile, readFile, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  activateWindowsPackagedApp,
  findCodexMainProcess,
  getCodexPackageStamp,
  locateCodexPackage,
  matchCompatibility,
  preflightWindowsPackagedAppActivation,
  restoreWindowsPackagedApp,
  terminateCodexMainProcess
} from "./package-locator.mjs";
import {
  createCompatibilityRefresher,
  loadCompatibilityDocument
} from "./compatibility-update.mjs";
import {
  circuitBreakerState,
  injectorDeferred,
  injectorFailed,
  injectorFailureReason
} from "./runtime-policy.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stateDir = path.join(projectRoot, "state");
const logPath = path.join(stateDir, "resident.log");
const ignorePath = path.join(stateDir, "ignore-once.pid");
const disabledPath = path.join(stateDir, "overlay-disabled.json");
mkdirSync(stateDir, { recursive: true });

async function log(message) {
  await appendFile(logPath, `${new Date().toISOString()} ${message}\n`, "utf8").catch(() => {});
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function readIgnoredProcessId() {
  const commandLineValue = Number(
    process.argv.find((argument) => argument.startsWith("--ignore-pid="))?.split("=")[1]
  );
  if (Number.isInteger(commandLineValue) && commandLineValue > 0) {
    return commandLineValue;
  }

  const storedValue = Number((await readFile(ignorePath, "utf8").catch(() => "")).trim());
  await rm(ignorePath, { force: true }).catch(() => {});
  return Number.isInteger(storedValue) && storedValue > 0 ? storedValue : null;
}

async function reserveResidentLock() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(19333, "127.0.0.1", resolve);
  });
  return server;
}

async function assertLoopbackPortAvailable(port) {
  const server = net.createServer();
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, "127.0.0.1", resolve);
    });
  } catch (error) {
    if (error?.code === "EADDRINUSE") {
      throw new Error(`本机调试端口 ${port} 已被占用`);
    }
    throw error;
  } finally {
    if (server.listening) {
      await new Promise((resolve) => server.close(resolve));
    }
  }
}

async function verifyRestartPrerequisites(installation, devtoolsPort) {
  await assertLoopbackPortAvailable(devtoolsPort);
  if (installation.platform === "win32") {
    await activateWindowsPackagedApp(installation.appUserModelId, []);
    await log("Windows 打包应用实际激活预检通过；普通 Codex 尚未结束。");
  }
}

async function waitForMainExit(executablePath, processId) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const running = await findCodexMainProcess(executablePath);
    if (!running || running.processId !== processId) return;
    await sleep(100);
  }
  throw new Error(`普通 Codex 进程 ${processId} 未按预期退出`);
}

function runInjector(attach) {
  const output = openSync(logPath, "a");
  const child = spawn(
    process.execPath,
    [path.join(projectRoot, "src", "launcher.mjs"), ...(attach ? ["--attach"] : [])],
    {
      cwd: projectRoot,
      detached: false,
      stdio: ["ignore", output, output],
      windowsHide: process.platform === "win32"
    }
  );
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      closeSync(output);
      resolve(result);
    };
    child.once("error", (error) => finish({ code: null, signal: null, error }));
    child.once("exit", (code, signal) => finish({ code, signal, error: null }));
  });
}

async function tripCircuitBreaker(reason, details = {}) {
  const state = circuitBreakerState(reason, details);
  await writeFile(disabledPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  await log(`安全熔断已触发，选择器增强保持关闭：${reason}`);
}

async function restoreStandardCodex(installation) {
  const running = await findCodexMainProcess(installation.executablePath).catch(() => null);
  if (running) {
    await log(
      `未请求标准 Codex 重启：已有主进程 ${running.processId}，为避免再次中断而保留当前客户端。`
    );
    return;
  }

  if (installation.platform === "win32") {
    await restoreWindowsPackagedApp(installation.appUserModelId);
    await log("已请求 Windows 恢复标准 Codex 启动。");
    return;
  }

  const child = spawn("/usr/bin/open", ["-na", installation.appBundlePath], {
    detached: true,
    stdio: "ignore"
  });
  await new Promise((resolve, reject) => {
    child.once("spawn", resolve);
    child.once("error", reject);
  });
  child.unref();
  await log("已请求 macOS 恢复标准 Codex 启动。");
}

function installationIdentity(installation) {
  if (!installation) return "";
  return [
    installation.platform,
    installation.arch,
    installation.packageVersion,
    installation.appVersion,
    installation.executableVersion,
    installation.appUserModelId,
    installation.bundleIdentifier,
    installation.teamIdentifier,
    installation.asarSha256
  ].join("|");
}

function positiveSetting(value, fallback, minimum = 250) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(minimum, number) : fallback;
}

async function main() {
  if (await readFile(disabledPath, "utf8").then(() => true, () => false)) {
    await log("检测到安全熔断状态；重新安装选择器增强前不会拦截 Codex。");
    return;
  }

  const config = JSON.parse(await readFile(path.join(projectRoot, "config.json"), "utf8"));
  let compatibility = await loadCompatibilityDocument(projectRoot);
  const compatibilityRefresher = createCompatibilityRefresher({
    projectRoot,
    settings: config.compatibilityUpdate
  });
  const packagePollMs = positiveSetting(config.packagePollMs, 300000);
  const compatibilityRetryMs = positiveSetting(config.compatibilityRetryMs, 5000, 1000);

  let lock;
  try {
    lock = await reserveResidentLock();
  } catch (error) {
    if (error?.code === "EADDRINUSE") return;
    throw error;
  }

  const ignoredProcessId = await readIgnoredProcessId();
  let ignoredStillRunning = ignoredProcessId != null;
  let pendingEnhancedLaunch = false;
  let installation = null;
  let target = null;
  let packageStamp = "";
  let nextPackageCheckAt = 0;
  let lastUnsupportedIdentity = "";
  let unreviewedProcessId = null;
  let lastPackageError = "";
  let preflightIdentity = "";
  await log(`常驻监视器已启动；忽略当前进程：${ignoredProcessId ?? "无"}`);

  async function refreshCompatibility(force) {
    const result = await compatibilityRefresher({ force });
    if (result.document) compatibility = result.document;
    if (result.status === "updated") {
      await log("已自动同步官方兼容清单；重新评估当前 Codex 客户端。");
    } else if (result.status === "failed" && result.error) {
      await log(`兼容清单自动同步失败：${result.error.message}`);
    }
    return result;
  }

  async function resolveCurrentInstallation(force = false) {
    if (!force && installation && Date.now() < nextPackageCheckAt) {
      target = matchCompatibility(installation, compatibility);
      return { installation, target, error: null };
    }

    try {
      const nextStamp = await getCodexPackageStamp(config.packageName, {
        appPaths: config.macAppPaths
      });
      const packageChanged = nextStamp !== packageStamp;
      const previousIdentity = installationIdentity(installation);
      if (force || !installation || packageChanged) {
        installation = await locateCodexPackage(config.packageName, {
          appPaths: config.macAppPaths
        });
        packageStamp = nextStamp;
      }
      const nextIdentity = installationIdentity(installation);
      const changed = nextIdentity !== previousIdentity;
      nextPackageCheckAt = Date.now() + packagePollMs;
      target = matchCompatibility(installation, compatibility);

      if (changed && previousIdentity && target) {
        const updatedProcess = await findCodexMainProcess(installation.executablePath).catch(() => null);
        const debugFlag = `--remote-debugging-port=${config.devtoolsPort}`;
        if (updatedProcess && !updatedProcess.commandLine.includes(debugFlag)) {
          unreviewedProcessId = updatedProcess.processId;
          await log("检测到已审核的 Codex 更新；等待当前原生进程退出后自动恢复增强。");
        }
      }

      if (!target) {
        const firstObservation = changed || nextIdentity !== lastUnsupportedIdentity;
        if (firstObservation) {
          lastUnsupportedIdentity = nextIdentity;
          await log(
            `检测到尚未审核的 Codex 构建：${installation.packageVersion} / ${installation.appVersion}；` +
            "保持原生选择器并自动同步审核清单。"
          );
        }
        await refreshCompatibility(firstObservation);
        target = matchCompatibility(installation, compatibility);
        if (target) {
          const unreviewed = await findCodexMainProcess(installation.executablePath).catch(() => null);
          unreviewedProcessId = unreviewed?.processId ?? null;
          lastUnsupportedIdentity = "";
          await log("当前 Codex 构建已进入审核清单，准备自动恢复选择器增强。");
        }
      } else if (lastUnsupportedIdentity === nextIdentity) {
        lastUnsupportedIdentity = "";
        await log("当前 Codex 构建已确认，恢复选择器增强监视。");
      }
      lastPackageError = "";
      return { installation, target, error: null };
    } catch (error) {
      nextPackageCheckAt = Date.now() + packagePollMs;
      target = null;
      const message = error?.message || String(error);
      if (message !== lastPackageError) {
        lastPackageError = message;
        await log(`读取 Codex 安装信息失败，将自动重试：${message}`);
      }
      return { installation: null, target: null, error };
    }
  }

  async function ensureWindowsPreflight() {
    if (!installation || installation.platform !== "win32") return;
    const identity = installationIdentity(installation);
    if (preflightIdentity === identity) return;
    await preflightWindowsPackagedAppActivation(installation.appUserModelId);
    preflightIdentity = identity;
  }

  async function changedDuringInjector(previousIdentity) {
    const latest = await resolveCurrentInstallation(true);
    if (latest.error || !latest.installation) {
      await log("注入结束后暂时无法读取客户端身份，跳过熔断并等待重试。");
      return true;
    }
    if (installationIdentity(latest.installation) === previousIdentity) return false;
    await log("注入期间检测到 Codex 已更新，跳过熔断并等待新的审核条目。");
    await restoreStandardCodex(latest.installation).catch(async (error) => {
      await log(`恢复更新后的标准 Codex 失败：${error.message}`);
    });
    return true;
  }

  while (lock.listening) {
    const current = await resolveCurrentInstallation();
    if (current.error || !current.installation) {
      await sleep(packagePollMs);
      continue;
    }
    if (!current.target) {
      try {
        const unreviewed = await findCodexMainProcess(current.installation.executablePath);
        unreviewedProcessId = unreviewed?.processId ?? null;
      } catch (error) {
        await log(`读取未审核 Codex 进程失败，将自动重试：${error.message}`);
      }
      await sleep(compatibilityRetryMs);
      continue;
    }

    try {
      await ensureWindowsPreflight();
    } catch (error) {
      await tripCircuitBreaker(`Windows 打包应用激活预检失败：${error.message}`);
      await restoreStandardCodex(installation).catch(async (restoreError) => {
        await log(`恢复标准 Codex 失败：${restoreError.message}`);
      });
      lock.close();
      return;
    }

    let running;
    try {
      running = await findCodexMainProcess(installation.executablePath);
    } catch (error) {
      await log(`读取 Codex 进程失败，将自动重试：${error.message}`);
      await sleep(packagePollMs);
      continue;
    }
    if (!running) {
      if (unreviewedProcessId != null) {
        unreviewedProcessId = null;
        pendingEnhancedLaunch = true;
        await log("审核清单已就绪；当前原生 Codex 已退出，准备自动恢复增强模式。");
      }
      if (ignoredStillRunning) {
        ignoredStillRunning = false;
        pendingEnhancedLaunch = true;
        await log("安装时运行的普通 Codex 已完整退出，准备启动增强模式。");
      }

      if (pendingEnhancedLaunch) {
        pendingEnhancedLaunch = false;
        try {
          await assertLoopbackPortAvailable(config.devtoolsPort);
          await log("正在按效率模式启动 Codex。");
          const result = await runInjector(false);
          if (injectorDeferred(result)) {
            await log("普通 Codex 在增强启动前先行出现；返回监视循环处理。");
            continue;
          }
          if (injectorFailed(result)) {
            if (await changedDuringInjector(installationIdentity(installation))) continue;
            throw new Error(injectorFailureReason(result));
          }
        } catch (error) {
          await tripCircuitBreaker(error.message, { phase: "launch" });
          await restoreStandardCodex(installation).catch(async (restoreError) => {
            await log(`恢复标准 Codex 失败：${restoreError.message}`);
          });
          lock.close();
          return;
        }
        continue;
      }

      await sleep(400);
      continue;
    }

    if (ignoredStillRunning && running.processId === ignoredProcessId) {
      await sleep(400);
      continue;
    }

    if (unreviewedProcessId != null && running.processId === unreviewedProcessId) {
      await sleep(400);
      continue;
    }
    unreviewedProcessId = null;

    const debugFlag = `--remote-debugging-port=${config.devtoolsPort}`;
    if (running.commandLine.includes(debugFlag)) {
      await log(`连接效率模式进程：${running.processId}`);
      const result = await runInjector(true);
      if (injectorFailed(result)) {
        if (await changedDuringInjector(installationIdentity(installation))) continue;
        await tripCircuitBreaker(injectorFailureReason(result), {
          phase: "attach",
          exitCode: result.code,
          signal: result.signal
        });
        await restoreStandardCodex(installation).catch(async (restoreError) => {
          await log(`恢复标准 Codex 失败：${restoreError.message}`);
        });
        lock.close();
        return;
      }
      continue;
    }

    try {
      const previousIdentity = installationIdentity(installation);
      await verifyRestartPrerequisites(installation, config.devtoolsPort);
      await log(`拦截普通 Codex 进程：${running.processId}`);
      await terminateCodexMainProcess(running.processId);
      await waitForMainExit(installation.executablePath, running.processId);
      await log("正在按效率模式重新启动 Codex。");
      const result = await runInjector(false);
      if (injectorDeferred(result)) {
        await log("新的普通 Codex 在受控重启期间先行出现；返回监视循环处理。");
        continue;
      }
      if (injectorFailed(result)) {
        if (await changedDuringInjector(previousIdentity)) continue;
        throw new Error(injectorFailureReason(result));
      }
    } catch (error) {
      await tripCircuitBreaker(error.message, {
        phase: "restart",
        processId: running.processId
      });
      await restoreStandardCodex(installation).catch(async (restoreError) => {
        await log(`恢复标准 Codex 失败：${restoreError.message}`);
      });
      lock.close();
      return;
    }
  }
}

await main().catch(async (error) => {
  const detail = error?.stack || error?.message || String(error);
  await log(`常驻监视器异常退出：${detail}`);
  process.exitCode = 1;
});
