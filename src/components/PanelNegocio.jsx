import { useEffect, useState } from "react";
import { consultarRuc } from "../services/rucService";
import { crearPreferenciaPago } from "../services/pagoService";
import {
  guardarSolicitud,
  obtenerSolicitudes,
  obtenerNegociosPorUsuario,
} from "../services/solicitudService";
import { convertirPdfABase64 } from "../services/pdfService";
import { useAuth } from "../context/AuthContext";
import Timeline from "./Timeline";

function PanelNegocio({ seccion }) {
  const { usuario } = useAuth();
  const MONTO_TRAMITE = 3;

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
  const [notificacionesPendientes, setNotificacionesPendientes] = useState(0);
  const [negocios, setNegocios] = useState([]);

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

  const confirmarPagoMercadoPago = (datosPago = {}) => {
    setMetodoPago("Mercado Pago Checkout Pro TEST");
    setEstadoPago("Confirmado");
    setDetallePago((prev) => ({
      ...(prev || {}),
      ...datosPago,
      status: "approved",
      metodo: "checkout_pro_test",
    }));
  };

  const registrarPagoDemo = () => {
    const codigoOperacion = `DEMO-${Date.now().toString().slice(-8)}`;

    setMetodoPago("Pago demo municipal");
    setEstadoPago("Confirmado");
    setDetallePago({
      id: codigoOperacion,
      paymentId: codigoOperacion,
      preferenceId: codigoOperacion,
      status: "approved",
      metodo: "demo_municipal",
    });

    alert("Pago demo registrado correctamente. Ya puedes enviar la solicitud.");
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("status") || params.get("collection_status");
    const paymentId = params.get("payment_id") || params.get("collection_id");
    const preferenceId = params.get("preference_id");

    if (status === "approved") {
      const datosPago = {
        id: paymentId || preferenceId || `MP-${Date.now().toString().slice(-8)}`,
        paymentId: paymentId || "",
        preferenceId: preferenceId || "",
        status,
      };

      localStorage.setItem("mp_pago_estado", JSON.stringify(datosPago));
      confirmarPagoMercadoPago(datosPago);
      setPaso("pago");
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }

    const pagoGuardado = localStorage.getItem("mp_pago_estado");

    if (pagoGuardado) {
      try {
        const datosPago = JSON.parse(pagoGuardado);

        if (datosPago?.status === "approved") {
          confirmarPagoMercadoPago(datosPago);
        }
      } catch (error) {
        console.error("No se pudo leer el estado del pago.", error);
      }
    }
  }, []);

  const cargarMisSolicitudes = async () => {
    try {
      const solicitudes = await obtenerSolicitudes();

      const filtradas = solicitudes.filter(
        (s) => s.correoUsuario === usuario?.correo || s.uidUsuario === usuario?.uid
      );

      setMisSolicitudes(filtradas);

      let totalNoLeidas = 0;
      filtradas.forEach((s) => {
        if (s.notificaciones) {
          totalNoLeidas += s.notificaciones.filter((n) => !n.leida).length;
        }
      });
      setNotificacionesPendientes(totalNoLeidas);
    } catch (error) {
      console.error(error);
      alert("No se pudieron cargar las solicitudes.");
    }
  };

  useEffect(() => {
    if (usuario) cargarMisSolicitudes();
  }, [usuario]);

  const cargarNegocios = async () => {
    try {
      const list = await obtenerNegociosPorUsuario(usuario?.uid);
      setNegocios(list);
    } catch (error) {
      console.error("Error al cargar negocios:", error);
    }
  };

  useEffect(() => {
    if (usuario && seccion === "mi-cuenta") {
      cargarNegocios();
    }
  }, [usuario, seccion]);

  useEffect(() => {
    if (seccion === "nueva-solicitud") {
      nuevaSolicitud();
    } else if (seccion === "mis-solicitudes") {
      setPaso("misSolicitudes");
    }
  }, [seccion]);

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
      setErrorRuc(error.message || "No se pudo consultar el RUC.");
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

  const iniciarPagoMercadoPago = async () => {
    try {
      setProcesandoPago(true);

      const data = await crearPreferenciaPago({
        ruc: form.ruc,
        razonSocial: form.razonSocial,
      });

      const urlPago = data.sandbox_init_point || data.init_point;

      if (!urlPago) {
        throw new Error("Mercado Pago no devolvió un enlace de pago.");
      }

      const datosPendientes = {
        id: data.id || "",
        preferenceId: data.id || "",
        initPoint: urlPago,
        status: "pending",
      };

      setMetodoPago("Mercado Pago Checkout Pro TEST");
      setEstadoPago("Pendiente de pago");
      setDetallePago(datosPendientes);

      localStorage.removeItem("mp_pago_estado");
      localStorage.setItem("mp_pago_pendiente", JSON.stringify(datosPendientes));

      window.open(urlPago, "_blank", "noopener,noreferrer");
    } catch (error) {
      console.error(error);
      alert(error.message || "No se pudo iniciar el pago con Mercado Pago.");
    } finally {
      setProcesandoPago(false);
    }
  };

  const iniciarPagoDemo = () => {
    setProcesandoPago(true);

    setTimeout(() => {
      registrarPagoDemo();
      setProcesandoPago(false);
    }, 600);
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
    localStorage.removeItem("mp_pago_estado");
    localStorage.removeItem("mp_pago_pendiente");

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
    localStorage.removeItem("mp_pago_estado");
    localStorage.removeItem("mp_pago_pendiente");

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
            body { font-family: Arial, sans-serif; padding: 40px; background: #f3f4f6; color: #111827; }
            .licencia { max-width: 900px; margin: auto; background: white; border: 5px solid #111827; border-radius: 18px; padding: 40px; box-shadow: 0 10px 30px rgba(0,0,0,0.15); }
            .header { text-align: center; margin-bottom: 30px; }
            .header h1 { margin: 0; font-size: 34px; color: #111827; }
            .header h2 { margin-top: 10px; font-size: 22px; color: #2563eb; }
            .datos { margin-top: 30px; }
            .dato { margin: 14px 0; font-size: 17px; line-height: 1.5; }
            .dato strong { color: #111827; }
            .vigencia { margin-top: 30px; padding: 18px; background: #eff6ff; border: 2px solid #2563eb; border-radius: 12px; }
            .vigencia h3 { margin-top: 0; color: #1d4ed8; }
            .estado { margin-top: 25px; padding: 18px; border-radius: 12px; text-align: center; background: #dcfce7; color: #166534; font-size: 22px; font-weight: bold; border: 2px solid #16a34a; }
            .qr { margin-top: 30px; text-align: center; }
            .qr img { width: 130px; height: 130px; }
            .firma { margin-top: 80px; text-align: center; }
            .linea { width: 280px; margin: auto; border-top: 2px solid #111827; margin-bottom: 10px; }
            .footer { margin-top: 40px; text-align: center; color: #6b7280; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="licencia">
            <div class="header">
              <h1>MUNICIPALIDAD</h1>
              <h2>LICENCIA MUNICIPAL DE FUNCIONAMIENTO</h2>
            </div>
            <div class="datos">
              <p class="dato"><strong>Número de licencia:</strong> ${solicitud.numeroLicencia || solicitud.id}</p>
              <p class="dato"><strong>Número de expediente:</strong> ${solicitud.id}</p>
              <p class="dato"><strong>Tipo de trámite:</strong> ${solicitud.tipoTramite || "Nueva licencia"}</p>
              <p class="dato"><strong>RUC:</strong> ${solicitud.ruc}</p>
              <p class="dato"><strong>Razón social:</strong> ${solicitud.razonSocial}</p>
              <p class="dato"><strong>Nombre comercial:</strong> ${solicitud.nombreNegocio}</p>
              <p class="dato"><strong>Dirección:</strong> ${solicitud.direccion}</p>
              <p class="dato"><strong>Giro comercial:</strong> ${solicitud.giro}</p>
              <p class="dato"><strong>Fecha de aprobación:</strong> ${formatearFecha(fechaAprobacion)}</p>
            </div>
            <div class="vigencia">
              <h3>Vigencia de la licencia</h3>
              <p class="dato"><strong>Fecha de emisión:</strong> ${formatearFecha(fechaAprobacion)}</p>
              <p class="dato"><strong>Fecha de expiración:</strong> ${formatearFecha(fechaExpiracion)}</p>
              <p>Esta licencia tiene una duración de 1 año y deberá renovarse antes de la fecha de vencimiento.</p>
            </div>
            <div class="estado">${obtenerEstadoVisible(solicitud).toUpperCase()}</div>
            <div class="qr">
              <p><strong>Código QR de verificación</strong></p>
              <img src="${qrUrl}" alt="QR de verificación" />
            </div>
            <div class="firma">
              <div class="linea"></div>
              <p>Funcionario Municipal Responsable</p>
            </div>
            <div class="footer">Documento generado automáticamente por el sistema municipal.</div>
          </div>
        </body>
      </html>
    `;

    const blob = new Blob([contenido], { type: "text/html" });
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
      {seccion === "inicio" && (
        <section className="section-card section-card-modern">
          <div className="panel-hero panel-hero-modern">
            <div>
              <span className="eyebrow">Portal del solicitante</span>
              <h1>Licencia de funcionamiento</h1>
              <p>Registra tu solicitud, realiza el pago y consulta el avance de tu expediente.</p>
            </div>
            <div className="hero-card">
              <span style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Monto del trámite</span>
              <strong style={{ fontSize: "28px" }}>S/{MONTO_TRAMITE.toFixed(2)}</strong>
              <small>Derecho de trámite municipal</small>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px", marginTop: "20px" }}>
            <div style={{ background: "#f0fdf4", padding: "20px", borderRadius: "14px", border: "1px solid #bbf7d0" }}>
              <div style={{ fontSize: "24px", marginBottom: "8px" }}>&#128196;</div>
              <strong style={{ fontSize: "24px", color: "#166534" }}>{misSolicitudes.length}</strong>
              <p style={{ margin: "4px 0 0", color: "#166534", fontSize: "13px" }}>Solicitudes enviadas</p>
            </div>
            <div style={{ background: "#eff6ff", padding: "20px", borderRadius: "14px", border: "1px solid #bfdbfe" }}>
              <div style={{ fontSize: "24px", marginBottom: "8px" }}>&#128276;</div>
              <strong style={{ fontSize: "24px", color: "#1e3a8a" }}>{notificacionesPendientes}</strong>
              <p style={{ margin: "4px 0 0", color: "#1e3a8a", fontSize: "13px" }}>Notificaciones nuevas</p>
            </div>
            <div style={{ background: "#fef3c7", padding: "20px", borderRadius: "14px", border: "1px solid #fde68a" }}>
              <div style={{ fontSize: "24px", marginBottom: "8px" }}>&#128197;</div>
              <strong style={{ fontSize: "24px", color: "#92400e" }}>{misSolicitudes.filter(s => s.estado === "En revision").length}</strong>
              <p style={{ margin: "4px 0 0", color: "#92400e", fontSize: "13px" }}>En revisión</p>
            </div>
            <div style={{ background: "#f0fdf4", padding: "20px", borderRadius: "14px", border: "1px solid #bbf7d0" }}>
              <div style={{ fontSize: "24px", marginBottom: "8px" }}>&#9989;</div>
              <strong style={{ fontSize: "24px", color: "#166534" }}>{misSolicitudes.filter(s => s.estado === "Licencia aprobada").length}</strong>
              <p style={{ margin: "4px 0 0", color: "#166534", fontSize: "13px" }}>Aprobadas</p>
            </div>
          </div>

          {misSolicitudes.length > 0 && (
            <div style={{ marginTop: "24px" }}>
              <h3 style={{ color: "#0f172a", marginBottom: "12px" }}>Últimas solicitudes</h3>
              {misSolicitudes.slice(0, 3).map((s) => (
                <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", background: "#f8fafc", borderRadius: "12px", marginBottom: "8px", border: "1px solid #e2e8f0" }}>
                  <div>
                    <strong style={{ color: "#0f172a", fontSize: "14px" }}>{s.id}</strong>
                    <p style={{ margin: "2px 0 0", color: "#64748b", fontSize: "13px" }}>{s.nombreNegocio} - {s.tipoTramite}</p>
                  </div>
                  <span className={`badge ${badgeClase(obtenerEstadoVisible(s))}`}>{obtenerEstadoVisible(s)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {seccion === "mis-solicitudes" && (
        <section className="section-card section-card-modern">
          <div className="section-header">
            <div>
              <h2>Mis solicitudes</h2>
              <p>Consulta el estado de tus expedientes enviados.</p>
            </div>
            <button type="button" className="btn-outline" onClick={cargarMisSolicitudes}>Actualizar</button>
          </div>

          {misSolicitudes.length === 0 ? (
            <div className="empty-state empty-state-modern">
              <div style={{ width: "80px", height: "80px", borderRadius: "50%", background: "linear-gradient(135deg, #eff6ff, #dbeafe)", display: "grid", placeItems: "center", margin: "0 auto 16px", fontSize: "36px" }}>&#128196;</div>
              <h3>Aún no has enviado solicitudes</h3>
              <p>Cuando registres una solicitud de licencia, aparecerá aquí.</p>
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
                    <span className={`badge ${badgeClase(obtenerEstadoVisible(s))}`}>{obtenerEstadoVisible(s)}</span>
                  </div>
                  <div className="solicitud-card-body">
                    <p><strong>RUC:</strong> {s.ruc}</p>
                    <p><strong>Negocio:</strong> {s.nombreNegocio}</p>
                    <p><strong>Trámite:</strong> {s.tipoTramite || "Nueva licencia"}</p>
                    <p><strong>Fecha:</strong> {s.fecha}</p>
                    <p><strong>Pago:</strong> {s.estadoPago}</p>
                    <p><strong>Inspección:</strong> {s.inspeccion || "Sin inspección"}</p>
                  </div>

                  <Timeline solicitud={s} />

                  {s.archivosPdf?.length > 0 && (
                    <div className="solicitud-card-actions">
                      {s.archivosPdf.map((pdf, index) => (
                        <a key={index} href={pdf.archivoUrl} target="_blank" rel="noreferrer">PDF {index + 1}</a>
                      ))}
                    </div>
                  )}

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
                          <button type="button" className="btn-ok" onClick={() => descargarLicencia(s)}>Descargar licencia</button>
                        )}
                        <button type="button" className="btn-secundario" onClick={() => renovarLicencia(s)}>Renovar</button>
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

      {seccion === "notificaciones" && (
        <section className="section-card section-card-modern">
          <div className="section-header">
            <div>
              <h2>Mis notificaciones</h2>
              <p>Actualizaciones sobre tus solicitudes de licencia.</p>
            </div>
          </div>

          {(() => {
            const todasLasNotis = [];
            misSolicitudes.forEach((s) => {
              if (s.notificaciones) {
                s.notificaciones.forEach((n) => {
                  todasLasNotis.push({ ...n, solicitudId: s.id, nombreNegocio: s.nombreNegocio, estado: s.estado });
                });
              }
            });
            todasLasNotis.sort((a, b) => b.fecha?.localeCompare(a.fecha) || 0);

            if (todasLasNotis.length === 0) {
              return (
                <div className="empty-state">
                  <div style={{ fontSize: "36px", marginBottom: "10px" }}>&#128276;</div>
                  <h3>No tienes notificaciones</h3>
                  <p>Cuando haya novedades en tus solicitudes, aparecerán aquí.</p>
                </div>
              );
            }

            return (
              <div>
                {todasLasNotis.map((n, i) => (
                  <div key={i} style={{ padding: "16px", border: `1px solid ${n.leida ? "#e2e8f0" : "#bfdbfe"}`, borderRadius: "14px", marginBottom: "10px", background: n.leida ? "#f8fafc" : "#eff6ff" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <strong style={{ color: "#1f3b57", fontSize: "15px" }}>{n.titulo}</strong>
                        <p style={{ margin: "4px 0 0", fontSize: "14px", color: "#475569" }}>{n.mensaje}</p>
                        <small style={{ color: "#94a3b8" }}>{n.fecha} | Expediente: {n.solicitudId}</small>
                      </div>
                      {!n.leida && <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#2563eb", flexShrink: 0, marginTop: "6px" }} />}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </section>
      )}

      {seccion === "nueva-solicitud" && (
        <>
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
                  <div className="block-title"><span>1</span><div><h3>Tipo de trámite</h3><p>Selecciona si registraras una licencia nueva o una renovación.</p></div></div>
                  <select name="tipoTramite" value={form.tipoTramite} onChange={manejarCambio}>
                    <option value="Nueva licencia">Nueva licencia</option>
                    <option value="Renovación anual">Renovación anual</option>
                  </select>
                </div>

                <div className="form-block">
                  <div className="block-title"><span>2</span><div><h3>Validar RUC</h3><p>Busca el RUC para completar automáticamente los datos SUNAT.</p></div></div>
                  <div className="ruc-row ruc-row-modern">
                    <input type="text" name="ruc" placeholder="Ingrese RUC de 11 digitos" value={form.ruc} onChange={manejarCambio} maxLength="11" />
                    <button type="button" onClick={buscarRuc} disabled={buscando}>{buscando ? "Buscando..." : "Consultar SUNAT"}</button>
                  </div>
                  {errorRuc && <p className="error">{errorRuc}</p>}
                  {rucValidado && <p className="success">RUC validado correctamente.</p>}
                </div>

                <div className="form-block">
                  <div className="block-title"><span>3</span><div><h3>Datos del negocio</h3><p>Verifica que la información obtenida sea correcta.</p></div></div>
                  <div className="form-grid">
                    <input type="text" name="nombreNegocio" placeholder="Nombre del negocio" value={form.nombreNegocio} onChange={manejarCambio} />
                    <input type="text" name="razonSocial" placeholder="Razón social" value={form.razonSocial} onChange={manejarCambio} />
                    <input type="text" name="direccion" placeholder="Dirección del local" value={form.direccion} onChange={manejarCambio} />
                    <input type="text" name="giro" placeholder="Giro comercial" value={form.giro} onChange={manejarCambio} />
                  </div>
                  <div className="sunat-info sunat-info-modern">
                    <span>Estado SUNAT: <strong>{form.estadoSunat || "Pendiente"}</strong></span>
                    <span>Condición: <strong>{form.condicionSunat || "Pendiente"}</strong></span>
                  </div>
                </div>

                <div className="form-block">
                  <div className="block-title"><span>4</span><div><h3>Documentos PDF</h3><p>Sube los archivos del trámite. Puedes arrastrarlos aquí.</p></div></div>
                  <div className="drop-zone drop-zone-modern" onDrop={manejarDrop} onDragOver={(e) => e.preventDefault()}>
                    <div className="empty-icon">&#128206;</div>
                    <p>Subir documentos del trámite en PDF</p>
                    <span>Máximo 5 PDFs. Arrastra tus archivos o seleccionalos.</span>
                    <label className="file-label">Elegir PDFs<input type="file" accept=".pdf" multiple onChange={manejarArchivos} hidden /></label>
                    {archivos.length > 0 && (
                      <div className="archivo-box">
                        {archivos.map((file, index) => (
                          <div key={index} className="archivo-item">
                            <p className="archivo-seleccionado">PDF {index + 1}: {file.name}</p>
                            <button type="button" className="btn-quitar" onClick={() => quitarArchivo(index)}>Quitar</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <button type="button" className="btn-pago btn-full" onClick={continuarPago}>Continuar al pago</button>
              </div>
            </section>
          )}

          {paso === "pago" && (
            <section className="section-card section-card-modern">
              <div className="section-header">
                <div>
                  <h2>Pago del trámite</h2>
                  <p>Elige una opcion de pago para continuar con tu solicitud municipal.</p>
                </div>
              </div>

              <div className="payment-layout">
                <aside className="resumen-pago resumen-pago-modern">
                  <h3>Resumen del trámite</h3>
                  <p><strong>Tipo de trámite:</strong> {form.tipoTramite}</p>
                  <p><strong>RUC:</strong> {form.ruc}</p>
                  <p><strong>Razón social:</strong> {form.razonSocial}</p>
                  <p><strong>Documentos PDF:</strong> {archivos.length}</p>
                  <div className="monto-box"><span>Total a pagar</span><strong>S/{MONTO_TRAMITE.toFixed(2)}</strong></div>
                  <span className={`badge ${estadoPago === "Confirmado" ? "ok" : "warning"}`}>{estadoPago}</span>
                  {detallePago?.id && <p className="text-muted"><strong>Operación:</strong> {detallePago.id}</p>}
                </aside>

                <div className="detalle-pago detalle-pago-modern">
                  {estadoPago !== "Confirmado" ? (
                    <div className="voucher-box" style={{ padding: "28px", borderRadius: "18px", border: "1px solid #dbeafe", background: "linear-gradient(135deg, #ffffff 0%, #f8fbff 55%, #ecfdf5 100%)", boxShadow: "0 14px 35px rgba(15, 23, 42, 0.08)" }}>
                      <div style={{ marginBottom: "22px" }}>
                        <span style={{ display: "inline-block", padding: "7px 12px", borderRadius: "999px", background: "#e0f2fe", color: "#075985", fontWeight: "700", fontSize: "13px", marginBottom: "12px" }}>Pago del expediente</span>
                        <h3 style={{ margin: "0 0 8px", color: "#0f172a" }}>Selecciona como deseas pagar</h3>
                        <p style={{ margin: 0, color: "#475569", lineHeight: "1.6" }}>Puedes intentar el pago TEST oficial con Mercado Pago o usar el modo demo municipal.</p>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "18px" }}>
                        <div style={{ border: "1px solid #bbf7d0", background: "#f0fdf4", borderRadius: "16px", padding: "20px" }}>
                          <div style={{ fontSize: "28px", marginBottom: "8px" }}>&#128179;</div>
                          <h4 style={{ margin: "0 0 8px", color: "#14532d" }}>Pago TEST con Mercado Pago</h4>
                          <p style={{ color: "#475569", lineHeight: "1.55" }}>Abre Checkout Pro oficial en ambiente de prueba.</p>
                          <button type="button" className="btn-pago btn-full" onClick={iniciarPagoMercadoPago} disabled={procesandoPago}>{procesandoPago ? "Generando enlace..." : "Pagar con Mercado Pago TEST"}</button>
                        </div>
                        <div style={{ border: "1px solid #fed7aa", background: "#fff7ed", borderRadius: "16px", padding: "20px" }}>
                          <div style={{ fontSize: "28px", marginBottom: "8px" }}>&#129534;</div>
                          <h4 style={{ margin: "0 0 8px", color: "#7c2d12" }}>Pago demo municipal</h4>
                          <p style={{ color: "#475569", lineHeight: "1.55" }}>Registra un comprobante demo para continuar el circuito.</p>
                          <button type="button" className="btn-secundario btn-full" onClick={iniciarPagoDemo} disabled={procesandoPago}>{procesandoPago ? "Registrando..." : "Confirmar pago demo"}</button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="voucher-box success-voucher">
                      <h3>Pago registrado</h3>
                      <p>El comprobante quedó asociado a esta solicitud.</p>
                      {detallePago?.id && <p><strong>Código de operación:</strong> {detallePago.id}</p>}
                      <p><strong>Método:</strong> {metodoPago}</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="acciones-pago acciones-pago-modern">
                <button type="button" onClick={() => setPaso("solicitud")}>Volver</button>
                <button type="button" className="btn-pago" onClick={enviarSolicitud} disabled={guardando || estadoPago !== "Confirmado"}>{guardando ? "Guardando solicitud..." : "Enviar solicitud"}</button>
              </div>
            </section>
          )}

          {paso === "confirmacion" && (
            <section className="section-card section-card-modern confirmacion" style={{ textAlign: "center", padding: "50px 28px" }}>
              <div className="success-circle" style={{ width: "80px", height: "80px", margin: "0 auto 20px", fontSize: "40px", boxShadow: "0 8px 30px rgba(22, 163, 74, 0.25)" }}>&#10003;</div>
              <h2 style={{ fontSize: "28px", marginBottom: "8px" }}>Solicitud registrada</h2>
              <p style={{ color: "#64748b", fontSize: "16px", maxWidth: "500px", margin: "0 auto 24px" }}>Tu solicitud fue enviada correctamente y los PDFs quedaron guardados.</p>
              <div className="resumen-pago resumen-pago-modern">
                <p><strong>Número de expediente:</strong> {expediente}</p>
                <p><strong>Tipo de trámite:</strong> {form.tipoTramite}</p>
                <p><strong>Estado:</strong> En revisión municipal</p>
                <p><strong>Pago:</strong> {estadoPago}</p>
                <p><strong>Monto:</strong> S/{MONTO_TRAMITE.toFixed(2)}</p>
              </div>
              <button type="button" className="btn-pago" onClick={() => setPaso("misSolicitudes")}>Ver mis solicitudes</button>
            </section>
          )}
        </>
      )}

      {seccion === "mi-cuenta" && (
        <section className="section-card section-card-modern">
          <div className="section-header">
            <div>
              <h2>Mi cuenta</h2>
              <p>Información de tu perfil registrado.</p>
            </div>
          </div>
          <div style={{ display: "grid", gap: "12px", maxWidth: "500px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "14px 16px", background: "#f8fafc", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
              <span style={{ color: "#64748b", fontSize: "14px" }}>Nombre</span>
              <strong style={{ color: "#0f172a", fontSize: "14px" }}>{usuario.nombre}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "14px 16px", background: "#f8fafc", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
              <span style={{ color: "#64748b", fontSize: "14px" }}>Correo</span>
              <strong style={{ color: "#0f172a", fontSize: "14px" }}>{usuario.correo}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "14px 16px", background: "#f8fafc", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
              <span style={{ color: "#64748b", fontSize: "14px" }}>DNI</span>
              <strong style={{ color: "#0f172a", fontSize: "14px" }}>{usuario.dni || "No registrado"}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "14px 16px", background: "#f8fafc", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
              <span style={{ color: "#64748b", fontSize: "14px" }}>Teléfono</span>
              <strong style={{ color: "#0f172a", fontSize: "14px" }}>{usuario.telefono || "No registrado"}</strong>
            </div>
            <div style={{ padding: "14px 16px", background: "#f8fafc", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
              <span style={{ color: "#64748b", fontSize: "14px", display: "block", marginBottom: "8px" }}>Mis Negocios Registrados</span>
              {negocios.length === 0 ? (
                <span style={{ fontSize: "14px", color: "#64748b" }}>Ningún negocio registrado aún.</span>
              ) : (
                <div style={{ display: "grid", gap: "8px" }}>
                  {negocios.map((neg, idx) => (
                    <div key={idx} style={{ display: "flex", justifyContent: "space-between", borderTop: idx > 0 ? "1px solid #e2e8f0" : "none", paddingTop: idx > 0 ? "8px" : "0" }}>
                      <span style={{ fontSize: "13px", color: "#0f172a", fontWeight: 600 }}>{neg.razonSocial || neg.nombreNegocio}</span>
                      <span style={{ fontSize: "13px", color: "#64748b" }}>RUC: {neg.ruc}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "14px 16px", background: "#f8fafc", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
              <span style={{ color: "#64748b", fontSize: "14px" }}>Rol</span>
              <strong style={{ color: "#0f172a", fontSize: "14px" }}>Solicitante</strong>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

export default PanelNegocio;
