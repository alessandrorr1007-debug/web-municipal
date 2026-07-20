import { useEffect, useState, useMemo, useCallback } from "react";
import {
  obtenerSolicitudes,
  actualizarSolicitud,
  contarInspeccionesEnFecha,
} from "../services/solicitudService";
import { registrarDecisionFuncionario } from "../services/auditService";
import { abrirPdf } from "../services/pdfService";
import { crearNotificacion } from "../services/notificacionService";
import { useAuth } from "../context/AuthContext";
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
  esDiaHabil,
  formatearFechaLocal,
  obtenerSiguienteDiaHabil,
} from "../config/inspeccionConfig";
import { obtenerDocumentosPorGiro } from "../config/documentosPorGiro";

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

function SkeletonDetailModal() {
  return (
    <div className="det-modal-backdrop">
      <div className="det-modal-card">
        <div className="det-modal-header">
          <div className="skeleton-line" style={{ width: "220px", height: "22px" }} />
          <div className="skeleton-line" style={{ width: "32px", height: "32px", borderRadius: "50%" }} />
        </div>
        <div className="det-modal-tabs">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton-line" style={{ width: "80px", height: "28px", borderRadius: "8px" }} />
          ))}
        </div>
        <div className="det-modal-body">
          {[1, 2, 3].map((i) => (
            <div key={i} className="det-skeleton-field">
              <div className="skeleton-line" style={{ width: "120px", height: "14px" }} />
              <div className="skeleton-line" style={{ width: "100%", height: "36px", marginTop: "6px" }} />
            </div>
          ))}
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
          abrirPdf(url);
        }}
      >
        Ver
      </a>
    </div>
  );
}

