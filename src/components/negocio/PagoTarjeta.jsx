import { CardPayment } from "@mercadopago/sdk-react";

function PagoTarjeta({
  MP_PUBLIC_KEY,
  MONTO_TRAMITE,
  form,
  archivos,
  estadoPago,
  detallePago,
  guardando,
  procesarPagoIntegrado,
  marcarPagoDemo,
  enviarSolicitud,
  volverSolicitud,
}) {
  return (
    <section className="section-card">
      <div className="section-header">
        <div>
          <h2>Pago del trámite</h2>
          <p>Realiza el pago oficial o usa el modo demo para probar el flujo.</p>
        </div>
      </div>

      <div className="resumen-pago">
        <h3>Resumen del trámite</h3>
        <p><strong>Tipo de trámite:</strong> {form.tipoTramite}</p>
        <p><strong>RUC:</strong> {form.ruc}</p>
        <p><strong>Razón social:</strong> {form.razonSocial}</p>
        <p><strong>Documentos PDF:</strong> {archivos.length}</p>
        <p><strong>Concepto:</strong> Licencia municipal de funcionamiento</p>
        <p><strong>Monto:</strong> S/{Number(MONTO_TRAMITE).toFixed(2)}</p>
        <p><strong>Estado del pago:</strong> {estadoPago}</p>
      </div>

      {!MP_PUBLIC_KEY ? (
        <div className="voucher-box">
          <h3>Falta configurar Mercado Pago</h3>
          <p>Agrega VITE_MP_PUBLIC_KEY en el archivo .env del frontend.</p>
        </div>
      ) : estadoPago !== "Confirmado" ? (
        <div className="detalle-pago">
          <h3>Pago con tarjeta dentro de la web</h3>
          <p>Completa los datos de pago sin salir del sistema municipal.</p>

          <div className="voucher-box">
            <h3>Datos correctos para probar</h3>
            <p><strong>Tarjeta Mastercard:</strong> 5031 7557 3453 0604</p>
            <p><strong>Fecha:</strong> 11/30</p>
            <p><strong>CVV:</strong> 123</p>
            <p><strong>Nombre:</strong> APRO</p>
            <p><strong>DNI:</strong> 12345678</p>
            <p>
              En el campo E-mail puedes colocar el usuario comprador TEST que
              creaste en Mercado Pago.
            </p>
          </div>

          <CardPayment
            initialization={{
              amount: Number(MONTO_TRAMITE),
            }}
            customization={{
              paymentMethods: {
                minInstallments: 1,
                maxInstallments: 1,
              },
            }}
            onSubmit={procesarPagoIntegrado}
            onReady={() => {
              console.log("Formulario de Mercado Pago listo");
            }}
            onError={(error) => {
              console.error("ERROR MERCADO PAGO:", error);
              alert(
                `Error Mercado Pago: ${
                  error?.message || error?.cause || JSON.stringify(error)
                }`
              );
            }}
          />

          <div className="voucher-box">
            <h3>Modo demo</h3>
            <p>También puedes confirmar el pago para probar el flujo.</p>

            <button type="button" className="btn-pago" onClick={marcarPagoDemo}>
              Confirmar pago demo
            </button>
          </div>
        </div>
      ) : (
        <div className="voucher-box">
          <h3>Pago confirmado</h3>
          <p>El comprobante del pago queda registrado automáticamente.</p>

          {detallePago?.id && (
            <p>
              <strong>ID de pago:</strong> {detallePago.id}
            </p>
          )}

          {detallePago?.metodo === "demo" && (
            <p>
              <strong>Modo:</strong> Pago demo
            </p>
          )}
        </div>
      )}

      <div className="payment-actions">
        <button
          type="button"
          className="btn-secundario"
          onClick={marcarPagoDemo}
          disabled={estadoPago === "Confirmado"}
        >
          Marcar pago como realizado demo
        </button>
      </div>

      <div className="acciones-pago">
        <button type="button" onClick={volverSolicitud}>
          Volver
        </button>

        <button
          type="button"
          className="btn-pago"
          onClick={enviarSolicitud}
          disabled={guardando || estadoPago !== "Confirmado"}
        >
          {guardando ? "Guardando solicitud..." : "Enviar solicitud"}
        </button>
      </div>
    </section>
  );
}

export default PagoTarjeta;