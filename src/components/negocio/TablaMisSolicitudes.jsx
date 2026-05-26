import {
  badgeClase,
  descargarLicencia,
  formatearFecha,
  licenciaVencida,
  obtenerEstadoVisible,
  obtenerFechaExpiracion,
} from "./LicenciaDownload";

function TablaMisSolicitudes({
  misSolicitudes,
  cargarMisSolicitudes,
  nuevaSolicitud,
  renovarLicencia,
}) {
  return (
    <section className="section-card">
      <div className="section-header">
        <div>
          <h2>Mis solicitudes</h2>
          <p>Consulta el estado de tus expedientes enviados.</p>
        </div>

        <button
          type="button"
          className="btn-outline"
          onClick={cargarMisSolicitudes}
        >
          Actualizar
        </button>
      </div>

      {misSolicitudes.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📄</div>
          <h3>Aún no has enviado solicitudes</h3>
          <p>Cuando registres una solicitud de licencia, aparecerá aquí.</p>

          <button type="button" className="btn-pago" onClick={nuevaSolicitud}>
            Crear primera solicitud
          </button>
        </div>
      ) : (
        <div className="tabla-container">
          <table className="modern-table">
            <thead>
              <tr>
                <th>Expediente</th>
                <th>Fecha</th>
                <th>Trámite</th>
                <th>Negocio</th>
                <th>Documentos</th>
                <th>Pago</th>
                <th>Estado</th>
                <th>Inspección</th>
                <th>Resultado</th>
                <th>Motivo</th>
                <th>Vigencia</th>
                <th>Licencia</th>
              </tr>
            </thead>

            <tbody>
              {misSolicitudes.map((s) => (
                <tr key={s.id}>
                  <td>
                    <strong>{s.id}</strong>
                    <small>RUC: {s.ruc}</small>
                  </td>

                  <td>{s.fecha}</td>
                  <td>{s.tipoTramite || "Nueva licencia"}</td>
                  <td>{s.nombreNegocio}</td>

                  <td>
                    {s.archivosPdf?.length > 0 ? (
                      <div className="documentos-lista">
                        {s.archivosPdf.map((pdf, index) => (
                          <a
                            key={index}
                            href={pdf.archivoUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            PDF {index + 1}
                          </a>
                        ))}
                      </div>
                    ) : s.archivoUrl ? (
                      <a href={s.archivoUrl} target="_blank" rel="noreferrer">
                        Ver PDF
                      </a>
                    ) : (
                      "Sin PDF"
                    )}
                  </td>

                  <td>
                    <span
                      className={`badge ${
                        s.estadoPago === "Confirmado" ? "ok" : "warning"
                      }`}
                    >
                      {s.estadoPago}
                    </span>
                  </td>

                  <td>
                    <span className={`badge ${badgeClase(obtenerEstadoVisible(s))}`}>
                      {obtenerEstadoVisible(s)}
                    </span>
                  </td>

                  <td>
                    <strong>{s.inspeccion || "Sin inspección"}</strong>
                    <small>
                      {s.recomendacionInspector
                        ? `Recomendación: ${s.recomendacionInspector}`
                        : "Sin recomendación"}
                    </small>
                  </td>

                  <td>
                    {s.estado === "Licencia aprobada" && !licenciaVencida(s) && (
                      <span className="badge ok">Licencia aprobada</span>
                    )}

                    {licenciaVencida(s) && (
                      <span className="badge danger">Licencia vencida</span>
                    )}

                    {s.estado === "Licencia rechazada" && (
                      <span className="badge danger">Licencia rechazada</span>
                    )}

                    {s.estado !== "Licencia aprobada" &&
                      s.estado !== "Licencia rechazada" && (
                        <span>{s.resultadoInspeccion || "Sin resultado final"}</span>
                      )}
                  </td>

                  <td>
                    {s.estado === "Licencia rechazada" ? (
                      <div className="motivo-rechazo">
                        <strong>Motivo:</strong>
                        <p>
                          {s.observacionFuncionario ||
                            "No se registró motivo del rechazo."}
                        </p>
                      </div>
                    ) : (
                      "Sin motivo"
                    )}
                  </td>

                  <td>
                    {s.estado === "Licencia aprobada" ? (
                      <div className="motivo-rechazo">
                        <strong>Vence:</strong>
                        <p>{formatearFecha(obtenerFechaExpiracion(s))}</p>
                      </div>
                    ) : (
                      "No aplica"
                    )}
                  </td>

                  <td>
                    {s.estado === "Licencia aprobada" ? (
                      <div className="documentos-lista">
                        {!licenciaVencida(s) && (
                          <button
                            type="button"
                            className="btn-ok"
                            onClick={() => descargarLicencia(s)}
                          >
                            Descargar licencia
                          </button>
                        )}

                        <button
                          type="button"
                          className="btn-secundario"
                          onClick={() => renovarLicencia(s)}
                        >
                          Renovar
                        </button>
                      </div>
                    ) : (
                      "No disponible"
                    )}
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

export default TablaMisSolicitudes;