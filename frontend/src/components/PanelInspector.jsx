import { useEffect, useState, useMemo, useCallback } from "react";
import {
  obtenerSolicitudes,
  actualizarSolicitud,
  suscribirSolicitudes,
} from "../services/solicitudService";
import { crearNotificacion } from "../services/notificacionService";
import { abrirPdf } from "../services/pdfService";
import { useAuth } from "../context/AuthContext";
import {
  formatearFechaLocal,
  TIME_SLOTS,
  esHorarioPasado,
  esFechaValidaParaInspeccion,
  MENSAJE_FECHA_INSPECCION,
  obtenerFechaMinimaInspeccion,
  formatearFechaYYYYMMDD,
} from "../config/inspeccionConfig";

function PanelInspector({ seccion }) {
  const { usuario } = useAuth();
  const [solicitudes, setSolicitudes] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [paso, setPaso] = useState("inspecciones");
  const [solicitudAtencion, setSolicitudAtencion] = useState(null);
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

  // CLASIFICACIÓN DE EXPEDIENTES PROGRAMADOS STRICTAMENTE PARA HOY
  const inspeccionesPendientes = useMemo(() => {
    const hoyNorm = normalizarFechaString(formatearFechaLocal(new Date()));

    return solicitudes.filter((s) => {
      if (!esExpedienteDeEsteInspector(s)) return false;

      const e = (s.estado || s.estadoNormalizado || "").toLowerCase();
      // Solo mostrar expedientes que aún NO han sido evaluados
      if (e.includes("aprobado") || e.includes("rechazado")) return false;

      const fechaSolNorm = normalizarFechaString(s.fechaVisitaInspector || s.fechaVisita || s.fechaInspeccion || "");
      return fechaSolNorm === hoyNorm;
    });
  }, [solicitudes, esExpedienteDeEsteInspector]);

  const inspeccionesFinalizadas = useMemo(() => {
    return solicitudes.filter((s) => {
      if (!esExpedienteDeEsteInspector(s)) return false;
      const e = (s.estado || "").toLowerCase();
      return e.includes("aprobado") || e.includes("rechazado");
    });
  }, [solicitudes, esExpedienteDeEsteInspector]);

  const esHistorial = seccion === "historial" || seccion === "historial-inspecciones";

  const inspeccionesHoy = useMemo(() => {
    const hoyNorm = normalizarFechaString(formatearFechaLocal(new Date()));
    return solicitudes.filter((s) => {
      if (!esExpedienteDeEsteInspector(s)) return false;
      const e = (s.estado || s.estadoNormalizado || "").toLowerCase();
      if (e.includes("aprobado") || e.includes("rechazado")) return false;
      const fechaSolNorm = normalizarFechaString(s.fechaVisitaInspector || s.fechaVisita || s.fechaInspeccion || "");
      return fechaSolNorm === hoyNorm;
    });
  }, [solicitudes, esExpedienteDeEsteInspector]);

  const solicitudesFiltradas = useMemo(() => {
    if (!esHistorial) {
      return inspeccionesPendientes;
    }

    return inspeccionesFinalizadas.filter((s) => {
      // 1. Filtro por Dictamen / Estado en Historial (Aprobada / Desaprobada)
      const est = (s.estado || "").toLowerCase();
      if (filtroEstado === "aprobada" && !est.includes("aprobado")) return false;
      if (filtroEstado === "desaprobada" && (est.includes("aprobado") || (!est.includes("rechazad") && !est.includes("observad")))) return false;

      // 2. Búsqueda por DNI, RUC o Código de Expediente en Historial
      if (!busqueda.trim()) return true;
      const q = busqueda.toLowerCase().trim();
      const dni = (s.dniSolicitante || s.dni || "").toLowerCase();
      const idExp = (s.id || "").toLowerCase();
      const codExp = `exp-${idExp}`;
      const ruc = (s.ruc || "").toLowerCase();
      const nombreSol = [s.nombresSolicitante, s.apellidosSolicitante, s.nombreSolicitante, s.nombreNegocio].filter(Boolean).join(" ").toLowerCase();

      return dni.includes(q) || idExp.includes(q) || codExp.includes(q) || ruc.includes(q) || nombreSol.includes(q);
    });
  }, [solicitudes, busqueda, filtroEstado, esHistorial, inspeccionesPendientes, inspeccionesFinalizadas]);

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

  // EVALUAR E INSPECCIONAR (APROBAR / OBSERVADA / RECHAZADA)
  const guardarResultadoInspeccion = async () => {
    if (!solicitudAtencion) return;
    if (!resultadoDecisión) {
      alert("Seleccione una decisión (Aprobado, Observado o Rechazado).");
      return;
    }
    if ((resultadoDecisión === "observado" || resultadoDecisión === "rechazado") && !observacionesTexto.trim()) {
      alert("Ingrese las observaciones o motivos detallados del informe técnico.");
      return;
    }

    setProcesando(true);
    try {
      const fechaHoraActual = formatearFechaHora();
      const nombreInspector = usuario?.nombre || usuario?.email || "Inspector Municipal";

      let nuevoEstado = "Inspección aprobada";
      let nuevoEstadoNorm = "INSPECCION_APROBADA";

      if (resultadoDecisión === "observado") {
        nuevoEstado = "Inspección observada";
        nuevoEstadoNorm = "INSPECCION_OBSERVADA";
      } else if (resultadoDecisión === "rechazado") {
        nuevoEstado = "Inspección rechazada";
        nuevoEstadoNorm = "INSPECCION_RECHAZADA";
      }

      const logEntrada = {
        fecha: fechaHoraActual.split(",")[0] || fechaHoraActual,
        hora: fechaHoraActual.split(",")[1]?.trim() || "",
        inspector: nombreInspector,
        accion: `Evaluación Técnica: ${resultadoDecisión.toUpperCase()}`,
        comentarios: observacionesTexto || `Inspección dictaminada como ${resultadoDecisión.toUpperCase()}.`,
        evidencias: evidencias.map((e) => e.nombre || "Fotografía de evidencia"),
      };

      const cambios = {
        estadoInspeccion: nuevoEstado,
        inspeccion: nuevoEstado,
        estado: nuevoEstado,
        estadoNormalizado: nuevoEstadoNorm,
        resultadoInspeccion: resultadoDecisión,
        observacionesInspector: observacionesTexto,
        evidenciasInspector: evidencias,
        fechaEvaluacionInspector: fechaHoraActual,
        inspectorNombre: nombreInspector,
        inspectorUid: usuario?.uid || "INSP-001",
        historialAcciones: [...(solicitudAtencion.historialAcciones || []), logEntrada],
      };

      await actualizarSolicitud(solicitudAtencion.id, cambios);

      const expLimpio = String(solicitudAtencion.id).replace(/^EXP-/, "");

      if (resultadoDecisión === "aprobado" && solicitudAtencion.correoUsuario) {
        const numLicenciaStr = `00${expLimpio.slice(-6)} - 2026 MPT-GDEL-SGLC`;
        const fechaHoyFormateada = `Trujillo, ${new Date().toLocaleDateString("es-PE", { day: "numeric", month: "long", year: "numeric" })}`;

        const htmlLicenciaOficial = `
          <div style="font-family: Arial, sans-serif; max-width: 650px; margin: 0 auto; background: #ffffff; border: 2.5px solid #0f172a; border-radius: 12px; overflow: hidden; padding: 24px; box-shadow: 0 4px 14px rgba(0,0,0,0.1);">
            <div style="text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 20px;">
              <h2 style="margin: 0; color: #0f172a; font-size: 20px; font-weight: 900; letter-spacing: 1px;">MUNICIPALIDAD PROVINCIAL DE TRUJILLO</h2>
              <span style="font-size: 11.5px; color: #475569; font-weight: bold; text-transform: uppercase;">Gerencia de Desarrollo Económico Local — Subgerencia de Licencias y Comercialización</span>
              
              <div style="margin-top: 16px; background: #f8fafc; border: 1.5px solid #0f172a; padding: 12px; border-radius: 8px;">
                <h1 style="margin: 0; color: #1e3a8a; font-size: 21px; font-weight: 900;">LICENCIA DE FUNCIONAMIENTO</h1>
                <p style="margin: 4px 0 0; font-size: 15px; font-weight: 800; color: #dc2626;">Nro. ${numLicenciaStr}</p>
                <small style="color: #475569; font-weight: bold;">(Ley N° 28976 — Marco Único de Licencias de Funcionamiento)</small>
              </div>
            </div>

            <div style="font-size: 13.5px; color: #1e293b; line-height: 1.6;">
              <p style="margin: 0 0 16px; font-style: italic; text-align: justify; color: #475569;">
                Visto el Expediente N° <strong>EXP-${expLimpio}</strong> y habiéndose cumplido con los requisitos exigidos por el TÚO de la Ley N° 28976 y las Ordenanzas Municipales vigentes, habiendo obtenido informe de inspección técnica <strong>CONFORME Y APROBADO</strong>, la Municipalidad Provincial de Trujillo otorga la presente Licencia Municipal de Funcionamiento a favor de:
              </p>

              <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 13px;">
                <tr><td style="padding: 8px 12px; font-weight: bold; border-bottom: 1px solid #e2e8f0; width: 40%;">Titular / Solicitante:</td><td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #0f172a;">${solicitudAtencion.nombresSolicitante || ""} ${solicitudAtencion.apellidosSolicitante || ""} ${solicitudAtencion.nombreSolicitante || ""}</td></tr>
                <tr><td style="padding: 8px 12px; font-weight: bold; border-bottom: 1px solid #e2e8f0;">Doc. Identidad / RUC:</td><td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">${solicitudAtencion.ruc || solicitudAtencion.dniSolicitante || solicitudAtencion.dni}</td></tr>
                <tr><td style="padding: 8px 12px; font-weight: bold; border-bottom: 1px solid #e2e8f0;">Representante Legal:</td><td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">${solicitudAtencion.nombreSolicitante || "Titular Representante"}</td></tr>
                <tr><td style="padding: 8px 12px; font-weight: bold; border-bottom: 1px solid #e2e8f0;">Doc. Identidad (DNI):</td><td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">${solicitudAtencion.dniSolicitante || solicitudAtencion.dni || "---"}</td></tr>
                <tr><td style="padding: 8px 12px; font-weight: bold; border-bottom: 1px solid #e2e8f0;">Nombre Comercial:</td><td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #1e3a8a;">${solicitudAtencion.nombreNegocio}</td></tr>
                <tr><td style="padding: 8px 12px; font-weight: bold; border-bottom: 1px solid #e2e8f0;">Dirección del Local:</td><td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">${solicitudAtencion.direccion}</td></tr>
                <tr><td style="padding: 8px 12px; font-weight: bold; border-bottom: 1px solid #e2e8f0;">Giro Autorizado:</td><td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">${solicitudAtencion.giro || "Comercio / Servicios"}</td></tr>
                <tr><td style="padding: 8px 12px; font-weight: bold; border-bottom: 1px solid #e2e8f0;">Zonificación:</td><td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">Comercial Vecinal (CZ)</td></tr>
                <tr><td style="padding: 8px 12px; font-weight: bold;">Área del Establecimiento:</td><td style="padding: 8px 12px;">Hasta 100.00 m²</td></tr>
              </table>

              <div style="text-align: right; margin-bottom: 20px; font-weight: bold; color: #0f172a;">
                ${fechaHoyFormateada}
              </div>

              <div style="background: #fffbe6; border: 1.5px solid #ffe58f; padding: 14px; border-radius: 8px; margin-bottom: 20px;">
                <h4 style="margin: 0 0 6px; color: #d46b08; font-size: 13.5px; font-weight: 800;">PROHIBICIONES AL ESTABLECIMIENTO</h4>
                <ol style="margin: 0; padding-left: 18px; font-size: 12px; color: #873800; line-height: 1.5;">
                  <li>Prohibido generar ruidos nocivos o molestos que excedan los decibelios permitidos por ordenanza municipal.</li>
                  <li>Prohibido la ocupación no autorizada de la vía pública o veredas con mercadería o mobiliario.</li>
                  <li>Prohibida la venta de bebidas alcohólicas a menores de edad (Ley N° 28681).</li>
                  <li>Prohibido alterar el giro comercial autorizado sin la debida ampliación de licencia municipal.</li>
                </ol>
              </div>

              <div style="text-align: center; background: #eff6ff; border: 1.5px dashed #3b82f6; padding: 12px; border-radius: 8px; margin-bottom: 24px;">
                <strong style="color: #1d4ed8; font-size: 13px; letter-spacing: 0.5px;">
                  ES OBLIGATORIO QUE SE EXHIBA EN UN LUGAR VISIBLE DEL ESTABLECIMIENTO
                </strong>
              </div>

              <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 30px; border-top: 1px solid #cbd5e1; padding-top: 20px;">
                <div>
                  <small style="color: #64748b; font-weight: bold; display: block;">SUBGERENCIA DE LICENCIAS Y COMERCIALIZACIÓN</small>
                  <span style="font-size: 12px; color: #94a3b8;">Gerencia de Desarrollo Económico Local</span>
                </div>
                <div style="text-align: center;">
                  <div style="font-family: cursive, sans-serif; font-size: 20px; color: #1e3a8a; margin-bottom: -2px;">Vicky Mori del Águila</div>
                  <div style="font-size: 11px; font-weight: bold; color: #0f172a; border-top: 1px solid #0f172a; padding-top: 2px;">
                    SUB GERENTE DE LICENCIAS MUNICIPALES
                  </div>
                </div>
              </div>
            </div>
          </div>
        `;

        await crearNotificacion(
          solicitudAtencion.uidUsuario || "CIUDADANO",
          {
            titulo: `📜 Licencia de Funcionamiento Emitida — N° ${numLicenciaStr}`,
            descripcion: `¡Felicidades! Su inspección fue APROBADA y se ha emitido la Licencia de Funcionamiento Oficial N° ${numLicenciaStr} para su establecimiento ${solicitudAtencion.nombreNegocio}.`,
            icono: "📜",
            html: htmlLicenciaOficial,
          },
          solicitudAtencion.correoUsuario
        );
      } else {
        await crearNotificacion(
          solicitudAtencion.uidUsuario || "",
          {
            titulo: `Resultado de Inspección: ${resultadoDecisión.toUpperCase()}`,
            descripcion: `Su expediente EXP-${expLimpio} ha sido evaluado con resultado: ${nuevoEstado}.`,
            icono: resultadoDecisión === "aprobado" ? "✅" : resultadoDecisión === "observado" ? "⚠️" : "❌",
          },
          solicitudAtencion.correoUsuario || ""
        );
      }

      alert(`Resultado registrado con éxito. Estado: ${nuevoEstado}`);
      setSolicitudAtencion(null);
      await cargarSolicitudes();
    } catch (err) {
      console.error(err);
      alert("Error al registrar resultado de inspección: " + err.message);
    } finally {
      setProcesando(false);
    }
  };

  return (
    <div className="panel panel-inspector">
      <div className="inspector-hero" style={{ background: esHistorial ? "linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)" : "linear-gradient(135deg, #7c3aed 0%, #312e81 100%)" }}>
        <div>
          <span className="eyebrow">Municipalidad de Trujillo — Módulo de Inspección Técnica</span>
          <h1>{esHistorial ? "📈 Historial de Inspecciones Atendidas" : "📅 Inspecciones Programadas para Hoy"}</h1>
          <p>
            {esHistorial
              ? "Registro auditado de expedientes e inspecciones evaluadas con dictamen técnico emitido y evidencias adjuntas."
              : "Visitas de inspección técnica agendadas para ser atendidas en terreno el día de hoy."}
          </p>
        </div>

        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <div className="hero-card">
            <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {esHistorial ? "Atendidas" : "Hoy"}
            </span>
            <strong style={{ fontSize: "24px" }}>
              {esHistorial ? inspeccionesFinalizadas.length : inspeccionesHoy.length}
            </strong>
            <small>expedientes</small>
          </div>

          <button type="button" className="btn-outline-light" onClick={cargarSolicitudes}>
            {cargando ? "Actualizando..." : "🔄 Actualizar"}
          </button>
        </div>
      </div>

      <div className="stats-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px", marginBottom: "20px" }}>
        <div className="stat-card" style={{ background: !esHistorial ? "#fef3c7" : "white" }}>
          <span>Inspecciones Para Hoy</span>
          <strong style={{ color: "#d97706" }}>{inspeccionesPendientes.length}</strong>
          <small>Programadas para hoy</small>
        </div>
        <div className="stat-card" style={{ background: esHistorial ? "#dcfce7" : "white" }}>
          <span>Inspecciones Evaluadas</span>
          <strong style={{ color: "#16a34a" }}>{inspeccionesFinalizadas.length}</strong>
          <small>Resultados emitidos</small>
        </div>
        <div className="stat-card">
          <span>Inspector Responsable</span>
          <strong style={{ color: "#2563eb", fontSize: "16px" }}>{usuario?.nombre || "Inspector Municipal"}</strong>
          <small>{usuario?.email || "Inspector de Licencias"}</small>
        </div>
      </div>

      <section className="section-card">
        <div className="section-header">
          <div>
            <h2>
              {esHistorial
                ? "Registro Histórico de Inspecciones Evaluadas"
                : "Visitas de Inspección Programadas para Hoy"}
            </h2>
            <p>
              {esHistorial
                ? "Consulta el dictamen final, observaciones registradas, fotografías adjuntas y la trazabilidad de cada inspección atendida."
                : "Revisa los datos del establecimiento comercial, ubicación, teléfono de contacto y registra la evaluación técnica."}
            </p>
          </div>
        </div>

        {esHistorial && (
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "20px" }}>
            <input
              type="text"
              placeholder="🔍 Buscar por DNI, RUC o Código de Expediente (EXP-XXXX)..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              style={{ flex: 1, minWidth: "240px", padding: "12px 18px", borderRadius: "10px", border: "1px solid #cbd5e1", fontSize: "14px" }}
            />

            <select
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
              style={{ padding: "12px 16px", borderRadius: "10px", border: "1px solid #cbd5e1", fontSize: "14px", fontWeight: "bold", background: "#f8fafc", color: "#1e293b", minWidth: "200px" }}
            >
              <option value="todos">📌 Todos los dictámenes</option>
              <option value="aprobada">✅ Aprobadas</option>
              <option value="desaprobada">❌ Desaprobadas</option>
            </select>
          </div>
        )}

        {solicitudesFiltradas.length === 0 ? (
          <div className="empty-state">
            <div style={{ fontSize: "36px", marginBottom: "10px" }}>{esHistorial ? "📈" : "🔍"}</div>
            <h3>{esHistorial ? "No se encontraron inspecciones atendidas" : "No hay inspecciones programadas para hoy"}</h3>
            <p>{esHistorial ? "Las inspecciones que evalúes y finalices aparecerán registradas en esta sección." : "Las inspecciones agendadas para la fecha actual aparecerán en esta lista."}</p>
          </div>
        ) : (
          <div className="tabla-container">
            <table className="modern-table">
              <thead>
                <tr>
                  <th>Expediente</th>
                  <th>Ciudadano / DNI</th>
                  <th>Establecimiento / RUC</th>
                  <th>Fecha Visita</th>
                  <th>Dictamen / Estado</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {solicitudesFiltradas.map((s) => {
                  const nombreCiudadano =
                    [s.nombresSolicitante, s.apellidosSolicitante, s.nombreSolicitante].filter(Boolean).join(" ") ||
                    "Solicitante";

                  return (
                    <tr key={s.id}>
                      <td>
                        <strong>EXP-{s.id}</strong>
                        <small style={{ display: "block", color: "#64748b" }}>{s.fecha || "---"}</small>
                      </td>
                      <td>
                        <strong>{nombreCiudadano}</strong>
                        <small style={{ display: "block", color: "#475569" }}>DNI: {s.dniSolicitante || s.dni || "---"}</small>
                        <small style={{ display: "block", color: "#2563eb", fontWeight: "600", marginTop: "2px" }}>
                          📱 Cel: {s.telefono || "---"} | ✉️ {s.correoUsuario || s.correo || "---"}
                        </small>
                      </td>
                      <td>
                        <strong>{s.nombreNegocio}</strong>
                        <small style={{ display: "block", color: "#64748b" }}>RUC: {s.ruc}</small>
                      </td>
                      <td>
                        {s.fechaVisitaInspector ? (
                          <span className="badge info">
                            📅 {s.fechaVisitaInspector} ({s.horaVisitaLabel || s.horaVisitaInspector || "Por definir"})
                          </span>
                        ) : (
                          <span className="badge warning">Por programar</span>
                        )}
                      </td>
                      <td>
                        <span className={`badge ${
                          (s.estado || "").toLowerCase().includes("aprobado") ? "ok" :
                          (s.estado || "").toLowerCase().includes("observada") ? "warning" :
                          (s.estado || "").toLowerCase().includes("rechazado") ? "danger" : "info"
                        }`}>
                          {s.estado || "Asignado a Inspección"}
                        </span>
                      </td>
                      <td>
                        {esHistorial ? (
                          <button
                            type="button"
                            className="btn-primary"
                            onClick={() => abrirModalAtencion(s, "historial")}
                            style={{ background: "#312e81", color: "white", padding: "8px 16px", borderRadius: "8px", fontWeight: "700" }}
                          >
                            👁️ Ver Detalles
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn-primary"
                            onClick={() => abrirModalAtencion(s, "evaluacion")}
                            style={{ background: "#7c3aed", color: "white", padding: "8px 16px", borderRadius: "8px", fontWeight: "700" }}
                          >
                            🔍 Atender Expediente
                          </button>
                        )}
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
                <h3 style={{ color: "white", margin: 0 }}>🔍 Módulo de Inspección Técnica — EXP-{solicitudAtencion.id}</h3>
                <small style={{ color: "#e0e7ff" }}>Establecimiento: {solicitudAtencion.nombreNegocio} (RUC: {solicitudAtencion.ruc})</small>
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
                className={tabModal === "programacion" ? "tab-active" : ""}
                onClick={() => setTabModal("programacion")}
              >
                📅 Programar Visita
              </button>
              <button
                type="button"
                className={tabModal === "documentos" ? "tab-active" : ""}
                onClick={() => setTabModal("documentos")}
              >
                📄 Datos y PDFs (RENIEC/SUNAT)
              </button>
              <button
                type="button"
                className={tabModal === "historial" ? "tab-active" : ""}
                onClick={() => setTabModal("historial")}
              >
                📜 Historial Completo ({ (solicitudAtencion.historialAcciones || []).length })
              </button>
            </div>

            <div style={{ padding: "20px" }}>
              {tabModal === "evaluacion" && (
                <div>
                  <h4 style={{ color: "#1e293b", margin: "0 0 14px", fontSize: "15px" }}>Seleccione Resultado de la Evaluación Técnica:</h4>
                  
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", marginBottom: "16px" }}>
                    <button
                      type="button"
                      onClick={() => setResultadoDecisión("aprobado")}
                      style={{
                        padding: "14px",
                        borderRadius: "10px",
                        border: resultadoDecisión === "aprobado" ? "2px solid #16a34a" : "1px solid #cbd5e1",
                        background: resultadoDecisión === "aprobado" ? "#f0fdf4" : "white",
                        cursor: "pointer",
                        fontWeight: "bold",
                        color: resultadoDecisión === "aprobado" ? "#166534" : "#475569",
                        textAlign: "center"
                      }}
                    >
                      <div style={{ fontSize: "24px", marginBottom: "4px" }}>🟢</div>
                      Aprobar Inspección
                    </button>

                    <button
                      type="button"
                      onClick={() => setResultadoDecisión("observado")}
                      style={{
                        padding: "14px",
                        borderRadius: "10px",
                        border: resultadoDecisión === "observado" ? "2px solid #d97706" : "1px solid #cbd5e1",
                        background: resultadoDecisión === "observado" ? "#fffbeb" : "white",
                        cursor: "pointer",
                        fontWeight: "bold",
                        color: resultadoDecisión === "observado" ? "#b45309" : "#475569",
                        textAlign: "center"
                      }}
                    >
                      <div style={{ fontSize: "24px", marginBottom: "4px" }}>🟡</div>
                      Solicitar Subsanación
                    </button>

                    <button
                      type="button"
                      onClick={() => setResultadoDecisión("rechazado")}
                      style={{
                        padding: "14px",
                        borderRadius: "10px",
                        border: resultadoDecisión === "rechazado" ? "2px solid #dc2626" : "1px solid #cbd5e1",
                        background: resultadoDecisión === "rechazado" ? "#fef2f2" : "white",
                        cursor: "pointer",
                        fontWeight: "bold",
                        color: resultadoDecisión === "rechazado" ? "#991b1b" : "#475569",
                        textAlign: "center"
                      }}
                    >
                      <div style={{ fontSize: "24px", marginBottom: "4px" }}>🔴</div>
                      Rechazar Inspección
                    </button>
                  </div>

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

              {tabModal === "programacion" && (
                <div>
                  <h4 style={{ color: "#1e293b", margin: "0 0 14px", fontSize: "15px" }}>Programar Fecha y Hora de Inspección Física:</h4>
                  
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "13px", fontWeight: "bold", color: "#334155", marginBottom: "6px" }}>
                        Fecha de la Visita (Mínimo mañana) *
                      </label>
                      <input
                        type="date"
                        min={formatearFechaYYYYMMDD(obtenerFechaMinimaInspeccion())}
                        value={
                          fechaVisita && fechaVisita.includes("/")
                            ? fechaVisita.split("/").reverse().join("-")
                            : fechaVisita
                        }
                        onChange={(e) => {
                          const valYMD = e.target.value;
                          if (!valYMD) return;
                          const [y, m, d] = valYMD.split("-");
                          setFechaVisita(`${d}/${m}/${y}`);
                        }}
                        style={{
                          width: "100%", padding: "10px", borderRadius: "8px",
                          border: fechaVisita && !esFechaValidaParaInspeccion(fechaVisita) ? "1.5px solid #dc2626" : "1px solid #cbd5e1",
                          fontSize: "14px"
                        }}
                      />
                      {fechaVisita && !esFechaValidaParaInspeccion(fechaVisita) && (
                        <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", color: "#991b1b", padding: "8px 12px", borderRadius: "8px", marginTop: "6px", fontSize: "12px" }}>
                          ⚠️ {MENSAJE_FECHA_INSPECCION}
                        </div>
                      )}
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "13px", fontWeight: "bold", color: "#334155", marginBottom: "6px" }}>
                        Horario Disponible *
                      </label>
                      <select
                        value={horaVisita}
                        onChange={(e) => setHoraVisita(e.target.value)}
                        style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "14px" }}
                      >
                        {TIME_SLOTS.map((slot) => (
                          <option key={slot.value} value={slot.value}>
                            {slot.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="admin-form-actions">
                    <button type="button" onClick={() => setSolicitudAtencion(null)} disabled={procesando}>Cancelar</button>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={guardarProgramacionVisita}
                      disabled={procesando}
                      style={{ background: "#0f766e", color: "white" }}
                    >
                      {procesando ? "Guardando Fecha..." : "📅 Confirmar Fecha de Inspección"}
                    </button>
                  </div>
                </div>
              )}

              {tabModal === "documentos" && (
                <div>
                  <div style={{ background: "#f8fafc", padding: "14px", borderRadius: "10px", border: "1px solid #e2e8f0", marginBottom: "14px" }}>
                    <h4 style={{ margin: "0 0 6px", color: "#1e293b", fontSize: "14px" }}>👤 Datos RENIEC — Ciudadano Solicitante</h4>
                    <p style={{ margin: "3px 0", fontSize: "13.5px" }}><strong>Nombre Completo:</strong> {[solicitudAtencion.nombresSolicitante, solicitudAtencion.apellidosSolicitante, solicitudAtencion.nombreSolicitante].filter(Boolean).join(" ")}</p>
                    <p style={{ margin: "3px 0", fontSize: "13.5px" }}><strong>DNI:</strong> {solicitudAtencion.dniSolicitante || solicitudAtencion.dni || "---"}</p>
                    <p style={{ margin: "3px 0", fontSize: "13.5px" }}><strong>Correo:</strong> {solicitudAtencion.correoUsuario || "---"}</p>
                    <p style={{ margin: "3px 0", fontSize: "13.5px" }}><strong>Teléfono:</strong> {solicitudAtencion.telefono || "---"}</p>
                  </div>

                  <div style={{ background: "#f8fafc", padding: "14px", borderRadius: "10px", border: "1px solid #e2e8f0", marginBottom: "14px" }}>
                    <h4 style={{ margin: "0 0 6px", color: "#1e293b", fontSize: "14px" }}>🏢 Datos SUNAT — Establecimiento Comercial</h4>
                    <p style={{ margin: "3px 0", fontSize: "13.5px" }}><strong>RUC:</strong> {solicitudAtencion.ruc}</p>
                    <p style={{ margin: "3px 0", fontSize: "13.5px" }}><strong>Nombre Comercial:</strong> {solicitudAtencion.nombreNegocio}</p>
                    <p style={{ margin: "3px 0", fontSize: "13.5px" }}><strong>Razón Social:</strong> {solicitudAtencion.razonSocial || solicitudAtencion.nombreNegocio}</p>
                    <p style={{ margin: "3px 0", fontSize: "13.5px" }}><strong>Giro Comercial:</strong> {solicitudAtencion.giro || "General"}</p>
                    <p style={{ margin: "3px 0", fontSize: "13.5px" }}><strong>Dirección Fiscal:</strong> {solicitudAtencion.direccion}</p>
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
                            <a
                              href="#"
                              onClick={(e) => {
                                e.preventDefault();
                                abrirPdf(pdf.archivoUrl || pdf.url || pdf);
                              }}
                              style={{ fontSize: "12.5px", color: "#2563eb", fontWeight: "bold" }}
                            >
                              Abrir PDF ↗
                            </a>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {tabModal === "historial" && (
                <div>
                  <h4 style={{ color: "#1e293b", margin: "0 0 14px", fontSize: "15px" }}>Historial Auditado de Acciones en la Solicitud:</h4>
                  
                  {(solicitudAtencion.historialAcciones || []).length === 0 ? (
                    <div style={{ textAlign: "center", padding: "20px", color: "#64748b" }}>
                      <p>No hay acciones auditadas registradas en esta solicitud aún.</p>
                    </div>
                  ) : (
                    <div style={{ display: "grid", gap: "10px" }}>
                      {(solicitudAtencion.historialAcciones || []).map((h, idx) => (
                        <div key={idx} style={{ background: "#f8fafc", padding: "12px 16px", borderRadius: "10px", border: "1px solid #cbd5e1" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                            <strong style={{ color: "#7c3aed", fontSize: "14px" }}>{h.accion || "Acción en Expediente"}</strong>
                            <small style={{ color: "#64748b" }}>{h.fecha} {h.hora}</small>
                          </div>
                          <p style={{ margin: "4px 0", fontSize: "13.5px", color: "#334155" }}>{h.comentarios || h.observaciones}</p>
                          <small style={{ color: "#475569", fontWeight: "600" }}>Responsable: {h.inspector || h.cajera || "Sistema"}</small>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PanelInspector;
