const API_URL =
  import.meta.env.PROD ? "" : (import.meta.env.VITE_API_URL || "http://localhost:3000");

export const calcularDigitoVerificador = (dni) => {
  if (!/^\d{8}$/.test(dni)) return -1;
  const pesos = [2, 1, 2, 1, 2, 1, 2, 1];
  let suma = 0;
  for (let i = 0; i < 8; i++) {
    let producto = parseInt(dni[i]) * pesos[i];
    if (producto >= 10) producto -= 9;
    suma += producto;
  }
  return (10 - (suma % 10)) % 10;
};

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
    dni: data.data.dni,
    nombres: data.data.nombres,
    apellido_paterno: data.data.apellido_paterno,
    apellido_materno: data.data.apellido_materno,
    digito_verificador_api: data.digito_verificador,
    nombre_completo: `${data.data.apellido_paterno} ${data.data.apellido_materno}, ${data.data.nombres}`,
  };
};
