@echo off
setlocal
cd /d "%~dp0"
if not exist "%~dp0bin\usb-ai-rust.exe" (
  echo ERROR: bin\usb-ai-rust.exe not found. Extract the entire ZIP before starting LlamaNest.
  if not defined LLAMANEST_TEST_NO_PAUSE pause
  exit /b 1
)
set "USB_AI_DIR=%~dp0"
set "POCKET_AI_HOME=%~dp0PocketAI-data"
if not defined USB_AI_BIND_ADDR set "USB_AI_BIND_ADDR=127.0.0.1"
set "USB_AI_GPU="
set "USB_AI_REQUIRE_GPU="
set "LLAMA_PRISM_SERVER=%~dp0bin\prism\llama-server.exe"
set "LLAMA_SERVER=%~dp0bin\standard\llama-server.exe"
set "GPU_SERVER=%~dp0bin\prism\vulkan\llama-server.exe"
if "%LLAMANEST_PRISM_CPU%"=="1" goto start
if not exist "%GPU_SERVER%" goto start
"%GPU_SERVER%" --list-devices 2>nul | findstr /C:"Vulkan" >nul
if errorlevel 1 goto start
set "LLAMA_PRISM_SERVER=%GPU_SERVER%"
if exist "%~dp0bin\standard\vulkan\llama-server.exe" set "LLAMA_SERVER=%~dp0bin\standard\vulkan\llama-server.exe"
set "USB_AI_GPU=1"
:start
echo Starting LlamaNest. Keep this window open while using the app.
echo Listening address: %USB_AI_BIND_ADDR%
"%~dp0bin\usb-ai-rust.exe"
set "LLAMANEST_EXIT_CODE=%ERRORLEVEL%"
echo LlamaNest stopped with exit code %LLAMANEST_EXIT_CODE%.
if not defined LLAMANEST_TEST_NO_PAUSE pause
exit /b %LLAMANEST_EXIT_CODE%
