import { useEffect, useState } from "react";
import {
  obtenerSolicitudes,
  actualizarSolicitud,
} from "../services/solicitudService";
import { abrirPdf } from "../services/pdfService";

function PanelInspector({ seccion }) {
  const [solicitudes, setSolicitudes] = useState([]);
  const [hoy, setHoy] = useState([]);
  const [historial, setHistorial] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [enviandoId, setEnviandoId] = useState("");
  const [formularios, setFormularios] = useState({});
  const [paso, setPaso] = useState("hoy");

  const obtenerFechaHoy = () => {
    return new Date().toLocaleDateString("es-PE");
  };

  const esInspeccionHoy = (s) => {
    if (!s.fechaVisitaInspector) return false;
    return s.fechaVisitaInspector === obtenerFechaHoy();
  };

  const esPendienteHoy = (s) => {
    const estado = (s.estado || "").toLowerCase();
    const fechaCorrecta = esInspeccionHoy(s);
    const noProcesada =
      s.estado !== "Resultado enviado al funcionario" &&
      s.inspeccion !== "Aprobada" &&
      s.inspeccion !== "Rechazada" &&
      s.inspeccion !== "Reobservada";
    const esPendiente =
      estado.includes("inspeccion") ||
      estado.includes("programada") ||
      (s.inspeccion || "").toLowerCase().includes("pendiente");
    return fechaCorrecta && noProcesada && esPendiente;
  };

  const esHistorial = (s) => {
    return (
      s.estado === "Resultado enviado al funcionario" ||
      s.inspeccion === "Aprobada" ||
      s.inspeccion === "Rechazada" ||
      s.inspeccion === "Reobservada"
    );
  };

  const cargarSolicitudes = async () => {
    try {
      setCargando(true);
      const data = await obtenerSolicitudes();
      setSolicitudes(data);
      setHoy(data.filter(esPendienteHoy));
      setHistorial(data.filter(esHistorial));
    } catch (error) {
      console.error(error);
      alert("No se pudieron cargar las inspecciones.");
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

  const actualizarCampo = (id, campo, valor) => {
    setFormularios((prev) => ({
      ...prev,
      [id]: { ...prev[id], [campo]: valor },
    }));
  };

  const limpiarFormulario = (id) => {
    setFormularios((prev) => {
      const copia = { ...prev };
      delete copia[id];
      return copia;
    });
  };

  const convertirImagenABase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        resolve({
          nombre: file.name,
          tipo: file.type,
          tamano: file.size,
          url: reader.result,
        });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const validarImagenes = (id, archivos) => {
    const actuales = formularios[id]?.evidencias || [];
    const nuevas = Array.from(archivos || []);
    if (nuevas.length === 0) return [];
    if (actuales.length + nuevas.length > 2) {
      alert("Solo puedes subir como máximo 2 fotos de evidencia.");
      return [];
    }
    if (nuevas.find((f) => !f.type.startsWith("image/"))) {
      alert("Solo se permiten imágenes como evidencia.");
      return [];
    }
    if (nuevas.find((f) => f.size > 500 * 1024)) {
      alert("Cada imagen debe pesar como máximo 500 KB.");
      return [];
    }
    return nuevas;
  };

  const manejarEvidencias = async (id, archivos) => {
    const validas = validarImagenes(id, archivos);
    if (validas.length === 0) return;
    try {
      const convertidas = await Promise.all(validas.map(convertirImagenABase64));
      const actuales = formularios[id]?.evidencias || [];
      actualizarCampo(id, "evidencias", [...actuales, ...convertidas]);
    } catch {
      alert("No se pudieron cargar las imágenes.");
    }
  };

  const quitarEvidencia = (id, index) => {
    const actuales = formularios[id]?.evidencias || [];
    actualizarCampo(id, "evidencias", actuales.filter((_, i) => i !== index));
  };

  const enviarResultado = async (solicitud) => {
    const formulario = formularios[solicitud.id] || {};
    const observacion = (formulario.observacion || "").trim();
    const resultado = formulario.resultado || "";
    const evidencias = formulario.evidencias || [];

    if (enviandoId) return;
    if (!observacion) {
      alert("La observación del inspector es obligatoria.");
      return;
    }
    if (!resultado) {
      alert("Debes elegir un resultado: Aprobado, Observado o No atendido.");
      return;
    }
    if (evidencias.length === 0) {
      alert("Debes subir al menos una foto como evidencia.");
      return;
    }

    const esReobservacion = (solicitud.cantidadReobservaciones || 0) >= 1;

    try {
      setEnviandoId(solicitud.id);

      if (resultado === "Aprobado") {
        await actualizarSolicitud(solicitud.id, {
          inspeccion: "Aprobada",
          recomendacionInspector: "Aprobar",
          observacionInspector: observacion,
          evidenciasInspector: evidencias,
          fechaInspeccion: formatearFechaHora(),
          resultadoInspeccion: "El inspector aprueba las condiciones del local.",
          estado: "Inspección realizada",
          notificaciones: [
            ...(solicitud.notificaciones || []),
            {
              fecha: formatearFechaHora(),
              titulo: "Inspección aprobada",
              mensaje: `El inspector aprobó tu local. Pendiente de decisión final del funcionario.`,
              leida: false,
            },
          ],
        });
        alert("Resultado de aprobación enviado.");
      } else if (resultado === "Observado") {
        if (esReobservacion) {
          await actualizarSolicitud(solicitud.id, {
            inspeccion: "Rechazada",
            recomendacionInspector: "Rechazar",
            observacionInspector: observacion,
            evidenciasInspector: evidencias,
            fechaInspeccion: formatearFechaHora(),
            resultadoInspeccion: "El inspector rechaza de forma definitiva tras múltiples observaciones.",
            estado: "Rechazado",
            notificaciones: [
              ...(solicitud.notificaciones || []),
              {
                fecha: formatearFechaHora(),
                titulo: "Trámite rechazado",
                mensaje: `Tu solicitud fue rechazada definitivamente tras la segunda inspección fallida.`,
                leida: false,
              },
            ],
          });
          alert("Solicitud rechazada definitivamente por segunda reobservación.");
        } else {
          const nuevaCantidad = 1;
          const fechaReprogramacion = new Date();
          fechaReprogramacion.setDate(fechaReprogramacion.getDate() + 30);
          const nuevaFecha = fechaReprogramacion.toLocaleDateString("es-PE");

          await actualizarSolicitud(solicitud.id, {
            inspeccion: "Reobservada",
            recomendacionInspector: "Reobservar",
            observacionInspector: observacion,
            evidenciasInspector: evidencias,
            fechaInspeccion: formatearFechaHora(),
            resultadoInspeccion: "El inspector observa el local. Se reprograma visita en 30 días.",
            estado: "Reprogramado",
            fechaVisitaInspector: nuevaFecha,
            cantidadReobservaciones: nuevaCantidad,
            historialReobservaciones: [
              ...(solicitud.historialReobservaciones || []),
              {
                fecha: formatearFechaHora(),
                observacion,
                recomendacion: "Reobservar",
                evidencias: evidencias.length,
              },
            ],
            notificaciones: [
              ...(solicitud.notificaciones || []),
              {
                fecha: formatearFechaHora(),
                titulo: "Inspección observada",
                mensaje: `El inspector observó tu local. Se programó una nueva inspección para el ${nuevaFecha}.`,
                leida: false,
              },
            ],
          });
          alert(`Solicitud observada. Nueva inspección programada para: ${nuevaFecha}`);
        }
      } else if (resultado === "No atendido") {
        const fechaReprogramacion = new Date();
        fechaReprogramacion.setDate(fechaReprogramacion.getDate() + 7);
        const nuevaFecha = fechaReprogramacion.toLocaleDateString("es-PE");

        await actualizarSolicitud(solicitud.id, {
          inspeccion: "Pendiente",
          recomendacionInspector: "Reprogramar",
          observacionInspector: observacion,
          evidenciasInspector: evidencias,
          fechaInspeccion: formatearFechaHora(),
          resultadoInspeccion: "Visita no atendida. Se reprograma en 7 días.",
          estado: "Reprogramado",
          fechaVisitaInspector: nuevaFecha,
          notificaciones: [
            ...(solicitud.notificaciones || []),
            {
              fecha: formatearFechaHora(),
              titulo: "Inspección no atendida",
              mensaje: `El local no se encontraba disponible o no atendieron al inspector. Se reprogramó para el ${nuevaFecha}.`,
              leida: false,
            },
          ],
        });
        alert(`Visita no atendida. Se reprogramó para: ${nuevaFecha}`);
      }

      limpiarFormulario(solicitud.id);
      await cargarSolicitudes();
    } catch (error) {
      console.error(error);
      alert(error.message || "No se pudo enviar el resultado.");
    } finally {
      setEnviandoId("");
    }
  };

  const badgeClase = (estado = "") => {
    const t = estado.toLowerCase();
    if (t.includes("aprobada") || t.includes("aprobar")) return "ok";
    if (t.includes("rechazada") || t.includes("rechazar")) return "danger";
    if (t.includes("reobserva")) return "warning";
    if (t.includes("pendiente")) return "neutral";
    return "info";
  };

  const mostrarDocumentos = (s) => {
    if (s.archivosPdf?.length > 0) {
      return (
        <div className="documentos-lista">
          {s.archivosPdf.map((pdf, i) => (
            <a key={i} href={pdf.archivoUrl} onClick={(e) => { e.preventDefault(); abrirPdf(pdf.archivoUrl); }} target="_blank" rel="noreferrer">
              PDF {i + 1}
            </a>
          ))}
        </div>
      );
    }
    if (s.archivoUrl) {
      return <a href={s.archivoUrl} onClick={(e) => { e.preventDefault(); abrirPdf(s.archivoUrl); }} target="_blank" rel="noreferrer">Ver PDF</a>;
    }
    return "Sin PDF";
  };

  return (
    <div className="panel panel-inspector">
      <div className="inspector-hero">
        <div>
          <span className="eyebrow">Area de inspeccion municipal</span>
          <h1>Panel Inspector</h1>
          <p>
            Revisa las inspecciones programadas para HOY, sube evidencias y envía tu recomendación al funcionario.
          </p>
        </div>

        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <div className="hero-card">
            <span style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Hoy</span>
            <strong style={{ fontSize: "28px" }}>{hoy.length}</strong>
            <small>inspecciones</small>
          </div>

          <button type="button" className="btn-outline-light" onClick={cargarSolicitudes} disabled={cargando || !!enviandoId}>
            {cargando ? "Actualizando..." : "Actualizar"}
          </button>
        </div>
      </div>

      {hoy.length > 0 && (
        <div
          style={{
            margin: "20px 34px 0",
            padding: "16px 20px",
            borderRadius: "14px",
            background: "linear-gradient(135deg, #fef3c7, #fde68a)",
            border: "1px solid #f59e0b",
            display: "flex",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <span style={{ fontSize: "24px" }}>&#128276;</span>
          <div>
            <strong style={{ color: "#92400e", fontSize: "15px" }}>
              Tienes {hoy.length} inspeccion{hoy.length > 1 ? "es" : ""} programada{hoy.length > 1 ? "s" : ""} para hoy
            </strong>
            <p style={{ margin: "2px 0 0", color: "#a16207", fontSize: "13px" }}>
              Revisa cada expediente, sube evidencias y envía tu recomendación.
            </p>
          </div>
        </div>
      )}

      <div className="stats-grid">
        <div className="stat-card">
          <span>Hoy</span>
          <strong>{hoy.length}</strong>
          <small>Inspecciones programadas</small>
        </div>
        <div className="stat-card">
          <span>Historial</span>
          <strong>{historial.length}</strong>
          <small>Resultados enviados</small>
        </div>
        <div className="stat-card">
          <span>Total</span>
          <strong>{solicitudes.length}</strong>
          <small>Solicitudes del sistema</small>
        </div>
      </div>

      <div className="tabs-panel">
        <button type="button" className={paso === "hoy" ? "tab-active" : ""} onClick={() => setPaso("hoy")}>
          Mis inspecciones de hoy
        </button>
        <button type="button" className={paso === "historial" ? "tab-active" : ""} onClick={() => setPaso("historial")}>
          Historial
        </button>
      </div>

      {paso === "hoy" && (
        <section className="section-card">
          <div className="section-header">
            <div>
              <h2>Inspecciones del día</h2>
              <p>Solo se muestran las inspecciones programadas para hoy ({obtenerFechaHoy()}).</p>
            </div>
          </div>

          {hoy.length === 0 ? (
            <div className="empty-state">
              <div style={{ fontSize: "36px", marginBottom: "10px" }}>&#128269;</div>
              <h3>No tienes inspecciones programadas para hoy</h3>
              <p>Las inspecciones programadas por el cajero o funcionario apareceran aqui el dia que les toque.</p>
            </div>
          ) : (
            <div className="inspector-grid">
              {hoy.map((solicitud) => {
                const formulario = formularios[solicitud.id] || {};
                const estaEnviando = enviandoId === solicitud.id;
                const esReobservacion = (solicitud.cantidadReobservaciones || 0) >= 1;

                return (
                  <article className="inspection-card" key={solicitud.id}>
                    <div className="inspection-card-header">
                      <div>
                        <span className="badge info">{solicitud.id}</span>
                        <h3>{solicitud.nombreNegocio}</h3>
                        <p>{solicitud.razonSocial}</p>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        {esReobservacion && (
                          <span className="badge warning" style={{ marginBottom: "4px" }}>
                            2da oportunidad ({solicitud.cantidadReobservaciones} reobservacion{solicitud.cantidadReobservaciones > 1 ? "es" : ""})
                          </span>
                        )}
                        <span className={`badge ${solicitud.canalRegistro === "presencial" ? "info" : "ok"}`}>
                          {solicitud.canalRegistro === "presencial" ? "Presencial" : "Online"}
                        </span>
                      </div>
                    </div>

                    <div className="inspection-details">
                      <p><strong>Responsable:</strong> {solicitud.nombreSolicitante || "N/A"}</p>
                      <p><strong>Teléfono:</strong> {solicitud.telefonoSolicitante || "N/A"}</p>
                      <p><strong>Fecha visita:</strong> {solicitud.fechaVisitaInspector || "N/A"}</p>
                      <p><strong>Hora visita:</strong> {solicitud.horaVisitaInspector || "Sin hora"}</p>
                      <p><strong>RUC:</strong> {solicitud.ruc}</p>
                      <p><strong>Dirección:</strong> {solicitud.direccion}</p>
                      <p><strong>Giro:</strong> {solicitud.giro}</p>
                      <p><strong>Tipo:</strong> {solicitud.tipoTramite || "Nueva licencia"}</p>
                      <p><strong>Programado por:</strong> {solicitud.nombreProgramador || "Sistema"}</p>
                      <div>
                        <strong>Documentos:</strong>
                        {mostrarDocumentos(solicitud)}
                      </div>

                      {esReobservacion && solicitud.historialReobservaciones?.length > 0 && (
                        <div style={{ marginTop: "8px", padding: "10px", background: "#fef3c7", borderRadius: "10px", border: "1px solid #fde68a" }}>
                          <strong style={{ color: "#92400e", fontSize: "13px" }}>Observaciones anteriores:</strong>
                          {solicitud.historialReobservaciones.map((obs, i) => (
                            <p key={i} style={{ margin: "4px 0 0", fontSize: "13px", color: "#a16207" }}>
                              {obs.fecha}: {obs.observacion}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="inspection-form">
                      <label>
                        Observacion del inspector *
                        <textarea
                          value={formulario.observacion || ""}
                          onChange={(e) => actualizarCampo(solicitud.id, "observacion", e.target.value)}
                          placeholder="Describe las condiciones del local, cumplimiento de normativas..."
                          rows="4"
                          disabled={estaEnviando}
                        />
                      </label>

                      <div
                        className="drop-zone"
                        onDrop={(e) => {
                          e.preventDefault();
                          manejarEvidencias(solicitud.id, e.dataTransfer.files);
                        }}
                        onDragOver={(e) => e.preventDefault()}
                      >
                        <div style={{ fontSize: "28px", marginBottom: "6px" }}>&#128444;</div>
                        <p>Evidencias fotográficas</p>
                        <span>Máximo 2 fotos de 500 KB. Arrastra o selecciona.</span>
                        <label className="file-label">
                          Elegir fotos
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={(e) => manejarEvidencias(solicitud.id, e.target.files)}
                            disabled={estaEnviando}
                            hidden
                          />
                        </label>
                      </div>

                      {formulario.evidencias?.length > 0 && (
                        <div className="evidencias-preview">
                          {formulario.evidencias.map((img, i) => (
                            <div key={i} className="evidencia-item">
                              <img src={img.url} alt={`Evidencia ${i + 1}`} />
                              <small>{img.nombre}</small>
                              <button
                                type="button"
                                className="btn-quitar"
                                onClick={() => quitarEvidencia(solicitud.id, i)}
                                disabled={estaEnviando}
                              >
                                Quitar
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      <label>
                        Resultado *
                        <select
                          value={formulario.resultado || ""}
                          onChange={(e) => actualizarCampo(solicitud.id, "resultado", e.target.value)}
                          disabled={estaEnviando}
                        >
                           <option value="">Seleccionar resultado</option>
                          <option value="Aprobado">Aprobado</option>
                          <option value="Observado">Observado{esReobservacion ? " (RECHAZO DEFINITIVO)" : ""}</option>
                          <option value="No atendido">No atendido</option>
                        </select>
                      </label>
                    </div>

                    {esReobservacion && (
                      <div style={{ padding: "10px", background: "#fee2e2", borderRadius: "10px", border: "1px solid #fca5a5", marginBottom: "12px" }}>
                        <p style={{ margin: 0, fontSize: "13px", color: "#991b1b", fontWeight: "bold" }}>
                          ⚠️ Esta es la 2da oportunidad. Si marcas "Observado" nuevamente, la solicitud será rechazada de forma automática y definitiva.
                        </p>
                      </div>
                    )}

                    <div className="inspection-actions">
                      <button
                        type="button"
                        className="btn-ok"
                        onClick={() => enviarResultado(solicitud)}
                        disabled={estaEnviando}
                      >
                        {estaEnviando ? "Enviando..." : "Enviar resultado"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {paso === "historial" && (
        <section className="section-card">
          <div className="section-header">
            <div>
              <h2>Historial de inspecciones</h2>
              <p>Resultados que has registrado como inspector.</p>
            </div>
          </div>

          {historial.length === 0 ? (
            <div className="empty-state">
              <div style={{ fontSize: "36px", marginBottom: "10px" }}>&#128203;</div>
              <h3>Aún no hay inspecciones realizadas</h3>
              <p>Cuando envíes una recomendación, aparecerá aquí.</p>
            </div>
          ) : (
            <div className="tabla-container">
              <table className="modern-table">
                <thead>
                  <tr>
                    <th>Expediente</th>
                    <th>Negocio</th>
                    <th>Tramite</th>
                    <th>Recomendacion</th>
                    <th>Observacion</th>
                    <th>Evidencias</th>
                    <th>Fecha</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {historial.map((s) => (
                    <tr key={s.id}>
                      <td><strong>{s.id}</strong><small>RUC: {s.ruc}</small></td>
                      <td><strong>{s.nombreNegocio}</strong><small>{s.direccion}</small></td>
                      <td>{s.tipoTramite || "Nueva licencia"}</td>
                      <td><span className={`badge ${badgeClase(s.recomendacionInspector)}`}>{s.recomendacionInspector || "Sin recomendación"}</span></td>
                      <td>{s.observacionInspector || "Sin observacion"}</td>
                      <td>
                        {s.evidenciasInspector?.length > 0 ? (
                          <div className="evidencias-tabla">
                            {s.evidenciasInspector.map((img, i) => (
                              <a key={i} href={img.url} target="_blank" rel="noreferrer">Foto {i + 1}</a>
                            ))}
                          </div>
                        ) : "Sin evidencias"}
                      </td>
                      <td>{s.fechaInspeccion || "Sin fecha"}</td>
                      <td><span className={`badge ${badgeClase(s.inspeccion)}`}>{s.inspeccion || "Enviado"}</span></td>
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

export default PanelInspector;
