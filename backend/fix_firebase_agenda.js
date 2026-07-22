import { initializeApp } from "firebase/app";
import { initializeFirestore, getDocs, updateDoc, doc, collection, deleteField } from "firebase/firestore";
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

const INSPECTORES = [
  { uid: "INSP-001", nombre: "Inspector Carlos Ramírez" },
  { uid: "INSP-002", nombre: "Inspectora Ana López" },
  { uid: "INSP-003", nombre: "Inspector Luis Mendoza" },
  { uid: "INSP-004", nombre: "Inspectora María Torres" },
];

const ORDEN_SLOTS = ["08:00", "10:00", "14:00", "16:00"];
const LABELS_SLOTS = {
  "08:00": "08:00 a. m.",
  "10:00": "10:00 a. m.",
  "14:00": "02:00 p. m.",
  "16:00": "04:00 p. m.",
};

const normalizarFecha = (fStr) => {
  if (!fStr) return "22/07/2026";
  const str = String(fStr).trim();
  if (str.includes("-")) {
    const p = str.split("-");
    if (p.length === 3) {
      const y = p[0].length === 4 ? p[0] : p[2];
      const m = p[1].padStart(2, "0");
      const d = (p[0].length === 4 ? p[2] : p[0]).padStart(2, "0");
      return `${d}/${m}/${y}`;
    }
  }
  if (str.includes("/")) {
    const p = str.split("/");
    if (p.length === 3) {
      const d = p[0].padStart(2, "0");
      const m = p[1].padStart(2, "0");
      const y = p[2].length === 4 ? p[2] : p[2].padStart(4, "20");
      return `${d}/${m}/${y}`;
    }
  }
  return str;
};

async function auditarYRepararBaseDeDatos() {
  console.log("=================================================");
  console.log("🔍 AUDITANDO Y REPARANDO COLECCIÓN 'solicitudes' EN FIREBASE...");
  console.log("=================================================");

  const snap = await getDocs(collection(db, "solicitudes"));
  const docs = snap.docs.map((d) => ({ docId: d.id, ...d.data() }));

  console.log(`📋 Total de expedientes encontrados en Firebase: ${docs.length}`);

  const slotsOcupadosMap = new Map(); // `${inspectorUid}_${fecha}_${slot}` -> docId
  let totalModificados = 0;

  for (let idx = 0; idx < docs.length; idx++) {
    const item = docs[idx];
    const est = String(item.estado || item.estadoNormalizado || "").toLowerCase();
    if (est.includes("cancelad") || est.includes("anulad")) continue;

    let inspUid = item.inspectorUid || item.inspectorAsignadoUid || item.uidInspector;
    let inspNombre = item.inspectorNombre || item.inspectorAsignado || item.inspectorElegido || item.inspector;

    // Si el expediente no tenía inspector asignado en Firebase, asignar uno por omisión
    if (!inspUid || !inspNombre) {
      const inspAsignado = INSPECTORES[idx % INSPECTORES.length];
      inspUid = inspAsignado.uid;
      inspNombre = inspAsignado.nombre;
    }

    const fechaStr = normalizarFecha(item.fechaVisitaInspector || item.fechaVisita || item.fechaInspeccion);

    // Determinar el slot deseado o asignar uno disponible
    let slotDeseado = item.slotInspeccion || item.horaVisitaInspector || item.horaVisita;
    if (!slotDeseado || slotDeseado === "undefined") {
      slotDeseado = ORDEN_SLOTS[idx % ORDEN_SLOTS.length];
    }

    let comboKey = `${inspUid}_${fechaStr}_${slotDeseado}`;

    if (slotsOcupadosMap.has(comboKey)) {
      console.warn(`⚠️ [CONFLICTO DETECTADO] EXP-${item.docId} (${item.nombreNegocio}) en conflicto en fecha ${fechaStr} a las ${LABELS_SLOTS[slotDeseado] || slotDeseado}. Buscando slot libre...`);
      
      let nuevoSlotLibre = null;
      for (const sVal of ORDEN_SLOTS) {
        if (!slotsOcupadosMap.has(`${inspUid}_${fechaStr}_${sVal}`)) {
          nuevoSlotLibre = sVal;
          break;
        }
      }

      if (nuevoSlotLibre) {
        slotDeseado = nuevoSlotLibre;
        comboKey = `${inspUid}_${fechaStr}_${slotDeseado}`;
      } else {
        // Si el inspector tiene los 4 slots llenos ese día, cambiar de inspector
        for (const inspAux of INSPECTORES) {
          for (const sVal of ORDEN_SLOTS) {
            if (!slotsOcupadosMap.has(`${inspAux.uid}_${fechaStr}_${sVal}`)) {
              inspUid = inspAux.uid;
              inspNombre = inspAux.nombre;
              slotDeseado = sVal;
              comboKey = `${inspUid}_${fechaStr}_${slotDeseado}`;
              break;
            }
          }
          if (slotsOcupadosMap.has(comboKey)) break;
        }
      }
    }

    slotsOcupadosMap.set(comboKey, item.docId);

    const horaLabel = LABELS_SLOTS[slotDeseado] || `${slotDeseado} a. m.`;
    const numExp = `EXP-${String(item.docId).replace(/^EXP-/, "")}`;

    console.log(`✅ [LIMPIANDO Y GUARDANDO EN FIREBASE] ${numExp} | Negocio: ${item.nombreNegocio} | Inspector: ${inspNombre} (${inspUid}) | Fecha: ${fechaStr} | Horario: ${horaLabel}`);

    await updateDoc(doc(db, "solicitudes", item.docId), {
      // Propiedades Canónicas Únicas
      numeroExpediente: numExp,
      inspectorUid: inspUid,
      inspectorNombre: inspNombre,
      fechaVisitaInspector: fechaStr,
      slotInspeccion: slotDeseado,
      horaVisitaLabel: horaLabel,

      // Eliminación de propiedades duplicadas / redundantes
      fechaInspeccion: deleteField(),
      fechaVisita: deleteField(),
      horaVisita: deleteField(),
      horaVisitaInspector: deleteField(),
      inspector: deleteField(),
      inspectorAsignado: deleteField(),
      inspectorElegido: deleteField(),
      uidInspector: deleteField(),
      inspectorAsignadoUid: deleteField(),
    });

    totalModificados++;
  }

  console.log("=================================================");
  console.log(`🎉 AUDITORÍA COMPLETA. Expedientes saneados y guardados en Firebase: ${totalModificados}`);
  console.log("=================================================");
  process.exit(0);
}

auditarYRepararBaseDeDatos().catch((err) => {
  console.error("❌ Error en script de auditoría:", err);
  process.exit(1);
});
