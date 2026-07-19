import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  query,
  orderBy,
} from "firebase/firestore";
import { db } from "../firebase";

const COLLECTION = "usuarios";

export const crearUsuarioInterno = async (datos) => {
  const id = datos.uid || doc(collection(db, COLLECTION)).id;

  const usuario = {
    uid: id,
    nombre: datos.nombre || "",
    correo: datos.correo || "",
    dni: datos.dni || "",
    telefono: datos.telefono || "",
    cargo: datos.cargo || "",
    rol: datos.rol || "",
    estado: datos.estado || "activo",
    activo: datos.activo !== false,
    permisos: datos.permisos || [],
    creadoEn: serverTimestamp(),
    actualizadoEn: serverTimestamp(),
    creadoPor: datos.creadoPor || "",
  };

  await setDoc(doc(db, COLLECTION, id), usuario);
  return usuario;
};

export const obtenerUsuariosInternos = async () => {
  const q = query(collection(db, COLLECTION), orderBy("creadoEn", "desc"));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
};

export const actualizarUsuario = async (id, cambios) => {
  const ref = doc(db, COLLECTION, id);
  await updateDoc(ref, { ...cambios, actualizadoEn: serverTimestamp() });
  return true;
};

export const eliminarUsuario = async (id) => {
  const ref = doc(db, COLLECTION, id);
  await updateDoc(ref, { activo: false, estado: "desactivado", actualizadoEn: serverTimestamp() });
  return true;
};

export const PERMISOS_POR_ROL = {
  cajero: [
    "registrar_solicitudes_presenciales",
    "registrar_pagos",
    "consultar_negocios",
  ],
  funcionario: [
    "revisar_solicitudes",
    "validar_documentos",
    "aprobar_observar_tramites",
    "programar_inspecciones",
  ],
  inspector: [
    "ver_inspecciones_diarias",
    "registrar_resultados_inspeccion",
  ],
  administrador: [
    "gestionar_usuarios",
    "gestionar_roles",
    "ver_auditoria",
    "configurar_sistema",
    "ver_estadisticas",
    "gestionar_solicitudes",
  ],
};

export const ROL_ETIQUETAS = {
  cajero: "Cajero",
  funcionario: "Funcionario",
  inspector: "Inspector",
  administrador: "Administrador",
  negocio: "Negocio",
};

export const ROL_COLORES = {
  cajero: "#d97706",
  funcionario: "#0f766e",
  inspector: "#7c3aed",
  administrador: "#dc2626",
  negocio: "#2563eb",
};
