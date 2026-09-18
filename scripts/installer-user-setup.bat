@echo off
chcp 65001 >nul
title 求职助手 - 安装
setlocal

set "SRC=%~dp0"
set "TARGET=%LOCALAPPDATA%\JobAssistant"

echo.
echo  ========================================
echo    求职助手 - 安装程序
echo  ========================================
echo.
echo  安装位置: %TARGET%
echo  数据目录: %TARGET%\data （SQLite 自动创建，无需配置数据库）
echo.

if not exist "%TARGET%" mkdir "%TARGET%"

echo  [1/3] 复制程序文件...
xcopy /E /I /Y /Q "%SRC%api" "%TARGET%\api\" >nul
xcopy /E /I /Y /Q "%SRC%web" "%TARGET%\web\" >nul
xcopy /E /I /Y /Q "%SRC%extension" "%TARGET%\extension\" >nul
xcopy /E /I /Y /Q "%SRC%runtime" "%TARGET%\runtime\" >nul
xcopy /E /I /Y /Q "%SRC%JobAssistant" "%TARGET%\JobAssistant\" >nul
if not exist "%TARGET%\data" mkdir "%TARGET%\data"
if not exist "%TARGET%\data\resumes" mkdir "%TARGET%\data\resumes"

if exist "%SRC%.env" (
  copy /Y "%SRC%.env" "%TARGET%\.env" >nul
) else if exist "%SRC%.env.example" (
  if not exist "%TARGET%\.env" copy /Y "%SRC%.env.example" "%TARGET%\.env" >nul
)

echo  [2/3] 创建快捷方式...
powershell -NoProfile -Command ^
  "$d=[Environment]::GetFolderPath('Desktop')+'\求职助手.lnk';" ^
  "$s=(New-Object -ComObject WScript.Shell).CreateShortcut($d);" ^
  "$s.TargetPath='%TARGET%\JobAssistant\JobAssistant.exe';" ^
  "$s.WorkingDirectory='%TARGET%\JobAssistant';" ^
  "$s.Description='求职助手';" ^
  "$s.Save()"

echo  [3/3] 安装完成
echo.
echo  下一步:
echo    1. 双击桌面「求职助手」
echo    2. 点击「一键启动」-^>「打开应用」
echo    3. 登录并购买会员（走云端，已预配置）
echo    4. Edge 扩展: 加载 %TARGET%\extension 文件夹
echo.
choice /C YN /M "是否现在启动"
if errorlevel 2 goto :end
start "" "%TARGET%\JobAssistant\JobAssistant.exe"

:end
echo.
pause
