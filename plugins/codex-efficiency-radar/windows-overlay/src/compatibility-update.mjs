import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export const DEFAULT_COMPATIBILITY_MANIFEST_URL =
  "https://raw.githubusercontent.com/LambertKeith/codex-efficiency-radar/main/plugins/codex-efficiency-radar/windows-overlay/compatibility.json";
export const DEFAULT_COMPATIBILITY_REFRESH_INTERVAL_MS = 15 * 60 * 1000;
export const DEFAULT_COMPATIBILITY_TIMEOUT_MS = 10 * 1000;
export const COMPATIBILITY_SCHEMA_VERSION = 2;

const MANIFEST_PATH =
  "/LambertKeith/codex-efficiency-radar/main/plugins/codex-efficiency-radar/windows-overlay/compatibility.json";
const SUPPORTED_SELECTOR_CONTRACTS = new Set([
  "data-codex-intelligence-trigger-v1",
  "data-model-picker-view-v2"
]);
const OFFICIAL_MAC_BUNDLE_ID = "com.openai.codex";
const OFFICIAL_MAC_TEAM_ID = "2DC432GLL2";
const OFFICIAL_WINDOWS_AUMID = "OpenAI.Codex_2p2nqsd0c76g0!App";
const MAX_TARGETS = 256;
const MAX_FIELD_LENGTH = 160;
const MAX_MANIFEST_BYTES = 512 * 1024;

function nonEmptyString(value, field) {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_FIELD_LENGTH) {
    throw new Error(`兼容清单字段 ${field} 无效。`);
  }
  return value;
}

function normalizeTarget(rawTarget, index) {
  if (!rawTarget || typeof rawTarget !== "object" || Array.isArray(rawTarget)) {
    throw new Error(`兼容清单第 ${index + 1} 项不是对象。`);
  }

  const platform = rawTarget.platform ?? "win32";
  if (platform !== "win32" && platform !== "darwin") {
    throw new Error(`兼容清单第 ${index + 1} 项的平台不受支持。`);
  }

  const target = {
    platform,
    packageVersion: nonEmptyString(rawTarget.packageVersion, "packageVersion"),
    appVersion: nonEmptyString(rawTarget.appVersion, "appVersion"),
    executableVersion: nonEmptyString(rawTarget.executableVersion, "executableVersion"),
    asarSha256: nonEmptyString(rawTarget.asarSha256, "asarSha256").toUpperCase(),
    selectorContract: nonEmptyString(rawTarget.selectorContract, "selectorContract")
  };
  if (!/^[0-9A-F]{64}$/.test(target.asarSha256)) {
    throw new Error(`兼容清单第 ${index + 1} 项的 app.asar 哈希无效。`);
  }
  if (!SUPPORTED_SELECTOR_CONTRACTS.has(target.selectorContract)) {
    throw new Error(`兼容清单第 ${index + 1} 项的选择器契约未审核。`);
  }

  if (rawTarget.arch != null) {
    target.arch = nonEmptyString(rawTarget.arch, "arch");
  }

  if (platform === "win32") {
    target.appUserModelId = nonEmptyString(rawTarget.appUserModelId, "appUserModelId");
    if (target.appUserModelId !== OFFICIAL_WINDOWS_AUMID) {
      throw new Error(`兼容清单第 ${index + 1} 项不是官方 Windows Codex 身份。`);
    }
  } else {
    target.arch = target.arch ?? "arm64";
    if (target.arch !== "arm64" && target.arch !== "x64") {
      throw new Error(`兼容清单第 ${index + 1} 项的 macOS 架构无效。`);
    }
    target.bundleIdentifier = nonEmptyString(rawTarget.bundleIdentifier, "bundleIdentifier");
    target.teamIdentifier = nonEmptyString(rawTarget.teamIdentifier, "teamIdentifier");
    if (
      target.bundleIdentifier !== OFFICIAL_MAC_BUNDLE_ID ||
      target.teamIdentifier !== OFFICIAL_MAC_TEAM_ID
    ) {
      throw new Error(`兼容清单第 ${index + 1} 项不是官方 macOS Codex 签名。`);
    }
  }

  return target;
}

export function validateCompatibilityDocument(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("兼容清单不是 JSON 对象。");
  }
  if (value.schemaVersion !== COMPATIBILITY_SCHEMA_VERSION) {
    throw new Error(`兼容清单 schema 版本不受支持：${value.schemaVersion}`);
  }
  if (!Array.isArray(value.targets) || value.targets.length > MAX_TARGETS) {
    throw new Error("兼容清单 targets 字段无效或过大。");
  }
  const targets = value.targets.map(normalizeTarget);
  return { schemaVersion: COMPATIBILITY_SCHEMA_VERSION, targets };
}

export function compatibilityTargetKey(target) {
  const normalized = normalizeTarget(target, 0);
  return [
    normalized.platform,
    normalized.arch ?? "",
    normalized.packageVersion,
    normalized.appVersion,
    normalized.executableVersion,
    normalized.appUserModelId ?? "",
    normalized.bundleIdentifier ?? "",
    normalized.teamIdentifier ?? "",
    normalized.asarSha256
  ].join("|");
}

