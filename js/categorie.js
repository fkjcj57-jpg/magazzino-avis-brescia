// js/categorie.js — anagrafica categorie (es. Abbigliamento -> ABB)
// Gestita solo dal Responsabile (le regole di sicurezza lo impongono anche
// lato server, qui solo lato client per l'interfaccia).

import {
  collection,
  doc,
  setDoc,
  deleteDoc,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

async function elenco() {
  return window._db.categorie.toArray();
}

async function crea({ nome, prefisso }) {
  const prefissoNorm = prefisso.trim().toUpperCase();
  const ref = doc(collection(window._fb.db, "categorie"));
  await setDoc(ref, {
    nome: nome.trim(),
    prefisso: prefissoNorm,
    creato_il: new Date().toISOString(),
  });
  return ref.id;
}

async function elimina(id) {
  // Nota: nessuna cascade-delete automatica sugli articoli esistenti
  // (REGOLA 5) — l'interfaccia deve impedire l'eliminazione di una categoria
  // ancora in uso, controllo implementato in ui.js prima di chiamare questa
  // funzione.
  await deleteDoc(doc(window._fb.db, "categorie", id));
}

window._categorie = { elenco, crea, elimina };
