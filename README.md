# C Pocket Lab — Fase 1

Banco di prova per compilare vero C con Clang/LLD WebAssembly locale e avviare il risultato con runtime WASI. Interfaccia limitata all'esecuzione dei test e all'esportazione dei risultati.

**Stato: prototipo funzionante su Chrome Windows, anche offline.** Entrambe le toolchain passano 10/10 casi con server locale spento. Gli asset sono stati acquisiti dall'utente fuori dal sandbox. Safari iOS reale, installazione Home e modalità aereo su iPhone sono ancora da verificare. Dettagli e report in [PROGRESS.md](PROGRESS.md).

Con Node e Python installati, da una macchina con accesso a registry.npmjs.org, api.github.com e raw.githubusercontent.com:

```powershell
npm run acquire
npm run check
npm run serve
```

Aprire `http://localhost:8080/`, scegliere la toolchain, eseguire i test ed esportare JSON. Ripetere per entrambe le toolchain. `npm run check` verifica presenza/hash degli asset, non esegue C. `node scripts/check.mjs --scaffold-only` verifica solamente sintassi e inventario dei casi.

La pagina contiene anche due campi essenziali per provare C e stdin liberamente. Il pulsante Arresta termina il worker. L'interfaccia completa della Fase 2 non è implementata.

Su Windows con Chrome installato e Node 22+ si possono riprodurre i test automaticamente:

```powershell
npm run test:browser
npm run test:offline
```

Il secondo comando prepara la cache, disabilita la rete tramite Chrome DevTools, spegne il server HTTP locale, ricarica la pagina ed esegue entrambe le suite. Report in `reports/`. Il Chrome di test usa un profilo temporaneo isolato con `--no-sandbox`, necessario nel contesto di esecuzione attuale: è una configurazione del test desktop, non dell'app o dell'iPhone.

L'acquisizione salva pacchetti npm con versioni fissate e controlla la loro integrità SRI. Per binji risolve un commit esatto, conserva la provenienza e calcola SHA-256 di tutti i file. Per ripetere lo stesso esperimento conservare `public/vendor`, `public/assets.json` e `public/provenance.json`; una nuova acquisizione può risolvere un commit binji diverso. Nessun download da npm/GitHub è previsto durante l'esecuzione dell'app.

Pubblicare la sola directory `public` su GitHub Pages dopo acquisizione e controlli. Vedere [la procedura iPhone](docs/IPHONE-OFFLINE.md). Non è stato creato alcun deployment.

Il workflow `.github/workflows/pages.yml` pubblica `public` al push su `main`. Nel repository GitHub impostare Settings → Pages → Source → GitHub Actions. Caricare anche i binari locali in `public/vendor` tramite Git, non attraverso l'upload web. Nessun binario supera 100 MiB. Il workflow controlla gli asset prima del deploy.
