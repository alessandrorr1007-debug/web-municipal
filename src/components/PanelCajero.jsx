import { useEffect, useState, useMemo } from "react";
import {
  obtenerSolicitudes,
  actualizarSolicitud,
} from "../services/solicitudService";
import { crearNotificacion } from "../services/notificacionService";
import { useAuth } from "../context/AuthContext";

const MONTO_TRAMITE = 3.0;

function PanelCajero({ seccion }) {
  const { usuario } = useAuth();
  const [solicitudes, setSolicitudes] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [solicitudCobro, setSolicitudCobro] = useState(null);
  const [metodoPagoSeleccionado, setMetodoPagoSeleccionado] = useState("Efectivo en caja");
  const [comprobanteGenerado, setComprobanteGenerado] = useState(null);
  const [procesando, setProcesando] = useState(false);
  const [paso, setPaso] = useState("cobros-pendientes");

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
    });
  };

  // 1. SOLICITUDES PENDIENTES DE PAGO
  const pendientesPago = useMemo(() => {
    return solicitudes.filter((s) => {
      const esPendiente =
        s.estadoPago === "Pendiente" ||
        s.estadoPago === "Pendiente de pago" ||
        s.estado === "Pendiente de pago" ||
        s.estado === "Esperando pago en caja";
      const noConfirmado = s.estadoPago !== "Confirmado";
      return esPendiente && noConfirmado;
    });
  }, [solicitudes]);

  // 2. SOLICITUDES PAGADAS (HISTORIAL)
  const historialPagos = useMemo(() => {
    return solicitudes.filter(
      (s) => s.estadoPago === "Confirmado" || s.estado === "Pagado" || s.estado === "Pago confirmado"
    );
  }, [solicitudes]);

  // 3. BUSQUEDA POR DNI, EXPEDIENTE O RUC
  const solicitudesFiltradas = useMemo(() => {
    const lista = paso === "historial-pagos" ? historialPagos : pendientesPago;
    if (!busqueda.trim()) return lista;
    const q = busqueda.toLowerCase().trim();
    return lista.filter((s) => {
      const dni = (s.dniSolicitante || s.dni || "").toLowerCase();
      const idExp = (s.id || "").toLowerCase();
      const ruc = (s.ruc || "").toLowerCase();
      const nombreSol = (s.nombresSolicitante || s.nombreSolicitante || s.nombreNegocio || "").toLowerCase();
      return dni.includes(q) || idExp.includes(q) || ruc.includes(q) || nombreSol.includes(q);
    });
  }, [paso, pendientesPago, historialPagos, busqueda]);

  // 4. CONFIRMAR PAGO EN CAJA MUNICIPAL
  const ejecutarCobro = async () => {
    if (!solicitudCobro) return;
    setProcesando(true);
    try {
      const codComprobante = "REC-2026-" + Date.now().toString().slice(-6);
      const fechaHoraActual = formatearFechaHora();

      const cambios = {
        estadoPago: "Confirmado",
        estado: "Pago confirmado",
        estadoNormalizado: "PAGO_CONFIRMADO",
        metodoPago: metodoPagoSeleccionado,
        montoPagado: MONTO_TRAMITE,
        comprobantePago: `Comprobante de Caja N° ${codComprobante}`,
        numeroOperacion: codComprobante,
        fechaPago: fechaHoraActual,
        usuarioCajero: usuario?.nombre || "Cajero Municipal",
        uidCajero: usuario?.uid || "",
      };

      await actualizarSolicitud(solicitudCobro.id, cambios);

      // Notificación 1: Al Ciudadano/Negocio
      await crearNotificacion(
        solicitudCobro.uidUsuario || "",
        {
          titulo: "Pago Confirmado en Caja",
          descripcion: `Su pago por S/ ${MONTO_TRAMITE.toFixed(2)} (${codComprobante}) fue confirmado. Su solicitud EXP-${solicitudCobro.id} será revisada por la municipalidad.`,
          icono: "💳",
        },
        solicitudCobro.correoUsuario || ""
      );

      // Notificación 2: Al Funcionario
      await crearNotificacion(
        "FUNCIONARIO-ALL",
        {
          titulo: "Nueva Solicitud con Pago Confirmado",
          descripcion: `La solicitud EXP-${solicitudCobro.id} (${solicitudCobro.nombreNegocio}) confirmó el pago presencial. Pendiente de revisión documental.`,
          icono: "📋",
        },
        ""
      );

      const actualizada = { ...solicitudCobro, ...cambios, codComprobante };
      setComprobanteGenerado(actualizada);
      setSolicitudCobro(null);
      await cargarSolicitudes();
    } catch (err) {
      console.error(err);
      alert("Error al registrar el pago: " + err.message);
    } finally {
      setProcesando(false);
    }
  };

  const imprimirComprobante = () => {
    window.print();
  };

  return (
    <div className="panel panel-cajero">
      {/* HERO DE CAJA MUNICIPAL */}
      <div className="inspector-hero" style={{ background: "linear-gradient(135deg, #1e3a8a 0%, #d97706 100%)" }}>
        <div>
          <span className="eyebrow">Municipalidad de Trujillo — Módulo de Caja</span>
          <h1>Ventanilla de Cobros Municipales</h1>
          <p>
            Recepción y validación del derecho de trámite de licencias comerciales (S/ 3.00). Búsqueda inmediata por DNI o número de expediente.
          </p>
        </div>

        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <div className="hero-card">
            <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Pendientes</span>
            <strong style={{ fontSize: "24px" }}>{pendientesPago.length}</strong>
            <small>por cobrar</small>
          </div>

          <button type="button" className="btn-outline-light" onClick={cargarSolicitudes}>
            {cargando ? "Actualizando..." : "🔄 Actualizar"}
          </button>
        </div>
      </div>

      {/* METRICAS DE CAJA */}
      <div className="stats-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px", marginBottom: "20px" }}>
        <div className="stat-card">
          <span>Cobros Pendientes</span>
          <strong style={{ color: "#d97706" }}>{pendientesPago.length}</strong>
          <small>En espera de atención</small>
        </div>
        <div className="stat-card">
          <span>Pagos Registrados</span>
          <strong style={{ color: "#16a34a" }}>{historialPagos.length}</strong>
          <small>Cobros confirmados</small>
        </div>
        <div className="stat-card">
          <span>Monto Recaudado</span>
          <strong style={{ color: "#0f766e" }}>S/ {(historialPagos.length * MONTO_TRAMITE).toFixed(2)}</strong>
          <small>Recaudación total</small>
        </div>
      </div>

      {/* PESTAÑAS DE NAVEGACIÓN */}
      <div className="tabs-panel">
        <button
          type="button"
          className={paso === "cobros-pendientes" ? "tab-active" : ""}
          onClick={() => setPaso("cobros-pendientes")}
        >
          💳 Solicitudes Pendientes de Pago ({pendientesPago.length})
        </button>
        <button
          type="button"
          className={paso === "historial-pagos" ? "tab-active" : ""}
          onClick={() => setPaso("historial-pagos")}
        >
          📜 Historial de Pagos Realizados ({historialPagos.length})
        </button>
      </div>

      {/* VISTA: SOLICITUDES PENDIENTES DE PAGO */}
      <section className="section-card">
        <div className="section-header">
          <div>
            <h2>{paso === "cobros-pendientes" ? "Solicitudes Pendientes de Pago" : "Historial de Pagos Cobrados"}</h2>
            <p>Busca solicitudes por DNI del ciudadano, RUC del negocio o código de expediente (EXP-XXXXXX).</p>
          </div>
        </div>

        {/* BUSQUEDA POR DNI / EXPEDIENTE */}
        <div style={{ margin: "0 0 20px" }}>
          <input
            type="text"
            placeholder="🔍 Ingrese DNI del ciudadano, RUC o Código de Expediente (Ej. 72839482 o EXP-123456)..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            style={{ width: "100%", padding: "12px 18px", borderRadius: "10px", border: "1px solid #cbd5e1", fontSize: "14px" }}
          />
        </div>

        {solicitudesFiltradas.length === 0 ? (
          <div className="empty-state">
            <div style={{ fontSize: "36px", marginBottom: "10px" }}>💳</div>
            <h3>No se encontraron solicitudes pendientes</h3>
            <p>Las solicitudes registradas online o presenciales que requieran pago aparecerán aquí.</p>
          </div>
        ) : (
          <div className="tabla-container">
            <table className="modern-table">
              <thead>
                <tr>
                  <th>Expediente</th>
                  <th>Ciudadano / DNI</th>
                  <th>Establecimiento</th>
                  <th>Tipo Trámite</th>
                  <th>Derecho Trámite</th>
                  <th>Estado Pago</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {solicitudesFiltradas.map((s) => {
                  const nombreCiudadano =
                    [s.nombresSolicitante, s.apellidosSolicitante, s.nombreSolicitante].filter(Boolean).join(" ") ||
                    "Solicitante Ventanilla";

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
                        <span className="badge info">{s.tipoTramite || "Nueva licencia"}</span>
                      </td>
                      <td>
                        <strong>S/ {MONTO_TRAMITE.toFixed(2)}</strong>
                      </td>
                      <td>
                        <span className={`badge ${s.estadoPago === "Confirmado" ? "ok" : "warning"}`}>
                          {s.estadoPago === "Confirmado" ? "Confirmado" : "Pendiente"}
                        </span>
                      </td>
                      <td>
                        {s.estadoPago !== "Confirmado" ? (
                          <button
                            type="button"
                            className="btn-ok"
                            onClick={() => {
                              setSolicitudCobro(s);
                              setMetodoPagoSeleccionado("Efectivo en caja");
                            }}
                            style={{ background: "#16a34a", color: "white", padding: "8px 16px", borderRadius: "8px", fontWeight: "700" }}
                          >
                            💰 Registrar Pago
                          </button>
                        ) : (
                          <span style={{ fontSize: "12px", color: "#16a34a", fontWeight: "bold" }}>
                            ✓ Pagado ({s.numeroOperacion || "Confirmado"})
                          </span>
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

      {/* MODAL COBRAR EN CAJA MUNICIPAL */}
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
                  <strong>Tipo de Trámite:</strong> {solicitudCobro.tipoTramite || "Nueva licencia"}
                </p>
                <div style={{ marginTop: "10px", paddingTop: "10px", borderTop: "1px solid #cbd5e1", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: "bold", fontSize: "15px", color: "#0f172a" }}>Monto a Cobrar:</span>
                  <span style={{ fontSize: "20px", fontWeight: "800", color: "#16a34a" }}>S/ {MONTO_TRAMITE.toFixed(2)}</span>
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "13px", fontWeight: "bold", color: "#334155", marginBottom: "6px" }}>
                  Seleccione Método de Pago *
                </label>
                <select
                  value={metodoPagoSeleccionado}
                  onChange={(e) => setMetodoPagoSeleccionado(e.target.value)}
                  style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "14px" }}
                >
                  <option value="Efectivo en caja">Efectivo en Caja Municipal</option>
                  <option value="Tarjeta en caja (POS Débito/Crédito)">Tarjeta Débito / Crédito (POS)</option>
                  <option value="Billetera Digital (Yape / Plin)">Billetera Digital (Yape / Plin)</option>
                  <option value="Pago Confirmado por Flow Online">Pago Online (Flow / Pasarela)</option>
                </select>
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
                disabled={procesando}
                style={{ background: "#16a34a", color: "white" }}
              >
                {procesando ? "Procesando Cobro..." : "✅ Confirmar Pago y Generar Comprobante"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* COMPROBANTE DE PAGO IMPRIMIBLE */}
      {comprobanteGenerado && (
        <div className="admin-form-modal" style={{ zIndex: 1001 }}>
          <div className="admin-form-card" style={{ maxWidth: "480px", textAlign: "center" }}>
            <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "12px", padding: "20px" }}>
              <div style={{ fontSize: "40px", marginBottom: "8px" }}>🧾</div>
              <h3 style={{ color: "#166534", margin: "0 0 4px" }}>¡Pago Confirmado Con Éxito!</h3>
              <p style={{ color: "#15803d", fontSize: "14px", margin: "0 0 16px" }}>
                Comprobante N° <strong>{comprobanteGenerado.codComprobante}</strong>
              </p>

              <div style={{ textAlign: "left", background: "white", padding: "14px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px", color: "#334155" }}>
                <p style={{ margin: "4px 0" }}><strong>Expediente:</strong> EXP-{comprobanteGenerado.id}</p>
                <p style={{ margin: "4px 0" }}><strong>Establecimiento:</strong> {comprobanteGenerado.nombreNegocio}</p>
                <p style={{ margin: "4px 0" }}><strong>RUC:</strong> {comprobanteGenerado.ruc}</p>
                <p style={{ margin: "4px 0" }}><strong>Método:</strong> {comprobanteGenerado.metodoPago}</p>
                <p style={{ margin: "4px 0" }}><strong>Monto:</strong> S/ {MONTO_TRAMITE.toFixed(2)}</p>
                <p style={{ margin: "4px 0" }}><strong>Fecha y Hora:</strong> {comprobanteGenerado.fechaPago}</p>
                <p style={{ margin: "4px 0" }}><strong>Cajero:</strong> {comprobanteGenerado.usuarioCajero}</p>
              </div>

              <div style={{ marginTop: "20px", display: "flex", justifyContent: "center", gap: "10px" }}>
                <button
                  type="button"
                  onClick={imprimirComprobante}
                  style={{ padding: "10px 18px", background: "#0f766e", color: "white", border: "none", borderRadius: "8px", fontWeight: "700", cursor: "pointer" }}
                >
                  🖨️ Imprimir Ticket
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
    </div>
  );
}

export default PanelCajero;
