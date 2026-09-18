@echo off
chcp 65001 >nul
title 求职助手 - 打包用户安装包
cd /d "%~dp0.."

echo.
echo  ========================================
echo    求职助手 - 打包用户安装包
echo  ========================================
echo.
echo  产物: dist\JobAssistant-Setup.exe
echo  全程约 5-20 分钟，请勿关闭本窗口
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-user-installer.ps1" %*
set "ERR=%ERRORLEVEL%"

echo.
if %ERR% neq 0 (
    echo [失败] 打包出错，退出码 %ERR%
) else (
    echo [完成] 请查看 dist\JobAssistant-Setup.exe
)
echo.
pause
exit /b %ERR%
