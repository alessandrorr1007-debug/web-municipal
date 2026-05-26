import { useEffect, useState } from "react";
import jsPDF from "jspdf";
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
        transactionAmount: MONTO_TRAMITE,
        installments: datosPago.installments || 1,
        description: `Licencia municipal de funcionamiento - RUC ${form.ruc}`,
        payer: datosPago.payer,
        ruc: form.ruc,
        razonSocial: form.razonSocial,
      });

      setDetallePago(data);
      setMetodoPago("Mercado Pago - Tarjeta");

      if (data.status === "approved") {
        setEstadoPago("Confirmado");
        alert("Pago aprobado correctamente.");
        return data;
      }

      if (data.status === "pending" || data.status === "in_process") {
        setEstadoPago("Pendiente de pago");
        alert("El pago quedó pendiente de validación.");
        return data;
      }

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

    return fechaDate.toLocaleDateString("es-PE");
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
    const estadoVisible = obtenerEstadoVisible(solicitud);

    const doc = new jsPDF("p", "mm", "a4");

    const margenX = 18;
    let y = 18;

    const agregarTextoMultilinea = (texto, x, yInicial, anchoMaximo, salto = 6) => {
      const lineas = doc.splitTextToSize(String(texto || "No registrado"), anchoMaximo);
      doc.text(lineas, x, yInicial);
      return yInicial + lineas.length * salto;
    };

    const agregarDato = (label, valor) => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text(`${label}:`, margenX + 8, y);

      doc.setFont("helvetica", "normal");
      y = agregarTextoMultilinea(valor, margenX + 56, y, 105, 5) + 4;
    };

    doc.setFillColor(30, 64, 100);
    doc.rect(0, 0, 210, 36, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("MUNICIPALIDAD DE TRUJILLO", 105, 16, { align: "center" });

    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text("Sistema de Licencias de Funcionamiento", 105, 25, {
      align: "center",
    });

    y = 48;

    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(17);
    doc.text("LICENCIA MUNICIPAL DE FUNCIONAMIENTO", 105, y, {
      align: "center",
    });

    y += 8;

    doc.setDrawColor(37, 99, 235);
    doc.setLineWidth(0.6);
    doc.line(35, y, 175, y);

    y += 14;

    doc.setFillColor(239, 246, 255);
    doc.setDrawColor(147, 197, 253);
    doc.roundedRect(margenX, y, 174, 100, 4, 4, "FD");

    y += 12;

    agregarDato("N° de licencia", solicitud.numeroLicencia || solicitud.id);
    agregarDato("Expediente", solicitud.id);
    agregarDato("Tipo de trámite", solicitud.tipoTramite || "Nueva licencia");
    agregarDato("RUC", solicitud.ruc);
    agregarDato("Razón social", solicitud.razonSocial);
    agregarDato("Nombre comercial", solicitud.nombreNegocio);
    agregarDato("Dirección", solicitud.direccion);
    agregarDato("Giro comercial", solicitud.giro);

    y += 8;

    doc.setFillColor(220, 252, 231);
    doc.setDrawColor(22, 163, 74);
    doc.roundedRect(margenX, y, 174, 18, 4, 4, "FD");

    doc.setTextColor(22, 101, 52);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(estadoVisible.toUpperCase(), 105, y + 12, { align: "center" });

    y += 32;

    doc.setTextColor(15, 23, 42);
    doc.setFillColor(255, 251, 235);
    doc.setDrawColor(245, 158, 11);
    doc.roundedRect(margenX, y, 174, 40, 4, 4, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Vigencia de la licencia", margenX + 8, y + 10);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Fecha de emisión: ${formatearFecha(fechaAprobacion)}`, margenX + 8, y + 20);
    doc.text(`Fecha de expiración: ${formatearFecha(fechaExpiracion)}`, margenX + 8, y + 28);

    const textoVigencia =
      "Esta licencia tiene una duración de 1 año y deberá renovarse antes de la fecha de vencimiento.";
    doc.text(doc.splitTextToSize(textoVigencia, 155), margenX + 8, y + 36);

    y += 58;

    doc.setDrawColor(17, 24, 39);
    doc.line(65, y, 145, y);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text("Funcionario Municipal Responsable", 105, y + 7, {
      align: "center",
    });

    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(
      "Documento generado automáticamente por el sistema municipal.",
      105,
      282,
      { align: "center" }
    );

    doc.save(`Licencia_${solicitud.ruc}.pdf`);
  };

  return (
    <div className="panel panel-negocio">
      <div className="panel-hero panel-hero-modern">
        <div>
          <span className="eyebrow">Portal del solicitante</span>
          <h1>Licencia de funcionamiento</h1>
          <p>
            Registra tu solicitud, realiza el pago y consulta el avance de tu expediente.
          </p>
        </div>
      </div>

      <div className="tabs-panel tabs-panel-modern">
        <button
          type="button"
          className={paso === "misSolicitudes" ? "tab-active" : ""}
          onClick={() => {
            cargarMisSolicitudes();
            setPaso("misSolicitudes");
          }}
        >
          📂 Mis solicitudes
        </button>

        <button
          type="button"
          className={paso === "solicitud" ? "tab-active" : ""}
          onClick={nuevaSolicitud}
        >
          ➕ Nueva solicitud
        </button>
      </div>

      {paso === "misSolicitudes" && (
        <section className="section-card section-card-modern">
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
            <div className="empty-state empty-state-modern">
              <div className="empty-icon">📄</div>
              <h3>Aún no has enviado solicitudes</h3>
              <p>Cuando registres una solicitud de licencia, aparecerá aquí.</p>
              <button type="button" className="btn-pago" onClick={nuevaSolicitud}>
                Crear primera solicitud
              </button>
            </div>
          ) : (
            <div className="solicitudes-grid">
              {misSolicitudes.map((s) => (
                <article className="solicitud-card" key={s.id}>
                  <div className="solicitud-card-header">
                    <div>
                      <span>Expediente</span>
                      <h3>{s.id}</h3>
                    </div>
                    <span className={`badge ${badgeClase(obtenerEstadoVisible(s))}`}>
                      {obtenerEstadoVisible(s)}
                    </span>
                  </div>

                  <div className="solicitud-card-body">
                    <p><strong>RUC:</strong> {s.ruc}</p>
                    <p><strong>Negocio:</strong> {s.nombreNegocio}</p>
                    <p><strong>Trámite:</strong> {s.tipoTramite || "Nueva licencia"}</p>
                    <p><strong>Fecha:</strong> {s.fecha}</p>
                    <p><strong>Pago:</strong> {s.estadoPago}</p>
                    <p><strong>Inspección:</strong> {s.inspeccion || "Sin inspección"}</p>
                  </div>

                  <div className="solicitud-card-actions">
                    {s.archivosPdf?.length > 0 ? (
                      s.archivosPdf.map((pdf, index) => (
                        <a key={index} href={pdf.archivoUrl} target="_blank" rel="noreferrer">
                          PDF {index + 1}
                        </a>
                      ))
                    ) : s.archivoUrl ? (
                      <a href={s.archivoUrl} target="_blank" rel="noreferrer">
                        Ver PDF
                      </a>
                    ) : (
                      <span>Sin PDF</span>
                    )}
                  </div>

                  {s.estado === "Licencia rechazada" && (
                    <div className="motivo-rechazo">
                      <strong>Motivo:</strong>
                      <p>{s.observacionFuncionario || "No se registró motivo del rechazo."}</p>
                    </div>
                  )}

                  {s.estado === "Licencia aprobada" && (
                    <div className="vigencia-box">
                      <strong>Vence:</strong> {formatearFecha(obtenerFechaExpiracion(s))}
                    </div>
                  )}

                  <div className="solicitud-card-footer">
                    {s.estado === "Licencia aprobada" ? (
                      <>
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
                      </>
                    ) : (
                      <span className="text-muted">Licencia no disponible aún</span>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {paso === "solicitud" && (
        <section className="section-card section-card-modern">
          <div className="section-header">
            <div>
              <h2>Nueva solicitud</h2>
              <p>Completa los datos del negocio y adjunta hasta 5 documentos PDF.</p>
            </div>
          </div>

          <div className="formulario formulario-modern">
            <div className="form-block">
              <div className="block-title">
                <span>1</span>
                <div>
                  <h3>Tipo de trámite</h3>
                  <p>Selecciona si registrarás una licencia nueva o una renovación.</p>
                </div>
              </div>

              <select name="tipoTramite" value={form.tipoTramite} onChange={manejarCambio}>
                <option value="Nueva licencia">Nueva licencia</option>
                <option value="Renovación anual">Renovación anual</option>
              </select>
            </div>

            <div className="form-block">
              <div className="block-title">
                <span>2</span>
                <div>
                  <h3>Validar RUC</h3>
                  <p>Busca el RUC para completar automáticamente los datos SUNAT.</p>
                </div>
              </div>

              <div className="ruc-row ruc-row-modern">
                <input
                  type="text"
                  name="ruc"
                  placeholder="Ingrese RUC de 11 dígitos"
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
            </div>

            <div className="form-block">
              <div className="block-title">
                <span>3</span>
                <div>
                  <h3>Datos del negocio</h3>
                  <p>Verifica que la información obtenida sea correcta.</p>
                </div>
              </div>

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

              <div className="sunat-info sunat-info-modern">
                <span>
                  Estado SUNAT: <strong>{form.estadoSunat || "Pendiente"}</strong>
                </span>
                <span>
                  Condición: <strong>{form.condicionSunat || "Pendiente"}</strong>
                </span>
              </div>
            </div>

            <div className="form-block">
              <div className="block-title">
                <span>4</span>
                <div>
                  <h3>Documentos PDF</h3>
                  <p>Sube los archivos del trámite. Puedes arrastrarlos aquí.</p>
                </div>
              </div>

              <div
                className="drop-zone drop-zone-modern"
                onDrop={manejarDrop}
                onDragOver={(e) => e.preventDefault()}
              >
                <div className="empty-icon">📎</div>
                <p>Subir documentos del trámite en PDF</p>
                <span>Máximo 5 PDFs. Arrastra tus archivos o selecciónalos.</span>

                <label className="file-label">
                  Elegir PDFs
                  <input type="file" accept=".pdf" multiple onChange={manejarArchivos} hidden />
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
            </div>

            <button type="button" className="btn-pago btn-full" onClick={continuarPago}>
              Continuar al pago
            </button>
          </div>
        </section>
      )}

      {paso === "pago" && (
        <section className="section-card section-card-modern">
          <div className="section-header">
            <div>
              <h2>Pago del trámite</h2>
              <p>Realiza el pago oficial o usa el modo demo para probar el flujo.</p>
            </div>
          </div>

          <div className="payment-layout">
            <aside className="resumen-pago resumen-pago-modern">
              <h3>Resumen del trámite</h3>
              <p><strong>Tipo de trámite:</strong> {form.tipoTramite}</p>
              <p><strong>RUC:</strong> {form.ruc}</p>
              <p><strong>Razón social:</strong> {form.razonSocial}</p>
              <p><strong>Documentos PDF:</strong> {archivos.length}</p>
              <p><strong>Concepto:</strong> Licencia municipal de funcionamiento</p>
              <div className="monto-box">
                <span>Total a pagar</span>
                <strong>S/{MONTO_TRAMITE.toFixed(2)}</strong>
              </div>
              <span className={`badge ${estadoPago === "Confirmado" ? "ok" : "warning"}`}>
                {estadoPago}
              </span>
            </aside>

            <div className="detalle-pago detalle-pago-modern">
              {!MP_PUBLIC_KEY ? (
                <div className="voucher-box">
                  <h3>Falta configurar Mercado Pago</h3>
                  <p>
                    Agrega VITE_MP_PUBLIC_KEY en el archivo .env del frontend para mostrar el formulario de pago.
                  </p>
                </div>
              ) : estadoPago !== "Confirmado" ? (
                <>
                  <h3>Pago con tarjeta dentro de la web</h3>
                  <p>Completa los datos de pago sin salir del sistema municipal.</p>

                  <CardPayment
                    initialization={{ amount: MONTO_TRAMITE }}
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
                </>
              ) : (
                <div className="voucher-box success-voucher">
                  <h3>Pago confirmado</h3>
                  <p>El comprobante del pago queda registrado automáticamente.</p>
                  {detallePago?.id && <p><strong>ID de pago:</strong> {detallePago.id}</p>}
                </div>
              )}
            </div>
          </div>

          <div className="payment-actions">
            <button
              type="button"
              className="btn-secundario"
              onClick={marcarPagoDemo}
              disabled={procesandoPago}
            >
              Marcar pago como realizado (demo)
            </button>
          </div>

          <div className="acciones-pago acciones-pago-modern">
            <button type="button" onClick={() => setPaso("solicitud")}>
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
      )}

      {paso === "confirmacion" && (
        <section className="section-card section-card-modern confirmacion">
          <div className="success-circle">✓</div>
          <h2>Solicitud registrada</h2>
          <p>Tu solicitud fue enviada correctamente y los PDFs quedaron guardados.</p>

          <div className="resumen-pago resumen-pago-modern">
            <p><strong>Número de expediente:</strong> {expediente}</p>
            <p><strong>Tipo de trámite:</strong> {form.tipoTramite}</p>
            <p><strong>Estado:</strong> En revisión municipal</p>
            <p><strong>Pago:</strong> {estadoPago}</p>
            <p><strong>Monto:</strong> S/{MONTO_TRAMITE.toFixed(2)}</p>
          </div>

          <button type="button" className="btn-pago" onClick={() => setPaso("misSolicitudes")}>
            Ver mis solicitudes
          </button>
        </section>
      )}
    </div>
  );
}

export default PanelNegocio;
