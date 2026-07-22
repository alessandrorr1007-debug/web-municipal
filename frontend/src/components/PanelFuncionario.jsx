import { useEffect, useState, useMemo } from "react";
import {
  obtenerSolicitudes,
  actualizarSolicitud,
  guardarSolicitud,
} from "../services/solicitudService";
import { consultarDni } from "../services/dniService";
import { consultarRuc } from "../services/rucService";
import { registrarDecisionFuncionario } from "../services/auditService";
import { abrirPdf, obtenerBlobUrlParaPdf, convertirPdfABase64 } from "../services/pdfService";
import { crearNotificacion } from "../services/notificacionService";
import { useAuth } from "../context/AuthContext";
import { obtenerDniValido, obtenerNombreCiudadanoValido } from "../services/comprobanteService";
import VisualizadorDocumentoModal from "./VisualizadorDocumentoModal";
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
  INSPECTORES_DEFAULT,
  formatearFechaLocal,
} from "../config/inspeccionConfig";
import { obtenerDocumentosPorGiro } from "../config/documentosPorGiro";

const MOTIVOS_RECHAZO_DOCS = [
  "Documento faltante",
  "Documento incorrecto",
  "Datos inconsistentes",
  "Otro",
];

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

function DetDocumentCard({ archivo, index, onVerDoc }) {
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
          {tipo === "application/pdf" ? "PDF" : tipo}
          {tamano ? ` \u00B7 ${formatTamano(tamano)}` : ""}
          {fechaCarga ? ` \u00B7 ${fechaCarga}` : ""}
        </span>
      </div>
      <button
        type="button"
        className="det-doc-btn"
        onClick={(e) => {
          e.preventDefault();
          if (onVerDoc) onVerDoc(archivo);
          else abrirPdf(url);
        }}
        style={{ cursor: "pointer", border: "none" }}
      >
        👁️ Ver
      </button>
    </div>
  );
}

