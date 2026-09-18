# Remove stale build artifacts (safe: only dist/release/build cache)
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$Root = Split-Path -Parent $PSScriptRoot

$dirs = @(
    "dist\JobAssistant-Installer",
    "dist\installer-staging",
    "dist\JobAssistant-User-Setup",
    "dist\user-installer-staging",
    "dist\cloud-release",
    "dist\cached-user-runtime",
    "release",
    "build\launcher",
    "dist-launcher"
)

$files = @(
    "dist\JobAssistant-User-Setup.zip",
    "dist\JobAssistant-Setup.exe"
)

Write-Host "=== Clean build artifacts ===" -ForegroundColor Cyan

foreach ($rel in $dirs) {
    $p = Join-Path $Root $rel
    if (Test-Path $p) {
        Remove-Item $p -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "  removed $rel"
    }
}

Get-ChildItem (Join-Path $Root "dist") -Filter "cloud-release-*.zip" -ErrorAction SilentlyContinue | ForEach-Object {
    Remove-Item $_.FullName -Force
    Write-Host "  removed dist\$($_.Name)"
}

foreach ($rel in $files) {
    $p = Join-Path $Root $rel
    if (Test-Path $p) {
        Remove-Item $p -Force
        Write-Host "  removed $rel"
    }
}

Write-Host "=== Done ===" -ForegroundColor Green
