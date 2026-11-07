# LlamaNest by FipraAI

## Windows PrismML / Bonsai edition

Build the dedicated portable edition with Rust (MSVC toolchain), `curl.exe`,
and a Windows Poppler installation providing `pdftotext.exe`:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/package-windows-prism.ps1 -PdfToText C:\tools\poppler\Library\bin\pdftotext.exe -Zip
```

Output: `release/LlamaNest-Prism-Bonsai-Windows-x64.zip`. Extract the whole
folder and run `Avvia LlamaNest Prism.cmd`. Like the Mac Prism edition, it
uses PrismML automatically and offers Bonsai 2 9B PQ2_0 on first use, with
verified model downloads. The launcher detects Vulkan or uses the bundled
CPU runtime. The existing interface and five languages are shared with Mac.
Models and conversations are not included in the ZIP. Existing output folders
are never overwritten; move them before rebuilding.

The `Windows Prism Bonsai portable` GitHub Actions workflow builds an artifact
and checks actual CPU inference using the catalog's size- and hash-verified
Bonsai model. On main, a successful build publishes the verified Windows Prism release. To run that integration check
locally after packaging (downloads 2.42 GB into ignored `target/`):

```powershell
python scripts/test-prism-inference.py release/LlamaNest-Prism-Bonsai-Windows-x64
```

The runtime is pinned to the [official PrismML release prism-b12128-d7b2896](https://github.com/PrismML-Eng/llama.cpp/releases/tag/prism-b12128-d7b2896).
GPU performance must also be checked on the intended Windows hardware.

> [!IMPORTANT]
> **Commercial use of current LlamaNest versions requires a separate paid written license before use.** This includes internal business use, client work, paid services, resale, and integration into a commercial product. [Contact the project owner about an agreement](https://github.com/fipra/usb-ai/issues/new?title=Commercial%20licensing%20inquiry) and read the [commercial licensing terms](COMMERCIAL_LICENSE.md).
>
> Earlier copies released under MIT retain their commercial-use rights; see the [licensing history](LICENSING_HISTORY.md). Third-party tools and models have their own licenses.

A private, portable AI assistant that runs on your computer. The Rust app opens in your browser and uses `llama-server` to keep GGUF models loaded locally. It needs no account or cloud API. Keep the entire folder on a USB drive to carry your models and data with you.

[**Download for Windows x64**](https://github.com/fipra/usb-ai/releases/tag/rust-windows-stop-2026-10-24) · [**Download for macOS**](https://github.com/fipra/usb-ai/releases/tag/rust-mac-stop-2026-10-24) · [Leggi in italiano](README.it.md)

## Licensing

The existing code and releases published through commit
[`4cf59ef`](https://github.com/fipra/usb-ai/commit/4cf59ef7709235092ef3ceba74aab680a3001d4e)
remain available under the [MIT License](LICENSE-MIT-LEGACY), including its
commercial-use rights. The download links above point to the current portable
releases. See the
[licensing history](LICENSING_HISTORY.md) for the source cutoff and exact asset
digests.

For future distributions, all LlamaNest code that Fabrizio Casula owns is offered
under the [USB AI Personal Use License v1.0](LICENSE), including owned code
that appeared in the earlier MIT versions. Personal, educational, and
non-commercial research use is free. Commercial use, resale, commercial
redistribution, and integration into commercial products require a separate
written, paid agreement; see [commercial licensing](COMMERCIAL_LICENSE.md).
Previously MIT-licensed copies remain usable under MIT, including for
commercial purposes. Bundled tools, Rust dependencies, and downloaded models
have their own licenses.

## Features

- Chat with a local GGUF model.
- Read formatted responses with headings, lists, tables, links, and copyable code blocks in Web, Mac, and Windows.
- Quantize a local GGUF to Q8_0, Q4_K_M, Q3_K_M, or Q2_K in the Mac and Windows app using bundled `llama-quantize`.
- Import text PDFs, TXT, and Markdown files (up to 20 MB each).
- Search documents by keyword, with excerpts and PDF page numbers.
- Save conversations and export them as Markdown.
- Choose a curated starter model or search for other GGUF models with guidance based on your computer's RAM and CPU cores.
- Use the interface in English by default, or select Italian, German, French, or Spanish in the sidebar. The saved choice also guides the language of model responses unless you ask for another language.

The app normally opens at `http://127.0.0.1:48157`, choosing a free port through `48167` if needed. The normal launcher listens only on your computer. To access it from another device on the network, use `Avvia LlamaNest LAN.cmd` on Windows or `Avvia LlamaNest LAN.command` on Mac. The app prints the IP address, hostname when available, and actual port; the hostname works when resolvable on the network. Windows also provides `Avvia LlamaNest LAN GPU.cmd`. The LAN launchers set `USB_AI_BIND_ADDR=0.0.0.0`; the same environment variable can be used from a terminal on Linux. Allow the selected port through the firewall only on trusted networks. LAN mode has no login and uses unencrypted HTTP, so anyone who can reach the port can access the workspace. Do not expose it directly to the Internet. Data is stored **without encryption** in `PocketAI-data/`.


