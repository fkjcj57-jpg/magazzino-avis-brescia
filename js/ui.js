// js/ui.js
//
// REGOLA VINCOLANTE 8: tutte le transizioni di stato passano da qui.
// _aggiornaUI() è idempotente: può essere richiamata quante volte serve
// (dopo login/logout, dopo ogni sync, dopo ogni azione) senza effetti
// collaterali indesiderati — semplicemente ridisegna lo stato corrente.

const VISTE_SOLO_RESPONSABILE = ["articoli", "categorie", "sezioni", "fornitori", "utenti", "export"];

function _aggiornaUI() {
  const loggato = !!window._stato.utente;
  document.getElementById("view-login").classList.toggle("attiva", !loggato);
  document.getElementById("view-login").classList.toggle("nascosto", loggato);
  document.getElementById("app-shell").classList.toggle("nascosto", !loggato);
  if (!loggato) return;

  const ruolo = window._stato.utente.ruolo;
  document.getElementById("utente-nome").textContent = window._stato.utente.nome;
  document.getElementById("utente-ruolo").textContent = ruolo === "responsabile" ? "Responsabile" : "Operatore";

  document.querySelectorAll("[data-vista]").forEach((btn) => {
    const vista = btn.dataset.vista;
    const nascondi = VISTE_SOLO_RESPONSABILE.includes(vista) && ruolo !== "responsabile";
    btn.hidden = nascondi;
    btn.classList.toggle("attivo", vista === window._stato.vistaAttiva);
  });

  document.querySelectorAll("#app-shell .view").forEach((el) => el.classList.remove("attiva"));
  const viewEl = document.getElementById(`view-${window._stato.vistaAttiva}`);
  if (viewEl) viewEl.classList.add("attiva");

  const render = RENDER[window._stato.vistaAttiva];
  if (render) render();
}

function cambiaVista(nome) {
  window._stato.vistaAttiva = nome;
  _aggiornaUI();
}

// --- helper di formattazione ---
const euro = (v) => (v ?? 0).toLocaleString("it-IT", { style: "currency", currency: "EUR" });
const dataBreve = (iso) => new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
const badgeStato = {
  in_attesa: '<span class="badge badge-attesa">in attesa</span>',
  evasa: '<span class="badge badge-evasa">evasa</span>',
  evasa_parziale: '<span class="badge badge-parziale">parziale</span>',
  annullata: '<span class="badge badge-annullata">annullata</span>',
};

// ============================= CRUSCOTTO =============================
async function renderCruscotto() {
  const el = document.getElementById("view-cruscotto");
  const r = await window._cruscotto.riepilogo();
  el.innerHTML = `
    <h1>Cruscotto</h1>
    <div class="griglia-metriche">
      <div class="metrica"><div class="valore">${r.numeroArticoli}</div><div class="etichetta">Articoli attivi</div></div>
      <div class="metrica"><div class="valore">${euro(r.valoreTotale)}</div><div class="etichetta">Valore magazzino</div></div>
      <div class="metrica"><div class="valore">${r.richiesteInAttesa.length}</div><div class="etichetta">Richieste in attesa</div></div>
      <div class="metrica"><div class="valore">${r.articoliSottoSoglia.length}</div><div class="etichetta">Sotto scorta minima</div></div>
    </div>

    <h3>Sotto scorta minima</h3>
    <div class="card">${await renderListaSottoSoglia(r.articoliSottoSoglia)}</div>

    <h3>Richieste in attesa</h3>
    <div class="card">${await renderListaRichiesteBreve(r.richiesteInAttesa.slice(0, 6))}</div>
  `;
}

async function renderListaSottoSoglia(elenco) {
  if (!elenco.length) return '<div class="stato-vuoto"><i class="ti ti-check"></i>Tutto sopra soglia.</div>';
  const righe = await Promise.all(elenco.map(async (g) => {
    const art = await window._db.articoli.get(g.articolo_codice);
    return `<div class="lista-riga alert">
      <div><div class="titolo">${art?.descrizione || g.articolo_codice}</div><div class="sottotitolo">${g.articolo_codice}</div></div>
      <span class="badge badge-alert">${g.quantita} pz (min. ${art?.soglia_minima ?? 0})</span>
    </div>`;
  }));
  return righe.join("");
}

