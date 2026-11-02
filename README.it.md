# LlamaNest by FipraAI

## Versione Windows PrismML / Bonsai

La procedura dedicata riprende la modalita Mac Prism: motore PrismML automatico,
stessa interfaccia in cinque lingue e Bonsai 2 9B PQ2_0 scaricabile al primo uso.
Il launcher sceglie Vulkan quando rilevato, altrimenti usa il runtime CPU incluso.

Per creare lo ZIP servono Rust con toolchain MSVC, curl.exe e Poppler per Windows:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/package-windows-prism.ps1 -PdfToText C:\tools\poppler\Library\bin\pdftotext.exe -Zip
```

Estrai `release/LlamaNest-Prism-Bonsai-Windows-x64.zip` e apri
`Avvia LlamaNest Prism.cmd`. I pesi Bonsai (2,42 GB) non sono inclusi;
il download dall'app verifica dimensione e SHA-256. Puoi anche importare un GGUF.
La procedura non sovrascrive cartelle gia esistenti con possibili dati personali.

Il workflow GitHub Actions `Windows Prism Bonsai portable` prepara lo ZIP e
verifica un'inferenza reale su CPU prima di caricare l'artefatto, e pubblica la release Windows Prism solo dopo il successo dei test su main. Per la stessa verifica locale dopo il packaging:

```powershell
python scripts/test-prism-inference.py release/LlamaNest-Prism-Bonsai-Windows-x64
```

Il test scarica il modello nella cartella ignorata `target/`. Le prestazioni GPU
vanno verificate sul PC Windows di destinazione.

> [!IMPORTANT]
> **Per usare commercialmente le versioni attuali di LlamaNest serve prima una licenza scritta separata e a pagamento.** Questo vale anche per l'uso interno in azienda, i lavori per clienti, i servizi a pagamento, la rivendita e l'integrazione in un prodotto commerciale. [Contatta il titolare del progetto per un accordo](https://github.com/fipra/usb-ai/issues/new?title=Richiesta%20licenza%20commerciale) e leggi le [condizioni commerciali](COMMERCIAL_LICENSE.md).
>
> Le vecchie copie pubblicate sotto MIT conservano i diritti di uso commerciale: vedi la [cronologia delle licenze](LICENSING_HISTORY.md). Strumenti e modelli di terzi hanno licenze proprie.

Assistente AI locale e portatile. L'applicazione è scritta in Rust, apre la propria interfaccia nel browser e usa `llama-server` per mantenere i modelli GGUF caricati sul computer. Non richiede account o API cloud. Conversazioni, documenti indicizzati e modelli possono restare sulla stessa chiavetta USB.

## Licenze

Il codice e le release pubblicati fino al commit
[`4cf59ef`](https://github.com/fipra/usb-ai/commit/4cf59ef7709235092ef3ceba74aab680a3001d4e)
restano disponibili sotto [licenza MIT](LICENSE-MIT-LEGACY), compresi i relativi
diritti per uso commerciale. I pacchetti delle release già pubblicate non
vengono modificati da questo cambio di licenza. La
[cronologia delle licenze](LICENSING_HISTORY.md) indica il commit di riferimento
e le impronte SHA-256 dei pacchetti storici.

Nelle distribuzioni future, tutto il codice LlamaNest di cui Fabrizio Casula
detiene i diritti viene offerto sotto la
[USB AI Personal Use License v1.0](LICENSE), compreso il codice già pubblicato
in precedenza sotto MIT. L'uso personale, didattico e per ricerca non
commerciale è gratuito. Uso commerciale, rivendita, ridistribuzione
commerciale e integrazione in prodotti commerciali richiedono un accordo
scritto separato e a pagamento: vedi
[licenza commerciale](COMMERCIAL_LICENSE.md). Le copie già concesse sotto MIT
restano utilizzabili anche per scopi commerciali. Strumenti, dipendenze e
modelli di terzi mantengono le rispettive licenze.

## Funzioni

- Chat con un modello GGUF locale.
- Risposte formattate con titoli, elenchi, tabelle, link e blocchi di codice copiabili nelle versioni Web, Mac e Windows.
- Quantizzazione locale dei GGUF in Q8_0, Q4_K_M, Q3_K_M o Q2_K nelle versioni Mac e Windows.
- Importazione di PDF testuali, TXT e Markdown (massimo 20 MB per file).
- Ricerca per parole chiave nei documenti, con estratti e numeri di pagina per i PDF.
- Conversazioni persistenti ed esportazione Markdown.
- Pacchetti portabili separati per Mac e Windows.
- Scelta tra modelli 0,5B, 3B, 7B e 9B con indicazione della RAM del computer e stima di compatibilità.
- Interfaccia in inglese per impostazione predefinita; italiano, tedesco, francese e spagnolo selezionabili dal menu nella barra laterale. La preferenza resta salvata e guida la lingua delle risposte, salvo richiesta esplicita diversa.

L'interfaccia si apre normalmente su `http://127.0.0.1:48157`. Se la porta è occupata, l'app sceglie automaticamente una porta libera tra `48158` e `48167`. L'avvio normale ascolta solo sul computer locale. Per accedere da altri dispositivi sulla rete usa `Avvia LlamaNest LAN.cmd` su Windows oppure `Avvia LlamaNest LAN.command` su Mac; la finestra mostra l'indirizzo IP, il nome host quando disponibile e la porta effettiva. L'hostname funziona se è risolvibile sulla rete. Su Windows è disponibile anche `Avvia LlamaNest LAN GPU.cmd`. Gli avvii LAN impostano `USB_AI_BIND_ADDR=0.0.0.0`; da terminale si può usare la stessa variabile anche su Linux. Consenti la porta nel firewall solo per reti fidate. La modalità LAN non ha login e usa HTTP senza cifratura: chi può raggiungere la porta può accedere all'area di lavoro. Non esporla direttamente su Internet. I dati sono salvati senza cifratura in `PocketAI-data/`.


