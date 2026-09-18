param(

    [string]$Root,

    [string]$VbsPath

)

$ErrorActionPreference = "Stop"

if (-not $Root) {
    $Root = Split-Path -Parent $PSScriptRoot
}
if (-not $VbsPath) {
    $VbsPath = Join-Path $Root "launch-job-assistant.vbs"
}

$wsh = New-Object -ComObject WScript.Shell

$wscript = "$env:WINDIR\System32\wscript.exe"

$args = "//nologo `"$VbsPath`""



foreach ($name in @("launch-job-assistant.lnk", "启动求职助手.lnk")) {

    $lnkPath = Join-Path $Root $name

    $sc = $wsh.CreateShortcut($lnkPath)

    $sc.TargetPath = $wscript

    $sc.Arguments = $args

    $sc.WorkingDirectory = $Root

    $sc.Description = "Job Assistant"

    $sc.WindowStyle = 7

    $sc.Save()

    Write-Host "Created: $lnkPath"

}

