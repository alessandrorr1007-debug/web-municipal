import { useEffect, useState, useMemo, useCallback } from "react";
import {
  obtenerSolicitudes,
  actualizarSolicitud,
  contarInspeccionesEnFecha,
  obtenerInspectores,
  guardarSolicitud,
  obtenerHorariosOcupadosInspector,
} from "../services/solicitudService";
import { consultarDni } from "../services/dniService";
import { consultarRuc } from "../services/rucService";
import { registrarDecisionFuncionario } from "../services/auditService";
import { abrirPdf, convertirPdfABase64 } from "../services/pdfService";
import { crearNotificacion } from "../services/notificacionService";
import { useAuth } from "../context/AuthContext";
import Timeline from "./Timeline";
import {
  ESTADOS,
  ESTADO_LABELS,
  ESTADO_COLORES,
  esEstadoCerrado,
  esPuedeAprobar,
  mapLegacyEstado,
} from "../config/estadosSolicitud";
import {
  MAX_INSPECCIONES_POR_DIA,
  TIME_SLOTS,
  DIAS_LABORABLES,
  obtenerCapacidadColor,
  formatearFechaLocal,
  esHorarioPasado,
} from "../config/inspeccionConfig";
import { obtenerDocumentosPorGiro } from "../config/documentosPorGiro";

const INSPECTORES_DEFAULT = [
  { uid: "INSP-001", nombre: "Inspector Carlos Ramírez", correo: "c.ramirez@munitrujillo.gob.pe", cargo: "Inspector de Defensa Civil" },
  { uid: "INSP-002", nombre: "Inspectora María Torres", correo: "m.torres@munitrujillo.gob.pe", cargo: "Inspectora de Gestión Ambiental" },
  { uid: "INSP-003", nombre: "Inspector Juan Mendoza", correo: "j.mendoza@munitrujillo.gob.pe", cargo: "Inspector de Licencias Comerciales" },
];

const MOTIVOS_RECHAZO_DOCS = [
  "Documento faltante",
  "Documento incorrecto",
  "Datos inconsistentes",
  "Otro",
];

