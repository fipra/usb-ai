#!/bin/bash
set -euo pipefail

if [ "$(uname -s)" != Darwin ] || [ "$(uname -m)" != arm64 ]; then
  echo 'This package requires an Apple Silicon Mac.' >&2
  exit 1
fi
: "${RUNNER_TEMP:?A temporary build directory is required}"
root="$(cd "$(dirname "$0")/.." && pwd)"
work="$RUNNER_TEMP/dory-mac-build"
package="$root/release/LlamaNest-Dory-Mac-Apple-Silicon"
[ ! -e "$package" ] || { echo 'Package directory already exists.' >&2; exit 1; }
mkdir -p "$work"

git init "$work/llama.cpp"
git -C "$work/llama.cpp" remote add origin https://github.com/brianchmielNV/llama.cpp.git
git -C "$work/llama.cpp" fetch --depth 1 origin 98a74c97ea09ac72f6ceda1559808fc0a2f447ce
git -C "$work/llama.cpp" checkout --detach FETCH_HEAD
HF_UI_VERSION=b11551 cmake -S "$work/llama.cpp" -B "$work/llama-build" \
  -DCMAKE_BUILD_TYPE=Release -DCMAKE_OSX_ARCHITECTURES=arm64 \
  -DBUILD_SHARED_LIBS=OFF -DGGML_NATIVE=OFF -DGGML_METAL=ON -DGGML_METAL_EMBED_LIBRARY=ON \
  -DGGML_BLAS=ON -DGGML_BLAS_VENDOR=Apple -DGGML_OPENMP=OFF \
  -DLLAMA_BUILD_SERVER=ON -DLLAMA_BUILD_TESTS=OFF -DLLAMA_BUILD_EXAMPLES=OFF \
  -DLLAMA_BUILD_APP=OFF -DLLAMA_BUILD_UI=OFF -DLLAMA_USE_PREBUILT_UI=ON -DLLAMA_OPENSSL=OFF
cmake --build "$work/llama-build" --parallel 4 --target llama-server

curl -fL --retry 3 'https://github.com/fipra/usb-ai/releases/download/rust-mac-stop-2026-10-24/USB-AI-Rust-mac-arm64.zip' -o "$work/base.zip"
mkdir -p "$work/base"
ditto -x -k "$work/base.zip" "$work/base"
base_server="$(find "$work/base" -type f -path '*/bin/usb-ai-rust' -print -quit)"
[ -n "$base_server" ] || { echo 'Base package missing application.' >&2; exit 1; }
base="$(dirname "$(dirname "$base_server")")"
mkdir -p "$(dirname "$package")"
mv "$base" "$package"
cargo build --manifest-path "$root/Cargo.toml" --release --locked
cp "$root/target/release/usb-ai-rust" "$package/bin/usb-ai-rust"
cp "$work/llama-build/bin/llama-server" "$package/bin/llama-server"
chmod +x "$package/bin/usb-ai-rust" "$package/bin/llama-server"
for binary in "$package/bin/usb-ai-rust" "$package/bin/llama-server"; do
  codesign --force --sign - "$binary"
  codesign --verify --strict "$binary"
done
cp "$work/llama.cpp/LICENSE" "$package/LICENSE-LLAMA-DORY.txt"
python3 - "$package/Avvia LlamaNest.command" <<'PY'
from pathlib import Path
import sys
launcher = Path(sys.argv[1])
s = launcher.read_text()
old = 'exec "$DIR/bin/usb-ai-rust"'
assert old in s
launcher.write_text(s.replace(old, 'export USB_AI_GPU=1\n' + old))
PY
cat > "$package/DORY-LEGGIMI.txt" <<'README'
LlamaNest Dory sperimentale per Mac Apple Silicon.
Apri Avvia LlamaNest.command. In Modelli importa o seleziona il file GGUF Dory che possiedi.
Il modello non e incluso. Il motore usa Metal quando disponibile, altrimenti puo usare la CPU.
Il supporto Dory e sperimentale; prestazioni e compatibilita dipendono da modello e computer.
Dati e modelli restano nella cartella portatile. La licenza del modello e separata.
README
"$package/bin/llama-server" --version
"$package/bin/llama-server" --list-devices
printf '%s\n' "$package" > "$work/package-path"
