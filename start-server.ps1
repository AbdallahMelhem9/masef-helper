# Starts the MASEF Helper server silently (no browser). Used by the startup shortcut.
$wd = Join-Path $PSScriptRoot "server"
New-Item -ItemType Directory -Force (Join-Path $wd "logs") | Out-Null
$existing = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'src[/\\]server\.js' }
if (-not $existing) {
  Start-Process -FilePath "node" -ArgumentList "src/server.js" -WorkingDirectory $wd -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $wd "logs\server.log") -RedirectStandardError (Join-Path $wd "logs\server.err.log")
}
