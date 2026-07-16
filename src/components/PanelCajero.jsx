import { useEffect, useState } from "react";
import { consultarRuc } from "../services/rucService";
import {
  guardarSolicitud,
  obtenerSolicitudes,
  actualizarSolicitud,
} from "../services/solicitudService";
import { useAuth } from "../context/AuthContext";

const MONTO_TRAMITE = 3;

function PanelCajero({ seccion }) {
  const { usuario } = useAuth();

  const [paso, setPaso] = useState("cobrar");
  const [busquedaCajero, setBusquedaCajero] = useState("");
  const [solicitudSeleccionada, setSolicitudSeleccionada] = useState(null);
  const [mostrarComprobante, setMostrarComprobante] = useState(false);
  const [solicitudes, setSolicitudes] = useState([]);

  useEffect(() => {
    if (seccion === "nueva-solicitud") {
      setPaso("nueva");
    } else if (seccion === "historial") {
      setPaso("historial");
    } else if (seccion === "estadisticas") {
      setPaso("estadisticas");
    } else {
      setPaso("cobrar");
    }
  }, [seccion]);
  const [cargando, setCargando] = useState(false);
  const [buscandoRuc, setBuscandoRuc] = useState(false);
  const [errorRuc, setErrorRuc] = useState("");
  const [rucValidado, setRucValidado] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const [form, setForm] = useState({
    tipoTramite: "Nueva licencia",
    ruc: "",
    nombreNegocio: "",
    razonSocial: "",
    direccion: "",
    giro: "",
    estadoSunat: "",
    condicionSunat: "",
    nombreSolicitante: "",
    telefonoSolicitante: "",
  });

  const [pagoConfirmado, setPagoConfirmado] = useState(false);
  const [codigoOperacion, setCodigoOperacion] = useState("");
  const [fechaVisita, setFechaVisita] = useState("");

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

  const manejarCambio = (e) => {
    let valor = e.target.value;
    if (e.target.name === "ruc") valor = valor.replace(/\D/g, "");
    if (e.target.name === "telefonoSolicitante") valor = valor.replace(/\D/g, "");
    setForm({ ...form, [e.target.name]: valor });
    if (e.target.name === "ruc") {
      setRucValidado(false);
      setErrorRuc("");
    }
  };

  const buscarRuc = async () => {
    setErrorRuc("");
    setRucValidado(false);
    if (form.ruc.trim().length !== 11) {
      setErrorRuc("El RUC debe tener 11 dígitos.");
      return;
    }
    try {
      setBuscandoRuc(true);
      const data = await consultarRuc(form.ruc.trim());
      const info = data.data || data.resultado || data;
      setForm((prev) => ({
        ...prev,
        razonSocial: info.razon_social || info.nombre_o_razon_social || "",
        nombreNegocio: info.nombre_comercial || info.razon_social || info.nombre_o_razon_social || "",
        direccion: info.direccion || info.direccion_completa || info.domicilio_fiscal || "",
        giro: info.actividad_economica || info.actividad || info.ciiu || "Actividad no especificada",
        estadoSunat: info.estado || "",
        condicionSunat: info.condicion || "",
      }));
      setRucValidado(true);
    } catch (error) {
      console.error(error);
      setErrorRuc("No se pudo consultar el RUC. Verifica el número.");
    } finally {
      setBuscandoRuc(false);
    }
  };

  const registrarPago = () => {
    const cod = "CAJ-" + Date.now().toString().slice(-8);
    setCodigoOperacion(cod);
    setPagoConfirmado(true);
  };

  const registrarCobroCaja = async (sol) => {
    const cod = "CAJ-" + Date.now().toString().slice(-8);
    try {
      setCargando(true);
      const cambios = {
        estadoPago: "Confirmado",
        estado: "Pagado",
        comprobantePago: `Pago en caja - ${cod}`,
        metodoPago: "Pago en caja",
        montoPagado: MONTO_TRAMITE,
        notificaciones: [
          ...(sol.notificaciones || []),
          {
            fecha: new Date().toLocaleString("es-PE"),
            titulo: "Pago realizado",
            mensaje: `Se registró tu pago presencial por S/${MONTO_TRAMITE.toFixed(2)} con código ${cod}. Trámite pasa a revisión.`,
            leida: false,
          },
        ],
      };

      await actualizarSolicitud(sol.id, cambios);
      const actualizada = { ...sol, ...cambios };
      setSolicitudSeleccionada(actualizada);
      setMostrarComprobante(true);
      await cargarSolicitudes();
    } catch (err) {
      console.error(err);
      alert("Error al registrar pago en caja: " + err.message);
    } finally {
      setCargando(false);
    }
  };

  const programarVisita = () => {
    if (!fechaVisita) {
      alert("Debe seleccionar una fecha para la inspección.");
      return;
    }
    setPaso("confirmacion");
  };

  const registrarSolicitud = async () => {
    try {
      setGuardando(true);
      const nueva = await guardarSolicitud({
        canalRegistro: "presencial",
        uidUsuario: "",
        correoUsuario: "",
        nombreSolicitante: form.nombreSolicitante,
        telefonoSolicitante: form.telefonoSolicitante,
        tipoTramite: form.tipoTramite,
        ruc: form.ruc,
        nombreNegocio: form.nombreNegocio,
        razonSocial: form.razonSocial,
        direccion: form.direccion,
        giro: form.giro,
        estadoSunat: form.estadoSunat,
        condicionSunat: form.condicionSunat,
        metodoPago: "Pago en caja",
        estadoPago: "Confirmado",
        comprobantePago: `Pago en caja - ${codigoOperacion}`,
        montoPagado: MONTO_TRAMITE,
        estado: "Programada para inspeccion",
        fechaVisitaInspector: fechaVisita,
        programadoPor: usuario?.rol || "cajero",
        nombreProgramador: usuario?.nombre || "Cajero",
        inspeccion: "Pendiente",
        notificaciones: [
          {
            fecha: new Date().toLocaleString("es-PE"),
            titulo: "Solicitud registrada",
            mensaje: `Tu solicitud fue registrada de forma presencial. Inspección programada para el ${fechaVisita}.`,
            leida: false,
          },
        ],
      });

      alert(`Solicitud ${nueva.id} registrada correctamente.\nExpediente: ${nueva.id}\nInspección: ${fechaVisita}`);

      setPaso("cola");
      setForm({
        tipoTramite: "Nueva licencia",
        ruc: "",
        nombreNegocio: "",
        razonSocial: "",
        direccion: "",
        giro: "",
        estadoSunat: "",
        condicionSunat: "",
        nombreSolicitante: "",
        telefonoSolicitante: "",
      });
      setRucValidado(false);
      setPagoConfirmado(false);
      setCodigoOperacion("");
      setFechaVisita("");
      await cargarSolicitudes();
    } catch (error) {
      console.error(error);
      alert("Error al registrar la solicitud: " + (error.message || "Error desconocido"));
    } finally {
      setGuardando(false);
    }
  };

  const solicitudesHoy = solicitudes.filter((s) => {
    if (!s.fechaVisitaInspector) return false;
    const hoy = new Date().toLocaleDateString("es-PE");
    return s.fechaVisitaInspector === hoy;
  });

  const solicitudesPendientes = solicitudes.filter(
    (s) => s.estado === "En revision" || s.estado === "Programada para inspeccion" || s.estado === "En revisión" || s.estado === "Inspección programada"
  );

  const solicitudesCerradas = solicitudes.filter(
    (s) => s.estado === "Licencia aprobada" || s.estado === "Licencia rechazada" || s.estado === "Aprobado" || s.estado === "Licencia emitida" || s.estado === "Rechazado"
  );

  const solicitudesPendientesPago = solicitudes.filter((s) => {
    const esPendiente = s.estadoPago === "Pendiente" || s.estadoPago === "Pendiente de pago" || s.estado === "Pendiente de pago";
    const noConfirmado = s.estadoPago !== "Confirmado";
    return esPendiente && noConfirmado;
  });

  const solicitudesFiltradasCajero = solicitudesPendientesPago.filter((s) => {
    if (!busquedaCajero.trim()) return true;
    const q = busquedaCajero.toLowerCase();
    return (
      (s.id || "").toLowerCase().includes(q) ||
      (s.correoUsuario || "").toLowerCase().includes(q) ||
      (s.nombreSolicitante || "").toLowerCase().includes(q) ||
      (s.dni || "").includes(q) ||
      (s.ruc || "").includes(q)
    );
  });

  const solicitudesPagadas = solicitudes.filter(
    (s) => s.estadoPago === "Confirmado" && s.metodoPago === "Pago en caja"
  );

  const badgeClase = (estado = "") => {
    const t = estado.toLowerCase();
    if (t.includes("aprobada")) return "ok";
    if (t.includes("rechazada")) return "danger";
    if (t.includes("inspeccion")) return "info";
    if (t.includes("revision")) return "warning";
    if (t.includes("programada")) return "info";
    return "neutral";
  };

  const hoy = new Date();
  const formatFecha = (f) => {
    if (!f) return "---";
    return f;
  };

  return (
    <div className="panel panel-cajero">
      <div className="inspector-hero" style={{ background: "linear-gradient(135deg, #1f3b57 0%, #b45309 50%, #d97706 100%)" }}>
        <div>
          <span className="eyebrow">Caja municipal</span>
          <h1>Panel Cajero</h1>
          <p>
            Recepciona solicitudes presenciales, valida RUC, cobra el derecho de trámite y programa inspecciones.
          </p>
        </div>

        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <div className="hero-card">
            <span style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Hoy</span>
            <strong style={{ fontSize: "24px" }}>{solicitudesHoy.length}</strong>
            <small>inspecciones programadas</small>
          </div>

          <button type="button" className="btn-outline-light" onClick={cargarSolicitudes}>
            {cargando ? "Actualizando..." : "Actualizar"}
          </button>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <span>Total</span>
          <strong>{solicitudes.length}</strong>
          <small>Solicitudes en el sistema</small>
        </div>
        <div className="stat-card">
          <span>Hoy</span>
          <strong>{solicitudesHoy.length}</strong>
          <small>Inspecciones programadas</small>
        </div>
        <div className="stat-card">
          <span>Pendientes</span>
          <strong>{solicitudesPendientes.length}</strong>
          <small>Esperando inspección</small>
        </div>
        <div className="stat-card">
          <span>Cerradas</span>
          <strong>{solicitudesCerradas.length}</strong>
          <small>Licencias emitidas</small>
        </div>
      </div>

      <div className="tabs-panel">
        <button
          type="button"
          className={paso === "cobrar" ? "tab-active" : ""}
          onClick={() => setPaso("cobrar")}
        >
          Cobros pendientes
        </button>
        <button
          type="button"
          className={paso === "nueva" ? "tab-active" : ""}
          onClick={() => {
            setPaso("nueva");
            setForm({
              tipoTramite: "Nueva licencia",
              ruc: "",
              nombreNegocio: "",
              razonSocial: "",
              direccion: "",
              giro: "",
              estadoSunat: "",
              condicionSunat: "",
              nombreSolicitante: "",
              telefonoSolicitante: "",
            });
            setRucValidado(false);
            setPagoConfirmado(false);
            setCodigoOperacion("");
            setFechaVisita("");
          }}
        >
          Nueva solicitud presencial
        </button>
        <button
          type="button"
          className={paso === "historial" ? "tab-active" : ""}
          onClick={() => setPaso("historial")}
        >
          Historial de pagos
        </button>
        <button
          type="button"
          className={paso === "cola" ? "tab-active" : ""}
          onClick={() => setPaso("cola")}
        >
          Cola de atención
        </button>
      </div>

      {paso === "cobrar" && (
        <section className="section-card">
          <div className="section-header">
            <div>
              <h2>Cobro de Derecho de Trámite</h2>
              <p>Busca expedientes pendientes de pago y registra el abono presencial en caja (S/ 3.00).</p>
            </div>
          </div>

          <div className="admin-filtros" style={{ margin: "0 0 20px" }}>
            <input
              type="text"
              placeholder="Buscar por DNI, Correo, o Número de Expediente..."
              value={busquedaCajero}
              onChange={(e) => setBusquedaCajero(e.target.value)}
              style={{ width: "100%", padding: "14px 20px", borderRadius: "12px", border: "1px solid #cbd5e1" }}
            />
          </div>

          {solicitudesFiltradasCajero.length === 0 ? (
            <div className="empty-state">
              <div style={{ fontSize: "36px", marginBottom: "10px" }}>&#128179;</div>
              <h3>No hay solicitudes pendientes de pago</h3>
              <p>Las solicitudes que seleccionen pago en caja aparecerán aquí.</p>
            </div>
          ) : (
            <div className="tabla-container">
              <table className="modern-table">
                <thead>
                  <tr>
                    <th>Expediente</th>
                    <th>Solicitante</th>
                    <th>Negocio</th>
                    <th>Monto</th>
                    <th>Estado Pago</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {solicitudesFiltradasCajero.map((s) => (
                    <tr key={s.id}>
                      <td><strong>{s.id}</strong><small>{s.fecha}</small></td>
                      <td>
                        <strong>{s.nombreSolicitante || "Sin nombre"}</strong>
                        <small>{s.correoUsuario || "Sin correo"}</small>
                      </td>
                      <td>
                        <strong>{s.nombreNegocio || "Sin negocio"}</strong>
                        <small>RUC: {s.ruc || "N/A"}</small>
                      </td>
                      <td><strong>S/ 3.00</strong></td>
                      <td>
                        <span className="badge warning">Pendiente</span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn-ok btn-sm"
                          onClick={() => registrarCobroCaja(s)}
                          disabled={cargando}
                          style={{ padding: "8px 16px", borderRadius: "8px" }}
                        >
                          Registrar Pago
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {paso === "cola" && (
        <section className="section-card">
          <div className="section-header">
            <div>
              <h2>Cola de atención</h2>
              <p>Solicitudes registradas hoy y pendientes de inspección.</p>
            </div>
          </div>

          {solicitudesHoy.length === 0 && solicitudesPendientes.length === 0 ? (
            <div className="empty-state">
              <div style={{ fontSize: "36px", marginBottom: "10px" }}>&#128203;</div>
              <h3>No hay solicitudes en cola</h3>
              <p>Cuando registres una solicitud presencial, aparecerá aquí.</p>
              <button type="button" className="btn-pago" onClick={() => setPaso("nueva")}>
                Registrar nueva solicitud
              </button>
            </div>
          ) : (
            <>
              {solicitudesHoy.length > 0 && (
                <div style={{ marginBottom: "24px" }}>
                  <h3 style={{ color: "#b45309", marginBottom: "12px" }}>&#128197; Inspecciones programadas para hoy ({solicitudesHoy.length})</h3>
                  {solicitudesHoy.map((s) => (
                    <div key={s.id} className="solicitud-card" style={{ marginBottom: "12px", borderLeft: "4px solid #d97706" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div>
                          <strong>{s.nombreNegocio}</strong>
                          <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: "14px" }}>
                            RUC: {s.ruc} | Expediente: {s.id} | {s.direccion}
                          </p>
                        </div>
                        <span className={`badge ${badgeClase(s.estado)}`}>{s.estado}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {solicitudesPendientes.length > 0 && (
                <div>
                  <h3 style={{ color: "#1f3b57", marginBottom: "12px" }}>&#128203; Solicitudes pendientes ({solicitudesPendientes.length})</h3>
                  <div className="tabla-container">
                    <table className="modern-table">
                      <thead>
                        <tr>
                          <th>Expediente</th>
                          <th>Negocio</th>
                          <th>RUC</th>
                          <th>Fecha inspección</th>
                          <th>Estado</th>
                          <th>Canal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {solicitudesPendientes.map((s) => (
                          <tr key={s.id}>
                            <td><strong>{s.id}</strong></td>
                            <td><strong>{s.nombreNegocio}</strong><small>{s.razonSocial}</small></td>
                            <td>{s.ruc}</td>
                            <td>{s.fechaVisitaInspector || "Sin programar"}</td>
                            <td><span className={`badge ${badgeClase(s.estado)}`}>{s.estado}</span></td>
                            <td>
                              <span className={`badge ${s.canalRegistro === "presencial" ? "info" : "ok"}`}>
                                {s.canalRegistro === "presencial" ? "Presencial" : "Online"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {paso === "nueva" && (
        <section className="section-card">
          <div className="section-header">
            <div>
              <h2>Registrar solicitud presencial</h2>
              <p>Recepciona al ciudadano, valida su RUC, cobra el trámite y programa la inspección.</p>
            </div>
          </div>

          <div className="formulario">
            <div className="form-block">
              <div className="block-title">
                <span>1</span>
                <div>
                  <h3>Datos del solicitante</h3>
                  <p>Nombre y telefono de quien presenta la solicitud.</p>
                </div>
              </div>
              <div className="form-grid">
                <input
                  type="text"
                  name="nombreSolicitante"
                  placeholder="Nombre del solicitante"
                  value={form.nombreSolicitante}
                  onChange={manejarCambio}
                />
                <input
                  type="text"
                  name="telefonoSolicitante"
                  placeholder="Telefono de contacto"
                  value={form.telefonoSolicitante}
                  onChange={manejarCambio}
                  maxLength="9"
                />
              </div>
            </div>

            <div className="form-block">
              <div className="block-title">
                <span>2</span>
                <div>
                  <h3>Tipo de trámite</h3>
                  <p>Selecciona si es licencia nueva o renovación.</p>
                </div>
              </div>
              <select name="tipoTramite" value={form.tipoTramite} onChange={manejarCambio}>
                <option value="Nueva licencia">Nueva licencia</option>
                <option value="Renovacion anual">Renovación anual</option>
              </select>
            </div>

            <div className="form-block">
              <div className="block-title">
                <span>3</span>
                <div>
                  <h3>Validar RUC</h3>
                  <p>Consulta el RUC en SUNAT para obtener los datos automaticamente.</p>
                </div>
              </div>
              <div className="ruc-row">
                <input
                  type="text"
                  name="ruc"
                  placeholder="Ingrese RUC de 11 dígitos"
                  value={form.ruc}
                  onChange={manejarCambio}
                  maxLength="11"
                />
                <button type="button" onClick={buscarRuc} disabled={buscandoRuc}>
                  {buscandoRuc ? "Buscando..." : "Validar RUC"}
                </button>
              </div>
              {errorRuc && <p className="error">{errorRuc}</p>}
              {rucValidado && <p className="success">&#10003; RUC validado correctamente</p>}
            </div>

            {rucValidado && (
              <div className="form-block">
                <div className="block-title">
                  <span>4</span>
                  <div>
                    <h3>Datos del negocio</h3>
                    <p>Verifica que la información obtenida sea correcta.</p>
                  </div>
                </div>
                <div className="form-grid">
                  <input type="text" name="nombreNegocio" placeholder="Nombre del negocio" value={form.nombreNegocio} onChange={manejarCambio} />
                  <input type="text" name="razonSocial" placeholder="Razón social" value={form.razonSocial} onChange={manejarCambio} />
                  <input type="text" name="direccion" placeholder="Dirección del local" value={form.direccion} onChange={manejarCambio} />
                  <input type="text" name="giro" placeholder="Giro comercial" value={form.giro} onChange={manejarCambio} />
                </div>
                <div className="sunat-info" style={{ marginTop: "12px" }}>
                  <span>Estado SUNAT: <strong>{form.estadoSunat || "Pendiente"}</strong></span>
                  <span>Condición: <strong>{form.condicionSunat || "Pendiente"}</strong></span>
                </div>
              </div>
            )}

            {rucValidado && form.nombreNegocio && (
              <div className="form-block">
                <div className="block-title">
                  <span>5</span>
                  <div>
                    <h3>Pago en caja</h3>
                    <p>Cobra el derecho de trámite al ciudadano y confirma el pago.</p>
                  </div>
                </div>
                {!pagoConfirmado ? (
                  <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "16px", padding: "24px", textAlign: "center" }}>
                    <p style={{ fontSize: "14px", color: "#166534", margin: "0 0 8px" }}>Monto a cobrar</p>
                    <p style={{ fontSize: "40px", fontWeight: 800, color: "#166534", margin: "0 0 16px" }}>S/{MONTO_TRAMITE.toFixed(2)}</p>
                    <button type="button" className="btn-pago" onClick={registrarPago} style={{ padding: "14px 32px", fontSize: "16px" }}>
                      Confirmar pago en caja
                    </button>
                  </div>
                ) : (
                  <div style={{ background: "#ecfdf5", border: "1px solid #86efac", borderRadius: "16px", padding: "20px", textAlign: "center" }}>
                    <p style={{ fontSize: "24px", margin: "0 0 8px" }}>&#10003;</p>
                    <p style={{ fontSize: "16px", fontWeight: 700, color: "#166534", margin: "0 0 4px" }}>Pago confirmado</p>
                    <p style={{ fontSize: "14px", color: "#166534", margin: 0 }}>Código de operación: <strong>{codigoOperacion}</strong></p>
                  </div>
                )}
              </div>
            )}

            {pagoConfirmado && (
              <div className="form-block">
                <div className="block-title">
                  <span>6</span>
                  <div>
                    <h3>Programar inspección</h3>
                    <p>Selecciona la fecha para la visita del inspector al local.</p>
                  </div>
                </div>
                <input
                  type="date"
                  value={fechaVisita}
                  onChange={(e) => setFechaVisita(e.target.value)}
                  min={new Date().toISOString().split("T")[0]}
                  style={{ padding: "14px", fontSize: "15px" }}
                />
                {fechaVisita && (
                  <p style={{ color: "#0f766e", fontSize: "14px", marginTop: "8px" }}>
                    &#128197; Inspección programada para: <strong>{fechaVisita}</strong>
                  </p>
                )}
              </div>
            )}

            {pagoConfirmado && fechaVisita && (
              <button
                type="button"
                className="btn-pago btn-full"
                onClick={registrarSolicitud}
                disabled={guardando}
                style={{ padding: "16px", fontSize: "16px", marginTop: "8px" }}
              >
                {guardando ? "Registrando solicitud..." : "Registrar y programar inspección"}
              </button>
            )}
          </div>
        </section>
      )}

      {paso === "historial" && (
        <section className="section-card">
          <div className="section-header">
            <div>
              <h2>Historial de solicitudes</h2>
              <p>Todas las solicitudes registradas en el sistema.</p>
            </div>
          </div>

          {solicitudesPagadas.length === 0 ? (
            <div className="empty-state">
              <div style={{ fontSize: "36px", marginBottom: "10px" }}>&#128202;</div>
              <h3>No hay solicitudes pagadas en caja aún</h3>
              <p>Los comprobantes de pago registrados en caja aparecerán aquí.</p>
            </div>
          ) : (
            <div className="tabla-container">
              <table className="modern-table">
                <thead>
                  <tr>
                    <th>Expediente</th>
                    <th>Negocio</th>
                    <th>RUC</th>
                    <th>Trámite</th>
                    <th>Canal</th>
                    <th>Pago</th>
                    <th>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {solicitudesPagadas.map((s) => (
                    <tr key={s.id}>
                      <td><strong>{s.id}</strong><small>{s.fecha}</small></td>
                      <td><strong>{s.nombreNegocio}</strong><small>{s.razonSocial}</small></td>
                      <td>{s.ruc}</td>
                      <td>{s.tipoTramite || "Nueva licencia"}</td>
                      <td>
                        <span className={`badge ${s.canalRegistro === "presencial" ? "info" : "ok"}`}>
                          {s.canalRegistro === "presencial" ? "Presencial" : "Online"}
                        </span>
                      </td>
                      <td><span className="badge ok">Confirmado</span></td>
                      <td>
                        <button
                          type="button"
                          className="btn-outline btn-sm"
                          onClick={() => {
                            setSolicitudSeleccionada(s);
                            setMostrarComprobante(true);
                          }}
                        >
                          Ver Recibo
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {mostrarComprobante && solicitudSeleccionada && (
        <div className="admin-form-modal" style={{ zIndex: 1000 }}>
          <div className="admin-form-card" style={{ maxWidth: "450px" }}>
            <div className="admin-form-header" style={{ borderBottom: "2px dashed #cbd5e1" }}>
              <div style={{ textAlign: "center", width: "100%" }}>
                <span style={{ fontSize: "28px" }}>🏛️</span>
                <h3 style={{ margin: "4px 0", color: "#1f3b57" }}>Municipalidad de Trujillo</h3>
                <span style={{ fontSize: "11px", color: "#64748b" }}>RUC: 20481265478</span>
              </div>
              <button type="button" onClick={() => setMostrarComprobante(false)} style={{ position: "absolute", right: "20px", top: "20px" }}>✕</button>
            </div>
            <div style={{ padding: "20px 0", fontSize: "14px", color: "#334155" }}>
              <h4 style={{ textAlign: "center", margin: "0 0 16px", color: "#0f766e", letterSpacing: "0.05em" }}>RECIBO DE CAJA MUNICIPAL</h4>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", margin: "0 0 16px" }}>
                <div>
                  <span style={{ fontSize: "12px", color: "#64748b" }}>N° EXPEDIENTE</span>
                  <p style={{ margin: 0, fontWeight: "bold" }}>{solicitudSeleccionada.id}</p>
                </div>
                <div>
                  <span style={{ fontSize: "12px", color: "#64748b" }}>FECHA Y HORA</span>
                  <p style={{ margin: 0, fontWeight: "bold" }}>{solicitudSeleccionada.fecha}</p>
                </div>
                <div>
                  <span style={{ fontSize: "12px", color: "#64748b" }}>CONTRIBUYENTE</span>
                  <p style={{ margin: 0, fontWeight: "bold" }}>{solicitudSeleccionada.nombreSolicitante || "N/A"}</p>
                </div>
                <div>
                  <span style={{ fontSize: "12px", color: "#64748b" }}>RUC / DNI</span>
                  <p style={{ margin: 0, fontWeight: "bold" }}>{solicitudSeleccionada.ruc || solicitudSeleccionada.dni || "N/A"}</p>
                </div>
                <div style={{ gridColumn: "span 2" }}>
                  <span style={{ fontSize: "12px", color: "#64748b" }}>RAZÓN SOCIAL / NEGOCIO</span>
                  <p style={{ margin: 0, fontWeight: "bold" }}>{solicitudSeleccionada.nombreNegocio || solicitudSeleccionada.razonSocial || "N/A"}</p>
                </div>
                <div>
                  <span style={{ fontSize: "12px", color: "#64748b" }}>CONCEPTO</span>
                  <p style={{ margin: 0, fontWeight: "bold" }}>Derecho de Trámite - Licencia</p>
                </div>
                <div>
                  <span style={{ fontSize: "12px", color: "#64748b" }}>CÓD. OPERACIÓN</span>
                  <p style={{ margin: 0, fontWeight: "bold", color: "#b45309" }}>{solicitudSeleccionada.comprobantePago?.split(" - ")[1] || "N/A"}</p>
                </div>
              </div>
              <div style={{ borderTop: "2px dashed #cbd5e1", borderBottom: "2px dashed #cbd5e1", padding: "12px 0", textAlign: "center", margin: "16px 0" }}>
                <span style={{ fontSize: "13px", color: "#64748b", textTransform: "uppercase" }}>Total Pagado</span>
                <p style={{ margin: 0, fontSize: "28px", fontWeight: "800", color: "#166534" }}>S/ {Number(solicitudSeleccionada.montoPagado || 3).toFixed(2)}</p>
              </div>
              <p style={{ fontSize: "11px", color: "#94a3b8", textAlign: "center", margin: 0 }}>Cajero responsable: {solicitudSeleccionada.nombreProgramador || usuario?.nombre || "Cajero Municipal"}</p>
            </div>
            <div className="admin-form-actions" style={{ display: "flex", gap: "10px" }}>
              <button type="button" onClick={() => setMostrarComprobante(false)} style={{ flex: 1 }}>Cerrar</button>
              <button
                type="button"
                className="btn-primary"
                style={{ flex: 1 }}
                onClick={() => {
                  alert("Imprimiendo recibo...\nOperación exitosa.");
                }}
              >
                🖨️ Imprimir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PanelCajero;
