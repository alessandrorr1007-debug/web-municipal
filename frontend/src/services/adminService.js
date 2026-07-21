import axios from "axios";
import { authHeaders } from "../firebase";

const getApiUrl = () => {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
  if (typeof window !== "undefined" && window.location.hostname !== "localhost") {
    return window.location.origin;
  }
  return "http://localhost:3000";
};

export const crearUsuarioInterno = async (datos) => {
  const baseUrl = getApiUrl();
  const response = await axios.post(`${baseUrl}/api/admin/usuarios`, datos, { headers: await authHeaders() });
  return response.data;
};

export const obtenerUsuariosInternos = async () => {
  const baseUrl = getApiUrl();
  const response = await axios.get(`${baseUrl}/api/admin/usuarios`, { headers: await authHeaders() });
  return response.data;
};

export const verificarEmailExistente = async (email) => {
  const baseUrl = getApiUrl();
  const response = await axios.get(`${baseUrl}/api/admin/usuarios/verificar-email/${encodeURIComponent(email)}`, { headers: await authHeaders() });
  return response.data;
};

export const actualizarUsuario = async (uid, cambios) => {
  const baseUrl = getApiUrl();
  const response = await axios.put(`${baseUrl}/api/admin/usuarios/${uid}`, cambios, { headers: await authHeaders() });
  return response.data;
};

export const cambiarEstadoUsuario = async (uid, estado, correo = "") => {
  const baseUrl = getApiUrl();
  const response = await axios.put(`${baseUrl}/api/admin/usuarios/${uid}/estado`, { estado, correo }, { headers: await authHeaders() });
  return response.data;
};

export const eliminarUsuario = async (uid, correo = "") => {
  const baseUrl = getApiUrl();
  const url = correo ? `${baseUrl}/api/admin/usuarios/${uid}?correo=${encodeURIComponent(correo)}` : `${baseUrl}/api/admin/usuarios/${uid}`;
  const response = await axios.delete(url, { headers: await authHeaders() });
  return response.data;
};

export const solicitarResetPassword = async (uid) => {
  const baseUrl = getApiUrl();
  const response = await axios.post(`${baseUrl}/api/admin/usuarios/${uid}/reset-password`, {}, { headers: await authHeaders() });
  return response.data;
};

export const ROL_ETIQUETAS = {
  cajero: "Cajero",
  inspector: "Inspector",
  administrador: "Administrador",
};

export const ROL_COLORES = {
  cajero: "#d97706",
  inspector: "#7c3aed",
  administrador: "#dc2626",
};
