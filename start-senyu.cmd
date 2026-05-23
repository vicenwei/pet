@echo off
cd /d "%~dp0"
set "PNPM=%LOCALAPPDATA%\pnpm\bin\pnpm.CMD"

if not exist "%PNPM%" (
  echo pnpm was not found.
  echo Please install pnpm or run from an environment where pnpm is available.
  pause
  exit /b 1
)

call "%PNPM%" run dev
pause

