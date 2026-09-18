Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
root = fso.GetParentFolderName(WScript.ScriptFullName)

exe = root & "\JobAssistant\JobAssistant.exe"
If fso.FileExists(exe) Then
    sh.CurrentDirectory = root & "\JobAssistant"
    sh.Run Chr(34) & exe & Chr(34), 1, False
    WScript.Quit 0
End If

MsgBox "未找到程序文件，请重新安装求职助手。", vbCritical, "求职助手"
WScript.Quit 1
