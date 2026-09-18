# One-shot: clean + cloud package + user installer
param(
    [string]$CloudApiUrl = "",
    [switch]$SkipLauncher,
    [switch]$SkipClean
)

$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

if (-not $SkipClean) {
    & (Join-Path $PSScriptRoot "clean-artifacts.ps1")
}

$url = & (Join-Path $PSScriptRoot "resolve-cloud-url.ps1") -Override $CloudApiUrl
Write-Host "Cloud URL: $url" -ForegroundColor Cyan

& (Join-Path $PSScriptRoot "build-cloud.ps1") -PublicBaseUrl $url
if ($LASTEXITCODE -ne 0) { exit 1 }

& (Join-Path $PSScriptRoot "build-user-installer.ps1") -CloudApiUrl $url @(
    if ($SkipLauncher) { "-SkipLauncher" }
)
if ($LASTEXITCODE -ne 0) { exit 1 }

Write-Host ""
Write-Host "=== All release builds done ===" -ForegroundColor Green
Write-Host "Cloud ZIP:  dist\cloud-release-*.zip"
Write-Host "User setup: dist\JobAssistant-Setup.exe"
