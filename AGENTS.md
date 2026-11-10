# Repository Guidelines

## Structure

USB AI is a Rust application. `src/main.rs` implements the localhost HTTP server, workspace persistence, document retrieval, hardware guidance, model selection, and inference through `llama-cli`. `web/index.html` contains the browser interface and `web/i18n.js` contains its five translations. English is the default language; keep new visible strings translated and test persistence. `models/catalog.json` lists curated GGUF downloads with source links, hashes, and licenses. `scripts/` creates portable macOS and Windows packages. `PocketAI-data/`, GGUF weights, `target/`, and `release/` are local/generated and ignored.

New cards in `esperimenti/index.html` must be inserted immediately after the experimental section heading, above all existing links (newest first).
For repository changes requested for GitHub, commit and push the verified work to the requested branch. If GitHub is unreachable, retry and report clearly that the remote was not updated. Never merge into `main` unless the user explicitly asks.

## Build and test

- `cargo run --release`: run locally; needs `llama-cli` and `pdftotext` for PDFs.
- `cargo fmt --check`: check Rust formatting.
- `cargo test --offline`: run unit tests using cached dependencies.
- `cargo build --release --locked`: build the native executable.
- `python3 scripts/package-mac.py`: create a portable Mac folder on a Mac.
- `powershell -ExecutionPolicy Bypass -File scripts\package-windows.ps1`: create a portable Windows folder on Windows.

## Style and tests

Use `rustfmt` and keep operations inside the local application and restricted localhost API. Add focused Rust tests for retrieval, file validation, model download integrity, and persistence changes. Review `web/index.html` for DOM injection and loading states. Test packaging and actual model inference on each intended platform; a successful Rust build alone is insufficient.

## Security and data

Keep private documents, conversations, downloaded weights, and generated packages out of version control. Never weaken the localhost bind or allow arbitrary filesystem paths from browser requests. Verify catalog downloads against pinned SHA-256 values before use, and against exact sizes when available. Treat RAM guidance as an estimate. Respect each model's third-party license. The portable workspace is not encrypted.
