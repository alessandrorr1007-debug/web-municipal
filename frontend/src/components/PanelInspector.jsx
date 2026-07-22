import { useEffect, useState, useMemo, useCallback } from "react";
import {
  obtenerSolicitudes,
  actualizarSolicitud,
  suscribirSolicitudes,
} from "../services/solicitudService";
import { crearNotificacion } from "../services/notificacionService";
import { abrirPdf, obtenerBlobUrlParaPdf, generarPlantillaLicenciaOficial } from "../services/pdfService";
import { useAuth } from "../context/AuthContext";
import { obtenerDniValido, obtenerNombreCiudadanoValido, obtenerTelefonoValido } from "../services/comprobanteService";
import VisualizadorDocumentoModal from "./VisualizadorDocumentoModal";
import {
  formatearFechaLocal,
  TIME_SLOTS,
  esHorarioPasado,
  esFechaValidaParaInspeccion,
  MENSAJE_FECHA_INSPECCION,
  obtenerFechaMinimaInspeccion,
  formatearFechaYYYYMMDD,
  calcularFecha30DiasMas,
  calcularFechaReinspeccionDisponible,
  obtenerPrimerSlotLibreParaInspector,
} from "../config/inspeccionConfig";
import { DISTRITOS_TRUJILLO, coincideDistrito } from "../config/estadosSolicitud";

