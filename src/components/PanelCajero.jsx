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

  const [paso, setPaso] = useState("cola");
  const [solicitudes, setSolicitudes] = useState([]);
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
      setErrorRuc("El RUC debe tener 11 digitos.");
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
      setErrorRuc("No se pudo consultar el RUC. Verifica el numero.");
    } finally {
      setBuscandoRuc(false);
    }
  };

  const registrarPago = () => {
    const cod = "CAJ-" + Date.now().toString().slice(-8);
    setCodigoOperacion(cod);
    setPagoConfirmado(true);
  };

  const programarVisita = () => {
    if (!fechaVisita) {
      alert("Debe seleccionar una fecha para la inspeccion.");
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
            mensaje: `Tu solicitud fue registrada de forma presencial. Inspeccion programada para el ${fechaVisita}.`,
            leida: false,
          },
        ],
      });

      alert(`Solicitud ${nueva.id} registrada correctamente.\nExpediente: ${nueva.id}\nInspeccion: ${fechaVisita}`);

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
    (s) => s.estado === "En revision" || s.estado === "Programada para inspeccion"
  );

  const solicitudesCerradas = solicitudes.filter(
    (s) => s.estado === "Licencia aprobada" || s.estado === "Licencia rechazada"
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
            Recepciona solicitudes presenciales, valida RUC, cobra el derecho de tramite y programa inspecciones.
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
          <small>Esperando inspeccion</small>
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
          className={paso === "cola" ? "tab-active" : ""}
          onClick={() => setPaso("cola")}
        >
          Cola de atencion
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
          Historial
        </button>
      </div>

      {paso === "cola" && (
        <section className="section-card">
          <div className="section-header">
            <div>
              <h2>Cola de atencion</h2>
              <p>Solicitudes registradas hoy y pendientes de inspeccion.</p>
            </div>
          </div>

          {solicitudesHoy.length === 0 && solicitudesPendientes.length === 0 ? (
            <div className="empty-state">
              <div style={{ fontSize: "36px", marginBottom: "10px" }}>&#128203;</div>
              <h3>No hay solicitudes en cola</h3>
              <p>Cuando registres una solicitud presencial, aparecera aqui.</p>
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
                          <th>Fecha inspeccion</th>
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
              <p>Recepciona al ciudadano, valida su RUC, cobra el tramite y programa la inspeccion.</p>
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
                  <h3>Tipo de tramite</h3>
                  <p>Selecciona si es licencia nueva o renovacion.</p>
                </div>
              </div>
              <select name="tipoTramite" value={form.tipoTramite} onChange={manejarCambio}>
                <option value="Nueva licencia">Nueva licencia</option>
                <option value="Renovacion anual">Renovacion anual</option>
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
                  placeholder="Ingrese RUC de 11 digitos"
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
                    <p>Verifica que la informacion obtenida sea correcta.</p>
                  </div>
                </div>
                <div className="form-grid">
                  <input type="text" name="nombreNegocio" placeholder="Nombre del negocio" value={form.nombreNegocio} onChange={manejarCambio} />
                  <input type="text" name="razonSocial" placeholder="Razon social" value={form.razonSocial} onChange={manejarCambio} />
                  <input type="text" name="direccion" placeholder="Direccion del local" value={form.direccion} onChange={manejarCambio} />
                  <input type="text" name="giro" placeholder="Giro comercial" value={form.giro} onChange={manejarCambio} />
                </div>
                <div className="sunat-info" style={{ marginTop: "12px" }}>
                  <span>Estado SUNAT: <strong>{form.estadoSunat || "Pendiente"}</strong></span>
                  <span>Condicion: <strong>{form.condicionSunat || "Pendiente"}</strong></span>
                </div>
              </div>
            )}

            {rucValidado && form.nombreNegocio && (
              <div className="form-block">
                <div className="block-title">
                  <span>5</span>
                  <div>
                    <h3>Pago en caja</h3>
                    <p>Cobra el derecho de tramite al ciudadano y confirma el pago.</p>
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
                    <p style={{ fontSize: "14px", color: "#166534", margin: 0 }}>Codigo de operacion: <strong>{codigoOperacion}</strong></p>
                  </div>
                )}
              </div>
            )}

            {pagoConfirmado && (
              <div className="form-block">
                <div className="block-title">
                  <span>6</span>
                  <div>
                    <h3>Programar inspeccion</h3>
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
                    &#128197; Inspeccion programada para: <strong>{fechaVisita}</strong>
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
                {guardando ? "Registrando solicitud..." : "Registrar y programar inspeccion"}
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

          {solicitudes.length === 0 ? (
            <div className="empty-state">
              <div style={{ fontSize: "36px", marginBottom: "10px" }}>&#128202;</div>
              <h3>No hay solicitudes aun</h3>
              <p>Las solicitudes registradas apareceran aqui.</p>
            </div>
          ) : (
            <div className="tabla-container">
              <table className="modern-table">
                <thead>
                  <tr>
                    <th>Expediente</th>
                    <th>Negocio</th>
                    <th>RUC</th>
                    <th>Tramite</th>
                    <th>Canal</th>
                    <th>Pago</th>
                    <th>Fecha inspeccion</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {solicitudes.map((s) => (
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
                      <td><span className={`badge ${s.estadoPago === "Confirmado" ? "ok" : "warning"}`}>{s.estadoPago || "Pendiente"}</span></td>
                      <td>{s.fechaVisitaInspector || "---"}</td>
                      <td><span className={`badge ${badgeClase(s.estado)}`}>{s.estado}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

export default PanelCajero;