async function renderListaRichiesteBreve(elenco) {
  if (!elenco.length) return '<div class="stato-vuoto"><i class="ti ti-inbox"></i>Nessuna richiesta in attesa.</div>';
  const righe = await Promise.all(elenco.map(async (r) => {
    const sezione = await window._db.sezioni.get(r.sezione_id);
    const art = await window._db.articoli.get(r.articolo_codice);
    return `<div class="lista-riga">
      <div><div class="titolo">${sezione?.nome || "—"}</div><div class="sottotitolo">${art?.descrizione || r.articolo_codice} · ${r.quantita_richiesta} pz</div></div>
      ${badgeStato[r.stato]}
    </div>`;
  }));
  return righe.join("");
}

// ============================= RICHIESTE =============================
async function renderRichieste() {
  const el = document.getElementById("view-richieste");
  const elenco = await window._richieste.inAttesa();
  const righe = await Promise.all(elenco.map(async (r) => {
    const sezione = await window._db.sezioni.get(r.sezione_id);
    const art = await window._db.articoli.get(r.articolo_codice);
    const residuo = r.quantita_richiesta - (r.quantita_evasa || 0);
    return `<div class="lista-riga">
      <div>
        <div class="titolo">${sezione?.nome || "—"}</div>
        <div class="sottotitolo">${art?.descrizione || r.articolo_codice} · richiesti ${r.quantita_richiesta}, residuo ${residuo}</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        ${badgeStato[r.stato]}
        <button class="btn btn-primario" onclick="apriEvasione('${r.id}')">Evadi</button>
      </div>
    </div>`;
  }));

  el.innerHTML = `
    <div class="flex-tra"><h1>Richieste</h1><button class="btn btn-primario" onclick="apriNuovaRichiesta()"><i class="ti ti-plus"></i>Nuova</button></div>
    <div class="card">${righe.join("") || '<div class="stato-vuoto"><i class="ti ti-inbox"></i>Nessuna richiesta aperta.</div>'}</div>
  `;
}

async function apriNuovaRichiesta() {
  const sezioni = await window._sezioni.elenco();
  const articoli = await window._articoli.elenco();
  const html = `
    <div class="card">
      <h2>Nuova richiesta</h2>
      <label>Sezione</label>
      <select id="nr-sezione">${sezioni.map((s) => `<option value="${s.id}">${s.nome}</option>`).join("")}</select>
      <label>Articolo</label>
      <select id="nr-articolo">${articoli.map((a) => `<option value="${a.codice}">${a.descrizione} (${a.codice})</option>`).join("")}</select>
      <label>Quantità richiesta</label>
      <input type="number" id="nr-quantita" min="1" value="1">
      <label>Note</label>
      <textarea id="nr-note"></textarea>
      <div class="griglia-2" style="margin-top:16px">
        <button class="btn" onclick="cambiaVista('richieste')">Annulla</button>
        <button class="btn btn-primario" onclick="salvaNuovaRichiesta()">Salva</button>
      </div>
    </div>`;
  document.getElementById("view-richieste").innerHTML = html;
}

async function salvaNuovaRichiesta() {
  await window._richieste.crea({
    sezioneId: document.getElementById("nr-sezione").value,
    articoloCodice: document.getElementById("nr-articolo").value,
    quantitaRichiesta: document.getElementById("nr-quantita").value,
    note: document.getElementById("nr-note").value,
  });
  cambiaVista("richieste");
}

