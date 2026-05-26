import EvidenciasUploader from "./EvidenciasUploader";

function SolicitudInspeccionCard({
  solicitud,
  formulario,
  actualizarCampo,
  enviarResultadoInspector,
  mostrarDocumentos,
}) {
  return (
    <article className="inspection-card">
      <div className="inspection-card-header">
        <div>
          <span className="badge info">{solicitud.id}</span>
          <h3>{solicitud.nombreNegocio}</h3>
          <p>{solicitud.razonSocial}</p>
        </div>

        <span className="badge warning">Pendiente</span>
      </div>

      <div className="inspection-details">
        <p>
          <strong>RUC:</strong> {solicitud.ruc}
        </p>

        <p>
          <strong>Dirección:</strong> {solicitud.direccion}
        </p>

        <p>
          <strong>Giro:</strong> {solicitud.giro}
        </p>

        <p>
          <strong>Tipo de trámite:</strong>{" "}
          {solicitud.tipoTramite || "Nueva licencia"}
        </p>

        <div>
          <strong>Documentos del negocio:</strong>
          {mostrarDocumentos(solicitud)}
        </div>
      </div>

      <div className="inspection-form">
        <label>
          Observación del inspector *
          <textarea
            value={formulario.observacion || ""}
            onChange={(e) =>
              actualizarCampo(solicitud.id, "observacion", e.target.value)
            }
            placeholder="Escribe la observación de la inspección..."
            rows="4"
          />
        </label>

        <EvidenciasUploader
          solicitudId={solicitud.id}
          formulario={formulario}
          actualizarCampo={actualizarCampo}
        />

        <label>
          Recomendación del inspector *
          <select
            value={formulario.recomendacion || ""}
            onChange={(e) =>
              actualizarCampo(solicitud.id, "recomendacion", e.target.value)
            }
          >
            <option value="">Seleccionar recomendación</option>
            <option value="Aprobar">Aprobar</option>
            <option value="Rechazar">Rechazar</option>
          </select>
        </label>
      </div>

      <div className="inspection-actions">
        <button
          type="button"
          className="btn-ok"
          onClick={() => enviarResultadoInspector(solicitud)}
        >
          Enviar resultado al funcionario
        </button>
      </div>
    </article>
  );
}

export default SolicitudInspeccionCard;