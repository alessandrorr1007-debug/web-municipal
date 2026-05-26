function DetalleSolicitud({ solicitud, licenciaVencida }) {
  const mostrarDocumentos = () => {
    if (solicitud.archivosPdf?.length > 0) {
      return (
        <div className="documentos-lista">
          {solicitud.archivosPdf.map((pdf, index) => (
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
      );
    }

    if (solicitud.archivoUrl) {
      return (
        <a
          className="file-pill"
          href={solicitud.archivoUrl}
          target="_blank"
          rel="noreferrer"
        >
          Ver PDF
        </a>
      );
    }

    return <span className="file-pill">Sin PDF</span>;
  };

  const badgeClase = (estado = "") => {
    const texto = estado.toLowerCase();

    if (texto.includes("aprobada")) return "ok";
    if (texto.includes("rechazada")) return "danger";
    if (texto.includes("observada")) return "warning";
    if (texto.includes("inspección")) return "info";
    if (texto.includes("resultado")) return "warning";
    if (texto.includes("revisión")) return "neutral";
    return "neutral";
  };

  const estaVencida = licenciaVencida(solicitud);

  return (
    <>
      <td>
        <strong>{solicitud.id}</strong>
        <small>RUC: {solicitud.ruc}</small>
      </td>

      <td>
        <strong>{solicitud.nombreNegocio}</strong>
        <small>{solicitud.razonSocial}</small>
      </td>

      <td>{solicitud.tipoTramite || "Nueva licencia"}</td>

      <td>{mostrarDocumentos()}</td>

      <td>
        <span
          className={`badge ${
            solicitud.estadoPago === "Confirmado" ? "ok" : "warning"
          }`}
        >
          {solicitud.estadoPago || "Pendiente"}
        </span>
        <small>
          {solicitud.comprobantePago ||
            solicitud.metodoPago ||
            "Sin comprobante"}
        </small>
      </td>

      <td>
        {estaVencida ? (
          <span className="badge danger">Licencia vencida</span>
        ) : (
          <span className={`badge ${badgeClase(solicitud.estado)}`}>
            {solicitud.estado}
          </span>
        )}
      </td>

      <td>
        <strong>{solicitud.recomendacionInspector || "Sin recomendación"}</strong>
        <small>{solicitud.resultadoInspeccion || "Sin resultado"}</small>
      </td>

      <td>{solicitud.observacionInspector || "Sin observación"}</td>

      <td>
        {solicitud.observacionFuncionario ||
          "Sin observación del funcionario"}
      </td>

      <td>
        {solicitud.evidenciasInspector?.length > 0 ? (
          <div className="evidencias-tabla">
            {solicitud.evidenciasInspector.map((img, index) => (
              <a key={index} href={img.url} target="_blank" rel="noreferrer">
                Foto {index + 1}
              </a>
            ))}
          </div>
        ) : (
          "Sin evidencias"
        )}
      </td>

      <td>
        {solicitud.numeroLicencia ? (
          <>
            <strong>{solicitud.numeroLicencia}</strong>

            <small>Emisión: {solicitud.fechaAprobacion || "Sin fecha"}</small>

            <small>
              Vence:{" "}
              {solicitud.fechaExpiracionLicencia ||
                solicitud.fechaVencimiento ||
                "Sin vencimiento"}
            </small>

            {solicitud.licenciaRenovada && (
              <small>Renovación anual aprobada</small>
            )}

            {estaVencida && (
              <span className="badge danger">Licencia vencida</span>
            )}
          </>
        ) : (
          "No generada"
        )}
      </td>
    </>
  );
}

export default DetalleSolicitud;