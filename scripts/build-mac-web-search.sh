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
python3 - "$PACKAGE" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
(p / 'Avvia LlamaNest LAN.command').unlink(missing_ok=True)
(p / 'LEGGIMI.txt').write_text('''LlamaNest Ricerca Web — versione sperimentale per Mac Apple Silicon

Apri Avvia LlamaNest.command e seleziona un modello GGUF.
Premi Web spento per attivare la ricerca tramite Purili. Non servono carta, account o chiave API.
La domanda e, per le richieste successive, una domanda precedente vengono inviate a Purili. Il modello risponde localmente.
Purili permette uso personale non commerciale. Risultati e risposte possono contenere errori.
Modelli e chat sono separati dalle altre versioni. Aggiungi il tuo GGUF nella cartella models o importalo dalla schermata Modelli.
Il pacchetto è firmato localmente ma non autenticato da Apple; macOS potrebbe richiedere autorizzazione.
''')
PY
