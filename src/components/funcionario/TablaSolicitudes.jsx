import DetalleSolicitud from "./DetalleSolicitud";
import DecisionFuncionario from "./DecisionFuncionario";

function TablaSolicitudes({
  solicitudes,
  cargarSolicitudes,
  observacionesRechazo,
  cambiarObservacionRechazo,
  derivarInspector,
  aprobarLicencia,
  rechazarLicencia,
  puedeAprobar,
  solicitudCerrada,
  licenciaVencida,
}) {
  if (solicitudes.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">📂</div>
        <h3>No existen solicitudes registradas</h3>
        <p>Cuando un negocio envíe una solicitud, aparecerá en esta sección.</p>
        <button type="button" onClick={cargarSolicitudes}>
          Actualizar solicitudes
        </button>
      </div>
    );
  }

  return (
    <div className="tabla-container">
      <table className="modern-table funcionario-table">
        <thead>
          <tr>
            <th>Expediente</th>
            <th>Negocio</th>
            <th>Trámite</th>
            <th>Documentos</th>
            <th>Pago</th>
            <th>Estado</th>
            <th>Inspección</th>
            <th>Obs. inspector</th>
            <th>Obs. funcionario</th>
            <th>Evidencias</th>
            <th>Licencia</th>
            <th>Acciones</th>
          </tr>
        </thead>

        <tbody>
          {solicitudes.map((solicitud) => (
            <tr key={solicitud.id}>
              <DetalleSolicitud
                solicitud={solicitud}
                licenciaVencida={licenciaVencida}
              />

              <DecisionFuncionario
                solicitud={solicitud}
                observacionesRechazo={observacionesRechazo}
                cambiarObservacionRechazo={cambiarObservacionRechazo}
                derivarInspector={derivarInspector}
                aprobarLicencia={aprobarLicencia}
                rechazarLicencia={rechazarLicencia}
                puedeAprobar={puedeAprobar}
                solicitudCerrada={solicitudCerrada}
              />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default TablaSolicitudes;