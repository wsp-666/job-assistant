@echo off
chcp 65001 >nul
setlocal

set "ROOT=%~dp0"
cd /d "%ROOT%"

echo ========================================
echo   求职助手 - 修复运行环境
echo ========================================
echo 安装目录: %CD%
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$rt = Join-Path '%CD%' 'runtime';" ^
  "$cfg = Join-Path $rt 'pyvenv.cfg';" ^
  "$base = Join-Path $rt 'base-python';" ^
  "if (-not (Test-Path (Join-Path $base 'python.exe'))) { Write-Host '[X] 缺少 runtime\base-python\python.exe，请重新安装'; exit 1 };" ^
  "$ver = '3.12.7';" ^
  "if (Test-Path $cfg) { Get-Content $cfg | ForEach-Object { if ($_ -match '^version\s*=\s*(.+)$') { $ver = $Matches[1].Trim() } } };" ^
  "$text = \"home = $base`ninclude-system-site-packages = false`nversion = $ver`n\";" ^
  "[System.IO.File]::WriteAllText($cfg, $text);" ^
  "$py = Join-Path $rt 'Scripts\python.exe';" ^
  "$out = & $py -c \"import uvicorn; print('ok')\" 2>&1;" ^
  "if ($LASTEXITCODE -ne 0) { Write-Host '[X] 验证失败:' $out; exit 1 };" ^
  "Write-Host '[OK] 运行环境已修复';"

if %ERRORLEVEL% neq 0 goto :end
echo 请重新双击启动「求职助手」。

:end
echo.
pause
