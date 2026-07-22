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

  // 1. Si es un Blob URL directo
  if (url.startsWith("blob:")) {
    window.open(url, "_blank");
    return;
  }

  // 2. Si es una cadena Base64 pura (empieza con JVBERi... magic header PDF o hash largo)
  if (!url.startsWith("http://") && !url.startsWith("https://") && !url.startsWith("data:") && (url.startsWith("JVBERi") || url.length > 100)) {
    url = `data:application/pdf;base64,${url}`;
  }

  // 3. Si es Data URL (Base64)
  if (url.startsWith("data:")) {
    try {
      const parts = url.split(",");
      const mime = parts[0].match(/:(.*?);/)?.[1] || "application/pdf";
      const b64Data = parts[1] || "";
      const byteCharacters = atob(b64Data);
      const byteArrays = [];

      for (let offset = 0; offset < byteCharacters.length; offset += 1024) {
        const slice = byteCharacters.slice(offset, offset + 1024);
        const byteNumbers = new Array(slice.length);
        for (let i = 0; i < slice.length; i++) {
          byteNumbers[i] = slice.charCodeAt(i);
        }
        byteArrays.push(new Uint8Array(byteNumbers));
      }

      const blob = new Blob(byteArrays, { type: mime });
      const blobUrl = URL.createObjectURL(blob);
      const win = window.open(blobUrl, "_blank");
      if (!win) {
        const a = document.createElement("a");
        a.href = blobUrl;
        a.target = "_blank";
        a.click();
      }
      setTimeout(() => URL.revokeObjectURL(blobUrl), 120000);
      return;
    } catch (err) {
      console.error("Error al decodificar PDF en Base64:", err);
      window.open(url, "_blank");
      return;
    }
  }

  // 4. Si es HTTP / HTTPS
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
        // Fallback abrir directo
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
        // Fallback abrir directo
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
      // Fallback si falla fetch por CORS
    }

    window.open(url, "_blank");
    return;
  }

  alert("No se pudo cargar el documento. Intente nuevamente.");
};