# Launch JobAssistant (local desktop app)
$Root = Split-Path -Parent $PSScriptRoot
$exe = "$Root\JobAssistant\JobAssistant.exe"
$bat = "$Root\启动求职助手.bat"
$pyw = "$Root\.venv\Scripts\pythonw.exe"
$launcher = "$Root\scripts\launcher.py"

# 开发目录优先使用源码启动器，避免旧打包程序遮住最新修复。
if ((Test-Path "$Root\apps") -and (Test-Path $pyw) -and (Test-Path $launcher)) {
    Start-Process $pyw -ArgumentList $launcher -WindowStyle Hidden
    exit 0
}
if (Test-Path $bat) {
    Start-Process $bat
    exit 0
}
if (Test-Path $exe) {
    Start-Process $exe
    exit 0
}
if ((Test-Path $pyw) -and (Test-Path $launcher)) {
    Start-Process $pyw -ArgumentList $launcher -WindowStyle Hidden
    exit 0
}

Write-Host "Run scripts\install.ps1 then scripts\build-launcher.ps1" -ForegroundColor Red
Read-Host "Press Enter"
exit 1
