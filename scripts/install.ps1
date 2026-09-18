# 一键安装依赖
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "=== Job Assistant - Install ===" -ForegroundColor Cyan

$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

function Install-NpmDeps($Dir) {
    Write-Host "Installing: $Dir"
    Set-Location $Dir

    # 清理 pnpm 残留，避免与 npm 冲突
    if (Test-Path "node_modules") { Remove-Item -Recurse -Force "node_modules" }
    if (Test-Path "pnpm-lock.yaml") { Remove-Item -Force "pnpm-lock.yaml" }
    if (Test-Path ".npmrc") { Remove-Item -Force ".npmrc" }

    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "FAILED: $Dir" -ForegroundColor Red
        exit 1
    }
    Set-Location $Root
}

# Python
if (-not (Test-Path "$Root\.venv")) {
    Write-Host "Creating Python venv..."
    python -m venv .venv
}
& "$Root\.venv\Scripts\pip.exe" install -r apps\api\requirements.txt
if ($LASTEXITCODE -ne 0) { exit 1 }
& "$Root\.venv\Scripts\pip.exe" install -r scripts\requirements-launcher.txt -q

Install-NpmDeps "$Root\apps\web"
Install-NpmDeps "$Root\apps\extension"

python scripts\generate_icons.py

if (-not (Test-Path "$Root\.env")) {
    Copy-Item "$Root\.env.example" "$Root\.env"
    Write-Host "Created .env - please set LICENSE_ADMIN_SECRET and LLM_API_KEY" -ForegroundColor Yellow
}

Write-Host "=== Install complete ===" -ForegroundColor Green
Write-Host "推荐: 运行 scripts\build-launcher.ps1 生成 JobAssistant 文件夹，以后双击 启动求职助手.bat"
Write-Host "或: .\scripts\start.ps1 / 双击 启动求职助手.bat"
