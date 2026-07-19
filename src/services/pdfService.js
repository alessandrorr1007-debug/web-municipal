const CLOUDINARY_CLOUD_NAME = "drnrrgose";
const CLOUDINARY_UPLOAD_PRESET = "municipal.pdf";

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

export const abrirPdf = async (url) => {
  if (!url) {
    alert("El documento no está disponible.");
    return;
  }

  // Validar URL básica
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    alert("El documento no está disponible o la URL es inválida.");
    return;
  }

  try {
    const response = await fetch(url, { method: "HEAD" });
    if (response.ok) {
      window.open(url, "_blank");
    } else {
      alert("El documento no está disponible.");
    }
  } catch (error) {
    console.error("Error al validar el archivo PDF:", error);
    // Si falla por CORS o red, fallback a apertura directa
    window.open(url, "_blank");
  }
};