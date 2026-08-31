param(
  [string]$NodePath
)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$stateDir = Join-Path $projectRoot 'state'
$ignorePath = Join-Path $stateDir 'ignore-once.pid'
$supervisorLog = Join-Path $stateDir 'supervisor.log'
$residentPath = Join-Path $projectRoot 'src\resident.mjs'

New-Item -ItemType Directory -Path $stateDir -Force | Out-Null

try {
  if ([string]::IsNullOrWhiteSpace($NodePath)) {
    $NodePath = (Get-Command node.exe -ErrorAction Stop).Source
  }
  $arguments = @($residentPath)

  if (Test-Path -LiteralPath $ignorePath) {
    $ignorePid = (Get-Content -Raw -LiteralPath $ignorePath).Trim()
    Remove-Item -LiteralPath $ignorePath -Force
    if ($ignorePid -match '^\d+$') {
      $arguments += "--ignore-pid=$ignorePid"
    }
  }

  & $NodePath @arguments
  exit $LASTEXITCODE
} catch {
  $message = '{0:o} Resident supervisor failed: {1}' -f (Get-Date), $_.Exception.Message
  Add-Content -LiteralPath $supervisorLog -Value $message -Encoding UTF8
  exit 1
}
