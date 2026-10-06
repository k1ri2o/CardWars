@echo off
rem Double-click to install or update Card Wars 1v1.
set PS1=%~dp0Install-CardWars1v1.ps1
if not exist "%PS1%" (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest https://github.com/k1ri2o/CardWars/releases/download/1v1-latest/Install-CardWars1v1.ps1 -OutFile $env:TEMP\Install-CardWars1v1.ps1 -UseBasicParsing"
  set PS1=%TEMP%\Install-CardWars1v1.ps1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" %*
pause
