@echo off
cd /d "%~dp0"
set "PNPM=%LOCALAPPDATA%\pnpm\bin\pnpm.CMD"
set "CODEX_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin"

if exist "%CODEX_NODE%\node.exe" (
  set "PATH=%CODEX_NODE%;%PATH%"
)

if not exist "%PNPM%" (
  echo pnpm was not found.
  echo Please install pnpm or run from an environment where pnpm is available.
  pause
  exit /b 1
)

call "%PNPM%" run dev
pause
