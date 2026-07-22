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

  // Garantizar valores canónicos únicos de fecha, horario e inspector
  const hoy = new Date();
  const manana = new Date(hoy);
  manana.setDate(manana.getDate() + 1);
  const dStr = String(manana.getDate()).padStart(2, "0");
  const mStr = String(manana.getMonth() + 1).padStart(2, "0");
  const yStr = manana.getFullYear();
  const fechaPorDefecto = `${dStr}/${mStr}/${yStr}`;

  const fechaFinal = (copia.fechaVisitaInspector || copia.fechaVisita || copia.fechaInspeccion || fechaPorDefecto).trim();
  const slotFinal = (copia.slotInspeccion || copia.horaVisitaInspector || copia.horaVisita || "08:00").trim();
  const inspUidFinal = (copia.inspectorUid || copia.inspectorAsignadoUid || copia.uidInspector || "INSP-001").trim();
  const inspNombreFinal = (copia.inspectorNombre || copia.inspectorAsignado || copia.inspectorElegido || copia.inspector || "Inspector Carlos Ramírez").trim();

  const LABELS_MAP = {
    "08:00": "08:00 a. m.",
    "10:00": "10:00 a. m.",
    "14:00": "02:00 p. m.",
    "16:00": "04:00 p. m.",
  };
  const labelFinal = LABELS_MAP[slotFinal] || copia.horaVisitaLabel || `${slotFinal} a. m.`;

  copia.fechaVisitaInspector = fechaFinal;
  copia.slotInspeccion = slotFinal;
  copia.horaVisitaLabel = labelFinal;
  copia.inspectorUid = inspUidFinal;
  copia.inspectorNombre = inspNombreFinal;

  // Eliminar aliases duplicados en el objeto para evitar propiedades redundantes en Firestore
  delete copia.fechaInspeccion;
  delete copia.fechaVisita;
  delete copia.horaVisita;
  delete copia.horaVisitaInspector;
  delete copia.inspector;
  delete copia.inspectorAsignado;
  delete copia.inspectorElegido;
  delete copia.uidInspector;
  delete copia.inspectorAsignadoUid;

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
    if (!response.ok && contentType && contentType.includes("application/json")) {
      const errorData = await response.json();
      if (errorData?.detalle || errorData?.error) {
        throw new Error(errorData.detalle || errorData.error);
      }
    }

    if (response.ok && contentType && contentType.includes("application/json")) {
      const data = await response.json();
      const idReal = String(data.idSolicitud || data.id || solicitudLimpia.id).replace(/^EXP-/, "");
      return {
        ...solicitudLimpia,
        id: idReal,
        numeroExpediente: `EXP-${idReal}`,
      };
    }

    // Fallback: Guardado directo en Firestore si el backend responde con error de status o no-JSON (Ej. 413)
    console.warn(`[guardarSolicitud] Servidor devolvió HTTP ${response.status}. Utilizando respaldo directo a Firestore...`);
    const docId = String(solicitudLimpia.id || Date.now().toString().slice(-8)).replace(/^EXP-/, "");
    await setDoc(doc(db, COLLECTION_NAME, docId), {
      ...solicitudLimpia,
      id: docId,
      numeroExpediente: `EXP-${docId}`,
      creadoEn: serverTimestamp(),
    });

    return {
      ...solicitudLimpia,
      id: docId,
      numeroExpediente: `EXP-${docId}`,
    };
  } catch (error) {
    clearTimeout(timeoutId);
    console.warn("[guardarSolicitud] Fallo en API POST. Utilizando respaldo directo a Firestore...", error.message);
    try {
      const docId = String(solicitudLimpia.id || Date.now().toString().slice(-8)).replace(/^EXP-/, "");
      await setDoc(doc(db, COLLECTION_NAME, docId), {
        ...solicitudLimpia,
        id: docId,
        numeroExpediente: `EXP-${docId}`,
        creadoEn: serverTimestamp(),
      });
      return {
        ...solicitudLimpia,
        id: docId,
        numeroExpediente: `EXP-${docId}`,
      };
    } catch (fsError) {
      throw new Error(`Error al registrar la solicitud: ${fsError.message}`);
    }
  }
};

