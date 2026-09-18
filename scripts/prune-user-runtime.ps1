# Remove dev-only files from shipped user runtime (safe for installed app)
param(
    [Parameter(Mandatory = $true)]
    [string]$RuntimeDir
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$RuntimeDir = (Resolve-Path $RuntimeDir).Path
$sp = Join-Path $RuntimeDir "Lib\site-packages"

foreach ($rel in @(
    "Scripts\pip.exe", "Scripts\pip3.exe", "Scripts\pip3.12.exe"
)) {
    Remove-Item (Join-Path $RuntimeDir $rel) -Force -ErrorAction SilentlyContinue
}

if (Test-Path $sp) {
    foreach ($name in @("pip", "setuptools", "wheel")) {
        Get-ChildItem $sp -Directory -Filter $name -ErrorAction SilentlyContinue |
            Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
    }
    Get-ChildItem $sp -Directory -Filter "*.dist-info" -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -match '^(pip|setuptools|wheel)-' } |
        Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
}

Get-ChildItem $RuntimeDir -Recurse -Directory -Filter "__pycache__" -ErrorAction SilentlyContinue |
    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "  Pruned user runtime (pip cache, __pycache__)" -ForegroundColor Green
