param(
  [string]$PdfToText = '',
  [switch]$Zip
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$tag = 'prism-b12128-d7b2896'
$cache = Join-Path $root "target\prism-runtime\$tag"

function Get-PrismRuntime([string]$backend, [string]$sha256) {
  $name = "llama-$tag-bin-win-$backend-x64.zip"
  $archive = Join-Path $cache $name
  if (!(Test-Path -LiteralPath $archive)) {
    & curl.exe --fail --location --retry 3 --output "$archive.partial" "https://github.com/PrismML-Eng/llama.cpp/releases/download/$tag/$name"
    if ($LASTEXITCODE -ne 0) { throw "Download failed: $name" }
    Move-Item -LiteralPath "$archive.partial" -Destination $archive -Force
  }
  if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $sha256) {
    throw "PrismML checksum mismatch: $archive"
  }
  $expanded = Join-Path $cache "$backend-$([guid]::NewGuid().ToString('N'))"
  Expand-Archive -LiteralPath $archive -DestinationPath $expanded
  $servers = @(Get-ChildItem $expanded -Filter llama-server.exe -Recurse -File)
  if ($servers.Count -ne 1) { throw "Expected one llama-server.exe in $name" }
  return $servers[0].DirectoryName
}

Push-Location $root
try {
  if (!$PdfToText) { $PdfToText = (Get-Command pdftotext.exe -ErrorAction Stop).Source }
  $PdfToText = (Resolve-Path -LiteralPath $PdfToText).Path
  & cargo build --release --locked
  if ($LASTEXITCODE -ne 0) { throw 'Rust build failed' }
  New-Item $cache -ItemType Directory -Force | Out-Null
  $cpu = Get-PrismRuntime 'cpu' 'a6e41db401ce93a28f4a2ed20fb7809455302231dd37037c9f1b4505d33fe00b'
  $gpu = Get-PrismRuntime 'vulkan' 'ec1479514a34272c815b3d194046d27003867aa9c95069d9cd3031b5c31e01ff'
  $prismLicense = Join-Path $cache 'LICENSE-PrismML-llama.cpp'
  & curl.exe --fail --location --retry 3 --output $prismLicense "https://raw.githubusercontent.com/PrismML-Eng/llama.cpp/$tag/LICENSE"
  if ($LASTEXITCODE -ne 0) { throw 'Could not download the PrismML runtime license' }
  # Never overwrite a portable installation, which may contain private data.
  $out = Join-Path $root 'release\LlamaNest-Prism-Bonsai-Windows-x64'
  if (Test-Path -LiteralPath $out) { throw "Output already exists; move it before packaging: $out" }
  $bin = Join-Path $out 'bin'
  $prism = Join-Path $bin 'prism'
  $vulkan = Join-Path $prism 'vulkan'
  foreach ($dir in @($bin, $prism, $vulkan, "$out\models", "$out\PocketAI-data", "$out\licenses")) {
    New-Item $dir -ItemType Directory -Force | Out-Null
  }
  Copy-Item 'target\release\usb-ai-rust.exe' $bin
  # Keep the two GGML runtimes isolated: their DLLs are not interchangeable.
  Copy-Item "$cpu\*" $prism -Recurse
  Copy-Item "$gpu\*" $vulkan -Recurse
  Copy-Item $PdfToText $bin
  Get-ChildItem (Split-Path $PdfToText) -Filter '*.dll' -File | Copy-Item -Destination $bin
  $popplerRoot = Split-Path (Split-Path $PdfToText)
  $popplerNotices = Join-Path $popplerRoot 'share'
  if (Test-Path $popplerNotices) {
    Copy-Item $popplerNotices "$out\licenses\poppler-share" -Recurse
  }
  Copy-Item 'models\prism-catalog.json' "$out\models\catalog.json"
  foreach ($name in @('LICENSE','LICENSE-MIT-LEGACY','COMMERCIAL_LICENSE.md','LICENSING_HISTORY.md')) {
    Copy-Item $name $out
  }
  # Preserve notices shipped anywhere in the runtime archives, including parent folders.
  Get-ChildItem $cache -Recurse -File | Where-Object { $_.Name -match 'LICENSE|COPYING|NOTICE' } | ForEach-Object {
    $relative = $_.FullName.Substring($cache.Length + 1).Replace('\', '_')
    Copy-Item $_.FullName (Join-Path "$out\licenses" $relative)
  }
  Set-Content "$out\PRISM_ONLY" -Value '' -Encoding ASCII
  Set-Content "$out\PocketAI-data\workspace.json" -Value '{"chats":[],"documents":[],"inference_engine":"prism"}' -Encoding ASCII
  Copy-Item 'scripts\windows-prism-launcher.cmd' "$out\Avvia LlamaNest Prism.cmd"
  @'
@echo off
setlocal
set "USB_AI_BIND_ADDR=0.0.0.0"
if not exist "%~dp0Avvia LlamaNest Prism.cmd" (
  echo ERROR: Avvia LlamaNest Prism.cmd not found. Extract the entire ZIP.
  if not defined LLAMANEST_TEST_NO_PAUSE pause
  exit /b 1
)
call "%~dp0Avvia LlamaNest Prism.cmd"
exit /b %ERRORLEVEL%
'@ | Set-Content "$out\Avvia LlamaNest Prism LAN.cmd" -Encoding ASCII
  @'
@echo off
setlocal
set "LLAMANEST_PRISM_CPU=1"
call "%~dp0Avvia LlamaNest Prism.cmd"
'@ | Set-Content "$out\Avvia LlamaNest Prism CPU.cmd" -Encoding ASCII
  Copy-Item 'scripts\PRISM_WINDOWS.txt' "$out\README.txt"
  Set-Content "$out\RUNTIME.txt" -Encoding ASCII -Value "PrismML: https://github.com/PrismML-Eng/llama.cpp/releases/tag/$tag"
  & "$prism\llama-server.exe" --version
  if ($LASTEXITCODE -ne 0) { throw 'Packaged CPU PrismML runtime cannot start' }
  & "$bin\pdftotext.exe" -v
  if ($LASTEXITCODE -ne 0) { throw 'Packaged pdftotext cannot start' }
  if ($Zip) {
    $archive = "$out.zip"
    if (Test-Path $archive) { throw "Archive already exists: $archive" }
    Compress-Archive -LiteralPath $out -DestinationPath $archive
  }
  Write-Host "Portable folder ready: $out"
} finally { Pop-Location }
