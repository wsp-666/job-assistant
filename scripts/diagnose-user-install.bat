@echo off
chcp 65001 >nul
setlocal

rem 安装目录 = 本 bat 所在目录（与 api、runtime、JobAssistant 同级）
set "ROOT=%~dp0"
cd /d "%ROOT%"
echo ========================================
echo   求职助手 - 启动问题诊断
echo ========================================
echo 安装目录: %CD%
echo.

set "PY=%CD%\runtime\Scripts\python.exe"
set "LOG=%CD%\data\launcher-api.log"
set "DIAG=%CD%\data\launcher-diag.log"

if not exist "%PY%" (
    echo [X] 缺少 runtime\Scripts\python.exe
    echo     请重新运行 JobAssistant-Setup.exe 完整安装
    goto :end
) else (
    echo [OK] 找到 Python 运行环境
)

if not exist "%CD%\api\app\main.py" (
    echo [X] 缺少 api\app\main.py
    goto :end
) else (
    echo [OK] 找到 API 程序
)

if not exist "%CD%\web\index.html" (
    echo [X] 缺少 web\index.html
    goto :end
) else (
    echo [OK] 找到 Web 管理台
)

echo.
echo 正在预检 API 模块导入...
cd /d "%CD%\api"
"%PY%" -c "import app.main; print('import ok')" > "%DIAG%" 2>&1
if %ERRORLEVEL% neq 0 (
    echo [X] API 模块导入失败
    echo --- 错误信息 ---
    type "%DIAG%"
    goto :end
) else (
    echo [OK] API 模块导入成功
)

echo.
echo 正在测试 API 启动（约 15-30 秒）...
if not exist "%ROOT%data" mkdir "%ROOT%data"
start "" /B "%PY%" -m uvicorn app.main:app --host 127.0.0.1 --port 8012 > "%DIAG%" 2>&1
timeout /t 20 /nobreak >nul

powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:8012/health' -UseBasicParsing -TimeoutSec 5; Write-Host '[OK] API 测试通过:' $r.Content; exit 0 } catch { Write-Host '[X] API 无响应:' $_.Exception.Message; exit 1 }"
set "RC=%ERRORLEVEL%"

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8012" ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1

if %RC% neq 0 (
    echo --- 诊断日志末尾 ---
    powershell -NoProfile -Command "if (Test-Path '%DIAG%') { Get-Content -Path '%DIAG%' -Tail 25 }"
)

echo.
echo 若启动器仍失败，请把以下文件发给开发者：
if exist "%LOG%" echo   %LOG%
if exist "%DIAG%" echo   %DIAG%

:end
echo.
pause
