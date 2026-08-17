// js/importa.js
//
// Import da file Excel per sezioni e articoli, interamente client-side
// (SheetJS, la stessa libreria già usata altrove). Il flusso è in due tempi:
//   1) leggiFile(...) -> restituisce righe normalizzate + eventuali errori,
//      SENZA scrivere nulla (serve per l'anteprima)
//   2) importaSezioni(...) / importaArticoli(...) -> scrivono su Firestore
//      solo dopo la conferma dell'utente.
//
// Idempotente: sezioni e articoli usano una chiave stabile (ID sezione o
// codice articolo), quindi reimportare lo stesso file aggiorna i record
// esistenti invece di duplicarli.

import {
  collection,
  doc,
  setDoc,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// Legge il primo foglio di un file Excel e restituisce un array di oggetti,
// con le intestazioni di colonna normalizzate (minuscole, senza spazi).
function leggiFoglio(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: "array" });
  const primoFoglio = wb.Sheets[wb.SheetNames[0]];
  const righe = XLSX.utils.sheet_to_json(primoFoglio, { defval: "", raw: false });
  return righe.map((r) => {
    const norm = {};
    for (const chiave of Object.keys(r)) {
      norm[chiave.trim().toLowerCase()] = typeof r[chiave] === "string" ? r[chiave].trim() : r[chiave];
    }
    return norm;
  });
}

function leggiFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        resolve(leggiFoglio(e.target.result));
      } catch (err) {
        reject(new Error("File non leggibile. Assicurati che sia un .xlsx valido."));
      }
    };
    reader.onerror = () => reject(new Error("Impossibile leggere il file."));
    reader.readAsArrayBuffer(file);
  });
}

// ---------------------------------------------------------------------------
// SEZIONI
// Colonne attese (intestazioni, non sensibili a maiuscole): nome, email,
// telefono, referente. Solo "nome" è obbligatorio.
// ---------------------------------------------------------------------------
async function analizzaSezioni(file) {
  const righe = await leggiFile(file);
  const valide = [];
  const errori = [];
  righe.forEach((r, i) => {
    const nome = r["nome"] || "";
    if (!nome) {
      errori.push(`Riga ${i + 2}: manca il nome della sezione, saltata.`);
      return;
    }
    valide.push({
      nome,
      email: r["email"] || "",
      telefono: r["telefono"] || "",
      referente: r["referente"] || "",
    });
  });
  return { valide, errori };
}

async function importaSezioni(sezioni) {
  // Carico le sezioni esistenti per riconoscere quelle già presenti (per
  // nome) ed evitare duplicati su reimport.
  const snap = await getDocs(collection(window._fb.db, "sezioni"));
  const esistentiPerNome = new Map();
  snap.forEach((d) => esistentiPerNome.set((d.data().nome || "").toLowerCase(), d.id));

  let creati = 0, aggiornati = 0;
  for (const s of sezioni) {
    const idEsistente = esistentiPerNome.get(s.nome.toLowerCase());
    const ref = idEsistente ? doc(window._fb.db, "sezioni", idEsistente) : doc(collection(window._fb.db, "sezioni"));
    await setDoc(ref, s, { merge: true });
    idEsistente ? aggiornati++ : creati++;
  }
  return { creati, aggiornati };
}

// ---------------------------------------------------------------------------
// ARTICOLI
// Colonne attese: codice, descrizione, categoria, prefisso, soglia_minima,
// incide_su_valore. "codice" e "descrizione" obbligatori.
// Le categorie mancanti vengono create automaticamente (deciso in fase di
// progettazione), usando la coppia prefisso/categoria del file.
// ---------------------------------------------------------------------------
function siONo(v) {
  const s = String(v).trim().toLowerCase();
  return s === "si" || s === "sì" || s === "s" || s === "true" || s === "1" || s === "x";
}

