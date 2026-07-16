import { useState } from "react";
import { iniciarSesion, registrarUsuario, enviarRecuperacion, verificarRucExistente } from "../services/authService";
import { useAuth } from "../context/AuthContext";

function Login({ onVolver, modoInicial }) {
  const { setUsuario } = useAuth();

  const [modo, setModo] = useState(modoInicial || "login");
  const [nombre, setNombre] = useState("");
  const [correo, setCorreo] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const [recuperacionEnviada, setRecuperacionEnviada] = useState(false);
  const [correoRecuperacion, setCorreoRecuperacion] = useState("");
  const [mostrarRecuperar, setMostrarRecuperar] = useState(false);
  const [registroExitoso, setRegistroExitoso] = useState(false);

  const [dni, setDni] = useState("");
  const [telefono, setTelefono] = useState("");
  const [ruc, setRuc] = useState("");
  const [razonSocial, setRazonSocial] = useState("");
  const [nombreComercial, setNombreComercial] = useState("");
  const [direccionNeg, setDireccionNeg] = useState("");
  const [tipoNegocio, setTipoNegocio] = useState("");
  const [categoria, setCategoria] = useState("");

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

    if (nombre.trim().length < 3) { setError("El nombre debe tener al menos 3 caracteres."); return; }
    if (!dni || dni.length < 8) { setError("Ingresa un DNI válido de 8 dígitos."); return; }
    if (!ruc || ruc.length !== 11) { setError("El RUC debe tener 11 digitos."); return; }
    if (password.length < 6) { setError("La contraseña debe tener al menos 6 caracteres."); return; }
    if (password !== confirmPassword) { setError("Las contraseñas no coinciden."); return; }

    setCargando(true);
    try {
      const rucExiste = await verificarRucExistente(ruc);
      if (rucExiste) { setError("Ya existe una cuenta registrada con ese RUC."); setCargando(false); return; }

      await registrarUsuario({
        nombre, correo, password, rol: "negocio",
        dni, telefono, ruc, razonSocial, nombreComercial,
        direccion: direccionNeg, tipoNegocio, categoria,
      });
      setRegistroExitoso(true);
    } catch (err) {
      const msg = err?.message || "";
      if (msg.includes("email-already-in-use")) setError("Ya existe una cuenta con ese correo electronico.");
      else if (msg.includes("weak-password")) setError("La contraseña es muy débil. Usa al menos 6 caracteres.");
      else setError("No se pudo crear la cuenta. Verifica los datos e intentalo de nuevo.");
    } finally {
      setCargando(false);
    }
  };

  const manejarRecuperar = async (e) => {
    e.preventDefault();
    setError("");
    setCargando(true);
    try {
      await enviarRecuperacion(correoRecuperacion);
      setRecuperacionEnviada(true);
    } catch {
      setError("No se pudo enviar el correo de recuperacion. Verifica el correo.");
    } finally {
      setCargando(false);
    }
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
        <button type="button" onClick={onVolver} style={{ position: "absolute", top: "20px", left: "20px", zIndex: 10, background: "rgba(255,255,255,0.12)", color: "white", border: "1px solid rgba(255,255,255,0.25)", padding: "10px 16px", fontSize: "14px" }}>
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
              <button type="button" onClick={() => { setMostrarRecuperar(false); setError(""); setRecuperacionEnviada(false); }} style={{ background: "none", color: "#64748b", border: "none", cursor: "pointer", fontSize: "14px", marginBottom: "16px", padding: 0 }}>
                &#8592; Volver al inicio de sesión
              </button>
              <h2 style={{ margin: "0 0 8px", color: "#0f172a", fontSize: "20px" }}>Recuperar contraseña</h2>
              <p style={{ margin: "0 0 20px", color: "#64748b", fontSize: "14px" }}>
                Ingresa tu correo electrónico y te enviaremos las instrucciones para restablecer tu contraseña.
              </p>
              {!recuperacionEnviada ? (
                <form onSubmit={manejarRecuperar}>
                  <label style={inputLabel}>Correo electrónico</label>
                  <input type="email" placeholder="tu@correo.com" value={correoRecuperacion} onChange={(e) => setCorreoRecuperacion(e.target.value)} required />
                  {error && <div style={{ background: "#fef2f2", padding: "12px 16px", borderRadius: "10px", border: "1px solid #fecaca", fontSize: "14px", color: "#991b1b", marginTop: "12px" }}>&#9888; {error}</div>}
                  <button type="submit" disabled={cargando} className="primary-btn" style={{ marginTop: "16px", padding: "14px" }}>
                    {cargando ? "Enviando..." : "Enviar instrucciones"}
                  </button>
                </form>
              ) : (
                <div style={{ background: "#f0fdf4", padding: "20px", borderRadius: "14px", border: "1px solid #bbf7d0", textAlign: "center" }}>
                  <div style={{ fontSize: "32px", marginBottom: "8px" }}>&#9993;</div>
                  <strong style={{ color: "#166534" }}>Correo enviado</strong>
                  <p style={{ margin: "8px 0 0", color: "#166534", fontSize: "14px" }}>
                    Revisa la bandeja de entrada de <strong>{correoRecuperacion}</strong> y sigue las instrucciones.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <>
              {registroExitoso ? (
                <div style={{ textAlign: "center", padding: "20px 0" }}>
                  <div style={{ fontSize: "48px", marginBottom: "16px" }}>&#9989;</div>
                  <h2 style={{ margin: "0 0 8px", color: "#166534", fontSize: "22px" }}>Registro exitoso</h2>
                  <p style={{ margin: "0 0 24px", color: "#475569", fontSize: "14px", lineHeight: "1.6" }}>
                    Tu cuenta ha sido creada correctamente. Ahora puedes iniciar sesión con tu correo electrónico y contraseña.
                  </p>
                  <button
                    type="button"
                    onClick={() => { setRegistroExitoso(false); setModo("login"); setError(""); }}
                    className="primary-btn"
                    style={{ padding: "14px 32px", fontSize: "15px" }}
                  >
                    Iniciar sesión
                  </button>
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
                    <div>
                      <label style={inputLabel}>Nombre completo *</label>
                      <input type="text" placeholder="Ej: Juan Perez Garcia" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                      <div>
                        <label style={inputLabel}>DNI *</label>
                        <input type="text" placeholder="12345678" value={dni} onChange={(e) => setDni(e.target.value.replace(/\D/g, "").slice(0, 8))} maxLength="8" required />
                      </div>
                      <div>
                        <label style={inputLabel}>Telefono</label>
                        <input type="text" placeholder="912345678" value={telefono} onChange={(e) => setTelefono(e.target.value.replace(/\D/g, "").slice(0, 9))} maxLength="9" />
                      </div>
                    </div>
                    <div>
                      <label style={inputLabel}>RUC del negocio *</label>
                      <input type="text" placeholder="11 digitos" value={ruc} onChange={(e) => setRuc(e.target.value.replace(/\D/g, "").slice(0, 11))} maxLength="11" required />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                      <div>
                        <label style={inputLabel}>Razón social</label>
                        <input type="text" placeholder="Razon social" value={razonSocial} onChange={(e) => setRazonSocial(e.target.value)} />
                      </div>
                      <div>
                        <label style={inputLabel}>Nombre comercial</label>
                        <input type="text" placeholder="Nombre del local" value={nombreComercial} onChange={(e) => setNombreComercial(e.target.value)} />
                      </div>
                    </div>
                    <div>
                      <label style={inputLabel}>Dirección del negocio</label>
                      <input type="text" placeholder="Av. Principal 123" value={direccionNeg} onChange={(e) => setDireccionNeg(e.target.value)} />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                      <div>
                        <label style={inputLabel}>Tipo de negocio</label>
                        <select value={tipoNegocio} onChange={(e) => setTipoNegocio(e.target.value)} style={{ width: "100%", padding: "12px", border: "1.5px solid #e2e8f0", borderRadius: "12px", fontSize: "14px" }}>
                          <option value="">Seleccionar</option>
                          <option value="Comercio">Comercio</option>
                          <option value="Restaurante">Restaurante</option>
                          <option value="Servicios">Servicios</option>
                          <option value="Industria">Industria</option>
                          <option value="Mineria">Mineria</option>
                          <option value="Educacion">Educacion</option>
                          <option value="Salud">Salud</option>
                          <option value="Otro">Otro</option>
                        </select>
                      </div>
                      <div>
                        <label style={inputLabel}>Categoria</label>
                        <select value={categoria} onChange={(e) => setCategoria(e.target.value)} style={{ width: "100%", padding: "12px", border: "1.5px solid #e2e8f0", borderRadius: "12px", fontSize: "14px" }}>
                          <option value="">Seleccionar</option>
                          <option value="Micro">Microempresa</option>
                          <option value="Pequena">Pequena empresa</option>
                          <option value="Mediana">Mediana empresa</option>
                          <option value="Grande">Gran empresa</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <label style={inputLabel}>Correo electrónico</label>
                  <input type="email" placeholder="tu@correo.com" value={correo} onChange={(e) => setCorreo(e.target.value)} required />
                </div>

                <div>
                  <label style={inputLabel}>Contraseña</label>
                  <input type="password" placeholder="Minimo 6 caracteres" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
                </div>

                {modo === "registro" && (
                  <div>
                    <label style={inputLabel}>Confirmar contraseña</label>
                    <input type="password" placeholder="Repite tu contraseña" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={6} />
                  </div>
                )}

                {modo === "login" && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "#64748b", cursor: "pointer" }}>
                      <input type="checkbox" style={{ width: "16px", height: "16px", accentColor: "#1f3b57" }} />
                      Recordar sesión
                    </label>
                    <button type="button" onClick={() => { setMostrarRecuperar(true); setCorreoRecuperacion(correo); setError(""); }} style={{ background: "none", border: "none", color: "#2563eb", fontSize: "13px", cursor: "pointer", fontWeight: 600 }}>
                      Olvidaste tu contraseña?
                    </button>
                  </div>
                )}

                {error && (
                  <div style={{ background: "#fef2f2", padding: "12px 16px", borderRadius: "10px", border: "1px solid #fecaca", fontSize: "14px", color: "#991b1b", display: "flex", alignItems: "flex-start", gap: "10px" }}>
                    <span style={{ fontSize: "16px", marginTop: "1px" }}>&#9888;</span>
                    <span>{error}</span>
                  </div>
                )}

                <button className="primary-btn" type="submit" disabled={cargando} style={{ opacity: cargando ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", padding: "15px", fontSize: "15px", marginTop: "4px" }}>
                  {cargando ? (
                    <>
                      <span style={{ display: "inline-block", width: "16px", height: "16px", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "white", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                      Verificando credenciales...
                    </>
                  ) : modo === "login" ? "Ingresar al sistema" : "Crear cuenta"}
                </button>
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