In **Modelli → Quantizza modello**, scegli un GGUF e il livello desiderato. L'app verifica una stima della RAM e lo spazio libero, mostra i byte scritti e permette di annullare. L'originale resta intatto; il risultato viene aggiunto alla libreria con un suffisso come `-Q3_K_M.gguf`. Una seconda quantizzazione può peggiorare molto la qualità e richiede una conferma esplicita. Per risultati migliori usa un originale F16/BF16/F32. I vecchi ZIP delle release potrebbero non includere ancora `llama-quantize`: crea il pacchetto dal sorgente aggiornato o scarica una nuova release che lo include. La Web autonoma offre un link alle versioni locali.

Lo spazio per la quantizzazione viene misurato sull'unità della cartella `models/` dell'app, che può essere diversa dal disco di sistema. Il controllo usa una stima prudente basata sulla grandezza del GGUF originale più un margine; il risultato Q2 può occupare meno spazio. Su Windows, la verifica legge direttamente lo spazio dell'unità di destinazione.

## Avvio dal sorgente

Servono Rust, `llama-server`, `llama-cli` e `llama-quantize` di llama.cpp e, per leggere i PDF, `pdftotext` di Poppler. Su macOS puoi installare llama.cpp e Poppler con `brew install llama.cpp poppler`. Poi esegui:

```bash
cargo run --release
```

Il browser si apre automaticamente. Apri **Scegli un modello** per vedere RAM totale, core logici e architettura rilevati sul computer in uso. Il pulsante **Importa GGUF in models** permette di scegliere un file già scaricato: l'app lo copia in `models/` e conserva l'originale. Su Windows, la cartella è `USB-AI-Rust-Windows-x64\models`, accanto a `bin` e `PocketAI-data`. Puoi anche copiare un `.gguf` direttamente in questa cartella e premere **Aggiorna modelli locali**. I nuovi download finiscono nella stessa cartella, mostrano l'avanzamento e sono verificati con SHA-256 e formato GGUF. I modelli scaricati con versioni precedenti in `PocketAI-data\models` restano utilizzabili. Per scaricare serve Internet una volta; chat e documenti funzionano offline dopo il download.

| Modello | Download circa | RAM minima indicativa | RAM più comoda | Licenza |
|---|---:|---:|---:|---|
| Llama 3.2 1B (Built with Llama) | 0,81 GB | 4 GB | 6 GB | Llama 3.2 Community License |

Queste soglie sono stime prudenti basate sulla **RAM totale**, non una misura della memoria libera. Velocità e capacità effettive dipendono anche da GPU, contesto e programmi aperti. Il catalogo e le fonti dei file sono in [models/catalog.json](models/catalog.json).

Su Windows, installa Rust, `llama-server.exe`, `llama-cli.exe`, `llama-quantize.exe` e `pdftotext.exe` nel PATH, poi esegui `cargo run --release` da PowerShell.

