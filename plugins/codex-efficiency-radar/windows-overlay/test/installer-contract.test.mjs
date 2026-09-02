import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const installerPath = new URL("../../scripts/install-selector-overlay.ps1", import.meta.url);

test("Windows installer uses an externally visible runtime and a current-user task", async () => {
  const installer = await readFile(installerPath, "utf8");

  assert.match(installer, /\.codex\\runtimes\\codex-efficiency-radar/);
  assert.match(installer, /\$runnerCommand\s*=.*-NodePath/);
  assert.match(installer, /New-ScheduledTaskTrigger\s+-AtLogOn\s+-User\s+\$userId/);
  assert.match(installer, /New-ScheduledTaskPrincipal.*-LogonType\s+Interactive/);
  assert.match(installer, /Register-ScheduledTask\s+-TaskName\s+\$taskName/);
  assert.match(installer, /Start-ScheduledTask\s+-TaskName\s+\$taskName/);
  assert.doesNotMatch(installer, /Invoke-CimMethod\s+-ClassName\s+Win32_Process/);
  assert.doesNotMatch(installer, /Start-Process\s+-FilePath\s+\$powerShellPath/);
});
