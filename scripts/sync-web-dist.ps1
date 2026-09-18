# Web dist is copied by build-user-installer.ps1 from apps/web/dist directly.
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Src = Join-Path $Root "apps\web\dist"

if (-not (Test-Path (Join-Path $Src "index.html"))) {
    Write-Host "未找到 apps\web\dist，请先执行: cd apps\web; npm run build" -ForegroundColor Red
    exit 1
}

Write-Host "Web dist ready: $Src" -ForegroundColor Green
Write-Host "User installer copies this folder during build-user-installer.ps1." -ForegroundColor Cyan
