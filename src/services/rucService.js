const API_URL = import.meta.env.VITE_API_URL || "";

export const consultarRuc = async (ruc) => {
  let response;
  try {
    response = await fetch(
      `${API_URL}/api/consultar-ruc/${ruc}`
    );
  } catch (netErr) {
    console.error("Error de red al consultar RUC:", netErr);
    throw new Error("No se pudo conectar con el servidor backend. Asegúrese de que el servidor backend esté ejecutándose (npm run start o node backend/server.js).");
  }

  const contentType = response.headers.get("content-type");
  if (!contentType || !contentType.includes("application/json")) {
    throw new Error(`El servidor no devolvió una respuesta JSON válida (código HTTP: ${response.status}).`);
  }

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Error consultando RUC");
  }

  return data;
};