function CalendarioInspeccion({ fechaSeleccionada, onSelectFecha, capacidades }) {
  const [mesActual, setMesActual] = useState(() => {
    const hoy = new Date();
    return new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  });

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const anio = mesActual.getFullYear();
  const mes = mesActual.getMonth();
  const primerDia = new Date(anio, mes, 1).getDay();
  const diasEnMes = new Date(anio, mes + 1, 0).getDate();

  const diasCalendario = [];
  for (let i = 0; i < primerDia; i++) {
    diasCalendario.push({ dia: null, fecha: null });
  }
  for (let d = 1; d <= diasEnMes; d++) {
    const fecha = new Date(anio, mes, d);
    diasCalendario.push({ dia: d, fecha });
  }

  const meses = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
  ];
  const diasSemana = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"];

  const irMesAnterior = () => setMesActual(new Date(anio, mes - 1, 1));
  const irMesSiguiente = () => setMesActual(new Date(anio, mes + 1, 1));

  return (
    <div className="calendario-inspeccion">
      <div className="calendario-header">
        <button type="button" onClick={irMesAnterior} className="calendario-nav">
          &#8249;
        </button>
        <span className="calendario-titulo">
          {meses[mes]} {anio}
        </span>
        <button type="button" onClick={irMesSiguiente} className="calendario-nav">
          &#8250;
        </button>
      </div>

      <div className="calendario-grid">
        {diasSemana.map((d) => (
          <div key={d} className="calendario-dia-header">
            {d}
          </div>
        ))}

        {diasCalendario.map((item, idx) => {
          if (!item.dia) {
            return <div key={`empty-${idx}`} className="calendario-dia vacio" />;
          }

          const fechaStr = formatearFechaLocal(item.fecha);
          const esPasado = item.fecha < hoy;
          const esFinDeSemana = !DIAS_LABORABLES.includes(item.fecha.getDay());
          const deshabilitado = esPasado || esFinDeSemana;
          const capacidad = capacidades[fechaStr] || 0;
          const colorCap = obtenerCapacidadColor(capacidad);
          const esSeleccionada = fechaSeleccionada === fechaStr;
          const esHoy =
            item.fecha.getDate() === hoy.getDate() &&
            item.fecha.getMonth() === hoy.getMonth() &&
            item.fecha.getFullYear() === hoy.getFullYear();

          let claseDia = "calendario-dia";
          if (deshabilitado) claseDia += " deshabilitado";
          if (esSeleccionada) claseDia += " seleccionado";
          if (esHoy) claseDia += " hoy";
          if (!deshabilitado && capacidad > 0) claseDia += ` capacidad-${colorCap}`;

          return (
            <button
              key={idx}
              type="button"
              className={claseDia}
              onClick={() => !deshabilitado && onSelectFecha(fechaStr)}
              disabled={deshabilitado}
            >
              <span className="dia-numero">{item.dia}</span>
              {!deshabilitado && capacidad > 0 && (
                <span className={`dia-capacidad cap-${colorCap}`}>
                  {capacidad}/{MAX_INSPECCIONES_POR_DIA}
                </span>
              )}
              {!deshabilitado && capacidad === 0 && esHoy && (
                <span className="dia-capacidad cap-hoy">Hoy</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="calendario-leyenda">
        <div className="leyenda-item">
          <span className="leyenda-dot disp" /> Disponible
        </div>
        <div className="leyenda-item">
          <span className="leyenda-dot casi" /> Casi lleno (4/5)
        </div>
        <div className="leyenda-item">
          <span className="leyenda-dot comp" /> Completo (5/5)
        </div>
      </div>
    </div>
  );
}

function DetFieldValue({ label, value, mono }) {
  const val = value || "---";
  return (
    <div className="det-field">
      <span className="det-field-label">{label}</span>
      <span className={`det-field-value ${mono && val !== "---" ? "mono" : ""}`}>
        {val}
      </span>
    </div>
  );
}

function DetBadge({ color, children }) {
  return (
    <span
      className="det-badge"
      style={{
        background: color + "18",
        color: color,
        border: `1px solid ${color}40`,
      }}
    >
      {children}
    </span>
  );
}

function DetDocumentCard({ archivo, index }) {
  const nombreReal =
    archivo.nombre ||
    archivo.archivoNombre ||
    archivo.name ||
    `Documento_${index + 1}`;
  const url = archivo.archivoUrl || archivo.url || archivo;
  const tipo = archivo.tipo || "application/pdf";
  const tamano = archivo.tamano || archivo.size || null;
  const fechaCarga = archivo.fechaCarga || null;

  const formatTamano = (bytes) => {
    if (!bytes) return null;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  const getIcono = () => {
    if (!tipo || tipo === "application/pdf") return { icon: "PDF", color: "#dc2626" };
    if (tipo.includes("image")) return { icon: "IMG", color: "#2563eb" };
    if (tipo.includes("word") || tipo.includes("document")) return { icon: "DOC", color: "#2563eb" };
    return { icon: "ARC", color: "#6b7280" };
  };

  const { icon, color } = getIcono();

  return (
    <div className="det-doc-card">
      <div className="det-doc-icon" style={{ background: color + "12", color: color, border: `1px solid ${color}30` }}>
        {icon}
      </div>
      <div className="det-doc-info">
        <span className="det-doc-name">{nombreReal}</span>
        <span className="det-doc-meta">
          {tipo.split("/").pop().toUpperCase()}
          {tamano ? ` \u00B7 ${formatTamano(tamano)}` : ""}
          {fechaCarga ? ` \u00B7 ${fechaCarga}` : ""}
        </span>
      </div>
      <a
        href="#"
        className="det-doc-btn"
        onClick={(e) => {
          e.preventDefault();
          if (typeof url === "string" && url.startsWith("http")) {
            abrirPdf(url);
          } else {
            alert("No se puede visualizar el documento directamente.");
          }
        }}
      >
        Ver
      </a>
    </div>
  );
}

function ModalDetalleExpediente({ solicitud, onCerrar, onRevisarDocs, onAgendar, onAprobar, onRechazar, puedeAgendar, puedeAprobar, puedeRechazar, badgeEstado }) {
  const [tabActiva, setTabActiva] = useState("establecimiento");

  const docsData = useMemo(() => {
    if (!solicitud) return { ciudadano: [], sistema: [], giroLabel: "" };
    return obtenerDocumentosPorGiro(solicitud.giro || solicitud.actividadComercial || "general");
  }, [solicitud]);

  const archivosCiudadano = useMemo(() => {
    if (!solicitud) return [];
    return solicitud.archivosPdf || [];
  }, [solicitud]);

  const archivosSistema = useMemo(() => {
    if (!solicitud) return [];
    const sistema = [];
    if (solicitud.comprobantePago || solicitud.comprobantePagoUrl) {
      sistema.push({
        nombre: "Comprobante de pago",
        url: solicitud.comprobantePagoUrl || solicitud.comprobantePago,
        tipo: "application/pdf",
      });
    }
    if (solicitud.factura) {
      sistema.push({
        nombre: "Factura / Boleta",
        url: solicitud.facturaUrl || solicitud.factura,
        tipo: "application/pdf",
      });
    }
    if (solicitud.numeroLicencia) {
      sistema.push({
        nombre: `Licencia ${solicitud.numeroLicencia}`,
        url: solicitud.licenciaUrl || null,
        tipo: "application/pdf",
      });
    }
    return sistema;
  }, [solicitud]);

  if (!solicitud) return null;

  const tabs = [
    { key: "establecimiento", label: "Establecimiento", icon: "\uD83C\uDFE2" },
    { key: "solicitante", label: "Solicitante", icon: "\uD83D\uDC64" },
    { key: "documentos", label: "Documentos", icon: "\uD83D\uDCC4" },
    { key: "inspeccion", label: "Inspección", icon: "\uD83D\uDD0D" },
    { key: "historial", label: "Historial", icon: "\uD83D\uDCDC" },
  ];

  const nombreCompleto = [solicitud.nombresSolicitante, solicitud.apellidosSolicitante, solicitud.nombreSolicitante].filter(Boolean).join(" ") || "---";

  return (
    <div className="det-modal-backdrop" onClick={onCerrar}>
      <div className="det-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="det-modal-header">
          <div className="det-header-left">
            <div className="det-header-icon">
              <span>{solicitud.canalRegistro === "presencial" ? "\uD83C\uDFE5" : "\uD83D\uDCF1"}</span>
            </div>
            <div>
              <h2 className="det-header-title">EXP-{solicitud.id}</h2>
              <span className="det-header-sub">
                {solicitud.nombreNegocio || "---"}
                {solicitud.fecha ? ` \u00B7 ${solicitud.fecha}` : ""}
              </span>
            </div>
          </div>
          <div className="det-header-right">
            <div className="det-header-badges">
              {badgeEstado}
              <DetBadge color={solicitud.canalRegistro === "presencial" ? "#2563eb" : "#16a34a"}>
                {solicitud.canalRegistro === "presencial" ? "Presencial" : "Online"}
              </DetBadge>
            </div>
            <button type="button" className="det-close-btn" onClick={onCerrar}>&#10005;</button>
          </div>
        </div>

        <div className="det-modal-tabs">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`det-tab-btn ${tabActiva === t.key ? "active" : ""}`}
              onClick={() => setTabActiva(t.key)}
            >
              <span className="det-tab-icon">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

        <div className="det-modal-body">
          {tabActiva === "establecimiento" && (
            <div className="det-tab-content animate-fade-in">
              <div className="det-section-card">
                <h3 className="det-section-title">
                  <span className="det-section-icon">&#127970;</span>
                  Datos del Negocio
                </h3>
                <div className="det-fields-grid">
                  <DetFieldValue label="Razón Social" value={solicitud.razonSocial} />
                  <DetFieldValue label="Nombre Comercial" value={solicitud.nombreNegocio} />
                  <DetFieldValue label="RUC" value={solicitud.ruc} mono />
                  <DetFieldValue label="Giro / Actividad" value={solicitud.giro || solicitud.actividadComercial || "---"} />
                  <DetFieldValue label="Tipo Trámite" value={solicitud.tipoTramite || "Nueva licencia"} />
                </div>
              </div>

              <div className="det-section-card">
                <h3 className="det-section-title">
                  <span className="det-section-icon">&#128205;</span>
                  Ubicación del Establecimiento
                </h3>
                <div className="det-fields-grid">
                  <DetFieldValue label="Dirección" value={solicitud.direccion} />
                  <DetFieldValue label="Departamento" value={solicitud.departamento || "La Libertad"} />
                  <DetFieldValue label="Provincia" value={solicitud.provincia || "Trujillo"} />
                  <DetFieldValue label="Distrito" value={solicitud.distrito || "Trujillo"} />
                </div>
              </div>

              <div className="det-section-card">
                <h3 className="det-section-title">
                  <span className="det-section-icon">&#128176;</span>
                  Estado del Pago
                </h3>
                <div className="det-fields-grid">
                  <DetFieldValue label="Estado Pago" value={solicitud.estadoPago || solicitud.estadoPagoGeneral || "Pendiente"} />
                  <DetFieldValue label="Método de Pago" value={solicitud.metodoPago || solicitud.comprobantePago || "---"} />
                  <DetFieldValue label="Monto Pagado" value={solicitud.montoPagado > 0 ? `S/${solicitud.montoPagado}` : "S/ 3.00"} />
                  <DetFieldValue label="Número Operación" value={solicitud.numeroOperacion || solicitud.pagoId || "---"} mono />
                </div>
              </div>
            </div>
          )}

          {tabActiva === "solicitante" && (
            <div className="det-tab-content animate-fade-in">
              <div className="det-section-card">
                <h3 className="det-section-title">
                  <span className="det-section-icon">&#128100;</span>
                  Datos Personales del Solicitante
                </h3>
                <div className="det-fields-grid">
                  <DetFieldValue label="Nombres Completos" value={nombreCompleto} />
                  <DetFieldValue label="DNI" value={solicitud.dniSolicitante} mono />
                  <DetFieldValue label="Correo Electrónico" value={solicitud.correoUsuario} />
                  <DetFieldValue label="Teléfono de Contacto" value={solicitud.telefono} />
                  <DetFieldValue label="Relación con el Local" value={solicitud.relacionSolicitante || "Dueño"} />
                </div>
              </div>
            </div>
          )}

          {tabActiva === "documentos" && (
            <div className="det-tab-content animate-fade-in">
              <div className="det-section-card">
                <h3 className="det-section-title">
                  <span className="det-section-icon">&#128194;</span>
                  Documentos Adjuntados por el Ciudadano
                  <span className="det-section-count">{archivosCiudadano.length}</span>
                </h3>
                {archivosCiudadano.length === 0 ? (
                  <div className="det-empty-docs">
                    <span>No se encontraron documentos adjuntados.</span>
                  </div>
                ) : (
                  <div className="det-doc-list">
                    {archivosCiudadano.map((archivo, i) => (
                      <DetDocumentCard key={i} archivo={archivo} index={i} />
                    ))}
                  </div>
                )}
              </div>

              {solicitud.motivoRechazoDocumentos && (
                <div className="det-section-card det-section-alert">
                  <h3 className="det-section-title det-section-title-alert">
                    <span className="det-section-icon">&#10060;</span>
                    Observaciones Documentarias
                  </h3>
                  <p className="det-alert-text">
                    <strong>Motivo:</strong> {solicitud.motivoRechazoDocumentos}<br />
                    <strong>Detalle:</strong> {solicitud.descripcionRechazoDocumentos}
                  </p>
                </div>
              )}
            </div>
          )}

          {tabActiva === "inspeccion" && (
            <div className="det-tab-content animate-fade-in">
              <div className="det-section-card">
                <h3 className="det-section-title">
                  <span className="det-section-icon">&#128269;</span>
                  Inspección Técnica de Seguridad
                </h3>
                <div className="det-fields-grid">
                  <DetFieldValue label="Resultado Inspección" value={solicitud.resultadoInspeccion || solicitud.inspeccion || "Pendiente"} />
                  <DetFieldValue label="Fecha Visita" value={solicitud.fechaVisitaInspector || "---"} />
                  <DetFieldValue label="Hora Visita" value={solicitud.horaVisitaLabel || solicitud.horaVisitaInspector || "---"} />
                  <DetFieldValue label="Inspector Asignado" value={solicitud.inspectorAsignado || "---"} />
                </div>
              </div>

              {(solicitud.recomendacionInspector || solicitud.observacionInspector) && (
                <div className="det-section-card">
                  <h3 className="det-section-title">
                    <span className="det-section-icon">&#128221;</span>
                    Informe del Inspector
                  </h3>
                  <div className="det-fields-grid">
                    <DetFieldValue label="Recomendación" value={solicitud.recomendacionInspector || "---"} />
                    <DetFieldValue label="Observación del Inspector" value={solicitud.observacionInspector || "---"} />
                  </div>

                  {solicitud.evidenciasInspector && solicitud.evidenciasInspector.length > 0 && (
                    <div style={{ marginTop: "16px" }}>
                      <span style={{ fontSize: "12px", fontWeight: "bold", color: "#64748b", display: "block", marginBottom: "8px" }}>
                        Evidencias Fotográficas ({solicitud.evidenciasInspector.length}):
                      </span>
                      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                        {solicitud.evidenciasInspector.map((foto, idx) => (
                          <img
                            key={idx}
                            src={foto.url || foto}
                            alt={`Evidencia ${idx + 1}`}
                            style={{ width: "120px", height: "90px", objectFit: "cover", borderRadius: "8px", border: "1px solid #cbd5e1" }}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {solicitud.numeroLicencia && (
                <div className="det-section-card">
                  <h3 className="det-section-title">
                    <span className="det-section-icon">&#127942;</span>
                    Licencia Emitida
                  </h3>
                  <div className="det-fields-grid">
                    <DetFieldValue label="Número de Licencia" value={solicitud.numeroLicencia} mono />
                    <DetFieldValue label="Fecha Aprobación" value={solicitud.fechaAprobacion || "---"} />
                    <DetFieldValue label="Fecha Expiración" value={solicitud.fechaExpiracionLicencia || "---"} />
                    <DetFieldValue label="Emitida por" value={solicitud.funcionarioAprueba || "---"} />
                  </div>
                </div>
              )}
            </div>
          )}

          {tabActiva === "historial" && (
            <div className="det-tab-content animate-fade-in">
              <div className="det-section-card">
                <h3 className="det-section-title">
                  <span className="det-section-icon">&#128209;</span>
                  Historial y Trazabilidad del Expediente
                </h3>
                <Timeline solicitud={solicitud} />
              </div>
            </div>
          )}
        </div>

        <div className="det-modal-footer">
          <div className="det-footer-info">
            <small>
              <strong>Expediente:</strong> EXP-{solicitud.id}
              {solicitud.programadoPor ? ` \u00B7 Programado por: ${solicitud.nombreProgramador || solicitud.programadoPor}` : ""}
            </small>
          </div>
          <div className="det-footer-actions">
            <button type="button" className="det-action-btn det-action-primary" onClick={onRevisarDocs} style={{ background: "#2563eb" }}>
              📑 Revisar Documentos
            </button>
            {puedeAgendar && (
              <button type="button" className="det-action-btn det-action-primary" onClick={onAgendar} style={{ background: "#0f766e" }}>
                🔍 Asignar Inspección
              </button>
            )}
            {puedeRechazar && (
              <button type="button" className="det-action-btn det-action-danger" onClick={onRechazar}>
                ❌ Rechazar
              </button>
            )}
            {puedeAprobar && (
              <button type="button" className="det-action-btn det-action-success" onClick={onAprobar}>
                ✅ Aprobar Licencia
              </button>
            )}
            <button type="button" className="det-action-btn det-action-close" onClick={onCerrar}>
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ModalRevisarDocumentos({ solicitud, onCerrar, onAprobarDocs, onRechazarDocs, procesando }) {
  const [modoRechazo, setModoRechazo] = useState(false);
  const [motivoSeleccionado, setMotivoSeleccionado] = useState(MOTIVOS_RECHAZO_DOCS[0]);
  const [descripcionMotivo, setDescripcionMotivo] = useState("");

  const archivos = solicitud?.archivosPdf || [];

  const handleConfirmarRechazo = () => {
    if (!descripcionMotivo.trim()) {
      alert("Debe ingresar una descripción del motivo de rechazo.");
      return;
    }
    onRechazarDocs(motivoSeleccionado, descripcionMotivo.trim());
  };

  return (
    <div className="admin-form-modal" style={{ zIndex: 1002 }}>
      <div className="admin-form-card" style={{ maxWidth: "600px", maxHeight: "85vh", overflowY: "auto" }}>
        <div className="admin-form-header">
          <h3>📑 Validación de Documentos — EXP-{solicitud.id}</h3>
          <button type="button" onClick={onCerrar}>✕</button>
        </div>

        <div style={{ padding: "16px 0" }}>
          <p style={{ fontSize: "14px", color: "#475569", margin: "0 0 14px" }}>
            Negocio: <strong>{solicitud.nombreNegocio}</strong> | RUC: <strong>{solicitud.ruc}</strong>
          </p>

          <h4 style={{ fontSize: "13.5px", color: "#1e293b", margin: "0 0 10px" }}>Documentos Adjuntados ({archivos.length}):</h4>
          {archivos.length === 0 ? (
            <p style={{ color: "#94a3b8", fontSize: "13px" }}>Sin documentos PDF adjuntos.</p>
          ) : (
            <div style={{ display: "grid", gap: "8px", marginBottom: "16px" }}>
              {archivos.map((pdf, idx) => (
                <div key={idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                  <span style={{ fontSize: "13px", color: "#334155", fontWeight: "600" }}>📄 {pdf.nombre || pdf.archivoNombre || `Documento_${idx + 1}`}</span>
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      const url = pdf.archivoUrl || pdf.url || pdf;
                      if (typeof url === "string" && url.startsWith("http")) abrirPdf(url);
                      else alert("No se puede visualizar el documento.");
                    }}
                    style={{ fontSize: "12.5px", color: "#2563eb", fontWeight: "bold", textDecoration: "underline" }}
                  >
                    Ver Documento
                  </a>
                </div>
              ))}
            </div>
          )}

          {!modoRechazo ? (
            <div style={{ background: "#f0fdf4", padding: "12px", borderRadius: "8px", border: "1px solid #bbf7d0", fontSize: "13px", color: "#166534" }}>
              Verifique que la documentación coincida con los requisitos exigidos para el giro comercial antes de aprobar o rechazar.
            </div>
          ) : (
            <div style={{ background: "#fff1f2", padding: "14px", borderRadius: "10px", border: "1px solid #fecdd3" }}>
              <h4 style={{ margin: "0 0 10px", color: "#9f1239", fontSize: "14px" }}>Motivo del Rechazo de Documentos *</h4>

              <div style={{ marginBottom: "10px" }}>
                <label style={{ display: "block", fontSize: "12.5px", fontWeight: "bold", color: "#475569", marginBottom: "4px" }}>Seleccione un Motivo *</label>
                <select
                  value={motivoSeleccionado}
                  onChange={(e) => setMotivoSeleccionado(e.target.value)}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13.5px" }}
                >
                  {MOTIVOS_RECHAZO_DOCS.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12.5px", fontWeight: "bold", color: "#475569", marginBottom: "4px" }}>Descripción del Motivo *</label>
                <textarea
                  value={descripcionMotivo}
                  onChange={(e) => setDescripcionMotivo(e.target.value)}
                  rows="3"
                  placeholder="Detalle exactamente qué documento está incorrecto o faltante..."
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13.5px" }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="admin-form-actions">
          <button type="button" onClick={onCerrar} disabled={procesando}>Cancelar</button>

          {!modoRechazo ? (
            <>
              <button
                type="button"
                className="btn-danger"
                onClick={() => setModoRechazo(true)}
                disabled={procesando}
              >
                ❌ Rechazar Documentos
              </button>
              <button
                type="button"
                className="btn-ok"
                onClick={onAprobarDocs}
                disabled={procesando}
                style={{ background: "#16a34a", color: "white" }}
              >
                ✅ Documentos Conformes
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => setModoRechazo(false)} disabled={procesando}>Volver</button>
              <button
                type="button"
                className="btn-danger"
                onClick={handleConfirmarRechazo}
                disabled={procesando || !descripcionMotivo.trim()}
              >
                {procesando ? "Enviando..." : "Confirmar Rechazo"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function FormularioSolicitudPresencial({ onSolicitudCreada, usuarioFuncionario }) {
  const [form, setForm] = useState({
    dniSolicitante: "",
    nombresSolicitante: "",
    apellidosSolicitante: "",
    correoUsuario: "",
    telefono: "",
    relacionSolicitante: "Dueño",
    ruc: "",
    nombreNegocio: "",
    razonSocial: "",
    direccion: "",
    giro: "Comercio",
    departamento: "La Libertad",
    provincia: "Trujillo",
    distrito: "Trujillo",
    tipoTramite: "Nueva licencia",
    numeroComprobanteCaja: "",
    montoPagado: 3,
    estadoPago: "Pendiente",
    metodoPago: "Pago presencial en caja municipal",
  });

  const [buscandoDni, setBuscandoDni] = useState(false);
  const [errorDni, setErrorDni] = useState("");
  const [successDni, setSuccessDni] = useState("");

  const [buscandoRuc, setBuscandoRuc] = useState(false);
  const [errorRuc, setErrorRuc] = useState("");
  const [successRuc, setSuccessRuc] = useState("");

  const [archivosPdf, setArchivosPdf] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [expedienteCreado, setExpedienteCreado] = useState(null);

  const buscarDni = async () => {
    setErrorDni("");
    setSuccessDni("");
    if (!/^\d{8}$/.test(form.dniSolicitante.trim())) {
      setErrorDni("El DNI debe tener 8 dígitos.");
      return;
    }
    setBuscandoDni(true);
    try {
      const data = await consultarDni(form.dniSolicitante.trim());
      const apellidos = [data.apellido_paterno, data.apellido_materno].filter(Boolean).join(" ");
      setForm((prev) => ({
        ...prev,
        nombresSolicitante: data.nombres || "",
        apellidosSolicitante: apellidos || "",
      }));
      setSuccessDni("✓ Identidad verificada en RENIEC.");
    } catch (err) {
      setErrorDni(err.message || "No se pudo consultar el DNI.");
    } finally {
      setBuscandoDni(false);
    }
  };

  const buscarRuc = async () => {
    setErrorRuc("");
    setSuccessRuc("");
    if (form.ruc.trim().length !== 11) {
      setErrorRuc("El RUC debe tener 11 dígitos.");
      return;
    }
    setBuscandoRuc(true);
    try {
      const data = await consultarRuc(form.ruc.trim());
      setForm((prev) => ({
        ...prev,
        razonSocial: data.nombreNegocio || data.razon_social || "",
        nombreNegocio: data.nombreComercial || data.nombreNegocio || data.razon_social || "",
        direccion: data.direccion || "",
        departamento: data.departamento || "La Libertad",
        provincia: data.provincia || "Trujillo",
        distrito: data.distrito || "Trujillo",
        giro: data.giroComercial || data.actividad_economica || "Comercio",
      }));
      setSuccessRuc("✓ Contribuyente verificado en SUNAT.");
    } catch (err) {
      setErrorRuc(err.message || "No se pudo consultar el RUC.");
    } finally {
      setBuscandoRuc(false);
    }
  };

  const manejarArchivosPdf = (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    if (files.length + archivosPdf.length > 5) {
      alert("Solo se permite adjuntar hasta 5 archivos PDF.");
      return;
    }
    const invalid = files.find((f) => f.type !== "application/pdf");
    if (invalid) {
      alert("Solo se permiten archivos en formato PDF.");
      return;
    }
    setArchivosPdf((prev) => [...prev, ...files]);
    e.target.value = "";
  };

  const quitarArchivo = (index) => {
    setArchivosPdf((prev) => prev.filter((_, i) => i !== index));
  };

  const guardarExpedientePresencial = async (e) => {
    e.preventDefault();
    if (!form.dniSolicitante || !form.nombresSolicitante || !form.apellidosSolicitante) {
      alert("Por favor consulte y complete los datos del solicitante.");
      return;
    }
    if (!form.ruc || !form.nombreNegocio || !form.direccion) {
      alert("Por favor consulte y complete los datos del establecimiento (RUC, Nombre y Dirección).");
      return;
    }

    setGuardando(true);
    try {
      const pdfsBase64 = [];
      for (const f of archivosPdf) {
        try {
          const res = await convertirPdfABase64(f);
          pdfsBase64.push(res);
        } catch (err) {
          console.error("Error convirtiendo PDF:", f.name, err);
        }
      }

      const tipoContribuyente = form.ruc.startsWith("20") ? "Persona Jurídica" : "Persona Natural";
      const fechaActualStr = new Date().toLocaleDateString("es-PE");
      const tienePagoIngresado = Boolean(form.numeroComprobanteCaja);

      const nuevaSolicitud = {
        uidUsuario: "",
        correoUsuario: form.correoUsuario.trim() || `presencial-${Date.now().toString().slice(-6)}@munitrujillo.gob.pe`,
        telefono: form.telefono,
        tipoTramite: form.tipoTramite,
        canalRegistro: "presencial",
        dniSolicitante: form.dniSolicitante.trim(),
        nombresSolicitante: form.nombresSolicitante.trim(),
        apellidosSolicitante: form.apellidosSolicitante.trim(),
        relacionSolicitante: form.relacionSolicitante,
        ruc: form.ruc.trim(),
        nombreNegocio: form.nombreNegocio.trim(),
        razonSocial: form.razonSocial.trim(),
        direccion: form.direccion.trim(),
        giro: form.giro || "Comercio general",
        departamento: form.departamento,
        provincia: form.provincia,
        distrito: form.distrito,
        tipoContribuyente,
        archivosPdf: pdfsBase64,
        archivoNombre: pdfsBase64[0]?.archivoNombre || "Documentación Física Escaneada",
        archivoUrl: pdfsBase64[0]?.archivoUrl || "",
        metodoPago: form.metodoPago,
        estadoPago: tienePagoIngresado ? "Confirmado" : "Pendiente",
        comprobantePago: tienePagoIngresado ? `Comprobante de Caja N° ${form.numeroComprobanteCaja}` : "Pago pendiente en caja municipal",
        montoPagado: form.montoPagado,
        numeroOperacion: form.numeroComprobanteCaja || `PENDIENTE-CAJA`,
        estado: tienePagoIngresado ? "Pago confirmado" : "Pendiente de pago",
        estadoNormalizado: tienePagoIngresado ? "PAGO_CONFIRMADO" : "PENDIENTE_PAGO",
        inspeccion: "Sin inspección",
        registradoPorFuncionario: usuarioFuncionario?.nombre || "Funcionario Municipal",
        fecha: fechaActualStr,
      };

      const res = await guardarSolicitud(nuevaSolicitud);
      setExpedienteCreado(res);
      onSolicitudCreada?.();
    } catch (err) {
      console.error(err);
      alert("Error al registrar el expediente presencial: " + err.message);
    } finally {
      setGuardando(false);
    }
  };

  const limpiarFormulario = () => {
    setExpedienteCreado(null);
    setForm({
      dniSolicitante: "",
      nombresSolicitante: "",
      apellidosSolicitante: "",
      correoUsuario: "",
      telefono: "",
      relacionSolicitante: "Dueño",
      ruc: "",
      nombreNegocio: "",
      razonSocial: "",
      direccion: "",
      giro: "Comercio",
      departamento: "La Libertad",
      provincia: "Trujillo",
      distrito: "Trujillo",
      tipoTramite: "Nueva licencia",
      numeroComprobanteCaja: "",
      montoPagado: 3,
      estadoPago: "Pendiente",
      metodoPago: "Pago presencial en caja municipal",
    });
    setArchivosPdf([]);
    setErrorDni("");
    setSuccessDni("");
    setErrorRuc("");
    setSuccessRuc("");
  };

  return (
    <section className="section-card">
      <div className="section-header" style={{ borderBottom: "1px solid #e2e8f0", paddingBottom: "12px", marginBottom: "20px" }}>
        <div>
          <h2 style={{ fontSize: "20px", fontWeight: "700", color: "#0f172a", margin: "0 0 4px" }}>
            📝 Registrar Solicitud Presencial
          </h2>
          <p style={{ color: "#64748b", fontSize: "13.5px", margin: 0 }}>
            Módulo para la atención presencial en ventanilla municipal. Genera expedientes físicos para los ciudadanos.
          </p>
        </div>
      </div>

      {expedienteCreado ? (
        <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "14px", padding: "24px", textAlign: "center" }}>
          <div style={{ fontSize: "48px", marginBottom: "12px" }}>🎉</div>
          <h3 style={{ color: "#166534", margin: "0 0 8px", fontSize: "20px" }}>¡Expediente Creado Con Éxito!</h3>
          <p style={{ color: "#15803d", fontSize: "15px", margin: "0 0 16px" }}>
            Se ha asignado el código único: <strong>EXP-{expedienteCreado.id}</strong>
          </p>
          <div style={{ display: "flex", justifyContent: "center", gap: "12px" }}>
            <button
              type="button"
              className="btn-primary"
              onClick={limpiarFormulario}
              style={{ background: "#16a34a", color: "white", padding: "10px 20px", borderRadius: "8px", border: "none", fontWeight: "600", cursor: "pointer" }}
            >
              ➕ Registrar Otro Expediente
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={guardarExpedientePresencial} style={{ display: "grid", gap: "24px" }}>
          {/* SECCIÓN 1: SOLICITANTE */}
          <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "18px" }}>
            <h3 style={{ fontSize: "15px", fontWeight: "700", color: "#1e293b", margin: "0 0 14px", display: "flex", alignItems: "center", gap: "8px" }}>
              <span>👤</span> 1. Datos del Ciudadano Solicitante
            </h3>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "14px" }}>
              <div>
                <label style={{ display: "block", fontSize: "12.5px", fontWeight: "600", color: "#475569", marginBottom: "4px" }}>
                  DNI del Solicitante *
                </label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    type="text"
                    maxLength="8"
                    placeholder="Ej. 60876298"
                    value={form.dniSolicitante}
                    onChange={(e) => setForm({ ...form, dniSolicitante: e.target.value.replace(/\D/g, "") })}
                    style={{ flex: 1, padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "14px" }}
                    required
                  />
                  <button
                    type="button"
                    onClick={buscarDni}
                    disabled={buscandoDni || !form.dniSolicitante}
                    style={{ padding: "8px 14px", background: "#2563eb", color: "white", border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: "600", cursor: "pointer" }}
                  >
                    {buscandoDni ? "Consultando..." : "RENIEC"}
                  </button>
                </div>
                {errorDni && <small style={{ color: "#dc2626", marginTop: "4px", display: "block" }}>{errorDni}</small>}
                {successDni && <small style={{ color: "#16a34a", marginTop: "4px", display: "block" }}>{successDni}</small>}
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12.5px", fontWeight: "600", color: "#475569", marginBottom: "4px" }}>
                  Nombres Completos *
                </label>
                <input
                  type="text"
                  placeholder="Nombres del solicitante"
                  value={form.nombresSolicitante}
                  onChange={(e) => setForm({ ...form, nombresSolicitante: e.target.value })}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "14px" }}
                  required
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12.5px", fontWeight: "600", color: "#475569", marginBottom: "4px" }}>
                  Apellidos *
                </label>
                <input
                  type="text"
                  placeholder="Apellidos del solicitante"
                  value={form.apellidosSolicitante}
                  onChange={(e) => setForm({ ...form, apellidosSolicitante: e.target.value })}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "14px" }}
                  required
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12.5px", fontWeight: "600", color: "#475569", marginBottom: "4px" }}>
                  Correo Electrónico (Notificaciones)
                </label>
                <input
                  type="email"
                  placeholder="ejemplo@correo.com"
                  value={form.correoUsuario}
                  onChange={(e) => setForm({ ...form, correoUsuario: e.target.value })}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "14px" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12.5px", fontWeight: "600", color: "#475569", marginBottom: "4px" }}>
                  Número Telefónico
                </label>
                <input
                  type="text"
                  placeholder="9XXXXXXXX"
                  value={form.telefono}
                  onChange={(e) => setForm({ ...form, telefono: e.target.value.replace(/\D/g, "") })}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "14px" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12.5px", fontWeight: "600", color: "#475569", marginBottom: "4px" }}>
                  Tipo de Trámite *
                </label>
                <select
                  value={form.tipoTramite}
                  onChange={(e) => setForm({ ...form, tipoTramite: e.target.value })}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "14px" }}
                >
                  <option value="Nueva licencia">Nueva Licencia</option>
                  <option value="Renovación de licencia">Renovación de Licencia</option>
                </select>
              </div>
            </div>
          </div>

          {/* SECCIÓN 2: ESTABLECIMIENTO */}
          <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "18px" }}>
            <h3 style={{ fontSize: "15px", fontWeight: "700", color: "#1e293b", margin: "0 0 14px", display: "flex", alignItems: "center", gap: "8px" }}>
              <span>🏢</span> 2. Datos del Negocio
            </h3>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "14px" }}>
              <div>
                <label style={{ display: "block", fontSize: "12.5px", fontWeight: "600", color: "#475569", marginBottom: "4px" }}>
                  RUC del Establecimiento *
                </label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    type="text"
                    maxLength="11"
                    placeholder="Ej. 20123456789"
                    value={form.ruc}
                    onChange={(e) => setForm({ ...form, ruc: e.target.value.replace(/\D/g, "") })}
                    style={{ flex: 1, padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "14px" }}
                    required
                  />
                  <button
                    type="button"
                    onClick={buscarRuc}
                    disabled={buscandoRuc || !form.ruc}
                    style={{ padding: "8px 14px", background: "#2563eb", color: "white", border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: "600", cursor: "pointer" }}
                  >
                    {buscandoRuc ? "Consultando..." : "SUNAT"}
                  </button>
                </div>
                {errorRuc && <small style={{ color: "#dc2626", marginTop: "4px", display: "block" }}>{errorRuc}</small>}
                {successRuc && <small style={{ color: "#16a34a", marginTop: "4px", display: "block" }}>{successRuc}</small>}
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12.5px", fontWeight: "600", color: "#475569", marginBottom: "4px" }}>
                  Nombre Comercial del Negocio *
                </label>
                <input
                  type="text"
                  placeholder="Nombre del negocio"
                  value={form.nombreNegocio}
                  onChange={(e) => setForm({ ...form, nombreNegocio: e.target.value })}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "14px" }}
                  required
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12.5px", fontWeight: "600", color: "#475569", marginBottom: "4px" }}>
                  Razón Social *
                </label>
                <input
                  type="text"
                  placeholder="Razón Social"
                  value={form.razonSocial}
                  onChange={(e) => setForm({ ...form, razonSocial: e.target.value })}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "14px" }}
                  required
                />
              </div>

              <div style={{ gridColumn: "span 2" }}>
                <label style={{ display: "block", fontSize: "12.5px", fontWeight: "600", color: "#475569", marginBottom: "4px" }}>
                  Dirección del Establecimiento *
                </label>
                <input
                  type="text"
                  placeholder="Av. / Jr. / Calle N° ..."
                  value={form.direccion}
                  onChange={(e) => setForm({ ...form, direccion: e.target.value })}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "14px" }}
                  required
                />
              </div>
            </div>
          </div>

          {/* SECCIÓN 3: PAGO Y DOCUMENTOS */}
          <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "18px" }}>
            <h3 style={{ fontSize: "15px", fontWeight: "700", color: "#1e293b", margin: "0 0 14px", display: "flex", alignItems: "center", gap: "8px" }}>
              <span>📄</span> 3. Documentación y Pago en Caja Municipal
            </h3>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "14px", marginBottom: "16px" }}>
              <div>
                <label style={{ display: "block", fontSize: "12.5px", fontWeight: "600", color: "#475569", marginBottom: "4px" }}>
                  Comprobante de Caja Municipal (Si ya pagó)
                </label>
                <input
                  type="text"
                  placeholder="Ej. REC-2026-00123"
                  value={form.numeroComprobanteCaja}
                  onChange={(e) => setForm({ ...form, numeroComprobanteCaja: e.target.value })}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "14px" }}
                />
                <small style={{ color: "#64748b", fontSize: "11.5px" }}>
                  Si el pago es pendiente, el ciudadano podrá pagar en Ventanilla / Caja.
                </small>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12.5px", fontWeight: "600", color: "#475569", marginBottom: "4px" }}>
                  Monto Derecho de Trámite
                </label>
                <input
                  type="text"
                  value="S/ 3.00"
                  disabled
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "14px", background: "#f1f5f9", fontWeight: "600" }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "12.5px", fontWeight: "600", color: "#475569", marginBottom: "6px" }}>
                Cargar Documentos Entregados Físicamente (PDFs Escaneados)
              </label>
              <input
                type="file"
                accept="application/pdf"
                multiple
                onChange={manejarArchivosPdf}
                style={{ fontSize: "13px", color: "#475569" }}
              />
              {archivosPdf.length > 0 && (
                <div style={{ marginTop: "10px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {archivosPdf.map((file, idx) => (
                    <span
                      key={idx}
                      style={{ background: "#eff6ff", color: "#1d4ed8", padding: "4px 10px", borderRadius: "6px", fontSize: "12px", fontWeight: "600", display: "flex", alignItems: "center", gap: "6px" }}
                    >
                      <span>📄 {file.name}</span>
                      <button
                        type="button"
                        onClick={() => quitarArchivo(idx)}
                        style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontWeight: "bold" }}
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
            <button
              type="submit"
              disabled={guardando}
              style={{
                padding: "12px 24px",
                background: "#0f766e",
                color: "white",
                border: "none",
                borderRadius: "8px",
                fontSize: "14px",
                fontWeight: "700",
                cursor: "pointer",
                boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
              }}
            >
              {guardando ? "Generando Expediente..." : "💾 Generar Expediente Presencial"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function PanelFuncionario({ seccion }) {
  const { usuario } = useAuth();
  const [solicitudes, setSolicitudes] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [busqueda, setBusqueda] = useState("");
  const [solicitudDetalle, setSolicitudDetalle] = useState(null);
  const [solicitudRevisarDocs, setSolicitudRevisarDocs] = useState(null);
  const [solicitudAgendar, setSolicitudAgendar] = useState(null);
  const [slotSeleccionado, setSlotSeleccionado] = useState("");
  const [fechaSeleccionada, setFechaSeleccionada] = useState("");
  const [inspectoresLista, setInspectoresLista] = useState([]);
  const [inspectorSeleccionadoUid, setInspectorSeleccionadoUid] = useState("");
  const [notasInspector, setNotasInspector] = useState("");
  const [horariosOcupados, setHorariosOcupados] = useState([]);
  const [capacidades, setCapacidades] = useState({});
  const [cargandoCapacidad, setCargandoCapacidad] = useState(false);
  const [modalAprobar, setModalAprobar] = useState(null);
  const [modalRechazar, setModalRechazar] = useState(null);
  const [motivoRechazo, setMotivoRechazo] = useState("");
  const [procesando, setProcesando] = useState(false);
  const [paso, setPaso] = useState(seccion || "solicitudes");

  useEffect(() => {
    if (fechaSeleccionada) {
      obtenerHorariosOcupadosInspector(fechaSeleccionada, inspectorSeleccionadoUid).then((data) => {
        setHorariosOcupados(data.map((item) => item.slot));
      });
    } else {
      setHorariosOcupados([]);
    }
  }, [fechaSeleccionada, inspectorSeleccionadoUid]);

  useEffect(() => {
    if (seccion) {
      setPaso(seccion);
    }
  }, [seccion]);

  const cargarSolicitudes = async () => {
    try {
      setCargando(true);
      const data = await obtenerSolicitudes();
      setSolicitudes(data);
    } catch (error) {
      console.error(error);
      alert("No se pudieron cargar las solicitudes.");
    } finally {
      setCargando(false);
    }
  };

  const cargarInspectores = async () => {
    try {
      const data = await obtenerInspectores();
      if (data && data.length > 0) {
        setInspectoresLista(data);
      } else {
        setInspectoresLista(INSPECTORES_DEFAULT);
      }
    } catch (err) {
      console.error(err);
      setInspectoresLista(INSPECTORES_DEFAULT);
    }
  };

  useEffect(() => {
    cargarSolicitudes();
    cargarInspectores();
  }, []);

  const cargarCapacidadesMes = useCallback(async (anio, mes) => {
    setCargandoCapacidad(true);
    const nuevas = {};
    const diasEnMes = new Date(anio, mes + 1, 0).getDate();
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    for (let d = 1; d <= diasEnMes; d++) {
      const fecha = new Date(anio, mes, d);
      if (fecha < hoy) continue;
      if (!DIAS_LABORABLES.includes(fecha.getDay())) continue;
      const fechaStr = formatearFechaLocal(fecha);
      try {
        const count = await contarInspeccionesEnFecha(fechaStr);
        nuevas[fechaStr] = count;
      } catch {
        nuevas[fechaStr] = 0;
      }
    }
    setCapacidades(nuevas);
    setCargandoCapacidad(false);
  }, []);

  useEffect(() => {
    const hoy = new Date();
    cargarCapacidadesMes(hoy.getFullYear(), hoy.getMonth());
  }, [cargarCapacidadesMes]);

  const formatearFechaHora = () => {
    return new Date().toLocaleString("es-PE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const normalizarEstado = (s) => {
    if (s.estadoNormalizado) return s.estadoNormalizado;
    return mapLegacyEstado(s.estado) || s.estado;
  };

  const fechaHoy = useMemo(() => formatearFechaLocal(new Date()), []);

  // DASHBOARD METRICS CALCULATION (10 SECTIONS)
  const stats = useMemo(() => {
    const total = solicitudes.length;

    const pendientesRevision = solicitudes.filter(
      (s) => s.estado === "Pendiente de revisión" || normalizarEstado(s) === ESTADOS.EN_PROCESO_REGISTRO
    ).length;

    const esperandoPago = solicitudes.filter(
      (s) => s.estadoPago === "Pendiente" || s.estado === "Pendiente de pago"
    ).length;

    const revisionDocumental = solicitudes.filter(
      (s) => (s.estadoPago === "Confirmado" || s.estado === "Pago confirmado") && !s.documentosValidados
    ).length;

    const inspeccionesHoy = solicitudes.filter(
      (s) => s.fechaVisitaInspector === fechaHoy
    ).length;

    const inspeccionesPendientes = solicitudes.filter(
      (s) => (s.inspeccion === "Pendiente" || normalizarEstado(s) === ESTADOS.INSPECCION_PROGRAMADA)
    ).length;

    const licenciasAprobadas = solicitudes.filter(
      (s) => normalizarEstado(s) === ESTADOS.APROBADO
    ).length;

    const licenciasRechazadas = solicitudes.filter(
      (s) => normalizarEstado(s) === ESTADOS.RECHAZADO || s.estado === "Documentos rechazados" || s.estado === "No aprobada por inspección"
    ).length;

    const renovacionesProximas = solicitudes.filter((s) => {
      if (normalizarEstado(s) !== ESTADOS.APROBADO) return false;
      const fechaExp = s.fechaExpiracionLicencia || s.fechaVencimiento;
      if (!fechaExp) return false;
      const partes = fechaExp.split("/");
      if (partes.length === 3) {
        const fv = new Date(Number(partes[2]), Number(partes[1]) - 1, Number(partes[0]));
        const hoy = new Date();
        const diffMs = fv.getTime() - hoy.getTime();
        const diffDias = diffMs / (1000 * 3600 * 24);
        return diffDias >= 0 && diffDias <= 30;
      }
      return false;
    }).length;

    return {
      total,
      pendientesRevision,
      esperandoPago,
      revisionDocumental,
      inspeccionesHoy,
      inspeccionesPendientes,
      licenciasAprobadas,
      licenciasRechazadas,
      renovacionesProximas,
    };
  }, [solicitudes, fechaHoy]);

  const solicitudesFiltradas = useMemo(() => {
    let resultado = solicitudes;
    if (filtroEstado !== "todos") {
      resultado = resultado.filter(
        (s) => normalizarEstado(s) === filtroEstado || s.estado === filtroEstado
      );
    }
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase();
      resultado = resultado.filter(
        (s) =>
          (s.id || "").toLowerCase().includes(q) ||
          (s.nombreNegocio || "").toLowerCase().includes(q) ||
          (s.ruc || "").includes(q) ||
          (s.direccion || "").toLowerCase().includes(q)
      );
    }
    return resultado;
  }, [solicitudes, filtroEstado, busqueda]);

  const aprobarDocumentos = async (solicitud) => {
    setProcesando(true);
    try {
      await actualizarSolicitud(solicitud.id, {
        documentosValidados: true,
        fechaValidacionDocumentos: formatearFechaHora(),
        estado: "Documentos validados",
        estadoNormalizado: ESTADOS.PAGO_CONFIRMADO,
      });

      await crearNotificacion(
        solicitud.uidUsuario,
        {
          titulo: "Documentos Conformes",
          descripcion: `Sus documentos para la solicitud EXP-${solicitud.id} fueron verificados y aprobados. Pendiente de asignación de inspección.`,
          icono: "📑",
        },
        solicitud.correoUsuario
      );

      await cargarSolicitudes();
      setSolicitudRevisarDocs(null);
      alert("Documentos validados correctamente.");
    } catch (err) {
      console.error(err);
      alert("Error al validar documentos: " + err.message);
    } finally {
      setProcesando(false);
    }
  };

  const rechazarDocumentos = async (motivo, descripcion) => {
    if (!solicitudRevisarDocs) return;
    setProcesando(true);
    try {
      const reintentosActuales = solicitudRevisarDocs.reintentosDocumentosCount || 0;
      const nuevoConteoReintentos = reintentosActuales + 1;
      const puedeReintentar = nuevoConteoReintentos < 2;

      await actualizarSolicitud(solicitudRevisarDocs.id, {
        documentosValidados: false,
        estado: "Documentos rechazados",
        estadoNormalizado: ESTADOS.DOCUMENTOS_RECHAZADOS,
        motivoRechazoDocumentos: motivo,
        descripcionRechazoDocumentos: descripcion,
        reintentosDocumentosCount: nuevoConteoReintentos,
        puedeReintentarDocumentos: puedeReintentar,
        fechaRechazoDocumentos: formatearFechaHora(),
      });

      await crearNotificacion(
        solicitudRevisarDocs.uidUsuario,
        {
          titulo: "Documentos Rechazados",
          descripcion: "Solicitud rechazada, puede volver a intentar cargando nuevamente los documentos corregidos.",
          icono: "⚠️",
        },
        solicitudRevisarDocs.correoUsuario
      );

      await cargarSolicitudes();
      setSolicitudRevisarDocs(null);
      alert("Solicitud observada por documentos rechazados.");
    } catch (err) {
      console.error(err);
      alert("Error al rechazar documentos: " + err.message);
    } finally {
      setProcesando(false);
    }
  };

  const abrirAgendarModal = (sol) => {
    setSolicitudAgendar(sol);
    setFechaSeleccionada("");
    setSlotSeleccionado("");
    setNotasInspector("");
    if (inspectoresLista.length > 0) {
      setInspectorSeleccionadoUid(inspectoresLista[0].uid || inspectoresLista[0].id || "");
    }
  };

  const handleSelectFecha = (fechaStr) => {
    setFechaSeleccionada(fechaStr);
    const count = capacidades[fechaStr] || 0;
    if (count >= MAX_INSPECCIONES_POR_DIA) {
      setSlotSeleccionado("");
    }
  };

  const agendarInspeccion = async () => {
    if (!solicitudAgendar) return;
    if (!fechaSeleccionada) {
      alert("Debe seleccionar una fecha del calendario.");
      return;
    }
    if (!slotSeleccionado) {
      alert("Debe seleccionar un horario de visita.");
      return;
    }

    const count = capacidades[fechaSeleccionada] || 0;
    if (count >= MAX_INSPECCIONES_POR_DIA) {
      alert(`La fecha ${fechaSeleccionada} ya alcanzó el límite de ${MAX_INSPECCIONES_POR_DIA} inspecciones por día.`);
      return;
    }

    const slot = TIME_SLOTS.find((t) => t.value === slotSeleccionado);
    if (!slot) {
      alert("Horario inválido.");
      return;
    }

    const inspectorObj = inspectoresLista.find(i => (i.uid || i.id) === inspectorSeleccionadoUid) || inspectoresLista[0] || INSPECTORES_DEFAULT[0];
    const nombreInspectorFinal = inspectorObj.nombre || inspectorObj.nombreCompleto || "Inspector Municipal";
    const uidInspectorFinal = inspectorObj.uid || inspectorObj.id || "";

    try {
      setProcesando(true);

      await actualizarSolicitud(solicitudAgendar.id, {
        inspeccion: "Pendiente",
        estado: "Pendiente de inspección",
        estadoNormalizado: ESTADOS.INSPECCION_PROGRAMADA,
        fechaVisitaInspector: fechaSeleccionada,
        horaVisitaInspector: slotSeleccionado,
        horaVisitaLabel: slot.label,
        programadoPor: "funcionario",
        nombreProgramador: usuario?.nombre || "Funcionario Municipal",
        uidProgramador: usuario?.uid || "",
        inspectorAsignado: nombreInspectorFinal,
        inspectorAsignadoUid: uidInspectorFinal,
        notasInspector: notasInspector.trim(),
      });

      const capacidadActual = count + 1;
      setCapacidades((prev) => ({
        ...prev,
        [fechaSeleccionada]: capacidadActual,
      }));

      await crearNotificacion(
        uidInspectorFinal,
        {
          titulo: "Nueva Inspección Asignada",
          descripcion: `Se le ha asignado la inspección del expediente EXP-${solicitudAgendar.id} (${solicitudAgendar.nombreNegocio}) para el día ${fechaSeleccionada} a las ${slot.label}.`,
          icono: "🔍",
        },
        inspectorObj.correo || ""
      );

      alert(`Inspección asignada con éxito a ${nombreInspectorFinal} para el ${fechaSeleccionada} a las ${slot.label}.`);
      setSolicitudAgendar(null);
      setFechaSeleccionada("");
      setSlotSeleccionado("");
      setNotasInspector("");
      await cargarSolicitudes();
    } catch (error) {
      console.error(error);
      alert("Error al asignar inspector: " + error.message);
    } finally {
      setProcesando(false);
    }
  };

  const ejecutarAprobacion = async () => {
    if (!modalAprobar) return;
    const solicitud = modalAprobar;
    setProcesando(true);
    try {
      const fechaActual = new Date();
      const fechaVencimiento = new Date(fechaActual);
      fechaVencimiento.setFullYear(fechaVencimiento.getFullYear() + 1);
      const fechaAprobacion = formatearFechaHora();
      const fechaExpiracion = `${String(fechaVencimiento.getDate()).padStart(2, "0")}/${String(fechaVencimiento.getMonth() + 1).padStart(2, "0")}/${fechaVencimiento.getFullYear()}`;
      const esRenovacion = solicitud.tipoTramite?.includes("Renovación") || solicitud.tipoTramite?.includes("Renovacion");
      const numeroLicencia =
        esRenovacion && solicitud.numeroLicencia
          ? solicitud.numeroLicencia
          : `LIC-2026-${Date.now().toString().slice(-6)}`;

      await actualizarSolicitud(solicitud.id, {
        estado: "Licencia aprobada",
        estadoNormalizado: ESTADOS.APROBADO,
        decisionFuncionario: "Aprobada",
        observacionFuncionario: "",
        numeroLicencia,
        fechaAprobacion,
        fechaDecisionFuncionario: fechaAprobacion,
        fechaExpiracionLicencia: fechaExpiracion,
        fechaVencimiento: fechaExpiracion,
        licenciaVigente: true,
        licenciaRenovada: esRenovacion,
        fechaRenovacion: esRenovacion ? fechaAprobacion : "",
        resultadoFinal: "Licencia emitida",
        funcionarioAprueba: usuario?.nombre || "Funcionario Municipal",
        uidFuncionarioAprueba: usuario?.uid || "",
      });

      const resultadoAuditoria = await registrarDecisionFuncionario({
        usuario: usuario?.nombre || "Funcionario",
        usuarioId: usuario?.uid || "",
        solicitudId: solicitud.id,
        decision: "Aprobada",
        observacion: "",
      });

      if (resultadoAuditoria?.hashFirma) {
        await actualizarSolicitud(solicitud.id, {
          hashFirmante: resultadoAuditoria.hashFirma,
        });
      }

      await crearNotificacion(
        solicitud.uidUsuario,
        {
          titulo: "Licencia Aprobada",
          descripcion: `¡Felicidades! Su solicitud EXP-${solicitud.id} ha sido aprobada. Número de Licencia: ${numeroLicencia}. Vence el ${fechaExpiracion}. Ya puede descargarla desde su panel.`,
          icono: "✅",
        },
        solicitud.correoUsuario
      );

      await cargarSolicitudes();
      setModalAprobar(null);
      alert(`Licencia digital emitida con éxito: ${numeroLicencia}`);
    } catch (error) {
      console.error("Error al aprobar:", error);
      alert("Error al aprobar la licencia: " + error.message);
    } finally {
      setProcesando(false);
    }
  };

  const ejecutarRechazo = async () => {
    if (!modalRechazar) return;
    const solicitud = modalRechazar;
    if (!motivoRechazo.trim()) {
      alert("Debe indicar el motivo del rechazo.");
      return;
    }
    setProcesando(true);
    try {
      const fechaDecision = formatearFechaHora();

      await actualizarSolicitud(solicitud.id, {
        estado: ESTADOS.RECHAZADO,
        estadoNormalizado: ESTADOS.RECHAZADO,
        decisionFuncionario: "Rechazada",
        observacionFuncionario: motivoRechazo.trim(),
        fechaDecisionFuncionario: fechaDecision,
        resultadoFinal: "Rechazado",
        funcionarioAprueba: usuario?.nombre || "Funcionario Municipal",
        uidFuncionarioAprueba: usuario?.uid || "",
      });

      const resultadoAuditoria = await registrarDecisionFuncionario({
        usuario: usuario?.nombre || "Funcionario",
        usuarioId: usuario?.uid || "",
        solicitudId: solicitud.id,
        decision: "Rechazada",
        observacion: motivoRechazo.trim(),
      });

      if (resultadoAuditoria?.hashFirma) {
        await actualizarSolicitud(solicitud.id, {
          hashFirmante: resultadoAuditoria.hashFirma,
        });
      }

      await crearNotificacion(
        solicitud.uidUsuario,
        {
          titulo: "Solicitud Rechazada",
          descripcion: `Su solicitud EXP-${solicitud.id} ha sido rechazada. Motivo: ${motivoRechazo.trim()}.`,
          icono: "❌",
        },
        solicitud.correoUsuario
      );

      await cargarSolicitudes();
      setModalRechazar(null);
      setMotivoRechazo("");
      alert("La solicitud ha sido rechazada.");
    } catch (error) {
      console.error("Error al rechazar:", error);
      alert("Error al rechazar la licencia: " + error.message);
    } finally {
      setProcesando(false);
    }
  };

  const puedeAprobar = (s) => {
    const estado = normalizarEstado(s);
    return (estado === ESTADOS.REVISION_FUNCIONARIO || s.estado === "Resultado enviado al funcionario") && (s.recomendacionInspector === "Aprobar" || s.inspeccion === "Aprobada");
  };

  const puedeAgendar = (s) => {
    const pagoConfirmado = s.estadoPago === "Confirmado" || s.estado === "Pago confirmado" || s.estado === "Pagado";
    if (!pagoConfirmado) return false;
    const estado = normalizarEstado(s);
    return estado === ESTADOS.PAGO_CONFIRMADO || estado === ESTADOS.REVISION_FUNCIONARIO || s.estado === "Pago confirmado" || s.estado === "Documentos validados";
  };

  const puedeReprogramar = (s) => {
    const estado = normalizarEstado(s);
    return [
      ESTADOS.INSPECCION_OBSERVADA,
      ESTADOS.INSPECCION_REPROGRAMADA,
      ESTADOS.INSPECCION_PROGRAMADA,
    ].includes(estado);
  };

  const puedeRechazar = (s) => {
    const estado = normalizarEstado(s);
    return !esEstadoCerrado(estado);
  };

  const badgeEstado = (s) => {
    const estado = normalizarEstado(s);
    const color = ESTADO_COLORES[estado] || "#6b7280";
    const label = ESTADO_LABELS[estado] || s.estado || estado;
    return (
      <span
        className="badge"
        style={{
          background: color + "18",
          color: color,
          border: `1px solid ${color}40`,
        }}
      >
        {label}
      </span>
    );
  };

  const badgePago = (s) => {
    const pago = s.estadoPago || s.estadoPagoGeneral || "Pendiente";
    const esConfirmado =
      pago === "Confirmado" ||
      pago === "CONFIRMADO" ||
      pago === "Pagado" ||
      pago === "Aprobado";
    return (
      <span className={`badge ${esConfirmado ? "ok" : "warning"}`}>
        {esConfirmado ? "Confirmado" : "Esperando pago"}
      </span>
    );
  };

  const badgeInspeccion = (s) => {
    const insp = s.resultadoInspeccion || s.inspeccion || "Pendiente";
    let clase = "neutral";
    if (insp === "Aprobada" || insp === "APROBADA" || insp.includes("Cumple todos")) clase = "ok";
    else if (insp === "Observada" || insp.includes("parcialmente")) clase = "warning";
    else if (insp === "Rechazada" || insp.includes("No cumple")) clase = "danger";
    return <span className={`badge ${clase}`}>{insp}</span>;
  };

  return (
    <div className="panel panel-funcionario">
      {/* HEADER CON IDENTIDAD INSTITUCIONAL */}
      <div className="funcionario-hero">
        <div>
          <span className="eyebrow">WEB MUNICIPAL — Municipalidad de Trujillo</span>
          <h1>Panel Funcionario — Sistema de Licencias v1.0</h1>
          <p>
            Gestión completa del flujo de expediente: recepción, validación de documentos, asignación de inspecciones y emisión de licencias.
          </p>
        </div>
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <div className="hero-card">
            <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Por Decidir
            </span>
            <strong style={{ fontSize: "24px" }}>{stats.licenciasAprobadas}</strong>
            <small>licencias emitidas</small>
          </div>
          <button type="button" className="btn-outline-light" onClick={cargarSolicitudes}>
            {cargando ? "Cargando..." : "🔄 Actualizar"}
          </button>
        </div>
      </div>

      {/* SECTION 10: DASHBOARD FUNCIONARIO (8 METRICS) */}
      <div className="stats-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "12px", marginBottom: "20px" }}>
        <div className="stat-card">
          <span>Total Solicitudes</span>
          <strong>{stats.total}</strong>
          <small>En el sistema</small>
        </div>
        <div className="stat-card">
          <span>Esperando Pago</span>
          <strong style={{ color: "#d97706" }}>{stats.esperandoPago}</strong>
          <small>Pendientes en caja/web</small>
        </div>
        <div className="stat-card">
          <span>Revisión Documental</span>
          <strong style={{ color: "#2563eb" }}>{stats.revisionDocumental}</strong>
          <small>Documentos por verificar</small>
        </div>
        <div className="stat-card">
          <span>Inspecciones Hoy</span>
          <strong style={{ color: "#7c3aed" }}>{stats.inspeccionesHoy}</strong>
          <small>Programadas para hoy</small>
        </div>
        <div className="stat-card">
          <span>Inspecciones Pendientes</span>
          <strong style={{ color: "#0f766e" }}>{stats.inspeccionesPendientes}</strong>
          <small>Visitas agendadas</small>
        </div>
        <div className="stat-card">
          <span>Licencias Aprobadas</span>
          <strong style={{ color: "#16a34a" }}>{stats.licenciasAprobadas}</strong>
          <small>Emitidas</small>
        </div>
        <div className="stat-card">
          <span>Licencias Rechazadas</span>
          <strong style={{ color: "#dc2626" }}>{stats.licenciasRechazadas}</strong>
          <small>Observadas/Denegadas</small>
        </div>
        <div className="stat-card">
          <span>Renovaciones Próximas</span>
          <strong style={{ color: "#e11d48" }}>{stats.renovacionesProximas}</strong>
          <small>Vencen en 30 días</small>
        </div>
      </div>

      {/* TABS DE NAVEGACIÓN */}
      <div className="tabs-panel">
        <button
          type="button"
          className={paso === "solicitudes" ? "tab-active" : ""}
          onClick={() => setPaso("solicitudes")}
        >
          📋 Solicitudes Online & Presenciales
        </button>
        <button
          type="button"
          className={paso === "registro-presencial" ? "tab-active" : ""}
          onClick={() => setPaso("registro-presencial")}
        >
          📝 Registrar Solicitud Presencial
        </button>
        <button
          type="button"
          className={paso === "notificaciones" ? "tab-active" : ""}
          onClick={() => setPaso("notificaciones")}
        >
          🔔 Notificaciones ({solicitudes.filter(s => s.notificaciones?.some(n => !n.leida)).length})
        </button>
      </div>

      {/* SECCIÓN: REGISTRO PRESENCIAL */}
      {paso === "registro-presencial" && (
        <FormularioSolicitudPresencial
          onSolicitudCreada={cargarSolicitudes}
          usuarioFuncionario={usuario}
        />
      )}

      {/* SECCIÓN: LISTADO DE SOLICITUDES */}
      {paso === "solicitudes" && (
        <section className="section-card">
          <div className="section-header">
            <div>
              <h2>Gestión de Expedientes y Licencias</h2>
              <p>Revisa solicitudes, valida documentos, asigna inspectores y emite licencias comerciales.</p>
            </div>
          </div>

          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "16px" }}>
            <input
              type="text"
              placeholder="Buscar por código de expediente, RUC, negocio o dirección..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              style={{ flex: 1, minWidth: "200px", padding: "10px 14px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "14px" }}
            />
            <select
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
              style={{ padding: "10px 14px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "14px", minWidth: "180px" }}
            >
              <option value="todos">Todos los estados</option>
              {Object.entries(ESTADO_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>

          {cargando && solicitudes.length === 0 ? (
            <div className="skeleton-table">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="skeleton-row" style={{ height: "48px", background: "#f1f5f9", borderRadius: "8px", marginBottom: "8px" }} />
              ))}
            </div>
          ) : solicitudesFiltradas.length === 0 ? (
            <div className="empty-state">
              <div style={{ fontSize: "36px", marginBottom: "10px" }}>📋</div>
              <h3>No se encontraron expedientes</h3>
              <p>No hay solicitudes que coincidan con los filtros seleccionados.</p>
            </div>
          ) : (
            <div className="tabla-container">
              <table className="modern-table funcionario-table">
                <thead>
                  <tr>
                    <th>Expediente</th>
                    <th>Establecimiento</th>
                    <th>Canal</th>
                    <th>Pago</th>
                    <th>Inspección</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {solicitudesFiltradas.map((s) => {
                    return (
                      <tr key={s.id}>
                        <td>
                          <strong>EXP-{s.id}</strong>
                          <small>RUC: {s.ruc || "---"}</small>
                          <small>{s.fecha || "---"}</small>
                        </td>
                        <td>
                          <strong>{s.nombreNegocio || "---"}</strong>
                          <small>{s.direccion || "---"}</small>
                        </td>
                        <td>
                          <span className={`badge ${s.canalRegistro === "presencial" ? "info" : "ok"}`}>
                            {s.canalRegistro === "presencial" ? "Presencial" : "Online"}
                          </span>
                        </td>
                        <td>{badgePago(s)}</td>
                        <td>{badgeInspeccion(s)}</td>
                        <td>{badgeEstado(s)}</td>
                        <td>
                          <div className="action-stack" style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                            <button type="button" className="btn-info" onClick={() => setSolicitudDetalle(s)}>
                              👁 Detalle
                            </button>

                            <button
                              type="button"
                              className="btn-primary"
                              onClick={() => setSolicitudRevisarDocs(s)}
                              style={{ background: "#2563eb", color: "white" }}
                            >
                              📑 Revisar Docs
                            </button>

                            {puedeAgendar(s) && (
                              <button
                                type="button"
                                className="btn-primary"
                                onClick={() => abrirAgendarModal(s)}
                                style={{ background: "#0f766e", color: "white" }}
                              >
                                🔍 Asignar Inspección
                              </button>
                            )}

                            {puedeReprogramar(s) && (
                              <button type="button" className="btn-warning" onClick={() => abrirAgendarModal(s)}>
                                📅 Reprogramar
                              </button>
                            )}

                            <button
                              type="button"
                              className="btn-ok"
                              onClick={() => setModalAprobar(s)}
                              disabled={!puedeAprobar(s)}
                            >
                              ✅ Aprobar Licencia
                            </button>

                            {puedeRechazar(s) && (
                              <button
                                type="button"
                                className="btn-danger"
                                onClick={() => {
                                  setModalRechazar(s);
                                  setMotivoRechazo("");
                                }}
                              >
                                ❌ Rechazar
                              </button>
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

      {/* SECCIÓN: NOTIFICACIONES */}
      {paso === "notificaciones" && (
        <section className="section-card">
          <div className="section-header">
            <div>
              <h2>Notificaciones Emitidas a los Expedientes</h2>
              <p>Seguimiento de mensajes enviados a los ciudadanos y solicitantes.</p>
            </div>
          </div>

          {(() => {
            const conNotificaciones = solicitudes.filter(
              (s) => s.notificaciones && s.notificaciones.length > 0
            );

            if (conNotificaciones.length === 0) {
              return (
                <div className="empty-state">
                  <div style={{ fontSize: "36px", marginBottom: "10px" }}>🔔</div>
                  <h3>No hay notificaciones emitidas aún</h3>
                  <p>Aparecerán cuando se notifique a los solicitantes.</p>
                </div>
              );
            }

            return (
              <div>
                {conNotificaciones.map((s) => (
                  <div
                    key={s.id}
                    style={{
                      padding: "16px",
                      border: "1px solid #e2e8f0",
                      borderRadius: "14px",
                      marginBottom: "12px",
                      background: "#f8fafc",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                      <div>
                        <strong>{s.nombreNegocio}</strong>
                        <small style={{ marginLeft: "8px" }}>EXP-{s.id}</small>
                      </div>
                      <span className={`badge ${s.canalRegistro === "presencial" ? "info" : "ok"}`}>
                        {s.canalRegistro === "presencial" ? "Presencial" : "Online"}
                      </span>
                    </div>
                    {s.notificaciones.map((n, i) => (
                      <div
                        key={i}
                        style={{
                          padding: "10px",
                          background: "white",
                          borderRadius: "10px",
                          border: "1px solid #e2e8f0",
                          marginTop: "8px",
                        }}
                      >
                        <strong style={{ color: "#1f3b57", fontSize: "14px" }}>
                          {n.icono || "🔔"} {n.titulo}
                        </strong>
                        <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#475569" }}>
                          {n.mensaje || n.descripcion}
                        </p>
                        <small style={{ color: "#94a3b8" }}>{n.fecha || n.fecha_hora}</small>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            );
          })()}
        </section>
      )}

      {/* MODAL DETALLE DE EXPEDIENTE */}
      {solicitudDetalle && (
        <ModalDetalleExpediente
          solicitud={solicitudDetalle}
          onCerrar={() => setSolicitudDetalle(null)}
          onRevisarDocs={() => {
            const sol = solicitudDetalle;
            setSolicitudDetalle(null);
            setSolicitudRevisarDocs(sol);
          }}
          onAgendar={() => {
            const sol = solicitudDetalle;
            setSolicitudDetalle(null);
            abrirAgendarModal(sol);
          }}
          onAprobar={() => {
            const sol = solicitudDetalle;
            setSolicitudDetalle(null);
            setModalAprobar(sol);
          }}
          onRechazar={() => {
            const sol = solicitudDetalle;
            setSolicitudDetalle(null);
            setModalRechazar(sol);
            setMotivoRechazo("");
          }}
          puedeAgendar={puedeAgendar(solicitudDetalle)}
          puedeAprobar={puedeAprobar(solicitudDetalle)}
          puedeRechazar={puedeRechazar(solicitudDetalle)}
          badgeEstado={badgeEstado(solicitudDetalle)}
        />
      )}

      {/* MODAL REVISAR DOCUMENTOS */}
      {solicitudRevisarDocs && (
        <ModalRevisarDocumentos
          solicitud={solicitudRevisarDocs}
          onCerrar={() => setSolicitudRevisarDocs(null)}
          onAprobarDocs={() => aprobarDocumentos(solicitudRevisarDocs)}
          onRechazarDocs={rechazarDocumentos}
          procesando={procesando}
        />
      )}

      {/* MODAL CONFIRMAR APROBACIÓN */}
      {modalAprobar && (
        <div className="admin-form-modal" style={{ zIndex: 1001 }}>
          <div className="admin-form-card" style={{ maxWidth: "480px" }}>
            <div className="admin-form-header">
              <h3>Emitir Licencia Digital</h3>
              <button type="button" onClick={() => setModalAprobar(null)}>✕</button>
            </div>
            <div style={{ padding: "16px 0" }}>
              <p style={{ color: "#475569", fontSize: "14px", margin: "0 0 12px" }}>
                ¿Está seguro de aprobar la solicitud <strong>EXP-{modalAprobar.id}</strong> del negocio{" "}
                <strong>{modalAprobar.nombreNegocio}</strong>?
              </p>
              <p style={{ color: "#64748b", fontSize: "13px", margin: 0 }}>
                Se generará el código de licencia digital (LIC-2026-XXXXXX) con 1 año de vigencia y se notificará al negocio para su descarga.
              </p>
            </div>
            <div className="admin-form-actions">
              <button type="button" onClick={() => setModalAprobar(null)} disabled={procesando}>Cancelar</button>
              <button
                type="button"
                className="btn-ok"
                onClick={ejecutarAprobacion}
                disabled={procesando}
              >
                {procesando ? "Emitiendo..." : "✅ Emitir Licencia"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CONFIRMAR RECHAZO */}
      {modalRechazar && (
        <div className="admin-form-modal" style={{ zIndex: 1001 }}>
          <div className="admin-form-card" style={{ maxWidth: "480px" }}>
            <div className="admin-form-header">
              <h3>Rechazar Licencia</h3>
              <button
                type="button"
                onClick={() => {
                  setModalRechazar(null);
                  setMotivoRechazo("");
                }}
              >
                ✕
              </button>
            </div>
            <div style={{ padding: "16px 0" }}>
              <p style={{ color: "#475569", fontSize: "14px", margin: "0 0 12px" }}>
                Solicitud <strong>EXP-{modalRechazar.id}</strong> del negocio <strong>{modalRechazar.nombreNegocio}</strong>.
              </p>
              <label style={{ display: "block", fontSize: "13px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>
                Motivo del Rechazo *
              </label>
              <textarea
                value={motivoRechazo}
                onChange={(e) => setMotivoRechazo(e.target.value)}
                rows="4"
                placeholder="Indique los motivos del rechazo..."
                style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "14px", resize: "vertical" }}
              />
            </div>
            <div className="admin-form-actions">
              <button
                type="button"
                onClick={() => {
                  setModalRechazar(null);
                  setMotivoRechazo("");
                }}
                disabled={procesando}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn-danger"
                onClick={ejecutarRechazo}
                disabled={procesando || !motivoRechazo.trim()}
              >
                {procesando ? "Procesando..." : "❌ Confirmar Rechazo"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL ASIGNAR INSPECCIÓN */}
      {solicitudAgendar && (
        <div className="admin-form-modal" style={{ zIndex: 1000 }}>
          <div className="admin-form-card" style={{ maxWidth: "560px", maxHeight: "85vh", overflowY: "auto" }}>
            <div className="admin-form-header">
              <h3>🔍 Asignar Inspección — EXP-{solicitudAgendar.id}</h3>
              <button
                type="button"
                onClick={() => {
                  setSolicitudAgendar(null);
                  setFechaSeleccionada("");
                  setSlotSeleccionado("");
                }}
              >
                ✕
              </button>
            </div>
            <div style={{ padding: "16px 0" }}>
              <p style={{ margin: "0 0 16px", color: "#475569", fontSize: "14px" }}>
                Establecimiento: <strong>{solicitudAgendar.nombreNegocio}</strong> (RUC: {solicitudAgendar.ruc})
              </p>

              {/* SELECCIÓN DE INSPECTOR */}
              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", fontSize: "13px", fontWeight: "bold", color: "#334155", marginBottom: "6px" }}>
                  Elegir Inspector *
                </label>
                <select
                  value={inspectorSeleccionadoUid}
                  onChange={(e) => setInspectorSeleccionadoUid(e.target.value)}
                  style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "14px" }}
                >
                  {inspectoresLista.map((insp) => {
                    const uidVal = insp.uid || insp.id;
                    return (
                      <option key={uidVal} value={uidVal}>
                        {insp.nombre || insp.nombreCompleto} {insp.cargo ? `(${insp.cargo})` : ""}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* SELECCIÓN DE FECHA */}
              <label style={{ display: "block", fontSize: "13px", fontWeight: "bold", color: "#334155", marginBottom: "6px" }}>
                Elegir Fecha de Inspección * (Máx 5 por día)
              </label>
              <CalendarioInspeccion
                fechaSeleccionada={fechaSeleccionada}
                onSelectFecha={handleSelectFecha}
                capacidades={capacidades}
              />

              {/* SELECCIÓN DE HORARIO */}
              {fechaSeleccionada && (
                <div style={{ marginTop: "16px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                    <label style={{ fontSize: "13px", fontWeight: "bold", color: "#334155" }}>
                      Capacidad del Día:{" "}
                      <span style={{ color: (capacidades[fechaSeleccionada] || 0) >= MAX_INSPECCIONES_POR_DIA ? "#dc2626" : "#16a34a", fontSize: "15px" }}>
                        {capacidades[fechaSeleccionada] || 0}/{MAX_INSPECCIONES_POR_DIA}
                      </span>
                    </label>
                  </div>

                  {(capacidades[fechaSeleccionada] || 0) >= MAX_INSPECCIONES_POR_DIA ? (
                    <div style={{ padding: "12px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", color: "#991b1b", fontSize: "13.5px" }}>
                      Día sin disponibilidad. Elija otra fecha.
                    </div>
                  ) : (
                    <div>
                      <label style={{ display: "block", fontSize: "13px", fontWeight: "bold", color: "#334155", marginBottom: "6px" }}>
                        Elegir Horario Disponible *
                      </label>
                      <div className="time-slots-grid">
                        {TIME_SLOTS.map((slot) => {
                          const esPasado = esHorarioPasado(fechaSeleccionada, slot.value);
                          const esOcupado = horariosOcupados.includes(slot.value);
                          const deshabilitado = esPasado || esOcupado;

                          let estadoTag = "";
                          if (esOcupado) estadoTag = " 🔒 (Ocupado)";
                          else if (esPasado) estadoTag = " ❌ (Hora pasada)";

                          return (
                            <button
                              key={slot.value}
                              type="button"
                              className={`time-slot ${slotSeleccionado === slot.value ? "seleccionado" : ""} ${deshabilitado ? "deshabilitado" : ""}`}
                              onClick={() => !deshabilitado && setSlotSeleccionado(slot.value)}
                              disabled={deshabilitado}
                              style={deshabilitado ? { opacity: 0.5, cursor: "not-allowed", background: "#f1f5f9" } : {}}
                            >
                              {slot.label}{estadoTag}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* NOTAS AL INSPECTOR */}
              <div style={{ marginTop: "16px" }}>
                <label style={{ display: "block", fontSize: "13px", fontWeight: "bold", color: "#334155", marginBottom: "6px" }}>
                  Indicaciones / Observaciones para el Inspector
                </label>
                <textarea
                  value={notasInspector}
                  onChange={(e) => setNotasInspector(e.target.value)}
                  rows="2"
                  placeholder="Verificar certificado de salubridad y aforo..."
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13.5px" }}
                />
              </div>
            </div>

            <div className="admin-form-actions">
              <button
                type="button"
                onClick={() => {
                  setSolicitudAgendar(null);
                  setFechaSeleccionada("");
                  setSlotSeleccionado("");
                }}
                disabled={procesando}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={agendarInspeccion}
                disabled={procesando || !fechaSeleccionada || !slotSeleccionado}
                style={{ background: "#0f766e" }}
              >
                {procesando ? "Asignando..." : "🚀 Asignar Inspección"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PanelFuncionario;
