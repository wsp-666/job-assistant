# Make shipped runtime/venv work on machines without the builder's Python/Conda path.
param(
    [Parameter(Mandatory = $true)]
    [string]$RuntimeDir,
    [string]$DevPy = "",
    [string]$HomeOverride = ""
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$RuntimeDir = (Resolve-Path $RuntimeDir).Path
$stagePy = Join-Path $RuntimeDir "Scripts\python.exe"

if (-not $DevPy) {
    $Root = Split-Path -Parent $PSScriptRoot
    $DevPy = Join-Path $Root ".venv\Scripts\python.exe"
}
if (-not (Test-Path $DevPy)) {
    throw "Dev Python not found: $DevPy"
}

$basePrefix = (& $DevPy -c "import sys; print(sys.base_prefix)" 2>$null).Trim()
$pyVersion = (& $DevPy -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}')" 2>$null).Trim()
if (-not $basePrefix -or -not $pyVersion) {
    throw "Cannot read base Python info from $DevPy"
}

$baseHome = if ($HomeOverride) { $HomeOverride } else { Join-Path $RuntimeDir "base-python" }
if (Test-Path $baseHome) { Remove-Item $baseHome -Recurse -Force }
New-Item -ItemType Directory -Path $baseHome -Force | Out-Null

function Copy-IfExists([string]$Src, [string]$DstDir) {
    if (Test-Path $Src) {
        Copy-Item $Src $DstDir -Force
        return $true
    }
    return $false
}

foreach ($name in @("python.exe", "pythonw.exe", "python3.dll")) {
    Copy-IfExists (Join-Path $basePrefix $name) $baseHome | Out-Null
}
Get-ChildItem (Join-Path $basePrefix "python*.dll") -ErrorAction SilentlyContinue | ForEach-Object {
    Copy-Item $_.FullName $baseHome -Force
}
Get-ChildItem (Join-Path $basePrefix "vcruntime*.dll") -ErrorAction SilentlyContinue | ForEach-Object {
    Copy-Item $_.FullName $baseHome -Force
}
Get-ChildItem (Join-Path $basePrefix "zlib*.dll") -ErrorAction SilentlyContinue | ForEach-Object {
    Copy-Item $_.FullName $baseHome -Force
}
Get-ChildItem (Join-Path $basePrefix "api-ms-win-*.dll") -ErrorAction SilentlyContinue | ForEach-Object {
    Copy-Item $_.FullName $baseHome -Force
}

$dllsDir = Join-Path $basePrefix "DLLs"
if (Test-Path $dllsDir) {
    Copy-Item $dllsDir (Join-Path $baseHome "DLLs") -Recurse -Force
}

# Stdlib only — skip base site-packages (conda can be 2GB+).
$libDir = Join-Path $basePrefix "Lib"
$dstLib = Join-Path $baseHome "Lib"
if (Test-Path $libDir) {
    & robocopy $libDir $dstLib /E /NFL /NDL /NJH /NJS /nc /ns /np /XD site-packages | Out-Null
    foreach ($trim in @("idlelib", "test", "turtledemo", "tkinter", "ensurepip", "pydoc_data")) {
        $p = Join-Path $dstLib $trim
        if (Test-Path $p) { Remove-Item $p -Recurse -Force }
    }
    Get-ChildItem $dstLib -Recurse -Directory -Filter "__pycache__" -ErrorAction SilentlyContinue |
        Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
}

$zipName = "python$($pyVersion -replace '\.','').zip"
$zipPath = Join-Path $basePrefix $zipName
if (Test-Path $zipPath) {
    Copy-Item $zipPath $baseHome -Force
}

# Only copy DLLs Python actually needs — NOT entire conda Library\bin (MKL/Qt/grpc ~1GB+).
$requiredDllNames = @(
    "ffi-8.dll", "ffi-7.dll", "ffi.dll",
    "libexpat.dll", "expat.dll",
    "zlib.dll", "zlib-ng2.dll", "libzstd.dll", "zstd.dll",
    "libssl-3-x64.dll", "libcrypto-3-x64.dll",
    "sqlite3.dll",
    "bzip2.dll", "LIBBZ2.dll", "libbz2.dll",
    "liblzma.dll", "lzma.dll",
    "ucrtbase.dll"
)
$searchDirs = @(
    $basePrefix,
    (Join-Path $basePrefix "Library\bin"),
    (Join-Path $basePrefix "DLLs")
)
$copied = @{}
foreach ($dir in $searchDirs) {
    if (-not (Test-Path $dir)) { continue }
    foreach ($name in $requiredDllNames) {
        if ($copied.ContainsKey($name)) { continue }
        $src = Join-Path $dir $name
        if (Test-Path $src) {
            Copy-Item $src $baseHome -Force
            $copied[$name] = $true
        }
    }
}

if (-not (Test-Path (Join-Path $baseHome "python.exe"))) {
    throw "Failed to bundle base-python/python.exe from $basePrefix"
}
if (-not (Test-Path (Join-Path $baseHome "Lib\encodings"))) {
    throw "Failed to bundle stdlib (Lib\encodings) from $basePrefix"
}

$cfgLines = @(
    "home = $baseHome"
    "include-system-site-packages = false"
    "version = $pyVersion"
)
$cfgPath = Join-Path $RuntimeDir "pyvenv.cfg"
[System.IO.File]::WriteAllText($cfgPath, ($cfgLines -join "`n") + "`n")

$test = & $stagePy -c "import sys, encodings; print(sys.prefix); import uvicorn; print('ok')" 2>&1
if ($LASTEXITCODE -ne 0) {
    throw "Portable runtime verify failed: $test"
}

Write-Host "  Portable runtime OK: $RuntimeDir (base-python from $basePrefix)" -ForegroundColor Green
