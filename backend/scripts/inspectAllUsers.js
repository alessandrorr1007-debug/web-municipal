import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
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
const auth = getAuth(app);

async function inspectAll() {
  console.log("=== TODOS LOS DOCUMENTOS EN FIRESTORE (usuarios) ===");
  const snap = await db.collection("usuarios").get();
  snap.docs.forEach((doc) => {
    console.log(`Doc ID: "${doc.id}" ->`, doc.data());
  });

  console.log("\n=== TODOS LOS USUARIOS EN FIREBASE AUTHENTICATION ===");
  const authList = await auth.listUsers(1000);
  authList.users.forEach((u) => {
    console.log(`Auth UID: "${u.uid}" -> Email: "${u.email}"`);
  });
  process.exit(0);
}

inspectAll();
