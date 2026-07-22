import { useEffect, useState } from "react";
import { diagnosticarYProcesarPdf, abrirPdf } from "../services/pdfService";

export default function VisualizadorDocumentoModal({ documento, onCerrar }) {
  const [blobUrl, setBlobUrl] = useState(null);
  const [esImagen, setEsImagen] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [errorDiagnostico, setErrorDiagnostico] = useState(null);
  const [mostrarDetallesTecnicos, setMostrarDetallesTecnicos] = useState(false);
  const [zoom, setZoom] = useState(100);

  const ejecutarDiagnostico = async () => {
    if (!documento) return;
    setCargando(true);
    setErrorDiagnostico(null);

    try {
      const res = await diagnosticarYProcesarPdf(documento);
      console.log("[VISOR MODAL] Resultado del diagnóstico:", res);

      if (res.valido) {
        setEsImagen(!!res.esImagen);
        setBlobUrl(res.blobUrl);
      } else {
        setErrorDiagnostico(res);
      }
    } catch (err) {
      console.error("[VISOR MODAL] Error de excepción inesperada en diagnóstico:", err);
      setErrorDiagnostico({
        valido: false,
        codigoError: "EXCEPCION_INESPERADA",
        motivo: `Ocurrió una excepción imprevista durante la carga: ${err.message || String(err)}`,
        detalles: err.stack || String(err),
      });
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    ejecutarDiagnostico();
  }, [documento]);

  if (!documento) return null;

  const nombreArchivo = documento.nombre || documento.archivoNombre || "Documento_Adjunto.pdf";
  const rawUrl = typeof documento === "object"
    ? (documento.archivoUrl || documento.url || documento.base64 || documento.dataUrl || documento.fileUrl || documento.uri || "")
    : String(documento);

  const descargarDirecto = () => {
    try {
      const urlADescargar = blobUrl || rawUrl;
      const a = document.createElement("a");
      a.href = urlADescargar;
      a.download = nombreArchivo.endsWith(".pdf") ? nombreArchivo : `${nombreArchivo}.pdf`;
      a.target = "_blank";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (e) {
      abrirPdf(documento);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(15, 23, 42, 0.88)",
        backdropFilter: "blur(8px)",
        zIndex: 999999,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
    >
      <div
        style={{
          background: "#ffffff",
          borderRadius: "16px",
          width: "100%",
          maxWidth: "1050px",
          height: "90vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.35)",
          overflow: "hidden",
          border: "1px solid #334155",
        }}
      >
        {/* ENCABEZADO DEL MODAL */}
        <div
          style={{
            background: "#0f172a",
            color: "white",
            padding: "14px 24px",
            display: "flex",
            justify: "space-between",
            alignItems: "center",
            borderBottom: "2px solid #1e293b",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ fontSize: "24px" }}>{errorDiagnostico ? "⚠️" : esImagen ? "🖼️" : "📄"}</span>
            <div>
              <h3 style={{ margin: 0, fontSize: "16.5px", fontWeight: "800", color: "#f8fafc" }}>
                {errorDiagnostico ? "Diagnóstico de Carga de Documento" : esImagen ? "Visualizador de Imagen" : "Visualizador Municipal de PDF"}
              </h3>
              <small style={{ color: "#94a3b8", fontSize: "12px", display: "block" }}>
                {nombreArchivo}
              </small>
            </div>
          </div>

          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            {esImagen && !errorDiagnostico && (
              <>
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.max(50, z - 25))}
                  style={{ padding: "6px 12px", background: "#334155", color: "white", border: "none", borderRadius: "6px", fontSize: "13px", fontWeight: "bold", cursor: "pointer" }}
                >
                  🔍 -
                </button>
                <span style={{ color: "#cbd5e1", fontSize: "12px", fontWeight: "bold" }}>{zoom}%</span>
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.min(250, z + 25))}
                  style={{ padding: "6px 12px", background: "#334155", color: "white", border: "none", borderRadius: "6px", fontSize: "13px", fontWeight: "bold", cursor: "pointer" }}
                >
                  🔍 +
                </button>
              </>
            )}

            <button
              type="button"
              onClick={descargarDirecto}
              style={{
                padding: "8px 14px",
                background: "#16a34a",
                color: "white",
                border: "none",
                borderRadius: "8px",
                fontSize: "12.5px",
                fontWeight: "bold",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              📥 Descargar PDF
            </button>

            <button
              type="button"
              onClick={() => abrirPdf(documento)}
              style={{
                padding: "8px 14px",
                background: "#2563eb",
                color: "white",
                border: "none",
                borderRadius: "8px",
                fontSize: "12.5px",
                fontWeight: "bold",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              ↗ Abrir en Pestaña
            </button>

            <button
              type="button"
              onClick={onCerrar}
              style={{
                background: "#dc2626",
                color: "white",
                border: "none",
                width: "36px",
                height: "36px",
                borderRadius: "50%",
                fontWeight: "bold",
                fontSize: "18px",
                cursor: "pointer",
                display: "grid",
                placeItems: "center",
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* CUERPO DEL VISOR CON DIAGNÓSTICO Y RENDERING */}
        <div style={{ flex: 1, background: "#1e293b", position: "relative", display: "flex", alignItems: "center", justifyContent: "center", overflow: "auto" }}>
          {cargando ? (
            <div style={{ color: "white", textAlign: "center", padding: "40px" }}>
              <div style={{ fontSize: "32px", marginBottom: "16px" }} className="animate-spin">⏳</div>
              <h4 style={{ margin: "0 0 8px", fontSize: "18px", color: "#f8fafc" }}>Analizando e inspeccionando documento PDF...</h4>
              <p style={{ margin: 0, color: "#94a3b8", fontSize: "13.5px" }}>Verificando headers binarios, firma %PDF-, respuestas HTTP y Base64.</p>
            </div>
          ) : errorDiagnostico ? (
            /* PANTALLA DETALLADA DE CAUSA RAÍZ DEL ERROR */
            <div style={{ maxWidth: "680px", width: "90%", background: "#0f172a", border: "1px solid #334155", borderRadius: "16px", padding: "28px", color: "white", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.5)", textAlign: "center" }}>
              <div style={{ fontSize: "48px", marginBottom: "12px" }}>
                {errorDiagnostico.codigoError === "404_NOT_FOUND" ? "🔍" :
                 errorDiagnostico.codigoError === "403_FORBIDDEN" ? "🔒" :
                 errorDiagnostico.codigoError === "PDF_CORRUPTO" || errorDiagnostico.codigoError === "BASE64_INVALIDO" ? "⚠️" :
                 errorDiagnostico.codigoError === "RESPUESTA_NO_ES_PDF" ? "📄" : "❌"}
              </div>

              <h3 style={{ margin: "0 0 10px", fontSize: "20px", fontWeight: "800", color: "#f87171" }}>
                {errorDiagnostico.codigoError === "404_NOT_FOUND" && "PDF No Encontrado (Error 404)"}
                {errorDiagnostico.codigoError === "403_FORBIDDEN" && "Acceso Denegado / Permisos Insuficientes (Error 403)"}
                {errorDiagnostico.codigoError === "PDF_CORRUPTO" && "Archivo PDF Corrupto o Malformado"}
                {errorDiagnostico.codigoError === "BASE64_INVALIDO" && "Codificación Base64 Inválida"}
                {errorDiagnostico.codigoError === "RESPUESTA_NO_ES_PDF" && "El Servidor Devolvió HTML o Error en lugar de PDF"}
                {errorDiagnostico.codigoError === "URL_VACIA" && "Origen del Archivo Vacío o Nulo"}
                {errorDiagnostico.codigoError === "CORS_O_RED" && "Error de Conexión o Restricción CORS"}
                {errorDiagnostico.codigoError === "SERVER_ERROR" && "Error Interno del Servidor Remoto (Error 500)"}
                {!["404_NOT_FOUND", "403_FORBIDDEN", "PDF_CORRUPTO", "BASE64_INVALIDO", "RESPUESTA_NO_ES_PDF", "URL_VACIA", "CORS_O_RED", "SERVER_ERROR"].includes(errorDiagnostico.codigoError) && `Error al Cargar Documento (${errorDiagnostico.codigoError || "ERROR"})`}
              </h3>

              <div style={{ background: "#1e293b", padding: "14px 18px", borderRadius: "10px", border: "1px solid #334155", margin: "16px 0", textAlign: "left" }}>
                <p style={{ margin: "0 0 6px", fontSize: "14px", color: "#e2e8f0", fontWeight: "600" }}>
                  <strong>Motivo Detectado:</strong> {errorDiagnostico.motivo}
                </p>
                <small style={{ color: "#94a3b8", fontSize: "12px", display: "block" }}>
                  <strong>Código de Error:</strong> {errorDiagnostico.codigoError}
                </small>
              </div>

              {/* BOTÓN REGISTRO TÉCNICO COMPLETO */}
              <button
                type="button"
                onClick={() => setMostrarDetallesTecnicos(!mostrarDetallesTecnicos)}
                style={{ background: "#334155", color: "#cbd5e1", border: "none", padding: "6px 14px", borderRadius: "6px", fontSize: "12px", cursor: "pointer", marginBottom: "16px", fontWeight: "bold" }}
              >
                {mostrarDetallesTecnicos ? "🔼 Ocultar Diagnóstico Técnico" : "📋 Ver Diagnóstico Técnico Detallado"}
              </button>

              {mostrarDetallesTecnicos && (
                <div style={{ background: "#020617", border: "1px solid #1e293b", padding: "12px", borderRadius: "8px", textAlign: "left", fontSize: "11.5px", fontFamily: "monospace", color: "#38bdf8", maxHeight: "150px", overflow: "auto", marginBottom: "16px", whiteSpace: "pre-wrap" }}>
                  {errorDiagnostico.detalles || JSON.stringify(errorDiagnostico, null, 2)}
                </div>
              )}

              {/* OPCIONES DE RESPALDO GARANTIZADAS */}
              <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap", marginTop: "10px" }}>
                <button
                  type="button"
                  onClick={descargarDirecto}
                  style={{ padding: "10px 18px", background: "#16a34a", color: "white", border: "none", borderRadius: "8px", fontSize: "13.5px", fontWeight: "bold", cursor: "pointer" }}
                >
                  📥 Descargar Archivo Directo
                </button>
                <button
                  type="button"
                  onClick={() => abrirPdf(documento)}
                  style={{ padding: "10px 18px", background: "#2563eb", color: "white", border: "none", borderRadius: "8px", fontSize: "13.5px", fontWeight: "bold", cursor: "pointer" }}
                >
                  ↗ Abrir en Nueva Pestaña
                </button>
                <button
                  type="button"
                  onClick={ejecutarDiagnostico}
                  style={{ padding: "10px 18px", background: "#475569", color: "white", border: "none", borderRadius: "8px", fontSize: "13.5px", fontWeight: "bold", cursor: "pointer" }}
                >
                  🔄 Reintentar Diagnóstico
                </button>
              </div>
            </div>
          ) : esImagen ? (
            <div style={{ padding: "20px", display: "flex", justifyContent: "center", alignItems: "center", width: "100%", height: "100%" }}>
              <img
                src={blobUrl}
                alt={nombreArchivo}
                style={{
                  maxWidth: `${zoom}%`,
                  maxHeight: `${zoom}%`,
                  objectFit: "contain",
                  borderRadius: "8px",
                  boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
                  transition: "transform 0.2s ease",
                }}
              />
            </div>
          ) : (
            <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
              <iframe
                src={blobUrl}
                title={nombreArchivo}
                style={{ width: "100%", height: "100%", border: "none", flex: 1 }}
              />
              <div style={{ padding: "10px 16px", background: "#0f172a", borderTop: "1px solid #334155", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "#94a3b8", fontSize: "12px" }}>
                  📄 Visor Municipal PDF — {nombreArchivo}
                </span>
                <button
                  type="button"
                  onClick={descargarDirecto}
                  style={{ padding: "8px 16px", background: "#16a34a", color: "white", border: "none", borderRadius: "6px", fontWeight: "bold", fontSize: "12.5px", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}
                >
                  📥 Descargar Archivo PDF
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
