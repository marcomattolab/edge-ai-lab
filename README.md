# Edge AI Lab

Applicazione Angular 22 che mostra cinque funzioni di intelligenza artificiale eseguite **interamente nel browser**: nessun server, nessun dato che lascia il dispositivo. Una pagina Impostazioni permette di scegliere da dove caricare il modello iniziale di ciascuna funzione.

## Indice

1. [Le funzioni](#le-funzioni)
2. [Avvio rapido](#avvio-rapido)
3. [Uso offline](#uso-offline)
4. [Impostazioni modelli](#impostazioni-modelli)
5. [Dettagli tecnici](#dettagli-tecnici)
6. [Dettaglio di ogni funzione](#dettaglio-di-ogni-funzione)
7. [Risoluzione dei problemi](#risoluzione-dei-problemi)
8. [Come estendere l'app](#come-estendere-lapp)

---

## Le funzioni

| Sezione | Percorso | A cosa serve | Input | Modello / libreria | Dove gira |
|---|---|---|---|---|---|
| **Pinch & Scroll** | `/pinch-scroll` | Scorrere e cliccare pizzicando pollice e indice davanti alla webcam | Webcam | MediaPipe Hand Landmarker (`.task`) | Thread principale, GPU con ripiego su CPU |
| **Cursore con la testa** | `/head-cursor` | Muovere il puntatore con il viso e cliccare con gli occhi o la bocca | Webcam | MediaPipe Face Landmarker, landmark e blendshape (`.task`) | Thread principale, GPU con ripiego su CPU |
| **Sfondo intelligente** | `/background` | Sfocare o sostituire lo sfondo del video | Webcam | MediaPipe Selfie Segmenter (`.tflite`) | Thread principale, GPU con ripiego su CPU |
| **Ricerca semantica** | `/semantic-search` | Cercare per significato in note e documenti | Testo incollato, file `.txt` e `.md` | Transformers.js, embeddings multilingue (ONNX) | Web Worker, CPU (WASM) o WebGPU |
| **OCR e dati personali** | `/pii-ocr` | Leggere un documento e oscurare i dati personali | Immagine | Tesseract.js e regole di riconoscimento | Worker di Tesseract |
| **Impostazioni modelli** | `/settings` | Scegliere, caricare e precaricare i modelli | URL, file locali, id di modello | n/d | n/d |

### Come si usano

| Sezione | Passi | Parametri regolabili | Limiti noti |
|---|---|---|---|
| Pinch & Scroll | 1. Avvia webcam. 2. Pizzica e tieni, poi muovi la mano per scorrere. 3. Pizzico rapido (meno di 450 ms, senza trascinare) per cliccare. | Velocità di scorrimento da 1× a 5× (predefinito 2,5×) | Funziona su una mano sola. Serve buona luce e una distanza di 40–60 cm. Il cursore agisce solo nell'area dimostrativa a destra. |
| Cursore con la testa | 1. Avvia webcam. 2. Premi «Calibra il centro» guardando lo schermo. 3. Muovi il viso. 4. Chiudi gli occhi per 0,5 secondi, oppure apri la bocca, per cliccare. | Modalità di clic, sensibilità da 2× a 10× (predefinita 5×) | Il puntatore funziona solo mentre la pagina è aperta e la camera attiva. La precisione è inferiore a quella di un mouse. |
| Sfondo intelligente | 1. Avvia webcam. 2. Scegli sfocato, colore pieno o immagine tua. | Intensità sfocatura da 4 a 40 px (predefinita 16), colore, immagine, inversione maschera | Bordi imprecisi con capelli o movimenti rapidi. `ctx.filter` può non funzionare su alcune versioni di Safari. |
| Ricerca semantica | 1. Aggiungi testo, file o gli esempi. 2. Scrivi una domanda. 3. Leggi i cinque risultati più vicini con il punteggio di somiglianza. | Modello, dispositivo e sorgente nelle Impostazioni | La prima indicizzazione scarica o carica il modello. Se cambi modello, i vecchi frammenti non vengono più cercati. |
| OCR e dati personali | 1. Scegli un'immagine. 2. Attendi la lettura. 3. Togli la spunta agli elementi che vuoi lasciare visibili. 4. Scarica l'immagine oscurata o copia il testo. | Lingue OCR e cartella dei dati lingua nelle Impostazioni | Riconosce solo formati noti. Nomi e indirizzi non vengono individuati. La qualità dipende dalla nitidezza dell'immagine. |

### Dati personali riconosciuti

| Tipo | Regola | Controllo di validità |
|---|---|---|
| Email | Espressione regolare | Nessuno |
| IBAN | Due lettere, due cifre e gruppi da quattro | Resto 97 (mod 97) |
| Codice fiscale | Formato italiano a 16 caratteri | Solo il formato |
| Carta di pagamento | Da 13 a 19 cifre, con spazi o trattini | Algoritmo di Luhn |
| Partita IVA | Undici cifre, con prefisso IT facoltativo | Cifra di controllo |
| Telefono | Cellulari italiani (3xx), fissi (0x) e numeri internazionali con prefisso | Solo il formato |
| Indirizzo IP | Quattro gruppi di cifre separati da punti | Solo il formato |

Le regole sono applicate in questo ordine. Se due corrispondenze si sovrappongono, vince quella delle regole più specifiche, applicate per prime.

---

## Avvio rapido

### Requisiti

- Node.js **22.22.3** o successivo (oppure 24.15 o successivo), come richiesto dall'Angular CLI 22.
- Un browser recente. Consigliato Chrome o Edge. WebGPU è facoltativo.
- Una webcam per le prime tre sezioni.
- La webcam richiede `localhost` oppure HTTPS.

### Comandi

```bash
npm install          # se uno script di installazione fallisce: npm install --ignore-scripts
npm run offline      # scarica i modelli e copia i runtime (vedi «Uso offline»)
npm start            # sviluppo su http://localhost:4200
```

| Comando | Effetto |
|---|---|
| `npm start` | Server di sviluppo con ricarica automatica |
| `npm run build` | Build di produzione in `dist/edge-ai-lab/browser` |
| `npm run offline` | Prepara gli asset locali (runtime WASM, modelli, dati lingua) |
| `npm run offline -- --webgpu` | Come sopra, più i pesi fp32 per WebGPU (circa 470 MB) |
| `npm run offline -- --skip-models` | Copia solo i runtime, senza scaricare i modelli |

Per servire la build di produzione basta un server statico qualsiasi:

```bash
npx serve dist/edge-ai-lab/browser
```

Alla prima apertura, vai in **Impostazioni modelli** e premi «Precarica tutti i modelli». Così le sezioni partono subito, senza attese al primo uso.

---

## Uso offline

Tutto ciò che serve a runtime viene servito dall'app stessa, senza CDN.

| Cosa | Dove sta | Come arriva |
|---|---|---|
| Runtime WASM di MediaPipe | `public/vendor/mediapipe/wasm/` | Copiato da `node_modules` |
| Runtime ONNX Runtime (WASM, varianti CPU e WebGPU) | `public/vendor/ort/` | Copiato da `node_modules` |
| Worker e core WASM di Tesseract | `public/vendor/tesseract/` e `public/vendor/tesseract-core/` | Copiati da `node_modules` |
| Dati lingua OCR (italiano, inglese) | `public/vendor/tessdata/` | Scaricati da GitHub |
| Modelli MediaPipe | `public/models/mediapipe/` | Scaricati da Google |
| Modello embeddings quantizzato (circa 120 MB) | `public/models/Xenova/paraphrase-multilingual-MiniLM-L12-v2/` | Scaricato da Hugging Face |

Lo script `scripts/prepare-offline.mjs` salta i file già presenti. Se un download fallisce, stampa l'indirizzo da cui scaricarlo a mano e termina con un codice di errore, così puoi rilanciarlo dopo aver sistemato la connessione.

Per altre lingue OCR aggiungi i file `.traineddata` **non compressi** in `public/vendor/tessdata/` e cambia le lingue nelle Impostazioni.

---

## Impostazioni modelli

La pagina `/settings` controlla come viene caricato il modello di ogni funzione. Le scelte vengono salvate nel browser e valgono dal prossimo avvio della funzione.

| Impostazione | Valori | Predefinito | Note |
|---|---|---|---|
| Sorgente MediaPipe (mano, viso, segmentazione) | URL oppure file sul computer | URL locale `/models/mediapipe/…` | Un URL viene scaricato una volta e tenuto nella Cache API. Un file viene salvato in IndexedDB. |
| Delegato MediaPipe | GPU, solo CPU | GPU | Se la GPU fallisce, l'app riprova da sola con la CPU. |
| Modello embeddings | id Hugging Face o nome cartella | `Xenova/paraphrase-multilingual-MiniLM-L12-v2` | Con la spunta «locale» viene letto da `public/models/<id>`. |
| Dispositivo embeddings | WebGPU, CPU (WASM) | CPU (WASM) | WebGPU usa i pesi fp32, la CPU i pesi quantizzati. |
| Modello locale | sì o no | sì | Togliendo la spunta serve internet per scaricare da Hugging Face. |
| Lingue OCR | codici Tesseract separati da `+` | `ita+eng` | |
| Cartella dati lingua OCR | percorso | `/vendor/tessdata` | Se vuota, Tesseract scarica da internet. |

Pulsanti disponibili: **Precarica tutti i modelli**, **Ripristina predefiniti**, **Svuota cache modelli**, **Carica ora** (per ogni modello). Ogni modello mostra uno stato: non caricato, in corso, pronto o errore. Lo stesso stato compare nel menu a sinistra come pallino colorato.

---

## Dettagli tecnici

### Stack

| Livello | Scelta |
|---|---|
| Framework | Angular 22, componenti standalone, signals, controllo del flusso `@if`, `@for`, `@switch`, `@let` |
| Change detection | Senza zone.js. Lo stato dell'interfaccia sta in signals. |
| Routing | Un percorso per sezione, caricato in modo pigro con `loadComponent` |
| Visione | `@mediapipe/tasks-vision` 0.10.21 |
| Embeddings | `@huggingface/transformers` in un Web Worker |
| OCR | `tesseract.js` |
| Build | `@angular/build` (esbuild), con `webWorkerTsConfig` per il worker |
| Linguaggio | TypeScript 6 |

### Struttura delle cartelle

```
edge-ai-lab/
├── public/
│   ├── models/                 modelli scaricati da `npm run offline`
│   └── vendor/                 runtime WASM, worker e dati lingua
├── scripts/
│   └── prepare-offline.mjs     copia i runtime e scarica i modelli
├── src/app/
│   ├── app.ts                  guscio dell'app: menu laterale e router outlet
│   ├── app.routes.ts           rotte pigre
│   ├── core/
│   │   ├── defaults.ts             tipi, impostazioni predefinite, testi degli slot
│   │   ├── settings.service.ts     impostazioni come signal, salvate in localStorage
│   │   ├── model-store.service.ts  stato dei modelli, cache e file locali
│   │   ├── idb.ts                  piccolo wrapper di IndexedDB
│   │   ├── camera.ts               webcam, ciclo di frame, utilità
│   │   ├── mediapipe.service.ts    creazione di mano, viso e segmentatore
│   │   ├── embedding.service.ts    ponte verso il worker degli embeddings
│   │   ├── embedding.worker.ts     pipeline Transformers.js
│   │   ├── semantic-index.service.ts  indice vettoriale e ricerca
│   │   ├── ocr.service.ts          worker Tesseract
│   │   └── pii.ts                  regole per i dati personali
│   └── features/               una cartella per sezione
└── tsconfig.worker.json        configurazione TypeScript del worker
```

### Flusso di caricamento di un modello

```
Impostazioni (signal)  ──►  ModelStore.load(slot)
                               │
              ┌────────────────┴────────────────┐
         sorgente = file                   sorgente = URL
         legge da IndexedDB                Cache API: se presente la usa,
                                           altrimenti scarica con avanzamento
              └────────────────┬────────────────┘
                               ▼
                     Uint8Array del modello
                               ▼
        MediaPipeService: createFromOptions({ modelAssetBuffer, delegate })
```

I modelli MediaPipe vengono quindi sempre creati da un buffer in memoria, qualunque sia la sorgente. Questo rende uniforme la gestione della cache e dei file locali.

### Dati salvati nel browser

| Dove | Nome | Contenuto |
|---|---|---|
| `localStorage` | `edge-ai-lab.settings.v2` | Impostazioni |
| Cache API | `edge-ai-models` | Modelli scaricati da URL |
| IndexedDB, archivio `models` | `edge-ai-lab` | File di modello scelti dall'utente |
| IndexedDB, archivio `chunks` | `edge-ai-lab` | Frammenti di testo e relativi vettori |

«Svuota cache modelli» cancella la Cache API e l'archivio `models`. Non tocca l'indice della ricerca semantica, che si svuota dalla sua pagina.

### Ciclo di inferenza sui video

Le sezioni con webcam usano `requestAnimationFrame`. A ogni frame l'app salta il giro se il video non ha un nuovo frame (`currentTime` invariato), poi chiama `detectForVideo` o `segmentForVideo` con `performance.now()` come marca temporale, che deve crescere sempre. Alla chiusura della pagina, o premendo «Ferma», vengono fermati il ciclo, la camera e il modello.

### Web Worker degli embeddings

Il worker riceve tre messaggi: `init` (crea la pipeline), `embed` (calcola i vettori) e risponde con `progress`, `ready`, `result` o `error`. Il servizio nel thread principale lo riavvia se cambiano modello, dispositivo o sorgente. I vettori sono normalizzati e calcolati con media dei token, quindi la similarità coseno coincide con il prodotto scalare.

---

## Dettaglio di ogni funzione

### Pinch & Scroll

- **Misura del pizzico.** La distanza tra la punta del pollice (punto 4) e quella dell'indice (punto 8) viene divisa per la distanza polso–base del medio (punti 0 e 9). Così il valore non dipende dalla distanza dalla camera.
- **Soglie con isteresi.** Il pizzico si attiva sotto 0,28 e si disattiva sopra 0,42, per evitare sfarfallii.
- **Cursore.** È il punto medio tra le due dita, specchiato in orizzontale, con il 12% di margine ritagliato su ogni lato per raggiungere i bordi, e levigato con un fattore 0,4.
- **Scorrimento.** Dopo uno spostamento di almeno 16 px, la posizione dello scorrimento segue il movimento verticale della mano moltiplicato per la velocità scelta.
- **Clic.** Alla fine di un pizzico più breve di 450 ms e senza trascinamento, viene cliccato il pulsante sotto il punto in cui il pizzico è iniziato.

### Cursore con la testa

- **Posizione.** Si usa la punta del naso (punto 1), specchiata. La posizione è relativa al centro calibrato e moltiplicata per la sensibilità. Il movimento verticale ha un fattore in più di 1,4. Il valore è levigato con 0,25.
- **Clic con gli occhi.** Conta il minore tra i punteggi `eyeBlinkLeft` e `eyeBlinkRight`. Sopra 0,55 per più di 500 ms scatta un clic, poi serve riaprire gli occhi. Gli ammiccamenti normali sono troppo brevi per attivarlo.
- **Clic con la bocca.** Scatta quando `jawOpen` supera 0,5, solo nel momento in cui la bocca si apre.
- **Bersaglio.** Il clic va all'elemento `button`, `a` o con `role="button"` sotto il puntatore, in qualsiasi punto della pagina.

### Sfondo intelligente

- **Maschera.** Il modello restituisce una maschera di categorie. Un valore maggiore di zero è considerato persona, zero è sfondo. «Inverti la maschera» scambia i due casi.
- **Composizione su canvas.** Prima si disegna lo sfondo scelto, poi la persona ritagliata con la maschera, con un bordo sfumato di 2 px, e sovrapposta.
- **Sfocatura.** Il video viene disegnato leggermente più grande del canvas, per evitare bordi trasparenti.
- **Immagine personale.** Viene adattata al riquadro mantenendo le proporzioni e ritagliando l'eccesso.
- **Prestazioni.** Un indicatore mostra i fotogrammi al secondo.

### Ricerca semantica

- **Frammentazione.** Il testo viene diviso per paragrafi e unito fino a circa 500 caratteri. I paragrafi più lunghi vengono spezzati per frasi.
- **Indicizzazione.** Ogni frammento viene trasformato in un vettore e salvato in IndexedDB con il modello che l'ha prodotto.
- **Ricerca.** La domanda diventa un vettore, viene confrontata con tutti i frammenti dello stesso modello e vengono mostrati i primi cinque.
- **Coerenza.** Se cambi modello, i frammenti creati con il precedente restano salvati ma non vengono cercati. L'interfaccia mostra quanti sono.
- **Formati.** File di testo semplice e Markdown. Per altri formati serve estrarre prima il testo.

### OCR e dati personali

- **Lettura.** Tesseract restituisce le parole con il rettangolo che le contiene.
- **Individuazione.** Le parole vengono unite in un unico testo, le regole cercano le corrispondenze e ogni corrispondenza viene riportata sulle parole che la compongono. Per questo anche un IBAN spezzato su più parole viene coperto per intero.
- **Oscuramento.** Sul canvas si disegna un rettangolo nero, con un piccolo margine, sopra ogni parola coinvolta.
- **Controllo.** Togliendo la spunta a un elemento, il riquadro sparisce subito e il testo oscurato si aggiorna.
- **Uscita.** Immagine PNG scaricabile e testo con i dati sostituiti da etichette come `[IBAN]` o `[EMAIL]`.

---

## Risoluzione dei problemi

| Sintomo | Causa probabile | Soluzione |
|---|---|---|
| «Webcam non disponibile» | Pagina aperta senza HTTPS | Usa `localhost` oppure HTTPS |
| Il browser non chiede il permesso alla webcam | Permesso negato in precedenza | Riabilitalo dalle impostazioni del sito |
| Errore di download del modello, anche con la rete attiva | File assenti in `public/models` | Esegui `npm run offline` |
| Errore strano durante la lettura di un modello locale | Il server restituisce la pagina `index.html` al posto del file mancante | Controlla il percorso del file in `public/` |
| La GPU non parte | Driver o browser non compatibili | Imposta il delegato su «Solo CPU» |
| Embeddings molto lenti | Esecuzione su CPU | Scarica i pesi con `--webgpu` e scegli WebGPU |
| Nello Sfondo vedi te sfocato | Maschera con valori scambiati | Spunta «Inverti la maschera» |
| `npm install` fallisce su `onnxruntime-node` | Script di installazione che scarica un file esterno | `npm install --ignore-scripts`: l'app usa solo la versione per browser |
| L'OCR non legge bene | Immagine sfocata o piccola | Usa una foto nitida e ben illuminata |
| Dopo una modifica alle impostazioni non cambia nulla | Il modello è già in uso | Ferma e riavvia la funzione |

---

## Come estendere l'app

**Aggiungere una nuova sezione**

1. Crea una cartella in `src/app/features/<nome>/` con un componente standalone.
2. Aggiungi un nuovo valore a `Slot` e una voce a `SLOT_INFO` in `core/defaults.ts`.
3. Registra la rotta in `app.routes.ts` e la voce nel menu in `app.ts`.
4. Se serve un modello, caricalo tramite `ModelStore` e aggiorna lo stato con `setStatus`.

**Riconoscere anche nomi e indirizzi.** Aggiungi nel worker una seconda pipeline `token-classification` con un modello NER multilingue e unisci i risultati a quelli di `detectPii` in `core/pii.ts`.

**Altre lingue per l'OCR.** Copia il file `.traineddata` in `public/vendor/tessdata/` e aggiungi il codice lingua nelle Impostazioni.

**Test.** Il progetto non include test automatici. Le parti più adatte a test unitari sono `core/pii.ts` e `splitText` in `core/semantic-index.service.ts`, perché sono funzioni pure.

---

## Privacy

L'elaborazione avviene nel browser: video, testi e immagini non vengono inviati a nessun server. L'unico traffico di rete possibile è il download iniziale dei modelli, che scompare del tutto seguendo la sezione [Uso offline](#uso-offline).
