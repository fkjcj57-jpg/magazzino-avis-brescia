// js/sync.js
//
// Ascolta le collezioni Firestore e le specchia in Dexie (REGOLA 4: parte
// solo dopo l'autenticazione, chiamato da auth.js). Ogni volta che arrivano
// nuovi dati, ricalcola le giacenze (REGOLA 6: i dati derivati locali non si
// sincronizzano da soli, vanno rigenerati esplicitamente).

import {
  collection,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

let unsubscribers = [];

const COLLEZIONI = [
  { nome: "categorie", tabella: "categorie", chiave: "id" },
  { nome: "articoli", tabella: "articoli", chiave: "codice" },
  { nome: "movimenti", tabella: "movimenti", chiave: "id" },
  { nome: "richieste", tabella: "richieste", chiave: "id" },
  { nome: "sezioni", tabella: "sezioni", chiave: "id" },
  { nome: "fornitori", tabella: "fornitori", chiave: "id" },
  { nome: "bolle", tabella: "bolle", chiave: "id" },
];

// La collezione "utenti" è leggibile in elenco solo dal Responsabile (vedi
// firestore.rules): la aggiungiamo alla sincronizzazione solo per lui,
// altrimenti l'Operatore riceverebbe un errore permission-denied.
function collezioniPerRuolo() {
  const base = [...COLLEZIONI];
  if (window._stato.utente?.ruolo === "responsabile") {
    base.push({ nome: "utenti", tabella: "utenti", chiave: "uid" });
  }
  return base;
}

function avviaListener() {
  fermaListener(); // idempotente: se già attivi, riparte pulito

  collezioniPerRuolo().forEach(({ nome, tabella, chiave }) => {
    const unsub = onSnapshot(
      collection(window._fb.db, nome),
      async (snapshot) => {
        await window._db.transaction("rw", window._db[tabella], async () => {
          for (const change of snapshot.docChanges()) {
            const dato = { ...change.doc.data(), [chiave]: change.doc.id };
            if (change.type === "removed") {
              await window._db[tabella].delete(change.doc.id);
            } else {
              await window._db[tabella].put(dato);
            }
          }
        });
        await ricalcolaDatiDerivati();
        _aggiornaUI();
      },
      (errore) => {
        console.error(`Errore listener ${nome}:`, errore);
      }
    );
    unsubscribers.push(unsub);
  });
}

function fermaListener() {
  unsubscribers.forEach((u) => u());
  unsubscribers = [];
}

// --- Ricalcolo dati derivati locali (giacenza + valore FIFO) ---
// REGOLA 6: va richiamato ogni volta che cambia qualcosa in movimenti o
// articoli. Consuma i lotti di carico in ordine cronologico (FIFO) per
// determinare quanto residuo (e quindi quanto valore) resta di ciascun lotto.
async function ricalcolaDatiDerivati() {
  const articoli = await window._db.articoli.toArray();
  const movimenti = await window._db.movimenti.toArray();

  const nuoveGiacenze = [];

  for (const art of articoli) {
    const movArticolo = movimenti
      .filter((m) => m.articolo_codice === art.codice)
      .sort((a, b) => (a.data > b.data ? 1 : -1));

    const carichi = movArticolo
      .filter((m) => m.tipo === "CARICO")
      .map((m) => ({ id: m.id, residuo: m.quantita, prezzo: m.prezzo_unitario || 0 }));

    const scarichi = movArticolo.filter((m) => m.tipo === "SCARICO");

    for (const s of scarichi) {
      let daConsumare = s.quantita;
      for (const lotto of carichi) {
        if (daConsumare <= 0) break;
        const preso = Math.min(lotto.residuo, daConsumare);
        lotto.residuo -= preso;
        daConsumare -= preso;
      }
      // daConsumare > 0 qui significa scarico oltre la giacenza disponibile:
      // è stato permesso con avviso (vedi movimenti.js), la giacenza scende
      // sotto zero sull'ultimo lotto figurativo, non blocchiamo il calcolo.
      if (daConsumare > 0 && carichi.length > 0) {
        carichi[carichi.length - 1].residuo -= daConsumare;
      }
    }

    const quantitaTotale = carichi.reduce((acc, l) => acc + l.residuo, 0);
    const valoreTotale = art.incide_su_valore
      ? carichi.reduce((acc, l) => acc + l.residuo * l.prezzo, 0)
      : 0;

    nuoveGiacenze.push({
      articolo_codice: art.codice,
      quantita: quantitaTotale,
      valore: Math.round(valoreTotale * 100) / 100,
      sotto_soglia: quantitaTotale < (art.soglia_minima ?? 0) ? 1 : 0,
    });
  }

  await window._db.giacenze.clear();
  await window._db.giacenze.bulkPut(nuoveGiacenze);
}

window._sync = { avviaListener, fermaListener, ricalcolaDatiDerivati };
