param(
  [string]$TaskName = "TramChuGeminiWebDaemon",
  [string]$StartupName = "Trạm Chữ Gemini Web Translator",
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
  [string]$RestDay = "none",
  [ValidateSet("StartupShortcut", "ScheduledTask")]
  [string]$Mode = "StartupShortcut"
)

$ErrorActionPreference = "Stop"

$startScript = Join-Path $RepoRoot "scripts\start-gemini-web-daemon.ps1"
if (!(Test-Path -LiteralPath $startScript)) {
  throw "Missing launcher: $startScript"
}

$powershell = (Get-Command powershell.exe -ErrorAction Stop).Source
$args = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$startScript`" -RepoRoot `"$RepoRoot`" -RestDay `"$RestDay`""
$launcherProject = Join-Path $RepoRoot "tools\GeminiWebStartupLauncher\GeminiWebStartupLauncher.csproj"
$launcherPublishDir = Join-Path $RepoRoot "tools\GeminiWebStartupLauncher\bin\Release\net8.0-windows\win-x64\publish"
$launcherExe = Join-Path $launcherPublishDir "TramChuGeminiWebTranslator.exe"

function Ensure-StartupLauncher {
  if (!(Test-Path -LiteralPath $launcherProject)) {
    throw "Missing startup launcher project: $launcherProject"
  }

  $dotnet = (Get-Command dotnet -ErrorAction Stop).Source
  $projectTime = (Get-Item -LiteralPath $launcherProject).LastWriteTimeUtc
  $sourceTime = (Get-Item -LiteralPath (Join-Path (Split-Path -Parent $launcherProject) "Program.cs")).LastWriteTimeUtc
  $needsBuild = !(Test-Path -LiteralPath $launcherExe)
  if (!$needsBuild) {
    $exeTime = (Get-Item -LiteralPath $launcherExe).LastWriteTimeUtc
    $needsBuild = $exeTime -lt $projectTime -or $exeTime -lt $sourceTime
  }

  if ($needsBuild) {
    & $dotnet publish $launcherProject -c Release -r win-x64 --self-contained false /p:PublishSingleFile=true | Out-Host
    if ($LASTEXITCODE -ne 0 -or !(Test-Path -LiteralPath $launcherExe)) {
      throw "Could not build startup launcher: $launcherExe"
    }
  }
}

if ($Mode -eq "StartupShortcut") {
  $legacyTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if ($legacyTask) {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  }

  $startupDir = [Environment]::GetFolderPath("Startup")
  $legacyShortcutPath = Join-Path $startupDir "$StartupName.lnk"
  if (Test-Path -LiteralPath $legacyShortcutPath) {
    Remove-Item -LiteralPath $legacyShortcutPath -Force
  }
  $approvedStartupFolderKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\StartupFolder"
  $legacyStartupApprovedName = "$StartupName.lnk"
  if (Get-ItemProperty -Path $approvedStartupFolderKey -Name $legacyStartupApprovedName -ErrorAction SilentlyContinue) {
    Remove-ItemProperty -Path $approvedStartupFolderKey -Name $legacyStartupApprovedName -Force
  }

  $runKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
  $runName = "Tram Chu Gemini Web Translator"
  Ensure-StartupLauncher
  New-Item -Path $runKey -Force | Out-Null
  New-ItemProperty `
    -Path $runKey `
    -Name $runName `
    -Value "`"$launcherExe`" --repo `"$RepoRoot`" --rest-day `"$RestDay`"" `
    -PropertyType String `
    -Force | Out-Null

  $approvedRunKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run"
  New-Item -Path $approvedRunKey -Force | Out-Null
  New-ItemProperty `
    -Path $approvedRunKey `
    -Name $runName `
    -Value ([byte[]](2,0,0,0,0,0,0,0,0,0,0,0)) `
    -PropertyType Binary `
    -Force | Out-Null

  Write-Host "Installed HKCU Run startup entry: $runName"
  Write-Host "You can control it in Task Manager > Startup apps: $runName"
  Write-Host "To start now:"
  Write-Host "  powershell -ExecutionPolicy Bypass -File `"$startScript`""
  Write-Host "Logs:"
  Write-Host "  $(Join-Path $RepoRoot "logs\gemini-web-daemon.log")"
  exit 0
}

$action = New-ScheduledTaskAction -Execute $powershell -Argument $args -WorkingDirectory $RepoRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -RestartCount 999 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit (New-TimeSpan -Seconds 0)
$settings.Hidden = $true
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Principal $principal `
  -Description "Run Tram Chu Gemini Web translator daemon at Windows logon." `
  -Force | Out-Null

Write-Host "Installed scheduled task: $TaskName"
Write-Host "It will start at Windows logon. To start now:"
Write-Host "  Start-ScheduledTask -TaskName `"$TaskName`""
Write-Host "Logs:"
Write-Host "  $(Join-Path $RepoRoot "logs\gemini-web-daemon.log")"
