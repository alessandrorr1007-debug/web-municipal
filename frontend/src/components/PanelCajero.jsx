import { useEffect, useState, useMemo, useCallback } from "react";
import {
  obtenerSolicitudes,
  actualizarSolicitud,
  guardarSolicitud,
  suscribirSolicitudes,
} from "../services/solicitudService";
import { crearNotificacion } from "../services/notificacionService";
import { abrirPdf, obtenerBlobUrlParaPdf } from "../services/pdfService";
import { crearOrdenFlow } from "../services/pagoService";
import { consultarDni } from "../services/dniService";
import { consultarRuc } from "../services/rucService";
import { convertirNumeroALetras } from "../services/comprobanteService";
import { GROS_DISPONIBLES, obtenerDocumentosPorGiro } from "../config/documentosPorGiro";
import { useAuth } from "../context/AuthContext";
import VisualizadorDocumentoModal from "./VisualizadorDocumentoModal";
import {
  TIME_SLOTS,
  INSPECTORES_DEFAULT,
  formatearFechaLocal,
  esHorarioPasado,
  esFechaValidaParaInspeccion,
  MENSAJE_FECHA_INSPECCION,
  obtenerFechaMinimaInspeccion,
  formatearFechaYYYYMMDD,
  MAX_INSPECCIONES_POR_DIA,
  buscarSiguienteDisponibilidad,
} from "../config/inspeccionConfig";

