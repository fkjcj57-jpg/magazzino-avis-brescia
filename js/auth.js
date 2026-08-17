// js/auth.js
//
// REGOLA VINCOLANTE 4: i listener Firebase (onSnapshot ecc.) non devono mai
// partire prima che l'autenticazione sia completata, altrimenti si generano
// errori "permission-denied". Per questo sync.avviaListener() viene chiamato
// SOLO dentro onAuthStateChanged, dopo aver letto il profilo utente.
//
// REGOLA VINCOLANTE 8: la gestione delle transizioni login/logout è
// centralizzata in un'unica funzione idempotente (_aggiornaUI), richiamabile
// in sicurezza da qualsiasi punto del codice.

import {
  doc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

window._stato = {
  utente: null, // { uid, email, nome, ruolo }
  vistaAttiva: "cruscotto",
  pronto: false,
};

function initAuth() {
  window._fb.onAuthStateChanged(window._fb.auth, async (user) => {
    if (user) {
      let profilo = null;
      try {
        const snap = await getDoc(doc(window._fb.db, "utenti", user.uid));
        profilo = snap.exists() ? snap.data() : null;
      } catch (e) {
        console.warn("Impossibile leggere il profilo utente (offline?), uso la cache locale", e);
        profilo = await window._db.utenti.get(user.uid);
      }

      if (!profilo) {
        console.error("Utente autenticato ma senza profilo in Firestore/utenti:", user.uid);
        alert("Il tuo account non è ancora configurato. Contatta il Responsabile.");
        await window._fb.signOut(window._fb.auth);
        return;
      }

      window._stato.utente = {
        uid: user.uid,
        email: user.email,
        nome: profilo.nome || user.email,
        ruolo: profilo.ruolo || "operatore",
      };
      window._stato.pronto = true;

      // I listener partono SOLO ora che l'utente e il ruolo sono noti.
      window._sync.avviaListener();
    } else {
      window._stato.utente = null;
      window._stato.pronto = false;
      window._sync.fermaListener();
    }

    _aggiornaUI();
  });
}

async function login(email, password) {
  const bottone = document.getElementById("login-submit");
  const errore = document.getElementById("login-errore");
  errore.textContent = "";
  bottone.disabled = true;
  try {
    await window._fb.signInWithEmailAndPassword(window._fb.auth, email, password);
  } catch (e) {
    errore.textContent = messaggioErroreLogin(e.code);
  } finally {
    bottone.disabled = false;
  }
}

function messaggioErroreLogin(code) {
  switch (code) {
    case "auth/invalid-email": return "Indirizzo email non valido.";
    case "auth/user-disabled": return "Account disabilitato. Contatta il Responsabile.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential": return "Email o password non corrette.";
    default: return "Accesso non riuscito. Verifica la connessione e riprova.";
  }
}

function logout() {
  window._fb.signOut(window._fb.auth);
}

window._auth = { initAuth, login, logout };
