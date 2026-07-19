import { initializeApp } from "firebase/app";

import { getAuth, setPersistence, browserLocalPersistence, onAuthStateChanged } from "firebase/auth";

import { getFirestore } from "firebase/firestore";

import { getStorage } from "firebase/storage";

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.error("Error setting auth persistence:", err);
});

export const db = getFirestore(app);

export const storage = getStorage(app);

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
  if (!token) throw new Error("No hay sesión activa.");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
};

export default app;