async function apriEvasione(richiestaId) {
  const richiesta = await window._db.richieste.get(richiestaId);
  const art = await window._db.articoli.get(richiesta.articolo_codice);
  const giac = await window._db.giacenze.get(richiesta.articolo_codice);
  const sezione = await window._db.sezioni.get(richiesta.sezione_id);
  const residuo = richiesta.quantita_richiesta - (richiesta.quantita_evasa || 0);
  const disponibile = giac?.quantita ?? 0;

  document.getElementById("view-richieste").innerHTML = `
    <div class="card">
      <h2>Evadi richiesta</h2>
      <p class="sottotitolo">${sezione?.nome} — ${art?.descrizione}</p>
      ${disponibile < residuo ? `<div class="avviso avviso-ambra"><i class="ti ti-alert-triangle"></i>Giacenza disponibile (${disponibile}) inferiore al residuo richiesto (${residuo}). Puoi comunque procedere.</div>` : ""}
      <label>Quantità da consegnare ora</label>
      <input type="number" id="ev-quantita" min="1" max="${residuo}" value="${Math.min(residuo, disponibile > 0 ? disponibile : residuo)}">
      <label><input type="checkbox" id="ev-omaggio" style="width:auto;display:inline-block;margin-right:6px">Consegna a titolo di omaggio (nessun addebito in bolla)</label>
      <label>Note</label>
      <textarea id="ev-note"></textarea>
      <div class="griglia-2" style="margin-top:16px">
        <button class="btn" onclick="cambiaVista('richieste')">Annulla</button>
        <button class="btn btn-primario" onclick="confermaEvasione('${richiestaId}')">Conferma e genera bolla</button>
      </div>
    </div>`;
}

async function confermaEvasione(richiestaId) {
  const quantita = Number(document.getElementById("ev-quantita").value);
  const omaggio = document.getElementById("ev-omaggio").checked;
  const note = document.getElementById("ev-note").value;

  const richiesta = await window._db.richieste.get(richiestaId);
  const art = await window._db.articoli.get(richiesta.articolo_codice);
  const sezione = await window._db.sezioni.get(richiesta.sezione_id);

  await window._richieste.evadi(richiestaId, { quantitaConsegnata: quantita, omaggio, note });

  const ultimoCarico = (await window._movimenti.storicoArticolo(art.codice)).find((m) => m.tipo === "CARICO");
  const { emailSezione, nomeFile } = await window._bolla.generaBolla({
    sezione: { id: sezione.id, nome: sezione.nome, email: sezione.email },
    righe: [{
      quantita, codice: art.codice, descrizione: art.descrizione,
      prezzoUnitario: ultimoCarico?.prezzo_unitario || 0, omaggio,
    }],
  });

  cambiaVista("richieste");
  if (emailSezione) {
    setTimeout(() => alert(`Bolla ${nomeFile} scaricata.\nRicordati di inviarla a: ${emailSezione}`), 300);
  } else {
    setTimeout(() => alert(`Bolla ${nomeFile} scaricata.\nNessuna email registrata per questa sezione.`), 300);
  }
}

// ============================= NUOVO MOVIMENTO =============================
async function renderMovimento() {
  const el = document.getElementById("view-movimento");
  const articoli = await window._articoli.elenco();
  const fornitori = await window._fornitori.elenco();
  const sezioni = await window._sezioni.elenco();

  el.innerHTML = `
    <h1>Nuovo movimento</h1>
    <div class="card">
      <label>Tipo</label>
      <select id="mv-tipo" onchange="aggiornaFormMovimento()">
        <option value="CARICO">Carico (arrivo merce)</option>
        <option value="SCARICO">Scarico diretto (evento, progetto scuola, altro)</option>
      </select>
      <label>Articolo</label>
      <select id="mv-articolo">${articoli.map((a) => `<option value="${a.codice}">${a.descrizione} (${a.codice})</option>`).join("")}</select>
      <label>Quantità</label>
      <input type="number" id="mv-quantita" min="1" value="1">
      <div id="mv-campi-extra"></div>
      <button class="btn btn-primario btn-blocco" style="margin-top:16px" onclick="salvaMovimento()">Registra</button>
    </div>`;

  window.__movFornitori = fornitori;
  window.__movSezioni = sezioni;
  aggiornaFormMovimento();
}

