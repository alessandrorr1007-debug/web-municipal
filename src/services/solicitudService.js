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
} from "firebase/firestore";

import { db } from "../firebase";

const COLLECTION_NAME = "solicitudes";

const generarIdExpediente = () => {
  return "EXP-" + Date.now().toString().slice(-6);
};

export const guardarSolicitud = async (solicitud) => {
  const id = generarIdExpediente();
  const archivosPdf = solicitud.archivosPdf || [];

  const nuevaSolicitud = {
    id,
    fecha: new Date().toLocaleString("es-PE"),
    creadoEn: serverTimestamp(),
    actualizadoEn: serverTimestamp(),

    uidUsuario: solicitud.uidUsuario || "",
    correoUsuario: solicitud.correoUsuario || "",
    nombreSolicitante: solicitud.nombreSolicitante || "",
    telefonoSolicitante: solicitud.telefonoSolicitante || "",

    canalRegistro: solicitud.canalRegistro || "online",

    tipoTramite: solicitud.tipoTramite || "Nueva licencia",

    ruc: solicitud.ruc || "",
    nombreNegocio: solicitud.nombreNegocio || "",
    razonSocial: solicitud.razonSocial || "",
    direccion: solicitud.direccion || "",
    giro: solicitud.giro || "",
    estadoSunat: solicitud.estadoSunat || "",
    condicionSunat: solicitud.condicionSunat || "",

    archivosPdf,

    archivo: solicitud.archivoNombre || archivosPdf[0]?.archivoNombre || "Sin archivo",
    archivoNombre: solicitud.archivoNombre || archivosPdf[0]?.archivoNombre || "Sin archivo",
    archivoUrl: solicitud.archivoUrl || archivosPdf[0]?.archivoUrl || "",

    metodoPago: solicitud.metodoPago || "",
    estadoPago: solicitud.estadoPago || "Pendiente de validacion",
    pago: solicitud.estadoPago || "Pendiente de validacion",
    comprobantePago: solicitud.comprobantePago || "",
    montoPagado: solicitud.montoPagado || 0,

    estado: solicitud.estado || "En revision",

    fechaVisitaInspector: solicitud.fechaVisitaInspector || "",
    programadoPor: solicitud.programadoPor || "",
    nombreProgramador: solicitud.nombreProgramador || "",

    inspeccion: solicitud.inspeccion || "Sin inspeccion",
    resultadoInspeccion: solicitud.resultadoInspeccion || "",

    observacion: solicitud.observacion || "",
    observacionInspector: solicitud.observacionInspector || "",
    recomendacionInspector: solicitud.recomendacionInspector || "",
    evidenciasInspector: solicitud.evidenciasInspector || [],
    fechaInspeccion: solicitud.fechaInspeccion || "",

    cantidadReobservaciones: solicitud.cantidadReobservaciones || 0,
    historialReobservaciones: solicitud.historialReobservaciones || [],

    decisionFuncionario: solicitud.decisionFuncionario || "",
    observacionFuncionario: solicitud.observacionFuncionario || "",
    fechaDecisionFuncionario: solicitud.fechaDecisionFuncionario || "",

    numeroLicencia: solicitud.numeroLicencia || "",
    fechaAprobacion: solicitud.fechaAprobacion || "",
    fechaExpiracionLicencia: solicitud.fechaExpiracionLicencia || "",
    fechaVencimiento: solicitud.fechaVencimiento || "",
    licenciaVigente: solicitud.licenciaVigente || false,
    licenciaRenovada: solicitud.licenciaRenovada || false,
    fechaRenovacion: solicitud.fechaRenovacion || "",
    resultadoFinal: solicitud.resultadoFinal || "",

    licenciaAnterior: solicitud.licenciaAnterior || "",
    qrVerificacion: solicitud.qrVerificacion || "",

    pagoId: solicitud.pagoId || "",
    pagoEstadoDetalle: solicitud.pagoEstadoDetalle || "",

    notificaciones: solicitud.notificaciones || [],
  };

  await setDoc(doc(db, COLLECTION_NAME, id), nuevaSolicitud);

  return nuevaSolicitud;
};

export const obtenerSolicitudes = async () => {
  const q = query(collection(db, COLLECTION_NAME), orderBy("creadoEn", "desc"));
  const snapshot = await getDocs(q);

  return snapshot.docs.map((documento) => ({
    id: documento.id,
    ...documento.data(),
  }));
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