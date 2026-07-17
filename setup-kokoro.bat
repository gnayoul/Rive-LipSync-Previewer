@echo off
cd /d "%~dp0"
echo ========================================
echo  Kokoro TTS - First Time Setup
echo ========================================
echo.
echo Kokoro needs Python 3.10 / 3.11 / 3.12
echo (Python 3.13+ will NOT work)
echo.

set "PYEXE="

where py >nul 2>&1
if not errorlevel 1 (
  py -3.12 -c "import sys; print(sys.version)" >nul 2>&1
  if not errorlevel 1 set "PYEXE=py -3.12"
  if not defined PYEXE (
    py -3.11 -c "import sys; print(sys.version)" >nul 2>&1
    if not errorlevel 1 set "PYEXE=py -3.11"
  )
  if not defined PYEXE (
    py -3.10 -c "import sys; print(sys.version)" >nul 2>&1
    if not errorlevel 1 set "PYEXE=py -3.10"
  )
)

if not defined PYEXE (
  where python >nul 2>&1
  if not errorlevel 1 (
    for /f "delims=" %%v in ('python -c "import sys; print(f'{sys.version_info[0]}.{sys.version_info[1]}')"') do set "PYVER=%%v"
  )
)

if not defined PYEXE (
  if "%PYVER%"=="3.12" set "PYEXE=python"
  if "%PYVER%"=="3.11" set "PYEXE=python"
  if "%PYVER%"=="3.10" set "PYEXE=python"
)

if not defined PYEXE (
  echo [ERROR] Compatible Python not found.
  echo.
  echo Please install Python 3.12 from:
  echo   https://www.python.org/downloads/release/python-31210/
  echo Download: Windows installer ^(64-bit^)
  echo IMPORTANT: check "Add python.exe to PATH"
  echo.
  echo After install, CLOSE this window, open a new one,
  echo then run setup-kokoro.bat again.
  pause
  exit /b 1
)

echo Using: %PYEXE%
%PYEXE% -c "import sys; print('Python', sys.version)"
echo.

echo [1/3] Recreating virtual environment with compatible Python...
if exist "kokoro_server\.venv" (
  rmdir /s /q "kokoro_server\.venv"
)
%PYEXE% -m venv kokoro_server\.venv
if errorlevel 1 (
  echo [ERROR] Failed to create venv.
  pause
  exit /b 1
)

echo [2/3] Installing dependencies (first time may take several minutes)...
call kokoro_server\.venv\Scripts\activate.bat
python -m pip install --upgrade pip
pip install -r kokoro_server\requirements.txt
if errorlevel 1 (
  echo [ERROR] pip install failed.
  pause
  exit /b 1
)

echo [3/3] Done.
echo.
echo Next steps:
echo   1. Double-click start-kokoro.bat
echo   2. Double-click start.bat
echo   3. Open http://localhost:3921
echo.
pause
