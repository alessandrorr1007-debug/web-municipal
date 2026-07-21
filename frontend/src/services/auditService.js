import {
  collection,
  doc,
  getDocs,
  setDoc,
  serverTimestamp,
  query,
  orderBy,
  limit,
} from "firebase/firestore";
import { db } from "../firebase";

const COLLECTION = "auditoria";

const generarHash = async (texto) => {
  const encoder = new TextEncoder();
  const data = encoder.encode(texto);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
};

export const registrarAccion = async ({ usuario, usuarioId, accion, detalle }) => {
  const id = doc(collection(db, COLLECTION)).id;
  const ahora = new Date();

  const registro = {
    id,
    usuario: usuario || "Sistema",
    usuarioId: usuarioId || "",
    accion: accion || "",
    detalle: detalle || "",
    fecha: ahora.toLocaleDateString("es-PE"),
    hora: ahora.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }),
    timestamp: serverTimestamp(),
  };

  await setDoc(doc(db, COLLECTION, id), registro);
  return registro;
};

export const registrarDecisionFuncionario = async ({
  usuario,
  usuarioId,
  solicitudId,
  decision,
  observacion,
}) => {
  const id = doc(collection(db, COLLECTION)).id;
  const ahora = new Date();
  const timestampMs = ahora.getTime();

  const hashEntrada = `${usuarioId}:${solicitudId}:${decision}:${timestampMs}`;
  const hashFirma = await generarHash(hashEntrada);

  const registro = {
    id,
    tipo: "DECISION_FUNCIONARIO",
    usuario: usuario || "Funcionario",
    usuarioId: usuarioId || "",
    solicitudId: solicitudId || "",
    decision: decision || "",
    observacion: observacion || "",
    fecha: ahora.toLocaleDateString("es-PE"),
    hora: ahora.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }),
    timestamp: serverTimestamp(),
    timestampMs,
    hashFirma,
    immutable: true,
  };

  await setDoc(doc(db, COLLECTION, id), registro);
  return { ...registro, hashFirma };
};

export const obtenerAuditoria = async (maxResults = 100) => {
  const q = query(
    collection(db, COLLECTION),
    orderBy("timestamp", "desc"),
    limit(maxResults)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
};
