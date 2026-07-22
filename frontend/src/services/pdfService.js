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

export const diagnosticarYProcesarPdf = async (urlInput) => {
  const ts = new Date().toISOString();
  console.log(`[PDF-DIAGNOSTICO ${ts}] === INICIO DE DIAGNÓSTICO DE DOCUMENTO ===`);

  if (!urlInput) {
    console.error(`[PDF-DIAGNOSTICO ${ts}] FAIL: Entrada nula o indefinida.`);
    return {
      valido: false,
      codigoError: "URL_VACIA",
      motivo: "El documento solicitado no contiene una URL o archivo de origen (URL nula o vacía).",
      blobUrl: null,
      detalles: "Input recibido: null / undefined / vacio."
    };
  }

  let rawUrl = typeof urlInput === "object"
    ? (urlInput.archivoUrl || urlInput.url || urlInput.base64 || urlInput.dataUrl || urlInput.fileUrl || urlInput.uri || "")
    : String(urlInput);

  rawUrl = (rawUrl || "").trim();
  console.log(`[PDF-DIAGNOSTICO ${ts}] URL/Origen extraído (${rawUrl.length} caracteres): "${rawUrl.substring(0, 120)}..."`);

  if (!rawUrl) {
    console.error(`[PDF-DIAGNOSTICO ${ts}] FAIL: La cadena de la URL está vacía.`);
    return {
      valido: false,
      codigoError: "URL_VACIA",
      motivo: "No se encontró una dirección URL válida ni contenido Base64 en el objeto del documento.",
      blobUrl: null,
      detalles: JSON.stringify(urlInput, null, 2)
    };
  }

  if (rawUrl.startsWith("blob:")) {
    console.log(`[PDF-DIAGNOSTICO ${ts}] OK: Se detectó Blob URL activo de navegador.`);
    return { valido: true, blobUrl: rawUrl, tipo: "application/pdf" };
  }

  if (rawUrl.includes("%PDF-")) {
    try {
      console.log(`[PDF-DIAGNOSTICO ${ts}] Procesando texto plano %PDF-...`);
      const pdfContent = rawUrl.substring(rawUrl.indexOf("%PDF-"));
      const bytes = new Uint8Array(pdfContent.length);
      for (let i = 0; i < pdfContent.length; i++) {
        bytes[i] = pdfContent.charCodeAt(i) & 0xff;
      }
      if (bytes[0] !== 0x25 || bytes[1] !== 0x50 || bytes[2] !== 0x44 || bytes[3] !== 0x46) {
        throw new Error("Encabezado %PDF- no coincide con la firma binaria 0x25 0x50 0x44 0x46.");
      }
      const blob = new Blob([bytes], { type: "application/pdf" });
      const blobUrl = URL.createObjectURL(blob);
      console.log(`[PDF-DIAGNOSTICO ${ts}] OK: Blob URL generado desde %PDF- (${bytes.length} bytes).`);
      return { valido: true, blobUrl, tamano: bytes.length, tipo: "application/pdf" };
    } catch (e) {
      console.error(`[PDF-DIAGNOSTICO ${ts}] FAIL: Error parseando %PDF- texto:`, e.message);
      return {
        valido: false,
        codigoError: "PDF_CORRUPTO",
        motivo: `El archivo PDF está corrupto o malformado: ${e.message}`,
        detalles: e.stack || String(e)
      };
    }
  }

  const esDataUrl = rawUrl.startsWith("data:");
  const esBase64Puro = !esDataUrl && !rawUrl.startsWith("http://") && !rawUrl.startsWith("https://") && (rawUrl.startsWith("JVBERi") || rawUrl.length > 30);

  if (esDataUrl || esBase64Puro) {
    try {
      console.log(`[PDF-DIAGNOSTICO ${ts}] Procesando codificación Base64 / Data URL...`);
      let mime = "application/pdf";
      let b64 = rawUrl;

      if (esDataUrl) {
        const commaIdx = rawUrl.indexOf(",");
        if (commaIdx !== -1) {
          const header = rawUrl.substring(0, commaIdx);
          const matchMime = header.match(/^data:(.*?);/);
          if (matchMime) mime = matchMime[1] || "application/pdf";
          b64 = rawUrl.substring(commaIdx + 1);
        }
      }

      try {
        if (b64.includes("%")) b64 = decodeURIComponent(b64);
      } catch (e) {}

      b64 = b64.replace(/ /g, "+").replace(/[^A-Za-z0-9+/=]/g, "");
      while (b64.length % 4 !== 0) b64 += "=";

      const binaryString = atob(b64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const esPdfMagic = bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
      const esPngMagic = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47;
      const esJpgMagic = bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF;

      if (!esPdfMagic && !esPngMagic && !esJpgMagic) {
        console.warn(`[PDF-DIAGNOSTICO ${ts}] Firma binaria inusual: ${Array.from(bytes.slice(0, 8)).map(b => b.toString(16)).join(" ")}`);
        try {
          const textContent = new TextDecoder().decode(bytes);
          if (textContent.includes("error") || textContent.includes("<!DOCTYPE")) {
            return {
              valido: false,
              codigoError: "RESPUESTA_NO_ES_PDF",
              motivo: "El servidor devolvió una respuesta HTML de error o JSON en lugar de un archivo PDF.",
              detalles: textContent.substring(0, 300)
            };
          }
        } catch (_) {}
      }

      const blob = new Blob([bytes], { type: mime });
      const blobUrl = URL.createObjectURL(blob);
      console.log(`[PDF-DIAGNOSTICO ${ts}] OK: Base64 decodificado (${bytes.length} bytes, Mime: ${mime}).`);
      return { valido: true, blobUrl, tamano: bytes.length, tipo: mime, esImagen: esPngMagic || esJpgMagic };
    } catch (err) {
      console.error(`[PDF-DIAGNOSTICO ${ts}] FAIL: Error al decodificar Base64:`, err.message);
      return {
        valido: false,
        codigoError: "BASE64_INVALIDO",
        motivo: `Codificación Base64 inválida o datos dañados: ${err.message}`,
        detalles: String(err)
      };
    }
  }

  if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) {
    try {
      console.log(`[PDF-DIAGNOSTICO ${ts}] Solicitando HTTP GET a: ${rawUrl}`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(rawUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      console.log(`[PDF-DIAGNOSTICO ${ts}] Respuesta HTTP Status: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        if (response.status === 404) {
          return { valido: false, codigoError: "404_NOT_FOUND", motivo: "El archivo PDF no existe o fue eliminado del servidor (Error 404 Not Found)." };
        }
        if (response.status === 401 || response.status === 403) {
          return { valido: false, codigoError: "403_FORBIDDEN", motivo: "Acceso denegado al archivo PDF. Permisos insuficientes o enlace privado (Error 403/401)." };
        }
        return { valido: false, codigoError: "SERVER_ERROR", motivo: `El servidor devolvió un error HTTP ${response.status}: ${response.statusText}` };
      }

      const contentType = response.headers.get("content-type") || "";
      console.log(`[PDF-DIAGNOSTICO ${ts}] Header Content-Type recibido: "${contentType}"`);

      const arrayBuffer = await response.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);

      console.log(`[PDF-DIAGNOSTICO ${ts}] Bytes descargados: ${bytes.length}`);

      if (bytes.length === 0) {
        return { valido: false, codigoError: "ARCHIVO_VACIO", motivo: "El servidor devolvió un archivo de 0 bytes (vacío)." };
      }

      const blob = new Blob([bytes], { type: contentType || "application/pdf" });
      const blobUrl = URL.createObjectURL(blob);
      return { valido: true, blobUrl, tamano: bytes.length, tipo: contentType || "application/pdf" };
    } catch (fetchErr) {
      console.error(`[PDF-DIAGNOSTICO ${ts}] FAIL: Error en fetch HTTP:`, fetchErr.message);
      if (fetchErr.name === "AbortError") {
        return { valido: false, codigoError: "TIMEOUT", motivo: "Tiempo de espera agotado al descargar el archivo PDF (Timeout 15s)." };
      }
      return {
        valido: false,
        codigoError: "CORS_O_RED",
        motivo: `No se pudo acceder al documento por restricciones CORS o fallo de red: ${fetchErr.message}`,
        urlOriginal: rawUrl
      };
    }
  }

  return { valido: false, codigoError: "FORMATO_DESCONOCIDO", motivo: "El formato del documento no es reconocido (no es URL, Base64 ni Blob)." };
};

export const obtenerBlobUrlParaPdf = (urlInput) => {
  if (!urlInput) return null;

  let url = typeof urlInput === "object"
    ? (urlInput.archivoUrl || urlInput.url || urlInput.base64 || urlInput.dataUrl || urlInput.fileUrl || urlInput.uri || "")
    : String(urlInput);

  url = (url || "").trim();
  if (!url) return null;

  if (url.startsWith("blob:")) return url;

  if (url.includes("%PDF-")) {
    try {
      const pdfContent = url.substring(url.indexOf("%PDF-"));
      const bytes = new Uint8Array(pdfContent.length);
      for (let i = 0; i < pdfContent.length; i++) {
        bytes[i] = pdfContent.charCodeAt(i) & 0xff;
      }
      const blob = new Blob([bytes], { type: "application/pdf" });
      return URL.createObjectURL(blob);
    } catch (e) {
      console.error("Error al procesar %PDF-:", e);
    }
  }

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

      try {
        if (b64.includes("%")) b64 = decodeURIComponent(b64);
      } catch (e) {}

      b64 = b64.replace(/ /g, "+").replace(/[^A-Za-z0-9+/=]/g, "");
      while (b64.length % 4 !== 0) b64 += "=";

      const binaryString = atob(b64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const blob = new Blob([bytes], { type: mime });
      return URL.createObjectURL(blob);
    } catch (err) {
      console.error("Error al obtener Blob URL:", err);
    }
  }

  return url;
};

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