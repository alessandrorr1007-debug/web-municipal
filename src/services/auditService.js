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

export const obtenerAuditoria = async (maxResults = 100) => {
  const q = query(
    collection(db, COLLECTION),
    orderBy("timestamp", "desc"),
    limit(maxResults)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
};
