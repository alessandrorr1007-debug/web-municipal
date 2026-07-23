import { initializeApp, getApps } from "firebase/app";

import { getAuth, setPersistence, browserLocalPersistence, createUserWithEmailAndPassword } from "firebase/auth";

import { getFirestore } from "firebase/firestore";

import { getStorage } from "firebase/storage";

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyC_LEdrAj9R9epUNj9ZMhwE2al1TIfoUko",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "web-municipal-32860.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "web-municipal-32860",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "web-municipal-32860.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "47406376313",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:47406376313:web:d85dcf95515fe6a19a7ba8",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.error("Error setting auth persistence:", err);
});

export const db = getFirestore(app);

export const storage = getStorage(app);

export const crearUsuarioEnFirebaseAuthentication = async (correo, password) => {
  const secondaryAppName = "SecondaryAppForUserCreation";
  const existingApps = getApps();
  let secondaryApp = existingApps.find((a) => a.name === secondaryAppName);
  if (!secondaryApp) {
    secondaryApp = initializeApp(firebaseConfig, secondaryAppName);
  }
  const secondaryAuth = getAuth(secondaryApp);
  const userCredential = await createUserWithEmailAndPassword(secondaryAuth, correo, password);
  return userCredential.user;
};

export const getIdToken = async () => {
  const user = auth.currentUser;
  if (!user) return null;
  try {
    return await user.getIdToken();
  } catch (error) {
    console.error("Error obteniendo ID token:", error);
    return null;
  }
};

export const authHeaders = async () => {
  const token = await getIdToken();
  const headers = { "Content-Type": "application/json" };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
};

export default app;