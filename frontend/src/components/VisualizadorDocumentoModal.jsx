import { useEffect, useState } from "react";
import { obtenerBlobUrlParaPdf, abrirPdf } from "../services/pdfService";

export default function VisualizadorDocumentoModal({ documento, onCerrar }) {
  const [blobUrl, setBlobUrl] = useState(null);
  const [esImagen, setEsImagen] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [zoom, setZoom] = useState(100);

  useEffect(() => {
    if (!documento) return;
    setCargando(true);

    let rawUrl = typeof documento === "object"
      ? (documento.archivoUrl || documento.url || documento.base64 || documento.dataUrl || documento.fileUrl || documento.uri || "")
      : String(documento);

    rawUrl = (rawUrl || "").trim();

    const tipoMime = (documento?.tipo || "").toLowerCase();
    const esImg = tipoMime.startsWith("image/") ||
                  rawUrl.startsWith("data:image/") ||
                  /\.(jpg|jpeg|png|webp|gif)$/i.test(rawUrl);

    setEsImagen(esImg);

    if (esImg) {
      setBlobUrl(rawUrl);
    } else {
      const generatedBlobUrl = obtenerBlobUrlParaPdf(rawUrl);
      setBlobUrl(generatedBlobUrl);
    }

    setCargando(false);
  }, [documento]);

  if (!documento) return null;

  const nombreArchivo = documento.nombre || documento.archivoNombre || "Documento_Adjunto.pdf";

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(15, 23, 42, 0.85)",
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
            <span style={{ fontSize: "24px" }}>{esImagen ? "🖼️" : "📄"}</span>
            <div>
              <h3 style={{ margin: 0, fontSize: "16.5px", fontWeight: "800", color: "#f8fafc" }}>
                {esImagen ? "Visualizador de Imagen" : "Visualizador Municipal de PDF"}
              </h3>
              <small style={{ color: "#94a3b8", fontSize: "12px", display: "block" }}>
                {nombreArchivo}
              </small>
            </div>
          </div>

          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            {esImagen && (
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

        {/* CUERPO DEL VISOR CON SOPORTE COMPLETO PDF E IMÁGENES */}
        <div style={{ flex: 1, background: "#334155", position: "relative", display: "flex", alignItems: "center", justifyContent: "center", overflow: "auto" }}>
          {cargando ? (
            <div style={{ color: "white", textAlign: "center" }}>
              <div className="spinner" style={{ margin: "0 auto 12px" }} />
              <p style={{ margin: 0, fontWeight: "bold" }}>Cargando vista previa del documento...</p>
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
            <object
              data={blobUrl}
              type="application/pdf"
              style={{ width: "100%", height: "100%", border: "none" }}
            >
              <embed
                src={blobUrl}
                type="application/pdf"
                style={{ width: "100%", height: "100%", border: "none" }}
              />
              <div style={{ padding: "40px", textAlign: "center", color: "white" }}>
                <p style={{ fontSize: "16px", marginBottom: "16px" }}>
                  Su navegador no tiene activo el visor integrado de PDF.
                </p>
                <button
                  type="button"
                  onClick={() => abrirPdf(documento)}
                  style={{ padding: "12px 24px", background: "#2563eb", color: "white", border: "none", borderRadius: "10px", fontWeight: "bold", fontSize: "14.5px", cursor: "pointer" }}
                >
                  📄 Clic aquí para abrir/descargar el PDF
                </button>
              </div>
            </object>
          )}
        </div>
      </div>
    </div>
  );
}
