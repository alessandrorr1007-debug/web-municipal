import { db, authHeaders } from "../firebase";
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  query,
  where,
  getDocs,
} from "firebase/firestore";

const COLLECTION = "notificaciones";
const API_URL = import.meta.env.VITE_API_URL || "";

export const crearNotificacion = async (uidUsuario, notifPayload, correoUsuario = "") => {
  if (!uidUsuario) return;
  const idNotificacion = doc(collection(db, COLLECTION)).id;
  const fechaHora = new Date().toISOString();

  const titulo = typeof notifPayload === "string" ? notifPayload : notifPayload?.titulo || "";
  const descripcion = typeof notifPayload === "object" ? notifPayload?.descripcion || "" : "";
  const icono = typeof notifPayload === "object" ? notifPayload?.icono || "🔔" : "🔔";
  const html = typeof notifPayload === "object" ? notifPayload?.html || null : null;

  const nueva = {
    id_notificacion: idNotificacion,
    uid_usuario: uidUsuario,
    titulo,
    descripcion,
    icono,
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
        body: JSON.stringify({ correoUsuario, titulo, descripcion, html }),
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
    await updateDoc(docRef, {
      leida: true,
      fechaLectura: new Date().toISOString(),
    });
    console.log("[NOTIFICACION] Marcada como leída:", idNotificacion);
  } catch (error) {
    console.error("[NOTIFICACION] Error al marcar como leída:", error);
  }
};

export const marcarTodasComoLeidas = async (uidUsuario) => {
  if (!uidUsuario) return;
  try {
    const q = query(
      collection(db, COLLECTION),
      where("uid_usuario", "==", uidUsuario),
      where("leida", "==", false)
    );
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      console.log("[NOTIFICACION] No hay notificaciones pendientes.");
      return;
    }

    const batch = snapshot.docs.map((documento) =>
      updateDoc(doc(db, COLLECTION, documento.id), {
        leida: true,
        fechaLectura: new Date().toISOString(),
      })
    );

    await Promise.all(batch);
    console.log(`[NOTIFICACION] ${snapshot.size} notificaciones marcadas como leídas.`);
  } catch (error) {
    console.error("[NOTIFICACION] Error al marcar todas como leídas:", error);
  }
};
