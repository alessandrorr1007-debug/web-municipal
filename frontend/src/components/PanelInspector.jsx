import { useEffect, useState, useMemo, useCallback } from "react";
import {
  obtenerSolicitudes,
  actualizarSolicitud,
  suscribirSolicitudes,
} from "../services/solicitudService";
import { crearNotificacion } from "../services/notificacionService";
import { abrirPdf, obtenerBlobUrlParaPdf } from "../services/pdfService";
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
  const [evidencias, setEvidencias] = useState([]);
  const [fechaVisita, setFechaVisita] = useState("");
  const [horaVisita, setHoraVisita] = useState("10:00");
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
      // 1. Excluir expedientes aprobados definitivamente, rechazados definitivamente, anulados o cancelados
      if (e.includes("aprobado") || e.includes("rechazado definitivamente") || e.includes("licencia emitida") || e.includes("cancelad") || e.includes("anulad")) return false;

      // 2. Si YA FUE EVALUADO HOY (el inspector ya hizo clic en Registrar Evaluación Final hoy), DESAPARECE de pendientes de atención
      if (s.fechaEvaluacionInspector) {
        const fechaEvalNorm = normalizarFechaString(s.fechaEvaluacionInspector);
        if (fechaEvalNorm === hoyNorm) return false;
      }

      // 3. Coincidir estrictamente con la fecha de visita agendada para HOY
      const fechaVisitaStr = s.fechaVisitaInspector || s.fechaVisita || s.fechaInspeccion || "";
      const fechaSolNorm = normalizarFechaString(fechaVisitaStr);
      return fechaSolNorm === hoyNorm;
    });
  }, [solicitudes, esExpedienteDeEsteInspector]);

  const solicitudesFiltradas = useMemo(() => {
    return inspeccionesPendientes;
  }, [inspeccionesPendientes]);

  // ABRIR MODAL DE ATENCIÓN DE INSPECCIÓN
  const abrirModalAtencion = (solicitud, tabInicial = "evaluacion") => {
    setSolicitudAtencion(solicitud);
    setResultadoDecisión("aprobado");
    setObservacionesTexto("");
    setEvidencias([]);
    setFechaVisita(solicitud.fechaVisitaInspector || formatearFechaLocal(new Date()));
    setHoraVisita(solicitud.horaVisitaInspector || "10:00");
    setTabModal(tabInicial);
  };

  // IMÁGENES DE EVIDENCIA EN BASE64
  const convertirImagenABase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve({ nombre: file.name, url: reader.result });
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleSubirEvidencias = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    if (evidencias.length + files.length > 2) {
      alert("Solo se pueden adjuntar hasta 2 fotografías de evidencia.");
      return;
    }
    try {
      const convertidas = await Promise.all(files.map(convertirImagenABase64));
      setEvidencias((prev) => [...prev, ...convertidas]);
    } catch {
      alert("Error al cargar fotografías.");
    }
  };

  const quitarEvidencia = (index) => {
    setEvidencias((prev) => prev.filter((_, i) => i !== index));
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

      alert(`Inspección programada para el ${fechaVisita} a las ${horaLabel}.`);
      setSolicitudAtencion(null);
      await cargarSolicitudes();
    } catch (err) {
      console.error(err);
      alert("Error al programar la inspección: " + err.message);
    } finally {
      setProcesando(false);
    }
  };

  // EVALUAR E INSPECCIONAR (APROBAR VS RECHAZAR CON 1ER INTENTO A 30 DÍAS / 2DO INTENTO CANCELACIÓN)
  const guardarResultadoInspeccion = async () => {
    if (!solicitudAtencion) return;
    if (!resultadoDecisión) {
      alert("Seleccione una decisión (Aprobar o Rechazar Inspección).");
      return;
    }
    if (!observacionesTexto.trim()) {
      alert("Es OBLIGATORIO ingresar las observaciones o informe técnico del inspector.");
      return;
    }
    if (evidencias.length === 0) {
      alert("Es OBLIGATORIO adjuntar al menos una (1) fotografía como evidencia técnica de la inspección.");
      return;
    }

    setProcesando(true);
    try {
      const fechaHoraActual = formatearFechaHora();
      const nombreInspector = usuario?.nombre || usuario?.email || "Inspector Municipal";
      const intentosPrevios = Number(solicitudAtencion.intentosInspeccion || 1);
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
          comentarios: observacionesTexto,
          evidencias: evidencias.map((e) => e.nombre || "Fotografía de evidencia"),
        };

        const cambios = {
          estadoInspeccion: "Inspección aprobada",
          inspeccion: "Inspección aprobada",
          estado: "Inspección aprobada",
          estadoNormalizado: "INSPECCION_APROBADA",
          resultadoInspeccion: "aprobado",
          observacionesInspector: observacionesTexto,
          evidenciasInspector: evidencias,
          fechaEvaluacionInspector: fechaHoraActual,
          inspectorNombre: nombreInspector,
          inspectorUid: usuario?.uid || "INSP-001",
          historialAcciones: [...(solicitudAtencion.historialAcciones || []), logEntrada],
        };

        await actualizarSolicitud(solicitudAtencion.id, cambios);

        if (solicitudAtencion.correoUsuario) {
          const numLicenciaStr = `00${expLimpio.slice(-6)} - 2026 MPT-GDEL-SGLC`;
          const fechaHoyFormateada = `Trujillo, ${new Date().toLocaleDateString("es-PE", { day: "numeric", month: "long", year: "numeric" })}`;

          const htmlLicenciaOficial = `
            <div style="font-family: Arial, sans-serif; max-width: 650px; margin: 0 auto; background: #ffffff; border: 2.5px solid #0f172a; border-radius: 12px; overflow: hidden; padding: 24px; box-shadow: 0 4px 14px rgba(0,0,0,0.1);">
              <div style="text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 20px;">
                <h2 style="margin: 0; color: #0f172a; font-size: 20px; font-weight: 900; letter-spacing: 1px;">MUNICIPALIDAD PROVINCIAL DE TRUJILLO</h2>
                <span style="font-size: 11.5px; color: #2563eb; font-weight: bold; text-transform: uppercase;">Gerencia de Desarrollo Económico Local — Subgerencia de Licencias</span>
                
                <div style="margin-top: 16px; background: #f8fafc; border: 1.5px solid #0f172a; padding: 12px; border-radius: 8px;">
                  <h1 style="margin: 0; color: #1e3a8a; font-size: 21px; font-weight: 900;">LICENCIA MUNICIPAL DE FUNCIONAMIENTO</h1>
                  <p style="margin: 4px 0 0; font-size: 15px; font-weight: 800; color: #dc2626;">Nro. ${numLicenciaStr}</p>
                  <small style="color: #475569; font-weight: bold;">(Ley N° 28976 — Marco Único de Licencias de Funcionamiento)</small>
                </div>
              </div>

              <div style="font-size: 13.5px; color: #1e293b; line-height: 1.6;">
                <p style="margin: 0 0 16px; font-style: italic; text-align: justify; color: #475569;">
                  Visto el Expediente N° <strong>EXP-${expLimpio}</strong> y habiéndose verificado el cumplimiento total de los requisitos de ley con informe de inspección técnica <strong>CONFORME Y APROBADO</strong>, se otorga la presente Licencia Municipal de Funcionamiento a favor de:
                </p>

                <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 13px;">
                  <tr><td style="padding: 8px 12px; font-weight: bold; border-bottom: 1px solid #e2e8f0; width: 40%;">Titular / Solicitante:</td><td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #0f172a;">${nombreCiudadano}</td></tr>
                  <tr><td style="padding: 8px 12px; font-weight: bold; border-bottom: 1px solid #e2e8f0;">RUC / Doc. Identidad:</td><td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">${solicitudAtencion.ruc || dniCiudadano}</td></tr>
                  <tr><td style="padding: 8px 12px; font-weight: bold; border-bottom: 1px solid #e2e8f0;">Nombre Comercial:</td><td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #1e3a8a;">${solicitudAtencion.nombreNegocio}</td></tr>
                  <tr><td style="padding: 8px 12px; font-weight: bold; border-bottom: 1px solid #e2e8f0;">Dirección del Local:</td><td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">${solicitudAtencion.direccion}</td></tr>
                  <tr><td style="padding: 8px 12px; font-weight: bold;">Giro Autorizado:</td><td style="padding: 8px 12px;">${solicitudAtencion.giro || "Comercio / Servicios"}</td></tr>
                </table>

                <div style="background: #eff6ff; border: 1px solid #bfdbfe; padding: 12px; border-radius: 8px; margin-bottom: 16px; font-size: 12px;">
                  <strong>Observaciones del Inspector:</strong> ${observacionesTexto}
                </div>

                <div style="text-align: right; margin-bottom: 20px; font-weight: bold; color: #0f172a;">
                  ${fechaHoyFormateada}
                </div>
              </div>
            </div>
          `;

          await crearNotificacion(
            solicitudAtencion.uidUsuario || "CIUDADANO",
            {
              titulo: `🏛️ Licencia Municipal Emitida — Expediente EXP-${expLimpio}`,
              descripcion: `¡Felicidades! Su solicitud EXP-${expLimpio} fue APROBADA y se ha emitido su Licencia Municipal de Funcionamiento N° ${numLicenciaStr}.`,
              icono: "📜",
              html: htmlLicenciaOficial,
            },
            solicitudAtencion.correoUsuario
          );
        }

        alert(`Inspección APROBADA con éxito. Se ha enviado la Licencia de Funcionamiento al correo del solicitante.`);
      } else {
        // 2. RECHAZAR INSPECCIÓN (1er intento -> REPROGRAMAR A 30 DÍAS / 2do intento -> CANCELACIÓN DEFINITIVA)
        if (intentosPrevios < 2) {
          // PRIMER RECHAZO: Reprogramación automática a 30 días en día hábil (sin sábados ni domingos)
          const fechaBaseVisita = solicitudAtencion.fechaVisitaInspector || solicitudAtencion.fechaVisita || new Date();
          const fechaVisita30 = calcularFecha30DiasMas(fechaBaseVisita);

          const inspTarget = solicitudAtencion.inspectorUid || solicitudAtencion.inspectorNombre || usuario?.uid || "INSP-001";
          const slotLibreObj = obtenerPrimerSlotLibreParaInspector(solicitudes, inspTarget, fechaVisita30, solicitudAtencion.id);

          const slotVal30 = slotLibreObj ? slotLibreObj.value : "08:00";
          const horaLabel30 = slotLibreObj ? slotLibreObj.label : "08:00 a. m.";

          const logEntrada = {
            fecha: fechaHoraActual.split(",")[0] || fechaHoraActual,
            hora: fechaHoraActual.split(",")[1]?.trim() || "",
            inspector: nombreInspector,
            accion: "Evaluación Técnica: RECHAZADO (1er Intento)",
            comentarios: `1er Rechazo Técnico: ${observacionesTexto}. Reprogramado automáticamente para 2da inspección el ${fechaVisita30} (${horaLabel30}).`,
            evidencias: evidencias.map((e) => e.nombre || "Fotografía de evidencia"),
          };

          const cambios = {
            intentosInspeccion: 2,
            estadoInspeccion: "Inspección Observada (1er Intento) - Reprogramada a 30 días",
            inspeccion: "Inspección Observada (1er Intento)",
            estado: "Inspección observada - Reprogramada a 30 días",
            estadoNormalizado: "INSPECCION_OBSERVADA",
            resultadoInspeccion: "rechazado_1er_intento",
            observacionesInspector: observacionesTexto,
            evidenciasInspector: evidencias,
            fechaVisitaInspector: fechaVisita30,
            horaVisitaInspector: slotVal30,
            horaVisitaLabel: horaLabel30,
            fechaEvaluacionInspector: fechaHoraActual,
            inspectorNombre: nombreInspector,
            inspectorUid: usuario?.uid || "INSP-001",
            historialAcciones: [...(solicitudAtencion.historialAcciones || []), logEntrada],
          };

          await actualizarSolicitud(solicitudAtencion.id, cambios);

          const htmlNotifRechazo1 = `
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
                  Le informamos que la inspección técnica realizada al establecimiento <strong>${solicitudAtencion.nombreNegocio}</strong> no ha sido aprobada en primera instancia por los siguientes motivos u observaciones técnicas:
                </p>

                <div style="background: #fffbeb; border-left: 4px solid #d97706; padding: 12px 16px; border-radius: 4px; margin-bottom: 18px; font-weight: 600; color: #78350f;">
                  "${observacionesTexto}"
                </div>

                <div style="background: #eff6ff; border: 1.5px solid #2563eb; padding: 14px; border-radius: 8px; margin-bottom: 20px; text-align: center;">
                  <h4 style="margin: 0 0 6px; color: #1e40af; font-size: 14.5px;">📅 2DA INSPECCIÓN PROGRAMADA AUTOMÁTICAMENTE</h4>
                  <p style="margin: 0; font-size: 16px; font-weight: 900; color: #1d4ed8;">
                    Fecha: ${fechaVisita30} — Hora: ${horaLabel30}
                  </p>
                  <small style="color: #475569; display: block; margin-top: 4px;">Dispone de un plazo máximo de 30 días para subsanar las observaciones indicadas antes de la fecha agendada.</small>
                </div>
              </div>
            </div>
          `;

          await crearNotificacion(
            solicitudAtencion.uidUsuario || "",
            {
              titulo: "⚠️ Inspección Observada (1er Intento)",
              descripcion: `Su inspección técnica fue observada. Se ha reprogramado una 2da inspección para el día ${fechaVisita30} (${horaLabel30}) para subsanar las observaciones.`,
              icono: "⚠️",
              html: htmlNotifRechazo1,
            },
            solicitudAtencion.correoUsuario || ""
          );

          alert(`1er Rechazo registrado. Se envió el informe al correo del solicitante y se reprogramó automáticamente la 2da inspección técnica para el ${fechaVisita30} (${horaLabel30}).`);
        } else {
          // SEGUNDO RECHAZO: Cancelación definitiva
          const logEntrada = {
            fecha: fechaHoraActual.split(",")[0] || fechaHoraActual,
            hora: fechaHoraActual.split(",")[1]?.trim() || "",
            inspector: nombreInspector,
            accion: "Evaluación Técnica: RECHAZADO DEFINITIVO (2do Intento)",
            comentarios: `2do Rechazo Técnico Definitivo: ${observacionesTexto}. Trámite cancelado definitivamente.`,
            evidencias: evidencias.map((e) => e.nombre || "Fotografía de evidencia"),
          };

          const cambios = {
            intentosInspeccion: 2,
            estadoInspeccion: "Inspección Rechazada Definitivamente (2do Intento)",
            inspeccion: "Rechazado Definitivo",
            estado: "Solicitud Rechazada Definitivamente",
            estadoNormalizado: "RECHAZADO",
            resultadoInspeccion: "rechazado_definitivo",
            observacionesInspector: observacionesTexto,
            evidenciasInspector: evidencias,
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
                  "${observacionesTexto}"
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
          <div className="empty-state">
            <div style={{ fontSize: "36px", marginBottom: "10px" }}>🔍</div>
            <h3>No hay inspecciones pendientes para hoy</h3>
            <p>Las inspecciones agendadas para la fecha actual aparecerán en esta lista.</p>
          </div>
        ) : (
          <div className="tabla-container">
            <table className="modern-table">
              <thead>
                <tr>
                  <th>Expediente</th>
                  <th>Ciudadano / Representante</th>
                  <th>Establecimiento Comercial</th>
                  <th>Fecha y Hora Inspección</th>
                  <th>Estado Inspección</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {solicitudesFiltradas.map((s) => {
                  const expIdLimpio = String(s.id || "").replace(/^EXP-/, "");
                  const nombreCiudadano = obtenerNombreCiudadanoValido(s);
                  const dniCiudadano = obtenerDniValido(s);
                  const celular = obtenerTelefonoValido(s);
                  const correo = s.correoUsuario || s.correo || "---";

                  const fechaVisitaStr = s.fechaVisitaInspector || s.fechaVisita || s.fechaInspeccion || "22/07/2026";
                  const horaVisitaStr = s.horaVisitaLabel || s.horaVisitaInspector || (s.horaVisita ? `${s.horaVisita} hrs` : "08:00 a. m.");

                  return (
                    <tr key={s.id}>
                      <td>
                        <strong style={{ fontSize: "14px", color: "#0f172a" }}>EXP-{expIdLimpio}</strong>
                      </td>
                      <td>
                        <strong style={{ color: "#0f172a", fontSize: "13px" }}>{nombreCiudadano}</strong>
                        <small style={{ display: "block", color: "#475569", fontWeight: "600" }}>DNI: {dniCiudadano}</small>
                        <small style={{ display: "block", color: "#2563eb", fontWeight: "600", marginTop: "3px" }}>
                          📱 Cel: {celular}
                        </small>
                        <small style={{ display: "block", color: "#475569" }}>
                          ✉️ {correo}
                        </small>
                      </td>
                      <td>
                        <strong style={{ color: "#0f172a" }}>{s.nombreNegocio || s.razonSocial}</strong>
                        {s.razonSocial && s.razonSocial !== s.nombreNegocio && (
                          <small style={{ display: "block", color: "#334155" }}>Razón: {s.razonSocial}</small>
                        )}
                        <small style={{ display: "block", color: "#64748b", fontWeight: "600" }}>RUC: {s.ruc}</small>
                        <small style={{ display: "block", color: "#0f766e", marginTop: "2px", fontWeight: "600" }}>
                          📍 {s.direccion}
                        </small>
                      </td>
                      <td>
                        <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", padding: "6px 10px", borderRadius: "8px" }}>
                          <span style={{ fontSize: "12px", fontWeight: "800", color: "#1e40af", display: "block" }}>
                            📅 {fechaVisitaStr}
                          </span>
                          <span style={{ fontSize: "12px", fontWeight: "800", color: "#15803d", display: "block", marginTop: "2px" }}>
                            🕒 {horaVisitaStr}
                          </span>
                        </div>
                      </td>
                      <td>
                        {(() => {
                          const est = (s.estado || s.estadoNormalizado || "").toLowerCase();
                          const es2da = s.intentosInspeccion === 2 || est.includes("observada") || est.includes("reprogramada");
                          const esAprob = est.includes("aprobado");
                          const esRechDef = est.includes("rechazado definitivamente");

                          if (esAprob) {
                            return (
                              <span className="badge ok" style={{ background: "#dcfce7", color: "#15803d", border: "1px solid #86efac", padding: "6px 10px", fontWeight: "800" }}>
                                ✅ Inspección Aprobada
                              </span>
                            );
                          }
                          if (esRechDef) {
                            return (
                              <span className="badge danger" style={{ background: "#fef2f2", color: "#b91c1c", border: "1px solid #fca5a5", padding: "6px 10px", fontWeight: "800" }}>
                                🚫 Rechazado Definitivamente
                              </span>
                            );
                          }
                          if (es2da) {
                            const fecha1raObs = s.fechaEvaluacionInspector ? String(s.fechaEvaluacionInspector).split(",")[0] : (s.fechaVisitaOriginal || s.fecha || "Fecha previa");
                            return (
                              <div style={{ background: "#f3e8ff", border: "1.5px solid #c084fc", borderRadius: "8px", padding: "8px 12px", textAlign: "center", display: "inline-block", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}>
                                <strong style={{ color: "#6b21a8", fontSize: "12px", display: "block", fontWeight: "800" }}>
                                  📌 2da Inspección Técnica
                                </strong>
                                <small style={{ color: "#5b21b6", display: "block", fontSize: "11px", fontWeight: "700", marginTop: "2px" }}>
                                  (1ra Observada el {fecha1raObs})
                                </small>
                              </div>
                            );
                          }
                          return (
                            <div style={{ background: "#eff6ff", border: "1.5px solid #93c5fd", borderRadius: "8px", padding: "8px 12px", textAlign: "center", display: "inline-block", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}>
                              <strong style={{ color: "#1d4ed8", fontSize: "12px", display: "block", fontWeight: "800" }}>
                                🔍 1ra Inspección Técnica
                              </strong>
                              <small style={{ color: "#1e40af", display: "block", fontSize: "11px", fontWeight: "700", marginTop: "2px" }}>
                                (Programada)
                              </small>
                            </div>
                          );
                        })()}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn-primary"
                          onClick={() => abrirModalAtencion(s, "evaluacion")}
                          style={{ background: "#7c3aed", color: "white", padding: "8px 14px", borderRadius: "8px", fontWeight: "700", fontSize: "12px" }}
                        >
                          🔍 Atender Expediente
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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
                      <span style={{ fontSize: "15px", display: "block" }}>Rechazar Inspección</span>
                      <small style={{ color: "#991b1b", fontSize: "11.5px", fontWeight: "normal" }}>
                        {Number(solicitudAtencion.intentosInspeccion || 1) < 2
                          ? "Reprograma a 30 días (1er Rechazo)"
                          : "Cancela definitivamente la solicitud (2do Rechazo)"}
                      </small>
                    </button>
                  </div>

                  {resultadoDecisión === "rechazado" && (
                    <div style={{ background: Number(solicitudAtencion.intentosInspeccion || 1) < 2 ? "#fffbeb" : "#fef2f2", border: Number(solicitudAtencion.intentosInspeccion || 1) < 2 ? "1px solid #fcd34d" : "1px solid #fca5a5", color: Number(solicitudAtencion.intentosInspeccion || 1) < 2 ? "#92400e" : "#991b1b", padding: "10px 14px", borderRadius: "8px", marginBottom: "16px", fontSize: "12.5px" }}>
                      {Number(solicitudAtencion.intentosInspeccion || 1) < 2 ? (
                        <span><strong>⚠️ 1er Rechazo:</strong> La inspección será reprogramada automáticamente a los 30 días para otorgar plazo de subsanación al solicitante.</span>
                      ) : (
                        <span><strong>🔴 2do Rechazo:</strong> Al rechazar por segunda vez, el expediente quedará cancelado definitivamente sin opción a reprogramación.</span>
                      )}
                    </div>
                  )}

                  <div style={{ marginBottom: "16px" }}>
                    <label style={{ display: "block", fontSize: "13.5px", fontWeight: "bold", color: "#334155", marginBottom: "6px" }}>
                      Observaciones y Comentarios del Inspector *
                    </label>
                    <textarea
                      rows="4"
                      value={observacionesTexto}
                      onChange={(e) => setObservacionesTexto(e.target.value)}
                      placeholder="Ingrese los hallazgos de la inspección, estado del aforo, extintores, señalética o motivos de subsanación..."
                      style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "14px" }}
                    />
                  </div>

                  <div style={{ background: "#f8fafc", padding: "14px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
                    <label style={{ display: "block", fontSize: "13.5px", fontWeight: "bold", color: "#334155", marginBottom: "6px" }}>
                      📸 Adjuntar Fotografías de Evidencia (Máx 2 fotos):
                    </label>

                    {evidencias.length < 2 && (
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleSubirEvidencias}
                        style={{ marginBottom: "12px" }}
                      />
                    )}

                    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                      {evidencias.map((foto, idx) => (
                        <div key={idx} style={{ position: "relative" }}>
                          <img
                            src={foto.url || foto}
                            alt={`Evidencia ${idx + 1}`}
                            style={{ width: "100px", height: "80px", objectFit: "cover", borderRadius: "8px", border: "1px solid #cbd5e1" }}
                          />
                          <button
                            type="button"
                            onClick={() => quitarEvidencia(idx)}
                            style={{ position: "absolute", top: "-6px", right: "-6px", background: "#dc2626", color: "white", border: "none", borderRadius: "50%", width: "20px", height: "20px", cursor: "pointer", fontSize: "11px", fontWeight: "bold" }}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
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
                    <h4 style={{ margin: "0 0 8px", color: "#1e293b", fontSize: "14px" }}>📄 Visor de Documentos PDF Adjuntados</h4>
                    {(solicitudAtencion.archivosPdf || []).length === 0 ? (
                      <p style={{ color: "#64748b", fontSize: "13px" }}>Sin documentos PDF adjuntos.</p>
                    ) : (
                      <div style={{ display: "grid", gap: "8px" }}>
                        {(solicitudAtencion.archivosPdf || []).map((pdf, idx) => (
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
