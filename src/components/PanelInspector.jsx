import { useEffect, useState, useMemo } from "react";
import {
  obtenerSolicitudes,
  actualizarSolicitud,
} from "../services/solicitudService";
import { crearNotificacion } from "../services/notificacionService";
import { abrirPdf } from "../services/pdfService";
import { useAuth } from "../context/AuthContext";
import { formatearFechaLocal, calcularFecha30DiasMas } from "../config/inspeccionConfig";

function PanelInspector({ seccion }) {
  const { usuario } = useAuth();
  const [solicitudes, setSolicitudes] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [enviandoId, setEnviandoId] = useState("");
  const [formularios, setFormularios] = useState({});
  const [paso, setPaso] = useState("hoy");
  const [detalleSolicitud, setDetalleSolicitud] = useState(null);

  const obtenerFechaHoy = () => formatearFechaLocal(new Date());

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
    cargarSolicitudes();
  }, []);

  const fechaHoy = obtenerFechaHoy();

  const pendientesHoy = useMemo(() => {
    return solicitudes.filter((s) => {
      if (s.fechaVisitaInspector !== fechaHoy) return false;
      const insp = (s.inspeccion || "").toLowerCase();
      const estado = (s.estado || "").toLowerCase();
      if (insp === "aprobada" || insp === "rechazada" || insp === "reobservada") return false;
      if (estado === "aprobado" || estado === "rechazado" || estado === "resultado enviado al funcionario") return false;
      return true;
    });
  }, [solicitudes, fechaHoy]);

  const realizadasHoy = useMemo(() => {
    return solicitudes.filter((s) => {
      if (s.fechaVisitaInspector !== fechaHoy) return false;
      const insp = (s.inspeccion || "").toLowerCase();
      return (
        insp === "aprobada" ||
        insp === "rechazada" ||
        insp === "reobservada" ||
        s.fechaInspeccion
      );
    });
  }, [solicitudes, fechaHoy]);

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
      alert("Debes elegir un resultado: Aprobado u Observado.");
      return;
    }
    if (evidencias.length === 0) {
      alert("Debes subir al menos una foto como evidencia.");
      return;
    }

    const esReobservacion = (solicitud.cantidadReobservaciones || 0) >= 1;

    try {
      setEnviandoId(solicitud.id);

      if (resultado === "Aprobado" || resultado === "Cumple todos los requisitos") {
        await actualizarSolicitud(solicitud.id, {
          inspeccion: "Aprobada",
          estadoInspeccion: "Realizada",
          recomendacionInspector: "Aprobar",
          observacionInspector: observacion,
          evidenciasInspector: evidencias,
          fechaInspeccion: formatearFechaHora(),
          resultadoInspeccion: "Cumple todos los requisitos.",
          estado: "Resultado enviado al funcionario",
          estadoNormalizado: "REVISION_FUNCIONARIO",
          inspectorNombre: usuario?.nombre || "Inspector",
          inspectorUid: usuario?.uid || "",
          historialInspecciones: [
            ...(solicitud.historialInspecciones || []),
            {
              fechaRealizacion: formatearFechaHora(),
              fechaVisita: solicitud.fechaVisitaInspector,
              horaVisita: solicitud.horaVisitaInspector || solicitud.horaVisitaLabel,
              resultado: "Cumple todos los requisitos",
              observacion,
              evidenciasCount: evidencias.length,
              inspector: usuario?.nombre || "Inspector",
              estadoInspeccion: "Realizada",
            },
          ],
        });

        await crearNotificacion(
          solicitud.uidUsuario,
          {
            titulo: "Inspección aprobada",
            descripcion: `El inspector aprobó las condiciones de su local (EXP-${solicitud.id}). Pendiente de decisión final del funcionario.`,
            icono: "✅",
          },
          solicitud.correoUsuario
        );

        alert("Resultado de aprobación enviado al funcionario.");
      } else {
        const fechaOriginalStr = solicitud.fechaVisitaInspector || formatearFechaLocal(new Date());
        const nuevaFecha = calcularFecha30DiasMas(fechaOriginalStr);
        const mismaHoraVal = solicitud.horaVisitaInspector || "10:00";
        const mismaHoraLabel = solicitud.horaVisitaLabel || "10:00 AM - 12:00 PM";

        await actualizarSolicitud(solicitud.id, {
          inspeccion: "Reprogramada",
          estadoInspeccion: "Reprogramada",
          recomendacionInspector: "Reobservar",
          observacionInspector: observacion,
          evidenciasInspector: evidencias,
          fechaInspeccion: formatearFechaHora(),
          resultadoInspeccion: resultado,
          estado: "No aprobada por inspección",
          estadoNormalizado: "INSPECCION_REPROGRAMADA",
          fechaVisitaInspector: nuevaFecha,
          horaVisitaInspector: mismaHoraVal,
          horaVisitaLabel: mismaHoraLabel,
          inspectorNombre: usuario?.nombre || "Inspector",
          inspectorUid: usuario?.uid || "",
          historialInspecciones: [
            ...(solicitud.historialInspecciones || []),
            {
              fechaRealizacion: formatearFechaHora(),
              fechaOriginal: fechaOriginalStr,
              horaOriginal: mismaHoraVal,
              resultado,
              observacion,
              evidenciasCount: evidencias.length,
              nuevaFechaReprogramada: nuevaFecha,
              inspector: usuario?.nombre || "Inspector",
              estadoInspeccion: "Realizada",
            },
          ],
        });

        await crearNotificacion(
          solicitud.uidUsuario,
          {
            titulo: "Inspección no aprobada - Reprogramada a 30 días",
            descripcion: `La inspección del local EXP-${solicitud.id} resultó en "${resultado}". Se ha reprogramado automáticamente para el ${nuevaFecha} a las ${mismaHoraLabel} con el mismo inspector.`,
            icono: "📅",
          },
          solicitud.correoUsuario
        );

        alert(`Resultado enviado. Reprogramación automática registrada para el ${nuevaFecha} a las ${mismaHoraLabel}.`);
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
    if (t.includes("aprobada") || t.includes("aprobar") || t.includes("aprobado")) return "ok";
    if (t.includes("rechazada") || t.includes("rechazar") || t.includes("rechazado")) return "danger";
    if (t.includes("reobserva") || t.includes("observada") || t.includes("observado")) return "warning";
    if (t.includes("pendiente")) return "neutral";
    return "info";
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
                abrirPdf(pdf.archivoUrl || pdf.url || pdf);
              }}
            >
              PDF {i + 1}
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
        >
          Ver PDF
        </a>
      );
    }
    return "Sin PDF";
  };

  return (
    <div className="panel panel-inspector">
      <div className="inspector-hero">
        <div>
          <span className="eyebrow">Área de inspección municipal</span>
          <h1>Panel Inspector</h1>
          <p>
            Revisa las inspecciones programadas para HOY, sube evidencias y envía
            tu recomendación al funcionario.
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
              Hoy
            </span>
            <strong style={{ fontSize: "28px" }}>{pendientesHoy.length}</strong>
            <small>pendientes</small>
          </div>

          <button
            type="button"
            className="btn-outline-light"
            onClick={cargarSolicitudes}
            disabled={cargando || !!enviandoId}
          >
            {cargando ? "Actualizando..." : "Actualizar"}
          </button>
        </div>
      </div>

      {pendientesHoy.length > 0 && (
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
              Tienes {pendientesHoy.length} inspeccion
              {pendientesHoy.length > 1 ? "es" : ""} pendiente
              {pendientesHoy.length > 1 ? "s" : ""} para hoy
            </strong>
            <p
              style={{
                margin: "2px 0 0",
                color: "#a16207",
                fontSize: "13px",
              }}
            >
              Revisa cada expediente, sube evidencias y envía tu recomendación.
            </p>
          </div>
        </div>
      )}

      <div className="stats-grid">
        <div className="stat-card">
          <span>Pendientes hoy</span>
          <strong>{pendientesHoy.length}</strong>
          <small>Por inspeccionar</small>
        </div>
        <div className="stat-card">
          <span>Realizadas hoy</span>
          <strong>{realizadasHoy.length}</strong>
          <small>Resultados enviados</small>
        </div>
        <div className="stat-card">
          <span>Total solicitudes</span>
          <strong>{solicitudes.length}</strong>
          <small>En el sistema</small>
        </div>
      </div>

      <div className="tabs-panel">
        <button
          type="button"
          className={paso === "hoy" ? "tab-active" : ""}
          onClick={() => setPaso("hoy")}
        >
          Pendientes de hoy ({pendientesHoy.length})
        </button>
        <button
          type="button"
          className={paso === "realizadas" ? "tab-active" : ""}
          onClick={() => setPaso("realizadas")}
        >
          Realizadas hoy ({realizadasHoy.length})
        </button>
      </div>

      {paso === "hoy" && (
        <section className="section-card">
          <div className="section-header">
            <div>
              <h2>Inspecciones pendientes</h2>
              <p>
                Solo se muestran las inspecciones programadas para hoy (
                {fechaHoy}).
              </p>
            </div>
          </div>

          {pendientesHoy.length === 0 ? (
            <div className="empty-state">
              <div style={{ fontSize: "36px", marginBottom: "10px" }}>&#128269;</div>
              <h3>No tienes inspecciones pendientes para hoy</h3>
              <p>
                Las inspecciones programadas por el funcionario aparecerán aquí
                el día que les toque.
              </p>
            </div>
          ) : (
            <div className="inspector-grid">
              {pendientesHoy.map((solicitud) => {
                const formulario = formularios[solicitud.id] || {};
                const estaEnviando = enviandoId === solicitud.id;
                const esReobservacion =
                  (solicitud.cantidadReobservaciones || 0) >= 1;

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
                          <span
                            className="badge warning"
                            style={{ marginBottom: "4px" }}
                          >
                            2da oportunidad (
                            {solicitud.cantidadReobservaciones} reobservación
                            {solicitud.cantidadReobservaciones > 1 ? "es" : ""})
                          </span>
                        )}
                        <span
                          className={`badge ${
                            solicitud.canalRegistro === "presencial"
                              ? "info"
                              : "ok"
                          }`}
                        >
                          {solicitud.canalRegistro === "presencial"
                            ? "Presencial"
                            : "Online"}
                        </span>
                      </div>
                    </div>

                    <div className="inspection-details">
                      <p>
                        <strong>Responsable:</strong>{" "}
                        {solicitud.nombreSolicitante || "N/A"}
                      </p>
                      <p>
                        <strong>RUC:</strong> {solicitud.ruc}
                      </p>
                      <p>
                        <strong>Dirección:</strong> {solicitud.direccion}
                      </p>
                      <p>
                        <strong>Giro:</strong> {solicitud.giro}
                      </p>
                      <p>
                        <strong>Tipo:</strong>{" "}
                        {solicitud.tipoTramite || "Nueva licencia"}
                      </p>
                      <p>
                        <strong>Hora visita:</strong>{" "}
                        {solicitud.horaVisitaLabel ||
                          solicitud.horaVisitaInspector ||
                          "Sin hora definida"}
                      </p>
                      <p>
                        <strong>Programado por:</strong>{" "}
                        {solicitud.nombreProgramador || "Sistema"}
                      </p>
                      <div>
                        <strong>Documentos:</strong>
                        {mostrarDocumentos(solicitud)}
                      </div>

                      {esReobservacion &&
                        solicitud.historialReobservaciones?.length > 0 && (
                          <div
                            style={{
                              marginTop: "8px",
                              padding: "10px",
                              background: "#fef3c7",
                              borderRadius: "10px",
                              border: "1px solid #fde68a",
                            }}
                          >
                            <strong
                              style={{ color: "#92400e", fontSize: "13px" }}
                            >
                              Observaciones anteriores:
                            </strong>
                            {solicitud.historialReobservaciones.map((obs, i) => (
                              <p
                                key={i}
                                style={{
                                  margin: "4px 0 0",
                                  fontSize: "13px",
                                  color: "#a16207",
                                }}
                              >
                                {obs.fecha}: {obs.observacion}
                                {obs.inspector && ` (${obs.inspector})`}
                              </p>
                            ))}
                          </div>
                        )}
                    </div>

                    <div className="inspection-form">
                      <label>
                        Observación del inspector *
                        <textarea
                          value={formulario.observacion || ""}
                          onChange={(e) =>
                            actualizarCampo(
                              solicitud.id,
                              "observacion",
                              e.target.value
                            )
                          }
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
                        <div
                          style={{
                            fontSize: "28px",
                            marginBottom: "6px",
                          }}
                        >
                          &#128444;
                        </div>
                        <p>Evidencias fotográficas</p>
                        <span>
                          Máximo 2 fotos de 500 KB. Arrastra o selecciona.
                        </span>
                        <label className="file-label">
                          Elegir fotos
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={(e) =>
                              manejarEvidencias(solicitud.id, e.target.files)
                            }
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
                                onClick={() =>
                                  quitarEvidencia(solicitud.id, i)
                                }
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
                          onChange={(e) =>
                            actualizarCampo(
                              solicitud.id,
                              "resultado",
                              e.target.value
                            )
                          }
                          disabled={estaEnviando}
                        >
                          <option value="">-- Seleccionar resultado --</option>
                          <option value="Cumple todos los requisitos">Cumple todos los requisitos (Aprobar)</option>
                          <option value="Cumple parcialmente">Cumple parcialmente (Observar)</option>
                          <option value="No cumple requisitos">No cumple requisitos (No aprobada)</option>
                          <option value="Inspección incompleta">Inspección incompleta</option>
                        </select>
                      </label>
                    </div>

                    {esReobservacion && (
                      <div
                        style={{
                          padding: "10px",
                          background: "#fee2e2",
                          borderRadius: "10px",
                          border: "1px solid #fca5a5",
                          marginBottom: "12px",
                        }}
                      >
                        <p
                          style={{
                            margin: 0,
                            fontSize: "13px",
                            color: "#991b1b",
                            fontWeight: "bold",
                          }}
                        >
                          Esta es la 2da oportunidad. Si marcas "Observado"
                          nuevamente, la solicitud será rechazada de forma
                          automática y definitiva.
                        </p>
                      </div>
                    )}

                    <div className="inspection-actions">
                      <button
                        type="button"
                        className="btn-info"
                        onClick={() => setDetalleSolicitud(solicitud)}
                      >
                        Ver detalle
                      </button>
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

      {paso === "realizadas" && (
        <section className="section-card">
          <div className="section-header">
            <div>
              <h2>Inspecciones realizadas hoy</h2>
              <p>Resultados que has registrado como inspector hoy.</p>
            </div>
          </div>

          {realizadasHoy.length === 0 ? (
            <div className="empty-state">
              <div style={{ fontSize: "36px", marginBottom: "10px" }}>&#128203;</div>
              <h3>Aún no has registrado inspecciones hoy</h3>
              <p>Cuando envíes un resultado, aparecerá aquí.</p>
            </div>
          ) : (
            <div className="tabla-container">
              <table className="modern-table">
                <thead>
                  <tr>
                    <th>Expediente</th>
                    <th>Negocio</th>
                    <th>Recomendación</th>
                    <th>Observación</th>
                    <th>Evidencias</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {realizadasHoy.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <strong>{s.id}</strong>
                        <small>RUC: {s.ruc}</small>
                      </td>
                      <td>
                        <strong>{s.nombreNegocio}</strong>
                        <small>{s.direccion}</small>
                      </td>
                      <td>
                        <span
                          className={`badge ${badgeClase(
                            s.recomendacionInspector
                          )}`}
                        >
                          {s.recomendacionInspector || "Sin recomendación"}
                        </span>
                      </td>
                      <td style={{ maxWidth: "200px" }}>
                        {s.observacionInspector || "Sin observación"}
                      </td>
                      <td>
                        {s.evidenciasInspector?.length > 0 ? (
                          <div className="evidencias-tabla">
                            {s.evidenciasInspector.map((img, i) => (
                              <span key={i} className="badge info">
                                Foto {i + 1}
                              </span>
                            ))}
                          </div>
                        ) : (
                          "Sin evidencias"
                        )}
                      </td>
                      <td>
                        <span
                          className={`badge ${badgeClase(s.inspeccion)}`}
                        >
                          {s.inspeccion || "Enviado"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {detalleSolicitud && (
        <div className="admin-form-modal" style={{ zIndex: 1000 }}>
          <div
            className="admin-form-card"
            style={{ maxWidth: "600px", maxHeight: "85vh", overflowY: "auto" }}
          >
            <div className="admin-form-header">
              <h3>Detalle Expediente {detalleSolicitud.id}</h3>
              <button
                type="button"
                onClick={() => setDetalleSolicitud(null)}
              >
                ✕
              </button>
            </div>
            <div style={{ padding: "16px 0" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "16px",
                }}
              >
                <div>
                  <h4
                    style={{ margin: "0 0 6px", color: "#1f3b57", fontSize: "14px" }}
                  >
                    Establecimiento
                  </h4>
                  <p style={{ margin: "2px 0", fontSize: "13px" }}>
                    <strong>Nombre:</strong>{" "}
                    {detalleSolicitud.nombreNegocio || "---"}
                  </p>
                  <p style={{ margin: "2px 0", fontSize: "13px" }}>
                    <strong>RUC:</strong> {detalleSolicitud.ruc || "---"}
                  </p>
                  <p style={{ margin: "2px 0", fontSize: "13px" }}>
                    <strong>Dirección:</strong>{" "}
                    {detalleSolicitud.direccion || "---"}
                  </p>
                  <p style={{ margin: "2px 0", fontSize: "13px" }}>
                    <strong>Giro:</strong> {detalleSolicitud.giro || "---"}
                  </p>
                </div>
                <div>
                  <h4
                    style={{ margin: "0 0 6px", color: "#1f3b57", fontSize: "14px" }}
                  >
                    Solicitante
                  </h4>
                  <p style={{ margin: "2px 0", fontSize: "13px" }}>
                    <strong>Nombre:</strong>{" "}
                    {detalleSolicitud.nombreSolicitante || "---"}
                  </p>
                  <p style={{ margin: "2px 0", fontSize: "13px" }}>
                    <strong>Teléfono:</strong>{" "}
                    {detalleSolicitud.telefonoSolicitante ||
                      detalleSolicitud.telefono ||
                      "---"}
                  </p>
                  <p style={{ margin: "2px 0", fontSize: "13px" }}>
                    <strong>Tipo trámite:</strong>{" "}
                    {detalleSolicitud.tipoTramite || "Nueva licencia"}
                  </p>
                  <p style={{ margin: "2px 0", fontSize: "13px" }}>
                    <strong>Canal:</strong>{" "}
                    {detalleSolicitud.canalRegistro === "presencial"
                      ? "Presencial"
                      : "Online"}
                  </p>
                </div>
              </div>

              <div style={{ marginTop: "12px" }}>
                <h4
                  style={{ margin: "0 0 6px", color: "#1f3b57", fontSize: "14px" }}
                >
                  Documentos
                </h4>
                {mostrarDocumentos(detalleSolicitud)}
              </div>

              <div style={{ marginTop: "12px" }}>
                <h4
                  style={{ margin: "0 0 6px", color: "#1f3b57", fontSize: "14px" }}
                >
                  Programación
                </h4>
                <p style={{ margin: "2px 0", fontSize: "13px" }}>
                  <strong>Fecha visita:</strong>{" "}
                  {detalleSolicitud.fechaVisitaInspector || "---"}
                </p>
                <p style={{ margin: "2px 0", fontSize: "13px" }}>
                  <strong>Hora visita:</strong>{" "}
                  {detalleSolicitud.horaVisitaLabel ||
                    detalleSolicitud.horaVisitaInspector ||
                    "---"}
                </p>
                <p style={{ margin: "2px 0", fontSize: "13px" }}>
                  <strong>Programado por:</strong>{" "}
                  {detalleSolicitud.nombreProgramador || "Sistema"}
                </p>
              </div>
            </div>
            <div className="admin-form-actions">
              <button
                type="button"
                onClick={() => setDetalleSolicitud(null)}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PanelInspector;
