# C Pocket Lab — avanzamento Fase 1

Aggiornamento: 20 ottobre 2026. Ambiente: Windows, PowerShell, Node v25.2.1, Python 3.10.6. Workspace inizialmente vuoto.

## Esito attuale

**Fase 1 dimostrata su Chrome Windows, ancora da verificare su iPhone reale.** L'utente ha eseguito `npm run acquire` nel proprio PowerShell ottenendo 47 asset locali. Compilatore, linker, sysroot e runtime sono presenti. Entrambe le toolchain passano 10/10 test C online e 10/10 offline con server HTTP spento. Nessun test Safari iOS reale eseguito e nessun supporto iOS dichiarato. Nessuna interfaccia applicativa completa sviluppata e nessun deployment effettuato.

## Risultati più recenti — successivi allo sblocco dei download

- `npm run check`: PASS, tutti gli asset presenti e hash corrispondenti.
- `npm run test:browser`: PASS, 10/10 browsercc e 10/10 binji in HeadlessChrome 155 su Windows.
- `npm run test:offline`: PASS, 10/10 per entrambe le toolchain dopo preparazione cache, disabilitazione rete con DevTools, arresto del server e nuova navigazione. Un worker nuovo compila ogni caso; il sorgente printf cambia numero a ogni suite.
- Report riproducibili: [browsercc online](reports/windows-chrome-browsercc-online.json), [binji online](reports/windows-chrome-binji-online.json), [browsercc offline](reports/windows-chrome-browsercc-offline.json), [binji offline](reports/windows-chrome-binji-offline.json). Questi report non provano il comportamento su Safari, né un riavvio completo del browser o dell'iPhone.
- Ultima esecuzione offline: browsercc circa 0,28–0,56 s/caso, binji circa 0,09–0,21 s/caso, escluso il caso timeout. Sono tempi di questo PC, non stime per iPhone.
- Dimensioni acquisite: browsercc 108,6 MiB incluso PCH C++ inutilizzato, binji 57,6 MiB, shim WASI circa 0,1 MiB. La cache del browser esclude il PCH C++ (18,5 MiB); il pulsante Prepara offline prepara la toolchain selezionata. Per confrontarle offline, prepararle entrambe una per volta.
- Scelta per la prima prova iPhone: binji come default del banco di prova, per dimensione e tempi desktop inferiori; browsercc rimane disponibile come alternativa più attuale. La scelta definitiva dipende dai risultati reali su iOS.
- Correzione browsercc: il wrapper npm metteva `-x c` dopo `main.c`; Clang trattava il sorgente come C++ e rifiutava `-std=c11`. Patch riproducibile in scripts/patch-browsercc.mjs, registrata in provenance.json e inclusa nello script di acquisizione. Dopo la correzione tutti i casi passano.
- Test desktop: Chrome headless richiede `--no-sandbox` nel contesto ristretto; si usa solo un profilo di test isolato, senza dati utente. Nessun requisito equivalente è introdotto nell'app.
- Prototipo con codice C libero, stdin, output, diagnostica e pulsante Arresta. Nessuna evidenziazione sintassi, salvataggio progetti, libreria esercizi o modalità esame: Fase 2 ancora da iniziare dopo verifica iPhone.
- Workflow GitHub Pages pronto, pubblica solo public/ e controlla gli hash prima del deploy. Repository remoto ancora da creare/collegare.

## Registro iniziale Windows — prima dell'acquisizione eseguita dall'utente

| Operazione | Risultato |
| --- | --- |
| Terminale, lettura cwd | PASS: V:\\c-pocket-lab |
| Creazione, lettura e cancellazione file sentinella | PASS: contenuto `ok` |
| Ricerca istruzioni AGENTS.md nel workspace | Nessun file trovato |
| Clone browsercc da GitHub | BLOCCATO: connessione porta 443 fallita |
| Clone binji/wasm-clang da GitHub | BLOCCATO: connessione porta 443 fallita |
| curl su raw.githubusercontent.com | BLOCCATO: connessione porta 443 fallita |
| npm view browsercc | BLOCCATO: EACCES sul tentativo di rete; cache npm predefinita anche fuori dal workspace |
| `node scripts/acquire.mjs` | BLOCCATO: `TypeError: fetch failed` sui metadata npm |
| `node scripts/check.mjs --scaffold-only` | PASS: sintassi JS e inventario 10 casi |
| `node scripts/check.mjs` | FAIL atteso: assets.json mancante; impedisce un falso esito positivo |
| Server HTTP locale Python e richieste via urllib | PASS: 200 per pagina, worker, service worker, casi e manifest; MIME JS e manifest corretti. Non è un test browser |

I fallimenti di rete non indicano un difetto dei compilatori. La ricerca web è accessibile come strumento separato di consultazione, ma non ha fornito binari scaricabili sul filesystem. Il profilo attuale non consente richieste di elevazione sandbox: non è stato tentato un aggiramento.

## Valutazione documentale e scelta provvisoria

| Aspetto | browsercc | binji/wasm-clang |
| --- | --- | --- |
| Catena | Clang/LLD Wasm, sysroot, moduli JS Emscripten | Clang/LLD Wasm, sysroot, memfs Wasm e runtime JS |
| ABI del programma | WASI preview1, runtime separato | WASI `wasi_unstable`, runtime storico abbinato |
| Integrazione C | API compile; flag espliciti `-x c -std=c11` | La demo forza C++; adattatore invoca cc1 con `-x c -std=c11` |
| Rischio principale | Memoria di più istanze Clang/LLD e copie sysroot; da misurare su iPhone | Runtime demo storico, syscall incomplete e ABI meno attuale |
| Acquisizione predisposta | npm browsercc 0.1.1 + browser_wasi_shim 0.4.2 | Commit risolto da API GitHub e registrato prima di scaricare |
| Esito esecuzione su Chrome Windows | 10/10 online e offline dopo patch wrapper | 10/10 online e offline |

