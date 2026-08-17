// js/articoli.js
//
// Genera il codice articolo mnemonico (categoria + famiglia + variante) e
// crea gli articoli in modo sicuro anche con più operatori concorrenti,
// usando una transazione Firestore per riservare atomicamente il codice di
// famiglia — lo stesso tipo di soluzione già usata per il numero di bolla,
// per evitare il problema del "duplicate key" incontrato con AppSheet.

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  runTransaction,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const PAROLE_IGNORATE = new Set([
  "di", "da", "per", "il", "la", "lo", "i", "gli", "le", "un", "uno", "una",
  "e", "con", "in", "a", "x", "tg", "opuscolo",
]);

// Pura, senza effetti collaterali: estrae fino a 2 parole significative
// dalla descrizione e le tronca a 4 lettere ciascuna, in maiuscolo.
function generaMnemonico(descrizione) {
  const parole = (descrizione.match(/[A-Za-zÀ-ÿ']+/g) || []);
  const significative = parole.filter((p) => !PAROLE_IGNORATE.has(p.toLowerCase()));
  const scelte = (significative.length ? significative : parole).slice(0, 2);
  const mnemonico = scelte.map((p) => p.slice(0, 4).toUpperCase()).join("");
  return mnemonico || "ART";
}

function candidatoFamiglia(prefissoCategoria, mnemonico, tentativo) {
  const suffisso = tentativo > 1 ? String(tentativo) : "";
  return `${prefissoCategoria}-${mnemonico}${suffisso}`;
}

// Propone il codice (senza ancora riservarlo): utile per mostrarlo
// nell'anteprima modificabile prima del salvataggio, come deciso in fase di
// progettazione ("sì, meglio poterlo correggere a mano prima di salvare").
function proponiCodiceFamiglia(descrizione, prefissoCategoria) {
  return candidatoFamiglia(prefissoCategoria, generaMnemonico(descrizione), 1);
}

/**
 * Crea un nuovo articolo.
 *
 * @param {Object} dati
 * @param {string} dati.descrizione
 * @param {string} dati.categoriaId
 * @param {string} dati.prefissoCategoria
 * @param {number} dati.sogliaMinima
 * @param {boolean} dati.incideSuValore
 * @param {string|null} dati.variante           es. "M", "Blu" — null se nessuna variante
 * @param {string|null} dati.codiceFamigliaEsistente  se valorizzato, aggiunge una
 *        variante a una famiglia già esistente invece di crearne una nuova
 * @param {string|null} dati.codiceFamigliaProposto    codice mostrato/corretto
 *        dall'operatore in anteprima; se assente viene rigenerato ora
 */
async function creaArticolo(dati) {
  const {
    descrizione, categoriaId, prefissoCategoria, sogliaMinima,
    incideSuValore, variante, codiceFamigliaEsistente, codiceFamigliaProposto,
  } = dati;

  const codiceFinale = await runTransaction(window._fb.db, async (tx) => {
    let codiceFamiglia = codiceFamigliaEsistente;

    if (!codiceFamiglia) {
      // Fase di sola lettura: prova fino a 20 varianti del mnemonico finché
      // non trova un codice di famiglia libero. Tutte le letture avvengono
      // prima di qualunque scrittura, come richiesto dalle transazioni Firestore.
      const base = codiceFamigliaProposto || proponiCodiceFamiglia(descrizione, prefissoCategoria);
      let trovato = null;
      for (let tentativo = 1; tentativo <= 20; tentativo++) {
        const candidato = tentativo === 1 ? base : `${base}${tentativo}`;
        const ref = doc(window._fb.db, "famiglie", candidato);
        const snap = await tx.get(ref);
        if (!snap.exists()) { trovato = { ref, id: candidato }; break; }
      }
      if (!trovato) throw new Error("Non è stato possibile generare un codice univoco, riprova con una descrizione diversa.");
      codiceFamiglia = trovato.id;

      tx.set(trovato.ref, {
        descrizione: descrizione.trim(),
        categoria_id: categoriaId,
        creato_il: new Date().toISOString(),
      });
    }

    const codiceArticolo = variante ? `${codiceFamiglia}-${variante.trim().toUpperCase()}` : codiceFamiglia;
    const refArticolo = doc(window._fb.db, "articoli", codiceArticolo);
    const snapArticolo = await tx.get(refArticolo);
    if (snapArticolo.exists()) {
      throw new Error(`Il codice ${codiceArticolo} esiste già. Scegli una variante diversa.`);
    }

    tx.set(refArticolo, {
      descrizione: descrizione.trim(),
      categoria_id: categoriaId,
      codice_famiglia: codiceFamiglia,
      variante: variante ? variante.trim().toUpperCase() : null,
      soglia_minima: Number(sogliaMinima) || 0,
      incide_su_valore: !!incideSuValore,
      attivo: true,
      creato_il: new Date().toISOString(),
      creato_da: window._stato.utente.uid,
    });

    return codiceArticolo;
  });

  return codiceFinale;
}

async function modificaArticolo(codice, campi) {
  await updateDoc(doc(window._fb.db, "articoli", codice), campi);
}

// REGOLA 5 (cascade delete esplicito): disattivare un articolo NON cancella
// i movimenti collegati (restano per lo storico/valore), ma va impedito che
// compaia più nelle ricerche per nuovi movimenti.
async function disattivaArticolo(codice) {
  await updateDoc(doc(window._fb.db, "articoli", codice), { attivo: false });
}

async function elenco({ soloAttivi = true } = {}) {
  const tutti = await window._db.articoli.toArray();
  return soloAttivi ? tutti.filter((a) => a.attivo !== false) : tutti;
}

async function cerca(testo) {
  const t = testo.trim().toLowerCase();
  if (!t) return elenco();
  const tutti = await elenco();
  return tutti.filter(
    (a) => a.codice.toLowerCase().includes(t) || (a.descrizione || "").toLowerCase().includes(t)
  );
}

async function giacenza(codice) {
  return window._db.giacenze.get(codice);
}

window._articoli = {
  generaMnemonico, proponiCodiceFamiglia, creaArticolo, modificaArticolo,
  disattivaArticolo, elenco, cerca, giacenza,
};
