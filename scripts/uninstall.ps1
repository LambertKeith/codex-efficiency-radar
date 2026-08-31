[CmdletBinding()]
param(
  [switch]$KeepMarketplace
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$pluginRoot = Join-Path $repoRoot 'plugins\codex-efficiency-radar'
$marketplaceName = 'codex-efficiency-radar'
$pluginName = 'codex-efficiency-radar'
$codex = (Get-Command codex.exe -ErrorAction SilentlyContinue).Source

$overlayUninstaller = Join-Path $pluginRoot 'scripts\uninstall-selector-overlay.ps1'
if (Test-Path -LiteralPath $overlayUninstaller) {
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $overlayUninstaller
  if ($LASTEXITCODE -ne 0) {
    throw "Selector overlay uninstall failed with exit code $LASTEXITCODE"
  }
}

if ($null -ne $codex) {
  $installed = (& $codex plugin list --json | ConvertFrom-Json).installed | Where-Object {
    $_.pluginId -eq "$pluginName@$marketplaceName" -and $_.installed
  }
  if ($null -ne $installed) {
    & $codex plugin remove "$pluginName@$marketplaceName"
    if ($LASTEXITCODE -ne 0) {
      throw "Plugin removal failed with exit code $LASTEXITCODE. Close every Codex window, then run Uninstall.cmd again so the plugin cache is no longer in use."
    }
  }

  if (-not $KeepMarketplace) {
    $marketplace = (& $codex plugin marketplace list --json | ConvertFrom-Json).marketplaces |
      Where-Object { $_.name -eq $marketplaceName } |
      Select-Object -First 1
    if ($null -ne $marketplace) {
      $existingRoot = [System.IO.Path]::GetFullPath($marketplace.root).TrimEnd('\')
      $expectedRoot = [System.IO.Path]::GetFullPath($repoRoot).TrimEnd('\')
      $source = $marketplace.marketplaceSource.source
      $sameRepository = $source -match 'LambertKeith[/\\]codex-efficiency-radar(?:\.git)?$'
      if ($existingRoot.Equals($expectedRoot, [System.StringComparison]::OrdinalIgnoreCase) -or $sameRepository) {
        & $codex plugin marketplace remove $marketplaceName
        if ($LASTEXITCODE -ne 0) {
          throw "Marketplace removal failed with exit code $LASTEXITCODE"
        }
      }
    }
  }
}

Write-Host 'Codex Efficiency Radar is uninstalled. Restart the desktop app to clear the current overlay.'