function ModalDetalleExpediente({ solicitud, onCerrar, onAgendar, onAprobar, onRechazar, puedeAgendar, puedeAprobar, puedeRechazar, badgeEstado }) {
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
    { key: "inspeccion", label: "Inspeccion", icon: "\uD83D\uDD0D" },
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
                  <DetFieldValue label="Razon Social" value={solicitud.razonSocial} />
                  <DetFieldValue label="Nombre Comercial" value={solicitud.nombreNegocio} />
                  <DetFieldValue label="RUC" value={solicitud.ruc} mono />
                  <DetFieldValue label="Giro / Actividad" value={solicitud.giro || solicitud.actividadComercial || "---"} />
                </div>
              </div>

              <div className="det-section-card">
                <h3 className="det-section-title">
                  <span className="det-section-icon">&#128205;</span>
                  Ubicacion
                </h3>
                <div className="det-fields-grid">
                  <DetFieldValue label="Direccion" value={solicitud.direccion} />
                  <DetFieldValue label="Departamento" value={solicitud.departamento} />
                  <DetFieldValue label="Provincia" value={solicitud.provincia} />
                  <DetFieldValue label="Distrito" value={solicitud.distrito} />
                </div>
              </div>

              <div className="det-section-card">
                <h3 className="det-section-title">
                  <span className="det-section-icon">&#128176;</span>
                  Estado del Pago
                </h3>
                <div className="det-fields-grid">
                  <DetFieldValue label="Estado Pago" value={solicitud.estadoPago || solicitud.estadoPagoGeneral || "Pendiente"} />
                  <DetFieldValue label="Metodo de Pago" value={solicitud.metodoPago || solicitud.comprobantePago || "---"} />
                  <DetFieldValue label="Monto Pagado" value={solicitud.montoPagado > 0 ? `S/${solicitud.montoPagado}` : "---"} />
                  <DetFieldValue label="Numero Operacion" value={solicitud.numeroOperacion || solicitud.numeroComprobante || "---"} mono />
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
                  <DetFieldValue label="Correo Electronico" value={solicitud.correoUsuario} />
                  <DetFieldValue label="Telefono" value={solicitud.telefono} />
                  <DetFieldValue label="Razon Social" value={solicitud.razonSocial} />
                </div>
              </div>
            </div>
          )}

          {tabActiva === "documentos" && (
            <div className="det-tab-content animate-fade-in">
              <div className="det-section-card">
                <h3 className="det-section-title">
                  <span className="det-section-icon">&#128194;</span>
                  Documentos del Ciudadano
                  <span className="det-section-count">{archivosCiudadano.length}</span>
                </h3>
                {archivosCiudadano.length === 0 ? (
                  <div className="det-empty-docs">
                    <span>No se encontraron documentos del ciudadano.</span>
                  </div>
                ) : (
                  <div className="det-doc-list">
                    {archivosCiudadano.map((archivo, i) => (
                      <DetDocumentCard key={i} archivo={archivo} index={i} />
                    ))}
                  </div>
                )}
                {docsData.ciudadano.length > 0 && (
                  <div className="det-req-legend">
                    <span className="det-req-label">Documentos requeridos para {docsData.giroLabel}:</span>
                    <div className="det-req-list">
                      {docsData.ciudadano.slice(0, 10).map((d, i) => (
                        <span key={i} className="det-req-item">
                          <span className="det-req-dot">{d.obligatorio ? "\u25CF" : "\u25CB"}</span>
                          {d.nombre}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="det-section-card">
                <h3 className="det-section-title">
                  <span className="det-section-icon">&#128196;</span>
                  Documentos del Sistema
                  <span className="det-section-count">{archivosSistema.length}</span>
                </h3>
                {archivosSistema.length === 0 ? (
                  <div className="det-empty-docs">
                    <span>No hay documentos generados aun en el sistema.</span>
                  </div>
                ) : (
                  <div className="det-doc-list">
                    {archivosSistema.map((archivo, i) => (
                      <DetDocumentCard key={i} archivo={archivo} index={i} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {tabActiva === "inspeccion" && (
            <div className="det-tab-content animate-fade-in">
              <div className="det-section-card">
                <h3 className="det-section-title">
                  <span className="det-section-icon">&#128269;</span>
                  Inspeccion Programada
                </h3>
                <div className="det-fields-grid">
                  <DetFieldValue label="Resultado Inspeccion" value={solicitud.resultadoInspeccion || solicitud.inspeccion || "Pendiente"} />
                  <DetFieldValue label="Fecha Visita" value={solicitud.fechaVisitaInspector || "---"} />
                  <DetFieldValue label="Hora Visita" value={solicitud.horaVisitaLabel || solicitud.horaVisitaInspector || "---"} />
                  <DetFieldValue label="Inspector Asignado" value={solicitud.inspectorAsignado || "---"} />
                </div>
              </div>

              {(solicitud.recomendacionInspector || solicitud.observacionesInspector) && (
                <div className="det-section-card">
                  <h3 className="det-section-title">
                    <span className="det-section-icon">&#128221;</span>
                    Resultado del Inspector
                  </h3>
                  <div className="det-fields-grid">
                    <DetFieldValue label="Recomendacion" value={solicitud.recomendacionInspector || "---"} />
                    <DetFieldValue label="Observaciones" value={solicitud.observacionesInspector || "---"} />
                  </div>
                </div>
              )}

              {solicitud.numeroLicencia && (
                <div className="det-section-card">
                  <h3 className="det-section-title">
                    <span className="det-section-icon">&#127942;</span>
                    Licencia
                  </h3>
                  <div className="det-fields-grid">
                    <DetFieldValue label="Numero Licencia" value={solicitud.numeroLicencia} mono />
                    <DetFieldValue label="Fecha Aprobacion" value={solicitud.fechaAprobacion || "---"} />
                    <DetFieldValue label="Vence" value={solicitud.fechaExpiracionLicencia || "---"} />
                    <DetFieldValue label="Aprobado por" value={solicitud.funcionarioAprueba || "---"} />
                  </div>
                </div>
              )}

              {solicitud.observacionFuncionario && (
                <div className="det-section-card det-section-alert">
                  <h3 className="det-section-title det-section-title-alert">
                    <span className="det-section-icon">&#10060;</span>
                    Motivo de Rechazo
                  </h3>
                  <p className="det-alert-text">{solicitud.observacionFuncionario}</p>
                </div>
              )}
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
            {puedeAgendar && (
              <button type="button" className="det-action-btn det-action-primary" onClick={onAgendar}>
                &#128197; Programar Inspeccion
              </button>
            )}
            {puedeRechazar && (
              <button type="button" className="det-action-btn det-action-danger" onClick={onRechazar}>
                &#10060; Rechazar
              </button>
            )}
            {puedeAprobar && (
              <button type="button" className="det-action-btn det-action-success" onClick={onAprobar}>
                &#9989; Aprobar
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

function PanelFuncionario({ seccion }) {
  const { usuario } = useAuth();
  const [solicitudes, setSolicitudes] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [busqueda, setBusqueda] = useState("");
  const [solicitudDetalle, setSolicitudDetalle] = useState(null);
  const [solicitudAgendar, setSolicitudAgendar] = useState(null);
  const [slotSeleccionado, setSlotSeleccionado] = useState("");
  const [fechaSeleccionada, setFechaSeleccionada] = useState("");
  const [capacidades, setCapacidades] = useState({});
  const [cargandoCapacidad, setCargandoCapacidad] = useState(false);
  const [modalAprobar, setModalAprobar] = useState(null);
  const [modalRechazar, setModalRechazar] = useState(null);
  const [motivoRechazo, setMotivoRechazo] = useState("");
  const [procesando, setProcesando] = useState(false);
  const [paso, setPaso] = useState("solicitudes");

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

  const stats = useMemo(() => {
    const total = solicitudes.length;
    const pendientesDecision = solicitudes.filter(
      (s) => normalizarEstado(s) === ESTADOS.REVISION_FUNCIONARIO
    ).length;
    const inspeccionesAprobadas = solicitudes.filter(
      (s) => s.inspeccion === "Aprobada" || s.resultadoInspeccion === "Aprobada"
    ).length;
    const observaciones = solicitudes.filter(
      (s) => s.inspeccion === "Observada" || s.resultadoInspeccion === "Observada"
    ).length;
    const licenciasAprobadas = solicitudes.filter(
      (s) => normalizarEstado(s) === ESTADOS.APROBADO
    ).length;
    const licenciasRechazadas = solicitudes.filter(
      (s) => normalizarEstado(s) === ESTADOS.RECHAZADO
    ).length;
    return {
      total,
      pendientesDecision,
      inspeccionesAprobadas,
      observaciones,
      licenciasAprobadas,
      licenciasRechazadas,
    };
  }, [solicitudes]);

  const solicitudesFiltradas = useMemo(() => {
    let resultado = solicitudes;
    if (filtroEstado !== "todos") {
      resultado = resultado.filter(
        (s) => normalizarEstado(s) === filtroEstado
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

  const abrirAgendarModal = (sol) => {
    setSolicitudAgendar(sol);
    setFechaSeleccionada("");
    setSlotSeleccionado("");
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
      alert("Debe seleccionar un horario.");
      return;
    }

    const count = capacidades[fechaSeleccionada] || 0;
    if (count >= MAX_INSPECCIONES_POR_DIA) {
      alert(`La fecha ${fechaSeleccionada} ya tiene ${MAX_INSPECCIONES_POR_DIA} inspecciones programadas. Seleccione otra fecha.`);
      return;
    }

    const slot = TIME_SLOTS.find((t) => t.value === slotSeleccionado);
    if (!slot) {
      alert("Horario invalido.");
      return;
    }

    try {
      setProcesando(true);

      const fechaParts = fechaSeleccionada.split("/");
      const fechaISO = `${fechaParts[2]}-${fechaParts[1]}-${fechaParts[0]}`;
      const fechaObj = new Date(`${fechaISO}T${slotSeleccionado}:00`);
      const timestamp = fechaObj.getTime();
      const ahora = Date.now();
      if (timestamp <= ahora) {
        alert("El horario seleccionado ya paso. Elija otro horario.");
        setProcesando(false);
        return;
      }

      await actualizarSolicitud(solicitudAgendar.id, {
        inspeccion: "Pendiente",
        estado: ESTADOS.INSPECCION_PROGRAMADA,
        estadoNormalizado: ESTADOS.INSPECCION_PROGRAMADA,
        fechaVisitaInspector: fechaSeleccionada,
        horaVisitaInspector: slotSeleccionado,
        horaVisitaLabel: slot.label,
        programadoPor: "funcionario",
        nombreProgramador: usuario?.nombre || "Funcionario municipal",
        uidProgramador: usuario?.uid || "",
        inspectorAsignado: "Inspector municipal",
        inspectorAsignadoUid: "",
      });

      const capacidadActual = count + 1;
      setCapacidades((prev) => ({
        ...prev,
        [fechaSeleccionada]: capacidadActual,
      }));

      alert(`Inspeccion programada para el ${fechaSeleccionada} a las ${slot.label}.`);
      setSolicitudAgendar(null);
      setFechaSeleccionada("");
      setSlotSeleccionado("");
      await cargarSolicitudes();
    } catch (error) {
      console.error(error);
      alert("Error al programar inspeccion: " + error.message);
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
      const esRenovacion =
        solicitud.tipoTramite === "Renovacion anual" ||
        solicitud.tipoTramite === "Renovacion anual";
      const numeroLicencia =
        esRenovacion && solicitud.numeroLicencia
          ? solicitud.numeroLicencia
          : `LIC-${Date.now().toString().slice(-8)}`;

      await actualizarSolicitud(solicitud.id, {
        estado: ESTADOS.APROBADO,
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
        funcionarioAprueba: usuario?.nombre || "Funcionario",
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
          titulo: "Licencia aprobada",
          descripcion: `Su solicitud EXP-${solicitud.id} ha sido aprobada. Numero de licencia: ${numeroLicencia}. Vence el ${fechaExpiracion}. Puede descargarla desde su panel.`,
          icono: "✅",
        },
        solicitud.correoUsuario
      );

      await cargarSolicitudes();
      setModalAprobar(null);
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
        funcionarioAprueba: usuario?.nombre || "Funcionario",
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
          titulo: "Solicitud rechazada",
          descripcion: `Su solicitud EXP-${solicitud.id} ha sido rechazada. Motivo: ${motivoRechazo.trim()}. Si tiene dudas, acerquese a la mesa de partes.`,
          icono: "❌",
        },
        solicitud.correoUsuario
      );

      await cargarSolicitudes();
      setModalRechazar(null);
      setMotivoRechazo("");
    } catch (error) {
      console.error("Error al rechazar:", error);
      alert("Error al rechazar la licencia: " + error.message);
    } finally {
      setProcesando(false);
    }
  };

  const puedeAprobar = (s) => {
    const estado = normalizarEstado(s);
    return esPuedeAprobar(estado, s.recomendacionInspector);
  };

  const puedeAgendar = (s) => {
    const estado = normalizarEstado(s);
    return estado === ESTADOS.PAGO_CONFIRMADO;
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
    const label = ESTADO_LABELS[estado] || estado;
    const vencida = licenciaVencida(s);
    if (vencida) {
      return (
        <span className="badge danger">Licencia vencida</span>
      );
    }
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
        {pago}
      </span>
    );
  };

  const badgeInspeccion = (s) => {
    const insp = s.resultadoInspeccion || s.inspeccion || "Pendiente";
    let clase = "neutral";
    if (insp === "Aprobada" || insp === "APROBADA") clase = "ok";
    else if (insp === "Observada" || insp === "OBSERVADA") clase = "warning";
    else if (insp === "Rechazada" || insp === "RECHAZADA") clase = "danger";
    return <span className={`badge ${clase}`}>{insp}</span>;
  };

  const licenciaVencida = (s) => {
    const fecha = s.fechaExpiracionLicencia || s.fechaVencimiento;
    if (!fecha) return false;
    const estado = normalizarEstado(s);
    if (estado !== ESTADOS.APROBADO) return false;
    const partes = fecha.split("/");
    if (partes.length === 3) {
      const fv = new Date(
        Number(partes[2]),
        Number(partes[1]) - 1,
        Number(partes[0])
      );
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);
      return fv < hoy;
    }
    return false;
  };

  const mostrarDocumentos = (s) => {
    const archivos = s.archivosPdf || [];
    if (archivos.length > 0) {
      return (
        <div className="documentos-lista">
          {archivos.map((pdf, i) => (
            <a
              key={i}
              href="#"
              onClick={(e) => {
                e.preventDefault();
                const url = pdf.archivoUrl || pdf.url || pdf;
                if (typeof url === "string" && url.startsWith("http")) {
                  abrirPdf(url);
                }
              }}
            >
              {pdf.nombre || pdf.archivoNombre || `PDF ${i + 1}`}
            </a>
          ))}
        </div>
      );
    }
    if (s.archivoUrl) {
      return (
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            abrirPdf(s.archivoUrl);
          }}
          className="file-pill"
        >
          Ver PDF
        </a>
      );
    }
    return <span className="file-pill">Sin PDF</span>;
  };

  const capacidadSeleccionada = capacidades[fechaSeleccionada] || 0;
  const diaCompleto = capacidadSeleccionada >= MAX_INSPECCIONES_POR_DIA;

  return (
    <div className="panel panel-funcionario">
      <div className="funcionario-hero">
        <div>
          <span className="eyebrow">Mesa de partes municipal</span>
          <h1>Panel Funcionario</h1>
          <p>
            Revisa expedientes, programa inspecciones, emite decisiones y
            gestiona las solicitudes presenciales y online.
          </p>
        </div>
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <div className="hero-card">
            <span
              style={{
                fontSize: "12px",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Por decidir
            </span>
            <strong style={{ fontSize: "24px" }}>
              {stats.pendientesDecision}
            </strong>
            <small>solicitudes</small>
          </div>
          <button
            type="button"
            className="btn-outline-light"
            onClick={cargarSolicitudes}
          >
            {cargando ? "Actualizando..." : "Actualizar"}
          </button>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <span>Total</span>
          <strong>{stats.total}</strong>
          <small>Solicitudes en el sistema</small>
        </div>
        <div className="stat-card">
          <span>Pendientes de decision</span>
          <strong>{stats.pendientesDecision}</strong>
          <small>Con resultado del inspector</small>
        </div>
        <div className="stat-card">
          <span>Inspecciones aprobadas</span>
          <strong>{stats.inspeccionesAprobadas}</strong>
          <small>Sin incidencias</small>
        </div>
        <div className="stat-card">
          <span>Observaciones</span>
          <strong>{stats.observaciones}</strong>
          <small>Requieren revision</small>
        </div>
        <div className="stat-card">
          <span>Licencias aprobadas</span>
          <strong>{stats.licenciasAprobadas}</strong>
          <small>Emitidas exitosamente</small>
        </div>
        <div className="stat-card">
          <span>Licencias rechazadas</span>
          <strong>{stats.licenciasRechazadas}</strong>
          <small>No aprobadas</small>
        </div>
      </div>

      <div className="tabs-panel">
        <button
          type="button"
          className={paso === "solicitudes" ? "tab-active" : ""}
          onClick={() => setPaso("solicitudes")}
        >
          Solicitudes
        </button>
        <button
          type="button"
          className={paso === "notificaciones" ? "tab-active" : ""}
          onClick={() => setPaso("notificaciones")}
        >
          Notificaciones pendientes
        </button>
      </div>

      {paso === "solicitudes" && (
        <section className="section-card">
          <div className="section-header">
            <div>
              <h2>Solicitudes recibidas</h2>
              <p>Gestiona los expedientes registrados por cajeros y negocios.</p>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: "12px",
              flexWrap: "wrap",
              marginBottom: "16px",
            }}
          >
            <input
              type="text"
              placeholder="Buscar por expediente, negocio, RUC o direccion..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              style={{
                flex: 1,
                minWidth: "200px",
                padding: "10px 14px",
                borderRadius: "8px",
                border: "1px solid #cbd5e1",
                fontSize: "14px",
              }}
            />
            <select
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
              style={{
                padding: "10px 14px",
                borderRadius: "8px",
                border: "1px solid #cbd5e1",
                fontSize: "14px",
                minWidth: "180px",
              }}
            >
              <option value="todos">Todos los estados</option>
              {Object.entries(ESTADO_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {cargando && solicitudes.length === 0 ? (
            <div className="skeleton-table">
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className="skeleton-row"
                  style={{
                    height: "48px",
                    background: "#f1f5f9",
                    borderRadius: "8px",
                    marginBottom: "8px",
                    animation: "pulse 1.5s infinite",
                  }}
                />
              ))}
            </div>
          ) : solicitudesFiltradas.length === 0 ? (
            <div className="empty-state">
              <div style={{ fontSize: "36px", marginBottom: "10px" }}>&#128203;</div>
              <h3>No existen solicitudes registradas</h3>
              <p>Cuando un negocio o cajero registre una solicitud, aparecera aqui.</p>
            </div>
          ) : (
            <div className="tabla-container">
              <table className="modern-table funcionario-table">
                <thead>
                  <tr>
                    <th>Expediente</th>
                    <th>Negocio</th>
                    <th>Canal</th>
                    <th>Pago</th>
                    <th>Inspeccion</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {solicitudesFiltradas.map((s) => {
                    const estado = normalizarEstado(s);
                    const vencida = licenciaVencida(s);
                    return (
                      <tr key={s.id}>
                        <td>
                          <strong>{s.id}</strong>
                          <small>RUC: {s.ruc || "---"}</small>
                          <small>{s.fecha || "---"}</small>
                        </td>
                        <td>
                          <strong>{s.nombreNegocio || "---"}</strong>
                          <small>{s.direccion || "---"}</small>
                        </td>
                        <td>
                          <span
                            className={`badge ${
                              s.canalRegistro === "presencial" ? "info" : "ok"
                            }`}
                          >
                            {s.canalRegistro === "presencial"
                              ? "Presencial"
                              : "Online"}
                          </span>
                        </td>
                        <td>{badgePago(s)}</td>
                        <td>{badgeInspeccion(s)}</td>
                        <td>
                          {vencida ? (
                            <span className="badge danger">Licencia vencida</span>
                          ) : (
                            badgeEstado(s)
                          )}
                        </td>
                        <td>
                          <div className="action-stack">
                            <button
                              type="button"
                              className="btn-info"
                              onClick={() => setSolicitudDetalle(s)}
                            >
                              Detalle
                            </button>
                            {puedeAgendar(s) && (
                              <button
                                type="button"
                                onClick={() => abrirAgendarModal(s)}
                              >
                                Programar inspeccion
                              </button>
                            )}
                            {puedeReprogramar(s) && (
                              <button
                                type="button"
                                className="btn-warning"
                                onClick={() => abrirAgendarModal(s)}
                              >
                                Reprogramar
                              </button>
                            )}
                            <button
                              type="button"
                              className="btn-ok"
                              onClick={() => setModalAprobar(s)}
                              disabled={!puedeAprobar(s)}
                            >
                              Aprobar
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
                                Rechazar
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

      {paso === "notificaciones" && (
        <section className="section-card">
          <div className="section-header">
            <div>
              <h2>Notificaciones pendientes</h2>
              <p>Solicitudes con notificaciones sin leer para los negocios.</p>
            </div>
          </div>

          {(() => {
            const conNotificaciones = solicitudes.filter(
              (s) => s.notificaciones && s.notificaciones.some((n) => !n.leida)
            );

            if (conNotificaciones.length === 0) {
              return (
                <div className="empty-state">
                  <div style={{ fontSize: "36px", marginBottom: "10px" }}>&#128276;</div>
                  <h3>No hay notificaciones pendientes</h3>
                  <p>Todas las notificaciones han sido vistas.</p>
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
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        marginBottom: "8px",
                      }}
                    >
                      <div>
                        <strong>{s.nombreNegocio}</strong>
                        <small style={{ marginLeft: "8px" }}>{s.id}</small>
                      </div>
                      <span
                        className={`badge ${
                          s.canalRegistro === "presencial" ? "info" : "ok"
                        }`}
                      >
                        {s.canalRegistro === "presencial"
                          ? "Presencial"
                          : "Online"}
                      </span>
                    </div>
                    {s.notificaciones
                      .filter((n) => !n.leida)
                      .map((n, i) => (
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
                            {n.titulo}
                          </strong>
                          <p
                            style={{
                              margin: "4px 0 0",
                              fontSize: "13px",
                              color: "#475569",
                            }}
                          >
                            {n.mensaje}
                          </p>
                          <small style={{ color: "#94a3b8" }}>{n.fecha}</small>
                        </div>
                      ))}
                  </div>
                ))}
              </div>
            );
          })()}
        </section>
      )}

      {solicitudDetalle && (
        <ModalDetalleExpediente
          solicitud={solicitudDetalle}
          onCerrar={() => setSolicitudDetalle(null)}
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

      {modalAprobar && (
        <div className="admin-form-modal" style={{ zIndex: 1001 }}>
          <div className="admin-form-card" style={{ maxWidth: "480px" }}>
            <div className="admin-form-header">
              <h3>Confirmar aprobacion</h3>
              <button
                type="button"
                onClick={() => setModalAprobar(null)}
              >
                &#10005;
              </button>
            </div>
            <div style={{ padding: "16px 0" }}>
              <p style={{ color: "#475569", fontSize: "14px", margin: "0 0 12px" }}>
                Esta seguro de aprobar la solicitud{" "}
                <strong>EXP-{modalAprobar.id}</strong> del negocio{" "}
                <strong>{modalAprobar.nombreNegocio}</strong>?
              </p>
              <p style={{ color: "#64748b", fontSize: "13px", margin: 0 }}>
                Se generara la licencia, se creara un numero de licencia y se
                notificara al ciudadano por correo electronico.
              </p>
            </div>
            <div className="admin-form-actions">
              <button
                type="button"
                onClick={() => setModalAprobar(null)}
                disabled={procesando}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn-ok"
                onClick={ejecutarAprobacion}
                disabled={procesando}
              >
                {procesando ? "Procesando..." : "Confirmar aprobacion"}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalRechazar && (
        <div className="admin-form-modal" style={{ zIndex: 1001 }}>
          <div className="admin-form-card" style={{ maxWidth: "480px" }}>
            <div className="admin-form-header">
              <h3>Rechazar solicitud</h3>
              <button
                type="button"
                onClick={() => {
                  setModalRechazar(null);
                  setMotivoRechazo("");
                }}
              >
                &#10005;
              </button>
            </div>
            <div style={{ padding: "16px 0" }}>
              <p style={{ color: "#475569", fontSize: "14px", margin: "0 0 12px" }}>
                Solicitud <strong>EXP-{modalRechazar.id}</strong> del negocio{" "}
                <strong>{modalRechazar.nombreNegocio}</strong>.
              </p>
              <label
                style={{
                  display: "block",
                  fontSize: "13px",
                  fontWeight: "bold",
                  color: "#334155",
                  marginBottom: "4px",
                }}
              >
                Motivo del rechazo *
              </label>
              <textarea
                value={motivoRechazo}
                onChange={(e) => setMotivoRechazo(e.target.value)}
                rows="4"
                placeholder="Indique el motivo del rechazo (obligatorio)..."
                style={{
                  width: "100%",
                  padding: "10px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  fontSize: "14px",
                  resize: "vertical",
                }}
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
                {procesando ? "Procesando..." : "Confirmar rechazo"}
              </button>
            </div>
          </div>
        </div>
      )}

      {solicitudAgendar && (
        <div className="admin-form-modal" style={{ zIndex: 1000 }}>
          <div className="admin-form-card" style={{ maxWidth: "560px", maxHeight: "85vh", overflowY: "auto" }}>
            <div className="admin-form-header">
              <h3>Programar Inspeccion</h3>
              <button
                type="button"
                onClick={() => {
                  setSolicitudAgendar(null);
                  setFechaSeleccionada("");
                  setSlotSeleccionado("");
                }}
              >
                &#10005;
              </button>
            </div>
            <div style={{ padding: "16px 0" }}>
              <p
                style={{
                  margin: "0 0 16px",
                  color: "#475569",
                  fontSize: "14px",
                }}
              >
                Local: <strong>{solicitudAgendar.nombreNegocio}</strong> (Exp:{" "}
                {solicitudAgendar.id})
              </p>

              <CalendarioInspeccion
                fechaSeleccionada={fechaSeleccionada}
                onSelectFecha={handleSelectFecha}
                capacidades={capacidades}
              />

              {fechaSeleccionada && (
                <div style={{ marginTop: "16px" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: "12px",
                    }}
                  >
                    <label
                      style={{
                        fontSize: "13px",
                        fontWeight: "bold",
                        color: "#334155",
                      }}
                    >
                      Inspecciones programadas:{" "}
                      <span
                        style={{
                          color: diaCompleto
                            ? "#dc2626"
                            : capacidadSeleccionada >= MAX_INSPECCIONES_POR_DIA - 1
                            ? "#d97706"
                            : "#16a34a",
                          fontSize: "16px",
                        }}
                      >
                        {capacidadSeleccionada}/{MAX_INSPECCIONES_POR_DIA}
                      </span>
                    </label>
                    {cargandoCapacidad && (
                      <small style={{ color: "#94a3b8" }}>Cargando...</small>
                    )}
                  </div>

                  {diaCompleto ? (
                    <div
                      style={{
                        padding: "14px",
                        background: "#fef2f2",
                        border: "1px solid #fecaca",
                        borderRadius: "10px",
                        color: "#991b1b",
                        fontSize: "14px",
                        textAlign: "center",
                      }}
                    >
                      Dia completo. Seleccione otra fecha.
                    </div>
                  ) : (
                    <div>
                      <label
                        style={{
                          display: "block",
                          fontSize: "13px",
                          fontWeight: "bold",
                          color: "#334155",
                          marginBottom: "6px",
                        }}
                      >
                        Horario de visita *
                      </label>
                      <div className="time-slots-grid">
                        {TIME_SLOTS.map((slot) => (
                          <button
                            key={slot.value}
                            type="button"
                            className={`time-slot ${
                              slotSeleccionado === slot.value ? "seleccionado" : ""
                            }`}
                            onClick={() => setSlotSeleccionado(slot.value)}
                          >
                            {slot.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
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
                disabled={procesando || !fechaSeleccionada || !slotSeleccionado || diaCompleto}
              >
                {procesando ? "Programando..." : "Programar Visita"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PanelFuncionario;
