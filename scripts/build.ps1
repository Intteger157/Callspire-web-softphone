# Build the Callspire Web Softphone SPA (Windows / PowerShell).
# Usage (from repo root):  .\callspire-web-softphone\scripts\build.ps1
# The produced dist\ is copied to the gateway SOFTPHONE_STATIC_DIR.
$ErrorActionPreference = 'Stop'

$ScriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$SpaDir     = Resolve-Path "$ScriptDir\..\softphone-web"
$DistDir    = Join-Path $SpaDir "dist"

Write-Host "==> Installing dependencies …" -ForegroundColor Cyan
npm ci --prefix $SpaDir

Write-Host "==> Building SPA …" -ForegroundColor Cyan
npm run build --prefix $SpaDir

Write-Host "==> Verifying output …" -ForegroundColor Cyan
if (-not (Test-Path "$DistDir\index.html")) {
    Write-Error "dist\index.html not found! Build may have failed."
    exit 1
}

$html = Get-Content "$DistDir\index.html" -Raw
if ($html -notmatch 'src="/softphone/assets/') {
    Write-Error "index.html does not contain /softphone/ asset paths.`nCheck that vite.config.ts has base: '/softphone/'."
    exit 1
}

Write-Host "==> Build succeeded. Artifact: $DistDir" -ForegroundColor Green
Get-ChildItem -Recurse $DistDir | Measure-Object -Property Length -Sum |
    ForEach-Object { Write-Host "    Total size: $([math]::Round($_.Sum / 1KB, 1)) KB" }
