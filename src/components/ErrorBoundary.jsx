import { Component } from "react";

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("[ErrorBoundary]", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#f1f5f9",
            fontFamily: "system-ui, sans-serif",
            padding: "24px",
          }}
        >
          <div
            style={{
              background: "white",
              borderRadius: "16px",
              padding: "40px",
              maxWidth: "480px",
              width: "100%",
              textAlign: "center",
              boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
            }}
          >
            <div
              style={{
                width: "64px",
                height: "64px",
                borderRadius: "50%",
                background: "#fee2e2",
                display: "grid",
                placeItems: "center",
                margin: "0 auto 20px",
                fontSize: "28px",
              }}
            >
              &#9888;
            </div>
            <h2 style={{ color: "#1f3b57", marginBottom: "8px", fontSize: "20px" }}>
              Ocurrió un error inesperado
            </h2>
            <p style={{ color: "#64748b", fontSize: "14px", marginBottom: "16px", lineHeight: 1.6 }}>
              El sistema encontró un problema al cargar. Por favor, intenta recargar la página.
            </p>

            {this.state.error && (
              <div style={{ background: "#fef2f2", color: "#b91c1c", padding: "12px", borderRadius: "8px", fontSize: "12px", textAlign: "left", marginBottom: "20px", overflowX: "auto", fontFamily: "monospace" }}>
                <strong>Detalle del error:</strong>
                <pre style={{ margin: "6px 0 0", whitespace: "pre-wrap" }}>{this.state.error.toString()}</pre>
                {this.state.error.stack && (
                  <pre style={{ margin: "6px 0 0", fontSize: "10px", opacity: 0.8, whitespace: "pre-wrap" }}>{this.state.error.stack}</pre>
                )}
              </div>
            )}
            <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
              <button
                onClick={() => window.location.reload()}
                style={{
                  background: "#1f3b57",
                  color: "white",
                  border: "none",
                  padding: "12px 24px",
                  borderRadius: "10px",
                  fontSize: "14px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                🔄 Recargar página
              </button>

              <button
                onClick={() => {
                  localStorage.clear();
                  sessionStorage.clear();
                  window.location.href = "/";
                }}
                style={{
                  background: "#dc2626",
                  color: "white",
                  border: "none",
                  padding: "12px 24px",
                  borderRadius: "10px",
                  fontSize: "14px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                🧹 Limpiar y Restablecer
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
