#!/bin/sh
cd "$(dirname "$0")" || exit 1
command -v node >/dev/null || { echo 'Node.js 20 or newer is required.'; read -r unused; exit 1; }
export LLAMANEST_MODELS_DIR="$PWD/../models"
if [ -x "$PWD/../bin/prism/llama-server" ]; then LLAMA_SERVER="$PWD/../bin/prism/llama-server"; else LLAMA_SERVER="$PWD/../bin/llama-server"; fi
export LLAMA_SERVER
[ -x "$LLAMA_SERVER" ] || { echo 'Place this LAN folder inside your LlamaNest folder, next to bin and models.'; read -r unused; exit 1; }
node "$PWD/server.mjs"
echo 'Server stopped. Press Return to close.'
read -r unused
