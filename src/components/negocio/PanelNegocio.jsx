import { useEffect, useState } from "react";
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
    try {
      setProcesandoPago(true);

      const data = await procesarPagoTarjeta({
        token: datosPago.token,
        issuerId: datosPago.issuer_id || datosPago.issuerId,
        paymentMethodId:
          datosPago.payment_method_id || datosPago.paymentMethodId,
        transactionAmount: Number(MONTO_TRAMITE),
        installments: Number(datosPago.installments) || 1,

        payer: {
          email:
            datosPago?.payer?.email || "test_user_650000@testuser.com",

          identification: {
            type: "DNI",
            number: "12345678",
          },
        },

        ruc: form.ruc,
        razonSocial: form.razonSocial,
      });

      setDetallePago(data);

      if (data.status === "approved") {
        setMetodoPago("Mercado Pago - Tarjeta");
        setEstadoPago("Confirmado");
        alert("Pago aprobado correctamente.");
        return;
      }

      alert("El pago no fue aprobado.");
    } catch (error) {
      console.error(error);
      alert("No se pudo procesar el pago.");
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
    });

    alert("Pago demo confirmado.");
  };

  const enviarSolicitud = async () => {
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
        metodoPago,
        estadoPago,
        estado: "En revisión",
      });

      setExpediente(nueva.id);
      await cargarMisSolicitudes();
      setPaso("confirmacion");
    } catch (error) {
      console.error(error);
      alert("No se pudo guardar la solicitud.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="panel panel-negocio">
      {paso === "misSolicitudes" && (
        <TablaMisSolicitudes
          misSolicitudes={misSolicitudes}
          nuevaSolicitud={() => setPaso("solicitud")}
          renovarLicencia={() => setPaso("solicitud")}
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