# Magazzino AVIS Brescia

PWA per la gestione del magazzino materiale promozionale di AVIS Provinciale
Brescia. Segue lo stack tecnico standard AVIS (vedi
`istruzioni-progetto-stack-avis.md` nel progetto): HTML/CSS/JS vanilla,
Dexie.js (IndexedDB) per l'offline, Firebase Firestore + Authentication per
il cloud, hosting su GitHub Pages.

## Stato di questo scheletro

Questo è un impianto tecnico **funzionante e completo nella struttura**, ma
alcune parti sono volutamente semplici e vanno rifinite con l'uso reale:

- ✅ Completi: autenticazione, sincronizzazione offline-first, generazione
  codice articolo (famiglia + variante), contatori atomici (codice articolo,
  numero bolla), logica FIFO di valorizzazione, generazione PDF bolla,
  regole di sicurezza per ruolo.
- ⚠️ Da rifinire con l'uso: validazioni dei form (oggi minime), gestione
  errori di rete più granulare, eventuale paginazione dello storico quando
  crescerà, modifica/annullamento più ricca delle richieste.
- 🖼️ Le icone in `icons/` sono segnaposto generati automaticamente (una
  goccia rossa stilizzata). Vanno sostituite con un'icona ufficiale AVIS
  quando disponibile, mantenendo le stesse dimensioni (192, 512, 512 maskable).

## 1. Creare il progetto Firebase

1. Vai su [console.firebase.google.com](https://console.firebase.google.com) → crea un nuovo progetto (es. `magazzino-avis-brescia`).
2. **Authentication** → Sign-in method → abilita **Email/Password**.
   Nessuna registrazione autonoma dal login: gli account si creano solo dal
   Responsabile. **Il primissimo Responsabile** va creato a mano da qui
   (Authentication → Users → "Add user"), perché per usare la creazione
   utenti integrata nell'app serve già essere loggati come Responsabile.
   Tutti gli account successivi (altri Responsabili, Operatori) si creano
   invece comodamente dalla vista "Utenti" dentro l'app stessa.
3. **Firestore Database** → crea database (modalità produzione, scegli la
   region europea più vicina, es. `eur3`).
4. Per il primissimo Responsabile creato al punto 2, crea a mano anche il
   documento di profilo corrispondente in Firestore, collezione `utenti`,
   **con id documento uguale allo UID dell'utente** (lo trovi in
   Authentication → Users, dopo averlo creato):
   ```
   utenti/{uid}
     nome: "Mario Rossi"
     ruolo: "responsabile"
   ```
   Senza questo documento l'utente si autentica ma l'app lo respinge (vedi
   `js/auth.js`) chiedendo di contattare il Responsabile. Per tutti gli
   account creati dopo, dalla vista "Utenti" dell'app, questo passaggio è
   automatico: non serve toccare più la Console.
5. Project settings → Le tue app → aggiungi una **Web app** → copia i valori
   di configurazione e incollali in `js/firebase-init.js` al posto dei
   segnaposto `INSERIRE_...`. Non sono valori segreti: la sicurezza reale è
   demandata alle Firestore Security Rules.

## 2. Pubblicare le regole di sicurezza

