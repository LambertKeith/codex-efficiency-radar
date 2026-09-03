import { execFile } from "node:child_process";
import { access, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  assertFullUiVerificationHistory,
  assertResidentHealth,
  fetchResidentHealth
} from "../windows-overlay/src/resident-health.mjs";

const execFileAsync = promisify(execFile);
const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceOverlayRoot = path.join(pluginRoot, "windows-overlay");
const platform = process.platform;

if (!new Set(["darwin", "win32"]).has(platform)) {
  throw new Error(`当前平台 ${platform} 不支持必需的原生模型选择器增强。`);
}

const runtimeRoot = platform === "darwin"
  ? path.join(os.homedir(), "Library", "Application Support", "CodexEfficiencyRadar")
  : path.join(os.homedir(), ".codex", "runtimes", "codex-efficiency-radar");
const runtimeOverlayRoot = path.join(runtimeRoot, "windows-overlay");
const disabledPath = path.join(runtimeOverlayRoot, "state", "overlay-disabled.json");
const installAttemptPath = path.join(runtimeOverlayRoot, "state", "install-attempt.json");
const installVerificationPath = path.join(
  runtimeOverlayRoot,
  "state",
  "install-verification-complete.json"
);
const sourcePackage = JSON.parse(
  await readFile(path.join(sourceOverlayRoot, "package.json"), "utf8")
);
const sourceConfig = JSON.parse(
  await readFile(path.join(sourceOverlayRoot, "config.json"), "utf8")
);
const runtimePackage = JSON.parse(
  await readFile(path.join(runtimeOverlayRoot, "package.json"), "utf8")
);
const installAttempt = JSON.parse(
  (await readFile(installAttemptPath, "utf8")).replace(/^\uFEFF/, "")
);

if (runtimePackage.version !== sourcePackage.version) {
  throw new Error(
    `选择器运行时版本不一致：插件 ${sourcePackage.version}，运行时 ${runtimePackage.version}`
  );
}
if (await access(disabledPath).then(() => true, () => false)) {
  throw new Error(`选择器增强处于安全熔断状态：${disabledPath}`);
}

if (platform === "darwin") {
  const label = "com.lambertkeith.codex-efficiency-radar";
  const expectedResident = path.join(runtimeOverlayRoot, "src", "resident.mjs");
  const { stdout } = await execFileAsync(
    "/bin/launchctl",
    ["print", `gui/${process.getuid()}/${label}`],
    { maxBuffer: 1024 * 1024 }
  );
  if (!/state = running/.test(stdout) || !stdout.includes(expectedResident)) {
    throw new Error("macOS LaunchAgent 未运行当前版本的 Resident");
  }
} else {
  const script = [
    "$task = Get-ScheduledTask -TaskName 'CodexEfficiencyResident' -ErrorAction SilentlyContinue",
    "if ($null -eq $task -or $task.State -ne 'Running') { exit 1 }"
  ].join("\n");
  await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", script],
    { windowsHide: true, maxBuffer: 1024 * 1024 }
  );
}

let health;
let lastError;
const attempts = Math.ceil(sourceConfig.installerTimeoutMs / 250);
for (let attempt = 0; attempt < attempts; attempt += 1) {
  try {
    const candidate = assertResidentHealth(await fetchResidentHealth(), {
      version: sourcePackage.version,
      platform,
      attemptId: installAttempt.attemptId,
      maxAgeMs: sourceConfig.uiHealthMaxAgeMs
    });
    assertFullUiVerificationHistory(candidate.evidence, 2);
    health = candidate;
    break;
  } catch (error) {
    if (await access(disabledPath).then(() => true, () => false)) {
      const disabled = JSON.parse(
        (await readFile(disabledPath, "utf8")).replace(/^\uFEFF/, "")
      );
      throw new Error(
        `选择器增强触发安全熔断：${disabled.reason || "未知原因"}`
      );
    }
    lastError = error;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}
if (!health) throw lastError ?? new Error("Resident 健康检查失败");

await writeFile(
  installVerificationPath,
  `${JSON.stringify({
    status: "complete",
    attemptId: installAttempt.attemptId,
    version: sourcePackage.version,
    platform,
    target: health.target,
    completedAt: new Date().toISOString(),
    evidence: health.evidence
  }, null, 2)}\n`,
  "utf8"
);

console.log(
  `选择器增强端到端完成：status=${health.status} version=${health.version} ` +
  `target=${health.target} options=${health.evidence.optionCount} ` +
  `scores=${health.evidence.numericScoreCount}`
);
