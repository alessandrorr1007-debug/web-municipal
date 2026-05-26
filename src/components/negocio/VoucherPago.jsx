function VoucherPago({
  expediente,
  form,
  estadoPago,
  MONTO_TRAMITE,
  verMisSolicitudes,
}) {
  return (
    <section className="section-card confirmacion">
      <div className="success-circle">✓</div>

      <h2>Solicitud registrada</h2>
      <p>Tu solicitud fue enviada correctamente y los PDFs quedaron guardados.</p>

      <div className="resumen-pago">
        <p>
          <strong>Número de expediente:</strong> {expediente}
        </p>

        <p>
          <strong>Tipo de trámite:</strong> {form.tipoTramite}
        </p>

        <p>
          <strong>Estado:</strong> En revisión municipal
        </p>

        <p>
          <strong>Pago:</strong> {estadoPago}
        </p>

        <p>
          <strong>Monto:</strong> S/{MONTO_TRAMITE.toFixed(2)}
        </p>
      </div>

      <button type="button" className="btn-pago" onClick={verMisSolicitudes}>
        Ver mis solicitudes
      </button>
    </section>
  );
}

export default VoucherPago;