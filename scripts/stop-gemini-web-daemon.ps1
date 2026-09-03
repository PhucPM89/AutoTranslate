param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

$ErrorActionPreference = "Stop"

$targets = Get-CimInstance Win32_Process -Filter "name='node.exe'" |
  Where-Object {
    $_.CommandLine -like '*scripts/gemini-web-daemon.js*' -or
    $_.CommandLine -like '*scripts\gemini-web-daemon.js*' -or
    $_.CommandLine -like '*scripts/translate-worker.js*' -or
    $_.CommandLine -like '*scripts\translate-worker.js*'
  }

foreach ($process in $targets) {
  Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
}

Write-Host "Stopped Gemini Web daemon processes: $($targets.Count)"
