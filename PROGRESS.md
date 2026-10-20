# C Pocket Lab - avanzamento

Aggiornamento: 20 ottobre 2026. Prototipo con compilazione C locale WebAssembly. Nessuna compilazione remota, CDN o simulazione del linguaggio.

## Esito attuale

La nuova diagnostica è predisposta per una preview separata su /c-pocket-lab/preview/. La release principale resta sospesa fino alla verifica iPhone della nuova versione. Nessun push o deployment della preview è stato eseguito dalla sessione: la rete GitHub è ancora bloccata e la creazione del branch locale dal sandbox non è riuscita. I comandi di caricamento vanno eseguiti dal PowerShell dell'utente come descritto in docs/PREVIEW.md.

La fattibilità del prototipo binji è dimostrata dai report ricevuti su iPhone iOS 18.5: 10/10 casi online e 10/10 offline, app in modalità standalone. I report originali sono conservati in reports/iphone-binji-online.json e reports/iphone-binji-offline.json.

L'aggiornamento della diagnostica aggiunge warning, dati di debug e messaggi runtime. Su Chrome Windows entrambe le toolchain passano 17/17 casi C e 5/5 verifiche UI, sia online sia offline con server spento. I nuovi 7 casi e la nuova interfaccia dei log devono ancora essere verificati su iPhone: i report iPhone precedenti riguardano il prototipo prima di questo aggiornamento.

## Evidenze su iPhone reale

| Report | Timestamp UTC | Stato rete riportato | Modalità | Risultato |
| --- | --- | --- | --- | --- |
| Online | 2026-10-20T06:26:24.940Z | online true | standalone true | 10/10 PASS |
| Offline | 2026-10-20T06:27:12.181Z | online false | standalone true | 10/10 PASS |

User agent: iPhone, iOS 18.5, WebKit 605.1.15. Il modello iPhone non è specificato. Il test printf contiene 31148 online e 856289 offline, entrambi compilati con output corretto. I tempi offline dei casi positivi sono circa 0,62-0,79 secondi. Il report non registra lo stato delle singole radio né prova da solo un riavvio completo del dispositivo.

I 10 casi provati su iPhone sono printf, scanf, cicli/funzioni/array, stringhe/puntatori/struct, malloc/free, file, EOF, errore di compilazione, exit non zero e arresto di un loop infinito. Il test file verifica fopen in scrittura e lettura, fprintf, fscanf e fclose, controllando anche dal runtime il contenuto di data.txt: 73 pocket più newline.

## Diagnostica per lo studio

- Compilazione C11 con -O0, -Wall, -Wextra, -Wpedantic, -Wformat=2 e -fdiagnostics-show-option. I warning non diventano errori.
- Dati di debug: -g nel driver browsercc; opzioni cc1 equivalenti in binji (-debug-info-kind=limited, -dwarf-version=4, -dwarf-column-info). Un test controlla che il Wasm contenga sezioni .debug_info e .debug_line non vuote.
- Sezioni separate per log compiler/linker, output del programma ed errori runtime.
- Testo originale del compilatore, riga, colonna, nome del warning, sorgente e indicatore ^ conservati. Codici ANSI rimossi; righe non spezzate dal compilatore, log scorrevoli orizzontalmente.
- I warning rimangono visibili dopo esecuzione riuscita. Gli errori C inseriti liberamente vengono classificati come errori di compilazione anche con binji.
- I crash Wasm preservano l'output già emesso e il messaggio/stack originali. La spiegazione italiana accompagna il messaggio senza attribuire una causa C non dimostrata.
- -g non fornisce automaticamente un debugger o stack con righe C: al momento gli stack possono contenere nomi funzione e offset Wasm. Nessuna simbolizzazione DWARF implementata.

## Sanitizer: prove e limiti

Le prove sono riproducibili con node scripts/browser-test.mjs --probes. Sono osservazioni separate dai test funzionali; nessun sanitizer è attivo per il codice inserito nell'app.

