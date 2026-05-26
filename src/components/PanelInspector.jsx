import { useEffect, useState } from "react";
import {
  obtenerSolicitudes,
  actualizarSolicitud,
} from "../../services/solicitudService";
import SolicitudInspeccionCard from "./SolicitudInspeccionCard";
import HistorialInspecciones from "./HistorialInspecciones";

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

  const mostrarDocumentos = (solicitud) => {
    if (solicitud.archivosPdf?.length > 0) {
      return (
        <div className="documentos-lista">
          {solicitud.archivosPdf.map((pdf, index) => (
            <a key={index} href={pdf.archivoUrl} target="_blank" rel="noreferrer">
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

  const badgeClase = (estado = "") => {
    const texto = estado.toLowerCase();

    if (texto.includes("aprobada") || texto.includes("aprobar")) return "ok";
    if (texto.includes("rechazada") || texto.includes("rechazar")) return "danger";
    if (texto.includes("observada")) return "warning";
    if (texto.includes("pendiente")) return "neutral";
    return "info";
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
            {pendientes.map((solicitud) => (
              <SolicitudInspeccionCard
                key={solicitud.id}
                solicitud={solicitud}
                formulario={formularios[solicitud.id] || {}}
                actualizarCampo={actualizarCampo}
                enviarResultadoInspector={enviarResultadoInspector}
                mostrarDocumentos={mostrarDocumentos}
              />
            ))}
          </div>
        )}
      </section>

      <HistorialInspecciones
        historial={historial}
        mostrarDocumentos={mostrarDocumentos}
        badgeClase={badgeClase}
      />
    </div>
  );
}

export default PanelInspector;