function PanelInspector({ seccion }) {
  const { usuario } = useAuth();
  const [solicitudes, setSolicitudes] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [filtroDistrito, setFiltroDistrito] = useState("todos");
  const [paso, setPaso] = useState("inspecciones");
  const [solicitudAtencion, setSolicitudAtencion] = useState(null);
  const [documentoPdfVisor, setDocumentoPdfVisor] = useState(null);
  const [tabModal, setTabModal] = useState("evaluacion"); // "evaluacion", "programacion", "documentos", "evidencias", "historial"

  // ESTADOS DEL FORMULARIO DE ATENCION
  const [resultadoDecisión, setResultadoDecisión] = useState("aprobado"); // "aprobado", "observado", "rechazado"
  const [observacionesTexto, setObservacionesTexto] = useState("");
  const [fechaVisita, setFechaVisita] = useState("");
  const [procesando, setProcesando] = useState(false);

  const cargarSolicitudes = async () => {
    try {
      setCargando(true);
      const data = await obtenerSolicitudes();
      setSolicitudes(data);
    } catch (error) {
      console.error(error);
      alert("No se pudieron cargar las inspecciones.");
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

  useEffect(() => {
    if (seccion === "historial" || seccion === "historial-inspecciones") {
      setPaso("historial");
    } else {
      setPaso("inspecciones");
    }
  }, [seccion]);

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

  // HELPER PARA NORMALIZAR DIVERSOS FORMATOS DE FECHA DE FIREBASE (DD/MM/YYYY, D/M/YYYY, YYYY-MM-DD)
  const normalizarFechaString = (str) => {
    if (!str) return "";
    const s = String(str).trim();
    if (s.includes("/")) {
      const parts = s.split("/");
      if (parts.length === 3) {
        const d = parts[0].padStart(2, "0");
        const m = parts[1].padStart(2, "0");
        const y = parts[2].split(",")[0].trim();
        return `${d}/${m}/${y}`;
      }
    }
    if (s.includes("-")) {
      const parts = s.split("-");
      if (parts.length === 3) {
        const y = parts[0];
        const m = parts[1].padStart(2, "0");
        const d = parts[2].padStart(2, "0");
        return `${d}/${m}/${y}`;
      }
    }
    return s;
  };

  // COMPROBACIÓN FLEXIBLE DE ASIGNACIÓN POR INSPECTOR
  const esExpedienteDeEsteInspector = useCallback((s) => {
    if (!usuario) return true;
    const uidActual = (usuario.uid || "").toLowerCase();
    const nombreActual = (usuario.nombre || usuario.email || "").toLowerCase().replace(/^inspector\s+/i, "");

    const uidAsignado = (s.inspectorUid || s.inspectorAsignadoUid || "").toLowerCase();
    const nombreAsignado = (s.inspectorNombre || s.inspectorAsignado || "").toLowerCase().replace(/^inspector\s+/i, "");

    // Si no se asignó inspector específico en Firestore, mostrar a todos los inspectores
    if (!uidAsignado && !nombreAsignado) return true;

    if (uidAsignado && uidActual) {
      if (uidAsignado === uidActual || uidActual.includes(uidAsignado) || uidAsignado.includes(uidActual)) return true;
    }
    if (nombreAsignado && nombreActual) {
      if (nombreAsignado.includes(nombreActual) || nombreActual.includes(nombreAsignado)) return true;
      const pAct = nombreActual.split(" ")[0];
      const pAsig = nombreAsignado.split(" ")[0];
      if (pAct && pAsig && (pAct.includes(pAsig) || pAsig.includes(pAct))) return true;
    }

    // Permitir ver solicitudes en modo pruebas o rol inspector
    const esInspector = (usuario.rol || "").toLowerCase().includes("inspector") || (usuario.email || "").toLowerCase().includes("inspector");
    if (esInspector) return true;

    return true;
  }, [usuario]);

  // CLASIFICACIÓN DE EXPEDIENTES PENDIENTES DE ATENCIÓN PARA EL DÍA DE HOY
  const inspeccionesPendientes = useMemo(() => {
    const hoyNorm = normalizarFechaString(formatearFechaLocal(new Date()));

    return solicitudes.filter((s) => {
      if (!esExpedienteDeEsteInspector(s)) return false;

      const e = (s.estado || s.estadoNormalizado || "").toLowerCase();
      const resultado = (s.resultadoInspeccion || "").toLowerCase();

      // 1. Excluir expedientes aprobados definitivamente, rechazados en 2do intento, anulados o cancelados
      if (
        e.includes("aprobado") ||
        e.includes("licencia emitida") ||
        e.includes("cancelad") ||
        e.includes("anulad") ||
        resultado === "rechazado_2do_intento" ||
        e.includes("rechazado definitivamente")
      ) {
        return false;
      }

      // 2. Coincidir estrictamente con la fecha de visita agendada para HOY
      const fechaVisitaStr = s.fechaVisitaInspector || s.fechaVisita || s.fechaInspeccion || "";
      const fechaSolNorm = normalizarFechaString(fechaVisitaStr);
      if (fechaSolNorm !== hoyNorm) return false;

      // 3. Evaluar si es 2do intento
      const esSegundoIntento = Number(s.intentosInspeccion) === 2 || e.includes("observad") || resultado === "rechazado_1er_intento";

      // Si es 1er intento y ya fue evaluado hoy, ocultar
      if (!esSegundoIntento && s.fechaEvaluacionInspector) {
        const fechaEvalNorm = normalizarFechaString(s.fechaEvaluacionInspector);
        if (fechaEvalNorm === hoyNorm) return false;
      }

      // Si es 2do intento y ya fue finalizado (resultado === "aprobado" o "rechazado_2do_intento"), ocultar
      if (esSegundoIntento && (resultado === "aprobado" || resultado === "rechazado_2do_intento")) {
        return false;
      }

      return true;
    });
  }, [solicitudes, esExpedienteDeEsteInspector]);

  const solicitudesFiltradas = useMemo(() => {
    return inspeccionesPendientes;
  }, [inspeccionesPendientes]);

  // ABRIR MODAL DE ATENCIÓN DE INSPECCIÓN
  const abrirModalAtencion = (solicitud, tabInicial = "evaluacion") => {
    setSolicitudAtencion(solicitud);
    setResultadoDecisión("aprobado");
    setTipoObservacion(solicitud.tipoObservacion || "general");
    setObservacionesTexto("");
    setFechaVisita(solicitud.fechaVisitaInspector || formatearFechaLocal(new Date()));
    setTabModal(tabInicial);
  };

  // PROGRAMAR VISITA DE INSPECCIÓN
  const guardarProgramacionVisita = async () => {
    if (!solicitudAtencion) return;
    if (!fechaVisita || !horaVisita) {
      alert("Seleccione fecha y hora de la inspección.");
      return;
    }
    if (!esFechaValidaParaInspeccion(fechaVisita)) {
      alert(MENSAJE_FECHA_INSPECCION);
      return;
    }
    setProcesando(true);
    try {
      const fechaHoraActual = formatearFechaHora();
      const slotObj = TIME_SLOTS.find((s) => s.value === horaVisita);
      const horaLabel = slotObj ? slotObj.label : `${horaVisita} hrs`;
      const nombreInspector = usuario?.nombre || usuario?.email || "Inspector Municipal";

      const logEntrada = {
        fecha: fechaHoraActual.split(",")[0] || fechaHoraActual,
        hora: fechaHoraActual.split(",")[1]?.trim() || "",
        inspector: nombreInspector,
        accion: "Programación de Inspección",
        comentarios: `Visita agendada para el día ${fechaVisita} en el horario de ${horaLabel}.`,
      };

      const cambios = {
        fechaVisitaInspector: fechaVisita,
        horaVisitaInspector: horaVisita,
        horaVisitaLabel: horaLabel,
        estadoInspeccion: "Programada",
        inspeccion: "Programada",
        estado: "Inspección programada",
        estadoNormalizado: "INSPECCION_PROGRAMADA",
        inspectorNombre: nombreInspector,
        inspectorUid: usuario?.uid || "INSP-001",
        historialAcciones: [...(solicitudAtencion.historialAcciones || []), logEntrada],
      };

      await actualizarSolicitud(solicitudAtencion.id, cambios);

      await crearNotificacion(
        solicitudAtencion.uidUsuario || "",
        {
          titulo: "📅 Inspección Técnica Programada",
          descripcion: `Su inspección técnica para el expediente EXP-${solicitudAtencion.id} fue agendada para el ${fechaVisita} (${horaLabel}).`,
          icono: "📅",
        },
        solicitudAtencion.correoUsuario || ""
      );

      alert(`Inspección programada para el ${fechaVisita}.`);
      setSolicitudAtencion(null);
      await cargarSolicitudes();
    } catch (err) {
      console.error(err);
      alert("Error al programar la inspección: " + err.message);
    } finally {
      setProcesando(false);
    }
  };

  // EVALUAR E INSPECCIONAR (APROBAR VS OBSERVAR EN 1RA VISITA / APROBAR VS RECHAZAR EN 2DA VISITA)
  const guardarResultadoInspeccion = async () => {
    if (!solicitudAtencion) return;

    const est = (solicitudAtencion.estado || solicitudAtencion.estadoNormalizado || "").toLowerCase();
    const es2daVisita = Number(solicitudAtencion.intentosInspeccion) === 2 || est.includes("observada") || est.includes("reprogramada");

    if (!resultadoDecisión) {
      alert("Seleccione una decisión (Aprobar u Observar / Rechazar Inspección).");
      return;
    }

    if (!es2daVisita && resultadoDecisión === "rechazado") {
      alert("En la primera visita únicamente se puede Aprobar u Observar la inspección.");
      return;
    }

    if (resultadoDecisión === "observado" || resultadoDecisión === "rechazado") {
      if (!observacionesTexto.trim()) {
        alert("Es OBLIGATORIO ingresar el comentario de la observación o rechazo (máximo 100 caracteres).");
        return;
      }
      if (observacionesTexto.trim().length > 100) {
        alert("El comentario no puede exceder los 100 caracteres.");
        return;
      }
    }

    setProcesando(true);
    try {
      const fechaHoraActual = formatearFechaHora();
      const nombreInspector = usuario?.nombre || usuario?.email || "Inspector Municipal";
      const expLimpio = String(solicitudAtencion.id).replace(/^EXP-/, "");
      const nombreCiudadano = obtenerNombreCiudadanoValido(solicitudAtencion);
      const dniCiudadano = obtenerDniValido(solicitudAtencion);

      if (resultadoDecisión === "aprobado") {
        // 1. APROBAR INSPECCIÓN
        const logEntrada = {
          fecha: fechaHoraActual.split(",")[0] || fechaHoraActual,
          hora: fechaHoraActual.split(",")[1]?.trim() || "",
          inspector: nombreInspector,
          accion: "Evaluación Técnica: APROBADO",
          comentarios: observacionesTexto.trim().substring(0, 100),
          evidencias: evidencias.map((e) => e.nombre || "Fotografía de evidencia"),
        };

        const cambios = {
          estadoInspeccion: "Inspección aprobada",
          inspeccion: "Inspección aprobada",
          estado: "Inspección aprobada",
          estadoNormalizado: "APROBADO",
          resultadoInspeccion: "aprobado",
          observacionesInspector: observacionesTexto.trim().substring(0, 100),
          fechaEvaluacionInspector: fechaHoraActual,
          inspectorNombre: nombreInspector,
          inspectorUid: usuario?.uid || "INSP-001",
          licenciaEmitida: true,
          historialAcciones: [...(solicitudAtencion.historialAcciones || []), logEntrada],
        };

        await actualizarSolicitud(solicitudAtencion.id, cambios);

        if (solicitudAtencion.correoUsuario) {
          const htmlLicenciaOficial = generarPlantillaLicenciaOficial(solicitudAtencion, false);

          await crearNotificacion(
            solicitudAtencion.uidUsuario || "CIUDADANO",
            {
              titulo: `🏛️ Licencia Municipal Emitida — Expediente EXP-${expLimpio}`,
              descripcion: `¡Felicidades! Su solicitud EXP-${expLimpio} fue APROBADA y se ha emitido su Licencia Municipal de Funcionamiento oficial.`,
              icono: "📜",
              html: htmlLicenciaOficial,
            },
            solicitudAtencion.correoUsuario
          );
        }

        alert(`Inspección APROBADA con éxito. Se ha enviado la Licencia de Funcionamiento al correo del solicitante.`);
      } else if (resultadoDecisión === "observado") {
        // 2. OBSERVACIÓN EN 1RA VISITA (Reprogramación a 30 días hábiles en fecha disponible con máx 4 por día)
        const fechaBaseVisita = solicitudAtencion.fechaVisitaInspector || solicitudAtencion.fechaVisita || new Date();
        const inspTarget = solicitudAtencion.inspectorUid || solicitudAtencion.inspectorNombre || usuario?.uid || "INSP-001";
        const fechaVisita30 = calcularFechaReinspeccionDisponible(solicitudes, fechaBaseVisita, inspTarget, solicitudAtencion.id);

        const tipoEtiquetaMap = {
          general: "Observación General",
          plano: "Actualización de Plano",
          hibrido: "Observación Híbrida (General y Plano)"
        };

        const logEntrada = {
          fecha: fechaHoraActual.split(",")[0] || fechaHoraActual,
          hora: fechaHoraActual.split(",")[1]?.trim() || "",
          inspector: nombreInspector,
          accion: `Evaluación Técnica: OBSERVADO (${tipoEtiquetaMap[tipoObservacion] || "General"})`,
          comentarios: `Visita 1 Observada [${tipoEtiquetaMap[tipoObservacion] || "General"}]: ${observacionesTexto.trim().substring(0, 100)}. Reprogramado para 2da inspección el ${fechaVisita30}.`,
        };

        const cambios = {
          intentosInspeccion: 2,
          estadoInspeccion: `Inspección Observada (${tipoEtiquetaMap[tipoObservacion]}) - Reprogramada (Última Oportunidad)`,
          inspeccion: "Inspección Observada (1er Intento)",
          estado: "Inspección observada - Reprogramada (Última Oportunidad)",
          estadoNormalizado: "OBSERVADO",
          resultadoInspeccion: "observado_1er_intento",
          tipoObservacion: tipoObservacion,
          observacionesInspector: observacionesTexto.trim().substring(0, 100),
          fechaVisitaInspector: fechaVisita30,
          fechaSegundaVisita: fechaVisita30,
          proximaFechaInspeccion: fechaVisita30,
          fechaEvaluacionInspector: fechaHoraActual,
          inspectorNombre: nombreInspector,
          inspectorUid: usuario?.uid || "INSP-001",
          historialAcciones: [...(solicitudAtencion.historialAcciones || []), logEntrada],
        };

        await actualizarSolicitud(solicitudAtencion.id, cambios);

        const htmlNotifObs = `
          <div style="font-family: Arial, sans-serif; max-width: 650px; margin: 0 auto; background: #ffffff; border: 2.5px solid #d97706; border-radius: 12px; overflow: hidden; padding: 24px; box-shadow: 0 4px 14px rgba(0,0,0,0.1);">
            <div style="text-align: center; border-bottom: 2px solid #d97706; padding-bottom: 16px; margin-bottom: 20px;">
              <h2 style="margin: 0; color: #0f172a; font-size: 19px; font-weight: 900;">MUNICIPALIDAD PROVINCIAL DE TRUJILLO</h2>
              <span style="font-size: 11.5px; color: #d97706; font-weight: bold; text-transform: uppercase;">Subgerencia de Licencias — Informe Técnico de Inspección</span>
              
              <div style="margin-top: 16px; background: #fffbeb; border: 1.5px solid #d97706; padding: 12px; border-radius: 8px;">
                <h1 style="margin: 0; color: #b45309; font-size: 18px; font-weight: 900;">INSPECCIÓN TÉCNICA OBSERVADA (1ER INTENTO)</h1>
                <p style="margin: 4px 0 0; font-size: 14px; font-weight: 800; color: #78350f;">Expediente N° EXP-${expLimpio}</p>
              </div>
            </div>

            <div style="font-size: 13.5px; color: #1e293b; line-height: 1.6;">
              <p style="margin: 0 0 14px;">Estimado(a) <strong>${nombreCiudadano}</strong>,</p>
              <p style="margin: 0 0 14px; text-align: justify;">
                Le informamos que la inspección realizada al establecimiento <strong>${solicitudAtencion.nombreNegocio}</strong> ha sido registrada como <strong>OBSERVADA (${tipoEtiquetaMap[tipoObservacion] || 'General'})</strong>:
              </p>

              <div style="background: #fffbeb; border-left: 4px solid #d97706; padding: 12px 16px; border-radius: 4px; margin-bottom: 18px; font-weight: 600; color: #78350f;">
                "${observacionesTexto.trim().substring(0, 100)}"
              </div>

              <div style="background: #eff6ff; border: 1.5px solid #2563eb; padding: 14px; border-radius: 8px; margin-bottom: 20px; text-align: center;">
                <h4 style="margin: 0 0 6px; color: #1e40af; font-size: 14.5px;">📅 2DA INSPECCIÓN PROGRAMADA (ÚLTIMA OPORTUNIDAD)</h4>
                <p style="margin: 0; font-size: 16px; font-weight: 900; color: #1d4ed8;">
                  Fecha de Visita: ${fechaVisita30}
                </p>
                <small style="color: #475569; display: block; margin-top: 4px;">Dispone de un plazo máximo de 30 días hábiles para subsanar las observaciones indicadas antes de la fecha agendada.</small>
              </div>
            </div>
          </div>
        `;

        await crearNotificacion(
          solicitudAtencion.uidUsuario || "",
          {
            titulo: "⚠️ Inspección Observada (1er Intento)",
            descripcion: `Su inspección fue observada. Se ha reprogramado una 2da inspección para el día ${fechaVisita30} (Última oportunidad).`,
            icono: "⚠️",
            html: htmlNotifObs,
          },
          solicitudAtencion.correoUsuario || ""
        );

        alert(`Inspección registrada como OBSERVADA. Se reprogramó automáticamente la 2da inspección (Última oportunidad) para el ${fechaVisita30}.`);
      } else {
        // 3. RECHAZO DEFINITIVO EN 2DA VISITA
        const logEntrada = {
          fecha: fechaHoraActual.split(",")[0] || fechaHoraActual,
          hora: fechaHoraActual.split(",")[1]?.trim() || "",
          inspector: nombreInspector,
          accion: "Evaluación Técnica: RECHAZADO DEFINITIVO (2do Intento)",
          comentarios: `2do Rechazo Técnico Definitivo: ${observacionesTexto.trim().substring(0, 100)}. Trámite cancelado definitivamente.`,
        };

        const cambios = {
          intentosInspeccion: 2,
          estadoInspeccion: "Inspección Rechazada Definitivamente (2do Intento)",
          inspeccion: "Rechazado Definitivo",
          estado: "Solicitud Rechazada Definitivamente",
          estadoNormalizado: "RECHAZADO",
          resultadoInspeccion: "rechazado_definitivo",
          observacionesInspector: observacionesTexto.trim().substring(0, 100),
          fechaEvaluacionInspector: fechaHoraActual,
          inspectorNombre: nombreInspector,
          inspectorUid: usuario?.uid || "INSP-001",
          historialAcciones: [...(solicitudAtencion.historialAcciones || []), logEntrada],
        };

        await actualizarSolicitud(solicitudAtencion.id, cambios);

        const htmlNotifRechazo2 = `
          <div style="font-family: Arial, sans-serif; max-width: 650px; margin: 0 auto; background: #ffffff; border: 2.5px solid #dc2626; border-radius: 12px; overflow: hidden; padding: 24px; box-shadow: 0 4px 14px rgba(0,0,0,0.1);">
            <div style="text-align: center; border-bottom: 2px solid #dc2626; padding-bottom: 16px; margin-bottom: 20px;">
              <h2 style="margin: 0; color: #0f172a; font-size: 19px; font-weight: 900;">MUNICIPALIDAD PROVINCIAL DE TRUJILLO</h2>
              <span style="font-size: 11.5px; color: #dc2626; font-weight: bold; text-transform: uppercase;">Subgerencia de Licencias — Resolución de Inspección Final</span>
              
              <div style="margin-top: 16px; background: #fef2f2; border: 1.5px solid #dc2626; padding: 12px; border-radius: 8px;">
                <h1 style="margin: 0; color: #991b1b; font-size: 18px; font-weight: 900;">TRÁMITE RECHAZADO DEFINITIVAMENTE</h1>
                <p style="margin: 4px 0 0; font-size: 14px; font-weight: 800; color: #991b1b;">Expediente N° EXP-${expLimpio}</p>
              </div>
            </div>

            <div style="font-size: 13.5px; color: #1e293b; line-height: 1.6;">
              <p style="margin: 0 0 14px;">Estimado(a) <strong>${nombreCiudadano}</strong>,</p>
              <p style="margin: 0 0 14px; text-align: justify;">
                Le notificamos que habiéndose realizado la segunda inspección técnica al establecimiento <strong>${solicitudAtencion.nombreNegocio}</strong>, el expediente no obtuvo informe favorable por persistir en las siguientes deficiencias:
              </p>

              <div style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 12px 16px; border-radius: 4px; margin-bottom: 18px; font-weight: 600; color: #991b1b;">
                "${observacionesTexto.trim().substring(0, 100)}"
              </div>

              <p style="margin: 0; font-weight: bold; color: #991b1b; background: #fee2e2; padding: 10px; border-radius: 6px; text-align: center;">
                El procedimiento administrativo ha quedado CANCELADO DEFINITIVAMENTE conforme a la normativa municipal vigente.
              </p>
            </div>
          </div>
        `;

        await crearNotificacion(
          solicitudAtencion.uidUsuario || "",
          {
            titulo: "🔴 Inspección Rechazada Definitivamente",
            descripcion: `Su trámite fue RECHAZADO DEFINITIVAMENTE tras desaprobar por 2da vez la inspección técnica municipal.`,
            icono: "🔴",
            html: htmlNotifRechazo2,
          },
          solicitudAtencion.correoUsuario || ""
        );

        alert(`La solicitud ha sido RECHAZADA DEFINITIVAMENTE por 2da vez y el trámite ha quedado cancelado. Se notificó al correo.`);
      }

      setSolicitudAtencion(null);
      await cargarSolicitudes();
    } catch (err) {
      console.error(err);
      alert("Error al guardar el resultado de la inspección: " + err.message);
    } finally {
      setProcesando(false);
    }
  };

  return (
    <div className="panel panel-inspector">
      <div className="inspector-hero" style={{ background: "linear-gradient(135deg, #7c3aed 0%, #312e81 100%)" }}>
        <div>
          <span className="eyebrow">Municipalidad de Trujillo — Módulo de Inspección Técnica</span>
          <h1>📅 Inspecciones Programadas para Hoy</h1>
          <p>Visitas de inspección técnica agendadas para ser atendidas en terreno el día de hoy.</p>
        </div>

        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <button type="button" className="btn-outline-light" onClick={cargarSolicitudes}>
            {cargando ? "Actualizando..." : "🔄 Actualizar"}
          </button>
        </div>
      </div>



      <section className="section-card">
        <div className="section-header">
          <div>
            <h2>Visitas de Inspección Programadas para Hoy</h2>
            <p>Revisa los datos del establecimiento comercial, ubicación, teléfono de contacto y registra la evaluación técnica.</p>
          </div>
        </div>



        {solicitudesFiltradas.length === 0 ? (
          <div className="empty-state" style={{ padding: "40px", textAlign: "center", background: "white", borderRadius: "16px", border: "1px dashed #cbd5e1" }}>
            <div style={{ fontSize: "40px", marginBottom: "8px" }}>📅</div>
            <h3 style={{ margin: "0 0 4px", color: "#0f172a", fontSize: "17px", fontWeight: "800" }}>No hay inspecciones programadas para el día de hoy</h3>
            <p style={{ margin: 0, color: "#64748b", fontSize: "13.5px" }}>Solo se muestran las visitas agendadas estrictamente para la fecha actual ({formatearFechaLocal(new Date())}).</p>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: "20px" }}>
            {solicitudesFiltradas.map((s) => {
              const expIdLimpio = String(s.id || "").replace(/^EXP-/, "");
              const nombreCiudadano = obtenerNombreCiudadanoValido(s);
              const dniCiudadano = obtenerDniValido(s);
              const celular = obtenerTelefonoValido(s);
              const correo = s.correoUsuario || s.correo || "---";

              const fechaVisitaStr = s.fechaVisitaInspector || s.fechaVisita || s.fechaInspeccion || formatearFechaLocal(new Date());

              const est = (s.estado || s.estadoNormalizado || "").toLowerCase();
              const es2da = Number(s.intentosInspeccion) === 2 || est.includes("observada") || est.includes("reprogramada");

              return (
                <div
                  key={s.id}
                  style={{
                    background: "white",
                    borderRadius: "16px",
                    padding: "20px",
                    boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
                    border: es2da ? "2px solid #c084fc" : "2px solid #93c5fd",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    gap: "14px"
                  }}
                >
                  <div>
                    {/* ENCABEZADO TARJETA */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px", borderBottom: "1px solid #f1f5f9", paddingBottom: "10px" }}>
                      <div>
                        <strong style={{ fontSize: "16px", color: "#0f172a", display: "block" }}>EXP-{expIdLimpio}</strong>
                        <span style={{ fontSize: "11px", fontWeight: "800", color: es2da ? "#6b21a8" : "#1d4ed8", background: es2da ? "#f3e8ff" : "#eff6ff", padding: "3px 8px", borderRadius: "6px", display: "inline-block", marginTop: "4px" }}>
                          {es2da ? "📌 2da Visita (Última Oportunidad)" : "🔍 1ra Visita Técnica"}
                        </span>
                      </div>
                      <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", padding: "6px 10px", borderRadius: "8px", textAlign: "right" }}>
                        <span style={{ fontSize: "12.5px", fontWeight: "800", color: "#1e40af", display: "block" }}>
                          📅 {fechaVisitaStr}
                        </span>
                      </div>
                    </div>

                    {/* DATOS REGISTRADOS EN CAJERA */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "13.5px", color: "#334155" }}>
                      <div>
                        <span style={{ fontSize: "11px", fontWeight: "800", color: "#64748b", textTransform: "uppercase" }}>Establecimiento / Empresa</span>
                        <strong style={{ display: "block", color: "#0f172a", fontSize: "14.5px" }}>{s.nombreNegocio || s.razonSocial}</strong>
                        {s.razonSocial && s.razonSocial !== s.nombreNegocio && (
                          <small style={{ display: "block", color: "#475569" }}>Razón: {s.razonSocial}</small>
                        )}
                        <small style={{ display: "block", color: "#2563eb", fontWeight: "700" }}>RUC: {s.ruc}</small>
                      </div>

                      <div>
                        <span style={{ fontSize: "11px", fontWeight: "800", color: "#64748b", textTransform: "uppercase" }}>Domicilio Fiscal / Dirección</span>
                        <p style={{ margin: "2px 0 0", color: "#0f766e", fontWeight: "600" }}>📍 {s.direccion} ({s.distrito || "Trujillo"})</p>
                      </div>

                      <div>
                        <span style={{ fontSize: "11px", fontWeight: "800", color: "#64748b", textTransform: "uppercase" }}>Contacto registrado en Cajera</span>
                        <p style={{ margin: "2px 0 0", fontWeight: "700", color: "#0f172a" }}>👤 {nombreCiudadano} (DNI: {dniCiudadano})</p>
                        <p style={{ margin: "2px 0 0", color: "#2563eb", fontWeight: "700" }}>📱 Celular: {celular}</p>
                        {correo && <p style={{ margin: "2px 0 0", color: "#64748b", fontSize: "12px" }}>✉️ {correo}</p>}
                      </div>

                      {/* PLANO DEL LOCAL Y ADJUNTOS */}
                      {(() => {
                        const urlPlanoExt = s.planoUrl || s.archivoUrl || s.archivosPdf?.[0]?.archivoUrl || s.archivosPdf?.[0]?.url || s.archivosPresenciales?.[0]?.archivoUrl || s.archivosPresenciales?.[0]?.url;
                        const tieneDocumentos = urlPlanoExt || s.archivosPdf?.length > 0 || s.archivosPresenciales?.length > 0 || s.archivosAdjuntos?.length > 0 || s.documentosResumen?.length > 0;

                        if (!tieneDocumentos) return null;

                        return (
                          <div style={{ marginTop: "4px", background: "#f8fafc", padding: "8px 12px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                            <span style={{ fontSize: "11px", fontWeight: "800", color: "#475569" }}>📁 Documentos / Plano del local:</span>
                            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "4px" }}>
                              {urlPlanoExt && (
                                <button
                                  type="button"
                                  onClick={() => setDocumentoPdfVisor({ url: urlPlanoExt, archivoUrl: urlPlanoExt, nombre: `Plano del Local — EXP-${String(s.id).replace(/^EXP-/, "")}` })}
                                  style={{ background: "#2563eb", color: "white", border: "none", padding: "5px 12px", borderRadius: "6px", fontSize: "11.5px", fontWeight: "700", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }}
                                >
                                  👁️ Ver Plano del Local
                                </button>
                              )}
                              {s.documentosResumen?.map((docNom, idx) => (
                                <span key={idx} style={{ fontSize: "11px", background: "#e2e8f0", padding: "2px 6px", borderRadius: "4px", color: "#334155" }}>
                                  📄 {docNom}
                                </span>
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {/* BOTÓN ACCIÓN */}
                  <div style={{ paddingTop: "10px", borderTop: "1px solid #f1f5f9" }}>
                    <button
                      type="button"
                      onClick={() => abrirModalAtencion(s, "evaluacion")}
                      style={{
                        width: "100%",
                        background: "linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)",
                        color: "white",
                        padding: "12px",
                        borderRadius: "10px",
                        fontWeight: "800",
                        fontSize: "14px",
                        border: "none",
                        cursor: "pointer",
                        boxShadow: "0 4px 12px rgba(124, 58, 237, 0.25)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "8px"
                      }}
                    >
                      🔍 Atender Expediente
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* MODAL PRINCIPAL DEL INSPECTOR (REVISION, PROGRAMACION, EVALUACION, HISTORIAL) */}
      {solicitudAtencion && (
        <div className="admin-form-modal" style={{ zIndex: 1000 }}>
          <div className="admin-form-card" style={{ maxWidth: "750px", maxHeight: "90vh", overflowY: "auto" }}>
            <div className="admin-form-header" style={{ background: "#7c3aed", color: "white", padding: "16px 20px" }}>
              <div>
                <h3 style={{ color: "white", margin: 0 }}>🔍 Módulo de Inspección Técnica — EXP-{String(solicitudAtencion.id || "").replace(/^EXP-/, "")}</h3>
                <small style={{ color: "#e0e7ff" }}>Establecimiento: {solicitudAtencion.nombreNegocio || solicitudAtencion.razonSocial} (RUC: {solicitudAtencion.ruc})</small>
              </div>
              <button type="button" onClick={() => setSolicitudAtencion(null)} style={{ color: "white" }}>✕</button>
            </div>

            <div className="tabs-panel" style={{ padding: "12px 20px 0", borderBottom: "1px solid #cbd5e1" }}>
              <button
                type="button"
                className={tabModal === "evaluacion" ? "tab-active" : ""}
                onClick={() => setTabModal("evaluacion")}
              >
                ⚖️ Registrar Resultado
              </button>
              <button
                type="button"
                className={tabModal === "documentos" ? "tab-active" : ""}
                onClick={() => setTabModal("documentos")}
              >
                📄 Datos y PDFs (RENIEC/SUNAT)
              </button>
            </div>

            <div style={{ padding: "20px" }}>
              {tabModal === "evaluacion" && (
                <div>
                  {/* BANNER EXPLICATIVO DE 1RA VS 2DA INSPECCIÓN */}
                  {(() => {
                    const est = (solicitudAtencion.estado || solicitudAtencion.estadoNormalizado || "").toLowerCase();
                    const es2da = solicitudAtencion.intentosInspeccion === 2 || est.includes("observada") || est.includes("reprogramada");

                    if (es2da) {
                      const fecha1raObs = solicitudAtencion.fechaEvaluacionInspector ? String(solicitudAtencion.fechaEvaluacionInspector).split(",")[0] : (solicitudAtencion.fechaVisitaOriginal || solicitudAtencion.fecha || "visita previa");
                      return (
                        <div style={{ background: "#f3e8ff", border: "1.5px solid #c084fc", padding: "12px 16px", borderRadius: "10px", marginBottom: "16px" }}>
                          <h4 style={{ margin: "0 0 4px", color: "#6b21a8", fontSize: "14.5px", fontWeight: "800" }}>
                            📌 2da Inspección Técnica (1ra Inspección Observada el {fecha1raObs})
                          </h4>
                          <small style={{ color: "#5b21b6", display: "block", fontSize: "12px" }}>
                            La 1ra inspección técnica fue observada el día <strong>{fecha1raObs}</strong>. Se otorgó un plazo de 30 días hábiles para la subsanación correspondiente.
                          </small>
                          {solicitudAtencion.observacionesInspector && (
                            <div style={{ marginTop: "8px", background: "#fffbe6", border: "1px solid #ffe58f", padding: "8px 12px", borderRadius: "6px", fontSize: "12.5px", color: "#873800" }}>
                              <strong>Observaciones del 1er Rechazo ({fecha1raObs}) a verificar:</strong> {solicitudAtencion.observacionesInspector}
                            </div>
                          )}
                        </div>
                      );
                    }
                    return (
                      <div style={{ background: "#eff6ff", border: "1.5px solid #93c5fd", padding: "12px 16px", borderRadius: "10px", marginBottom: "16px" }}>
                        <h4 style={{ margin: "0 0 4px", color: "#1e40af", fontSize: "14.5px", fontWeight: "800" }}>
                          🔍 1ra Inspección Técnica Edil (Primer Intento)
                        </h4>
                        <small style={{ color: "#1e3a8a", display: "block", fontSize: "12px" }}>
                          Evaluación técnica inicial del establecimiento comercial para otorgamiento de Licencia Municipal.
                        </small>
                      </div>
                    );
                  })()}

                  <h4 style={{ color: "#1e293b", margin: "0 0 14px", fontSize: "15px" }}>Seleccione Resultado de la Evaluación Técnica:</h4>
                  
                  {(() => {
                    const est = (solicitudAtencion.estado || solicitudAtencion.estadoNormalizado || "").toLowerCase();
                    const es2da = Number(solicitudAtencion.intentosInspeccion) === 2 || est.includes("observada") || est.includes("reprogramada");

                    if (!es2da) {
                      // PRIMERA VISITA: SOLO APROBAR U OBSERVAR
                      return (
                        <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginBottom: "16px" }}>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                            <button
                              type="button"
                              onClick={() => setResultadoDecisión("aprobado")}
                              style={{
                                padding: "16px",
                                borderRadius: "10px",
                                border: resultadoDecisión === "aprobado" ? "2px solid #16a34a" : "1px solid #cbd5e1",
                                background: resultadoDecisión === "aprobado" ? "#f0fdf4" : "white",
                                cursor: "pointer",
                                fontWeight: "bold",
                                color: resultadoDecisión === "aprobado" ? "#166534" : "#475569",
                                textAlign: "center"
                              }}
                            >
                              <div style={{ fontSize: "28px", marginBottom: "4px" }}>🟢</div>
                              <span style={{ fontSize: "15px", display: "block" }}>Aprobar Inspección</span>
                              <small style={{ color: "#166534", fontSize: "11.5px", fontWeight: "normal" }}>Emite la Licencia de Funcionamiento</small>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setResultadoDecisión("observado");
                                if (!tipoObservacion) setTipoObservacion("general");
                              }}
                              style={{
                                padding: "16px",
                                borderRadius: "10px",
                                border: resultadoDecisión === "observado" ? "2px solid #d97706" : "1px solid #cbd5e1",
                                background: resultadoDecisión === "observado" ? "#fffbeb" : "white",
                                cursor: "pointer",
                                fontWeight: "bold",
                                color: resultadoDecisión === "observado" ? "#b45309" : "#475569",
                                textAlign: "center"
                              }}
                            >
                              <div style={{ fontSize: "28px", marginBottom: "4px" }}>🟠</div>
                              <span style={{ fontSize: "15px", display: "block" }}>Observar Inspección</span>
                              <small style={{ color: "#b45309", fontSize: "11.5px", fontWeight: "normal" }}>Reprograma a 30 días hábiles (2da Visita)</small>
                            </button>
                          </div>

                          {/* OPCIONES DE TIPO DE OBSERVACIÓN */}
                          {resultadoDecisión === "observado" && (
                            <div style={{ background: "#fffbeb", border: "1.5px solid #fcd34d", padding: "16px", borderRadius: "12px" }}>
                              <label style={{ display: "block", fontSize: "13.5px", fontWeight: "800", color: "#92400e", marginBottom: "10px" }}>
                                📌 Seleccione el Tipo de Observación (Obligatorio):
                              </label>
                              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                                <label style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "13.5px", color: "#78350f", cursor: "pointer", fontWeight: "600" }}>
                                  <input
                                    type="radio"
                                    name="tipoObs"
                                    value="general"
                                    checked={tipoObservacion === "general"}
                                    onChange={() => setTipoObservacion("general")}
                                  />
                                  <span>📌 <strong>Observación General</strong> (ej. No tiene extintor, local sucio, falta botiquín, etc.)</span>
                                </label>

                                <label style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "13.5px", color: "#78350f", cursor: "pointer", fontWeight: "600" }}>
                                  <input
                                    type="radio"
                                    name="tipoObs"
                                    value="plano"
                                    checked={tipoObservacion === "plano"}
                                    onChange={() => setTipoObservacion("plano")}
                                  />
                                  <span>📐 <strong>Actualización de Plano</strong> (Requiere actualizar plano de distribución/arquitectura)</span>
                                </label>

                                <label style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "13.5px", color: "#78350f", cursor: "pointer", fontWeight: "600" }}>
                                  <input
                                    type="radio"
                                    name="tipoObs"
                                    value="hibrido"
                                    checked={tipoObservacion === "hibrido"}
                                    onChange={() => setTipoObservacion("hibrido")}
                                  />
                                  <span>🔀 <strong>Observación Híbrida</strong> (Observación General + Actualización de Plano)</span>
                                </label>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    } else {
                      // SEGUNDA VISITA: APROBAR O RECHAZAR DEFINITIVO
                      return (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "16px" }}>
                          <button
                            type="button"
                            onClick={() => setResultadoDecisión("aprobado")}
                            style={{
                              padding: "16px",
                              borderRadius: "10px",
                              border: resultadoDecisión === "aprobado" ? "2px solid #16a34a" : "1px solid #cbd5e1",
                              background: resultadoDecisión === "aprobado" ? "#f0fdf4" : "white",
                              cursor: "pointer",
                              fontWeight: "bold",
                              color: resultadoDecisión === "aprobado" ? "#166534" : "#475569",
                              textAlign: "center"
                            }}
                          >
                            <div style={{ fontSize: "28px", marginBottom: "4px" }}>🟢</div>
                            <span style={{ fontSize: "15px", display: "block" }}>Aprobar Inspección</span>
                            <small style={{ color: "#166534", fontSize: "11.5px", fontWeight: "normal" }}>Emite la Licencia de Funcionamiento</small>
                          </button>

                          <button
                            type="button"
                            onClick={() => setResultadoDecisión("rechazado")}
                            style={{
                              padding: "16px",
                              borderRadius: "10px",
                              border: resultadoDecisión === "rechazado" ? "2px solid #dc2626" : "1px solid #cbd5e1",
                              background: resultadoDecisión === "rechazado" ? "#fef2f2" : "white",
                              cursor: "pointer",
                              fontWeight: "bold",
                              color: resultadoDecisión === "rechazado" ? "#991b1b" : "#475569",
                              textAlign: "center"
                            }}
                          >
                            <div style={{ fontSize: "28px", marginBottom: "4px" }}>🔴</div>
                            <span style={{ fontSize: "15px", display: "block" }}>Rechazar Definitivamente</span>
                            <small style={{ color: "#991b1b", fontSize: "11.5px", fontWeight: "normal" }}>Cancela el trámite (2do Rechazo - Final)</small>
                          </button>
                        </div>
                      );
                    }
                  })()}

                  {/* CAMPO TEXTO CON MÁXIMO 100 CARACTERES */}
                  <div style={{ marginBottom: "16px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                      <label style={{ fontSize: "13.5px", fontWeight: "bold", color: "#334155" }}>
                        {resultadoDecisión === "observado"
                          ? "Comentario de la Observación (Obligatorio, máx. 100 caracteres) *"
                          : resultadoDecisión === "rechazado"
                          ? "Motivo del Rechazo Definitivo (Obligatorio, máx. 100 caracteres) *"
                          : "Observaciones del Inspector (Máx. 100 caracteres):"}
                      </label>
                      <span style={{ fontSize: "12px", fontWeight: "700", color: observacionesTexto.length >= 90 ? "#dc2626" : "#64748b" }}>
                        {observacionesTexto.length} / 100
                      </span>
                    </div>
                    <textarea
                      rows="3"
                      maxLength={100}
                      value={observacionesTexto}
                      onChange={(e) => setObservacionesTexto(e.target.value.slice(0, 100))}
                      placeholder={
                        resultadoDecisión === "observado"
                          ? "Ej: Falta extintor vencido y requiere actualización de plano..."
                          : resultadoDecisión === "rechazado"
                          ? "Ej: No subsanó las observaciones de seguridad edilicia en plazo..."
                          : "Comentarios sobre el cumplimiento técnico de la inspección..."
                      }
                      style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "14px" }}
                    />
                  </div>



                  <div className="admin-form-actions" style={{ marginTop: "20px" }}>
                    <button type="button" onClick={() => setSolicitudAtencion(null)} disabled={procesando}>Cancelar</button>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={guardarResultadoInspeccion}
                      disabled={procesando}
                      style={{ background: "#7c3aed", color: "white" }}
                    >
                      {procesando ? "Guardando Resultado..." : "💾 Registrar Evaluación Final"}
                    </button>
                  </div>
                </div>
              )}

              {tabModal === "documentos" && (
                <div>
                  <div style={{ background: "#f8fafc", padding: "14px", borderRadius: "10px", border: "1px solid #e2e8f0", marginBottom: "14px" }}>
                    <h4 style={{ margin: "0 0 6px", color: "#1e293b", fontSize: "14px" }}>👤 Datos RENIEC — Ciudadano / Representante</h4>
                    <p style={{ margin: "3px 0", fontSize: "13.5px" }}><strong>Nombre Completo:</strong> {obtenerNombreCiudadanoValido(solicitudAtencion)}</p>
                    <p style={{ margin: "3px 0", fontSize: "13.5px" }}><strong>DNI / Doc. Identidad:</strong> {obtenerDniValido(solicitudAtencion)}</p>
                    <p style={{ margin: "3px 0", fontSize: "13.5px" }}><strong>Correo Electrónico:</strong> {solicitudAtencion.correoUsuario || solicitudAtencion.correo || solicitudAtencion.email || "---"}</p>
                    <p style={{ margin: "3px 0", fontSize: "13.5px" }}><strong>Teléfono / Celular:</strong> {obtenerTelefonoValido(solicitudAtencion)}</p>
                  </div>

                  <div style={{ background: "#f8fafc", padding: "14px", borderRadius: "10px", border: "1px solid #e2e8f0", marginBottom: "14px" }}>
                    <h4 style={{ margin: "0 0 6px", color: "#1e293b", fontSize: "14px" }}>🏢 Datos SUNAT — Establecimiento Comercial</h4>
                    <p style={{ margin: "3px 0", fontSize: "13.5px" }}><strong>RUC:</strong> {solicitudAtencion.ruc}</p>
                    <p style={{ margin: "3px 0", fontSize: "13.5px" }}><strong>Nombre Comercial:</strong> {solicitudAtencion.nombreNegocio || "---"}</p>
                    <p style={{ margin: "3px 0", fontSize: "13.5px" }}><strong>Razón Social:</strong> {solicitudAtencion.razonSocial || solicitudAtencion.nombreNegocio || "---"}</p>
                    <p style={{ margin: "3px 0", fontSize: "13.5px" }}><strong>Giro Comercial:</strong> {solicitudAtencion.giro || "General"}</p>
                    <p style={{ margin: "3px 0", fontSize: "13.5px" }}><strong>Dirección Fiscal / Inspección:</strong> {solicitudAtencion.direccion}</p>
                  </div>

                  <div style={{ background: "#eff6ff", padding: "14px", borderRadius: "10px", border: "1px solid #bfdbfe", marginBottom: "14px" }}>
                    <h4 style={{ margin: "0 0 6px", color: "#1e40af", fontSize: "14px" }}>📅 Programación Oficial de Inspección</h4>
                    <p style={{ margin: "3px 0", fontSize: "13.5px" }}><strong>Fecha de Inspección:</strong> {solicitudAtencion.fechaVisitaInspector || solicitudAtencion.fechaVisita || "22/07/2026"}</p>
                    <p style={{ margin: "3px 0", fontSize: "13.5px" }}><strong>Hora Asignada:</strong> {solicitudAtencion.horaVisitaLabel || solicitudAtencion.horaVisitaInspector || (solicitudAtencion.horaVisita ? `${solicitudAtencion.horaVisita} hrs` : "08:00 a. m.")}</p>
                    <p style={{ margin: "3px 0", fontSize: "13.5px" }}><strong>Estado Actual:</strong> {solicitudAtencion.estadoInspeccion || solicitudAtencion.inspeccion || solicitudAtencion.estado || "Programada"}</p>
                  </div>

                  <div style={{ background: "#f8fafc", padding: "14px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
                    <h4 style={{ margin: "0 0 10px", color: "#1e293b", fontSize: "14.5px", fontWeight: "bold" }}>📄 Visor de Documentos PDF Adjuntados</h4>
                    {(() => {
                      const docsList = [];

                      if (solicitudAtencion.planoUrl) {
                        docsList.push({
                          nombre: "Plano Arquitectónico y de Distribución del Local (PDF)",
                          url: solicitudAtencion.planoUrl,
                          archivoUrl: solicitudAtencion.planoUrl,
                        });
                      }

                      if (Array.isArray(solicitudAtencion.archivosPdf)) {
                        solicitudAtencion.archivosPdf.forEach((pdf) => {
                          if (pdf && (pdf.url || pdf.archivoUrl || pdf.base64)) {
                            const urlKey = pdf.url || pdf.archivoUrl;
                            if (!docsList.some(d => (d.url || d.archivoUrl) === urlKey)) {
                              docsList.push(pdf);
                            }
                          }
                        });
                      }

                      if (Array.isArray(solicitudAtencion.archivosPresenciales)) {
                        solicitudAtencion.archivosPresenciales.forEach((pdf) => {
                          if (pdf && (pdf.url || pdf.archivoUrl || pdf.base64)) {
                            const urlKey = pdf.url || pdf.archivoUrl;
                            if (!docsList.some(d => (d.url || d.archivoUrl) === urlKey)) {
                              docsList.push(pdf);
                            }
                          }
                        });
                      }

                      if (Array.isArray(solicitudAtencion.archivosAdjuntos)) {
                        solicitudAtencion.archivosAdjuntos.forEach((pdf) => {
                          if (pdf && (pdf.url || pdf.archivoUrl || pdf.base64)) {
                            const urlKey = pdf.url || pdf.archivoUrl;
                            if (!docsList.some(d => (d.url || d.archivoUrl) === urlKey)) {
                              docsList.push(pdf);
                            }
                          }
                        });
                      }

                      if (docsList.length === 0 && solicitudAtencion.archivoUrl) {
                        docsList.push({
                          nombre: solicitudAtencion.archivoNombre || "Plano Arquitectónico del Local (PDF)",
                          url: solicitudAtencion.archivoUrl,
                          archivoUrl: solicitudAtencion.archivoUrl,
                        });
                      }

                      if (docsList.length === 0) {
                        return <p style={{ color: "#64748b", fontSize: "13px" }}>Sin documentos PDF adjuntos en el expediente.</p>;
                      }

                      return (
                        <div style={{ display: "grid", gap: "10px" }}>
                          {docsList.map((doc, idx) => {
                            const nomDoc = doc.nombre || doc.archivoNombre || `Documento_Adjunto_${idx + 1}.pdf`;
                            return (
                              <div key={idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "white", borderRadius: "8px", border: "1px solid #cbd5e1", gap: "10px" }}>
                                <span style={{ fontSize: "13px", fontWeight: "bold", color: "#1e293b", flex: 1 }}>
                                  📄 {nomDoc}
                                </span>

                                  <button
                                    type="button"
                                    onClick={() => setDocumentoPdfVisor(doc)}
                                    style={{ padding: "8px 16px", background: "#2563eb", color: "white", border: "none", borderRadius: "8px", fontSize: "12.5px", fontWeight: "bold", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}
                                  >
                                    👁️ Ver Documento
                                  </button>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}
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

export default PanelInspector;
