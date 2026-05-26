export const convertirPdfABase64 = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      resolve({
        archivoUrl: reader.result,
        archivoNombre: file.name,
      });
    };

    reader.onerror = () => {
      reject(new Error("No se pudo leer el PDF."));
    };

    reader.readAsDataURL(file);
  });
};