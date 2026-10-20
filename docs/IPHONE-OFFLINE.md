# Verifica su iPhone reale — da eseguire

## Preparazione Windows

1. Eseguire `npm run acquire`, poi `npm run check`. Se un comando fallisce, non considerare pronto il prototipo.
2. Avviare `npm run serve`. Aprire localhost in un browser Windows ed eseguire entrambe le suite. Salvare i due report JSON, versione browser e tempi. Un PASS Windows non dimostra compatibilità iOS.
3. Verificare nel pannello Network che tutte le richieste siano sullo stesso origin. Bloccare l'accesso Internet esterno e ripetere la compilazione con un input differente dopo la preparazione offline.
4. Pubblicare il contenuto di `public/` su GitHub Pages, includendo integralmente vendor, licenze, assets.json e provenance.json. I percorsi sono relativi per supportare `/nome-repository/`. Controllare assenza di 404, MIME JavaScript e download corretti dei grandi file. GitHub Pages HTTPS è richiesto sull'iPhone; il server HTTP locale serve solo Windows.
5. Non usare file Git LFS pointer al posto dei binari pubblicati. Controllare dimensioni effettive e hash dopo il deployment. Verificare licenze di toolchain, sysroot e librerie prima della distribuzione pubblica.

## Safari e schermata Home

1. Annotare modello iPhone, RAM se nota, versione iOS, URL e provenienza toolchain.
2. Aprire l'URL HTTPS in Safari. Eseguire la suite di ciascuna toolchain online. Esportare i report; registrare chiusure improvvise, tempi del primo avvio e delle esecuzioni successive.
3. Selezionare binji e premere **Prepara offline**. Attendere il messaggio di cache completa. Per confrontare anche browsercc offline, selezionarlo e ripetere la preparazione. In caso di errore o chiusura, il requisito offline non è soddisfatto. I download sono circa 58 MiB per binji e 90 MiB per browsercc; il PCH C++ è escluso.
4. Ricaricare online per essere controllati dal service worker. Usare Condividi → Aggiungi alla schermata Home. Aprire l'icona, ripetere preparazione e ricarica anche da lì: verificare la cache nel contesto effettivamente utilizzato.
5. Chiudere Safari e l'app Home. Attivare modalità aereo e disattivare esplicitamente Wi-Fi e dati. Aprire l'app dalla schermata Home. Eseguire nuovamente entrambe le suite e salvare i JSON.
6. Controllare nei report che il sorgente del caso `printf` contenga un numero differente tra esecuzioni online e offline e che stdout corrisponda. La suite genera quel numero localmente a ogni avvio e lo inserisce nel C prima della compilazione. I risultati Wasm non vengono salvati dal prototipo.
7. Ripetere dopo riavvio dell'iPhone, dopo almeno 24 ore e dopo pressione di spazio disco. Registrare separatamente eventuale perdita della cache. Non è garantita la conservazione indefinita dei dati del browser.
8. Controllare che il caso `timeout` termini e che sia possibile eseguire un altro test subito dopo. Ripetere 3 volte l'intera suite per rilevare instabilità e pressione di memoria.

## Criterio di accettazione della Fase 1

Tutti i casi richiesti devono passare sul dispositivo reale con rete disabilitata dopo avvio a freddo dalla Home. Il report deve contenere user agent, data, engine, modalità standalone, input/risultati e tempi. Conservare i report Windows e iPhone separati. `navigator.onLine` è solo un indizio: annotare manualmente lo stato delle radio e usare Web Inspector quando possibile.

I file C sono in un filesystem virtuale in RAM. Scrivere/leggere/chiudere `data.txt` durante la stessa esecuzione non dimostra persistenza dopo la chiusura dell'app. stdin è interamente fornito prima dell'avvio: questo prototipo non implementa inserimento interattivo durante un `scanf` già in attesa. stderr binji è mescolato a stdout dal runtime upstream; non è un terminale POSIX completo.

L'icona SVG è provvisoria: verificare come iOS la presenta. Asset PNG/apple-touch-icon e UX definitiva restano fuori da questa fase. Nessuna verifica iPhone è stata eseguita in questa sessione.
