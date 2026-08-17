// js/sezioni.js — anagrafica delle sedi/sezioni AVIS destinatarie del materiale

import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

async function elenco() {
  const tutte = await window._db.sezioni.toArray();
  return tutte.sort((a, b) => a.nome.localeCompare(b.nome));
}

async function crea({ nome, email, telefono, referente }) {
  const ref = doc(collection(window._fb.db, "sezioni"));
  await setDoc(ref, { nome: nome.trim(), email: email || "", telefono: telefono || "", referente: referente || "" });
  return ref.id;
}

async function modifica(id, campi) {
  await updateDoc(doc(window._fb.db, "sezioni", id), campi);
}

// REGOLA 5 (cascade delete esplicito): prima di eliminare, l'interfaccia
// (ui.js) deve verificare che non esistano richieste collegate a questa
// sezione; qui esponiamo solo l'operazione di eliminazione vera e propria.
async function elimina(id) {
  await deleteDoc(doc(window._fb.db, "sezioni", id));
}

window._sezioni = { elenco, crea, modifica, elimina };
