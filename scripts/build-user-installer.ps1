# Build user installer (local app + extension only, no cloud admin / dev files)
param(
    [string]$CloudApiUrl = "",
    [switch]$SkipLauncher
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

function Resolve-CloudUrl {
    param([string]$Override)
    & (Join-Path $PSScriptRoot "resolve-cloud-url.ps1") -Override $Override
}

function Remove-DirSafe([string]$Path) {
    if (Test-Path $Path) { Remove-Item $Path -Recurse -Force -ErrorAction SilentlyContinue }
}

function Copy-ApiApp([string]$DestApi) {
    New-Item -ItemType Directory -Path $DestApi -Force | Out-Null
    $srcApp = Join-Path $Root "apps\api\app"
    $dstApp = Join-Path $DestApi "app"
    & robocopy $srcApp $dstApp /E /NFL /NDL /NJH /NJS /nc /ns /np /XD __pycache__ .pytest_cache | Out-Null
    Copy-Item (Join-Path $Root "apps\api\requirements.txt") (Join-Path $DestApi "requirements.txt") -Force
}

function Get-IsccPath {
    foreach ($p in @(
        "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
        "${env:ProgramFiles}\Inno Setup 6\ISCC.exe"
    )) {
        if (Test-Path $p) { return $p }
    }
    return $null
}

function Ensure-InnoSetup {
    $iscc = Get-IsccPath
    if ($iscc) { return $iscc }

    Write-Host "  Downloading Inno Setup 6 (one-time, for building Setup.exe)..." -ForegroundColor Yellow
    $installer = Join-Path $env:TEMP "innosetup-6-install.exe"
    try {
        Invoke-WebRequest -Uri "https://jrsoftware.org/download.php/is.exe" -OutFile $installer -UseBasicParsing
    } catch {
        throw "Cannot download Inno Setup. Install manually from https://jrsoftware.org/isinfo.php then rebuild."
    }
    $proc = Start-Process -FilePath $installer -ArgumentList "/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART", "/SP-" -Wait -PassThru
    if ($proc.ExitCode -ne 0) {
        throw "Inno Setup install failed (exit $($proc.ExitCode))"
    }
    $iscc = Get-IsccPath
    if (-not $iscc) { throw "Inno Setup installed but ISCC.exe not found" }
    return $iscc
}

$CloudUrl = Resolve-CloudUrl -Override $CloudApiUrl
$Staging = Join-Path $Root "dist\user-installer-staging"
$OutExe = Join-Path $Root "dist\JobAssistant-Setup.exe"

Write-Host "=== Build user installer ===" -ForegroundColor Cyan
Write-Host "Cloud API: $CloudUrl" -ForegroundColor Gray

$devPy = Join-Path $Root ".venv\Scripts\python.exe"
if (-not (Test-Path $devPy)) {
    Write-Host "Initializing dev environment..." -ForegroundColor Yellow
    & (Join-Path $Root "scripts\install.ps1")
    if ($LASTEXITCODE -ne 0) { exit 1 }
}

$prodFile = Join-Path $Root "apps\web\.env.production"
"VITE_CLOUD_API_URL=$CloudUrl" | Set-Content -Path $prodFile -Encoding UTF8

Write-Host "[1/6] Build web..."
Set-Location (Join-Path $Root "apps\web")
npm run build
if ($LASTEXITCODE -ne 0) { exit 1 }

Write-Host "[2/6] Build extension..."
Set-Location (Join-Path $Root "apps\extension")
npm run build
if ($LASTEXITCODE -ne 0) { exit 1 }
Set-Location $Root

if (-not $SkipLauncher) {
    Write-Host "[3/6] Build launcher..."
    & (Join-Path $Root "scripts\build-launcher.ps1")
    if ($LASTEXITCODE -ne 0) { exit 1 }
} else {
    Write-Host "[3/6] Skip launcher (-SkipLauncher)" -ForegroundColor Yellow
}

Write-Host "[4/6] Stage installer files..."
Remove-DirSafe $Staging
New-Item -ItemType Directory -Path (Join-Path $Staging "data\resumes") -Force | Out-Null

Copy-ApiApp (Join-Path $Staging "api")
Copy-Item -Recurse (Join-Path $Root "apps\web\dist") (Join-Path $Staging "web") -Force
Copy-Item -Recurse (Join-Path $Root "apps\extension\dist") (Join-Path $Staging "extension") -Force
Copy-Item -Recurse (Join-Path $Root "JobAssistant") (Join-Path $Staging "JobAssistant") -Force

Write-Host "  Prepare Python runtime..."
$runtimeDir = Join-Path $Staging "runtime"
$reqFile = Join-Path $Staging "api\requirements.txt"
$reqHash = (Get-FileHash $reqFile -Algorithm SHA256).Hash
$repairHash = (Get-FileHash (Join-Path $PSScriptRoot "repair-portable-runtime.ps1") -Algorithm SHA256).Hash
$cacheRoot = Join-Path $Root "dist\cached-user-runtime"
$cacheMarker = Join-Path $cacheRoot ".requirements-hash"
$cacheKey = "$reqHash`n$repairHash"

if ((Test-Path $cacheRoot) -and (Test-Path $cacheMarker) -and ((Get-Content $cacheMarker -Raw).Trim() -eq $cacheKey)) {
    Write-Host "  Reuse cached runtime (skip pip install)..." -ForegroundColor Green
    Copy-Item -Recurse $cacheRoot $runtimeDir -Force
} else {
    Write-Host "  Create venv + install deps (about 5-15 min, will show pip output)..." -ForegroundColor Yellow
    Remove-DirSafe $runtimeDir
    & $devPy -m venv $runtimeDir
    if ($LASTEXITCODE -ne 0) { exit 1 }
    $stagePy = Join-Path $runtimeDir "Scripts\python.exe"
    $stagePip = Join-Path $runtimeDir "Scripts\pip.exe"
    & $stagePy -m pip install --upgrade pip
    if ($LASTEXITCODE -ne 0) { exit 1 }
    & $stagePip install --no-cache-dir -r $reqFile
    if ($LASTEXITCODE -ne 0) { exit 1 }
    Remove-DirSafe $cacheRoot
    Copy-Item -Recurse $runtimeDir $cacheRoot -Force
    Set-Content -Path $cacheMarker -Value $cacheKey -Encoding UTF8
    Write-Host "  Runtime cached for next build." -ForegroundColor Green
}

Write-Host "  Make runtime portable (bundle base-python)..."
& (Join-Path $PSScriptRoot "repair-portable-runtime.ps1") -RuntimeDir $runtimeDir -DevPy $devPy
if ($LASTEXITCODE -ne 0) { exit 1 }

Write-Host "  Prune runtime for end users..."
& (Join-Path $PSScriptRoot "prune-user-runtime.ps1") -RuntimeDir $runtimeDir
if ($LASTEXITCODE -ne 0) { exit 1 }

# Refresh cache so next build also ships portable runtime
if (Test-Path $cacheRoot) { Remove-Item $cacheRoot -Recurse -Force }
Copy-Item -Recurse $runtimeDir $cacheRoot -Force
Set-Content -Path $cacheMarker -Value $cacheKey -Encoding UTF8

$template = Get-Content (Join-Path $Root "scripts\templates\user.env.template") -Raw -Encoding UTF8
$template.Replace("{{CLOUD_API_URL}}", $CloudUrl) | Set-Content (Join-Path $Staging ".env.example") -Encoding UTF8
Copy-Item (Join-Path $Staging ".env.example") (Join-Path $Staging ".env") -Force

$readme = Join-Path $Root "scripts\installer-user-readme.txt"
if (Test-Path $readme) {
    Copy-Item $readme (Join-Path $Staging "使用说明.txt") -Force
}
Copy-Item (Join-Path $Root "scripts\diagnose-user-install.bat") (Join-Path $Staging "诊断启动问题.bat") -Force
Copy-Item (Join-Path $Root "scripts\repair-installed-runtime.bat") (Join-Path $Staging "修复运行环境.bat") -Force

Write-Host "[5/6] Compile Setup.exe (compressing ~40MB, about 1 min)..."
$Iscc = Ensure-InnoSetup
& $Iscc (Join-Path $Root "scripts\job-assistant-user.iss")
if ($LASTEXITCODE -ne 0) { exit 1 }
if (-not (Test-Path $OutExe)) {
    Write-Host "Setup.exe not found at $OutExe" -ForegroundColor Red
    exit 1
}
$sizeMb = [math]::Round((Get-Item $OutExe).Length / 1MB, 1)
Write-Host "  Created: $OutExe ($sizeMb MB)" -ForegroundColor Green

Write-Host ""
Write-Host "=== Done ===" -ForegroundColor Green
Write-Host "Give users this file only: $OutExe"
Write-Host "User flow: double-click -> choose folder -> Install -> done"
