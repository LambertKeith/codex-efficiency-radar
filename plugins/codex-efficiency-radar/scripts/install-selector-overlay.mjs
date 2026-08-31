import { execFile } from "node:child_process";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  findCodexMainProcess,
  locateCodexPackage
} from "../windows-overlay/src/package-locator.mjs";

const execFileAsync = promisify(execFile);
const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceOverlayRoot = path.join(pluginRoot, "windows-overlay");
const runtimeRoot = path.join(
  os.homedir(),
  "Library",
  "Application Support",
  "CodexEfficiencyRadar"
);
const overlayRoot = path.join(runtimeRoot, "windows-overlay");
const stateDir = path.join(overlayRoot, "state");
const launchAgentLabel = "com.lambertkeith.codex-efficiency-radar";
const launchAgentsDir = path.join(os.homedir(), "Library", "LaunchAgents");
const launchAgentPath = path.join(launchAgentsDir, `${launchAgentLabel}.plist`);
const launchDomain = `gui/${process.getuid()}`;

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

async function bootoutExistingAgent() {
  await execFileAsync(
    "/bin/launchctl",
    ["bootout", `${launchDomain}/${launchAgentLabel}`]
  ).catch(() => {});
}

if (process.platform !== "darwin") {
  throw new Error("此安装器仅用于 macOS；Windows 请使用 install-selector-overlay.ps1。");
}

const config = JSON.parse(
  await readFile(path.join(sourceOverlayRoot, "config.json"), "utf8")
);
const installation = await locateCodexPackage(config.packageName, {
  appPaths: config.macAppPaths
});

console.log("[1/4] 校验 macOS Codex 构建与选择器兼容白名单…");
try {
  await execFileAsync(process.execPath, [
    path.join(sourceOverlayRoot, "src", "launcher.mjs"),
    "--diagnose"
  ]);
} catch (error) {
  if (error.code === 2) {
    if (error.stderr?.trim()) console.error(error.stderr.trim());
    process.exit(2);
  }
  throw error;
}

console.log("[2/4] 安装选择器运行时…");
await bootoutExistingAgent();
try {
  await rm(runtimeRoot, { recursive: true, force: true });
  await mkdir(path.join(overlayRoot, "src"), { recursive: true });
  await mkdir(path.join(runtimeRoot, "src"), { recursive: true });
  await mkdir(stateDir, { recursive: true });

  for (const fileName of ["compatibility.json", "config.json", "package.json"]) {
    await cp(path.join(sourceOverlayRoot, fileName), path.join(overlayRoot, fileName));
  }
  for (const entry of await readdir(path.join(sourceOverlayRoot, "src"), {
    withFileTypes: true
  })) {
    if (entry.isFile()) {
      await cp(
        path.join(sourceOverlayRoot, "src", entry.name),
        path.join(overlayRoot, "src", entry.name)
      );
    }
  }
  await cp(
    path.join(pluginRoot, "src", "radar-client.mjs"),
    path.join(runtimeRoot, "src", "radar-client.mjs")
  );

  const running = await findCodexMainProcess(installation.executablePath);
  if (running) {
    await writeFile(path.join(stateDir, "ignore-once.pid"), String(running.processId), "ascii");
  }

  console.log("[3/4] 创建当前用户 LaunchAgent…");
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${escapeXml(launchAgentLabel)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${escapeXml(process.execPath)}</string>
    <string>${escapeXml(path.join(overlayRoot, "src", "resident.mjs"))}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${escapeXml(overlayRoot)}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <key>ThrottleInterval</key>
  <integer>10</integer>
  <key>StandardOutPath</key>
  <string>${escapeXml(path.join(stateDir, "launchd.log"))}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(path.join(stateDir, "launchd.log"))}</string>
</dict>
</plist>
`;
  await mkdir(launchAgentsDir, { recursive: true });
  await writeFile(launchAgentPath, plist, "utf8");
  await execFileAsync("/usr/bin/plutil", ["-lint", launchAgentPath]);
  await execFileAsync("/bin/launchctl", ["bootstrap", launchDomain, launchAgentPath]);

  console.log("[4/4] 验证常驻服务…");
  await execFileAsync(
    "/bin/launchctl",
    ["print", `${launchDomain}/${launchAgentLabel}`],
    { maxBuffer: 1024 * 1024 }
  );
  console.log("macOS 选择器增强已安装。当前 Codex 不会被中断；下次完整退出并重开后生效。");
} catch (error) {
  await bootoutExistingAgent();
  await rm(launchAgentPath, { force: true });
  await rm(runtimeRoot, { recursive: true, force: true });
  throw error;
}
