import { useEffect, useState } from "react";
import {
  obtenerSolicitudes,
  actualizarSolicitud,
} from "../services/solicitudService";

function PanelFuncionario() {
  const [solicitudes, setSolicitudes] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [observacionesRechazo, setObservacionesRechazo] = useState({});

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
    return fecha.toLocaleDateString("es-PE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const formatearFechaHora = (fecha) => {
    return fecha.toLocaleString("es-PE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const derivarInspector = async (id) => {
    await actualizarSolicitud(id, {
      inspeccion: "Pendiente",
      estado: "En inspección",
    });

    await cargarSolicitudes();
  };

  const aprobarLicencia = async (solicitud) => {
    const fechaActual = new Date();

    const fechaVencimiento = new Date(fechaActual);
    fechaVencimiento.setFullYear(fechaVencimiento.getFullYear() + 1);

    const fechaAprobacion = formatearFecha(fechaActual);
    const fechaDecisionFuncionario = formatearFechaHora(fechaActual);
    const fechaExpiracionLicencia = formatearFecha(fechaVencimiento);

    const esRenovacion =
      solicitud.tipoTramite === "Renovación anual" ||
      solicitud.tipoTramite === "Renovacion anual";

    const numeroLicencia =
      esRenovacion && solicitud.numeroLicencia
        ? solicitud.numeroLicencia
        : `LIC-${Date.now().toString().slice(-8)}`;

    await actualizarSolicitud(solicitud.id, {
      estado: "Licencia aprobada",
      decisionFuncionario: "Aprobada",
      observacionFuncionario: "",
      numeroLicencia,
      fechaAprobacion,
      fechaDecisionFuncionario,

      fechaExpiracionLicencia,
      fechaVencimiento: fechaExpiracionLicencia,

      licenciaVigente: true,
      licenciaRenovada: esRenovacion,
      fechaRenovacion: esRenovacion ? fechaAprobacion : "",
      resultadoFinal: "Licencia aprobada",
    });

    await cargarSolicitudes();
  };

  const rechazarLicencia = async (id) => {
    const observacion = observacionesRechazo[id] || "";

    if (observacion.trim() === "") {
      alert("Debes escribir el motivo del rechazo.");
      return;
    }

    await actualizarSolicitud(id, {
      estado: "Licencia rechazada",
      decisionFuncionario: "Rechazada",
      observacionFuncionario: observacion,
      fechaDecisionFuncionario: formatearFechaHora(new Date()),
      resultadoFinal: "Licencia rechazada",
    });

    await cargarSolicitudes();
  };

  const cambiarObservacionRechazo = (id, valor) => {
    setObservacionesRechazo((prev) => ({
      ...prev,
      [id]: valor,
    }));
  };

  const puedeAprobar = (solicitud) =>
    solicitud.estado === "Resultado enviado al funcionario" &&
    (solicitud.recomendacionInspector === "Aprobar" ||
      solicitud.recomendacionInspector === "Rechazar");

  const solicitudCerrada = (solicitud) =>
    solicitud.estado === "Licencia aprobada" ||
    solicitud.estado === "Licencia rechazada";

  const licenciaVencida = (solicitud) => {
    const fecha =
      solicitud.fechaExpiracionLicencia || solicitud.fechaVencimiento;

    if (!fecha) return false;

    const partes = fecha.split("/");

    if (partes.length !== 3) return false;

    const fechaVencimiento = new Date(
      Number(partes[2]),
      Number(partes[1]) - 1,
      Number(partes[0])
    );

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    return fechaVencimiento < hoy;
  };

  const mostrarDocumentos = (solicitud) => {
    if (solicitud.archivosPdf?.length > 0) {
      return (
        <div className="documentos-lista">
          {solicitud.archivosPdf.map((pdf, index) => (
            <a
              key={index}
              href={pdf.archivoUrl}
              target="_blank"
              rel="noreferrer"
            >
              PDF {index + 1}
            </a>
          ))}
        </div>
      );
    }

    if (solicitud.archivoUrl) {
      return (
        <a
          className="file-pill"
          href={solicitud.archivoUrl}
          target="_blank"
          rel="noreferrer"
        >
          Ver PDF
        </a>
      );
    }

    return <span className="file-pill">Sin PDF</span>;
  };

  const total = solicitudes.length;

  const pendientes = solicitudes.filter(
    (s) => s.estado === "Enviada" || s.estado === "En revisión"
  ).length;

  const enInspeccion = solicitudes.filter(
    (s) => s.estado === "En inspección"
  ).length;

  const esperandoDecision = solicitudes.filter(
    (s) => s.estado === "Resultado enviado al funcionario"
  ).length;

  const aprobadas = solicitudes.filter(
    (s) => s.estado === "Licencia aprobada"
  ).length;

  const rechazadas = solicitudes.filter(
    (s) => s.estado === "Licencia rechazada"
  ).length;

  const vencidas = solicitudes.filter((s) => licenciaVencida(s)).length;

  const badgeClase = (estado = "") => {
    const texto = estado.toLowerCase();

    if (texto.includes("aprobada")) return "ok";
    if (texto.includes("rechazada")) return "danger";
    if (texto.includes("observada")) return "warning";
    if (texto.includes("inspección")) return "info";
    if (texto.includes("resultado")) return "warning";
    if (texto.includes("revisión")) return "neutral";
    return "neutral";
  };

  return (
    <div className="panel panel-funcionario">
      <div className="funcionario-hero">
        <div>
          <span className="eyebrow">Mesa de partes municipal</span>
          <h1>Panel Funcionario</h1>
          <p>
            Revisa documentos, comprobante de pago, evidencias del inspector y
            emite la decisión final de la licencia.
          </p>
        </div>

        <button
          type="button"
          className="btn-outline-light"
          onClick={cargarSolicitudes}
        >
          {cargando ? "Actualizando..." : "Actualizar"}
        </button>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <span>Total</span>
          <strong>{total}</strong>
          <small>Solicitudes registradas</small>
        </div>

        <div className="stat-card">
          <span>Pendientes</span>
          <strong>{pendientes}</strong>
          <small>Esperando revisión documental</small>
        </div>

        <div className="stat-card">
          <span>En inspección</span>
          <strong>{enInspeccion}</strong>
          <small>Derivadas al inspector</small>
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

        <div className="stat-card">
          <span>Vencidas</span>
          <strong>{vencidas}</strong>
          <small>Licencias fuera de vigencia</small>
        </div>
      </div>

      <section className="section-card">
        <div className="section-header">
          <div>
            <h2>Solicitudes recibidas</h2>
            <p>Gestiona los expedientes enviados por los negocios.</p>
          </div>
        </div>

        {solicitudes.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📂</div>
            <h3>No existen solicitudes registradas</h3>
            <p>
              Cuando un negocio envíe una solicitud, aparecerá en esta sección.
            </p>
            <button type="button" onClick={cargarSolicitudes}>
              Actualizar solicitudes
            </button>
          </div>
        ) : (
          <div className="tabla-container">
            <table className="modern-table funcionario-table">
              <thead>
                <tr>
                  <th>Expediente</th>
                  <th>Negocio</th>
                  <th>Trámite</th>
                  <th>Documentos</th>
                  <th>Pago</th>
                  <th>Estado</th>
                  <th>Inspección</th>
                  <th>Obs. inspector</th>
                  <th>Obs. funcionario</th>
                  <th>Evidencias</th>
                  <th>Licencia</th>
                  <th>Acciones</th>
                </tr>
              </thead>

              <tbody>
                {solicitudes.map((solicitud) => {
                  const estaVencida = licenciaVencida(solicitud);

                  return (
                    <tr key={solicitud.id}>
                      <td>
                        <strong>{solicitud.id}</strong>
                        <small>RUC: {solicitud.ruc}</small>
                      </td>

                      <td>
                        <strong>{solicitud.nombreNegocio}</strong>
                        <small>{solicitud.razonSocial}</small>
                      </td>

                      <td>{solicitud.tipoTramite || "Nueva licencia"}</td>

                      <td>{mostrarDocumentos(solicitud)}</td>

                      <td>
                        <span
                          className={`badge ${
                            solicitud.estadoPago === "Confirmado"
                              ? "ok"
                              : "warning"
                          }`}
                        >
                          {solicitud.estadoPago || "Pendiente"}
                        </span>
                        <small>
                          {solicitud.comprobantePago ||
                            solicitud.metodoPago ||
                            "Sin comprobante"}
                        </small>
                      </td>

                      <td>
                        {estaVencida ? (
                          <span className="badge danger">Licencia vencida</span>
                        ) : (
                          <span
                            className={`badge ${badgeClase(solicitud.estado)}`}
                          >
                            {solicitud.estado}
                          </span>
                        )}
                      </td>

                      <td>
                        <strong>
                          {solicitud.recomendacionInspector ||
                            "Sin recomendación"}
                        </strong>
                        <small>
                          {solicitud.resultadoInspeccion || "Sin resultado"}
                        </small>
                      </td>

                      <td>
                        {solicitud.observacionInspector || "Sin observación"}
                      </td>

                      <td>
                        {solicitud.observacionFuncionario ||
                          "Sin observación del funcionario"}
                      </td>

                      <td>
                        {solicitud.evidenciasInspector?.length > 0 ? (
                          <div className="evidencias-tabla">
                            {solicitud.evidenciasInspector.map((img, index) => (
                              <a
                                key={index}
                                href={img.url}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Foto {index + 1}
                              </a>
                            ))}
                          </div>
                        ) : (
                          "Sin evidencias"
                        )}
                      </td>

                      <td>
                        {solicitud.numeroLicencia ? (
                          <>
                            <strong>{solicitud.numeroLicencia}</strong>

                            <small>
                              Emisión:{" "}
                              {solicitud.fechaAprobacion || "Sin fecha"}
                            </small>

                            <small>
                              Vence:{" "}
                              {solicitud.fechaExpiracionLicencia ||
                                solicitud.fechaVencimiento ||
                                "Sin vencimiento"}
                            </small>

                            {solicitud.licenciaRenovada && (
                              <small>Renovación anual aprobada</small>
                            )}

                            {estaVencida && (
                              <span className="badge danger">
                                Licencia vencida
                              </span>
                            )}
                          </>
                        ) : (
                          "No generada"
                        )}
                      </td>

                      <td>
                        <div className="action-stack">
                          <button
                            type="button"
                            onClick={() => derivarInspector(solicitud.id)}
                            disabled={
                              solicitud.estado === "En inspección" ||
                              solicitud.estado ===
                                "Resultado enviado al funcionario" ||
                              solicitudCerrada(solicitud)
                            }
                          >
                            Enviar a inspector
                          </button>

                          <button
                            type="button"
                            className="btn-ok"
                            onClick={() => aprobarLicencia(solicitud)}
                            disabled={!puedeAprobar(solicitud)}
                          >
                            Aprobar licencia
                          </button>

                          {!solicitudCerrada(solicitud) && (
                            <textarea
                              placeholder="Motivo del rechazo..."
                              value={observacionesRechazo[solicitud.id] || ""}
                              onChange={(e) =>
                                cambiarObservacionRechazo(
                                  solicitud.id,
                                  e.target.value
                                )
                              }
                              rows="3"
                            />
                          )}

                          <button
                            type="button"
                            className="btn-danger"
                            onClick={() => rechazarLicencia(solicitud.id)}
                            disabled={solicitudCerrada(solicitud)}
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
    </div>
  );
}

export default PanelFuncionario;