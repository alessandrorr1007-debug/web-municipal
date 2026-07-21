import axios from "axios";
import { authHeaders } from "../firebase";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

export const crearUsuarioInterno = async (datos) => {
  const response = await axios.post(`${API_URL}/api/admin/usuarios`, datos, { headers: await authHeaders() });
  return response.data;
};

export const obtenerUsuariosInternos = async () => {
  const response = await axios.get(`${API_URL}/api/admin/usuarios`, { headers: await authHeaders() });
  return response.data;
};

export const verificarEmailExistente = async (email) => {
  const response = await axios.get(`${API_URL}/api/admin/usuarios/verificar-email/${encodeURIComponent(email)}`, { headers: await authHeaders() });
  return response.data;
};

export const actualizarUsuario = async (uid, cambios) => {
  const response = await axios.put(`${API_URL}/api/admin/usuarios/${uid}`, cambios, { headers: await authHeaders() });
  return response.data;
};

export const cambiarEstadoUsuario = async (uid, estado, correo = "") => {
  const response = await axios.put(`${API_URL}/api/admin/usuarios/${uid}/estado`, { estado, correo }, { headers: await authHeaders() });
  return response.data;
};

export const eliminarUsuario = async (uid, correo = "") => {
  const url = correo ? `${API_URL}/api/admin/usuarios/${uid}?correo=${encodeURIComponent(correo)}` : `${API_URL}/api/admin/usuarios/${uid}`;
  const response = await axios.delete(url, { headers: await authHeaders() });
  return response.data;
};

export const solicitarResetPassword = async (uid) => {
  const response = await axios.post(`${API_URL}/api/admin/usuarios/${uid}/reset-password`, {}, { headers: await authHeaders() });
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
