#!/bin/sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
WORK=$(mktemp -d "${TMPDIR:-/tmp}/llamanest-official-prism-web.XXXXXX")
trap 'rm -rf "$WORK"' EXIT
SOURCE_COMMIT=7bcd90bf98478a3c83432b57fe3137dc7c496f5c
if [ -n "${LLAMANEST_SOURCE_BASE:-}" ]; then
  BASE="$LLAMANEST_SOURCE_BASE"
else
  mkdir -p "$WORK/official-source"
  git -C "$ROOT" archive "$SOURCE_COMMIT" | tar -xf - -C "$WORK/official-source"
  BASE="$WORK/official-source"
fi
LLAMANEST_SOURCE_BASE="$BASE" python3 "$ROOT/scripts/prepare-mac-search.py" "$WORK/experiment"
python3 "$ROOT/scripts/prepare-agent-web.py" "$WORK/experiment"
node "$ROOT/scripts/test-agent-web.js"
(cd "$WORK/experiment" && cargo test --locked && cargo build --release --locked)
ARCHIVE=${OFFICIAL_MAC_ARCHIVE:-"$WORK/official.zip"}
if [ -z "${OFFICIAL_MAC_ARCHIVE:-}" ]; then
  curl -fL --retry 3 'https://github.com/fipra/usb-ai/releases/download/prism-mac-permessi-1be1beb5b40e299c0716d493b5faf5a72a5f31ee/LlamaNest-Prism-Mac-permessi-corretti.zip' -o "$ARCHIVE"
fi
echo 'bb91f6eb673eb63302685aff6dc2abb8d45c17ad37822b8176f4b5704665e5a4  '"$ARCHIVE" | shasum -a 256 -c -
ditto -x -k "$ARCHIVE" "$WORK/package"
P="$WORK/package/LlamaNest-Prism-LAN-mac-arm64"
test -f "$P/PRISM_ONLY"
test -x "$P/Avvia LlamaNest.command"
test -x "$P/bin/prism/llama-server"
test -f "$P/bin/prism/libggml-metal.0.dylib"
test -z "$(find "$P" -name '*.gguf' -print -quit)"
test -z "$(find "$P/PocketAI-data" -type f -print -quit)"
cp "$WORK/experiment/target/release/usb-ai-rust" "$P/bin/usb-ai-rust"
chmod 755 "$P/bin/usb-ai-rust"
codesign --force --sign - "$P/bin/usb-ai-rust"
codesign --verify --strict "$P/bin/usb-ai-rust"
codesign --verify --strict "$P/bin/prism/llama-server"
cat > "$P/LEGGIMI-AGENT-WEB.txt" <<'EOF'
LlamaNest Prism Mac con ricerca richiesta dal modello sperimentale

Questa variante parte dal pacchetto ufficiale PrismML, con i medesimi motori e modelli non inclusi.
Apri Avvia LlamaNest.command e importa il tuo GGUF Bonsai in Modelli.
Premi Web spento per attivare la ricerca tramite Purili: non servono account, chiave o carta.
Il modello puo inviare a Purili una ricerca basata sulla domanda e sulla cronologia.
Il modello puo decidere di non effettuare alcuna ricerca. E supportata una ricerca per risposta.
Il modello risponde in locale. Le fonti possono essere errate o non aggiornate.
Purili permette uso personale non commerciale. Le chat sono separate dalla versione ufficiale.
EOF
OUTPUT="$ROOT/release/LlamaNest-Prism-Agent-Web-Mac-Apple-Silicon"
if [ -e "$OUTPUT" ]; then echo "Output already exists: $OUTPUT" >&2; exit 1; fi
mkdir -p "$ROOT/release"
ditto "$P" "$OUTPUT"
