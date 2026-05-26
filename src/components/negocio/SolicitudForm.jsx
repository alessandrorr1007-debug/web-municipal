function SolicitudForm({
  form,
  archivos,
  buscando,
  errorRuc,
  rucValidado,
  manejarCambio,
  buscarRuc,
  manejarArchivos,
  manejarDrop,
  quitarArchivo,
  continuarPago,
}) {
  return (
    <section className="section-card">
      <div className="section-header">
        <div>
          <h2>Nueva solicitud</h2>
          <p>Completa los datos del negocio y adjunta hasta 5 documentos PDF.</p>
        </div>
      </div>

      <div className="formulario">
        <div className="form-grid">
          <select
            name="tipoTramite"
            value={form.tipoTramite}
            onChange={manejarCambio}
          >
            <option value="Nueva licencia">Nueva licencia</option>
            <option value="Renovación anual">Renovación anual</option>
          </select>
        </div>

        <div className="ruc-row">
          <input
            type="text"
            name="ruc"
            placeholder="Ingrese RUC"
            value={form.ruc}
            onChange={manejarCambio}
            maxLength="11"
          />

          <button type="button" onClick={buscarRuc} disabled={buscando}>
            {buscando ? "Buscando..." : "Buscar RUC"}
          </button>
        </div>

        {errorRuc && <p className="error">{errorRuc}</p>}
        {rucValidado && <p className="success">RUC validado correctamente.</p>}

        <div className="form-grid">
          <input
            type="text"
            name="nombreNegocio"
            placeholder="Nombre del negocio"
            value={form.nombreNegocio}
            onChange={manejarCambio}
          />

          <input
            type="text"
            name="razonSocial"
            placeholder="Razón social"
            value={form.razonSocial}
            onChange={manejarCambio}
          />

          <input
            type="text"
            name="direccion"
            placeholder="Dirección del local"
            value={form.direccion}
            onChange={manejarCambio}
          />

          <input
            type="text"
            name="giro"
            placeholder="Giro comercial"
            value={form.giro}
            onChange={manejarCambio}
          />
        </div>

        <div className="sunat-info">
          <span>
            Estado SUNAT: <strong>{form.estadoSunat || "Pendiente"}</strong>
          </span>

          <span>
            Condición: <strong>{form.condicionSunat || "Pendiente"}</strong>
          </span>
        </div>

        <div
          className="drop-zone"
          onDrop={manejarDrop}
          onDragOver={(e) => e.preventDefault()}
        >
          <div className="empty-icon">📎</div>
          <p>Subir documentos del trámite en PDF</p>
          <span>Máximo 5 PDFs. Arrastra tus archivos o selecciónalos.</span>

          <label className="file-label">
            Elegir PDFs
            <input
              type="file"
              accept=".pdf"
              multiple
              onChange={manejarArchivos}
              hidden
            />
          </label>

          {archivos.length > 0 && (
            <div className="archivo-box">
              {archivos.map((file, index) => (
                <div key={index} className="archivo-item">
                  <p className="archivo-seleccionado">
                    PDF {index + 1}: {file.name}
                  </p>

                  <button
                    type="button"
                    className="btn-quitar"
                    onClick={() => quitarArchivo(index)}
                  >
                    Quitar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          className="btn-pago btn-full"
          onClick={continuarPago}
        >
          Continuar al pago
        </button>
      </div>
    </section>
  );
}

export default SolicitudForm;