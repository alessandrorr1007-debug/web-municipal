import { useEffect, useState } from "react";
import {
  obtenerSolicitudes,
  actualizarSolicitud,
} from "../services/solicitudService";

function PanelInspector() {
  const [solicitudes, setSolicitudes] = useState([]);
  const [pendientes, setPendientes] = useState([]);
  const [historial, setHistorial] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [formularios, setFormularios] = useState({});

  const cargarSolicitudes = async () => {
    try {
      setCargando(true);
      const data = await obtenerSolicitudes();

      setSolicitudes(data);
      setPendientes(data.filter((s) => s.estado === "En inspección"));

      setHistorial(
        data.filter(
          (s) =>
            s.estado === "Resultado enviado al funcionario" ||
            s.inspeccion === "Aprobada" ||
            s.inspeccion === "Rechazada"
        )
      );
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
      [id]: {
        ...prev[id],
        [campo]: valor,
      },
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
          tamaño: file.size,
          url: reader.result,
        });
      };

      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const validarImagenes = (id, archivos) => {
    const actuales = formularios[id]?.evidencias || [];
    const nuevas = Array.from(archivos);

    if (actuales.length + nuevas.length > 5) {
      alert("Solo puedes subir como máximo 5 fotos de evidencia.");
      return [];
    }

    const archivoNoImagen = nuevas.find(
      (file) => !file.type.startsWith("image/")
    );

    if (archivoNoImagen) {
      alert("Solo se permiten imágenes como evidencia.");
      return [];
    }

    const imagenMuyPesada = nuevas.find((file) => file.size > 5 * 1024 * 1024);

    if (imagenMuyPesada) {
      alert("Cada imagen debe pesar como máximo 5 MB.");
      return [];
    }

    return nuevas;
  };

  const manejarEvidencias = async (id, archivos) => {
    const imagenesValidas = validarImagenes(id, archivos);

    if (imagenesValidas.length === 0) return;

    try {
      const evidenciasConvertidas = await Promise.all(
        imagenesValidas.map((file) => convertirImagenABase64(file))
      );

      const evidenciasActuales = formularios[id]?.evidencias || [];

      actualizarCampo(id, "evidencias", [
        ...evidenciasActuales,
        ...evidenciasConvertidas,
      ]);
    } catch (error) {
      console.error(error);
      alert("No se pudieron cargar las imágenes.");
    }
  };

  const manejarDropImagenes = async (e, id) => {
    e.preventDefault();
    await manejarEvidencias(id, e.dataTransfer.files);
  };

  const quitarEvidencia = (id, index) => {
    const actuales = formularios[id]?.evidencias || [];
    const nuevas = actuales.filter((_, i) => i !== index);
    actualizarCampo(id, "evidencias", nuevas);
  };

  const enviarResultadoInspector = async (solicitud) => {
    const formulario = formularios[solicitud.id] || {};

    if (!formulario.observacion || formulario.observacion.trim() === "") {
      alert("La observación del inspector es obligatoria.");
      return;
    }

    if (!formulario.recomendacion) {
      alert("Debes elegir una recomendación: Aprobar o Rechazar.");
      return;
    }

    if (!formulario.evidencias || formulario.evidencias.length === 0) {
      alert("Debes subir al menos una foto como evidencia.");
      return;
    }

    const inspeccion =
      formulario.recomendacion === "Aprobar" ? "Aprobada" : "Rechazada";

    await actualizarSolicitud(solicitud.id, {
      inspeccion,
      recomendacionInspector: formulario.recomendacion,
      observacionInspector: formulario.observacion.trim(),
      evidenciasInspector: formulario.evidencias,
      fechaInspeccion: formatearFechaHora(),
      resultadoInspeccion:
        formulario.recomendacion === "Aprobar"
          ? "El inspector recomienda aprobar el licenciamiento."
          : "El inspector recomienda rechazar el licenciamiento.",
      estado: "Resultado enviado al funcionario",
    });

    limpiarFormulario(solicitud.id);
    alert("Resultado de inspección enviado al funcionario.");
    await cargarSolicitudes();
  };

  const badgeClase = (estado = "") => {
    const texto = estado.toLowerCase();

    if (texto.includes("aprobada") || texto.includes("aprobar")) return "ok";
    if (texto.includes("rechazada") || texto.includes("rechazar")) return "danger";
    if (texto.includes("observada")) return "warning";
    if (texto.includes("pendiente")) return "neutral";
    return "info";
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
        <a href={solicitud.archivoUrl} target="_blank" rel="noreferrer">
          Ver PDF
        </a>
      );
    }

    return "Sin PDF";
  };

  const inspeccionesAprobadas = historial.filter(
    (s) => s.inspeccion === "Aprobada"
  ).length;

  const inspeccionesRechazadas = historial.filter(
    (s) => s.inspeccion === "Rechazada"
  ).length;

  return (
    <div className="panel panel-inspector">
      <div className="inspector-hero">
        <div>
          <span className="eyebrow">Área de inspección municipal</span>
          <h1>Panel Inspector</h1>
          <p>
            Revisa los documentos del negocio, sube hasta 5 evidencias
            fotográficas y envía tu recomendación al funcionario.
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
          <strong>{solicitudes.length}</strong>
          <small>Solicitudes del sistema</small>
        </div>

        <div className="stat-card">
          <span>Pendientes</span>
          <strong>{pendientes.length}</strong>
          <small>Esperando inspección</small>
        </div>

        <div className="stat-card">
          <span>Realizadas</span>
          <strong>{historial.length}</strong>
          <small>Resultados enviados</small>
        </div>

        <div className="stat-card">
          <span>Aprobadas</span>
          <strong>{inspeccionesAprobadas}</strong>
          <small>Recomendadas para aprobar</small>
        </div>

        <div className="stat-card">
          <span>Rechazadas</span>
          <strong>{inspeccionesRechazadas}</strong>
          <small>Recomendadas para rechazar</small>
        </div>
      </div>

      <section className="section-card">
        <div className="section-header">
          <div>
            <h2>Inspecciones pendientes</h2>
            <p>Solicitudes enviadas por el funcionario para revisión del local.</p>
          </div>
        </div>

        {pendientes.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🔎</div>
            <h3>No hay inspecciones pendientes</h3>
            <p>
              Cuando el funcionario derive una solicitud, aparecerá aquí para su
              revisión.
            </p>
          </div>
        ) : (
          <div className="inspector-grid">
            {pendientes.map((solicitud) => {
              const formulario = formularios[solicitud.id] || {};

              return (
                <article className="inspection-card" key={solicitud.id}>
                  <div className="inspection-card-header">
                    <div>
                      <span className="badge info">{solicitud.id}</span>
                      <h3>{solicitud.nombreNegocio}</h3>
                      <p>{solicitud.razonSocial}</p>
                    </div>

                    <span className="badge warning">Pendiente</span>
                  </div>

                  <div className="inspection-details">
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
                      <strong>Tipo de trámite:</strong>{" "}
                      {solicitud.tipoTramite || "Nueva licencia"}
                    </p>

                    <div>
                      <strong>Documentos del negocio:</strong>
                      {mostrarDocumentos(solicitud)}
                    </div>
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
                        placeholder="Escribe la observación de la inspección..."
                        rows="4"
                      />
                    </label>

                    <div
                      className="drop-zone evidencias-drop"
                      onDrop={(e) => manejarDropImagenes(e, solicitud.id)}
                      onDragOver={(e) => e.preventDefault()}
                    >
                      <div className="empty-icon">🖼️</div>
                      <p>Subir evidencias fotográficas</p>
                      <span>
                        Máximo 5 fotos. Puedes arrastrarlas aquí o seleccionarlas.
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
                          hidden
                        />
                      </label>
                    </div>

                    {formulario.evidencias?.length > 0 && (
                      <div className="evidencias-preview">
                        {formulario.evidencias.map((img, index) => (
                          <div key={index} className="evidencia-item">
                            <img
                              src={img.url}
                              alt={`Evidencia ${index + 1}`}
                            />

                            <small>{img.nombre}</small>

                            <button
                              type="button"
                              className="btn-quitar"
                              onClick={() =>
                                quitarEvidencia(solicitud.id, index)
                              }
                            >
                              Quitar
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <label>
                      Recomendación del inspector *
                      <select
                        value={formulario.recomendacion || ""}
                        onChange={(e) =>
                          actualizarCampo(
                            solicitud.id,
                            "recomendacion",
                            e.target.value
                          )
                        }
                      >
                        <option value="">Seleccionar recomendación</option>
                        <option value="Aprobar">Aprobar</option>
                        <option value="Rechazar">Rechazar</option>
                      </select>
                    </label>
                  </div>

                  <div className="inspection-actions">
                    <button
                      type="button"
                      className="btn-ok"
                      onClick={() => enviarResultadoInspector(solicitud)}
                    >
                      Enviar resultado al funcionario
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="section-card">
        <div className="section-header">
          <div>
            <h2>Historial de inspecciones</h2>
            <p>Resultados registrados por el inspector municipal.</p>
          </div>
        </div>

        {historial.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📋</div>
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
                  <th>Trámite</th>
                  <th>Documentos</th>
                  <th>Recomendación</th>
                  <th>Observación</th>
                  <th>Evidencias</th>
                  <th>Fecha</th>
                  <th>Estado</th>
                </tr>
              </thead>

              <tbody>
                {historial.map((solicitud) => (
                  <tr key={solicitud.id}>
                    <td>
                      <strong>{solicitud.id}</strong>
                      <small>RUC: {solicitud.ruc}</small>
                    </td>

                    <td>
                      <strong>{solicitud.nombreNegocio}</strong>
                      <small>{solicitud.direccion}</small>
                    </td>

                    <td>{solicitud.tipoTramite || "Nueva licencia"}</td>

                    <td>{mostrarDocumentos(solicitud)}</td>

                    <td>
                      <span
                        className={`badge ${badgeClase(
                          solicitud.recomendacionInspector
                        )}`}
                      >
                        {solicitud.recomendacionInspector || "Sin recomendación"}
                      </span>
                    </td>

                    <td>
                      {solicitud.observacionInspector || "Sin observación"}
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

                    <td>{solicitud.fechaInspeccion || "Sin fecha"}</td>

                    <td>
                      <span
                        className={`badge ${badgeClase(
                          solicitud.recomendacionInspector ||
                            solicitud.inspeccion
                        )}`}
                      >
                        {solicitud.inspeccion || "Enviado"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export default PanelInspector;