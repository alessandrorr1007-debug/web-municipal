function HistorialInspecciones({ historial, mostrarDocumentos, badgeClase }) {
  return (
    <section className="section-card">
      <div className="section-header">
        <div>
          <h2>Historial de inspecciones</h2>
          <p>Resultados registrados por el inspector municipal.</p>
        </div>
      </div>

      {historial.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📋</div>
          <h3>Aún no hay inspecciones realizadas</h3>
          <p>Cuando envíes una recomendación, aparecerá aquí.</p>
        </div>
      ) : (
        <div className="tabla-container">
          <table className="modern-table">
            <thead>
              <tr>
                <th>Expediente</th>
                <th>Negocio</th>
                <th>Trámite</th>
                <th>Documentos</th>
                <th>Recomendación</th>
                <th>Observación</th>
                <th>Evidencias</th>
                <th>Fecha</th>
                <th>Estado</th>
              </tr>
            </thead>

            <tbody>
              {historial.map((solicitud) => (
                <tr key={solicitud.id}>
                  <td>
                    <strong>{solicitud.id}</strong>
                    <small>RUC: {solicitud.ruc}</small>
                  </td>

                  <td>
                    <strong>{solicitud.nombreNegocio}</strong>
                    <small>{solicitud.direccion}</small>
                  </td>

                  <td>{solicitud.tipoTramite || "Nueva licencia"}</td>

                  <td>{mostrarDocumentos(solicitud)}</td>

                  <td>
                    <span
                      className={`badge ${badgeClase(
                        solicitud.recomendacionInspector
                      )}`}
                    >
                      {solicitud.recomendacionInspector || "Sin recomendación"}
                    </span>
                  </td>

                  <td>{solicitud.observacionInspector || "Sin observación"}</td>

                  <td>
                    {solicitud.evidenciasInspector?.length > 0 ? (
                      <div className="evidencias-tabla">
                        {solicitud.evidenciasInspector.map((img, index) => (
                          <a
                            key={index}
                            href={img.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Foto {index + 1}
                          </a>
                        ))}
                      </div>
                    ) : (
                      "Sin evidencias"
                    )}
                  </td>

                  <td>{solicitud.fechaInspeccion || "Sin fecha"}</td>

                  <td>
                    <span
                      className={`badge ${badgeClase(
                        solicitud.recomendacionInspector || solicitud.inspeccion
                      )}`}
                    >
                      {solicitud.inspeccion || "Enviado"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default HistorialInspecciones;