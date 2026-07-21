
const iconos = {
  inicio: "&#127968;",
  "nueva-solicitud": "&#128221;",
  "registro-presencial": "&#128221;",
  "mis-solicitudes": "&#128196;",
  solicitudes: "&#128196;",
  "consulta-expedientes": "&#128196;",
  "inspecciones-hoy": "&#128269;",
  inspecciones: "&#128269;",
  "asignacion-inspecciones": "&#128197;",
  "solicitudes-pago": "&#128176;",
  "gestion-ciudadanos": "&#128101;",
  "gestion-inspectores": "&#128084;",
  "gestion-negocios": "&#127970;",
  notificaciones: "&#128276;",
  historial: "&#128200;",
  estadisticas: "&#128202;",
  reportes: "&#128196;",
  "mi-cuenta": "&#128100;",
  "mis-comprobantes": "&#128176;",
  "mis-pagos": "&#128176;",
  "gestion-usuarios": "&#128101;",
  "gestion-roles": "&#128272;",
  auditoria: "&#128209;",
  "config-sistema": "&#9881;",
};

const titulos = {
  inicio: "Inicio",
  "nueva-solicitud": "Nueva Solicitud",
  "registro-presencial": "Registrar Solicitud Presencial",
  "mis-solicitudes": "Mis Solicitudes",
  solicitudes: "Consulta de Expedientes",
  "consulta-expedientes": "Consultar Estado de Trámite",
  "inspecciones-hoy": "Inspecciones Hoy",
  inspecciones: "Inspecciones",
  "asignacion-inspecciones": "Asignación de Inspectores",
  "solicitudes-pago": "Ventanilla de Pagos",
  "gestion-ciudadanos": "Gestión de Ciudadanos",
  "gestion-inspectores": "Gestión de Inspectores",
  "gestion-negocios": "Gestión de Negocios",
  notificaciones: "Notificaciones",
  historial: "Historial de Pagos",
  estadisticas: "Estadísticas",
  reportes: "Reportes",
  "mi-cuenta": "Mi Cuenta",
  "mis-comprobantes": "Mis Comprobantes",
  "mis-pagos": "Mis Pagos",
  "gestion-usuarios": "Usuarios",
  "gestion-roles": "Roles y Permisos",
  auditoria: "Auditoria",
  "config-sistema": "Configuración",
};

function Sidebar({ usuario, rolEtiqueta, rolColor, seccion, onCambiarSeccion, abierto, onToggle, secciones, notificacionesNoLeidas }) {
  return (
    <aside className={`sidebar ${abierto ? "open" : "closed"}`}>
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">&#127760;</div>
          <div className="sidebar-logo-text">
            <strong>WEB</strong>
            <span>MUNICIPAL</span>
          </div>
        </div>
        <button type="button" className="sidebar-close" onClick={onToggle}>&#10005;</button>
      </div>

      <div className="sidebar-user">
        <div className="sidebar-avatar" style={{ background: rolColor[usuario.rol] || "#6366f1" }}>
          {usuario.nombre?.charAt(0)?.toUpperCase() || "U"}
        </div>
        <div className="sidebar-user-info">
          <span className="sidebar-user-name">{usuario.nombre || "Usuario"}</span>
          <span className="sidebar-user-role" style={{ color: rolColor[usuario.rol] }}>{rolEtiqueta[usuario.rol] || usuario.rol}</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        {secciones.map((key) => (
          <button
            key={key}
            type="button"
            className={`sidebar-item ${seccion === key ? "active" : ""}`}
            onClick={() => onCambiarSeccion(key)}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span className="sidebar-item-icon" dangerouslySetInnerHTML={{ __html: iconos[key] || "&#9881;" }} />
              <span className="sidebar-item-label">{titulos[key] || key}</span>
            </div>
            {key === "notificaciones" && notificacionesNoLeidas > 0 && (
              <span style={{
                background: "#ef4444",
                color: "white",
                borderRadius: "999px",
                padding: "2px 8px",
                fontSize: "11px",
                fontWeight: "bold",
                marginRight: "10px"
              }}>
                {notificacionesNoLeidas}
              </span>
            )}
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        <p>Sistema de Licencias v1.0</p>
      </div>
    </aside>
  );
}

export default Sidebar;
