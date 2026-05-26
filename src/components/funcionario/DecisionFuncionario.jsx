function DecisionFuncionario({
  solicitud,
  observacionesRechazo,
  cambiarObservacionRechazo,
  derivarInspector,
  aprobarLicencia,
  rechazarLicencia,
  puedeAprobar,
  solicitudCerrada,
}) {
  return (
    <td>
      <div className="action-stack">
        <button
          type="button"
          onClick={() => derivarInspector(solicitud.id)}
          disabled={
            solicitud.estado === "En inspección" ||
            solicitud.estado === "Resultado enviado al funcionario" ||
            solicitudCerrada(solicitud)
          }
        >
          Enviar a inspector
        </button>

        <button
          type="button"
          className="btn-ok"
          onClick={() => aprobarLicencia(solicitud)}
          disabled={!puedeAprobar(solicitud)}
        >
          Aprobar licencia
        </button>

        {!solicitudCerrada(solicitud) && (
          <textarea
            placeholder="Motivo del rechazo..."
            value={observacionesRechazo[solicitud.id] || ""}
            onChange={(e) =>
              cambiarObservacionRechazo(solicitud.id, e.target.value)
            }
            rows="3"
          />
        )}

        <button
          type="button"
          className="btn-danger"
          onClick={() => rechazarLicencia(solicitud.id)}
          disabled={solicitudCerrada(solicitud)}
        >
          Rechazar licencia
        </button>
      </div>
    </td>
  );
}

export default DecisionFuncionario;