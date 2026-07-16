import "./style.css";

import Login from "./components/Login";
import PanelNegocio from "./components/PanelNegocio";
import PanelCajero from "./components/PanelCajero";
import PanelFuncionario from "./components/PanelFuncionario";
import PanelInspector from "./components/PanelInspector";

import { useAuth } from "./context/AuthContext";
import { cerrarSesion } from "./services/authService";

function App() {
  const { usuario, cargando } = useAuth();

  const salir = async () => {
    await cerrarSesion();
  };

  const rolEtiqueta = {
    negocio: "Solicitante",
    cajero: "Cajero",
    funcionario: "Funcionario",
    inspector: "Inspector",
  };

  const rolColor = {
    negocio: "#2563eb",
    cajero: "#d97706",
    funcionario: "#0f766e",
    inspector: "#7c3aed",
  };

  if (cargando) {
    return (
      <div className="loading">
        <span style={{ color: "#1f3b57", fontWeight: 700, fontSize: "18px" }}>
          Cargando sistema...
        </span>
      </div>
    );
  }

  if (!usuario) {
    return <Login />;
  }

  return (
    <div className="dashboard">
      <header className="topbar">
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div
            style={{
              width: "42px",
              height: "42px",
              borderRadius: "12px",
              background: "rgba(255,255,255,0.15)",
              display: "grid",
              placeItems: "center",
              fontSize: "20px",
              backdropFilter: "blur(8px)",
              border: "1px solid rgba(255,255,255,0.2)",
            }}
          >
            &#9881;
          </div>
          <div>
            <h2 style={{ fontSize: "18px", fontWeight: 800, letterSpacing: "-0.02em" }}>
              Municipalidad de Trujillo
            </h2>
            <p style={{ fontSize: "13px", color: "#93c5fd", margin: 0 }}>
              Sistema de Licencias de Funcionamiento
            </p>
          </div>
        </div>

        <div className="topbar-user">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              background: "rgba(255,255,255,0.1)",
              padding: "8px 16px",
              borderRadius: "14px",
              border: "1px solid rgba(255,255,255,0.15)",
              backdropFilter: "blur(8px)",
            }}
          >
            <div
              style={{
                width: "34px",
                height: "34px",
                borderRadius: "50%",
                background: rolColor[usuario.rol] || "#6366f1",
                display: "grid",
                placeItems: "center",
                color: "white",
                fontWeight: 800,
                fontSize: "14px",
              }}
            >
              {usuario.nombre?.charAt(0)?.toUpperCase() || "U"}
            </div>
            <div>
              <p
                style={{
                  margin: 0,
                  fontSize: "14px",
                  fontWeight: 700,
                  color: "white",
                }}
              >
                {usuario.nombre || "Usuario"}
              </p>
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  color: rolColor[usuario.rol] || "#6366f1",
                  background: "white",
                  padding: "2px 8px",
                  borderRadius: "999px",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                {rolEtiqueta[usuario.rol] || usuario.rol}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={salir}
            style={{
              background: "rgba(255,255,255,0.12)",
              color: "white",
              border: "1px solid rgba(255,255,255,0.25)",
              backdropFilter: "blur(8px)",
              fontSize: "13px",
              fontWeight: 600,
            }}
          >
            Cerrar sesion
          </button>
        </div>
      </header>

      <main className="content">
        {usuario.rol === "negocio" && <PanelNegocio />}

        {usuario.rol === "cajero" && <PanelCajero />}

        {usuario.rol === "funcionario" && <PanelFuncionario />}

        {usuario.rol === "inspector" && <PanelInspector />}

        {!["negocio", "cajero", "funcionario", "inspector"].includes(usuario.rol) && (
          <div className="section-card" style={{ textAlign: "center", padding: "60px 28px" }}>
            <div
              style={{
                width: "72px",
                height: "72px",
                borderRadius: "50%",
                background: "#fee2e2",
                display: "grid",
                placeItems: "center",
                margin: "0 auto 20px",
                fontSize: "32px",
              }}
            >
              &#9888;
            </div>
            <h2 style={{ color: "#1f3b57", marginBottom: "8px" }}>Rol no reconocido</h2>
            <p style={{ color: "#64748b", maxWidth: "400px", margin: "0 auto" }}>
              Tu usuario no tiene un rol valido asignado. Contacta al administrador.
            </p>
          </div>
        )}
      </main>

      <footer
        style={{
          padding: "20px 40px",
          textAlign: "center",
          color: "#94a3b8",
          fontSize: "13px",
          borderTop: "1px solid #e2e8f0",
          background: "white",
        }}
      >
        Sistema Municipal de Licencias v1.0 &mdash; Municipalidad de Trujillo &copy; {new Date().getFullYear()}
      </footer>
    </div>
  );
}

export default App;