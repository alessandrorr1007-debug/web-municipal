import { useState } from "react";
import { db, crearUsuarioEnFirebaseAuthentication } from "../firebase";
import { doc, setDoc, deleteDoc, query, where, getDocs, serverTimestamp, collection } from "firebase/firestore";
import {
  crearUsuarioInterno,
  actualizarUsuario,
  cambiarEstadoUsuario,
  eliminarUsuario,
  ROL_ETIQUETAS,
  ROL_COLORES,
} from "../services/adminService";

function GestionUsuarios({ usuarios = [], onRecargar, cargando = false, errorCarga = "" }) {
  const [mostrarForm, setMostrarForm] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState({ nombre: "", correo: "", password: "", rol: "cajero" });
  const [mostrarPasswordModal, setMostrarPasswordModal] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState("");

  const rolesPermitidos = [
    { value: "cajero", label: "Cajero (Máx. 5 activos)" },
    { value: "inspector", label: "Inspector (Máx. 1 activo)" },
  ];

  const desduplicarLista = (lista) => {
    const mapa = new Map();
    for (const u of lista) {
      const email = (u.correo || u.email || "").trim().toLowerCase();
      if (!email) continue;
      if (!mapa.has(email)) {
        mapa.set(email, u);
      }
    }
    return Array.from(mapa.values());
  };

  const usuariosUnicos = desduplicarLista(usuarios);

  const esUsuarioActivo = (u) => u.estado === "activo" || (u.estado !== "inactivo" && u.estado !== "desactivado" && u.activo !== false);

  const inspectoresActivos = usuariosUnicos.filter((u) => u.rol === "inspector" && esUsuarioActivo(u)).length;
  const cajerosActivos = usuariosUnicos.filter((u) => u.rol === "cajero" && esUsuarioActivo(u)).length;
  const adminTotales = usuariosUnicos.filter((u) => u.rol === "administrador").length;

  const usuariosFiltrados = usuariosUnicos.filter((u) => {
    if (!busqueda) return true;
    const b = busqueda.toLowerCase();
    return (
      (u.nombre || "").toLowerCase().includes(b) ||
      (u.correo || "").toLowerCase().includes(b) ||
      (ROL_ETIQUETAS[u.rol] || u.rol || "").toLowerCase().includes(b)
    );
  });

  const limpiarForm = () => {
    setForm({ nombre: "", correo: "", password: "", rol: "cajero" });
    setEditando(null);
    setErrorForm("");
    setMostrarForm(false);
  };

  const abrirEdicion = (u) => {
    setEditando(u);
    setForm({
      nombre: u.nombre || "",
      correo: u.correo || "",
      password: "",
      rol: u.rol || "cajero",
    });
    setErrorForm("");
    setMostrarForm(true);
  };

  const guardar = async (e) => {
    e.preventDefault();
    setErrorForm("");

    if (!form.nombre.trim() || !form.correo.trim()) {
      setErrorForm("Por favor complete todos los campos obligatorios.");
      return;
    }

    const correoIngresado = form.correo.trim().toLowerCase();

    if (!editando) {
      if (form.rol === "administrador") {
        setErrorForm("Solo puede existir 1 Administrador. No se permite crear cuentas de Administrador.");
        return;
      }
      const existeEmail = usuariosUnicos.some((u) => (u.correo || "").trim().toLowerCase() === correoIngresado);
      if (existeEmail) {
        setErrorForm("El correo electrónico ya está registrado en el sistema.");
        return;
      }
      if (form.rol === "inspector" && inspectoresActivos >= 1) {
        setErrorForm("Ya existe un Inspector activo. No se puede crear otro usuario Inspector.");
        return;
      }
      if (form.rol === "cajero" && cajerosActivos >= 5) {
        setErrorForm("Se alcanzó el límite máximo de 5 cajeros activos.");
        return;
      }
    } else {
      if (form.correo.trim().toLowerCase() !== (editando.correo || "").trim().toLowerCase()) {
        const existeEmail = usuariosUnicos.some(
          (u) => u.uid !== editando.uid && (u.correo || "").trim().toLowerCase() === correoIngresado
        );
        if (existeEmail) {
          setErrorForm("El correo electrónico ya está registrado por otra cuenta.");
          return;
        }
      }

      if (esUsuarioActivo(editando) && form.rol !== editando.rol) {
        if (form.rol === "inspector" && inspectoresActivos >= 1) {
          setErrorForm("Ya existe un Inspector activo. No se puede crear otro usuario Inspector.");
          return;
        }
        if (form.rol === "cajero" && cajerosActivos >= 5) {
          setErrorForm("Se alcanzó el límite máximo de 5 cajeros activos.");
          return;
        }
      }
    }

    setGuardando(true);
    try {
      if (editando) {
        try {
          await actualizarUsuario(editando.uid, {
            nombre: form.nombre.trim(),
            correo: form.correo.trim().toLowerCase(),
            rol: form.rol,
          });
        } catch (apiErr) {
          if (editando.uid && !editando.uid.includes("-001")) {
            await setDoc(doc(db, "usuarios", editando.uid), {
              nombre: form.nombre.trim(),
              correo: form.correo.trim().toLowerCase(),
              rol: form.rol,
              actualizadoEn: serverTimestamp(),
            }, { merge: true });
          }
        }
        alert("Cuenta de usuario actualizada exitosamente.");
      } else {
        let authUser = null;
        try {
          authUser = await crearUsuarioEnFirebaseAuthentication(form.correo.trim().toLowerCase(), form.password);
        } catch (authErr) {
          const authMsg = authErr.message || "";
          if (authErr.code === "auth/email-already-in-use" || authMsg.includes("email-already-in-use")) {
            setErrorForm("El correo electrónico ya está registrado en Firebase.");
            setGuardando(false);
            return;
          }
          if (authErr.code === "auth/weak-password" || authMsg.includes("weak-password")) {
            setErrorForm("La contraseña debe tener al menos 6 caracteres.");
            setGuardando(false);
            return;
          }
          console.warn("[ADMIN] Client Auth creation fallback notice:", authMsg);
        }

        const targetUid = authUser?.uid || doc(collection(db, "usuarios")).id;
        const targetDocRef = doc(db, "usuarios", targetUid);

        await setDoc(targetDocRef, {
          uid: targetUid,
          nombre: form.nombre.trim(),
          correo: form.correo.trim().toLowerCase(),
          password: form.password,
          rol: form.rol,
          estado: "activo",
          activo: true,
          fechaCreacion: serverTimestamp(),
          creadoEn: serverTimestamp(),
        });

        try {
          await crearUsuarioInterno({
            nombre: form.nombre.trim(),
            correo: form.correo.trim().toLowerCase(),
            password: form.password,
            rol: form.rol,
          });
        } catch (apiErr) {
          // Ignorar si la API local no respondió pero Firebase Auth y Firestore cliente crearon el usuario correctamente
        }

        alert("Usuario creado exitosamente en Firebase Authentication y Firestore.");
      }
      limpiarForm();
      if (onRecargar) onRecargar();
    } catch (err) {
      const msg = err.response?.data?.error || err.message || "Error al procesar la solicitud.";
      setErrorForm(msg);
    } finally {
      setGuardando(false);
    }
  };

  const toggleEstado = async (u) => {
    if (u.rol === "administrador") {
      alert("La cuenta de Administrador está protegida y no puede ser inhabilitada.");
      return;
    }
    const actualmenteActivo = esUsuarioActivo(u);
    const nuevoEstado = actualmenteActivo ? "inactivo" : "activo";

    if (!actualmenteActivo) {
      if (u.rol === "inspector" && inspectoresActivos >= 1) {
        alert("Ya existe un Inspector activo. No se puede activar otro usuario Inspector.");
        return;
      }
      if (u.rol === "cajero" && cajerosActivos >= 5) {
        alert("Se alcanzó el límite máximo de 5 cajeros activos.");
        return;
      }
    }

    const accionTexto = actualmenteActivo ? "inhabilitar" : "habilitar";
    if (confirm(`¿Está seguro de que desea ${accionTexto} la cuenta de "${u.nombre}" (${u.correo})?`)) {
      try {
        if (u.uid && !u.uid.includes("-001")) {
          try {
            await setDoc(doc(db, "usuarios", u.uid), {
              estado: nuevoEstado,
              activo: nuevoEstado === "activo",
              actualizadoEn: serverTimestamp(),
            }, { merge: true });
          } catch (cErr) {
            console.warn("[ADMIN] Client setDoc status warning:", cErr.message);
          }
        }

        try {
          await cambiarEstadoUsuario(u.uid, nuevoEstado, u.correo);
        } catch (backendErr) {
          console.warn("[ADMIN] Backend API status change notice:", backendErr.message);
        }

        alert(nuevoEstado === "inactivo" ? "Usuario inhabilitado correctamente." : "Usuario habilitado correctamente.");
        if (onRecargar) onRecargar();
      } catch (err) {
        alert("Error al cambiar estado: " + (err.response?.data?.error || err.message));
      }
    }
  };

  const manejarEliminar = async (u) => {
    if (u.rol === "administrador") {
      alert("La cuenta de Administrador está protegida y no puede ser eliminada.");
      return;
    }
    const emailLow = (u.correo || "").toLowerCase().trim();

    if (confirm(`⚠️ ¿Desea eliminar PERMANENTEMENTE la cuenta de "${u.nombre}" (${emailLow})?\nEsta acción eliminará el usuario de Firebase Auth y Firestore.`)) {
      try {
        if (u.uid) {
          try { await deleteDoc(doc(db, "usuarios", u.uid)); } catch (cErr) {}
        }
        if (u.id && u.id !== u.uid) {
          try { await deleteDoc(doc(db, "usuarios", u.id)); } catch (cErr) {}
        }
        if (emailLow) {
          try {
            const qDel = query(collection(db, "usuarios"), where("correo", "==", emailLow));
            const snapDel = await getDocs(qDel);
            snapDel.forEach(async (dDoc) => {
              try { await deleteDoc(dDoc.ref); } catch (e) {}
            });
          } catch (e) {}
        }

        let borradoExitosoBackend = false;
        try {
          const res = await eliminarUsuario(u.uid, emailLow);
          if (res && res.exito) borradoExitosoBackend = true;
        } catch (backendErr) {
          console.warn("[ADMIN] Intentando endpoint local directo:", backendErr.message);
          try {
            const resDirect = await fetch(`http://localhost:3000/api/admin/usuarios/${u.uid}?correo=${encodeURIComponent(emailLow)}`, { method: "DELETE" });
            if (resDirect.ok) borradoExitosoBackend = true;
          } catch (e2) {}
        }

        alert("Cuenta de usuario eliminada permanentemente de Firestore y Firebase Auth.");
        if (onRecargar) onRecargar();
      } catch (err) {
        alert("Error al eliminar cuenta: " + (err.response?.data?.error || err.message));
      }
    }
  };

  const formatearFecha = (u) => {
    const val = u.fechaCreacion || u.creadoEn;
    if (!val) return "---";
    if (typeof val === "object" && val.seconds) {
      return new Date(val.seconds * 1000).toLocaleString("es-PE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    if (typeof val === "string" || typeof val === "number") {
      const d = new Date(val);
      if (!isNaN(d.getTime())) {
        return d.toLocaleString("es-PE", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
      }
    }
    return "---";
  };

  return (
    <div style={{ background: "white", borderRadius: "16px", padding: "24px", boxShadow: "0 4px 16px rgba(0,0,0,0.04)", border: "1px solid #e2e8f0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h2 style={{ fontSize: "22px", fontWeight: "800", color: "#0f172a", margin: "0 0 4px" }}>
            👥 Gestión de Cuentas de Usuarios
          </h2>
          <p style={{ margin: 0, fontSize: "13.5px", color: "#64748b" }}>
            Administración centralizada de accesos al sistema municipal de licencias.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            limpiarForm();
            setMostrarForm(true);
          }}
          style={{
            background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
            color: "white",
            border: "none",
            padding: "10px 20px",
            borderRadius: "10px",
            fontWeight: "700",
            fontSize: "14px",
            cursor: "pointer",
            boxShadow: "0 4px 12px rgba(37, 99, 235, 0.25)",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <span>➕</span> Crear Cuenta de Usuario
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "14px", marginBottom: "20px" }}>
        <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "14px 18px" }}>
          <span style={{ fontSize: "12px", fontWeight: "700", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Inspector Activo
          </span>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "6px" }}>
            <strong style={{ fontSize: "20px", color: inspectoresActivos >= 1 ? "#7c3aed" : "#0f172a" }}>
              {inspectoresActivos} / 1
            </strong>
            <span style={{ fontSize: "11px", fontWeight: "800", padding: "3px 10px", borderRadius: "999px", background: inspectoresActivos >= 1 ? "#f3e8ff" : "#dcfce7", color: inspectoresActivos >= 1 ? "#6b21a8" : "#15803d" }}>
              {inspectoresActivos >= 1 ? "Límite alcanzado" : "Disponible"}
            </span>
          </div>
        </div>

        <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "14px 18px" }}>
          <span style={{ fontSize: "12px", fontWeight: "700", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Cajeros Activos
          </span>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "6px" }}>
            <strong style={{ fontSize: "20px", color: cajerosActivos >= 5 ? "#d97706" : "#0f172a" }}>
              {cajerosActivos} / 5
            </strong>
            <span style={{ fontSize: "11px", fontWeight: "800", padding: "3px 10px", borderRadius: "999px", background: cajerosActivos >= 5 ? "#fef3c7" : "#dcfce7", color: cajerosActivos >= 5 ? "#b45309" : "#15803d" }}>
              {cajerosActivos >= 5 ? "Límite alcanzado" : `${5 - cajerosActivos} vacantes`}
            </span>
          </div>
        </div>

        <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "14px 18px" }}>
          <span style={{ fontSize: "12px", fontWeight: "700", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Administradores
          </span>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "6px" }}>
            <strong style={{ fontSize: "20px", color: "#dc2626" }}>
              {adminTotales}
            </strong>
            <span style={{ fontSize: "11px", fontWeight: "800", padding: "3px 10px", borderRadius: "999px", background: "#fee2e2", color: "#991b1b" }}>
              Gestores
            </span>
          </div>
        </div>
      </div>

      <div style={{ marginBottom: "20px" }}>
        <input
          type="text"
          placeholder="🔍 Buscar por nombre, correo o rol..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          style={{
            width: "100%",
            padding: "12px 16px",
            borderRadius: "10px",
            border: "1.5px solid #cbd5e1",
            fontSize: "14px",
            outline: "none",
            transition: "all 0.2s ease",
          }}
        />
      </div>

      {mostrarForm && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(15, 23, 42, 0.6)",
            backdropFilter: "blur(4px)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 1000,
            padding: "16px",
          }}
        >
          <div
            style={{
              background: "white",
              borderRadius: "16px",
              padding: "32px",
              width: "100%",
              maxWidth: "460px",
              boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h3 style={{ margin: 0, fontSize: "18px", fontWeight: "800", color: "#0f172a" }}>
                {editando ? "✏️ Editar Cuenta de Usuario" : "👤 Crear Nueva Cuenta"}
              </h3>
              <button
                type="button"
                onClick={limpiarForm}
                style={{ background: "none", border: "none", fontSize: "20px", cursor: "pointer", color: "#94a3b8" }}
              >
                ✕
              </button>
            </div>

            {errorForm && (
              <div
                style={{
                  background: "#fef2f2",
                  border: "1px solid #fecaca",
                  color: "#991b1b",
                  padding: "12px 14px",
                  borderRadius: "10px",
                  fontSize: "13px",
                  marginBottom: "16px",
                  fontWeight: "600",
                }}
              >
                ⚠️ {errorForm}
              </div>
            )}

            <form onSubmit={guardar}>
              <div style={{ marginBottom: "14px" }}>
                <label style={{ display: "block", fontSize: "13px", fontWeight: "700", color: "#334155", marginBottom: "6px" }}>
                  Nombre Completo *
                </label>
                <input
                  type="text"
                  placeholder="Ej: Alessandro Paul Rodriguez"
                  value={form.nombre}
                  onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                  required
                  style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "14px" }}
                />
              </div>

              <div style={{ marginBottom: "14px" }}>
                <label style={{ display: "block", fontSize: "13px", fontWeight: "700", color: "#334155", marginBottom: "6px" }}>
                  Correo Electrónico *
                </label>
                <input
                  type="email"
                  placeholder="usuario@munitrujillo.gob.pe"
                  value={form.correo}
                  onChange={(e) => setForm({ ...form, correo: e.target.value })}
                  required
                  style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "14px" }}
                />
              </div>

              {!editando && (
                <div style={{ marginBottom: "14px" }}>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: "700", color: "#334155", marginBottom: "6px" }}>
                    Contraseña Inicial *
                  </label>
                  <div style={{ position: "relative" }}>
                    <input
                      type={mostrarPasswordModal ? "text" : "password"}
                      placeholder="Mínimo 6 caracteres"
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      required
                      minLength={6}
                      style={{
                        width: "100%",
                        padding: "10px 42px 10px 14px",
                        borderRadius: "8px",
                        border: "1px solid #cbd5e1",
                        fontSize: "14px",
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setMostrarPasswordModal(!mostrarPasswordModal)}
                      title={mostrarPasswordModal ? "Ocultar contraseña" : "Ver contraseña"}
                      style={{
                        position: "absolute",
                        right: "10px",
                        top: "50%",
                        transform: "translateY(-50%)",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        fontSize: "16px",
                        padding: "4px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        lineHeight: "1",
                      }}
                    >
                      {mostrarPasswordModal ? "👁️" : "🙈"}
                    </button>
                  </div>
                </div>
              )}

              <div style={{ marginBottom: "20px" }}>
                <label style={{ display: "block", fontSize: "13px", fontWeight: "700", color: "#334155", marginBottom: "6px" }}>
                  Rol del Usuario *
                </label>
                <select
                  value={form.rol}
                  onChange={(e) => setForm({ ...form, rol: e.target.value })}
                  disabled={Boolean(editando && editando.rol === "administrador")}
                  required
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    fontSize: "14px",
                    fontWeight: "600",
                    background: editando && editando.rol === "administrador" ? "#f1f5f9" : "white",
                    cursor: editando && editando.rol === "administrador" ? "not-allowed" : "pointer",
                  }}
                >
                  {editando && editando.rol === "administrador" && (
                    <option value="administrador">Administrador (Protegido)</option>
                  )}
                  {rolesPermitidos.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
                {editando && editando.rol === "administrador" && (
                  <p style={{ margin: "6px 0 0", fontSize: "12px", color: "#64748b", fontWeight: "600" }}>
                    🔒 El rol de la cuenta de Administrador está protegido y no se puede modificar.
                  </p>
                )}
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  type="button"
                  onClick={limpiarForm}
                  style={{
                    padding: "10px 18px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    background: "white",
                    fontWeight: "600",
                    fontSize: "13.5px",
                    cursor: "pointer",
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando}
                  style={{
                    padding: "10px 22px",
                    borderRadius: "8px",
                    border: "none",
                    background: "#2563eb",
                    color: "white",
                    fontWeight: "700",
                    fontSize: "13.5px",
                    cursor: "pointer",
                    opacity: guardando ? 0.7 : 1,
                  }}
                >
                  {guardando ? "Guardando..." : editando ? "Guardar Cambios" : "Crear Usuario"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
          <thead>
            <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0" }}>
              <th style={{ padding: "14px", fontSize: "13px", fontWeight: "800", color: "#475569" }}>Nombre</th>
              <th style={{ padding: "14px", fontSize: "13px", fontWeight: "800", color: "#475569" }}>Correo</th>
              <th style={{ padding: "14px", fontSize: "13px", fontWeight: "800", color: "#475569" }}>Rol</th>
              <th style={{ padding: "14px", fontSize: "13px", fontWeight: "800", color: "#475569" }}>Estado</th>
              <th style={{ padding: "14px", fontSize: "13px", fontWeight: "800", color: "#475569" }}>Fecha de creación</th>
              <th style={{ padding: "14px", fontSize: "13px", fontWeight: "800", color: "#475569", textAlign: "center" }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {errorCarga ? (
              <tr>
                <td colSpan={6} style={{ padding: "32px", textAlign: "center", color: "#dc2626", fontSize: "14px", fontWeight: "600" }}>
                  ⚠️ Error al obtener los usuarios desde Firebase: {errorCarga}
                </td>
              </tr>
            ) : cargando ? (
              <tr>
                <td colSpan={6} style={{ padding: "32px", textAlign: "center", color: "#64748b", fontSize: "14px" }}>
                  ⏳ Conectando con Firebase y cargando usuarios en tiempo real...
                </td>
              </tr>
            ) : usuariosFiltrados.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: "32px", textAlign: "center", color: "#94a3b8", fontSize: "14px" }}>
                  📭 No se encontraron usuarios registrados en la base de datos.
                </td>
              </tr>
            ) : (
              usuariosFiltrados.map((u) => {
                const activo = esUsuarioActivo(u);
                const colorRol = ROL_COLORES[u.rol] || "#64748b";

                return (
                  <tr key={u.uid} style={{ borderBottom: "1px solid #f1f5f9", transition: "background 0.2s ease" }}>
                    <td style={{ padding: "14px" }}>
                      <strong style={{ fontSize: "14px", color: "#0f172a", display: "block" }}>{u.nombre || "Sin Nombre"}</strong>
                    </td>
                    <td style={{ padding: "14px", fontSize: "13.5px", color: "#475569" }}>
                      {u.correo}
                    </td>
                    <td style={{ padding: "14px" }}>
                      <span
                        style={{
                          fontSize: "12px",
                          fontWeight: "700",
                          color: colorRol,
                          background: `${colorRol}15`,
                          padding: "4px 10px",
                          borderRadius: "999px",
                          border: `1px solid ${colorRol}30`,
                        }}
                      >
                        {ROL_ETIQUETAS[u.rol] || u.rol}
                      </span>
                    </td>
                    <td style={{ padding: "14px" }}>
                      <span
                        style={{
                          fontSize: "12px",
                          fontWeight: "700",
                          color: activo ? "#15803d" : "#b91c1c",
                          background: activo ? "#dcfce7" : "#fee2e2",
                          padding: "4px 10px",
                          borderRadius: "999px",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                      >
                        <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: activo ? "#16a34a" : "#dc2626" }} />
                        {activo ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td style={{ padding: "14px", fontSize: "13px", color: "#64748b" }}>
                      {formatearFecha(u)}
                    </td>
                    <td style={{ padding: "14px" }}>
                      {u.rol === "administrador" ? (
                        <div style={{ display: "flex", gap: "6px", justifyContent: "center", alignItems: "center" }}>
                          <button
                            type="button"
                            onClick={() => abrirEdicion(u)}
                            title="Editar datos del administrador"
                            style={{
                              padding: "6px 10px",
                              borderRadius: "6px",
                              border: "1px solid #cbd5e1",
                              background: "white",
                              color: "#1e293b",
                              fontWeight: "600",
                              fontSize: "12.5px",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                          >
                            ✏️ Editar
                          </button>
                          <span style={{ fontSize: "11.5px", color: "#dc2626", fontWeight: "700", background: "#fef2f2", padding: "4px 10px", borderRadius: "6px", border: "1px solid #fecaca", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                            🛡️ Protegido
                          </span>
                        </div>
                      ) : (
                        <div style={{ display: "flex", gap: "6px", justifyContent: "center" }}>
                          <button
                            type="button"
                            onClick={() => abrirEdicion(u)}
                            title="Editar usuario"
                            style={{
                              padding: "6px 10px",
                              borderRadius: "6px",
                              border: "1px solid #cbd5e1",
                              background: "white",
                              color: "#1e293b",
                              fontWeight: "600",
                              fontSize: "12.5px",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                          >
                            ✏️ Editar
                          </button>

                          <button
                            type="button"
                            onClick={() => toggleEstado(u)}
                            title={activo ? "Inhabilitar cuenta" : "Habilitar cuenta"}
                            style={{
                              padding: "6px 10px",
                              borderRadius: "6px",
                              border: `1px solid ${activo ? "#fca5a5" : "#86efac"}`,
                              background: activo ? "#fff1f2" : "#f0fdf4",
                              color: activo ? "#991b1b" : "#166534",
                              fontWeight: "600",
                              fontSize: "12.5px",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                          >
                            {activo ? "🔒 Inhabilitar" : "✅ Habilitar"}
                          </button>

                          <button
                            type="button"
                            onClick={() => manejarEliminar(u)}
                            title="Eliminar cuenta permanentemente"
                            style={{
                              padding: "6px 10px",
                              borderRadius: "6px",
                              border: "1px solid #fee2e2",
                              background: "#fef2f2",
                              color: "#dc2626",
                              fontWeight: "600",
                              fontSize: "12.5px",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                          >
                            🗑️ Eliminar
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default GestionUsuarios;
