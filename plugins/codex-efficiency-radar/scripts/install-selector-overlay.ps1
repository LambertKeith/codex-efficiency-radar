[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$taskName = 'CodexEfficiencyResident'
$pluginRoot = Split-Path -Parent $PSScriptRoot
$sourceOverlayRoot = Join-Path $pluginRoot 'windows-overlay'
$runtimeRoot = Join-Path $env:LOCALAPPDATA 'CodexEfficiencyRadar'
$overlayRoot = Join-Path $runtimeRoot 'windows-overlay'
$runnerPath = Join-Path $overlayRoot 'Run-Resident.ps1'
$sourceLauncherPath = Join-Path $sourceOverlayRoot 'src\launcher.mjs'
$stateDir = Join-Path $overlayRoot 'state'
$ignorePath = Join-Path $stateDir 'ignore-once.pid'
$startupDir = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup'
$startupPath = Join-Path $startupDir 'CodexEfficiencyRadar.vbs'
$legacyStartup = Join-Path $startupDir 'CodexEfficiencyResident.vbs'
$powerShellPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$nodePath = (Get-Command node.exe -ErrorAction Stop).Source

if ($PSVersionTable.PSEdition -eq 'Core' -and -not $IsWindows) {
  Write-Error 'The selector overlay is available only on Windows.'
  exit 1
}

& $nodePath $sourceLauncherPath --diagnose
if ($LASTEXITCODE -ne 0) {
  Write-Warning 'This Codex build is not present in the reviewed compatibility list.'
  exit 2
}

$existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($null -ne $existingTask) {
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

New-Item -ItemType Directory -Path (Join-Path $overlayRoot 'src'), (Join-Path $runtimeRoot 'src'), $stateDir -Force | Out-Null
foreach ($file in @('compatibility.json', 'config.json', 'package.json', 'Run-Resident.ps1')) {
  Copy-Item -LiteralPath (Join-Path $sourceOverlayRoot $file) -Destination (Join-Path $overlayRoot $file) -Force
}
foreach ($sourceFile in Get-ChildItem -LiteralPath (Join-Path $sourceOverlayRoot 'src') -File) {
  $destination = Join-Path (Join-Path $overlayRoot 'src') $sourceFile.Name
  Copy-Item -LiteralPath $sourceFile.FullName -Destination $destination -Force
}
Copy-Item -LiteralPath (Join-Path $pluginRoot 'src\radar-client.mjs') -Destination (Join-Path $runtimeRoot 'src\radar-client.mjs') -Force

$currentCodex = Get-CimInstance Win32_Process -Filter "Name='ChatGPT.exe'" | Where-Object {
  $_.ExecutablePath -match '\\WindowsApps\\OpenAI\.Codex_' -and
  $_.CommandLine -notmatch '--type=' -and
  $_.CommandLine -notmatch '--remote-debugging-port='
} | Select-Object -First 1

if ($null -ne $currentCodex) {
  Set-Content -LiteralPath $ignorePath -Value $currentCodex.ProcessId -Encoding ASCII
} elseif (Test-Path -LiteralPath $ignorePath) {
  Remove-Item -LiteralPath $ignorePath -Force
}

$quotedRunnerPath = $runnerPath.Replace("'", "''")
$runnerCommand = "& '$quotedRunnerPath'"
$encodedRunnerCommand = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($runnerCommand))
$launchArguments = '-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -EncodedCommand {0}' -f $encodedRunnerCommand
$startupCommand = ('{0} {1}' -f $powerShellPath, $launchArguments).Replace('"', '""')
$startupScript = @"
Set shell = CreateObject("WScript.Shell")
shell.Run "$startupCommand", 0, False
"@

New-Item -ItemType Directory -Path $startupDir -Force | Out-Null
Set-Content -LiteralPath $startupPath -Value $startupScript -Encoding Unicode
Start-Process -FilePath $powerShellPath -ArgumentList $launchArguments -WindowStyle Hidden

if (Test-Path -LiteralPath $legacyStartup) {
  Remove-Item -LiteralPath $legacyStartup -Force
}

for ($attempt = 0; $attempt -lt 20; $attempt += 1) {
  Start-Sleep -Milliseconds 250
  $resident = Get-CimInstance Win32_Process | Where-Object {
    $_.Name -eq 'node.exe' -and $_.CommandLine -match $overlayPattern
  } | Select-Object -First 1
  if ($null -ne $resident) {
    break
  }
}
if ($null -eq $resident) {
  throw 'The selector resident process did not start.'
}

Write-Host 'Windows selector overlay installed. It now starts automatically with Windows; restart Codex once to activate it.'