function ModalDetalleExpediente({ solicitud, onCerrar, onRevisarDocs, onAgendar, onAprobar, onRechazar, puedeAgendar, puedeAprobar, puedeRechazar, badgeEstado, onVerDoc }) {
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
                      <DetDocumentCard key={i} archivo={archivo} index={i} onVerDoc={onVerDoc} />
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
            {onRevisarDocs && (
              <button type="button" className="det-action-btn det-action-primary" onClick={onRevisarDocs} style={{ background: "#2563eb" }}>
                📑 Revisar Documentos
              </button>
            )}
            {puedeAgendar && onAgendar && (
              <button type="button" className="det-action-btn det-action-primary" onClick={onAgendar} style={{ background: "#0f766e" }}>
                🔍 Asignar Inspección
              </button>
            )}
            {puedeRechazar && onRechazar && (
              <button type="button" className="det-action-btn det-action-danger" onClick={onRechazar}>
                ❌ Rechazar
              </button>
            )}
            {puedeAprobar && onAprobar && (
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
                      abrirPdf(pdf);
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
    metodoPago: "Efectivo en Caja Municipal",
    estadoSunat: "",
    condicionSunat: "",
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
      const sunatEstado = (data.estado || "").toUpperCase().trim();
      const sunatCondicion = (data.condicion || "").toUpperCase().trim();
      setForm((prev) => ({
        ...prev,
        razonSocial: data.nombreNegocio || data.razon_social || "",
        nombreNegocio: data.nombreComercial || data.nombreNegocio || data.razon_social || "",
        direccion: data.direccion || "",
        departamento: data.departamento || "La Libertad",
        provincia: data.provincia || "Trujillo",
        distrito: data.distrito || "Trujillo",
        giro: data.giroComercial || data.actividad_economica || "Comercio",
        estadoSunat: sunatEstado,
        condicionSunat: sunatCondicion,
      }));
      if (sunatEstado !== "ACTIVO" || sunatCondicion !== "HABIDO") {
        setErrorRuc(`🚫 SUNAT: Estado="${sunatEstado}" Condición="${sunatCondicion}". Se requiere Estado=ACTIVO y Condición=HABIDO.`);
        setSuccessRuc("");
      } else {
        setSuccessRuc("✓ Contribuyente verificado en SUNAT.");
        setErrorRuc("");
      }
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
    if (form.estadoSunat !== "ACTIVO" || form.condicionSunat !== "HABIDO") {
      alert(`🚫 No es posible registrar el expediente.\n\nEl contribuyente tiene:\n• Estado: ${form.estadoSunat || "No consultado"} (se requiere ACTIVO)\n• Condición: ${form.condicionSunat || "No consultado"} (se requiere HABIDO)\n\nEl contribuyente debe regularizar su situación ante SUNAT.`);
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
        estadoSunat: form.estadoSunat || "",
        condicionSunat: form.condicionSunat || "",
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
      metodoPago: "Efectivo en Caja Municipal",
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
  const [documentoPdfVisor, setDocumentoPdfVisor] = useState(null);
  const [solicitudRevisarDocs, setSolicitudRevisarDocs] = useState(null);
  const [modalAprobar, setModalAprobar] = useState(null);
  const [modalRechazar, setModalRechazar] = useState(null);
  const [motivoRechazo, setMotivoRechazo] = useState("");
  const [procesando, setProcesando] = useState(false);
  const [paso, setPaso] = useState(seccion || "solicitudes");
  const [modalInfoInspeccion, setModalInfoInspeccion] = useState(null);
  const [fechaAgendaConsulta, setFechaAgendaConsulta] = useState(formatearFechaLocal(new Date()));

  const solicitudesPendientesAsignacion = useMemo(() => {
    return solicitudes.filter((s) => {
      const e = (s.estado || s.estadoNormalizado || "").toLowerCase();
      const estPago = (s.estadoPago || "").toLowerCase();
      const esPagado = estPago === "confirmado" || e.includes("pagado") || e.includes("enviado");
      const noTieneInspector = !s.inspectorUid && !s.inspectorNombre && s.estadoInspeccion !== "Programada";
      const noCerrado = !e.includes("aprobado") && !e.includes("rechazado");
      return esPagado && noTieneInspector && noCerrado;
    });
  }, [solicitudes]);

  const solicitudesAsignadas = useMemo(() => {
    return solicitudes.filter((s) => {
      const e = (s.estado || "").toLowerCase();
      const tieneInspector = (s.inspectorUid || s.inspectorNombre) && s.fechaVisitaInspector;
      const noCerrado = !e.includes("aprobado") && !e.includes("rechazado");
      return tieneInspector && noCerrado;
    });
  }, [solicitudes]);

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

  // CÁLCULO DE CIUDADANOS Y NEGOCIOS ÚNICOS PARA GESTIÓN ADMINISTRATIVA
  const listaCiudadanos = useMemo(() => {
    const mapa = new Map();
    solicitudes.forEach((s) => {
      const dni = s.dniSolicitante || s.dni || "SIN_DNI";
      const nombre = [s.nombresSolicitante, s.apellidosSolicitante, s.nombreSolicitante].filter(Boolean).join(" ") || "Ciudadano Registrado";
      if (!mapa.has(dni)) {
        mapa.set(dni, {
          dni,
          nombre,
          correo: s.correoUsuario || s.correo || "---",
          telefono: s.telefono || "---",
          expedientes: [s],
        });
      } else {
        mapa.get(dni).expedientes.push(s);
      }
    });
    return Array.from(mapa.values());
  }, [solicitudes]);

  const listaNegocios = useMemo(() => {
    const mapa = new Map();
    solicitudes.forEach((s) => {
      const ruc = s.ruc || "SIN_RUC";
      if (!mapa.has(ruc)) {
        mapa.set(ruc, {
          ruc,
          nombreNegocio: s.nombreNegocio || "---",
          razonSocial: s.razonSocial || "---",
          giro: s.giro || "General",
          direccion: s.direccion || "---",
          expedientes: [s],
          estadoLicencia: s.estado || s.estadoPago || "Registrado",
        });
      } else {
        mapa.get(ruc).expedientes.push(s);
      }
    });
    return Array.from(mapa.values());
  }, [solicitudes]);

  const ciudadanosFiltrados = useMemo(() => {
    if (!busqueda.trim()) return listaCiudadanos;
    const q = busqueda.toLowerCase().trim();
    return listaCiudadanos.filter(
      (c) =>
        c.dni.toLowerCase().includes(q) ||
        c.nombre.toLowerCase().includes(q) ||
        c.correo.toLowerCase().includes(q)
    );
  }, [listaCiudadanos, busqueda]);

  const negociosFiltrados = useMemo(() => {
    if (!busqueda.trim()) return listaNegocios;
    const q = busqueda.toLowerCase().trim();
    return listaNegocios.filter(
      (n) =>
        n.ruc.toLowerCase().includes(q) ||
        n.nombreNegocio.toLowerCase().includes(q) ||
        n.giro.toLowerCase().includes(q) ||
        n.direccion.toLowerCase().includes(q)
    );
  }, [listaNegocios, busqueda]);

  return (
    <div className="panel panel-funcionario">
      {/* HEADER INSTITUCIONAL DEL FUNCIONARIO */}
      <div className="funcionario-hero" style={{ background: "linear-gradient(135deg, #0f766e 0%, #1e293b 100%)" }}>
        <div>
          <span className="eyebrow">Municipalidad de Trujillo — Gestión Administrativa</span>
          <h1>Panel de Consulta y Administración</h1>
          <p>
            Módulo de consulta de expedientes en solo lectura, gestión de datos de ciudadanos, padrón de negocios registrados, reportes y estadísticas municipales.
          </p>
        </div>
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <div className="hero-card">
            <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Total Expedientes
            </span>
            <strong style={{ fontSize: "24px" }}>{stats.total}</strong>
            <small>registrados</small>
          </div>
          <button type="button" className="btn-outline-light" onClick={cargarSolicitudes}>
            {cargando ? "Cargando..." : "🔄 Actualizar"}
          </button>
        </div>
      </div>

      {/* METRICAS ADMINISTRATIVAS */}
      <div className="stats-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "12px", marginBottom: "20px" }}>
        <div className="stat-card">
          <span>Total Solicitudes</span>
          <strong style={{ color: "#0f766e" }}>{stats.total}</strong>
          <small>En el sistema</small>
        </div>
        <div className="stat-card">
          <span>Ciudadanos Registrados</span>
          <strong style={{ color: "#2563eb" }}>{listaCiudadanos.length}</strong>
          <small>Solicitantes activos</small>
        </div>
        <div className="stat-card">
          <span>Negocios Registrados</span>
          <strong style={{ color: "#7c3aed" }}>{listaNegocios.length}</strong>
          <small>Padrón de locales</small>
        </div>
        <div className="stat-card">
          <span>Licencias Aprobadas</span>
          <strong style={{ color: "#16a34a" }}>{stats.licenciasAprobadas}</strong>
          <small>Licencias emitidas</small>
        </div>
      </div>

      {/* TABS DE NAVEGACIÓN */}
      <div className="tabs-panel">
        <button
          type="button"
          className={paso === "solicitudes" || paso === "inicio" ? "tab-active" : ""}
          onClick={() => setPaso("solicitudes")}
        >
          📋 Consulta de Expedientes (Solo Lectura)
        </button>
        <button
          type="button"
          className={paso === "asignacion-inspecciones" ? "tab-active" : ""}
          onClick={() => setPaso("asignacion-inspecciones")}
        >
          📅 Asignación de Inspectores ({solicitudesPendientesAsignacion.length})
        </button>
        <button
          type="button"
          className={paso === "gestion-inspectores" ? "tab-active" : ""}
          onClick={() => setPaso("gestion-inspectores")}
        >
          💼 Gestión de Inspectores ({INSPECTORES_DEFAULT.length})
        </button>
        <button
          type="button"
          className={paso === "gestion-ciudadanos" ? "tab-active" : ""}
          onClick={() => setPaso("gestion-ciudadanos")}
        >
          👤 Gestión de Ciudadanos ({listaCiudadanos.length})
        </button>
        <button
          type="button"
          className={paso === "gestion-negocios" ? "tab-active" : ""}
          onClick={() => setPaso("gestion-negocios")}
        >
          🏢 Gestión de Negocios ({listaNegocios.length})
        </button>
        <button
          type="button"
          className={paso === "reportes" ? "tab-active" : ""}
          onClick={() => setPaso("reportes")}
        >
          📊 Reportes Municipales
        </button>
        <button
          type="button"
          className={paso === "estadisticas" ? "tab-active" : ""}
          onClick={() => setPaso("estadisticas")}
        >
          📈 Estadísticas y Métricas
        </button>
      </div>

      {/* SECCIÓN 1: CONSULTA DE EXPEDIENTES (SOLO LECTURA) */}
      {(paso === "solicitudes" || paso === "inicio") && (
        <section className="section-card">
          <div className="section-header">
            <div>
              <h2>Consulta General de Expedientes</h2>
              <p>Visualización de estado, historial y documentos de expedientes (Modo Solo Lectura).</p>
            </div>
          </div>

          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "16px" }}>
            <input
              type="text"
              placeholder="🔍 Buscar por código (EXP-XXXX), DNI, RUC, negocio o ciudadano..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              style={{ flex: 1, minWidth: "220px", padding: "10px 14px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "14px" }}
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
              <p>No hay solicitudes que coincidan con la búsqueda o filtro.</p>
            </div>
          ) : (
            <div className="tabla-container">
              <table className="modern-table funcionario-table">
                <thead>
                  <tr>
                    <th>Expediente</th>
                    <th>Establecimiento / RUC</th>
                    <th>Ciudadano / DNI</th>
                    <th>Estado Pago</th>
                    <th>Inspección</th>
                    <th>Estado General</th>
                    <th>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {solicitudesFiltradas.map((s) => {
                    const nombreCiudadano = obtenerNombreCiudadanoValido(s);
                    const dniCiudadano = obtenerDniValido(s);

                    return (
                      <tr key={s.id}>
                        <td>
                          <strong>EXP-{s.id}</strong>
                          <small style={{ display: "block", color: "#64748b" }}>{s.fecha || "---"}</small>
                        </td>
                        <td>
                          <strong>{s.nombreNegocio || "---"}</strong>
                          <small style={{ display: "block", color: "#475569" }}>RUC: {s.ruc || "---"}</small>
                        </td>
                        <td>
                          <strong>{nombreCiudadano}</strong>
                          <small style={{ display: "block", color: "#64748b" }}>DNI: {dniCiudadano}</small>
                        </td>
                        <td>{badgePago(s)}</td>
                        <td>{badgeInspeccion(s)}</td>
                        <td>{badgeEstado(s)}</td>
                        <td>
                          <button
                            type="button"
                            className="btn-info"
                            onClick={() => setSolicitudDetalle(s)}
                            style={{ background: "#0f766e", color: "white", padding: "8px 14px", borderRadius: "6px" }}
                          >
                            👁 Consultar Detalle
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
      )}

      {/* SECCIÓN NUEVA: ASIGNACIÓN MANUAL DE INSPECTORES Y CONTROL DE CUPOS (MÁX 4/DÍA) */}
      {paso === "asignacion-inspecciones" && (
        <section className="section-card">
          <div className="section-header">
            <div>
              <h2>📅 Asignación Manual de Inspecciones y Control de Cupos</h2>
              <p>Asigne inspecciones a los inspectores municipales respetando el límite máximo de 4 inspecciones por día.</p>
            </div>
          </div>

          <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "14px 18px", borderRadius: "10px", marginBottom: "20px" }}>
            <div style={{ fontWeight: "bold", color: "#166534", fontSize: "14.5px", marginBottom: "4px" }}>
              ℹ️ Normativa Municipal de Inspecciones:
            </div>
            <p style={{ margin: 0, color: "#15803d", fontSize: "13.5px" }}>
              Las solicitudes confirmadas en caja requieren asignación explícita de inspector. Cada inspector cuenta con un máximo estricto de <strong>4 inspecciones diarias</strong>. Si un inspector ya tiene 4 inspecciones asignadas para una fecha, la plataforma bloqueará automáticamente su asignación para dicho día.
            </p>
          </div>

          {/* SUB-SECCIÓN 1: SOLICITUDES PENDIENTES DE ASIGNACIÓN */}
          <div style={{ marginBottom: "30px" }}>
            <h3 style={{ color: "#0f766e", fontSize: "17px", borderBottom: "2px solid #ccfbf1", paddingBottom: "8px", marginBottom: "14px" }}>
              📋 Solicitudes Pendientes de Asignación de Inspector ({solicitudesPendientesAsignacion.length})
            </h3>

            {solicitudesPendientesAsignacion.length === 0 ? (
              <div className="empty-state" style={{ padding: "24px" }}>
                <div style={{ fontSize: "36px", marginBottom: "8px" }}>✅</div>
                <h4>¡Todo al día! No hay solicitudes pendientes de asignación.</h4>
                <p style={{ color: "#64748b", fontSize: "13.5px" }}>Todas las solicitudes pagadas cuentan con un inspector asignado.</p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="tabla-solicitudes">
                  <thead>
                    <tr>
                      <th>Expediente</th>
                      <th>Establecimiento</th>
                      <th>Solicitante (DNI)</th>
                      <th>Giro Comercial</th>
                      <th>Fecha Pago</th>
                      <th>Estado</th>
                      <th>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {solicitudesPendientesAsignacion.map((sol) => (
                      <tr key={sol.id}>
                        <td><strong>EXP-{sol.id}</strong></td>
                        <td>
                          <div><strong>{sol.nombreNegocio}</strong></div>
                          <small style={{ color: "#64748b" }}>RUC: {sol.ruc}</small>
                        </td>
                        <td>
                          <div>{sol.nombresSolicitante} {sol.apellidosSolicitante}</div>
                          <small style={{ color: "#64748b" }}>DNI: {sol.dniSolicitante || sol.dni}</small>
                        </td>
                        <td>{sol.giro || "General"}</td>
                        <td><small>{sol.fechaPago || "Confirmado"}</small></td>
                        <td><span className="badge warning">Pendiente de Asignación</span></td>
                        <td>
                          <button
                            type="button"
                            onClick={() => setModalInfoInspeccion(sol)}
                            style={{
                              background: "linear-gradient(135deg, #0f766e 0%, #0d9488 100%)",
                              color: "white",
                              border: "none",
                              padding: "8px 14px",
                              borderRadius: "8px",
                              fontWeight: "bold",
                              cursor: "pointer",
                              fontSize: "13px"
                            }}
                          >
                            📅 Ver Inspección
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* SUB-SECCIÓN 2: CALENDARIO Y AGENDA DE CUPOS POR INSPECTOR POR DÍA */}
          <div style={{ marginBottom: "30px", background: "#f8fafc", padding: "20px", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", marginBottom: "16px" }}>
              <div>
                <h3 style={{ margin: 0, color: "#1e293b", fontSize: "17px" }}>
                  📆 Agenda y Control de Cupos por Inspector
                </h3>
                <small style={{ color: "#64748b" }}>Consulte la carga de trabajo y disponibilidad de cada inspector por fecha seleccionada.</small>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <label style={{ fontWeight: "bold", fontSize: "13.5px", color: "#334155" }}>Seleccionar Fecha:</label>
                <input
                  type="text"
                  placeholder="DD/MM/YYYY"
                  value={fechaAgendaConsulta}
                  onChange={(e) => setFechaAgendaConsulta(e.target.value)}
                  style={{ padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13.5px", width: "130px", textAlign: "center", fontWeight: "bold" }}
                />
                <button
                  type="button"
                  onClick={() => setFechaAgendaConsulta(formatearFechaLocal(new Date()))}
                  style={{ padding: "8px 12px", background: "#e2e8f0", border: "none", borderRadius: "8px", cursor: "pointer", fontSize: "12.5px", fontWeight: "600" }}
                >
                  Hoy
                </button>
              </div>
            </div>

            {/* GRID DE CARGA DE INSPECTORES */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "14px" }}>
              {INSPECTORES_DEFAULT.map((insp) => {
                const asignaciones = solicitudes.filter((s) => {
                  const u = (s.inspectorUid || s.inspectorAsignadoUid || s.inspectorNombre || "");
                  const esInspector = u === insp.uid || u.includes(insp.uid);
                  const esMismaFecha = s.fechaVisitaInspector === fechaAgendaConsulta;
                  const noCerrado = !["Aprobado", "Rechazado", "Licencia aprobada", "Licencia rechazada"].includes(s.estado);
                  return esInspector && esMismaFecha && noCerrado;
                }).length;
                const porcentaje = Math.min((asignaciones / 4) * 100, 100);
                const estaLleno = asignaciones >= 4;

                return (
                  <div
                    key={insp.uid}
                    style={{
                      background: "white",
                      padding: "16px",
                      borderRadius: "10px",
                      border: estaLleno ? "2px solid #fca5a5" : "1px solid #cbd5e1",
                      boxShadow: "0 2px 4px rgba(0,0,0,0.03)"
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                      <div>
                        <strong style={{ fontSize: "14.5px", color: "#1e293b", display: "block" }}>{insp.nombre}</strong>
                        <small style={{ color: "#64748b" }}>{insp.cargo}</small>
                      </div>
                      <span
                        style={{
                          padding: "4px 8px",
                          borderRadius: "6px",
                          fontSize: "12px",
                          fontWeight: "bold",
                          background: estaLleno ? "#fef2f2" : "#f0fdf4",
                          color: estaLleno ? "#dc2626" : "#166534",
                          border: estaLleno ? "1px solid #fecaca" : "1px solid #bbf7d0"
                        }}
                      >
                        {estaLleno ? "🔴 4/4 Lleno" : `🟢 ${asignaciones}/4 Cupos (${4 - asignaciones} disp.)`}
                      </span>
                    </div>

                    {/* BARRA DE PROGRESO DE CUPOS */}
                    <div style={{ background: "#e2e8f0", height: "8px", borderRadius: "4px", overflow: "hidden", marginBottom: "10px" }}>
                      <div
                        style={{
                          width: `${porcentaje}%`,
                          height: "100%",
                          background: estaLleno ? "#dc2626" : asignaciones === 3 ? "#d97706" : "#16a34a",
                          transition: "width 0.3s ease"
                        }}
                      />
                    </div>

                    <div style={{ fontSize: "12.5px", color: "#475569" }}>
                      <strong>Asignaciones para el {fechaAgendaConsulta}:</strong>
                      {solicitudes.filter(s => (s.inspectorUid === insp.uid || s.inspectorNombre === insp.nombre) && s.fechaVisitaInspector === fechaAgendaConsulta).length === 0 ? (
                        <p style={{ margin: "4px 0 0", color: "#94a3b8", italic: "true" }}>Sin visitas programadas</p>
                      ) : (
                        <ul style={{ margin: "6px 0 0", paddingLeft: "16px" }}>
                          {solicitudes
                            .filter(s => (s.inspectorUid === insp.uid || s.inspectorNombre === insp.nombre) && s.fechaVisitaInspector === fechaAgendaConsulta)
                            .map(s => (
                              <li key={s.id} style={{ marginBottom: "2px" }}>
                                <strong>EXP-{s.id}</strong> — {s.nombreNegocio} ({s.horaVisitaLabel || s.horaVisitaInspector || "Por confirmar"})
                              </li>
                            ))}
                        </ul>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* SUB-SECCIÓN 3: REASIGNACIÓN DE INSPECTORES YA PROGRAMADOS */}
          <div>
            <h3 style={{ color: "#334155", fontSize: "16px", marginBottom: "12px" }}>
              🔄 Expedientes Programados (Opción de Reasignación de Inspector)
            </h3>

            {solicitudesAsignadas.length === 0 ? (
              <p style={{ color: "#64748b", fontSize: "13.5px" }}>No hay inspecciones programadas actualmente.</p>
            ) : (
              <div className="table-responsive">
                <table className="tabla-solicitudes">
                  <thead>
                    <tr>
                      <th>Expediente</th>
                      <th>Establecimiento</th>
                      <th>Inspector Asignado</th>
                      <th>Fecha Programada</th>
                      <th>Horario</th>
                      <th>Estado</th>
                      <th>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {solicitudesAsignadas.map((sol) => (
                      <tr key={sol.id}>
                        <td><strong>EXP-{sol.id}</strong></td>
                        <td>{sol.nombreNegocio}</td>
                        <td>
                          <span style={{ color: "#7c3aed", fontWeight: "bold" }}>👤 {sol.inspectorNombre || "Inspector Asignado"}</span>
                        </td>
                        <td><strong>{sol.fechaVisitaInspector}</strong></td>
                        <td><small>{sol.horaVisitaLabel || sol.horaVisitaInspector || "Definido"}</small></td>
                        <td><span className="badge success">{sol.estado}</span></td>
                        <td>
                          <button
                            type="button"
                            onClick={() => setModalInfoInspeccion(sol)}
                            style={{
                              background: "#0d9488",
                              color: "white",
                              border: "none",
                              padding: "6px 12px",
                              borderRadius: "6px",
                              fontWeight: "bold",
                              cursor: "pointer",
                              fontSize: "12.5px"
                            }}
                          >
                            📋 Ver Detalles
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}

      {/* SECCIÓN NUEVA: GESTIÓN DE INSPECTORES */}
      {paso === "gestion-inspectores" && (
        <section className="section-card">
          <div className="section-header">
            <div>
              <h2>💼 Catálogo y Gestión de Inspectores Municipales</h2>
              <p>Padrón del cuerpo técnico de inspectores, cargos, correos institucionales y estado de disponibilidad.</p>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px", marginTop: "16px" }}>
            {INSPECTORES_DEFAULT.map((insp) => {
              const fechaHoy = formatearFechaLocal(new Date());
              const asignacionesHoy = solicitudes.filter((s) => {
                const u = (s.inspectorUid || s.inspectorAsignadoUid || s.inspectorNombre || "");
                const esInspector = u === insp.uid || u.includes(insp.uid);
                const esMismaFecha = s.fechaVisitaInspector === fechaHoy;
                const noCerrado = !["Aprobado", "Rechazado", "Licencia aprobada", "Licencia rechazada"].includes(s.estado);
                return esInspector && esMismaFecha && noCerrado;
              }).length;
              const estaLleno = asignacionesHoy >= 4;

              return (
                <div
                  key={insp.uid}
                  style={{
                    background: "white",
                    padding: "20px",
                    borderRadius: "12px",
                    border: "1px solid #cbd5e1",
                    boxShadow: "0 2px 4px rgba(0,0,0,0.04)"
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "12px" }}>
                    <div style={{ width: "48px", height: "48px", borderRadius: "50%", background: "#0f766e", color: "white", display: "flex", justifyContent: "center", alignItems: "center", fontSize: "22px", fontWeight: "bold" }}>
                      🔍
                    </div>
                    <div>
                      <h4 style={{ margin: 0, color: "#1e293b", fontSize: "15px" }}>{insp.nombre}</h4>
                      <span style={{ fontSize: "12.5px", color: "#0f766e", fontWeight: "bold" }}>{insp.cargo}</span>
                    </div>
                  </div>

                  <div style={{ fontSize: "13px", color: "#475569", marginBottom: "12px" }}>
                    <p style={{ margin: "3px 0" }}><strong>UID:</strong> {insp.uid}</p>
                    <p style={{ margin: "3px 0" }}><strong>Correo:</strong> {insp.correo}</p>
                    <p style={{ margin: "3px 0" }}><strong>Límite Diario:</strong> 4 inspecciones por día</p>
                  </div>

                  <div style={{ padding: "10px 14px", borderRadius: "8px", background: estaLleno ? "#fef2f2" : "#f0fdf4", border: estaLleno ? "1px solid #fecaca" : "1px solid #bbf7d0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <small style={{ fontWeight: "bold", color: estaLleno ? "#dc2626" : "#166534" }}>Carga para Hoy:</small>
                    <span style={{ fontSize: "12.5px", fontWeight: "bold", color: estaLleno ? "#dc2626" : "#166534" }}>
                      {estaLleno ? "🔴 4/4 Lleno" : `🟢 ${asignacionesHoy}/4 Activas`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* SECCIÓN 2: GESTIÓN DE CIUDADANOS */}
      {paso === "gestion-ciudadanos" && (
        <section className="section-card">
          <div className="section-header">
            <div>
              <h2>Padrón y Gestión de Ciudadanos</h2>
              <p>Consulta de solicitantes registrados, DNI, datos de contacto y trámites vinculados.</p>
            </div>
          </div>

          <div style={{ marginBottom: "16px" }}>
            <input
              type="text"
              placeholder="🔍 Buscar ciudadano por DNI, nombres, apellidos o correo electrónico..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "14px" }}
            />
          </div>

          {ciudadanosFiltrados.length === 0 ? (
            <div className="empty-state">
              <div style={{ fontSize: "36px", marginBottom: "10px" }}>👤</div>
              <h3>No se encontraron ciudadanos</h3>
              <p>No hay solicitantes registrados que coincidan con la búsqueda.</p>
            </div>
          ) : (
            <div className="tabla-container">
              <table className="modern-table">
                <thead>
                  <tr>
                    <th>DNI / Identificación</th>
                    <th>Nombres y Apellidos</th>
                    <th>Correo Electrónico</th>
                    <th>Teléfono</th>
                    <th>Solicitudes Realizadas</th>
                  </tr>
                </thead>
                <tbody>
                  {ciudadanosFiltrados.map((c) => (
                    <tr key={c.dni}>
                      <td><strong>{c.dni}</strong></td>
                      <td><strong>{c.nombre}</strong></td>
                      <td>{c.correo}</td>
                      <td>{c.telefono}</td>
                      <td>
                        <span className="badge info">{c.expedientes.length} expediente(s)</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* SECCIÓN 3: GESTIÓN DE NEGOCIOS */}
      {paso === "gestion-negocios" && (
        <section className="section-card">
          <div className="section-header">
            <div>
              <h2>Padrón de Establecimientos Comercial</h2>
              <p>Listado de negocios y empresas registradas con su estado actual de licencia.</p>
            </div>
          </div>

          <div style={{ marginBottom: "16px" }}>
            <input
              type="text"
              placeholder="🔍 Buscar negocio por RUC, nombre comercial, giro o dirección..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "14px" }}
            />
          </div>

          {negociosFiltrados.length === 0 ? (
            <div className="empty-state">
              <div style={{ fontSize: "36px", marginBottom: "10px" }}>🏢</div>
              <h3>No se encontraron negocios</h3>
              <p>No hay establecimientos que coincidan con el filtro.</p>
            </div>
          ) : (
            <div className="tabla-container">
              <table className="modern-table">
                <thead>
                  <tr>
                    <th>RUC</th>
                    <th>Nombre Comercial / Razón Social</th>
                    <th>Giro Comercial</th>
                    <th>Dirección</th>
                    <th>Historial de Trámites</th>
                  </tr>
                </thead>
                <tbody>
                  {negociosFiltrados.map((n) => (
                    <tr key={n.ruc}>
                      <td><strong>{n.ruc}</strong></td>
                      <td>
                        <strong>{n.nombreNegocio}</strong>
                        {n.razonSocial && n.razonSocial !== n.nombreNegocio && (
                          <small style={{ display: "block", color: "#64748b" }}>{n.razonSocial}</small>
                        )}
                      </td>
                      <td><span className="badge neutral">{n.giro}</span></td>
                      <td>{n.direccion}</td>
                      <td>
                        <span className="badge ok">{n.expedientes.length} trámite(s)</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* SECCIÓN 4: REPORTES MUNICIPALES */}
      {paso === "reportes" && (
        <section className="section-card">
          <div className="section-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h2>Reportes Consolidados de Licencias</h2>
              <p>Resumen gerencial de trámites procesados, estado de atención y recaudación.</p>
            </div>
            <button
              type="button"
              onClick={() => window.print()}
              style={{ padding: "8px 16px", background: "#0f766e", color: "white", borderRadius: "8px", border: "none", fontWeight: "bold", cursor: "pointer" }}
            >
              🖨️ Imprimir Reporte
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px", marginTop: "16px" }}>
            <div style={{ background: "#f8fafc", padding: "16px", borderRadius: "12px", border: "1px solid #cbd5e1" }}>
              <h3 style={{ margin: "0 0 10px", fontSize: "15px", color: "#1e293b" }}>📊 Resumen General de Trámites</h3>
              <p style={{ margin: "4px 0", fontSize: "13.5px" }}><strong>Total Expedientes:</strong> {stats.total}</p>
              <p style={{ margin: "4px 0", fontSize: "13.5px" }}><strong>Licencias Emitidas:</strong> {stats.licenciasAprobadas}</p>
              <p style={{ margin: "4px 0", fontSize: "13.5px" }}><strong>Solicitudes Rechazadas/Observadas:</strong> {stats.licenciasRechazadas}</p>
              <p style={{ margin: "4px 0", fontSize: "13.5px" }}><strong>En Inspección:</strong> {stats.inspeccionesPendientes}</p>
            </div>

            <div style={{ background: "#f8fafc", padding: "16px", borderRadius: "12px", border: "1px solid #cbd5e1" }}>
              <h3 style={{ margin: "0 0 10px", fontSize: "15px", color: "#1e293b" }}>👥 Padrón Administrativo</h3>
              <p style={{ margin: "4px 0", fontSize: "13.5px" }}><strong>Ciudadanos Registrados:</strong> {listaCiudadanos.length}</p>
              <p style={{ margin: "4px 0", fontSize: "13.5px" }}><strong>Establecimientos Registrados:</strong> {listaNegocios.length}</p>
              <p style={{ margin: "4px 0", fontSize: "13.5px" }}><strong>Solicitudes Presenciales:</strong> {solicitudes.filter(s => s.canalRegistro === "presencial").length}</p>
              <p style={{ margin: "4px 0", fontSize: "13.5px" }}><strong>Solicitudes Online:</strong> {solicitudes.filter(s => s.canalRegistro !== "presencial").length}</p>
            </div>
          </div>
        </section>
      )}

      {/* SECCIÓN 5: ESTADÍSTICAS Y MÉTRICAS */}
      {paso === "estadisticas" && (
        <section className="section-card">
          <div className="section-header">
            <div>
              <h2>Estadísticas e Indicadores Municipales</h2>
              <p>Métricas operativas del flujo de atención y emisión de licencias comerciales.</p>
            </div>
          </div>

          <div className="stats-grid" style={{ marginTop: "16px" }}>
            <div className="stat-card">
              <span>Porcentaje de Aprobación</span>
              <strong style={{ color: "#16a34a" }}>
                {stats.total > 0 ? ((stats.licenciasAprobadas / stats.total) * 100).toFixed(1) : 0}%
              </strong>
              <small>De expedientes procesados</small>
            </div>
            <div className="stat-card">
              <span>Canal Digital</span>
              <strong style={{ color: "#2563eb" }}>
                {stats.total > 0 ? ((solicitudes.filter(s => s.canalRegistro !== "presencial").length / stats.total) * 100).toFixed(1) : 0}%
              </strong>
              <small>Trámites online</small>
            </div>
            <div className="stat-card">
              <span>Canal Presencial</span>
              <strong style={{ color: "#d97706" }}>
                {stats.total > 0 ? ((solicitudes.filter(s => s.canalRegistro === "presencial").length / stats.total) * 100).toFixed(1) : 0}%
              </strong>
              <small>Atención en ventanilla</small>
            </div>
          </div>
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
          onVerDoc={(doc) => setDocumentoPdfVisor(doc)}
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

      {/* MODAL INFORMACIÓN INSPECCIÓN — SOLO LECTURA */}
      {modalInfoInspeccion && (
        <div className="modal-overlay" style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(15, 23, 42, 0.7)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 9999 }}>
          <div className="modal-content" style={{ maxWidth: "580px", width: "90%", background: "white", borderRadius: "14px", overflow: "hidden", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)" }}>
            <div style={{ background: "linear-gradient(135deg, #0f766e 0%, #1e293b 100%)", color: "white", padding: "18px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, fontSize: "18px" }}>
                📅 Detalle de Inspección — EXP-{modalInfoInspeccion.id}
              </h3>
              <button type="button" onClick={() => setModalInfoInspeccion(null)} style={{ color: "white", background: "none", border: "none", fontSize: "20px", cursor: "pointer" }}>✕</button>
            </div>
            <div style={{ padding: "24px" }}>
              <div style={{ background: "#f0fdf4", border: "1px solid #a7f3d0", borderRadius: "8px", padding: "8px 12px", marginBottom: "16px", fontSize: "12px", color: "#065f46", display: "flex", alignItems: "center", gap: "6px" }}>
                🔒 Asignación automática — Solo lectura
              </div>

              <div style={{ background: "#f8fafc", padding: "14px 18px", borderRadius: "10px", border: "1px solid #e2e8f0", marginBottom: "20px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", fontSize: "13.5px" }}>
                  <div><strong>Establecimiento:</strong> {modalInfoInspeccion.nombreNegocio}</div>
                  <div><strong>RUC:</strong> {modalInfoInspeccion.ruc}</div>
                  <div><strong>Solicitante:</strong> {modalInfoInspeccion.nombresSolicitante} {modalInfoInspeccion.apellidosSolicitante}</div>
                  <div><strong>DNI:</strong> {modalInfoInspeccion.dniSolicitante || modalInfoInspeccion.dni}</div>
                  <div><strong>Giro Comercial:</strong> {modalInfoInspeccion.giro || "General"}</div>
                  <div><strong>Dirección:</strong> {modalInfoInspeccion.direccion}</div>
                </div>
              </div>

              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", fontSize: "12.5px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>Fecha de Inspección</label>
                <input type="text" value={modalInfoInspeccion.fechaVisitaInspector || "No programada"} readOnly style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #d1d5db", fontSize: "13.5px", fontWeight: "bold", background: "#f9fafb", cursor: "not-allowed" }} />
              </div>
              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", fontSize: "12.5px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>Horario</label>
                <input type="text" value={modalInfoInspeccion.horaVisitaLabel || modalInfoInspeccion.horaVisitaInspector || "No definido"} readOnly style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #d1d5db", fontSize: "13.5px", fontWeight: "bold", background: "#f9fafb", cursor: "not-allowed" }} />
              </div>
              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", fontSize: "12.5px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>Inspector Asignado</label>
                <input type="text" value={modalInfoInspeccion.inspectorNombre || "Sin asignar"} readOnly style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #d1d5db", fontSize: "13.5px", fontWeight: "bold", background: "#f9fafb", cursor: "not-allowed" }} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "12.5px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>Estado de Inspección</label>
                <input type="text" value={modalInfoInspeccion.estadoInspeccion || modalInfoInspeccion.inspeccion || "Pendiente"} readOnly style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #d1d5db", fontSize: "13.5px", fontWeight: "bold", background: "#f9fafb", cursor: "not-allowed" }} />
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", padding: "0 24px 20px" }}>
              <button type="button" onClick={() => setModalInfoInspeccion(null)} style={{ padding: "10px 18px", borderRadius: "8px", border: "1px solid #cbd5e1", background: "white", cursor: "pointer", fontWeight: "bold" }}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
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

export default PanelFuncionario;
