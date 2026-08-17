// js/contatori.js
//
// Contatori atomici lato server, per evitare il problema del "duplicate key"
// già incontrato con AppSheet quando più operatori scrivono quasi in
// contemporanea. Richiedono una transazione Firestore, quindi richiedono
// connessione: se offline, la generazione di un nuovo numero di bolla non è
// possibile (l'operatore può comunque evadere la richiesta e stampare la
// bolla appena torna online).

import {
  doc,
  runTransaction,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// Incrementa e restituisce il numero successivo di un contatore generico
// identificato da `chiave` (es. "bolla_2026"). Crea il documento se non esiste.
async function prossimoNumero(chiave) {
  const ref = doc(window._fb.db, "contatori", chiave);
  const nuovoValore = await runTransaction(window._fb.db, async (tx) => {
    const snap = await tx.get(ref);
    const attuale = snap.exists() ? snap.data().ultimo_numero || 0 : 0;
    const nuovo = attuale + 1;
    tx.set(ref, { ultimo_numero: nuovo }, { merge: true });
    return nuovo;
  });
  return nuovoValore;
}

// Numero di bolla: riparte da 1 ogni anno solare (formato N/anno).
async function prossimoNumeroBolla(anno) {
  const numero = await prossimoNumero(`bolla_${anno}`);
  return { numero, anno };
}

window._contatori = { prossimoNumero, prossimoNumeroBolla };
