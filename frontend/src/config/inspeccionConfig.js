export const MAX_INSPECCIONES_POR_DIA = 4;

export const TIME_SLOTS = [
  { value: "08:00", label: "08:00 a. m.", rangoCompleto: "08:00 AM - 10:00 AM", horaInicio: 8, minInicio: 0 },
  { value: "10:00", label: "10:00 a. m.", rangoCompleto: "10:00 AM - 12:00 PM", horaInicio: 10, minInicio: 0 },
  { value: "14:00", label: "02:00 p. m.", rangoCompleto: "02:00 PM - 04:00 PM", horaInicio: 14, minInicio: 0 },
  { value: "16:00", label: "04:00 p. m.", rangoCompleto: "04:00 PM - 06:00 PM", horaInicio: 16, minInicio: 0 },
];

export const DIAS_LABORABLES = [1, 2, 3, 4, 5];

export const INSPECTORES_DEFAULT = [
  { uid: "INSP-001", nombre: "Inspector Carlos Ramírez", correo: "c.ramirez@munitrujillo.gob.pe", cargo: "Inspector Municipal de Defensa Civil" },
  { uid: "INSP-002", nombre: "Inspectora Ana López", correo: "a.lopez@munitrujillo.gob.pe", cargo: "Inspectora de Licencias y Seguridad Edil" },
  { uid: "INSP-003", nombre: "Inspector Luis Mendoza", correo: "l.mendoza@munitrujillo.gob.pe", cargo: "Inspector Técnico Edilicio" },
  { uid: "INSP-004", nombre: "Inspectora María Torres", correo: "m.torres@munitrujillo.gob.pe", cargo: "Inspectora de Gestión Ambiental" },
];

export const obtenerCapacidadColor = (count) => {
  if (count >= MAX_INSPECCIONES_POR_DIA) return "completo";
  if (count >= MAX_INSPECCIONES_POR_DIA - 1) return "casi-lleno";
  return "disponible";
};

export const esDiaHabil = (fecha) => {
  const dia = fecha.getDay();
  return DIAS_LABORABLES.includes(dia);
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
  const partes = String(fechaStr).split("/");
  if (partes.length === 3) {
    return new Date(Number(partes[2]), Number(partes[1]) - 1, Number(partes[0]));
  }
  return new Date(fechaStr);
};

export const normalizarFechaClave = (fechaInput) => {
  if (!fechaInput) return "";
  const str = String(fechaInput).trim();
  if (str.includes("-")) {
    const partes = str.split("-");
    if (partes.length === 3) {
      const y = partes[0].length === 4 ? partes[0] : partes[2];
      const m = (partes[0].length === 4 ? partes[1] : partes[1]).padStart(2, "0");
      const d = (partes[0].length === 4 ? partes[2] : partes[0]).padStart(2, "0");
      return `${d}/${m}/${y}`;
    }
  }
  if (str.includes("/")) {
    const partes = str.split("/");
    if (partes.length === 3) {
      const d = partes[0].padStart(2, "0");
      const m = partes[1].padStart(2, "0");
      const y = partes[2].length === 4 ? partes[2] : partes[2].padStart(4, "20");
      return `${d}/${m}/${y}`;
    }
  }
  return str;
};

export const normalizarSlotClave = (slotInput) => {
  if (!slotInput) return "";
  const s = String(slotInput).toLowerCase().trim();

  if (s.includes("08:00") || s.includes("8:00") || s.includes("08:00 a") || s.includes("8:00 a")) {
    return "08:00";
  }
  if (s.includes("10:00") || s.includes("10:00 a")) {
    return "10:00";
  }
  if (s.includes("14:00") || s.includes("02:00") || s.includes("2:00") || s.includes("02:00 p") || s.includes("2:00 p")) {
    return "14:00";
  }
  if (s.includes("16:00") || s.includes("04:00") || s.includes("4:00") || s.includes("04:00 p") || s.includes("4:00 p")) {
    return "16:00";
  }

  return s;
};

