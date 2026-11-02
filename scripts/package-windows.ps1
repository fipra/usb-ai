$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Push-Location $root
try {
  cargo build --release --locked
  if ($LASTEXITCODE -ne 0) { throw 'Rust build failed' }
  $llama = (Get-Command llama-cli.exe -ErrorAction Stop).Source
  $llamaServer = (Get-Command llama-server.exe -ErrorAction Stop).Source
  $llamaQuantize = (Get-Command llama-quantize.exe -ErrorAction Stop).Source
  $pdf = (Get-Command pdftotext.exe -ErrorAction Stop).Source
  $out = Join-Path $root 'release\USB-AI-Rust-Windows-x64'
  $bin = Join-Path $out 'bin'
  $gpuRuntime = $env:USB_AI_VULKAN_RUNTIME_DIR
  $data = Join-Path $out 'PocketAI-data'
  foreach ($obsolete in @('Avvia USB AI Rust.cmd','Avvia Offllama.cmd','Avvia USB AI Rust GPU.cmd','Avvia Offllama GPU.cmd','Installa Fine Tuning GPU.cmd','Installa Fine Tuning GPU.ps1')) {
    Remove-Item (Join-Path $out $obsolete) -Force -ErrorAction SilentlyContinue
  }
  if (Test-Path $bin) { Remove-Item $bin -Recurse -Force }
  New-Item $bin -ItemType Directory -Force | Out-Null
  New-Item (Join-Path $out 'models') -ItemType Directory -Force | Out-Null
  New-Item $data -ItemType Directory -Force | Out-Null
  $workspaceFile = Join-Path $data 'workspace.json'
  if (-not (Test-Path $workspaceFile)) {
    $workspace = @{ chats = @(); documents = @() }
    [System.IO.File]::WriteAllText($workspaceFile, ($workspace | ConvertTo-Json -Depth 100), (New-Object System.Text.UTF8Encoding($false)))
  }
  Copy-Item (Join-Path $root 'target\release\usb-ai-rust.exe') $bin
  Copy-Item $llama $bin
  Copy-Item $llamaServer $bin
  Copy-Item $llamaQuantize $bin
  Copy-Item $pdf $bin
  foreach ($toolDir in @((Split-Path $llama), (Split-Path $llamaServer), (Split-Path $llamaQuantize), (Split-Path $pdf)) | Select-Object -Unique) {
    Get-ChildItem $toolDir -Filter '*.dll' | Copy-Item -Destination $bin -Force
  }
  if ($gpuRuntime) {
    $gpuServer = Join-Path $gpuRuntime 'llama-server.exe'
    $vulkanBackend = Join-Path $gpuRuntime 'ggml-vulkan.dll'
    if (!(Test-Path $gpuServer) -or !(Test-Path $vulkanBackend)) {
      throw 'Vulkan runtime is missing llama-server.exe or ggml-vulkan.dll'
    }
    $gpuBin = Join-Path $bin 'gpu'
    New-Item $gpuBin -ItemType Directory -Force | Out-Null
    Copy-Item $gpuServer $gpuBin
    Get-ChildItem $gpuRuntime -Filter '*.dll' -File | Copy-Item -Destination $gpuBin -Force
    $openMpLicense = Join-Path $gpuRuntime 'LICENSE-LLVM-OpenMP'
    if (Test-Path $openMpLicense) { Copy-Item $openMpLicense $gpuBin }
  }
  Get-ChildItem (Join-Path $root 'models') -Filter '*.gguf' | ForEach-Object {
    $destination = Join-Path (Join-Path $out 'models') $_.Name
    if (-not (Test-Path $destination)) { Copy-Item $_.FullName $destination }
  }
  foreach ($name in @('QWEN-LICENSE.txt','LLAMA-3.2-LICENSE.txt','LLAMA-3.2-NOTICE.txt','catalog.json')) {
    $file = Join-Path (Join-Path $root 'models') $name
    if (Test-Path $file) { Copy-Item $file (Join-Path $out 'models') }
  }
  Copy-Item 'web\vendor\KATEX-LICENSE.txt' $out
  foreach ($name in @('LICENSE','LICENSE-MIT-LEGACY','COMMERCIAL_LICENSE.md','LICENSING_HISTORY.md','MODEL_CREATOR.md')) {
    Copy-Item (Join-Path $root $name) (Join-Path $out $name)
  }
  @'
@echo off
setlocal
set "GPU_SERVER=%~dp0bin\gpu\llama-server.exe"
if exist "%GPU_SERVER%" (
  "%GPU_SERVER%" --list-devices 2>nul | findstr /C:"Vulkan" >nul
  if not errorlevel 1 (
    set "LLAMA_SERVER=%GPU_SERVER%"
    set "USB_AI_GPU=1"
    echo Vulkan GPU detected. Starting with GPU acceleration.
  )
)
"%~dp0bin\usb-ai-rust.exe"
'@ | Set-Content (Join-Path $out 'Avvia LlamaNest.cmd')
  @'
@echo off
setlocal
set "USB_AI_BIND_ADDR=0.0.0.0"
call "%~dp0Avvia LlamaNest.cmd"
'@ | Set-Content (Join-Path $out 'Avvia LlamaNest LAN.cmd')
  @'
@echo off
setlocal
set "GPU_SERVER=%~dp0bin\gpu\llama-server.exe"
if not exist "%GPU_SERVER%" (
  echo Vulkan GPU runtime is missing from bin\gpu.
  pause
  exit /b 1
)
"%GPU_SERVER%" --list-devices 2>nul | findstr /C:"Vulkan" >nul
if errorlevel 1 (
  echo No compatible Vulkan GPU was detected. Use Avvia LlamaNest.cmd for automatic CPU fallback.
  pause
  exit /b 1
)
set "LLAMA_SERVER=%GPU_SERVER%"
set "USB_AI_GPU=1"
set "USB_AI_REQUIRE_GPU=1"
echo Starting LlamaNest with Vulkan GPU acceleration.
"%~dp0bin\usb-ai-rust.exe"
'@ | Set-Content (Join-Path $out 'Avvia LlamaNest GPU.cmd')
  @'
@echo off
setlocal
set "USB_AI_BIND_ADDR=0.0.0.0"
call "%~dp0Avvia LlamaNest GPU.cmd"
'@ | Set-Content (Join-Path $out 'Avvia LlamaNest LAN GPU.cmd')
  @'
Double-click Avvia LlamaNest.cmd. The browser opens at 127.0.0.1.
The launcher uses a Vulkan GPU when one is detected, otherwise the CPU.
For an explicit GPU start, use Avvia LlamaNest GPU.cmd. It reports an error if Vulkan is unavailable.
To open LlamaNest from another computer, use Avvia LlamaNest LAN.cmd.
For LAN with an explicit Vulkan GPU, use Avvia LlamaNest LAN GPU.cmd.
Then visit http://SERVER-NAME:48157/ or http://SERVER-IP:48157/ from that computer; use the port printed by the app if 48157 is busy.
LAN mode has no login and uses HTTP. Allow inbound TCP 48157-48167 on the Windows firewall only for trusted networks.
Keep the whole folder on the USB drive. Models and data stay here.
Use Models > Import GGUF into models to copy an existing model, or copy GGUF files into the models folder and refresh the list.
New downloads and imported models are stored in this models folder; PocketAI-data contains chats and older downloads.
Build this package on a Windows x64 computer with Rust, llama-server, llama-cli, llama-quantize and pdftotext.
'@ | Set-Content (Join-Path $out 'README.txt')
  Write-Host "Portable folder ready: $out"
} finally { Pop-Location }
