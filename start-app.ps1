# Starts the MASEF Helper app (server serves the built Angular client).
# Usage: right-click > Run with PowerShell, or: powershell -File start-app.ps1
$wd = Join-Path $PSScriptRoot "server"
New-Item -ItemType Directory -Force (Join-Path $wd "logs") | Out-Null
$existing = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'src[/\\]server\.js' }
if ($existing) {
  Write-Host "Server already running (PID $($existing.ProcessId))."
} else {
  Start-Process -FilePath "node" -ArgumentList "src/server.js" -WorkingDirectory $wd -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $wd "logs\server.log") -RedirectStandardError (Join-Path $wd "logs\server.err.log")
  Start-Sleep -Seconds 2
  Write-Host "Server started."
}
Start-Process "http://localhost:3000"
