@echo off
rem Starts Card Wars on this computer so phones and PCs on the same Wi-Fi can
rem play each other, even without internet. Needs Node.js 18 or newer.
cd /d "%~dp0server"
where node >nul 2>nul
if errorlevel 1 (
  echo Card Wars needs Node.js 18 or newer: https://nodejs.org
  pause
  exit /b 1
)
if not exist node_modules call npm install --no-audit --no-fund
start "" cmd /c "timeout /t 2 >nul & start http://localhost:8080/"
node server.mjs
pause