function aggiornaFormMovimento() {
  const tipo = document.getElementById("mv-tipo").value;
  const extra = document.getElementById("mv-campi-extra");
  if (tipo === "CARICO") {
    extra.innerHTML = `
      <label>Fornitore</label>
      <select id="mv-fornitore"><option value="">—</option>${window.__movFornitori.map((f) => `<option value="${f.id}">${f.ragione_sociale}</option>`).join("")}</select>
      <label>Prezzo unitario di questo lotto</label>
      <input type="number" id="mv-prezzo" min="0" step="0.001">`;
  } else {
    extra.innerHTML = `
      <label>Causale</label>
      <select id="mv-causale">
        <option value="evento">Evento</option>
        <option value="progetto_scuola">Progetto scuola</option>
        <option value="altro">Altro</option>
      </select>
      <label>Sezione (facoltativa)</label>
      <select id="mv-sezione"><option value="">—</option>${window.__movSezioni.map((s) => `<option value="${s.id}">${s.nome}</option>`).join("")}</select>
      <label>Note</label>
      <textarea id="mv-note"></textarea>`;
  }
}

async function salvaMovimento() {
  const tipo = document.getElementById("mv-tipo").value;
  const articoloCodice = document.getElementById("mv-articolo").value;
  const quantita = Number(document.getElementById("mv-quantita").value);

  if (tipo === "CARICO") {
    await window._movimenti.creaCarico({
      articoloCodice, quantita,
      prezzoUnitario: document.getElementById("mv-prezzo").value,
      fornitoreId: document.getElementById("mv-fornitore").value,
    });
  } else {
    const giac = await window._db.giacenze.get(articoloCodice);
    if ((giac?.quantita ?? 0) < quantita) {
      const ok = confirm(`Attenzione: la giacenza disponibile (${giac?.quantita ?? 0}) è inferiore alla quantità richiesta (${quantita}). Procedere comunque?`);
      if (!ok) return;
    }
    await window._movimenti.creaScarico({
      articoloCodice, quantita,
      causale: document.getElementById("mv-causale").value,
      sezioneId: document.getElementById("mv-sezione").value || null,
      note: document.getElementById("mv-note").value,
    });
  }
  cambiaVista("cruscotto");
}

// ============================= ARTICOLI (anagrafica) =============================
async function renderArticoli() {
  const el = document.getElementById("view-articoli");
  const articoli = await window._articoli.elenco();
  const righe = await Promise.all(articoli.map(async (a) => {
    const g = await window._db.giacenze.get(a.codice);
    return `<tr>
      <td>${a.codice}</td><td>${a.descrizione}</td><td>${g?.quantita ?? 0}</td>
      <td>${a.soglia_minima}</td><td>${a.incide_su_valore ? euro(g?.valore) : "—"}</td>
    </tr>`;
  }));

  el.innerHTML = `
    <div class="flex-tra"><h1>Anagrafica articoli</h1><button class="btn btn-primario" onclick="apriNuovoArticolo()"><i class="ti ti-plus"></i>Nuovo</button></div>
    <div class="card" style="overflow-x:auto">
      <table class="tabella-dati">
        <thead><tr><th>Codice</th><th>Descrizione</th><th>Giacenza</th><th>Soglia min.</th><th>Valore</th></tr></thead>
        <tbody>${righe.join("")}</tbody>
      </table>
    </div>`;
}

async function apriNuovoArticolo() {
  const categorie = await window._categorie.elenco();
  const famiglie = await window._db.articoli.toArray();
  const nomiFamiglia = [...new Map(famiglie.map((a) => [a.codice_famiglia, a])).values()];

  document.getElementById("view-articoli").innerHTML = `
    <div class="card">
      <h2>Nuovo articolo</h2>
      <label><input type="checkbox" id="na-variante-esistente" style="width:auto;display:inline-block;margin-right:6px" onchange="toggleFamigliaEsistente()">Variante di una famiglia già esistente</label>

      <div id="na-blocco-nuova">
        <label>Categoria</label>
        <select id="na-categoria">${categorie.map((c) => `<option value="${c.id}" data-prefisso="${c.prefisso}">${c.nome}</option>`).join("")}</select>
        <label>Descrizione</label>
        <input type="text" id="na-descrizione" oninput="aggiornaAnteprimaCodice()" placeholder="Es. Felpa GAP">
        <label>Codice proposto (modificabile)</label>
        <input type="text" id="na-codice-proposto">
      </div>

      <div id="na-blocco-esistente" class="nascosto">
        <label>Famiglia esistente</label>
        <select id="na-famiglia-esistente">${nomiFamiglia.map((a) => `<option value="${a.codice_famiglia}">${a.descrizione} (${a.codice_famiglia})</option>`).join("")}</select>
      </div>

      <label>Variante (facoltativa: taglia, colore...)</label>
      <input type="text" id="na-variante" placeholder="Es. M, Blu — lascia vuoto se non serve">
      <label>Soglia minima</label>
      <input type="number" id="na-soglia" value="0" min="0">
      <label><input type="checkbox" id="na-incide" checked style="width:auto;display:inline-block;margin-right:6px">Incide sul valore di magazzino</label>

      <div class="griglia-2" style="margin-top:16px">
        <button class="btn" onclick="cambiaVista('articoli')">Annulla</button>
        <button class="btn btn-primario" onclick="salvaNuovoArticolo()">Crea articolo</button>
      </div>
    </div>`;
}