| Esperimento su Chrome Windows | browsercc | binji |
| --- | --- | --- |
| AddressSanitizer | Driver rifiuta -fsanitize=address per wasm32-unknown-wasi | Compila, poi link fallisce per simboli __asan_* mancanti |
| UBSan con messaggi | Link fallisce: __ubsan_handle_add_overflow mancante | Link fallisce: __ubsan_handle_add_overflow_abort mancante |
| UBSan trap, overflow signed | Arresto RuntimeError: unreachable dopo output | Arresto RuntimeError: unreachable dopo output |

Il driver browsercc usa -fsanitize=undefined; il cc1 storico binji richiede l'espansione esplicita dei controlli e non accetta direttamente il gruppo undefined. La prova binji espande signed-integer-overflow, integer-divide-by-zero, shift-base, shift-exponent, null, alignment e array-bounds. È stato esercitato solo l'overflow signed: gli altri controlli non sono dichiarati verificati.

Trap mode non richiede il runtime UBSan ma non fornisce il messaggio dettagliato su operandi e riga C. Per questo resta un esperimento e non viene esposto come sostituto di ASan. Use-after-free, double-free, leak e accessi fuori dai singoli oggetti C non sono diagnosticati dal prototipo. I trap Wasm per divisione per zero e accesso oltre memoria lineare non equivalgono a un sanitizer completo.

