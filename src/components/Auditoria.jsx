import { useState, useEffect } from "react";
import { obtenerAuditoria } from "../services/auditService";

function Auditoria() {
  const [registros, setRegistros] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [filtroUsuario, setFiltroUsuario] = useState("");
  const [filtroAccion, setFiltroAccion] = useState("");
  const [pagina, setPagina] = useState(0);
  const POR_PAGINA = 20;

  useEffect(() => {
    cargar();
  }, []);

  const cargar = async () => {
    setCargando(true);
    try {
      const data = await obtenerAuditoria(500);
      setRegistros(data);
    } catch (err) {
      console.error(err);
    } finally {
      setCargando(false);
    }
  };

  const filtrados = registros.filter((r) => {
    if (filtroUsuario) {
      const b = filtroUsuario.toLowerCase();
      if (!(r.usuario || "").toLowerCase().includes(b)) return false;
    }
    if (filtroAccion) {
      const b = filtroAccion.toLowerCase();
      if (!(r.accion || "").toLowerCase().includes(b)) return false;
    }
    return true;
  });

  const totalPaginas = Math.ceil(filtrados.length / POR_PAGINA);
  const paginados = filtrados.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA);

  const accionIcono = (accion = "") => {
    const a = accion.toLowerCase();
    if (a.includes("crear")) return { icon: "+", color: "#16a34a" };
    if (a.includes("eliminar")) return { icon: "&#10005;", color: "#dc2626" };
    if (a.includes("actualizar") || a.includes("editar") || a.includes("modificar")) return { icon: "&#9998;", color: "#2563eb" };
    if (a.includes("activar")) return { icon: "&#10003;", color: "#16a34a" };
    if (a.includes("desactivar")) return { icon: "&#9888;", color: "#d97706" };
    return { icon: "&#8226;", color: "#64748b" };
  };

  const usuariosUnicos = [...new Set(registros.map((r) => r.usuario).filter(Boolean))];
  const accionesUnicas = [...new Set(registros.map((r) => r.accion).filter(Boolean))];

  return (
    <div>
      <div className="admin-module-header">
        <div>
          <h2>Auditoria del Sistema</h2>
          <p>Historial completo de acciones realizadas por los usuarios.</p>
        </div>
        <button type="button" className="btn-outline" onClick={cargar}>Actualizar</button>
      </div>

      <div className="admin-filtros">
        <input type="text" placeholder="Filtrar por usuario..." value={filtroUsuario} onChange={(e) => { setFiltroUsuario(e.target.value); setPagina(0); }} />
        <select value={filtroAccion} onChange={(e) => { setFiltroAccion(e.target.value); setPagina(0); }}>
          <option value="">Todas las acciones</option>
          {accionesUnicas.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <span style={{ color: "#94a3b8", fontSize: "13px" }}>{filtrados.length} registros</span>
      </div>

      {cargando ? (
        <div style={{ textAlign: "center", padding: "60px", color: "#94a3b8" }}>Cargando registros de auditoria...</div>
      ) : (
        <>
          <div className="audit-timeline">
            {paginados.map((r) => {
              const { icon, color } = accionIcono(r.accion);
              return (
                <div key={r.id} className="audit-entry">
                  <div className="audit-dot" style={{ background: color }}>
                    <span dangerouslySetInnerHTML={{ __html: icon }} />
                  </div>
                  <div className="audit-content">
                    <div className="audit-header">
                      <strong>{r.usuario}</strong>
                      <span className="audit-accion">{r.accion}</span>
                    </div>
                    {r.detalle && <p className="audit-detalle">{r.detalle}</p>}
                    <div className="audit-meta">
                      <span>{r.fecha}</span>
                      <span>{r.hora}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {totalPaginas > 1 && (
            <div className="admin-paginacion">
              <button type="button" disabled={pagina === 0} onClick={() => setPagina(pagina - 1)}>&#8592; Anterior</button>
              <span>Pagina {pagina + 1} de {totalPaginas}</span>
              <button type="button" disabled={pagina >= totalPaginas - 1} onClick={() => setPagina(pagina + 1)}>Siguiente &#8594;</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default Auditoria;