async function analizzaArticoli(file) {
  const righe = await leggiFile(file);
  const valide = [];
  const errori = [];
  const codiciVisti = new Set();

  righe.forEach((r, i) => {
    const codice = (r["codice"] || "").toUpperCase();
    const descrizione = r["descrizione"] || "";
    if (!codice || !descrizione) {
      errori.push(`Riga ${i + 2}: manca codice o descrizione, saltata.`);
      return;
    }
    if (codiciVisti.has(codice)) {
      errori.push(`Riga ${i + 2}: codice ${codice} duplicato nel file, tenuta solo la prima occorrenza.`);
      return;
    }
    codiciVisti.add(codice);

    // Il prefisso: esplicito in colonna, oppure ricavato dal codice (parte
    // prima del primo trattino, es. ABB-FELPGAP-M -> ABB).
    const prefisso = (r["prefisso"] || codice.split("-")[0] || "").toUpperCase();
    // La variante: se il codice ha 3 segmenti (FAMIGLIA-XXX-VAR) l'ultimo è
    // la variante; per famiglia usiamo tutto tranne l'eventuale variante.
    const segmenti = codice.split("-");
    const variante = segmenti.length >= 3 ? segmenti[segmenti.length - 1] : null;
    const codiceFamiglia = variante ? segmenti.slice(0, -1).join("-") : codice;

    valide.push({
      codice,
      descrizione,
      categoria_nome: r["categoria"] || "",
      prefisso,
      codice_famiglia: codiceFamiglia,
      variante,
      soglia_minima: Number(r["soglia_minima"] || r["soglia"] || 0) || 0,
      incide_su_valore: r["incide_su_valore"] === "" ? true : siONo(r["incide_su_valore"]),
    });
  });
  return { valide, errori };
}

// Assicura che esista una categoria con il prefisso dato; se manca la crea.
// Restituisce l'id della categoria.
async function assicuraCategoria(prefisso, nome, cacheCategorie) {
  const chiave = prefisso.toUpperCase();
  if (cacheCategorie.has(chiave)) return cacheCategorie.get(chiave);

  const ref = doc(collection(window._fb.db, "categorie"));
  await setDoc(ref, { nome: nome || chiave, prefisso: chiave, creato_il: new Date().toISOString() });
  cacheCategorie.set(chiave, ref.id);
  return ref.id;
}

async function importaArticoli(articoli) {
  // Cache delle categorie esistenti, indicizzate per prefisso.
  const snapCat = await getDocs(collection(window._fb.db, "categorie"));
  const cacheCategorie = new Map();
  snapCat.forEach((d) => {
    const p = (d.data().prefisso || "").toUpperCase();
    if (p) cacheCategorie.set(p, d.id);
  });

  let creati = 0, aggiornati = 0, categorieCreate = 0;
  const prefissiIniziali = new Set(cacheCategorie.keys());

  // Rilevo gli articoli già esistenti (per codice = id documento).
  const snapArt = await getDocs(collection(window._fb.db, "articoli"));
  const codiciEsistenti = new Set();
  snapArt.forEach((d) => codiciEsistenti.add(d.id));

  for (const a of articoli) {
    const categoriaId = await assicuraCategoria(a.prefisso, a.categoria_nome, cacheCategorie);
    const ref = doc(window._fb.db, "articoli", a.codice);
    await setDoc(ref, {
      descrizione: a.descrizione,
      categoria_id: categoriaId,
      codice_famiglia: a.codice_famiglia,
      variante: a.variante,
      soglia_minima: a.soglia_minima,
      incide_su_valore: a.incide_su_valore,
      attivo: true,
      creato_il: new Date().toISOString(),
      creato_da: window._stato.utente.uid,
    }, { merge: true });
    codiciEsistenti.has(a.codice) ? aggiornati++ : creati++;
  }
  categorieCreate = cacheCategorie.size - prefissiIniziali.size;

  return { creati, aggiornati, categorieCreate };
}

window._importa = { analizzaSezioni, importaSezioni, analizzaArticoli, importaArticoli };
