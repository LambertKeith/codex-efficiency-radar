import { execFile } from "node:child_process";
import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { isManagedNodeCommand } from "../windows-overlay/src/package-locator.mjs";

const execFileAsync = promisify(execFile);
const applicationSupport = path.join(os.homedir(), "Library", "Application Support");
const runtimeRoot = path.join(applicationSupport, "CodexEfficiencyRadar");
const launchAgentLabel = "com.lambertkeith.codex-efficiency-radar";
const launchAgentPath = path.join(
  os.homedir(),
  "Library",
  "LaunchAgents",
  `${launchAgentLabel}.plist`
);
const launchDomain = `gui/${process.getuid()}`;
const managedScriptPaths = [
  path.join(runtimeRoot, "windows-overlay", "src", "resident.mjs"),
  path.join(runtimeRoot, "windows-overlay", "src", "launcher.mjs")
];

if (process.platform !== "darwin") {
  throw new Error("此卸载器仅用于 macOS；Windows 请使用 uninstall-selector-overlay.ps1。");
}

await execFileAsync(
  "/bin/launchctl",
  ["bootout", `${launchDomain}/${launchAgentLabel}`]
).catch(() => {});

const { stdout } = await execFileAsync("/bin/ps", ["-axww", "-o", "pid=,command="], {
  maxBuffer: 4 * 1024 * 1024
});
for (const line of stdout.split(/\r?\n/)) {
  const match = /^\s*(\d+)\s+(.+)$/.exec(line);
  if (!match) continue;
  const processId = Number(match[1]);
  const commandLine = match[2];
  const managedScript = isManagedNodeCommand(commandLine, managedScriptPaths);
  if (managedScript && processId !== process.pid) {
    try {
      process.kill(processId, "SIGTERM");
    } catch (error) {
      if (error?.code !== "ESRCH") throw error;
    }
  }
}

await rm(launchAgentPath, { force: true });
const resolvedRuntimeRoot = path.resolve(runtimeRoot);
if (
  path.dirname(resolvedRuntimeRoot) !== path.resolve(applicationSupport) ||
  path.basename(resolvedRuntimeRoot) !== "CodexEfficiencyRadar"
) {
  throw new Error(`拒绝移除非预期运行时目录：${resolvedRuntimeRoot}`);
}
await rm(resolvedRuntimeRoot, { recursive: true, force: true });
console.log("macOS 选择器增强已移除。重启 Codex 后恢复标准选择器。");
