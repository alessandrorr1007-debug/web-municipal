import { db, authHeaders } from "../firebase";
import {
  collection,
  doc,
  setDoc,
  updateDoc,
} from "firebase/firestore";

const COLLECTION = "notificaciones";
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

export const crearNotificacion = async (uidUsuario, { titulo, descripcion, icono }, correoUsuario = "") => {
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

  if (correoUsuario) {
    authHeaders().then(headers => {
      fetch(`${API_URL}/api/email/enviar-notificacion`, {
        method: "POST",
        headers,
        body: JSON.stringify({ correoUsuario, titulo, descripcion }),
      }).then((res) => {
        if (!res.ok) console.error("[NOTIFICACION EMAIL] Error del servidor de correos.");
        else console.log("[NOTIFICACION EMAIL] Enviado correctamente.");
      }).catch((err) => {
        console.error("[NOTIFICACION EMAIL] Error al conectar para enviar email:", err.message);
      });
    }).catch(err => console.error("[NOTIFICACION EMAIL] No se pudo obtener token:", err.message));
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
