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

export const generarPlantillaLicenciaOficial = (s, esVencido = false) => {
  if (!s) return "";

  const expLimpio = String(s.id || "").replace(/^EXP-/, "");
  const numLicenciaStr = s.numLicencia || s.numeroLicencia || `00${expLimpio.padStart(4, "0")} - 2026 MPT-GDEL-SGLC`;

  const titular = (s.titular || s.nombreCiudadano || s.razonSocial || s.nombreNegocio || "CIUDADANO SOLICITANTE").toUpperCase();
  const ruc = (s.ruc || "10000000000").toUpperCase();
  const repLegal = (s.representanteLegal || s.representante || titular).toUpperCase();
  const dni = (s.dni || s.dniUsuario || "00000000").toUpperCase();
  const nombreComercial = (s.nombreNegocio || s.razonSocial || "ESTABLECIMIENTO COMERCIAL").toUpperCase();
  const direccion = (s.direccion || "AV. ESPAÑA N° 123").toUpperCase();
  const distrito = (s.distrito || "TRUJILLO").toUpperCase();
  const direccionCompleta = `${direccion} - ${distrito}`;
  const codigoCatastral = s.codigoCatastral || "13010100458";
  const giro = (s.giro || s.giroComercial || "COMERCIO Y SERVICIOS").toUpperCase();
  const zonificacion = (s.zonificacion || "CZ - COMERCIO ZONAL").toUpperCase();
  const area = s.area || s.areaM2 || "85.00";
  const expNum = `EXP-${expLimpio}`;
  const correlativoRojo = expLimpio.padStart(6, "0");

  const hoy = new Date();
  const dia = hoy.getDate();
  const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const mesStr = meses[hoy.getMonth()];
  const anio = hoy.getFullYear();

  const fechaFormateada = `Trujillo, ${dia} de ${mesStr} del ${anio}`;

  const marcaAguaHtml = esVencido
    ? `
      <div style="position: absolute; top: 38%; left: 5%; width: 90%; text-align: center; transform: rotate(-35deg); opacity: 0.28; font-size: 110px; font-weight: 900; color: #dc2626; border: 12px solid #dc2626; padding: 20px 0; border-radius: 20px; letter-spacing: 12px; pointer-events: none; z-index: 999; font-family: sans-serif;">
        VENCIDO
      </div>
    `
    : "";

  return `
    <div style="width: 210mm; min-height: 297mm; padding: 20px 24px; box-sizing: border-box; font-family: 'Times New Roman', Times, serif; background: #ffffff; position: relative; color: #000000; margin: 0 auto; border: 3px solid #1B365D; background-image: radial-gradient(#e0f2fe 1px, transparent 1px); background-size: 16px 16px;">
      ${marcaAguaHtml}

      <!-- ENCABEZADO -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 12px;">
        <tr>
          <td style="width: 20%; vertical-align: middle; text-align: left;">
            <div style="width: 70px; height: 80px; border: 2px solid #1B365D; border-radius: 8px; background: #f0f9ff; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 4px;">
              <span style="font-size: 26px;">🏛️</span>
              <span style="font-size: 8px; font-weight: bold; color: #1B365D; text-transform: uppercase; font-family: sans-serif; margin-top: 2px;">MPT</span>
            </div>
          </td>
          <td style="width: 80%; vertical-align: middle; text-align: center; padding-right: 70px;">
            <h2 style="margin: 0; color: #1B365D; font-family: 'Times New Roman', Times, serif; font-size: 20px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">
              MUNICIPALIDAD PROVINCIAL DE TRUJILLO
            </h2>
            <span style="font-size: 11px; font-family: sans-serif; font-weight: bold; color: #1B365D; text-transform: uppercase; letter-spacing: 0.5px;">
              Gerencia de Desarrollo Económico Local — Subgerencia de Licencias y Comercialización
            </span>
          </td>
        </tr>
      </table>

      <!-- TÍTULO CENTRAL -->
      <div style="text-align: center; margin-bottom: 14px;">
        <h1 style="margin: 0; font-family: 'Times New Roman', Times, serif; font-size: 22px; font-weight: bold; color: #000000; text-transform: uppercase; letter-spacing: 1px;">
          LICENCIA DE FUNCIONAMIENTO
        </h1>
        <div style="font-family: 'Times New Roman', Times, serif; font-size: 15px; font-weight: bold; color: #1B365D; margin-top: 4px;">
          Nro. ${numLicenciaStr}
        </div>
        <div style="font-family: 'Times New Roman', Times, serif; font-size: 12px; font-weight: bold; color: #334155; margin-top: 2px;">
          Ley Nro. 28976
        </div>
        <p style="margin: 10px 0 0; text-align: justify; font-size: 9pt; line-height: 1.4; color: #1e293b;">
          En uso de las Facultades conferidas mediante Ley N° 28976 — Ley Marco de Licencias de Funcionamiento y la Ordenanza Municipal vigente, la Municipalidad Provincial de Trujillo CONCEDE A:
        </p>
      </div>

      <!-- CUERPO DE DATOS (FORMULARIO BI-COLUMNA TABULADO) -->
      <div style="border: 1.5px solid #1B365D; border-radius: 6px; padding: 12px 16px; margin-bottom: 14px; background: rgba(255, 255, 255, 0.95);">
        <table style="width: 100%; border-collapse: collapse; font-size: 12px; line-height: 1.7;">
          <tbody>
            <tr>
              <td style="width: 32%; font-weight: normal; color: #1e293b; padding: 2px 0;">Titular :</td>
              <td style="width: 68%; font-weight: bold; text-transform: uppercase; color: #000000; padding: 2px 0;">${titular}</td>
            </tr>
            <tr>
              <td style="font-weight: normal; color: #1e293b; padding: 2px 0;">Doc. de Identidad :</td>
              <td style="font-weight: bold; text-transform: uppercase; color: #000000; padding: 2px 0;">RUC: ${ruc}</td>
            </tr>
            <tr>
              <td style="font-weight: normal; color: #1e293b; padding: 2px 0;">Representante Legal :</td>
              <td style="font-weight: bold; text-transform: uppercase; color: #000000; padding: 2px 0;">${repLegal}</td>
            </tr>
            <tr>
              <td style="font-weight: normal; color: #1e293b; padding: 2px 0;">Doc. de Identidad :</td>
              <td style="font-weight: bold; text-transform: uppercase; color: #000000; padding: 2px 0;">DNI: ${dni}</td>
            </tr>
            <tr>
              <td style="font-weight: normal; color: #1e293b; padding: 2px 0;">Nombre Comercial :</td>
              <td style="font-weight: bold; text-transform: uppercase; color: #1B365D; padding: 2px 0;">${nombreComercial}</td>
            </tr>
            <tr>
              <td style="font-weight: normal; color: #1e293b; padding: 2px 0;">Dirección :</td>
              <td style="font-weight: bold; text-transform: uppercase; color: #000000; padding: 2px 0;">${direccionCompleta}</td>
            </tr>
            <tr>
              <td style="font-weight: normal; color: #1e293b; padding: 2px 0;">Código Catastral :</td>
              <td style="font-weight: bold; text-transform: uppercase; color: #000000; padding: 2px 0;">"${codigoCatastral}"</td>
            </tr>
            <tr>
              <td style="font-weight: normal; color: #1e293b; padding: 2px 0;">Giro :</td>
              <td style="font-weight: bold; text-transform: uppercase; color: #000000; padding: 2px 0;">"${giro}"</td>
            </tr>
            <tr>
              <td style="font-weight: normal; color: #1e293b; padding: 2px 0;">Zonificación :</td>
              <td style="font-weight: bold; text-transform: uppercase; color: #000000; padding: 2px 0;">"${zonificacion}"</td>
            </tr>
            <tr>
              <td style="font-weight: normal; color: #1e293b; padding: 2px 0;">Área :</td>
              <td style="font-weight: bold; text-transform: uppercase; color: #000000; padding: 2px 0;">${area} m2</td>
            </tr>
            <tr>
              <td style="font-weight: normal; color: #1e293b; padding: 2px 0;">Visto el Expediente :</td>
              <td style="font-weight: bold; text-transform: uppercase; color: #000000; padding: 2px 0;">${expNum}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- FECHA -->
      <div style="text-align: right; font-family: 'Times New Roman', Times, serif; font-size: 13px; font-weight: bold; color: #000000; margin-bottom: 16px;">
        ${fechaFormateada}
      </div>

      <!-- SECCIÓN INFERIOR DE REGLAS / PROHIBICIONES -->
      <div style="border: 1px solid #cbd5e1; background: rgba(248, 250, 252, 0.9); padding: 10px 14px; border-radius: 6px; margin-bottom: 24px;">
        <h4 style="margin: 0 0 6px; font-family: 'Times New Roman', Times, serif; font-size: 11px; font-weight: bold; color: #000000; text-transform: uppercase;">
          PROHIBICIONES AL ESTABLECIMIENTO
        </h4>
        <div style="font-family: sans-serif; font-size: 9.5pt; color: #1e293b; line-height: 1.5; text-align: left;">
          <div>Prohibida la contaminación sonora</div>
          <div>Prohibido el uso de la Vía Pública y Área de Retiro</div>
          <div>Prohibido consumir bebidas alcohólicas dentro y fuera del local</div>
          <div>Prohibida la contaminación ambiental</div>
        </div>
        <div style="text-align: center; margin-top: 8px; font-family: sans-serif; font-size: 9pt; font-weight: bold; color: #000000; text-transform: uppercase; background: #e2e8f0; padding: 4px; border-radius: 4px;">
          ES OBLIGATORIO QUE SE EXHIBA EN UN LUGAR VISIBLE DEL ESTABLECIMIENTO.
        </div>
      </div>

      <!-- PIE DE PÁGINA Y SEGURIDAD -->
      <div style="margin-top: 30px;">
        <!-- ÁREA DE FIRMA Y SELLO SEGUNDO PLANO -->
        <div style="text-align: center; margin-bottom: 16px;">
          <div style="width: 200px; border-top: 1.5px solid #000000; margin: 0 auto; padding-top: 4px;">
            <strong style="font-family: 'Times New Roman', Times, serif; font-size: 12px; display: block; color: #000000;">SUB GERENTE</strong>
            <span style="font-size: 9.5px; font-family: sans-serif; color: #475569; display: block;">Subgerencia de Licencias y Comercialización</span>
            <span style="font-size: 9px; font-family: sans-serif; color: #64748b; display: block;">Municipalidad Provincial de Trujillo</span>
          </div>
        </div>

        <!-- CORRELATIVO ROJO -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <div style="font-family: sans-serif; font-size: 14px; font-weight: bold; color: #D32F2F;">
            Nº ${correlativoRojo}
          </div>
        </div>

        <!-- BARRA INFERIOR COMPLETA -->
        <table style="width: 100%; border-collapse: collapse; background: #1B365D; border-radius: 4px; overflow: hidden; font-family: sans-serif;">
          <tr>
            <td style="width: 50%; padding: 8px 12px; text-align: center; color: #ffffff; font-size: 11px; font-weight: bold; border-right: 1px solid #ffffff;">
              MPT | Gerencia de Desarrollo Económico
            </td>
            <td style="width: 50%; padding: 8px 12px; text-align: center; color: #ffffff; font-size: 11px; font-weight: bold;">
              Subgerencia de Licencias y Comercialización
            </td>
          </tr>
        </table>
      </div>
    </div>
  `;
};