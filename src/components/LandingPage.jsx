function LandingPage({ onLogin, onRegister }) {

  const tarjetas = [
    {
      icono: "&#128221;",
      titulo: "1. Registrar / Hacer un Trámite",
      descripcion: "Ingreso de solicitudes presenciales con validación automática RENIEC/SUNAT y carga de requisitos por giro comercial.",
      color: "#16a34a",
    },
    {
      icono: "&#128269;",
      titulo: "2. Consultar Estado del Trámite",
      descripcion: "Búsqueda en tiempo real por N° de Expediente (EXP-XXXX), DNI o RUC para consultar el estado actual del trámite.",
      color: "#2563eb",
    },
    {
      icono: "&#128176;",
      titulo: "3. Historial de Pagos y Comprobantes",
      descripcion: "Registro de recaudación de aranceles de trámite (S/ 3.00), consulta de comprobantes emitidos e impresión de boletas.",
      color: "#d97706",
    },
  ];

  const pasos = [
    { n: "1", titulo: "Registrate", desc: "Crea tu cuenta con tus datos personales y los de tu negocio." },
    { n: "2", titulo: "Solicita", desc: "Completa el formulario, adjunta documentos y elige el tipo de trámite." },
    { n: "3", titulo: "Paga", desc: "Realiza el pago del derecho de trámite de S/3.00 online o en caja." },
    { n: "4", titulo: "Inspección", desc: "Un inspector visitará tu local para verificar las condiciones." },
    { n: "5", titulo: "Recibe tu licencia", desc: "Si todo está correcto, tu licencia será aprobada y podrás descargarla." },
  ];

  const stats = [
    { valor: "2,500+", label: "Licencias emitidas" },
    { valor: "1,800+", label: "Negocios registrados" },
    { valor: "98%", label: "Trámites exitosos" },
    { valor: "3 días", label: "Tiempo promedio" },
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
            <button type="button" onClick={onLogin} style={{ background: "white", color: "#1f3b57", fontWeight: "bold", border: "none", padding: "10px 22px", fontSize: "14px", borderRadius: "8px" }}>
              Ingresar al Sistema
            </button>
          </div>
        </div>
      </nav>

      <section className="landing-hero">
        <div className="landing-hero-content">
          <span className="eyebrow" style={{ background: "rgba(255,255,255,0.15)", color: "white" }}>Plataforma Oficial</span>
          <h1>Sistema Web de Gestión de<br />Licencias de Funcionamiento</h1>
          <p style={{ fontSize: "18px", color: "#93c5fd", maxWidth: "640px", margin: "0 auto 32px" }}>
            Gestión integral de licencias de funcionamiento de la Municipalidad Provincial de Trujillo.
          </p>
          <div style={{ display: "flex", gap: "14px", justifyContent: "center", flexWrap: "wrap" }}>
            <button type="button" onClick={onLogin} style={{ background: "white", color: "#1f3b57", padding: "16px 32px", fontSize: "16px", fontWeight: 700, borderRadius: "14px" }}>
              Acceder al Sistema Municipal
            </button>
          </div>
        </div>
      </section>

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
          <h2>¿Qué puedes hacer en la plataforma?</h2>
          <p>Gestiona tu licencia de funcionamiento de manera rápida y segura.</p>
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
          <h2>¿Cómo obtener tu licencia?</h2>
          <p>Sigue estos pasos para completar tu trámite de licencia municipal.</p>
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
          <span className="eyebrow" style={{ background: "#dbeafe", color: "#1f3b57" }}>Información</span>
          <h2>Sobre las licencias de funcionamiento</h2>
        </div>
        <div style={{ maxWidth: "800px", margin: "0 auto", display: "grid", gap: "20px" }}>
          <div style={{ background: "#f8fafc", padding: "24px", borderRadius: "16px", border: "1px solid #e2e8f0" }}>
            <h3 style={{ margin: "0 0 8px", color: "#0f172a" }}>¿Qué es una licencia de funcionamiento?</h3>
            <p style={{ margin: 0, color: "#475569", lineHeight: "1.7" }}>
              Es un documento oficial emitido por la Municipalidad de Trujillo que autoriza a un negocio a operar
              en jurisdicción municipal. Es obligatoria para todo establecimiento comercial, industrial o de servicios.
            </p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            <div style={{ background: "#f0fdf4", padding: "20px", borderRadius: "14px", border: "1px solid #bbf7d0" }}>
              <h4 style={{ margin: "0 0 6px", color: "#166534" }}>Licencia nueva</h4>
              <p style={{ margin: 0, color: "#166534", fontSize: "14px" }}>Monto: S/3.00 | Vigencia: 1 año</p>
            </div>
            <div style={{ background: "#eff6ff", padding: "20px", borderRadius: "14px", border: "1px solid #bfdbfe" }}>
              <h4 style={{ margin: "0 0 6px", color: "#1e3a8a" }}>Renovación anual</h4>
              <p style={{ margin: 0, color: "#1e3a8a", fontSize: "14px" }}>Monto: S/3.00 | Renovar antes de vencer</p>
            </div>
          </div>
          <div style={{ background: "#fef3c7", padding: "20px", borderRadius: "14px", border: "1px solid #fde68a" }}>
            <h4 style={{ margin: "0 0 6px", color: "#92400e" }}>&#9888; Importante</h4>
            <p style={{ margin: 0, color: "#92400e", fontSize: "14px" }}>
              La licencia tiene una vigencia de 1 año. Debe renovarse antes de la fecha de vencimiento.
              Si vence, el negocio quedará operando sin autorización municipal.
            </p>
          </div>
        </div>
      </section>

      <section className="landing-contacto" style={{ background: "#1f3b57", color: "white", padding: "60px 24px", textAlign: "center" }}>
        <h2 style={{ margin: "0 0 12px" }}>WEB-MUNICIPAL</h2>
        <p style={{ color: "#93c5fd", margin: "0 0 24px", fontSize: "16px" }}>
          Plataforma Digital de Trámites Municipales
        </p>
        <div style={{ display: "flex", gap: "24px", justifyContent: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: "14px", color: "#bfdbfe" }}>&#128231; webmunicipal01@gmail.com</span>
          <span style={{ fontSize: "14px", color: "#bfdbfe" }}>&#127760; https://web-municipal-1.onrender.com</span>
        </div>
      </section>

      <footer className="landing-footer" style={{ background: "#0f172a", color: "#64748b", padding: "24px", textAlign: "center", fontSize: "13px" }}>
        <p style={{ margin: "0 0 4px" }}>Sistema Web de Gestión de Licencias de Funcionamiento v1.0</p>
        <p style={{ margin: 0 }}>WEB-MUNICIPAL &copy; {new Date().getFullYear()}</p>
      </footer>
    </div>
  );
}

export default LandingPage;
