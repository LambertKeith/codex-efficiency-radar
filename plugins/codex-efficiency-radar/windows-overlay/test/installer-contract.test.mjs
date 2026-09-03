import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const installerPath = new URL("../../scripts/install-selector-overlay.ps1", import.meta.url);
const macInstallerPath = new URL("../../scripts/install-selector-overlay.mjs", import.meta.url);
const topNodeInstallerPath = new URL("../../../../scripts/install.mjs", import.meta.url);
const topPowerShellInstallerPath = new URL("../../../../scripts/install.ps1", import.meta.url);
const readmePath = new URL("../../../../README.md", import.meta.url);
const residentPath = new URL("../src/resident.mjs", import.meta.url);
const launcherPath = new URL("../src/launcher.mjs", import.meta.url);
const overlayVerifierPath = new URL("../../scripts/verify-selector-overlay.mjs", import.meta.url);

test("Windows installer uses an externally visible runtime and a current-user task", async () => {
  const installer = await readFile(installerPath, "utf8");

  assert.match(installer, /\.codex\\runtimes\\codex-efficiency-radar/);
  assert.match(installer, /\$runnerCommand\s*=.*-NodePath/);
  assert.match(installer, /New-ScheduledTaskTrigger\s+-AtLogOn\s+-User\s+\$userId/);
  assert.match(installer, /New-ScheduledTaskPrincipal.*-LogonType\s+Interactive/);
  assert.match(installer, /Register-ScheduledTask\s+-TaskName\s+\$taskName/);
  assert.match(installer, /Start-ScheduledTask\s+-TaskName\s+\$taskName/);
  assert.match(installer, /Copy-Item.*sourceFile/);
  assert.doesNotMatch(installer, /Invoke-CimMethod\s+-ClassName\s+Win32_Process/);
  assert.doesNotMatch(installer, /Start-Process\s+-FilePath\s+\$powerShellPath/);
});

