import { initializeApp } from "firebase/app";
import { initializeFirestore, getDocs, setDoc, doc, collection, serverTimestamp } from "firebase/firestore";
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

const syncLicenciasAprobadas = async () => {
  console.log("=================================================");
  console.log("🚀 Sincronizando Colección 'licencias_aprobadas' en Firebase Firestore...");
  console.log("=================================================");

  try {
    const snapSolicitudes = await getDocs(collection(db, "solicitudes"));
    console.log(`📋 Total de solicitudes encontradas: ${snapSolicitudes.docs.length}`);

    let agregadosCount = 0;

    for (const d of snapSolicitudes.docs) {
      const data = d.id ? { id: d.id, ...d.data() } : d.data();
      const estado = String(data.estado || data.estadoInspeccion || data.estadoNormalizado || "").toLowerCase();

      const esAprobado = estado.includes("aprobad") || estado.includes("emitid") || estado.includes("renovad");

      if (esAprobado) {
        const idClean = String(data.id).replace(/^EXP-/, "");
        const docRef = doc(db, "licencias_aprobadas", idClean);

        const fechaLic = data.fechaEvaluacionInspector || data.fechaSolicitud || data.fecha || "22/07/2026";
        const rucClean = data.ruc || data.rucEstablecimiento || "20145532000";
        const negocioClean = data.nombreNegocio || data.razonSocial || "Establecimiento Comercial";

        await setDoc(docRef, {
          id: idClean,
          numeroExpediente: `EXP-${idClean}`,
          ruc: rucClean,
          nombreNegocio: negocioClean,
          razonSocial: data.razonSocial || negocioClean,
          nombresSolicitante: data.nombresSolicitante || data.solicitante || data.nombres || "",
          apellidosSolicitante: data.apellidosSolicitante || data.apellidos || "",
          dniSolicitante: data.dniSolicitante || data.dni || data.dniForm || "",
          correoUsuario: data.correoUsuario || data.correo || "",
          telefono: data.telefono || data.telefonoForm || "",
          distrito: data.distrito || data.distritoEstablecimiento || "Trujillo",
          direccion: data.direccion || data.direccionEstablecimiento || "",
          giro: data.giro || data.actividadEconomica || "Comercial",
          fechaLicenciamiento: fechaLic,
          fechaEvaluacionInspector: fechaLic,
          estadoLicencia: "VIGENTE",
          actualizadoEn: serverTimestamp(),
        }, { merge: true });

        agregadosCount++;
        console.log(`  ✅ Licencia creada/sincronizada en 'licencias_aprobadas'/${idClean} -> ${negocioClean} (${fechaLic})`);
      }
    }

    console.log("=================================================");
    console.log(`🎉 Sincronización completada exitosamente! ${agregadosCount} licencias procesadas.`);
    console.log("=================================================");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error durante la sincronización de licencias_aprobadas:", error);
    process.exit(1);
  }
};

syncLicenciasAprobadas();
