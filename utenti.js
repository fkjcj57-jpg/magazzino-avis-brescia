// js/utenti.js
//
// Creazione utenti interamente client-side, senza Cloud Functions: usa
// un'istanza Firebase SECONDARIA e temporanea solo per la creazione
// dell'account, così la sessione del Responsabile che sta operando non
// viene sostituita (Firebase Auth, di norma, autentica automaticamente
// l'ultimo account creato sull'istanza corrente).
//
// LIMITE NOTO: disattivare/eliminare l'account Auth di un altro utente
// richiede i permessi di amministrazione (Admin SDK / Cloud Function), che
// il client non ha per motivi di sicurezza. Qui "rimuoviAccesso" elimina
// solo il profilo Firestore: l'utente non riesce più ad entrare nell'app
// (auth.js lo disconnette per mancanza di profilo), ma il suo account Auth
// grezzo resta tecnicamente esistente finché non lo si elimina dalla
// Console Firebase.

import {
  initializeApp,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  doc,
  setDoc,
  deleteDoc,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

async function creaUtente({ email, password, nome, ruolo }) {
  const secondaria = initializeApp(window._fb.firebaseConfig, `secondaria-${Date.now()}`);
  const authSecondaria = getAuth(secondaria);
  try {
    const cred = await window._fb.createUserWithEmailAndPassword(authSecondaria, email, password);
    await setDoc(doc(window._fb.db, "utenti", cred.user.uid), {
      nome: nome.trim(),
      ruolo, // "responsabile" | "operatore"
      email,
      creato_il: new Date().toISOString(),
    });
    await window._fb.signOut(authSecondaria);
    return cred.user.uid;
  } finally {
    await window._fb.deleteApp(secondaria);
  }
}

async function elenco() {
  return window._db.utenti.toArray();
}

async function rimuoviAccesso(uid) {
  await deleteDoc(doc(window._fb.db, "utenti", uid));
}

async function modificaRuolo(uid, ruolo) {
  await setDoc(doc(window._fb.db, "utenti", uid), { ruolo }, { merge: true });
}

// --- Cambio password (self-service, utente già loggato) ---
async function cambiaPassword(passwordAttuale, passwordNuova) {
  const user = window._fb.auth.currentUser;
  const credenziale = window._fb.EmailAuthProvider.credential(user.email, passwordAttuale);
  // La ri-autenticazione è richiesta da Firebase per operazioni sensibili
  // se l'accesso non è recente, per evitare che una sessione rubata possa
  // cambiare la password senza conoscere quella attuale.
  await window._fb.reauthenticateWithCredential(user, credenziale);
  await window._fb.updatePassword(user, passwordNuova);
}

// --- "Password dimenticata" dalla schermata di login ---
// Firebase invia da sé l'email con il link di reset: nessun backend nostro coinvolto.
async function richiediResetPassword(email) {
  await window._fb.sendPasswordResetEmail(window._fb.auth, email);
}

window._utenti = { creaUtente, elenco, rimuoviAccesso, modificaRuolo, cambiaPassword, richiediResetPassword };