Con la [Firebase CLI](https://firebase.google.com/docs/cli):

```bash
npm install -g firebase-tools
firebase login
firebase init firestore   # collega il progetto, punta a firestore.rules
firebase deploy --only firestore:rules
```

In alternativa puoi incollare il contenuto di `firestore.rules` direttamente
nella console Firebase → Firestore Database → Regole.

## 3. Popolare le prime anagrafiche

Ordine consigliato al primo avvio (da fare come Responsabile):

1. **Categorie** (es. Abbigliamento → `ABB`, Gadget e oggettistica → `GAD`,
   Materiale informativo → `OPU`, Tessere e documenti → `DOC`) — vedi il
   foglio "Categorie proposte" nel file Excel di ricodifica già preparato.
2. **Sezioni** (le sedi AVIS destinatarie del materiale, con la loro email).
3. **Fornitori**.
4. **Articoli** — puoi usare come riferimento il foglio "Mappa codici
   vecchio-nuovo" del file Excel per non perdere nessun articolo esistente.
   Per ogni **primo carico** di un articolo appena creato, registra subito
   un movimento di carico con la quantità e il prezzo reali, altrimenti
   l'articolo resterà a giacenza zero.

## 4. Provare in locale

Serve un server HTTP qualsiasi (i service worker non funzionano da `file://`):

```bash
cd magazzino-avis
python3 -m http.server 8080
# oppure: npx serve .
```

Apri `http://localhost:8080`.

## 5. Pubblicare su GitHub Pages

1. Crea un repository GitHub e carica tutto il contenuto di questa cartella
   nella radice del repo (non in una sottocartella `docs/`, a meno di
   configurare Pages di conseguenza).
2. Repository → Settings → Pages → Source: `main`, cartella `/ (root)`.
3. L'app sarà raggiungibile su `https://<utente>.github.io/<nome-repo>/`.
   Tutti i percorsi nel progetto sono già relativi (`./`), quindi funziona
   correttamente anche in questa sottocartella.

### Ad ogni deploy successivo

**Prima di ogni pubblicazione che modifica HTML/JS/CSS**, incrementa
`CACHE_NAME` in `sw.js` (es. `magazzino-avis-v1` → `v2`), altrimenti gli
utenti restano bloccati sulla versione precedente in cache (regola vincolante
già causa di problemi in AVIS Flotta).

Se qualcuno ha già aggiunto l'app alla schermata home, **la shortcut PWA non
si aggiorna da sola dopo un deploy importante**: va rimossa e ri-aggiunta.

## Struttura del progetto

```
magazzino-avis/
├── index.html              shell dell'app, tutte le viste
├── manifest.json            manifest PWA (percorsi relativi)
├── sw.js                    service worker (cache versionata, network-first)
├── firestore.rules          regole di sicurezza per ruolo
├── css/style.css
├── icons/                   icone PWA (segnaposto da sostituire)
└── js/
    ├── firebase-init.js     init Firebase, namespace window._fb
    ├── db.js                schema Dexie (mirror locale + dati derivati)
    ├── auth.js               login/logout, stato utente, _aggiornaUI centrale
    ├── sync.js                listener Firestore -> Dexie, ricalcolo giacenze FIFO
    ├── contatori.js          contatori atomici (transazioni Firestore)
    ├── categorie.js / articoli.js / movimenti.js / richieste.js
    │   / sezioni.js / fornitori.js / bolla.js / utenti.js    logica di dominio
    ├── cruscotto.js          aggregazioni per la dashboard
    ├── ui.js                  rendering delle viste
    └── app.js                 punto di ingresso
```

## Note tecniche da ricordare

- **Codice articolo**: generato da categoria + parole significative della
  descrizione (es. `ABB-FELPGAP-M`), con anteprima modificabile prima del
  salvataggio. La generazione è atomica (transazione Firestore) per evitare
  collisioni tra operatori concorrenti.
- **Valorizzazione magazzino**: FIFO, ricalcolata interamente ad ogni
  variazione dei movimenti (vedi `ricalcolaDatiDerivati()` in `sync.js`).
  Gli articoli con `incide_su_valore: false` restano tracciati ma esclusi
  dal totale.
- **Contatori** (codice articolo, numero bolla): richiedono connessione,
  perché si basano su una transazione Firestore. Offline, l'operatore può
  comunque registrare movimenti su articoli già esistenti, ma non creare
  nuovi articoli o generare nuove bolle finché non torna online.
- **Bolla di consegna**: PDF generato in locale (jsPDF), invio via email
  manuale — nessuna Cloud Function necessaria.
- **Gestione utenti**: la creazione di nuovi account (dopo il primissimo
  Responsabile, creato a mano) avviene interamente dentro l'app, tramite
  un'istanza Firebase secondaria e temporanea che non interferisce con la
  sessione di chi sta creando l'utente — vedi `js/utenti.js`. Ogni utente
  può cambiare la propria password dalla vista "Il mio account"; la
  Console Firebase resta necessaria solo per l'eliminazione definitiva di
  un account (il client non ha i permessi di amministrazione richiesti).
