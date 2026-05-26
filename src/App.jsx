import "./style.css";

import Login from "./components/Login";
import PanelNegocio from "./components/PanelNegocio";
import PanelFuncionario from "./components/PanelFuncionario";
import PanelInspector from "./components/PanelInspector";

import { useAuth } from "./context/AuthContext";
import { cerrarSesion } from "./services/authService";

function App() {
  const { usuario, cargando } = useAuth();

  const salir = async () => {
    await cerrarSesion();
  };

  if (cargando) {
    return <div className="loading">Cargando sistema...</div>;
  }

  if (!usuario) {
    return <Login />;
  }

  return (
    <div className="dashboard">
      <header className="topbar">
        <div>
          <h2>Municipalidad de Trujillo</h2>
          <p>Sistema de Licencias de Funcionamiento</p>
        </div>

        <div className="topbar-user">
          <button type="button" onClick={salir}>
            Cerrar sesión
          </button>
        </div>
      </header>

      <main className="content">
        {usuario.rol === "negocio" && <PanelNegocio />}

        {usuario.rol === "funcionario" && <PanelFuncionario />}

        {usuario.rol === "inspector" && <PanelInspector />}

        {!["negocio", "funcionario", "inspector"].includes(usuario.rol) && (
          <div className="section-card">
            <h2>Rol no reconocido</h2>
            <p>Tu usuario no tiene un rol válido asignado.</p>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;