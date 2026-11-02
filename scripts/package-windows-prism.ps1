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
  # The standard llama.cpp runtime is kept separate from Prism's DLLs.
  $llamaTag = 'b11836'
  foreach ($runtime in @(@{Kind='cpu'; Hash='4da5a55754e47bb062fd4bb31ce654776f1e25901ff77bad6485a0df5e6be2cc'}, @{Kind='vulkan'; Hash='cd79abc3f25bce0086918d43f7b5562dc760d9809429f1a9037941185bc7cdf4'})) {
    $archive = Join-Path $cache "llama-$llamaTag-bin-win-$($runtime.Kind)-x64.zip"
    if (!(Test-Path $archive)) {
      & curl.exe --fail --location --retry 3 --output "$archive.partial" "https://github.com/ggml-org/llama.cpp/releases/download/$llamaTag/llama-$llamaTag-bin-win-$($runtime.Kind)-x64.zip"
      if ($LASTEXITCODE -ne 0) { throw "llama.cpp download failed: $($runtime.Kind)" }
      Move-Item "$archive.partial" $archive -Force
    }
    if ((Get-FileHash $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $runtime.Hash) { throw 'llama.cpp archive checksum mismatch' }
    $expanded = Join-Path $cache "standard-$($runtime.Kind)-$([guid]::NewGuid().ToString('N'))"
    Expand-Archive $archive $expanded
    $server = @(Get-ChildItem $expanded -Filter llama-server.exe -Recurse -File)
    if ($server.Count -ne 1) { throw 'Expected exactly one standard llama-server.exe' }
    if ($runtime.Kind -eq 'cpu') { $standardCpu = $server[0].DirectoryName } else { $standardGpu = $server[0].DirectoryName }
  }
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
  $standard = Join-Path $bin 'standard'
  $standardVulkan = Join-Path $standard 'vulkan'
  New-Item $standard,$standardVulkan -ItemType Directory -Force | Out-Null
  Copy-Item "$standardCpu\*" $standard -Recurse
  Copy-Item "$standardGpu\*" $standardVulkan -Recurse
  Copy-Item $PdfToText $bin
  Get-ChildItem (Split-Path $PdfToText) -Filter '*.dll' -File | Copy-Item -Destination $bin
  $popplerRoot = Split-Path (Split-Path $PdfToText)
  $popplerNotices = Join-Path $popplerRoot 'share'
  if (Test-Path $popplerNotices) {
    Copy-Item $popplerNotices "$out\licenses\poppler-share" -Recurse
  }
  Copy-Item 'models\prism-catalog.json' "$out\models\catalog.json"
  Copy-Item 'web\vendor\KATEX-LICENSE.txt' $out
  foreach ($name in @('LICENSE','LICENSE-MIT-LEGACY','COMMERCIAL_LICENSE.md','LICENSING_HISTORY.md')) {
    Copy-Item $name $out
  }
  # Preserve notices shipped anywhere in the runtime archives, including parent folders.
  Get-ChildItem $cache -Recurse -File | Where-Object { $_.Name -match 'LICENSE|COPYING|NOTICE' } | ForEach-Object {
    $relative = $_.FullName.Substring($cache.Length + 1).Replace('\', '_')
    Copy-Item $_.FullName (Join-Path "$out\licenses" $relative)
  }
  Set-Content "$out\PocketAI-data\workspace.json" -Value '{"chats":[],"documents":[],"inference_engine":"auto"}' -Encoding ASCII
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
  Set-Content "$out\README.txt" -Encoding ASCII -Value 'LAN: start Avvia LlamaNest Prism LAN.cmd. Bonsai 2 uses Prism; other models use llama.cpp automatically. Browser data is separated on the server; HTTP has no authentication, use trusted networks only.'
  Set-Content "$out\RUNTIME.txt" -Encoding ASCII -Value "PrismML: https://github.com/PrismML-Eng/llama.cpp/releases/tag/$tag"
  & "$prism\llama-server.exe" --version
  if ($LASTEXITCODE -ne 0) { throw 'Packaged CPU PrismML runtime cannot start' }
  & "$standard\llama-server.exe" --version
  if ($LASTEXITCODE -ne 0) { throw 'Packaged standard llama.cpp runtime cannot start' }
  & "$bin\pdftotext.exe" -v
  if ($LASTEXITCODE -ne 0) { throw 'Packaged pdftotext cannot start' }
  if ($Zip) {
    $archive = "$out.zip"
    if (Test-Path $archive) { throw "Archive already exists: $archive" }
    Compress-Archive -LiteralPath $out -DestinationPath $archive
  }
  Write-Host "Portable folder ready: $out"
} finally { Pop-Location }
