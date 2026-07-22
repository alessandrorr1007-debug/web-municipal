const CLOUDINARY_CLOUD_NAME = "drnrrgose";
const CLOUDINARY_UPLOAD_PRESET = "municipal.pdf";

const API_URL = import.meta.env.VITE_API_URL || "";

export const subirArchivoACloudinary = async (file) => {
  const formData = new FormData();

  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
  formData.append("resource_type", "auto");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`,
      {
        method: "POST",
        body: formData,
        signal: controller.signal,
      }
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      let detail = "";
      try {
        const errData = await response.json();
        detail = errData.error?.message || JSON.stringify(errData);
      } catch (e) {
        detail = response.statusText;
      }
      throw new Error(`Error de Cloudinary (${response.status}): ${detail}`);
    }

    const data = await response.json();

    return {
      archivoUrl: data.secure_url,
      archivoNombre: file.name,
      publicId: data.public_id,
      tipo: file.type,
      tamaño: file.size,
    };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === "AbortError") {
      throw new Error(`Tiempo de espera agotado al subir el archivo ${file.name} a Cloudinary.`);
    }
    throw error;
  }
};

export const convertirPdfABase64 = subirArchivoACloudinary;

const normalizarTexto = (texto) => {
  if (!texto) return "";
  return texto
    .replace(/[\u2018\u2019\u201A\u201B\u2039\u203A\u00AB\u00BB\u2032\u2035]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F\u2036\u2037]/g, '"')
    .replace(/[\s]+/g, " ")
    .trim();
};

export { normalizarTexto };
export const abrirPdf = async (urlInput) => {
  if (!urlInput) {
    alert("El documento no está disponible actualmente.");
    return;
  }

  // Extraer string si se pasa un objeto
  let url = typeof urlInput === "object"
    ? (urlInput.archivoUrl || urlInput.url || urlInput.base64 || urlInput.dataUrl || urlInput.fileUrl || urlInput.uri || "")
    : String(urlInput);

  url = (url || "").trim();

  if (!url) {
    alert("El documento no está disponible actualmente.");
    return;
  }

  // 1. Si ya es un Blob URL de navegador (blob:http...)
  if (url.startsWith("blob:")) {
    window.open(url, "_blank");
    return;
  }

  // 2. Si la cadena contiene texto plano directo de PDF (%PDF-...)
  if (url.includes("%PDF-")) {
    try {
      const pdfContent = url.substring(url.indexOf("%PDF-"));
      const bytes = new Uint8Array(pdfContent.length);
      for (let i = 0; i < pdfContent.length; i++) {
        bytes[i] = pdfContent.charCodeAt(i) & 0xff;
      }
      const blob = new Blob([bytes], { type: "application/pdf" });
      const blobUrl = URL.createObjectURL(blob);
      const win = window.open(blobUrl, "_blank");
      if (!win) {
        const a = document.createElement("a");
        a.href = blobUrl;
        a.target = "_blank";
        a.rel = "noopener,noreferrer";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
      setTimeout(() => URL.revokeObjectURL(blobUrl), 120000);
      return;
    } catch (e) {
      console.error("Error al procesar PDF en texto plano:", e);
    }
  }

  // 3. Si es una cadena Data URL o Base64
  const esDataUrl = url.startsWith("data:");
  const esBase64Puro = !esDataUrl && !url.startsWith("http://") && !url.startsWith("https://") && (url.startsWith("JVBERi") || url.length > 30);

  if (esDataUrl || esBase64Puro) {
    try {
      let mime = "application/pdf";
      let b64 = url;

      if (esDataUrl) {
        const commaIdx = url.indexOf(",");
        if (commaIdx !== -1) {
          const header = url.substring(0, commaIdx);
          const matchMime = header.match(/^data:(.*?);/);
          if (matchMime) mime = matchMime[1] || "application/pdf";
          b64 = url.substring(commaIdx + 1);
        }
      }

      // Intentar decodificar URL Encoding si existe (%2B, %2F, %3D)
      try {
        if (b64.includes("%")) {
          b64 = decodeURIComponent(b64);
        }
      } catch (e) {
        // Ignorar si decodeURIComponent falla
      }

      // Convertir espacios en '+' (común cuando base64 pasa por HTTP/JSON)
      b64 = b64.replace(/ /g, "+");

      // Remover cualquier carácter que no sea de Base64 (saltos de línea, pestañas, etc.)
      b64 = b64.replace(/[^A-Za-z0-9+/=]/g, "");

      // Asegurar relleno de caracteres '='
      while (b64.length % 4 !== 0) {
        b64 += "=";
      }

      // Decodificar Base64 a Uint8Array binario
      const binaryString = atob(b64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const blob = new Blob([bytes], { type: mime });
      const blobUrl = URL.createObjectURL(blob);

      const win = window.open(blobUrl, "_blank");
      if (!win) {
        const a = document.createElement("a");
        a.href = blobUrl;
        a.target = "_blank";
        a.rel = "noopener,noreferrer";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
      setTimeout(() => URL.revokeObjectURL(blobUrl), 120000);
      return;
    } catch (err) {
      console.error("Error al decodificar PDF Base64:", err);
      alert("El archivo PDF no tiene una codificación válida o está dañado.");
      return;
    }
  }

  // 4. Si es una URL remota HTTP / HTTPS
  if (url.startsWith("http://") || url.startsWith("https://")) {
    const esFirebaseStorage = url.includes("firebasestorage.googleapis.com");
    const esCloudinary = url.includes("cloudinary.com");

    if (esFirebaseStorage) {
      try {
        const res = await fetch(url);
        if (res.ok) {
          const blob = await res.blob();
          const blobUrl = URL.createObjectURL(blob);
          window.open(blobUrl, "_blank");
          setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
          return;
        }
      } catch (e) {
        // Fallback
      }
    }

    if (esCloudinary) {
      try {
        const token = await (await import("../firebase")).getIdToken();
        if (token) {
          const proxyUrl = `${API_URL}/api/documento-proxy?url=${encodeURIComponent(url)}`;
          const res = await fetch(proxyUrl, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const blob = await res.blob();
            const blobUrl = URL.createObjectURL(blob);
            window.open(blobUrl, "_blank");
            setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
            return;
          }
        }
      } catch (e) {
        // Fallback
      }
    }

    try {
      const res = await fetch(url);
      if (res.ok) {
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        window.open(blobUrl, "_blank");
        setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
        return;
      }
    } catch (e) {
      // Fallback
    }

    window.open(url, "_blank");
    return;
  }

  alert("No se pudo cargar el documento.");
};