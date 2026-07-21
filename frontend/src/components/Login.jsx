import { useState } from "react";
import {
  iniciarSesion,
  enviarRecuperacion,
} from "../services/authService";
import { useAuth } from "../context/AuthContext";

function Login({ onVolver, errorInicial = "" }) {
  const { setUsuario } = useAuth();

  const [correo, setCorreo] = useState("");
  const [password, setPassword] = useState("");
  const [verPassword, setVerPassword] = useState(false);
  const [error, setError] = useState(errorInicial || "");
  const [cargando, setCargando] = useState(false);

  // Estados para recuperar contraseña
  const [mostrarRecuperar, setMostrarRecuperar] = useState(false);
  const [correoRecuperacion, setCorreoRecuperacion] = useState("");
  const [recuperacionEnviado, setRecuperacionEnviado] = useState(false);

  const manejarLogin = async (e) => {
    e.preventDefault();
    setError("");
    setCargando(true);
    try {
      const dataUsuario = await iniciarSesion(correo, password);
      setUsuario(dataUsuario);
    } catch (err) {
      const msg = err?.message || "";
      if (msg.includes("inhabilitada") || msg.includes("deshabilitada") || msg.includes("inactiva") || msg.includes("desactivada")) {
        setError("⚠️ Esta cuenta está inhabilitada. Contacte al administrador del sistema.");
      } else if (msg.includes("user-not-found")) {
        setError("No encontramos una cuenta registrada con ese correo electrónico.");
      } else if (msg.includes("wrong-password") || msg.includes("invalid-credential")) {
        setError("La contraseña ingresada es incorrecta. Intente de nuevo.");
      } else if (msg.includes("too-many-requests")) {
        setError("Demasiados intentos fallidos. Por seguridad, espere unos minutos.");
      } else {
        setError(msg || "No se pudo iniciar sesión. Verifique sus credenciales institucionales.");
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

      <div className="login-card" style={{ maxWidth: "920px", margin: "0 auto", borderRadius: "24px", overflow: "hidden", boxShadow: "0 25px 60px rgba(0,0,0,0.3)" }}>
        {/* PANEL IZQUIERDO: FORMULARIO DE INICIO DE SESIÓN */}
        <div className="login-form-box" style={{ padding: "48px 40px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
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
                      <label style={inputLabel}>Correo electrónico</label>
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
                <h2 style={{ margin: "0 0 6px", color: "#0f172a", fontSize: "24px", fontWeight: "800" }}>
                  Iniciar Sesión
                </h2>
                <p style={{ margin: 0, color: "#64748b", fontSize: "14px", lineHeight: "1.5" }}>
                  Ingrese su correo y contraseña para acceder al sistema.
                </p>
              </div>

              <form onSubmit={manejarLogin}>
                <div style={{ display: "grid", gap: "18px", marginBottom: "18px" }}>
                  <div>
                    <label style={inputLabel}>Correo electrónico *</label>
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
                    <div style={{ position: "relative" }}>
                      <input
                        type={verPassword ? "text" : "password"}
                        placeholder="••••••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={6}
                        style={{
                          width: "100%",
                          padding: "12px 45px 12px 16px",
                          borderRadius: "10px",
                          border: "1.5px solid #cbd5e1",
                          fontSize: "14.5px",
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setVerPassword(!verPassword)}
                        title={verPassword ? "Ocultar contraseña" : "Ver contraseña"}
                        style={{
                          position: "absolute",
                          right: "12px",
                          top: "50%",
                          transform: "translateY(-50%)",
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          fontSize: "18px",
                          padding: "4px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          lineHeight: "1",
                        }}
                      >
                        {verPassword ? "👁️" : "🙈"}
                      </button>
                    </div>
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
                  <div style={{ background: "#fef2f2", padding: "12px 16px", borderRadius: "10px", border: "1px solid #fecaca", fontSize: "13.5px", color: "#991b1b", display: "flex", alignItems: "flex-start", gap: "10px", marginBottom: "18px" }}>
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
                    boxShadow: "0 4px 14px rgba(30, 58, 138, 0.3)",
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
            </div>
          )}
        </div>

        {/* PANEL DERECHO INSTITUCIONAL (LIMPIO Y MINIMALISTA) */}
        <div
          className="login-info"
          style={{
            background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #1e3a8a 100%)",
            padding: "48px 40px",
            color: "white",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            position: "relative",
            overflow: "hidden"
          }}
        >
          {/* Sello de adorno translúcido de fondo */}
          <div
            style={{
              position: "absolute",
              top: "-60px",
              right: "-60px",
              width: "300px",
              height: "300px",
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(217, 119, 6, 0.15) 0%, transparent 70%)",
              pointerEvents: "none"
            }}
          />

          <div>
            {/* LOGO E IDENTIDAD INSTITUCIONAL */}
            <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "28px" }}>
              <div style={{
                width: "56px",
                height: "56px",
                borderRadius: "16px",
                background: "linear-gradient(135deg, #d97706 0%, #b45309 100%)",
                display: "grid",
                placeItems: "center",
                fontSize: "28px",
                boxShadow: "0 6px 18px rgba(217, 119, 6, 0.4)",
                border: "1.5px solid rgba(255,255,255,0.3)"
              }}>
                🏛️
              </div>
              <div>
                <span style={{ fontSize: "12px", fontWeight: "800", color: "#fef08a", textTransform: "uppercase", letterSpacing: "1.2px", display: "block" }}>
                  Municipalidad Provincial de Trujillo
                </span>
                <h4 style={{ margin: "2px 0 0", color: "white", fontSize: "15px", fontWeight: "700" }}>
                  La Libertad, Perú
                </h4>
              </div>
            </div>

            <h1 style={{ fontSize: "28px", lineHeight: 1.25, fontWeight: "800", color: "#ffffff", marginBottom: "14px" }}>
              Sistema Municipal de Licencias de Funcionamiento
            </h1>
            <p style={{ fontSize: "14.5px", lineHeight: 1.6, color: "#cbd5e1", margin: 0 }}>
              Plataforma institucional para la gestión integral de licencias municipales de funcionamiento.
            </p>

            {/* ILUSTRACIÓN / TARJETA INSTITUCIONAL */}
            <div style={{
              background: "rgba(255, 255, 255, 0.06)",
              backdropFilter: "blur(12px)",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              borderRadius: "20px",
              padding: "32px 24px",
              marginTop: "32px",
              textAlign: "center"
            }}>
              <div style={{
                width: "76px",
                height: "76px",
                margin: "0 auto 16px",
                borderRadius: "50%",
                background: "linear-gradient(135deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.05) 100%)",
                display: "grid",
                placeItems: "center",
                fontSize: "36px",
                border: "1px solid rgba(255,255,255,0.2)"
              }}>
                📜
              </div>
              <h3 style={{ margin: "0 0 6px", color: "#ffffff", fontSize: "16px", fontWeight: "700" }}>
                Gestión y Fiscalización Municipal
              </h3>
              <p style={{ margin: 0, color: "#94a3b8", fontSize: "13px", lineHeight: "1.5" }}>
                Atención presencial, trámites digitales, cobranza de tasas y emisión oficial de certificados.
              </p>
            </div>
          </div>

          {/* PIE DE PÁGINA REQUERIDO */}
          <footer style={{ marginTop: "32px", borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: "16px", textAlign: "center", fontSize: "12px", color: "#94a3b8", fontWeight: "500" }}>
            Municipalidad Provincial de Trujillo • Sistema de Licencias v1.0 • 2026
          </footer>
        </div>
      </div>
    </div>
  );
}

export default Login;
