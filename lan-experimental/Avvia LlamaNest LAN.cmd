@echo off
setlocal
cd /d "%~dp0"
where node.exe >nul 2>&1
if errorlevel 1 (
  echo Node.js 20 or newer is required to run this experimental LAN server.
  pause
  exit /b 1
)
set "LLAMANEST_MODELS_DIR=%~dp0..\models"
set "LLAMA_SERVER=%~dp0..\bin\prism\vulkan\llama-server.exe"
if not exist "%LLAMA_SERVER%" set "LLAMA_SERVER=%~dp0..\bin\prism\llama-server.exe"
if not exist "%LLAMA_SERVER%" set "LLAMA_SERVER=%~dp0..\bin\gpu\llama-server.exe"
if not exist "%LLAMA_SERVER%" set "LLAMA_SERVER=%~dp0..\bin\llama-server.exe"
if not exist "%LLAMA_SERVER%" (
  echo Extract this LAN folder inside your existing LlamaNest folder, next to bin and models.
  pause
  exit /b 1
)
node "%~dp0server.mjs"
pause
