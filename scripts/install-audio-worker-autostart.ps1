$ErrorActionPreference = "Stop"
$projectDir = Split-Path -Parent $PSScriptRoot
$launcher = Join-Path $projectDir "run-audio-worker.bat"
$action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"$launcher`"" -WorkingDirectory $projectDir
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Days 30) -RestartCount 10 -RestartInterval (New-TimeSpan -Minutes 2)
Register-ScheduledTask -TaskName "TramChuAudioWorker" -Action $action -Trigger $trigger -Settings $settings -Description "Edge-TTS audio queue worker for Tram Chu" -Force | Out-Null
Write-Output "AUDIO_WORKER_AUTOSTART_OK"