Fonti primarie: [manuale Clang](https://clang.llvm.org/docs/UsersManual.html), [AddressSanitizer](https://clang.llvm.org/docs/AddressSanitizer.html), [UBSan](https://clang.llvm.org/docs/UndefinedBehaviorSanitizer.html).

## Toolchain e distribuzione

Componenti locali acquisiti: browsercc 0.1.1, browser_wasi_shim 0.4.2, binji/wasm-clang commit 648c4a89997a351eef75cdaec3ef5b89d4937dec. Provenienza e patch sono registrate in public/provenance.json; dimensioni e SHA-256 in public/assets.json. I pacchetti npm vengono verificati mediante SRI durante acquisizione.

browsercc contiene Clang/LLD con glue Emscripten e produce WASI preview1. binji usa Clang 8, LLD, sysroot, memfs Wasm e runtime JS con ABI wasi_unstable abbinata. Binji è il default per la prima versione, già verificato su iPhone e più piccolo. Browsercc è verificato su Chrome Windows ma non ancora su iPhone.

Dimensioni locali: browsercc 108,6 MiB incluso PCH C++ inutilizzato; circa 90 MiB di cache senza PCH. Binji 57,6 MiB; shim WASI circa 0,1 MiB. Il pulsante Prepara offline prepara la toolchain selezionata. Per usarle entrambe offline occorre prepararle entrambe.

Patch browsercc: getCompilerInvocation deve passare -x c prima del nome del sorgente; l'ordine upstream forzava involontariamente C++ e faceva rifiutare -std=c11. Patch riproducibile in scripts/patch-browsercc.mjs, inclusa in acquire. Per binji shared.js espone API.App per catturare exit e output senza i log host; copia upstream conservata.

Fonti: [browsercc](https://github.com/BertalanD/browsercc), [binji/wasm-clang](https://github.com/binji/wasm-clang), [runtime WASI](https://github.com/bjorn3/browser_wasi_shim).

## Verifiche Windows

Ambiente: PowerShell, Node v25.2.1, Python 3.10.6, HeadlessChrome 155. Script automatici senza dipendenze npm aggiuntive. I test headless utilizzano un profilo temporaneo con --no-sandbox nel contesto ristretto di esecuzione; questo non è un requisito dell'app iPhone.

- Terminale e creazione/lettura/cancellazione file sentinella: PASS, ripetuti dopo la riparazione.
- npm run check: controlla sintassi JS, inventario casi, presenza e integrità degli asset.
- npm run test:browser: compila/esegue la suite e verifica i log tramite i pulsanti reali della pagina.
- npm run test:offline: prepara la cache, disabilita la rete tramite DevTools, spegne il server HTTP locale e ricarica la pagina prima della suite e dei test UI.
- Report: reports/windows-chrome-browsercc-online.json, reports/windows-chrome-binji-online.json e i corrispondenti file offline. Ogni report include sorgenti, input, output, diagnostica, tempi e controlli UI.
- Nuovi casi: warning variabile inutilizzata, parametro inutilizzato, formato printf errato in funzione non eseguita; errore sintattico con posizione; sezioni debug; divisione per zero e trap fuori memoria con output precedente preservato.
- Test UI: warning visibile dopo successo, errore C libero leggibile, output preservato durante crash, nuova esecuzione dopo crash, testo non interpretato come HTML e arresto manuale.
- Screenshot verificato a viewport mobile di 390 pixel: reports/diagnostics-mobile-chrome.png. È una verifica visiva su Chrome, non una prova Safari iOS.
- Integrità della distribuzione: gli hash degli asset testuali nel commit Git iniziale coincidono con quelli del manifest; nessuna modifica ai binari o alle licenze delle dipendenze.

## Problemi risolti

### Preparazione della preview

- Build dist/pages-preview: 57 file della versione principale identici byte per byte al commit main a5ff1b9da06cd40e01076efb372379f76cb2775a; 60 file preview verificati tramite SHA-256. Nessun duplicato del pacchetto generato entra in Git (dist/ ignorata).
- Test Windows sul prefisso /c-pocket-lab/preview/: 17/17 casi C e 5/5 controlli UI passano con entrambe le toolchain sia online sia offline.
- 5/5 controlli di isolamento passano sia online sia offline: app principale prima/dopo, scope/cache/manifest distinti, cache principale invariata e file principali identici a main. Nel caso offline il server è spento e la rete DevTools è disabilitata.
- Nuovo helper offline usa la registrazione della pagina corrente; la cache include il percorso nello spazio dei nomi. Preview e principale restano sullo stesso origin e condividono la quota storage del browser.
- Workflow separato per preview/diagnostics con test prima del deploy e controllo finale che main non sia cambiato. Guard sul workflow principale impedisce avvio manuale della release da un branch preview.
- I nuovi risultati iPhone della preview non sono ancora disponibili. Nessuna promozione automatica a main.

All'inizio Git/curl/npm non potevano raggiungere Internet dal sandbox. L'utente ha eseguito npm run acquire nel proprio PowerShell e acquisito i 47 asset. Il controllo completo falliva correttamente prima di tale acquisizione.

Dopo la creazione del repository il sandbox non poteva aggiornare l'ACL della cartella .git, creata con un utente diverso. Il log indicava READ_CONTROL | WRITE_DAC negato. La proprietà della sola cartella .git è stata ripristinata tramite takeown; terminale e scrittura sono ora nuovamente verificati.

I trattini lunghi nei file del progetto sono rimossi. Le licenze e i sorgenti delle dipendenze restano integri.

## Limiti e prossimi passi

stdin è precaricato prima dell'avvio: non è implementato input interattivo mentre scanf è sospeso. Il filesystem C è virtuale e in RAM; il test file non dimostra persistenza fra esecuzioni. Nel runtime binji stderr e stdout del programma sono mescolati. Lo stdout non viene mostrato in streaming durante un programma ancora in esecuzione.

La cache può essere rimossa da iOS o dall'utente. Dopo questo aggiornamento aprire online e ripetere Prepara offline prima di tornare in modalità aereo. Riavvio dispositivo, conservazione per giorni, pressione disco e memoria restano verifiche separate.

Repo: https://github.com/GianlucaMancuso/c-pocket-lab
Pages: https://gianlucamancuso.github.io/c-pocket-lab/

Prossimo passo: caricare solo il branch preview/diagnostics, attendere il workflow e ripetere i 17 casi su iPhone dal percorso /preview/, online e offline. Controllare VERSIONE DI PROVA, Diagnostica studio v1 e channel preview nei report. Verificare anche che l'icona principale continui a compilare offline. Conservare i nuovi report separati dai precedenti. Nessun nuovo risultato iPhone viene dedotto dai test Windows; la release principale resta sospesa.

Salvataggio/riapertura programmi, editor con evidenziazione, libreria esercizi e modalità esame restano da sviluppare nelle fasi successive. Non è dichiarato supporto generale a tutte le librerie C, syscall WASI, thread, processi o networking.
