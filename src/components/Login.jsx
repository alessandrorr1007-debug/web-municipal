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

  const pasos = [
    {
      numero: "1",
      titulo: "Crea tu cuenta",
      descripcion: "Regístrate como negocio para acceder al sistema municipal.",
    },
    {
      numero: "2",
      titulo: "Completa tu solicitud",
      descripcion: "Ingresa tu RUC, datos del local y adjunta tus documentos PDF.",
    },
    {
      numero: "3",
      titulo: "Realiza el pago",
      descripcion: "Paga el derecho de trámite y registra tu comprobante digital.",
    },
    {
      numero: "4",
      titulo: "Espera la inspección",
      descripcion: "Un inspector revisará tu local, observaciones y evidencias.",
    },
    {
      numero: "5",
      titulo: "Recibe tu resultado",
      descripcion: "El funcionario evaluará el informe y emitirá la decisión final.",
    },
    {
      numero: "6",
      titulo: "Descarga tu licencia",
      descripcion: "Si es aprobada, podrás descargar tu licencia municipal.",
    },
  ];

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-info">
          <span className="eyebrow">Municipalidad de Trujillo</span>

          <h1>Licencia Municipal en Línea</h1>

          <p>
            Plataforma para solicitar, consultar y descargar licencias
            municipales de funcionamiento de manera digital.
          </p>

          <div className="login-benefits">
            <span>Consulta RUC</span>
            <span>Pago del trámite</span>
            <span>Inspección municipal</span>
            <span>Licencia descargable</span>
          </div>
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

      <section className="login-steps-section">
        <div className="login-steps-header">
          <span className="eyebrow">Proceso digital</span>
          <h2>¿Cómo funciona?</h2>
          <p>
            Sigue estos pasos para registrar tu solicitud y obtener tu licencia
            municipal de funcionamiento.
          </p>
        </div>

        <div className="login-steps-grid">
          {pasos.map((paso) => (
            <div className="login-step-card" key={paso.numero}>
              <div className="step-number">{paso.numero}</div>
              <h3>{paso.titulo}</h3>
              <p>{paso.descripcion}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export default Login;