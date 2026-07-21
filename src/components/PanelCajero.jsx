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
} from "../config/inspeccionConfig";

const MONTO_TRAMITE = 3.0;

const INSPECTORES_DEFAULT = [
  { uid: "INSP-001", nombre: "Inspector Carlos Ramírez", correo: "inspector@munitrujillo.gob.pe", cargo: "Inspector Municipal de Seguridad Edil" },
];

function PanelCajero({ seccion, cambiarSeccion }) {
  const { usuario } = useAuth();
  const [solicitudes, setSolicitudes] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("todos"); // "todos", "pendiente", "pagado", "enviado", "anulado"
  const [solicitudCobro, setSolicitudCobro] = useState(null);
  const [solicitudVerDetalle, setSolicitudVerDetalle] = useState(null);
  const [metodoPagoSeleccionado, setMetodoPagoSeleccionado] = useState("Efectivo en caja");
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

  // ESTADOS DE ASIGNACIÓN E INSPECCIÓN DIRECTA
  const [inspectorElegido, setInspectorElegido] = useState(null);
  const [fechaInspeccion, setFechaInspeccion] = useState(formatearFechaLocal(new Date()));
  const [slotInspeccion, setSlotInspeccion] = useState("08:00");

  // ESTADOS PARA REGISTRO PRESENCIAL DE NUEVA SOLICITUD
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
  const [estadoSunat, setEstadoSunat] = useState("");
  const [condicionSunat, setCondicionSunat] = useState("");

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

  // CONSULTAR SUNAT (RUC) EN PRESENCIAL
  const manejarConsultarRucPresencial = async () => {
    if (!rucForm || rucForm.length !== 11) {
      alert("⚠️ Ingrese un RUC válido de 11 dígitos.");
      return;
    }
    setConsultandoRuc(true);
    try {
      const res = await consultarRuc(rucForm);
      const rSoc = res.razonSocial || res.nombreComercial || "EMPRESA REGISTRADA S.A.C.";
      const nCom = res.nombreComercial || res.razonSocial || rSoc;
      const dir = res.direccion || res.direccionFiscal || "AV. ESPAÑA NRO. 123 - TRUJILLO";
      const est = res.estado || "ACTIVO";
      const cond = res.condicion || "HABIDO";

      // Inferir giro comercial según actividad económica obtenida de SUNAT
      let giroInferido = res.giro || "general";
      const act = String(res.actividadEconomica || res.actividad || "").toLowerCase();
      if (act.includes("restaurante") || act.includes("comida") || act.includes("gastronom")) giroInferido = "restaurante";
      else if (act.includes("farmacia") || act.includes("botic") || act.includes("medic")) giroInferido = "farmacia";
      else if (act.includes("oficina") || act.includes("consultor") || act.includes("servicios")) giroInferido = "oficina";
      else if (act.includes("tienda") || act.includes("bodega") || act.includes("comerc")) giroInferido = "comercial";
      else if (act.includes("hotel") || act.includes("hospedaje")) giroInferido = "hotel";

      setRazonSocialForm(rSoc);
      setNombreNegocioForm(nCom);
      setDireccionForm(dir);
      setEstadoSunat(est);
      setCondicionSunat(cond);
      setGiroForm(giroInferido);
      setRucValidado(true);
    } catch (err) {
      console.error(err);
      alert("Error al consultar SUNAT: " + err.message);
      setRucValidado(false);
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
  const paso3Completado = paso2Completado && rucValidado && Boolean(nombreNegocioForm) && Boolean(direccionForm);

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

  // BUSQUEDA Y FILTRADO AVANZADO POR CÓDIGO, DNI, RUC, NOMBRE Y FILTRO DE ESTADO
  const solicitudesFiltradas = useMemo(() => {
    const lista = Array.isArray(solicitudes) ? solicitudes : [];
    return lista.filter((s) => {
      if (!s) return false;

      // 1. Filtro por Estado Select
      const estPago = String(s.estadoPago || "").toLowerCase();
      const estGen = String(s.estado || "").toLowerCase();

      if (filtroEstado === "pendiente") {
        if (estPago === "confirmado" || estGen.includes("pagado") || estGen.includes("anulado")) return false;
      } else if (filtroEstado === "pagado") {
        if (estPago !== "confirmado" && !estGen.includes("pagado")) return false;
      } else if (filtroEstado === "enviado") {
        if (!estGen.includes("inspeccion") && !estGen.includes("enviado") && !estGen.includes("aprobado")) return false;
      } else if (filtroEstado === "anulado") {
        if (!estGen.includes("anulado") && !estGen.includes("rechazado")) return false;
      }

      // 2. Filtro por Búsqueda (Código, DNI, RUC, Nombres, Razón Social)
      if (!busqueda || !busqueda.trim()) return true;
      const q = busqueda.toLowerCase().trim();
      const dni = String(s.dniSolicitante || s.dni || "").toLowerCase();
      const idExp = String(s.id || "").toLowerCase();
      const codExp = `exp-${idExp}`;
      const ruc = String(s.ruc || "").toLowerCase();
      const razonSocial = String(s.razonSocial || "").toLowerCase();
      const nombreSol = String([s.nombresSolicitante, s.apellidosSolicitante, s.nombreSolicitante, s.nombreNegocio].filter(Boolean).join(" ")).toLowerCase();

      return dni.includes(q) || idExp.includes(q) || codExp.includes(q) || ruc.includes(q) || nombreSol.includes(q) || razonSocial.includes(q);
    });
  }, [solicitudes, filtroEstado, busqueda]);

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

      setComprobanteGenerado(solicitudCompleta);
      setMostrarModalNuevaSolicitud(false);
      
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

      alert(`✅ ¡Registro Presencial Exitoso! Expediente EXP-${solicitudCompleta.id} cobrado y derivado a ${inspectorElegido.nombre} para el ${fechaInspeccion}.`);
      await cargarSolicitudes();

      if (cambiarSeccion) {
        cambiarSeccion("consulta-expedientes");
      }
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

      {/* VISTA 1: NUEVA SOLICITUD PRESENCIAL DIRECTA (WIZARD SECUENCIAL DE 7 PASOS) */}
      {seccion === "nueva-solicitud" && (
        <section className="section-card">
          <div className="section-header" style={{ background: "linear-gradient(135deg, #16a34a 0%, #065f46 100%)", color: "white", padding: "16px 20px", borderRadius: "10px", marginBottom: "20px" }}>
            <h3 style={{ margin: 0, color: "white", fontSize: "18px" }}>➕ Registro Presencial de Solicitud de Licencia Municipal (Paso a Paso)</h3>
            <p style={{ margin: "4px 0 0", color: "#e2e8f0", fontSize: "13px" }}>Flujo secuencial obligatorio: complete cada paso en orden para desbloquear las etapas posteriores y finalizar el expediente.</p>
          </div>

          {/* BARRA DE PROGRESO GLOBAL DEL WIZARD (7 PASOS) */}
          <div style={{ background: "#f8fafc", padding: "16px 20px", borderRadius: "12px", border: "1px solid #cbd5e1", marginBottom: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
              <h4 style={{ margin: 0, color: "#1e293b", fontSize: "14.5px", fontWeight: "bold" }}>
                📊 Progreso del Trámite Presencial: {pasosCompletadosCount} de 7 Pasos ({porcentajeProgreso}%)
              </h4>
              <span style={{ background: porcentajeProgreso === 100 ? "#dcfce7" : "#e0f2fe", color: porcentajeProgreso === 100 ? "#15803d" : "#0369a1", padding: "4px 12px", borderRadius: "8px", fontSize: "12px", fontWeight: "bold" }}>
                {porcentajeProgreso === 100 ? "✅ ¡Listo para Registrar!" : "🟡 Flujo Secuencial En Proceso"}
              </span>
            </div>

            <div style={{ height: "10px", width: "100%", background: "#e2e8f0", borderRadius: "5px", overflow: "hidden", marginBottom: "14px" }}>
              <div
                style={{
                  height: "100%",
                  width: `${porcentajeProgreso}%`,
                  background: porcentajeProgreso === 100 ? "linear-gradient(90deg, #16a34a, #059669)" : "linear-gradient(90deg, #2563eb, #0d9488)",
                  transition: "width 0.4s ease"
                }}
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: "6px" }}>
              {[
                { n: 1, title: "1. RENIEC" },
                { n: 2, title: "2. Contacto" },
                { n: 3, title: "3. SUNAT" },
                { n: 4, title: "4. Documentos" },
                { n: 5, title: "5. Pago Tasa" },
                { n: 6, title: "6. Inspección" },
                { n: 7, title: "7. Finalizar" }
              ].map((step) => {
                const st = obtenerEstadoPaso(step.n);
                return (
                  <div
                    key={step.n}
                    style={{
                      padding: "8px 6px",
                      textAlign: "center",
                      borderRadius: "8px",
                      background: st.bg,
                      color: st.color,
                      fontSize: "11.5px",
                      fontWeight: "bold",
                      border: `1px solid ${st.color}30`
                    }}
                  >
                    {st.icono} {step.title}
                    <span style={{ display: "block", fontSize: "10px", marginTop: "2px", opacity: 0.9 }}>{st.texto}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <form onSubmit={ejecutarRegistroPresencialCompleto}>
            {/* PASO 1: VALIDACIÓN RENIEC (OBLIGATORIO) */}
            <div style={{ background: "#f8fafc", padding: "16px", borderRadius: "10px", border: "1px solid #cbd5e1", marginBottom: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                <h4 style={{ margin: 0, color: "#166534", fontSize: "14.5px" }}>👤 Paso 1: Validación RENIEC (Obligatorio)</h4>
                <span style={{ background: paso1Completado ? "#dcfce7" : "#fef3c7", color: paso1Completado ? "#15803d" : "#b45309", padding: "3px 10px", borderRadius: "6px", fontSize: "12px", fontWeight: "bold" }}>
                  {paso1Completado ? "✅ Completado" : "🟡 En Proceso (Consulta DNI)"}
                </span>
              </div>
              
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "10px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "12.5px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>DNI del Titular (8 dígitos) *</label>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <input
                      type="text"
                      maxLength={8}
                      placeholder="DNI (8 dígitos)"
                      value={dniForm}
                      onChange={(e) => {
                        setDniForm(e.target.value.replace(/\D/g, "").slice(0, 8));
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
                      {consultandoDni ? "Buscando..." : dniValidado ? "✓ RENIEC OK" : "🔍 Consultar RENIEC"}
                    </button>
                  </div>
                </div>

                <div style={{ opacity: dniValidado ? 1 : 0.6 }}>
                  <label style={{ display: "block", fontSize: "12.5px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>🔒 Nombres (Oficial RENIEC - Solo Lectura) *</label>
                  <input
                    type="text"
                    placeholder="🔒 Se autocompleta consultando RENIEC"
                    value={nombresForm}
                    readOnly
                    onKeyDown={(e) => e.preventDefault()}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13.5px", background: "#f1f5f9", cursor: "not-allowed", fontWeight: "bold", color: "#1e293b" }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12.5px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>🔒 Apellidos (Oficial RENIEC - Solo Lectura) *</label>
                <input
                  type="text"
                  placeholder="🔒 Se autocompleta consultando RENIEC"
                  value={apellidosForm}
                  readOnly
                  onKeyDown={(e) => e.preventDefault()}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13.5px", background: "#f1f5f9", cursor: "not-allowed", fontWeight: "bold", color: "#1e293b" }}
                />
              </div>
            </div>

            {/* PASO 2: DATOS DE CONTACTO (HABILITADO TRAS PASO 1) */}
            <div style={{ background: paso1Completado ? "#f8fafc" : "#f1f5f9", padding: "16px", borderRadius: "10px", border: paso1Completado ? "1px solid #cbd5e1" : "1px dashed #cbd5e1", marginBottom: "16px", opacity: paso1Completado ? 1 : 0.7 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                <h4 style={{ margin: 0, color: paso1Completado ? "#166534" : "#64748b", fontSize: "14.5px" }}>📞 Paso 2: Datos de Contacto (Celular y Correo)</h4>
                <span style={{ background: paso2Completado ? "#dcfce7" : paso1Completado ? "#fef3c7" : "#f1f5f9", color: paso2Completado ? "#15803d" : paso1Completado ? "#b45309" : "#64748b", padding: "3px 10px", borderRadius: "6px", fontSize: "12px", fontWeight: "bold" }}>
                  {paso2Completado ? "✅ Completado" : !paso1Completado ? "🔒 Bloqueado" : "🟡 En Proceso"}
                </span>
              </div>

              {!paso1Completado && (
                <div style={{ background: "#fffbe3", color: "#b45309", padding: "10px 14px", borderRadius: "8px", border: "1px solid #fde68a", marginBottom: "12px", fontWeight: "bold", fontSize: "12.5px" }}>
                  🔒 Debe validar el DNI en RENIEC (Paso 1) para continuar.
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "12.5px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>
                    📱 Teléfono Celular (Perú - 9 dígitos) *
                  </label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    maxLength={9}
                    disabled={!paso1Completado}
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
                      border: (telefonoForm && !esTelefonoValido) ? "1px solid #dc2626" : "1px solid #cbd5e1",
                      fontSize: "13.5px",
                      fontWeight: "bold",
                      background: !paso1Completado ? "#e2e8f0" : "white"
                    }}
                  />
                  {telefonoForm && !esTelefonoValido && (
                    <small style={{ color: "#dc2626", fontSize: "11px", fontWeight: "bold", display: "block", marginTop: "2px" }}>
                      ⚠️ Debe ingresar un celular peruano válido de 9 dígitos que inicie con 9.
                    </small>
                  )}
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "12.5px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>
                    ✉️ Correo Electrónico de Notificaciones *
                  </label>
                  <input
                    type="email"
                    disabled={!paso1Completado}
                    placeholder="solicitante@correo.com"
                    value={correoForm}
                    onChange={(e) => setCorreoForm(e.target.value)}
                    required
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: "8px",
                      border: (correoForm && !esCorreoValido) ? "1px solid #dc2626" : "1px solid #cbd5e1",
                      fontSize: "13.5px",
                      background: !paso1Completado ? "#e2e8f0" : "white"
                    }}
                  />
                  {correoForm && !esCorreoValido && (
                    <small style={{ color: "#dc2626", fontSize: "11px", fontWeight: "bold", display: "block", marginTop: "2px" }}>
                      ⚠️ Ingrese un formato de correo electrónico válido.
                    </small>
                  )}
                </div>
              </div>
            </div>

            {/* PASO 3: VALIDACIÓN SUNAT (HABILITADO TRAS PASO 2) */}
            <div style={{ background: paso2Completado ? "#f8fafc" : "#f1f5f9", padding: "16px", borderRadius: "10px", border: paso2Completado ? "1px solid #cbd5e1" : "1px dashed #cbd5e1", marginBottom: "16px", opacity: paso2Completado ? 1 : 0.7 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                <h4 style={{ margin: 0, color: paso2Completado ? "#166534" : "#64748b", fontSize: "14.5px" }}>🏢 Paso 3: Validación SUNAT (Obligatorio)</h4>
                <span style={{ background: paso3Completado ? "#dcfce7" : paso2Completado ? "#fef3c7" : "#f1f5f9", color: paso3Completado ? "#15803d" : paso2Completado ? "#b45309" : "#64748b", padding: "3px 10px", borderRadius: "6px", fontSize: "12px", fontWeight: "bold" }}>
                  {paso3Completado ? `✓ SUNAT Validado (${estadoSunat || "ACTIVO"})` : !paso2Completado ? "🔒 Bloqueado" : "🟡 En Proceso (Consulta RUC)"}
                </span>
              </div>

              {!paso2Completado && (
                <div style={{ background: "#fffbe3", color: "#b45309", padding: "10px 14px", borderRadius: "8px", border: "1px solid #fde68a", marginBottom: "12px", fontWeight: "bold", fontSize: "12.5px" }}>
                  🔒 Debe validar el RUC en SUNAT para continuar.
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "10px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "12.5px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>RUC del Local (11 dígitos) *</label>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <input
                      type="text"
                      maxLength={11}
                      disabled={!paso2Completado}
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
                      }}
                      required
                      style={{ flex: 1, padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13.5px", fontWeight: "bold", background: !paso2Completado ? "#e2e8f0" : "white" }}
                    />
                    <button
                      type="button"
                      onClick={manejarConsultarRucPresencial}
                      disabled={!paso2Completado || consultandoRuc}
                      style={{ padding: "8px 12px", background: rucValidado ? "#16a34a" : !paso2Completado ? "#cbd5e1" : "#2563eb", color: "white", border: "none", borderRadius: "8px", fontSize: "12.5px", fontWeight: "bold", cursor: paso2Completado ? "pointer" : "not-allowed" }}
                    >
                      {consultandoRuc ? "Buscando..." : rucValidado ? "✓ SUNAT OK" : "🔍 Consultar SUNAT"}
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
                  onKeyDown={(e) => e.preventDefault()}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13.5px", background: "#f1f5f9", cursor: "not-allowed", fontWeight: "bold", color: "#1e293b" }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "12.5px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>🔒 Estado Contribuyente (SUNAT)</label>
                  <input
                    type="text"
                    readOnly
                    placeholder="🔒 Se autocompleta consultando SUNAT"
                    value={estadoSunat ? `✓ ${estadoSunat}` : ""}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13.5px", background: "#f1f5f9", cursor: "not-allowed", fontWeight: "bold", color: "#15803d" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "12.5px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>🔒 Condición Contribuyente (SUNAT)</label>
                  <input
                    type="text"
                    readOnly
                    placeholder="🔒 Se autocompleta consultando SUNAT"
                    value={condicionSunat ? `✓ ${condicionSunat}` : ""}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13.5px", background: "#f1f5f9", cursor: "not-allowed", fontWeight: "bold", color: "#15803d" }}
                  />
                </div>
              </div>
            </div>

            {/* PASO 4: DOCUMENTOS REQUERIDOS (HABILITADO TRAS PASO 3) */}
            <div style={{ background: paso3Completado ? "#fffbeb" : "#f1f5f9", padding: "16px", borderRadius: "10px", border: paso3Completado ? "1px solid #fde68a" : "1px dashed #cbd5e1", marginBottom: "16px", opacity: paso3Completado ? 1 : 0.7 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                <h4 style={{ margin: 0, color: paso3Completado ? "#b45309" : "#64748b", fontSize: "14.5px" }}>
                  📄 Paso 4: Carga de Documentos para: <u>{reqsDocInfo.giroLabel}</u>
                </h4>
                <span style={{ background: paso4Completado ? "#dcfce7" : paso3Completado ? "#fef3c7" : "#f1f5f9", color: paso4Completado ? "#15803d" : paso3Completado ? "#b45309" : "#64748b", padding: "3px 10px", borderRadius: "6px", fontSize: "12px", fontWeight: "bold" }}>
                  {paso4Completado ? "✅ Todos los Documentos Cargados" : !paso3Completado ? "🔒 Bloqueado" : "❌ Documento Pendiente"}
                </span>
              </div>

              {!paso3Completado && (
                <div style={{ background: "#fffbe3", color: "#b45309", padding: "10px 14px", borderRadius: "8px", border: "1px solid #fde68a", marginBottom: "12px", fontWeight: "bold", fontSize: "12.5px" }}>
                  🔒 Paso 4 Bloqueado: Debe consultar y validar el RUC en SUNAT (Paso 3) para habilitar los requisitos documentales.
                </div>
              )}

              <div style={{ display: "grid", gap: "10px" }}>
                {reqsDoc.map((docReq) => {
                  const subido = archivosPresenciales.find((a) => a.docId === docReq.id);
                  return (
                    <div key={docReq.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "white", borderRadius: "8px", border: "1px solid #cbd5e1" }}>
                      <div>
                        <strong style={{ fontSize: "13px", color: "#1e293b" }}>{docReq.nombre}</strong>
                        {docReq.obligatorio && <span style={{ color: "#dc2626", fontSize: "12px", marginLeft: "6px" }}>* Obligatorio</span>}
                        <div style={{ marginTop: "4px" }}>
                          {subido ? (
                            <span style={{ background: "#dcfce7", color: "#15803d", padding: "2px 8px", borderRadius: "6px", fontSize: "11.5px", fontWeight: "bold" }}>
                              ✓ Documento cargado: {subido.archivoNombre}
                            </span>
                          ) : docReq.obligatorio ? (
                            <span style={{ background: "#fee2e2", color: "#dc2626", padding: "2px 8px", borderRadius: "6px", fontSize: "11.5px", fontWeight: "bold" }}>
                              ❌ Documento obligatorio pendiente
                            </span>
                          ) : (
                            <span style={{ background: "#f1f5f9", color: "#64748b", padding: "2px 8px", borderRadius: "6px", fontSize: "11.5px" }}>
                              Opcional
                            </span>
                          )}
                        </div>
                      </div>

                      <input
                        type="file"
                        accept=".pdf,image/*"
                        disabled={!paso3Completado}
                        onChange={(e) => manejarArchivoPresencial(e, docReq.id, docReq.nombre)}
                        style={{ fontSize: "12px" }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* PASO 5: REGISTRO Y CONFIRMACIÓN DE PAGO (HABILITADO TRAS PASO 4) */}
            <div style={{ background: paso4Completado ? "#f0fdf4" : "#f1f5f9", padding: "16px", borderRadius: "10px", border: paso4Completado ? "1px solid #bbf7d0" : "1px dashed #cbd5e1", marginBottom: "16px", opacity: paso4Completado ? 1 : 0.7 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                <h4 style={{ margin: 0, color: paso4Completado ? "#166534" : "#64748b", fontSize: "14.5px" }}>💰 Paso 5: Cobro de Tasa Municipal (S/ 3.00)</h4>
                <span style={{ background: paso5Completado ? "#dcfce7" : paso4Completado ? "#fef3c7" : "#f1f5f9", color: paso5Completado ? "#15803d" : paso4Completado ? "#b45309" : "#64748b", padding: "3px 10px", borderRadius: "6px", fontSize: "12px", fontWeight: "bold" }}>
                  {paso5Completado ? "✅ Pago Confirmado (Boleta Generada)" : !paso4Completado ? "🔒 Bloqueado" : "🟡 En Proceso de Cobro"}
                </span>
              </div>

              {!paso4Completado && (
                <div style={{ background: "#fffbe3", color: "#b45309", padding: "10px 14px", borderRadius: "8px", border: "1px solid #fde68a", marginBottom: "12px", fontWeight: "bold", fontSize: "12.5px" }}>
                  🔒 Paso 5 Bloqueado: Debe cargar todos los documentos obligatorios requeridos (Paso 4) para habilitar el cobro.
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", alignItems: "center" }}>
                <div>
                  <label style={{ display: "block", fontSize: "12.5px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>Método de Pago *</label>
                  <select
                    value={metodoPagoSeleccionado}
                    disabled={!paso4Completado}
                    onChange={(e) => setMetodoPagoSeleccionado(e.target.value)}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13.5px", background: !paso4Completado ? "#e2e8f0" : "white" }}
                  >
                    <option value="Efectivo en caja">Efectivo en Caja Municipal</option>
                    <option value="Tarjeta POS (Débito/Crédito)">Tarjeta Débito / Crédito (POS)</option>
                    <option value="Billetera Digital (Yape / Plin)">Billetera Digital (Yape / Plin)</option>
                  </select>
                </div>

                <div style={{ background: "white", padding: "10px 14px", borderRadius: "8px", border: "1px solid #bbf7d0" }}>
                  <small style={{ display: "block", color: "#166534", fontWeight: "bold", fontSize: "11px" }}>🧾 COMPROBANTE DE CAJA A EMITIR</small>
                  <strong style={{ color: "#047857", fontSize: "14px" }}>Boleta N° BOL-CAJA-2026-AUTO</strong>
                  <span style={{ display: "block", fontSize: "12px", color: "#334155", fontWeight: "bold", marginTop: "2px" }}>Monto Cobrado: S/ {MONTO_TRAMITE.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* PASO 6: PROGRAMACIÓN DE INSPECCIÓN (HABILITADO TRAS PASO 5) */}
            <div style={{ background: paso5Completado ? "#f0fdf4" : "#f1f5f9", padding: "16px", borderRadius: "10px", border: paso5Completado ? "1px solid #bbf7d0" : "1px dashed #cbd5e1", marginBottom: "16px", opacity: paso5Completado ? 1 : 0.7 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                <h4 style={{ margin: 0, color: paso5Completado ? "#166534" : "#64748b", fontSize: "14.5px" }}>📅 Paso 6: Programación de Inspección Técnica</h4>
                <span style={{ background: paso6Completado ? "#dcfce7" : paso5Completado ? "#fef3c7" : "#f1f5f9", color: paso6Completado ? "#15803d" : paso5Completado ? "#b45309" : "#64748b", padding: "3px 10px", borderRadius: "6px", fontSize: "12px", fontWeight: "bold" }}>
                  {paso6Completado ? "✅ Inspección Programada" : !paso5Completado ? "🔒 Bloqueado" : "🟡 En Proceso de Selección"}
                </span>
              </div>

              {!paso5Completado && (
                <div style={{ background: "#fffbe3", color: "#b45309", padding: "10px 14px", borderRadius: "8px", border: "1px solid #fde68a", marginBottom: "12px", fontWeight: "bold", fontSize: "12.5px" }}>
                  🔒 Paso 6 Bloqueado: Debe confirmar el método de pago en el Paso 5 para habilitar la programación de la inspección.
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "12.5px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>Fecha de Inspección (DD/MM/YYYY) *</label>
                  <input
                    type="text"
                    disabled={!paso5Completado}
                    placeholder="DD/MM/YYYY"
                    value={fechaInspeccion}
                    onChange={(e) => setFechaInspeccion(e.target.value)}
                    required
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13.5px", fontWeight: "bold", background: !paso5Completado ? "#e2e8f0" : "white" }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "12.5px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>Rango Horario de Inspección *</label>
                  <select
                    value={slotInspeccion}
                    disabled={!paso5Completado}
                    onChange={(e) => setSlotInspeccion(e.target.value)}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13.5px", background: !paso5Completado ? "#e2e8f0" : "white" }}
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

              <div>
                <label style={{ display: "block", fontSize: "12.5px", fontWeight: "bold", color: "#334155", marginBottom: "6px" }}>Seleccionar Inspector Asignado (Máx 4/día) *</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", pointerEvents: paso5Completado ? "auto" : "none" }}>
                  {INSPECTORES_DEFAULT.map((insp) => {
                    const cupos = obtenerConteoInspectorEnFecha(insp.uid, fechaInspeccion);
                    const estaLleno = cupos >= 4;
                    const esSel = inspectorElegido?.uid === insp.uid;

                    return (
                      <div
                        key={insp.uid}
                        onClick={() => {
                          if (!paso5Completado) return;
                          if (estaLleno) {
                            alert(`⚠️ El inspector ${insp.nombre} ha completado el máximo de 4 inspecciones para el día ${fechaInspeccion}. Elija otro inspector.`);
                            return;
                          }
                          setInspectorElegido(insp);
                        }}
                        style={{
                          padding: "8px 10px",
                          borderRadius: "8px",
                          border: esSel ? "2px solid #16a34a" : estaLleno ? "1px solid #fca5a5" : "1px solid #cbd5e1",
                          background: esSel ? "#f0fdf4" : estaLleno ? "#fef2f2" : !paso5Completado ? "#f1f5f9" : "white",
                          cursor: !paso5Completado || estaLleno ? "not-allowed" : "pointer",
                          fontSize: "12.5px"
                        }}
                      >
                        <strong style={{ color: esSel ? "#166534" : "#1e293b", display: "block" }}>{insp.nombre} {esSel && "✓"}</strong>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", marginTop: "2px" }}>
                          <span style={{ color: "#64748b" }}>{insp.cargo}</span>
                          <span style={{ fontWeight: "bold", color: estaLleno ? "#dc2626" : "#15803d" }}>{estaLleno ? "4/4 Lleno" : `${cupos}/4 Cupos`}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* PASO 7: FINALIZAR Y REGISTRAR SOLICITUD */}
            <div style={{ textAlign: "right", marginTop: "20px" }}>
              <button
                type="submit"
                className="btn-primary"
                disabled={procesando || !paso6Completado}
                style={{
                  background: paso6Completado ? "#16a34a" : "#cbd5e1",
                  color: "white",
                  padding: "14px 28px",
                  fontSize: "15.5px",
                  fontWeight: "bold",
                  cursor: paso6Completado ? "pointer" : "not-allowed",
                  boxShadow: paso6Completado ? "0 4px 6px rgba(22, 163, 74, 0.25)" : "none"
                }}
              >
                {procesando
                  ? "Procesando Registro Presencial..."
                  : !paso1Completado
                  ? "🔒 Paso 1 Incompleto: Valide DNI en RENIEC"
                  : !paso2Completado
                  ? "🔒 Paso 2 Incompleto: Ingrese celular peruano e email"
                  : !paso3Completado
                  ? "🔒 Paso 3 Incompleto: Valide RUC en SUNAT"
                  : !paso4Completado
                  ? "🔒 Paso 4 Incompleto: Suba todos los documentos obligatorios"
                  : !paso5Completado
                  ? "🔒 Paso 5 Incompleto: Seleccione el método de pago"
                  : !paso6Completado
                  ? "🔒 Paso 6 Incompleto: Asigne inspector y fecha de visita"
                  : "🚀 Registrar Solicitud y Finalizar Trámite"}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* VISTA 2 Y VISTA 3: CONSULTA DE ESTADO E HISTORIAL */}
      {(seccion === "consulta-expedientes" || seccion === "historial") && (
        <section className="section-card">
          <div className="section-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h2>{seccion === "historial" ? "🧾 Historial de Pagos y Recaudación" : "🔍 Consulta y Estado de Trámites"}</h2>
              <p>Busca expedientes por Código (EXP-XXXX), DNI del ciudadano, RUC o Nombre del establecimiento.</p>
            </div>
          </div>

          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "20px" }}>
          <input
            type="text"
            placeholder="🔍 Buscar por código (Ej. EXP-1002), DNI, RUC o Nombre de Solicitante/Negocio..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            style={{ flex: 1, minWidth: "240px", padding: "12px 18px", borderRadius: "10px", border: "1px solid #cbd5e1", fontSize: "14px" }}
          />

          <select
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
            style={{ padding: "12px 16px", borderRadius: "10px", border: "1px solid #cbd5e1", fontSize: "14px", fontWeight: "bold", background: "#f8fafc", color: "#1e293b", minWidth: "200px" }}
          >
            <option value="todos">📌 Todos los estados ({solicitudes.length})</option>
            <option value="pagado">✅ Pagados / Confirmados ({pagadas.length})</option>
            <option value="enviado">🚀 Enviados a Inspección ({enviadasAInspeccion.length})</option>
            <option value="anulado">❌ Anulados ({anuladas.length})</option>
          </select>
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
                  <option value="Efectivo en caja">Efectivo en Caja Municipal</option>
                  <option value="Tarjeta POS (Débito/Crédito)">Tarjeta Débito / Crédito (POS)</option>
                  <option value="Billetera Digital (Yape / Plin)">Billetera Digital (Yape / Plin)</option>
                  <option value="Pago Confirmado Online (Demo Flow)">Pago Online (Pasarela)</option>
                </select>
              </div>

              {/* SECCIÓN PROGRAMACIÓN DE INSPECCIÓN */}
              <div style={{ background: "#f0fdf4", padding: "14px", borderRadius: "10px", border: "1px solid #bbf7d0", marginBottom: "16px" }}>
                <h4 style={{ margin: "0 0 10px", color: "#166534", fontSize: "14px", display: "flex", alignItems: "center", gap: "6px" }}>
                  📅 Programar Inspección Técnica Oficial
                </h4>

                <div style={{ marginBottom: "12px" }}>
                  <label style={{ display: "block", fontSize: "12.5px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>
                    Fecha de la Inspección (DD/MM/YYYY) *
                  </label>
                  <input
                    type="text"
                    placeholder="DD/MM/YYYY"
                    value={fechaInspeccion}
                    onChange={(e) => setFechaInspeccion(e.target.value)}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13.5px", fontWeight: "bold" }}
                  />
                </div>

                <div style={{ marginBottom: "12px" }}>
                  <label style={{ display: "block", fontSize: "12.5px", fontWeight: "bold", color: "#334155", marginBottom: "6px" }}>
                    Seleccionar Inspector Asignado (Máx 4/día) *
                  </label>

                  <div style={{ display: "grid", gap: "8px" }}>
                    {INSPECTORES_DEFAULT.map((insp) => {
                      const cupos = obtenerConteoInspectorEnFecha(insp.uid, fechaInspeccion);
                      const estaLleno = cupos >= 4;
                      const esSel = inspectorElegido?.uid === insp.uid;

                      return (
                        <div
                          key={insp.uid}
                          onClick={() => {
                            if (estaLleno) {
                              alert(`⚠️ El inspector ${insp.nombre} ha completado el máximo de 4 inspecciones para el día ${fechaInspeccion}. Elija otro inspector.`);
                              return;
                            }
                            setInspectorElegido(insp);
                          }}
                          style={{
                            display: "flex",
                            justify: "space-between",
                            alignItems: "center",
                            padding: "10px 12px",
                            borderRadius: "8px",
                            border: esSel ? "2px solid #16a34a" : estaLleno ? "1px solid #fca5a5" : "1px solid #cbd5e1",
                            background: esSel ? "#f0fdf4" : estaLleno ? "#fef2f2" : "white",
                            cursor: estaLleno ? "not-allowed" : "pointer",
                            fontSize: "13px"
                          }}
                        >
                          <div>
                            <strong style={{ color: esSel ? "#166534" : "#1e293b" }}>{insp.nombre} {esSel && "✓"}</strong>
                            <div style={{ fontSize: "11.5px", color: "#64748b" }}>{insp.cargo}</div>
                          </div>
                          <span
                            style={{
                              fontSize: "11.5px",
                              fontWeight: "bold",
                              padding: "3px 8px",
                              borderRadius: "4px",
                              background: estaLleno ? "#fee2e2" : "#dcfce7",
                              color: estaLleno ? "#dc2626" : "#15803d"
                            }}
                          >
                            {estaLleno ? "🔴 4/4 Lleno" : `🟢 ${cupos}/4 Cupos`}
                          </span>
                        </div>
                      );
                    })}
                  </div>
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
                    {rucValidado ? `✓ SUNAT Validado (${estadoSunat || "ACTIVO"} - ${condicionSunat || "HABIDO"})` : "🔒 Consulta SUNAT Requerida"}
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
                      value={estadoSunat ? `✓ ${estadoSunat}` : ""}
                      style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13.5px", background: "#f1f5f9", cursor: "not-allowed", fontWeight: "bold", color: "#15803d" }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>🔒 Condición del Contribuyente (SUNAT)</label>
                    <input
                      type="text"
                      readOnly
                      placeholder="🔒 Se autocompleta consultando SUNAT"
                      value={condicionSunat ? `✓ ${condicionSunat}` : ""}
                      style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13.5px", background: "#f1f5f9", cursor: "not-allowed", fontWeight: "bold", color: "#15803d" }}
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
                      <option value="Efectivo en caja">Efectivo en Caja Municipal</option>
                      <option value="Tarjeta POS (Débito/Crédito)">Tarjeta Débito / Crédito (POS)</option>
                      <option value="Billetera Digital (Yape / Plin)">Billetera Digital (Yape / Plin)</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>Fecha de Inspección (DD/MM/YYYY) *</label>
                    <input
                      type="text"
                      placeholder="DD/MM/YYYY"
                      value={fechaInspeccion}
                      onChange={(e) => setFechaInspeccion(e.target.value)}
                      required
                      style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13.5px", fontWeight: "bold" }}
                    />
                  </div>
                </div>

                <div style={{ marginBottom: "12px" }}>
                  <label style={{ display: "block", fontSize: "12.5px", fontWeight: "bold", color: "#334155", marginBottom: "6px" }}>Seleccionar Inspector Asignado (Máx 4/día) *</label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                    {INSPECTORES_DEFAULT.map((insp) => {
                      const cupos = obtenerConteoInspectorEnFecha(insp.uid, fechaInspeccion);
                      const estaLleno = cupos >= 4;
                      const esSel = inspectorElegido?.uid === insp.uid;

                      return (
                        <div
                          key={insp.uid}
                          onClick={() => {
                            if (estaLleno) {
                              alert(`⚠️ El inspector ${insp.nombre} ha completado el máximo de 4 inspecciones para el día ${fechaInspeccion}. Elija otro inspector.`);
                              return;
                            }
                            setInspectorElegido(insp);
                          }}
                          style={{
                            padding: "8px 10px",
                            borderRadius: "8px",
                            border: esSel ? "2px solid #16a34a" : estaLleno ? "1px solid #fca5a5" : "1px solid #cbd5e1",
                            background: esSel ? "#f0fdf4" : estaLleno ? "#fef2f2" : "white",
                            cursor: estaLleno ? "not-allowed" : "pointer",
                            fontSize: "12.5px"
                          }}
                        >
                          <strong style={{ color: esSel ? "#166534" : "#1e293b", display: "block" }}>{insp.nombre} {esSel && "✓"}</strong>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", marginTop: "2px" }}>
                            <span style={{ color: "#64748b" }}>{insp.cargo}</span>
                            <span style={{ fontWeight: "bold", color: estaLleno ? "#dc2626" : "#15803d" }}>{estaLleno ? "4/4 Lleno" : `${cupos}/4 Cupos`}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
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
