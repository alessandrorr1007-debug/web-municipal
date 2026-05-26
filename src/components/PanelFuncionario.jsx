import { useEffect, useState } from "react";
import {
  obtenerSolicitudes,
  actualizarSolicitud,
} from "../../services/solicitudService";
import TablaSolicitudes from "./TablaSolicitudes";

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
    const fecha = solicitud.fechaExpiracionLicencia || solicitud.fechaVencimiento;

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

        <TablaSolicitudes
          solicitudes={solicitudes}
          cargarSolicitudes={cargarSolicitudes}
          observacionesRechazo={observacionesRechazo}
          cambiarObservacionRechazo={cambiarObservacionRechazo}
          derivarInspector={derivarInspector}
          aprobarLicencia={aprobarLicencia}
          rechazarLicencia={rechazarLicencia}
          puedeAprobar={puedeAprobar}
          solicitudCerrada={solicitudCerrada}
          licenciaVencida={licenciaVencida}
        />
      </section>
    </div>
  );
}

export default PanelFuncionario;