@echo off
cd /d "%~dp0"
echo Starting Rive LipSync Previewer...
echo.
echo Remember: for Kokoro voice, also run start-kokoro.bat in another window.
echo.

for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3921 ^| findstr LISTENING') do (
  echo [info] Port 3921 is in use. Stopping old process PID %%a ...
  taskkill /PID %%a /F >nul 2>&1
)

echo Open http://localhost:3921 in your browser after server starts.
echo.
node server.mjs
pause