function toggleFamigliaEsistente() {
  const esistente = document.getElementById("na-variante-esistente").checked;
  document.getElementById("na-blocco-nuova").classList.toggle("nascosto", esistente);
  document.getElementById("na-blocco-esistente").classList.toggle("nascosto", !esistente);
}

function aggiornaAnteprimaCodice() {
  const sel = document.getElementById("na-categoria");
  const prefisso = sel.options[sel.selectedIndex]?.dataset.prefisso || "ART";
  const descrizione = document.getElementById("na-descrizione").value;
  document.getElementById("na-codice-proposto").value = descrizione
    ? window._articoli.proponiCodiceFamiglia(descrizione, prefisso)
    : "";
}

async function salvaNuovoArticolo() {
  const esistente = document.getElementById("na-variante-esistente").checked;
  const variante = document.getElementById("na-variante").value.trim() || null;
  const soglia = document.getElementById("na-soglia").value;
  const incide = document.getElementById("na-incide").checked;

  try {
    if (esistente) {
      const codiceFamiglia = document.getElementById("na-famiglia-esistente").value;
      const famiglia = await window._db.articoli.where({ codice_famiglia: codiceFamiglia }).first();
      await window._articoli.creaArticolo({
        descrizione: famiglia.descrizione,
        categoriaId: famiglia.categoria_id,
        prefissoCategoria: "",
        sogliaMinima: soglia,
        incideSuValore: incide,
        variante,
        codiceFamigliaEsistente: codiceFamiglia,
      });
    } else {
      const sel = document.getElementById("na-categoria");
      const prefisso = sel.options[sel.selectedIndex]?.dataset.prefisso;
      await window._articoli.creaArticolo({
        descrizione: document.getElementById("na-descrizione").value,
        categoriaId: sel.value,
        prefissoCategoria: prefisso,
        sogliaMinima: soglia,
        incideSuValore: incide,
        variante,
        codiceFamigliaProposto: document.getElementById("na-codice-proposto").value.trim(),
      });
    }
    cambiaVista("articoli");
  } catch (e) {
    alert(e.message);
  }
}

// ============================= SEZIONI =============================
async function renderSezioni() {
  const el = document.getElementById("view-sezioni");
  const sezioni = await window._sezioni.elenco();
  el.innerHTML = `
    <div class="flex-tra"><h1>Sezioni</h1><button class="btn btn-primario" onclick="apriNuovaSezione()"><i class="ti ti-plus"></i>Nuova</button></div>
    <div class="card">${sezioni.map((s) => `
      <div class="lista-riga">
        <div><div class="titolo">${s.nome}</div><div class="sottotitolo">${s.email || "nessuna email"} · ${s.telefono || ""}</div></div>
      </div>`).join("") || '<div class="stato-vuoto">Nessuna sezione registrata.</div>'}
    </div>`;
}

function apriNuovaSezione() {
  document.getElementById("view-sezioni").innerHTML = `
    <div class="card">
      <h2>Nuova sezione</h2>
      <label>Nome</label><input type="text" id="ns-nome">
      <label>Email</label><input type="email" id="ns-email">
      <label>Telefono</label><input type="tel" id="ns-telefono">
      <label>Referente</label><input type="text" id="ns-referente">
      <div class="griglia-2" style="margin-top:16px">
        <button class="btn" onclick="cambiaVista('sezioni')">Annulla</button>
        <button class="btn btn-primario" onclick="salvaNuovaSezione()">Salva</button>
      </div>
    </div>`;
}

