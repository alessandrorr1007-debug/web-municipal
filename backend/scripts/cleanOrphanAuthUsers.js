import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const serviceAccountPath = join(__dirname, "..", "firebase-service-account.json");
if (!fs.existsSync(serviceAccountPath)) {
  console.error("Service account file not found.");
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));
const app = initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore(app);
const auth = getAuth(app);

async function cleanOrphans() {
  console.log("=== VERIFICANDO CUENTAS HUÉRFANAS EN FIREBASE AUTHENTICATION ===");
  try {
    const fsSnap = await db.collection("usuarios").get();
    const activeFirestoreEmails = new Set(
      fsSnap.docs.map((d) => (d.data().correo || d.data().email || "").trim().toLowerCase()).filter(Boolean)
    );

    console.log(`Correos válidos en Firestore:`, Array.from(activeFirestoreEmails));

    const authList = await auth.listUsers(1000);
    console.log(`Usuarios en Firebase Auth: ${authList.users.length}`);

    for (const userRecord of authList.users) {
      const email = (userRecord.email || "").trim().toLowerCase();
      if (email && !activeFirestoreEmails.has(email)) {
        console.log(`[ELIMINANDO DE FIREBASE AUTH] ${email} (UID: ${userRecord.uid}) ya no existe en Firestore.`);
        try {
          await auth.deleteUser(userRecord.uid);
          console.log(`[ELIMINADO OK] ${email} removido exitosamente de Firebase Auth.`);
        } catch (delErr) {
          console.error(`[ERROR ELIMINANDO] ${email}:`, delErr.message);
        }
      } else {
        console.log(`[CONSERVADO] ${email} (UID: ${userRecord.uid}) activo en Firestore.`);
      }
    }
    console.log("=== LIMPIEZA DE AUTH COMPLETADA CON ÉXITO ===");
  } catch (err) {
    console.error("Error general:", err.message);
  } finally {
    process.exit(0);
  }
}

cleanOrphans();
