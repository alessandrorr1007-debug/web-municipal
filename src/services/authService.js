import { auth, db } from "../firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
} from "firebase/auth";

import { doc, setDoc, getDoc } from "firebase/firestore";

export const registrarUsuario = async (datos) => {
  const credenciales = await createUserWithEmailAndPassword(
    auth,
    datos.correo,
    datos.password
  );

  const usuario = credenciales.user;

  const nuevoUsuario = {
    uid: usuario.uid,
    nombre: datos.nombre || "",
    correo: usuario.email,
    rol: datos.rol || "negocio",
    dni: datos.dni || "",
    telefono: datos.telefono || "",
    ruc: datos.ruc || "",
    razonSocial: datos.razonSocial || "",
    nombreComercial: datos.nombreComercial || "",
    direccion: datos.direccion || "",
    tipoNegocio: datos.tipoNegocio || "",
    categoria: datos.categoria || "",
  };

  await setDoc(doc(db, "usuarios", usuario.uid), nuevoUsuario);

  return nuevoUsuario;
};

export const iniciarSesion = async (correo, password) => {
  const credenciales = await signInWithEmailAndPassword(auth, correo, password);

  const usuario = credenciales.user;

  const usuarioRef = doc(db, "usuarios", usuario.uid);
  const usuarioSnap = await getDoc(usuarioRef);

  if (!usuarioSnap.exists()) {
    throw new Error("No existe informacion del usuario en Firestore");
  }

  const data = usuarioSnap.data();

  return {
    uid: usuario.uid,
    correo: usuario.email,
    nombre: data.nombre || "",
    rol: data.rol || "",
    dni: data.dni || "",
    telefono: data.telefono || "",
    ruc: data.ruc || "",
    razonSocial: data.razonSocial || "",
    nombreComercial: data.nombreComercial || "",
    direccion: data.direccion || "",
    tipoNegocio: data.tipoNegocio || "",
    categoria: data.categoria || "",
  };
};

export const cerrarSesion = async () => {
  await signOut(auth);
};

export const enviarRecuperacion = async (correo) => {
  await sendPasswordResetEmail(auth, correo);
};
