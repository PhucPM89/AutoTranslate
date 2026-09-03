using System.Diagnostics;

static string? ReadArg(string[] args, string name)
{
    for (var i = 0; i < args.Length - 1; i++)
    {
        if (string.Equals(args[i], name, StringComparison.OrdinalIgnoreCase))
        {
            return args[i + 1];
        }
    }

    return null;
}

static string Quote(string value)
{
    return "\"" + value.Replace("\"", "\\\"") + "\"";
}

var repoRoot = ReadArg(args, "--repo");
if (string.IsNullOrWhiteSpace(repoRoot))
{
    repoRoot = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", ".."));
}

var restDay = ReadArg(args, "--rest-day") ?? "none";
var startScript = Path.Combine(repoRoot, "scripts", "start-gemini-web-daemon.ps1");
var logDir = Path.Combine(repoRoot, "logs");
Directory.CreateDirectory(logDir);

if (!File.Exists(startScript))
{
    File.AppendAllText(
        Path.Combine(logDir, "gemini-web-startup-launcher.err.log"),
        $"[{DateTime.Now:s}] Missing launcher script: {startScript}{Environment.NewLine}");
    return;
}

var powershell = Path.Combine(
    Environment.GetFolderPath(Environment.SpecialFolder.Windows),
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe");

var startInfo = new ProcessStartInfo
{
    FileName = powershell,
    Arguments = $"-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File {Quote(startScript)} -RepoRoot {Quote(repoRoot)} -RestDay {Quote(restDay)}",
    WorkingDirectory = repoRoot,
    UseShellExecute = false,
    CreateNoWindow = true,
    WindowStyle = ProcessWindowStyle.Hidden
};

Process.Start(startInfo);
