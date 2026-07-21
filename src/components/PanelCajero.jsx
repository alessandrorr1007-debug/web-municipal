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

      {/* VISTA 1: NUEVA SOLICITUD PRESENCIAL DIRECTA */}
      {seccion === "nueva-solicitud" && (
        <section className="section-card">
          <div className="section-header" style={{ background: "linear-gradient(135deg, #16a34a 0%, #065f46 100%)", color: "white", padding: "16px 20px", borderRadius: "10px", marginBottom: "20px" }}>
            <h3 style={{ margin: 0, color: "white", fontSize: "18px" }}>➕ Formulario Presencial de Solicitud de Licencia Municipal</h3>
            <p style={{ margin: "4px 0 0", color: "#e2e8f0", fontSize: "13px" }}>Complete la validación RENIEC/SUNAT, adjunte los requisitos según el giro comercial, procese el cobro y programe la inspección.</p>
          </div>

          <form onSubmit={ejecutarRegistroPresencialCompleto}>
            {/* PASO 1: DATOS DEL SOLICITANTE CON VALIDACIÓN RENIEC */}
            <div style={{ background: "#f8fafc", padding: "16px", borderRadius: "10px", border: "1px solid #cbd5e1", marginBottom: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                <h4 style={{ margin: 0, color: "#166534", fontSize: "14.5px" }}>👤 1. Datos del Solicitante (Validación RENIEC)</h4>
                {dniValidado && (
                  <span style={{ background: "#dcfce7", color: "#15803d", padding: "3px 10px", borderRadius: "6px", fontSize: "12px", fontWeight: "bold" }}>
                    ✓ Validado por RENIEC (Bloqueado)
                  </span>
                )}
              </div>
              
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "10px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "12.5px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>DNI del Titular *</label>
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
                  <label style={{ display: "block", fontSize: "12.5px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>Teléfono de Contacto (Editable) *</label>
                  <input
                    type="text"
                    placeholder="Ej. 987654321"
                    value={telefonoForm}
                    onChange={(e) => setTelefonoForm(e.target.value)}
                    required
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13.5px" }}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "10px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "12.5px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>Nombres (Solo Lectura) *</label>
                  <input
                    type="text"
                    placeholder={dniValidado ? "Nombres autocompletados por RENIEC" : "🔒 Ingrese DNI y presione Consultar RENIEC"}
                    value={nombresForm}
                    readOnly={dniValidado}
                    onChange={(e) => setNombresForm(e.target.value)}
                    required
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13.5px", background: dniValidado ? "#f1f5f9" : "white", cursor: dniValidado ? "not-allowed" : "text", fontWeight: dniValidado ? "bold" : "normal" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "12.5px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>Apellidos (Solo Lectura) *</label>
                  <input
                    type="text"
                    placeholder={dniValidado ? "Apellidos autocompletados por RENIEC" : "🔒 Ingrese DNI y presione Consultar RENIEC"}
                    value={apellidosForm}
                    readOnly={dniValidado}
                    onChange={(e) => setApellidosForm(e.target.value)}
                    required
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13.5px", background: dniValidado ? "#f1f5f9" : "white", cursor: dniValidado ? "not-allowed" : "text", fontWeight: dniValidado ? "bold" : "normal" }}
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
                <h4 style={{ margin: 0, color: "#166534", fontSize: "14.5px" }}>🏢 2. Establecimiento Comercial (Validación SUNAT)</h4>
                {rucValidado && (
                  <span style={{ background: "#dcfce7", color: "#15803d", padding: "3px 10px", borderRadius: "6px", fontSize: "12px", fontWeight: "bold" }}>
                    ✓ SUNAT: {estadoSunat || "ACTIVO"} — {condicionSunat || "HABIDO"}
                  </span>
                )}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "10px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "12.5px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>RUC del Local (11 dígitos) *</label>
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
                  <label style={{ display: "block", fontSize: "12.5px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>Actividad Económica (Bloqueada por SUNAT) *</label>
                  <select
                    value={giroForm}
                    disabled={rucValidado}
                    onChange={(e) => setGiroForm(e.target.value)}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13.5px", fontWeight: "bold", background: rucValidado ? "#f1f5f9" : "white", cursor: rucValidado ? "not-allowed" : "pointer" }}
                  >
                    {GROS_DISPONIBLES.map((g) => (
                      <option key={g.value} value={g.value}>{g.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "10px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "12.5px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>Nombre Comercial (Solo Lectura) *</label>
                  <input
                    type="text"
                    placeholder={rucValidado ? "Autocompletado por SUNAT" : "🔒 Ingrese RUC y presione Consultar SUNAT"}
                    value={nombreNegocioForm}
                    readOnly={rucValidado}
                    onChange={(e) => setNombreNegocioForm(e.target.value)}
                    required
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13.5px", background: rucValidado ? "#f1f5f9" : "white", cursor: rucValidado ? "not-allowed" : "text", fontWeight: rucValidado ? "bold" : "normal" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "12.5px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>Razón Social (Solo Lectura)</label>
                  <input
                    type="text"
                    placeholder={rucValidado ? "Autocompletado por SUNAT" : "🔒 Ingrese RUC y presione Consultar SUNAT"}
                    value={razonSocialForm}
                    readOnly={rucValidado}
                    onChange={(e) => setRazonSocialForm(e.target.value)}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13.5px", background: rucValidado ? "#f1f5f9" : "white", cursor: rucValidado ? "not-allowed" : "text", fontWeight: rucValidado ? "bold" : "normal" }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12.5px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>Dirección Fiscal del Establecimiento (Solo Lectura) *</label>
                <input
                  type="text"
                  placeholder={rucValidado ? "Autocompletado por SUNAT" : "🔒 Ingrese RUC y presione Consultar SUNAT"}
                  value={direccionForm}
                  readOnly={rucValidado}
                  onChange={(e) => setDireccionForm(e.target.value)}
                  required
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13.5px", background: rucValidado ? "#f1f5f9" : "white", cursor: rucValidado ? "not-allowed" : "text", fontWeight: rucValidado ? "bold" : "normal" }}
                />
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

            <div style={{ textAlign: "right" }}>
              <button
                type="submit"
                className="btn-primary"
                disabled={procesando || !dniValidado || !rucValidado || !inspectorElegido}
                style={{
                  background: (dniValidado && rucValidado && inspectorElegido) ? "#16a34a" : "#cbd5e1",
                  color: "white",
                  padding: "12px 24px",
                  fontSize: "15px",
                  fontWeight: "bold",
                  cursor: (dniValidado && rucValidado && inspectorElegido) ? "pointer" : "not-allowed"
                }}
              >
                {procesando
                  ? "Procesando Registro Presencial..."
                  : !dniValidado
                  ? "🔒 1. Valide DNI en RENIEC para continuar"
                  : !rucValidado
                  ? "🔒 2. Valide RUC en SUNAT para continuar"
                  : !inspectorElegido
                  ? "⚠️ 3. Seleccione un Inspector"
                  : "🚀 Registrar, Cobrar y Asignar Inspección"}
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
                  <h4 style={{ margin: 0, color: "#166534", fontSize: "14.5px" }}>👤 1. Datos del Solicitante (Validación RENIEC)</h4>
                  {dniValidado && (
                    <span style={{ background: "#dcfce7", color: "#15803d", padding: "3px 10px", borderRadius: "6px", fontSize: "12px", fontWeight: "bold" }}>
                      ✓ Validado por RENIEC (Bloqueado)
                    </span>
                  )}
                </div>
                
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "10px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>DNI del Titular *</label>
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
                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>Teléfono de Contacto (Editable) *</label>
                    <input
                      type="text"
                      placeholder="Ej. 987654321"
                      value={telefonoForm}
                      onChange={(e) => setTelefonoForm(e.target.value)}
                      required
                      style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13.5px" }}
                    />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "10px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>Nombres (Solo Lectura) *</label>
                    <input
                      type="text"
                      placeholder={dniValidado ? "Nombres autocompletados por RENIEC" : "🔒 Ingrese DNI y presione Consultar RENIEC"}
                      value={nombresForm}
                      readOnly={dniValidado}
                      onChange={(e) => setNombresForm(e.target.value)}
                      required
                      style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13.5px", background: dniValidado ? "#f1f5f9" : "white", cursor: dniValidado ? "not-allowed" : "text", fontWeight: dniValidado ? "bold" : "normal" }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>Apellidos (Solo Lectura) *</label>
                    <input
                      type="text"
                      placeholder={dniValidado ? "Apellidos autocompletados por RENIEC" : "🔒 Ingrese DNI y presione Consultar RENIEC"}
                      value={apellidosForm}
                      readOnly={dniValidado}
                      onChange={(e) => setApellidosForm(e.target.value)}
                      required
                      style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13.5px", background: dniValidado ? "#f1f5f9" : "white", cursor: dniValidado ? "not-allowed" : "text", fontWeight: dniValidado ? "bold" : "normal" }}
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
                  <h4 style={{ margin: 0, color: "#166534", fontSize: "14.5px" }}>🏢 2. Establecimiento Comercial (Validación SUNAT)</h4>
                  {rucValidado && (
                    <span style={{ background: "#dcfce7", color: "#15803d", padding: "3px 10px", borderRadius: "6px", fontSize: "12px", fontWeight: "bold" }}>
                      ✓ SUNAT: {estadoSunat || "ACTIVO"} — {condicionSunat || "HABIDO"}
                    </span>
                  )}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "10px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>RUC del Local (11 dígitos) *</label>
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
                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>Actividad Económica (Bloqueada por SUNAT) *</label>
                    <select
                      value={giroForm}
                      disabled={rucValidado}
                      onChange={(e) => setGiroForm(e.target.value)}
                      style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13.5px", fontWeight: "bold", background: rucValidado ? "#f1f5f9" : "white", cursor: rucValidado ? "not-allowed" : "pointer" }}
                    >
                      {GROS_DISPONIBLES.map((g) => (
                        <option key={g.value} value={g.value}>{g.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "10px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>Nombre Comercial (Solo Lectura) *</label>
                    <input
                      type="text"
                      placeholder={rucValidado ? "Autocompletado por SUNAT" : "🔒 Ingrese RUC y presione Consultar SUNAT"}
                      value={nombreNegocioForm}
                      readOnly={rucValidado}
                      onChange={(e) => setNombreNegocioForm(e.target.value)}
                      required
                      style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13.5px", background: rucValidado ? "#f1f5f9" : "white", cursor: rucValidado ? "not-allowed" : "text", fontWeight: rucValidado ? "bold" : "normal" }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>Razón Social (Solo Lectura)</label>
                    <input
                      type="text"
                      placeholder={rucValidado ? "Autocompletado por SUNAT" : "🔒 Ingrese RUC y presione Consultar SUNAT"}
                      value={razonSocialForm}
                      readOnly={rucValidado}
                      onChange={(e) => setRazonSocialForm(e.target.value)}
                      style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13.5px", background: rucValidado ? "#f1f5f9" : "white", cursor: rucValidado ? "not-allowed" : "text", fontWeight: rucValidado ? "bold" : "normal" }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "12.5px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>Dirección Fiscal del Establecimiento (Solo Lectura) *</label>
                  <input
                    type="text"
                    placeholder={rucValidado ? "Autocompletado por SUNAT" : "🔒 Ingrese RUC y presione Consultar SUNAT"}
                    value={direccionForm}
                    readOnly={rucValidado}
                    onChange={(e) => setDireccionForm(e.target.value)}
                    required
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13.5px", background: rucValidado ? "#f1f5f9" : "white", cursor: rucValidado ? "not-allowed" : "text", fontWeight: rucValidado ? "bold" : "normal" }}
                  />
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
