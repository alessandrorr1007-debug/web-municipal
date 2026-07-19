import { initializeApp } from "firebase/app";

import { getAuth, setPersistence, browserLocalPersistence, onAuthStateChanged } from "firebase/auth";

import { getFirestore } from "firebase/firestore";

import { getStorage } from "firebase/storage";

export const firebaseConfig = {
  apiKey: "AIzaSyC_LEdrAj9R9epUNj9ZMhwE2al1TIfoUko",

  authDomain: "web-municipal-32860.firebaseapp.com",

  projectId: "web-municipal-32860",

  storageBucket: "web-municipal-32860.firebasestorage.app",

  messagingSenderId: "47406376313",

  appId: "1:47406376313:web:d85dcf95515fe6a19a7ba8",
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