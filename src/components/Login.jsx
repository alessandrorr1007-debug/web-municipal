import { useState } from "react";
import { iniciarSesion, registrarUsuario } from "../services/authService";
import { useAuth } from "../context/AuthContext";

function Login() {
  const { setUsuario } = useAuth();

  const [modo, setModo] = useState("login");
  const [nombre, setNombre] = useState("");
  const [correo, setCorreo] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const rol = "negocio";

  const manejarLogin = async (e) => {
    e.preventDefault();
    setError("");

    try {
      const dataUsuario = await iniciarSesion(correo, password);
      setUsuario(dataUsuario);
    } catch {
      setError("Correo o contraseña incorrectos.");
    }
  };

  const manejarRegistro = async (e) => {
    e.preventDefault();
    setError("");

    try {
      await registrarUsuario(nombre, correo, password, rol);
      const dataUsuario = await iniciarSesion(correo, password);
      setUsuario(dataUsuario);
    } catch {
      setError("No se pudo crear la cuenta. Verifica los datos.");
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-info">
          <h1>Licencia Municipal en Línea</h1>
          <p>
            Plataforma para solicitar, consultar y descargar licencias
            municipales de funcionamiento.
          </p>
        </div>

        <div className="login-form-box">
          <div className="tabs">
            <button
              type="button"
              className={modo === "login" ? "active" : ""}
              onClick={() => setModo("login")}
            >
              Iniciar sesión
            </button>

            <button
              type="button"
              className={modo === "registro" ? "active" : ""}
              onClick={() => setModo("registro")}
            >
              Crear cuenta
            </button>
          </div>

          <form onSubmit={modo === "login" ? manejarLogin : manejarRegistro}>
            {modo === "registro" && (
              <input
                type="text"
                placeholder="Nombre completo"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                required
              />
            )}

            <input
              type="email"
              placeholder="Correo electrónico"
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              required
            />

            <input
              type="password"
              placeholder="Contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            {error && <p className="error">{error}</p>}

            <button className="primary-btn" type="submit">
              {modo === "login" ? "Ingresar" : "Crear cuenta"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default Login;