test("macOS installer checks the platform before reading the Unix user id", async () => {
  const installer = await readFile(macInstallerPath, "utf8");

  assert.match(
    installer,
    /process\.platform === "darwin" \? `gui\/\$\{process\.getuid\(\)\}` : null/
  );
  assert.match(installer, /readdir\(path\.join\(sourceOverlayRoot, "src"\)/);
});

test("完整安装器不能跳过或吞掉必需的选择器增强", async () => {
  const [nodeInstaller, powershellInstaller, readme] = await Promise.all([
    readFile(topNodeInstallerPath, "utf8"),
    readFile(topPowerShellInstallerPath, "utf8"),
    readFile(readmePath, "utf8")
  ]);

  assert.doesNotMatch(nodeInstaller, /pluginOnly|plugin-only/);
  assert.doesNotMatch(powershellInstaller, /PluginOnly|plugin-only/);
  assert.doesNotMatch(nodeInstaller, /error\.code\s*===\s*2/);
  assert.doesNotMatch(powershellInstaller, /LASTEXITCODE\s*-eq\s*2/);
  assert.doesNotMatch(readme, /plugin-only|PluginOnly/);
  assert.match(nodeInstaller, /当前平台 .*未修改插件状态/);
  assert.match(nodeInstaller, /isManagedMarketplaceCopy/);
  assert.match(nodeInstaller, /marketplace", "remove"/);
  assert.match(powershellInstaller, /cachedMarketplace/);
  assert.match(powershellInstaller, /'plugin', 'marketplace', 'remove'/);
  assert.ok(
    nodeInstaller.indexOf('overlayLauncher, "--diagnose"') <
      nodeInstaller.indexOf('"plugin", "add"')
  );
  assert.ok(
    powershellInstaller.indexOf("$overlayLauncher, '--diagnose'") <
      powershellInstaller.indexOf("'plugin', 'add'")
  );
  assert.ok(
    nodeInstaller.indexOf('["plugin", "list", "--json"]') <
      nodeInstaller.indexOf('"install-selector-overlay.mjs"'),
    "Node 安装器必须先验证正规插件版本，再安装 Overlay"
  );
  assert.ok(
    powershellInstaller.indexOf("$codex plugin list --json") <
      powershellInstaller.indexOf("install-selector-overlay.ps1"),
    "PowerShell 安装器必须先验证正规插件版本，再安装 Overlay"
  );
});

test("平台安装器必须执行 Resident 健康验证", async () => {
  const [windowsInstaller, macInstaller] = await Promise.all([
    readFile(installerPath, "utf8"),
    readFile(macInstallerPath, "utf8")
  ]);

  assert.match(windowsInstaller, /verify-selector-overlay\.mjs/);
  assert.match(macInstaller, /verify-selector-overlay\.mjs/);
  assert.match(windowsInstaller, /UTF8Encoding\(\$false\)/);
  assert.doesNotMatch(
    windowsInstaller,
    /installAttemptPath[^\n]*Set-Content[^\n]*Encoding UTF8/
  );
});

test("Windows 安装失败必须保留诊断并回滚本次运行时", async () => {
  const installer = await readFile(installerPath, "utf8");
  const transactionStart = installer.indexOf("$runtimeBackupRoot =");
  const tryStart = installer.indexOf("try {", transactionStart);
  const copyIndex = installer.indexOf("Copy-Item -LiteralPath", tryStart);
  const registrationIndex = installer.indexOf(
    "Register-ScheduledTask -TaskName $taskName",
    tryStart
  );
  const residentStartIndex = installer.indexOf(
    "Start-ScheduledTask -TaskName $taskName",
    tryStart
  );
  const healthCheckIndex = installer.indexOf(
    "verify-selector-overlay.mjs",
    tryStart
  );
  const catchStart = installer.indexOf("} catch {", healthCheckIndex);
  const rollback = installer.slice(catchStart);

  assert.notEqual(transactionStart, -1);
  assert.notEqual(tryStart, -1);
  assert.ok(copyIndex > tryStart && copyIndex < catchStart);
  assert.ok(registrationIndex > copyIndex && registrationIndex < catchStart);
  assert.ok(residentStartIndex > registrationIndex && residentStartIndex < catchStart);
  assert.ok(healthCheckIndex > residentStartIndex && healthCheckIndex < catchStart);
  assert.match(installer, /\.codex\\diagnostics\\codex-efficiency-radar/);
  assert.match(
    installer,
    /Preserve-InstallDiagnostics[\s\S]*Copy-Item -LiteralPath \$stateDir[\s\S]*-Recurse -Force/
  );
  assert.ok(
    installer.indexOf("$existingTask = Get-ScheduledTask", tryStart) > tryStart &&
      installer.indexOf("$existingTask = Get-ScheduledTask", tryStart) < catchStart,
    "旧任务和运行时的首次修改也必须位于失败事务中"
  );
  assert.match(rollback, /Preserve-InstallDiagnostics -Failure \$originalError/);
  assert.match(rollback, /Stop-ScheduledTask -TaskName \$taskName/);
  assert.match(rollback, /Unregister-ScheduledTask -TaskName \$taskName/);
  assert.match(rollback, /& \$nodePath \$sourceLauncherPath --restore-standard/);
  assert.match(rollback, /Remove-IncompleteRuntime -CandidateRoot \$runtimeRoot/);
  assert.match(
    rollback,
    /Move-Item -LiteralPath \$runtimeBackupRoot -Destination \$runtimeRoot/
  );
  assert.match(rollback, /throw \$originalError/);
  assert.doesNotMatch(rollback, /Remove-Item -LiteralPath \$userProfileDir/);
});

test("Windows 激活预检完成前不能发布 armed 健康状态", async () => {
  const residentSource = await readFile(residentPath, "utf8");
  const preflightIndex = residentSource.indexOf(
    "await preflightWindowsPackagedAppActivation"
  );
  const armedIndex = residentSource.indexOf('status: "armed"', preflightIndex);

  assert.notEqual(preflightIndex, -1);
  assert.notEqual(armedIndex, -1);
  assert.ok(
    armedIndex > preflightIndex,
    "Resident 只能在 Windows 打包应用激活预检完成后发布 armed"
  );
});

test("多界面候选让出验证权时必须释放连接以便后续重试", async () => {
  const launcherSource = await readFile(launcherPath, "utf8");
  assert.match(
    launcherSource,
    /verificationTargetId && verificationTargetId !== targetInfo\.id[\s\S]*clients\.delete\(targetInfo\.id\);[\s\S]*client\.close\(\);[\s\S]*return;/
  );
  assert.ok(
    launcherSource.indexOf('Boolean(document.querySelector') <
      launcherSource.indexOf("verificationTargetId = targetInfo.id"),
    "候选必须先探测原生选择器，再取得唯一验证权"
  );
  assert.match(launcherSource, /targetRetryAfter\.set/);
});

test("安装做两次完整 UI 验证，常驻阶段只做不扰动界面的被动心跳", async () => {
  const [launcherSource, verifierSource] = await Promise.all([
    readFile(launcherPath, "utf8"),
    readFile(overlayVerifierPath, "utf8")
  ]);
  const publisherStart = launcherSource.indexOf("async function publishUiMarker");
  const evidenceSpread = launcherSource.indexOf("...evidence", publisherStart);
  const heartbeatAt = launcherSource.indexOf("heartbeatAt", evidenceSpread);

  assert.notEqual(publisherStart, -1);
  assert.notEqual(evidenceSpread, -1);
  assert.notEqual(heartbeatAt, -1);
  assert.match(launcherSource, /fullUiVerificationHistory\?\.length >= 2/);
  assert.match(launcherSource, /heartbeatAndPublishTarget\(client, targetInfo, marker\)/);
  assert.match(launcherSource, /buildUiHeartbeatSource/);
  assert.match(
    launcherSource,
    /const verificationTimer = setInterval[\s\S]*fullUiVerificationHistory[\s\S]*heartbeatAndPublishTarget[\s\S]*verifyAndPublishTarget[\s\S]*invalidateUiMarker/
  );
  assert.match(
    launcherSource,
    /async function verifyAndPublishTarget[\s\S]*ensureModelSelectorOpen[\s\S]*buildUiVerificationSource[\s\S]*assertUiVerificationEvidence/
  );
  assert.match(verifierSource, /assertFullUiVerificationHistory\(candidate\.evidence, 2\)/);
  assert.match(verifierSource, /install-verification-complete\.json/);

  const residentSource = await readFile(residentPath, "utf8");
  const markerRead = residentSource.indexOf("JSON.parse(await readFile(uiReadyPath");
  const downgrade = residentSource.indexOf('status: "activating"', markerRead);
  const clearedEvidence = residentSource.indexOf("evidence: null", downgrade);
  assert.notEqual(markerRead, -1);
  assert.notEqual(downgrade, -1);
  assert.notEqual(clearedEvidence, -1);
  assert.ok(
    clearedEvidence > downgrade,
    "真实 DOM 证据消失后 Resident 必须清除健康证据并降级"
  );
});
