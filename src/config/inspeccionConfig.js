export const MAX_INSPECCIONES_POR_DIA = 5;

export const TIME_SLOTS = [
  { value: "08:00", label: "08:00 AM - 10:00 AM", horaInicio: 8, minInicio: 0 },
  { value: "10:00", label: "10:00 AM - 12:00 PM", horaInicio: 10, minInicio: 0 },
  { value: "12:00", label: "12:00 PM - 02:00 PM", horaInicio: 12, minInicio: 0 },
  { value: "14:00", label: "02:00 PM - 04:00 PM", horaInicio: 14, minInicio: 0 },
  { value: "16:00", label: "04:00 PM - 06:00 PM", horaInicio: 16, minInicio: 0 },
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

export const parsearFechaLocal = (fechaStr) => {
  if (!fechaStr) return new Date();
  const partes = fechaStr.split("/");
  if (partes.length === 3) {
    return new Date(Number(partes[2]), Number(partes[1]) - 1, Number(partes[0]));
  }
  return new Date(fechaStr);
};

export const esHorarioPasado = (fechaStr, slotValue) => {
  const hoy = new Date();
  const hoyStr = formatearFechaLocal(hoy);

  if (fechaStr !== hoyStr) {
    const fechaObj = parsearFechaLocal(fechaStr);
    hoy.setHours(0, 0, 0, 0);
    fechaObj.setHours(0, 0, 0, 0);
    return fechaObj < hoy;
  }

  const slot = TIME_SLOTS.find((s) => s.value === slotValue);
  if (!slot) return false;

  const horaActual = hoy.getHours();
  const minActual = hoy.getMinutes();

  if (horaActual > slot.horaInicio) return true;
  if (horaActual === slot.horaInicio && minActual >= slot.minInicio) return true;
  return false;
};

export const calcularFecha30DiasMas = (fechaBaseStr) => {
  const base = parsearFechaLocal(fechaBaseStr);
  base.setDate(base.getDate() + 30);
  while (!esDiaHabil(base)) {
    base.setDate(base.getDate() + 1);
  }
  return formatearFechaLocal(base);
};

export const HORA_INICIO = "08:00";
export const HORA_FIN = "18:00";
