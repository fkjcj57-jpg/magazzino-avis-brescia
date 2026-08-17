// js/richieste.js

import {
  collection,
  doc,
  setDoc,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

async function crea({ sezioneId, articoloCodice, quantitaRichiesta, note }) {
  const ref = doc(collection(window._fb.db, "richieste"));
  await setDoc(ref, {
    sezione_id: sezioneId,
    articolo_codice: articoloCodice,
    quantita_richiesta: Number(quantitaRichiesta),
    quantita_evasa: 0,
    stato: "in_attesa",
    note: note || "",
    data_richiesta: new Date().toISOString(),
    creato_da: window._stato.utente.uid,
  });
  return ref.id;
}

/**
 * Evade (in tutto o in parte) una richiesta: crea il movimento di scarico
 * collegato e aggiorna lo stato della richiesta di conseguenza.
 */
async function evadi(richiestaId, { quantitaConsegnata, omaggio, note }) {
  const richiesta = await window._db.richieste.get(richiestaId);
  if (!richiesta) throw new Error("Richiesta non trovata.");

  const idMovimento = await window._movimenti.creaScarico({
    articoloCodice: richiesta.articolo_codice,
    quantita: quantitaConsegnata,
    causale: "richiesta_sezione",
    richiestaId,
    sezioneId: richiesta.sezione_id,
    omaggio,
    note,
  });

  const nuovaQuantitaEvasa = (richiesta.quantita_evasa || 0) + Number(quantitaConsegnata);
  const nuovoStato = nuovaQuantitaEvasa >= richiesta.quantita_richiesta ? "evasa" : "evasa_parziale";

  await updateDoc(doc(window._fb.db, "richieste", richiestaId), {
    quantita_evasa: nuovaQuantitaEvasa,
    stato: nuovoStato,
    ultimo_movimento_id: idMovimento,
  });

  return { idMovimento, nuovoStato };
}

async function annulla(richiestaId, motivo) {
  await updateDoc(doc(window._fb.db, "richieste", richiestaId), {
    stato: "annullata",
    motivo_annullamento: motivo || "",
  });
}

async function inAttesa() {
  const tutte = await window._db.richieste.toArray();
  return tutte
    .filter((r) => r.stato === "in_attesa" || r.stato === "evasa_parziale")
    .sort((a, b) => (a.data_richiesta > b.data_richiesta ? 1 : -1));
}

async function storico() {
  const tutte = await window._db.richieste.toArray();
  return tutte.sort((a, b) => (a.data_richiesta < b.data_richiesta ? 1 : -1));
}

window._richieste = { crea, evadi, annulla, inAttesa, storico };
