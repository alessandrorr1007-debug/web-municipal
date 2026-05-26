const CLOUDINARY_CLOUD_NAME = "drnrrgose";
const CLOUDINARY_UPLOAD_PRESET = "municipal.pdf";

export const subirArchivoACloudinary = async (file) => {
  const formData = new FormData();

  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
  formData.append("resource_type", "auto");

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`,
    {
      method: "POST",
      body: formData,
    }
  );

  if (!response.ok) {
    throw new Error("No se pudo subir el archivo a Cloudinary.");
  }

  const data = await response.json();

  return {
    archivoUrl: data.secure_url,
    archivoNombre: file.name,
    publicId: data.public_id,
    tipo: file.type,
    tamaño: file.size,
  };
};

export const convertirPdfABase64 = subirArchivoACloudinary;