async function salvaNuovaSezione() {
  await window._sezioni.crea({
    nome: document.getElementById("ns-nome").value,
    email: document.getElementById("ns-email").value,
    telefono: document.getElementById("ns-telefono").value,
    referente: document.getElementById("ns-referente").value,
  });
  cambiaVista("sezioni");
}

// ============================= FORNITORI =============================
async function renderFornitori() {
  const el = document.getElementById("view-fornitori");
  const fornitori = await window._fornitori.elenco();
  el.innerHTML = `
    <div class="flex-tra"><h1>Fornitori</h1><button class="btn btn-primario" onclick="apriNuovoFornitore()"><i class="ti ti-plus"></i>Nuovo</button></div>
    <div class="card">${fornitori.map((f) => `
      <div class="lista-riga">
        <div><div class="titolo">${f.ragione_sociale}</div><div class="sottotitolo">${f.referente || ""} · ${f.email || ""} · ${f.telefono || ""}</div></div>
      </div>`).join("") || '<div class="stato-vuoto">Nessun fornitore registrato.</div>'}
    </div>`;
}

function apriNuovoFornitore() {
  document.getElementById("view-fornitori").innerHTML = `
    <div class="card">
      <h2>Nuovo fornitore</h2>
      <label>Ragione sociale</label><input type="text" id="nf-ragione">
      <label>Referente</label><input type="text" id="nf-referente">
      <label>Email</label><input type="email" id="nf-email">
      <label>Telefono</label><input type="tel" id="nf-telefono">
      <label>Note</label><textarea id="nf-note"></textarea>
      <div class="griglia-2" style="margin-top:16px">
        <button class="btn" onclick="cambiaVista('fornitori')">Annulla</button>
        <button class="btn btn-primario" onclick="salvaNuovoFornitore()">Salva</button>
      </div>
    </div>`;
}

async function salvaNuovoFornitore() {
  await window._fornitori.crea({
    ragioneSociale: document.getElementById("nf-ragione").value,
    referente: document.getElementById("nf-referente").value,
    email: document.getElementById("nf-email").value,
    telefono: document.getElementById("nf-telefono").value,
    note: document.getElementById("nf-note").value,
  });
  cambiaVista("fornitori");
}

// ============================= CATEGORIE =============================
async function renderCategorie() {
  const el = document.getElementById("view-categorie");
  const categorie = await window._categorie.elenco();
  el.innerHTML = `
    <div class="flex-tra"><h1>Categorie</h1><button class="btn btn-primario" onclick="apriNuovaCategoria()"><i class="ti ti-plus"></i>Nuova</button></div>
    <div class="card">${categorie.map((c) => `
      <div class="lista-riga"><div><div class="titolo">${c.nome}</div><div class="sottotitolo">Prefisso: ${c.prefisso}</div></div></div>
    `).join("") || '<div class="stato-vuoto">Nessuna categoria. Creane una prima di aggiungere articoli.</div>'}
    </div>`;
}

function apriNuovaCategoria() {
  document.getElementById("view-categorie").innerHTML = `
    <div class="card">
      <h2>Nuova categoria</h2>
      <label>Nome</label><input type="text" id="nc-nome" placeholder="Es. Abbigliamento">
      <label>Prefisso codice</label><input type="text" id="nc-prefisso" placeholder="Es. ABB" maxlength="5">
      <div class="griglia-2" style="margin-top:16px">
        <button class="btn" onclick="cambiaVista('categorie')">Annulla</button>
        <button class="btn btn-primario" onclick="salvaNuovaCategoria()">Salva</button>
      </div>
    </div>`;
}

async function salvaNuovaCategoria() {
  await window._categorie.crea({
    nome: document.getElementById("nc-nome").value,
    prefisso: document.getElementById("nc-prefisso").value,
  });
  cambiaVista("categorie");
}

