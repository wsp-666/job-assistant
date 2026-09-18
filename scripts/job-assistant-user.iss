; 求职助手 - 用户端一键安装包
#define MyAppName "求职助手"
#define MyAppVersion "1.1.1"
#define MyAppPublisher "Job Assistant"
#define MyAppExeName "JobAssistant.exe"

[Setup]
AppId={{B8C4D2E1-9F3A-4B6C-8D0E-2F3A4B5C6D7E}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
AllowNoIcons=yes
OutputDir=..\dist
OutputBaseFilename=JobAssistant-Setup
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayIcon={app}\JobAssistant\{#MyAppExeName}
SetupIconFile=compiler:SetupClassicIcon.ico
; 覆盖安装时强制替换 runtime（避免旧 pyvenv.cfg / 缺 base-python 残留）
CloseApplications=force

[InstallDelete]
Type: filesandordirs; Name: "{app}\runtime"

[Languages]
Name: "chinesesimp"; MessagesFile: "languages\ChineseSimplified.isl"

[Tasks]
Name: "desktopicon"; Description: "创建桌面快捷方式"; GroupDescription: "附加选项:"; Flags: checkedonce
Name: "launchapp"; Description: "安装完成后启动求职助手"; GroupDescription: "附加选项:"; Flags: checkedonce

[Files]
Source: "..\dist\user-installer-staging\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\JobAssistant\{#MyAppExeName}"; WorkingDir: "{app}\JobAssistant"
Name: "{group}\卸载 {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\JobAssistant\{#MyAppExeName}"; WorkingDir: "{app}\JobAssistant"; Tasks: desktopicon

[Run]
Filename: "{app}\JobAssistant\{#MyAppExeName}"; Description: "启动 {#MyAppName}"; Flags: nowait postinstall skipifsilent; Tasks: launchapp

[Code]
function InitializeSetup(): Boolean;
var
  AppDir: String;
begin
  Result := True;
  AppDir := ExpandConstant('{autopf}') + '\{#MyAppName}';
  if DirExists(AppDir) then
    MsgBox('检测到已有安装。' + #13#10 + #13#10 +
      '覆盖安装前请先关闭「求职助手」启动器窗口，否则运行环境可能更新失败。',
      mbInformation, MB_OK);
end;

function ReadPyVersion(const CfgPath: String): String;
var
  Lines: TArrayOfString;
  I: Integer;
begin
  Result := '3.12.7';
  if LoadStringsFromFile(CfgPath, Lines) then
    for I := 0 to GetArrayLength(Lines) - 1 do
      if Pos('version = ', Lines[I]) = 1 then
      begin
        Result := Trim(Copy(Lines[I], Length('version = ') + 1, MaxInt));
        Break;
      end;
end;

procedure RewritePortablePyvenvCfg;
var
  AppDir, BaseHome, BasePy, CfgPath, Ver, Content: String;
begin
  AppDir := ExpandConstant('{app}');
  BaseHome := AppDir + '\runtime\base-python';
  BasePy := BaseHome + '\python.exe';
  CfgPath := AppDir + '\runtime\pyvenv.cfg';
  if not FileExists(BasePy) then
  begin
    MsgBox('安装不完整：缺少 runtime\base-python\python.exe。' + #13#10 +
      '请关闭杀毒软件后重新运行安装包；若仍失败请联系开发者。',
      mbError, MB_OK);
    Exit;
  end;
  if FileExists(CfgPath) then
    Ver := ReadPyVersion(CfgPath)
  else
    Ver := '3.12.7';
  Content := 'home = ' + BaseHome + #13#10 +
    'include-system-site-packages = false' + #13#10 +
    'version = ' + Ver + #13#10;
  SaveStringToFile(CfgPath, Content, False);
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  EnvFile: String;
begin
  if CurStep = ssPostInstall then
  begin
    EnvFile := ExpandConstant('{app}\.env');
    if not FileExists(EnvFile) then
      CopyFile(ExpandConstant('{app}\.env.example'), EnvFile, False);
    RewritePortablePyvenvCfg;
  end;
end;
