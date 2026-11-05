# Esperimento di modifica diretta dei pesi — Windows

Questa è una prova di ricerca separata dalla chat. Non usa fine-tuning o gradienti. Il modello grande produce una proposta JSON limitata a modifiche numeriche previste; non esegue codice generato. Il modello piccolo originale non viene sovrascritto. I risultati restano in una nuova cartella e non vengono installati automaticamente nella chat.

## Preparazione

Servono Python 3 con Tkinter, PyTorch, transformers (con supporto GGUF), gguf e safetensors; inoltre un runtime `llama-cli.exe` compatibile con entrambi i modelli e la GPU, `llama-quantize.exe` e `convert_hf_to_gguf.py` con i suoi moduli della stessa versione di llama.cpp. Il peso GGUF del modello grande va selezionato localmente. La disponibilità di VRAM dipende dalla quantizzazione, dalla finestra di contesto e dagli altri modelli già caricati. Non è garantito che due modelli entrino contemporaneamente.

Avvia `Avvia Esperimento Pesi.cmd` nella cartella del pacchetto, mentre la chat resta aperta. Scegli il GGUF piccolo, il GGUF grande, gli strumenti e due file JSON di domande. Il modello grande viene caricato in un processo separato durante l'analisi, poi scaricato; non è mantenuto in memoria per tutta la sessione.

## Domande di analisi e verifica

Ogni file è un array JSON contenente domande e una o più risposte accettate, ad esempio:

```json
[{"question":"Rispondi solo con un numero: quanto fa 2 + 2?","answers":["4","quattro"]}]
```

Usa domande diverse nei due file. Il primo è mostrato al modello grande; il secondo viene usato solo dopo la modifica. Sono inclusi esempi minimi, insufficienti per stabilire se un modello allucina meno. Fornisci risposte corrette controllate e un insieme di verifica ampio e rappresentativo.

## Risultati e limiti

La cartella nuova contiene la proposta, copie dei pesi, un GGUF di controllo riconvertito senza modifica, il GGUF candidato e `report.json`. Il controllo evidenzia gli effetti della conversione e della quantizzazione. La valutazione automatica usa corrispondenza esatta, quindi può segnare come errata una risposta corretta formulata diversamente: controlla le risposte. Una proposta può peggiorare il modello. Non è una replica completa del metodo MIT, non garantisce riduzione delle allucinazioni e richiede verifica reale su Windows e sulla GPU prima dell'uso.
