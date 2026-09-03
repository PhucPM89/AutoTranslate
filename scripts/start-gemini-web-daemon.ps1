param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
  [string]$RestDay = "",
  [string]$ExtraArgs = ""
)

$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $RepoRoot

$logDir = Join-Path $RepoRoot "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logFile = Join-Path $logDir "gemini-web-daemon.log"
$errFile = Join-Path $logDir "gemini-web-daemon.err.log"

$env:TRANSLATION_PROVIDER = "gemini-web"
$env:GEMINI_WEB_REST_DAY = if ($RestDay) { $RestDay } elseif ($env:GEMINI_WEB_REST_DAY) { $env:GEMINI_WEB_REST_DAY } else { "none" }

$node = (Get-Command node -ErrorAction Stop).Source
$arguments = @("scripts/gemini-web-daemon.js")
if ($ExtraArgs) {
  $arguments += $ExtraArgs
}

"[$(Get-Date -Format s)] Starting Gemini Web daemon in $RepoRoot" | Out-File -FilePath $logFile -Append -Encoding utf8

$alreadyRunning = Get-CimInstance Win32_Process -Filter "name='node.exe'" |
  Where-Object { $_.CommandLine -like '*scripts/gemini-web-daemon.js*' -and $_.CommandLine -notlike '*Get-CimInstance*' }

if ($alreadyRunning) {
  "[$(Get-Date -Format s)] Gemini Web daemon already running: $($alreadyRunning.ProcessId -join ', ')" | Out-File -FilePath $logFile -Append -Encoding utf8
  exit 0
}

Start-Process `
  -FilePath $node `
  -ArgumentList $arguments `
  -WorkingDirectory $RepoRoot `
  -WindowStyle Hidden `
  -RedirectStandardOutput $logFile `
  -RedirectStandardError $errFile

exit 0
