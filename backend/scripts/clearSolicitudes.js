import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const serviceAccountPath = join(__dirname, "..", "firebase-service-account.json");
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));
const app = initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore(app);

async function clearSolicitudes() {
  console.log("=== ELIMINANDO HISTORIAL DE SOLICITUDES EN FIRESTORE ===");
  const snap = await db.collection("solicitudes").get();
  console.log(`Encontrados ${snap.size} documentos en la colección 'solicitudes'.`);

  let count = 0;
  for (const docSnap of snap.docs) {
    console.log(`Eliminando solicitud ID: ${docSnap.id}...`);
    await docSnap.ref.delete();
    count++;
  }

  console.log(`✅ Se eliminaron exitosamente ${count} documentos del historial de solicitudes.`);
  process.exit(0);
}

clearSolicitudes().catch((err) => {
  console.error("Error al eliminar historial de solicitudes:", err);
  process.exit(1);
});
