import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import fs from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const serviceAccountPath = join(__dirname, "..", "firebase-service-account.json");
if (!fs.existsSync(serviceAccountPath)) {
  console.error("Service account file not found at:", serviceAccountPath);
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));

const app = initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore(app);
const auth = getAuth(app);

async function syncUsers() {
  console.log("=== INICIANDO SINCRONIZACIÓN CON FIREBASE AUTHENTICATION ===");
  try {
    const snapshot = await db.collection("usuarios").get();
    console.log(`Documentos en Firestore 'usuarios': ${snapshot.size}`);

    for (const docSnap of snapshot.docs) {
      const data = docSnap.data();
      const email = (data.correo || data.email || "").trim().toLowerCase();
      if (!email) continue;

      const password = data.password || "cajeroprueba";
      const displayName = data.nombre || "Usuario Municipal";

      let authUser = null;
      try {
        authUser = await auth.getUserByEmail(email);
        console.log(`[EXISTE] ${email} ya está en Firebase Auth (UID: ${authUser.uid})`);
      } catch (err) {
        if (err.code === "auth/user-not-found" || err.message?.includes("no user record")) {
          try {
            authUser = await auth.createUser({
              email: email,
              password: password,
              displayName: displayName,
            });
            console.log(`[CREADO NUEVO] ${email} registrado exitosamente en Firebase Auth con UID: ${authUser.uid}`);
          } catch (createErr) {
            console.error(`[ERROR CREANDO] ${email}:`, createErr.message);
          }
        } else {
          console.error(`[ERROR CONSULTANDO] ${email}:`, err.message);
        }
      }

      if (authUser && (docSnap.id.includes("-001") || data.uid !== authUser.uid)) {
        try {
          await db.collection("usuarios").doc(authUser.uid).set({
            ...data,
            uid: authUser.uid,
            id: authUser.uid,
            correo: email,
            actualizadoEn: FieldValue.serverTimestamp(),
          }, { merge: true });
          console.log(`[ Firestore SYNC ] Documento actualizado para UID oficial: ${authUser.uid}`);
        } catch (e) {
          console.error(`[ERROR SYNC] ${authUser.uid}:`, e.message);
        }
      }
    }

    console.log("=== SINCRONIZACIÓN COMPLETADA CON ÉXITO ===");
  } catch (err) {
    console.error("Error general:", err.message);
  } finally {
    process.exit(0);
  }
}

syncUsers();
