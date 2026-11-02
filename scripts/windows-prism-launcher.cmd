@echo off
setlocal
cd /d "%~dp0"
set "USB_AI_DIR=%~dp0"
set "POCKET_AI_HOME=%~dp0PocketAI-data"
if not defined USB_AI_BIND_ADDR set "USB_AI_BIND_ADDR=127.0.0.1"
set "USB_AI_GPU="
set "USB_AI_REQUIRE_GPU="
set "LLAMA_PRISM_SERVER=%~dp0bin\prism\llama-server.exe"
set "GPU_SERVER=%~dp0bin\prism\vulkan\llama-server.exe"
if "%LLAMANEST_PRISM_CPU%"=="1" goto start
if not exist "%GPU_SERVER%" goto start
"%GPU_SERVER%" --list-devices 2>nul | findstr /C:"Vulkan" >nul
if errorlevel 1 goto start
set "LLAMA_PRISM_SERVER=%GPU_SERVER%"
set "USB_AI_GPU=1"
:start
"%~dp0bin\usb-ai-rust.exe"
if errorlevel 1 pause
