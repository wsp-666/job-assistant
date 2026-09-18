# Build cloud server release (membership + /wsp only)
param(
    [string]$PublicBaseUrl = ""
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$BaseUrl = & (Join-Path $PSScriptRoot "resolve-cloud-url.ps1") -Override $PublicBaseUrl
$Out = Join-Path $Root "dist\cloud-release"
$hostSlug = ($BaseUrl -replace '[^\w\.\-]+', '_').Trim('_')
if (-not $hostSlug) { $hostSlug = "cloud" }

Write-Host "=== Build cloud release ===" -ForegroundColor Cyan
Write-Host "Public URL: $BaseUrl" -ForegroundColor Gray

if (-not (Test-Path (Join-Path $Root ".venv\Scripts\python.exe"))) {
    & (Join-Path $Root "scripts\install.ps1")
    if ($LASTEXITCODE -ne 0) { exit 1 }
}

$prodFile = Join-Path $Root "apps\web\.env.production"
if (Test-Path $prodFile) { Remove-Item $prodFile -Force }

Write-Host "[1/4] Build web (cloud)..."
Set-Location (Join-Path $Root "apps\web")
npm run build
if ($LASTEXITCODE -ne 0) { exit 1 }
Set-Location $Root

Write-Host "[2/4] Stage cloud files..."
if (Test-Path $Out) { Remove-Item $Out -Recurse -Force }
New-Item -ItemType Directory -Path (Join-Path $Out "api") -Force | Out-Null

$srcApp = Join-Path $Root "apps\api\app"
$dstApp = Join-Path $Out "api\app"
& robocopy $srcApp $dstApp /E /NFL /NDL /NJH /NJS /nc /ns /np /XD __pycache__ .pytest_cache | Out-Null
Copy-Item (Join-Path $Root "apps\api\requirements.txt") (Join-Path $Out "api\requirements.txt") -Force
Copy-Item -Recurse (Join-Path $Root "apps\web\dist") (Join-Path $Out "web") -Force

Write-Host "[3/4] Write .env..."
$jwtPy = Join-Path $Root ".venv\Scripts\python.exe"
$jwt = & $jwtPy -c "import secrets; print(secrets.token_hex(32))"
$admin = & $jwtPy -c "import secrets; print(secrets.token_urlsafe(18))"

$envLines = @(
    "# Job Assistant cloud - $BaseUrl"
    "# Edit MYSQL_PASSWORD to match Baota database"
    "DEPLOYMENT_ROLE=cloud"
    "DB_BACKEND=mysql"
    "MYSQL_HOST=127.0.0.1"
    "MYSQL_PORT=3306"
    "MYSQL_USER=job_assistant"
    "MYSQL_PASSWORD=ChangeMe_In_Baota"
    "MYSQL_DATABASE=job_assistant"
    ""
    "PUBLIC_BASE_URL=$BaseUrl"
    "LOCAL_APP_URL=http://127.0.0.1:8000"
    ""
    "AUTH_ENABLED=true"
    "DEV_LOGIN_ENABLED=false"
    "JWT_SECRET=$jwt"
    "LICENSE_ADMIN_SECRET=$admin"
    ""
    "EMAIL_AUTH_ENABLED=true"
    "SMTP_HOST=smtp.qq.com"
    "SMTP_PORT=465"
    "SMTP_USER="
    "SMTP_PASSWORD="
    "SMTP_FROM="
    "SMTP_USE_SSL=true"
    ""
    "PAYMENT_MODE=personal_qr"
    "PAYMENT_MOCK=false"
    "PAYMENT_PERSONAL_QR=true"
    ""
    "WECHAT_OAUTH_ENABLED=false"
    "WECHAT_APP_ID="
    "WECHAT_APP_SECRET="
    ""
    "ALIPAY_OAUTH_ENABLED=false"
    "ALIPAY_APP_ID="
    "ALIPAY_PRIVATE_KEY="
    "ALIPAY_ALIPAY_PUBLIC_KEY="
    ""
    "API_HOST=127.0.0.1"
    "API_PORT=8000"
)
$envText = ($envLines -join "`n") + "`n"
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText((Join-Path $Out ".env"), $envText, $utf8NoBom)
[System.IO.File]::WriteAllText((Join-Path $Out ".env.example"), $envText, $utf8NoBom)

Copy-Item (Join-Path $Root "scripts\templates\cloud-deploy-readme.txt") (Join-Path $Out "DEPLOY-README.txt") -Force
Copy-Item (Join-Path $Root "docs\DEPLOY-XFTP-BAOTA.md") (Join-Path $Out "DEPLOY-GUIDE.md") -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path (Join-Path $Out "scripts") -Force | Out-Null
Copy-Item (Join-Path $Root "scripts\test-smtp.py") (Join-Path $Out "scripts\test-smtp.py") -Force

Write-Host "[4/4] Zip package..."
$zipPath = Join-Path $Root "dist\cloud-release-$hostSlug.zip"
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
Compress-Archive -Path (Join-Path $Out "*") -DestinationPath $zipPath -Force

Write-Host ""
Write-Host "=== Done ===" -ForegroundColor Green
Write-Host "Folder: $Out"
Write-Host "ZIP:    $zipPath"
Write-Host ""
Write-Host "LICENSE_ADMIN_SECRET is in $Out\.env"
Write-Host "Upload via Xftp to /www/wwwroot/job-assistant/"
