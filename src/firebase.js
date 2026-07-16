import { initializeApp } from "firebase/app";

import { getAuth } from "firebase/auth";

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

export const db = getFirestore(app);

export const storage = getStorage(app);

export default app;