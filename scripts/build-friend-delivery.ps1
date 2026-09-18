# Build a privacy-safe source delivery for a friend and their AI coding tool.
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$Root = Split-Path -Parent $PSScriptRoot
$DistRoot = [IO.Path]::GetFullPath((Join-Path $Root "dist"))
$DeliveryLabel = -join @(0x670B, 0x53CB, 0x4EA4, 0x4ED8, 0x7248 | ForEach-Object { [char]$_ })
$SourceLabel = -join @(0x6E90, 0x7801 | ForEach-Object { [char]$_ })
$DescriptionLabel = -join @(0x8BF4, 0x660E | ForEach-Object { [char]$_ })
$DeliveryDir = Join-Path $DistRoot $DeliveryLabel
$SourceDir = Join-Path $DeliveryDir $SourceLabel
$ZipPath = Join-Path $DistRoot "$DeliveryLabel.zip"
$Installer = Join-Path $DistRoot "JobAssistant-Setup.exe"

function Assert-UnderDist([string]$Path) {
    $full = [IO.Path]::GetFullPath($Path)
    $prefix = $DistRoot.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
    if (-not $full.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to modify a path outside dist: $full"
    }
}

function Remove-Artifact([string]$Path) {
    Assert-UnderDist $Path
    if (Test-Path -LiteralPath $Path) {
        Remove-Item -LiteralPath $Path -Recurse -Force
    }
}

function Copy-SourceDirectory([string]$RelativePath) {
    $source = Join-Path $Root $RelativePath
    $destination = Join-Path $SourceDir $RelativePath
    New-Item -ItemType Directory -Path $destination -Force | Out-Null
    & robocopy $source $destination /E /NFL /NDL /NJH /NJS /NC /NS /NP `
        /XD node_modules dist __pycache__ .pytest_cache .mypy_cache .ruff_cache `
        /XF .env .env.local .env.production "*.db" "*.db-journal" "*.sqlite" "*.sqlite3" "*.log" | Out-Null
    if ($LASTEXITCODE -gt 7) {
        throw "Failed to copy $RelativePath (robocopy exit $LASTEXITCODE)"
    }
}

if (-not (Test-Path -LiteralPath $Installer)) {
    throw "Installer not found. Run scripts\build-user-installer.ps1 first."
}

Write-Host "=== Build friend delivery ===" -ForegroundColor Cyan
Remove-Artifact $DeliveryDir
Remove-Artifact $ZipPath
New-Item -ItemType Directory -Path $SourceDir -Force | Out-Null

foreach ($directory in @("apps", "scripts", "docs", "deploy")) {
    Write-Host "Copy source: $directory"
    Copy-SourceDirectory $directory
}

foreach ($file in @(
    ".env.example",
    ".env.cloud.example",
    ".gitattributes",
    ".gitignore"
)) {
    $source = Join-Path $Root $file
    if (Test-Path -LiteralPath $source) {
        Copy-Item -LiteralPath $source -Destination (Join-Path $SourceDir $file) -Force
    }
}

Get-ChildItem -LiteralPath $Root -File |
    Where-Object { $_.Extension -in @(".md", ".bat", ".vbs") } |
    ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $SourceDir $_.Name) -Force }

New-Item -ItemType Directory -Path (Join-Path $SourceDir "data\resumes") -Force | Out-Null
Copy-Item -LiteralPath $Installer -Destination (Join-Path $DeliveryDir "JobAssistant-Setup.exe") -Force
$friendGuide = Join-Path $Root "$DeliveryLabel$DescriptionLabel.md"
Copy-Item -LiteralPath $friendGuide -Destination (Join-Path $DeliveryDir "README.md") -Force

$forbidden = @(
    Get-ChildItem -LiteralPath $SourceDir -Recurse -Force -ErrorAction SilentlyContinue |
        Where-Object {
            $_.Name -in @(".env", ".venv", "node_modules", ".git") -or
            $_.Extension -in @(".db", ".sqlite", ".sqlite3")
        }
)
if ($forbidden.Count -gt 0) {
    throw "Forbidden private or generated files were copied into the delivery."
}

$installerHash = (Get-FileHash -LiteralPath $Installer -Algorithm SHA256).Hash
Set-Content -LiteralPath (Join-Path $DeliveryDir "Installer-SHA256.txt") -Value $installerHash -Encoding ASCII

Write-Host "Compress delivery..."
Compress-Archive -Path (Join-Path $DeliveryDir "*") -DestinationPath $ZipPath -CompressionLevel Optimal

$zip = Get-Item -LiteralPath $ZipPath
Write-Host "=== Done ===" -ForegroundColor Green
Write-Host "Delivery: $($zip.FullName)"
Write-Host "Size: $([math]::Round($zip.Length / 1MB, 1)) MB"
