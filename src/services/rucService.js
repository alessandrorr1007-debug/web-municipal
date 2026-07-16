const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:3000";

export const consultarRuc = async (ruc) => {
  const response = await fetch(
    `${API_URL}/api/consultar-ruc/${ruc}`
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Error consultando RUC");
  }

  return data;
};