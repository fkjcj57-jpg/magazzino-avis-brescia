// js/cruscotto.js — aggregazioni per la vista dashboard.
// Legge solo dati già derivati/sincronizzati in Dexie: nessuna chiamata a
// Firestore qui, così il cruscotto funziona anche offline.

async function riepilogo() {
  const [articoli, giacenze, richieste] = await Promise.all([
    window._db.articoli.toArray(),
    window._db.giacenze.toArray(),
    window._db.richieste.toArray(),
  ]);

  const giacenzeAttive = giacenze.filter((g) =>
    articoli.some((a) => a.codice === g.articolo_codice && a.attivo !== false)
  );

  const valoreTotale = giacenzeAttive.reduce((acc, g) => acc + (g.valore || 0), 0);
  const sottoSoglia = giacenzeAttive.filter((g) => g.sotto_soglia);
  const inAttesa = richieste.filter((r) => r.stato === "in_attesa" || r.stato === "evasa_parziale");

  return {
    numeroArticoli: articoli.filter((a) => a.attivo !== false).length,
    valoreTotale: Math.round(valoreTotale * 100) / 100,
    articoliSottoSoglia: sottoSoglia,
    richiesteInAttesa: inAttesa,
  };
}

async function dettaglioArticolo(codice) {
  const articolo = await window._db.articoli.get(codice);
  const giac = await window._db.giacenze.get(codice);
  return { articolo, giacenza: giac || { quantita: 0, valore: 0, sotto_soglia: 0 } };
}

window._cruscotto = { riepilogo, dettaglioArticolo };
