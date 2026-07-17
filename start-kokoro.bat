@echo off
cd /d "%~dp0"
echo Starting Kokoro TTS on http://127.0.0.1:3922 ...
echo Keep this window open.
echo.

if not exist "kokoro_server\.venv\Scripts\python.exe" (
  echo [ERROR] Kokoro environment not ready.
  echo Please run setup-kokoro.bat first.
  pause
  exit /b 1
)

for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3922 ^| findstr LISTENING') do (
  echo [info] Port 3922 is in use. Stopping old process PID %%a ...
  taskkill /PID %%a /F >nul 2>&1
)

call kokoro_server\.venv\Scripts\activate.bat
python kokoro_server\server.py
pause
