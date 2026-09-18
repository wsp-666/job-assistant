# Build release package
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

Write-Host "=== Job Assistant - Build ===" -ForegroundColor Cyan

if (-not (Test-Path "$Root\.venv")) {
    & "$Root\scripts\install.ps1"
}

Write-Host "Building Web..."
Set-Location apps\web
npm run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Set-Location $Root

Write-Host "Building Extension..."
Set-Location apps\extension
npm run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Set-Location $Root

$ReleaseDir = "$Root\release"
if (Test-Path $ReleaseDir) { Remove-Item $ReleaseDir -Recurse -Force }
New-Item -ItemType Directory -Path $ReleaseDir | Out-Null
New-Item -ItemType Directory -Path "$ReleaseDir\extension" | Out-Null
New-Item -ItemType Directory -Path "$ReleaseDir\web" | Out-Null
New-Item -ItemType Directory -Path "$ReleaseDir\api" | Out-Null

Copy-Item -Recurse apps\extension\dist\* "$ReleaseDir\extension\"
Copy-Item -Recurse apps\web\dist\* "$ReleaseDir\web\"
Copy-Item -Recurse apps\api\app "$ReleaseDir\api\"
Copy-Item apps\api\requirements.txt "$ReleaseDir\api\"
Copy-Item .env.example "$ReleaseDir\"
Copy-Item .env.cloud.example "$ReleaseDir\" -ErrorAction SilentlyContinue
Copy-Item docs\RELEASE.md "$ReleaseDir\" -ErrorAction SilentlyContinue
Copy-Item scripts\run-release.ps1 "$ReleaseDir\"
$launcherDir = "$distDir\JobAssistant"
if (Test-Path $launcherDir) {
    if (Test-Path "$ReleaseDir\JobAssistant") { Remove-Item "$ReleaseDir\JobAssistant" -Recurse -Force }
    Copy-Item $launcherDir "$ReleaseDir\JobAssistant" -Recurse -Force
}
Copy-Item "$Root\启动求职助手.bat" "$ReleaseDir\" -ErrorAction SilentlyContinue

$ZipPath = "$ReleaseDir\job-assistant-extension.zip"
if (Test-Path $ZipPath) { Remove-Item $ZipPath }
Compress-Archive -Path "$ReleaseDir\extension\*" -DestinationPath $ZipPath

Write-Host ""
Write-Host "=== Build complete ===" -ForegroundColor Green
Write-Host "Release dir: $ReleaseDir"
Write-Host "Extension ZIP: $ZipPath"
Write-Host "Web static: $ReleaseDir\web"
Write-Host "Run release: cd release; .\启动求职助手.bat"
