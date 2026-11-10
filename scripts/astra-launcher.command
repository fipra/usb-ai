#!/bin/bash
set -eu
DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
cd "$DIR"
if [ "$(uname -m)" != arm64 ]; then echo 'Questa versione richiede un Mac Apple Silicon.'; exit 1; fi
for file in "$DIR"/bin/* "$DIR"/bin/prism/* "$DIR"/lib/*.dylib; do
  [ -f "$file" ] || continue
  if /usr/bin/xattr -p com.apple.quarantine "$file" >/dev/null 2>&1 && /usr/bin/file "$file" | /usr/bin/grep -q 'Mach-O'; then
    /usr/bin/codesign --verify --strict "$file" || { echo "Firma non valida: $file"; exit 1; }
    /usr/bin/xattr -d com.apple.quarantine "$file"
  fi
done
export USB_AI_DIR="$DIR" POCKET_AI_HOME="$DIR/PocketAI-data"
export USB_AI_ASTRA_SERVER="$DIR/bin/astra-safetensors-server.py"
RUNTIME="$DIR/runtime/bin/python"
if [ ! -x "$RUNTIME" ]; then
  PY=""
  for cmd in python3.12 python3.11 python3; do
    candidate="$(command -v "$cmd" || true)"
    if [ -n "$candidate" ] && "$candidate" -c 'import sys; sys.exit(0 if (3,11) <= sys.version_info[:2] <= (3,13) else 1)' 2>/dev/null; then PY="$candidate"; break; fi
  done
  if [ -z "$PY" ]; then echo 'Serve Python 3.11, 3.12 o 3.13. Installa Python da https://www.python.org/downloads/ e riavvia.'; exit 1; fi
  echo 'Primo avvio: preparo il motore MLX. È necessaria una connessione Internet.'
  "$PY" -m venv "$DIR/runtime"
fi
if ! "$RUNTIME" -c 'import mlx_vlm,mlx_lm' 2>/dev/null; then
  echo 'Installazione del motore MLX: può richiedere alcuni minuti.'
  "$RUNTIME" -m pip install 'mlx-vlm==0.6.3' 'mlx-lm==0.31.3' 'mlx==0.31.2' 'transformers==5.17.0'
fi
export USB_AI_ASTRA_PYTHON="$RUNTIME"
MODEL="$DIR/models/Qwen3.5-0.8B-Astra-WeightEdit"
mkdir -p "$MODEL"
BASE='https://huggingface.co/JonathanColetti/Qwen3.5-0.8B-Astra-WeightEdit/resolve/8b549b0283c8e553629d85b9fd52e0c5293c675f'
fetch_verified() {
  filename="$1" expected="$2" file="$MODEL/$1"
  if [ -f "$file" ] && [ "$(shasum -a 256 "$file" | cut -d' ' -f1)" = "$expected" ]; then return; fi
  echo "Scarico e verifico $filename ..."
  curl --fail --location --retry 2 --output "$file.part" "$BASE/$filename"
  actual="$(shasum -a 256 "$file.part" | cut -d' ' -f1)"
  if [ "$actual" != "$expected" ]; then rm -f "$file.part"; echo "Verifica fallita: $filename"; exit 1; fi
  mv "$file.part" "$file"
}
fetch_verified config.json b90b86f35c8e6925ef74ee04d0e758f0a845c83a42089ad82bbaa948de9b4204
fetch_verified tokenizer.json 5f9e4d4901a92b997e463c1f46055088b6cca5ca61a6522d1b9f64c4bb81cb42
fetch_verified tokenizer_config.json 49e2b6e395f959f077f1e992b338919c0d4a9732fc6e613995e06557f843500c
fetch_verified chat_template.jinja 273d8e0e683b885071fb17e08d71e5f2a5ddfb5309756181681de4f5a1822d80
fetch_verified merges.txt a9d356d7bdf1ef4949e3e748e95b8e10ad9d4e2e838eddc38a0a7b6b94d1db8d
fetch_verified model.safetensors.index.json d8a08838a613b025eb7952ed9db11696213e57e76a375661ef5c12f9dd5dcf4e
fetch_verified preprocessor_config.json 27225450ac9c6529872ee1924fcb0962ff5634834f817040f444118116f4e516
fetch_verified video_preprocessor_config.json 7768af27c1fafa9cc9011c1dc20067e03f8915e03b63504550e11d5066986d13
fetch_verified vocab.json ce99b4cb2983d118806ce0a8b777a35b093e2000a503ebde25853284c9dfa003
fetch_verified model.safetensors-00001-of-00001.safetensors fd1e42acdd118ac1b300d37500fd2885e75f5a09de3a33010d802bf7f737b553
exec "$DIR/bin/usb-ai-rust"
