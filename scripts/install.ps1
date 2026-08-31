[CmdletBinding()]
param(
  [switch]$PluginOnly
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$pluginRoot = Join-Path $repoRoot 'plugins\codex-efficiency-radar'
$bundlePath = Join-Path $pluginRoot 'dist\server.mjs'
$marketplaceName = 'codex-efficiency-radar'
$pluginName = 'codex-efficiency-radar'

function Require-Command([string]$Name) {
  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if ($null -eq $command) {
    throw "Required command is missing: $Name"
  }
  return $command.Source
}

function Invoke-Checked([string]$FilePath, [string[]]$Arguments) {
  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$FilePath failed with exit code $LASTEXITCODE"
  }
}

$node = Require-Command 'node.exe'
$codex = Require-Command 'codex.exe'

Write-Host '[1/4] Verifying the bundled MCP server...'
if (-not (Test-Path -LiteralPath $bundlePath)) {
  throw "Bundled MCP server is missing: $bundlePath"
}
Invoke-Checked $node @('--check', $bundlePath)

Write-Host '[2/4] Registering the local Codex plugin marketplace...'
$marketplaces = (& $codex plugin marketplace list --json | ConvertFrom-Json).marketplaces
$existingMarketplace = $marketplaces | Where-Object { $_.name -eq $marketplaceName } | Select-Object -First 1
if ($null -eq $existingMarketplace) {
  Invoke-Checked $codex @('plugin', 'marketplace', 'add', $repoRoot)
} else {
  $existingRoot = [System.IO.Path]::GetFullPath($existingMarketplace.root).TrimEnd('\')
  $expectedRoot = [System.IO.Path]::GetFullPath($repoRoot).TrimEnd('\')
  if (-not $existingRoot.Equals($expectedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    $source = $existingMarketplace.marketplaceSource.source
    if ($source -match 'LambertKeith[/\\]codex-efficiency-radar(?:\.git)?$') {
      Invoke-Checked $codex @('plugin', 'marketplace', 'upgrade', $marketplaceName)
    } else {
      throw "Marketplace '$marketplaceName' already points to another directory: $existingRoot"
    }
  }
}

Write-Host '[3/4] Installing the Codex plugin...'
Invoke-Checked $codex @('plugin', 'add', "$pluginName@$marketplaceName")

if (-not $PluginOnly) {
  Write-Host '[4/4] Enabling the optional Windows selector overlay...'
  $overlayInstaller = Join-Path $pluginRoot 'scripts\install-selector-overlay.ps1'
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $overlayInstaller
  if ($LASTEXITCODE -eq 2) {
    Write-Warning 'The plugin is installed, but the selector overlay was skipped because this Codex version is not approved yet.'
  } elseif ($LASTEXITCODE -ne 0) {
    throw "Selector overlay installation failed with exit code $LASTEXITCODE"
  }
} else {
  Write-Host '[4/4] Selector overlay skipped by request.'
}

$installed = (& $codex plugin list --json | ConvertFrom-Json).installed | Where-Object {
  $_.pluginId -eq "$pluginName@$marketplaceName" -and $_.installed
}
if ($null -eq $installed) {
  throw 'Plugin installation could not be verified.'
}

Write-Host ''
Write-Host 'Codex Efficiency Radar is installed.'
Write-Host 'Restart the ChatGPT/Codex desktop app, then open Model > Reasoning effort.'
