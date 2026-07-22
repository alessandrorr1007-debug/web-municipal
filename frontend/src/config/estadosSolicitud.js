export const ESTADOS = {
  EN_PROCESO_REGISTRO: "EN_PROCESO_REGISTRO",
  PENDIENTE_PAGO: "PENDIENTE_PAGO",
  PAGO_CONFIRMADO: "PAGO_CONFIRMADO",
  INSPECCION_PROGRAMADA: "INSPECCION_PROGRAMADA",
  INSPECCION_OBSERVADA: "INSPECCION_OBSERVADA",
  INSPECCION_REPROGRAMADA: "INSPECCION_REPROGRAMADA",
  REVISION_FUNCIONARIO: "REVISION_FUNCIONARIO",
  APROBADO: "APROBADO",
  RECHAZADO: "RECHAZADO",
  VENCIDO: "VENCIDO",
};

export const ESTADO_LABELS = {
  EN_PROCESO_REGISTRO: "En proceso de registro",
  PENDIENTE_PAGO: "Pendiente de pago",
  PAGO_CONFIRMADO: "Pago confirmado",
  INSPECCION_PROGRAMADA: "Inspección programada",
  INSPECCION_OBSERVADA: "Inspección observada",
  INSPECCION_REPROGRAMADA: "Inspección reprogramada",
  REVISION_FUNCIONARIO: "En revisión del funcionario",
  APROBADO: "Licencia emitida",
  RECHAZADO: "Rechazado",
  VENCIDO: "Licencia vencida",
};

export const ESTADO_COLORES = {
  EN_PROCESO_REGISTRO: "#6b7280",
  PENDIENTE_PAGO: "#d97706",
  PAGO_CONFIRMADO: "#2563eb",
  INSPECCION_PROGRAMADA: "#7c3aed",
  INSPECCION_OBSERVADA: "#f59e0b",
  INSPECCION_REPROGRAMADA: "#ea580c",
  REVISION_FUNCIONARIO: "#0f766e",
  APROBADO: "#16a34a",
  RECHAZADO: "#dc2626",
  VENCIDO: "#9ca3af",
};

export const INSPECCION_ESTADOS = {
  PENDIENTE: "PENDIENTE",
  APROBADA: "APROBADA",
  OBSERVADA: "OBSERVADA",
  REOBSERVADA: "REOBSERVADA",
  RECHAZADA: "RECHAZADA",
  REPROGRAMADA: "REPROGRAMADA",
};

export const INSPECCION_LABELS = {
  PENDIENTE: "Pendiente",
  APROBADA: "Aprobada",
  OBSERVADA: "Observada",
  REOBSERVADA: "Reobservada",
  RECHAZADA: "Rechazada",
  REPROGRAMADA: "Reprogramada",
};

export const PAGO_ESTADOS = {
  PENDIENTE: "PENDIENTE",
  CONFIRMADO: "CONFIRMADO",
  RECHAZADO: "RECHAZADO",
};

export const LICENCIA_ESTADOS = {
  ACTIVA: "ACTIVA",
  VENCIDA: "VENCIDA",
  REVOCADA: "REVOCADA",
};

export const esEstadoCerrado = (estado) => {
  return [ESTADOS.APROBADO, ESTADOS.RECHAZADO, ESTADOS.VENCIDO].includes(estado);
};

export const esInspeccionRequerida = (estado) => {
  return [ESTADOS.INSPECCION_PROGRAMADA, ESTADOS.INSPECCION_OBSERVADA, ESTADOS.INSPECCION_REPROGRAMADA].includes(estado);
};

export const esPuedeProgramarInspeccion = (estado) => {
  return [ESTADOS.PAGO_CONFIRMADO].includes(estado);
};

export const esPuedeAprobar = (estado, recomendacionInspector) => {
  return estado === ESTADOS.REVISION_FUNCIONARIO && recomendacionInspector === "Aprobar";
};

export const mapLegacyEstado = (legacyEstado) => {
  const mapa = {
    "En proceso de registro": ESTADOS.EN_PROCESO_REGISTRO,
    "Pendiente de revisión": ESTADOS.EN_PROCESO_REGISTRO,
    "Pendiente de pago": ESTADOS.PENDIENTE_PAGO,
    "Pago pendiente": ESTADOS.PENDIENTE_PAGO,
    "Pagado": ESTADOS.PAGO_CONFIRMADO,
    "En revision": ESTADOS.PAGO_CONFIRMADO,
    "En revisión": ESTADOS.PAGO_CONFIRMADO,
    "Registrado": ESTADOS.PAGO_CONFIRMADO,
    "Inspección programada": ESTADOS.INSPECCION_PROGRAMADA,
    "Programada para inspeccion": ESTADOS.INSPECCION_PROGRAMADA,
    "Inspeccion programada": ESTADOS.INSPECCION_PROGRAMADA,
    "En inspeccion": ESTADOS.INSPECCION_PROGRAMADA,
    "Observado": ESTADOS.INSPECCION_OBSERVADA,
    "Observada": ESTADOS.INSPECCION_OBSERVADA,
    "Reprogramado": ESTADOS.INSPECCION_REPROGRAMADA,
    "Reprogramada": ESTADOS.INSPECCION_REPROGRAMADA,
    "Inspección realizada": ESTADOS.REVISION_FUNCIONARIO,
    "Resultado enviado al funcionario": ESTADOS.REVISION_FUNCIONARIO,
    "En revision (Inspección)": ESTADOS.REVISION_FUNCIONARIO,
    "En revisión (Inspección)": ESTADOS.REVISION_FUNCIONARIO,
    "Licencia emitida": ESTADOS.APROBADO,
    "Aprobado": ESTADOS.APROBADO,
    "Aprobada": ESTADOS.APROBADO,
    "Licencia aprobada": ESTADOS.APROBADO,
    "Rechazado": ESTADOS.RECHAZADO,
    "Rechazada": ESTADOS.RECHAZADO,
    "Licencia rechazada": ESTADOS.RECHAZADO,
    "Licencia vencida": ESTADOS.VENCIDO,
  };
  return mapa[legacyEstado] || legacyEstado;
};

export const DISTRITOS_TRUJILLO = [
  "Trujillo",
  "Alto Trujillo",
  "El Porvenir",
  "Florencia de Mora",
  "Huanchaco",
  "La Esperanza",
  "Laredo",
  "Moche",
  "Poroto",
  "Salaverry",
  "Simbal",
  "Víctor Larco Herrera",
];

export const normalizarDistrito = (txt) => {
  return String(txt || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^distrito\s+(de\s+)?/i, "")
    .trim();
};

export const coincideDistrito = (distritoSolicitud, distritoFiltro) => {
  if (!distritoFiltro || distritoFiltro === "todos") return true;
  const dSol = normalizarDistrito(distritoSolicitud || "Trujillo");
  const dFil = normalizarDistrito(distritoFiltro);

  if (dSol === dFil) return true;

  if (
    (dFil.includes("victor larco") && dSol.includes("victor larco")) ||
    (dFil.includes("florencia") && dSol.includes("florencia"))
  ) {
    return true;
  }

  return false;
};


