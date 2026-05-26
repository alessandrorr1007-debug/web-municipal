const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:3000";

export const consultarRuc = async (ruc) => {
  const response = await fetch(
    `${API_URL}/api/ruc/${ruc}`
  );

  if (!response.ok) {
    throw new Error("Error consultando RUC");
  }

  return await response.json();
};