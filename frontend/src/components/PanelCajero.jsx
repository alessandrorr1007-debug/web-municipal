import { useEffect, useState, useMemo, useCallback } from "react";
import {
  obtenerSolicitudes,
  actualizarSolicitud,
  guardarSolicitud,
} from "../services/solicitudService";
import { crearNotificacion } from "../services/notificacionService";
import { abrirPdf } from "../services/pdfService";
import { consultarDni } from "../services/dniService";
import { consultarRuc } from "../services/rucService";
import { GROS_DISPONIBLES, obtenerDocumentosPorGiro } from "../config/documentosPorGiro";
import { useAuth } from "../context/AuthContext";
import {
  TIME_SLOTS,
  formatearFechaLocal,
  esHorarioPasado,
  MENSAJE_FECHA_INSPECCION,
  obtenerFechaMinimaInspeccion,
} from "../config/inspeccionConfig";

const MONTO_TRAMITE = 3.0;

const INSPECTORES_DEFAULT = [
  { uid: "INSP-001", nombre: "Inspector Carlos Ramírez", correo: "carlos.ramirez@munitrujillo.gob.pe", cargo: "Inspector Municipal de Defensa Civil" },
  { uid: "INSP-002", nombre: "Inspectora Ana Torres", correo: "ana.torres@munitrujillo.gob.pe", cargo: "Inspectora de Licencias y Subgerencia" },
  { uid: "INSP-003", nombre: "Inspector Luis Pérez", correo: "luis.perez@munitrujillo.gob.pe", cargo: "Inspector Técnico Edilicio" },
];

const obtenerFechaMananaObj = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d;
};

const formatearFechaDDMMYYYY = (d) => {
  const dia = String(d.getDate()).padStart(2, "0");
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const anio = d.getFullYear();
  return `${dia}/${mes}/${anio}`;
};

const formatearFechaYYYYMMDD = (d) => {
  const dia = String(d.getDate()).padStart(2, "0");
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const anio = d.getFullYear();
  return `${anio}-${mes}-${dia}`;
};

