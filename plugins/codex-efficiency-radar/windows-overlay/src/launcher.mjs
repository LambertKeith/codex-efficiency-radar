import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { CdpClient } from "./cdp-client.mjs";
import { loadCompatibilityDocument } from "./compatibility-update.mjs";
import { buildInjectionSource } from "./injection-script.mjs";
import {
  activateWindowsPackagedApp,
  findCodexMainProcess,
  isCodexMainProcessRunning,
  locateCodexPackage,
  matchCompatibility,
  preflightWindowsPackagedAppActivation,
  restoreWindowsPackagedApp,
  terminateCodexMainProcess
} from "./package-locator.mjs";
import { createRadarProvider } from "./radar-provider.mjs";
import { assertFullUiVerificationHistory } from "./resident-health.mjs";
import { INJECTOR_DEFERRED_EXIT_CODE } from "./runtime-policy.mjs";
import {
  closeModelSelectorIfOpened,
  ensureModelSelectorOpen
} from "./selector-opener.mjs";
import {
  assertUiHeartbeatEvidence,
  assertUiVerificationEvidence,
  buildUiHeartbeatSource,
  buildUiVerificationSource
} from "./ui-verification.mjs";

function failFast(reason) {
  const message = reason instanceof Error ? reason.message : String(reason);
  console.error(`[效率选择器] ${message}`);
  process.exit(1);
}

process.on("uncaughtException", failFast);
process.on("unhandledRejection", failFast);

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stateDir = path.join(projectRoot, "state");
const uiReadyPath = path.join(stateDir, "ui-ready.json");
const installVerificationPath = path.join(stateDir, "install-verification-complete.json");
const installAttemptId = process.env.CODEX_EFFICIENCY_INSTALL_ATTEMPT || "runtime";
const config = JSON.parse(await readFile(path.join(projectRoot, "config.json"), "utf8"));
const compatibility = await loadCompatibilityDocument(projectRoot);
const runtimePackage = JSON.parse(await readFile(path.join(projectRoot, "package.json"), "utf8"));
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

async function waitForMainExit(executablePath, processId) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const running = await findCodexMainProcess(executablePath).catch(() => null);
    if (!running || running.processId !== processId) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`调试模式 Codex 进程 ${processId} 未按预期退出`);
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

if (flags.has("--restore-standard")) {
  let running = await findCodexMainProcess(installation.executablePath).catch(() => null);
  if (running?.commandLine.includes(`--remote-debugging-port=${config.devtoolsPort}`)) {
    await terminateCodexMainProcess(running.processId);
    await waitForMainExit(installation.executablePath, running.processId);
    running = null;
  }
  if (!running) {
    if (installation.platform === "win32") {
      await restoreWindowsPackagedApp(installation.appUserModelId);
    } else {
      const child = spawn("/usr/bin/open", ["-na", installation.appBundlePath], {
        detached: true,
        stdio: "ignore"
      });
      await new Promise((resolve, reject) => {
        child.once("spawn", resolve);
        child.once("error", reject);
      });
      child.unref();
    }
  }
  log("已恢复标准 Codex 启动模式。");
  process.exit(0);
}

if (flags.has("--diagnose")) {
  log(`选择器契约：${target.selectorContract}`);
  log(`Radar 数据层：${radarClientPath}`);
  process.exit(0);
}

await rm(uiReadyPath, { force: true });

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
let verifiedTargetId = null;
let verificationTargetId = null;
const targetRetryAfter = new Map();

