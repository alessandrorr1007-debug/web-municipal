export const MAX_INSPECCIONES_POR_DIA = 5;

export const TIME_SLOTS = [
  { value: "08:30", label: "08:30 AM - 09:45 AM" },
  { value: "10:15", label: "10:15 AM - 11:30 AM" },
  { value: "12:00", label: "12:00 PM - 01:15 PM" },
  { value: "14:30", label: "02:30 PM - 03:45 PM" },
  { value: "16:15", label: "04:15 PM - 05:30 PM" },
];

export const DIAS_LABORABLES = [1, 2, 3, 4, 5];

export const obtenerCapacidadColor = (count) => {
  if (count >= MAX_INSPECCIONES_POR_DIA) return "completo";
  if (count >= MAX_INSPECCIONES_POR_DIA - 1) return "casi-lleno";
  return "disponible";
};

export const esDiaHabil = (fecha) => {
  const dia = fecha.getDay();
  return DIAS_LABORABLES.includes(dia);
};

export const formatearFechaParaQuery = (fecha) => {
  const d = new Date(fecha);
  const dia = String(d.getDate()).padStart(2, "0");
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const anio = d.getFullYear();
  return `${dia}/${mes}/${anio}`;
};

export const formatearFechaLocal = (fecha) => {
  const d = new Date(fecha);
  const dia = String(d.getDate()).padStart(2, "0");
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const anio = d.getFullYear();
  return `${dia}/${mes}/${anio}`;
};

export const obtenerSiguienteDiaHabil = (fecha) => {
  const resultado = new Date(fecha);
  resultado.setDate(resultado.getDate() + 1);
  while (!esDiaHabil(resultado)) {
    resultado.setDate(resultado.getDate() + 1);
  }
  return resultado;
};

export const HORA_INICIO = "08:30";
export const HORA_FIN = "17:30";
