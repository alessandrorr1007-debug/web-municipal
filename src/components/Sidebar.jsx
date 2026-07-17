
const iconos = {
  inicio: "&#127968;",
  "nueva-solicitud": "&#128221;",
  "mis-solicitudes": "&#128196;",
  solicitudes: "&#128196;",
  "inspecciones-hoy": "&#128269;",
  notificaciones: "&#128276;",
  historial: "&#128200;",
  estadisticas: "&#128202;",
  reportes: "&#128196;",
  "mi-cuenta": "&#128100;",
  "mis-comprobantes": "&#127991;",
  "gestion-usuarios": "&#128101;",
  "gestion-roles": "&#128272;",
  auditoria: "&#128209;",
  "config-sistema": "&#9881;",
};

const titulos = {
  inicio: "Inicio",
  "nueva-solicitud": "Nueva Solicitud",
  "mis-solicitudes": "Mis Solicitudes",
  solicitudes: "Solicitudes",
  "inspecciones-hoy": "Inspecciones Hoy",
  notificaciones: "Notificaciones",
  historial: "Historial",
  estadisticas: "Estadisticas",
  reportes: "Reportes",
  "mi-cuenta": "Mi Cuenta",
  "mis-comprobantes": "Mis Comprobantes",
  "gestion-usuarios": "Usuarios",
  "gestion-roles": "Roles y Permisos",
  auditoria: "Auditoria",
  "config-sistema": "Configuracion",
};

function Sidebar({ usuario, rolEtiqueta, rolColor, seccion, onCambiarSeccion, abierto, onToggle, secciones }) {
  return (
    <aside className={`sidebar ${abierto ? "open" : "closed"}`}>
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">&#9881;</div>
          <div className="sidebar-logo-text">
            <strong>Municipalidad</strong>
            <span>Trujillo</span>
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
          >
            <span className="sidebar-item-icon" dangerouslySetInnerHTML={{ __html: iconos[key] || "&#9881;" }} />
            <span className="sidebar-item-label">{titulos[key] || key}</span>
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