export function mergeCompatibilityDocuments(base, overlay) {
  const baseDocument = validateCompatibilityDocument(base);
  const overlayDocument = validateCompatibilityDocument(overlay);
  const targets = new Map();
  for (const target of baseDocument.targets) targets.set(compatibilityTargetKey(target), target);
  for (const target of overlayDocument.targets) targets.set(compatibilityTargetKey(target), target);
  return validateCompatibilityDocument({
    schemaVersion: COMPATIBILITY_SCHEMA_VERSION,
    targets: [...targets.values()]
  });
}

export function compatibilityDocumentFingerprint(document) {
  return JSON.stringify(validateCompatibilityDocument(document));
}

export function isTrustedCompatibilityManifestUrl(value) {
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === "https:" &&
      parsed.hostname.toLowerCase() === "raw.githubusercontent.com" &&
      parsed.pathname === MANIFEST_PATH &&
      parsed.search === "" &&
      parsed.hash === ""
    );
  } catch {
    return false;
  }
}

export function compatibilityCachePath(projectRoot) {
  return path.join(projectRoot, "state", "compatibility-cache.json");
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

export async function loadCompatibilityDocument(projectRoot, { includeCache = true } = {}) {
  const base = validateCompatibilityDocument(
    await readJson(path.join(projectRoot, "compatibility.json"))
  );
  if (!includeCache) return base;

  try {
    const cached = validateCompatibilityDocument(await readJson(compatibilityCachePath(projectRoot)));
    return mergeCompatibilityDocuments(base, cached);
  } catch {
    return base;
  }
}

export async function writeCompatibilityCache(projectRoot, document) {
  const normalized = validateCompatibilityDocument(document);
  const cachePath = compatibilityCachePath(projectRoot);
  const stateDir = path.dirname(cachePath);
  await mkdir(stateDir, { recursive: true });
  const temporaryPath = `${cachePath}.${process.pid}.${Date.now()}.tmp`;
  const contents = `${JSON.stringify(normalized, null, 2)}\n`;
  await writeFile(temporaryPath, contents, { encoding: "utf8", mode: 0o600 });
  try {
    await rename(temporaryPath, cachePath);
  } catch (error) {
    if (process.platform === "win32") {
      await rm(cachePath, { force: true });
      await rename(temporaryPath, cachePath);
    } else {
      throw error;
    }
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => {});
  }
  return normalized;
}

export async function fetchCompatibilityDocument(
  url = DEFAULT_COMPATIBILITY_MANIFEST_URL,
  { fetchImpl = globalThis.fetch, timeoutMs = DEFAULT_COMPATIBILITY_TIMEOUT_MS } = {}
) {
  if (!isTrustedCompatibilityManifestUrl(url)) {
    throw new Error("兼容清单地址不是固定的官方 GitHub 地址。");
  }
  if (typeof fetchImpl !== "function") throw new Error("当前 Node.js 没有可用的 fetch。");
  const requestTimeoutMs = Number.isFinite(Number(timeoutMs))
    ? Math.max(1000, Number(timeoutMs))
    : DEFAULT_COMPATIBILITY_TIMEOUT_MS;
  const response = await fetchImpl(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(requestTimeoutMs)
  });
  if (!response?.ok) throw new Error(`兼容清单请求失败：HTTP ${response?.status ?? "?"}`);
  if (response.url && !isTrustedCompatibilityManifestUrl(response.url)) {
    throw new Error("兼容清单请求发生了不受信任的重定向。");
  }
  const contentLength = Number(response.headers?.get?.("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_MANIFEST_BYTES) {
    throw new Error("兼容清单响应过大。");
  }
  const text = typeof response.text === "function" ? await response.text() : "";
  if (Buffer.byteLength(text, "utf8") > MAX_MANIFEST_BYTES) {
    throw new Error("兼容清单内容过大。");
  }
  return validateCompatibilityDocument(JSON.parse(text));
}

export function createCompatibilityRefresher({
  projectRoot,
  settings = {},
  fetchImpl = globalThis.fetch,
  now = () => Date.now()
}) {
  let lastAttemptAt = Number.NEGATIVE_INFINITY;
  let inFlight = null;

  return async function refresh({ force = false } = {}) {
    const current = await loadCompatibilityDocument(projectRoot);
    if (settings.enabled === false) return { status: "disabled", document: current };
    if (inFlight) return inFlight;

    const intervalMs = Number.isFinite(Number(settings.intervalMs))
      ? Math.max(1000, Number(settings.intervalMs))
      : DEFAULT_COMPATIBILITY_REFRESH_INTERVAL_MS;
    if (!force && now() - lastAttemptAt < intervalMs) {
      return { status: "cooldown", document: current };
    }
    lastAttemptAt = now();
    inFlight = (async () => {
      try {
        const remote = await fetchCompatibilityDocument(
          settings.manifestUrl || DEFAULT_COMPATIBILITY_MANIFEST_URL,
          { fetchImpl, timeoutMs: settings.timeoutMs }
        );
        const base = await loadCompatibilityDocument(projectRoot, { includeCache: false });
        const merged = mergeCompatibilityDocuments(base, remote);
        const previous = compatibilityDocumentFingerprint(current);
        const next = compatibilityDocumentFingerprint(merged);
        if (previous !== next || !(await readFile(compatibilityCachePath(projectRoot)).then(() => true, () => false))) {
          await writeCompatibilityCache(projectRoot, remote);
        }
        return { status: previous === next ? "unchanged" : "updated", document: merged };
      } catch (error) {
        return { status: "failed", document: current, error };
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  };
}
