import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  query,
  orderBy,
  where,
  onSnapshot,
} from "firebase/firestore";

import { db, authHeaders } from "../firebase";

const API_URL = import.meta.env.VITE_API_URL || "";

const COLLECTION_NAME = "solicitudes";

const generarIdExpediente = () => {
  return "EXP-" + Date.now().toString().slice(-8);
};

export const sanitizarSolicitudPayload = (solicitud) => {
  if (!solicitud) return solicitud;
  const copia = JSON.parse(JSON.stringify(solicitud));

  const limpiarLista = (arr) => {
    if (!Array.isArray(arr)) return arr;
    return arr.map((pdf) => {
      if (!pdf) return pdf;
      const url = pdf.archivoUrl || pdf.url || "";
      if (typeof url === "string" && url.startsWith("data:") && url.length > 200000) {
        const previewUrl = url.slice(0, 40000) + "...[PDF_DOCUMENTO_ADJUNTO]";
        return {
          ...pdf,
          archivoUrl: previewUrl,
          url: previewUrl,
          esTruncado: true,
          tamanoEstimado: `${(url.length / 1024 / 1024).toFixed(2)} MB`,
        };
      }
      return pdf;
    });
  };

  if (copia.archivosPdf) copia.archivosPdf = limpiarLista(copia.archivosPdf);
  if (copia.archivosPresenciales) copia.archivosPresenciales = limpiarLista(copia.archivosPresenciales);

  return copia;
};

export const guardarSolicitud = async (solicitud) => {
  const solicitudLimpia = sanitizarSolicitudPayload(solicitud);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const headers = await authHeaders();
    const response = await fetch(`${API_URL}/api/solicitudes`, {
      method: "POST",
      headers,
      body: JSON.stringify(solicitudLimpia),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const contentType = response.headers.get("content-type");
    if (response.ok && contentType && contentType.includes("application/json")) {
      const data = await response.json();
      return {
        id: data.idSolicitud || solicitudLimpia.id,
        ...solicitudLimpia,
      };
    }

    // Fallback: Guardado directo en Firestore si el backend responde con error de status o no-JSON (Ej. 413)
    console.warn(`[guardarSolicitud] Servidor devolvió HTTP ${response.status}. Utilizando respaldo directo a Firestore...`);
    const docId = String(solicitudLimpia.id || Date.now().toString().slice(-6));
    await setDoc(doc(db, COLLECTION_NAME, docId), {
      ...solicitudLimpia,
      creadoEn: serverTimestamp(),
    });

    return {
      id: docId,
      ...solicitudLimpia,
    };
  } catch (error) {
    clearTimeout(timeoutId);
    console.warn("[guardarSolicitud] Fallo en API POST. Utilizando respaldo directo a Firestore...", error.message);
    try {
      const docId = String(solicitudLimpia.id || Date.now().toString().slice(-6));
      await setDoc(doc(db, COLLECTION_NAME, docId), {
        ...solicitudLimpia,
        creadoEn: serverTimestamp(),
      });
      return {
        id: docId,
        ...solicitudLimpia,
      };
    } catch (fsError) {
      throw new Error(`Error al registrar la solicitud: ${fsError.message}`);
    }
  }
};

export const eliminarSolicitud = async (solicitudId) => {
  if (!solicitudId) return;
  try {
    const docId = String(solicitudId).replace(/^EXP-/, "");
    await deleteDoc(doc(db, COLLECTION_NAME, docId));
    console.log(`[eliminarSolicitud] Solicitud ${docId} eliminada por pago no completado.`);
  } catch (err) {
    console.error(`[eliminarSolicitud] Error al eliminar solicitud ${solicitudId}:`, err);
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

export const suscribirSolicitudes = (callback) => {
  const coleccionRef = collection(db, COLLECTION_NAME);
  return onSnapshot(
    coleccionRef,
    (snapshot) => {
      const solicitudes = snapshot.docs.map((documento) => ({
        id: documento.id,
        ...documento.data(),
      }));
      const ordenadas = solicitudes.sort((a, b) => {
        const aTime = a.creadoEn?.seconds || a.creadoEn?.toMillis?.() || 0;
        const bTime = b.creadoEn?.seconds || b.creadoEn?.toMillis?.() || 0;
        return bTime - aTime;
      });
      callback(ordenadas);
    },
    (err) => {
      console.error("[FIRESTORE REALTIME] Error en suscripción a solicitudes:", err);
    }
  );
};

const crearNotificacionEnDb = async (uidUsuario, { titulo, descripcion, icono, html }, correoUsuario = "") => {
  if (!uidUsuario && !correoUsuario) return;
  try {
    if (uidUsuario) {
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
      console.log("[NOTIFICACION SOLICITUD] Creada con éxito:", titulo);
    }

    if (correoUsuario) {
      authHeaders().then(headers => {
        fetch(`${API_URL}/api/email/enviar-notificacion`, {
          method: "POST",
          headers,
          body: JSON.stringify({ correoUsuario, titulo, descripcion, html }),
        }).then((res) => {
          if (!res.ok) console.error("[NOTIFICACION EMAIL] Error del servidor de correos.");
          else console.log("[NOTIFICACION EMAIL] Enviado correctamente a:", correoUsuario);
        }).catch((err) => {
          console.error("[NOTIFICACION EMAIL] Error al conectar para enviar email:", err.message);
        });
      }).catch(err => console.error("[NOTIFICACION EMAIL] No se pudo obtener token:", err.message));
    }
  } catch (err) {
    console.error("Error creando notificación:", err);
  }
};

export const actualizarSolicitud = async (id, cambios) => {
  if (!id) {
    throw new Error("No se recibió el ID de la solicitud.");
  }

  const solicitudRef = doc(db, COLLECTION_NAME, id);
  
  let uidUsuario = "";
  let correoUsuario = "";
  let estadoAnterior = "";
  let notificacionesAnteriores = [];
  try {
    const snapshot = await getDoc(solicitudRef);
    if (snapshot.exists()) {
      const data = snapshot.data();
      uidUsuario = data.uidUsuario || "";
      correoUsuario = data.correoUsuario || "";
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
      }, correoUsuario);
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
          }, correoUsuario);
        }
      }
    }
  }

  return true;
};

