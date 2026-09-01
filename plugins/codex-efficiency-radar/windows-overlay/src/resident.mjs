import { spawn } from "node:child_process";
import { closeSync, mkdirSync, openSync } from "node:fs";
import { appendFile, readFile, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  activateWindowsPackagedApp,
  findCodexMainProcess,
  locateCodexPackage,
  matchCompatibility,
  preflightWindowsPackagedAppActivation,
  restoreWindowsPackagedApp,
  terminateCodexMainProcess
} from "./package-locator.mjs";
import {
  circuitBreakerState,
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

async function main() {
  if (await readFile(disabledPath, "utf8").then(() => true, () => false)) {
    await log("检测到安全熔断状态；重新安装选择器增强前不会拦截 Codex。");
    return;
  }

  const config = JSON.parse(await readFile(path.join(projectRoot, "config.json"), "utf8"));
  const compatibility = JSON.parse(
    await readFile(path.join(projectRoot, "compatibility.json"), "utf8")
  );

  let lock;
  try {
    lock = await reserveResidentLock();
  } catch (error) {
    if (error?.code === "EADDRINUSE") return;
    throw error;
  }

  let installation = await locateCodexPackage(config.packageName, {
    appPaths: config.macAppPaths
  });
  if (!matchCompatibility(installation, compatibility)) {
    await log(
      `客户端版本未审核，自动模式保持关闭：${installation.packageVersion} / ${installation.appVersion}`
    );
    lock.close();
    return;
  }

  if (installation.platform === "win32") {
    try {
      await preflightWindowsPackagedAppActivation(installation.appUserModelId);
    } catch (error) {
      await tripCircuitBreaker(`Windows 打包应用激活预检失败：${error.message}`);
      await restoreStandardCodex(installation).catch(async (restoreError) => {
        await log(`恢复标准 Codex 失败：${restoreError.message}`);
      });
      lock.close();
      return;
    }
  }

  const ignoredProcessId = await readIgnoredProcessId();
  let ignoredStillRunning = ignoredProcessId != null;
  let pendingEnhancedLaunch = false;
  await log(`常驻监视器已启动；忽略当前进程：${ignoredProcessId ?? "无"}`);

  while (lock.listening) {
    const running = await findCodexMainProcess(installation.executablePath);
    if (!running) {
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
          if (injectorFailed(result)) {
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

    installation = await locateCodexPackage(config.packageName, {
      appPaths: config.macAppPaths
    });
    if (!matchCompatibility(installation, compatibility)) {
      await log(
        `检测到未审核的客户端更新，自动模式已关闭：${installation.packageVersion} / ${installation.appVersion}`
      );
      lock.close();
      return;
    }

    const debugFlag = `--remote-debugging-port=${config.devtoolsPort}`;
    if (running.commandLine.includes(debugFlag)) {
      await log(`连接效率模式进程：${running.processId}`);
      const result = await runInjector(true);
      if (injectorFailed(result)) {
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
      await verifyRestartPrerequisites(installation, config.devtoolsPort);
      await log(`拦截普通 Codex 进程：${running.processId}`);
      await terminateCodexMainProcess(running.processId);
      await waitForMainExit(installation.executablePath, running.processId);
      await log("正在按效率模式重新启动 Codex。");
      const result = await runInjector(false);
      if (injectorFailed(result)) {
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
