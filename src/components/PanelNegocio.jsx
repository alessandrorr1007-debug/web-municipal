import { useEffect, useState } from "react";
import { initMercadoPago, CardPayment } from "@mercadopago/sdk-react";
import { consultarRuc } from "../services/rucService";
import { procesarPagoTarjeta } from "../services/pagoService";
import {
  guardarSolicitud,
  obtenerSolicitudes,
} from "../services/solicitudService";
import { convertirPdfABase64 } from "../services/pdfService";
import { useAuth } from "../context/AuthContext";

function PanelNegocio() {
  const { usuario } = useAuth();

  const MP_PUBLIC_KEY = import.meta.env.VITE_MP_PUBLIC_KEY || "";
  const MONTO_TRAMITE = 100;

  const [archivos, setArchivos] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [errorRuc, setErrorRuc] = useState("");
  const [rucValidado, setRucValidado] = useState(false);
  const [paso, setPaso] = useState("misSolicitudes");
  const [metodoPago, setMetodoPago] = useState("");
  const [estadoPago, setEstadoPago] = useState("Sin pago");
  const [expediente, setExpediente] = useState("");
  const [misSolicitudes, setMisSolicitudes] = useState([]);
  const [procesandoPago, setProcesandoPago] = useState(false);
  const [detallePago, setDetallePago] = useState(null);

  const [form, setForm] = useState({
    tipoTramite: "Nueva licencia",
    ruc: "",
    nombreNegocio: "",
    razonSocial: "",
    direccion: "",
    giro: "",
    estadoSunat: "",
    condicionSunat: "",
  });

  useEffect(() => {
    if (MP_PUBLIC_KEY) {
      initMercadoPago(MP_PUBLIC_KEY, {
        locale: "es-PE",
      });
    }
  }, [MP_PUBLIC_KEY]);

  const cargarMisSolicitudes = async () => {
    try {
      const solicitudes = await obtenerSolicitudes();

      const filtradas = solicitudes.filter(
        (s) => s.correoUsuario === usuario?.correo || s.uidUsuario === usuario?.uid
      );

      setMisSolicitudes(filtradas);
    } catch (error) {
      console.error(error);
      alert("No se pudieron cargar las solicitudes.");
    }
  };

  useEffect(() => {
    if (usuario) cargarMisSolicitudes();
  }, [usuario]);

  const manejarCambio = (e) => {
    let valor = e.target.value;

    if (e.target.name === "ruc") {
      valor = valor.replace(/\D/g, "");
    }

    setForm({ ...form, [e.target.name]: valor });

    if (e.target.name === "ruc") {
      setRucValidado(false);
      setErrorRuc("");
    }
  };

  const buscarRuc = async () => {
    setErrorRuc("");
    setRucValidado(false);

    if (form.ruc.trim().length !== 11) {
      setErrorRuc("El RUC debe tener 11 dígitos.");
      return;
    }

    try {
      setBuscando(true);

      const data = await consultarRuc(form.ruc.trim());
      const info = data.data || data.resultado || data;

      setForm((prev) => ({
        ...prev,
        razonSocial: info.razon_social || info.nombre_o_razon_social || "",
        nombreNegocio:
          info.nombre_comercial ||
          info.razon_social ||
          info.nombre_o_razon_social ||
          "",
        direccion:
          info.direccion ||
          info.direccion_completa ||
          info.domicilio_fiscal ||
          "",
        giro:
          info.actividad_economica ||
          info.actividad ||
          info.ciiu ||
          "Actividad económica no especificada",
        estadoSunat: info.estado || "",
        condicionSunat: info.condicion || "",
      }));

      setRucValidado(true);
    } catch (error) {
      console.error(error);
      setErrorRuc("No se pudo consultar el RUC.");
    } finally {
      setBuscando(false);
    }
  };

  const validarPdfs = (files) => {
    const lista = Array.from(files);

    if (lista.length + archivos.length > 5) {
      alert("Solo puedes subir como máximo 5 documentos PDF.");
      return [];
    }

    const noPdf = lista.find((file) => file.type !== "application/pdf");

    if (noPdf) {
      alert("Solo se permiten archivos PDF.");
      return [];
    }

    return lista;
  };

  const manejarArchivos = (e) => {
    const seleccionados = validarPdfs(e.target.files);
    setArchivos((prev) => [...prev, ...seleccionados]);
  };

  const manejarDrop = (e) => {
    e.preventDefault();

    const seleccionados = validarPdfs(e.dataTransfer.files);
    setArchivos((prev) => [...prev, ...seleccionados]);
  };

  const quitarArchivo = (index) => {
    setArchivos((prev) => prev.filter((_, i) => i !== index));
  };

  const continuarPago = () => {
    if (!form.tipoTramite) {
      alert("Debe seleccionar el tipo de trámite.");
      return;
    }

    if (!rucValidado) {
      alert("Primero debe validar el RUC.");
      return;
    }

    if (archivos.length === 0) {
      alert("Debe subir al menos un documento PDF.");
      return;
    }

    if (!form.nombreNegocio || !form.razonSocial || !form.direccion) {
      alert("Complete todos los campos obligatorios.");
      return;
    }

    setPaso("pago");
  };

  const procesarPagoIntegrado = async (datosPago) => {
    try {
      setProcesandoPago(true);

      const data = await procesarPagoTarjeta({
        token: datosPago.token,
        issuerId: datosPago.issuer_id || datosPago.issuerId,
        paymentMethodId:
          datosPago.payment_method_id || datosPago.paymentMethodId,
        transactionAmount: 100,
        installments: datosPago.installments || 1,
        description: `Licencia municipal de funcionamiento - RUC ${form.ruc}`,
        payer: datosPago.payer,
        ruc: form.ruc,
        razonSocial: form.razonSocial,
      });

      setDetallePago(data);

      if (data.status === "approved") {
        setMetodoPago("Mercado Pago - Tarjeta");
        setEstadoPago("Confirmado");
        alert("Pago aprobado correctamente.");
        return data;
      }

      if (data.status === "pending" || data.status === "in_process") {
        setMetodoPago("Mercado Pago - Tarjeta");
        setEstadoPago("Pendiente de pago");
        alert("El pago quedó pendiente de validación.");
        return data;
      }

      setMetodoPago("Mercado Pago - Tarjeta");
      setEstadoPago("Pago rechazado");
      alert("El pago fue rechazado. Prueba con otra tarjeta.");
      return data;
    } catch (error) {
      console.error(error);
      alert(error.message || "No se pudo procesar el pago.");
      throw error;
    } finally {
      setProcesandoPago(false);
    }
  };

  const marcarPagoDemo = () => {
    setMetodoPago("Pago demo");
    setEstadoPago("Confirmado");
    setDetallePago({ status: "approved", metodo: "demo" });
    alert("Pago marcado como confirmado para pruebas.");
  };

  const enviarSolicitud = async () => {
    if (estadoPago !== "Confirmado") {
      alert("Debe realizar y confirmar el pago antes de enviar la solicitud.");
      return;
    }

    if (archivos.length === 0) {
      alert("Debe subir al menos un PDF antes de enviar la solicitud.");
      return;
    }

    try {
      setGuardando(true);

      const pdfsSubidos = await Promise.all(
        archivos.map((archivo) => convertirPdfABase64(archivo))
      );

      const nueva = await guardarSolicitud({
        uidUsuario: usuario?.uid || "",
        correoUsuario: usuario?.correo || "",
        tipoTramite: form.tipoTramite,
        ruc: form.ruc,
        nombreNegocio: form.nombreNegocio,
        razonSocial: form.razonSocial,
        direccion: form.direccion,
        giro: form.giro,
        estadoSunat: form.estadoSunat,
        condicionSunat: form.condicionSunat,

        archivosPdf: pdfsSubidos,
        archivoNombre: pdfsSubidos[0]?.archivoNombre || "Sin archivo",
        archivoUrl: pdfsSubidos[0]?.archivoUrl || "",

        metodoPago,
        estadoPago,
        comprobantePago:
          estadoPago === "Confirmado"
            ? `Pago confirmado mediante ${metodoPago}`
            : `Pago generado mediante ${metodoPago}`,

        estado: "En revisión",
        inspeccion: "Sin inspección",
        recomendacionInspector: "",
        observacionInspector: "",
        evidenciasInspector: [],
        decisionFuncionario: "",
        observacionFuncionario: "",
        numeroLicencia: "",
        fechaAprobacion: "",
        fechaExpiracionLicencia: "",
        pagoId: detallePago?.id || "",
        pagoEstadoDetalle: detallePago?.status_detail || "",
      });

      setExpediente(nueva.id);
      await cargarMisSolicitudes();
      setPaso("confirmacion");
    } catch (error) {
      console.error(error);
      alert(error.message || "No se pudo guardar la solicitud.");
    } finally {
      setGuardando(false);
    }
  };

  const nuevaSolicitud = () => {
    setPaso("solicitud");
    setMetodoPago("");
    setEstadoPago("Sin pago");
    setArchivos([]);
    setRucValidado(false);
    setErrorRuc("");
    setExpediente("");
    setDetallePago(null);
    setProcesandoPago(false);

    setForm({
      tipoTramite: "Nueva licencia",
      ruc: "",
      nombreNegocio: "",
      razonSocial: "",
      direccion: "",
      giro: "",
      estadoSunat: "",
      condicionSunat: "",
    });
  };

  const formatearFecha = (fecha) => {
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

  const obtenerFechaAprobacion = (solicitud) => {
    return (
      solicitud.fechaAprobacion ||
      solicitud.fechaDecisionFuncionario ||
      solicitud.fecha ||
      new Date().toISOString()
    );
  };

  const obtenerFechaExpiracion = (solicitud) => {
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

  const licenciaVencida = (solicitud) => {
    if (solicitud.estado !== "Licencia aprobada") return false;

    const fechaExpiracion = new Date(obtenerFechaExpiracion(solicitud));

    if (Number.isNaN(fechaExpiracion.getTime())) return false;

    return fechaExpiracion < new Date();
  };

  const obtenerEstadoVisible = (solicitud) => {
    if (licenciaVencida(solicitud)) return "Licencia vencida";
    return solicitud.estado;
  };

  const badgeClase = (estado = "") => {
    const texto = estado.toLowerCase();

    if (texto.includes("vencida")) return "danger";
    if (texto.includes("aprobada")) return "ok";
    if (texto.includes("rechazada")) return "danger";
    if (texto.includes("inspección")) return "info";
    if (texto.includes("revisión")) return "warning";
    if (texto.includes("resultado")) return "warning";
    return "neutral";
  };

  const renovarLicencia = (solicitud) => {
    setPaso("solicitud");
    setMetodoPago("");
    setEstadoPago("Sin pago");
    setArchivos([]);
    setRucValidado(true);
    setErrorRuc("");
    setExpediente("");
    setDetallePago(null);
    setProcesandoPago(false);

    setForm({
      tipoTramite: "Renovación anual",
      ruc: solicitud.ruc || "",
      nombreNegocio: solicitud.nombreNegocio || "",
      razonSocial: solicitud.razonSocial || "",
      direccion: solicitud.direccion || "",
      giro: solicitud.giro || "",
      estadoSunat: solicitud.estadoSunat || "",
      condicionSunat: solicitud.condicionSunat || "",
    });
  };

  const descargarLicencia = (solicitud) => {
    const fechaAprobacion = obtenerFechaAprobacion(solicitud);
    const fechaExpiracion = obtenerFechaExpiracion(solicitud);

    const textoQr = encodeURIComponent(
      `LICENCIA MUNICIPAL | Expediente: ${solicitud.id} | RUC: ${solicitud.ruc} | Estado: ${obtenerEstadoVisible(solicitud)} | Vence: ${formatearFecha(fechaExpiracion)}`
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
              <p class="dato"><strong>Número de expediente:</strong> ${solicitud.id}</p>
              <p class="dato"><strong>Tipo de trámite:</strong> ${
                solicitud.tipoTramite || "Nueva licencia"
              }</p>
              <p class="dato"><strong>RUC:</strong> ${solicitud.ruc}</p>
              <p class="dato"><strong>Razón social:</strong> ${solicitud.razonSocial}</p>
              <p class="dato"><strong>Nombre comercial:</strong> ${
                solicitud.nombreNegocio
              }</p>
              <p class="dato"><strong>Dirección:</strong> ${solicitud.direccion}</p>
              <p class="dato"><strong>Giro comercial:</strong> ${solicitud.giro}</p>
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

  return (
    <div className="panel panel-negocio">
      <div className="panel-hero">
        <div>
          <span className="eyebrow">Portal del solicitante</span>
          <h1>Licencia de funcionamiento</h1>
          <p>
            Registra tu solicitud, realiza el pago y consulta el avance de tu expediente.
          </p>
        </div>

        <div className="hero-card">
          <span>Solicitante</span>
          <strong>{usuario?.nombre || "Usuario negocio"}</strong>
          <small>{usuario?.correo}</small>
        </div>
      </div>

      <div className="tabs-panel">
        <button
          type="button"
          className={paso === "misSolicitudes" ? "tab-active" : ""}
          onClick={() => {
            cargarMisSolicitudes();
            setPaso("misSolicitudes");
          }}
        >
          Mis solicitudes
        </button>

        <button
          type="button"
          className={paso === "solicitud" ? "tab-active" : ""}
          onClick={nuevaSolicitud}
        >
          Nueva solicitud
        </button>
      </div>

      {paso === "misSolicitudes" && (
        <section className="section-card">
          <div className="section-header">
            <div>
              <h2>Mis solicitudes</h2>
              <p>Consulta el estado de tus expedientes enviados.</p>
            </div>

            <button type="button" className="btn-outline" onClick={cargarMisSolicitudes}>
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
      )}

      {paso === "solicitud" && (
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

            <button type="button" className="btn-pago btn-full" onClick={continuarPago}>
              Continuar al pago
            </button>
          </div>
        </section>
      )}

      {paso === "pago" && (
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
            <p><strong>Monto:</strong> S/{MONTO_TRAMITE.toFixed(2)}</p>
            <p><strong>Estado del pago:</strong> {estadoPago}</p>
          </div>

          {!MP_PUBLIC_KEY ? (
            <div className="voucher-box">
              <h3>Falta configurar Mercado Pago</h3>
              <p>
                Agrega VITE_MP_PUBLIC_KEY en el archivo .env del frontend para mostrar el formulario de pago.
              </p>
            </div>
          ) : estadoPago !== "Confirmado" ? (
            <div className="detalle-pago">
              <h3>Pago con tarjeta dentro de la web</h3>
              <p>
                Completa los datos de pago sin salir del sistema municipal.
              </p>

              <CardPayment
                initialization={{
                  amount: MONTO_TRAMITE,
                }}
                customization={{
                  paymentMethods: {
                    minInstallments: 1,
                    maxInstallments: 1,
                  },
                }}
                onSubmit={procesarPagoIntegrado}
                onReady={() => console.log("Formulario de pago listo")}
                onError={(error) => {
                  console.error(error);
                  alert("Ocurrió un error cargando el formulario de pago. Revisa la consola.");
                }}
              />
            </div>
          ) : (
            <div className="voucher-box">
              <h3>Pago confirmado</h3>
              <p>El comprobante del pago queda registrado automáticamente.</p>
              {detallePago?.id && <p><strong>ID de pago:</strong> {detallePago.id}</p>}
            </div>
          )}

          <div className="payment-actions">
            <button type="button" className="btn-secundario" onClick={marcarPagoDemo}>
              Marcar pago como realizado (demo)
            </button>
          </div>

          <div className="acciones-pago">
            <button type="button" onClick={() => setPaso("solicitud")}>
              Volver
            </button>

            <button
              type="button"
              className="btn-pago"
              onClick={enviarSolicitud}
              disabled={
                guardando ||
                estadoPago !== "Confirmado"
              }
            >
              {guardando ? "Guardando solicitud..." : "Enviar solicitud"}
            </button>
          </div>
        </section>
      )}

      {paso === "confirmacion" && (
        <section className="section-card confirmacion">
          <div className="success-circle">✓</div>
          <h2>Solicitud registrada</h2>
          <p>Tu solicitud fue enviada correctamente y los PDFs quedaron guardados.</p>

          <div className="resumen-pago">
            <p><strong>Número de expediente:</strong> {expediente}</p>
            <p><strong>Tipo de trámite:</strong> {form.tipoTramite}</p>
            <p><strong>Estado:</strong> En revisión municipal</p>
            <p><strong>Pago:</strong> {estadoPago}</p>
            <p><strong>Monto:</strong> S/{MONTO_TRAMITE.toFixed(2)}</p>
          </div>

          <button
            type="button"
            className="btn-pago"
            onClick={() => setPaso("misSolicitudes")}
          >
            Ver mis solicitudes
          </button>
        </section>
      )}
    </div>
  );
}

export default PanelNegocio;