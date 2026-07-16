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
  const [cargando, setCargando] = useState(false);

  const rol = "negocio";

  const manejarLogin = async (e) => {
    e.preventDefault();
    setError("");
    setCargando(true);

    try {
      const dataUsuario = await iniciarSesion(correo, password);
      setUsuario(dataUsuario);
    } catch (err) {
      const msg = err?.message || "";
      if (msg.includes("user-not-found") || msg.includes("invalid-credential")) {
        setError("No encontramos una cuenta con ese correo electronico.");
      } else if (msg.includes("wrong-password") || msg.includes("invalid-credential")) {
        setError("La contrasena ingresada es incorrecta. Intenta de nuevo.");
      } else if (msg.includes("too-many-requests")) {
        setError("Demasiados intentos. Espera unos minutos e intentalo de nuevo.");
      } else {
        setError("No pudimos iniciar sesion. Verifica tus datos e intentalo de nuevo.");
      }
    } finally {
      setCargando(false);
    }
  };

  const manejarRegistro = async (e) => {
    e.preventDefault();
    setError("");

    if (nombre.trim().length < 3) {
      setError("El nombre debe tener al menos 3 caracteres.");
      return;
    }

    if (password.length < 6) {
      setError("La contrasena debe tener al menos 6 caracteres.");
      return;
    }

    setCargando(true);

    try {
      await registrarUsuario(nombre, correo, password, rol);
      const dataUsuario = await iniciarSesion(correo, password);
      setUsuario(dataUsuario);
    } catch (err) {
      const msg = err?.message || "";
      if (msg.includes("email-already-in-use")) {
        setError("Ya existe una cuenta registrada con ese correo electronico.");
      } else if (msg.includes("weak-password")) {
        setError("La contrasena es muy debil. Usa al menos 6 caracteres con letras y numeros.");
      } else {
        setError("No se pudo crear la cuenta. Verifica los datos e intentalo de nuevo.");
      }
    } finally {
      setCargando(false);
    }
  };

  const pasos = [
    {
      numero: "1",
      titulo: "Crea tu cuenta",
      descripcion: "Registrate como negocio para acceder al sistema municipal.",
    },
    {
      numero: "2",
      titulo: "Completa tu solicitud",
      descripcion: "Ingresa tu RUC, datos del local y adjunta tus documentos PDF.",
    },
    {
      numero: "3",
      titulo: "Realiza el pago",
      descripcion: "Paga el derecho de tramite y registra tu comprobante digital.",
    },
    {
      numero: "4",
      titulo: "Espera la inspeccion",
      descripcion: "Un inspector revisara tu local, observaciones y evidencias.",
    },
    {
      numero: "5",
      titulo: "Recibe tu resultado",
      descripcion: "El funcionario evaluara el informe y emitira la decision final.",
    },
    {
      numero: "6",
      titulo: "Descarga tu licencia",
      descripcion: "Si es aprobada, podras descargar tu licencia municipal.",
    },
  ];

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-info">
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "28px" }}>
            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "14px",
                background: "rgba(255,255,255,0.15)",
                display: "grid",
                placeItems: "center",
                fontSize: "24px",
                border: "1px solid rgba(255,255,255,0.2)",
              }}
            >
              &#9881;
            </div>
            <div>
              <span className="eyebrow" style={{ marginBottom: "2px" }}>Municipalidad de Trujillo</span>
              <p style={{ margin: 0, fontSize: "12px", color: "#93c5fd" }}>La Libertad, Peru</p>
            </div>
          </div>

          <h1 style={{ fontSize: "34px", lineHeight: 1.2 }}>
            Licencia Municipal de Funcionamiento
          </h1>

          <p style={{ fontSize: "15px", lineHeight: 1.7 }}>
            Plataforma oficial para solicitar, dar seguimiento y descargar
            licencias municipales de funcionamiento de tu negocio de manera
            100% digital.
          </p>

          <div className="login-benefits">
            <span>100% Digital</span>
            <span>Pago en linea</span>
            <span>Seguimiento en tiempo real</span>
            <span>Descarga inmediata</span>
          </div>
        </div>

        <div className="login-form-box">
          <div style={{ textAlign: "center", marginBottom: "24px" }}>
            <h2 style={{ margin: "0 0 6px", color: "#0f172a", fontSize: "22px" }}>
              {modo === "login" ? "Iniciar sesion" : "Crear cuenta"}
            </h2>
            <p style={{ margin: 0, color: "#64748b", fontSize: "14px" }}>
              {modo === "login"
                ? "Ingresa tus credenciales para acceder al sistema."
                : "Registrate para comenzar a solicitar licencias."}
            </p>
          </div>

          <div className="tabs">
            <button
              type="button"
              className={modo === "login" ? "active" : ""}
              onClick={() => {
                setModo("login");
                setError("");
              }}
            >
              Iniciar sesion
            </button>

            <button
              type="button"
              className={modo === "registro" ? "active" : ""}
              onClick={() => {
                setModo("registro");
                setError("");
              }}
            >
              Crear cuenta
            </button>
          </div>

          <form onSubmit={modo === "login" ? manejarLogin : manejarRegistro}>
            {modo === "registro" && (
              <div>
                <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#334155", marginBottom: "6px" }}>
                  Nombre completo
                </label>
                <input
                  type="text"
                  placeholder="Ej: Juan Perez Garcia"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  required
                />
              </div>
            )}

            <div>
              <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#334155", marginBottom: "6px" }}>
                Correo electronico
              </label>
              <input
                type="email"
                placeholder="tu@correo.com"
                value={correo}
                onChange={(e) => setCorreo(e.target.value)}
                required
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#334155", marginBottom: "6px" }}>
                Contrasena
              </label>
              <input
                type="password"
                placeholder="Minimo 6 caracteres"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>

            {error && (
              <div
                style={{
                  background: "#fef2f2",
                  padding: "12px 16px",
                  borderRadius: "10px",
                  border: "1px solid #fecaca",
                  fontSize: "14px",
                  color: "#991b1b",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "10px",
                }}
              >
                <span style={{ fontSize: "16px", marginTop: "1px" }}>&#9888;</span>
                <span>{error}</span>
              </div>
            )}

            <button
              className="primary-btn"
              type="submit"
              disabled={cargando}
              style={{
                opacity: cargando ? 0.7 : 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                padding: "15px",
                fontSize: "15px",
                marginTop: "4px",
              }}
            >
              {cargando ? (
                <>
                  <span style={{ display: "inline-block", width: "16px", height: "16px", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "white", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                  Verificando credenciales...
                </>
              ) : modo === "login" ? "Ingresar al sistema" : "Crear cuenta"}
            </button>
          </form>

          <div style={{ marginTop: "24px", textAlign: "center", fontSize: "12px", color: "#94a3b8" }}>
            <p style={{ margin: "0 0 4px" }}>
              Al continuar, aceptas los terminos y condiciones del sistema municipal.
            </p>
            <p style={{ margin: 0 }}>
              Protegido por Firebase Authentication
            </p>
          </div>
        </div>
      </div>

      <section className="login-steps-section" style={{ animation: "slideUp 0.8s ease-out 0.2s both" }}>
        <div className="login-steps-header">
          <span className="eyebrow">Proceso digital</span>
          <h2>Como funciona?</h2>
          <p>
            Sigue estos pasos para registrar tu solicitud y obtener tu licencia
            municipal de funcionamiento.
          </p>
        </div>

        <div className="login-steps-grid">
          {pasos.map((paso) => (
            <div className="login-step-card" key={paso.numero} style={{ animation: `fadeIn 0.5s ease-out ${0.1 * Number(paso.numero)}s both` }}>
              <div className="step-number">{paso.numero}</div>
              <h3>{paso.titulo}</h3>
              <p>{paso.descripcion}</p>
            </div>
          ))}
        </div>
      </section>

      <footer
        style={{
          marginTop: "24px",
          padding: "16px",
          textAlign: "center",
          fontSize: "12px",
          color: "rgba(255,255,255,0.5)",
          position: "relative",
          zIndex: 1,
        }}
      >
        Municipalidad de Trujillo &mdash; Sistema de Licencias v1.0 &mdash; {new Date().getFullYear()}
      </footer>
    </div>
  );
}

export default Login;
