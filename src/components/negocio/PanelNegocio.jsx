import { useEffect, useState } from "react";
import { initMercadoPago } from "@mercadopago/sdk-react";
import { consultarRuc } from "../../services/rucService";
import { procesarPagoTarjeta } from "../../services/pagoService";
import {
  guardarSolicitud,
  obtenerSolicitudes,
} from "../../services/solicitudService";
import { convertirPdfABase64 } from "../../services/pdfService";
import { useAuth } from "../../context/AuthContext";

import SolicitudForm from "./SolicitudForm";
import PagoTarjeta from "./PagoTarjeta";
import VoucherPago from "./VoucherPago";
import TablaMisSolicitudes from "./TablaMisSolicitudes";

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
        (s) =>
          s.correoUsuario === usuario?.correo || s.uidUsuario === usuario?.uid
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
    console.log("DATOS PAGO MERCADO PAGO:", datosPago);

    try {
      setProcesandoPago(true);

      const payerEmail =
        datosPago?.payer?.email || "test_user_123456@testuser.com";

      const data = await procesarPagoTarjeta({
        token: datosPago.token,
        issuerId: datosPago.issuer_id || datosPago.issuerId,
        paymentMethodId:
          datosPago.payment_method_id || datosPago.paymentMethodId,
        transactionAmount: Number(MONTO_TRAMITE),
        installments: Number(datosPago.installments) || 1,
        description: `Licencia municipal de funcionamiento - RUC ${form.ruc}`,

        payer: {
          email: payerEmail,
          identification: {
            type: "DNI",
            number: "123456789",
          },
        },

        ruc: form.ruc,
        razonSocial: form.razonSocial,
      });

      console.log("RESPUESTA PAGO:", data);

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
      console.error("ERROR PROCESANDO PAGO:", error);
      alert(error?.message || "No se pudo procesar el pago.");
      throw error;
    } finally {
      setProcesandoPago(false);
    }
  };

  const marcarPagoDemo = () => {
    setMetodoPago("Pago demo");
    setEstadoPago("Confirmado");
    setDetallePago({
      status: "approved",
      metodo: "demo",
      transaction_amount: MONTO_TRAMITE,
    });

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
            ? `Pago confirmado mediante ${metodoPago} por S/${MONTO_TRAMITE}`
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
        montoPago: MONTO_TRAMITE,
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

  return (
    <div className="panel panel-negocio">
      <div className="panel-hero">
        <div>
          <span className="eyebrow">Portal del solicitante</span>
          <h1>Licencia de funcionamiento</h1>
          <p>
            Registra tu solicitud, realiza el pago y consulta el avance de tu
            expediente.
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
        <TablaMisSolicitudes
          misSolicitudes={misSolicitudes}
          cargarMisSolicitudes={cargarMisSolicitudes}
          nuevaSolicitud={nuevaSolicitud}
          renovarLicencia={renovarLicencia}
        />
      )}

      {paso === "solicitud" && (
        <SolicitudForm
          form={form}
          archivos={archivos}
          buscando={buscando}
          errorRuc={errorRuc}
          rucValidado={rucValidado}
          manejarCambio={manejarCambio}
          buscarRuc={buscarRuc}
          manejarArchivos={manejarArchivos}
          manejarDrop={manejarDrop}
          quitarArchivo={quitarArchivo}
          continuarPago={continuarPago}
        />
      )}

      {paso === "pago" && (
        <PagoTarjeta
          MP_PUBLIC_KEY={MP_PUBLIC_KEY}
          MONTO_TRAMITE={MONTO_TRAMITE}
          form={form}
          archivos={archivos}
          estadoPago={estadoPago}
          detallePago={detallePago}
          guardando={guardando || procesandoPago}
          procesarPagoIntegrado={procesarPagoIntegrado}
          marcarPagoDemo={marcarPagoDemo}
          enviarSolicitud={enviarSolicitud}
          volverSolicitud={() => setPaso("solicitud")}
        />
      )}

      {paso === "confirmacion" && (
        <VoucherPago
          expediente={expediente}
          form={form}
          estadoPago={estadoPago}
          MONTO_TRAMITE={MONTO_TRAMITE}
          verMisSolicitudes={() => setPaso("misSolicitudes")}
        />
      )}
    </div>
  );
}

export default PanelNegocio;