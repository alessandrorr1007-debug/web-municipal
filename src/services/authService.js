import { auth, db } from "../firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  fetchSignInMethodsForEmail,
} from "firebase/auth";

import {
  doc, setDoc, getDoc, query, collection, where, getDocs,
  addDoc, deleteDoc, updateDoc, Timestamp,
} from "firebase/firestore";

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
    telefono: datos.telefono || "",
    dni: datos.dni || "",
    digito_verificador: datos.digito_verificador || "",
    nombres: datos.nombres || "",
    apellido_paterno: datos.apellido_paterno || "",
    apellido_materno: datos.apellido_materno || "",
    nombre_completo: datos.nombre_completo || datos.nombre || "",
    contraseña: datos.password || "",
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
    throw new Error("No existe información del usuario en Firestore");
  }

  const data = usuarioSnap.data();

  return {
    uid: usuario.uid,
    correo: usuario.email,
    nombre: data.nombre || "",
    rol: data.rol || "",
    telefono: data.telefono || "",
    dni: data.dni || "",
    digito_verificador: data.digito_verificador || "",
    nombres: data.nombres || "",
    apellido_paterno: data.apellido_paterno || "",
    apellido_materno: data.apellido_materno || "",
    nombre_completo: data.nombre_completo || data.nombre || "",
  };
};

export const cerrarSesion = async () => {
  await signOut(auth);
};

export const verificarCorreoExistente = async (correo) => {
  try {
    const methods = await fetchSignInMethodsForEmail(auth, correo);
    return methods.length > 0;
  } catch {
    return false;
  }
};

export const guardarCodigoVerificacion = async (correo) => {
  const codigo = Math.floor(100000 + Math.random() * 900000).toString();

  console.log("[DEBUG] Generado código:", codigo, "para:", correo);

  const q = query(collection(db, "codigos_verificacion"), where("correo", "==", correo));
  const snapshot = await getDocs(q);
  for (const d of snapshot.docs) {
    await deleteDoc(doc(db, "codigos_verificacion", d.id));
  }

  await addDoc(collection(db, "codigos_verificacion"), {
    correo,
    codigo,
    expiracion: Timestamp.fromDate(new Date(Date.now() + 5 * 60 * 1000)),
    usado: false,
  });

  console.log("[DEBUG] Código guardado en Firestore");

  const apiUrl = import.meta.env.PROD ? "" : (import.meta.env.VITE_API_URL || "http://localhost:3000");
  const url = `${apiUrl}/api/enviar-codigo`;
  console.log("[DEBUG] Llamando a:", url);

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ correo, codigo }),
  });

  console.log("[DEBUG] Status HTTP:", response.status);
  const texto = await response.text();
  console.log("[DEBUG] Respuesta body:", texto);

  if (!response.ok) {
    console.error("[DEBUG] Error del backend:", texto);
    throw new Error(`Error ${response.status}: ${texto}`);
  }

  return codigo;
};

export const verificarCodigoVerificacion = async (correo, codigoIngresado) => {
  const q = query(
    collection(db, "codigos_verificacion"),
    where("correo", "==", correo),
    where("codigo", "==", codigoIngresado),
    where("usado", "==", false)
  );
  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    return { valido: false, mensaje: "Código incorrecto. Intenta de nuevo." };
  }

  const codigoDoc = snapshot.docs[0];
  const data = codigoDoc.data();

  if (data.expiracion.toDate() < new Date()) {
    return { valido: false, mensaje: "El código ha expirado. Solicita uno nuevo." };
  }

  await updateDoc(doc(db, "codigos_verificacion", codigoDoc.id), { usado: true });

  return { valido: true };
};

export const enviarRecuperacion = async (correo) => {
  const codigo = Math.floor(100000 + Math.random() * 900000).toString();

  console.log("[DEBUG] Recuperación - Código generado:", codigo, "para:", correo);

  const q = query(collection(db, "codigos_verificacion"), where("correo", "==", correo));
  const snapshot = await getDocs(q);
  for (const d of snapshot.docs) {
    await deleteDoc(doc(db, "codigos_verificacion", d.id));
  }

  await addDoc(collection(db, "codigos_verificacion"), {
    correo,
    codigo,
    expiracion: Timestamp.fromDate(new Date(Date.now() + 5 * 60 * 1000)),
    usado: false,
  });

  console.log("[DEBUG] Código de recuperación guardado en Firestore");

  const apiUrl = import.meta.env.PROD ? "" : (import.meta.env.VITE_API_URL || "http://localhost:3000");
  const url = `${apiUrl}/api/enviar-recuperacion`;
  console.log("[DEBUG] Llamando a:", url);

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ correo, codigo }),
  });

  console.log("[DEBUG] Status HTTP:", response.status);
  const texto = await response.text();
  console.log("[DEBUG] Respuesta:", texto);

  if (!response.ok) {
    throw new Error(`Error ${response.status}: ${texto}`);
  }

  return codigo;
};
