param(
  [ValidateSet("show", "hide")]
  [string]$Mode = "show",
  [string]$ProfileDir = "$env:USERPROFILE\.epub-translator\gpt-web-profiles\slot-1"
)

$signature = @'
using System;
using System.Runtime.InteropServices;
public static class GptWindowControl {
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc callback, IntPtr extraData);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
    [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr hWnd, int index);
    [DllImport("user32.dll")] public static extern int SetWindowLong(IntPtr hWnd, int index, int value);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int command);
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr after, int x, int y, int cx, int cy, uint flags);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);

    public static int SetVisible(uint wantedProcessId, bool show) {
        int changed = 0;
        EnumWindows(delegate(IntPtr handle, IntPtr extra) {
            uint processId;
            GetWindowThreadProcessId(handle, out processId);
            if (processId != wantedProcessId) return true;
            const int GWL_EXSTYLE = -20;
            const int WS_EX_TOOLWINDOW = 0x00000080;
            const int WS_EX_APPWINDOW = 0x00040000;
            int style = GetWindowLong(handle, GWL_EXSTYLE);
            if (show) {
                SetWindowLong(handle, GWL_EXSTYLE, (style | WS_EX_APPWINDOW) & ~WS_EX_TOOLWINDOW);
                SetWindowPos(handle, IntPtr.Zero, 80, 80, 1100, 760, 0x0014);
                ShowWindow(handle, 9);
                SetForegroundWindow(handle);
            } else {
                SetWindowLong(handle, GWL_EXSTYLE, (style | WS_EX_TOOLWINDOW) & ~WS_EX_APPWINDOW);
                ShowWindow(handle, 4);
                SetWindowPos(handle, IntPtr.Zero, -32000, -32000, 960, 600, 0x0014);
            }
            changed++;
            return true;
        }, IntPtr.Zero);
        return changed;
    }
}
'@
Add-Type -TypeDefinition $signature -ErrorAction SilentlyContinue

$resolvedProfile = [IO.Path]::GetFullPath($ProfileDir)
$browser = Get-CimInstance Win32_Process -Filter "Name = 'chrome.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -and $_.CommandLine.IndexOf($resolvedProfile, [StringComparison]::OrdinalIgnoreCase) -ge 0 -and $_.CommandLine -notmatch '--type=' } |
  Select-Object -First 1

if (-not $browser) {
  Write-Host "[GPT WEB] Khong tim thay cua so Chrome GPT dang chay. Hay chay run-gpt-web-daemon.bat truoc."
  exit 1
}

$changed = [GptWindowControl]::SetVisible([uint32]$browser.ProcessId, $Mode -eq "show")
if ($changed -lt 1) {
  Write-Host "[GPT WEB] Tim thay process nhung chua tim thay cua so de thay doi. Thu lai sau vai giay."
  exit 2
}
Write-Host $(if ($Mode -eq "show") { "[GPT WEB] Da hien cua so dang chay." } else { "[GPT WEB] Da an cua so; worker van tiep tuc." })