export const eliminarSolicitud = async (solicitudId) => {
  if (!solicitudId) return;
  try {
    const docResuelto = await resolverRefSolicitud(solicitudId);
    if (docResuelto && docResuelto.ref) {
      await deleteDoc(docResuelto.ref);
      console.log(`[eliminarSolicitud] Solicitud ${solicitudId} (ref: ${docResuelto.idUsado}) eliminada.`);
    }
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

const desduplicarHorariosAgenda = (solicitudes) => {
  if (!Array.isArray(solicitudes) || solicitudes.length === 0) return solicitudes;

  const ORDEN_SLOTS = ["08:00", "10:00", "14:00", "16:00"];
  const LABELS_SLOTS = {
    "08:00": "08:00 a. m.",
    "10:00": "10:00 a. m.",
    "14:00": "02:00 p. m.",
    "16:00": "04:00 p. m.",
  };

  const normalizarFechaKey = (fStr) => {
    if (!fStr) return "";
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

  const normalizarSlotKey = (sStr) => {
    if (!sStr) return "";
    const s = String(sStr).toLowerCase().trim();
    if (s.includes("08:00") || s.includes("8:00") || s.includes("08:00 a") || s.includes("8:00 a")) return "08:00";
    if (s.includes("10:00") || s.includes("10:00 a")) return "10:00";
    if (s.includes("14:00") || s.includes("02:00") || s.includes("2:00") || s.includes("02:00 p") || s.includes("2:00 p")) return "14:00";
    if (s.includes("16:00") || s.includes("04:00") || s.includes("4:00") || s.includes("04:00 p") || s.includes("4:00 p")) return "16:00";
    return s;
  };

  const ocupadosMap = new Map();
  const copia = [...solicitudes];

  for (const s of copia) {
    const est = String(s.estado || s.estadoNormalizado || "").toLowerCase();
    if (est.includes("cancelad") || est.includes("anulad")) continue;

    const inspTarget = String(s.inspectorUid || s.inspectorAsignadoUid || s.uidInspector || s.inspectorNombre || "INSPECTOR-DEFAULT").toLowerCase().trim();
    const fechaVisitaStr = String(s.fechaVisitaInspector || s.fechaVisita || s.fechaInspeccion || "").trim();
    const slotStr = String(s.slotInspeccion || s.horaVisitaInspector || s.horaVisitaLabel || s.horaVisita || "").trim();

    if (!inspTarget || !fechaVisitaStr || !slotStr) continue;

    const fTarget = normalizarFechaKey(fechaVisitaStr);
    const sTarget = normalizarSlotKey(slotStr);
    const keyCombo = `${inspTarget}_${fTarget}_${sTarget}`;

    if (!ocupadosMap.has(keyCombo)) {
      ocupadosMap.set(keyCombo, s.id);
    } else {
      let slotLibre = null;
      for (const slotVal of ORDEN_SLOTS) {
        const testKey = `${inspTarget}_${fTarget}_${slotVal}`;
        if (!ocupadosMap.has(testKey)) {
          slotLibre = slotVal;
          break;
        }
      }

      if (slotLibre) {
        s.slotInspeccion = slotLibre;
        s.horaVisitaLabel = LABELS_SLOTS[slotLibre] || `${slotLibre} a. m.`;
        ocupadosMap.set(`${inspTarget}_${fTarget}_${slotLibre}`, s.id);

        const docId = String(s.id).replace(/^EXP-/, "");
        updateDoc(doc(db, COLLECTION_NAME, docId), {
          slotInspeccion: slotLibre,
          horaVisitaLabel: LABELS_SLOTS[slotLibre] || `${slotLibre} a. m.`,
        }).catch((err) => console.warn("[desduplicarHorariosAgenda] Reasignación guardada:", err.message));
      }
    }
  }

  return copia;
};

export const obtenerSolicitudes = async () => {
  const q = query(collection(db, COLLECTION_NAME));
  const snapshot = await getDocs(q);

  const solicitudes = snapshot.docs.map((documento) => ({
    id: documento.id,
    ...documento.data(),
  }));

  const desduplicadas = desduplicarHorariosAgenda(solicitudes);

  // Sort locally by creadoEn to avoid query hanging during server writes
  return desduplicadas.sort((a, b) => {
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
      const desduplicadas = desduplicarHorariosAgenda(solicitudes);
      const ordenadas = desduplicadas.sort((a, b) => {
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

const resolverRefSolicitud = async (idInput) => {
  if (!idInput) return null;
  const idRaw = String(idInput).trim();
  const idClean = idRaw.replace(/^EXP-/, "");
  const idWithExp = `EXP-${idClean}`;

  // 1. Probar idClean ("37295929")
  const refClean = doc(db, COLLECTION_NAME, idClean);
  try {
    const snapClean = await getDoc(refClean);
    if (snapClean.exists()) return { ref: refClean, snap: snapClean, idUsado: idClean };
  } catch (e) {}

  // 2. Probar idWithExp ("EXP-37295929")
  const refExp = doc(db, COLLECTION_NAME, idWithExp);
  try {
    const snapExp = await getDoc(refExp);
    if (snapExp.exists()) return { ref: refExp, snap: snapExp, idUsado: idWithExp };
  } catch (e) {}

  // 3. Probar idRaw
  if (idRaw !== idClean && idRaw !== idWithExp) {
    const refRaw = doc(db, COLLECTION_NAME, idRaw);
    try {
      const snapRaw = await getDoc(refRaw);
      if (snapRaw.exists()) return { ref: refRaw, snap: snapRaw, idUsado: idRaw };
    } catch (e) {}
  }

  // 4. Buscar por consulta de campo 'id' o 'numeroExpediente' en la colección
  try {
    const snapAll = await getDocs(collection(db, COLLECTION_NAME));
    const encontrado = snapAll.docs.find((d) => {
      const data = d.data();
      const dIdClean = String(d.id).replace(/^EXP-/, "");
      const sIdClean = String(data.id || "").replace(/^EXP-/, "");
      const numExpClean = String(data.numeroExpediente || "").replace(/^EXP-/, "");
      return dIdClean === idClean || sIdClean === idClean || numExpClean === idClean;
    });

    if (encontrado) {
      return { ref: doc(db, COLLECTION_NAME, encontrado.id), snap: encontrado, idUsado: encontrado.id };
    }
  } catch (e) {}

  // Fallback por defecto a docIdClean
  return { ref: refClean, snap: null, idUsado: idClean };
};

const sanitizarCambiosPayload = (cambiosObj) => {
  if (!cambiosObj || typeof cambiosObj !== "object") return cambiosObj;

  // Clonación limpia que elimina automáticamente propiedades undefined y valores no serializables
  const JSON_CLEAN = JSON.parse(JSON.stringify(cambiosObj, (key, value) => {
    if (value === undefined) return undefined;
    return value;
  }));

  // Sanitizar listas y arreglos contenidos dentro del payload de cambios
  for (const k of Object.keys(JSON_CLEAN)) {
    if (Array.isArray(JSON_CLEAN[k])) {
      JSON_CLEAN[k] = JSON_CLEAN[k].map((item) => {
        if (!item) return item;
        if (typeof item === "object") {
          const itemCopia = { ...item };
          for (const prop of Object.keys(itemCopia)) {
            const val = itemCopia[prop];
            if (typeof val === "string" && val.startsWith("data:") && val.length > 200000) {
              itemCopia[prop] = val.slice(0, 40000) + "...[EVIDENCIA_TRUNCADA]";
            }
          }
          return itemCopia;
        }
        return item;
      });
    }
  }

  delete JSON_CLEAN.fechaInspeccion;
  delete JSON_CLEAN.fechaVisita;
  delete JSON_CLEAN.horaVisita;
  delete JSON_CLEAN.horaVisitaInspector;
  delete JSON_CLEAN.inspector;
  delete JSON_CLEAN.inspectorAsignado;
  delete JSON_CLEAN.inspectorElegido;
  delete JSON_CLEAN.uidInspector;
  delete JSON_CLEAN.inspectorAsignadoUid;

  return JSON_CLEAN;
};

export const actualizarSolicitud = async (id, cambios) => {
  if (!id) {
    throw new Error("No se recibió el ID de la solicitud.");
  }

  const cambiosLimpio = sanitizarCambiosPayload(cambios);
  const docResuelto = await resolverRefSolicitud(id);
  const solicitudRef = docResuelto.ref;
  const docIdClean = String(docResuelto.idUsado).replace(/^EXP-/, "");

  // Si se está cambiando la fecha, hora o inspector, validar que el slot no esté ocupado en Firebase
  if (cambiosLimpio.fechaVisitaInspector || cambiosLimpio.slotInspeccion || cambiosLimpio.horaVisitaInspector || cambiosLimpio.inspectorUid) {
    try {
      const snapAll = await getDocs(collection(db, COLLECTION_NAME));
      const todas = snapAll.docs.map((d) => ({ id: d.id, ...d.data() }));

      const docPrevio = todas.find((s) => String(s.id).replace(/^EXP-/, "") === docIdClean) || {};
      const inspUid = (cambiosLimpio.inspectorUid || cambiosLimpio.inspectorAsignadoUid || docPrevio.inspectorUid || docPrevio.inspectorNombre || "").toLowerCase().trim();
      const fechaVisita = (cambiosLimpio.fechaVisitaInspector || cambiosLimpio.fechaVisita || docPrevio.fechaVisitaInspector || "").trim();
      const slotDeseado = (cambiosLimpio.slotInspeccion || cambiosLimpio.horaVisitaInspector || cambiosLimpio.horaVisita || docPrevio.slotInspeccion || "").trim();

      if (inspUid && fechaVisita && slotDeseado) {
        const esOcupado = esSlotOcupadoInspector(todas, inspUid, fechaVisita, slotDeseado, docIdClean);
        if (esOcupado) {
          const slotLibreObj = obtenerPrimerSlotLibreParaInspector(todas, inspUid, fechaVisita, docIdClean);
          if (slotLibreObj) {
            cambiosLimpio.slotInspeccion = slotLibreObj.value;
            cambiosLimpio.horaVisitaLabel = slotLibreObj.label;
          }
        }
      }
    } catch (eErr) {
      console.warn("[actualizarSolicitud] Aviso al verificar cupos de agenda:", eErr.message);
    }
  }

  let uidUsuario = "";
  let correoUsuario = "";
  let estadoAnterior = "";
  let notificacionesAnteriores = [];
  try {
    const snapshot = docResuelto.snap || (await getDoc(solicitudRef));
    if (snapshot && snapshot.exists()) {
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
    ...cambiosLimpio,
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

export const actualizarFechaLicenciamiento = async (solicitudId, nuevaFechaStr) => {
  if (!solicitudId || !nuevaFechaStr) {
    throw new Error("ID de solicitud y nueva fecha son obligatorios.");
  }
  const idClean = String(solicitudId).replace(/^EXP-/, "");

  // Actualizar solicitud exclusivamente en la colección 'solicitudes'
  const docResuelto = await resolverRefSolicitud(idClean);
  if (docResuelto && docResuelto.ref) {
    await updateDoc(docResuelto.ref, {
      fechaExpiracionLicencia: nuevaFechaStr,
      fechaEvaluacionInspector: nuevaFechaStr,
      fechaLicenciamiento: nuevaFechaStr,
      fechaSolicitud: nuevaFechaStr,
      actualizadoEn: serverTimestamp(),
    });
  }

  return true;
};