Questa repo non contiene pesi GGUF nel controllo versione. Una copia locale del modello rimane in `models/`; i pacchetti scaricabili non includono i pesi. Usa un modello *instruct* compatibile e controlla la sua licenza prima di distribuirlo.

## Pacchetto per chiavetta USB

**Mac:** scarica dalla [nuova release macOS](https://github.com/fipra/usb-ai/releases/tag/rust-mac-stop-2026-10-24) lo ZIP **arm64** per Apple Silicon oppure **x86_64** per Intel. Estrai l'intera cartella sulla chiavetta e fai doppio clic su `Avvia LlamaNest.command`. La cartella include eseguibile, licenza e strumenti necessari, ma non modelli o dati personali. Al primo avvio scegli e scarica un modello. La GPU viene usata tramite Metal se il backend è disponibile; controlla con `bin/llama-server --list-devices` nella cartella estratta. Per creare il pacchetto dal sorgente su un Mac della stessa architettura, esegui `python3 scripts/package-mac.py`.

**Primo avvio su macOS:** il launcher verifica la firma locale dei binari e delle librerie inclusi e, se presenti, rimuove i loro attributi di quarantena prima di aprire l'app. Questo evita il blocco di una `.dylib` al primo prompt. L'operazione riguarda solo `bin/` e `lib/` della cartella estratta. La build non ha firma Developer ID né notarizzazione Apple, quindi macOS potrebbe chiedere di autorizzare il launcher stesso. Non modificare i binari del pacchetto dopo l'estrazione.

**Windows x64:** scarica lo ZIP **USB-AI-Rust-Windows-x64.zip** dalla [nuova release Windows portatile](https://github.com/fipra/usb-ai/releases/tag/rust-windows-stop-2026-10-24) ed estrai **tutta la cartella**. Usa `Avvia LlamaNest.cmd` per l'accesso locale o `Avvia LlamaNest LAN.cmd` per l'accesso da altri computer: entrambi usano automaticamente una GPU Vulkan compatibile, inclusa NVIDIA RTX, e passano alla CPU se non è disponibile. Gli avvii espliciti `Avvia LlamaNest GPU.cmd` e `Avvia LlamaNest LAN GPU.cmd` segnalano invece un errore se Vulkan manca. La GPU richiede un driver Vulkan funzionante; `bin\gpu\llama-server.exe --list-devices` mostra i dispositivi rilevati. Per la sola chat non servono Rust o Cargo sul PC di destinazione. I dati e i modelli restano nella cartella portatile. L'inferenza GPU va collaudata su un PC Windows reale.


Per ricreare il pacchetto da sorgente su Windows, lo script `scripts/package-windows.ps1` richiede Rust, `llama-server.exe`, `llama-cli.exe`, `llama-quantize.exe`, `pdftotext.exe` e `LLAMANEST_CONVERTER_SOURCE_DIR` impostata su un checkout di llama.cpp `b11836`; la release sopra è generata automaticamente da GitHub Actions.

## Dati e requisiti


- `POCKET_AI_HOME` sceglie una cartella dati alternativa.
- `USB_AI_DIR` sceglie la cartella base che contiene `models/` e, per impostazione predefinita, `PocketAI-data/`.
- `LLAMA_SERVER`, `LLAMA_QUANTIZE` e `PDFTOTEXT` indicano eseguibili esterni alternativi.
- Alla prima risposta l'app avvia `llama-server`; le risposte successive riutilizzano il modello caricato fino al cambio GGUF o alla chiusura di LlamaNest. La risposta appare mentre viene generata. Il pulsante Stop interrompe la risposta corrente e conserva il testo già prodotto, così puoi inviare un altro prompt.
- I PDF scansionati richiedono OCR esterno; la ricerca nei documenti è lessicale, non semantica.

## Sviluppo e verifica

```bash
cargo fmt --check
cargo test --offline
cargo build --release --locked
```

Vedi [VERIFICHE.md](VERIFICHE.md) per lo stato dei controlli e [README.md](README.md) per la guida principale in inglese.

## Model Creator Lab (sperimentale)

Il Laboratorio desktop include Model Creator per addestrare un piccolo Transformer da zero sui propri dati, con Python e PyTorch locali. Può esportare un GGUF F32 per LlamaNest Web installando il pacchetto Python `gguf`. Per installazione, limiti, valutazione ed esportazione consulta [MODEL_CREATOR.md](MODEL_CREATOR.md).
