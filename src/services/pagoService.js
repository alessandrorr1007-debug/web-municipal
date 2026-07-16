const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

const obtenerError = async (response) => {
  try {
    const data = await response.json();
    return data.detalle || data.error || "Ocurrió un error en el pago";
  } catch {
    return "Ocurrió un error en el pago";
  }
};

export const crearPreferenciaPago = async ({ ruc, razonSocial }) => {
  const response = await fetch(`${API_URL}/api/pagos/crear-preferencia`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ruc,
      razonSocial,
    }),
  });

  if (!response.ok) {
    throw new Error(await obtenerError(response));
  }

  return response.json();
};


export const verificarPago = async (paymentId) => {
  const response = await fetch(`${API_URL}/api/pagos/verificar/${paymentId}`);

  if (!response.ok) {
    throw new Error(await obtenerError(response));
  }

  return response.json();
};