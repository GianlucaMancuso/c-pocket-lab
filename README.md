# C Pocket Lab - Fase 1

Banco di prova per compilare vero C con Clang/LLD WebAssembly locale e avviare il risultato con runtime WASI. Codice C libero, stdin anticipato, log, output, arresto e test automatici.

**Stato: preview binji v1 verificata su iPhone iOS 18.5, 17/17 casi online e offline, quest'ultima dalla Home.** Il report offline completo è in reports/iphone-preview-binji-offline.json. La v1.1 corregge la visualizzazione dei crash Safari, il cui stack non include il messaggio: ora nome, messaggio e frame sono conservati esplicitamente. La correzione passa test con i dati Safari reali; la verifica visiva v1.1 su iPhone resta necessaria prima del merge. Dettagli in [PROGRESS.md](PROGRESS.md).

Con Node e Python installati, da una macchina con accesso a registry.npmjs.org, api.github.com e raw.githubusercontent.com:

```powershell
npm run acquire
npm run check
npm run serve
```

Aprire `http://localhost:8080/`, scegliere la toolchain, eseguire i test ed esportare JSON. Ripetere per entrambe le toolchain. `npm run check` verifica presenza/hash degli asset, non esegue C. `node scripts/check.mjs --scaffold-only` verifica solamente sintassi e inventario dei casi.

La pagina contiene anche due campi essenziali per provare C e stdin liberamente. Il pulsante Arresta termina il worker. L'interfaccia completa della Fase 2 non è implementata.

Compilazione con -O0, dati di debug equivalenti a -g, -Wall -Wextra -Wpedantic -Wformat=2. I warning rimangono visibili anche dopo un'esecuzione riuscita. Log compilatore, output ed errori runtime sono separati. [Guida ai messaggi e ai limiti dei sanitizer](docs/STUDY-DIAGNOSTICS.md).

Su Windows con Chrome installato e Node 22+ si possono riprodurre i test automaticamente:

```powershell
npm run test:browser
npm run test:offline
```

Il secondo comando prepara la cache, disabilita la rete tramite Chrome DevTools, spegne il server HTTP locale, ricarica la pagina ed esegue entrambe le suite. Report in `reports/`. Il Chrome di test usa un profilo temporaneo isolato con `--no-sandbox`, necessario nel contesto di esecuzione attuale: è una configurazione del test desktop, non dell'app o dell'iPhone.

I test automatici controllano anche i pulsanti reali della pagina: warning dopo successo, errore di compilazione, crash con output conservato, recupero dopo crash e arresto manuale. Per riprodurre gli esperimenti sanitizer senza attivarli nell'app: `node scripts/browser-test.mjs --probes`.

L'acquisizione salva pacchetti npm con versioni fissate e controlla la loro integrità SRI. Per binji risolve un commit esatto, conserva la provenienza e calcola SHA-256 di tutti i file. Per ripetere lo stesso esperimento conservare `public/vendor`, `public/assets.json` e `public/provenance.json`; una nuova acquisizione può risolvere un commit binji diverso. Nessun download da npm/GitHub è previsto durante l'esecuzione dell'app.

Il prototipo principale è raggiungibile su https://gianlucamancuso.github.io/c-pocket-lab/ . La diagnostica viene prima verificata nella [versione di prova separata](docs/PREVIEW.md), prevista su /c-pocket-lab/preview/ . Il caricamento preview conserva i file principali byte per byte dal commit su main e non effettua merge o aggiornamenti della versione principale.

Il workflow `.github/workflows/pages.yml` pubblica `public` al push su `main`. Nel repository GitHub impostare Settings → Pages → Source → GitHub Actions. Caricare anche i binari locali in `public/vendor` tramite Git, non attraverso l'upload web. Nessun binario supera 100 MiB. Il workflow controlla gli asset prima del deploy.

Il workflow `.github/workflows/pages-preview.yml` usa soltanto preview/diagnostics e pubblica un pacchetto con main invariato più preview/. Prima del deploy ripete i test online/offline e il controllo di integrità. Istruzioni e procedura iPhone in [docs/PREVIEW.md](docs/PREVIEW.md).