const esFechaPermitidaInspeccion = (fechaStr) => {
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

function PanelCajero({ seccion, cambiarSeccion }) {
  const { usuario } = useAuth();
  const [solicitudes, setSolicitudes] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [errorFechaRange, setErrorFechaRange] = useState("");
  const [solicitudCobro, setSolicitudCobro] = useState(null);
  const [solicitudVerDetalle, setSolicitudVerDetalle] = useState(null);
  const [metodoPagoSeleccionado, setMetodoPagoSeleccionado] = useState("Efectivo en Caja Municipal");
  const [comprobanteGenerado, setComprobanteGenerado] = useState(null);
  const [procesando, setProcesando] = useState(false);

  // VISTA SECUNDARIA DE CONSULTA DE ESTADO DE TRÁMITES
  const [vistaConsultaEstado, setVistaConsultaEstado] = useState(() => seccion === "consulta-expedientes" || seccion === "historial" || seccion === "solicitudes-pago");

  useEffect(() => {
    if (seccion === "consulta-expedientes" || seccion === "historial" || seccion === "solicitudes-pago") {
      setVistaConsultaEstado(true);
    } else if (seccion === "inicio") {
      setVistaConsultaEstado(false);
    }
  }, [seccion]);

  // ESTADOS DE ASIGNACIÓN E INSPECCIÓN DIRECTA (DESDE MAÑANA COMO MÍNIMO)
  const [inspectorElegido, setInspectorElegido] = useState(() => INSPECTORES_DEFAULT[0]);
  const [fechaInspeccion, setFechaInspeccion] = useState(() => formatearFechaDDMMYYYY(obtenerFechaMananaObj()));
  const [slotInspeccion, setSlotInspeccion] = useState("08:00");

  // ESTADOS PARA REGISTRO PRESENCIAL DE NUEVA SOLICITUD (WIZARD DE PASO ÚNICO ACTIVO)
  const [pasoActual, setPasoActual] = useState(1);
  const [pagoConfirmadoLocal, setPagoConfirmadoLocal] = useState(false);
  const [resultadoRegistroExitoso, setResultadoRegistroExitoso] = useState(null);
  const [mostrarModalNuevaSolicitud, setMostrarModalNuevaSolicitud] = useState(false);
  const [dniForm, setDniForm] = useState("");
  const [nombresForm, setNombresForm] = useState("");
  const [apellidosForm, setApellidosForm] = useState("");
  const [correoForm, setCorreoForm] = useState("");
  const [telefonoForm, setTelefonoForm] = useState("");
  const [rucForm, setRucForm] = useState("");
  const [nombreNegocioForm, setNombreNegocioForm] = useState("");
  const [razonSocialForm, setRazonSocialForm] = useState("");
  const [direccionForm, setDireccionForm] = useState("");
  const [giroForm, setGiroForm] = useState("general");
  const [consultandoDni, setConsultandoDni] = useState(false);
  const [consultandoRuc, setConsultandoRuc] = useState(false);
  const [archivosPresenciales, setArchivosPresenciales] = useState([]);

  // ESTADOS DE VALIDACIÓN REAL RENIEC Y SUNAT
  const [dniValidado, setDniValidado] = useState(false);
  const [rucValidado, setRucValidado] = useState(false);
  // ESTADOS DE UBICACIÓN Y JURISDICCIÓN SUNAT
  const [estadoSunat, setEstadoSunat] = useState("");
  const [condicionSunat, setCondicionSunat] = useState("");
  const [distritoSunat, setDistritoSunat] = useState("");
  const [provinciaSunat, setProvinciaSunat] = useState("");
  const [departamentoSunat, setDepartamentoSunat] = useState("");
  const [actividadEconomicaSunat, setActividadEconomicaSunat] = useState("");
  const [esJurisdiccionTrujillo, setEsJurisdiccionTrujillo] = useState(true);

  // CONSULTAR RENIEC (DNI) EN PRESENCIAL
  const manejarConsultarDniPresencial = async () => {
    if (!dniForm || dniForm.length !== 8) {
      alert("⚠️ Ingrese un DNI válido de 8 dígitos.");
      return;
    }
    setConsultandoDni(true);
    try {
      const res = await consultarDni(dniForm);
      const nom = res.nombres || res.nombre_completo || res.nombreCompleto || "";
      const ape = [res.apellidoPaterno || res.apellido_paterno, res.apellidoMaterno || res.apellido_materno].filter(Boolean).join(" ");

      if (nom) {
        setNombresForm(nom);
        setApellidosForm(ape || "REGISTRADO EN RENIEC");
        setDniValidado(true);
      } else {
        alert("⚠️ No se encontraron datos en RENIEC para este DNI.");
        setDniValidado(false);
      }
    } catch (err) {
      console.error(err);
      alert("Error al consultar RENIEC: " + err.message);
      setDniValidado(false);
    } finally {
      setConsultandoDni(false);
    }
  };

  // CONSULTAR SUNAT (RUC) EN PRESENCIAL CON VALIDACIÓN DE JURISDICCIÓN DE TRUJILLO
  const manejarConsultarRucPresencial = async () => {
    if (!rucForm || rucForm.length !== 11) {
      alert("⚠️ Ingrese un RUC válido de 11 dígitos.");
      return;
    }
    setConsultandoRuc(true);
    try {
      const res = await consultarRuc(rucForm);
      const rSoc = res.razonSocial || res.nombreNegocio || res.nombreComercial || "EMPRESA REGISTRADA S.A.C.";
      const nCom = res.nombreComercial || res.razonSocial || res.nombreNegocio || rSoc;
      const dir = res.direccion || res.direccionFiscal || "AV. ESPAÑA NRO. 123 - TRUJILLO";
      const est = res.estado || "ACTIVO";
      const cond = res.condicion || "HABIDO";

      const dist = res.distrito || "Trujillo";
      const prov = res.provincia || "Trujillo";
      const dep = res.departamento || "La Libertad";
      const act = res.giroComercial || res.actividadEconomica || res.actividad || "VENTA AL POR MENOR EN COMERCIOS NO ESPECIALIZADOS";

      // Validar si pertenece a la jurisdicción de la Provincia de Trujillo, La Libertad
      const provNorm = (prov || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const depNorm = (dep || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const dirNorm = (dir || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const distNorm = (dist || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

      const distritosTrujillo = [
        "trujillo", "victor larco", "moche", "el porvenir", "la esperanza",
        "florencia de mora", "huanchaco", "salaverry", "laredo", "simbal", "poroto"
      ];

      const esEnTrujillo =
        provNorm.includes("trujillo") ||
        (depNorm.includes("libertad") && distritosTrujillo.some((d) => distNorm.includes(d) || dirNorm.includes(d))) ||
        (depNorm.includes("libertad") && provNorm.includes("trujillo"));

      // Inferir giro comercial según actividad económica obtenida de SUNAT
      let giroInferido = res.giro || "general";
      const actTexto = act.toLowerCase();
      if (actTexto.includes("restaurante") || actTexto.includes("comida") || actTexto.includes("gastronom")) giroInferido = "restaurante";
      else if (actTexto.includes("farmacia") || actTexto.includes("botic") || actTexto.includes("medic")) giroInferido = "farmacia";
      else if (actTexto.includes("oficina") || actTexto.includes("consultor") || actTexto.includes("servicios")) giroInferido = "oficina";
      else if (actTexto.includes("tienda") || actTexto.includes("bodega") || actTexto.includes("comerc")) giroInferido = "comercial";
      else if (actTexto.includes("hotel") || actTexto.includes("hospedaje")) giroInferido = "hotel";

      setRazonSocialForm(rSoc);
      setNombreNegocioForm(nCom);
      setDireccionForm(dir);
      setEstadoSunat(est);
      setCondicionSunat(cond);
      setDistritoSunat(dist);
      setProvinciaSunat(prov);
      setDepartamentoSunat(dep);
      setActividadEconomicaSunat(act);
      setGiroForm(giroInferido);
      setEsJurisdiccionTrujillo(esEnTrujillo);
      setRucValidado(true);

      if (!esEnTrujillo) {
        alert("⚠️ Este establecimiento no pertenece a la jurisdicción de la Municipalidad Provincial de Trujillo. Solo es posible registrar solicitudes para establecimientos ubicados en la provincia de Trujillo.");
      }
    } catch (err) {
      console.error(err);
      alert("Error al consultar SUNAT: " + err.message);
      setRucValidado(false);
      setEsJurisdiccionTrujillo(false);
    } finally {
      setConsultandoRuc(false);
    }
  };

  // CARGAR ARCHIVO PRESENCIAL
  const manejarArchivoPresencial = (e, docId, docNombre) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64Url = reader.result;
      setArchivosPresenciales((prev) => [
        ...prev.filter((item) => item.docId !== docId),
        {
          docId,
          nombre: docNombre || file.name,
          archivoNombre: file.name,
          archivoUrl: base64Url,
          url: base64Url,
          tipo: "presencial",
        },
      ]);
    };
    reader.readAsDataURL(file);
  };

  const obtenerConteoInspectorEnFecha = useCallback((inspectorUid, fechaStr) => {
    if (!fechaStr || !inspectorUid) return 0;
    return solicitudes.filter((s) => {
      const u = (s.inspectorUid || s.inspectorAsignadoUid || s.inspectorNombre || "");
      const esMismo = u === inspectorUid || u.includes(inspectorUid);
      const esFecha = s.fechaVisitaInspector === fechaStr;
      const noCerrado = !["Aprobado", "Rechazado", "Licencia aprobada", "Licencia rechazada"].includes(s.estado);
      return esMismo && esFecha && noCerrado;
    }).length;
  }, [solicitudes]);

  const esHorarioOcupado = useCallback((inspectorUid, fechaStr, slotValue) => {
    if (!fechaStr || !inspectorUid || !slotValue) return false;
    return solicitudes.some((s) => {
      const u = (s.inspectorUid || s.inspectorAsignadoUid || s.inspectorNombre || "");
      const esMismo = u === inspectorUid || u.includes(inspectorUid);
      const esFecha = s.fechaVisitaInspector === fechaStr;
      const esSlot = (s.horaVisitaInspector === slotValue || (s.horaVisitaLabel || "").includes(slotValue));
      const noCerrado = !["Aprobado", "Rechazado", "Licencia aprobada", "Licencia rechazada"].includes(s.estado);
      return esMismo && esFecha && esSlot && noCerrado;
    });
  }, [solicitudes]);

  // PROGRAMACIÓN AUTOMÁTICA Y SUGERENCIA DE INSPECTOR/HORARIO CUANDO CAMBIA LA FECHA
  useEffect(() => {
    if (!fechaInspeccion || !esFechaPermitidaInspeccion(fechaInspeccion)) return;

    // Buscar primer inspector disponible (< 4 cupos)
    const primerDisponible = INSPECTORES_DEFAULT.find((insp) => {
      const c = obtenerConteoInspectorEnFecha(insp.uid, fechaInspeccion);
      return c < 4;
    }) || INSPECTORES_DEFAULT[0];

    let actualInsp = inspectorElegido;
    if (!actualInsp || obtenerConteoInspectorEnFecha(actualInsp.uid, fechaInspeccion) >= 4) {
      actualInsp = primerDisponible;
      setInspectorElegido(primerDisponible);
    }

    if (actualInsp) {
      // Buscar primer horario libre
      const primerSlotLibre = TIME_SLOTS.find(
        (s) => !esHorarioOcupado(actualInsp.uid, fechaInspeccion, s.value)
      );
      if (primerSlotLibre) {
        setSlotInspeccion(primerSlotLibre.value);
      }
    }
  }, [fechaInspeccion, solicitudes, obtenerConteoInspectorEnFecha, esHorarioOcupado]);

  const cargarSolicitudes = async () => {
    try {
      setCargando(true);
      const data = await obtenerSolicitudes();
      setSolicitudes(data);
    } catch (error) {
      console.error(error);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarSolicitudes();
  }, []);

  const formatearFechaHora = () => {
    return new Date().toLocaleString("es-PE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  // CLASIFICACIÓN DE SOLICITUDES
  const pendientesPago = useMemo(() => {
    const lista = Array.isArray(solicitudes) ? solicitudes : [];
    return lista.filter((s) => {
      if (!s) return false;
      const e = String(s.estadoPago || s.estado || "").toLowerCase();
      const esConfirmado = s.estadoPago === "Confirmado" || e.includes("pagado") || e.includes("enviado");
      return !esConfirmado && e !== "anulado";
    });
  }, [solicitudes]);

  const pagadas = useMemo(() => {
    const lista = Array.isArray(solicitudes) ? solicitudes : [];
    return lista.filter((s) => {
      if (!s) return false;
      const e = String(s.estadoPago || s.estado || "").toLowerCase();
      return (s.estadoPago === "Confirmado" || e.includes("pagado")) && !e.includes("inspección") && !e.includes("aprobado");
    });
  }, [solicitudes]);

  const enviadasAInspeccion = useMemo(() => {
    const lista = Array.isArray(solicitudes) ? solicitudes : [];
    return lista.filter((s) => {
      if (!s) return false;
      const e = String(s.estado || s.estadoNormalizado || "").toLowerCase();
      return e.includes("inspeccion") || e.includes("aprobado") || e.includes("revisión");
    });
  }, [solicitudes]);

  const anuladas = useMemo(() => {
    const lista = Array.isArray(solicitudes) ? solicitudes : [];
    return lista.filter((s) => {
      if (!s) return false;
      const e = String(s.estado || "").toLowerCase();
      return e.includes("anulado") || e.includes("rechazado");
    });
  }, [solicitudes]);

  // EVALUACIÓN SECUENCIAL DE LOS 7 PASOS DEL WIZARD DE CAJERO
  // Paso 1: Validación RENIEC
  const paso1Completado = dniValidado && Boolean(nombresForm) && Boolean(apellidosForm);

  // Paso 2: Datos de Contacto (Teléfono Celular iniciado en 9 y Correo válido)
  const esTelefonoValido = /^9\d{8}$/.test(telefonoForm);
  const esCorreoValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correoForm);
  const paso2Completado = paso1Completado && esTelefonoValido && esCorreoValido;

  // Paso 3: Validación SUNAT
  const sunatPermiteContinuar = rucValidado && estadoSunat === "ACTIVO" && condicionSunat === "HABIDO";
  const paso3Completado = paso2Completado && sunatPermiteContinuar && Boolean(nombreNegocioForm) && Boolean(direccionForm);

  // Paso 4: Carga de Documentos Obligatorios por Giro
  const reqsDocInfo = obtenerDocumentosPorGiro(giroForm);
  const reqsDoc = reqsDocInfo?.ciudadano || [];
  const reqsObligatorios = reqsDoc.filter((d) => d.obligatorio);
  const faltanObligatorios = reqsObligatorios.some((req) => !archivosPresenciales.some((a) => a.docId === req.id));
  const paso4Completado = paso3Completado && reqsObligatorios.length > 0 && !faltanObligatorios;

  // Paso 5: Cobro de Tasa (S/ 3.00) y Método de Pago
  const paso5Completado = paso4Completado && Boolean(metodoPagoSeleccionado);

  // Paso 6: Programación de Inspección Técnica
  const paso6Completado = paso5Completado && Boolean(inspectorElegido) && Boolean(fechaInspeccion) && Boolean(slotInspeccion);

  // Paso 7: Registro y Finalización
  const paso7Listo = paso6Completado;

  // Conteo de pasos completados para la barra de progreso
  const pasosCompletadosCount = [
    paso1Completado,
    paso2Completado,
    paso3Completado,
    paso4Completado,
    paso5Completado,
    paso6Completado,
    paso7Listo
  ].filter(Boolean).length;

  const porcentajeProgreso = Math.round((pasosCompletadosCount / 7) * 100);

  const obtenerEstadoPaso = (numPaso) => {
    if (numPaso === 1) {
      if (paso1Completado) return { icono: "✅", texto: "Completado", bg: "#dcfce7", color: "#15803d" };
      return { icono: "🟡", texto: "En proceso", bg: "#fef3c7", color: "#b45309" };
    }
    if (numPaso === 2) {
      if (!paso1Completado) return { icono: "🔒", texto: "Bloqueado", bg: "#f1f5f9", color: "#64748b" };
      if (paso2Completado) return { icono: "✅", texto: "Completado", bg: "#dcfce7", color: "#15803d" };
      return { icono: "🟡", texto: "En proceso", bg: "#fef3c7", color: "#b45309" };
    }
    if (numPaso === 3) {
      if (!paso2Completado) return { icono: "🔒", texto: "Bloqueado", bg: "#f1f5f9", color: "#64748b" };
      if (paso3Completado) return { icono: "✅", texto: "Completado", bg: "#dcfce7", color: "#15803d" };
      return { icono: "🟡", texto: "En proceso", bg: "#fef3c7", color: "#b45309" };
    }
    if (numPaso === 4) {
      if (!paso3Completado) return { icono: "🔒", texto: "Bloqueado", bg: "#f1f5f9", color: "#64748b" };
      if (paso4Completado) return { icono: "✅", texto: "Completado", bg: "#dcfce7", color: "#15803d" };
      return { icono: "🟡", texto: "En proceso", bg: "#fef3c7", color: "#b45309" };
    }
    if (numPaso === 5) {
      if (!paso4Completado) return { icono: "🔒", texto: "Bloqueado", bg: "#f1f5f9", color: "#64748b" };
      if (paso5Completado) return { icono: "✅", texto: "Completado", bg: "#dcfce7", color: "#15803d" };
      return { icono: "🟡", texto: "En proceso", bg: "#fef3c7", color: "#b45309" };
    }
    if (numPaso === 6) {
      if (!paso5Completado) return { icono: "🔒", texto: "Bloqueado", bg: "#f1f5f9", color: "#64748b" };
      if (paso6Completado) return { icono: "✅", texto: "Completado", bg: "#dcfce7", color: "#15803d" };
      return { icono: "🟡", texto: "En proceso", bg: "#fef3c7", color: "#b45309" };
    }
    if (numPaso === 7) {
      if (!paso6Completado) return { icono: "🔒", texto: "Bloqueado", bg: "#f1f5f9", color: "#64748b" };
      return { icono: "🚀", texto: "Listo", bg: "#dcfce7", color: "#15803d" };
    }
    return { icono: "🔒", texto: "Bloqueado", bg: "#f1f5f9", color: "#64748b" };
  };

  const obtenerFechaPagoObj = useCallback((s) => {
    const str = s.fechaPago || s.fechaPagoPresencial || s.fechaCobro || s.fechaEmision || s.fechaRegistro || s.fechaVisitaInspector || s.fecha || "";
    if (!str) return null;
    if (typeof str === "object" && str.seconds) {
      return new Date(str.seconds * 1000);
    }
    if (typeof str === "string") {
      if (str.includes("-")) {
        const [y, m, d] = str.split("-").map(Number);
        return new Date(y, m - 1, d);
      }
      if (str.includes("/")) {
        const [d, m, y] = str.split("/").map(Number);
        return new Date(y, m - 1, d);
      }
    }
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  }, []);

  const obtenerFechaHoyStr = useCallback(() => {
    const hoy = new Date();
    const y = hoy.getFullYear();
    const m = String(hoy.getMonth() + 1).padStart(2, "0");
    const d = String(hoy.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }, []);

  // BUSQUEDA Y FILTRADO POR CÓDIGO, DNI, RUC, NOMBRE Y RANGO DE FECHAS DE PAGO
  const solicitudesFiltradas = useMemo(() => {
    const lista = Array.isArray(solicitudes) ? solicitudes : [];
    const hoyStr = obtenerFechaHoyStr();

    return lista.filter((s) => {
      if (!s) return false;

      // 1. Filtro por Rango de Fechas de Pago (solo si se especifican fechas)
      if (seccion === "historial") {
        if (fechaDesde || fechaHasta) {
          if (fechaDesde && (fechaDesde < "2026-07-14" || fechaDesde > hoyStr)) return false;
          if (fechaHasta && (fechaHasta < "2026-07-14" || fechaHasta > hoyStr)) return false;
          if (fechaDesde && fechaHasta && fechaDesde > fechaHasta) return false;

          const fechaPagoObj = obtenerFechaPagoObj(s);
          if (!fechaPagoObj) return false;
          fechaPagoObj.setHours(0, 0, 0, 0);

          if (fechaDesde) {
            const [y1, m1, d1] = fechaDesde.split("-").map(Number);
            const fDesde = new Date(y1, m1 - 1, d1, 0, 0, 0, 0);
            if (fechaPagoObj < fDesde) return false;
          }

          if (fechaHasta) {
            const [y2, m2, d2] = fechaHasta.split("-").map(Number);
            const fHasta = new Date(y2, m2 - 1, d2, 0, 0, 0, 0);
            if (fechaPagoObj > fHasta) return false;
          }
        }
      }

      // 2. Filtro por Búsqueda de Texto (Código, DNI, RUC, Nombres, Razón Social)
      if (!busqueda || !busqueda.trim()) return true;
      const q = busqueda.toLowerCase().trim();
      const dni = String(s.dniSolicitante || s.dni || "").toLowerCase();
      const idExp = String(s.id || "").toLowerCase();
      const codExp = `exp-${idExp}`;
      const ruc = String(s.ruc || "").toLowerCase();
      const razonSocial = String(s.razonSocial || "").toLowerCase();
      return dni.includes(q) || idExp.includes(q) || codExp.includes(q) || ruc.includes(q) || nombreSol.includes(q) || razonSocial.includes(q);
    });
  }, [solicitudes, seccion, fechaDesde, fechaHasta, busqueda, obtenerFechaPagoObj, obtenerFechaHoyStr]);

  // CONFIRMAR PAGO Y PROGRAMAR INSPECCIÓN OFICIAL
  const ejecutarCobro = async () => {
    if (!solicitudCobro) return;
    if (!inspectorElegido) {
      alert("⚠️ Por favor seleccione un inspector para la visita técnica.");
      return;
    }
    if (!fechaInspeccion) {
      alert("⚠️ Por favor seleccione la fecha de la inspección.");
      return;
    }

    // VALIDACIÓN 1: No fechas pasadas
    if (esHorarioPasado(fechaInspeccion, "00:00")) {
      alert("⚠️ No se permite programar inspecciones para fechas pasadas.");
      return;
    }

    // VALIDACIÓN 2: Límite máximo 4 inspecciones por día por inspector
    const cuposActuales = obtenerConteoInspectorEnFecha(inspectorElegido.uid || inspectorElegido.nombre, fechaInspeccion);
    if (cuposActuales >= 4) {
      alert(`⚠️ El inspector ${inspectorElegido.nombre} ya completó el máximo de 4 inspecciones diarias para el día ${fechaInspeccion}. Elija otro inspector o cambie la fecha.`);
      return;
    }

    // VALIDACIÓN 3: No horarios duplicados para el mismo inspector en la misma fecha
    if (esHorarioOcupado(inspectorElegido.uid || inspectorElegido.nombre, fechaInspeccion, slotInspeccion)) {
      alert(`⚠️ El inspector ${inspectorElegido.nombre} ya tiene una visita asignada a las ${slotInspeccion} para el día ${fechaInspeccion}. Elija otro horario disponible.`);
      return;
    }

    setProcesando(true);
    try {
      const codComprobante = "BOL-CAJA-2026-" + Date.now().toString().slice(-6);
      const fechaHoraActual = formatearFechaHora();
      const nombreCajera = usuario?.nombre || usuario?.email || "Cajera de Ventanilla";
      const uidCajera = usuario?.uid || "CAJERA-001";
      const slotObj = TIME_SLOTS.find((s) => s.value === slotInspeccion);
      const horaLabel = slotObj ? slotObj.label : `${slotInspeccion} hrs`;

      const cambios = {
        estadoPago: "Confirmado",
        estado: "Inspección programada",
        estadoNormalizado: "INSPECCION_PROGRAMADA",
        estadoInspeccion: "Programada",
        inspeccion: "Programada",
        inspectorUid: inspectorElegido.uid || inspectorElegido.id,
        inspectorAsignadoUid: inspectorElegido.uid || inspectorElegido.id,
        inspectorNombre: inspectorElegido.nombre,
        fechaVisitaInspector: fechaInspeccion,
        horaVisitaInspector: slotInspeccion,
        horaVisitaLabel: horaLabel,
        metodoPago: metodoPagoSeleccionado,
        montoPagado: MONTO_TRAMITE,
        comprobantePago: `Boleta de Caja N° ${codComprobante}`,
        numeroOperacion: codComprobante,
        fechaPago: fechaHoraActual,
        cajeraResponsable: nombreCajera,
        usuarioCajero: nombreCajera,
        uidCajero: uidCajera,
        fechaEnvioOficial: fechaHoraActual,
        historialAcciones: [
          ...(solicitudCobro.historialAcciones || []),
          {
            fecha: fechaHoraActual.split(",")[0] || fechaHoraActual,
            hora: fechaHoraActual.split(",")[1]?.trim() || "",
            usuario: nombreCajera,
            rol: "Cajera",
            accion: "Cobro de tasa y programación de inspección",
            comentarios: `Pago de S/ ${MONTO_TRAMITE.toFixed(2)} registrado (${metodoPagoSeleccionado}). Boleta: ${codComprobante}. Visita asignada a ${inspectorElegido.nombre} para el ${fechaInspeccion} a las ${horaLabel}.`,
          },
        ],
      };

      await actualizarSolicitud(solicitudCobro.id, cambios);

      // Notificación 1: Al Ciudadano
      await crearNotificacion(
        solicitudCobro.uidUsuario || "",
        {
          titulo: "Pago Confirmado e Inspección Programada",
          descripcion: `Su pago por S/ ${MONTO_TRAMITE.toFixed(2)} (${codComprobante}) fue procesado. Su inspección técnica fue asignada a ${inspectorElegido.nombre} para el ${fechaInspeccion} (${horaLabel}).`,
          icono: "📅",
        },
        solicitudCobro.correoUsuario || ""
      );

      // Notificación 2: Al Inspector Asignado (Sistema + Correo)
      await crearNotificacion(
        inspectorElegido.uid || "INSPECTOR",
        {
          titulo: "Nueva Inspección Asignada",
          descripcion: `Se le ha asignado la inspección del expediente EXP-${solicitudCobro.id} (${solicitudCobro.nombreNegocio}) para el ${fechaInspeccion} a las ${horaLabel}. Programado por la cajera ${nombreCajera}.`,
          icono: "🔍",
        },
        inspectorElegido.correo || ""
      );

      const actualizada = { ...solicitudCobro, ...cambios, codComprobante };
      setComprobanteGenerado(actualizada);
      setSolicitudCobro(null);
      setInspectorElegido(null);
      await cargarSolicitudes();
    } catch (err) {
      console.error(err);
      alert("Error al procesar cobro y programación: " + err.message);
    } finally {
      setProcesando(false);
    }
  };

  // REGISTRAR SOLICITUD PRESENCIAL COMPLETA (FORMULARIO CAJERA)
  const ejecutarRegistroPresencialCompleto = async (e) => {
    if (e && e.preventDefault) e.preventDefault();

    if (!dniValidado) {
      alert("⚠️ Debe consultar y validar el DNI del solicitante mediante RENIEC antes de continuar.");
      return;
    }
    if (!rucValidado) {
      alert("⚠️ Debe consultar y validar el RUC del establecimiento mediante SUNAT antes de continuar.");
      return;
    }
    if (!esJurisdiccionTrujillo) {
      alert("Este establecimiento no pertenece a la jurisdicción de la Municipalidad Provincial de Trujillo. Solo es posible registrar solicitudes para establecimientos ubicados en la provincia de Trujillo.");
      return;
    }
    if (!dniForm || dniForm.length !== 8) {
      alert("⚠️ Ingrese un DNI válido de 8 dígitos.");
      return;
    }
    if (!telefonoForm || !/^9\d{8}$/.test(telefonoForm)) {
      alert("⚠️ Ingrese un número de celular peruano válido de 9 dígitos que inicie con 9.");
      return;
    }
    if (!nombresForm || !apellidosForm) {
      alert("⚠️ Ingrese nombres y apellidos completos del solicitante.");
      return;
    }
    if (!rucForm || rucForm.length !== 11) {
      alert("⚠️ Ingrese un RUC válido de 11 dígitos.");
      return;
    }
    if (!nombreNegocioForm || !direccionForm) {
      alert("⚠️ Complete los datos obligatorios del establecimiento comercial.");
      return;
    }
    if (!inspectorElegido) {
      alert("⚠️ Seleccione un inspector para la visita técnica.");
      return;
    }

    // Validaciones de inspección
    if (esHorarioPasado(fechaInspeccion, "00:00")) {
      alert("⚠️ No se permite programar inspecciones para fechas pasadas.");
      return;
    }
    const cuposActuales = obtenerConteoInspectorEnFecha(inspectorElegido.uid || inspectorElegido.nombre, fechaInspeccion);
    if (cuposActuales >= 4) {
      alert(`⚠️ El inspector ${inspectorElegido.nombre} ha alcanzado el límite máximo de 4 inspecciones para el ${fechaInspeccion}.`);
      return;
    }
    if (esHorarioOcupado(inspectorElegido.uid || inspectorElegido.nombre, fechaInspeccion, slotInspeccion)) {
      alert(`⚠️ El inspector ${inspectorElegido.nombre} ya tiene una visita asignada a las ${slotInspeccion} el día ${fechaInspeccion}.`);
      return;
    }

    setProcesando(true);
    try {
      const idExp = Date.now().toString().slice(-6);
      const codComprobante = "BOL-CAJA-2026-" + Date.now().toString().slice(-6);
      const fechaHoraActual = formatearFechaHora();
      const nombreCajera = usuario?.nombre || usuario?.email || "Cajera de Ventanilla";
      const uidCajera = usuario?.uid || "CAJERA-001";
      const slotObj = TIME_SLOTS.find((s) => s.value === slotInspeccion);
      const horaLabel = slotObj ? slotObj.label : `${slotInspeccion} hrs`;

      const nuevaSolicitudPresencial = {
        id: idExp,
        numeroExpediente: `EXP-${idExp}`,
        dniSolicitante: dniForm,
        dni: dniForm,
        nombresSolicitante: nombresForm,
        apellidosSolicitante: apellidosForm,
        nombreSolicitante: `${nombresForm} ${apellidosForm}`,
        correoUsuario: correoForm || `${dniForm}@ciudadano.pe`,
        telefono: telefonoForm,
        ruc: rucForm,
        nombreNegocio: nombreNegocioForm,
        razonSocial: razonSocialForm || nombreNegocioForm,
        direccion: direccionForm,
        giro: giroForm,
        tipoTramite: "Licencia de Funcionamiento Presencial",
        estado: "Inspección programada",
        estadoNormalizado: "INSPECCION_PROGRAMADA",
        estadoPago: "Confirmado",
        metodoPago: metodoPagoSeleccionado,
        montoPagado: MONTO_TRAMITE,
        comprobantePago: `Boleta de Caja N° ${codComprobante}`,
        numeroOperacion: codComprobante,
        fechaPago: fechaHoraActual,
        cajeraResponsable: nombreCajera,
        usuarioCajero: nombreCajera,
        uidCajero: uidCajera,
        fechaEnvioOficial: fechaHoraActual,
        fechaSolicitud: fechaHoraActual,
        archivosPdf: archivosPresenciales,
        documentosResumen: archivosPresenciales.map((a) => a.nombre),
        inspectorUid: inspectorElegido.uid || inspectorElegido.id,
        inspectorAsignadoUid: inspectorElegido.uid || inspectorElegido.id,
        inspectorNombre: inspectorElegido.nombre,
        fechaVisitaInspector: fechaInspeccion,
        horaVisitaInspector: slotInspeccion,
        horaVisitaLabel: horaLabel,
        historialAcciones: [
          {
            fecha: fechaHoraActual.split(",")[0] || fechaHoraActual,
            hora: fechaHoraActual.split(",")[1]?.trim() || "",
            usuario: nombreCajera,
            rol: "Cajera",
            accion: "Registro Presencial, Cobro de Tasa y Asignación de Inspector",
            comentarios: `Registro presencial en ventanilla. Pago de S/ ${MONTO_TRAMITE.toFixed(2)} registrado (${metodoPagoSeleccionado}). Boleta: ${codComprobante}. Visita asignada a ${inspectorElegido.nombre} para el ${fechaInspeccion} a las ${horaLabel}.`,
          },
        ],
      };

      const idGenerado = await guardarSolicitud(nuevaSolicitudPresencial);
      const solicitudCompleta = { ...nuevaSolicitudPresencial, id: idGenerado || idExp };

      if (correoForm) {
        await crearNotificacion(
          solicitudCompleta.uidUsuario || "",
          {
            titulo: "Registro Presencial y Pago Confirmado",
            descripcion: `Se registró su solicitud presencial EXP-${solicitudCompleta.id}. Pago de S/ ${MONTO_TRAMITE.toFixed(2)} procesado. Inspección asignada a ${inspectorElegido.nombre} el ${fechaInspeccion} (${horaLabel}).`,
            icono: "📜",
          },
          correoForm
        );
      }

      await crearNotificacion(
        inspectorElegido.uid || "INSPECTOR",
        {
          titulo: "Nueva Inspección Asignada (Presencial)",
          descripcion: `Visita presencial asignada para el expediente EXP-${solicitudCompleta.id} (${nombreNegocioForm}) el ${fechaInspeccion} a las ${horaLabel}. Registrado por cajera ${nombreCajera}.`,
          icono: "🔍",
        },
        inspectorElegido.correo || ""
      );

      const resExito = {
        id: solicitudCompleta.id,
        codComprobante,
        inspectorNombre: inspectorElegido.nombre,
        fechaInspeccion,
        slotInspeccion: horaLabel,
        nombreSolicitante: `${nombresForm} ${apellidosForm}`,
        nombreNegocio: nombreNegocioForm,
        solicitudCompleta
      };

      setComprobanteGenerado(solicitudCompleta);
      setResultadoRegistroExitoso(resExito);
      await cargarSolicitudes();
    } catch (err) {
      console.error(err);
      alert("Error al ejecutar el registro presencial: " + err.message);
    } finally {
      setProcesando(false);
    }
  };

  const imprimirComprobante = () => {
    window.print();
  };

  return (
    <div className="panel panel-cajero">
      {/* HERO INSTITUCIONAL DE CAJA Y ATENCIÓN */}
      <div className="inspector-hero" style={{ background: "linear-gradient(135deg, #d97706 0%, #78350f 100%)" }}>
        <div>
          <span className="eyebrow">Municipalidad de Trujillo — Módulo de Atención y Caja</span>
          <h1>
            {seccion === "nueva-solicitud" && "➕ Registro Presencial de Solicitud"}
            {seccion === "consulta-expedientes" && "🔍 Consulta de Estado de Trámites"}
            {seccion === "historial" && "🧾 Historial de Pagos y Comprobantes"}
          </h1>
          <p>
            Recepción de solicitudes presenciales, verificación documental, cobro del derecho de trámite (S/ 3.00), emisión de boleta de caja y derivación al Inspector.
          </p>
        </div>

        <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
          {seccion !== "nueva-solicitud" && (
            <button
              type="button"
              onClick={() => {
                if (cambiarSeccion) cambiarSeccion("nueva-solicitud");
                else setMostrarModalNuevaSolicitud(true);
              }}
              style={{
                background: "#16a34a",
                color: "white",
                border: "none",
                padding: "10px 16px",
                borderRadius: "8px",
                fontWeight: "bold",
                cursor: "pointer",
                fontSize: "14px",
                boxShadow: "0 2px 4px rgba(0,0,0,0.15)"
              }}
            >
              ➕ Registrar Nueva Solicitud
            </button>
          )}

          <button type="button" className="btn-outline-light" onClick={cargarSolicitudes}>
            {cargando ? "Actualizando..." : "🔄 Actualizar"}
          </button>
        </div>
      </div>

      {/* VISTA 1: NUEVA SOLICITUD PRESENCIAL (WIZARD DE PASO ÚNICO ACTIVO ESTILO STRIPE / GOOGLE FORMS) */}
      {seccion === "nueva-solicitud" && (
        <section className="section-card" style={{ padding: "28px", maxWidth: "820px", margin: "0 auto" }}>
          {resultadoRegistroExitoso ? (
            /* PANTALLA DE ÉXITO FINAL TRAS REGISTRAR LA SOLICITUD */
            <div style={{ background: "#ffffff", padding: "32px", borderRadius: "16px", border: "1.5px solid #bbf7d0", textAlign: "center", boxShadow: "0 8px 24px rgba(22, 163, 74, 0.12)" }}>
              <div style={{ fontSize: "60px", marginBottom: "12px" }}>✅</div>
              <h2 style={{ color: "#166534", margin: "0 0 8px", fontSize: "24px", fontWeight: "800" }}>¡Solicitud Registrada Correctamente!</h2>
              <p style={{ color: "#15803d", fontSize: "15px", margin: "0 0 24px" }}>
                El expediente fue cobrado y derivado oficialmente para la visita de inspección técnica.
              </p>

              <div style={{ background: "#f8fafc", padding: "20px 24px", borderRadius: "12px", border: "1px solid #e2e8f0", textAlign: "left", display: "grid", gap: "10px", marginBottom: "24px" }}>
                <p style={{ margin: 0, fontSize: "14.5px", color: "#0f172a" }}>
                  <strong>Código de Expediente:</strong> <span style={{ color: "#2563eb", fontWeight: "800", fontSize: "16px" }}>EXP-{resultadoRegistroExitoso.id}</span>
                </p>
                <p style={{ margin: 0, fontSize: "14px", color: "#0f172a" }}>
                  <strong>Código de Operación / Boleta:</strong> {resultadoRegistroExitoso.codComprobante}
                </p>
                <p style={{ margin: 0, fontSize: "14px", color: "#0f172a" }}>
                  <strong>Solicitante:</strong> {resultadoRegistroExitoso.nombreSolicitante}
                </p>
                <p style={{ margin: 0, fontSize: "14px", color: "#0f172a" }}>
                  <strong>Establecimiento Comercial:</strong> {resultadoRegistroExitoso.nombreNegocio}
                </p>
                <p style={{ margin: 0, fontSize: "14px", color: "#0f172a" }}>
                  <strong>Inspector Asignado:</strong> {resultadoRegistroExitoso.inspectorNombre}
                </p>
                <p style={{ margin: 0, fontSize: "14px", color: "#0f172a" }}>
                  <strong>Fecha y Hora de Inspección:</strong> {resultadoRegistroExitoso.fechaInspeccion} ({resultadoRegistroExitoso.slotInspeccion})
                </p>
              </div>

              <div style={{ display: "flex", justifyContent: "center", gap: "14px", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={imprimirComprobante}
                  style={{ padding: "12px 24px", background: "#0f766e", color: "white", border: "none", borderRadius: "10px", fontWeight: "bold", fontSize: "14.5px", cursor: "pointer", boxShadow: "0 2px 6px rgba(15,118,110,0.2)" }}
                >
                  🖨️ Imprimir Boleta
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDniForm("");
                    setNombresForm("");
                    setApellidosForm("");
                    setCorreoForm("");
                    setTelefonoForm("");
                    setRucForm("");
                    setNombreNegocioForm("");
                    setRazonSocialForm("");
                    setDireccionForm("");
                    setArchivosPresenciales([]);
                    setInspectorElegido(null);
                    setDniValidado(false);
                    setRucValidado(false);
                    setPasoActual(1);
                    setPagoConfirmadoLocal(false);
                    setResultadoRegistroExitoso(null);
                  }}
                  style={{ padding: "12px 24px", background: "#16a34a", color: "white", border: "none", borderRadius: "10px", fontWeight: "bold", fontSize: "14.5px", cursor: "pointer", boxShadow: "0 2px 6px rgba(22,163,74,0.2)" }}
                >
                  ➕ Registrar Nueva Solicitud
                </button>
              </div>
            </div>
          ) : (
            /* WIZARD DE PASO ÚNICO ACTIVO */
            <div>
              {/* BARRA DE PROGRESO DEL PASO ACTIVO */}
              <div style={{ background: "#ffffff", padding: "20px 24px", borderRadius: "16px", border: "1px solid #e2e8f0", marginBottom: "24px", boxShadow: "0 2px 8px rgba(0,0,0,0.03)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                  <span style={{ fontSize: "11.5px", fontWeight: "800", color: "#2563eb", textTransform: "uppercase", letterSpacing: "1px" }}>
                    Registro Presencial de Licencia Municipal
                  </span>
                  <span style={{ background: "#f0fdf4", color: "#166534", padding: "4px 14px", borderRadius: "20px", fontSize: "12.5px", fontWeight: "800", border: "1px solid #bbf7d0" }}>
                    Paso {pasoActual} de 7 ({porcentajeProgreso}%)
                  </span>
                </div>

                <h3 style={{ margin: "4px 0 12px", color: "#0f172a", fontSize: "20px", fontWeight: "800" }}>
                  {pasoActual === 1 && "Paso 1: Validación de Identidad RENIEC"}
                  {pasoActual === 2 && "Paso 2: Datos de Contacto del Solicitante"}
                  {pasoActual === 3 && "Paso 3: Validación de Establecimiento SUNAT"}
                  {pasoActual === 4 && "Paso 4: Carga del Plano del Local (PDF)"}
                  {pasoActual === 5 && "Paso 5: Pago de Tasa Municipal"}
                  {pasoActual === 6 && "Paso 6: Programación de Inspección Técnica"}
                  {pasoActual === 7 && "Paso 7: Resumen y Confirmación Final"}
                </h3>

                <div style={{ height: "10px", width: "100%", background: "#f1f5f9", borderRadius: "5px", overflow: "hidden", border: "1px solid #e2e8f0" }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${(pasoActual / 7) * 100}%`,
                      background: "linear-gradient(90deg, #2563eb, #16a34a)",
                      transition: "width 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
                      borderRadius: "5px"
                    }}
                  />
                </div>
              </div>

              {/* CONTENIDO DEL PASO ACTIVO */}
              <div style={{ minHeight: "340px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                {/* PASO 1: RENIEC */}
                {pasoActual === 1 && (
                  <div style={{ background: "#ffffff", padding: "24px", borderRadius: "16px", border: "1px solid #cbd5e1", boxShadow: "0 2px 8px rgba(0,0,0,0.03)" }}>
                    <h4 style={{ margin: "0 0 16px", color: "#0f172a", fontSize: "16px", fontWeight: "700" }}>🪪 Ingrese el DNI del Solicitante</h4>
                    <div style={{ display: "flex", gap: "10px", marginBottom: "16px" }}>
                      <input
                        type="text"
                        maxLength={8}
                        placeholder="Ingrese DNI (8 dígitos)"
                        value={dniForm}
                        onChange={(e) => {
                          setDniForm(e.target.value.replace(/\D/g, "").slice(0, 8));
                          setDniValidado(false);
                          setNombresForm("");
                          setApellidosForm("");
                        }}
                        style={{ flex: 1, padding: "12px 16px", borderRadius: "10px", border: "1.5px solid #cbd5e1", fontSize: "15px", fontWeight: "700" }}
                      />
                      <button
                        type="button"
                        onClick={manejarConsultarDniPresencial}
                        disabled={consultandoDni}
                        style={{ padding: "12px 20px", background: dniValidado ? "#16a34a" : "#2563eb", color: "white", border: "none", borderRadius: "10px", fontSize: "14px", fontWeight: "bold", cursor: "pointer" }}
                      >
                        {consultandoDni ? "Buscando en RENIEC..." : dniValidado ? "✓ Validado" : "Consultar RENIEC"}
                      </button>
                    </div>

                    {dniValidado && (
                      <div style={{ background: "#f0fdf4", border: "1.5px solid #bbf7d0", padding: "20px", borderRadius: "14px", marginTop: "16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", color: "#166534", fontSize: "15px", fontWeight: "bold", marginBottom: "12px" }}>
                          <span>✅</span> Identidad Verificada en RENIEC
                        </div>
                        <div style={{ background: "white", padding: "14px", borderRadius: "10px", border: "1px solid #cbd5e1", display: "grid", gap: "6px" }}>
                          <p style={{ margin: 0, fontSize: "14.5px", color: "#0f172a" }}><strong>Nombres:</strong> {nombresForm}</p>
                          <p style={{ margin: 0, fontSize: "14.5px", color: "#0f172a" }}><strong>Apellidos:</strong> {apellidosForm}</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* PASO 2: DATOS DE CONTACTO */}
                {pasoActual === 2 && (
                  <div style={{ background: "#ffffff", padding: "24px", borderRadius: "16px", border: "1px solid #cbd5e1", boxShadow: "0 2px 8px rgba(0,0,0,0.03)" }}>
                    <h4 style={{ margin: "0 0 6px", color: "#0f172a", fontSize: "16px", fontWeight: "700" }}>📞 Datos de Contacto del Solicitante</h4>
                    <p style={{ margin: "0 0 20px", color: "#64748b", fontSize: "13.5px" }}>Ingrese el teléfono móvil y correo electrónico para notificaciones del estado del trámite.</p>

                    <div style={{ display: "grid", gap: "16px" }}>
                      <div>
                        <label style={{ display: "block", fontSize: "13px", fontWeight: "700", color: "#334155", marginBottom: "6px" }}>
                          📱 Teléfono Celular (Perú - 9 dígitos que inicie con 9) *
                        </label>
                        <input
                          type="tel"
                          inputMode="numeric"
                          maxLength={9}
                          placeholder="Ej. 987654321"
                          value={telefonoForm}
                          onChange={(e) => {
                            const valorLimpio = e.target.value.replace(/\D/g, "").slice(0, 9);
                            setTelefonoForm(valorLimpio);
                          }}
                          style={{
                            width: "100%",
                            padding: "12px 16px",
                            borderRadius: "10px",
                            border: (telefonoForm && !esTelefonoValido) ? "1.5px solid #dc2626" : "1.5px solid #cbd5e1",
                            fontSize: "14.5px",
                            fontWeight: "700"
                          }}
                        />
                        {telefonoForm && !esTelefonoValido && (
                          <small style={{ color: "#dc2626", fontSize: "11.5px", fontWeight: "bold", display: "block", marginTop: "4px" }}>
                            ⚠️ Debe ser un celular peruano de 9 dígitos que inicie con 9.
                          </small>
                        )}
                      </div>

                      <div>
                        <label style={{ display: "block", fontSize: "13px", fontWeight: "700", color: "#334155", marginBottom: "6px" }}>
                          ✉️ Correo Electrónico de Notificaciones *
                        </label>
                        <input
                          type="email"
                          placeholder="ejemplo@correo.com"
                          value={correoForm}
                          onChange={(e) => setCorreoForm(e.target.value)}
                          style={{
                            width: "100%",
                            padding: "12px 16px",
                            borderRadius: "10px",
                            border: (correoForm && !esCorreoValido) ? "1.5px solid #dc2626" : "1.5px solid #cbd5e1",
                            fontSize: "14.5px"
                          }}
                        />
                        {correoForm && !esCorreoValido && (
                          <small style={{ color: "#dc2626", fontSize: "11.5px", fontWeight: "bold", display: "block", marginTop: "4px" }}>
                            ⚠️ Ingrese un correo electrónico válido.
                          </small>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* PASO 3: SUNAT */}
                {pasoActual === 3 && (
                  <div style={{ background: "#ffffff", padding: "24px", borderRadius: "16px", border: "1px solid #cbd5e1", boxShadow: "0 2px 8px rgba(0,0,0,0.03)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
                      <h4 style={{ margin: 0, color: "#0f172a", fontSize: "16px", fontWeight: "700" }}>🏢 Ingrese el RUC del Establecimiento Comercial</h4>
                      {rucValidado && (
                        <span style={{
                          background: esJurisdiccionTrujillo ? "#dcfce7" : "#fee2e2",
                          color: esJurisdiccionTrujillo ? "#15803d" : "#dc2626",
                          padding: "6px 14px",
                          borderRadius: "20px",
                          fontSize: "12.5px",
                          fontWeight: "800",
                          border: `1.5px solid ${esJurisdiccionTrujillo ? "#bbf7d0" : "#fca5a5"}`
                        }}>
                          {esJurisdiccionTrujillo ? "🟢 Establecimiento dentro de la jurisdicción" : "🔴 Establecimiento fuera de la jurisdicción"}
                        </span>
                      )}
                    </div>

                    <div style={{ display: "flex", gap: "10px", marginBottom: "16px" }}>
                      <input
                        type="text"
                        maxLength={11}
                        placeholder="RUC (11 dígitos)"
                        value={rucForm}
                        onChange={(e) => {
                          setRucForm(e.target.value.replace(/\D/g, "").slice(0, 11));
                          setRucValidado(false);
                          setNombreNegocioForm("");
                          setRazonSocialForm("");
                          setDireccionForm("");
                          setEstadoSunat("");
                          setCondicionSunat("");
                          setDistritoSunat("");
                          setProvinciaSunat("");
                          setDepartamentoSunat("");
                          setActividadEconomicaSunat("");
                          setEsJurisdiccionTrujillo(true);
                        }}
                        style={{ flex: 1, padding: "12px 16px", borderRadius: "10px", border: "1.5px solid #cbd5e1", fontSize: "15px", fontWeight: "700" }}
                      />
                      <button
                        type="button"
                        onClick={manejarConsultarRucPresencial}
                        disabled={consultandoRuc}
                        style={{ padding: "12px 20px", background: rucValidado && esJurisdiccionTrujillo ? "#16a34a" : "#2563eb", color: "white", border: "none", borderRadius: "10px", fontSize: "14px", fontWeight: "bold", cursor: "pointer" }}
                      >
                        {consultandoRuc ? "Buscando en SUNAT..." : rucValidado ? "✓ Validado" : "Consultar SUNAT"}
                      </button>
                    </div>

                    {/* ALERTA DE BLOQUEO POR FUERA DE JURISDICCIÓN */}
                    {rucValidado && !esJurisdiccionTrujillo && (
                      <div style={{ background: "#fef2f2", border: "1.5px solid #fca5a5", color: "#991b1b", padding: "16px 20px", borderRadius: "14px", marginBottom: "16px" }}>
                        <strong style={{ fontSize: "14.5px", display: "block", marginBottom: "4px" }}>
                          ⚠️ Establecimiento fuera de la Jurisdicción Municipal
                        </strong>
                        <p style={{ margin: 0, fontSize: "13.5px", lineHeight: "1.5" }}>
                          Este establecimiento no pertenece a la jurisdicción de la Municipalidad Provincial de Trujillo. Solo es posible registrar solicitudes para establecimientos ubicados en la provincia de Trujillo.
                        </p>
                      </div>
                    )}

                    {/* TARJETA PROFESIONAL DE INFORMACIÓN SUNAT */}
                    {rucValidado && (
                      <div style={{ background: "#f8fafc", border: "1.5px solid #e2e8f0", padding: "20px", borderRadius: "14px", marginTop: "16px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", borderBottom: "1px solid #cbd5e1", paddingBottom: "10px" }}>
                          <h4 style={{ margin: 0, color: "#0f172a", fontSize: "15px", fontWeight: "700" }}>
                            🏢 Información del Contribuyente (SUNAT)
                          </h4>
                          <div style={{ display: "flex", gap: "8px" }}>
                            {(() => {
                              const esActivo = estadoSunat === "ACTIVO";
                              return (
                                <span style={{ background: esActivo ? "#dcfce7" : "#fee2e2", color: esActivo ? "#15803d" : "#dc2626", padding: "3px 10px", borderRadius: "6px", fontSize: "12px", fontWeight: "bold" }}>
                                  {esActivo ? "✓" : "✗"} {estadoSunat}
                                </span>
                              );
                            })()}
                            {(() => {
                              const esHabido = condicionSunat === "HABIDO";
                              return (
                                <span style={{ background: esHabido ? "#dcfce7" : "#fee2e2", color: esHabido ? "#15803d" : "#dc2626", padding: "3px 10px", borderRadius: "6px", fontSize: "12px", fontWeight: "bold" }}>
                                  {esHabido ? "✓" : "✗"} {condicionSunat}
                                </span>
                              );
                            })()}
                          </div>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
                          <p style={{ margin: 0, fontSize: "13.5px", color: "#334155" }}>
                            <strong>Nombre Comercial:</strong> <span style={{ color: "#0f172a", fontWeight: "600" }}>{nombreNegocioForm}</span>
                          </p>
                          <p style={{ margin: 0, fontSize: "13.5px", color: "#334155" }}>
                            <strong>Razón Social:</strong> <span style={{ color: "#0f172a", fontWeight: "600" }}>{razonSocialForm}</span>
                          </p>
                          <p style={{ margin: 0, fontSize: "13.5px", color: "#334155" }}>
                            <strong>RUC:</strong> <span style={{ color: "#0f172a", fontWeight: "600" }}>{rucForm}</span>
                          </p>
                          <p style={{ margin: 0, fontSize: "13.5px", color: "#334155" }}>
                            <strong>Actividad Económica:</strong> <span style={{ color: "#0f172a", fontWeight: "600" }}>{actividadEconomicaSunat || reqsDocInfo.giroLabel}</span>
                          </p>
                          <p style={{ margin: 0, fontSize: "13.5px", color: "#334155" }}>
                            <strong>Estado del Contribuyente:</strong> <span style={{ color: estadoSunat === "ACTIVO" ? "#15803d" : "#dc2626", fontWeight: "700" }}>{estadoSunat || "---"}</span>
                          </p>
                          <p style={{ margin: 0, fontSize: "13.5px", color: "#334155" }}>
                            <strong>Condición del Contribuyente:</strong> <span style={{ color: condicionSunat === "HABIDO" ? "#15803d" : "#dc2626", fontWeight: "700" }}>{condicionSunat || "---"}</span>
                          </p>
                        </div>

                        {/* SECCIÓN ESPECÍFICA: UBICACIÓN DEL ESTABLECIMIENTO */}
                        <div style={{ background: "white", padding: "16px 20px", borderRadius: "12px", border: "1px solid #cbd5e1" }}>
                          <h5 style={{ margin: "0 0 10px", color: "#1e293b", fontSize: "14px", fontWeight: "700", display: "flex", alignItems: "center", gap: "6px" }}>
                            📍 Ubicación del Establecimiento
                          </h5>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                            <p style={{ margin: 0, fontSize: "13px", color: "#334155", gridColumn: "span 2" }}>
                              <strong>📍 Dirección Fiscal:</strong> {direccionForm}
                            </p>
                            <p style={{ margin: 0, fontSize: "13px", color: "#334155" }}>
                              <strong>📍 Distrito:</strong> {distritoSunat}
                            </p>
                            <p style={{ margin: 0, fontSize: "13px", color: "#334155" }}>
                              <strong>📍 Provincia:</strong> {provinciaSunat}
                            </p>
                            <p style={{ margin: 0, fontSize: "13px", color: "#334155" }}>
                              <strong>📍 Departamento:</strong> {departamentoSunat}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ALERTA DE RECHAZO POR ESTADO/CONDICIÓN SUNAT NO VÁLIDA - PASO 3 */}
                    {rucValidado && !sunatPermiteContinuar && (
                      <div style={{ background: "#fef2f2", border: "1.5px solid #dc2626", color: "#991b1b", padding: "16px 20px", borderRadius: "14px", marginTop: "16px" }}>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                          <span style={{ fontSize: "20px", lineHeight: "1" }}>🚫</span>
                          <div>
                            <strong style={{ fontSize: "14px", display: "block", marginBottom: "4px" }}>
                              Establecimiento NO puede continuar con el trámite
                            </strong>
                            <p style={{ margin: "0 0 8px", fontSize: "13px", lineHeight: "1.5" }}>
                              SUNAT ha registrado una condición que impide el inicio de este procedimiento administrativo:
                            </p>
                            <ul style={{ margin: "0 0 8px", paddingLeft: "20px", fontSize: "12.5px", lineHeight: "1.6" }}>
                              {estadoSunat !== "ACTIVO" && (
                                <li><strong>Estado del Contribuyente:</strong> <span style={{ color: "#dc2626", fontWeight: "700" }}>{estadoSunat}</span> — Se requiere <span style={{ fontWeight: "700" }}>ACTIVO</span></li>
                              )}
                              {condicionSunat !== "HABIDO" && (
                                <li><strong>Condición del Contribuyente:</strong> <span style={{ color: "#dc2626", fontWeight: "700" }}>{condicionSunat}</span> — Se requiere <span style={{ fontWeight: "700" }}>HABIDO</span></li>
                              )}
                            </ul>
                            <p style={{ margin: 0, fontSize: "12px", color: "#991b1b", fontStyle: "italic" }}>
                              El contribuyente debe regularizar su situación ante SUNAT antes de iniciar cualquier trámite municipal.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* PASO 4: PLANO PDF */}
                {pasoActual === 4 && (
                  <div style={{ background: "#ffffff", padding: "24px", borderRadius: "16px", border: "1px solid #cbd5e1", boxShadow: "0 2px 8px rgba(0,0,0,0.03)" }}>
                    <h4 style={{ margin: "0 0 6px", color: "#0f172a", fontSize: "16px", fontWeight: "700" }}>📄 Carga del Plano del Local (PDF Obligatorio)</h4>
                    <p style={{ margin: "0 0 20px", color: "#64748b", fontSize: "13.5px" }}>Adjunte el archivo PDF correspondiente al plano arquitectónico y distribución del local.</p>

                    <div style={{ border: "2px dashed #3b82f6", background: "#f8fafc", padding: "32px 20px", borderRadius: "16px", textAlign: "center" }}>
                      <div style={{ fontSize: "48px", marginBottom: "8px" }}>📄</div>
                      <strong style={{ fontSize: "15px", color: "#0f172a", display: "block", marginBottom: "4px" }}>Plano Arquitectónico y de Distribución del Local (PDF) *</strong>
                      <p style={{ fontSize: "13px", color: "#64748b", margin: "0 0 16px" }}>Seleccione el archivo PDF desde su computadora</p>

                      <input
                        type="file"
                        accept=".pdf,application/pdf"
                        onChange={(e) => manejarArchivoPresencial(e, "plano_local", "Plano Arquitectónico y de Distribución del Local (PDF)")}
                        style={{ fontSize: "13.5px", fontWeight: "bold" }}
                      />
                    </div>

                    {archivosPresenciales.length > 0 && (
                      <div style={{ background: "#dcfce7", border: "1.5px solid #86efac", padding: "14px 20px", borderRadius: "12px", marginTop: "16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <strong style={{ color: "#166534", fontSize: "14.5px" }}>✓ Archivo cargado correctamente</strong>
                          <span style={{ display: "block", fontSize: "13px", color: "#15803d", marginTop: "2px" }}>📄 {archivosPresenciales[0]?.archivoNombre}</span>
                        </div>
                        <span style={{ fontSize: "24px" }}>✅</span>
                      </div>
                    )}
                  </div>
                )}

                {/* PASO 5: PAGO TASA */}
                {pasoActual === 5 && (
                  <div style={{ background: "#ffffff", padding: "24px", borderRadius: "16px", border: "1px solid #cbd5e1", boxShadow: "0 2px 8px rgba(0,0,0,0.03)" }}>
                    <h4 style={{ margin: "0 0 16px", color: "#0f172a", fontSize: "16px", fontWeight: "700" }}>💳 Pago de Tasa Municipal y Generación de Boleta</h4>

                    <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "14px", padding: "24px", marginBottom: "20px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                        <div>
                          <span style={{ fontSize: "12px", color: "#64748b", fontWeight: "bold", textTransform: "uppercase" }}>Derecho de Trámite Licencia Municipal</span>
                          <h3 style={{ margin: "2px 0 0", color: "#16a34a", fontSize: "32px", fontWeight: "800" }}>S/ {MONTO_TRAMITE.toFixed(2)}</h3>
                        </div>
                        <div style={{ textAlign: "right", background: "#ffffff", padding: "10px 16px", borderRadius: "10px", border: "1px solid #cbd5e1" }}>
                          <small style={{ color: "#64748b", fontWeight: "bold", display: "block", fontSize: "11px" }}>COMPROBANTE A EMITIR</small>
                          <strong style={{ color: "#0f172a", fontSize: "14px" }}>Boleta N° BOL-CAJA-2026-AUTO</strong>
                        </div>
                      </div>

                      <div>
                        <label style={{ display: "block", fontSize: "13px", fontWeight: "700", color: "#334155", marginBottom: "8px" }}>Seleccione Método de Pago *</label>
                        <select
                          value={metodoPagoSeleccionado}
                          onChange={(e) => setMetodoPagoSeleccionado(e.target.value)}
                          style={{ width: "100%", padding: "12px 16px", borderRadius: "10px", border: "1.5px solid #cbd5e1", fontSize: "14.5px", fontWeight: "700" }}
                        >
                          <option value="Efectivo en Caja Municipal">💵 Efectivo en Caja Municipal</option>
                          <option value="Tarjeta (Pago Digital)">💳 Tarjeta (Pago Digital)</option>
                        </select>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setPagoConfirmadoLocal(true)}
                      style={{
                        width: "100%",
                        padding: "14px",
                        background: pagoConfirmadoLocal ? "#16a34a" : "#2563eb",
                        color: "white",
                        border: "none",
                        borderRadius: "12px",
                        fontSize: "15px",
                        fontWeight: "bold",
                        cursor: "pointer",
                        boxShadow: "0 4px 10px rgba(37,99,235,0.2)"
                      }}
                    >
                      {pagoConfirmadoLocal ? "✅ Pago Registrado Correctamente" : "Confirmar Pago (S/ 3.00)"}
                    </button>
                  </div>
                )}

                {/* PASO 6: INSPECCIÓN */}
                {pasoActual === 6 && (
                  <div style={{ background: "#ffffff", padding: "24px", borderRadius: "16px", border: "1.5px solid #cbd5e1", boxShadow: "0 2px 8px rgba(0,0,0,0.03)" }}>
                    <h4 style={{ margin: "0 0 16px", color: "#0f172a", fontSize: "16px", fontWeight: "700" }}>📅 Programación de Inspección Técnica</h4>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "20px" }}>
                      <div>
                        <label style={{ display: "block", fontSize: "13px", fontWeight: "700", color: "#334155", marginBottom: "6px" }}>
                          📅 Fecha de Inspección (Mínimo a partir de mañana) *
                        </label>
                        <input
                          type="date"
                          min={formatearFechaYYYYMMDD(obtenerFechaMananaObj())}
                          value={
                            fechaInspeccion.includes("/")
                              ? fechaInspeccion.split("/").reverse().join("-")
                              : fechaInspeccion
                          }
                          onChange={(e) => {
                            const valYMD = e.target.value;
                            if (!valYMD) return;
                            const [y, m, d] = valYMD.split("-");
                            setFechaInspeccion(`${d}/${m}/${y}`);
                          }}
                          style={{
                            width: "100%",
                            padding: "12px 16px",
                            borderRadius: "10px",
                            border: !esFechaPermitidaInspeccion(fechaInspeccion) ? "1.5px solid #dc2626" : "1.5px solid #cbd5e1",
                            fontSize: "14.5px",
                            fontWeight: "700",
                            background: "white"
                          }}
                        />
                        {!esFechaPermitidaInspeccion(fechaInspeccion) && (
                          <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", color: "#991b1b", padding: "10px 14px", borderRadius: "10px", marginTop: "8px", fontSize: "12.5px" }}>
                            ⚠️ <strong>Fecha no permitida:</strong> Las inspecciones deben programarse con al menos un día de anticipación. Seleccione una fecha a partir de mañana.
                          </div>
                        )}
                      </div>

                      <div>
                        <label style={{ display: "block", fontSize: "13px", fontWeight: "700", color: "#334155", marginBottom: "6px" }}>
                          ⏰ Rango Horario Disponible para Inspector *
                        </label>
                        <select
                          value={slotInspeccion}
                          disabled={!esFechaPermitidaInspeccion(fechaInspeccion)}
                          onChange={(e) => setSlotInspeccion(e.target.value)}
                          style={{ width: "100%", padding: "12px 16px", borderRadius: "10px", border: "1.5px solid #cbd5e1", fontSize: "14.5px", fontWeight: "700" }}
                        >
                          {TIME_SLOTS.map((slot) => {
                            const ocupado = inspectorElegido && esHorarioOcupado(inspectorElegido.uid, fechaInspeccion, slot.value);
                            return (
                              <option key={slot.value} value={slot.value} disabled={ocupado}>
                                {slot.label} {ocupado ? "❌ Ocupado" : "✅ Disponible"}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "13px", fontWeight: "700", color: "#334155", marginBottom: "10px" }}>
                        👷‍♂️ Inspector Municipal Asignado (Máx 4 por día)
                      </label>
                      {inspectorElegido ? (() => {
                        const cupos = obtenerConteoInspectorEnFecha(inspectorElegido.uid, fechaInspeccion);
                        const estaLleno = cupos >= 4;
                        return (
                          <div style={{
                            padding: "16px 20px", borderRadius: "12px",
                            border: estaLleno ? "2px solid #fca5a5" : "2px solid #16a34a",
                            background: estaLleno ? "#fef2f2" : "#f0fdf4",
                            boxShadow: estaLleno ? "none" : "0 2px 8px rgba(22, 163, 74, 0.12)"
                          }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                              <div>
                                <strong style={{ color: estaLleno ? "#991b1b" : "#166534", fontSize: "15px" }}>
                                  {inspectorElegido.nombre}
                                </strong>
                                <span style={{ display: "block", fontSize: "12.5px", color: "#64748b", marginTop: "2px" }}>
                                  {inspectorElegido.cargo}
                                </span>
                              </div>
                              <span style={{
                                padding: "5px 14px", borderRadius: "20px", fontSize: "12.5px", fontWeight: "800",
                                background: estaLleno ? "#fee2e2" : "#dcfce7",
                                color: estaLleno ? "#dc2626" : "#15803d",
                                border: `1.5px solid ${estaLleno ? "#fca5a5" : "#bbf7d0"}`
                              }}>
                                {estaLleno ? "🔴 No disponible" : "🟢 Disponible"}
                              </span>
                            </div>
                            <span style={{ fontSize: "13px", color: estaLleno ? "#991b1b" : "#15803d", fontWeight: "600" }}>
                              Inspecciones programadas: {cupos}/4
                            </span>
                          </div>
                        );
                      })() : (
                        <div style={{
                          padding: "16px 20px", borderRadius: "12px", border: "1.5px solid #fca5a5",
                          background: "#fef2f2", textAlign: "center"
                        }}>
                          <span style={{ color: "#991b1b", fontWeight: "700", fontSize: "14px" }}>
                            ⚠️ No hay inspectores disponibles para esta fecha. Seleccione otra fecha.
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* PASO 7: RESUMEN Y FINALIZAR */}
                {pasoActual === 7 && (
                  <div style={{ background: "#ffffff", padding: "24px", borderRadius: "16px", border: "1px solid #cbd5e1", boxShadow: "0 2px 8px rgba(0,0,0,0.03)" }}>
                    <h4 style={{ margin: "0 0 16px", color: "#0f172a", fontSize: "16px", fontWeight: "700" }}>🚀 Resumen General del Expediente Presencial</h4>

                    <div style={{ background: "#f8fafc", padding: "20px", borderRadius: "14px", border: "1px solid #e2e8f0", display: "grid", gap: "12px", marginBottom: "24px" }}>
                      <p style={{ margin: 0, fontSize: "14px", color: "#0f172a" }}><strong>Solicitante:</strong> {nombresForm} {apellidosForm} (DNI: {dniForm})</p>
                      <p style={{ margin: 0, fontSize: "14px", color: "#0f172a" }}><strong>Contacto:</strong> Cel. {telefonoForm} | {correoForm}</p>
                      <p style={{ margin: 0, fontSize: "14px", color: "#0f172a" }}><strong>Establecimiento:</strong> {nombreNegocioForm} (RUC: {rucForm})</p>
                      <p style={{ margin: 0, fontSize: "14px", color: "#0f172a" }}><strong>Dirección Fiscal:</strong> {direccionForm}</p>
                      <p style={{ margin: 0, fontSize: "14px", color: "#0f172a" }}><strong>Derecho de Trámite:</strong> S/ {MONTO_TRAMITE.toFixed(2)} ({metodoPagoSeleccionado})</p>
                      <p style={{ margin: 0, fontSize: "14px", color: "#0f172a" }}><strong>Plano Adjunto:</strong> {archivosPresenciales[0]?.archivoNombre || "Plano_Local.pdf"}</p>
                      <p style={{ margin: 0, fontSize: "14px", color: "#0f172a" }}><strong>Inspección:</strong> {inspectorElegido?.nombre} el {fechaInspeccion} ({slotInspeccion})</p>
                    </div>

                    <button
                      type="button"
                      onClick={ejecutarRegistroPresencialCompleto}
                      disabled={procesando}
                      style={{
                        width: "100%",
                        padding: "16px",
                        background: "linear-gradient(90deg, #16a34a, #059669)",
                        color: "white",
                        border: "none",
                        borderRadius: "14px",
                        fontSize: "16.5px",
                        fontWeight: "800",
                        cursor: "pointer",
                        boxShadow: "0 4px 14px rgba(22, 163, 74, 0.3)"
                      }}
                    >
                      {procesando ? "Procesando Registro Presencial..." : "🚀 Registrar Solicitud"}
                    </button>
                  </div>
                )}

                {/* BOTONES NAVEGACIÓN ANTERIOR / CONTINUAR */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "24px", paddingTop: "16px", borderTop: "1px solid #e2e8f0" }}>
                  {pasoActual > 1 ? (
                    <button
                      type="button"
                      onClick={() => setPasoActual((prev) => Math.max(1, prev - 1))}
                      style={{ padding: "12px 24px", background: "#f1f5f9", color: "#475569", border: "1px solid #cbd5e1", borderRadius: "10px", fontWeight: "bold", fontSize: "14px", cursor: "pointer" }}
                    >
                      ← Anterior
                    </button>
                  ) : (
                    <div />
                  )}

                  {pasoActual < 7 && (
                    <button
                      type="button"
                      onClick={() => {
                        if (pasoActual === 1 && !paso1Completado) {
                          alert("⚠️ Debe validar el DNI en RENIEC para continuar.");
                          return;
                        }
                        if (pasoActual === 2 && !paso2Completado) {
                          alert("⚠️ Ingrese un teléfono celular peruano válido (9 dígitos iniciado en 9) y un correo electrónico.");
                          return;
                        }
                        if (pasoActual === 3) {
                          if (!rucValidado) {
                            alert("⚠️ Debe consultar y validar el RUC en SUNAT para continuar.");
                            return;
                          }
                          if (!esJurisdiccionTrujillo) {
                            alert("Este establecimiento no pertenece a la jurisdicción de la Municipalidad Provincial de Trujillo. Solo es posible registrar solicitudes para establecimientos ubicados en la provincia de Trujillo.");
                            return;
                          }
                          if (!sunatPermiteContinuar) {
                            alert(`🚫 No es posible continuar con el trámite.\n\nEl contribuyente tiene:\n• Estado: ${estadoSunat} (se requiere ACTIVO)\n• Condición: ${condicionSunat} (se requiere HABIDO)\n\nEl contribuyente debe regularizar su situación ante SUNAT.`);
                            return;
                          }
                        }
                        if (pasoActual === 4 && !paso4Completado) {
                          alert("⚠️ Debe adjuntar el archivo PDF del Plano del Local.");
                          return;
                        }
                        if (pasoActual === 5 && !paso5Completado) {
                          alert("⚠️ Debe seleccionar el método de pago y confirmar.");
                          return;
                        }
                        if (pasoActual === 6) {
                          if (!esFechaPermitidaInspeccion(fechaInspeccion)) {
                            alert("Las inspecciones deben programarse con al menos un día de anticipación. Seleccione una fecha a partir de mañana.");
                            return;
                          }
                          if (!inspectorElegido) {
                            alert("⚠️ Seleccione un inspector municipal para la visita.");
                            return;
                          }
                          const c = obtenerConteoInspectorEnFecha(inspectorElegido.uid, fechaInspeccion);
                          if (c >= 4) {
                            alert(`⚠️ El inspector ${inspectorElegido.nombre} ha alcanzado el límite máximo de 4 inspecciones programadas para el día ${fechaInspeccion}. Seleccione otro inspector.`);
                            return;
                          }
                          if (esHorarioOcupado(inspectorElegido.uid, fechaInspeccion, slotInspeccion)) {
                            alert("⚠️ El horario seleccionado ya está ocupado para este inspector. Seleccione otro horario.");
                            return;
                          }
                        }
                        setPasoActual((prev) => Math.min(7, prev + 1));
                      }}
                      style={{
                        padding: "12px 28px",
                        background:
                          (pasoActual === 1 && paso1Completado) ||
                          (pasoActual === 2 && paso2Completado) ||
                          (pasoActual === 3 && paso3Completado) ||
                          (pasoActual === 4 && paso4Completado) ||
                          (pasoActual === 5 && paso5Completado) ||
                          (pasoActual === 6 && paso6Completado)
                            ? "#2563eb"
                            : "#cbd5e1",
                        color: "white",
                        border: "none",
                        borderRadius: "10px",
                        fontWeight: "bold",
                        fontSize: "14.5px",
                        cursor: "pointer"
                      }}
                    >
                      Continuar →
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* VISTA 2 Y VISTA 3: CONSULTA DE ESTADO E HISTORIAL */}
      {(seccion === "consulta-expedientes" || seccion === "historial") && (
        <section className="section-card">
          <div className="section-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h2>{seccion === "historial" ? "🧾 Historial de Pagos" : "🔍 Consulta y Estado de Trámites"}</h2>
              <p>Busca expedientes por Código (EXP-XXXX), DNI del ciudadano, RUC o Nombre del establecimiento.</p>
            </div>
          </div>

          {/* BARRA DE BÚSQUEDA Y FILTROS */}
          <div style={{ display: "grid", gap: "16px", marginBottom: "20px" }}>
            <div>
              <input
                type="text"
                placeholder="🔍 Buscar por código (Ej. EXP-1002), DNI, RUC o Nombre de Solicitante/Negocio..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                style={{ width: "100%", padding: "12px 18px", borderRadius: "10px", border: "1.5px solid #cbd5e1", fontSize: "14.5px" }}
              />
            </div>

            {seccion === "historial" && (
              <div style={{ display: "flex", gap: "12px", alignItems: "flex-end", flexWrap: "wrap", background: "#f8fafc", padding: "16px", borderRadius: "14px", border: "1px solid #e2e8f0" }}>
                <div>
                  <label style={{ display: "block", fontSize: "12.5px", fontWeight: "700", color: "#334155", marginBottom: "4px" }}>
                    📅 Fecha desde:
                  </label>
                  <input
                    type="date"
                    min="2026-07-14"
                    max={obtenerFechaHoyStr()}
                    value={fechaDesde}
                    onChange={(e) => {
                      const val = e.target.value;
                      const hoyStr = obtenerFechaHoyStr();
                      if (val && val < "2026-07-14") {
                        alert("⚠️ No existen registros anteriores al 14/07/2026.");
                        setErrorFechaRange("No existen registros anteriores al 14/07/2026.");
                        setFechaDesde("2026-07-14");
                        return;
                      }
                      if (val && val > hoyStr) {
                        alert("⚠️ No es posible seleccionar fechas futuras. Seleccione una fecha hasta el día de hoy.");
                        setErrorFechaRange("No es posible seleccionar fechas futuras. Seleccione una fecha hasta el día de hoy.");
                        setFechaDesde(hoyStr);
                        return;
                      }
                      if (val && fechaHasta && val > fechaHasta) {
                        alert("⚠️ La fecha inicial no puede ser mayor que la fecha final.");
                        setErrorFechaRange("La fecha inicial no puede ser mayor que la fecha final.");
                      } else {
                        setErrorFechaRange("");
                      }
                      setFechaDesde(val);
                    }}
                    style={{ padding: "10px 14px", borderRadius: "8px", border: "1.5px solid #cbd5e1", fontSize: "14px", fontWeight: "600", background: "white" }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "12.5px", fontWeight: "700", color: "#334155", marginBottom: "4px" }}>
                    📅 Fecha hasta:
                  </label>
                  <input
                    type="date"
                    min={fechaDesde || "2026-07-14"}
                    max={obtenerFechaHoyStr()}
                    value={fechaHasta}
                    onChange={(e) => {
                      const val = e.target.value;
                      const hoyStr = obtenerFechaHoyStr();
                      if (val && val < "2026-07-14") {
                        alert("⚠️ No existen registros anteriores al 14/07/2026.");
                        setErrorFechaRange("No existen registros anteriores al 14/07/2026.");
                        setFechaHasta("2026-07-14");
                        return;
                      }
                      if (val && val > hoyStr) {
                        alert("⚠️ No es posible seleccionar fechas futuras. Seleccione una fecha hasta el día de hoy.");
                        setErrorFechaRange("No es posible seleccionar fechas futuras. Seleccione una fecha hasta el día de hoy.");
                        setFechaHasta(hoyStr);
                        return;
                      }
                      if (val && fechaDesde && val < fechaDesde) {
                        alert("⚠️ La fecha final no puede ser menor que la fecha inicial.");
                        setErrorFechaRange("La fecha final no puede ser menor que la fecha inicial.");
                        setFechaHasta(fechaDesde);
                        return;
                      }
                      setErrorFechaRange("");
                      setFechaHasta(val);
                    }}
                    style={{ padding: "10px 14px", borderRadius: "8px", border: "1.5px solid #cbd5e1", fontSize: "14px", fontWeight: "600", background: "white" }}
                  />
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const hoyStr = obtenerFechaHoyStr();
                    if (fechaDesde && fechaDesde < "2026-07-14") {
                      alert("⚠️ No existen registros anteriores al 14/07/2026.");
                      setErrorFechaRange("No existen registros anteriores al 14/07/2026.");
                      return;
                    }
                    if (fechaHasta && fechaHasta < "2026-07-14") {
                      alert("⚠️ No existen registros anteriores al 14/07/2026.");
                      setErrorFechaRange("No existen registros anteriores al 14/07/2026.");
                      return;
                    }
                    if ((fechaDesde && fechaDesde > hoyStr) || (fechaHasta && fechaHasta > hoyStr)) {
                      alert("⚠️ No es posible seleccionar fechas futuras. Seleccione una fecha hasta el día de hoy.");
                      setErrorFechaRange("No es posible seleccionar fechas futuras. Seleccione una fecha hasta el día de hoy.");
                      return;
                    }
                    if (fechaDesde && fechaHasta && fechaDesde > fechaHasta) {
                      alert("⚠️ La fecha inicial no puede ser mayor que la fecha final.");
                      setErrorFechaRange("La fecha inicial no puede ser mayor que la fecha final.");
                      return;
                    }
                    setErrorFechaRange("");
                  }}
                  style={{ padding: "10px 20px", background: "#2563eb", color: "white", border: "none", borderRadius: "8px", fontWeight: "bold", fontSize: "14px", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}
                >
                  🔎 Buscar
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setBusqueda("");
                    setFechaDesde("");
                    setFechaHasta("");
                    setErrorFechaRange("");
                  }}
                  style={{ padding: "10px 20px", background: "#f1f5f9", color: "#475569", border: "1px solid #cbd5e1", borderRadius: "8px", fontWeight: "bold", fontSize: "14px", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}
                >
                  🧹 Limpiar filtros
                </button>
              </div>
            )}

            {errorFechaRange && (
              <div style={{ background: "#fef2f2", color: "#991b1b", border: "1px solid #fca5a5", padding: "10px 14px", borderRadius: "8px", fontSize: "13px", fontWeight: "600" }}>
                ⚠️ {errorFechaRange}
              </div>
            )}
          </div>

        {solicitudesFiltradas.length === 0 ? (
          <div className="empty-state">
            <div style={{ fontSize: "36px", marginBottom: "10px" }}>💳</div>
            <h3>No se encontraron solicitudes</h3>
            <p>Ajusta el filtro o el término de búsqueda para localizar expedientes.</p>
          </div>
        ) : (
          <div className="tabla-container">
            <table className="modern-table">
              <thead>
                <tr>
                  <th>Expediente</th>
                  <th>Ciudadano / DNI</th>
                  <th>Establecimiento</th>
                  <th>Trámite / Derecho</th>
                  <th>Estado Pago</th>
                  <th>Acciones de Caja</th>
                </tr>
              </thead>
              <tbody>
                {solicitudesFiltradas.map((s) => {
                  const nombreCiudadano =
                    [s.nombresSolicitante, s.apellidosSolicitante, s.nombreSolicitante].filter(Boolean).join(" ") ||
                    "Solicitante";
                  const esPagado = s.estadoPago === "Confirmado" || (s.estado || "").toLowerCase().includes("pagado") || (s.estado || "").toLowerCase().includes("inspeccion");

                  return (
                    <tr key={s.id}>
                      <td>
                        <strong>EXP-{s.id}</strong>
                        <small style={{ display: "block", color: "#64748b" }}>{s.fecha || "---"}</small>
                      </td>
                      <td>
                        <strong>{nombreCiudadano}</strong>
                        <small style={{ display: "block", color: "#475569" }}>DNI: {s.dniSolicitante || s.dni || "---"}</small>
                      </td>
                      <td>
                        <strong>{s.nombreNegocio}</strong>
                        <small style={{ display: "block", color: "#64748b" }}>RUC: {s.ruc}</small>
                      </td>
                      <td>
                        <span className="badge info">{s.tipoTramite || "Licencia Comercial"}</span>
                        <strong style={{ display: "block", color: "#0f766e", marginTop: "2px" }}>S/ {MONTO_TRAMITE.toFixed(2)}</strong>
                      </td>
                      <td>
                        <span className={`badge ${esPagado ? "ok" : "warning"}`}>
                          {esPagado ? "Pagado / Confirmado" : "Pendiente de Pago"}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                          <button
                            type="button"
                            className="btn-info"
                            onClick={() => setSolicitudVerDetalle(s)}
                            style={{ background: "#2563eb", color: "white", padding: "6px 12px", borderRadius: "6px", fontSize: "13px" }}
                          >
                            👁 Verificar Detalle
                          </button>

                          {!esPagado ? (
                            <button
                              type="button"
                              className="btn-ok"
                              onClick={() => {
                                setSolicitudCobro(s);
                                setMetodoPagoSeleccionado("Efectivo en caja");
                              }}
                              style={{ background: "#16a34a", color: "white", padding: "6px 14px", borderRadius: "6px", fontWeight: "700", fontSize: "13px" }}
                            >
                              💰 Registrar Pago
                            </button>
                          ) : (
                            <span style={{ fontSize: "12px", color: "#16a34a", fontWeight: "bold", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                              ✓ Enviado ({s.numeroOperacion || "Boleta emitida"})
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      )}

      {/* MODAL DETALLE COMPLETO Y VERIFICACIÓN INFORMACIÓN */}
      {solicitudVerDetalle && (
        <div className="admin-form-modal" style={{ zIndex: 1000 }}>
          <div className="admin-form-card" style={{ maxWidth: "650px", maxHeight: "88vh", overflowY: "auto" }}>
            <div className="admin-form-header">
              <h3>📋 Verificación de Solicitud — EXP-{solicitudVerDetalle.id}</h3>
              <button type="button" onClick={() => setSolicitudVerDetalle(null)}>✕</button>
            </div>

            <div style={{ padding: "16px 0" }}>
              <div style={{ background: "#f8fafc", padding: "14px", borderRadius: "10px", border: "1px solid #e2e8f0", marginBottom: "16px" }}>
                <h4 style={{ margin: "0 0 8px", color: "#1e293b", fontSize: "14px" }}>👤 Datos del Ciudadano (RENIEC)</h4>
                <p style={{ margin: "4px 0", fontSize: "13.5px" }}>
                  <strong>Nombres y Apellidos:</strong> {[solicitudVerDetalle.nombresSolicitante, solicitudVerDetalle.apellidosSolicitante, solicitudVerDetalle.nombreSolicitante].filter(Boolean).join(" ")}
                </p>
                <p style={{ margin: "4px 0", fontSize: "13.5px" }}>
                  <strong>DNI:</strong> {solicitudVerDetalle.dniSolicitante || solicitudVerDetalle.dni || "---"}
                </p>
                <p style={{ margin: "4px 0", fontSize: "13.5px" }}>
                  <strong>Correo / Teléfono:</strong> {solicitudVerDetalle.correoUsuario || "---"} | {solicitudVerDetalle.telefono || "---"}
                </p>
              </div>

              <div style={{ background: "#f8fafc", padding: "14px", borderRadius: "10px", border: "1px solid #e2e8f0", marginBottom: "16px" }}>
                <h4 style={{ margin: "0 0 8px", color: "#1e293b", fontSize: "14px" }}>🏢 Datos del Establecimiento (SUNAT)</h4>
                <p style={{ margin: "4px 0", fontSize: "13.5px" }}>
                  <strong>Nombre Comercial:</strong> {solicitudVerDetalle.nombreNegocio}
                </p>
                <p style={{ margin: "4px 0", fontSize: "13.5px" }}>
                  <strong>Razón Social:</strong> {solicitudVerDetalle.razonSocial || solicitudVerDetalle.nombreNegocio}
                </p>
                <p style={{ margin: "4px 0", fontSize: "13.5px" }}>
                  <strong>RUC:</strong> {solicitudVerDetalle.ruc}
                </p>
                <p style={{ margin: "4px 0", fontSize: "13.5px" }}>
                  <strong>Giro Comercial:</strong> {solicitudVerDetalle.giro || "General"}
                </p>
                <p style={{ margin: "4px 0", fontSize: "13.5px" }}>
                  <strong>Dirección:</strong> {solicitudVerDetalle.direccion}
                </p>
              </div>

              <div style={{ background: "#f8fafc", padding: "14px", borderRadius: "10px", border: "1px solid #e2e8f0", marginBottom: "16px" }}>
                <h4 style={{ margin: "0 0 8px", color: "#1e293b", fontSize: "14px" }}>📄 Documentación Adjuntada por el Ciudadano</h4>
                {(solicitudVerDetalle.archivosPdf || []).length === 0 ? (
                  <p style={{ color: "#64748b", fontSize: "13px", margin: 0 }}>Sin documentos PDF adjuntos.</p>
                ) : (
                  <div style={{ display: "grid", gap: "8px" }}>
                    {(solicitudVerDetalle.archivosPdf || []).map((pdf, idx) => (
                      <div key={idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "white", borderRadius: "8px", border: "1px solid #cbd5e1" }}>
                        <span style={{ fontSize: "13px", color: "#334155" }}>📄 {pdf.nombre || pdf.archivoNombre || `Documento_${idx + 1}`}</span>
                        <a
                          href="#"
                          onClick={(e) => {
                            e.preventDefault();
                            const url = pdf.archivoUrl || pdf.url || pdf;
                            abrirPdf(url);
                          }}
                          style={{ fontSize: "12.5px", color: "#2563eb", fontWeight: "bold" }}
                        >
                          Ver PDF ↗
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="admin-form-actions">
              <button type="button" onClick={() => setSolicitudVerDetalle(null)}>Cerrar</button>
              {solicitudVerDetalle.estadoPago !== "Confirmado" && (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => {
                    const sol = solicitudVerDetalle;
                    setSolicitudVerDetalle(null);
                    setSolicitudCobro(sol);
                    setMetodoPagoSeleccionado("Efectivo en caja");
                  }}
                  style={{ background: "#16a34a", color: "white" }}
                >
                  💰 Proceder al Cobro (S/ 3.00)
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL PROCESAR PAGO EN CAJA MUNICIPAL */}
      {solicitudCobro && (
        <div className="admin-form-modal" style={{ zIndex: 1000 }}>
          <div className="admin-form-card" style={{ maxWidth: "520px" }}>
            <div className="admin-form-header">
              <h3>💳 Registrar Pago de Trámite — EXP-{solicitudCobro.id}</h3>
              <button type="button" onClick={() => setSolicitudCobro(null)}>✕</button>
            </div>

            <div style={{ padding: "16px 0" }}>
              <div style={{ background: "#f8fafc", padding: "14px", borderRadius: "10px", border: "1px solid #e2e8f0", marginBottom: "16px" }}>
                <p style={{ margin: "0 0 6px", fontSize: "13.5px", color: "#334155" }}>
                  <strong>Ciudadano:</strong> {[solicitudCobro.nombresSolicitante, solicitudCobro.apellidosSolicitante, solicitudCobro.nombreSolicitante].filter(Boolean).join(" ")}
                </p>
                <p style={{ margin: "0 0 6px", fontSize: "13.5px", color: "#334155" }}>
                  <strong>DNI:</strong> {solicitudCobro.dniSolicitante || solicitudCobro.dni || "---"}
                </p>
                <p style={{ margin: "0 0 6px", fontSize: "13.5px", color: "#334155" }}>
                  <strong>Negocio:</strong> {solicitudCobro.nombreNegocio} (RUC: {solicitudCobro.ruc})
                </p>
                <p style={{ margin: "0 0 6px", fontSize: "13.5px", color: "#334155" }}>
                  <strong>Cajera Responsable:</strong> {usuario?.nombre || usuario?.email || "Cajera Municipal"}
                </p>
                <div style={{ marginTop: "10px", paddingTop: "10px", borderTop: "1px solid #cbd5e1", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: "bold", fontSize: "15px", color: "#0f172a" }}>Derecho de Trámite:</span>
                  <span style={{ fontSize: "20px", fontWeight: "800", color: "#16a34a" }}>S/ {MONTO_TRAMITE.toFixed(2)}</span>
                </div>
              </div>

              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", fontSize: "13px", fontWeight: "bold", color: "#334155", marginBottom: "6px" }}>
                  1. Método de Pago *
                </label>
                <select
                  value={metodoPagoSeleccionado}
                  onChange={(e) => setMetodoPagoSeleccionado(e.target.value)}
                  style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "14px" }}
                >
                  <option value="Efectivo en Caja Municipal">💵 Efectivo en Caja Municipal</option>
                  <option value="Tarjeta (Pago Digital)">💳 Tarjeta (Pago Digital)</option>
                </select>
              </div>

              {/* SECCIÓN PROGRAMACIÓN DE INSPECCIÓN */}
              <div style={{ background: "#f0fdf4", padding: "14px", borderRadius: "10px", border: "1px solid #bbf7d0", marginBottom: "16px" }}>
                <h4 style={{ margin: "0 0 10px", color: "#166534", fontSize: "14px", display: "flex", alignItems: "center", gap: "6px" }}>
                  📅 Programar Inspección Técnica Oficial
                </h4>

                <div style={{ marginBottom: "12px" }}>
                  <label style={{ display: "block", fontSize: "12.5px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>
                    Fecha de la Inspección (Mínimo mañana) *
                  </label>
                  <input
                    type="date"
                    min={formatearFechaYYYYMMDD(obtenerFechaMananaObj())}
                    value={
                      fechaInspeccion.includes("/")
                        ? fechaInspeccion.split("/").reverse().join("-")
                        : fechaInspeccion
                    }
                    onChange={(e) => {
                      const valYMD = e.target.value;
                      if (!valYMD) return;
                      const [y, m, d] = valYMD.split("-");
                      setFechaInspeccion(`${d}/${m}/${y}`);
                    }}
                    style={{
                      width: "100%", padding: "8px 12px", borderRadius: "8px",
                      border: fechaInspeccion && !esFechaPermitidaInspeccion(fechaInspeccion) ? "1.5px solid #dc2626" : "1px solid #cbd5e1",
                      fontSize: "13.5px", fontWeight: "bold"
                    }}
                  />
                  {fechaInspeccion && !esFechaPermitidaInspeccion(fechaInspeccion) && (
                    <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", color: "#991b1b", padding: "8px 12px", borderRadius: "8px", marginTop: "6px", fontSize: "11.5px" }}>
                      ⚠️ {MENSAJE_FECHA_INSPECCION}
                    </div>
                  )}
                </div>

                <div style={{ marginBottom: "12px" }}>
                  <label style={{ display: "block", fontSize: "12.5px", fontWeight: "bold", color: "#334155", marginBottom: "6px" }}>
                    👷 Inspector Municipal Asignado (Máx 4/día)
                  </label>
                  {inspectorElegido ? (() => {
                    const cupos = obtenerConteoInspectorEnFecha(inspectorElegido.uid, fechaInspeccion);
                    const estaLleno = cupos >= 4;
                    return (
                      <div style={{
                        padding: "12px 14px", borderRadius: "10px",
                        border: estaLleno ? "1.5px solid #fca5a5" : "1.5px solid #16a34a",
                        background: estaLleno ? "#fef2f2" : "#f0fdf4",
                      }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div>
                            <strong style={{ color: estaLleno ? "#991b1b" : "#166534", fontSize: "13.5px" }}>{inspectorElegido.nombre}</strong>
                            <span style={{ display: "block", fontSize: "11.5px", color: "#64748b" }}>{inspectorElegido.cargo}</span>
                          </div>
                          <span style={{
                            padding: "3px 10px", borderRadius: "14px", fontSize: "11.5px", fontWeight: "800",
                            background: estaLleno ? "#fee2e2" : "#dcfce7",
                            color: estaLleno ? "#dc2626" : "#15803d",
                          }}>
                            {estaLleno ? "🔴 No disponible" : "🟢 Disponible"}
                          </span>
                        </div>
                        <span style={{ fontSize: "12px", color: estaLleno ? "#991b1b" : "#15803d", fontWeight: "600", marginTop: "4px", display: "block" }}>
                          Inspecciones: {cupos}/4
                        </span>
                      </div>
                    );
                  })() : (
                    <div style={{ padding: "12px 14px", borderRadius: "10px", border: "1.5px solid #fca5a5", background: "#fef2f2", textAlign: "center" }}>
                      <span style={{ color: "#991b1b", fontWeight: "700", fontSize: "13px" }}>⚠️ No hay inspectores disponibles para esta fecha.</span>
                    </div>
                  )}
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "12.5px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>
                    Rango Horario de Inspección *
                  </label>
                  <select
                    value={slotInspeccion}
                    onChange={(e) => setSlotInspeccion(e.target.value)}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13.5px" }}
                  >
                    {TIME_SLOTS.map((slot) => {
                      const ocupado = inspectorElegido && esHorarioOcupado(inspectorElegido.uid, fechaInspeccion, slot.value);
                      return (
                        <option key={slot.value} value={slot.value} disabled={ocupado}>
                          {slot.label} {ocupado ? " (Ocupado para este inspector)" : ""}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>
            </div>

            <div className="admin-form-actions">
              <button type="button" onClick={() => setSolicitudCobro(null)} disabled={procesando}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={ejecutarCobro}
                disabled={procesando || !inspectorElegido}
                style={{ background: inspectorElegido ? "#16a34a" : "#cbd5e1", color: "white" }}
              >
                {procesando ? "Procesando Cobro y Asignación..." : "✅ Confirmar Pago y Programar Inspección"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BOLETA DE PAGO Y COMPROBANTE GENERADO */}
      {comprobanteGenerado && (
        <div className="admin-form-modal" style={{ zIndex: 1001 }}>
          <div className="admin-form-card" style={{ maxWidth: "500px", textAlign: "center" }}>
            <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "12px", padding: "20px" }}>
              <div style={{ fontSize: "40px", marginBottom: "8px" }}>🧾</div>
              <h3 style={{ color: "#166534", margin: "0 0 4px" }}>¡Pago Confirmado y Derivado!</h3>
              <p style={{ color: "#15803d", fontSize: "14px", margin: "0 0 16px" }}>
                Boleta de Caja N° <strong>{comprobanteGenerado.codComprobante}</strong>
              </p>

              <div style={{ textAlign: "left", background: "white", padding: "14px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px", color: "#334155" }}>
                <p style={{ margin: "4px 0" }}><strong>Expediente:</strong> EXP-{comprobanteGenerado.id}</p>
                <p style={{ margin: "4px 0" }}><strong>Solicitante:</strong> {[comprobanteGenerado.nombresSolicitante, comprobanteGenerado.apellidosSolicitante, comprobanteGenerado.nombreSolicitante].filter(Boolean).join(" ")}</p>
                <p style={{ margin: "4px 0" }}><strong>Establecimiento:</strong> {comprobanteGenerado.nombreNegocio} (RUC: {comprobanteGenerado.ruc})</p>
                <p style={{ margin: "4px 0" }}><strong>Método de Pago:</strong> {comprobanteGenerado.metodoPago}</p>
                <p style={{ margin: "4px 0" }}><strong>Monto Recaudado:</strong> S/ {MONTO_TRAMITE.toFixed(2)}</p>
                <p style={{ margin: "4px 0" }}><strong>Fecha y Hora de Pago:</strong> {comprobanteGenerado.fechaPago}</p>
                <p style={{ margin: "4px 0" }}><strong>Cajera Responsable:</strong> {comprobanteGenerado.cajeraResponsable || comprobanteGenerado.usuarioCajero}</p>
                <p style={{ margin: "8px 0 0", color: "#2563eb", fontWeight: "bold" }}>➔ Derivado oficialmente a Inspección</p>
              </div>

              <div style={{ marginTop: "20px", display: "flex", justifyContent: "center", gap: "10px" }}>
                <button
                  type="button"
                  onClick={imprimirComprobante}
                  style={{ padding: "10px 18px", background: "#0f766e", color: "white", border: "none", borderRadius: "8px", fontWeight: "700", cursor: "pointer" }}
                >
                  🖨️ Imprimir Boleta
                </button>
                <button
                  type="button"
                  onClick={() => setComprobanteGenerado(null)}
                  style={{ padding: "10px 18px", background: "#64748b", color: "white", border: "none", borderRadius: "8px", fontWeight: "700", cursor: "pointer" }}
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* MODAL REGISTRO PRESENCIAL DE NUEVA SOLICITUD POR LA CAJERA */}
      {mostrarModalNuevaSolicitud && (
        <div className="admin-form-modal" style={{ zIndex: 1000 }}>
          <div className="admin-form-card" style={{ maxWidth: "750px", width: "95%", maxHeight: "90vh", overflowY: "auto" }}>
            <div className="admin-form-header" style={{ background: "linear-gradient(135deg, #16a34a 0%, #065f46 100%)" }}>
              <h3>➕ Registro Presencial de Solicitud de Licencia Municipal</h3>
              <button type="button" onClick={() => setMostrarModalNuevaSolicitud(false)}>✕</button>
            </div>

            <form onSubmit={ejecutarRegistroPresencialCompleto} style={{ padding: "20px 0" }}>
              {/* PASO 1: DATOS DEL SOLICITANTE CON VALIDACIÓN RENIEC */}
              <div style={{ background: "#f8fafc", padding: "16px", borderRadius: "10px", border: "1px solid #cbd5e1", marginBottom: "16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                  <h4 style={{ margin: 0, color: "#166534", fontSize: "14.5px" }}>👤 1. Datos del Solicitante (Consulta RENIEC Obligatoria)</h4>
                  <span style={{ background: dniValidado ? "#dcfce7" : "#fef3c7", color: dniValidado ? "#15803d" : "#b45309", padding: "3px 10px", borderRadius: "6px", fontSize: "12px", fontWeight: "bold" }}>
                    {dniValidado ? "✓ RENIEC Validado (Campos Bloqueados)" : "🔒 Consulta RENIEC Requerida"}
                  </span>
                </div>
                
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "10px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>DNI del Titular (Editable) *</label>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <input
                        type="text"
                        maxLength={8}
                        placeholder="DNI (8 dígitos)"
                        value={dniForm}
                        onChange={(e) => {
                          setDniForm(e.target.value);
                          setDniValidado(false);
                          setNombresForm("");
                          setApellidosForm("");
                        }}
                        required
                        style={{ flex: 1, padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13.5px", fontWeight: "bold" }}
                      />
                      <button
                        type="button"
                        onClick={manejarConsultarDniPresencial}
                        disabled={consultandoDni}
                        style={{ padding: "8px 12px", background: dniValidado ? "#16a34a" : "#2563eb", color: "white", border: "none", borderRadius: "8px", fontSize: "12.5px", fontWeight: "bold", cursor: "pointer" }}
                      >
                        {consultandoDni ? "Buscando..." : dniValidado ? "✓ RENIEC" : "🔍 Consultar RENIEC"}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>
                      📱 Teléfono Celular (Editable - 9 dígitos) *
                    </label>
                    <input
                      type="tel"
                      inputMode="numeric"
                      maxLength={9}
                      placeholder="Ej. 987654321"
                      value={telefonoForm}
                      onChange={(e) => {
                        const valorLimpio = e.target.value.replace(/\D/g, "").slice(0, 9);
                        setTelefonoForm(valorLimpio);
                      }}
                      required
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        borderRadius: "8px",
                        border: (telefonoForm && !/^9\d{8}$/.test(telefonoForm)) ? "1px solid #dc2626" : "1px solid #cbd5e1",
                        fontSize: "13.5px",
                        fontWeight: "bold"
                      }}
                    />
                    {telefonoForm && !/^9\d{8}$/.test(telefonoForm) && (
                      <small style={{ color: "#dc2626", fontSize: "11px", fontWeight: "bold", display: "block", marginTop: "2px" }}>
                        ⚠️ Ingrese un celular peruano de 9 dígitos que inicie con 9.
                      </small>
                    )}
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "10px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>🔒 Nombres (Oficial RENIEC - Solo Lectura) *</label>
                    <input
                      type="text"
                      placeholder="🔒 Se autocompleta consultando RENIEC"
                      value={nombresForm}
                      readOnly
                      required
                      onKeyDown={(e) => e.preventDefault()}
                      style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13.5px", background: "#f1f5f9", cursor: "not-allowed", fontWeight: "bold", color: "#1e293b" }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>🔒 Apellidos (Oficial RENIEC - Solo Lectura) *</label>
                    <input
                      type="text"
                      placeholder="🔒 Se autocompleta consultando RENIEC"
                      value={apellidosForm}
                      readOnly
                      required
                      onKeyDown={(e) => e.preventDefault()}
                      style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13.5px", background: "#f1f5f9", cursor: "not-allowed", fontWeight: "bold", color: "#1e293b" }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "12.5px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>Correo Electrónico de Notificaciones (Editable) *</label>
                  <input
                    type="email"
                    placeholder="solicitante@correo.com"
                    value={correoForm}
                    onChange={(e) => setCorreoForm(e.target.value)}
                    required
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13.5px" }}
                  />
                </div>
              </div>

              {/* PASO 2: DATOS DEL NEGOCIO CON VALIDACIÓN SUNAT */}
              <div style={{ background: "#f8fafc", padding: "16px", borderRadius: "10px", border: "1px solid #cbd5e1", marginBottom: "16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                  <h4 style={{ margin: 0, color: "#166534", fontSize: "14.5px" }}>🏢 2. Establecimiento Comercial (Consulta SUNAT Obligatoria)</h4>
                  <span style={{ background: rucValidado ? "#dcfce7" : "#fef3c7", color: rucValidado ? "#15803d" : "#b45309", padding: "3px 10px", borderRadius: "6px", fontSize: "12px", fontWeight: "bold" }}>
                    {rucValidado
                      ? `✓ SUNAT: ${estadoSunat || "?"} / ${condicionSunat || "?"} ${sunatPermiteContinuar ? "(Válido)" : "(NO cumple)"}`
                      : "🔒 Consulta SUNAT Requerida"}
                  </span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "10px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>RUC del Local (Editable - 11 dígitos) *</label>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <input
                        type="text"
                        maxLength={11}
                        placeholder="RUC (11 dígitos)"
                        value={rucForm}
                        onChange={(e) => {
                          setRucForm(e.target.value);
                          setRucValidado(false);
                          setNombreNegocioForm("");
                          setRazonSocialForm("");
                          setDireccionForm("");
                          setEstadoSunat("");
                          setCondicionSunat("");
                        }}
                        required
                        style={{ flex: 1, padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13.5px", fontWeight: "bold" }}
                      />
                      <button
                        type="button"
                        onClick={manejarConsultarRucPresencial}
                        disabled={consultandoRuc}
                        style={{ padding: "8px 12px", background: rucValidado ? "#16a34a" : "#2563eb", color: "white", border: "none", borderRadius: "8px", fontSize: "12.5px", fontWeight: "bold", cursor: "pointer" }}
                      >
                        {consultandoRuc ? "Buscando..." : rucValidado ? "✓ SUNAT" : "🔍 Consultar SUNAT"}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>🔒 Actividad Económica (Oficial SUNAT - Solo Lectura) *</label>
                    <select
                      value={giroForm}
                      disabled
                      style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13.5px", fontWeight: "bold", background: "#f1f5f9", cursor: "not-allowed", color: "#1e293b" }}
                    >
                      {GROS_DISPONIBLES.map((g) => (
                        <option key={g.value} value={g.value}>{g.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "10px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>🔒 Nombre Comercial (Oficial SUNAT - Solo Lectura) *</label>
                    <input
                      type="text"
                      placeholder="🔒 Se autocompleta consultando SUNAT"
                      value={nombreNegocioForm}
                      readOnly
                      required
                      onKeyDown={(e) => e.preventDefault()}
                      style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13.5px", background: "#f1f5f9", cursor: "not-allowed", fontWeight: "bold", color: "#1e293b" }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>🔒 Razón Social (Oficial SUNAT - Solo Lectura)</label>
                    <input
                      type="text"
                      placeholder="🔒 Se autocompleta consultando SUNAT"
                      value={razonSocialForm}
                      readOnly
                      onKeyDown={(e) => e.preventDefault()}
                      style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13.5px", background: "#f1f5f9", cursor: "not-allowed", fontWeight: "bold", color: "#1e293b" }}
                    />
                  </div>
                </div>

                <div style={{ marginBottom: "10px" }}>
                  <label style={{ display: "block", fontSize: "12.5px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>🔒 Dirección Fiscal del Establecimiento (Oficial SUNAT - Solo Lectura) *</label>
                  <input
                    type="text"
                    placeholder="🔒 Se autocompleta consultando SUNAT"
                    value={direccionForm}
                    readOnly
                    required
                    onKeyDown={(e) => e.preventDefault()}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13.5px", background: "#f1f5f9", cursor: "not-allowed", fontWeight: "bold", color: "#1e293b" }}
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>🔒 Estado del Contribuyente (SUNAT)</label>
                    <input
                      type="text"
                      readOnly
                      placeholder="🔒 Se autocompleta consultando SUNAT"
                      value={estadoSunat ? `${estadoSunat === "ACTIVO" ? "✓" : "✗"} ${estadoSunat}` : ""}
                      style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13.5px", background: "#f1f5f9", cursor: "not-allowed", fontWeight: "bold", color: estadoSunat === "ACTIVO" ? "#15803d" : "#dc2626" }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>🔒 Condición del Contribuyente (SUNAT)</label>
                    <input
                      type="text"
                      readOnly
                      placeholder="🔒 Se autocompleta consultando SUNAT"
                      value={condicionSunat ? `${condicionSunat === "HABIDO" ? "✓" : "✗"} ${condicionSunat}` : ""}
                      style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13.5px", background: "#f1f5f9", cursor: "not-allowed", fontWeight: "bold", color: condicionSunat === "HABIDO" ? "#15803d" : "#dc2626" }}
                    />
                  </div>
                </div>
              </div>

              {/* PASO 3: REQUISITOS DOCUMENTALES SEGÚN ACTIVIDAD ECONÓMICA OBTENIDA */}
              <div style={{ background: "#fffbeb", padding: "16px", borderRadius: "10px", border: "1px solid #fde68a", marginBottom: "16px" }}>
                <h4 style={{ margin: "0 0 6px", color: "#b45309", fontSize: "14.5px" }}>
                  📄 3. Documentos Obligatorios para: <u>{obtenerDocumentosPorGiro(giroForm).giroLabel}</u> {rucValidado && "(Cargados automáticamente de SUNAT)"}
                </h4>
                <p style={{ color: "#92400e", fontSize: "12.5px", margin: "0 0 12px" }}>
                  Cargue los archivos adjuntos obligatorios requeridos para esta actividad económica:
                </p>

                <div style={{ display: "grid", gap: "10px" }}>
                  {obtenerDocumentosPorGiro(giroForm).ciudadano.map((docReq) => {
                    const subido = archivosPresenciales.find((a) => a.docId === docReq.id);
                    return (
                      <div key={docReq.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "white", borderRadius: "8px", border: "1px solid #cbd5e1" }}>
                        <div>
                          <strong style={{ fontSize: "13px", color: "#1e293b" }}>{docReq.nombre}</strong>
                          {docReq.obligatorio && <span style={{ color: "#dc2626", fontSize: "12px", marginLeft: "6px" }}>* Obligatorio</span>}
                          {subido && <small style={{ display: "block", color: "#16a34a", fontWeight: "bold" }}>✓ Cargado: {subido.archivoNombre}</small>}
                        </div>

                        <input
                          type="file"
                          accept=".pdf,image/*"
                          onChange={(e) => manejarArchivoPresencial(e, docReq.id, docReq.nombre)}
                          style={{ fontSize: "12px" }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* PASO 4: COBRO Y PROGRAMACIÓN DE INSPECCIÓN */}
              <div style={{ background: "#f0fdf4", padding: "16px", borderRadius: "10px", border: "1px solid #bbf7d0", marginBottom: "16px" }}>
                <h4 style={{ margin: "0 0 12px", color: "#166534", fontSize: "14.5px" }}>
                  💰 4. Pago de Tasa (S/ 3.00) y Programación de Inspección Técnica
                </h4>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>Método de Pago *</label>
                    <select
                      value={metodoPagoSeleccionado}
                      onChange={(e) => setMetodoPagoSeleccionado(e.target.value)}
                      style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13.5px" }}
                    >
                      <option value="Efectivo en Caja Municipal">💵 Efectivo en Caja Municipal</option>
                      <option value="Tarjeta (Pago Digital)">💳 Tarjeta (Pago Digital)</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>Fecha de Inspección (Mínimo mañana) *</label>
                    <input
                      type="date"
                      min={formatearFechaYYYYMMDD(obtenerFechaMinimaInspeccion())}
                      value={
                        fechaInspeccion.includes("/")
                          ? fechaInspeccion.split("/").reverse().join("-")
                          : fechaInspeccion
                      }
                      onChange={(e) => {
                        const valYMD = e.target.value;
                        if (!valYMD) return;
                        const [y, m, d] = valYMD.split("-");
                        setFechaInspeccion(`${d}/${m}/${y}`);
                      }}
                      style={{
                        width: "100%", padding: "8px 12px", borderRadius: "8px",
                        border: fechaInspeccion && !esFechaPermitidaInspeccion(fechaInspeccion) ? "1.5px solid #dc2626" : "1px solid #cbd5e1",
                        fontSize: "13.5px", fontWeight: "bold"
                      }}
                    />
                    {fechaInspeccion && !esFechaPermitidaInspeccion(fechaInspeccion) && (
                      <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", color: "#991b1b", padding: "8px 12px", borderRadius: "8px", marginTop: "6px", fontSize: "11.5px" }}>
                        ⚠️ {MENSAJE_FECHA_INSPECCION}
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ marginBottom: "12px" }}>
                  <label style={{ display: "block", fontSize: "12.5px", fontWeight: "bold", color: "#334155", marginBottom: "6px" }}>👷 Inspector Municipal Asignado (Máx 4/día)</label>
                  {inspectorElegido ? (() => {
                    const cupos = obtenerConteoInspectorEnFecha(inspectorElegido.uid, fechaInspeccion);
                    const estaLleno = cupos >= 4;
                    return (
                      <div style={{
                        padding: "12px 14px", borderRadius: "10px",
                        border: estaLleno ? "1.5px solid #fca5a5" : "1.5px solid #16a34a",
                        background: estaLleno ? "#fef2f2" : "#f0fdf4",
                      }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div>
                            <strong style={{ color: estaLleno ? "#991b1b" : "#166534", fontSize: "13.5px" }}>{inspectorElegido.nombre}</strong>
                            <span style={{ display: "block", fontSize: "11.5px", color: "#64748b" }}>{inspectorElegido.cargo}</span>
                          </div>
                          <span style={{
                            padding: "3px 10px", borderRadius: "14px", fontSize: "11.5px", fontWeight: "800",
                            background: estaLleno ? "#fee2e2" : "#dcfce7",
                            color: estaLleno ? "#dc2626" : "#15803d",
                          }}>
                            {estaLleno ? "🔴 No disponible" : "🟢 Disponible"}
                          </span>
                        </div>
                        <span style={{ fontSize: "12px", color: estaLleno ? "#991b1b" : "#15803d", fontWeight: "600", marginTop: "4px", display: "block" }}>
                          Inspecciones: {cupos}/4
                        </span>
                      </div>
                    );
                  })() : (
                    <div style={{ padding: "12px 14px", borderRadius: "10px", border: "1.5px solid #fca5a5", background: "#fef2f2", textAlign: "center" }}>
                      <span style={{ color: "#991b1b", fontWeight: "700", fontSize: "13px" }}>⚠️ No hay inspectores disponibles para esta fecha.</span>
                    </div>
                  )}
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "12.5px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>Rango Horario de Inspección *</label>
                  <select
                    value={slotInspeccion}
                    onChange={(e) => setSlotInspeccion(e.target.value)}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13.5px" }}
                  >
                    {TIME_SLOTS.map((slot) => {
                      const ocupado = inspectorElegido && esHorarioOcupado(inspectorElegido.uid, fechaInspeccion, slot.value);
                      return (
                        <option key={slot.value} value={slot.value} disabled={ocupado}>
                          {slot.label} {ocupado ? " (Ocupado para este inspector)" : ""}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>

              <div className="admin-form-actions">
                <button type="button" onClick={() => setMostrarModalNuevaSolicitud(false)} disabled={procesando}>
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={procesando || !dniValidado || !rucValidado || !inspectorElegido}
                  style={{
                    background: (dniValidado && rucValidado && inspectorElegido) ? "#16a34a" : "#cbd5e1",
                    color: "white",
                    cursor: (dniValidado && rucValidado && inspectorElegido) ? "pointer" : "not-allowed"
                  }}
                >
                  {procesando
                    ? "Procesando Registro Presencial..."
                    : !dniValidado
                    ? "🔒 1. Valide DNI en RENIEC"
                    : !rucValidado
                    ? "🔒 2. Valide RUC en SUNAT"
                    : !inspectorElegido
                    ? "⚠️ 3. Seleccione Inspector"
                    : "🚀 Registrar, Cobrar y Asignar Inspección"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default PanelCajero;
