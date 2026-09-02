import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { CdpClient } from "./cdp-client.mjs";
import { buildInjectionSource } from "./injection-script.mjs";
import {
  activateWindowsPackagedApp,
  isCodexMainProcessRunning,
  locateCodexPackage,
  matchCompatibility,
  preflightWindowsPackagedAppActivation
} from "./package-locator.mjs";
import { createRadarProvider } from "./radar-provider.mjs";
import { INJECTOR_DEFERRED_EXIT_CODE } from "./runtime-policy.mjs";

function failFast(reason) {
  const message = reason instanceof Error ? reason.message : String(reason);
  console.error(`[效率选择器] ${message}`);
  process.exit(1);
}

process.on("uncaughtException", failFast);
process.on("unhandledRejection", failFast);

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(await readFile(path.join(projectRoot, "config.json"), "utf8"));
const compatibility = JSON.parse(await readFile(path.join(projectRoot, "compatibility.json"), "utf8"));
const radarClientPath = path.resolve(projectRoot, config.radarClientPath);
const flags = new Set(process.argv.slice(2));
const endpoint = `http://127.0.0.1:${config.devtoolsPort}`;

function log(message) {
  console.log(`[效率选择器] ${message}`);
}

async function getJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function endpointReady() {
  try {
    await getJson(`${endpoint}/json/version`);
    return true;
  } catch {
    return false;
  }
}

async function waitForEndpoint(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await endpointReady()) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Codex 调试端口未在预期时间内启动。请完全退出 Codex 后再使用本启动器。 ");
}

const installation = await locateCodexPackage(config.packageName, {
  appPaths: config.macAppPaths
});
const target = matchCompatibility(installation, compatibility);
if (!target) {
  const message =
    `当前客户端版本尚未审核，已拒绝注入。package=${installation.packageVersion}，` +
    `app=${installation.appVersion}，exe=${installation.executableVersion}，asar=${installation.asarSha256}`;
  if (flags.has("--diagnose")) {
    console.error(`[效率选择器] ${message}`);
    process.exit(2);
  }
  throw new Error(message);
}

if (installation.platform === "win32") {
  await preflightWindowsPackagedAppActivation(installation.appUserModelId);
}

log(`兼容性检查通过：${installation.packageFullName}`);
log(`app.asar 哈希：${installation.asarSha256}`);

if (flags.has("--diagnose")) {
  log(`选择器契约：${target.selectorContract}`);
  log(`Radar 数据层：${radarClientPath}`);
  process.exit(0);
}

if (!flags.has("--attach") && !(await endpointReady())) {
  if (await isCodexMainProcessRunning(installation.executablePath)) {
    log("Codex 已先行启动；交由常驻监视器重新评估该进程。");
    process.exit(INJECTOR_DEFERRED_EXIT_CODE);
  }
  log("正在通过受控调试端口启动官方 Codex 客户端…");
  const debugArguments = [
    `--remote-debugging-port=${config.devtoolsPort}`,
    "--remote-debugging-address=127.0.0.1"
  ];
  if (installation.platform === "win32") {
    const processId = await activateWindowsPackagedApp(
      installation.appUserModelId,
      debugArguments
    );
    log(`已通过 Windows 打包应用激活接口启动 Codex（PID ${processId}）。`);
  } else {
    const child = spawn("/usr/bin/open", ["-na", installation.appBundlePath, "--args", ...debugArguments], {
      detached: false,
      stdio: "ignore"
    });
    child.on("error", (error) => log(`客户端启动失败：${error.message}`));
  }
}

await waitForEndpoint(config.startupTimeoutMs);
const radar = await createRadarProvider(radarClientPath);
let snapshot = await radar.getSnapshot({ force: false });
let refreshPromise = null;
const clients = new Map();
let consecutiveDiscoveryFailures = 0;

async function broadcast(nextSnapshot) {
  const source = buildInjectionSource(nextSnapshot);
  await Promise.allSettled(
    [...clients.values()].map((client) =>
      client.send("Runtime.evaluate", { expression: source, awaitPromise: false })
    )
  );
}

async function refresh() {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    log("正在刷新 CodexRadar 效率值…");
    snapshot = await radar.getSnapshot({ force: true });
    await broadcast(snapshot);
    log(`效率值已刷新：${snapshot.source.checkedAt}`);
  })().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

async function attachTarget(targetInfo) {
  const client = new CdpClient(targetInfo.webSocketDebuggerUrl);
  await client.connect();
  clients.set(targetInfo.id, client);
  client.on("__close__", () => clients.delete(targetInfo.id));
  client.on("Runtime.bindingCalled", ({ name }) => {
    if (name === "codexEfficiencyRefresh") refresh().catch((error) => log(error.message));
  });
  await client.send("Runtime.enable");
  await client.send("Page.enable");
  await client.send("Runtime.addBinding", { name: "codexEfficiencyRefresh" });
  const source = buildInjectionSource(snapshot);
  await client.send("Page.addScriptToEvaluateOnNewDocument", { source });
  await client.send("Runtime.evaluate", { expression: source, awaitPromise: false });
  log(`已连接界面：${targetInfo.title || targetInfo.url}`);
}

async function discoverTargets() {
  const targets = await getJson(`${endpoint}/json/list`);
  consecutiveDiscoveryFailures = 0;
  for (const targetInfo of targets) {
    const isPage = targetInfo.type === "page" && targetInfo.webSocketDebuggerUrl;
    const isCodex = /^app:/i.test(targetInfo.url) || /codex|chatgpt/i.test(targetInfo.title ?? "");
    if (isPage && isCodex && !clients.has(targetInfo.id)) {
      attachTarget(targetInfo).catch((error) => log(`界面连接失败：${error.message}`));
    }
  }
}

log("运行时注入器已启动；保持此窗口运行即可持续显示和刷新效率值。");
await discoverTargets();
const timer = setInterval(() => {
  discoverTargets().catch((error) => {
    consecutiveDiscoveryFailures += 1;
    log(`目标扫描失败：${error.message}`);
    if (consecutiveDiscoveryFailures >= 5) shutdown();
  });
}, config.targetPollMs);

function shutdown() {
  clearInterval(timer);
  for (const client of clients.values()) client.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
