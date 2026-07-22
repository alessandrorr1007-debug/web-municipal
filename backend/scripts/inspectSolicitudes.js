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

async function inspectSolicitudes() {
  console.log("=== INSPECCIONANDO SOLICITUDES EN FIRESTORE ===");
  const snap = await db.collection("solicitudes").get();
  console.log(`Total documentos en 'solicitudes': ${snap.size}`);

  snap.docs.forEach((doc) => {
    console.log(`--- ID: ${doc.id} ---`);
    console.log(JSON.stringify(doc.data(), null, 2));
  });

  process.exit(0);
}

inspectSolicitudes().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
