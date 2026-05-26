function EvidenciasUploader({ solicitudId, formulario, actualizarCampo }) {
  const convertirImagenABase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        resolve({
          nombre: file.name,
          tipo: file.type,
          tamaño: file.size,
          url: reader.result,
        });
      };

      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const validarImagenes = (archivos) => {
    const actuales = formulario.evidencias || [];
    const nuevas = Array.from(archivos);

    if (actuales.length + nuevas.length > 5) {
      alert("Solo puedes subir como máximo 5 fotos de evidencia.");
      return [];
    }

    const archivoNoImagen = nuevas.find(
      (file) => !file.type.startsWith("image/")
    );

    if (archivoNoImagen) {
      alert("Solo se permiten imágenes como evidencia.");
      return [];
    }

    const imagenMuyPesada = nuevas.find((file) => file.size > 5 * 1024 * 1024);

    if (imagenMuyPesada) {
      alert("Cada imagen debe pesar como máximo 5 MB.");
      return [];
    }

    return nuevas;
  };

  const manejarEvidencias = async (archivos) => {
    const imagenesValidas = validarImagenes(archivos);

    if (imagenesValidas.length === 0) return;

    try {
      const evidenciasConvertidas = await Promise.all(
        imagenesValidas.map((file) => convertirImagenABase64(file))
      );

      const evidenciasActuales = formulario.evidencias || [];

      actualizarCampo(solicitudId, "evidencias", [
        ...evidenciasActuales,
        ...evidenciasConvertidas,
      ]);
    } catch (error) {
      console.error(error);
      alert("No se pudieron cargar las imágenes.");
    }
  };

  const manejarDropImagenes = async (e) => {
    e.preventDefault();
    await manejarEvidencias(e.dataTransfer.files);
  };

  const quitarEvidencia = (index) => {
    const actuales = formulario.evidencias || [];
    const nuevas = actuales.filter((_, i) => i !== index);
    actualizarCampo(solicitudId, "evidencias", nuevas);
  };

  return (
    <>
      <div
        className="drop-zone evidencias-drop"
        onDrop={manejarDropImagenes}
        onDragOver={(e) => e.preventDefault()}
      >
        <div className="empty-icon">🖼️</div>
        <p>Subir evidencias fotográficas</p>
        <span>Máximo 5 fotos. Puedes arrastrarlas aquí o seleccionarlas.</span>

        <label className="file-label">
          Elegir fotos
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => manejarEvidencias(e.target.files)}
            hidden
          />
        </label>
      </div>

      {formulario.evidencias?.length > 0 && (
        <div className="evidencias-preview">
          {formulario.evidencias.map((img, index) => (
            <div key={index} className="evidencia-item">
              <img src={img.url} alt={`Evidencia ${index + 1}`} />

              <small>{img.nombre}</small>

              <button
                type="button"
                className="btn-quitar"
                onClick={() => quitarEvidencia(index)}
              >
                Quitar
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export default EvidenciasUploader;