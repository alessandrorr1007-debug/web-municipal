import { useState, useEffect, useMemo } from "react";
import { obtenerSolicitudes } from "../services/solicitudService";
import { obtenerUsuariosInternos } from "../services/adminService";
import { ESTADO_LABELS, mapLegacyEstado } from "../config/estadosSolicitud";

function Reportes() {
  const [solicitudes, setSolicitudes] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [cargando, setCargando] = useState(true);

  const [filtroTipo, setFiltroTipo] = useState("general");
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [filtroCanal, setFiltroCanal] = useState("todos");
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");

  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    try {
      setCargando(true);
      const [solData, usrData] = await Promise.all([
        obtenerSolicitudes(),
        obtenerUsuariosInternos(),
      ]);
      setSolicitudes(solData);
      setUsuarios(usrData);
    } catch (err) {
      console.error("Error al cargar datos de reportes:", err);
    } finally {
      setCargando(false);
    }
  };

  const solicitudesFiltradas = useMemo(() => {
    return solicitudes.filter((s) => {
      const estadoNorm = mapLegacyEstado(s.estado) || s.estado;

      if (filtroEstado !== "todos" && estadoNorm !== filtroEstado && s.estado !== filtroEstado) {
        return false;
      }

      if (filtroCanal !== "todos" && (s.canalRegistro || "online") !== filtroCanal) {
        return false;
      }

      if (filtroTipo === "licencias" && !["Licencia emitida", "Licencia aprobada", "APROBADO"].includes(s.estado) && estadoNorm !== "APROBADO") {
        return false;
      }

      if (filtroTipo === "inspecciones" && (!s.fechaVisitaInspector && s.inspeccion === "Sin inspección")) {
        return false;
      }

      if (filtroTipo === "pagos" && s.estadoPago !== "Confirmado" && s.estado !== "Pagado") {
        return false;
      }

      return true;
    });
  }, [solicitudes, filtroEstado, filtroCanal, filtroTipo]);

  const resumenMetricas = useMemo(() => {
    const total = solicitudesFiltradas.length;
    const aprobadas = solicitudesFiltradas.filter(
      (s) => ["Licencia emitida", "Licencia aprobada", "APROBADO"].includes(s.estado) || mapLegacyEstado(s.estado) === "APROBADO"
    ).length;

    const rechazadas = solicitudesFiltradas.filter(
      (s) => ["Rechazado", "Licencia rechazada", "Documentos rechazados", "RECHAZADO"].includes(s.estado)
    ).length;

    const enInspeccion = solicitudesFiltradas.filter(
      (s) => Boolean(s.fechaVisitaInspector)
    ).length;

    const totalIngresos = solicitudesFiltradas.reduce((acc, s) => {
      if (s.estadoPago === "Confirmado" || s.estado === "Pagado" || s.montoPagado) {
        return acc + (Number(s.montoPagado) || 3.0);
      }
      return acc;
    }, 0);

    return { total, aprobadas, rechazadas, enInspeccion, totalIngresos };
  }, [solicitudesFiltradas]);

  const imprimirReporte = () => {
    window.print();
  };

  return (
    <div className="reportes-container">
      <div className="admin-module-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ fontSize: "20px", fontWeight: "800", color: "#0f172a", margin: "0 0 4px" }}>
            📊 Reportes Administrativos del Sistema
          </h2>
          <p style={{ color: "#64748b", fontSize: "13.5px", margin: 0 }}>
            Generación y exportación de reportes de solicitudes, licencias, inspecciones y recaudación.
          </p>
        </div>
        <button
          type="button"
          onClick={imprimirReporte}
          style={{
            padding: "10px 18px",
            background: "#0f766e",
            color: "white",
            border: "none",
            borderRadius: "8px",
            fontSize: "14px",
            fontWeight: "700",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <span>🖨️</span> Imprimir / Exportar PDF
        </button>
      </div>

      {/* FILTROS DE REPORTES */}
      <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "16px", marginBottom: "20px", display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
        <div>
          <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "#475569", marginBottom: "4px" }}>Tipo de Reporte</label>
          <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} style={{ padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13.5px" }}>
            <option value="general">General de Solicitudes</option>
            <option value="licencias">Licencias Emitidas</option>
            <option value="inspecciones">Inspecciones Técnicas</option>
            <option value="pagos">Recaudación y Pagos</option>
          </select>
        </div>

        <div>
          <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "#475569", marginBottom: "4px" }}>Estado del Trámite</label>
          <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} style={{ padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13.5px" }}>
            <option value="todos">Todos los estados</option>
            {Object.entries(ESTADO_LABELS).map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "#475569", marginBottom: "4px" }}>Canal de Atención</label>
          <select value={filtroCanal} onChange={(e) => setFiltroCanal(e.target.value)} style={{ padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13.5px" }}>
            <option value="todos">Todos los canales</option>
            <option value="online">Online (Web)</option>
            <option value="presencial">Presencial (Ventanilla)</option>
          </select>
        </div>
      </div>

      {/* METRICAS DE RESUMEN DEL REPORTE */}
      <div className="stats-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px", marginBottom: "20px" }}>
        <div className="stat-card">
          <span>Registros en Reporte</span>
          <strong>{resumenMetricas.total}</strong>
          <small>Solicitudes filtradas</small>
        </div>
        <div className="stat-card">
          <span>Licencias Aprobadas</span>
          <strong style={{ color: "#16a34a" }}>{resumenMetricas.aprobadas}</strong>
          <small>Emitidas con QR</small>
        </div>
        <div className="stat-card">
          <span>Rechazadas / Observadas</span>
          <strong style={{ color: "#dc2626" }}>{resumenMetricas.rechazadas}</strong>
          <small>Denegadas</small>
        </div>
        <div className="stat-card">
          <span>Inspecciones Programadas</span>
          <strong style={{ color: "#7c3aed" }}>{resumenMetricas.enInspeccion}</strong>
          <small>Inspecciones técnicas</small>
        </div>
        <div className="stat-card">
          <span>Recaudación Total</span>
          <strong style={{ color: "#0f766e" }}>S/ {resumenMetricas.totalIngresos.toFixed(2)}</strong>
          <small>Ingresos en caja / web</small>
        </div>
      </div>

      {/* TABLA DEL REPORTE */}
      {cargando ? (
        <div style={{ textAlign: "center", padding: "40px", color: "#64748b" }}>Generando reporte...</div>
      ) : solicitudesFiltradas.length === 0 ? (
        <div className="empty-state">
          <div style={{ fontSize: "36px", marginBottom: "8px" }}>📊</div>
          <h3>No hay registros para este reporte</h3>
          <p>Ajuste los criterios de búsqueda o filtros superiores.</p>
        </div>
      ) : (
        <div className="tabla-container">
          <table className="modern-table">
            <thead>
              <tr>
                <th>Expediente</th>
                <th>RUC / Razón Social</th>
                <th>Establecimiento</th>
                <th>Canal</th>
                <th>Pago</th>
                <th>Inspector / Fecha</th>
                <th>Estado Final</th>
              </tr>
            </thead>
            <tbody>
              {solicitudesFiltradas.map((s) => (
                <tr key={s.id}>
                  <td>
                    <strong>EXP-{s.id}</strong>
                    <small style={{ display: "block", color: "#64748b" }}>{s.fecha || "---"}</small>
                  </td>
                  <td>
                    <strong>{s.ruc}</strong>
                    <small style={{ display: "block", color: "#475569" }}>{s.razonSocial || "---"}</small>
                  </td>
                  <td>
                    <strong>{s.nombreNegocio}</strong>
                    <small style={{ display: "block", color: "#64748b" }}>{s.direccion}</small>
                  </td>
                  <td>
                    <span className={`badge ${s.canalRegistro === "presencial" ? "info" : "ok"}`}>
                      {s.canalRegistro === "presencial" ? "Presencial" : "Online"}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${s.estadoPago === "Confirmado" ? "ok" : "warning"}`}>
                      {s.estadoPago === "Confirmado" ? "Confirmado (S/ 3.00)" : "Pendiente"}
                    </span>
                  </td>
                  <td>
                    <small style={{ fontWeight: "bold", display: "block" }}>{s.inspectorAsignado || "Sin asignar"}</small>
                    <small style={{ color: "#64748b" }}>{s.fechaVisitaInspector ? `${s.fechaVisitaInspector} ${s.horaVisitaLabel || ""}` : "---"}</small>
                  </td>
                  <td>
                    <span className="badge info">
                      {s.numeroLicencia ? `Licencia ${s.numeroLicencia}` : s.estado}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default Reportes;
