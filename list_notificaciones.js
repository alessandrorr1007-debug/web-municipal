import { initializeApp } from "firebase/app";
import { initializeFirestore, collection, getDocs } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyC_LEdrAj9R9epUNj9ZMhwE2al1TIfoUko",
  authDomain: "web-municipal-32860.firebaseapp.com",
  projectId: "web-municipal-32860",
  storageBucket: "web-municipal-32860.firebasestorage.app",
  messagingSenderId: "47406376313",
  appId: "1:47406376313:web:d85dcf95515fe6a19a7ba8",
};

const app = initializeApp(firebaseConfig);
const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
  ignoreUndefinedProperties: true,
});

console.log("Consultando notificaciones...");

try {
  const snapshot = await getDocs(collection(db, "notificaciones"));
  console.log(`Total notificaciones encontradas: ${snapshot.size}`);
  snapshot.forEach(doc => {
    console.log(`ID: ${doc.id}`);
    const data = doc.data();
    console.log(`Título: ${data.titulo} | Desc: ${data.descripcion}`);
  });
  process.exit(0);
} catch (error) {
  console.error("Error al consultar:", error);
  process.exit(1);
}
