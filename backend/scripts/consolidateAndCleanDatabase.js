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

async function cleanupAndConsolidate() {
  console.log("=== LIMPIEZA Y CONSOLIDACIÓN DE BASE DE DATOS ===");

  // 1. Eliminar docs de seed antiguos redundantes CAJERO-001 e INSP-001 si ya existen con UID de Auth
  try {
    const docCajero = db.collection("usuarios").doc("CAJERO-001");
    const snapC = await docCajero.get();
    if (snapC.exists) {
      console.log("Eliminando doc heredado redundante CAJERO-001...");
      await docCajero.delete();
    }

    const docInsp = db.collection("usuarios").doc("INSP-001");
    const snapI = await docInsp.get();
    if (snapI.exists) {
      console.log("Eliminando doc heredado redundante INSP-001...");
      await docInsp.delete();
    }
  } catch (e) {
    console.warn("Error consolidando docs heredados:", e.message);
  }

  // 2. Obtener lista actual de correos en Firestore
  const fsSnap = await db.collection("usuarios").get();
  const firestoreEmails = new Set(
    fsSnap.docs.map((d) => (d.data().correo || d.data().email || "").trim().toLowerCase()).filter(Boolean)
  );

  console.log("Correos actualmente activos en Firestore:", Array.from(firestoreEmails));

  // 3. Eliminar de Firebase Auth cualquier usuario cuyo correo ya NO esté en Firestore
  const authList = await auth.listUsers(1000);
  for (const u of authList.users) {
    const email = (u.email || "").trim().toLowerCase();
    if (email && !firestoreEmails.has(email)) {
      console.log(`[ELIMINANDO DE FIREBASE AUTH] ${email} (UID: ${u.uid})`);
      try {
        await auth.deleteUser(u.uid);
        console.log(`[ELIMINADO OK] ${email} fue removido de Firebase Auth.`);
      } catch (err) {
        console.error(`Error eliminando de Auth a ${email}:`, err.message);
      }
    }
  }

  console.log("=== PROCESO DE LIMPIEZA Y CONSOLIDACIÓN COMPLETADO ===");
  process.exit(0);
}

cleanupAndConsolidate();
