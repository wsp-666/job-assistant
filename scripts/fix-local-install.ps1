# One-time fix: copy base-python into installed app and rewrite pyvenv.cfg
param(
    [string]$AppDir = ""
)

$Root = Split-Path -Parent $PSScriptRoot
if (-not $AppDir) {
    $programs = Join-Path $env:LOCALAPPDATA "Programs"
    $AppDir = Get-ChildItem -LiteralPath $programs -ErrorAction SilentlyContinue |
        Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName "JobAssistant\JobAssistant.exe") } |
        Select-Object -ExpandProperty FullName -First 1
}
$SrcBase = Join-Path $Root "dist\user-installer-staging\runtime\base-python"
$DstBase = Join-Path $AppDir "runtime\base-python"

if (-not (Test-Path (Join-Path $SrcBase "python.exe"))) {
    Write-Host "[X] staging base-python missing" -ForegroundColor Red
    exit 1
}
if (-not (Test-Path $AppDir)) {
    Write-Host "[X] install dir not found: $AppDir" -ForegroundColor Red
    exit 1
}

Write-Host "Fix install: $AppDir" -ForegroundColor Cyan
& robocopy $SrcBase $DstBase /MIR /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null

$cfg = Join-Path $AppDir "runtime\pyvenv.cfg"
$ver = "3.12.7"
if (Test-Path $cfg) {
    Get-Content $cfg -Encoding UTF8 | ForEach-Object {
        if ($_ -match '^\s*version\s*=\s*(.+)\s*$') { $ver = $Matches[1].Trim() }
    }
}
$text = "home = $DstBase`ninclude-system-site-packages = false`nversion = $ver`n"
[System.IO.File]::WriteAllText($cfg, $text)

$py = Join-Path $AppDir "runtime\Scripts\python.exe"
$out = & $py -c "import uvicorn; print('ok')" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "[X] verify failed: $out" -ForegroundColor Red
    exit 1
}

Write-Host "[OK] runtime fixed" -ForegroundColor Green
Get-Content $cfg
