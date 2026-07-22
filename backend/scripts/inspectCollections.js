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

async function inspectAllCollections() {
  const collections = await db.listCollections();
  console.log("Colecciones en Firestore:");
  for (const col of collections) {
    const snap = await col.get();
    console.log(`- Colección '${col.id}': ${snap.size} documentos`);
    snap.docs.forEach((doc) => {
      const data = doc.data();
      console.log(`  * ID: ${doc.id} | canalRegistro/registradoPor/rol: ${data.canalRegistro || data.registradoPor || data.rol || data.usuarioCajero || "N/A"}`);
    });
  }
  process.exit(0);
}

inspectAllCollections().catch(err => {
  console.error(err);
  process.exit(1);
});
