export const MAX_INSPECCIONES_POR_DIA = 4;

export const TIME_SLOTS = [
  { value: "08:00", label: "08:00 AM - 10:00 AM", horaInicio: 8, minInicio: 0 },
  { value: "10:00", label: "10:00 AM - 12:00 PM", horaInicio: 10, minInicio: 0 },
  { value: "12:00", label: "12:00 PM - 02:00 PM", horaInicio: 12, minInicio: 0 },
  { value: "14:00", label: "02:00 PM - 04:00 PM", horaInicio: 14, minInicio: 0 },
  { value: "16:00", label: "04:00 PM - 06:00 PM", horaInicio: 16, minInicio: 0 },
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

export const MENSAJE_FECHA_INSPECCION = "Las inspecciones deben programarse con al menos un día de anticipación. Seleccione una fecha a partir de mañana.";

export const esFechaValidaParaInspeccion = (fechaStr) => {
  if (!fechaStr) return false;
  let fechaObj;
  if (fechaStr.includes("-")) {
    const [y, m, d] = fechaStr.split("-").map(Number);
    fechaObj = new Date(y, m - 1, d);
  } else if (fechaStr.includes("/")) {
    const [d, m, y] = fechaStr.split("/").map(Number);
    fechaObj = new Date(y, m - 1, d);
  } else {
    fechaObj = new Date(fechaStr);
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

const ESTADOS_CERRADOS = ["Aprobado", "Rechazado", "Licencia aprobada", "Licencia rechazada"];

export const buscarSiguienteDisponibilidad = (solicitudesActuales) => {
  const hoy = new Date();
  const maxDiasHorizonte = 30;
  const listaSolicitudes = Array.isArray(solicitudesActuales) ? solicitudesActuales : [];

  for (let offset = 1; offset <= maxDiasHorizonte; offset++) {
    const fechaEvaluada = new Date(hoy);
    fechaEvaluada.setDate(hoy.getDate() + offset);

    if (!esDiaHabil(fechaEvaluada)) continue;

    const fechaStrDDMMYYYY = formatearFechaLocal(fechaEvaluada);

    for (const inspector of INSPECTORES_DEFAULT) {
      const inspUid = (inspector.uid || inspector.id || "").toLowerCase();
      const inspNombre = (inspector.nombre || "").toLowerCase();

      const conteoDiario = listaSolicitudes.filter((s) => {
        if (!s) return false;
        const u = (s.inspectorUid || s.inspectorAsignadoUid || s.inspectorNombre || "").toLowerCase();
        if (!u.includes(inspUid) && !u.includes(inspNombre)) return false;
        const f = s.fechaVisitaInspector || s.fechaInspeccion || "";
        if (f !== fechaStrDDMMYYYY) return false;
        return !ESTADOS_CERRADOS.includes(s.estado);
      }).length;

      if (conteoDiario >= MAX_INSPECCIONES_POR_DIA) continue;

      for (const slot of TIME_SLOTS) {
        const ocupado = listaSolicitudes.some((s) => {
          if (!s) return false;
          const u = (s.inspectorUid || s.inspectorAsignadoUid || s.inspectorNombre || "").toLowerCase();
          if (!u.includes(inspUid) && !u.includes(inspNombre)) return false;
          const f = s.fechaVisitaInspector || s.fechaInspeccion || "";
          if (f !== fechaStrDDMMYYYY) return false;
          const h = s.horaVisitaInspector || s.horaVisitaLabel || s.slotInspeccion || "";
          if (h !== slot.value && !h.includes(slot.value)) return false;
          return !ESTADOS_CERRADOS.includes(s.estado);
        });

        if (!ocupado) {
          return {
            exito: true,
            fechaInspeccion: fechaStrDDMMYYYY,
            slotInspeccion: slot.value,
            horaLabel: slot.label,
            inspector,
          };
        }
      }
    }
  }

  return { exito: false };
};
