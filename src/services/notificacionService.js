import { db } from "../firebase";
import {
  collection,
  doc,
  setDoc,
  updateDoc,
} from "firebase/firestore";

const COLLECTION = "notificaciones";

export const crearNotificacion = async (uidUsuario, { titulo, descripcion, icono }) => {
  if (!uidUsuario) return;
  const idNotificacion = doc(collection(db, COLLECTION)).id;
  const fechaHora = new Date().toISOString();

  const nueva = {
    id_notificacion: idNotificacion,
    uid_usuario: uidUsuario,
    titulo,
    descripcion,
    icono: icono || "🔔",
    fecha_hora: fechaHora,
    leida: false,
  };

  try {
    await setDoc(doc(db, COLLECTION, idNotificacion), nueva);
    console.log("[NOTIFICACION] Creada con éxito:", titulo);
  } catch (error) {
    console.error("[NOTIFICACION] Error al crear:", error);
  }
};

export const marcarComoLeida = async (idNotificacion) => {
  if (!idNotificacion) return;
  try {
    const docRef = doc(db, COLLECTION, idNotificacion);
    await updateDoc(docRef, { leida: true });
    console.log("[NOTIFICACION] Marcada como leída:", idNotificacion);
  } catch (error) {
    console.error("[NOTIFICACION] Error al marcar como leída:", error);
  }
};
