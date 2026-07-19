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
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(`${API_URL}/api/solicitudes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(solicitud),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      throw new Error(`El servidor no devolvió una respuesta JSON válida (código HTTP: ${response.status}).`);
    }

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || "Error al guardar la solicitud.");
    }

    return {
      id: data.idSolicitud,
      ...solicitud,
    };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === "AbortError") {
      throw new Error("Tiempo de espera agotado al comunicarse con el servidor para guardar la solicitud.");
    }
    throw error;
  }
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

const crearNotificacionEnDb = async (uidUsuario, { titulo, descripcion, icono }) => {
  if (!uidUsuario) return;
  try {
    const idNotificacion = doc(collection(db, "notificaciones")).id;
    const fechaHora = new Date().toISOString();
    await setDoc(doc(db, "notificaciones", idNotificacion), {
      id_notificacion: idNotificacion,
      uid_usuario: uidUsuario,
      titulo,
      descripcion,
      icono: icono || "🔔",
      fecha_hora: fechaHora,
      leida: false,
    });
  } catch (err) {
    console.error("Error creating notification in db:", err);
  }
};

export const actualizarSolicitud = async (id, cambios) => {
  if (!id) {
    throw new Error("No se recibió el ID de la solicitud.");
  }

  const solicitudRef = doc(db, COLLECTION_NAME, id);
  
  let uidUsuario = "";
  let estadoAnterior = "";
  let notificacionesAnteriores = [];
  try {
    const snapshot = await getDoc(solicitudRef);
    if (snapshot.exists()) {
      const data = snapshot.data();
      uidUsuario = data.uidUsuario || "";
      estadoAnterior = data.estado || "";
      notificacionesAnteriores = data.notificaciones || [];
    }
  } catch (err) {
    console.error("Error al obtener solicitud previa en actualizarSolicitud:", err);
  }

  await updateDoc(solicitudRef, {
    ...cambios,
    actualizadoEn: serverTimestamp(),
  });

  if (uidUsuario) {
    if (cambios.estado && cambios.estado !== estadoAnterior) {
      let icon = "🔔";
      let title = "Actualización de solicitud";
      let desc = `Su solicitud EXP-${id} cambió de estado a: ${cambios.estado}`;

      if (["Licencia emitida", "Aprobado", "Aprobada"].includes(cambios.estado)) {
        icon = "✅";
        title = "Licencia aprobada";
        desc = `¡Felicidades! Su solicitud EXP-${id} ha sido aprobada y la licencia ha sido emitida.`;
      } else if (["Observado", "Observada"].includes(cambios.estado)) {
        icon = "⚠️";
        title = "Solicitud observada";
        desc = `Su solicitud EXP-${id} tiene observaciones que deben subsanarse: ${cambios.observacionFuncionario || cambios.observacionInspector || "Revise los detalles en su panel."}`;
      } else if (["Rechazado", "Rechazada"].includes(cambios.estado)) {
        icon = "❌";
        title = "Solicitud rechazada";
        desc = `Su solicitud EXP-${id} ha sido rechazada. Motivo: ${cambios.observacionFuncionario || "Revise los detalles."}`;
      } else if (cambios.estado === "Inspección programada") {
        icon = "📅";
        title = "Inspección programada";
        desc = `Se ha programado una visita de inspección para su local el ${cambios.fechaVisitaInspector || ""} a las ${cambios.horaVisitaInspector || ""}.`;
      }

      await crearNotificacionEnDb(uidUsuario, {
        titulo: title,
        descripcion: desc,
        icono: icon,
      });
    }

    if (cambios.notificaciones && cambios.notificaciones.length > notificacionesAnteriores.length) {
      const nuevasNotis = cambios.notificaciones.slice(notificacionesAnteriores.length);
      for (const item of nuevasNotis) {
        const yaNotificado = ["Licencia aprobada", "Licencia rechazada", "Inspección programada"].includes(item.titulo);
        if (!yaNotificado) {
          let icon = "🔔";
          if (item.titulo.toLowerCase().includes("pago")) icon = "💳";
          if (item.titulo.toLowerCase().includes("comprobante")) icon = "📄";
          await crearNotificacionEnDb(uidUsuario, {
            titulo: item.titulo,
            descripcion: item.mensaje || item.descripcion || "",
            icono: icon,
          });
        }
      }
    }
  }

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