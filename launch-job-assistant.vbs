Set fso = CreateObject("Scripting.FileSystemObject")

Set sh = CreateObject("WScript.Shell")

root = fso.GetParentFolderName(WScript.ScriptFullName)

pyw = root & "\.venv\Scripts\pythonw.exe"
launcher = root & "\scripts\launcher.py"
exe = root & "\JobAssistant\JobAssistant.exe"

' Prefer the source launcher when this is a development checkout.
If fso.FileExists(pyw) And fso.FileExists(launcher) And fso.FolderExists(root & "\apps") Then

    sh.CurrentDirectory = root
    sh.Run Chr(34) & pyw & Chr(34) & " " & Chr(34) & launcher & Chr(34), 1, False
    WScript.Quit 0
End If

If fso.FileExists(exe) Then
    sh.CurrentDirectory = root & "\JobAssistant"
    sh.Run Chr(34) & exe & Chr(34), 1, False
    WScript.Quit 0
End If

If fso.FileExists(pyw) And fso.FileExists(launcher) Then
    sh.CurrentDirectory = root
    sh.Run Chr(34) & pyw & Chr(34) & " " & Chr(34) & launcher & Chr(34), 1, False
    WScript.Quit 0
End If

WScript.Quit 1

