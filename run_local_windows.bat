@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Starting ZeroDrop Online local preview...
where node >nul 2>&1
if errorlevel 1 (
  echo Please install Node.js 20+ from https://nodejs.org/
  pause
  exit /b 1
)
start "" "http://localhost:3000"
node src\server.js
pause
