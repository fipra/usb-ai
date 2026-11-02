# LlamaNest LAN sperimentale

Prototipo separato: la cronologia e i file di testo sono memorizzati nel browser di ciascun utente. Il server riceve i messaggi e il testo dei documenti per generare la risposta. I dati del browser vengono persi se vengono cancellati. L'installazione desktop e la sua cronologia non vengono modificate.

Serve Node.js 20 o successivo sul computer che ospita LlamaNest. Copia l'intera cartella `lan-experimental` dentro una cartella LlamaNest esistente, accanto a `bin` e `models`. Avvia `Avvia LlamaNest LAN.cmd` su Windows o `Avvia LlamaNest LAN.command` su Mac; tieni aperta la finestra. Visita `http://NOME-DEL-SERVER:48180/` oppure l'IP corrispondente da un altro dispositivo. Il firewall deve consentire la porta 48180 nella rete fidata.

La versione sperimentale usa il `llama-server` dell'installazione; se presente sceglie Prism. Il backend usa la porta 48181 solo su localhost. Il prototipo supporta chat, scelta dei modelli caricabili dal server e allegati TXT/MD; PDF e tutte le funzioni dell'app desktop non sono ancora disponibili. Non è stato ancora verificato con Bonsai su Windows e Mac.

La LAN usa HTTP senza autenticazione: non esporre il servizio su Internet e usalo solo in una rete fidata.
