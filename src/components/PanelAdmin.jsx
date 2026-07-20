import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { obtenerSolicitudes } from "../services/solicitudService";
import { obtenerUsuariosInternos } from "../services/adminService";
import { obtenerAuditoria } from "../services/auditService";
import GestionUsuarios from "./GestionUsuarios";
import GestionRoles from "./GestionRoles";
import Auditoria from "./Auditoria";
import ConfigSistema from "./ConfigSistema";
import Reportes from "./Reportes";

function PanelAdmin({ seccion }) {
  const { usuario } = useAuth();
  const [solicitudes, setSolicitudes] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [auditCount, setAuditCount] = useState(0);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    cargar();
  }, []);

  const cargar = async () => {
    setCargando(true);
    try {
      const [sol, usr, aud] = await Promise.all([
        obtenerSolicitudes(),
        obtenerUsuariosInternos(),
        obtenerAuditoria(500),
      ]);
      setSolicitudes(sol);
      setUsuarios(usr);
      setAuditCount(aud.length);
    } catch (err) {
      console.error(err);
    } finally {
      setCargando(false);
    }
  };

  const hoy = new Date().toLocaleDateString("es-PE");

  const stats = {
    totalUsuarios: usuarios.length,
    cajeros: usuarios.filter((u) => u.rol === "cajero").length,
    funcionarios: usuarios.filter((u) => u.rol === "funcionario").length,
    inspectores: usuarios.filter((u) => u.rol === "inspector").length,
    totalSolicitudes: solicitudes.length,
    pendientes: solicitudes.filter((s) => ["En revision", "En revisión", "Pago pendiente", "Pendiente de pago", "Pendiente de revisión"].includes(s.estado)).length,
    inspeccionProgramada: solicitudes.filter((s) => ["Inspección programada", "Inspeccion programada", "En inspeccion", "Reprogramado", "Pendiente de inspección"].includes(s.estado)).length,
    aprobadas: solicitudes.filter((s) => ["Licencia emitida", "Aprobado", "Licencia aprobada"].includes(s.estado)).length,
    rechazadas: solicitudes.filter((s) => ["Rechazado", "Licencia rechazada", "Documentos rechazados", "No aprobada por inspección"].includes(s.estado)).length,
    observadas: solicitudes.filter((s) => ["Observado", "Reprogramado"].includes(s.estado) || (s.cantidadReobservaciones || 0) > 0).length,
    pagosConfirmados: solicitudes.filter((s) => s.estadoPago === "Confirmado" || s.estado === "Pagado").length,
    inspeccionesHoy: solicitudes.filter((s) => s.fechaVisitaInspector === hoy).length,
    licenciasVencidas: solicitudes.filter((s) => {
      if (!["Licencia emitida", "Aprobado", "Licencia aprobada"].includes(s.estado) || !s.fechaExpiracionLicencia) return false;
      return new Date(s.fechaExpiracionLicencia) < new Date();
    }).length,
    usuariosActivos: usuarios.filter((u) => u.estado === "activo" || u.activo !== false).length,
    usuariosDesactivados: usuarios.filter((u) => u.estado === "desactivado" || u.activo === false).length,
  };

  if (seccion === "gestion-usuarios") {
    return <GestionUsuarios usuarios={usuarios} solicitudes={solicitudes} onRecargar={cargar} />;
  }

  if (seccion === "gestion-roles") {
    return <GestionRoles onRecargar={cargar} />;
  }

  if (seccion === "auditoria") {
    return <Auditoria />;
  }

  if (seccion === "config-sistema") {
    return <ConfigSistema />;
  }

  if (seccion === "reportes") {
    return <Reportes />;
  }

  return (
    <div>
      <div className="admin-hero">
        <div>
          <span className="eyebrow" style={{ background: "rgba(255,255,255,0.15)", color: "white" }}>Panel de administración</span>
          <h1>Bienvenido, {usuario.nombre}</h1>
          <p>Control total del sistema municipal de licencias.</p>
        </div>
        <div className="hero-card" style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)" }}>
          <span style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#93c5fd" }}>Sistema</span>
          <strong style={{ fontSize: "28px", color: "white" }}>{stats.totalSolicitudes}</strong>
          <small style={{ color: "#93c5fd" }}>Solicitudes totales</small>
        </div>
      </div>

      {cargando ? (
        <div style={{ textAlign: "center", padding: "60px", color: "#94a3b8" }}>Cargando datos...</div>
      ) : (
        <>
          <div className="admin-stats-grid">
            <div className="admin-stat-card" style={{ borderLeftColor: "#2563eb" }}>
              <div className="admin-stat-icon" style={{ background: "#eff6ff", color: "#2563eb" }}>&#128101;</div>
              <div>
                <strong>{stats.totalUsuarios}</strong>
                <span>Usuarios internos</span>
              </div>
            </div>
            <div className="admin-stat-card" style={{ borderLeftColor: "#0f766e" }}>
              <div className="admin-stat-icon" style={{ background: "#f0fdfa", color: "#0f766e" }}>&#128188;</div>
              <div>
                <strong>{stats.totalSolicitudes}</strong>
                <span>Solicitudes</span>
              </div>
            </div>
            <div className="admin-stat-card" style={{ borderLeftColor: "#d97706" }}>
              <div className="admin-stat-icon" style={{ background: "#fef3c7", color: "#d97706" }}>&#9203;</div>
              <div>
                <strong>{stats.pendientes}</strong>
                <span>Pendientes</span>
              </div>
            </div>
            <div className="admin-stat-card" style={{ borderLeftColor: "#16a34a" }}>
              <div className="admin-stat-icon" style={{ background: "#f0fdf4", color: "#16a34a" }}>&#9989;</div>
              <div>
                <strong>{stats.aprobadas}</strong>
                <span>Licencias activas</span>
              </div>
            </div>
            <div className="admin-stat-card" style={{ borderLeftColor: "#dc2626" }}>
              <div className="admin-stat-icon" style={{ background: "#fef2f2", color: "#dc2626" }}>&#128308;</div>
              <div>
                <strong>{stats.rechazadas}</strong>
                <span>Rechazadas</span>
              </div>
            </div>
            <div className="admin-stat-card" style={{ borderLeftColor: "#7c3aed" }}>
              <div className="admin-stat-icon" style={{ background: "#f5f3ff", color: "#7c3aed" }}>&#128308;</div>
              <div>
                <strong>{stats.licenciasVencidas}</strong>
                <span>Vencidas</span>
              </div>
            </div>
            <div className="admin-stat-card" style={{ borderLeftColor: "#0f766e" }}>
              <div className="admin-stat-icon" style={{ background: "#ecfdf5", color: "#0f766e" }}>&#128176;</div>
              <div>
                <strong>{stats.pagosConfirmados}</strong>
                <span>Pagos realizados</span>
              </div>
            </div>
            <div className="admin-stat-card" style={{ borderLeftColor: "#2563eb" }}>
              <div className="admin-stat-icon" style={{ background: "#eff6ff", color: "#2563eb" }}>&#128269;</div>
              <div>
                <strong>{stats.inspeccionesHoy}</strong>
                <span>Inspecciones hoy</span>
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginTop: "24px" }}>
            <div className="admin-panel-card">
              <h3>Usuarios por rol</h3>
              <div className="admin-bar-chart">
                <div className="admin-bar-row">
                  <span>Cajeros</span>
                  <div className="admin-bar-track"><div className="admin-bar-fill" style={{ width: `${stats.totalUsuarios ? (stats.cajeros / stats.totalUsuarios * 100) : 0}%`, background: "#d97706" }} /></div>
                  <strong>{stats.cajeros}</strong>
                </div>
                <div className="admin-bar-row">
                  <span>Funcionarios</span>
                  <div className="admin-bar-track"><div className="admin-bar-fill" style={{ width: `${stats.totalUsuarios ? (stats.funcionarios / stats.totalUsuarios * 100) : 0}%`, background: "#0f766e" }} /></div>
                  <strong>{stats.funcionarios}</strong>
                </div>
                <div className="admin-bar-row">
                  <span>Inspectores</span>
                  <div className="admin-bar-track"><div className="admin-bar-fill" style={{ width: `${stats.totalUsuarios ? (stats.inspectores / stats.totalUsuarios * 100) : 0}%`, background: "#7c3aed" }} /></div>
                  <strong>{stats.inspectores}</strong>
                </div>
              </div>
            </div>

            <div className="admin-panel-card">
              <h3>Estado de solicitudes</h3>
              <div className="admin-bar-chart">
                <div className="admin-bar-row">
                  <span>Pendientes</span>
                  <div className="admin-bar-track"><div className="admin-bar-fill" style={{ width: `${stats.totalSolicitudes ? (stats.pendientes / stats.totalSolicitudes * 100) : 0}%`, background: "#d97706" }} /></div>
                  <strong>{stats.pendientes}</strong>
                </div>
                <div className="admin-bar-row">
                  <span>Aprobadas</span>
                  <div className="admin-bar-track"><div className="admin-bar-fill" style={{ width: `${stats.totalSolicitudes ? (stats.aprobadas / stats.totalSolicitudes * 100) : 0}%`, background: "#16a34a" }} /></div>
                  <strong>{stats.aprobadas}</strong>
                </div>
                <div className="admin-bar-row">
                  <span>Rechazadas</span>
                  <div className="admin-bar-track"><div className="admin-bar-fill" style={{ width: `${stats.totalSolicitudes ? (stats.rechazadas / stats.totalSolicitudes * 100) : 0}%`, background: "#dc2626" }} /></div>
                  <strong>{stats.rechazadas}</strong>
                </div>
                <div className="admin-bar-row">
                  <span>Observadas</span>
                  <div className="admin-bar-track"><div className="admin-bar-fill" style={{ width: `${stats.totalSolicitudes ? (stats.observadas / stats.totalSolicitudes * 100) : 0}%`, background: "#7c3aed" }} /></div>
                  <strong>{stats.observadas}</strong>
                </div>
              </div>
            </div>
          </div>

          <div className="admin-panel-card" style={{ marginTop: "20px" }}>
            <h3>Accesos rápidos</h3>
            <div className="admin-shortcuts">
              <div className="admin-shortcut" onClick={() => {}}>
                <div style={{ fontSize: "28px" }}>&#128101;</div>
                <strong>Gestionar usuarios</strong>
                <span>{stats.usuariosActivos} activos</span>
              </div>
              <div className="admin-shortcut">
                <div style={{ fontSize: "28px" }}>&#128221;</div>
                <strong>Solicitudes</strong>
                <span>{stats.totalSolicitudes} totales</span>
              </div>
              <div className="admin-shortcut">
                <div style={{ fontSize: "28px" }}>&#128200;</div>
                <strong>Auditoría</strong>
                <span>{auditCount} registros</span>
              </div>
              <div className="admin-shortcut">
                <div style={{ fontSize: "28px" }}>&#9881;</div>
                <strong>Configuración</strong>
                <span>Parametros</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default PanelAdmin;
