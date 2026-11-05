#!/bin/sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
WORK=$(mktemp -d "${TMPDIR:-/tmp}/llamanest-mac-web-search.XXXXXX")
trap 'rm -rf "$WORK"' EXIT
python3 "$ROOT/scripts/prepare-mac-search.py" "$WORK/source"
(cd "$WORK/source" && cargo test --locked && python3 scripts/package-mac.py)
PACKAGE="$ROOT/release/LlamaNest-Ricerca-Web-Mac-Apple-Silicon"
if [ -e "$PACKAGE" ]; then
  echo "Output already exists: $PACKAGE" >&2
  exit 1
fi
mkdir -p "$ROOT/release"
ditto "$WORK/source/release/USB-AI-Rust-mac-arm64" "$PACKAGE"
PRISM_ARCHIVE=${LLAMA_PRISM_ARCHIVE:-"$WORK/prism-mac.zip"}
if [ -z "${LLAMA_PRISM_ARCHIVE:-}" ]; then
  curl -fL --retry 3 --connect-timeout 30 'https://github.com/fipra/usb-ai/releases/download/desktop-contesto-2026-11-01/LlamaNest-Prism-contesto-mac-arm64.zip' -o "$PRISM_ARCHIVE"
fi
echo '48fe9a8cca024668257bfc9d423355f5cb6d637c81a499c84e2603ed7416aa0e  '"$PRISM_ARCHIVE" | shasum -a 256 -c -
ditto -x -k "$PRISM_ARCHIVE" "$WORK/prism"
PRISM_DIR="$WORK/prism/LlamaNest-Prism-contesto-mac-arm64/bin/prism"
test -f "$PRISM_DIR/llama-server"
test -f "$PRISM_DIR/libggml-metal.0.dylib"
test -f "$PRISM_DIR/LICENSE"
ditto "$PRISM_DIR" "$PACKAGE/bin/prism"
for file in "$PACKAGE"/bin/prism/llama-server "$PACKAGE"/bin/prism/*.dylib; do
  codesign --verify --strict "$file"
done
python3 - "$PACKAGE" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
(p / 'Avvia LlamaNest LAN.command').unlink(missing_ok=True)
(p / 'LEGGIMI.txt').write_text('''LlamaNest Ricerca Web — versione sperimentale per Mac Apple Silicon

Apri Avvia LlamaNest.command e seleziona un modello GGUF.
Per Bonsai PQ2_0 apri Modelli, scegli Motore del modello → PrismML (Bonsai), quindi carica il GGUF. Per gli altri modelli puoi scegliere il motore standard.
Premi Web spento per attivare la ricerca tramite Purili. Non servono carta, account o chiave API.
La domanda e, per le richieste successive, una domanda precedente vengono inviate a Purili. Il modello risponde localmente.
Purili permette uso personale non commerciale. Risultati e risposte possono contenere errori.
Modelli e chat sono separati dalle altre versioni. Aggiungi il tuo GGUF nella cartella models o importalo dalla schermata Modelli.
Il pacchetto è firmato localmente ma non autenticato da Apple; macOS potrebbe richiedere autorizzazione.
''')
PY
