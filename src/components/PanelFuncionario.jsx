import { useEffect, useState } from "react";
import {
  obtenerSolicitudes,
  actualizarSolicitud,
} from "../services/solicitudService";
import { registrarDecisionFuncionario } from "../services/auditService";
import { abrirPdf } from "../services/pdfService";
import { useAuth } from "../context/AuthContext";

function PanelFuncionario({ seccion }) {
  const { usuario } = useAuth();
  const [solicitudes, setSolicitudes] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [observacionesRechazo, setObservacionesRechazo] = useState({});
  const [paso, setPaso] = useState("solicitudes");
  const [solicitudAgendar, setSolicitudAgendar] = useState(null);
  const [fechaAgendar, setFechaAgendar] = useState("");
  const [horaAgendar, setHoraAgendar] = useState("08:00");

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

  const formatearFecha = (fecha) => {
    if (!fecha) return "Sin fecha";
    return fecha;
  };

  const formatearFechaHora = () => {
    return new Date().toLocaleString("es-PE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const abrirAgendarModal = (sol) => {
    setSolicitudAgendar(sol);
    setFechaAgendar(sol.fechaVisitaInspector || "");
    setHoraAgendar(sol.horaVisitaInspector || "08:00");
  };

  const agendarInspeccion = async () => {
    if (!solicitudAgendar) return;
    if (!fechaAgendar) {
      alert("Debe seleccionar una fecha.");
      return;
    }
    try {
      setCargando(true);
      await actualizarSolicitud(solicitudAgendar.id, {
        inspeccion: "Pendiente",
        estado: "Inspección programada",
        fechaVisitaInspector: fechaAgendar,
        horaVisitaInspector: horaAgendar,
        programadoPor: "funcionario",
        nombreProgramador: "Funcionario municipal",
        notificaciones: [
          ...(solicitudAgendar.notificaciones || []),
          {
            fecha: formatearFechaHora(),
            titulo: "Inspección programada",
            mensaje: `Se programó una inspección para el ${fechaAgendar} a las ${horaAgendar}. Un inspector visitará tu local.`,
            leida: false,
          },
        ],
      });
      alert("Inspección programada exitosamente.");
      setSolicitudAgendar(null);
      setFechaAgendar("");
      await cargarSolicitudes();
    } catch (error) {
      console.error(error);
      alert("Error al programar inspección: " + error.message);
    } finally {
      setCargando(false);
    }
  };

  const aprobarLicencia = async (solicitud) => {
    const fechaActual = new Date();
    const fechaVencimiento = new Date(fechaActual);
    fechaVencimiento.setFullYear(fechaVencimiento.getFullYear() + 1);

    const fechaAprobacion = formatearFechaHora();
    const fechaExpiracion = `${String(fechaVencimiento.getDate()).padStart(2, "0")}/${String(fechaVencimiento.getMonth() + 1).padStart(2, "0")}/${fechaVencimiento.getFullYear()}`;

    const esRenovacion =
      solicitud.tipoTramite === "Renovacion anual" ||
      solicitud.tipoTramite === "Renovación anual";

    const numeroLicencia =
      esRenovacion && solicitud.numeroLicencia
        ? solicitud.numeroLicencia
        : `LIC-${Date.now().toString().slice(-8)}`;

    await actualizarSolicitud(solicitud.id, {
      estado: "Licencia emitida",
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
      hashFirmante: "",
      notificaciones: [
        ...(solicitud.notificaciones || []),
        {
          fecha: formatearFechaHora(),
          titulo: "Licencia aprobada",
          mensaje: `Tu licencia ${numeroLicencia} fue aprobada. Vence el ${fechaExpiracion}. Puedes descargarla desde tu panel.`,
          leida: false,
        },
      ],
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

    await cargarSolicitudes();
  };

  const rechazarLicencia = async (solicitud) => {
    const observacion = observacionesRechazo[solicitud.id] || "";
    if (observacion.trim() === "") {
      alert("Debes escribir el motivo del rechazo.");
      return;
    }

    await actualizarSolicitud(solicitud.id, {
      estado: "Rechazado",
      decisionFuncionario: "Rechazada",
      observacionFuncionario: observacion,
      fechaDecisionFuncionario: formatearFechaHora(),
      resultadoFinal: "Rechazado",
      hashFirmante: "",
      notificaciones: [
        ...(solicitud.notificaciones || []),
        {
          fecha: formatearFechaHora(),
          titulo: "Licencia rechazada",
          mensaje: `Tu solicitud fue rechazada. Motivo: ${observacion}`,
          leida: false,
        },
      ],
    });

    const resultadoAuditoria = await registrarDecisionFuncionario({
      usuario: usuario?.nombre || "Funcionario",
      usuarioId: usuario?.uid || "",
      solicitudId: solicitud.id,
      decision: "Rechazada",
      observacion: observacion,
    });

    if (resultadoAuditoria?.hashFirma) {
      await actualizarSolicitud(solicitud.id, {
        hashFirmante: resultadoAuditoria.hashFirma,
      });
    }

    await cargarSolicitudes();
  };

  const puedeAprobar = (s) =>
    (s.estado === "Inspección realizada" || s.estado === "Resultado enviado al funcionario") &&
    s.recomendacionInspector === "Aprobar";

  const solicitudCerrada = (s) =>
    s.estado === "Aprobado" || s.estado === "Licencia emitida" || s.estado === "Rechazado" || s.estado === "Licencia aprobada" || s.estado === "Licencia rechazada";

  const licenciaVencida = (s) => {
    const fecha = s.fechaExpiracionLicencia || s.fechaVencimiento;
    if (!fecha) return false;
    if (s.estado !== "Licencia emitida" && s.estado !== "Aprobado" && s.estado !== "Licencia aprobada") return false;

    const partes = fecha.split("/");
    if (partes.length === 3) {
      const fv = new Date(Number(partes[2]), Number(partes[1]) - 1, Number(partes[0]));
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);
      return fv < hoy;
    }
    return false;
  };

  const badgeClase = (estado = "") => {
    const t = estado.toLowerCase();
    if (t.includes("aprobada")) return "ok";
    if (t.includes("rechazada")) return "danger";
    if (t.includes("reobserva")) return "warning";
    if (t.includes("inspeccion") || t.includes("programada")) return "info";
    if (t.includes("resultado")) return "warning";
    if (t.includes("revision")) return "neutral";
    return "neutral";
  };

  const mostrarDocumentos = (s) => {
    if (s.archivosPdf?.length > 0) {
      return (
        <div className="documentos-lista">
          {s.archivosPdf.map((pdf, i) => (
            <a key={i} href={pdf.archivoUrl} onClick={(e) => { e.preventDefault(); abrirPdf(pdf.archivoUrl); }} target="_blank" rel="noreferrer">PDF {i + 1}</a>
          ))}
        </div>
      );
    }
    if (s.archivoUrl) {
      return <a className="file-pill" href={s.archivoUrl} onClick={(e) => { e.preventDefault(); abrirPdf(s.archivoUrl); }} target="_blank" rel="noreferrer">Ver PDF</a>;
    }
    return <span className="file-pill">Sin PDF</span>;
  };

  const total = solicitudes.length;
  const pendientes = solicitudes.filter((s) => s.estado === "En revision").length;
  const programadas = solicitudes.filter((s) => s.estado === "Programada para inspeccion").length;
  const enInspeccion = solicitudes.filter((s) => s.inspeccion === "Pendiente" && s.fechaVisitaInspector).length;
  const esperandoDecision = solicitudes.filter((s) => s.estado === "Resultado enviado al funcionario").length;
  const aprobadas = solicitudes.filter((s) => s.estado === "Licencia aprobada").length;
  const rechazadas = solicitudes.filter((s) => s.estado === "Licencia rechazada").length;
  const reobservadas = solicitudes.filter((s) => s.inspeccion === "Reobservada").length;

  return (
    <div className="panel panel-funcionario">
      <div className="funcionario-hero">
        <div>
          <span className="eyebrow">Mesa de partes municipal</span>
          <h1>Panel Funcionario</h1>
          <p>
            Revisa expedientes, programa inspecciones, emite decisiones y gestiona las solicitudes presenciales y online.
          </p>
        </div>

        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <div className="hero-card">
            <span style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Por decidir</span>
            <strong style={{ fontSize: "24px" }}>{esperandoDecision}</strong>
            <small>solicitudes</small>
          </div>

          <button type="button" className="btn-outline-light" onClick={cargarSolicitudes}>
            {cargando ? "Actualizando..." : "Actualizar"}
          </button>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <span>Total</span>
          <strong>{total}</strong>
          <small>Solicitudes en el sistema</small>
        </div>
        <div className="stat-card">
          <span>En revisión</span>
          <strong>{pendientes}</strong>
          <small>Esperando revisión</small>
        </div>
        <div className="stat-card">
          <span>Programadas</span>
          <strong>{programadas}</strong>
          <small>Inspección programada</small>
        </div>
        <div className="stat-card">
          <span>Reobservadas</span>
          <strong>{reobservadas}</strong>
          <small>Requieren 2da visita</small>
        </div>
        <div className="stat-card">
          <span>Por decidir</span>
          <strong>{esperandoDecision}</strong>
          <small>Con resultado del inspector</small>
        </div>
        <div className="stat-card">
          <span>Aprobadas</span>
          <strong>{aprobadas}</strong>
          <small>Licencias aprobadas</small>
        </div>
        <div className="stat-card">
          <span>Rechazadas</span>
          <strong>{rechazadas}</strong>
          <small>Licencias no aprobadas</small>
        </div>
      </div>

      <div className="tabs-panel">
        <button type="button" className={paso === "solicitudes" ? "tab-active" : ""} onClick={() => setPaso("solicitudes")}>
          Todas las solicitudes
        </button>
        <button type="button" className={paso === "notificaciones" ? "tab-active" : ""} onClick={() => setPaso("notificaciones")}>
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

          {solicitudes.length === 0 ? (
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
                    <th>Documentos</th>
                    <th>Pago</th>
                    <th>Inspección</th>
                    <th>Estado</th>
                    <th>Decisión</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {solicitudes.map((s) => {
                    const vencida = licenciaVencida(s);
                    return (
                      <tr key={s.id}>
                        <td>
                          <strong>{s.id}</strong>
                          <small>RUC: {s.ruc}</small>
                          <small>{s.fecha}</small>
                        </td>
                        <td>
                          <strong>{s.nombreNegocio}</strong>
                          <small>{s.razonSocial}</small>
                          <small>{s.direccion}</small>
                        </td>
                        <td>
                          <span className={`badge ${s.canalRegistro === "presencial" ? "info" : "ok"}`}>
                            {s.canalRegistro === "presencial" ? "Presencial" : "Online"}
                          </span>
                          {s.nombreSolicitante && <small>{s.nombreSolicitante}</small>}
                        </td>
                        <td>{mostrarDocumentos(s)}</td>
                        <td>
                          <span className={`badge ${s.estadoPago === "Confirmado" ? "ok" : "warning"}`}>
                            {s.estadoPago || "Pendiente"}
                          </span>
                          <small>{s.comprobantePago || s.metodoPago || "---"}</small>
                          {s.montoPagado > 0 && <small>S/{s.montoPagado}</small>}
                        </td>
                        <td>
                          {s.fechaVisitaInspector && (
                            <div>
                              <strong style={{ fontSize: "13px" }}>{s.fechaVisitaInspector}</strong>
                              <small>Programado: {s.nombreProgramador || "---"}</small>
                            </div>
                          )}
                          {s.cantidadReobservaciones > 0 && (
                            <span className="badge warning" style={{ marginTop: "4px" }}>
                              {s.cantidadReobservaciones} reobservación{s.cantidadReobservaciones > 1 ? "es" : ""}
                            </span>
                          )}
                        </td>
                        <td>
                          {vencida ? (
                            <span className="badge danger">Licencia vencida</span>
                          ) : (
                            <span className={`badge ${badgeClase(s.estado)}`}>{s.estado}</span>
                          )}
                        </td>
                        <td>
                          {s.numeroLicencia && (
                            <div>
                              <strong>{s.numeroLicencia}</strong>
                              <small>Vence: {s.fechaExpiracionLicencia || "---"}</small>
                            </div>
                          )}
                          {s.observacionFuncionario && (
                            <small style={{ color: "#dc2626" }}>{s.observacionFuncionario}</small>
                          )}
                        </td>
                        <td>
                          <div className="action-stack">
                            {["Pagado", "En revisión", "En revision", "Registrado"].includes(s.estado) && (
                              <button type="button" onClick={() => abrirAgendarModal(s)}>
                                Programar inspección
                              </button>
                            )}

                            {["Observado", "Reprogramado", "Inspección programada", "Programada para inspeccion"].includes(s.estado) && (
                              <button type="button" className="btn-warning" onClick={() => abrirAgendarModal(s)}>
                                Reprogramar inspección
                              </button>
                            )}

                            <button
                              type="button"
                              className="btn-ok"
                              onClick={() => aprobarLicencia(s)}
                              disabled={!puedeAprobar(s)}
                            >
                              Aprobar licencia
                            </button>

                            {!solicitudCerrada(s) && (
                              <textarea
                                placeholder="Motivo del rechazo..."
                                value={observacionesRechazo[s.id] || ""}
                                onChange={(e) =>
                                  setObservacionesRechazo((prev) => ({
                                    ...prev,
                                    [s.id]: e.target.value,
                                  }))
                                }
                                rows="3"
                              />
                            )}

                            <button
                              type="button"
                              className="btn-danger"
                              onClick={() => rechazarLicencia(s)}
                              disabled={solicitudCerrada(s)}
                            >
                              Rechazar licencia
                            </button>
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
                  <div key={s.id} style={{ padding: "16px", border: "1px solid #e2e8f0", borderRadius: "14px", marginBottom: "12px", background: "#f8fafc" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                      <div>
                        <strong>{s.nombreNegocio}</strong>
                        <small style={{ marginLeft: "8px" }}>{s.id}</small>
                      </div>
                      <span className={`badge ${s.canalRegistro === "presencial" ? "info" : "ok"}`}>
                        {s.canalRegistro === "presencial" ? "Presencial" : "Online"}
                      </span>
                    </div>
                    {s.notificaciones
                      .filter((n) => !n.leida)
                      .map((n, i) => (
                        <div key={i} style={{ padding: "10px", background: "white", borderRadius: "10px", border: "1px solid #e2e8f0", marginTop: "8px" }}>
                          <strong style={{ color: "#1f3b57", fontSize: "14px" }}>{n.titulo}</strong>
                          <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#475569" }}>{n.mensaje}</p>
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

      {solicitudAgendar && (
        <div className="admin-form-modal" style={{ zIndex: 1000 }}>
          <div className="admin-form-card" style={{ maxWidth: "450px" }}>
            <div className="admin-form-header">
              <h3>Agendar / Programar Inspección</h3>
              <button type="button" onClick={() => setSolicitudAgendar(null)}>✕</button>
            </div>
            <div style={{ padding: "16px 0" }}>
              <p style={{ margin: "0 0 16px", color: "#475569", fontSize: "14px" }}>
                El local comercial <strong>{solicitudAgendar.nombreNegocio}</strong> (Exp: {solicitudAgendar.id}) será inspeccionado por el Inspector municipal único.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>Fecha de visita *</label>
                  <input
                    type="date"
                    value={fechaAgendar}
                    onChange={(e) => setFechaAgendar(e.target.value)}
                    min={new Date().toISOString().split("T")[0]}
                    style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
                    required
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>Hora de visita *</label>
                  <select
                    value={horaAgendar}
                    onChange={(e) => setHoraAgendar(e.target.value)}
                    style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
                    required
                  >
                    <option value="08:00">08:00 AM</option>
                    <option value="09:00">09:00 AM</option>
                    <option value="10:00">10:00 AM</option>
                    <option value="11:00">11:00 AM</option>
                    <option value="12:00">12:00 PM</option>
                    <option value="14:00">02:00 PM</option>
                    <option value="15:00">03:00 PM</option>
                    <option value="16:00">04:00 PM</option>
                    <option value="17:00">05:00 PM</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="admin-form-actions" style={{ marginTop: "20px" }}>
              <button type="button" onClick={() => setSolicitudAgendar(null)}>Cancelar</button>
              <button type="button" className="btn-primary" onClick={agendarInspeccion} disabled={cargando}>
                {cargando ? "Agendando..." : "Programar Visita"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PanelFuncionario;