// ============================= UTENTI =============================
async function renderUtenti() {
  const el = document.getElementById("view-utenti");
  const utenti = await window._utenti.elenco();
  el.innerHTML = `
    <div class="flex-tra"><h1>Utenti</h1><button class="btn btn-primario" onclick="apriNuovoUtente()"><i class="ti ti-plus"></i>Nuovo</button></div>
    <div class="card">${utenti.map((u) => `
      <div class="lista-riga">
        <div><div class="titolo">${u.nome}</div><div class="sottotitolo">${u.email || ""} · ${u.ruolo}</div></div>
        ${u.uid !== window._stato.utente.uid ? `<button class="icon-btn" onclick="rimuoviAccessoUtente('${u.uid}')" aria-label="Rimuovi accesso"><i class="ti ti-user-off"></i></button>` : ""}
      </div>`).join("") || '<div class="stato-vuoto">Nessun utente oltre a te.</div>'}
    </div>`;
}

function apriNuovoUtente() {
  document.getElementById("view-utenti").innerHTML = `
    <div class="card">
      <h2>Nuovo utente</h2>
      <p class="campo-help">Verrà creato subito un account attivo: comunica email e password provvisoria alla persona, che potrà cambiarla da "Il mio account".</p>
      <label>Nome e cognome</label><input type="text" id="nu-nome">
      <label>Email</label><input type="email" id="nu-email">
      <label>Password provvisoria</label><input type="text" id="nu-password" placeholder="Almeno 6 caratteri">
      <label>Ruolo</label>
      <select id="nu-ruolo"><option value="operatore">Operatore</option><option value="responsabile">Responsabile</option></select>
      <div class="griglia-2" style="margin-top:16px">
        <button class="btn" onclick="cambiaVista('utenti')">Annulla</button>
        <button class="btn btn-primario" id="nu-submit" onclick="salvaNuovoUtente()">Crea utente</button>
      </div>
    </div>`;
}

async function salvaNuovoUtente() {
  const bottone = document.getElementById("nu-submit");
  bottone.disabled = true;
  try {
    await window._utenti.creaUtente({
      nome: document.getElementById("nu-nome").value,
      email: document.getElementById("nu-email").value,
      password: document.getElementById("nu-password").value,
      ruolo: document.getElementById("nu-ruolo").value,
    });
    cambiaVista("utenti");
  } catch (e) {
    alert(messaggioErroreCreazioneUtente(e.code));
    bottone.disabled = false;
  }
}

function messaggioErroreCreazioneUtente(code) {
  switch (code) {
    case "auth/email-already-in-use": return "Esiste già un account con questa email.";
    case "auth/weak-password": return "Password troppo debole: almeno 6 caratteri.";
    case "auth/invalid-email": return "Email non valida.";
    default: return "Creazione non riuscita. Verifica la connessione e riprova.";
  }
}

async function rimuoviAccessoUtente(uid) {
  if (!confirm("Rimuovere l'accesso a questo utente? Non potrà più entrare nell'app. L'account tecnico su Firebase resterà comunque presente e andrà eventualmente eliminato dalla Console.")) return;
  await window._utenti.rimuoviAccesso(uid);
  renderUtenti();
}

// ============================= ACCOUNT (cambio password) =============================
function renderAccount() {
  const el = document.getElementById("view-account");
  el.innerHTML = `
    <h1>Il mio account</h1>
    <div class="card">
      <p><strong>${window._stato.utente.nome}</strong><br><span class="sottotitolo">${window._stato.utente.email}</span></p>
    </div>
    <h3>Cambia password</h3>
    <div class="card">
      <label>Password attuale</label><input type="password" id="cp-attuale" autocomplete="current-password">
      <label>Nuova password</label><input type="password" id="cp-nuova" autocomplete="new-password" placeholder="Almeno 6 caratteri">
      <p id="cp-esito" style="font-size:.85rem;min-height:1.2em"></p>
      <button class="btn btn-primario btn-blocco" onclick="salvaCambioPassword()">Aggiorna password</button>
    </div>`;
}

