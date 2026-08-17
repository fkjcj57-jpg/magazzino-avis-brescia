// js/db.js — schema locale Dexie (IndexedDB)
//
// Le collezioni "sorgente" (articoli, movimenti, richieste, sezioni,
// fornitori, categorie, utenti) sono mirror locali di Firestore, tenute
// aggiornate dai listener onSnapshot in sync.js.
//
// La tabella "giacenze" è invece un DATO DERIVATO LOCALE (REGOLA VINCOLANTE
// 6): non arriva da Firestore, viene ricalcolata interamente ogni volta che
// cambia qualcosa in movimenti o articoli, applicando la logica FIFO.

const db = new Dexie("magazzino_avis_brescia");

db.version(1).stores({
  utenti: "uid, ruolo",
  categorie: "id, prefisso",
  articoli: "codice, categoria_id, famiglia, attivo",
  movimenti: "id, tipo, articolo_codice, data, richiesta_id, creato_da",
  richieste: "id, sezione_id, articolo_codice, stato, data_richiesta",
  sezioni: "id, nome",
  fornitori: "id, ragione_sociale",
  bolle: "id, numero, anno, richiesta_id, sezione_id",

  // dato derivato locale, non sincronizzato con Firestore
  giacenze: "articolo_codice, sotto_soglia",

  // coda di scritture create offline, in attesa di essere inviate a
  // Firestore appena torna la connessione (usata dai contatori, che
  // richiedono una transazione online — vedi contatori.js)
  coda_offline: "++id, tipo, creato_il",
});

window._db = db;
