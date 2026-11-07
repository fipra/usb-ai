#!/bin/sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
WORK=$(mktemp -d "${TMPDIR:-/tmp}/llamanest-mac-web-rag.XXXXXX")
trap 'rm -rf "$WORK"' EXIT
python3 "$ROOT/scripts/prepare-mac-rag.py" "$WORK/source"
(cd "$WORK/source" && cargo test --locked && python3 scripts/package-mac.py)
PACKAGE="$ROOT/release/LlamaNest-Ricerca-Web-v4.1-Mac-Apple-Silicon"
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
(p / 'LEGGIMI.txt').write_text('''LlamaNest Ricerca Web v4.1 — versione sperimentale per Mac Apple Silicon

Apri Avvia LlamaNest.command e seleziona un modello GGUF (consigliato: 3-4B instruct, ad esempio Qwen3 4B o Llama 3.2 3B).
Per Bonsai PQ2_0 apri Modelli, scegli Motore del modello → PrismML (Bonsai), quindi carica il GGUF.
Premi Web spento per attivare la ricerca. Non servono carta, account o chiave API.

Novità della v4.1: risposte brevi e conversazionali che ricordano gli ultimi messaggi; ricerca solo quando serve (non per scrivere, tradurre, correggere, calcolare o programmare); con un documento caricato la ricerca web si spegne; ricerca e lettura delle pagine in parallelo, con un tempo massimo di lettura; segnalati numeri e nomi assenti dalle fonti.

Come funziona:
1. il modello locale trasforma la domanda (e il contesto delle domande precedenti) in 2-3 ricerche;
2. le ricerche vanno a Purili e Wikipedia;
3. il Mac legge direttamente le pagine trovate (i siti vedono il tuo indirizzo IP);
4. i passaggi più pertinenti vengono passati al modello, che risponde citando le fonti [1], [2]...;
5. i numeri che non compaiono nelle fonti e le risposte senza citazioni vengono segnalati.

Purili permette uso personale non commerciale. Risultati e risposte possono contenere errori: controlla le fonti.
Modelli e chat sono separati dalle altre versioni. Aggiungi il tuo GGUF nella cartella models o importalo dalla schermata Modelli.
Il pacchetto è firmato localmente ma non autenticato da Apple; macOS potrebbe richiedere autorizzazione.
''')
PY
