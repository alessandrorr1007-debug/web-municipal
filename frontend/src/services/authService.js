import { auth, db, authHeaders } from "../firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  fetchSignInMethodsForEmail,
  updateEmail,
  EmailAuthProvider,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
} from "firebase/auth";

import {
  doc, setDoc, getDoc, query, collection, where, getDocs,
  addDoc, deleteDoc, updateDoc, Timestamp,
} from "firebase/firestore";

const API_URL = import.meta.env.VITE_API_URL || "";

export const registrarUsuario = async (datos) => {
  const nameRegex = /^[A-Za-zÁÉÍÓÚáéíóúÑñÜü\s'-]+$/;
  const nombreAValidar = datos.nombre_completo || datos.nombre || "";
  if (nombreAValidar && !nameRegex.test(nombreAValidar)) {
    throw new Error("Los nombres y apellidos solo pueden contener letras.");
  }
  if (datos.nombres && !nameRegex.test(datos.nombres)) {
    throw new Error("Los nombres y apellidos solo pueden contener letras.");
  }
  if (datos.apellido_paterno && !nameRegex.test(datos.apellido_paterno)) {
    throw new Error("Los nombres y apellidos solo pueden contener letras.");
  }
  if (datos.apellido_materno && !nameRegex.test(datos.apellido_materno)) {
    throw new Error("Los nombres y apellidos solo pueden contener letras.");
  }

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
    recibir_correos: true,
    activo: true,
  };

  await setDoc(doc(db, "usuarios", usuario.uid), nuevoUsuario);

  return nuevoUsuario;
};

export const obtenerDocUsuarioFirestore = async (uid, correo) => {
  const correoNorm = (correo || "").toLowerCase().trim();
  let userDoc = null;
  let docId = null;

  if (uid) {
    try {
      const snap = await getDoc(doc(db, "usuarios", uid));
      if (snap.exists()) {
        userDoc = snap.data();
        docId = snap.id;
      }
    } catch (e) {}
  }
  if (!userDoc && correoNorm) {
    try {
      const q = query(collection(db, "usuarios"), where("correo", "==", correoNorm));
      const snapQ = await getDocs(q);
      if (!snapQ.empty) {
        userDoc = snapQ.docs[0].data();
        docId = snapQ.docs[0].id;
      }
    } catch (e) {}
  }

  return { userDoc, docId };
};

export const registrarNuevaSesionId = async (uid, docId) => {
  const nuevaSesionId = Date.now().toString() + "_" + Math.random().toString(36).substring(2, 9);
  localStorage.setItem("web_municipal_sesion_id", nuevaSesionId);

  const targetId = docId || uid;
  if (targetId) {
    try {
      await setDoc(doc(db, "usuarios", targetId), {
        sesionId: nuevaSesionId,
        ultimoIngreso: serverTimestamp(),
      }, { merge: true });
    } catch (e) {
      console.warn("[AUTH] Error registrando sesionId en Firestore:", e.message);
    }
  }
  return nuevaSesionId;
};

export const iniciarSesion = async (correo, password) => {
  const correoNorm = (correo || "").toLowerCase().trim();

  const { userDoc, docId } = await obtenerDocUsuarioFirestore(null, correoNorm);

  if (!userDoc) {
    try { await signOut(auth); } catch (e) {}
    const errNotF = new Error("No encontramos una cuenta registrada con ese correo electrónico.");
    errNotF.code = "auth/user-not-found";
    throw errNotF;
  }

  if (userDoc.estado === "inactivo" || userDoc.estado === "desactivado" || userDoc.activo === false) {
    try { await signOut(auth); } catch (e) {}
    throw new Error("⚠️ Esta cuenta está inhabilitada. Contacte al administrador del sistema.");
  }

  try {
    const credenciales = await signInWithEmailAndPassword(auth, correoNorm, password);
    const usuario = credenciales.user;

    const rolesValidos = ["negocio", "cajero", "funcionario", "inspector", "administrador"];
    const rolFinal = userDoc.rol && rolesValidos.includes(userDoc.rol) ? userDoc.rol : "cajero";

    const sesionId = await registrarNuevaSesionId(usuario.uid, docId || usuario.uid);

    return {
      uid: usuario.uid,
      correo: usuario.email,
      nombre: userDoc.nombre || userDoc.nombre_completo || "Usuario",
      rol: rolFinal,
      telefono: userDoc.telefono || "",
      dni: userDoc.dni || "",
      activo: true,
      estado: "activo",
      sesionId,
    };
  } catch (authError) {
    if (authError.message && (authError.message.includes("inhabilitada") || authError.message.includes("registrada"))) {
      throw authError;
    }

    if (userDoc.password && userDoc.password === password) {
      const rolesValidos = ["negocio", "cajero", "funcionario", "inspector", "administrador"];
      const rolFinal = userDoc.rol && rolesValidos.includes(userDoc.rol) ? userDoc.rol : "cajero";
      const targetUid = userDoc.uid || docId || `USR-${Date.now()}`;
      const sesionId = await registrarNuevaSesionId(targetUid, docId || targetUid);

      return {
        uid: targetUid,
        correo: correoNorm,
        nombre: userDoc.nombre || userDoc.nombre_completo || "Usuario",
        rol: rolFinal,
        telefono: userDoc.telefono || "",
        dni: userDoc.dni || "",
        activo: true,
        estado: "activo",
        sesionId,
      };
    }

    throw authError;
  }
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

export const guardarCodigoVerificacion = async (correo, nombre = "Usuario") => {
  const nameRegex = /^[A-Za-zÁÉÍÓÚáéíóúÑñÜü\s'-]+$/;
  if (nombre !== "Usuario" && !nameRegex.test(nombre)) {
    throw new Error("Los nombres y apellidos solo pueden contener letras.");
  }

  const qUser = query(collection(db, "usuarios"), where("correo", "==", correo));
  const snapUser = await getDocs(qUser);
  if (!snapUser.empty) {
    throw new Error("Este correo electrónico ya está registrado.");
  }

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

  const url = `${API_URL}/api/enviar-codigo`;
  console.log("[DEBUG] Llamando a:", url);

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ correo, codigo, nombre }),
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
  try {
    await sendPasswordResetEmail(auth, correo);
  } catch (err) {
    const code = err?.code || "";
    if (code === "auth/user-not-found") {
      throw new Error("Si el correo está registrado, recibirás un enlace de recuperación.");
    }
    if (code === "auth/too-many-requests") {
      throw new Error("Demasiados intentos. Espera unos minutos y vuelve a intentar.");
    }
    if (code === "auth/invalid-email") {
      throw new Error("El correo electrónico no es válido.");
    }
    throw new Error("No se pudo enviar el enlace de recuperación. Intenta de nuevo.");
  }
};