La scelta iniziale era browsercc; dopo le misure desktop il default di prova è binji. Servono ancora stabilità, tempi e memoria su iPhone. Gli artefatti reali e i loro hash sono ora registrati in public/assets.json; il PCH C++ resta nell'archivio locale ma non viene precaricato per l'uso C offline.

Fonti primarie consultate:

- [browsercc README](https://github.com/BertalanD/browsercc/blob/main/README.md): architettura, API e dimensioni indicative.
- [browsercc index.ts](https://github.com/BertalanD/browsercc/blob/main/index.ts): invocazioni compiler/linker e sysroot relativo al modulo.
- [browsercc package.json](https://github.com/BertalanD/browsercc/blob/main/package.json): versione e struttura distribuzione.
- [binji README](https://github.com/binji/wasm-clang/blob/master/README.md): demo e componenti.
- [binji shared.js](https://github.com/binji/wasm-clang/blob/master/shared.js): modalità C++, filesystem e runtime; clock_time_get e poll_oneoff non implementati.
- [browser_wasi_shim](https://github.com/bjorn3/browser_wasi_shim): runtime WASI e filesystem in memoria.

## Prototipo realizzato e verificato su Chrome Windows

- Acquisizione locale con controllo SRI npm, commit binji registrato, hash SHA-256 e manifest degli asset. Nessuna CDN nell'app. Archivi npm fuori dalla directory pubblica.
- Patch minima registrata a shared.js binji per esporre la classe App; copia upstream conservata. Serve a catturare uscita e codice di ritorno senza confonderli con i log del compilatore.
- Worker nuovo per ogni caso, compilazione reale C → oggetto → link Wasm → istanza runtime. Nessun interprete, simulazione o risultato precompilato. Adattatori verificati contro gli artefatti presenti.
- Il caso printf cambia numero nel sorgente a ogni esecuzione della suite; il report include sorgente e stdin per rendere controllabile una nuova compilazione anche offline.
- stdin precaricato, stdout catturato, directory virtuale per il test file. Nessun accesso al filesystem nativo iPhone.
- Pagina minima di laboratorio, report JSON, manifest PWA e service worker con cache delle risorse locali della toolchain selezionata; percorsi relativi per GitHub Pages sotto directory repository. La cache non viene dichiarata pronta se un asset manca. Offline verificato su Chrome Windows; installazione Home e offline iPhone non testati.

## Matrice C

Tutte le righe: **PASS su Chrome Windows online e offline per entrambe le toolchain; NON ESEGUITE su Safari iOS reale**. Il file testato viene anche letto dal runtime JS e confrontato con `73 pocket` più newline.

| Caso automatico | Verifica prevista |
| --- | --- |
| printf | stdout esatto con numero generato localmente e newline, exit 0 |
| scanf | lettura intero e stringa con ampiezza, conteggio conversioni |
| loops-functions-arrays | for/while/do-while, funzione, somma array |
| strings-pointers-struct | strcpy/strcat/strlen, accesso tramite puntatore a struct |
| malloc-free | 32 allocazioni, scrittura e lettura dati, free; non è una prova di assenza leak |
| files | fopen w/r, fprintf, fclose, fscanf, controlli valori e contenuto file dal lato runtime |
| scanf-eof | EOF con stdin vuoto |
| compile-error | sorgente invalido rifiutato, senza esecuzione |
| exit-status | ritorno 7 distinguibile da successo |
| timeout | loop infinito terminato nel worker dopo ingresso in esecuzione |

I test verificano solo questi casi. Non certificano l'intero standard C, tutte le varianti di formato, puntatori fuori limite, esaurimento heap, persistenza dei file o tutte le syscall. Per binji stderr e stdout non sono separati. Nessun supporto dichiarato per thread, networking, processi, librerie native o input interattivo sospeso.

## Decisioni e limiti da risolvere

La pagina di GitHub Pages deve essere statica e HTTPS. L'architettura prevista non richiede SharedArrayBuffer, server di compilazione o intestazioni COOP/COEP. Questa proprietà va verificata anche sui glue JS effettivamente scaricati. CSP consente solo risorse stesso origin e compilazione Wasm.

Caching di binari molto grandi, memoria di compilazione, tempi al primo avvio e chiusura dei worker sono i rischi principali su Safari. Non sono state misurate quote o prestazioni e non si presume compatibilità in base ai soli test desktop. La cache può essere rimossa dal sistema: l'utilizzo indefinito offline non è garantito. Aggiornamenti atomici/versionati e persistenza progetti non sono implementati in questo prototipo.

## Prossimo passo concreto

Creare/collegare il repository GitHub e pubblicare il banco di prova su Pages. Eseguire [la verifica iPhone offline](docs/IPHONE-OFFLINE.md), inclusa installazione Home, nuova compilazione, avvio a freddo e modalità aereo. Per ogni toolchain premere Prepara offline mentre è selezionata. Conservare report iPhone distinti da Windows. La Fase 1 sarà conclusa solo con evidenze sul dispositivo reale; non iniziare l'interfaccia completa prima di quel risultato. I test di salvataggio/riapertura programmi richiesti per le fasi successive sono ancora da realizzare insieme alla relativa funzione.
