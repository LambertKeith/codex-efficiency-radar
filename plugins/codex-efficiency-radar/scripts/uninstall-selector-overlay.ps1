[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$taskName = 'CodexEfficiencyResident'
$runtimeRoot = Join-Path $env:LOCALAPPDATA 'CodexEfficiencyRadar'
$overlayRoot = Join-Path $runtimeRoot 'windows-overlay'
$ignorePath = Join-Path $overlayRoot 'state\ignore-once.pid'
$startupDir = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup'
$startupPath = Join-Path $startupDir 'CodexEfficiencyRadar.vbs'
$legacyStartup = Join-Path $startupDir 'CodexEfficiencyResident.vbs'

$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($null -ne $task) {
  Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}

$overlayPattern = [regex]::Escape($overlayRoot) + '.*\\src\\(resident|launcher)\.mjs'
$legacyPattern = 'codex-efficiency-selector-patch\\src\\(resident|launcher)\.mjs'
$managedProcesses = Get-CimInstance Win32_Process | Where-Object {
  $_.Name -eq 'node.exe' -and
  ($_.CommandLine -match $overlayPattern -or $_.CommandLine -match $legacyPattern)
}
foreach ($process in $managedProcesses) {
  Stop-Process -Id $process.ProcessId -ErrorAction SilentlyContinue
}

foreach ($file in @($ignorePath, $startupPath, $legacyStartup)) {
  if (Test-Path -LiteralPath $file) {
    Remove-Item -LiteralPath $file -Force
  }
}

$resolvedLocalAppData = [System.IO.Path]::GetFullPath($env:LOCALAPPDATA).TrimEnd('\')
$resolvedRuntimeRoot = [System.IO.Path]::GetFullPath($runtimeRoot).TrimEnd('\')
$expectedPrefix = $resolvedLocalAppData + '\'
if (
  $resolvedRuntimeRoot.StartsWith($expectedPrefix, [System.StringComparison]::OrdinalIgnoreCase) -and
  [System.IO.Path]::GetFileName($resolvedRuntimeRoot) -eq 'CodexEfficiencyRadar' -and
  (Test-Path -LiteralPath $resolvedRuntimeRoot)
) {
  Remove-Item -LiteralPath $resolvedRuntimeRoot -Recurse -Force
}

Write-Host 'Windows selector overlay removed. Restart Codex to return to the standard selector.'
