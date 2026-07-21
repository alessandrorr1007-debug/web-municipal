import { useState, useEffect } from "react";
import "./style.css";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";

import Login from "./components/Login";
import Sidebar from "./components/Sidebar";
import PanelCajero from "./components/PanelCajero";
import PanelInspector from "./components/PanelInspector";
import PanelAdmin from "./components/PanelAdmin";
import PagoExitoso from "./components/PagoExitoso";
import ErrorBoundary from "./components/ErrorBoundary";

import { useAuth, normalizarRol } from "./context/AuthContext";
import { cerrarSesion } from "./services/authService";

function App() {
  const { usuario, cargando } = useAuth();
  const [vista, setVista] = useState(() => {
    return localStorage.getItem("web_municipal_vista") || "login";
  });
  const [seccion, setSeccion] = useState(() => {
    return localStorage.getItem("web_municipal_seccion") || "inicio";
  });
  const [sidebarAbierto, setSidebarAbierto] = useState(window.innerWidth > 1024);
  const [esMovil, setEsMovil] = useState(window.innerWidth <= 1024);
  const [notificacionesNoLeidas, setNotificacionesNoLeidas] = useState(0);

  useEffect(() => {
    if (usuario) {
      if (["login", "registro"].includes(vista)) {
        const storedVista = localStorage.getItem("web_municipal_vista");
        const nextVista = (storedVista && storedVista !== "login" && storedVista !== "registro")
          ? storedVista
          : "dashboard";
        setVista(nextVista);
        localStorage.setItem("web_municipal_vista", nextVista);
      } else {
        localStorage.setItem("web_municipal_vista", vista);
      }
    } else {
      if (!["login", "registro"].includes(vista)) {
        setVista("login");
        localStorage.setItem("web_municipal_vista", "login");
      }
    }
  }, [usuario, vista]);

  useEffect(() => {
    if (!usuario) {
      setNotificacionesNoLeidas(0);
      return;
    }
    const q = query(
      collection(db, "notificaciones"),
      where("uid_usuario", "==", usuario.uid),
      where("leida", "==", false)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setNotificacionesNoLeidas(snapshot.size);
    }, (err) => {
      console.error("Error fetching unread notifications count:", err);
    });
    return () => unsubscribe();
  }, [usuario]);

  useEffect(() => {
    const handleResize = () => {
      const isMobile = window.innerWidth <= 1024;
      setEsMovil(isMobile);
      if (isMobile) {
        setSidebarAbierto(false);
      } else {
        setSidebarAbierto(true);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const cambiarSeccion = (nueva) => {
    setSeccion(nueva);
    localStorage.setItem("web_municipal_seccion", nueva);
    if (window.innerWidth <= 1024) {
      setSidebarAbierto(false);
    }
  };

  const salir = async () => {
    await cerrarSesion();
    localStorage.removeItem("web_municipal_vista");
    localStorage.removeItem("web_municipal_seccion");
    setVista("login");
    setSeccion("inicio");
  };

  if (window.location.pathname.replace(/\/$/, "") === "/pago-exitoso" || window.location.pathname.startsWith("/pago-exitoso")) {
    return (
      <ErrorBoundary>
        <PagoExitoso onRedirect={(s) => {
          window.history.replaceState({}, document.title, "/");
          setSeccion(s);
          localStorage.setItem("web_municipal_seccion", s);
        }} />
      </ErrorBoundary>
    );
  }

  if (cargando) {
    return (
      <div className="loading">
        <div className="spinner" />
        <span style={{ color: "#1f3b57", fontWeight: 700, fontSize: "18px" }}>
          Cargando sistema...
        </span>
      </div>
    );
  }

  if (!usuario || usuario.activo === false || usuario.estado === "inactivo" || usuario.estado === "desactivado") {
    return <Login errorInicial={usuario ? "⚠️ Esta cuenta está inhabilitada. Contacte al administrador del sistema." : ""} />;
  }

  const rolNorm = normalizarRol(usuario.rol, usuario.correo);

  const seccionesPorRol = {
    cajero: ["nueva-solicitud", "consulta-expedientes", "historial"],
    inspector: ["inicio", "inspecciones", "historial", "estadisticas"],
    administrador: ["gestion-usuarios", "config-sistema"],
  };

  const rolEtiqueta = {
    cajero: "Cajera",
    inspector: "Inspector",
    administrador: "Administrador",
  };

  const rolColor = {
    cajero: "#d97706",
    inspector: "#7c3aed",
    administrador: "#dc2626",
  };

  const seccionesDisponibles = seccionesPorRol[rolNorm] || [];
  const seccionActiva = seccionesDisponibles.includes(seccion) ? seccion : (seccionesDisponibles[0] || "nueva-solicitud");

  const renderSeccion = () => {
    if (rolNorm === "cajero") {
      switch (seccionActiva) {
        case "nueva-solicitud": return <PanelCajero seccion="nueva-solicitud" cambiarSeccion={cambiarSeccion} />;
        case "consulta-expedientes": return <PanelCajero seccion="consulta-expedientes" cambiarSeccion={cambiarSeccion} />;
        case "historial": return <PanelCajero seccion="historial" cambiarSeccion={cambiarSeccion} />;
        default: return <PanelCajero seccion="nueva-solicitud" cambiarSeccion={cambiarSeccion} />;
      }
    }
    if (rolNorm === "inspector") {
      switch (seccionActiva) {
        case "inspecciones": return <PanelInspector seccion="inspecciones" />;
        case "historial": return <PanelInspector seccion="historial" />;
        case "estadisticas": return <PanelInspector seccion="estadisticas" />;
        default: return <PanelInspector seccion="inicio" />;
      }
    }
    if (rolNorm === "administrador") {
      return <PanelAdmin seccion={seccionActiva} cambiarSeccion={cambiarSeccion} />;
    }
    return <PanelCajero seccion="nueva-solicitud" cambiarSeccion={cambiarSeccion} />;
  };

  return (
    <div className="dashboard">
      <Sidebar
        usuario={{ ...usuario, rol: rolNorm }}
        rolEtiqueta={rolEtiqueta}
        rolColor={rolColor}
        seccion={seccionActiva}
        onCambiarSeccion={cambiarSeccion}
        abierto={sidebarAbierto}
        onToggle={() => setSidebarAbierto(!sidebarAbierto)}
        secciones={seccionesPorRol[rolNorm] || []}
        notificacionesNoLeidas={notificacionesNoLeidas}
      />

      {sidebarAbierto && esMovil && (
        <div 
          onClick={() => setSidebarAbierto(false)} 
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(15, 23, 42, 0.4)",
            backdropFilter: "blur(2px)",
            zIndex: 99,
          }}
        />
      )}

      <div className={`dashboard-main ${sidebarAbierto ? "sidebar-open" : "sidebar-closed"}`}>
        <header className="topbar">
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <button
              type="button"
              onClick={() => setSidebarAbierto(!sidebarAbierto)}
              className="sidebar-toggle"
            >
              &#9776;
            </button>
            <div>
              <h2 style={{ fontSize: "18px", fontWeight: 800, letterSpacing: "-0.02em" }}>
                {seccion.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
              </h2>
              <p style={{ fontSize: "13px", color: "#93c5fd", margin: 0 }}>
                Municipalidad de Trujillo
              </p>
            </div>
          </div>

          <div className="topbar-user">
            <div style={{ display: "flex", alignItems: "center", gap: "12px", background: "rgba(255,255,255,0.1)", padding: "8px 16px", borderRadius: "14px", border: "1px solid rgba(255,255,255,0.15)", backdropFilter: "blur(8px)" }}>
              <div style={{ width: "34px", height: "34px", borderRadius: "50%", background: rolColor[rolNorm] || "#6366f1", display: "grid", placeItems: "center", color: "white", fontWeight: 800, fontSize: "14px" }}>
                {usuario.nombre?.charAt(0)?.toUpperCase() || "U"}
              </div>
              <div>
                <p style={{ margin: 0, fontSize: "14px", fontWeight: 700, color: "white" }}>{usuario.nombre || "Usuario"}</p>
                <span style={{ fontSize: "11px", fontWeight: 700, color: rolColor[rolNorm] || "#6366f1", background: "white", padding: "2px 8px", borderRadius: "999px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  {rolEtiqueta[rolNorm] || rolNorm}
                </span>
              </div>
            </div>
            <button type="button" onClick={salir} style={{ background: "rgba(255,255,255,0.12)", color: "white", border: "1px solid rgba(255,255,255,0.25)", backdropFilter: "blur(8px)", fontSize: "13px", fontWeight: 600 }}>
              Cerrar sesión
            </button>
          </div>
        </header>

        <main className="content">
          {renderSeccion()}
        </main>

        <footer style={{ padding: "20px 40px", textAlign: "center", color: "#94a3b8", fontSize: "13px", borderTop: "1px solid #e2e8f0", background: "white" }}>
          Sistema Municipal de Licencias v1.0 &mdash; Municipalidad de Trujillo &copy; {new Date().getFullYear()}
        </footer>
      </div>
    </div>
  );
}

export default App;