export const coincideInspectorClave = (solicitud, inspectorUidONombre) => {
  if (!solicitud || !inspectorUidONombre) return false;
  const target = String(inspectorUidONombre).toLowerCase().trim();
  if (!target) return false;

  const uid = String(solicitud.inspectorUid || solicitud.inspectorAsignadoUid || solicitud.uidInspector || "").toLowerCase().trim();
  const nombre = String(solicitud.inspectorNombre || solicitud.inspectorAsignado || solicitud.inspectorElegido || solicitud.inspector || "").toLowerCase().trim();

  if (uid && uid === target) return true;
  if (nombre && nombre === target) return true;
  if (uid && target.length >= 3 && (uid.includes(target) || target.includes(uid))) return true;
  if (nombre && target.length >= 3 && (nombre.includes(target) || target.includes(nombre))) return true;
  return false;
};

export const esSolicitudActivaEnAgenda = (solicitud) => {
  if (!solicitud) return false;
  const est = String(solicitud.estado || solicitud.estadoNormalizado || "").toLowerCase();
  if (est.includes("cancelad") || est.includes("anulad")) return false;
  return true;
};

export const esSlotOcupadoInspector = (solicitudes, inspectorUidONombre, fechaStr, slotValue, idExcluir = null) => {
  if (!solicitudes || !Array.isArray(solicitudes) || !inspectorUidONombre || !fechaStr || !slotValue) return false;

  const fTarget = normalizarFechaClave(fechaStr);
  const sTarget = normalizarSlotClave(slotValue);
  const idExcluirClean = idExcluir ? String(idExcluir).replace(/^EXP-/, "").trim() : null;

  return solicitudes.some((s) => {
    if (!s) return false;

    if (idExcluirClean) {
      const sIdClean = String(s.id || "").replace(/^EXP-/, "").trim();
      if (sIdClean === idExcluirClean) return false;
    }

    if (!esSolicitudActivaEnAgenda(s)) return false;

    if (!coincideInspectorClave(s, inspectorUidONombre)) return false;

    const fSol = normalizarFechaClave(s.fechaVisitaInspector || s.fechaVisita || s.fechaInspeccion || s.fechaInspeccionProgramada);
    if (fSol !== fTarget) return false;

    const sSol = normalizarSlotClave(s.slotInspeccion || s.horaVisitaInspector || s.horaVisitaLabel || s.horaVisita);
    if (sSol === sTarget) return true;

    return false;
  });
};

export const esSlotOcupadoParaInspector = esSlotOcupadoInspector;

export const obtenerConteoInspectorEnFecha = (solicitudes, inspectorUidONombre, fechaStr, idExcluir = null) => {
  if (!solicitudes || !Array.isArray(solicitudes) || !inspectorUidONombre || !fechaStr) return 0;

  const fTarget = normalizarFechaClave(fechaStr);
  const idExcluirClean = idExcluir ? String(idExcluir).replace(/^EXP-/, "").trim() : null;

  return solicitudes.filter((s) => {
    if (!s) return false;

    if (idExcluirClean) {
      const sIdClean = String(s.id || "").replace(/^EXP-/, "").trim();
      if (sIdClean === idExcluirClean) return false;
    }

    if (!esSolicitudActivaEnAgenda(s)) return false;
    if (!coincideInspectorClave(s, inspectorUidONombre)) return false;

    const fSol = normalizarFechaClave(s.fechaVisitaInspector || s.fechaVisita || s.fechaInspeccion || s.fechaInspeccionProgramada);
    return fSol === fTarget;
  }).length;
};

export const obtenerPrimerSlotLibreParaInspector = (solicitudes, inspectorUidONombre, fechaStr, idExcluir = null) => {
  if (!solicitudes || !inspectorUidONombre || !fechaStr) return null;

  const ORDEN_SLOTS = ["08:00", "10:00", "14:00", "16:00"];

  for (const slotVal of ORDEN_SLOTS) {
    const ocupado = esSlotOcupadoInspector(solicitudes, inspectorUidONombre, fechaStr, slotVal, idExcluir);
    if (!ocupado) {
      const slotObj = TIME_SLOTS.find((s) => s.value === slotVal);
      return {
        value: slotVal,
        label: slotObj ? slotObj.label : `${slotVal} a. m.`,
        rangoCompleto: slotObj ? slotObj.rangoCompleto : slotVal,
      };
    }
  }

  return null;
};

