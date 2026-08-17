// js/movimenti.js

import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

async function creaCarico({ articoloCodice, quantita, prezzoUnitario, fornitoreId, note }) {
  const ref = doc(collection(window._fb.db, "movimenti"));
  await setDoc(ref, {
    tipo: "CARICO",
    articolo_codice: articoloCodice,
    quantita: Number(quantita),
    prezzo_unitario: prezzoUnitario === "" || prezzoUnitario == null ? null : Number(prezzoUnitario),
    fornitore_id: fornitoreId || null,
    note: note || "",
    data: new Date().toISOString(),
    creato_da: window._stato.utente.uid,
    creato_il: new Date().toISOString(),
  });
  return ref.id;
}

/**
 * Registra uno scarico. Non blocca mai per giacenza insufficiente (decisione
 * di progetto): l'avviso viene mostrato PRIMA in ui.js, chiedendo conferma
 * all'operatore; qui si assume che la conferma sia già stata data.
 */
async function creaScarico({
  articoloCodice, quantita, causale, richiestaId, sezioneId, omaggio, note,
}) {
  const ref = doc(collection(window._fb.db, "movimenti"));
  await setDoc(ref, {
    tipo: "SCARICO",
    articolo_codice: articoloCodice,
    quantita: Number(quantita),
    causale: causale || "altro", // richiesta_sezione | evento | progetto_scuola | altro
    richiesta_id: richiestaId || null,
    sezione_id: sezioneId || null,
    omaggio: !!omaggio,
    note: note || "",
    data: new Date().toISOString(),
    creato_da: window._stato.utente.uid,
    creato_il: new Date().toISOString(),
  });
  return ref.id;
}

function puoModificare(movimento) {
  const u = window._stato.utente;
  return u.ruolo === "responsabile" || movimento.creato_da === u.uid;
}

async function modifica(id, campi) {
  await updateDoc(doc(window._fb.db, "movimenti", id), campi);
}

async function elimina(id) {
  await deleteDoc(doc(window._fb.db, "movimenti", id));
}

async function storicoArticolo(articoloCodice) {
  const tutti = await window._db.movimenti.where({ articolo_codice: articoloCodice }).toArray();
  return tutti.sort((a, b) => (a.data < b.data ? 1 : -1));
}

async function ultimiMovimenti(n = 20) {
  const tutti = await window._db.movimenti.toArray();
  return tutti.sort((a, b) => (a.data < b.data ? 1 : -1)).slice(0, n);
}

window._movimenti = { creaCarico, creaScarico, puoModificare, modifica, elimina, storicoArticolo, ultimiMovimenti };
