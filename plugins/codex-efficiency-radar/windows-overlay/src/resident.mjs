import { execFile, spawn } from "node:child_process";
import { closeSync, mkdirSync, openSync } from "node:fs";
import { appendFile, readFile, rm } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  findCodexMainProcess,
  locateCodexPackage,
  matchCompatibility
} from "./package-locator.mjs";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stateDir = path.join(projectRoot, "state");
const logPath = path.join(stateDir, "resident.log");
const ignorePath = path.join(stateDir, "ignore-once.pid");
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

async function stopMainProcess(processId) {
  await execFileAsync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `Stop-Process -Id ${processId} -ErrorAction SilentlyContinue`
    ],
    { windowsHide: true }
  );
}

async function waitForMainExit(executablePath, processId) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const running = await findCodexMainProcess(executablePath);
    if (!running || running.processId !== processId) return;
    await sleep(100);
  }
  throw new Error(`普通 Codex 进程 ${processId} 未按预期退出。`);
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
      windowsHide: true
    }
  );
  return new Promise((resolve) => {
    child.once("exit", (code) => {
      closeSync(output);
      resolve(code);
    });
  });
}

async function main() {
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

  const installation = await locateCodexPackage(config.packageName);
  if (!matchCompatibility(installation, compatibility)) {
    await log(
      `客户端版本未审核，自动模式保持关闭：${installation.packageVersion} / ${installation.appVersion}`
    );
    lock.close();
    return;
  }

  const ignoredProcessId = await readIgnoredProcessId();
  let ignoredStillRunning = ignoredProcessId != null;
  await log(`常驻监视器已启动；忽略当前进程：${ignoredProcessId ?? "无"}`);

  while (lock.listening) {
    const running = await findCodexMainProcess(installation.executablePath);
    if (!running) {
      ignoredStillRunning = false;
      await sleep(400);
      continue;
    }

    if (ignoredStillRunning && running.processId === ignoredProcessId) {
      await sleep(400);
      continue;
    }

    const debugFlag = `--remote-debugging-port=${config.devtoolsPort}`;
    if (running.commandLine.includes(debugFlag)) {
      await log(`连接效率模式进程：${running.processId}`);
      await runInjector(true);
      continue;
    }

    await log(`拦截普通 Codex 进程：${running.processId}`);
    await stopMainProcess(running.processId);
    await waitForMainExit(installation.executablePath, running.processId);
    await log("正在按效率模式重新启动 Codex。");
    await runInjector(false);
  }
}

await main().catch(async (error) => {
  const detail = error?.stack || error?.message || String(error);
  await log(`常驻监视器异常退出：${detail}`);
  process.exitCode = 1;
});
