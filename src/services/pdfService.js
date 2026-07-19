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

export const abrirPdf = (url) => {
  if (!url || (!url.startsWith("http://") && !url.startsWith("https://"))) {
    alert("El documento no está disponible.");
    return;
  }
  window.open(url, "_blank");
};