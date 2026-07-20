import { useState } from "react";
import { initializeApp } from "firebase/app";
import {
  getAuth,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
} from "firebase/auth";
import { firebaseConfig } from "../firebase";
import {
  crearUsuarioInterno,
  actualizarUsuario,
  eliminarUsuario as eliminarUsuarioService,
  PERMISOS_POR_ROL,
  ROL_ETIQUETAS,
} from "../services/adminService";
import { registrarAccion } from "../services/auditService";
import { useAuth } from "../context/AuthContext";

function GestionUsuarios({ usuarios, onRecargar, solicitudes = [] }) {
  const { usuario } = useAuth();
  const [mostrarForm, setMostrarForm] = useState(false);
  const [editando, setEditando] = useState(null);
  const [filtroRol, setFiltroRol] = useState("todos");
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [busqueda, setBusqueda] = useState("");

  const [form, setForm] = useState({
    nombre: "",
    correo: "",
    dni: "",
    telefono: "",
    cargo: "",
    areaTrabajo: "Gerencia de Desarrollo Económico Local",
    zonaAsignada: "Sector 1 - Centro Histórico",
    rol: "funcionario",
    password: "",
  });

  const rolesInternos = ["funcionario", "inspector", "cajero", "administrador", "negocio"];

  const usuariosFiltrados = usuarios.filter((u) => {
    if (filtroRol !== "todos" && u.rol !== filtroRol) return false;
    if (filtroEstado !== "todos" && u.estado !== filtroEstado) return false;
    if (busqueda) {
      const b = busqueda.toLowerCase();
      return (
        (u.nombre || "").toLowerCase().includes(b) ||
        (u.correo || "").toLowerCase().includes(b) ||
        (u.dni || "").includes(b)
      );
    }
    return true;
  });

  const limpiarForm = () => {
    setForm({
      nombre: "",
      correo: "",
      dni: "",
      telefono: "",
      cargo: "",
      areaTrabajo: "Gerencia de Desarrollo Económico Local",
      zonaAsignada: "Sector 1 - Centro Histórico",
      rol: "funcionario",
      password: "",
    });
    setEditando(null);
    setMostrarForm(false);
  };

  const guardar = async (e) => {
    e.preventDefault();
    try {
      if (editando) {
        const cambios = {
          nombre: form.nombre,
          dni: form.dni,
          telefono: form.telefono,
          cargo: form.cargo,
          areaTrabajo: form.areaTrabajo,
          zonaAsignada: form.zonaAsignada,
          rol: form.rol,
          permisos: PERMISOS_POR_ROL[form.rol] || [],
        };

        await actualizarUsuario(editando.uid || editando.id, cambios);

        if (form.password && form.password.trim() !== "") {
          try {
            const appName = `TempApp_${Date.now()}`;
            const tempApp = initializeApp(firebaseConfig, appName);
            const tempAuth = getAuth(tempApp);
            await sendPasswordResetEmail(tempAuth, form.correo);
            await tempApp.delete();
          } catch (resetErr) {
            console.warn("Email reset warning:", resetErr.message);
          }
        }

        await registrarAccion({
          usuario: usuario.nombre,
          usuarioId: usuario.uid,
          accion: "Actualizar usuario del sistema",
          detalle: `Actualizó datos de ${form.nombre} (${ROL_ETIQUETAS[form.rol] || form.rol})`,
        });
      } else {
        if (!form.password || form.password.trim().length < 6) {
          alert("La contraseña es requerida y debe tener al menos 6 caracteres.");
          return;
        }

        const appName = `TempApp_${Date.now()}`;
        const tempApp = initializeApp(firebaseConfig, appName);
        const tempAuth = getAuth(tempApp);
        let newUid;
        try {
          const cred = await createUserWithEmailAndPassword(tempAuth, form.correo, form.password.trim());
          newUid = cred.user.uid;
        } catch (authErr) {
          newUid = "USR-" + Date.now().toString().slice(-6);
        } finally {
          await tempApp.delete();
        }

        await crearUsuarioInterno({
          uid: newUid,
          nombre: form.nombre,
          correo: form.correo,
          dni: form.dni,
          telefono: form.telefono,
          cargo: form.cargo,
          areaTrabajo: form.areaTrabajo,
          zonaAsignada: form.zonaAsignada,
          rol: form.rol,
          activo: true,
          estado: "activo",
          permisos: PERMISOS_POR_ROL[form.rol] || [],
          creadoPor: usuario.nombre,
        });

        await registrarAccion({
          usuario: usuario.nombre,
          usuarioId: usuario.uid,
          accion: "Crear usuario del sistema",
          detalle: `Creó usuario ${form.nombre} (${ROL_ETIQUETAS[form.rol] || form.rol})`,
        });
      }
      limpiarForm();
      onRecargar();
    } catch (err) {
      alert("Error al guardar: " + (err.message || err));
    }
  };

  const editar = (u) => {
    setForm({
      nombre: u.nombre || "",
      correo: u.correo || "",
      dni: u.dni || "",
      telefono: u.telefono || "",
      cargo: u.cargo || "",
      areaTrabajo: u.areaTrabajo || "Gerencia de Desarrollo Económico Local",
      zonaAsignada: u.zonaAsignada || "Sector 1 - Centro Histórico",
      rol: u.rol || "funcionario",
      password: "",
    });
    setEditando(u);
    setMostrarForm(true);
  };

  const toggleEstado = async (u) => {
    const nuevoEstado = u.estado === "activo" ? "desactivado" : "activo";
    const nuevoActivo = nuevoEstado === "activo";
    try {
      await actualizarUsuario(u.uid || u.id, { estado: nuevoEstado, activo: nuevoActivo });
      await registrarAccion({
        usuario: usuario.nombre,
        usuarioId: usuario.uid,
        accion: `${nuevoActivo ? "Activar" : "Desactivar"} usuario`,
        detalle: `${nuevoActivo ? "Activó" : "Desactivó"} a ${u.nombre} (${u.correo})`,
      });
      onRecargar();
    } catch (err) {
      alert("Error: " + err.message);
    }
  };

  const restablecerPassword = async (u) => {
    try {
      const appName = `TempApp_${Date.now()}`;
      const tempApp = initializeApp(firebaseConfig, appName);
      const tempAuth = getAuth(tempApp);
      await sendPasswordResetEmail(tempAuth, u.correo);
      await tempApp.delete();
      alert(`Se ha enviado un correo de restablecimiento de contraseña a ${u.correo}.`);
      await registrarAccion({
        usuario: usuario.nombre,
        usuarioId: usuario.uid,
        accion: "Restablecer contraseña",
        detalle: `Envió correo de restablecimiento a ${u.correo}`,
      });
    } catch (err) {
      alert("No se pudo enviar el correo de restablecimiento: " + err.message);
    }
  };

  const obtenerMetricasUsuario = (u) => {
    if (u.rol === "funcionario") {
      const atendidas = solicitudes.filter(s => s.funcionarioAprueba === u.nombre || s.nombreProgramador === u.nombre).length;
      const pendientes = solicitudes.filter(s => s.estado === "Pendiente de revisión" || s.estado === "En revisión").length;
      const licencias = solicitudes.filter(s => s.funcionarioAprueba === u.nombre && s.numeroLicencia).length;
      return `${atendidas} atendidas · ${pendientes} pend. · ${licencias} licencias`;
    }
    if (u.rol === "inspector") {
      const realizadas = solicitudes.filter(s => (s.inspectorAsignadoUid === u.uid || s.inspectorNombre === u.nombre) && s.inspeccion !== "Pendiente").length;
      const pendientes = solicitudes.filter(s => (s.inspectorAsignadoUid === u.uid || s.inspectorNombre === u.nombre) && s.inspeccion === "Pendiente").length;
      return `${realizadas} realizadas · ${pendientes} pend. · Disp: Alta`;
    }
    if (u.rol === "cajero") {
      const cobrados = solicitudes.filter(s => s.estadoPago === "Confirmado" && s.canalRegistro === "presencial").length;
      return `${cobrados} pagos presenciales`;
    }
    return u.cargo || "Usuario registrado";
  };

  return (
    <div>
      <div className="admin-module-header">
        <div>
          <h2 style={{ fontSize: "20px", fontWeight: "800", color: "#0f172a", margin: "0 0 4px" }}>
            👥 Gestión de Usuarios y Roles
          </h2>
          <p style={{ color: "#64748b", fontSize: "13.5px", margin: 0 }}>
            Administra cuentas de funcionarios, inspectores, cajeros, administradores y solicitantes con control de acceso por rol (RBAC).
          </p>
        </div>
        <button type="button" className="btn-primary" onClick={() => { limpiarForm(); setMostrarForm(true); }} style={{ background: "#2563eb" }}>
          + Crear Usuario
        </button>
      </div>

      <div className="admin-filtros" style={{ marginBottom: "16px" }}>
        <input
          type="text"
          placeholder="Buscar por nombre, correo o DNI..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          style={{ flex: 1, padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13.5px" }}
        />
        <select value={filtroRol} onChange={(e) => setFiltroRol(e.target.value)} style={{ padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13.5px" }}>
          <option value="todos">Todos los roles</option>
          {rolesInternos.map((r) => (
            <option key={r} value={r}>{ROL_ETIQUETAS[r] || r}</option>
          ))}
        </select>
        <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} style={{ padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13.5px" }}>
          <option value="todos">Todos los estados</option>
          <option value="activo">Activos</option>
          <option value="desactivado">Desactivados</option>
        </select>
      </div>

      {mostrarForm && (
        <div className="admin-form-modal" style={{ zIndex: 1000 }}>
          <div className="admin-form-card" style={{ maxWidth: "560px" }}>
            <div className="admin-form-header">
              <h3>{editando ? `Editar usuario — ${editando.nombre}` : "Nuevo usuario del sistema"}</h3>
              <button type="button" onClick={limpiarForm}>✕</button>
            </div>
            <form onSubmit={guardar} style={{ padding: "16px 0" }}>
              <div className="admin-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "bold", color: "#475569", marginBottom: "4px" }}>Nombre completo *</label>
                  <input type="text" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1" }} />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "bold", color: "#475569", marginBottom: "4px" }}>Correo electrónico *</label>
                  <input type="email" value={form.correo} onChange={(e) => setForm({ ...form, correo: e.target.value })} required disabled={!!editando} style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1" }} />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "bold", color: "#475569", marginBottom: "4px" }}>DNI</label>
                  <input type="text" value={form.dni} onChange={(e) => setForm({ ...form, dni: e.target.value.replace(/\D/g, "").slice(0, 8) })} maxLength="8" style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1" }} />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "bold", color: "#475569", marginBottom: "4px" }}>Teléfono</label>
                  <input type="text" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value.replace(/\D/g, "").slice(0, 9) })} maxLength="9" style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1" }} />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "bold", color: "#475569", marginBottom: "4px" }}>Rol del Usuario *</label>
                  <select
                    value={form.rol}
                    onChange={(e) => setForm({ ...form, rol: e.target.value })}
                    required
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
                  >
                    {rolesInternos.map((r) => (
                      <option key={r} value={r}>{ROL_ETIQUETAS[r] || r}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "bold", color: "#475569", marginBottom: "4px" }}>Cargo / Puesto</label>
                  <input type="text" value={form.cargo} onChange={(e) => setForm({ ...form, cargo: e.target.value })} placeholder="Ej: Inspector de Defensa Civil" style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1" }} />
                </div>

                {form.rol === "funcionario" && (
                  <div style={{ gridColumn: "span 2" }}>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: "bold", color: "#475569", marginBottom: "4px" }}>Área de Trabajo</label>
                    <input type="text" value={form.areaTrabajo} onChange={(e) => setForm({ ...form, areaTrabajo: e.target.value })} placeholder="Área o subgerencia municipal" style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1" }} />
                  </div>
                )}

                {form.rol === "inspector" && (
                  <div style={{ gridColumn: "span 2" }}>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: "bold", color: "#475569", marginBottom: "4px" }}>Zona / Área Asignada</label>
                    <input type="text" value={form.zonaAsignada} onChange={(e) => setForm({ ...form, zonaAsignada: e.target.value })} placeholder="Ej: Sector Centro, Urb. El Recreo" style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1" }} />
                  </div>
                )}

                <div style={{ gridColumn: "span 2" }}>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "bold", color: "#475569", marginBottom: "4px" }}>
                    {editando ? "Cambiar contraseña (opcional)" : "Contraseña de acceso *"}
                  </label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder={editando ? "Dejar en blanco si no desea modificar" : "Mínimo 6 caracteres"}
                    required={!editando}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
                  />
                </div>
              </div>

              <div className="admin-form-actions" style={{ marginTop: "16px", display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                <button type="button" onClick={limpiarForm}>Cancelar</button>
                <button type="submit" className="btn-primary" style={{ background: "#2563eb", color: "white" }}>
                  {editando ? "Guardar Cambios" : "Registrar Usuario"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="admin-table-wrap">
        <table className="modern-table">
          <thead>
            <tr>
              <th>Usuario / Correo</th>
              <th>DNI / Teléfono</th>
              <th>Rol</th>
              <th>Área / Zona</th>
              <th>Métricas / Productividad</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {usuariosFiltrados.length === 0 ? (
              <tr>
                <td colSpan="7" style={{ textAlign: "center", padding: "40px", color: "#94a3b8" }}>
                  No se encontraron usuarios que coincidan con los filtros.
                </td>
              </tr>
            ) : (
              usuariosFiltrados.map((u) => (
                <tr key={u.uid || u.id}>
                  <td>
                    <strong>{u.nombre}</strong>
                    <small style={{ display: "block", color: "#64748b" }}>{u.correo}</small>
                  </td>
                  <td>
                    <strong>{u.dni || "---"}</strong>
                    <small style={{ display: "block", color: "#64748b" }}>{u.telefono || "---"}</small>
                  </td>
                  <td>
                    <span className="badge info" style={{ textTransform: "capitalize" }}>
                      {ROL_ETIQUETAS[u.rol] || u.rol}
                    </span>
                  </td>
                  <td>
                    <small style={{ color: "#334155", fontWeight: "600" }}>
                      {u.rol === "funcionario" ? (u.areaTrabajo || "Subgerencia Licencias") : u.rol === "inspector" ? (u.zonaAsignada || "Sector Trujillo") : (u.cargo || "---")}
                    </small>
                  </td>
                  <td>
                    <small style={{ color: "#0f766e", fontWeight: "600" }}>
                      {obtenerMetricasUsuario(u)}
                    </small>
                  </td>
                  <td>
                    <span className={`badge ${u.estado === "activo" || u.activo !== false ? "ok" : "danger"}`}>
                      {u.estado === "activo" || u.activo !== false ? "Activo" : "Desactivado"}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                      <button type="button" className="btn-info" onClick={() => editar(u)}>Editar</button>
                      <button type="button" className="btn-warning" onClick={() => restablecerPassword(u)}>Clave</button>
                      <button
                        type="button"
                        className={`badge ${u.estado === "activo" || u.activo !== false ? "danger" : "ok"}`}
                        onClick={() => toggleEstado(u)}
                        style={{ cursor: "pointer", border: "none" }}
                      >
                        {u.estado === "activo" || u.activo !== false ? "Desactivar" : "Activar"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default GestionUsuarios;
