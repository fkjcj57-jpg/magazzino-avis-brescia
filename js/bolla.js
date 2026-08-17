// js/bolla.js — generazione PDF della bolla di consegna, fedele
// all'impaginato del foglio "BOLLA DI CONSEGNA" del file Excel originale.
// L'invio resta manuale (deciso in fase di progettazione): l'app genera e
// scarica il PDF, poi mostra un promemoria con l'email della sezione pronta
// da usare nel proprio client di posta.

import {
  doc,
  setDoc,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const INTESTAZIONE = [
  "AVIS",
  "Associazione volontari italiani del sangue",
  "Provinciale di Brescia",
  "Piazzetta AVIS, 1 - 25124 Brescia",
  "Tel. 030.3514411 - Fax 030.3514490",
  "Codice fiscale 98047730175",
];

function formattaData(iso) {
  return new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
}

function formattaEuro(v) {
  return v == null ? "" : v.toLocaleString("it-IT", { style: "currency", currency: "EUR" });
}

/**
 * @param {Object} opts
 * @param {Object} opts.sezione   { nome, email }
 * @param {Array}  opts.righe     [{ quantita, codice, descrizione, prezzoUnitario, omaggio }]
 */
async function generaBolla({ sezione, righe }) {
  const anno = new Date().getFullYear();
  const { numero } = await window._contatori.prossimoNumeroBolla(anno);
  const data = new Date().toISOString();

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: "mm", format: "a4" });

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  INTESTAZIONE.forEach((riga, i) => pdf.text(riga, 15, 18 + i * 4.2));

  pdf.setFontSize(20);
  pdf.setFont("helvetica", "bold");
  pdf.text("Bolla di consegna", 195, 22, { align: "right" });

  pdf.setDrawColor(200);
  pdf.line(15, 46, 195, 46);

  pdf.setFontSize(9);
  pdf.setFont("helvetica", "normal");
  pdf.text("Nome destinatario", 15, 54);
  pdf.setFontSize(12);
  pdf.setFont("helvetica", "bold");
  pdf.text(sezione.nome, 15, 61);

  pdf.setFontSize(9);
  pdf.setFont("helvetica", "normal");
  pdf.text("Data", 140, 54);
  pdf.text("N. bolla", 170, 54);
  pdf.setFontSize(12);
  pdf.setFont("helvetica", "bold");
  pdf.text(formattaData(data), 140, 61);
  pdf.text(`${numero} / ${anno}`, 170, 61);

  const corpo = righe.map((r) => [
    String(r.quantita),
    r.codice,
    r.descrizione,
    r.omaggio ? "omaggio" : formattaEuro(r.prezzoUnitario),
    r.omaggio ? "-" : formattaEuro(r.prezzoUnitario * r.quantita),
  ]);

  pdf.autoTable({
    startY: 70,
    head: [["Quantità", "Cod. articolo", "Articolo", "Prezzo unit.", "Prezzo tot."]],
    body: corpo,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [200, 16, 46], textColor: 255 },
    columnStyles: {
      0: { halign: "center", cellWidth: 22 },
      1: { halign: "center", cellWidth: 32 },
      3: { halign: "right", cellWidth: 28 },
      4: { halign: "right", cellWidth: 28 },
    },
  });

  const totale = righe.reduce((acc, r) => acc + (r.omaggio ? 0 : r.prezzoUnitario * r.quantita), 0);
  const yTotale = pdf.lastAutoTable.finalY + 10;
  pdf.setFontSize(10);
  pdf.setFont("helvetica", "bold");
  pdf.text("Somma totale", 150, yTotale);
  pdf.text(formattaEuro(totale), 195, yTotale, { align: "right" });

  pdf.setFontSize(8);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(120);
  pdf.text("Il prezzo si intende IVA inclusa", 105, 280, { align: "center" });

  const nomeFile = `bolla_${numero}_${anno}.pdf`;
  pdf.save(nomeFile);

  // Registrazione della bolla emessa (per lo storico), indipendente
  // dall'invio via email che resta manuale.
  const ref = doc(window._fb.db, "bolle", `${anno}-${numero}`);
  await setDoc(ref, {
    numero, anno, data,
    sezione_id: sezione.id || null,
    sezione_nome: sezione.nome,
    righe,
    totale: Math.round(totale * 100) / 100,
    creato_da: window._stato.utente.uid,
  });

  return { numero, anno, nomeFile, emailSezione: sezione.email || "" };
}

window._bolla = { generaBolla };
