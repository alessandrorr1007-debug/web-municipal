import { useState, useEffect } from "react";
import {
  iniciarSesion,
  registrarUsuario,
  enviarRecuperacion,
  verificarCorreoExistente,
  guardarCodigoVerificacion,
  verificarCodigoVerificacion,
} from "../services/authService";
import { consultarDni } from "../services/dniService";
import { useAuth } from "../context/AuthContext";

function Login({ onVolver, modoInicial }) {
  const { setUsuario } = useAuth();

  const [modo, setModo] = useState(modoInicial || "login");
  const [nombre, setNombre] = useState("");
  const [correo, setCorreo] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [telefono, setTelefono] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const [correoRecuperacion, setCorreoRecuperacion] = useState("");
  const [mostrarRecuperar, setMostrarRecuperar] = useState(false);
  const [pasoRecuperacion, setPasoRecuperacion] = useState("correo");
  const [codigoRecuperacion, setCodigoRecuperacion] = useState("");
  const [errorRecuperacion, setErrorRecuperacion] = useState("");

  const [dni, setDni] = useState("");
  const [dniValidado, setDniValidado] = useState(false);
  const [nombres, setNombres] = useState("");
  const [apellidoPaterno, setApellidoPaterno] = useState("");
  const [apellidoMaterno, setApellidoMaterno] = useState("");
  const [successDni, setSuccessDni] = useState("");

  const [pasoRegistro, setPasoRegistro] = useState("formulario");
  const [correoVerificar, setCorreoVerificar] = useState("");
  const [codigoIngresado, setCodigoIngresado] = useState("");
  const [errorCodigo, setErrorCodigo] = useState("");
  const [tiempoRestante, setTiempoRestante] = useState(0);
  const [reenviando, setReenviando] = useState(false);

  useEffect(() => {
    if (tiempoRestante <= 0) return;
    const timer = setTimeout(() => {
      setTiempoRestante((t) => t - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [tiempoRestante]);

  const minutos = Math.floor(tiempoRestante / 60);
  const segundos = tiempoRestante % 60;
  const tiempoFormateado = `${minutos}:${segundos.toString().padStart(2, "0")}`;

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
        setError("La contraseña ingresada es incorrecta. Intenta de nuevo.");
      } else if (msg.includes("too-many-requests")) {
        setError("Demasiados intentos. Espera unos minutos e intentalo de nuevo.");
      } else {
        setError("No pudimos iniciar sesión. Verifica tus datos e intenta de nuevo.");
      }
    } finally {
      setCargando(false);
    }
  };

  const manejarRegistro = async (e) => {
    e.preventDefault();
    setError("");

    if (!dniValidado) {
      setError("Primero debes validar tu identidad con DNI.");
      return;
    }
    if (!correo) { setError("Ingresa tu correo electrónico."); return; }
    if (!telefono || telefono.length < 9) { setError("Ingresa un número de teléfono válido de 9 dígitos."); return; }
    if (password.length < 6) { setError("La contraseña debe tener al menos 6 caracteres."); return; }
    if (password !== confirmPassword) { setError("Las contraseñas no coinciden."); return; }

    setCargando(true);
    try {
      const emailExiste = await verificarCorreoExistente(correo);
      if (emailExiste) {
        setError("Ya existe una cuenta con ese correo electrónico.");
        setCargando(false);
        return;
      }

      await guardarCodigoVerificacion(correo);
      setCorreoVerificar(correo);
      setPasoRegistro("verificar");
      setTiempoRestante(300);
      setCodigoIngresado("");
      setErrorCodigo("");
    } catch (err) {
      console.error("[DEBUG] Error en registro:", err.message);
      setError(`No se pudo enviar el código: ${err.message}`);
    } finally {
      setCargando(false);
    }
  };

  const manejarVerificarCodigo = async (e) => {
    e.preventDefault();
    setErrorCodigo("");

    if (!codigoIngresado || codigoIngresado.length !== 6) {
      setErrorCodigo("Ingresa el código de 6 dígitos.");
      return;
    }

    setCargando(true);
    try {
      const resultado = await verificarCodigoVerificacion(correoVerificar, codigoIngresado);

      if (!resultado.valido) {
        setErrorCodigo(resultado.mensaje);
        setCargando(false);
        return;
      }

      await registrarUsuario({
        nombre,
        correo: correoVerificar,
        password,
        rol: "negocio",
        telefono,
        dni,
        digito_verificador: "",
        nombres,
        apellido_paterno: apellidoPaterno,
        apellido_materno: apellidoMaterno,
        nombre_completo: nombre,
      });

      setPasoRegistro("exito");
    } catch (err) {
      const msg = err?.message || "";
      if (msg.includes("email-already-in-use")) {
        setErrorCodigo("Ya existe una cuenta con ese correo.");
      } else {
        setErrorCodigo("No se pudo crear la cuenta. Intenta de nuevo.");
      }
    } finally {
      setCargando(false);
    }
  };

  const reenviarCodigo = async () => {
    setReenviando(true);
    setErrorCodigo("");
    try {
      await guardarCodigoVerificacion(correoVerificar);
      setTiempoRestante(300);
      setCodigoIngresado("");
    } catch {
      setErrorCodigo("No se pudo reenviar el código.");
    } finally {
      setReenviando(false);
    }
  };

  const manejarRecuperar = async (e) => {
    e.preventDefault();
    setError("");
    setCargando(true);
    try {
      await enviarRecuperacion(correoRecuperacion);
      setPasoRecuperacion("verificar");
      setTiempoRestante(300);
      setCodigoRecuperacion("");
      setErrorRecuperacion("");
    } catch (err) {
      console.error("[DEBUG] Error recuperación:", err.message);
      setError(`No se pudo enviar el código: ${err.message}`);
    } finally {
      setCargando(false);
    }
  };

  const manejarVerificarRecuperacion = async (e) => {
    e.preventDefault();
    setErrorRecuperacion("");

    if (!codigoRecuperacion || codigoRecuperacion.length !== 6) {
      setErrorRecuperacion("Ingresa el código de 6 dígitos.");
      return;
    }

    setCargando(true);
    try {
      const resultado = await verificarCodigoVerificacion(correoRecuperacion, codigoRecuperacion);
      if (!resultado.valido) {
        setErrorRecuperacion(resultado.mensaje);
        setCargando(false);
        return;
      }
      setPasoRecuperacion("exito");
    } catch (err) {
      setErrorRecuperacion("Error al verificar el código.");
    } finally {
      setCargando(false);
    }
  };

  const resetDni = () => {
    setDniValidado(false);
    setDni("");
    setNombre("");
    setNombres("");
    setApellidoPaterno("");
    setApellidoMaterno("");
    setError("");
    setSuccessDni("");
  };

  const manejarConsultarDni = async () => {
    setError("");
    setSuccessDni("");

    if (!dni || dni.length !== 8) {
      setError("El DNI debe tener exactamente 8 dígitos.");
      return;
    }

    setCargando(true);
    try {
      const data = await consultarDni(dni);

      setNombres(data.nombres || "");
      setApellidoPaterno(data.apellido_paterno || "");
      setApellidoMaterno(data.apellido_materno || "");
      setNombre(data.nombre_completo || "");
      setDniValidado(true);
      setSuccessDni("✅ DNI encontrado correctamente.");
    } catch (err) {
      console.error(err);
      const msg = err?.message || "";
      if (msg.includes("no encontrado") || msg.includes("RENIEC") || msg.includes("404")) {
        setError("❌ DNI no encontrado en RENIEC.");
      } else {
        setError("❌ No fue posible consultar RENIEC. Intente nuevamente.");
      }
    } finally {
      setCargando(false);
    }
  };

  const resetRegistro = () => {
    setPasoRegistro("formulario");
    setCodigoIngresado("");
    setErrorCodigo("");
    setTiempoRestante(0);
    setCorreoVerificar("");
    resetDni();
  };

  const inputLabel = { display: "block", fontSize: "13px", fontWeight: 600, color: "#334155", marginBottom: "6px" };

  const pasos = [
    { numero: "1", titulo: "Crea tu cuenta", descripcion: "Regístrate como negocio para acceder al sistema municipal." },
    { numero: "2", titulo: "Completa tu solicitud", descripcion: "Ingresa tu RUC, datos del local y adjunta tus documentos PDF." },
    { numero: "3", titulo: "Realiza el pago", descripcion: "Paga el derecho de trámite y registra tu comprobante digital." },
    { numero: "4", titulo: "Inspección", descripcion: "Un inspector revisará tu local, observaciones y evidencias." },
    { numero: "5", titulo: "Recibe tu resultado", descripcion: "El funcionario evaluará el informe y emitirá la decisión final." },
    { numero: "6", titulo: "Descarga tu licencia", descripcion: "Si es aprobada, podrás descargar tu licencia municipal." },
  ];

  return (
    <div className="login-page">
      {onVolver && (
        <button type="button" onClick={() => { resetRegistro(); onVolver(); }} style={{ position: "absolute", top: "20px", left: "20px", zIndex: 10, background: "rgba(255,255,255,0.12)", color: "white", border: "1px solid rgba(255,255,255,0.25)", padding: "10px 16px", fontSize: "14px" }}>
          &#8592; Volver
        </button>
      )}

      <div className="login-card">
        <div className="login-info">
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "28px" }}>
            <div style={{ width: "48px", height: "48px", borderRadius: "14px", background: "rgba(255,255,255,0.15)", display: "grid", placeItems: "center", fontSize: "24px", border: "1px solid rgba(255,255,255,0.2)" }}>
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
            licencias municipales de funcionamiento de tu negocio de manera 100% digital.
          </p>
          <div className="login-benefits">
            <span>100% Digital</span>
            <span>Pago en linea</span>
            <span>Seguimiento en tiempo real</span>
            <span>Descarga inmediata</span>
          </div>
        </div>

        <div className="login-form-box" style={{ overflow: "auto", maxHeight: "600px" }}>
          {mostrarRecuperar ? (
            <div>
              <button type="button" onClick={() => { setMostrarRecuperar(false); setError(""); setPasoRecuperacion("correo"); }} style={{ background: "none", color: "#64748b", border: "none", cursor: "pointer", fontSize: "14px", marginBottom: "16px", padding: 0 }}>
                &#8592; Volver al inicio de sesión
              </button>

              {pasoRecuperacion === "exito" ? (
                <div style={{ textAlign: "center", padding: "20px 0" }}>
                  <div style={{ width: "72px", height: "72px", borderRadius: "50%", background: "#f0fdf4", display: "grid", placeItems: "center", margin: "0 auto 20px", fontSize: "36px", border: "2px solid #bbf7d0" }}>&#9989;</div>
                  <h2 style={{ margin: "0 0 8px", color: "#166534", fontSize: "22px" }}>Código verificado</h2>
                  <p style={{ margin: "0 0 24px", color: "#475569", fontSize: "14px", lineHeight: "1.6" }}>
                    Tu identidad fue confirmada. Ahora puedes restablecer tu contraseña desde el enlace que fue enviado a <strong>{correoRecuperacion}</strong>.
                  </p>
                  <button type="button" onClick={() => { setMostrarRecuperar(false); setPasoRecuperacion("correo"); setModo("login"); setError(""); }} className="primary-btn" style={{ padding: "14px 32px", fontSize: "15px" }}>
                    Volver al inicio de sesión
                  </button>
                </div>
              ) : pasoRecuperacion === "verificar" ? (
                <div>
                  <h2 style={{ margin: "0 0 8px", color: "#0f172a", fontSize: "20px" }}>Verifica tu correo</h2>
                  <p style={{ margin: "0 0 20px", color: "#64748b", fontSize: "14px", lineHeight: "1.5" }}>
                    Enviamos un código de verificación a <strong style={{ color: "#1f3b57" }}>{correoRecuperacion}</strong>
                  </p>
                  <form onSubmit={manejarVerificarRecuperacion}>
                    <label style={inputLabel}>Código de verificación</label>
                    <input
                      type="text"
                      placeholder="Ej: 123456"
                      value={codigoRecuperacion}
                      onChange={(e) => setCodigoRecuperacion(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      maxLength="6"
                      style={{ textAlign: "center", fontSize: "20px", letterSpacing: "8px", fontWeight: 700 }}
                      autoFocus
                      required
                    />
                    {tiempoRestante > 0 ? (
                      <p style={{ margin: "8px 0 0", fontSize: "13px", color: "#64748b", textAlign: "center" }}>
                        El código expira en <strong style={{ color: tiempoRestante <= 60 ? "#dc2626" : "#2563eb" }}>{minutos}:{segundos.toString().padStart(2, "0")}</strong>
                      </p>
                    ) : (
                      <p style={{ margin: "8px 0 0", fontSize: "13px", color: "#dc2626", textAlign: "center", fontWeight: 600 }}>El código ha expirado</p>
                    )}
                    {errorRecuperacion && <div style={{ background: "#fef2f2", padding: "12px 16px", borderRadius: "10px", border: "1px solid #fecaca", fontSize: "14px", color: "#991b1b", marginTop: "12px" }}>&#9888; {errorRecuperacion}</div>}
                    <button className="primary-btn" type="submit" disabled={cargando} style={{ opacity: cargando ? 0.7 : 1, padding: "15px", fontSize: "15px", marginTop: "16px" }}>
                      {cargando ? "Verificando..." : "Verificar código"}
                    </button>
                  </form>
                  <div style={{ marginTop: "16px", textAlign: "center" }}>
                    <button type="button" onClick={manejarRecuperar} disabled={tiempoRestante > 0} style={{ background: "none", border: "none", color: tiempoRestante > 0 ? "#94a3b8" : "#2563eb", fontSize: "13px", cursor: tiempoRestante > 0 ? "default" : "pointer", fontWeight: 600 }}>
                      Reenviar código
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <h2 style={{ margin: "0 0 8px", color: "#0f172a", fontSize: "20px" }}>Recuperar contraseña</h2>
                  <p style={{ margin: "0 0 20px", color: "#64748b", fontSize: "14px" }}>
                    Ingresa tu correo electrónico y te enviaremos un código de verificación.
                  </p>
                  <form onSubmit={manejarRecuperar}>
                    <label style={inputLabel}>Correo electrónico</label>
                    <input type="email" placeholder="tu@correo.com" value={correoRecuperacion} onChange={(e) => setCorreoRecuperacion(e.target.value)} required />
                    {error && <div style={{ background: "#fef2f2", padding: "12px 16px", borderRadius: "10px", border: "1px solid #fecaca", fontSize: "14px", color: "#991b1b", marginTop: "12px" }}>&#9888; {error}</div>}
                    <button type="submit" disabled={cargando} className="primary-btn" style={{ marginTop: "16px", padding: "14px" }}>
                      {cargando ? "Enviando..." : "Enviar código de verificación"}
                    </button>
                  </form>
                </div>
              )}
            </div>
          ) : (
            <>
              {pasoRegistro === "exito" ? (
                <div style={{ textAlign: "center", padding: "20px 0" }}>
                  <div style={{ width: "72px", height: "72px", borderRadius: "50%", background: "#f0fdf4", display: "grid", placeItems: "center", margin: "0 auto 20px", fontSize: "36px", border: "2px solid #bbf7d0" }}>&#9989;</div>
                  <h2 style={{ margin: "0 0 8px", color: "#166534", fontSize: "22px" }}>Cuenta creada correctamente</h2>
                  <p style={{ margin: "0 0 24px", color: "#475569", fontSize: "14px", lineHeight: "1.6" }}>
                    Tu cuenta ha sido registrada exitosamente. Ahora puedes iniciar sesión con tu correo electrónico y contraseña.
                  </p>
                  <button
                    type="button"
                    onClick={() => { resetRegistro(); setModo("login"); setError(""); }}
                    className="primary-btn"
                    style={{ padding: "14px 32px", fontSize: "15px" }}
                  >
                    Iniciar sesión
                  </button>
                </div>
              ) : pasoRegistro === "verificar" ? (
                <div>
                  <button type="button" onClick={resetRegistro} style={{ background: "none", color: "#64748b", border: "none", cursor: "pointer", fontSize: "14px", marginBottom: "16px", padding: 0 }}>
                    &#8592; Volver al formulario
                  </button>
                  <div style={{ textAlign: "center", marginBottom: "24px" }}>
                    <div style={{ width: "64px", height: "64px", borderRadius: "50%", background: "#eff6ff", display: "grid", placeItems: "center", margin: "0 auto 16px", fontSize: "28px", border: "2px solid #bfdbfe" }}>&#128231;</div>
                    <h2 style={{ margin: "0 0 6px", color: "#0f172a", fontSize: "22px" }}>Verifica tu correo electrónico</h2>
                    <p style={{ margin: 0, color: "#64748b", fontSize: "14px", lineHeight: "1.5" }}>
                      Enviamos un código de verificación de 6 dígitos a<br />
                      <strong style={{ color: "#1f3b57" }}>{correoVerificar}</strong>
                    </p>
                  </div>

                  <form onSubmit={manejarVerificarCodigo}>
                    <label style={inputLabel}>Código de verificación</label>
                    <input
                      type="text"
                      placeholder="Ej: 123456"
                      value={codigoIngresado}
                      onChange={(e) => setCodigoIngresado(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      maxLength="6"
                      style={{ textAlign: "center", fontSize: "20px", letterSpacing: "8px", fontWeight: 700 }}
                      autoFocus
                      required
                    />

                    {tiempoRestante > 0 ? (
                      <p style={{ margin: "8px 0 0", fontSize: "13px", color: "#64748b", textAlign: "center" }}>
                        El código expira en <strong style={{ color: tiempoRestante <= 60 ? "#dc2626" : "#2563eb" }}>{tiempoFormateado}</strong>
                      </p>
                    ) : (
                      <p style={{ margin: "8px 0 0", fontSize: "13px", color: "#dc2626", textAlign: "center", fontWeight: 600 }}>
                        El código ha expirado
                      </p>
                    )}

                    {errorCodigo && (
                      <div style={{ background: "#fef2f2", padding: "12px 16px", borderRadius: "10px", border: "1px solid #fecaca", fontSize: "14px", color: "#991b1b", marginTop: "12px", display: "flex", alignItems: "flex-start", gap: "10px" }}>
                        <span style={{ fontSize: "16px", marginTop: "1px" }}>&#9888;</span>
                        <span>{errorCodigo}</span>
                      </div>
                    )}

                    <button className="primary-btn" type="submit" disabled={cargando} style={{ opacity: cargando ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", padding: "15px", fontSize: "15px", marginTop: "16px" }}>
                      {cargando ? (
                        <>
                          <span style={{ display: "inline-block", width: "16px", height: "16px", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "white", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                          Verificando código...
                        </>
                      ) : "Verificar código"}
                    </button>
                  </form>

                  <div style={{ marginTop: "20px", textAlign: "center" }}>
                    <span style={{ fontSize: "13px", color: "#64748b" }}>¿No recibiste el código? </span>
                    <button
                      type="button"
                      onClick={reenviarCodigo}
                      disabled={reenviando || tiempoRestante > 0}
                      style={{
                        background: "none", border: "none", color: tiempoRestante > 0 ? "#94a3b8" : "#2563eb",
                        fontSize: "13px", cursor: tiempoRestante > 0 ? "default" : "pointer", fontWeight: 600,
                        textDecoration: tiempoRestante > 0 ? "none" : "underline",
                      }}
                    >
                      {reenviando ? "Reenviando..." : "Reenviar código"}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ textAlign: "center", marginBottom: "24px" }}>
                    <h2 style={{ margin: "0 0 6px", color: "#0f172a", fontSize: "22px" }}>
                      {modo === "login" ? "Iniciar sesión" : "Crear cuenta"}
                    </h2>
                    <p style={{ margin: 0, color: "#64748b", fontSize: "14px" }}>
                      {modo === "login"
                        ? "Ingresa tus credenciales para acceder al sistema."
                        : "Regístrate para comenzar a solicitar licencias."}
                    </p>
                  </div>

                  <div className="tabs">
                    <button type="button" className={modo === "login" ? "active" : ""} onClick={() => { setModo("login"); setError(""); }}>Iniciar sesión</button>
                    <button type="button" className={modo === "registro" ? "active" : ""} onClick={() => { setModo("registro"); setError(""); }}>Crear cuenta</button>
                  </div>

                  <form onSubmit={modo === "login" ? manejarLogin : manejarRegistro}>
                    {modo === "registro" && (
                      <div style={{ display: "grid", gap: "12px", marginBottom: "4px" }}>
                        <div style={{ marginBottom: "4px" }}>
                          <label style={inputLabel}>DNI *</label>
                          <input
                            type="text"
                            placeholder="Ingrese DNI de 8 dígitos"
                            value={dni}
                            onChange={(e) => {
                              setDni(e.target.value.replace(/\D/g, "").slice(0, 8));
                              setError("");
                              setSuccessDni("");
                            }}
                            disabled={dniValidado}
                            maxLength="8"
                            required
                          />
                        </div>

                        {successDni && (
                          <div style={{ background: "#f0fdf4", padding: "12px 16px", borderRadius: "10px", border: "1px solid #bbf7d0", fontSize: "14px", color: "#166534", display: "flex", alignItems: "flex-start", gap: "10px", marginTop: "4px" }}>
                            <span>{successDni}</span>
                          </div>
                        )}

                        {!dniValidado ? (
                          <button
                            type="button"
                            className="primary-btn"
                            onClick={manejarConsultarDni}
                            disabled={cargando}
                            style={{ background: "#1f3b57", marginTop: "4px", padding: "14px" }}
                          >
                            {cargando ? "Consultando..." : "Consultar RENIEC"}
                          </button>
                        ) : (
                          <>
                            <div style={{ textAlign: "right", marginTop: "2px" }}>
                              <button
                                type="button"
                                onClick={resetDni}
                                style={{
                                  background: "none",
                                  border: "none",
                                  color: "#2563eb",
                                  fontSize: "12px",
                                  cursor: "pointer",
                                  textDecoration: "underline",
                                  padding: 0
                                }}
                              >
                                Cambiar DNI
                              </button>
                            </div>
                            <div>
                              <label style={inputLabel}>Nombre completo *</label>
                              <input
                                type="text"
                                value={nombre}
                                disabled
                                required
                                style={{ background: "#f1f5f9", cursor: "not-allowed" }}
                              />
                            </div>
                            <div>
                              <label style={inputLabel}>Correo electrónico *</label>
                              <input
                                type="email"
                                placeholder="tu@correo.com"
                                value={correo}
                                onChange={(e) => setCorreo(e.target.value)}
                                required
                              />
                            </div>
                            <div>
                              <label style={inputLabel}>Número de teléfono *</label>
                              <input
                                type="text"
                                placeholder="912345678"
                                value={telefono}
                                onChange={(e) => setTelefono(e.target.value.replace(/\D/g, "").slice(0, 9))}
                                maxLength="9"
                                required
                              />
                            </div>
                            <div>
                              <label style={inputLabel}>Contraseña *</label>
                              <input
                                type="password"
                                placeholder="Mínimo 6 caracteres"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                minLength={6}
                              />
                            </div>
                            <div>
                              <label style={inputLabel}>Confirmar contraseña *</label>
                              <input
                                type="password"
                                placeholder="Repite tu contraseña"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                                minLength={6}
                              />
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {modo === "login" && (
                      <div style={{ display: "grid", gap: "12px" }}>
                        <div>
                          <label style={inputLabel}>Correo electrónico</label>
                          <input
                            type="email"
                            placeholder="tu@correo.com"
                            value={correo}
                            onChange={(e) => setCorreo(e.target.value)}
                            required
                          />
                        </div>
                        <div>
                          <label style={inputLabel}>Contraseña</label>
                          <input
                            type="password"
                            placeholder="Mínimo 6 caracteres"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            minLength={6}
                          />
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "#64748b", cursor: "pointer" }}>
                            <input type="checkbox" style={{ width: "16px", height: "16px", accentColor: "#1f3b57" }} />
                            Recordar sesión
                          </label>
                          <button
                            type="button"
                            onClick={() => { setMostrarRecuperar(true); setCorreoRecuperacion(correo); setError(""); }}
                            style={{ background: "none", border: "none", color: "#2563eb", fontSize: "13px", cursor: "pointer", fontWeight: 600 }}
                          >
                            Olvidaste tu contraseña?
                          </button>
                        </div>
                      </div>
                    )}

                    {error && (
                      <div style={{ background: "#fef2f2", padding: "12px 16px", borderRadius: "10px", border: "1px solid #fecaca", fontSize: "14px", color: "#991b1b", display: "flex", alignItems: "flex-start", gap: "10px", marginTop: "12px" }}>
                        {!error.startsWith("❌") && <span style={{ fontSize: "16px", marginTop: "1px" }}>&#9888;</span>}
                        <span>{error}</span>
                      </div>
                    )}

                    {(modo === "login" || (modo === "registro" && dniValidado)) && (
                      <button
                        className="primary-btn"
                        type="submit"
                        disabled={cargando}
                        style={{ opacity: cargando ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", padding: "15px", fontSize: "15px", marginTop: "16px" }}
                      >
                        {cargando ? (
                          <>
                            <span style={{ display: "inline-block", width: "16px", height: "16px", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "white", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                            {modo === "login" ? "Verificando credenciales..." : "Enviando código de verificación..."}
                          </>
                        ) : modo === "login" ? "Ingresar al sistema" : "Crear cuenta"}
                      </button>
                    )}
                  </form>

                  <div style={{ marginTop: "24px", textAlign: "center", fontSize: "12px", color: "#94a3b8" }}>
                    <p style={{ margin: "0 0 4px" }}>Al continuar, aceptas los términos y condiciones del sistema municipal.</p>
                    <p style={{ margin: 0 }}>Protegido por Firebase Authentication</p>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>

      <section className="login-steps-section" style={{ animation: "slideUp 0.8s ease-out 0.2s both" }}>
        <div className="login-steps-header">
          <span className="eyebrow">Proceso digital</span>
          <h2>Como funciona?</h2>
          <p>Sigue estos pasos para registrar tu solicitud y obtener tu licencia municipal de funcionamiento.</p>
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

      <footer style={{ marginTop: "24px", padding: "16px", textAlign: "center", fontSize: "12px", color: "rgba(255,255,255,0.5)", position: "relative", zIndex: 1 }}>
        Municipalidad de Trujillo &mdash; Sistema de Licencias v1.0 &mdash; {new Date().getFullYear()}
      </footer>
    </div>
  );
}

export default Login;
