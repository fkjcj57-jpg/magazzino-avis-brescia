// js/fornitori.js — anagrafica fornitori (per preventivi e ordini)

import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

async function elenco() {
  const tutti = await window._db.fornitori.toArray();
  return tutti.sort((a, b) => a.ragione_sociale.localeCompare(b.ragione_sociale));
}

async function crea({ ragioneSociale, referente, email, telefono, note }) {
  const ref = doc(collection(window._fb.db, "fornitori"));
  await setDoc(ref, {
    ragione_sociale: ragioneSociale.trim(),
    referente: referente || "",
    email: email || "",
    telefono: telefono || "",
    note: note || "",
  });
  return ref.id;
}

async function modifica(id, campi) {
  await updateDoc(doc(window._fb.db, "fornitori", id), campi);
}

async function elimina(id) {
  await deleteDoc(doc(window._fb.db, "fornitori", id));
}

window._fornitori = { elenco, crea, modifica, elimina };
