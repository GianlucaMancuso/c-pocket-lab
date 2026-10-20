# Versione di prova della diagnostica

La prova viene pubblicata su https://gianlucamancuso.github.io/c-pocket-lab/preview/ . L'indirizzo principale resta https://gianlucamancuso.github.io/c-pocket-lab/ . La preview non è una nuova release della versione principale.

## Come viene preservata l'app principale

Il workflow pages-preview.yml parte soltanto dal branch preview/diagnostics. Costruisce un unico pacchetto Pages con due parti:

- Radice: file public presi direttamente dai blob Git del commit corrente di origin/main, senza utilizzare le modifiche della cartella di lavoro.
- preview/: prototipo con nuova diagnostica, banner VERSIONE DI PROVA, nome Home C Lab Prova e metadati build.json.

Il controllo byte per byte confronta ogni file della radice con main e rifiuta file mancanti, aggiunti o modificati. Anche i file preview vengono verificati mediante hash dopo i test. Se main cambia durante il workflow, il controllo finale impedisce di pubblicare una copia vecchia della radice. Gli output generati sono in dist/ e non devono essere committati.

La preview usa scope service worker /c-pocket-lab/preview/, cache con nome che include tale percorso e manifest con id/start_url relativi. La preparazione offline usa esplicitamente la registrazione della pagina, anche quando è già presente il service worker dell'app principale. La preview condivide comunque origine HTTPS e quota storage con l'app principale: l'isolamento dei percorsi non garantisce quote disco indipendenti.

Il workflow principale può pubblicare solo dal branch main, anche se avviato manualmente. Il branch preview non viene unito automaticamente a main.

## Verifiche locali eseguite su Windows

```powershell
npm run check
npm run build:preview
npm run test:preview
npm run test:preview:offline
npm run check:preview
```

Il banco di prova simula anche il prefisso repository /c-pocket-lab/ del sito reale. Installa prima il service worker principale e prepara la sua cache binji. Poi apre la preview e prepara la sua cache separata. La nuova diagnostica passa 17/17 casi C e 5/5 controlli UI con entrambe le toolchain, online e offline con server locale spento.

I 5 controlli di isolamento verificano app principale funzionante prima della prova, scope/cache/manifest preview distinti, contenuto cache principale invariato, app principale funzionante dopo la prova e tutti i file principali identici ai blob di main. Un test di manomissione del pacchetto deve inoltre far fallire il controllo dei file.

Report: reports/preview-build.json, reports/preview-isolation-online.json, reports/preview-isolation-offline.json e reports/windows-chrome-*-preview.json. Questi sono risultati Windows; nessun nuovo test iPhone viene dedotto.

## Caricamento dal PowerShell dell'utente

```powershell
cd V:\c-pocket-lab
git switch -c preview/diagnostics
git add .
git commit -m "Versione di prova della diagnostica C"
git push -u origin preview/diagnostics
```

Il workflow Preview diagnostics without changing production deve completare controlli e test prima del caricamento Pages. La sessione di lavoro non ha accesso rete a GitHub; il push va eseguito dal PowerShell dell'utente. Non eseguire push su main per questa prova.

Se GitHub segnala che il branch non può distribuire nell'ambiente github-pages, aprire Settings > Environments > github-pages > Deployment branches and tags. Se sono selezionati branch specifici, aggiungere soltanto preview/diagnostics mantenendo main. Non disattivare altre protezioni o approvazioni già configurate. Rilanciare il job bloccato. [Documentazione ambienti GitHub](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment).

## Prova iPhone prima della release

1. Dopo il workflow verde, aprire in Safari il link che termina con /preview/ e controllare banner VERSIONE DI PROVA e dicitura Diagnostica studio v1.
2. Aggiungerlo alla Home con il nome C Lab Prova. Conservare l'icona dell'app principale.
3. Con binji selezionato eseguire i 17 test online. Esportare il JSON; il campo channel deve essere preview e appUrl deve contenere /preview/.
4. Provare un warning, un errore sintattico e una divisione per zero inseriti liberamente. Verificare log con posizione, indicatore ^, output prima del crash e nuova esecuzione dopo la correzione.
5. Nella preview premere Prepara offline, attendere, ricaricare online, chiudere e riaprire dalla relativa icona con modalità aereo attiva e Wi-Fi spento. Ripetere i 17 test ed esportare il report.
6. Aprire anche l'app principale dalla sua icona con rete spenta e verificare che continui a compilare. Non cancellare i dati del sito durante la prova.

I report iPhone già ricevuti con 10/10 riguardano la versione principale precedente. La promozione della diagnostica su main resta subordinata alla nuova verifica sul dispositivo e alla successiva autorizzazione. Il test non dimostra la conservazione indefinita della cache né il salvataggio dei programmi.
