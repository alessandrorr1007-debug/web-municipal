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

export const abrirPdf = async (url) => {
  if (!url || (!url.startsWith("http://") && !url.startsWith("https://"))) {
    alert("El documento no está disponible actualmente.");
    return;
  }

  const esFirebaseStorage = url.includes("firebasestorage.googleapis.com");
  const esCloudinary = url.includes("cloudinary.com");

  if (esFirebaseStorage) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        window.open(blobUrl, "_blank");
        setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
        return;
      }
    } catch (e) {
      // fall through
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
          setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
          return;
        }
        if (res.status === 404) {
          alert("El documento no fue encontrado.");
          return;
        }
        if (res.status === 401) {
          alert("No tiene autorización para visualizar este documento.");
          return;
        }
      }
    } catch (e) {
      // fall through
    }
  }

  try {
    const res = await fetch(url);
    if (res.ok) {
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, "_blank");
      setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
      return;
    }
    if (res.status === 404) {
      alert("El documento no fue encontrado.");
      return;
    }
  } catch (e) {
    // fall through
  }

  alert("No se pudo cargar el documento. Intente nuevamente.");
};