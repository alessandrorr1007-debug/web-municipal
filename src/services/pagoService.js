import { authHeaders } from "../firebase";

const API_URL = import.meta.env.VITE_API_URL || "";

const getErrorMessage = (error) => {
  if (typeof error === "string") return error;
  if (error?.response?.data) {
    const d = error.response.data;
    if (typeof d === "string") return d;
    return d.detalle || d.error || d.message || JSON.stringify(d);
  }
  if (error?.message) return error.message;
  return "Ocurrió un error inesperado";
};

const obtenerError = async (response) => {
  try {
    const data = await response.json();
    const raw = data.detalle || data.error || data.message || "Ocurrió un error en el pago";
    if (typeof raw === "object") return JSON.stringify(raw);
    return String(raw);
  } catch {
    return "Ocurrió un error en el pago";
  }
};

export const crearOrdenFlow = async ({ solicitudId, amount, email, buyerName, subject }) => {
  const headers = await authHeaders();
  const response = await fetch(`${API_URL}/api/pagos/flow/crear-orden`, {
    method: "POST",
    headers: {
      ...headers,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      commerceOrder: solicitudId,
      amount,
      email,
      buyerName,
      subject: subject || "Derecho de trámite - Licencia Municipal",
    }),
  });

  if (!response.ok) {
    throw new Error(await obtenerError(response));
  }

  return response.json();
};

export const verificarPagoFlow = async (token) => {
  const headers = await authHeaders();
  const response = await fetch(`${API_URL}/api/pagos/flow/status/${token}`, {
    headers,
  });

  if (!response.ok) {
    throw new Error(await obtenerError(response));
  }

  return response.json();
};

export const obtenerConfiguracionPago = async () => {
  try {
    const response = await fetch(`${API_URL}/api/config/payment-config`);
    if (!response.ok) return { demoEnabled: false };
    return response.json();
  } catch {
    return { demoEnabled: false };
  }
};
