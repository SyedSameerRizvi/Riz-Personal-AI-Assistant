; Inno Setup script for the Riz installer. Built by .github/workflows/release.yml.
#ifndef AppVersion
  #define AppVersion "0.1.0"
#endif

[Setup]
AppId={{6B0D2C1E-5A7F-4C33-9E41-2B8D7A1F0C55}
AppName=Riz
AppVersion={#AppVersion}
AppPublisher=Syed Sameer Rizvi
DefaultDirName={localappdata}\Programs\Riz
DefaultGroupName=Riz
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputBaseFilename=Riz-Setup
SetupIconFile=riz.ico
UninstallDisplayIcon={app}\Riz.exe
Compression=lzma2
SolidCompression=yes
WizardStyle=modern

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Shortcuts:"

[Files]
Source: "..\dist\Riz\*"; DestDir: "{app}"; Flags: recursesubdirs ignoreversion

[Icons]
Name: "{userprograms}\Riz"; Filename: "{app}\Riz.exe"
Name: "{userdesktop}\Riz"; Filename: "{app}\Riz.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\Riz.exe"; Description: "Start Riz now"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
Type: files; Name: "{userstartup}\Riz.lnk"