export const obtenerInspeccionesPorFecha = async (fechaStr) => {
  const snapshot = await getDocs(collection(db, COLLECTION_NAME));
  return snapshot.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((s) => {
      if (!s.fechaVisitaInspector) return false;
      if (s.fechaVisitaInspector !== fechaStr) return false;
      const insp = (s.inspeccion || "").toLowerCase();
      const estado = (s.estado || "").toLowerCase();
      if (insp === "aprobada" || insp === "rechazada" || insp === "reobservada") return false;
      if (estado === "aprobado" || estado === "rechazado" || estado === "resultado enviado al funcionario") return false;
      return true;
    });
};

export const contarInspeccionesEnFecha = async (fechaStr) => {
  const inspecciones = await obtenerInspeccionesPorFecha(fechaStr);
  return inspecciones.length;
};

export const obtenerSolicitudesPendientesDecision = async () => {
  const data = await obtenerSolicitudes();
  return data.filter((s) => {
    const estado = (s.estado || "").toLowerCase();
    return (
      estado === "inspección realizada" ||
      estado === "resultado enviado al funcionario" ||
      s.recomendacionInspector === "Aprobar" ||
      s.recomendacionInspector === "Rechazar"
    );
  });
};

export const obtenerSolicitudesPorInspector = async (inspectorUid) => {
  const data = await obtenerSolicitudes();
  return data.filter((s) => s.inspectorAsignadoUid === inspectorUid || !inspectorUid);
};

export const obtenerSolicitudesHoy = async () => {
  const hoy = new Date();
  const dia = String(hoy.getDate()).padStart(2, "0");
  const mes = String(hoy.getMonth() + 1).padStart(2, "0");
  const anio = hoy.getFullYear();
  const fechaHoy = `${dia}/${mes}/${anio}`;
  const data = await obtenerSolicitudes();
  return data.filter((s) => s.fechaVisitaInspector === fechaHoy);
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

export const obtenerInspectores = async () => {
  try {
    const q = query(collection(db, "usuarios"), where("rol", "==", "inspector"));
    const snapshot = await getDocs(q);
    const inspectores = snapshot.docs.map((documento) => ({
      uid: documento.id,
      id: documento.id,
      ...documento.data(),
    }));
    return inspectores;
  } catch (error) {
    console.error("Error al obtener inspectores de la BD:", error);
    return [];
  }
};

export const obtenerHorariosOcupadosInspector = async (fechaStr, inspectorUid = "") => {
  try {
    const snapshot = await getDocs(collection(db, COLLECTION_NAME));
    const ocupados = [];
    snapshot.docs.forEach((docSnap) => {
      const s = docSnap.data();
      if (!s.fechaVisitaInspector || s.fechaVisitaInspector !== fechaStr) return;
      if (inspectorUid && s.inspectorAsignadoUid && s.inspectorAsignadoUid !== inspectorUid) return;
      if (s.horaVisitaInspector) {
        ocupados.push({
          slot: s.horaVisitaInspector,
          estadoInspeccion: s.estadoInspeccion || s.inspeccion || "Programada",
          expedienteId: docSnap.id,
        });
      }
    });
    return ocupados;
  } catch (error) {
    console.error("Error al consultar horarios ocupados:", error);
    return [];
  }
};