import { initializeApp } from "firebase/app";
import { initializeFirestore, getDocs, deleteDoc, doc, collection } from "firebase/firestore";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, ".env") });

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
  ignoreUndefinedProperties: true,
});

const eliminarLicenciasAprobadasCollection = async () => {
  console.log("=================================================");
  console.log("🔥 Eliminando colección 'licencias_aprobadas' de Firebase Firestore...");
  console.log("=================================================");

  try {
    const snap = await getDocs(collection(db, "licencias_aprobadas"));
    console.log(`📋 Documentos encontrados en 'licencias_aprobadas': ${snap.docs.length}`);

    for (const d of snap.docs) {
      await deleteDoc(doc(db, "licencias_aprobadas", d.id));
      console.log(`  🗑️ Eliminado documento 'licencias_aprobadas'/${d.id}`);
    }

    console.log("=================================================");
    console.log("🎉 Colección 'licencias_aprobadas' eliminada por completo!");
    console.log("=================================================");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error al eliminar 'licencias_aprobadas':", error);
    process.exit(1);
  }
};

eliminarLicenciasAprobadasCollection();
