# Laptop relay: the camera phone sends its video here, this sends it to YouTube.
# Keep this window open (and the laptop online) for the whole match.
param([switch]$NewKey)
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
Set-Location $here

$keyFile = Join-Path $here 'stream.key'
if ($NewKey -or -not (Test-Path $keyFile) -or -not (Get-Content $keyFile -Raw).Trim()) {
    Write-Host ""
    Write-Host "YouTube Studio > Create > Go live > Stream se 'Stream key' copy karein." -ForegroundColor Yellow
    $k = Read-Host "Stream key yahan paste karein (right click = paste)"
    $k.Trim() | Set-Content $keyFile -Encoding ascii
}

$secretFile = Join-Path $here 'secret.txt'
if (-not (Test-Path $secretFile)) {
    -join ((48..57) + (97..122) | Get-Random -Count 10 | ForEach-Object { [char]$_ }) | Set-Content $secretFile -Encoding ascii
}
$env:LIVE_SECRET = (Get-Content $secretFile -Raw).Trim()
$env:PORT = '5095'
$ff = Get-Command ffmpeg -ErrorAction SilentlyContinue
if ($ff) { $env:FFMPEG = $ff.Source } elseif (Test-Path 'C:\jarvis\tools\ffmpeg\bin\ffmpeg.exe') { $env:FFMPEG = 'C:\jarvis\tools\ffmpeg\bin\ffmpeg.exe' }

Write-Host "Internet link bana raha hoon..."
# cloudflared's own quick-tunnel request times out on this network; ask over IPv4.
$quick = (curl.exe -s -4 -m 60 -X POST https://api.trycloudflare.com/tunnel | ConvertFrom-Json).result
@{ AccountTag = $quick.account_tag; TunnelSecret = $quick.secret; TunnelID = $quick.id } |
    ConvertTo-Json | Set-Content (Join-Path $here 'creds.json') -Encoding ascii
$tunnel = Start-Process -FilePath (Join-Path $here 'cloudflared.exe') -WindowStyle Hidden -PassThru `
    -ArgumentList @('tunnel', '--no-autoupdate', '--edge-ip-version', '4', '--credentials-file', (Join-Path $here 'creds.json'),
                    '--url', 'http://localhost:5095', 'run', $quick.id) `
    -RedirectStandardError (Join-Path $here 'tunnel.log')

$code = "wss://$($quick.hostname)/live?k=$($env:LIVE_SECRET)"
try { Set-Clipboard -Value $code } catch {}
Write-Host ""
Write-Host "=============================================================" -ForegroundColor Green
Write-Host " LIVE CODE (copy ho chuka hai, WhatsApp par camera phone ko bhejein):" -ForegroundColor Green
Write-Host ""
Write-Host " $code" -ForegroundColor White
Write-Host ""
Write-Host " Camera page > 'YouTube Live' > ye code paste > Live shuru" -ForegroundColor Green
Write-Host "=============================================================" -ForegroundColor Green
Write-Host "Ye window band karne se live band ho jayega."
Write-Host ""
try {
    node (Join-Path $here 'server.js')
} finally {
    Stop-Process -Id $tunnel.Id -ErrorAction SilentlyContinue
}