export const actualizarPreferenciasNotificaciones = async (uid, recibir_correos) => {
  const ref = doc(db, "usuarios", uid);
  await updateDoc(ref, {
    recibir_correos,
  });
};

export const enviarOtpCorreoActual = async (correoActual) => {
  const url = `${API_URL}/api/email-change/enviar-codigo-actual`;
  const headers = await authHeaders();
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ correoActual }),
  });

  const contentType = response.headers.get("content-type");
  if (!contentType || !contentType.includes("application/json")) {
    throw new Error(`El servidor no devolvió una respuesta JSON válida (código HTTP: ${response.status}).`);
  }

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "No se pudo enviar el código al correo actual.");
  }
  return data;
};

export const verificarOtpCorreoActual = async (correoActual, codigo) => {
  const url = `${API_URL}/api/email-change/verificar-codigo-actual`;
  const headers = await authHeaders();
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ correoActual, codigo }),
  });

  const contentType = response.headers.get("content-type");
  if (!contentType || !contentType.includes("application/json")) {
    throw new Error(`El servidor no devolvió una respuesta JSON válida (código HTTP: ${response.status}).`);
  }

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Código incorrecto.");
  }
  return data;
};

export const enviarOtpCorreoNuevo = async (correoActual, correoNuevo) => {
  const qUser = query(collection(db, "usuarios"), where("correo", "==", correoNuevo));
  const snapUser = await getDocs(qUser);
  if (!snapUser.empty) {
    throw new Error("No es posible utilizar este correo porque ya pertenece a otra cuenta.");
  }

  const url = `${API_URL}/api/email-change/enviar-codigo-nuevo`;
  const headers = await authHeaders();
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ correoActual, correoNuevo }),
  });

  const contentType = response.headers.get("content-type");
  if (!contentType || !contentType.includes("application/json")) {
    throw new Error(`El servidor no devolvió una respuesta JSON válida (código HTTP: ${response.status}).`);
  }

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "No se pudo enviar el código al nuevo correo.");
  }
  return data;
};

export const verificarOtpCorreoNuevo = async (correoActual, correoNuevo, codigo) => {
  const url = `${API_URL}/api/email-change/verificar-codigo-nuevo`;
  const headers = await authHeaders();
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ correoActual, correoNuevo, codigo }),
  });

  const contentType = response.headers.get("content-type");
  if (!contentType || !contentType.includes("application/json")) {
    throw new Error(`El servidor no devolvió una respuesta JSON válida (código HTTP: ${response.status}).`);
  }

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Código incorrecto.");
  }
  return data;
};

export const actualizarCorreoDeUsuario = async (uid, correoNuevo, contrasenaActual) => {
  const user = auth.currentUser;
  if (!user) throw new Error("No hay un usuario autenticado.");

  if (!contrasenaActual) {
    throw new Error("Debes ingresar tu contraseña actual para cambiar el correo.");
  }

  const userRef = doc(db, "usuarios", uid);
  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) {
    throw new Error("No se encontró el documento de usuario en la base de datos.");
  }
  const data = userSnap.data();

  const credential = EmailAuthProvider.credential(user.email, contrasenaActual);
  await reauthenticateWithCredential(user, credential);

  await updateEmail(user, correoNuevo);
  await updateDoc(userRef, {
    correo: correoNuevo
  });

  return { ...data, correo: correoNuevo };
};

export const restablecerContrasenaPorEmail = async (correo) => {
  await sendPasswordResetEmail(auth, correo);
};