const MONTO_TRAMITE = 3.0;

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
  const [solicitudVerBoleta, setSolicitudVerBoleta] = useState(null);
  const [documentoPdfVisor, setDocumentoPdfVisor] = useState(null);
  const [solicitudRenovacion, setSolicitudRenovacion] = useState(null);
  const [metodoPagoSeleccionado, setMetodoPagoSeleccionado] = useState("Efectivo en Caja Municipal");
  const [montoRecibidoInput, setMontoRecibidoInput] = useState("10.00");
  const [comprobanteGenerado, setComprobanteGenerado] = useState(null);
  const [procesando, setProcesando] = useState(false);

  // VISTA SECUNDARIA DE CONSULTA DE ESTADO DE TRÁMITES
  const [vistaConsultaEstado, setVistaConsultaEstado] = useState(() => seccion === "consulta-expedientes" || seccion === "solicitudes-pago");

  useEffect(() => {
    if (seccion === "consulta-expedientes" || seccion === "solicitudes-pago") {
      setVistaConsultaEstado(true);
    } else if (seccion === "inicio") {
      setVistaConsultaEstado(false);
    }
  }, [seccion]);

  // ESTADOS DE ASIGNACIÓN E INSPECCIÓN DIRECTA (DESDE MAÑANA COMO MÍNIMO)
  const [inspectorElegido, setInspectorElegido] = useState(() => INSPECTORES_DEFAULT[0]);
  const [fechaInspeccion, setFechaInspeccion] = useState(() => formatearFechaLocal(obtenerFechaMinimaInspeccion()));
  const [slotInspeccion, setSlotInspeccion] = useState("08:00 AM - 10:00 AM");
  const [sinDisponibilidadInspeccion, setSinDisponibilidadInspeccion] = useState(false);

  // ESTADOS PARA REGISTRO PRESENCIAL DE NUEVA SOLICITUD (WIZARD DE PASO ÚNICO ACTIVO)
  const [pasoActual, setPasoActual] = useState(1);
  const [pagoConfirmadoLocal, setPagoConfirmadoLocal] = useState(false);
  const [tipoComprobanteSeleccionado, setTipoComprobanteSeleccionado] = useState("Boleta");
  const [tipoTramiteSeleccionado, setTipoTramiteSeleccionado] = useState("Nueva Licencia de Funcionamiento");
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

  // EJECUCIÓN AUTOMÁTICA DE ASIGNACIÓN
  useEffect(() => {
    const res = buscarSiguienteDisponibilidad(solicitudes);
    if (res.exito) {
      setFechaInspeccion(res.fechaInspeccion);
      setSlotInspeccion(res.slotInspeccion);
      setInspectorElegido(res.inspector);
      setSinDisponibilidadInspeccion(false);
    } else {
      setSinDisponibilidadInspeccion(true);
    }
  }, [solicitudes]);

  useEffect(() => {
    if (solicitudCobro) {
      const res = buscarSiguienteDisponibilidad(solicitudes);
      if (res.exito) {
        setFechaInspeccion(res.fechaInspeccion);
        setSlotInspeccion(res.slotInspeccion);
        setInspectorElegido(res.inspector);
        setSinDisponibilidadInspeccion(false);
      } else {
        setSinDisponibilidadInspeccion(true);
      }
    }
  }, [solicitudCobro, solicitudes]);

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
    setCargando(true);
    const unsubscribe = suscribirSolicitudes((data) => {
      setSolicitudes(data);
      setCargando(false);
    });
    return () => unsubscribe();
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

  // EVALUACIÓN SECUENCIAL DE LOS 4 PASOS DEL WIZARD DE CAJERO
  // Paso 1: Datos de Contacto (Teléfono Celular iniciado en 9 y Correo válido)
  const esTelefonoValido = /^9\d{8}$/.test(telefonoForm);
  const esCorreoValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correoForm);
  const paso1Completado = esTelefonoValido && esCorreoValido;

  // Paso 2: Validación SUNAT
  const sunatPermiteContinuar = rucValidado && estadoSunat === "ACTIVO" && condicionSunat === "HABIDO";
  const paso2Completado = paso1Completado && sunatPermiteContinuar && Boolean(nombreNegocioForm) && Boolean(direccionForm);

  // Paso 3: Carga de Documentos Obligatorios por Giro
  const reqsDocInfo = obtenerDocumentosPorGiro(giroForm);
  const reqsDoc = reqsDocInfo?.ciudadano || [];
  const reqsObligatorios = reqsDoc.filter((d) => d.obligatorio);
  const faltanObligatorios = reqsObligatorios.some((req) => !archivosPresenciales.some((a) => a.docId === req.id));
  const paso3Completado = paso2Completado && reqsObligatorios.length > 0 && !faltanObligatorios;

  // Paso 4: Cobro de Tasa (S/ 3.00) y Método de Pago
  const paso4Completado = paso3Completado && Boolean(metodoPagoSeleccionado);

  // Conteo de pasos completados para la barra de progreso
  const pasosCompletadosCount = [
    paso1Completado,
    paso2Completado,
    paso3Completado,
    paso4Completado,
  ].filter(Boolean).length;

  const porcentajeProgreso = Math.round((pasosCompletadosCount / 4) * 100);

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

  // BUSQUEDA Y FILTRADO DE EXPEDIENTES (RUC, CÓDIGO EXP- O NOMBRE DE NEGOCIO)
  const solicitudesFiltradas = useMemo(() => {
    const lista = Array.isArray(solicitudes) ? solicitudes : [];

    return lista.filter((s) => {
      if (!s) return false;

      // Si el campo de búsqueda está vacío, mostrar TODAS las solicitudes registradas
      if (!busqueda || !busqueda.trim()) return true;
      const q = busqueda.toLowerCase().trim();
      const ruc = String(s.ruc || "").toLowerCase();
      const idExp = String(s.id || "").toLowerCase();
      const codExp = `exp-${idExp}`;
      const negocio = String(s.nombreNegocio || s.razonSocial || "").toLowerCase();

      return ruc.includes(q) || idExp.includes(q) || codExp.includes(q) || negocio.includes(q);
    });
  }, [solicitudes, busqueda]);

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

    const esEfectivo = metodoPagoSeleccionado.toLowerCase().includes("efectivo");
    const montoRecibidoNum = parseFloat(montoRecibidoInput) || 0;
    const vueltoCalculado = Math.max(0, montoRecibidoNum - MONTO_TRAMITE);

    if (esEfectivo && montoRecibidoNum < MONTO_TRAMITE) {
      alert(`⚠️ El monto recibido (S/ ${montoRecibidoNum.toFixed(2)}) es menor al total a pagar (S/ ${MONTO_TRAMITE.toFixed(2)}). Por favor ingrese un monto válido.`);
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
        montoRecibido: esEfectivo ? montoRecibidoNum : null,
        vuelto: esEfectivo ? vueltoCalculado : null,
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
            comentarios: `Pago de S/ ${MONTO_TRAMITE.toFixed(2)} registrado (${metodoPagoSeleccionado}). ${esEfectivo ? `Recibido: S/ ${montoRecibidoNum.toFixed(2)}, Vuelto: S/ ${vueltoCalculado.toFixed(2)}. ` : ''}Boleta: ${codComprobante}. Visita asignada a ${inspectorElegido.nombre} para el ${fechaInspeccion} a las ${horaLabel}.`,
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

    if (!rucValidado) {
      alert("⚠️ Debe consultar y validar el RUC del establecimiento mediante SUNAT antes de continuar.");
      return;
    }
    const rucDuplicado = solicitudes.find((s) => s.ruc === rucForm.trim() && !["Rechazado", "Licencia rechazada"].includes(s.estado));
    if (rucDuplicado) {
      const expLimpio = String(rucDuplicado.id).replace(/^EXP-/, "");
      alert(`🚫 No es posible registrar la solicitud.\n\nEl RUC ${rucForm} (${nombreNegocioForm}) ya tiene un expediente activo registrado en el sistema (EXP-${expLimpio}).\n\nSolo se permite una solicitud por RUC.`);
      return;
    }
    if (!esJurisdiccionTrujillo) {
      alert("Este establecimiento no pertenece a la jurisdicción de la Municipalidad Provincial de Trujillo. Solo es posible registrar solicitudes para establecimientos ubicados en la provincia de Trujillo.");
      return;
    }
    if (!telefonoForm || !/^9\d{8}$/.test(telefonoForm)) {
      alert("⚠️ Ingrese un número de celular peruano válido de 9 dígitos que inicie con 9.");
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

    const esEfectivo = metodoPagoSeleccionado.toLowerCase().includes("efectivo");
    const montoRecibidoNum = parseFloat(montoRecibidoInput) || 0;
    const vueltoCalculado = Math.max(0, montoRecibidoNum - MONTO_TRAMITE);

    if (esEfectivo && montoRecibidoNum < MONTO_TRAMITE) {
      alert(`⚠️ El monto recibido (S/ ${montoRecibidoNum.toFixed(2)}) es menor al total a pagar (S/ ${MONTO_TRAMITE.toFixed(2)}). Por favor ingrese un monto válido.`);
      return;
    }

    setProcesando(true);
    try {
      const idExp = Date.now().toString().slice(-6);
      const esFactura = tipoComprobanteSeleccionado === "Factura";
      const codComprobante = esFactura
        ? "F001-" + Date.now().toString().slice(-6)
        : "B001-" + Date.now().toString().slice(-6);
      const nombreComprobanteTitulo = esFactura ? "FACTURA ELECTRÓNICA" : "BOLETA DE VENTA ELECTRÓNICA";
      const fechaHoraActual = formatearFechaHora();
      const nombreCajera = usuario?.nombre || usuario?.email || "Cajera de Ventanilla";
      const uidCajera = usuario?.uid || "CAJERA-001";
      const slotObj = TIME_SLOTS.find((s) => s.value === slotInspeccion);
      const horaLabel = slotObj ? slotObj.label : `${slotInspeccion} hrs`;

      const nuevaSolicitudPresencial = {
        id: idExp,
        numeroExpediente: `EXP-${idExp}`,
        dniSolicitante: dniForm || "",
        dni: dniForm || "",
        nombresSolicitante: nombresForm || razonSocialForm || nombreNegocioForm,
        apellidosSolicitante: apellidosForm || "",
        nombreSolicitante: (nombresForm && apellidosForm) ? `${nombresForm} ${apellidosForm}` : (razonSocialForm || nombreNegocioForm || "SOLICITANTE PRESENCIAL"),
        correoUsuario: correoForm || `${rucForm}@empresa.pe`,
        telefono: telefonoForm,
        ruc: rucForm,
        nombreNegocio: nombreNegocioForm,
        razonSocial: razonSocialForm || nombreNegocioForm,
        direccion: direccionForm,
        giro: giroForm,
        tipoTramite: "Nueva Licencia de Funcionamiento",
        estado: "Inspección programada",
        estadoNormalizado: "INSPECCION_PROGRAMADA",
        estadoPago: "Confirmado",
        metodoPago: metodoPagoSeleccionado,
        montoPagado: MONTO_TRAMITE,
        montoRecibido: esEfectivo ? montoRecibidoNum : null,
        vuelto: esEfectivo ? vueltoCalculado : null,
        tipoComprobante: nombreComprobanteTitulo,
        comprobantePago: `${nombreComprobanteTitulo} N° ${codComprobante}`,
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
            accion: `Registro Presencial, Emisión de ${nombreComprobanteTitulo} y Asignación de Inspector`,
            comentarios: `Registro presencial en ventanilla (${tipoTramiteSeleccionado}). Pago de S/ ${MONTO_TRAMITE.toFixed(2)} registrado (${metodoPagoSeleccionado}). ${nombreComprobanteTitulo}: ${codComprobante}. Visita asignada a ${inspectorElegido.nombre} para el ${fechaInspeccion} a las ${horaLabel}.`,
          },
        ],
      };

      const resGuardado = await guardarSolicitud(nuevaSolicitudPresencial);
      const idReal = typeof resGuardado === "object" ? String(resGuardado.id || idExp) : String(resGuardado || idExp);
      const solicitudCompleta = { ...nuevaSolicitudPresencial, id: idReal };

      if (correoForm) {
        const expIdLimpio = String(solicitudCompleta.id).replace(/^EXP-/, "");

        // CORREO 1: NOTIFICACIÓN DE REGISTRO DE SOLICITUD
        const htmlNotificacionSolicitud = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 12px; overflow: hidden;">
            <div style="background: #1e3a8a; padding: 24px; text-align: center; color: white;">
              <h2 style="margin: 0; font-size: 20px;">📝 Registro Exitoso de ${tipoTramiteSeleccionado}</h2>
              <p style="margin: 6px 0 0; font-size: 14px; opacity: 0.9;">Expediente N° EXP-${expIdLimpio}</p>
            </div>
            <div style="padding: 24px; color: #334155; font-size: 14px; line-height: 1.6;">
              <p style="margin: 0 0 16px;">Estimado(a) <strong>${nombresForm} ${apellidosForm}</strong> (DNI: ${dniForm}),</p>
              <p style="margin: 0 0 16px;">Se ha registrado exitosamente su <strong>${tipoTramiteSeleccionado}</strong> en el Módulo de Atención de la Municipalidad Provincial de Trujillo.</p>
              
              <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 16px; border-radius: 8px; margin-bottom: 16px;">
                <h4 style="margin: 0 0 10px; color: #0f172a;">🏢 Datos de la Empresa y Local</h4>
                <p style="margin: 4px 0;"><strong>Nombre Comercial:</strong> ${nombreNegocioForm}</p>
                <p style="margin: 4px 0;"><strong>Razón Social:</strong> ${razonSocialForm || nombreNegocioForm}</p>
                <p style="margin: 4px 0;"><strong>RUC:</strong> ${rucForm}</p>
                <p style="margin: 4px 0;"><strong>Dirección Fiscal:</strong> ${direccionForm}</p>
              </div>

              <div style="background: #eff6ff; border: 1px solid #bfdbfe; padding: 16px; border-radius: 8px; margin-bottom: 20px;">
                <h4 style="margin: 0 0 10px; color: #1e40af;">📅 Inspección Técnica Programada</h4>
                <p style="margin: 4px 0; color: #1e3a8a;"><strong>Fecha de Visita:</strong> ${fechaInspeccion}</p>
                <p style="margin: 4px 0; color: #1e3a8a;"><strong>Horario Asignado:</strong> ${horaLabel}</p>
                <p style="margin: 4px 0; color: #1e3a8a;"><strong>Inspector Municipal:</strong> ${inspectorElegido.nombre}</p>
              </div>

              <p style="margin: 0; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 12px;">
                Municipalidad Provincial de Trujillo — Sistema de Licencias Municipal
              </p>
            </div>
          </div>
        `;

        // CORREO 2: COMPROBANTE DE VENTA ELECTRÓNICO OFICIAL (BOLETA O FACTURA CON ESTRUCTURA SUNAT SOLICITADA - 100% COMPATIBLE CON GMAIL)
        const htmlBoletaElectronica = `
          <div style="font-family: Arial, Helvetica, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 2px solid #0f172a; border-radius: 12px; padding: 24px; color: #0f172a;">
            <!-- ENCABEZADO MUNICIPAL -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f172a; color: #ffffff; border-radius: 8px; margin-bottom: 20px; text-align: center;">
              <tr>
                <td style="padding: 16px;">
                  <h2 style="margin: 0; font-size: 18px; font-weight: 900; color: #ffffff; text-transform: uppercase; letter-spacing: 0.5px;">MUNICIPALIDAD PROVINCIAL DE TRUJILLO</h2>
                  <span style="font-size: 11px; opacity: 0.9; text-transform: uppercase; font-weight: bold; display: block; margin-top: 4px; color: #cbd5e1;">Módulo de Atención y Caja Municipal</span>
                  <span style="font-size: 10.5px; opacity: 0.8; display: block; margin-top: 2px; color: #94a3b8;">RUC: 20145532000 — Jr. Almagro N° 525, Trujillo</span>
                </td>
              </tr>
            </table>

            <!-- NUMERACIÓN DE COMPROBANTE -->
            <table width="100%" cellpadding="0" cellspacing="0" style="border: 2px solid #0f172a; background-color: #f8fafc; border-radius: 8px; margin-bottom: 20px; text-align: center;">
              <tr>
                <td style="padding: 14px;">
                  <span style="font-weight: 900; font-size: 16px; display: block; color: #0f172a; text-transform: uppercase;">${nombreComprobanteTitulo}</span>
                  <span style="font-size: 18px; font-weight: 900; color: #dc2626; display: block; margin-top: 2px;">N° ${codComprobante}</span>
                  <p style="margin: 4px 0 0; font-size: 12.5px; color: #475569;">Fecha: ${fechaHoraActual}</p>
                </td>
              </tr>
            </table>

            <!-- DATOS DEL CONTRIBUYENTE Y ESTABLECIMIENTO -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; margin-bottom: 20px; font-size: 13px;">
              <tr>
                <td style="padding: 16px;">
                  <h4 style="margin: 0 0 10px; color: #0f172a; font-size: 14px; font-weight: 800; border-bottom: 1px solid #cbd5e1; padding-bottom: 6px;">🏢 Información del Contribuyente y Establecimiento</h4>
                  <p style="margin: 4px 0; color: #1e293b;"><strong>Nombre Legal / Razón Social:</strong> ${razonSocialForm || nombreNegocioForm}</p>
                  <p style="margin: 4px 0; color: #1e293b;"><strong>Nombre Comercial:</strong> ${nombreNegocioForm}</p>
                  <p style="margin: 4px 0; color: #1e293b;"><strong>Número de RUC:</strong> ${rucForm}</p>
                  <p style="margin: 4px 0; color: #1e293b;"><strong>Dirección Fiscal:</strong> ${direccionForm}</p>
                  <p style="margin: 4px 0; color: #1e293b;"><strong>Solicitante:</strong> ${nombresForm} ${apellidosForm} (DNI: ${dniForm})</p>
                </td>
              </tr>
            </table>

            <!-- GRILLA TABULAR DE DETALLE -->
            <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; margin-bottom: 20px; font-size: 13px; border: 1px solid #cbd5e1;">
              <thead>
                <tr style="background-color: #0f172a; color: #ffffff;">
                  <th style="padding: 10px; text-align: center; width: 12%; color: #ffffff;">CANT</th>
                  <th style="padding: 10px; text-align: left; color: #ffffff;">DESCRIPCIÓN</th>
                  <th style="padding: 10px; text-align: right; width: 22%; color: #ffffff;">P. UNIT</th>
                  <th style="padding: 10px; text-align: right; width: 22%; color: #ffffff;">IMPORTE</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style="padding: 12px; text-align: center; font-weight: bold; border-bottom: 1px solid #e2e8f0;">1</td>
                  <td style="padding: 12px; border-bottom: 1px solid #e2e8f0;">
                    <strong style="color: #0f172a;">Derecho de Trámite — Nueva Licencia de Funcionamiento</strong>
                    <span style="display: block; color: #64748b; font-size: 12px;">Expediente N° EXP-${expIdLimpio}</span>
                  </td>
                  <td style="padding: 12px; text-align: right; border-bottom: 1px solid #e2e8f0; color: #0f172a;">S/ 3.00</td>
                  <td style="padding: 12px; text-align: right; font-weight: bold; border-bottom: 1px solid #e2e8f0; color: #0f172a;">S/ 3.00</td>
                </tr>
              </tbody>
            </table>

            <!-- RESUMEN FINANCIERO -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; margin-bottom: 20px; font-size: 12.5px;">
              <tr>
                <td style="padding: 16px; vertical-align: top; width: 55%;">
                  <p style="margin: 2px 0; color: #334155;"><strong>MÉTODO DE PAGO:</strong> ${metodoPagoSeleccionado.toUpperCase()}</p>
                  <p style="margin: 2px 0; color: #334155;"><strong>CAJERA:</strong> ${nombreCajera.toUpperCase()}</p>
                </td>
                <td style="padding: 16px; vertical-align: top; width: 45%; text-align: right;">
                  <table width="100%" cellpadding="0" cellspacing="0" style="font-size: 13px;">
                    <tr>
                      <td style="color: #475569; padding: 2px 0;">OP. GRAVADA:</td>
                      <td style="font-weight: bold; text-align: right; color: #0f172a;">S/ 2.54</td>
                    </tr>
                    <tr>
                      <td style="color: #475569; padding: 2px 0;">I.G.V. (18%):</td>
                      <td style="font-weight: bold; text-align: right; color: #0f172a;">S/ 0.46</td>
                    </tr>
                    <tr>
                      <td style="padding-top: 8px; font-weight: 900; color: #0f172a; border-top: 1.5px solid #0f172a; font-size: 15px;">TOTAL A PAGAR:</td>
                      <td style="padding-top: 8px; font-weight: 900; text-align: right; color: #16a34a; border-top: 1.5px solid #0f172a; font-size: 15px;">S/ 3.00</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- PIE LEGAL -->
            <table width="100%" cellpadding="0" cellspacing="0" style="border-top: 1px solid #cbd5e1; text-align: center;">
              <tr>
                <td style="padding-top: 14px; font-size: 12px; color: #64748b;">
                  <p style="margin: 0 0 4px; font-weight: bold;">Representación impresa del comprobante de venta electrónico.</p>
                  <p style="margin: 0; color: #16a34a; font-weight: 800; font-size: 13px;">¡Gracias por su preferencia!</p>
                </td>
              </tr>
            </table>
          </div>
        `;

        // ENVIAR CORREO 1: CONFIRMACIÓN DE SOLICITUD
        await crearNotificacion(
          solicitudCompleta.uidUsuario || "CIUDADANO_VENTANILLA",
          {
            titulo: `${tipoTramiteSeleccionado} Registrada — EXP-${expIdLimpio}`,
            descripcion: `Se registró su solicitud presencial EXP-${expIdLimpio}. Inspección asignada a ${inspectorElegido.nombre} el ${fechaInspeccion} (${horaLabel}).`,
            icono: "📝",
            html: htmlNotificacionSolicitud,
          },
          correoForm
        );

        // ENVIAR CORREO 2: COMPROBANTE DE VENTA ELECTRÓNICO (BOLETA O FACTURA)
        await crearNotificacion(
          solicitudCompleta.uidUsuario || "CIUDADANO_VENTANILLA",
          {
            titulo: `${nombreComprobanteTitulo} — N° ${codComprobante}`,
            descripcion: `Comprobante de pago ${nombreComprobanteTitulo} N° ${codComprobante} emitido por S/ 3.00 (${metodoPagoSeleccionado}).`,
            icono: "💳",
            html: htmlBoletaElectronica,
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
        tipoComprobante: nombreComprobanteTitulo,
        tipoTramite: tipoTramiteSeleccionado,
        inspectorNombre: inspectorElegido.nombre,
        fechaInspeccion,
        slotInspeccion: horaLabel,
        nombreSolicitante: `${nombresForm} ${apellidosForm}`,
        nombreNegocio: nombreNegocioForm,
        solicitudCompleta
      };

      if (metodoPagoSeleccionado.includes("Flow")) {
        try {
          const flowOrder = await crearOrdenFlow({
            solicitudId: String(solicitudCompleta.id),
            amount: MONTO_TRAMITE,
            email: correoForm || `${rucForm}@empresa.pe`,
            buyerName: nombreNegocioForm || razonSocialForm || "Contribuyente",
            subject: `Derecho de Trámite Licencia EXP-${String(solicitudCompleta.id).replace(/^EXP-/, "")}`,
          });

          if (flowOrder && flowOrder.paymentUrl) {
            alert(`💳 Redirigiendo a la pasarela de pagos oficial Flow.cl para procesar el pago real de S/ ${MONTO_TRAMITE.toFixed(2)}...`);
            window.location.href = flowOrder.paymentUrl;
            return;
          }
        } catch (flowErr) {
          console.error("Error al iniciar orden de pago Flow:", flowErr);
          alert("⚠️ Error al conectar con la pasarela Flow.cl: " + flowErr.message);
          setProcesando(false);
          return;
        }
      }

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

  // CÁLCULO DE VIGENCIA Y DÍAS RESTANTES DE LICENCIA (RENOVACIÓN 1 MES ANTES)
  const calcularEstadoLicenciaVencimiento = (sol) => {
    if (!sol) return { aptoRenovacion: false, diasRestantes: null, fechaVencimientoStr: null };
    const est = (sol.estado || "").toLowerCase();
    if (!est.includes("aprobad") && !est.includes("renovad")) {
      return { aptoRenovacion: false, diasRestantes: null, fechaVencimientoStr: null };
    }

    let fechaEmision = new Date();
    if (sol.fechaEvaluacionInspector) {
      const parts = sol.fechaEvaluacionInspector.split(",")[0].split("/");
      if (parts.length === 3) fechaEmision = new Date(parts[2], parts[1] - 1, parts[0]);
    } else if (sol.fechaSolicitud) {
      const parts = sol.fechaSolicitud.split(",")[0].split("/");
      if (parts.length === 3) fechaEmision = new Date(parts[2], parts[1] - 1, parts[0]);
    }

    const fechaVencimiento = new Date(fechaEmision);
    fechaVencimiento.setFullYear(fechaVencimiento.getFullYear() + 1);

    const hoy = new Date();
    const diffTime = fechaVencimiento - hoy;
    const diasRestantes = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const fechaVencimientoStr = fechaVencimiento.toLocaleDateString("es-PE");

    const aptoRenovacion = diasRestantes <= 30;
    return { aptoRenovacion, diasRestantes, fechaVencimientoStr };
  };

  // PROCESAR RENOVACIÓN DIRECTA EN CAJA (COBRO DE S/ 3.00 Y EMISIÓN DE BOLETA/FACTURA)
  const ejecutarRenovacionDirecta = async (sol) => {
    if (!sol) return;
    setProcesando(true);
    try {
      const idExpLimpio = String(sol.id).replace(/^EXP-/, "");
      const esFactura = tipoComprobanteSeleccionado === "Factura";
      const codComprobante = esFactura
        ? "F001-" + Date.now().toString().slice(-6)
        : "B001-" + Date.now().toString().slice(-6);
      const nombreComprobanteTitulo = esFactura ? "FACTURA ELECTRÓNICA" : "BOLETA DE VENTA ELECTRÓNICA";
      const fechaHoraActual = formatearFechaHora();
      const nombreCajera = usuario?.nombre || usuario?.email || "Cajera de Ventanilla";

      const nuevaVencimiento = new Date();
      nuevaVencimiento.setFullYear(nuevaVencimiento.getFullYear() + 1);
      const nuevaFechaVencimientoStr = nuevaVencimiento.toLocaleDateString("es-PE");

      const logEntrada = {
        fecha: fechaHoraActual.split(",")[0] || fechaHoraActual,
        hora: fechaHoraActual.split(",")[1]?.trim() || "",
        usuario: nombreCajera,
        rol: "Cajera",
        accion: `Renovación de Licencia y Emisión de ${nombreComprobanteTitulo}`,
        comentarios: `Renovación de licencia procesada en caja. Tasa de S/ ${MONTO_TRAMITE.toFixed(2)} cobrada (${metodoPagoSeleccionado}). Comprobante: ${codComprobante}. Nueva vigencia hasta ${nuevaFechaVencimientoStr}.`,
      };

      const cambios = {
        estado: "Licencia renovada",
        estadoNormalizado: "LICENCIA_RENOVADA",
        tipoTramite: "Renovación de Licencia de Funcionamiento",
        fechaRenovacion: fechaHoraActual,
        fechaVencimiento: nuevaFechaVencimientoStr,
        recordatorioRenovacionEnviado: false,
        comprobantePago: `${nombreComprobanteTitulo} N° ${codComprobante}`,
        numeroOperacion: codComprobante,
        fechaPago: fechaHoraActual,
        cajeraResponsable: nombreCajera,
        historialAcciones: [...(sol.historialAcciones || []), logEntrada],
      };

      await actualizarSolicitud(sol.id, cambios);

      if (sol.correoUsuario) {
        const htmlNotificacionRenovacion = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 12px; overflow: hidden;">
            <div style="background: #1e3a8a; padding: 24px; text-align: center; color: white;">
              <h2 style="margin: 0; font-size: 20px;">🔄 Licencia de Funcionamiento Renovada</h2>
              <p style="margin: 6px 0 0; font-size: 14px; opacity: 0.9;">Expediente N° EXP-${idExpLimpio}</p>
            </div>
            <div style="padding: 24px; color: #334155; font-size: 14px; line-height: 1.6;">
              <p style="margin: 0 0 16px;">Estimado(a) <strong>${sol.nombreSolicitante || sol.nombresSolicitante}</strong>,</p>
              <p style="margin: 0 0 16px;">Le confirmamos que su <strong>Renovación de Licencia de Funcionamiento Municipal</strong> ha sido procesada exitosamente.</p>

              <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 16px; border-radius: 8px; margin-bottom: 16px;">
                <h4 style="margin: 0 0 10px; color: #0f172a;">🏢 Datos de la Empresa y Nueva Vigencia</h4>
                <p style="margin: 4px 0;"><strong>Nombre Comercial:</strong> ${sol.nombreNegocio}</p>
                <p style="margin: 4px 0;"><strong>RUC:</strong> ${sol.ruc}</p>
                <p style="margin: 4px 0;"><strong>Nueva Fecha de Vencimiento:</strong> <span style="color: #16a34a; font-weight: bold;">${nuevaFechaVencimientoStr}</span></p>
              </div>

              <p style="margin: 0; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 12px;">
                Municipalidad Provincial de Trujillo — Sistema de Licencias Municipal
              </p>
            </div>
          </div>
        `;

        const htmlBoletaRenovacion = `
          <div style="font-family: Arial, Helvetica, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 2px solid #0f172a; border-radius: 12px; padding: 24px; color: #0f172a;">
            <!-- ENCABEZADO MUNICIPAL -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f172a; color: #ffffff; border-radius: 8px; margin-bottom: 20px; text-align: center;">
              <tr>
                <td style="padding: 16px;">
                  <h2 style="margin: 0; font-size: 18px; font-weight: 900; color: #ffffff; text-transform: uppercase; letter-spacing: 0.5px;">MUNICIPALIDAD PROVINCIAL DE TRUJILLO</h2>
                  <span style="font-size: 11px; opacity: 0.9; text-transform: uppercase; font-weight: bold; display: block; margin-top: 4px; color: #cbd5e1;">Módulo de Atención y Caja Municipal</span>
                  <span style="font-size: 10.5px; opacity: 0.8; display: block; margin-top: 2px; color: #94a3b8;">RUC: 20145532000 — Jr. Almagro N° 525, Trujillo</span>
                </td>
              </tr>
            </table>

            <!-- NUMERACIÓN DE COMPROBANTE -->
            <table width="100%" cellpadding="0" cellspacing="0" style="border: 2px solid #0f172a; background-color: #f8fafc; border-radius: 8px; margin-bottom: 20px; text-align: center;">
              <tr>
                <td style="padding: 14px;">
                  <span style="font-weight: 900; font-size: 16px; display: block; color: #0f172a; text-transform: uppercase;">${nombreComprobanteTitulo}</span>
                  <span style="font-size: 18px; font-weight: 900; color: #dc2626; display: block; margin-top: 2px;">N° ${codComprobante}</span>
                  <p style="margin: 4px 0 0; font-size: 12.5px; color: #475569;">Fecha: ${fechaHoraActual}</p>
                </td>
              </tr>
            </table>

            <!-- DATOS DEL CONTRIBUYENTE Y ESTABLECIMIENTO -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; margin-bottom: 20px; font-size: 13px;">
              <tr>
                <td style="padding: 16px;">
                  <h4 style="margin: 0 0 10px; color: #0f172a; font-size: 14px; font-weight: 800; border-bottom: 1px solid #cbd5e1; padding-bottom: 6px;">🏢 Información del Contribuyente y Establecimiento</h4>
                  <p style="margin: 4px 0; color: #1e293b;"><strong>Nombre Legal / Razón Social:</strong> ${sol.razonSocial || sol.nombreNegocio}</p>
                  <p style="margin: 4px 0; color: #1e293b;"><strong>Nombre Comercial:</strong> ${sol.nombreNegocio}</p>
                  <p style="margin: 4px 0; color: #1e293b;"><strong>Número de RUC:</strong> ${sol.ruc}</p>
                  <p style="margin: 4px 0; color: #1e293b;"><strong>Dirección Fiscal:</strong> ${sol.direccion}</p>
                  <p style="margin: 4px 0; color: #1e293b;"><strong>Solicitante:</strong> ${sol.nombreSolicitante || sol.nombresSolicitante} (DNI: ${sol.dniSolicitante || sol.dni})</p>
                </td>
              </tr>
            </table>

            <!-- GRILLA TABULAR DE DETALLE -->
            <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; margin-bottom: 20px; font-size: 13px; border: 1px solid #cbd5e1;">
              <thead>
                <tr style="background-color: #0f172a; color: #ffffff;">
                  <th style="padding: 10px; text-align: center; width: 12%; color: #ffffff;">CANT</th>
                  <th style="padding: 10px; text-align: left; color: #ffffff;">DESCRIPCIÓN</th>
                  <th style="padding: 10px; text-align: right; width: 22%; color: #ffffff;">P. UNIT</th>
                  <th style="padding: 10px; text-align: right; width: 22%; color: #ffffff;">IMPORTE</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style="padding: 12px; text-align: center; font-weight: bold; border-bottom: 1px solid #e2e8f0;">1</td>
                  <td style="padding: 12px; border-bottom: 1px solid #e2e8f0;">
                    <strong style="color: #0f172a;">Derecho de Trámite — Renovación de Licencia de Funcionamiento</strong>
                    <span style="display: block; color: #64748b; font-size: 12px;">Expediente N° EXP-${idExpLimpio}</span>
                  </td>
                  <td style="padding: 12px; text-align: right; border-bottom: 1px solid #e2e8f0; color: #0f172a;">S/ 3.00</td>
                  <td style="padding: 12px; text-align: right; font-weight: bold; border-bottom: 1px solid #e2e8f0; color: #0f172a;">S/ 3.00</td>
                </tr>
              </tbody>
            </table>

            <!-- RESUMEN FINANCIERO -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; margin-bottom: 20px; font-size: 12.5px;">
              <tr>
                <td style="padding: 16px; vertical-align: top; width: 55%;">
                  <p style="margin: 2px 0; color: #334155;"><strong>MÉTODO DE PAGO:</strong> ${metodoPagoSeleccionado.toUpperCase()}</p>
                  <p style="margin: 2px 0; color: #334155;"><strong>CAJERA:</strong> ${nombreCajera.toUpperCase()}</p>
                </td>
                <td style="padding: 16px; vertical-align: top; width: 45%; text-align: right;">
                  <table width="100%" cellpadding="0" cellspacing="0" style="font-size: 13px;">
                    <tr>
                      <td style="color: #475569; padding: 2px 0;">OP. GRAVADA:</td>
                      <td style="font-weight: bold; text-align: right; color: #0f172a;">S/ 2.54</td>
                    </tr>
                    <tr>
                      <td style="color: #475569; padding: 2px 0;">I.G.V. (18%):</td>
                      <td style="font-weight: bold; text-align: right; color: #0f172a;">S/ 0.46</td>
                    </tr>
                    <tr>
                      <td style="padding-top: 8px; font-weight: 900; color: #0f172a; border-top: 1.5px solid #0f172a; font-size: 15px;">TOTAL A PAGAR:</td>
                      <td style="padding-top: 8px; font-weight: 900; text-align: right; color: #16a34a; border-top: 1.5px solid #0f172a; font-size: 15px;">S/ 3.00</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- PIE LEGAL -->
            <table width="100%" cellpadding="0" cellspacing="0" style="border-top: 1px solid #cbd5e1; text-align: center;">
              <tr>
                <td style="padding-top: 14px; font-size: 12px; color: #64748b;">
                  <p style="margin: 0 0 4px; font-weight: bold;">Representación impresa del comprobante de venta electrónico.</p>
                  <p style="margin: 0; color: #16a34a; font-weight: 800; font-size: 13px;">¡Gracias por su preferencia!</p>
                </td>
              </tr>
            </table>
          </div>
        `;

        await crearNotificacion(
          sol.uidUsuario || "CIUDADANO",
          {
            titulo: `Renovación de Licencia Confirmada — EXP-${idExpLimpio}`,
            descripcion: `Se procesó la renovación de su licencia EXP-${idExpLimpio}. Nueva vigencia hasta el ${nuevaFechaVencimientoStr}.`,
            icono: "🔄",
            html: htmlNotificacionRenovacion,
          },
          sol.correoUsuario
        );

        await crearNotificacion(
          sol.uidUsuario || "CIUDADANO",
          {
            titulo: `${nombreComprobanteTitulo} — N° ${codComprobante}`,
            descripcion: `Comprobante de renovación N° ${codComprobante} emitido por S/ 3.00 (${metodoPagoSeleccionado}).`,
            icono: "💳",
            html: htmlBoletaRenovacion,
          },
          sol.correoUsuario
        );
      }

      alert(`✅ Licencia renovada con éxito. Nueva vigencia hasta: ${nuevaFechaVencimientoStr}`);
      setSolicitudRenovacion(null);
      await cargarSolicitudes();
    } catch (err) {
      console.error(err);
      alert("Error al renovar licencia: " + err.message);
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

              {/* ESTILO DE IMPRESIÓN EXCLUSIVA PARA EL COMPROBANTE SUNAT */}
              <style>{`
                @media print {
                  body * {
                    visibility: hidden !important;
                  }
                  #comprobante-sunat-impresion, #comprobante-sunat-impresion * {
                    visibility: visible !important;
                  }
                  #comprobante-sunat-impresion {
                    position: absolute !important;
                    left: 0 !important;
                    top: 0 !important;
                    width: 100% !important;
                    max-width: 100% !important;
                    border: 2px solid #0f172a !important;
                    box-shadow: none !important;
                    margin: 0 !important;
                    padding: 20px !important;
                  }
                }
              `}</style>

              {/* VOUCHER / COMPROBANTE DE VENTA ELECTRÓNICO (BOLETA O FACTURA CON ESTRUCTURA SUNAT) */}
              <div id="comprobante-sunat-impresion" style={{ background: "#ffffff", border: "2px solid #0f172a", borderRadius: "14px", padding: "24px", maxWidth: "640px", margin: "0 auto 24px", textAlign: "left", boxShadow: "0 8px 24px rgba(0,0,0,0.08)" }}>
                {/* ENCABEZADO MUNICIPAL */}
                <div style={{ background: "#0f172a", color: "white", padding: "16px 20px", borderRadius: "8px", textAlign: "center", marginBottom: "20px" }}>
                  <h2 style={{ margin: 0, fontSize: "18px", fontWeight: "900", letterSpacing: "0.5px" }}>MUNICIPALIDAD PROVINCIAL DE TRUJILLO</h2>
                  <span style={{ fontSize: "11px", opacity: 0.9, textTransform: "uppercase", fontWeight: "bold", letterSpacing: "0.5px", display: "block", marginTop: "2px", color: "#cbd5e1" }}>
                    Módulo de Atención y Caja Municipal
                  </span>
                  <span style={{ fontSize: "10.5px", opacity: 0.75, display: "block", marginTop: "2px", color: "#94a3b8" }}>RUC: 20145532000 — Jr. Diego de Almagro N° 525, Trujillo</span>
                </div>

                {/* RECUADRO DE ENCABEZADO DE COMPROBANTE Y NUMERACIÓN */}
                <div style={{ border: "2px solid #0f172a", padding: "12px 18px", textAlign: "center", borderRadius: "8px", background: "#f8fafc", marginBottom: "20px" }}>
                  <span style={{ fontWeight: "900", fontSize: "15px", display: "block", color: "#0f172a", letterSpacing: "0.5px" }}>
                    {(resultadoRegistroExitoso.tipoComprobante || "BOLETA DE VENTA ELECTRÓNICA").toUpperCase()}
                  </span>
                  <span style={{ fontSize: "17px", fontWeight: "900", color: "#dc2626" }}>N° {resultadoRegistroExitoso.codComprobante}</span>
                  <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#475569" }}>Fecha y Hora: {resultadoRegistroExitoso.solicitudCompleta?.fechaPago || "21/07/2026 22:15"}</p>
                </div>

                {/* DATOS DEL CONTRIBUYENTE Y EXPEDIENTE */}
                <div style={{ background: "#f8fafc", border: "1px solid #cbd5e1", borderRadius: "10px", padding: "16px", marginBottom: "20px" }}>
                  <h4 style={{ margin: "0 0 10px", color: "#0f172a", fontSize: "14px", fontWeight: "800", borderBottom: "1px solid #e2e8f0", paddingBottom: "6px" }}>
                    🏢 Información del Contribuyente y Establecimiento
                  </h4>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "13px" }}>
                    <p style={{ margin: 0 }}><strong>Código Expediente:</strong> EXP-{String(resultadoRegistroExitoso.id).replace(/^EXP-/, "")}</p>
                    <p style={{ margin: 0 }}><strong>RUC Contribuyente:</strong> {resultadoRegistroExitoso.solicitudCompleta?.ruc}</p>
                    <p style={{ margin: 0 }}><strong>Razón Social / Empresa:</strong> {resultadoRegistroExitoso.solicitudCompleta?.razonSocial || resultadoRegistroExitoso.nombreNegocio}</p>
                    <p style={{ margin: 0 }}><strong>Nombre Comercial:</strong> {resultadoRegistroExitoso.nombreNegocio}</p>
                    <p style={{ margin: 0 }}><strong>Representante Legal:</strong> {resultadoRegistroExitoso.nombreSolicitante}</p>
                    <p style={{ margin: 0 }}><strong>DNI Representante:</strong> {resultadoRegistroExitoso.solicitudCompleta?.dniSolicitante || resultadoRegistroExitoso.solicitudCompleta?.dni || "---"}</p>
                    <p style={{ margin: 0, gridColumn: "span 2" }}><strong>Dirección Fiscal:</strong> {resultadoRegistroExitoso.solicitudCompleta?.direccion}</p>
                  </div>
                </div>

                {/* GRILLA TABULAR DE PRODUCTOS */}
                <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "16px", fontSize: "13px" }}>
                  <thead>
                    <tr style={{ background: "#0f172a", color: "white" }}>
                      <th style={{ padding: "10px", textTransform: "uppercase", textAlign: "center", width: "12%" }}>CANT</th>
                      <th style={{ padding: "10px", textTransform: "uppercase", textAlign: "left" }}>DESCRIPCIÓN</th>
                      <th style={{ padding: "10px", textTransform: "uppercase", textAlign: "right", width: "20%" }}>P. UNIT</th>
                      <th style={{ padding: "10px", textTransform: "uppercase", textAlign: "right", width: "20%" }}>IMPORTE</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ borderBottom: "1px solid #cbd5e1" }}>
                      <td style={{ padding: "12px", textAlign: "center", fontWeight: "bold" }}>1</td>
                      <td style={{ padding: "12px" }}>
                        <strong>Derecho de Trámite — {resultadoRegistroExitoso.tipoTramite || "Licencia Municipal de Funcionamiento"}</strong>
                        <small style={{ display: "block", color: "#64748b" }}>Expediente N° EXP-{String(resultadoRegistroExitoso.id).replace(/^EXP-/, "")}</small>
                      </td>
                      <td style={{ padding: "12px", textAlign: "right" }}>S/ 3.00</td>
                      <td style={{ padding: "12px", textAlign: "right", fontWeight: "800", color: "#0f172a" }}>S/ 3.00</td>
                    </tr>
                  </tbody>
                </table>

                {/* TOTAL EN LETRAS Y RESUMEN FINANCIERO */}
                <div style={{ background: "#f8fafc", padding: "14px", borderRadius: "10px", border: "1px solid #cbd5e1", marginBottom: "16px" }}>
                  <p style={{ margin: "0 0 10px", fontWeight: "800", fontSize: "13px", color: "#0f172a" }}>
                    {convertirNumeroALetras(MONTO_TRAMITE)}
                  </p>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #cbd5e1", paddingTop: "10px" }}>
                    <div style={{ fontSize: "12.5px", color: "#475569" }}>
                      <span>OP. GRAVADA: <strong>S/ 2.54</strong></span> &nbsp;|&nbsp; 
                      <span>I.G.V. (18%): <strong>S/ 0.46</strong></span>
                    </div>
                    <div style={{ fontSize: "16px", fontWeight: "900", color: "#16a34a" }}>
                      TOTAL PAGADO: S/ 3.00
                    </div>
                  </div>
                </div>

                {/* CONDICIONES DE PAGO: EFECTIVO VS TARJETA/DIGITAL */}
                <div style={{ background: "#f8fafc", border: "1px solid #cbd5e1", borderRadius: "10px", padding: "14px", marginBottom: "20px", fontSize: "12.5px", color: "#334155" }}>
                  <h4 style={{ margin: "0 0 8px", color: "#0f172a", fontSize: "13px", fontWeight: "800", borderBottom: "1px solid #e2e8f0", paddingBottom: "4px" }}>
                    💳 Detalles de Pago y Atención en Caja
                  </h4>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                    <p style={{ margin: 0 }}><strong>Método de Pago:</strong> {(resultadoRegistroExitoso.solicitudCompleta?.metodoPago || "EFECTIVO EN CAJA MUNICIPAL").toUpperCase()}</p>
                    <p style={{ margin: 0 }}><strong>Estado del Pago:</strong> <span style={{ color: "#16a34a", fontWeight: "bold" }}>Pago confirmado</span></p>
                    <p style={{ margin: 0 }}><strong>Cajero(a) Responsable:</strong> {(resultadoRegistroExitoso.solicitudCompleta?.cajeraResponsable || "MARÍA LÓPEZ (CAJ-001)").toUpperCase()}</p>
                    
                    {String(resultadoRegistroExitoso.solicitudCompleta?.metodoPago || "").toLowerCase().includes("efectivo") ? (
                      <>
                        <p style={{ margin: 0 }}><strong>Monto Recibido:</strong> S/ {Number(resultadoRegistroExitoso.solicitudCompleta?.montoRecibido || 10.00).toFixed(2)}</p>
                        <p style={{ margin: 0, gridColumn: "span 2", color: "#16a34a", fontWeight: "bold" }}><strong>Vuelto Entregado:</strong> S/ {Number(resultadoRegistroExitoso.solicitudCompleta?.vuelto || (Number(resultadoRegistroExitoso.solicitudCompleta?.montoRecibido || 10.00) - 3.00)).toFixed(2)}</p>
                      </>
                    ) : (
                      <p style={{ margin: 0 }}><strong>N° Operación / Transacción:</strong> {resultadoRegistroExitoso.codComprobante}</p>
                    )}
                  </div>
                </div>

                {/* MENSAJE OFICIAL DE REVISIÓN Y CÓDIGO QR */}
                <div style={{ borderTop: "1.5px solid #cbd5e1", paddingTop: "14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: "12px", color: "#475569", maxWidth: "430px" }}>
                    <p style={{ margin: "0 0 6px", color: "#166534", fontWeight: "800", fontSize: "12.5px" }}>
                      ✓ La solicitud fue enviada correctamente para revisión / inspección municipal.
                    </p>
                    <p style={{ margin: "0 0 2px", fontWeight: "bold" }}>Representación impresa del comprobante de venta electrónico SUNAT.</p>
                    <small style={{ color: "#64748b", display: "block" }}>Verificación Hash: MUNI-TRU-2026-98432-OK</small>
                  </div>
                  
                  {/* CÓDIGO QR DE VERIFICACIÓN */}
                  <div style={{ border: "1px solid #0f172a", padding: "6px", borderRadius: "8px", background: "white", textAlign: "center" }}>
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=90x90&data=${encodeURIComponent(`MUNICIPALIDAD PROVINCIAL DE TRUJILLO|RUC:20145532000|COMP:${resultadoRegistroExitoso.codComprobante}|EXP:${resultadoRegistroExitoso.id}|TOTAL:S/3.00`)}`}
                      alt="Código QR Comprobante"
                      style={{ width: "80px", height: "80px", display: "block" }}
                    />
                    <span style={{ fontSize: "9px", fontWeight: "bold", color: "#0f172a", display: "block", marginTop: "2px" }}>QR VERIFICACIÓN</span>
                  </div>
                </div>
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
                    Paso {pasoActual} de 4 ({Math.round((pasoActual / 4) * 100)}%)
                  </span>
                </div>

                <h3 style={{ margin: "4px 0 12px", color: "#0f172a", fontSize: "20px", fontWeight: "800" }}>
                  {pasoActual === 1 && "Paso 1: Datos de Contacto del Solicitante"}
                  {pasoActual === 2 && "Paso 2: Validación de Establecimiento SUNAT"}
                  {pasoActual === 3 && "Paso 3: Carga del Plano del Local (PDF)"}
                  {pasoActual === 4 && "Paso 4: Pago de Tasa Municipal (S/ 3.00) y Registro Directo"}
                </h3>

                <div style={{ height: "10px", width: "100%", background: "#f1f5f9", borderRadius: "5px", overflow: "hidden", border: "1px solid #e2e8f0" }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${(pasoActual / 4) * 100}%`,
                      background: "linear-gradient(90deg, #2563eb, #16a34a)",
                      transition: "width 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
                      borderRadius: "5px"
                    }}
                  />
                </div>
              </div>

              {/* CONTENIDO DEL PASO ACTIVO */}
              <div style={{ minHeight: "340px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                {/* PASO 1: DATOS DE CONTACTO */}
                {pasoActual === 1 && (
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

                {/* PASO 2: SUNAT */}
                {pasoActual === 2 && (
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

                    {/* ALERTA DE RECHAZO POR RUC DUPLICADO */}
                    {(() => {
                      const dupRuc = rucValidado && solicitudes.find((s) => s.ruc === rucForm.trim() && !["Rechazado", "Licencia rechazada"].includes(s.estado));
                      if (!dupRuc) return null;
                      const expLimpio = String(dupRuc.id).replace(/^EXP-/, "");
                      return (
                        <div style={{ background: "#fef2f2", border: "1.5px solid #dc2626", color: "#991b1b", padding: "16px 20px", borderRadius: "14px", marginTop: "16px" }}>
                          <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                            <span style={{ fontSize: "22px", lineHeight: "1" }}>🚫</span>
                            <div>
                              <strong style={{ fontSize: "14px", display: "block", marginBottom: "4px" }}>
                                RUC Ya Registrado en el Sistema
                              </strong>
                              <p style={{ margin: "0 0 6px", fontSize: "13px", lineHeight: "1.5" }}>
                                El RUC <strong>{rucForm}</strong> ({nombreNegocioForm}) ya cuenta con un expediente registrado: <strong>EXP-{expLimpio}</strong> (Estado: {dupRuc.estado || "En trámite"}).
                              </p>
                              <p style={{ margin: 0, fontSize: "12.5px", fontWeight: "bold" }}>
                                No se permite registrar más de una solicitud por RUC.
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* PASO 3: PLANO PDF */}
                {pasoActual === 3 && (
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

                {/* PASO 4: PAGO DE TASA Y REGISTRO DIRECTO */}
                {pasoActual === 4 && (
                  <div style={{ background: "#ffffff", padding: "24px", borderRadius: "16px", border: "1px solid #cbd5e1", boxShadow: "0 2px 8px rgba(0,0,0,0.03)" }}>
                    <h4 style={{ margin: "0 0 16px", color: "#0f172a", fontSize: "16px", fontWeight: "700" }}>💳 Pago de Tasa Municipal (S/ 3.00) y Finalización Directa</h4>

                    <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "14px", padding: "24px", marginBottom: "20px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                        <div>
                          <span style={{ fontSize: "12px", color: "#64748b", fontWeight: "bold", textTransform: "uppercase" }}>Derecho de Trámite Licencia Municipal</span>
                          <h3 style={{ margin: "2px 0 0", color: "#16a34a", fontSize: "32px", fontWeight: "800" }}>S/ {MONTO_TRAMITE.toFixed(2)}</h3>
                        </div>
                        <div style={{ textAlign: "right", background: "#ffffff", padding: "10px 16px", borderRadius: "10px", border: "1px solid #cbd5e1" }}>
                          <small style={{ color: "#64748b", fontWeight: "bold", display: "block", fontSize: "11px" }}>COMPROBANTE A EMITIR</small>
                          <strong style={{ color: tipoComprobanteSeleccionado === "Factura" ? "#dc2626" : "#2563eb", fontSize: "14px" }}>
                            {tipoComprobanteSeleccionado === "Factura" ? "🧾 Factura Electrónica (F001-AUTO)" : "📄 Boleta Electrónica (B001-AUTO)"}
                          </strong>
                        </div>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "16px" }}>
                        <div>
                          <label style={{ display: "block", fontSize: "13px", fontWeight: "700", color: "#334155", marginBottom: "6px" }}>
                            Tipo de Comprobante a Emitir *
                          </label>
                          <select
                            value={tipoComprobanteSeleccionado}
                            onChange={(e) => setTipoComprobanteSeleccionado(e.target.value)}
                            style={{ width: "100%", padding: "12px 16px", borderRadius: "10px", border: "1.5px solid #cbd5e1", fontSize: "14px", fontWeight: "700" }}
                          >
                            <option value="Boleta">📄 Boleta de Venta Electrónica (B001)</option>
                            <option value="Factura">🧾 Factura Electrónica (F001)</option>
                          </select>
                        </div>

                        <div>
                          <label style={{ display: "block", fontSize: "13px", fontWeight: "700", color: "#334155", marginBottom: "6px" }}>
                            Seleccione Método de Pago *
                          </label>
                          <select
                            value={metodoPagoSeleccionado}
                            onChange={(e) => setMetodoPagoSeleccionado(e.target.value)}
                            style={{ width: "100%", padding: "12px 16px", borderRadius: "10px", border: "1.5px solid #cbd5e1", fontSize: "14px", fontWeight: "700" }}
                          >
                            <option value="Efectivo en Caja Municipal">💵 Efectivo en Caja Municipal</option>
                            <option value="Billetera Digital (Yape / Plin)">📱 Billetera Digital (Yape / Plin)</option>
                            <option value="Tarjeta de Crédito / Débito">💳 Tarjeta de Crédito / Débito</option>
                            <option value="Pago Online Real con Flow (Flow.cl)">🌐 Pago Online Real con Flow (Flow.cl)</option>
                          </select>
                        </div>
                      </div>

                      {/* CAMPOS DINÁMICOS DE EFECTIVO VS DIGITAL */}
                      {metodoPagoSeleccionado.toLowerCase().includes("efectivo") && (
                        <div style={{ background: "#fffbeb", border: "1.5px solid #fde68a", padding: "16px", borderRadius: "12px", marginBottom: "16px" }}>
                          <label style={{ display: "block", fontSize: "13px", fontWeight: "bold", color: "#92400e", marginBottom: "6px" }}>
                            💵 Monto Recibido del Ciudadano (S/) *
                          </label>
                          <input
                            type="number"
                            step="0.10"
                            min="3.00"
                            placeholder="Ej. 10.00"
                            value={montoRecibidoInput}
                            onChange={(e) => setMontoRecibidoInput(e.target.value)}
                            style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1.5px solid #d97706", fontSize: "16px", fontWeight: "800", color: "#0f172a", background: "white" }}
                          />

                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginTop: "12px", background: "white", padding: "12px", borderRadius: "8px", border: "1px solid #fcd34d", textAlign: "center" }}>
                            <div>
                              <small style={{ color: "#64748b", fontWeight: "bold", fontSize: "10.5px" }}>TOTAL A PAGAR</small>
                              <p style={{ margin: "2px 0 0", fontWeight: "800", fontSize: "14.5px", color: "#0f172a" }}>S/ {MONTO_TRAMITE.toFixed(2)}</p>
                            </div>
                            <div>
                              <small style={{ color: "#64748b", fontWeight: "bold", fontSize: "10.5px" }}>MONTO RECIBIDO</small>
                              <p style={{ margin: "2px 0 0", fontWeight: "800", fontSize: "14.5px", color: "#2563eb" }}>
                                S/ {(parseFloat(montoRecibidoInput) || 0).toFixed(2)}
                              </p>
                            </div>
                            <div>
                              <small style={{ color: "#64748b", fontWeight: "bold", fontSize: "10.5px" }}>VUELTO</small>
                              <p style={{ margin: "2px 0 0", fontWeight: "800", fontSize: "14.5px", color: (parseFloat(montoRecibidoInput) || 0) >= MONTO_TRAMITE ? "#16a34a" : "#dc2626" }}>
                                S/ {Math.max(0, (parseFloat(montoRecibidoInput) || 0) - MONTO_TRAMITE).toFixed(2)}
                              </p>
                            </div>
                          </div>

                          {(parseFloat(montoRecibidoInput) || 0) < MONTO_TRAMITE && (
                            <div style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fca5a5", padding: "8px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: "bold", marginTop: "10px", textAlign: "center" }}>
                              ⚠️ El monto recibido es menor al total a pagar (S/ {MONTO_TRAMITE.toFixed(2)}). Por favor ingrese un monto suficiente.
                            </div>
                          )}
                        </div>
                      )}

                      {/* INFORMACIÓN DE ASIGNACIÓN AUTOMÁTICA DE INSPECCIÓN */}
                      <div style={{ background: "#eff6ff", border: "1.5px solid #bfdbfe", padding: "16px 20px", borderRadius: "12px" }}>
                        <strong style={{ color: "#1e40af", fontSize: "14px", display: "block", marginBottom: "6px" }}>
                          🤖 Inspección Técnica Agendada Automáticamente por el Sistema
                        </strong>
                        <p style={{ margin: "0 0 6px", fontSize: "13.5px", color: "#1e3a8a" }}>
                          <strong>Fecha de Visita:</strong> {fechaInspeccion} ({slotInspeccion})
                        </p>
                        <p style={{ margin: 0, fontSize: "13.5px", color: "#1e3a8a" }}>
                          <strong>Inspector Asignado:</strong> {inspectorElegido?.nombre || "Carlos Ramírez"}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={ejecutarRegistroPresencialCompleto}
                      disabled={procesando}
                      style={{
                        width: "100%",
                        padding: "16px",
                        background: metodoPagoSeleccionado.includes("Flow")
                          ? "linear-gradient(90deg, #2563eb, #1d4ed8)"
                          : "linear-gradient(90deg, #16a34a, #059669)",
                        color: "white",
                        border: "none",
                        borderRadius: "14px",
                        fontSize: "16.5px",
                        fontWeight: "800",
                        cursor: "pointer",
                        boxShadow: "0 4px 14px rgba(0, 0, 0, 0.15)"
                      }}
                    >
                      {procesando
                        ? "Procesando..."
                        : metodoPagoSeleccionado.includes("Flow")
                        ? "💳 Pagar S/ 3.00 con Flow.cl ➔"
                        : "💰 Confirmar Pago (S/ 3.00) y Registrar Solicitud"}
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

                  {pasoActual < 4 && (
                    <button
                      type="button"
                      onClick={() => {
                        if (pasoActual === 1 && !paso1Completado) {
                          alert("⚠️ Ingrese un teléfono celular peruano válido (9 dígitos iniciado en 9) y un correo electrónico.");
                          return;
                        }
                        if (pasoActual === 2) {
                          if (!rucValidado) {
                            alert("⚠️ Debe consultar y validar el RUC en SUNAT para continuar.");
                            return;
                          }
                          const dupRucNav = solicitudes.find((s) => s.ruc === rucForm.trim() && !["Rechazado", "Licencia rechazada"].includes(s.estado));
                          if (dupRucNav) {
                            const expLimpioNav = String(dupRucNav.id).replace(/^EXP-/, "");
                            alert(`🚫 No es posible continuar con el trámite.\n\nEl RUC ${rucForm} ya cuenta con la solicitud EXP-${expLimpioNav} registrada en el sistema.\n\nNo se permite registrar más de una solicitud por RUC.`);
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
                        if (pasoActual === 3 && !paso3Completado) {
                          alert("⚠️ Debe adjuntar el archivo PDF del Plano del Local.");
                          return;
                        }
                        setPasoActual((prev) => Math.min(4, prev + 1));
                      }}
                      style={{ padding: "12px 28px", background: "#2563eb", color: "white", border: "none", borderRadius: "10px", fontWeight: "bold", fontSize: "14px", cursor: "pointer", boxShadow: "0 2px 6px rgba(37,99,235,0.2)" }}
                    >
                      Siguiente ➔
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* VISTA 2: CONSULTA DE ESTADO */}
      {seccion === "consulta-expedientes" && (
        <section className="section-card">
          <div className="section-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h2>🔍 Consulta y Estado de Trámites</h2>
              <p>Busca expedientes únicamente por el número de RUC de 11 dígitos del establecimiento.</p>
            </div>
          </div>

          {/* BARRA DE BÚSQUEDA Y FILTROS */}
          <div style={{ display: "grid", gap: "16px", marginBottom: "20px" }}>
            <div>
              <input
                type="text"
                placeholder="🔍 Buscar por RUC del establecimiento (11 dígitos)..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                style={{ width: "100%", padding: "12px 18px", borderRadius: "10px", border: "1.5px solid #cbd5e1", fontSize: "14.5px" }}
              />
            </div>

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
                    (s.nombresSolicitante && s.apellidosSolicitante)
                      ? `${s.nombresSolicitante} ${s.apellidosSolicitante}`.trim()
                      : s.nombreSolicitante || s.nombresSolicitante || s.apellidosSolicitante || "Solicitante";
                  const esPagado = s.estadoPago === "Confirmado" || (s.estado || "").toLowerCase().includes("pagado") || (s.estado || "").toLowerCase().includes("inspeccion");
                  const esFacturaDoc = (s.tipoComprobante || s.comprobantePago || s.numeroOperacion || "").toLowerCase().includes("factura") || (s.numeroOperacion || "").startsWith("F");
                  const etiquetaComprobante = esFacturaDoc ? "Factura emitida" : "Boleta emitida";

                  const { aptoRenovacion, diasRestantes, fechaVencimientoStr } = calcularEstadoLicenciaVencimiento(s);

                  return (
                    <tr key={s.id}>
                      <td>
                        <strong>EXP-{String(s.id).replace(/^EXP-/, "")}</strong>
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
                        <span className="badge info">{s.tipoTramite || "Nueva Licencia"}</span>
                        <strong style={{ display: "block", color: "#0f766e", marginTop: "2px" }}>S/ {MONTO_TRAMITE.toFixed(2)}</strong>
                      </td>
                      <td>
                        <span className={`badge ${esPagado ? "ok" : "warning"}`}>
                          {esPagado ? "Pagado / Confirmado" : "Pendiente de Pago"}
                        </span>
                        {aptoRenovacion && (
                          <span className="badge warning" style={{ display: "block", marginTop: "4px", background: "#fef3c7", color: "#b45309", border: "1px solid #fde68a" }}>
                            ⚠️ {diasRestantes <= 0 ? "Licencia Vencida" : "Renovación Cercana"}
                          </span>
                        )}
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

                          {esPagado && (
                            <button
                              type="button"
                              onClick={() => setSolicitudVerBoleta(s)}
                              style={{ background: "#0f172a", color: "white", padding: "6px 10px", borderRadius: "6px", fontSize: "12.5px", fontWeight: "bold", border: "none", cursor: "pointer" }}
                            >
                              🧾 Verificar Boleta
                            </button>
                          )}

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
                          ) : aptoRenovacion ? (
                            <button
                              type="button"
                              onClick={() => {
                                setSolicitudRenovacion(s);
                                setTipoComprobanteSeleccionado("Boleta");
                                setMetodoPagoSeleccionado("Billetera Digital (Yape / Plin)");
                              }}
                              style={{ background: "#d97706", color: "white", padding: "6px 12px", borderRadius: "6px", fontWeight: "700", fontSize: "13px", cursor: "pointer", border: "none" }}
                            >
                              🔄 Renovación Directa ({diasRestantes <= 0 ? "Vencida" : `Vence en ${diasRestantes} días`})
                            </button>
                          ) : (
                            <span style={{ fontSize: "12px", color: "#16a34a", fontWeight: "bold", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                              ✓ Enviado ({etiquetaComprobante})
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
                  <strong>Nombres y Apellidos:</strong> {(solicitudVerDetalle.nombresSolicitante && solicitudVerDetalle.apellidosSolicitante) ? `${solicitudVerDetalle.nombresSolicitante} ${solicitudVerDetalle.apellidosSolicitante}`.trim() : solicitudVerDetalle.nombreSolicitante || "---"}
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

              <div style={{ background: "#f0fdf4", padding: "14px", borderRadius: "10px", border: "1.5px solid #bbf7d0", marginBottom: "16px" }}>
                <h4 style={{ margin: "0 0 8px", color: "#166534", fontSize: "14px", display: "flex", alignItems: "center", gap: "6px" }}>
                  💳 Información del Pago de Tasa y Boleta
                </h4>
                <p style={{ margin: "4px 0", fontSize: "13.5px", color: "#14532d" }}>
                  <strong>Estado de Pago:</strong> <span style={{ fontWeight: "800", color: solicitudVerDetalle.estadoPago === "Confirmado" ? "#16a34a" : "#d97706" }}>{solicitudVerDetalle.estadoPago || "Pendiente"}</span>
                </p>
                <p style={{ margin: "4px 0", fontSize: "13.5px", color: "#14532d" }}>
                  <strong>Monto Cobrado:</strong> S/ {Number(solicitudVerDetalle.montoPagado || MONTO_TRAMITE).toFixed(2)}
                </p>
                <p style={{ margin: "4px 0", fontSize: "13.5px", color: "#14532d" }}>
                  <strong>Método de Pago:</strong> {solicitudVerDetalle.metodoPago || "Efectivo en Caja Municipal"}
                </p>
                <p style={{ margin: "4px 0", fontSize: "13.5px", color: "#14532d" }}>
                  <strong>N° de Comprobante / Boleta:</strong> {solicitudVerDetalle.comprobantePago || solicitudVerDetalle.numeroOperacion || `BOL-CAJA-2026-${solicitudVerDetalle.id}`}
                </p>
                {solicitudVerDetalle.fechaPago && (
                  <p style={{ margin: "4px 0", fontSize: "13.5px", color: "#14532d" }}>
                    <strong>Fecha y Hora de Pago:</strong> {solicitudVerDetalle.fechaPago}
                  </p>
                )}
                {solicitudVerDetalle.cajeraResponsable && (
                  <p style={{ margin: "4px 0", fontSize: "13.5px", color: "#14532d" }}>
                    <strong>Cajero Responsable:</strong> {solicitudVerDetalle.cajeraResponsable}
                  </p>
                )}
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
                        <button
                          type="button"
                          onClick={() => setDocumentoPdfVisor(pdf)}
                          style={{ padding: "6px 12px", background: "#2563eb", color: "white", border: "none", borderRadius: "6px", fontSize: "12.5px", fontWeight: "bold", cursor: "pointer" }}
                        >
                          👁️ Ver Documento
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="admin-form-actions" style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
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

      {/* MODAL VERIFICACIÓN DE BOLETA / COMPROBANTE DE VENTA ELECTRÓNICO */}
      {solicitudVerBoleta && (
        <div className="admin-form-modal" style={{ zIndex: 1100 }}>
          <div className="admin-form-card" style={{ maxWidth: "680px", maxHeight: "90vh", overflowY: "auto", padding: "24px" }}>
            <div className="admin-form-header" style={{ marginBottom: "20px" }}>
              <h3>🧾 Comprobante de Venta Electrónico — EXP-{String(solicitudVerBoleta.id).replace(/^EXP-/, "")}</h3>
              <button type="button" onClick={() => setSolicitudVerBoleta(null)}>✕</button>
            </div>

            {/* ESTILO DE IMPRESIÓN EXCLUSIVA */}
            <style>{`
              @media print {
                body * {
                  visibility: hidden !important;
                }
                #comprobante-modal-impresion, #comprobante-modal-impresion * {
                  visibility: visible !important;
                }
                #comprobante-modal-impresion {
                  position: absolute !important;
                  left: 0 !important;
                  top: 0 !important;
                  width: 100% !important;
                  max-width: 100% !important;
                  border: 2px solid #0f172a !important;
                  box-shadow: none !important;
                  margin: 0 !important;
                  padding: 20px !important;
                }
              }
            `}</style>

            {/* COMPROBANTE OFICIAL ESTILO SUNAT */}
            <div id="comprobante-modal-impresion" style={{ background: "#ffffff", border: "2px solid #0f172a", borderRadius: "14px", padding: "24px", textAlign: "left", boxShadow: "0 4px 16px rgba(0,0,0,0.06)", marginBottom: "20px" }}>
              {/* ENCABEZADO MUNICIPAL */}
              <div style={{ background: "#0f172a", color: "white", padding: "16px 20px", borderRadius: "8px", textAlign: "center", marginBottom: "20px" }}>
                <h2 style={{ margin: 0, fontSize: "18px", fontWeight: "900", letterSpacing: "0.5px" }}>MUNICIPALIDAD PROVINCIAL DE TRUJILLO</h2>
                <span style={{ fontSize: "11px", opacity: 0.9, textTransform: "uppercase", fontWeight: "bold", letterSpacing: "0.5px", display: "block", marginTop: "2px", color: "#cbd5e1" }}>
                  Módulo de Atención y Caja Municipal
                </span>
                <span style={{ fontSize: "10.5px", opacity: 0.75, display: "block", marginTop: "2px", color: "#94a3b8" }}>RUC: 20145532000 — Jr. Diego de Almagro N° 525, Trujillo</span>
              </div>

              {/* NUMERACIÓN DE COMPROBANTE */}
              <div style={{ border: "2px solid #0f172a", padding: "12px 18px", textAlign: "center", borderRadius: "8px", background: "#f8fafc", marginBottom: "20px" }}>
                <span style={{ fontWeight: "900", fontSize: "15px", display: "block", color: "#0f172a", letterSpacing: "0.5px" }}>
                  {(solicitudVerBoleta.tipoComprobante || ((solicitudVerBoleta.comprobantePago || "").includes("FACTURA") ? "FACTURA ELECTRÓNICA" : "BOLETA DE VENTA ELECTRÓNICA")).toUpperCase()}
                </span>
                <span style={{ fontSize: "17px", fontWeight: "900", color: "#dc2626" }}>
                  N° {solicitudVerBoleta.numeroOperacion || solicitudVerBoleta.comprobantePago || `B001-${String(solicitudVerBoleta.id).replace(/^EXP-/, "")}`}
                </span>
                <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#475569" }}>Fecha y Hora: {solicitudVerBoleta.fechaPago || solicitudVerBoleta.fechaSolicitud || "21/07/2026 22:15"}</p>
              </div>

              {/* DATOS CONTRIBUYENTE Y EXPEDIENTE */}
              <div style={{ background: "#f8fafc", border: "1px solid #cbd5e1", borderRadius: "10px", padding: "16px", marginBottom: "20px" }}>
                <h4 style={{ margin: "0 0 10px", color: "#0f172a", fontSize: "14px", fontWeight: "800", borderBottom: "1px solid #e2e8f0", paddingBottom: "6px" }}>
                  🏢 Información del Contribuyente y Establecimiento
                </h4>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "13px" }}>
                  <p style={{ margin: 0 }}><strong>Código Expediente:</strong> EXP-{String(solicitudVerBoleta.id).replace(/^EXP-/, "")}</p>
                  <p style={{ margin: 0 }}><strong>RUC Contribuyente:</strong> {solicitudVerBoleta.ruc}</p>
                  <p style={{ margin: 0 }}><strong>Razón Social / Empresa:</strong> {solicitudVerBoleta.razonSocial || solicitudVerBoleta.nombreNegocio}</p>
                  <p style={{ margin: 0 }}><strong>Nombre Comercial:</strong> {solicitudVerBoleta.nombreNegocio}</p>
                  <p style={{ margin: 0 }}><strong>Representante Legal:</strong> {[solicitudVerBoleta.nombresSolicitante, solicitudVerBoleta.apellidosSolicitante, solicitudVerBoleta.nombreSolicitante].filter(Boolean).join(" ") || "---"}</p>
                  <p style={{ margin: 0 }}><strong>DNI Representante:</strong> {solicitudVerBoleta.dniSolicitante || solicitudVerBoleta.dni || "---"}</p>
                  <p style={{ margin: 0, gridColumn: "span 2" }}><strong>Dirección Fiscal:</strong> {solicitudVerBoleta.direccion}</p>
                </div>
              </div>

              {/* GRILLA TABULAR */}
              <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "16px", fontSize: "13px" }}>
                <thead>
                  <tr style={{ background: "#0f172a", color: "white" }}>
                    <th style={{ padding: "10px", textTransform: "uppercase", textAlign: "center", width: "12%" }}>CANT</th>
                    <th style={{ padding: "10px", textTransform: "uppercase", textAlign: "left" }}>DESCRIPCIÓN</th>
                    <th style={{ padding: "10px", textTransform: "uppercase", textAlign: "right", width: "20%" }}>P. UNIT</th>
                    <th style={{ padding: "10px", textTransform: "uppercase", textAlign: "right", width: "20%" }}>IMPORTE</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: "1px solid #cbd5e1" }}>
                    <td style={{ padding: "12px", textAlign: "center", fontWeight: "bold" }}>1</td>
                    <td style={{ padding: "12px" }}>
                      <strong>Derecho de Trámite — {solicitudVerBoleta.tipoTramite || "Nueva Licencia de Funcionamiento"}</strong>
                      <small style={{ display: "block", color: "#64748b" }}>Expediente N° EXP-{String(solicitudVerBoleta.id).replace(/^EXP-/, "")}</small>
                    </td>
                    <td style={{ padding: "12px", textAlign: "right" }}>S/ {Number(solicitudVerBoleta.montoPagado || MONTO_TRAMITE).toFixed(2)}</td>
                    <td style={{ padding: "12px", textAlign: "right", fontWeight: "800", color: "#0f172a" }}>S/ {Number(solicitudVerBoleta.montoPagado || MONTO_TRAMITE).toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>

              {/* TOTAL EN LETRAS Y RESUMEN FINANCIERO */}
              <div style={{ background: "#f8fafc", padding: "14px", borderRadius: "10px", border: "1px solid #cbd5e1", marginBottom: "16px" }}>
                <p style={{ margin: "0 0 10px", fontWeight: "800", fontSize: "13px", color: "#0f172a" }}>
                  {convertirNumeroALetras(solicitudVerBoleta.montoPagado || MONTO_TRAMITE)}
                </p>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #cbd5e1", paddingTop: "10px" }}>
                  <div style={{ fontSize: "12.5px", color: "#475569" }}>
                    <span>OP. GRAVADA: <strong>S/ 2.54</strong></span> &nbsp;|&nbsp; 
                    <span>I.G.V. (18%): <strong>S/ 0.46</strong></span>
                  </div>
                  <div style={{ fontSize: "16px", fontWeight: "900", color: "#16a34a" }}>
                    TOTAL PAGADO: S/ {Number(solicitudVerBoleta.montoPagado || MONTO_TRAMITE).toFixed(2)}
                  </div>
                </div>
              </div>

              {/* CONDICIONES DE PAGO Y ATENCIÓN EN CAJA */}
              <div style={{ background: "#f8fafc", border: "1px solid #cbd5e1", borderRadius: "10px", padding: "14px", marginBottom: "20px", fontSize: "12.5px", color: "#334155" }}>
                <h4 style={{ margin: "0 0 8px", color: "#0f172a", fontSize: "13px", fontWeight: "800", borderBottom: "1px solid #e2e8f0", paddingBottom: "4px" }}>
                  💳 Detalles de Pago y Atención en Caja
                </h4>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                  <p style={{ margin: 0 }}><strong>Método de Pago:</strong> {(solicitudVerBoleta.metodoPago || "EFECTIVO EN CAJA MUNICIPAL").toUpperCase()}</p>
                  <p style={{ margin: 0 }}><strong>Estado del Pago:</strong> <span style={{ color: "#16a34a", fontWeight: "bold" }}>Pago confirmado</span></p>
                  <p style={{ margin: 0 }}><strong>Cajero(a) Responsable:</strong> {(solicitudVerBoleta.cajeraResponsable || solicitudVerBoleta.usuarioCajero || "MARÍA LÓPEZ (CAJ-001)").toUpperCase()}</p>

                  {String(solicitudVerBoleta.metodoPago || "").toLowerCase().includes("efectivo") ? (
                    <>
                      <p style={{ margin: 0 }}><strong>Monto Recibido:</strong> S/ {Number(solicitudVerBoleta.montoRecibido || 10.00).toFixed(2)}</p>
                      <p style={{ margin: 0, gridColumn: "span 2", color: "#16a34a", fontWeight: "bold" }}><strong>Vuelto Entregado:</strong> S/ {Number(solicitudVerBoleta.vuelto || (Number(solicitudVerBoleta.montoRecibido || 10.00) - Number(solicitudVerBoleta.montoPagado || 3.00))).toFixed(2)}</p>
                    </>
                  ) : (
                    <p style={{ margin: 0 }}><strong>N° Operación / Transacción:</strong> {solicitudVerBoleta.numeroOperacion || solicitudVerBoleta.comprobantePago || "TX-2026-001"}</p>
                  )}
                </div>
              </div>

              {/* MENSAJE OFICIAL Y QR */}
              <div style={{ borderTop: "1.5px solid #cbd5e1", paddingTop: "14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: "12px", color: "#475569", maxWidth: "430px" }}>
                  <p style={{ margin: "0 0 6px", color: "#166534", fontWeight: "800", fontSize: "12.5px" }}>
                    ✓ La solicitud fue enviada correctamente para revisión / inspección municipal.
                  </p>
                  <p style={{ margin: "0 0 2px", fontWeight: "bold" }}>Representación impresa del comprobante de venta electrónico SUNAT.</p>
                  <small style={{ color: "#64748b", display: "block" }}>Verificación Hash: MUNI-TRU-2026-98432-OK</small>
                </div>
                
                {/* CÓDIGO QR DE VERIFICACIÓN */}
                <div style={{ border: "1px solid #0f172a", padding: "6px", borderRadius: "8px", background: "white", textAlign: "center" }}>
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=90x90&data=${encodeURIComponent(`MUNICIPALIDAD PROVINCIAL DE TRUJILLO|RUC:20145532000|COMP:${solicitudVerBoleta.numeroOperacion || solicitudVerBoleta.id}|EXP:${solicitudVerBoleta.id}|TOTAL:S/${Number(solicitudVerBoleta.montoPagado || 3.00).toFixed(2)}`)}`}
                    alt="Código QR Comprobante"
                    style={{ width: "80px", height: "80px", display: "block" }}
                  />
                  <span style={{ fontSize: "9px", fontWeight: "bold", color: "#0f172a", display: "block", marginTop: "2px" }}>QR VERIFICACIÓN</span>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
              <button
                type="button"
                onClick={() => window.print()}
                style={{ padding: "10px 20px", background: "#0f766e", color: "white", border: "none", borderRadius: "8px", fontWeight: "bold", fontSize: "14px", cursor: "pointer" }}
              >
                🖨️ Imprimir Boleta
              </button>
              <button
                type="button"
                onClick={() => setSolicitudVerBoleta(null)}
                style={{ padding: "10px 20px", background: "#64748b", color: "white", border: "none", borderRadius: "8px", fontWeight: "bold", fontSize: "14px", cursor: "pointer" }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL PROCESAR PAGO EN CAJA MUNICIPAL */}
      {solicitudCobro && (
        <div className="admin-form-modal" style={{ zIndex: 1000 }}>
          <div className="admin-form-card" style={{ maxWidth: "540px" }}>
            <div className="admin-form-header">
              <h3>💳 Registrar Pago de Trámite — EXP-{String(solicitudCobro.id).replace(/^EXP-/, "")}</h3>
              <button type="button" onClick={() => setSolicitudCobro(null)}>✕</button>
            </div>

            <div style={{ padding: "16px 0" }}>
              <div style={{ background: "#f8fafc", padding: "14px", borderRadius: "10px", border: "1px solid #e2e8f0", marginBottom: "16px" }}>
                <p style={{ margin: "0 0 6px", fontSize: "13.5px", color: "#334155" }}>
                  <strong>Contribuyente:</strong> {solicitudCobro.razonSocial || solicitudCobro.nombreNegocio} (RUC: {solicitudCobro.ruc})
                </p>
                <p style={{ margin: "0 0 6px", fontSize: "13.5px", color: "#334155" }}>
                  <strong>Representante Legal / Solicitante:</strong> {[solicitudCobro.nombresSolicitante, solicitudCobro.apellidosSolicitante, solicitudCobro.nombreSolicitante].filter(Boolean).join(" ") || "---"}
                </p>
                <p style={{ margin: "0 0 6px", fontSize: "13.5px", color: "#334155" }}>
                  <strong>DNI del Representante:</strong> {solicitudCobro.dniSolicitante || solicitudCobro.dni || "---"}
                </p>
                <p style={{ margin: "0 0 6px", fontSize: "13.5px", color: "#334155" }}>
                  <strong>Cajera Responsable:</strong> {usuario?.nombre || usuario?.email || "Cajera de Ventanilla (CAJ-01)"}
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
                  style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "14px", fontWeight: "bold" }}
                >
                  <option value="Efectivo en Caja Municipal">💵 Efectivo en Caja Municipal</option>
                  <option value="Billetera Digital (Yape / Plin)">📱 Billetera Digital (Yape / Plin)</option>
                  <option value="Tarjeta de Crédito / Débito">💳 Tarjeta de Crédito / Débito</option>
                  <option value="Pago Online Real con Flow (Flow.cl)">🌐 Pago Online Real con Flow (Flow.cl)</option>
                </select>
              </div>

              {/* LÓGICA DE COBRO SEGÚN MÉTODO DE PAGO: EFECTIVO VS TARJETA/DIGITAL */}
              {metodoPagoSeleccionado.toLowerCase().includes("efectivo") ? (
                <div style={{ background: "#fffbeb", border: "1.5px solid #fde68a", padding: "16px", borderRadius: "12px", marginBottom: "16px" }}>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: "bold", color: "#92400e", marginBottom: "6px" }}>
                    💵 Monto Recibido del Ciudadano (S/) *
                  </label>
                  <input
                    type="number"
                    step="0.10"
                    min="3.00"
                    placeholder="Ej. 10.00"
                    value={montoRecibidoInput}
                    onChange={(e) => setMontoRecibidoInput(e.target.value)}
                    style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1.5px solid #d97706", fontSize: "16px", fontWeight: "800", color: "#0f172a", background: "white" }}
                  />

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginTop: "12px", background: "white", padding: "12px", borderRadius: "8px", border: "1px solid #fcd34d", textAlign: "center" }}>
                    <div>
                      <small style={{ color: "#64748b", fontWeight: "bold", fontSize: "10.5px" }}>TOTAL A PAGAR</small>
                      <p style={{ margin: "2px 0 0", fontWeight: "800", fontSize: "14.5px", color: "#0f172a" }}>S/ {MONTO_TRAMITE.toFixed(2)}</p>
                    </div>
                    <div>
                      <small style={{ color: "#64748b", fontWeight: "bold", fontSize: "10.5px" }}>MONTO RECIBIDO</small>
                      <p style={{ margin: "2px 0 0", fontWeight: "800", fontSize: "14.5px", color: "#2563eb" }}>
                        S/ {(parseFloat(montoRecibidoInput) || 0).toFixed(2)}
                      </p>
                    </div>
                    <div>
                      <small style={{ color: "#64748b", fontWeight: "bold", fontSize: "10.5px" }}>VUELTO</small>
                      <p style={{ margin: "2px 0 0", fontWeight: "800", fontSize: "14.5px", color: (parseFloat(montoRecibidoInput) || 0) >= MONTO_TRAMITE ? "#16a34a" : "#dc2626" }}>
                        S/ {Math.max(0, (parseFloat(montoRecibidoInput) || 0) - MONTO_TRAMITE).toFixed(2)}
                      </p>
                    </div>
                  </div>

                  {(parseFloat(montoRecibidoInput) || 0) < MONTO_TRAMITE && (
                    <div style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fca5a5", padding: "8px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: "bold", marginTop: "10px", textAlign: "center" }}>
                      ⚠️ El monto recibido es menor al total a pagar (S/ {MONTO_TRAMITE.toFixed(2)}). Por favor ingrese un monto suficiente.
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ background: "#eff6ff", border: "1.5px solid #bfdbfe", padding: "14px 16px", borderRadius: "10px", marginBottom: "16px" }}>
                  <p style={{ margin: "2px 0", fontSize: "13px", color: "#1e3a8a" }}><strong>Método de Pago:</strong> {metodoPagoSeleccionado}</p>
                  <p style={{ margin: "2px 0", fontSize: "13px", color: "#1e3a8a" }}><strong>Estado del Pago:</strong> <span style={{ color: "#16a34a", fontWeight: "bold" }}>Pago confirmado</span></p>
                  <p style={{ margin: "2px 0", fontSize: "13.5px", color: "#1e3a8a" }}><strong>Código de Transacción:</strong> TX-{Date.now().toString().slice(-8)}</p>
                  <p style={{ margin: "2px 0", fontSize: "12.5px", color: "#64748b" }}>Fecha y Hora: {formatearFechaHora()}</p>
                </div>
              )}

              {/* SECCIÓN PROGRAMACIÓN DE INSPECCIÓN — SOLO LECTURA */}
              <div style={{ background: "#f0fdf4", padding: "14px", borderRadius: "10px", border: "1px solid #bbf7d0", marginBottom: "16px" }}>
                <h4 style={{ margin: "0 0 10px", color: "#166534", fontSize: "14px", display: "flex", alignItems: "center", gap: "6px" }}>
                  📅 Programación Automática de Inspección Técnica
                </h4>
                <div style={{ background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: "8px", padding: "8px 12px", marginBottom: "12px", fontSize: "12px", color: "#065f46", display: "flex", alignItems: "center", gap: "6px" }}>
                  🔒 Asignación automática — Solo lectura
                </div>

                {sinDisponibilidadInspeccion ? (
                  <div style={{ padding: "14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", color: "#991b1b", fontSize: "13.5px", textAlign: "center" }}>
                    ⚠️ No fue posible programar la inspección. No hay disponibilidad en los próximos 30 días hábiles.
                  </div>
                ) : (
                  <>
                    <div style={{ marginBottom: "10px" }}>
                      <label style={{ display: "block", fontSize: "12px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>Fecha de Inspección</label>
                      <input
                        type="text"
                        value={fechaInspeccion || ""}
                        readOnly
                        style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #d1d5db", fontSize: "13.5px", fontWeight: "bold", background: "#f9fafb", cursor: "not-allowed", color: "#111827" }}
                      />
                    </div>
                    <div style={{ marginBottom: "10px" }}>
                      <label style={{ display: "block", fontSize: "12px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>Horario</label>
                      <input
                        type="text"
                        value={TIME_SLOTS.find((s) => s.value === slotInspeccion)?.label || slotInspeccion || ""}
                        readOnly
                        style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #d1d5db", fontSize: "13.5px", fontWeight: "bold", background: "#f9fafb", cursor: "not-allowed", color: "#111827" }}
                      />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: "12px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>Inspector Asignado</label>
                      {inspectorElegido ? (
                        <div style={{ padding: "10px 14px", borderRadius: "10px", border: "1.5px solid #16a34a", background: "#f0fdf4" }}>
                          <strong style={{ color: "#166534", fontSize: "13.5px" }}>{inspectorElegido.nombre}</strong>
                          <span style={{ display: "block", fontSize: "11.5px", color: "#64748b" }}>{inspectorElegido.cargo}</span>
                        </div>
                      ) : (
                        <div style={{ padding: "10px 14px", borderRadius: "10px", border: "1.5px solid #fca5a5", background: "#fef2f2", textAlign: "center" }}>
                          <span style={{ color: "#991b1b", fontWeight: "700", fontSize: "13px" }}>⚠️ No hay inspectores disponibles.</span>
                        </div>
                      )}
                    </div>
                  </>
                )}
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
                disabled={
                  procesando ||
                  !inspectorElegido ||
                  (metodoPagoSeleccionado.toLowerCase().includes("efectivo") && (parseFloat(montoRecibidoInput) || 0) < MONTO_TRAMITE)
                }
                style={{
                  background:
                    inspectorElegido &&
                    (!metodoPagoSeleccionado.toLowerCase().includes("efectivo") || (parseFloat(montoRecibidoInput) || 0) >= MONTO_TRAMITE)
                      ? "#16a34a"
                      : "#cbd5e1",
                  color: "white"
                }}
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
                      <option value="Billetera Digital (Yape / Plin)">📱 Billetera Digital (Yape / Plin)</option>
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
                        border: fechaInspeccion && !esFechaValidaParaInspeccion(fechaInspeccion) ? "1.5px solid #dc2626" : "1px solid #cbd5e1",
                        fontSize: "13.5px", fontWeight: "bold"
                      }}
                    />
                    {fechaInspeccion && !esFechaValidaParaInspeccion(fechaInspeccion) && (
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
      {/* MODAL RENOVACIÓN DIRECTA EN VENTANILLA / CAJA MUNICIPAL */}
      {solicitudRenovacion && (
        <div className="admin-form-modal" style={{ zIndex: 1000 }}>
          <div className="admin-form-card" style={{ maxWidth: "580px" }}>
            <div className="admin-form-header" style={{ background: "#d97706", color: "white" }}>
              <div>
                <h3 style={{ color: "white", margin: 0 }}>🔄 Renovación de Licencia Municipal</h3>
                <small style={{ color: "#fef3c7" }}>Expediente EXP-{String(solicitudRenovacion.id).replace(/^EXP-/, "")}</small>
              </div>
              <button type="button" onClick={() => setSolicitudRenovacion(null)} style={{ color: "white", background: "none", border: "none", fontSize: "18px", cursor: "pointer" }}>✕</button>
            </div>

            <div style={{ padding: "20px" }}>
              <div style={{ background: "#fffbe6", border: "1.5px solid #ffe58f", padding: "16px", borderRadius: "10px", marginBottom: "16px", fontSize: "13px", color: "#873800" }}>
                <h4 style={{ margin: "0 0 6px", color: "#d46b08" }}>🏢 Información de la Licencia a Renovar</h4>
                <p style={{ margin: "3px 0" }}><strong>Nombre Comercial:</strong> {solicitudRenovacion.nombreNegocio}</p>
                <p style={{ margin: "3px 0" }}><strong>RUC del Establecimiento:</strong> {solicitudRenovacion.ruc}</p>
                <p style={{ margin: "3px 0" }}><strong>Titular:</strong> {solicitudRenovacion.nombreSolicitante || `${solicitudRenovacion.nombresSolicitante || ""} ${solicitudRenovacion.apellidosSolicitante || ""}`}</p>
                <p style={{ margin: "3px 0", color: "#dc2626", fontWeight: "bold" }}>
                  <strong>Fecha Vencimiento Actual:</strong> {calcularEstadoLicenciaVencimiento(solicitudRenovacion).fechaVencimientoStr}
                </p>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "12.5px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>Tipo de Comprobante *</label>
                  <select
                    value={tipoComprobanteSeleccionado}
                    onChange={(e) => setTipoComprobanteSeleccionado(e.target.value)}
                    style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13.5px", fontWeight: "bold" }}
                  >
                    <option value="Boleta">📄 Boleta de Venta Electrónica (B001)</option>
                    <option value="Factura">🧾 Factura Electrónica (F001)</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "12.5px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>Método de Pago *</label>
                  <select
                    value={metodoPagoSeleccionado}
                    onChange={(e) => setMetodoPagoSeleccionado(e.target.value)}
                    style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13.5px", fontWeight: "bold" }}
                  >
                    <option value="Billetera Digital (Yape / Plin)">📱 Billetera Digital (Yape / Plin)</option>
                    <option value="Efectivo en Caja Municipal">💵 Efectivo en Caja Municipal</option>
                  </select>
                </div>
              </div>

              <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", padding: "14px", borderRadius: "10px", marginBottom: "20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <span style={{ fontSize: "12px", color: "#64748b", fontWeight: "bold" }}>TASA DE RENOVACIÓN DE LICENCIA</span>
                  <h3 style={{ margin: "2px 0 0", color: "#16a34a", fontSize: "24px", fontWeight: "800" }}>S/ {MONTO_TRAMITE.toFixed(2)}</h3>
                </div>
                <div style={{ textAlign: "right", fontSize: "12px", color: "#475569" }}>
                  <p style={{ margin: "2px 0" }}>Vigencia adicional: <strong style={{ color: "#16a34a" }}>+1 Año</strong></p>
                </div>
              </div>

              <div className="admin-form-actions" style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  type="button"
                  onClick={() => setSolicitudRenovacion(null)}
                  disabled={procesando}
                  style={{ padding: "10px 18px", background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: "8px", fontWeight: "bold", cursor: "pointer" }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => ejecutarRenovacionDirecta(solicitudRenovacion)}
                  disabled={procesando}
                  style={{ background: "#d97706", color: "white", padding: "10px 20px", borderRadius: "8px", fontWeight: "bold", border: "none", cursor: "pointer" }}
                >
                  {procesando ? "Procesando Renovación..." : "💰 Confirmar Pago (S/ 3.00) y Renovar Licencia"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL VISOR INCORPORADO DE DOCUMENTOS PDF E IMÁGENES */}
      {documentoPdfVisor && (
        <VisualizadorDocumentoModal
          documento={documentoPdfVisor}
          onCerrar={() => setDocumentoPdfVisor(null)}
        />
      )}
    </div>
  );
}

export default PanelCajero;
