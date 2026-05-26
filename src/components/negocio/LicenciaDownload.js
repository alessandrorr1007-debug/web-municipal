export const formatearFecha = (fecha) => {
  if (!fecha) return "Fecha no registrada";

  if (typeof fecha === "string" && fecha.includes("/")) {
    return fecha;
  }

  const fechaDate = new Date(fecha);

  if (Number.isNaN(fechaDate.getTime())) {
    return fecha;
  }

  return fechaDate.toLocaleDateString();
};

export const obtenerFechaAprobacion = (solicitud) => {
  return (
    solicitud.fechaAprobacion ||
    solicitud.fechaDecisionFuncionario ||
    solicitud.fecha ||
    new Date().toISOString()
  );
};

export const obtenerFechaExpiracion = (solicitud) => {
  if (solicitud.fechaExpiracionLicencia) {
    return solicitud.fechaExpiracionLicencia;
  }

  const fechaBase = new Date(obtenerFechaAprobacion(solicitud));

  if (Number.isNaN(fechaBase.getTime())) {
    const hoy = new Date();
    hoy.setFullYear(hoy.getFullYear() + 1);
    return hoy.toISOString();
  }

  fechaBase.setFullYear(fechaBase.getFullYear() + 1);
  return fechaBase.toISOString();
};

export const licenciaVencida = (solicitud) => {
  if (solicitud.estado !== "Licencia aprobada") return false;

  const fechaExpiracion = new Date(obtenerFechaExpiracion(solicitud));

  if (Number.isNaN(fechaExpiracion.getTime())) return false;

  return fechaExpiracion < new Date();
};

export const obtenerEstadoVisible = (solicitud) => {
  if (licenciaVencida(solicitud)) return "Licencia vencida";
  return solicitud.estado;
};

export const badgeClase = (estado = "") => {
  const texto = estado.toLowerCase();

  if (texto.includes("vencida")) return "danger";
  if (texto.includes("aprobada")) return "ok";
  if (texto.includes("rechazada")) return "danger";
  if (texto.includes("inspección")) return "info";
  if (texto.includes("revisión")) return "warning";
  if (texto.includes("resultado")) return "warning";

  return "neutral";
};

export const descargarLicencia = (solicitud) => {
  const fechaAprobacion = obtenerFechaAprobacion(solicitud);
  const fechaExpiracion = obtenerFechaExpiracion(solicitud);

  const textoQr = encodeURIComponent(
    `LICENCIA MUNICIPAL | Expediente: ${solicitud.id} | RUC: ${
      solicitud.ruc
    } | Estado: ${obtenerEstadoVisible(solicitud)} | Vence: ${formatearFecha(
      fechaExpiracion
    )}`
  );

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=130x130&data=${textoQr}`;

  const contenido = `
    <html>
      <head>
        <meta charset="UTF-8" />
        <title>Licencia Municipal</title>

        <style>
          body {
            font-family: Arial, sans-serif;
            padding: 40px;
            background: #f3f4f6;
            color: #111827;
          }

          .licencia {
            max-width: 900px;
            margin: auto;
            background: white;
            border: 5px solid #111827;
            border-radius: 18px;
            padding: 40px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.15);
          }

          .header {
            text-align: center;
            margin-bottom: 30px;
          }

          .header h1 {
            margin: 0;
            font-size: 34px;
            color: #111827;
          }

          .header h2 {
            margin-top: 10px;
            font-size: 22px;
            color: #2563eb;
          }

          .datos {
            margin-top: 30px;
          }

          .dato {
            margin: 14px 0;
            font-size: 17px;
            line-height: 1.5;
          }

          .dato strong {
            color: #111827;
          }

          .vigencia {
            margin-top: 30px;
            padding: 18px;
            background: #eff6ff;
            border: 2px solid #2563eb;
            border-radius: 12px;
          }

          .vigencia h3 {
            margin-top: 0;
            color: #1d4ed8;
          }

          .estado {
            margin-top: 25px;
            padding: 18px;
            border-radius: 12px;
            text-align: center;
            background: #dcfce7;
            color: #166534;
            font-size: 22px;
            font-weight: bold;
            border: 2px solid #16a34a;
          }

          .qr {
            margin-top: 30px;
            text-align: center;
          }

          .qr img {
            width: 130px;
            height: 130px;
          }

          .firma {
            margin-top: 80px;
            text-align: center;
          }

          .linea {
            width: 280px;
            margin: auto;
            border-top: 2px solid #111827;
            margin-bottom: 10px;
          }

          .footer {
            margin-top: 40px;
            text-align: center;
            color: #6b7280;
            font-size: 14px;
          }
        </style>
      </head>

      <body>
        <div class="licencia">
          <div class="header">
            <h1>MUNICIPALIDAD</h1>
            <h2>LICENCIA MUNICIPAL DE FUNCIONAMIENTO</h2>
          </div>

          <div class="datos">
            <p class="dato"><strong>Número de licencia:</strong> ${
              solicitud.numeroLicencia || solicitud.id
            }</p>
            <p class="dato"><strong>Número de expediente:</strong> ${
              solicitud.id
            }</p>
            <p class="dato"><strong>Tipo de trámite:</strong> ${
              solicitud.tipoTramite || "Nueva licencia"
            }</p>
            <p class="dato"><strong>RUC:</strong> ${solicitud.ruc}</p>
            <p class="dato"><strong>Razón social:</strong> ${
              solicitud.razonSocial
            }</p>
            <p class="dato"><strong>Nombre comercial:</strong> ${
              solicitud.nombreNegocio
            }</p>
            <p class="dato"><strong>Dirección:</strong> ${
              solicitud.direccion
            }</p>
            <p class="dato"><strong>Giro comercial:</strong> ${
              solicitud.giro
            }</p>
            <p class="dato"><strong>Fecha de aprobación:</strong> ${formatearFecha(
              fechaAprobacion
            )}</p>
          </div>

          <div class="vigencia">
            <h3>Vigencia de la licencia</h3>
            <p class="dato"><strong>Fecha de emisión:</strong> ${formatearFecha(
              fechaAprobacion
            )}</p>
            <p class="dato"><strong>Fecha de expiración:</strong> ${formatearFecha(
              fechaExpiracion
            )}</p>
            <p>Esta licencia tiene una duración de 1 año y deberá renovarse antes de la fecha de vencimiento.</p>
          </div>

          <div class="estado">
            ${obtenerEstadoVisible(solicitud).toUpperCase()}
          </div>

          <div class="qr">
            <p><strong>Código QR de verificación</strong></p>
            <img src="${qrUrl}" alt="QR de verificación" />
          </div>

          <div class="firma">
            <div class="linea"></div>
            <p>Funcionario Municipal Responsable</p>
          </div>

          <div class="footer">
            Documento generado automáticamente por el sistema municipal.
          </div>
        </div>
      </body>
    </html>
  `;

  const blob = new Blob([contenido], {
    type: "text/html",
  });

  const url = URL.createObjectURL(blob);

  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = `Licencia_${solicitud.ruc}.html`;

  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);

  URL.revokeObjectURL(url);
};