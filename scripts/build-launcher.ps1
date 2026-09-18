# Build JobAssistant.exe (onedir + runtime DLLs for conda Python)
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

if (-not (Test-Path "$Root\.venv")) {
    Write-Host "Run scripts\install.ps1 first" -ForegroundColor Red
    exit 1
}

$pip = "$Root\.venv\Scripts\pip.exe"
$pyi = "$Root\.venv\Scripts\pyinstaller.exe"
$py = "$Root\.venv\Scripts\python.exe"

Write-Host "=== Build JobAssistant.exe ===" -ForegroundColor Cyan
& $pip install -r "$Root\scripts\requirements-launcher.txt" -q
if ($LASTEXITCODE -ne 0) { exit 1 }

$buildDir = "$Root\build\launcher"
$distDir = "$Root\dist-launcher"
if (Test-Path $buildDir) { Remove-Item $buildDir -Recurse -Force }
if (Test-Path $distDir) { Remove-Item $distDir -Recurse -Force }

& $pyi `
    --noconfirm `
    --onedir `
    --windowed `
    --name "JobAssistant" `
    --collect-all tkinter `
    --distpath $distDir `
    --workpath $buildDir `
    --specpath $buildDir `
    "$Root\scripts\launcher.py"

if ($LASTEXITCODE -ne 0) { exit 1 }

$outDir = "$distDir\JobAssistant"
$exeSrc = "$outDir\JobAssistant.exe"

# Copy conda runtime DLLs required by _ctypes (PyInstaller often misses these)
$pyHome = & $py -c "import sys; print(sys.base_prefix)" 2>$null
if ($pyHome) {
    $dllDirs = @(
        "$pyHome\DLLs",
        "$pyHome\Library\bin",
        "$pyHome\bin"
    )
    $needed = @(
        "ffi.dll", "libffi-8.dll", "libexpat.dll", "LIBBZ2.dll", "liblzma.dll", "zlib.dll",
        "tcl86t.dll", "tk86t.dll", "tcl86.dll", "tk86.dll"
    )
    foreach ($dir in $dllDirs) {
        if (-not (Test-Path $dir)) { continue }
        foreach ($name in $needed) {
            $src = Join-Path $dir $name
            if (Test-Path $src) {
                Copy-Item $src $outDir -Force -ErrorAction SilentlyContinue
                Copy-Item $src "$outDir\_internal" -Force -ErrorAction SilentlyContinue
            }
        }
    }
}

# Ship folder (onedir). Do NOT copy lone exe to project root — it needs _internal/.
$shipDir = "$Root\JobAssistant"
Get-Process -Name "JobAssistant" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 1
if (Test-Path $shipDir) {
    Remove-Item $shipDir -Recurse -Force -ErrorAction SilentlyContinue
}
# robocopy mirrors even when Remove-Item fails (folder locked)
& robocopy $outDir $shipDir /MIR /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null

# Ensure Tcl/Tk + conda runtime DLLs land in shipped folder
if ($pyHome) {
    $dllDirs = @("$pyHome\DLLs", "$pyHome\Library\bin", "$pyHome\bin")
    $needed = @(
        "ffi.dll", "libffi-8.dll", "libexpat.dll", "LIBBZ2.dll", "liblzma.dll", "zlib.dll",
        "tcl86t.dll", "tk86t.dll"
    )
    foreach ($dir in $dllDirs) {
        if (-not (Test-Path $dir)) { continue }
        foreach ($name in $needed) {
            $src = Join-Path $dir $name
            if (Test-Path $src) {
                Copy-Item $src $shipDir -Force -ErrorAction SilentlyContinue
                Copy-Item $src "$shipDir\_internal" -Force -ErrorAction SilentlyContinue
            }
        }
    }
}

# Remove broken single-file exe from previous builds
Remove-Item "$Root\JobAssistant.exe" -Force -ErrorAction SilentlyContinue

# Root shortcuts (wscript + vbs, no console flash)
& powershell -NoProfile -ExecutionPolicy Bypass -File "$Root\scripts\create-launcher-shortcut.ps1" `
    -Root $Root -VbsPath "$Root\启动求职助手.vbs"

Write-Host ""
Write-Host "=== Done ===" -ForegroundColor Green
Write-Host "Exe: $shipDir\JobAssistant.exe"
