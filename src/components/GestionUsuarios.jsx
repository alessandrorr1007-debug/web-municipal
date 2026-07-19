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

function GestionUsuarios({ usuarios, onRecargar }) {
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
    rol: "cajero",
    password: "",
  });

  const rolesInternos = ["cajero", "funcionario", "inspector", "administrador"];
  const inspectorExiste = usuarios.some((u) => u.rol === "inspector");

  const rolesDisponibles = rolesInternos.filter((r) => {
    if (r === "inspector") {
      if (editando && editando.rol === "inspector") return true;
      return !inspectorExiste;
    }
    return true;
  });

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
    setForm({ nombre: "", correo: "", dni: "", telefono: "", cargo: "", rol: "cajero", password: "" });
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
          rol: form.rol,
          permisos: PERMISOS_POR_ROL[form.rol] || [],
        };

        await actualizarUsuario(editando.uid, cambios);

        if (form.password && form.password.trim() !== "") {
          try {
            const appName = `TempApp_${Date.now()}`;
            const tempApp = initializeApp(firebaseConfig, appName);
            const tempAuth = getAuth(tempApp);
            await sendPasswordResetEmail(tempAuth, form.correo);
            await tempApp.delete();
          } catch (resetErr) {
            console.warn("No se pudo enviar email de restablecimiento:", resetErr.message);
          }
        }

        await registrarAccion({
          usuario: usuario.nombre,
          usuarioId: usuario.uid,
          accion: "Actualizar usuario interno",
          detalle: `Actualizó a ${form.nombre} (${ROL_ETIQUETAS[form.rol]})` + (form.password ? " y envió restablecimiento de contraseña" : ""),
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
          alert("Error al registrar en Firebase Auth: " + authErr.message);
          await tempApp.delete();
          return;
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
          rol: form.rol,
          activo: true,
          permisos: PERMISOS_POR_ROL[form.rol] || [],
          creadoPor: usuario.nombre,
        });

        await registrarAccion({
          usuario: usuario.nombre,
          usuarioId: usuario.uid,
          accion: "Crear usuario interno",
          detalle: `Creó usuario ${form.nombre} (${ROL_ETIQUETAS[form.rol]})`,
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
      rol: u.rol || "cajero",
      password: "",
    });
    setEditando(u);
    setMostrarForm(true);
  };

  const toggleEstado = async (u) => {
    const nuevoEstado = u.estado === "activo" ? "desactivado" : "activo";
    try {
      await actualizarUsuario(u.uid || u.id, { estado: nuevoEstado });
      await registrarAccion({
        usuario: usuario.nombre,
        usuarioId: usuario.uid,
        accion: `${nuevoEstado === "activo" ? "Activar" : "Desactivar"} usuario`,
        detalle: `${nuevoEstado === "activo" ? "Activo" : "Desactivo"} a ${u.nombre}`,
      });
      onRecargar();
    } catch (err) {
      alert("Error: " + err.message);
    }
  };

  const eliminar = async (u) => {
    if (!window.confirm(`Desactivar usuario "${u.nombre}"? Podrás reactivarlo desde la lista.`)) return;
    try {
      await actualizarUsuario(u.uid || u.id, { activo: false, estado: "desactivado" });
      await registrarAccion({
        usuario: usuario.nombre,
        usuarioId: usuario.uid,
        accion: "Desactivar usuario",
        detalle: `Desactivó usuario ${u.nombre} (${u.correo})`,
      });
      onRecargar();
    } catch (err) {
      alert("Error: " + err.message);
    }
  };

  return (
    <div>
      <div className="admin-module-header">
        <div>
          <h2>Gestión de Usuarios Internos</h2>
          <p>Crea, edita y administra cajeros, funcionarios, inspectores y administradores.</p>
        </div>
        <button type="button" className="btn-primary" onClick={() => { limpiarForm(); setMostrarForm(true); }}>
          + Nuevo usuario
        </button>
      </div>

      <div className="admin-filtros">
        <input type="text" placeholder="Buscar por nombre, correo o DNI..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        <select value={filtroRol} onChange={(e) => setFiltroRol(e.target.value)}>
          <option value="todos">Todos los roles</option>
          {rolesInternos.map((r) => <option key={r} value={r}>{ROL_ETIQUETAS[r]}</option>)}
        </select>
        <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
          <option value="todos">Todos los estados</option>
          <option value="activo">Activos</option>
          <option value="desactivado">Desactivados</option>
        </select>
      </div>

      {mostrarForm && (
        <div className="admin-form-modal">
          <div className="admin-form-card">
            <div className="admin-form-header">
              <h3>{editando ? "Editar usuario" : "Nuevo usuario interno"}</h3>
              <button type="button" onClick={limpiarForm}>&#10005;</button>
            </div>
            <form onSubmit={guardar}>
              <div className="admin-form-grid">
                <div>
                  <label>Nombre completo *</label>
                  <input type="text" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required />
                </div>
                <div>
                  <label>Correo electrónico *</label>
                  <input type="email" value={form.correo} onChange={(e) => setForm({ ...form, correo: e.target.value })} required disabled={!!editando} />
                </div>
                <div>
                  <label>DNI</label>
                  <input type="text" value={form.dni} onChange={(e) => setForm({ ...form, dni: e.target.value.replace(/\D/g, "").slice(0, 8) })} maxLength="8" />
                </div>
                <div>
                  <label>Teléfono</label>
                  <input type="text" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value.replace(/\D/g, "").slice(0, 9) })} maxLength="9" />
                </div>
                <div>
                  <label>Cargo</label>
                  <input type="text" value={form.cargo} onChange={(e) => setForm({ ...form, cargo: e.target.value })} placeholder="Ej: Cajero principal" />
                </div>
                <div>
                  <label>Rol *</label>
                  <select
                    value={form.rol}
                    onChange={(e) => setForm({ ...form, rol: e.target.value })}
                    required
                    disabled={editando && editando.rol === "inspector"}
                  >
                    {rolesDisponibles.map((r) => <option key={r} value={r}>{ROL_ETIQUETAS[r]}</option>)}
                  </select>
                </div>
                <div>
                  <label>{editando ? "Cambiar contraseña (opcional)" : "Contraseña *"}</label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder={editando ? "Dejar en blanco para no cambiar" : "Mínimo 6 caracteres"}
                    required={!editando}
                  />
                </div>
              </div>

              <div className="admin-permisos-preview">
                <strong>Permisos asignados automaticamente:</strong>
                <div className="admin-permisos-list">
                  {(PERMISOS_POR_ROL[form.rol] || []).map((p) => (
                    <span key={p} className="permiso-tag">{p.replace(/_/g, " ")}</span>
                  ))}
                </div>
              </div>

              <div className="admin-form-actions">
                <button type="button" onClick={limpiarForm}>Cancelar</button>
                <button type="submit" className="btn-primary">{editando ? "Guardar cambios" : "Crear usuario"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Usuario</th>
              <th>DNI</th>
              <th>Correo</th>
              <th>Cargo</th>
              <th>Rol</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {usuariosFiltrados.length === 0 ? (
              <tr><td colSpan="7" style={{ textAlign: "center", padding: "40px", color: "#94a3b8" }}>No se encontraron usuarios</td></tr>
            ) : (
              usuariosFiltrados.map((u) => (
                <tr key={u.uid || u.id}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <div style={{ width: "34px", height: "34px", borderRadius: "50%", background: "#1f3b57", color: "white", display: "grid", placeItems: "center", fontWeight: 800, fontSize: "13px" }}>
                        {u.nombre?.charAt(0)?.toUpperCase() || "?"}
                      </div>
                      <div>
                        <strong>{u.nombre}</strong>
                        <p style={{ margin: 0, fontSize: "12px", color: "#94a3b8" }}>{u.telefono || "-"}</p>
                      </div>
                    </div>
                  </td>
                  <td>{u.dni || "-"}</td>
                  <td>{u.correo}</td>
                  <td>{u.cargo || "-"}</td>
                  <td><span className="admin-badge" style={{ background: ROL_ETIQUETAS[u.rol] ? "#eff6ff" : "#f8fafc", color: "#1e3a8a" }}>{ROL_ETIQUETAS[u.rol] || u.rol}</span></td>
                  <td>
                    <span className={`admin-badge ${u.estado === "activo" ? "badge-ok" : "badge-danger"}`}>
                      {u.estado === "activo" ? "Activo" : "Desactivado"}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                      <button type="button" className="btn-sm btn-outline" onClick={() => editar(u)}>Editar</button>
                      <button type="button" className={`btn-sm ${u.estado === "activo" ? "btn-warning" : "btn-ok"}`} onClick={() => toggleEstado(u)}>
                        {u.estado === "activo" ? "Desactivar" : "Activar"}
                      </button>
                      <button type="button" className="btn-sm btn-danger" onClick={() => eliminar(u)}>Eliminar</button>
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