async function broadcast(nextSnapshot) {
  const source = buildInjectionSource(nextSnapshot, target.selectorContract);
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

async function invalidateUiMarker(targetId) {
  if (verifiedTargetId !== targetId) return;
  await rm(uiReadyPath, { force: true }).catch(() => {});
  verifiedTargetId = null;
}

async function publishUiMarker(targetInfo, evidence, { previous = null, fullUi = false } = {}) {
  if (verifiedTargetId && verifiedTargetId !== targetInfo.id) return null;
  const heartbeatAt = new Date().toISOString();
  const previousHistory = Array.isArray(previous?.fullUiVerificationHistory)
    ? previous.fullUiVerificationHistory
    : [];
  const previousFullTime = Date.parse(previous?.fullUiVerifiedAt ?? "");
  const fullUiVerifiedAt = fullUi
    ? new Date(Math.max(Date.now(), Number.isFinite(previousFullTime) ? previousFullTime + 1 : 0))
      .toISOString()
    : previous?.fullUiVerifiedAt;
  const fullUiVerificationHistory = fullUi
    ? [...previousHistory, { verificationId: randomUUID(), verifiedAt: fullUiVerifiedAt }].slice(-2)
    : previousHistory;
  const marker = {
    ...previous,
    ...evidence,
    status: "ready",
    attemptId: installAttemptId,
    version: runtimePackage.version,
    platform: installation.platform,
    target: `${installation.packageVersion}/${installation.appVersion}/${target.selectorContract}`,
    fullUiVerifiedAt,
    fullUiVerificationHistory,
    heartbeatAt,
    heartbeatMode: fullUi ? "full-ui" : evidence.mode,
    verifiedAt: heartbeatAt,
    targetId: targetInfo.id,
    targetUrl: targetInfo.url
  };
  const safeTargetId = String(targetInfo.id).replaceAll(/[^a-zA-Z0-9_.-]/g, "_");
  const temporaryPath = `${uiReadyPath}.${process.pid}.${safeTargetId}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(marker, null, 2)}\n`, "utf8");
  try {
    await rename(temporaryPath, uiReadyPath);
  } catch (error) {
    if (process.platform !== "win32" || error?.code !== "EEXIST") throw error;
    await rm(uiReadyPath, { force: true });
    await rename(temporaryPath, uiReadyPath);
  }
  verifiedTargetId = targetInfo.id;
  return marker;
}

async function verifyAndPublishTarget(client, targetInfo, previous = null) {
  const selectorSession = await ensureModelSelectorOpen(client, {
    timeoutMs: Math.min(config.uiVerificationTimeoutMs, 10000)
  });
  let verification;
  try {
    verification = await client.send(
      "Runtime.evaluate",
      {
        expression: buildUiVerificationSource(config.uiVerificationTimeoutMs),
        awaitPromise: true,
        returnByValue: true
      },
      config.uiVerificationTimeoutMs + 5000
    );
  } finally {
    await closeModelSelectorIfOpened(client, selectorSession).catch(() => {});
  }
  if (verification.exceptionDetails) {
    throw new Error(verification.exceptionDetails.text || "选择器验证脚本执行失败");
  }
  return publishUiMarker(
    targetInfo,
    assertUiVerificationEvidence(verification.result?.value),
    { previous, fullUi: true }
  );
}

async function heartbeatAndPublishTarget(client, targetInfo, previous) {
  const heartbeat = await client.send(
    "Runtime.evaluate",
    {
      expression: buildUiHeartbeatSource(),
      awaitPromise: false,
      returnByValue: true
    },
    5000
  );
  if (heartbeat.exceptionDetails) {
    throw new Error(heartbeat.exceptionDetails.text || "选择器心跳脚本执行失败");
  }
  const evidence = assertUiHeartbeatEvidence(heartbeat.result?.value);
  return publishUiMarker(targetInfo, evidence, { previous });
}

async function loadCompletedInstallationEvidence() {
  try {
    const record = JSON.parse(await readFile(installVerificationPath, "utf8"));
    const expectedTarget = `${installation.packageVersion}/${installation.appVersion}/${target.selectorContract}`;
    if (
      record?.status !== "complete" ||
      record.attemptId !== installAttemptId ||
      record.version !== runtimePackage.version ||
      record.platform !== installation.platform ||
      record.target !== expectedTarget
    ) return null;
    assertUiVerificationEvidence(record.evidence);
    assertFullUiVerificationHistory(record.evidence, 2);
    return record.evidence;
  } catch {
    return null;
  }
}

