import { useState, useEffect } from "react";
import "./style.css";
import { collection, query, where, getDocs, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";

import LandingPage from "./components/LandingPage";
import Login from "./components/Login";
import Sidebar from "./components/Sidebar";
import PanelNegocio from "./components/PanelNegocio";
import PanelCajero from "./components/PanelCajero";
import PanelFuncionario from "./components/PanelFuncionario";
import PanelInspector from "./components/PanelInspector";
import PanelAdmin from "./components/PanelAdmin";

import { useAuth } from "./context/AuthContext";
import { cerrarSesion } from "./services/authService";

function App() {
  const { usuario, cargando } = useAuth();
  const [vista, setVista] = useState(() => {
    return localStorage.getItem("web_municipal_vista") || "landing";
  });
  const [seccion, setSeccion] = useState(() => {
    return localStorage.getItem("web_municipal_seccion") || "inicio";
  });
  const [sidebarAbierto, setSidebarAbierto] = useState(window.innerWidth > 1024);
  const [esMovil, setEsMovil] = useState(window.innerWidth <= 1024);

  useEffect(() => {
    if (usuario) {
      if (["landing", "login", "registro"].includes(vista)) {
        const storedVista = localStorage.getItem("web_municipal_vista");
        const nextVista = (storedVista && storedVista !== "landing" && storedVista !== "login" && storedVista !== "registro")
          ? storedVista
          : "dashboard";
        setVista(nextVista);
        localStorage.setItem("web_municipal_vista", nextVista);
      } else {
        localStorage.setItem("web_municipal_vista", vista);
      }
    } else {
      if (!["landing", "login", "registro"].includes(vista)) {
        setVista("landing");
        localStorage.setItem("web_municipal_vista", "landing");
      }
    }
  }, [usuario, vista]);
  const [notificacionesNoLeidas, setNotificacionesNoLeidas] = useState(0);

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
    setVista("landing");
    setSeccion("inicio");
  };

  const rolEtiqueta = {
    negocio: "Solicitante",
    cajero: "Cajero",
    funcionario: "Funcionario",
    inspector: "Inspector",
    administrador: "Administrador",
  };

  const rolColor = {
    negocio: "#2563eb",
    cajero: "#d97706",
    funcionario: "#0f766e",
    inspector: "#7c3aed",
    administrador: "#dc2626",
  };

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

  if ((vista === "login" || vista === "registro") && !usuario) {
    return (
      <Login
        onVolver={() => { setVista("landing"); localStorage.setItem("web_municipal_vista", "landing"); }}
        modoInicial={vista === "registro" ? "registro" : "login"}
      />
    );
  }

  if (!usuario || vista === "landing") {
    return (
      <LandingPage
        onLogin={() => { setVista("login"); localStorage.setItem("web_municipal_vista", "login"); }}
        onRegister={() => { setVista("registro"); localStorage.setItem("web_municipal_vista", "registro"); }}
      />
    );
  }

  const seccionesPorRol = {
    negocio: ["inicio", "nueva-solicitud", "mis-solicitudes", "mis-pagos", "notificaciones", "mi-cuenta"],
    cajero: ["inicio", "nueva-solicitud", "historial"],
    funcionario: ["inicio", "solicitudes", "notificaciones", "estadisticas", "reportes"],
    inspector: ["inicio", "inspecciones-hoy", "historial", "estadisticas"],
    administrador: ["inicio", "gestion-usuarios", "gestion-roles", "auditoria", "config-sistema"],
  };

  const renderSeccion = () => {
    if (usuario.rol === "negocio") {
      switch (seccion) {
        case "nueva-solicitud": return <PanelNegocio seccion="nueva-solicitud" />;
        case "mis-solicitudes": return <PanelNegocio seccion="mis-solicitudes" />;
        case "mis-comprobantes": return <PanelNegocio seccion="mis-comprobantes" />;
        case "mis-pagos": return <PanelNegocio seccion="mis-comprobantes" />;
        case "notificaciones": return <PanelNegocio seccion="notificaciones" />;
        case "mi-cuenta": return <PanelNegocio seccion="mi-cuenta" />;
        default: return <PanelNegocio seccion="inicio" />;
      }
    }
    if (usuario.rol === "cajero") {
      switch (seccion) {
        case "nueva-solicitud": return <PanelCajero seccion="nueva-solicitud" />;
        case "historial": return <PanelCajero seccion="historial" />;
        case "estadisticas": return <PanelCajero seccion="estadisticas" />;
        default: return <PanelCajero seccion="inicio" />;
      }
    }
    if (usuario.rol === "funcionario") {
      switch (seccion) {
        case "solicitudes": return <PanelFuncionario seccion="solicitudes" />;
        case "notificaciones": return <PanelFuncionario seccion="notificaciones" />;
        case "reportes": return <PanelFuncionario seccion="reportes" />;
        case "estadisticas": return <PanelFuncionario seccion="estadisticas" />;
        default: return <PanelFuncionario seccion="inicio" />;
      }
    }
    if (usuario.rol === "inspector") {
      switch (seccion) {
        case "inspecciones-hoy": return <PanelInspector seccion="inspecciones-hoy" />;
        case "historial": return <PanelInspector seccion="historial" />;
        case "estadisticas": return <PanelInspector seccion="estadisticas" />;
        default: return <PanelInspector seccion="inicio" />;
      }
    }
    if (usuario.rol === "administrador") {
      switch (seccion) {
        case "gestion-usuarios": return <PanelAdmin seccion="gestion-usuarios" />;
        case "gestion-roles": return <PanelAdmin seccion="gestion-roles" />;
        case "auditoria": return <PanelAdmin seccion="auditoria" />;
        case "config-sistema": return <PanelAdmin seccion="config-sistema" />;
        default: return <PanelAdmin seccion="inicio" />;
      }
    }
    return (
      <div className="section-card" style={{ textAlign: "center", padding: "60px 28px" }}>
        <div style={{ width: "72px", height: "72px", borderRadius: "50%", background: "#fee2e2", display: "grid", placeItems: "center", margin: "0 auto 20px", fontSize: "32px" }}>&#9888;</div>
        <h2 style={{ color: "#1f3b57", marginBottom: "8px" }}>Rol no reconocido</h2>
        <p style={{ color: "#64748b", maxWidth: "400px", margin: "0 auto" }}>Tu usuario no tiene un rol válido asignado. Contacta al administrador.</p>
      </div>
    );
  };

  return (
    <div className="dashboard">
      <Sidebar
        usuario={usuario}
        rolEtiqueta={rolEtiqueta}
        rolColor={rolColor}
        seccion={seccion}
        onCambiarSeccion={cambiarSeccion}
        abierto={sidebarAbierto}
        onToggle={() => setSidebarAbierto(!sidebarAbierto)}
        secciones={seccionesPorRol[usuario.rol] || []}
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
              <div style={{ width: "34px", height: "34px", borderRadius: "50%", background: rolColor[usuario.rol] || "#6366f1", display: "grid", placeItems: "center", color: "white", fontWeight: 800, fontSize: "14px" }}>
                {usuario.nombre?.charAt(0)?.toUpperCase() || "U"}
              </div>
              <div>
                <p style={{ margin: 0, fontSize: "14px", fontWeight: 700, color: "white" }}>{usuario.nombre || "Usuario"}</p>
                <span style={{ fontSize: "11px", fontWeight: 700, color: rolColor[usuario.rol] || "#6366f1", background: "white", padding: "2px 8px", borderRadius: "999px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  {rolEtiqueta[usuario.rol] || usuario.rol}
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