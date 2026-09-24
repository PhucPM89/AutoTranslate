param(
  [Parameter(Mandatory = $true)]
  [string]$ProfileDir
)

$signature = @'
using System;
using System.Runtime.InteropServices;
public static class WindowControl {
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc callback, IntPtr extraData);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
    [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr hWnd, int index);
    [DllImport("user32.dll")] public static extern int SetWindowLong(IntPtr hWnd, int index, int value);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int command);
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr after, int x, int y, int cx, int cy, uint flags);

    public static void MakeBackgroundWindow(uint wantedProcessId) {
        EnumWindows(delegate(IntPtr handle, IntPtr extra) {
            uint processId;
            GetWindowThreadProcessId(handle, out processId);
            if (processId != wantedProcessId) return true;
            const int GWL_EXSTYLE = -20;
            const int WS_EX_TOOLWINDOW = 0x00000080;
            const int WS_EX_APPWINDOW = 0x00040000;
            int style = GetWindowLong(handle, GWL_EXSTYLE);
            SetWindowLong(handle, GWL_EXSTYLE, (style | WS_EX_TOOLWINDOW) & ~WS_EX_APPWINDOW);
            ShowWindow(handle, 4);
            SetWindowPos(handle, IntPtr.Zero, -32000, -32000, 960, 600, 0x0014);
            return true;
        }, IntPtr.Zero);
    }
}
'@
Add-Type -TypeDefinition $signature -ErrorAction SilentlyContinue

$resolvedProfile = [System.IO.Path]::GetFullPath($ProfileDir)
$deadline = [DateTime]::UtcNow.AddSeconds(15)
do {
  $matches = Get-CimInstance Win32_Process -Filter "Name = 'chrome.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and $_.CommandLine.IndexOf($resolvedProfile, [StringComparison]::OrdinalIgnoreCase) -ge 0 }
  foreach ($item in $matches) {
    [WindowControl]::MakeBackgroundWindow([uint32]$item.ProcessId)
  }
  Start-Sleep -Milliseconds 250
} while ([DateTime]::UtcNow -lt $deadline)
