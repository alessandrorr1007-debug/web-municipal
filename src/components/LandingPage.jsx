import { useState } from "react";

function LandingPage({ onLogin, onRegister }) {
  const [consultaRuc, setConsultaRuc] = useState("");
  const [mostrarConsulta, setMostrarConsulta] = useState(false);

  const tarjetas = [
    {
      icono: "&#128221;",
      titulo: "Solicita tu licencia online",
      descripcion: "Registra tu solicitud desde cualquier lugar, paga en linea y da seguimiento a tu expediente.",
      color: "#2563eb",
    },
    {
      icono: "&#128260;",
      titulo: "Renueva tu licencia",
      descripcion: "Si tu licencia esta por vencer o ya vencio, renueva de manera rapida y sencilla.",
      color: "#0f766e",
    },
    {
      icono: "&#128269;",
      titulo: "Consulta el estado de tu tramite",
      descripcion: "Ingresa tu RUC y revisa en tiempo real el avance de tu solicitud.",
      color: "#7c3aed",
    },
  ];

  const pasos = [
    { n: "1", titulo: "Registrate", desc: "Crea tu cuenta con tus datos personales y los de tu negocio." },
    { n: "2", titulo: "Solicita", desc: "Completa el formulario, adjunta documentos y elige el tipo de tramite." },
    { n: "3", titulo: "Paga", desc: "Realiza el pago del derecho de tramite de S/3.00 online o en caja." },
    { n: "4", titulo: "Inspeccion", desc: "Un inspector visitara tu local para verificar las condiciones." },
    { n: "5", titulo: "Recibe tu licencia", desc: "Si todo esta correcto, tu licencia sera aprobada y podras descargarla." },
  ];

  const stats = [
    { valor: "2,500+", label: "Licencias emitidas" },
    { valor: "1,800+", label: "Negocios registrados" },
    { valor: "98%", label: "Tramites exitosos" },
    { valor: "3 dias", label: "Tiempo promedio" },
  ];

  return (
    <div className="landing-page">
      <nav className="landing-nav">
        <div className="landing-nav-inner">
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "rgba(255,255,255,0.15)", display: "grid", placeItems: "center", fontSize: "18px", border: "1px solid rgba(255,255,255,0.2)" }}>
              &#9881;
            </div>
            <span style={{ fontWeight: 800, fontSize: "16px" }}>Municipalidad de Trujillo</span>
          </div>
          <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            <button type="button" onClick={onLogin} style={{ background: "rgba(255,255,255,0.12)", color: "white", border: "1px solid rgba(255,255,255,0.25)", padding: "10px 20px", fontSize: "14px" }}>
              Iniciar sesion
            </button>
            <button type="button" onClick={onRegister} style={{ background: "white", color: "#1f3b57", padding: "10px 20px", fontSize: "14px" }}>
              Registrarse
            </button>
          </div>
        </div>
      </nav>

      <section className="landing-hero">
        <div className="landing-hero-content">
          <span className="eyebrow" style={{ background: "rgba(255,255,255,0.15)", color: "white" }}>Plataforma oficial</span>
          <h1>Sistema Web de Gestion de<br />Licencias de Funcionamiento</h1>
          <p style={{ fontSize: "18px", color: "#93c5fd", maxWidth: "640px", margin: "0 auto 32px" }}>
            Solicita, renueva y da seguimiento a tu licencia municipal de funcionamiento de manera 100% digital. Tambien puedes realizar el tramite de forma presencial en nuestras oficinas.
          </p>
          <div style={{ display: "flex", gap: "14px", justifyContent: "center", flexWrap: "wrap" }}>
            <button type="button" onClick={onRegister} style={{ background: "white", color: "#1f3b57", padding: "16px 32px", fontSize: "16px", fontWeight: 700, borderRadius: "14px" }}>
              Solicitar licencia
            </button>
            <button type="button" onClick={() => setMostrarConsulta(true)} style={{ background: "rgba(255,255,255,0.12)", color: "white", border: "1px solid rgba(255,255,255,0.25)", padding: "16px 32px", fontSize: "16px", borderRadius: "14px" }}>
              Consultar tramite
            </button>
          </div>
        </div>
      </section>

      {mostrarConsulta && (
        <section className="landing-consulta" style={{ background: "white", padding: "40px 24px", textAlign: "center" }}>
          <h2 style={{ margin: "0 0 8px", color: "#0f172a" }}>Consulta el estado de tu tramite</h2>
          <p style={{ margin: "0 0 20px", color: "#64748b" }}>Ingresa tu RUC para ver el avance de tu solicitud.</p>
          <div style={{ display: "flex", gap: "10px", maxWidth: "500px", margin: "0 auto" }}>
            <input
              type="text"
              placeholder="Ingresa tu RUC"
              value={consultaRuc}
              onChange={(e) => setConsultaRuc(e.target.value.replace(/\D/g, ""))}
              maxLength="11"
              style={{ flex: 1, padding: "14px 16px", border: "1.5px solid #e2e8f0", borderRadius: "12px", fontSize: "15px" }}
            />
            <button type="button" style={{ padding: "14px 24px", background: "#1f3b57", color: "white", border: "none", borderRadius: "12px", fontWeight: 700 }}>
              Buscar
            </button>
          </div>
          <button type="button" onClick={() => setMostrarConsulta(false)} style={{ marginTop: "12px", background: "none", color: "#64748b", border: "none", cursor: "pointer", fontSize: "14px" }}>
            Cerrar
          </button>
        </section>
      )}

      <section className="landing-stats">
        <div className="landing-stats-grid">
          {stats.map((s) => (
            <div key={s.label} className="landing-stat">
              <strong>{s.valor}</strong>
              <span>{s.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-cards">
        <div className="landing-section-header">
          <span className="eyebrow">Servicios</span>
          <h2>Que puedes hacer en la plataforma?</h2>
          <p>Gestiona tu licencia de funcionamiento de manera rapida y segura.</p>
        </div>
        <div className="landing-cards-grid">
          {tarjetas.map((t, i) => (
            <div key={i} className="landing-card" style={{ borderTop: `4px solid ${t.color}` }}>
              <div style={{ fontSize: "36px", marginBottom: "12px" }} dangerouslySetInnerHTML={{ __html: t.icono }} />
              <h3>{t.titulo}</h3>
              <p>{t.descripcion}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-pasos" style={{ background: "#f8fafc" }}>
        <div className="landing-section-header">
          <span className="eyebrow" style={{ background: "#dbeafe", color: "#1f3b57" }}>Proceso</span>
          <h2>Como obtener tu licencia?</h2>
          <p>Sigue estos pasos para completar tu tramite de licencia municipal.</p>
        </div>
        <div className="landing-pasos-grid">
          {pasos.map((p) => (
            <div key={p.n} className="landing-paso">
              <div className="landing-paso-num">{p.n}</div>
              <h3>{p.titulo}</h3>
              <p>{p.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-info" style={{ background: "white" }}>
        <div className="landing-section-header">
          <span className="eyebrow" style={{ background: "#dbeafe", color: "#1f3b57" }}>Informacion</span>
          <h2>Sobre las licencias de funcionamiento</h2>
        </div>
        <div style={{ maxWidth: "800px", margin: "0 auto", display: "grid", gap: "20px" }}>
          <div style={{ background: "#f8fafc", padding: "24px", borderRadius: "16px", border: "1px solid #e2e8f0" }}>
            <h3 style={{ margin: "0 0 8px", color: "#0f172a" }}>Que es una licencia de funcionamiento?</h3>
            <p style={{ margin: 0, color: "#475569", lineHeight: "1.7" }}>
              Es un documento oficial emitido por la Municipalidad de Trujillo que autoriza a un negocio a operar
              en jurisdiction municipal. Es obligatoria para todo establecimiento comercial, industrial o de servicios.
            </p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            <div style={{ background: "#f0fdf4", padding: "20px", borderRadius: "14px", border: "1px solid #bbf7d0" }}>
              <h4 style={{ margin: "0 0 6px", color: "#166534" }}>Licencia nueva</h4>
              <p style={{ margin: 0, color: "#166534", fontSize: "14px" }}>Monto: S/3.00 | Vigencia: 1 ano</p>
            </div>
            <div style={{ background: "#eff6ff", padding: "20px", borderRadius: "14px", border: "1px solid #bfdbfe" }}>
              <h4 style={{ margin: "0 0 6px", color: "#1e3a8a" }}>Renovacion anual</h4>
              <p style={{ margin: 0, color: "#1e3a8a", fontSize: "14px" }}>Monto: S/3.00 | Renovar antes de vencer</p>
            </div>
          </div>
          <div style={{ background: "#fef3c7", padding: "20px", borderRadius: "14px", border: "1px solid #fde68a" }}>
            <h4 style={{ margin: "0 0 6px", color: "#92400e" }}>&#9888; Importante</h4>
            <p style={{ margin: 0, color: "#92400e", fontSize: "14px" }}>
              La licencia tiene una vigencia de 1 ano. Debe renovarse antes de la fecha de vencimiento.
              Si vence, el negocio quedara operando sin autorizacion municipal.
            </p>
          </div>
        </div>
      </section>

      <section className="landing-contacto" style={{ background: "#1f3b57", color: "white", padding: "60px 24px", textAlign: "center" }}>
        <h2 style={{ margin: "0 0 12px" }}>Municipalidad de Trujillo</h2>
        <p style={{ color: "#93c5fd", margin: "0 0 24px", fontSize: "16px" }}>
          Av. Espana Nro. 456, Centro de Trujillo - La Libertad
        </p>
        <div style={{ display: "flex", gap: "24px", justifyContent: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: "14px", color: "#bfdbfe" }}>&#128222; (044) 234567</span>
          <span style={{ fontSize: "14px", color: "#bfdbfe" }}>&#128231; tramites@mtrujillo.gob.pe</span>
          <span style={{ fontSize: "14px", color: "#bfdbfe" }}>&#128205; Trujillo, La Libertad</span>
        </div>
      </section>

      <footer className="landing-footer" style={{ background: "#0f172a", color: "#64748b", padding: "24px", textAlign: "center", fontSize: "13px" }}>
        <p style={{ margin: "0 0 4px" }}>Sistema Web de Gestion de Licencias de Funcionamiento v1.0</p>
        <p style={{ margin: 0 }}>Municipalidad Provincial de Trujillo &copy; {new Date().getFullYear()}</p>
      </footer>
    </div>
  );
}

export default LandingPage;
