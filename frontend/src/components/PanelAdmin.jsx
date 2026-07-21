import { useState, useEffect } from "react";
import { useAuth, normalizarRol } from "../context/AuthContext";
import { db } from "../firebase";
import { collection, onSnapshot, getDocs } from "firebase/firestore";
import { obtenerUsuariosInternos } from "../services/adminService";
import GestionUsuarios from "./GestionUsuarios";

const desduplicarPorEmail = (lista) => {
  const mapa = new Map();
  for (const u of lista) {
    const email = (u.correo || u.email || "").trim().toLowerCase();
    if (!email) continue;
    if (!mapa.has(email)) {
      mapa.set(email, u);
    } else {
      const existente = mapa.get(email);
      const existenteEsSintetico = (existente.uid || "").includes("-001");
      const nuevoEsSintetico = (u.uid || "").includes("-001");

      if (existenteEsSintetico && !nuevoEsSintetico) {
        mapa.set(email, u);
      } else if (!existenteEsSintetico && nuevoEsSintetico) {
        // mantener existente
      } else {
        if (u.estado === "activo" && existente.estado !== "activo") {
          mapa.set(email, u);
        }
      }
    }
  }
  return Array.from(mapa.values());
};

function PanelAdmin({ seccion }) {
  const { usuario } = useAuth();
  const [usuarios, setUsuarios] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState("");

  useEffect(() => {
    let unsub = null;

    try {
      const colRef = collection(db, "usuarios");
      unsub = onSnapshot(
        colRef,
        (snapshot) => {
          try {
            const rawList = snapshot.docs.map((d) => {
              const data = d.data();
              const rolNorm = normalizarRol(data.rol, data.correo || data.email);
              const esActivo = data.estado === "activo" || (data.estado !== "inactivo" && data.estado !== "desactivado" && data.activo !== false);

              return {
                uid: d.id,
                id: d.id,
                nombre: data.nombre || data.nombre_completo || data.displayName || "Usuario Registrado",
                correo: (data.correo || data.email || "").trim().toLowerCase(),
                rol: rolNorm,
                rolOriginal: data.rol || null,
                estado: esActivo ? "activo" : "inactivo",
                activo: esActivo,
                fechaCreacion: data.fechaCreacion || data.creadoEn || null,
                ...data,
              };
            });

            const listaUnica = desduplicarPorEmail(rawList);

            listaUnica.sort((a, b) => {
              const tA = a.fechaCreacion?.seconds || a.creadoEn?.seconds || 0;
              const tB = b.fechaCreacion?.seconds || b.creadoEn?.seconds || 0;
              return tB - tA;
            });

            setUsuarios(listaUnica);
            setErrorCarga("");
          } catch (errSnap) {
            console.error("[ADMIN] Error procesando snapshot:", errSnap);
            setErrorCarga("Error al procesar la lista de usuarios.");
          } finally {
            setCargando(false);
          }
        },
        async (errFirestore) => {
          console.warn("[ADMIN] Error en listener onSnapshot de Firestore, usando API de respaldo:", errFirestore.message);
          try {
            const apiUsers = await obtenerUsuariosInternos();
            const listaUnica = desduplicarPorEmail(apiUsers);
            setUsuarios(listaUnica);
            setErrorCarga("");
          } catch (errApi) {
            setErrorCarga("Error de conexión con la base de datos de usuarios: " + (errApi.message || errFirestore.message));
          } finally {
            setCargando(false);
          }
        }
      );
    } catch (err) {
      console.error("[ADMIN] Error iniciando listener:", err);
      setErrorCarga("Error al inicializar la escucha de datos.");
      setCargando(false);
    }

    return () => {
      if (unsub) unsub();
    };
  }, []);

  const recargarForzado = async () => {
    try {
      const colRef = collection(db, "usuarios");
      const snapshot = await getDocs(colRef);
      const rawList = snapshot.docs.map((d) => {
        const data = d.data();
        const rolNorm = normalizarRol(data.rol, data.correo || data.email);
        const esActivo = data.estado === "activo" || (data.estado !== "inactivo" && data.estado !== "desactivado" && data.activo !== false);

        return {
          uid: d.id,
          id: d.id,
          nombre: data.nombre || data.nombre_completo || data.displayName || "Usuario Registrado",
          correo: (data.correo || data.email || "").trim().toLowerCase(),
          rol: rolNorm,
          rolOriginal: data.rol || null,
          estado: esActivo ? "activo" : "inactivo",
          activo: esActivo,
          fechaCreacion: data.fechaCreacion || data.creadoEn || null,
          ...data,
        };
      });

      const listaUnica = desduplicarPorEmail(rawList);
      listaUnica.sort((a, b) => {
        const tA = a.fechaCreacion?.seconds || a.creadoEn?.seconds || 0;
        const tB = b.fechaCreacion?.seconds || b.creadoEn?.seconds || 0;
        return tB - tA;
      });

      setUsuarios(listaUnica);
      setErrorCarga("");
    } catch (errFS) {
      console.warn("[ADMIN] Reintento recarga via API:", errFS.message);
      try {
        const apiUsers = await obtenerUsuariosInternos();
        const listaUnica = desduplicarPorEmail(apiUsers);
        setUsuarios(listaUnica);
        setErrorCarga("");
      } catch (errApi) {
        console.warn("[ADMIN] No se pudo recargar usuarios via API:", errApi.message);
      }
    }
  };

  return (
    <GestionUsuarios
      usuarios={usuarios}
      onRecargar={recargarForzado}
      cargando={cargando}
      errorCarga={errorCarga}
    />
  );

  const inspectoresActivos = usuarios.filter((u) => u.rol === "inspector" && u.estado === "activo").length;
  const cajerosActivos = usuarios.filter((u) => u.rol === "cajero" && u.estado === "activo").length;
  const adminTotales = usuarios.filter((u) => u.rol === "administrador").length;

  return (
    <div>
      <div style={{ background: "linear-gradient(135deg, #dc2626 0%, #991b1b 100%)", borderRadius: "16px", padding: "28px 32px", marginBottom: "24px", color: "white" }}>
        <div>
          <span style={{ background: "rgba(255,255,255,0.15)", color: "white", padding: "4px 12px", borderRadius: "20px", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Panel de Administración
          </span>
          <h1 style={{ margin: "8px 0 4px", fontSize: "24px", fontWeight: "800" }}>
            Bienvenido, {usuario?.nombre || "Administrador"}
          </h1>
          <p style={{ margin: 0, fontSize: "14px", color: "#fca5a5" }}>
            Gestión de cuentas de usuarios del sistema en tiempo real.
          </p>
        </div>
      </div>

      {errorCarga && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", padding: "14px 18px", borderRadius: "12px", marginBottom: "20px", fontWeight: "600", fontSize: "14px" }}>
          ⚠️ {errorCarga}
        </div>
      )}

      {cargando ? (
        <div style={{ textAlign: "center", padding: "60px", color: "#94a3b8" }}>Cargando datos en tiempo real de Firebase...</div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px", marginBottom: "24px" }}>
            <div style={{ background: "white", borderLeft: "4px solid #2563eb", borderRadius: "10px", padding: "18px 20px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", display: "flex", alignItems: "center", gap: "14px" }}>
              <div style={{ width: "42px", height: "42px", borderRadius: "10px", background: "#eff6ff", color: "#2563eb", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px", flexShrink: 0 }}>👥</div>
              <div>
                <strong style={{ fontSize: "22px", color: "#0f172a", display: "block" }}>{usuarios.length}</strong>
                <span style={{ fontSize: "12.5px", color: "#64748b" }}>Usuarios Registrados</span>
              </div>
            </div>
            <div style={{ background: "white", borderLeft: "4px solid #16a34a", borderRadius: "10px", padding: "18px 20px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", display: "flex", alignItems: "center", gap: "14px" }}>
              <div style={{ width: "42px", height: "42px", borderRadius: "10px", background: "#f0fdf4", color: "#16a34a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px", flexShrink: 0 }}>✅</div>
              <div>
                <strong style={{ fontSize: "22px", color: "#0f172a", display: "block" }}>{usuarios.filter((u) => u.estado === "activo").length}</strong>
                <span style={{ fontSize: "12.5px", color: "#64748b" }}>Activos</span>
              </div>
            </div>
            <div style={{ background: "white", borderLeft: "4px solid #dc2626", borderRadius: "10px", padding: "18px 20px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", display: "flex", alignItems: "center", gap: "14px" }}>
              <div style={{ width: "42px", height: "42px", borderRadius: "10px", background: "#fef2f2", color: "#dc2626", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px", flexShrink: 0 }}>🚫</div>
              <div>
                <strong style={{ fontSize: "22px", color: "#0f172a", display: "block" }}>{usuarios.filter((u) => u.estado === "inactivo").length}</strong>
                <span style={{ fontSize: "12.5px", color: "#64748b" }}>Inactivos</span>
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            <div style={{ background: "white", borderRadius: "12px", padding: "22px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", border: "1px solid #e2e8f0" }}>
              <h3 style={{ margin: "0 0 14px", color: "#0f172a", fontSize: "16px" }}>Límites y Distribución por Rol</h3>
              <div style={{ display: "grid", gap: "12px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#f8fafc", padding: "10px 14px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                  <span style={{ fontSize: "13px", fontWeight: "700", color: "#475569" }}>👮 Inspector Activo</span>
                  <strong style={{ fontSize: "14px", color: inspectoresActivos >= 1 ? "#7c3aed" : "#16a34a" }}>
                    {inspectoresActivos} / 1
                  </strong>
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#f8fafc", padding: "10px 14px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                  <span style={{ fontSize: "13px", fontWeight: "700", color: "#475569" }}>💰 Cajeros Activos</span>
                  <strong style={{ fontSize: "14px", color: cajerosActivos >= 5 ? "#d97706" : "#16a34a" }}>
                    {cajerosActivos} / 5
                  </strong>
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#f8fafc", padding: "10px 14px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                  <span style={{ fontSize: "13px", fontWeight: "700", color: "#475569" }}>🛡️ Administradores</span>
                  <strong style={{ fontSize: "14px", color: "#dc2626" }}>
                    {adminTotales}
                  </strong>
                </div>
              </div>
            </div>

            <div style={{ background: "white", borderRadius: "12px", padding: "22px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", border: "1px solid #e2e8f0", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" }}>
              <div style={{ fontSize: "40px", marginBottom: "10px" }}>👥</div>
              <h3 style={{ margin: "0 0 8px", color: "#0f172a", fontSize: "16px" }}>Gestionar Usuarios</h3>
              <p style={{ margin: "0 0 14px", color: "#64748b", fontSize: "13px", textAlign: "center" }}>Crear, editar, activar/inhabilitar y eliminar cuentas de usuario con sincronización en tiempo real.</p>
              <button
                type="button"
                onClick={() => {
                  const event = new CustomEvent("admin-navegar", { detail: "gestion-usuarios" });
                  window.dispatchEvent(event);
                }}
                style={{ background: "#dc2626", color: "white", border: "none", padding: "10px 22px", borderRadius: "8px", fontWeight: "bold", cursor: "pointer", fontSize: "13.5px" }}
              >
                Ir a Usuarios
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default PanelAdmin;