Open **Models → Quantize Model** in a build that includes `llama-quantize`. Choose a local GGUF and a target precision. The app estimates RAM and free disk space before starting, writes progress in the background, and lets you cancel. It keeps the source file and adds the completed result to the model library with a suffix such as `-Q3_K_M.gguf`. Quantizing an already quantized model can significantly reduce quality; it requires explicit confirmation. Prefer an F16/BF16/F32 source. Older release ZIPs may not yet contain `llama-quantize`; build the current source or use a newly published package that includes it. The standalone Web app links to the desktop releases for this feature.

Free space for quantization is checked on the drive containing the app's `models/` output folder. The preflight estimate reserves approximately the source GGUF size plus a margin, so a Q2 result may use less space than the estimate. On Windows, the check uses the output folder's volume directly.

## Portable USB packages

### Windows x64

1. Download [**USB-AI-Rust-Windows-x64.zip**](https://github.com/fipra/usb-ai/releases/download/rust-windows-stop-2026-10-24/USB-AI-Rust-Windows-x64.zip).
2. Extract the complete folder to your USB drive or another location.
3. Double-click `Avvia LlamaNest.cmd`. It uses a detected Vulkan GPU (including NVIDIA RTX) and falls back to the CPU when no Vulkan device is available. Use `Avvia LlamaNest GPU.cmd` for an explicit GPU start that reports an error if Vulkan is unavailable. The corresponding network launchers are `Avvia LlamaNest LAN.cmd` and `Avvia LlamaNest LAN GPU.cmd`.
4. Open **Models → Import GGUF into models** to select a model already on the PC, or send your first prompt and choose a download. Chat and document search then work offline.

The destination PC does **not** need Rust or Cargo. Keep the whole folder together. Imported and newly downloaded models are stored in `USB-AI-Rust-Windows-x64\models`; importing copies the GGUF and keeps the source file. Files downloaded by older versions in `PocketAI-data\models` remain discoverable. GPU mode needs a working Vulkan graphics driver. Run `bin\gpu\llama-server.exe --list-devices` to check which GPU the bundled runtime detects. This build is for Windows x64. The automated Windows build checks the package and included tools, but GPU inference on a physical Windows PC still needs testing.


### macOS

Download the ZIP that matches your Mac from the [macOS release](https://github.com/fipra/usb-ai/releases/tag/rust-mac-stop-2026-10-24): **arm64** for Apple Silicon or **x86_64** for Intel. Extract the complete folder to your USB drive and double-click `Avvia LlamaNest.command`. Send your first prompt to download the default model, or choose another model. The ZIP includes the app, its license, `llama-server`, `llama-cli`, `pdftotext`, and their required libraries; it does not include model weights or personal data.

On Mac, llama.cpp uses Metal automatically when its bundled backend detects a compatible GPU. Run `bin/llama-server --list-devices` inside the extracted folder to check for `Metal:`. The Apple Silicon package build checks that Metal is available.

On first launch, the launcher verifies the bundled executables and libraries' local signatures and clears their quarantine attributes if present, before starting the app. This prevents a bundled `.dylib` from being blocked on the first prompt. The package is not Developer ID signed or notarized, so macOS may still ask you to allow the launcher itself. Developers can create the folder locally with `python3 scripts/package-mac.py` on a Mac of the same architecture.

## Models and hardware guidance

Open the model picker to see detected total RAM, logical CPU cores, and architecture. On a fresh installation, the first prompt automatically downloads, verifies, and starts Llama 3.2 1B. It then sends that same prompt. The app verifies the pinned SHA-256 hash, exact size, and GGUF format before use. Internet is needed for the first download; afterward chat and document search run locally. You can also place a compatible instruct `.gguf` file in `models/`, import one, or find another model through search.

Llama 3.2 1B is the only built-in test download (808 MB, Llama 3.2 Community License; Built with Llama). RAM guidance is an estimate based on total RAM; actual speed also depends on GPU, context length, and other open programs. The download source, hash, and license are recorded in [models/catalog.json](models/catalog.json). Model weights are not tracked in this repository. Check each model's license before redistributing it.

## Run from source

Install Rust, `llama-server`, and `llama-cli` from llama.cpp. Install `pdftotext` from Poppler if you want PDF import. On macOS, the tools can be installed with `brew install llama.cpp poppler`. Put the executables on your PATH, then run:

```bash
cargo run --release
```

On Windows, use PowerShell to run the same Cargo command after installing Rust, `llama-server.exe`, `llama-cli.exe`, and `pdftotext.exe`. Developers can build the portable Windows folder with `scripts/package-windows.ps1`; GitHub Actions builds the downloadable ZIP automatically.

## Data, limits, and development


- `POCKET_AI_HOME` selects another data directory. `USB_AI_DIR` selects the base directory containing `models/` and, by default, `PocketAI-data/`.
- `LLAMA_SERVER` and `PDFTOTEXT` select alternate tool executables.
- The first answer starts `llama-server`; subsequent answers reuse the loaded model until another GGUF is selected or LlamaNest closes. Answers appear as they are generated. Stop ends the current answer and keeps any text already generated, so you can send another prompt.
- Document search is keyword based. Scanned PDFs require OCR before import.

Before contributing, run:

```bash
cargo fmt --check
cargo test --offline
cargo build --release --locked
```

See [VERIFICHE.md](VERIFICHE.md) for verification status and the licensing section above before using or distributing a future version.

## Model Creator Lab (experimental)

The desktop Laboratory includes Model Creator for training a small Transformer from scratch with local Python and PyTorch. It can export an F32 GGUF for LlamaNest Web when the `gguf` Python package is installed. See [MODEL_CREATOR.md](MODEL_CREATOR.md) for setup, limitations, evaluation and export.

### Shared web research experiment

The browser and native search builds use `web/usb-ai-web/web-search.js` for query planning, source filtering and passage selection. Discovery uses Wikipedia and Purili; Wikipedia introductions are followed by an exact-page read. Public publisher HTML can be read through the optional `/api/read-article` adapter. The native adapter accepts only same-origin loopback requests, public HTTPS hosts and validated, DNS-pinned redirects. Static hosting works without this adapter using Wikipedia and provider context; unavailable publisher pages remain labelled as snippets. Purili’s personal, non-commercial terms still apply.

Run `npm ci --prefix web`, `npm test --prefix web` and `python3 scripts/build-search-web.py`. The static result is written to `release/ricerca-web`; set `USB_AI_WEB_BASE` for the public path and `USB_AI_SEARCH_OUTPUT` for another destination. No publishing is performed. For Mac, run `python3 scripts/prepare-mac-search.py /path/to/new-source`, then build/package that isolated source tree.

Search is opt-in for each page session. Documents and model weights are not sent to the discovery services. Sources are displayed with their selected passages and read/snippet status in the browser. A model may still omit a fact or citation; source retrieval is not a guarantee of answer correctness.
