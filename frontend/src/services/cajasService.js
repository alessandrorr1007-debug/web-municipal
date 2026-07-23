import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
} from "firebase/firestore";
import { db } from "../firebase";

const COLLECTION_NAME = "cajas";

/**
 * Sanitiza valores para evitar errores de Firestore con undefined o arreglos anidados
 */
const sanitizarParaFirestore = (val) => {
  if (val === undefined) return null;
  if (val === null) return null;
  if (typeof val !== "object") return val;
  if (Array.isArray(val)) return val.flat(Infinity).map(sanitizarParaFirestore);
  const clean = {};
  for (const [key, v] of Object.entries(val)) {
    if (v !== undefined) {
      clean[key] = sanitizarParaFirestore(v);
    }
  }
  return clean;
};

/**
 * Consulta en Firestore si el cajero autenticado ya posee una caja en estado "Abierta"
 * @param {string} cajeroId - ID del cajero autenticado (usuario.uid)
 * @returns {Promise<Object|null>} Retorna la caja activa o null si no posee ninguna.
 */
export const obtenerCajaActivaPorCajero = async (cajeroId) => {
  if (!cajeroId) return null;
  try {
    const q = query(
      collection(db, COLLECTION_NAME),
      where("cajeroId", "==", String(cajeroId)),
      where("estado", "==", "Abierta")
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const firstDoc = snap.docs[0];
    return { id: firstDoc.id, ...firstDoc.data() };
  } catch (error) {
    console.error("Error al consultar caja activa en Firestore:", error);
    return null;
  }
};

/**
 * Realiza la Apertura de Caja Municipal registrando automáticamente los datos del usuario de sesión
 * @param {Object} params
 * @param {string} params.cajeroId - ID del cajero autenticado
 * @param {string} params.cajeroNombre - Nombre del cajero autenticado
 * @param {string} params.cajeroEmail - Email del cajero autenticado
 * @param {number|string} params.montoInicial - Monto inicial ingresado por el cajero
 * @returns {Promise<Object>} Datos de la caja abierta
 */
export const abrirCajaMunicipal = async ({ cajeroId, cajeroNombre, cajeroEmail, montoInicial }) => {
  if (!cajeroId) {
    throw new Error("No hay una sesión activa de usuario cajero autenticado.");
  }

  const monto = parseFloat(montoInicial);
  if (isNaN(monto) || monto < 0) {
    throw new Error("El monto inicial debe ser un valor numérico válido mayor o igual a S/ 0.00.");
  }

  // 1. Validación de buenas prácticas: verificar si el cajero ya tiene una caja abierta activa
  const cajaExistente = await obtenerCajaActivaPorCajero(cajeroId);
  if (cajaExistente) {
    const fecha = cajaExistente.fechaApertura || "el inicio de turno";
    const montoPrevio = parseFloat(cajaExistente.montoInicial || 0).toFixed(2);
    throw new Error(
      `⚠️ Ya cuenta con una Caja Municipal Abierta desde ${fecha} con un fondo inicial de S/ ${montoPrevio}. No es posible aperturar más de una caja simultáneamente.`
    );
  }

  // 2. Construcción del registro con datos automáticos de la sesión
  const cajaId = `CAJA-${Date.now()}`;
  const fechaISO = new Date().toISOString();
  const fechaLocal = new Date().toLocaleString("es-PE", {
    dateStyle: "medium",
    timeStyle: "medium",
  });

  const nuevaCaja = sanitizarParaFirestore({
    id: cajaId,
    cajeroId: String(cajeroId),
    cajeroNombre: cajeroNombre || cajeroEmail || "Cajero Municipal",
    cajeroEmail: cajeroEmail || "",
    fechaApertura: fechaLocal,
    fechaAperturaISO: fechaISO,
    montoInicial: monto,
    estado: "Abierta",
    ventanilla: "Ventanilla Municipal Principal",
    creadoEn: fechaISO,
  });

  const refDoc = doc(db, COLLECTION_NAME, cajaId);
  await setDoc(refDoc, nuevaCaja);

  return nuevaCaja;
};

/**
 * Efectúa el cierre de la caja activa
 * @param {string} cajaId - ID de la caja a cerrar
 * @param {Object} datosArqueo - Resumen del arqueo final
 */
export const cerrarCajaMunicipal = async (cajaId, datosArqueo = {}) => {
  if (!cajaId) throw new Error("Identificador de caja requerido.");
  const refDoc = doc(db, COLLECTION_NAME, String(cajaId));
  const fechaCierreLocal = new Date().toLocaleString("es-PE", {
    dateStyle: "medium",
    timeStyle: "medium",
  });

  const updatePayload = sanitizarParaFirestore({
    estado: "Cerrada",
    fechaCierre: fechaCierreLocal,
    fechaCierreISO: new Date().toISOString(),
    arqueoFinal: datosArqueo,
  });

  await updateDoc(refDoc, updatePayload);
  return true;
};
