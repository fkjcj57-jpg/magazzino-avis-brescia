// sw.js — service worker del Magazzino AVIS Brescia
//
// REGOLA VINCOLANTE 1: incrementare CACHE_NAME ad ogni deploy che modifica
// HTML/JS/CSS, altrimenti gli utenti restano bloccati su versioni obsolete.
// Formato consigliato: "magazzino-avis-vN" con N incrementale.
const CACHE_NAME = "magazzino-avis-v15";

// REGOLA VINCOLANTE 2: percorsi sempre relativi ("./"), mai assoluti,
// perché l'app vive in una sottocartella di GitHub Pages (/nome-repo/).
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/style.css",
  "./js/firebase-init.js",
  "./js/db.js",
  "./js/auth.js",
  "./js/contatori.js",
  "./js/sync.js",
  "./js/categorie.js",
  "./js/articoli.js",
  "./js/movimenti.js",
  "./js/richieste.js",
  "./js/sezioni.js",
  "./js/fornitori.js",
  "./js/utenti.js",
  "./js/bolla.js",
  "./js/cruscotto.js",
  "./js/ui.js",
  "./js/importa.js",
  "./js/app.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// REGOLA VINCOLANTE 3: network-first per HTML/JS/CSS dell'app (non
// cache-first), così gli aggiornamenti arrivano subito quando c'è
// connessione, con fallback alla cache quando si è offline.
//
// Le librerie esterne (Firebase SDK, Dexie, jsPDF, Tabler Icons via CDN)
// usano invece cache-first: sono caricate da URL versionati che non
// cambiano mai, quindi non c'è bisogno di ricontrollarle in rete ad ogni
// avvio, e questo è ciò che permette all'app di funzionare offline anche
// per queste dipendenze dopo il primo utilizzo.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  const isAppShell = url.origin === self.location.origin;

  if (isAppShell) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match("./index.html")))
    );
    return;
  }

  // Firestore stesso usa fetch/streaming che il SW non deve intercettare:
  // esclude i domini di sincronizzazione dati (identificabili dal path),
  // mette in cache solo i file statici delle librerie.
  if (url.hostname.includes("firestore.googleapis.com") || url.hostname.includes("firebaseio.com")) {
    return;
  }

  event.respondWith(
    caches.match(req).then(
      (cached) =>
        cached ||
        fetch(req).then((res) => {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          return res;
        })
    )
  );
});
