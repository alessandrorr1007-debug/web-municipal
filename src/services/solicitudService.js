import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  query,
  orderBy,
  where,
} from "firebase/firestore";

import { db } from "../firebase";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

const COLLECTION_NAME = "solicitudes";

const generarIdExpediente = () => {
  return "EXP-" + Date.now().toString().slice(-6);
};

export const guardarSolicitud = async (solicitud) => {
  const response = await fetch(`${API_URL}/api/solicitudes`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(solicitud),
  });

  const contentType = response.headers.get("content-type");
  if (!contentType || !contentType.includes("application/json")) {
    throw new Error(`El servidor no devolvió una respuesta JSON válida (código HTTP: ${response.status}).`);
  }

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Error al guardar la solicitud.");
  }

  return {
    id: data.idSolicitud,
    ...solicitud,
  };
};

export const obtenerNegociosPorUsuario = async (uidUsuario) => {
  if (!uidUsuario) return [];
  const q = query(collection(db, "negocios"), where("uidUsuario", "==", uidUsuario));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => doc.data());
};

export const obtenerSolicitudes = async () => {
  const q = query(collection(db, COLLECTION_NAME));
  const snapshot = await getDocs(q);

  const solicitudes = snapshot.docs.map((documento) => ({
    id: documento.id,
    ...documento.data(),
  }));

  // Sort locally by creadoEn to avoid query hanging during server writes
  return solicitudes.sort((a, b) => {
    const aTime = a.creadoEn?.seconds || a.creadoEn?.toMillis?.() || 0;
    const bTime = b.creadoEn?.seconds || b.creadoEn?.toMillis?.() || 0;
    return bTime - aTime;
  });
};

export const actualizarSolicitud = async (id, cambios) => {
  if (!id) {
    throw new Error("No se recibió el ID de la solicitud.");
  }

  const solicitudRef = doc(db, COLLECTION_NAME, id);

  await updateDoc(solicitudRef, {
    ...cambios,
    actualizadoEn: serverTimestamp(),
  });

  return true;
};

export const obtenerSolicitudPorId = async (id) => {
  if (!id) {
    throw new Error("No se recibió el ID de la solicitud.");
  }

  const solicitudRef = doc(db, COLLECTION_NAME, id);
  const snapshot = await getDoc(solicitudRef);

  if (!snapshot.exists()) {
    return null;
  }

  return {
    id: snapshot.id,
    ...snapshot.data(),
  };
};