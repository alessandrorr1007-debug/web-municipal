const API_URL =
  import.meta.env.PROD ? "" : (import.meta.env.VITE_API_URL || "http://localhost:3000");


export const consultarDni = async (dni) => {
  if (!/^\d{8}$/.test(dni)) {
    throw new Error("El DNI debe tener exactamente 8 dígitos.");
  }

  const response = await fetch(`${API_URL}/api/consultar-dni/${dni}`);

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
