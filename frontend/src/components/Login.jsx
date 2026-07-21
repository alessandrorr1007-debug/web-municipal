import { useState, useEffect } from "react";
import {
  iniciarSesion,
  enviarRecuperacion,
} from "../services/authService";
import { useAuth } from "../context/AuthContext";

function Login({ onVolver }) {
  const { setUsuario } = useAuth();

  const [correo, setCorreo] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  // Estados para recuperar contraseña
  const [mostrarRecuperar, setMostrarRecuperar] = useState(false);
  const [correoRecuperacion, setCorreoRecuperacion] = useState("");
  const [recuperacionEnviado, setRecuperacionEnviado] = useState(false);

  // Estado de fecha y hora actual en vivo
  const [fechaHoraActual, setFechaHoraActual] = useState("");

  useEffect(() => {
    const actualizarFechaHora = () => {
      const ahora = new Date();
      const opcionesFecha = { weekday: "long", year: "numeric", month: "long", day: "numeric" };
      const fecha = ahora.toLocaleDateString("es-PE", opcionesFecha);
      const hora = ahora.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });
      const fechaCapitalizada = fecha.charAt(0).toUpperCase() + fecha.slice(1);
      setFechaHoraActual(`${fechaCapitalizada} — ${hora}`);
    };

    actualizarFechaHora();
    const interval = setInterval(actualizarFechaHora, 1000);
    return () => clearInterval(interval);
  }, []);

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
        setError("No encontramos una cuenta registrada con ese correo electrónico.");
      } else if (msg.includes("wrong-password") || msg.includes("invalid-credential")) {
        setError("La contraseña ingresada es incorrecta. Intente de nuevo.");
      } else if (msg.includes("too-many-requests")) {
        setError("Demasiados intentos fallidos. Por seguridad, espere unos minutos.");
      } else {
        setError("No se pudo iniciar sesión. Verifique sus credenciales institucionales.");
      }
    } finally {
      setCargando(false);
    }
  };

  const manejarRecuperar = async (e) => {
    e.preventDefault();
    setError("");
    setCargando(true);
    try {
      await enviarRecuperacion(correoRecuperacion.trim());
      setRecuperacionEnviado(true);
    } catch (err) {
      setError(err.message || "No se pudo enviar el enlace. Intente de nuevo.");
    } finally {
      setCargando(false);
    }
  };

  const inputLabel = { display: "block", fontSize: "13px", fontWeight: 700, color: "#334155", marginBottom: "6px" };

  return (
    <div className="login-page">
      {onVolver && (
        <button
          type="button"
          onClick={onVolver}
          style={{
            position: "absolute",
            top: "20px",
            left: "20px",
            zIndex: 10,
            background: "rgba(255,255,255,0.15)",
            color: "white",
            border: "1px solid rgba(255,255,255,0.3)",
            padding: "10px 18px",
            fontSize: "14px",
            borderRadius: "10px",
            cursor: "pointer",
            fontWeight: "bold"
          }}
        >
          ← Volver
        </button>
      )}

      <div className="login-card" style={{ maxWidth: "980px", margin: "0 auto", borderRadius: "24px", overflow: "hidden", boxShadow: "0 25px 60px rgba(0,0,0,0.35)" }}>
        {/* PANEL IZQUIERDO: FORMULARIO DE INICIO DE SESIÓN */}
        <div className="login-form-box" style={{ padding: "44px 40px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          {mostrarRecuperar ? (
            <div>
              <button
                type="button"
                onClick={() => { setMostrarRecuperar(false); setRecuperacionEnviado(false); setCorreoRecuperacion(""); setError(""); }}
                style={{ background: "none", color: "#2563eb", border: "none", cursor: "pointer", fontSize: "14px", marginBottom: "20px", padding: 0, fontWeight: "bold" }}
              >
                ← Volver al inicio de sesión
              </button>

              {recuperacionEnviado ? (
                <div style={{ textAlign: "center", padding: "20px 0" }}>
                  <div style={{ width: "72px", height: "72px", borderRadius: "50%", background: "#f0fdf4", display: "grid", placeItems: "center", margin: "0 auto 20px", fontSize: "36px", border: "2px solid #bbf7d0" }}>
                    ✅
                  </div>
                  <h2 style={{ margin: "0 0 8px", color: "#166534", fontSize: "22px", fontWeight: "800" }}>Correo Enviado</h2>
                  <p style={{ margin: "0 0 24px", color: "#475569", fontSize: "14px", lineHeight: "1.6" }}>
                    Si su correo electrónico se encuentra registrado en el sistema municipal, recibirá un enlace para restablecer su contraseña.
                  </p>
                  <button
                    type="button"
                    onClick={() => { setMostrarRecuperar(false); setRecuperacionEnviado(false); setError(""); }}
                    className="primary-btn"
                    style={{ padding: "14px 32px", fontSize: "15px", borderRadius: "10px" }}
                  >
                    Volver al Inicio de Sesión
                  </button>
                </div>
              ) : (
                <div>
                  <h2 style={{ margin: "0 0 8px", color: "#0f172a", fontSize: "22px", fontWeight: "800" }}>Recuperar Contraseña</h2>
                  <p style={{ margin: "0 0 20px", color: "#64748b", fontSize: "14px" }}>
                    Ingrese su correo electrónico institucional para enviar las instrucciones de recuperación.
                  </p>
                  <form onSubmit={manejarRecuperar}>
                    <div style={{ marginBottom: "16px" }}>
                      <label style={inputLabel}>Correo electrónico institucional</label>
                      <input
                        type="email"
                        placeholder="usuario@munitrujillo.gob.pe"
                        value={correoRecuperacion}
                        onChange={(e) => setCorreoRecuperacion(e.target.value)}
                        required
                        style={{ width: "100%", padding: "12px 16px", borderRadius: "10px", border: "1.5px solid #cbd5e1", fontSize: "14.5px" }}
                        autoFocus
                      />
                    </div>
                    {error && (
                      <div style={{ background: "#fef2f2", padding: "12px 16px", borderRadius: "10px", border: "1px solid #fecaca", fontSize: "14px", color: "#991b1b", marginBottom: "16px" }}>
                        ⚠️ {error}
                      </div>
                    )}
                    <button
                      type="submit"
                      disabled={cargando}
                      className="primary-btn"
                      style={{ width: "100%", padding: "14px", fontSize: "15px", borderRadius: "10px", opacity: cargando ? 0.7 : 1, fontWeight: "bold" }}
                    >
                      {cargando ? "Enviando enlace..." : "Enviar Enlace de Recuperación"}
                    </button>
                  </form>
                </div>
              )}
            </div>
          ) : (
            <div>
              <div style={{ marginBottom: "28px" }}>
                <span style={{ background: "#eff6ff", color: "#1d4ed8", padding: "4px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.5px", display: "inline-block", marginBottom: "10px", border: "1px solid #bfdbfe" }}>
                  🔐 Portal de Acceso Interno
                </span>
                <h2 style={{ margin: "0 0 6px", color: "#0f172a", fontSize: "24px", fontWeight: "800" }}>
                  Iniciar Sesión
                </h2>
                <p style={{ margin: 0, color: "#64748b", fontSize: "14px", lineHeight: "1.5" }}>
                  Ingrese sus credenciales institucionales para acceder a los módulos de gestión.
                </p>
              </div>

              <form onSubmit={manejarLogin}>
                <div style={{ display: "grid", gap: "16px", marginBottom: "16px" }}>
                  <div>
                    <label style={inputLabel}>Correo electrónico institucional *</label>
                    <input
                      type="email"
                      placeholder="usuario@munitrujillo.gob.pe"
                      value={correo}
                      onChange={(e) => setCorreo(e.target.value)}
                      required
                      style={{ width: "100%", padding: "12px 16px", borderRadius: "10px", border: "1.5px solid #cbd5e1", fontSize: "14.5px", fontWeight: "600" }}
                      autoFocus
                    />
                  </div>

                  <div>
                    <label style={inputLabel}>Contraseña *</label>
                    <input
                      type="password"
                      placeholder="••••••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                      style={{ width: "100%", padding: "12px 16px", borderRadius: "10px", border: "1.5px solid #cbd5e1", fontSize: "14.5px" }}
                    />
                  </div>

                  <div style={{ textAlign: "right", marginTop: "-4px" }}>
                    <button
                      type="button"
                      onClick={() => {
                        setMostrarRecuperar(true);
                        setCorreoRecuperacion("");
                        setError("");
                      }}
                      style={{
                        background: "none",
                        border: "none",
                        color: "#2563eb",
                        fontSize: "13px",
                        cursor: "pointer",
                        fontWeight: 700,
                        padding: 0,
                        textDecoration: "underline",
                        textUnderlineOffset: "2px",
                      }}
                    >
                      ¿Olvidaste tu contraseña?
                    </button>
                  </div>
                </div>

                {error && (
                  <div style={{ background: "#fef2f2", padding: "12px 16px", borderRadius: "10px", border: "1px solid #fecaca", fontSize: "13.5px", color: "#991b1b", display: "flex", alignItems: "flex-start", gap: "10px", marginBottom: "16px" }}>
                    <span style={{ fontSize: "16px", marginTop: "1px" }}>⚠️</span>
                    <span>{error}</span>
                  </div>
                )}

                <button
                  className="primary-btn"
                  type="submit"
                  disabled={cargando}
                  style={{
                    width: "100%",
                    padding: "15px",
                    fontSize: "15.5px",
                    fontWeight: "800",
                    borderRadius: "10px",
                    opacity: cargando ? 0.75 : 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "10px",
                    background: "linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%)",
                    boxShadow: "0 4px 12px rgba(30, 58, 138, 0.3)",
                    cursor: "pointer"
                  }}
                >
                  {cargando ? (
                    <>
                      <span style={{ display: "inline-block", width: "16px", height: "16px", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "white", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                      Verificando credenciales...
                    </>
                  ) : (
                    "Ingresar al Sistema →"
                  )}
                </button>
              </form>

              <div style={{ marginTop: "24px", padding: "14px", borderRadius: "12px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                <span style={{ display: "block", fontSize: "12px", color: "#475569", fontWeight: "700", marginBottom: "4px" }}>
                  🔐 Roles Autorizados:
                </span>
                <p style={{ margin: 0, fontSize: "12px", color: "#64748b", lineHeight: "1.4" }}>
                  Administrador Municipal, Funcionario de Licencias, Cajera de Ventanilla e Inspector Técnico.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* PANEL DERECHO INSTITUCIONAL */}
        <div
          className="login-info"
          style={{
            background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #1e3a8a 100%)",
            padding: "44px 40px",
            color: "white",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            position: "relative",
            overflow: "hidden"
          }}
        >
          {/* Sello translúcido de fondo */}
          <div
            style={{
              position: "absolute",
              top: "-50px",
              right: "-50px",
              width: "280px",
              height: "280px",
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(217, 119, 6, 0.15) 0%, transparent 70%)",
              pointerEvents: "none"
            }}
          />

          <div>
            {/* ENCABEZADO INSTITUCIONAL TRUJILLO */}
            <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "24px" }}>
              <div style={{
                width: "52px",
                height: "52px",
                borderRadius: "14px",
                background: "linear-gradient(135deg, #d97706 0%, #b45309 100%)",
                display: "grid",
                placeItems: "center",
                fontSize: "26px",
                boxShadow: "0 4px 14px rgba(217, 119, 6, 0.4)",
                border: "1px solid rgba(255,255,255,0.3)"
              }}>
                🏛️
              </div>
              <div>
                <span style={{ fontSize: "11.5px", fontWeight: "800", color: "#fef08a", textTransform: "uppercase", letterSpacing: "1.2px", display: "block" }}>
                  Municipalidad Provincial de Trujillo
                </span>
                <h4 style={{ margin: "2px 0 0", color: "white", fontSize: "15px", fontWeight: "700" }}>
                  Sede Central — La Libertad, Perú
                </h4>
              </div>
            </div>

            <h1 style={{ fontSize: "26px", lineHeight: 1.25, fontWeight: "800", color: "#ffffff", marginBottom: "12px" }}>
              Sistema Municipal de Licencias de Funcionamiento
            </h1>
            <p style={{ fontSize: "14px", lineHeight: 1.6, color: "#cbd5e1", marginBottom: "20px" }}>
              Plataforma institucional interna para la atención presencial, gestión de solicitudes, fiscalización, cobro de tasas e inspecciones técnicas.
            </p>

            {/* FECHA Y HORA ACTUAL EN VIVO */}
            <div style={{
              background: "rgba(255, 255, 255, 0.08)",
              backdropFilter: "blur(8px)",
              padding: "12px 18px",
              borderRadius: "12px",
              border: "1px solid rgba(255,255,255,0.15)",
              marginBottom: "20px",
              display: "flex",
              alignItems: "center",
              gap: "10px",
              color: "#e2e8f0",
              fontSize: "13px",
              fontWeight: "600"
            }}>
              <span style={{ fontSize: "16px" }}>🕒</span>
              <span>{fechaHoraActual || "Cargando fecha y hora..."}</span>
            </div>

            {/* TARJETA DE ESTADO DEL SISTEMA */}
            <div style={{
              background: "rgba(15, 23, 42, 0.6)",
              backdropFilter: "blur(10px)",
              padding: "18px 20px",
              borderRadius: "16px",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              marginBottom: "20px",
              boxShadow: "0 8px 20px rgba(0,0,0,0.2)"
            }}>
              <div style={{ fontSize: "12px", fontWeight: "800", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>📊 Estado del Sistema</span>
                <span style={{ background: "#166534", color: "#bbf7d0", padding: "2px 8px", borderRadius: "12px", fontSize: "11px", fontWeight: "bold" }}>PROD v1.0</span>
              </div>

              <div style={{ display: "grid", gap: "10px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "13.5px" }}>
                  <span style={{ color: "#cbd5e1" }}>Estado del Servidor:</span>
                  <strong style={{ color: "#4ade80", display: "flex", alignItems: "center", gap: "6px" }}>
                    🟢 Operativo
                  </strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "13.5px" }}>
                  <span style={{ color: "#cbd5e1" }}>Disponibilidad:</span>
                  <strong style={{ color: "#ffffff" }}>⚡ 99.9% Uptime</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "13.5px" }}>
                  <span style={{ color: "#cbd5e1" }}>Seguridad de Acceso:</span>
                  <strong style={{ color: "#60a5fa", display: "flex", alignItems: "center", gap: "4px" }}>
                    🔒 Firebase Auth & SSL
                  </strong>
                </div>
              </div>
            </div>

            {/* COMUNICADO INSTITUCIONAL DE GTI */}
            <div style={{
              background: "linear-gradient(135deg, rgba(217, 119, 6, 0.18) 0%, rgba(180, 83, 9, 0.28) 100%)",
              border: "1px solid rgba(251, 191, 36, 0.35)",
              padding: "16px 18px",
              borderRadius: "14px",
              color: "#fef08a"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: "800", fontSize: "12.5px", color: "#fbbf24", marginBottom: "6px", textTransform: "uppercase" }}>
                <span>📢</span> Comunicado TI (Soporte Interno)
              </div>
              <p style={{ margin: 0, fontSize: "12.5px", color: "#fef3c7", lineHeight: "1.5" }}>
                El sistema opera con normalidad. Para asignación de roles o asistencia con sus credenciales institucionales, contacte a la Gerencia de Tecnologías de la Información (GTI) al <strong>Anexo 104</strong>.
              </p>
            </div>
          </div>

          <footer style={{ marginTop: "24px", borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: "14px", textAlign: "center", fontSize: "11.5px", color: "#94a3b8" }}>
            Municipalidad Provincial de Trujillo &mdash; Sistema de Licencias &copy; {new Date().getFullYear()}
          </footer>
        </div>
      </div>
    </div>
  );
}

export default Login;
