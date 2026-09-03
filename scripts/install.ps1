[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$pluginRoot = Join-Path $repoRoot 'plugins\codex-efficiency-radar'
$bundlePath = Join-Path $pluginRoot 'dist\server.mjs'
$overlayLauncher = Join-Path $pluginRoot 'windows-overlay\src\launcher.mjs'
$marketplaceName = 'codex-efficiency-radar'
$pluginName = 'codex-efficiency-radar'

if ($args.Count -gt 0) {
  Write-Error ('Unsupported installer arguments: {0}. The native selector overlay is required.' -f ($args -join ' '))
  exit 64
}

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

Write-Host '[1/5] Verifying the bundled MCP server...'
if (-not (Test-Path -LiteralPath $bundlePath)) {
  throw "Bundled MCP server is missing: $bundlePath"
}
Invoke-Checked $node @('--check', $bundlePath)

Write-Host '[2/5] Preflighting the required native selector overlay...'
Invoke-Checked $node @($overlayLauncher, '--diagnose')

Write-Host '[3/5] Registering the local Codex plugin marketplace...'
$marketplaces = (& $codex plugin marketplace list --json | ConvertFrom-Json).marketplaces
$existingMarketplace = $marketplaces | Where-Object { $_.name -eq $marketplaceName } | Select-Object -First 1
if ($null -eq $existingMarketplace) {
  Invoke-Checked $codex @('plugin', 'marketplace', 'add', $repoRoot)
} else {
  $existingRoot = [System.IO.Path]::GetFullPath($existingMarketplace.root).TrimEnd('\')
  $expectedRoot = [System.IO.Path]::GetFullPath($repoRoot).TrimEnd('\')
  if (-not $existingRoot.Equals($expectedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    $source = $existingMarketplace.marketplaceSource.source
    $sameRepository = $source -match 'LambertKeith[/\\]codex-efficiency-radar(?:\.git)?$'
    if (-not $sameRepository) {
      try {
        $cachedMarketplace = Get-Content -LiteralPath (
          Join-Path $existingRoot '.agents\plugins\marketplace.json'
        ) -Raw | ConvertFrom-Json
        $cachedManifest = Get-Content -LiteralPath (
          Join-Path $existingRoot "plugins\$pluginName\.codex-plugin\plugin.json"
        ) -Raw | ConvertFrom-Json
        $repository = ([string]$cachedManifest.repository).TrimEnd('/') -replace '\.git$', ''
        $sameRepository = (
          $cachedMarketplace.name -eq $marketplaceName -and
          $cachedManifest.name -eq $pluginName -and
          $repository.Equals(
            'https://github.com/LambertKeith/codex-efficiency-radar',
            [System.StringComparison]::OrdinalIgnoreCase
          )
        )
      } catch {
        $sameRepository = $false
      }
    }
    if (-not $sameRepository) {
      throw "Marketplace '$marketplaceName' already points to another directory: $existingRoot"
    }
    Invoke-Checked $codex @('plugin', 'marketplace', 'remove', $marketplaceName)
    Invoke-Checked $codex @('plugin', 'marketplace', 'add', $repoRoot)
  }
}

Write-Host '[4/5] Installing the regular Codex plugin...'
Invoke-Checked $codex @('plugin', 'add', "$pluginName@$marketplaceName")

$expectedVersion = (Get-Content -LiteralPath (Join-Path $pluginRoot '.codex-plugin\plugin.json') -Raw | ConvertFrom-Json).version
$installed = (& $codex plugin list --json | ConvertFrom-Json).installed | Where-Object {
  $_.pluginId -eq "$pluginName@$marketplaceName"
}
if ($null -eq $installed -or -not $installed.installed -or -not $installed.enabled -or $installed.version -ne $expectedVersion) {
  throw "Plugin installation verification failed. Expected enabled version $expectedVersion."
}

Write-Host '[5/5] Installing and verifying the required Windows selector overlay...'
$overlayInstaller = Join-Path $pluginRoot 'scripts\install-selector-overlay.ps1'
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $overlayInstaller
if ($LASTEXITCODE -ne 0) {
  throw "Selector overlay installation failed with exit code $LASTEXITCODE"
}

Write-Host ''
Write-Host (
  "Codex Efficiency Radar $expectedVersion is fully installed: plugin enabled, Codex is in enhanced mode, " +
  'and the real model selector has verified Efficiency values.'
)
