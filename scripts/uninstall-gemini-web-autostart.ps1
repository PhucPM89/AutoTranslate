param(
  [string]$TaskName = "TramChuGeminiWebDaemon",
  [string]$StartupName = "Trạm Chữ Gemini Web Translator"
)

$ErrorActionPreference = "Stop"

$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($task) {
  Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Host "Removed scheduled task: $TaskName"
} else {
  Write-Host "Scheduled task not found: $TaskName"
}

$startupDir = [Environment]::GetFolderPath("Startup")
$shortcutPath = Join-Path $startupDir "$StartupName.lnk"
if (Test-Path -LiteralPath $shortcutPath) {
  Remove-Item -LiteralPath $shortcutPath -Force
  Write-Host "Removed Startup app shortcut: $shortcutPath"
} else {
  Write-Host "Startup app shortcut not found: $shortcutPath"
}

$approvedStartupFolderKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\StartupFolder"
$legacyStartupApprovedName = "$StartupName.lnk"
if (Get-ItemProperty -Path $approvedStartupFolderKey -Name $legacyStartupApprovedName -ErrorAction SilentlyContinue) {
  Remove-ItemProperty -Path $approvedStartupFolderKey -Name $legacyStartupApprovedName -Force
  Write-Host "Removed StartupApproved shortcut cache: $legacyStartupApprovedName"
}

$runKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
$runName = "Tram Chu Gemini Web Translator"
if (Get-ItemProperty -Path $runKey -Name $runName -ErrorAction SilentlyContinue) {
  Remove-ItemProperty -Path $runKey -Name $runName -Force
  Write-Host "Removed HKCU Run startup entry: $runName"
} else {
  Write-Host "HKCU Run startup entry not found: $runName"
}

$approvedRunKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run"
if (Get-ItemProperty -Path $approvedRunKey -Name $runName -ErrorAction SilentlyContinue) {
  Remove-ItemProperty -Path $approvedRunKey -Name $runName -Force
  Write-Host "Removed StartupApproved Run entry: $runName"
}