export const esHorarioPasado = (fechaStr, slotValue) => {
  const hoy = new Date();
  const hoyStr = formatearFechaLocal(hoy);

  if (normalizarFechaClave(fechaStr) !== hoyStr) {
    const fechaObj = parsearFechaLocal(fechaStr);
    hoy.setHours(0, 0, 0, 0);
    fechaObj.setHours(0, 0, 0, 0);
    return fechaObj < hoy;
  }

  const slot = TIME_SLOTS.find((s) => s.value === normalizarSlotClave(slotValue));
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

export const calcularFechaReinspeccionDisponible = (solicitudes, fechaBaseStr, inspectorTarget, idExcluir = null) => {
  let base = parsearFechaLocal(fechaBaseStr);
  base.setDate(base.getDate() + 30);

  while (!esDiaHabil(base)) {
    base.setDate(base.getDate() + 1);
  }

  const maxBusqueda = 60;
  let intentos = 0;

  while (intentos < maxBusqueda) {
    const fechaStr = formatearFechaLocal(base);
    const conteo = obtenerConteoInspectorEnFecha(solicitudes, inspectorTarget, fechaStr, idExcluir);

    if (conteo < MAX_INSPECCIONES_POR_DIA) {
      return fechaStr;
    }

    base.setDate(base.getDate() + 1);
    while (!esDiaHabil(base)) {
      base.setDate(base.getDate() + 1);
    }
    intentos++;
  }

  return formatearFechaLocal(base);
};

export const HORA_INICIO = "08:00";
export const HORA_FIN = "18:00";

export const MENSAJE_FECHA_INSPECCION = "Las inspecciones deben programarse con al menos un día de anticipación. Seleccione una fecha a partir de mañana.";

export const esFechaValidaParaInspeccion = (fechaStr) => {
  if (!fechaStr) return false;
  let fechaObj;
  const str = String(fechaStr).trim();
  if (str.includes("-")) {
    const [y, m, d] = str.split("-").map(Number);
    fechaObj = new Date(y, m - 1, d);
  } else if (str.includes("/")) {
    const [d, m, y] = str.split("/").map(Number);
    fechaObj = new Date(y, m - 1, d);
  } else {
    fechaObj = new Date(str);
  }
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  fechaObj.setHours(0, 0, 0, 0);
  return fechaObj > hoy;
};

export const obtenerFechaMinimaInspeccion = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d;
};

export const formatearFechaYYYYMMDD = (d) => {
  const dia = String(d.getDate()).padStart(2, "0");
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const anio = d.getFullYear();
  return `${anio}-${mes}-${dia}`;
};

export const buscarSiguienteDisponibilidad = (solicitudesActuales, inspectorDeseado = null, fechaDeseadaStr = null, idExcluir = null) => {
  const hoy = new Date();
  const maxDiasHorizonte = 30;
  const listaSolicitudes = Array.isArray(solicitudesActuales) ? solicitudesActuales : [];
  const inspectores = inspectorDeseado ? [inspectorDeseado] : INSPECTORES_DEFAULT;

  for (let offset = 1; offset <= maxDiasHorizonte; offset++) {
    const fechaEvaluada = new Date(hoy);
    fechaEvaluada.setDate(hoy.getDate() + offset);

    if (!esDiaHabil(fechaEvaluada)) continue;

    const fechaStrDDMMYYYY = formatearFechaLocal(fechaEvaluada);
    if (fechaDeseadaStr && normalizarFechaClave(fechaDeseadaStr) !== fechaStrDDMMYYYY) {
      continue;
    }

    for (const inspector of inspectores) {
      const inspTarget = inspector.uid || inspector.id || inspector.nombre;
      const slotLibre = obtenerPrimerSlotLibreParaInspector(listaSolicitudes, inspTarget, fechaStrDDMMYYYY, idExcluir);

      if (slotLibre) {
        return {
          exito: true,
          fechaInspeccion: fechaStrDDMMYYYY,
          slotInspeccion: slotLibre.value,
          horaLabel: slotLibre.label,
          rangoCompleto: slotLibre.rangoCompleto,
          inspector,
        };
      }
    }
  }

  return { exito: false };
};