async function salvaCambioPassword() {
  const esito = document.getElementById("cp-esito");
  esito.style.color = "";
  esito.textContent = "";
  try {
    await window._utenti.cambiaPassword(
      document.getElementById("cp-attuale").value,
      document.getElementById("cp-nuova").value
    );
    esito.style.color = "var(--verde)";
    esito.textContent = "Password aggiornata.";
    document.getElementById("cp-attuale").value = "";
    document.getElementById("cp-nuova").value = "";
  } catch (e) {
    esito.style.color = "var(--rosso-alert)";
    esito.textContent = e.code === "auth/wrong-password" ? "Password attuale non corretta." : "Impossibile aggiornare la password.";
  }
}

async function richiediReset() {
  const email = prompt("Inserisci l'email del tuo account:");
  if (!email) return;
  try {
    await window._utenti.richiediResetPassword(email);
    alert("Se l'indirizzo è registrato, riceverai a breve un'email per reimpostare la password.");
  } catch (e) {
    alert("Impossibile inviare l'email di reset. Verifica l'indirizzo e la connessione.");
  }
}

// ============================= STORICO =============================
async function renderStorico() {
  const el = document.getElementById("view-storico");
  const movimenti = await window._movimenti.ultimiMovimenti(50);
  const righe = await Promise.all(movimenti.map(async (m) => {
    const art = await window._db.articoli.get(m.articolo_codice);
    const puoModificare = window._movimenti.puoModificare(m);
    return `<div class="lista-riga">
      <div>
        <div class="titolo">${m.tipo === "CARICO" ? "Carico" : "Scarico"} · ${art?.descrizione || m.articolo_codice}</div>
        <div class="sottotitolo">${dataBreve(m.data)} · ${m.quantita} pz${m.omaggio ? " · omaggio" : ""}</div>
      </div>
      ${puoModificare ? `<button class="icon-btn" onclick="eliminaMovimento('${m.id}')" aria-label="Elimina"><i class="ti ti-trash"></i></button>` : ""}
    </div>`;
  }));
  el.innerHTML = `<h1>Storico movimenti</h1><div class="card">${righe.join("") || '<div class="stato-vuoto">Nessun movimento registrato.</div>'}</div>`;
}

async function eliminaMovimento(id) {
  if (!confirm("Eliminare questo movimento? La giacenza verrà ricalcolata.")) return;
  await window._movimenti.elimina(id);
}

// ============================= EXPORT =============================
async function renderExport() {
  const el = document.getElementById("view-export");
  el.innerHTML = `
    <h1>Backup dati</h1>
    <div class="card">
      <p>Esporta un file JSON completo (articoli, movimenti, richieste, sezioni, fornitori) come backup mensile, secondo lo standard AVIS.</p>
      <button class="btn btn-primario" onclick="esportaBackup()"><i class="ti ti-download"></i>Esporta backup JSON</button>
    </div>`;
}

async function esportaBackup() {
  const dati = {};
  for (const tabella of ["categorie", "articoli", "movimenti", "richieste", "sezioni", "fornitori", "bolle"]) {
    dati[tabella] = await window._db[tabella].toArray();
  }
  dati.esportato_il = new Date().toISOString();
  const blob = new Blob([JSON.stringify(dati, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `backup_magazzino_avis_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

const RENDER = {
  cruscotto: renderCruscotto,
  richieste: renderRichieste,
  movimento: renderMovimento,
  articoli: renderArticoli,
  categorie: renderCategorie,
  sezioni: renderSezioni,
  fornitori: renderFornitori,
  utenti: renderUtenti,
  account: renderAccount,
  storico: renderStorico,
  export: renderExport,
};

Object.assign(window, {
  _aggiornaUI, cambiaVista,
  apriNuovaRichiesta, salvaNuovaRichiesta, apriEvasione, confermaEvasione,
  aggiornaFormMovimento, salvaMovimento,
  apriNuovoArticolo, toggleFamigliaEsistente, aggiornaAnteprimaCodice, salvaNuovoArticolo,
  apriNuovaCategoria, salvaNuovaCategoria,
  apriNuovaSezione, salvaNuovaSezione,
  apriNuovoFornitore, salvaNuovoFornitore,
  apriNuovoUtente, salvaNuovoUtente, rimuoviAccessoUtente, salvaCambioPassword, richiediReset,
  eliminaMovimento, esportaBackup,
});
