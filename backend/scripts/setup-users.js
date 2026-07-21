/**
 * Script de configuración de usuarios de prueba en Firebase.
 *
 * USO:
 *   1. Descarga la service account key desde Firebase Console:
 *      https://console.firebase.google.com → tu proyecto → Project Settings → Service accounts
 *      → Generate new private key → Guarda como backend/firebase-service-account.json
 *
 *   2. Ejecuta:
 *      node backend/scripts/setup-users.js
 *
 *   3. Opcionalmente puedes especificar la ruta del key file:
 *      node backend/scripts/setup-users.js --key backend/firebase-service-account.json
 */

import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { existsSync } from "fs";
import { resolve } from "path";

const USERS = [
  {
    email: "alessandropaul19@gmail.com",
    password: "cajeroprueba",
    displayName: "Cajero Municipal",
    rol: "cajero",
  },
  {
    email: "arodriguezr1020@gmail.com",
    password: "inspectorprueba",
    displayName: "Inspector Municipal",
    rol: "inspector",
  },
  {
    email: "medicitasapp01@gmail.com",
    password: "admin321",
    displayName: "Administrador General",
    rol: "administrador",
  },
];

function getKeyPath() {
  const flagIdx = process.argv.indexOf("--key");
  if (flagIdx !== -1 && process.argv[flagIdx + 1]) {
    return resolve(process.argv[flagIdx + 1]);
  }
  const candidates = [
    "backend/firebase-service-account.json",
    "../firebase-service-account.json",
    "firebase-service-account.json",
    "service-account.json",
  ];
  for (const c of candidates) {
    const p = resolve(c);
    if (existsSync(p)) return p;
  }
  return null;
}

async function main() {
  const keyPath = getKeyPath();

  if (keyPath && existsSync(keyPath)) {
    console.log(`[INFO] Usando service account key: ${keyPath}`);
    initializeApp({ credential: cert(keyPath) });
  } else {
    console.log("[INFO] No se encontró service account key, usando application default credentials.");
    initializeApp({ credential: applicationDefault() });
  }

  const auth = getAuth();
  const db = getFirestore();
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const user of USERS) {
    console.log(`\n--- Procesando: ${user.email} (${user.rol}) ---`);

    let uid;
    try {
      const existing = await auth.getUserByEmail(user.email);
      uid = existing.uid;
      console.log(`  [EXISTS] Auth user ya existe: ${uid}`);
      skipped++;
    } catch {
      try {
        const result = await auth.createUser({
          email: user.email,
          password: user.password,
          displayName: user.displayName,
          emailVerified: true,
        });
        uid = result.uid;
        console.log(`  [CREATED] Auth user creado: ${uid}`);
        created++;
      } catch (err) {
        console.error(`  [ERROR] No se pudo crear auth user: ${err.message}`);
        continue;
      }
    }

    const userRef = db.collection("usuarios").doc(uid);
    const docSnap = await userRef.get();

    if (docSnap.exists) {
      await userRef.update({
        correo: user.email,
        nombre: user.displayName,
        rol: user.rol,
        estado: "activo",
        activo: true,
        actualizadoEn: new Date().toISOString(),
      });
      console.log(`  [UPDATED] Firestore document actualizado`);
    } else {
      await userRef.set({
        uid,
        correo: user.email,
        nombre: user.displayName,
        nombre_completo: user.displayName,
        rol: user.rol,
        estado: "activo",
        activo: true,
        telefono: "",
        dni: "",
        recibir_correos: true,
        canalRegistro: "interno",
        creadoEn: new Date().toISOString(),
      });
      console.log(`  [CREATED] Firestore document creado`);
    }
  }

  console.log(`\n=== RESUMEN ===`);
  console.log(`Auth users creados:  ${created}`);
  console.log(`Auth users existentes (saltados): ${skipped}`);
  console.log(`Firestore documents creados/actualizados: ${USERS.length}`);
  console.log(`\nListo. Ahora puedes iniciar sesión con las credenciales configuradas.`);
}

main().catch((err) => {
  console.error("\n[FATAL ERROR]", err.message);
  process.exit(1);
});
