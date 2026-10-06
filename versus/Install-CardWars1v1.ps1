# Installs Card Wars with live 1v1 against a friend (Windows).
#
# Downloads the Windows release of Card Wars (shishkabob27/CardWars 1.12.8), swaps in the
# 1v1 build of the game's code, and adds a "Card Wars 1v1" shortcut to the desktop.
# Running it again updates the 1v1 code and keeps everything else.
#
#   powershell -ExecutionPolicy Bypass -File Install-CardWars1v1.ps1 [-Dir <folder>] [-Dll <Assembly-CSharp.dll>] [-NoLaunch]
param(
	[string]$Dir = (Join-Path $env:LOCALAPPDATA 'CardWars1v1'),
	[string]$Dll = '',
	[switch]$NoLaunch
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$GameZip = 'https://github.com/shishkabob27/CardWars/releases/download/1.12.8/CardWars-Windows.zip'
$DllUrl = 'https://github.com/k1ri2o/CardWars/releases/download/1v1-latest/Assembly-CSharp.dll'

New-Item -ItemType Directory -Force -Path $Dir | Out-Null
$exe = Join-Path $Dir 'CardWars\game\CardWars.exe'
$managed = Join-Path $Dir 'CardWars\game\CardWars_Data\Managed'
$target = Join-Path $managed 'Assembly-CSharp.dll'

if (-not (Test-Path $exe)) {
	$zip = Join-Path $env:TEMP 'CardWars-Windows.zip'
	Write-Host 'Downloading Card Wars (about 280 MB)...'
	Invoke-WebRequest -Uri $GameZip -OutFile $zip -UseBasicParsing
	Write-Host 'Unpacking...'
	Add-Type -AssemblyName System.IO.Compression.FileSystem
	[System.IO.Compression.ZipFile]::ExtractToDirectory($zip, $Dir)
	Remove-Item $zip
}

# Keep the original code once, outside the game's folders, so it can be put back.
$backup = Join-Path $Dir 'original\Assembly-CSharp.dll'
if (-not (Test-Path $backup)) {
	New-Item -ItemType Directory -Force -Path (Split-Path $backup) | Out-Null
	Copy-Item $target $backup
}

if ($Dll) {
	Copy-Item $Dll $target -Force
} else {
	Write-Host 'Downloading the 1v1 add-on...'
	$new = "$target.download"
	Invoke-WebRequest -Uri $DllUrl -OutFile $new -UseBasicParsing
	Move-Item $new $target -Force
}

$shell = New-Object -ComObject WScript.Shell
foreach ($folder in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) {
	$link = $shell.CreateShortcut((Join-Path $folder 'Card Wars 1v1.lnk'))
	$link.TargetPath = $exe
	$link.WorkingDirectory = Split-Path $exe
	$link.Save()
}

Write-Host ''
Write-Host 'Card Wars 1v1 is installed. Open it from the "Card Wars 1v1" shortcut on your desktop.'
Write-Host 'To play a friend: Battle > Deck Wars > Host a match, then send them the room code.'
if (-not $NoLaunch) {
	Start-Process -FilePath $exe -WorkingDirectory (Split-Path $exe)
}
