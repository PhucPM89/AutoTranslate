# Starts the resumable Fanqie recovery exactly once. It is intentionally safe
# to call from Task Scheduler: a running batch is left untouched, while a
# stopped batch is restarted and resumes from its Drive inventory/checkpoint.

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$node = (Get-Command node -ErrorAction Stop).Source
$running = Get-CimInstance Win32_Process | Where-Object {
  $_.Name -eq 'node.exe' -and $_.CommandLine -match 'scripts[\\/]recover-fanqie-batch\.js'
}

if ($running) {
  Write-Output "Fanqie recovery is already running (PID $($running[0].ProcessId))."
  exit 0
}

$logDir = Join-Path $projectRoot 'scratch'
New-Item -ItemType Directory -Path $logDir -Force | Out-Null

function Test-AllFanqieRecovered {
  $inventory = Get-Content (Join-Path $logDir 'drive-originals-status.json') -Raw | ConvertFrom-Json
  $checkpointPath = Join-Path $logDir 'recover-fanqie-batch-progress.json'
  $checkpoint = if (Test-Path $checkpointPath) {
    Get-Content $checkpointPath -Raw | ConvertFrom-Json
  } else { $null }
  $completed = @($checkpoint.completed)
  $pending = @($inventory.missingOrig | Where-Object {
    $_.bookId -match '^fanqie-\d{10,25}$' -and $_.bookId -notin $completed
  })
  return $pending.Count -eq 0
}

while (-not (Test-AllFanqieRecovered)) {
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $stdout = Join-Path $logDir "recover-fanqie-supervisor-$stamp.stdout.log"
  $stderr = Join-Path $logDir "recover-fanqie-supervisor-$stamp.stderr.log"
  $child = Start-Process -FilePath $node -ArgumentList 'scripts/recover-fanqie-batch.js' -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
  Write-Output "Started Fanqie recovery (PID $($child.Id)). Logs: $stdout"
  $child.WaitForExit()
  if (-not (Test-AllFanqieRecovered)) {
    Write-Warning "Recovery process ended before the queue was complete; restarting in 5 minutes."
    Start-Sleep -Seconds 300
  }
}

Write-Output 'Fanqie recovery queue is complete; watchdog stopped.'
