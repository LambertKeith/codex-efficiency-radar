@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install.ps1" %*
set "install_exit=%errorlevel%"
if not "%install_exit%"=="0" (
  echo.
  echo Installation failed. Review the message above.
  pause
  exit /b %install_exit%
)
echo.
echo Installation completed. This window will close shortly.
timeout /t 8 /nobreak >nul
