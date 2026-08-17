// js/app.js — punto di ingresso. Ultimo modulo eseguito: quando questo
// codice gira, tutti gli altri moduli hanno già valorizzato i rispettivi
// window._X (Firebase, auth, sync, db, articoli, movimenti...).

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch((e) => console.error("Registrazione service worker fallita:", e));
}

document.getElementById("login-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const email = document.getElementById("login-email").value;
  const password = document.getElementById("login-password").value;
  window._auth.login(email, password);
});

document.getElementById("btn-logout").addEventListener("click", () => window._auth.logout());

document.querySelectorAll("[data-vista]").forEach((btn) => {
  btn.addEventListener("click", () => cambiaVista(btn.dataset.vista));
});

window._auth.initAuth();
