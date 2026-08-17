// js/firebase-init.js
//
// REGOLA VINCOLANTE 7: namespace dedicato (window._fb) per gli oggetti di
// inizializzazione Firebase, per evitare conflitti con altre variabili globali.
//
// Inserire qui la configurazione del progetto Firebase (Console Firebase >
// Impostazioni progetto > Le tue app > SDK setup and configuration).
// Questi valori NON sono segreti (sono pubblici per design in un'app client),
// la sicurezza reale è demandata alle Firestore Security Rules.

import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  createUserWithEmailAndPassword,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  sendPasswordResetEmail,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentSingleTabManager,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyApYsyHnBNxA2mpMH6UyDNSGMaXjN8hQlA",
  authDomain: "magazzino-avis-brescia-9db67.firebaseapp.com",
  projectId: "magazzino-avis-brescia-9db67",
  storageBucket: "magazzino-avis-brescia-9db67.firebasestorage.app",
  messagingSenderId: "1032383301034",
  appId: "1:1032383301034:web:d40c50da9fb96ef19ad7d3"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Persistenza offline nativa di Firestore (accoda le scritture quando manca
// connessione). Dexie resta comunque il livello locale per i dati derivati
// (giacenze, alert) secondo la regola 6.
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentSingleTabManager({}) }),
});

window._fb = {
  app,
  auth,
  db,
  firebaseConfig,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  createUserWithEmailAndPassword,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  sendPasswordResetEmail,
  deleteApp,
};