async function attachTarget(targetInfo) {
  const client = new CdpClient(targetInfo.webSocketDebuggerUrl);
  await client.connect();
  clients.set(targetInfo.id, client);
  client.on("__close__", () => clients.delete(targetInfo.id));
  try {
    client.on("Runtime.bindingCalled", ({ name }) => {
      if (name === "codexEfficiencyRefresh") refresh().catch((error) => log(error.message));
    });
    await client.send("Runtime.enable");
    await client.send("Page.enable");
    await client.send("Runtime.addBinding", { name: "codexEfficiencyRefresh" });
    const source = buildInjectionSource(snapshot, target.selectorContract);
    await client.send("Page.addScriptToEvaluateOnNewDocument", { source });
    await client.send("Runtime.evaluate", { expression: source, awaitPromise: false });
    log(`已连接界面：${targetInfo.title || "无标题"} · ${targetInfo.url}`);

    const probe = await client.send(
      "Runtime.evaluate",
      {
        expression: 'Boolean(document.querySelector("[data-codex-intelligence-trigger]"))',
        awaitPromise: false,
        returnByValue: true
      },
      5000
    );
    if (probe.result?.value !== true) {
      throw new Error(`界面目标暂未包含原生模型选择器触发器：${targetInfo.url}`);
    }

    if (
      (verifiedTargetId && verifiedTargetId !== targetInfo.id) ||
      (verificationTargetId && verificationTargetId !== targetInfo.id)
    ) {
      clients.delete(targetInfo.id);
      client.close();
      return;
    }
    verificationTargetId = targetInfo.id;
    targetRetryAfter.delete(targetInfo.id);
    const completedEvidence = await loadCompletedInstallationEvidence();
    let marker = completedEvidence
      ? await heartbeatAndPublishTarget(client, targetInfo, completedEvidence)
      : await verifyAndPublishTarget(client, targetInfo);
    if (!marker) throw new Error("当前界面未取得端到端验证主目标资格");
    log(
      `端到端验证通过：效率入口已显示，${marker.optionCount} 个档位、` +
      `${marker.numericScoreCount} 个数值已载入。`
    );
    let verifying = false;
    const verificationTimer = setInterval(() => {
      if (verifying) return;
      verifying = true;
      const verification = marker.fullUiVerificationHistory?.length >= 2
        ? heartbeatAndPublishTarget(client, targetInfo, marker)
        : verifyAndPublishTarget(client, targetInfo, marker);
      verification
        .then((nextMarker) => {
          if (nextMarker) marker = nextMarker;
        })
        .catch(async (error) => {
          await invalidateUiMarker(targetInfo.id);
          log(`界面持续验证失败：${error.message}`);
        })
        .finally(() => {
          verifying = false;
        });
    }, config.uiHealthPollMs);
    client.on("__close__", () => {
      clearInterval(verificationTimer);
      if (verificationTargetId === targetInfo.id) verificationTargetId = null;
      invalidateUiMarker(targetInfo.id).catch(() => {});
    });
  } catch (error) {
    if (verificationTargetId === targetInfo.id) verificationTargetId = null;
    targetRetryAfter.set(targetInfo.id, Date.now() + config.targetRetryDelayMs);
    clients.delete(targetInfo.id);
    client.close();
    throw error;
  }
}

async function discoverTargets() {
  const targets = await getJson(`${endpoint}/json/list`);
  consecutiveDiscoveryFailures = 0;
  const candidates = targets
    .filter((targetInfo) => {
      const isPage = targetInfo.type === "page" && targetInfo.webSocketDebuggerUrl;
      const isCodex = /^app:/i.test(targetInfo.url) || /codex|chatgpt/i.test(targetInfo.title ?? "");
      return isPage && isCodex;
    })
    .sort((left, right) => {
      const priority = (targetInfo) => {
        if (/^app:\/\/-\/index\.html(?:[?#]|$)/i.test(targetInfo.url)) return 0;
        if (/^app:/i.test(targetInfo.url)) return 1;
        return 2;
      };
      return priority(left) - priority(right);
    });
  for (const targetInfo of candidates) {
    if (
      !clients.has(targetInfo.id) &&
      Date.now() >= (targetRetryAfter.get(targetInfo.id) ?? 0)
    ) {
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
