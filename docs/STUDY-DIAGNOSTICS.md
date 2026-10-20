# Diagnostica per studiare C

La versione Diagnostica studio v1.1 compila C11 con -O0, dati di debug equivalenti a -g, -Wall -Wextra -Wpedantic -Wformat=2. Non usa -Werror: un warning non impedisce da solo l'esecuzione.

## Come leggere il log

Esempio con variabile inutilizzata:

```c
int main(void) {
    int numero = 10;
    return 0;
}
```

Il messaggio originale di Clang contiene file, riga, colonna, gravità, descrizione e gruppo del warning:

```text
main.c:2:9: warning: unused variable 'numero' [-Wunused-variable]
    int numero = 10;
        ^
```

Il programma può terminare con exit 0 e avere comunque warning. La sezione Diagnostica compilatore li conserva dopo l'esecuzione. La grafica dei frammenti cambia fra Clang 8 (binji) e Clang 20 (browsercc), mantenendo posizione e contenuto del messaggio. Le righe lunghe scorrono orizzontalmente per conservare l'allineamento di ^. Sono rimossi soltanto i codici di colore ANSI.

Con un errore sintattico:

```c
int main(void) {
    int n = ;
    return n;
}
```

La compilazione fallisce e il programma non viene eseguito. Parti dal primo errore; gli errori seguenti possono essere conseguenze del primo. Un codice di uscita non zero restituito dal tuo main è invece distinto da un errore di compilazione o un crash runtime.

## Errori durante l'esecuzione

Esempio di divisione intera per zero:

```c
#include <stdio.h>
int main(void) {
    volatile int divisore = 0;
    puts("prima del crash");
    fflush(stdout);
    return 10 / divisore;
}
```

L'output già emesso rimane nella sua sezione. Gli errori runtime mostrano spiegazione italiana, messaggio e stack originali di WebAssembly. Il messaggio specifico può cambiare tra Chrome e Safari.

Le sezioni .debug_info e .debug_line sono incluse e verificate automaticamente, ma -g da solo non produce stack con righe C nell'app. Non è presente un debugger o un simbolizzatore DWARF. Lo stdout è raccolto fino al completamento; non è un terminale interattivo in streaming. Con binji stderr del programma è mescolato a stdout.

## Cosa non è un sanitizer

Una divisione intera per zero o un accesso oltre la memoria lineare produce un trap Wasm anche senza sanitizer. Un indice fuori dai limiti di un singolo array C può invece restare dentro la memoria Wasm e non essere rilevato. L'assenza di warning o crash non dimostra che il codice C sia corretto.

AddressSanitizer non è attivo: le prove sulle toolchain locali falliscono prima di ottenere un eseguibile completo. UBSan con messaggi dettagliati richiede simboli runtime mancanti. Una prova UBSan trap intercetta l'overflow signed, ma produce un generico unreachable: non viene presentata come sostituto dei messaggi completi di ASan/UBSan.

Esperimenti riproducibili: `node scripts/browser-test.mjs --probes`. Non sono prove di supporto completo. Non sono implementati controlli affidabili di use-after-free, double-free, leak o tutti gli accessi fuori oggetto.

## Verifica su iPhone dell'aggiornamento

1. Aprire online l'app pubblicata e controllare la dicitura Diagnostica studio v1.1.
2. I 17 casi della preview v1 hanno passato la verifica su iPhone online e offline. Per la correzione visiva v1.1 controllare in particolare la sezione degli errori runtime: deve conservare nome e messaggio oltre allo stack anche su Safari.
3. Inserire liberamente i due esempi sopra: il warning deve restare visibile dopo exit 0; il crash deve avere una sezione separata e conservare l'output.
4. Correggere il programma dopo un errore, verificando che il successivo run funzioni e che i vecchi messaggi siano sostituiti.
5. Premere Prepara offline, ricaricare online, chiudere e riaprire dalla Home con modalità aereo e Wi-Fi spento. Ripetere i 17 casi ed esportare il report con build study-diagnostics-v1.1.

Fonti: [manuale Clang](https://clang.llvm.org/docs/UsersManual.html), [ASan](https://clang.llvm.org/docs/AddressSanitizer.html), [UBSan](https://clang.llvm.org/docs/UndefinedBehaviorSanitizer.html).
