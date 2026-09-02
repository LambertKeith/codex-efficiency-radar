[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$taskName = 'CodexEfficiencyResident'
$pluginRoot = Split-Path -Parent $PSScriptRoot
$sourceOverlayRoot = Join-Path $pluginRoot 'windows-overlay'
$userProfileDir = [Environment]::GetFolderPath('UserProfile')
$runtimeRoot = Join-Path $userProfileDir '.codex\runtimes\codex-efficiency-radar'
$legacyRuntimeRoot = Join-Path $env:LOCALAPPDATA 'CodexEfficiencyRadar'
$overlayRoot = Join-Path $runtimeRoot 'windows-overlay'
$runnerPath = Join-Path $overlayRoot 'Run-Resident.ps1'
$sourceLauncherPath = Join-Path $sourceOverlayRoot 'src\launcher.mjs'
$stateDir = Join-Path $overlayRoot 'state'
$ignorePath = Join-Path $stateDir 'ignore-once.pid'
$disabledPath = Join-Path $stateDir 'overlay-disabled.json'
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
$legacyRuntimePattern = [regex]::Escape($legacyRuntimeRoot) + '.*\\src\\(resident|launcher)\.mjs'
$legacyPattern = 'codex-efficiency-selector-patch\\src\\(resident|launcher)\.mjs'
$managedProcesses = Get-CimInstance Win32_Process | Where-Object {
  $_.Name -eq 'node.exe' -and
  (
    $_.CommandLine -match $overlayPattern -or
    $_.CommandLine -match $legacyRuntimePattern -or
    $_.CommandLine -match $legacyPattern
  )
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
Remove-Item -LiteralPath $disabledPath -Force -ErrorAction SilentlyContinue

$currentCodex = Get-CimInstance Win32_Process -Filter "Name='ChatGPT.exe'" | Where-Object {
  $_.ExecutablePath -match '\\WindowsApps\\OpenAI\.Codex_' -and
  $_.CommandLine -notmatch '--type=' -and
  $_.CommandLine -notmatch '--remote-debugging-port='
} | Select-Object -First 1

if ($null -ne $currentCodex) {
  Set-Content -LiteralPath $ignorePath -Value $currentCodex.ProcessId -Encoding ASCII
  Write-Warning (
    ('Codex main process PID {0} is still running. Close Codex completely; ' +
    'closing only the window may leave the process alive. The installer will not stop it.') -f
      $currentCodex.ProcessId
  )
} elseif (Test-Path -LiteralPath $ignorePath) {
  Remove-Item -LiteralPath $ignorePath -Force
}

$quotedRunnerPath = $runnerPath.Replace("'", "''")
$quotedNodePath = $nodePath.Replace("'", "''")
$runnerCommand = "& '$quotedRunnerPath' -NodePath '$quotedNodePath'"
$encodedRunnerCommand = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($runnerCommand))
$launchArguments = '-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -EncodedCommand {0}' -f $encodedRunnerCommand
$userId = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$taskAction = New-ScheduledTaskAction -Execute $powerShellPath -Argument $launchArguments
$taskTrigger = New-ScheduledTaskTrigger -AtLogOn -User $userId
$taskPrincipal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Limited
$taskSettings = New-ScheduledTaskSettingsSet `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries
$taskDefinition = New-ScheduledTask `
  -Action $taskAction `
  -Trigger $taskTrigger `
  -Principal $taskPrincipal `
  -Settings $taskSettings `
  -Description 'Runs the Codex Efficiency Radar selector resident for the current user.'
Register-ScheduledTask -TaskName $taskName -InputObject $taskDefinition -Force | Out-Null
Start-ScheduledTask -TaskName $taskName

foreach ($startupFile in @($startupPath, $legacyStartup)) {
  if (Test-Path -LiteralPath $startupFile) {
    Remove-Item -LiteralPath $startupFile -Force
  }
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
  Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
  throw 'The selector resident process did not start.'
}

if (Test-Path -LiteralPath $legacyRuntimeRoot) {
  $resolvedLegacyRoot = [System.IO.Path]::GetFullPath($legacyRuntimeRoot).TrimEnd('\')
  $expectedLegacyRoot = [System.IO.Path]::GetFullPath(
    (Join-Path $env:LOCALAPPDATA 'CodexEfficiencyRadar')
  ).TrimEnd('\')
  if ($resolvedLegacyRoot -eq $expectedLegacyRoot) {
    Remove-Item -LiteralPath $resolvedLegacyRoot -Recurse -Force
  }
}

Write-Host 'Windows selector overlay installed. Its current-user scheduled task starts automatically at sign-in.'
Write-Host 'If Codex was running, exit it completely. Enhanced mode starts after the main process exits.'
