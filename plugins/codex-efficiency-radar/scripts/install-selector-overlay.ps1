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
$activationRequestPath = Join-Path $stateDir 'activate-now.request'
$installAttemptPath = Join-Path $stateDir 'install-attempt.json'
$disabledPath = Join-Path $stateDir 'overlay-disabled.json'
$diagnosticsRoot = Join-Path $userProfileDir '.codex\diagnostics\codex-efficiency-radar'
$startupDir = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup'
$startupPath = Join-Path $startupDir 'CodexEfficiencyRadar.vbs'
$legacyStartup = Join-Path $startupDir 'CodexEfficiencyResident.vbs'
$powerShellPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$nodePath = (Get-Command node.exe -ErrorAction Stop).Source

function Remove-IncompleteRuntime {
  param(
    [Parameter(Mandatory = $true)]
    [string]$CandidateRoot
  )

  $expectedRoot = [System.IO.Path]::GetFullPath(
    (Join-Path ([Environment]::GetFolderPath('UserProfile')) '.codex\runtimes\codex-efficiency-radar')
  ).TrimEnd('\')
  $resolvedRoot = [System.IO.Path]::GetFullPath($CandidateRoot).TrimEnd('\')
  if (-not [string]::Equals(
    $resolvedRoot,
    $expectedRoot,
    [System.StringComparison]::OrdinalIgnoreCase
  )) {
    throw "Refusing to remove an unexpected runtime path: $resolvedRoot"
  }
  if (Test-Path -LiteralPath $resolvedRoot) {
    Remove-Item -LiteralPath $resolvedRoot -Recurse -Force
  }
}

function Preserve-InstallDiagnostics {
  param(
    [Parameter(Mandatory = $true)]
    [System.Management.Automation.ErrorRecord]$Failure
  )

  $failureDir = Join-Path $diagnosticsRoot (
    'failed-install-{0}-{1}' -f (Get-Date -Format 'yyyyMMdd-HHmmss-fff'), [guid]::NewGuid()
  )
  New-Item -ItemType Directory -Path $failureDir -Force | Out-Null
  $failureText = @(
    "CapturedAt: $([DateTime]::UtcNow.ToString('o'))"
    "Exception: $($Failure.Exception.ToString())"
    "ScriptStackTrace: $($Failure.ScriptStackTrace)"
    "Position: $($Failure.InvocationInfo.PositionMessage)"
  ) -join [Environment]::NewLine
  [System.IO.File]::WriteAllText(
    (Join-Path $failureDir 'error.txt'),
    $failureText,
    (New-Object System.Text.UTF8Encoding($false))
  )
  if (Test-Path -LiteralPath $stateDir) {
    Copy-Item -LiteralPath $stateDir -Destination (Join-Path $failureDir 'state') -Recurse -Force
  }
  return $failureDir
}

if ($PSVersionTable.PSEdition -eq 'Core' -and -not $IsWindows) {
  Write-Error 'The selector overlay is available only on Windows.'
  exit 1
}

& $nodePath $sourceLauncherPath --diagnose
if ($LASTEXITCODE -ne 0) {
  Write-Warning 'This Codex build is not present in the reviewed compatibility list.'
  exit 2
}

$overlayPattern = [regex]::Escape($overlayRoot) + '.*\\src\\(resident|launcher)\.mjs'
$legacyRuntimePattern = [regex]::Escape($legacyRuntimeRoot) + '.*\\src\\(resident|launcher)\.mjs'
$legacyPattern = 'codex-efficiency-selector-patch\\src\\(resident|launcher)\.mjs'
$runtimeBackupRoot = "${runtimeRoot}.install-backup-$([guid]::NewGuid())"
$runtimeBackedUp = $false
$runtimeMutationStarted = $false

try {
  $existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  if ($null -ne $existingTask) {
    Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
  }

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

  if (Test-Path -LiteralPath $runtimeRoot) {
    Move-Item -LiteralPath $runtimeRoot -Destination $runtimeBackupRoot
    $runtimeBackedUp = $true
  }
  $runtimeMutationStarted = $true

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
  $runtimePackage = Get-Content -LiteralPath (Join-Path $overlayRoot 'package.json') -Raw | ConvertFrom-Json
  $attempt = [ordered]@{
    attemptId = [guid]::NewGuid().ToString()
    version = $runtimePackage.version
    requestedAt = [DateTime]::UtcNow.ToString('o')
  }
  $attemptJson = $attempt | ConvertTo-Json
  $utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($installAttemptPath, $attemptJson, $utf8WithoutBom)
  Set-Content -LiteralPath $activationRequestPath -Value 'install' -Encoding ASCII

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

  $resident = $null
  for ($residentAttempt = 0; $residentAttempt -lt 20; $residentAttempt += 1) {
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

  & $nodePath (Join-Path $pluginRoot 'scripts\verify-selector-overlay.mjs')
  if ($LASTEXITCODE -ne 0) {
    throw 'The selector resident health check failed.'
  }
} catch {
  $originalError = $_
  try {
    $preservedDiagnostics = Preserve-InstallDiagnostics -Failure $originalError
    Write-Warning "Selector installation diagnostics were preserved at: $preservedDiagnostics"
  } catch {
    Write-Warning "Failed to preserve selector installation diagnostics: $($_.Exception.Message)"
  }

  Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
  Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
    $_.Name -eq 'node.exe' -and $_.CommandLine -match $overlayPattern
  } | ForEach-Object {
    Stop-Process -Id $_.ProcessId -ErrorAction SilentlyContinue
  }

  try {
    & $nodePath $sourceLauncherPath --restore-standard
    if ($LASTEXITCODE -ne 0) {
      Write-Warning "Restoring standard Codex exited with code $LASTEXITCODE."
    }
  } catch {
    Write-Warning "Failed to request standard Codex restoration: $($_.Exception.Message)"
  }

  if ($runtimeMutationStarted) {
    try {
      Remove-IncompleteRuntime -CandidateRoot $runtimeRoot
      if ($runtimeBackedUp -and (Test-Path -LiteralPath $runtimeBackupRoot)) {
        Move-Item -LiteralPath $runtimeBackupRoot -Destination $runtimeRoot
      }
    } catch {
      Write-Warning "Failed to clean or restore the managed runtime: $($_.Exception.Message)"
    }
  }
  throw $originalError
}

foreach ($startupFile in @($startupPath, $legacyStartup)) {
  if (Test-Path -LiteralPath $startupFile) {
    Remove-Item -LiteralPath $startupFile -Force -ErrorAction SilentlyContinue
  }
}

if (Test-Path -LiteralPath $legacyRuntimeRoot) {
  $resolvedLegacyRoot = [System.IO.Path]::GetFullPath($legacyRuntimeRoot).TrimEnd('\')
  $expectedLegacyRoot = [System.IO.Path]::GetFullPath(
    (Join-Path $env:LOCALAPPDATA 'CodexEfficiencyRadar')
  ).TrimEnd('\')
  if ($resolvedLegacyRoot -eq $expectedLegacyRoot) {
    try {
      Remove-Item -LiteralPath $resolvedLegacyRoot -Recurse -Force
    } catch {
      Write-Warning "Failed to remove the legacy managed runtime: $($_.Exception.Message)"
    }
  }
}

if ($runtimeBackedUp -and (Test-Path -LiteralPath $runtimeBackupRoot)) {
  try {
    $expectedBackupPrefix = [System.IO.Path]::GetFullPath("$runtimeRoot.install-backup-")
    $resolvedBackupRoot = [System.IO.Path]::GetFullPath($runtimeBackupRoot)
    if (-not $resolvedBackupRoot.StartsWith(
      $expectedBackupPrefix,
      [System.StringComparison]::OrdinalIgnoreCase
    )) {
      throw "Refusing to remove an unexpected runtime backup path: $resolvedBackupRoot"
    }
    Remove-Item -LiteralPath $resolvedBackupRoot -Recurse -Force
  } catch {
    Write-Warning "Failed to remove the previous managed runtime backup: $($_.Exception.Message)"
  }
}

Write-Host 'Windows selector overlay installation completed: Codex is running in enhanced mode and the real selector UI has verified efficiency values.'
