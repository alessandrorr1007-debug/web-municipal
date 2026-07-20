const API_URL = import.meta.env.VITE_API_URL || "";

export const consultarDni = async (dni) => {
  if (!/^\d{8}$/.test(dni)) {
    throw new Error("El DNI debe tener exactamente 8 dígitos.");
  }

  const response = await fetch(`${API_URL}/api/consultar-dni/${dni}`);

  const contentType = response.headers.get("content-type");
  if (!contentType || !contentType.includes("application/json")) {
    throw new Error(`El servidor no devolvió una respuesta JSON válida (código HTTP: ${response.status}).`);
  }

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Error consultando el DNI.");
  }

  return {
    dni: data.dni,
    nombre_completo: data.nombreCompleto,
    nombres: data.nombres,
    apellido_paterno: data.apellidoPaterno,
    apellido_materno: data.apellidoMaterno,
  };
};
