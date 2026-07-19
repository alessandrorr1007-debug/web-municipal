import { useEffect, useState } from "react";
import { consultarRuc } from "../services/rucService";
import { consultarDni } from "../services/dniService";
import { crearPreferenciaPago } from "../services/pagoService";
import {
  guardarSolicitud,
  obtenerSolicitudes,
  obtenerNegociosPorUsuario,
} from "../services/solicitudService";
import {
  generarComprobante,
  obtenerComprobantesPorUsuario,
  descargarComprobante,
  enviarComprobantePorCorreo,
  imprimirComprobante,
  generarPdfComprobante,
} from "../services/comprobanteService";
import { abrirPdf, convertirPdfABase64 } from "../services/pdfService";
import { crearNotificacion } from "../services/notificacionService";
import { determinarActividad, ACTIVIDADES_CONFIG } from "../config/documentosConfig";
import { useAuth } from "../context/AuthContext";
import {
  enviarOtpTelefono,
  verificarOtpTelefono,
  confirmarVerificacionTelefono,
  actualizarPreferenciasNotificaciones,
  enviarOtpCorreoActual,
  verificarOtpCorreoActual,
  enviarOtpCorreoNuevo,
  verificarOtpCorreoNuevo,
  actualizarCorreoDeUsuario,
  restablecerContrasenaPorEmail
} from "../services/authService";
import Timeline from "./Timeline";
import { collection, query, where, getDocs, onSnapshot, updateDoc, doc } from "firebase/firestore";
import { db } from "../firebase";

function PanelNegocio({ seccion }) {
  const { usuario } = useAuth();
  const MONTO_TRAMITE = 3;

  // SMS Notification Verification states
  const [cargandoSms, setCargandoSms] = useState(false);
  const [pasoVerificarTelefono, setPasoVerificarTelefono] = useState(false);
  const [codigoSms, setCodigoSms] = useState("");
  const [errorSms, setErrorSms] = useState("");
  const [successSms, setSuccessSms] = useState("");
  const [tiempoRestanteSms, setTiempoRestanteSms] = useState(0);
  const [modalComprobante, setModalComprobante] = useState(null);
  const [comprobantePdfUrl, setComprobantePdfUrl] = useState("");
  const [notificaciones, setNotificaciones] = useState([]);
  const [cargandoNotificaciones, setCargandoNotificaciones] = useState(false);

  useEffect(() => {
    if (!usuario) return;
    setCargandoNotificaciones(true);
    const q = query(
      collection(db, "notificaciones"),
      where("uid_usuario", "==", usuario.uid)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data()
      }));
      items.sort((a, b) => (b.fecha_hora || "").localeCompare(a.fecha_hora || ""));
      setNotificaciones(items);
      setCargandoNotificaciones(false);
    }, (err) => {
      console.error("Error loading notifications:", err);
      setCargandoNotificaciones(false);
    });
    return () => unsubscribe();
  }, [usuario]);

  const [telefonoInput, setTelefonoInput] = useState(usuario?.telefono || "");
  const [editandoTelefono, setEditandoTelefono] = useState(!usuario?.telefono_verificado);
  const [intentosCount, setIntentosCount] = useState(0);
  const [reenviosCount, setReenviosCount] = useState(0);

  useEffect(() => {
    if (usuario) {
      if (usuario.telefono) {
        setTelefonoInput(usuario.telefono);
      }
      setEditandoTelefono(!usuario.telefono_verificado);
    }
  }, [usuario]);

  useEffect(() => {
    let activeUrl = "";
    if (modalComprobante) {
      (async () => {
        try {
          const docPdf = await generarPdfComprobante(modalComprobante);
          const blob = docPdf.output("blob");
          const url = URL.createObjectURL(blob);
          activeUrl = url;
          setComprobantePdfUrl(url);
        } catch (err) {
          console.error("Error al generar vista previa del comprobante:", err);
        }
      })();
    } else {
      setComprobantePdfUrl("");
    }
    return () => {
      if (activeUrl) {
        URL.revokeObjectURL(activeUrl);
      }
    };
  }, [modalComprobante]);

  // Email Change states
  const [modalCambiarCorreo, setModalCambiarCorreo] = useState(false);
  const [pasoCambioCorreo, setPasoCambioCorreo] = useState(1);
  const [nuevoCorreo, setNuevoCorreo] = useState("");
  const [codigoCorreoActual, setCodigoCorreoActual] = useState("");
  const [codigoCorreoNuevo, setCodigoCorreoNuevo] = useState("");
  const [cargandoCambioCorreo, setCargandoCambioCorreo] = useState(false);
  const [errorCambioCorreo, setErrorCambioCorreo] = useState("");
  const [successCambioCorreo, setSuccessCambioCorreo] = useState("");

  const manejarEnviarOtpActual = async (e) => {
    e.preventDefault();
    if (!nuevoCorreo) {
      setErrorCambioCorreo("Ingrese el nuevo correo electrónico.");
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(nuevoCorreo)) {
      setErrorCambioCorreo("Ingrese un correo electrónico válido.");
      return;
    }
    if (nuevoCorreo.toLowerCase() === usuario.correo.toLowerCase()) {
      setErrorCambioCorreo("El nuevo correo debe ser diferente al actual.");
      return;
    }
    
    setErrorCambioCorreo("");
    setSuccessCambioCorreo("");
    setCargandoCambioCorreo(true);
    try {
      const qUser = query(collection(db, "usuarios"), where("correo", "==", nuevoCorreo.trim().toLowerCase()));
      const snapUser = await getDocs(qUser);
      if (!snapUser.empty) {
        throw new Error("No es posible utilizar este correo porque ya pertenece a otra cuenta.");
      }

      await enviarOtpCorreoActual(usuario.correo);
      setPasoCambioCorreo(2);
      setSuccessCambioCorreo("Código de verificación enviado a tu correo actual.");
    } catch (err) {
      setErrorCambioCorreo(err.message || "Error al enviar el código de verificación.");
    } finally {
      setCargandoCambioCorreo(false);
    }
  };

  const manejarVerificarOtpActual = async (e) => {
    e.preventDefault();
    if (!codigoCorreoActual || codigoCorreoActual.length !== 6) {
      setErrorCambioCorreo("Ingresa el código de 6 dígitos.");
      return;
    }
    setErrorCambioCorreo("");
    setSuccessCambioCorreo("");
    setCargandoCambioCorreo(true);
    try {
      await verificarOtpCorreoActual(usuario.correo, codigoCorreoActual);
      await enviarOtpCorreoNuevo(usuario.correo, nuevoCorreo.trim().toLowerCase());
      setPasoCambioCorreo(3);
      setSuccessCambioCorreo("Código de confirmación enviado a tu nuevo correo.");
    } catch (err) {
      setErrorCambioCorreo(err.message || "Código incorrecto o inválido.");
    } finally {
      setCargandoCambioCorreo(false);
    }
  };

  const manejarVerificarOtpNuevo = async (e) => {
    e.preventDefault();
    if (!codigoCorreoNuevo || codigoCorreoNuevo.length !== 6) {
      setErrorCambioCorreo("Ingresa el código de 6 dígitos.");
      return;
    }
    setErrorCambioCorreo("");
    setSuccessCambioCorreo("");
    setCargandoCambioCorreo(true);
    try {
      await verificarOtpCorreoNuevo(usuario.correo, nuevoCorreo.trim().toLowerCase(), codigoCorreoNuevo);
      await actualizarCorreoDeUsuario(usuario.uid, nuevoCorreo.trim().toLowerCase());
      
      setSuccessCambioCorreo("Correo electrónico actualizado correctamente.");
      setTimeout(() => {
        setModalCambiarCorreo(false);
        setPasoCambioCorreo(1);
        setNuevoCorreo("");
        setCodigoCorreoActual("");
        setCodigoCorreoNuevo("");
        setErrorCambioCorreo("");
        setSuccessCambioCorreo("");
      }, 3000);
    } catch (err) {
      setErrorCambioCorreo(err.message || "Código incorrecto o inválido.");
    } finally {
      setCargandoCambioCorreo(false);
    }
  };

  const [cargandoCambioPassword, setCargandoCambioPassword] = useState(false);
  const [successPasswordReset, setSuccessPasswordReset] = useState("");
  const [errorPasswordReset, setErrorPasswordReset] = useState("");

  const manejarCambiarPassword = async () => {
    setErrorPasswordReset("");
    setSuccessPasswordReset("");
    setCargandoCambioPassword(true);
    try {
      await restablecerContrasenaPorEmail(usuario.correo);
      setSuccessPasswordReset("Se ha enviado un enlace para restablecer tu contraseña a tu correo electrónico.");
    } catch (err) {
      setErrorPasswordReset(err.message || "No se pudo enviar el correo de restablecimiento.");
    } finally {
      setCargandoCambioPassword(false);
    }
  };

  useEffect(() => {
    if (tiempoRestanteSms <= 0) return;
    const timer = setTimeout(() => {
      setTiempoRestanteSms((t) => t - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [tiempoRestanteSms]);

  const manejarEnviarOtpSms = async () => {
    const cleanedPhone = telefonoInput.replace(/\s+/g, "");
    const match = cleanedPhone.match(/^(?:\+51)?(9\d{8})$/);
    if (!match) {
      setErrorSms("Número telefónico inválido. Debe ser de Perú (+51 o 9XXXXXXXX).");
      return;
    }
    const telefonoVerdadero = match[1];

    setErrorSms("");
    setSuccessSms("");
    setCargandoSms(true);

    try {
      const q = query(collection(db, "usuarios"), where("telefono", "==", telefonoVerdadero));
      const snap = await getDocs(q);
      const isRegisteredOther = snap.docs.some(docSnap => docSnap.id !== usuario.uid);
      if (isRegisteredOther) {
        setErrorSms("Este número telefónico ya está registrado en otra cuenta.");
        setCargandoSms(false);
        return;
      }

      if (reenviosCount >= 3) {
        setErrorSms("Límite de reenvíos alcanzado (Máx 3).");
        setCargandoSms(false);
        return;
      }

      await enviarOtpTelefono(telefonoVerdadero);
      setReenviosCount(prev => prev + 1);
      setPasoVerificarTelefono(true);
      setTiempoRestanteSms(60);
      setIntentosCount(0);
      setSuccessSms("Se ha enviado un código de verificación de 6 dígitos a tu teléfono.");
    } catch (err) {
      setErrorSms(err.message || "No se pudo enviar el código SMS.");
    } finally {
      setCargandoSms(false);
    }
  };

  const manejarVerificarOtpSms = async (e) => {
    e.preventDefault();
    if (!codigoSms || codigoSms.length !== 6) {
      setErrorSms("Ingresa el código de 6 dígitos.");
      return;
    }

    const cleanedPhone = telefonoInput.replace(/\s+/g, "");
    const match = cleanedPhone.match(/^(?:\+51)?(9\d{8})$/);
    if (!match) {
      setErrorSms("Número telefónico inválido.");
      return;
    }
    const telefonoVerdadero = match[1];

    setErrorSms("");
    setSuccessSms("");
    setCargandoSms(true);

    const nextIntentos = intentosCount + 1;
    setIntentosCount(nextIntentos);
    if (nextIntentos > 5) {
      setErrorSms("Has alcanzado el límite máximo de 5 intentos. Solicite un nuevo código.");
      setCargandoSms(false);
      return;
    }

    try {
      await verificarOtpTelefono(telefonoVerdadero, codigoSms);
      
      const userRef = doc(db, "usuarios", usuario.uid);
      await updateDoc(userRef, {
        telefono: telefonoVerdadero,
        telefono_verificado: true,
        fecha_verificacion: new Date().toISOString(),
        sms_habilitado: true,
      });

      setSuccessSms("Tu número telefónico ha sido verificado correctamente.");
      setPasoVerificarTelefono(false);
      setEditandoTelefono(false);
      setCodigoSms("");
      setReenviosCount(0);
      setIntentosCount(0);
    } catch (err) {
      setErrorSms(err.message || "El código ingresado es incorrecto.");
    } finally {
      setCargandoSms(false);
    }
  };

  const manejarCambiarPreferencias = async (tipo, valor) => {
    try {
      const nuevoRecibirCorreos = tipo === "email" ? valor : (usuario.recibir_correos !== false);
      const nuevoSmsHabilitado = tipo === "sms" ? valor : (usuario.sms_habilitado && usuario.telefono_verificado);
      await actualizarPreferenciasNotificaciones(usuario.uid, nuevoRecibirCorreos, nuevoSmsHabilitado);
    } catch (err) {
      alert("Error al guardar la preferencia: " + err.message);
    }
  };

  // Las funciones locales de descarga e impresión han sido reemplazadas por las utilidades importadas del servicio

  const [archivos, setArchivos] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [errorRuc, setErrorRuc] = useState("");
  const [successRuc, setSuccessRuc] = useState("");
  const [rucValidado, setRucValidado] = useState(false);
  
  // Estados para validación de DNI del Solicitante
  const [dniValidado, setDniValidado] = useState(false);
  const [dniSolicitante, setDniSolicitante] = useState("");
  const [nombresSolicitante, setNombresSolicitante] = useState("");
  const [apellidosSolicitante, setApellidosSolicitante] = useState("");
  const [fechaNacimientoSolicitante, setFechaNacimientoSolicitante] = useState("");
  const [errorDni, setErrorDni] = useState("");
  const [successDni, setSuccessDni] = useState("");
  const [buscandoDni, setBuscandoDni] = useState(false);

  // Estados para documentos específicos
  const [docIdentidad, setDocIdentidad] = useState(null);
  const [docFichaRuc, setDocFichaRuc] = useState(null);
  const [docAcreditaLocal, setDocAcreditaLocal] = useState(null);
  const [tipoPropiedadLocal, setTipoPropiedadLocal] = useState("Contrato de alquiler");
  const [docPlano, setDocPlano] = useState(null);
  const [docDj, setDocDj] = useState(null);
  const [docSanitario, setDocSanitario] = useState(null);
  const [docDigemid, setDocDigemid] = useState(null);
  const [docRepresentacion, setDocRepresentacion] = useState(null);
  const [docRepresentacionLegal, setDocRepresentacionLegal] = useState(null);
  const [relacionSolicitante, setRelacionSolicitante] = useState("Dueño");

  // Paso del wizard de nueva solicitud (1=DNI, 2=RUC, 3=Tipo, 4=Documentos)
  const [wizardPaso, setWizardPaso] = useState(1);

  const [paso, setPaso] = useState("misSolicitudes");
  const [metodoPago, setMetodoPago] = useState("");
  const [estadoPago, setEstadoPago] = useState("Sin pago");
  const [expediente, setExpediente] = useState("");
  const [misSolicitudes, setMisSolicitudes] = useState([]);
  const [procesandoPago, setProcesandoPago] = useState(false);
  const [detallePago, setDetallePago] = useState(null);
  const [notificacionesPendientes, setNotificacionesPendientes] = useState(0);
  const [negocios, setNegocios] = useState([]);
  const [comprobantes, setComprobantes] = useState([]);
  const [cargandoComprobantes, setCargandoComprobantes] = useState(false);
  const [tipoComprobante, setTipoComprobante] = useState("");
  const [comprobanteGenerado, setComprobanteGenerado] = useState(null);
  const [enviandoCorreo, setEnviandoCorreo] = useState(false);

  const getDocumentStateMap = () => {
    return {
      identidad: { state: docIdentidad, setter: setDocIdentidad, label: "1. Documento de identidad del solicitante", hint: "DNI_Solicitante.pdf" },
      ruc: { state: docFichaRuc, setter: setDocFichaRuc, label: "2. Ficha RUC SUNAT", hint: "Ficha_RUC.pdf" },
      propiedad: { state: docAcreditaLocal, setter: setDocAcreditaLocal, label: "3. Documento que acredita propiedad o uso del local", hint: "Contrato_Local.pdf", isPropiedad: true },
      plano: { state: docPlano, setter: setDocPlano, label: "4. Plano de distribución del establecimiento", hint: "Plano_Establecimiento.pdf" },
      dj: { state: docDj, setter: setDocDj, label: "5. Declaración jurada de seguridad", hint: "Declaracion_Jurada.pdf" },
      sanitario: { state: docSanitario, setter: setDocSanitario, label: "6. Certificado sanitario de salubridad", hint: "Certificado_Sanitario.pdf" },
      autorizacion_sanitaria: { state: docDigemid, setter: setDocDigemid, label: "7. Autorización sanitaria del establecimiento", hint: "Autorizacion_Sanitaria.pdf" },
      responsable_tecnico: { state: docRepresentacion, setter: setDocRepresentacion, label: "8. Título/Colegiatura del Responsable Técnico", hint: "Responsable_Tecnico.pdf" },
      representacion: { state: docRepresentacionLegal, setter: setDocRepresentacionLegal, label: "9. Documento de representación legal", hint: "Representacion_Legal.pdf" }
    };
  };

  const [form, setForm] = useState({
    tipoTramite: "Nueva licencia",
    ruc: "",
    nombreNegocio: "",
    razonSocial: "",
    direccion: "",
    giro: "",
    estadoSunat: "",
    condicionSunat: "",
    departamento: "",
    provincia: "",
    distrito: "",
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

  const cargarComprobantes = async () => {
    try {
      setCargandoComprobantes(true);
      const lista = await obtenerComprobantesPorUsuario(usuario?.uid);
      setComprobantes(lista);
    } catch (error) {
      console.error("Error al cargar comprobantes:", error);
    } finally {
      setCargandoComprobantes(false);
    }
  };

  useEffect(() => {
    if (usuario && seccion === "mi-cuenta") {
      cargarNegocios();
    }
    if (usuario && seccion === "mis-comprobantes") {
      cargarComprobantes();
    }
  }, [usuario, seccion]);

  useEffect(() => {
    if (seccion === "nueva-solicitud") {
      nuevaSolicitud();
    } else if (seccion === "mis-solicitudes") {
      setPaso("misSolicitudes");
    }
  }, [seccion]);

  const buscarDni = async () => {
    setErrorDni("");
    setSuccessDni("");
    setDniValidado(false);
    setNombresSolicitante("");
    setApellidosSolicitante("");
    setFechaNacimientoSolicitante("");

    if (!/^\d{8}$/.test(dniSolicitante.trim())) {
      setErrorDni("El DNI debe tener exactamente 8 dígitos.");
      return;
    }

    try {
      setBuscandoDni(true);
      const data = await consultarDni(dniSolicitante.trim());
      setNombresSolicitante(data.nombres || "");
      const apellidos = [data.apellido_paterno, data.apellido_materno].filter(Boolean).join(" ");
      setApellidosSolicitante(apellidos);
      setFechaNacimientoSolicitante(data.fecha_nacimiento || "");
      setDniValidado(true);
      setSuccessDni("Identidad verificada correctamente.");
    } catch (error) {
      console.error(error);
      const msg = error.message || "";
      if (msg.includes("no encontrado") || msg.includes("404")) {
        setErrorDni("DNI no encontrado. Verifique el número ingresado.");
      } else {
        setErrorDni(msg || "Error al consultar el DNI. Intente nuevamente.");
      }
    } finally {
      setBuscandoDni(false);
    }
  };

  const manejarCambio = (e) => {
    let valor = e.target.value;

    if (e.target.name === "ruc") {
      valor = valor.replace(/\D/g, "");
    }

    setForm({ ...form, [e.target.name]: valor });

    if (e.target.name === "ruc") {
      setRucValidado(false);
      setErrorRuc("");
      setSuccessRuc("");
    }
  };

  const buscarRuc = async () => {
    setErrorRuc("");
    setSuccessRuc("");
    setRucValidado(false);

    if (form.ruc.trim().length !== 11) {
      setErrorRuc("El RUC debe tener 11 dígitos.");
      return;
    }

    try {
      setBuscando(true);

      // 1. Verificar si el RUC ya está registrado en Firebase/Firestore
      const qRuc = query(collection(db, "negocios"), where("ruc", "==", form.ruc.trim()));
      const snapRuc = await getDocs(qRuc);
      if (!snapRuc.empty) {
        setErrorRuc("Este RUC ya se encuentra registrado.");
        setRucValidado(false);
        return;
      }

      // 2. Consultar RUC en el backend (SUNAT/Decolecta)
      const data = await consultarRuc(form.ruc.trim());

      setForm((prev) => ({
        ...prev,
        razonSocial: data.nombreNegocio || data.razon_social || "",
        nombreNegocio: data.nombreComercial || data.nombreNegocio || data.nombre_comercial || data.razon_social || "",
        direccion: data.direccion || "",
        estadoSunat: data.estado || "",
        condicionSunat: data.condicion || "",
        departamento: data.departamento || "",
        provincia: data.provincia || "",
        distrito: data.distrito || "",
        giro: data.giroComercial || data.actividad_economica || "Actividad económica no especificada"
      }));

      if (data.esValido) {
        setRucValidado(true);
        setSuccessRuc("Contribuyente válido. Puede continuar con el registro de la solicitud.");
      } else {
        setErrorRuc(data.motivoRechazo || "El RUC no es válido para registrar una solicitud.");
      }
    } catch (error) {
      console.error(error);
      const msg = error.message || "";
      if (msg.includes("no encontrado") || msg.includes("registrado") || msg.includes("404")) {
        setErrorRuc("El RUC ingresado no se encuentra registrado en SUNAT.");
      } else {
        setErrorRuc(msg || "No se pudo consultar el RUC.");
      }
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

  const manejarArchivosAdicionales = (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    if (archivos.length + files.length > 2) {
      alert("Ya alcanzó el límite de documentos adicionales.");
      return;
    }

    const noPdf = files.find((file) => file.type !== "application/pdf");
    if (noPdf) {
      alert("Solo se permiten archivos PDF.");
      return;
    }

    const pesoExcedido = files.find((file) => file.size > 5 * 1024 * 1024);
    if (pesoExcedido) {
      alert(`El archivo ${pesoExcedido.name} supera el tamaño máximo de 5MB.`);
      return;
    }

    setArchivos((prev) => [...prev, ...files]);
    e.target.value = "";
  };

  const quitarArchivo = (index) => {
    setArchivos((prev) => prev.filter((_, i) => i !== index));
  };

  const continuarPago = () => {
    if (!dniValidado) {
      alert("Debe validar el DNI del solicitante.");
      return;
    }

    if (!rucValidado) {
      alert("Primero debe validar el RUC.");
      return;
    }

    const actividad = determinarActividad(form.giro);
    const baseDocs = ACTIVIDADES_CONFIG[actividad]?.documentos || ACTIVIDADES_CONFIG.default.documentos;
    const docsRequeridosKeys = [...baseDocs];
    if (form.ruc.startsWith("20") && !docsRequeridosKeys.includes("representacion")) {
      docsRequeridosKeys.push("representacion");
    }

    const stateMap = getDocumentStateMap();
    const faltanObligatorios = docsRequeridosKeys.some(key => !stateMap[key]?.state);
    if (faltanObligatorios) {
      alert("Debe subir todos los documentos obligatorios antes de continuar.");
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

  const iniciarPagoCaja = () => {
    setMetodoPago("Pago presencial en caja");
    setEstadoPago("Pendiente");
    setDetallePago({
      id: "PENDIENTE-CAJA",
      status: "pending",
      metodo: "caja_municipal",
    });
    alert("Opción de pago en caja seleccionada. Ya puedes enviar la solicitud.");
  };

  const enviarSolicitud = async () => {
    if (metodoPago !== "Pago presencial en caja" && estadoPago !== "Confirmado") {
      alert("Debe realizar y confirmar el pago antes de enviar la solicitud.");
      return;
    }

    const todosLosDocs = [
      docIdentidad, docFichaRuc, docAcreditaLocal, docPlano,
      docDj, docSanitario, docDigemid, docRepresentacion, docRepresentacionLegal, ...archivos,
    ].filter(Boolean);

    if (todosLosDocs.length === 0) {
      alert("Debe subir al menos un PDF antes de enviar la solicitud.");
      return;
    }

    const tipoContribuyente = form.ruc.startsWith("20") ? "Persona Jurídica" : "Persona Natural";

    const conTimeout = (promesa, ms, mensajeError) => {
      let timeoutId;
      const promesaTimeout = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(mensajeError)), ms);
      });
      return Promise.race([
        promesa.finally(() => clearTimeout(timeoutId)),
        promesaTimeout,
      ]);
    };

    try {
      setGuardando(true);
      console.log("[1] Pago confirmado");

      // 1. Subir documentos a Cloudinary uno por uno
      const pdfsSubidos = [];
      const erroresSubida = [];
      for (const archivo of todosLosDocs) {
        try {
          const resultado = await conTimeout(
            convertirPdfABase64(archivo),
            15000,
            `Tiempo de espera agotado al subir el archivo ${archivo.name}.`
          );
          pdfsSubidos.push(resultado);
        } catch (err) {
          console.error("[SOLICITUD] Error subiendo archivo:", archivo.name, err);
          erroresSubida.push(`${archivo.name}: ${err.message}`);
        }
      }

      if (pdfsSubidos.length === 0) {
        const errorMsg = erroresSubida.length > 0
          ? `No se pudo subir ningún archivo:\n${erroresSubida.join("\n")}`
          : "No se pudo subir ningún archivo. Verifique su conexión e intente nuevamente.";
        alert(errorMsg);
        setGuardando(false);
        return;
      }

      console.log("[2] Guardando solicitud");

      // 2. Guardar solicitud en Firestore
      const nueva = await conTimeout(
        guardarSolicitud({
          uidUsuario: usuario?.uid || "",
          correoUsuario: usuario?.correo || "",
          tipoTramite: form.tipoTramite,
          dniSolicitante, nombresSolicitante, apellidosSolicitante,
          ruc: form.ruc, nombreNegocio: form.nombreNegocio,
          razonSocial: form.razonSocial, direccion: form.direccion,
          giro: form.giro, estadoSunat: form.estadoSunat,
          condicionSunat: form.condicionSunat,
          departamento: form.departamento, provincia: form.provincia,
          distrito: form.distrito,
          tipoContribuyente, relacionSolicitante,
          archivosPdf: pdfsSubidos,
          archivoNombre: pdfsSubidos[0]?.archivoNombre || "Sin archivo",
          archivoUrl: pdfsSubidos[0]?.archivoUrl || "",
          metodoPago, estadoPago,
          comprobantePago:
            estadoPago === "Confirmado"
              ? `Pago confirmado mediante ${metodoPago}`
              : (metodoPago === "Pago presencial en caja" ? "Pendiente de pago en caja" : `Pago generado mediante ${metodoPago}`),
          estado: "Pendiente de revisión",
          inspeccion: "Sin inspección",
          recomendacionInspector: "", observacionInspector: "",
          evidenciasInspector: [], decisionFuncionario: "",
          observacionFuncionario: "", numeroLicencia: "",
          fechaAprobacion: "", fechaExpiracionLicencia: "",
          pagoId: detallePago?.id || "",
          pagoEstadoDetalle: detallePago?.status_detail || "",
        }),
        15000,
        "Tiempo de espera agotado al registrar la solicitud en Firebase."
      );

      console.log("[3] Solicitud guardada");
      console.log("[SOLICITUD] Guardada:", nueva.id);
      setExpediente(nueva.id);

      // Crear notificación de registro en la base de datos
      await crearNotificacion(usuario?.uid, {
        titulo: "Solicitud registrada",
        descripcion: `Su solicitud EXP-${nueva.id} de Licencia de Funcionamiento se ha registrado correctamente.`,
        icono: "📝",
      });

      let comp = null;
      if (estadoPago === "Confirmado") {
        const tipoFinal = tipoComprobante || (form.ruc.startsWith("20") ? "factura" : "boleta");
        comp = await generarComprobante({
          uidUsuario: usuario?.uid || "",
          correoUsuario: usuario?.correo || "",
          idSolicitud: nueva.id,
          tipo: tipoFinal,
          dniCliente: dniSolicitante,
          nombresCliente: nombresSolicitante,
          apellidosCliente: apellidosSolicitante,
          rucCliente: form.ruc,
          razonSocial: form.razonSocial,
          direccionCliente: form.direccion,
          descripcionPago: "Pago por derecho de trámite de licencia de funcionamiento",
          monto: MONTO_TRAMITE,
          metodoPago,
          estadoPago: "Pagado",
          codigoOperacion: (detallePago?.id || detallePago?.paymentId || `DEMO-${Date.now().toString().slice(-8)}`),
        }, (updatedComp) => {
          console.log("[COMPROBANTE] Subida completa en segundo plano:", updatedComp.url_pdf);
          setComprobanteGenerado({ ...updatedComp });
        });
        console.log("[9] Frontend recibió respuesta");
        setComprobanteGenerado(comp);
        console.log("[COMPROBANTE] Generado:", comp.codigo_unico);

        // Crear notificaciones de pago y comprobante en la base de datos
        await crearNotificacion(usuario?.uid, {
          titulo: "Pago confirmado",
          descripcion: `Se ha confirmado el pago de S/ ${MONTO_TRAMITE.toFixed(2)} para la solicitud EXP-${nueva.id}.`,
          icono: "💳",
        });

        await crearNotificacion(usuario?.uid, {
          titulo: "Comprobante generado",
          descripcion: `Se generó con éxito el comprobante ${comp.serie}-${comp.numero} de su pago.`,
          icono: "📄",
        });
      }

      setGuardando(false);
      console.log("[10] Loading finalizado");
      alert("¡Solicitud guardada correctamente!");
      setPaso("confirmacion");

      if (comp) {
        setModalComprobante(comp);
        console.log("[11] Modal del voucher abierto");
      }

      cargarMisSolicitudes().catch((err) => {
        console.error("[SOLICITUD] Error recargando:", err);
      });

    } catch (error) {
      console.error("[SOLICITUD] Error general:", error);
      setGuardando(false);
      alert(error.message || "No se pudo guardar la solicitud. Intente nuevamente.");
    }
  };

  const nuevaSolicitud = () => {
    setPaso("solicitud");
    setWizardPaso(1);
    setMetodoPago("");
    setEstadoPago("Sin pago");
    setArchivos([]);
    setRucValidado(false);
    setErrorRuc("");
    setSuccessRuc("");
    setExpediente("");
    setDetallePago(null);
    setProcesandoPago(false);
    setTipoComprobante("");
    setComprobanteGenerado(null);
    setEnviandoCorreo(false);
    // Limpiar estados de DNI
    setDniValidado(false);
    setDniSolicitante("");
    setNombresSolicitante("");
    setApellidosSolicitante("");
    setFechaNacimientoSolicitante("");
    setErrorDni("");
    setSuccessDni("");
    // Limpiar documentos
    setDocIdentidad(null);
    setDocFichaRuc(null);
    setDocAcreditaLocal(null);
    setDocPlano(null);
    setDocDj(null);
    setDocSanitario(null);
    setDocDigemid(null);
    setDocRepresentacion(null);
    setRelacionSolicitante("Dueño");
    setTipoPropiedadLocal("Contrato de alquiler");
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
      departamento: "",
      provincia: "",
      distrito: "",
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
    if (!["Licencia aprobada", "Licencia emitida", "Aprobado"].includes(solicitud.estado)) return false;

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
              <strong style={{ fontSize: "24px", color: "#92400e" }}>{misSolicitudes.filter(s => ["En revision", "En revisión"].includes(s.estado)).length}</strong>
              <p style={{ margin: "4px 0 0", color: "#92400e", fontSize: "13px" }}>En revisión</p>
            </div>
            <div style={{ background: "#f0fdf4", padding: "20px", borderRadius: "14px", border: "1px solid #bbf7d0" }}>
              <div style={{ fontSize: "24px", marginBottom: "8px" }}>&#9989;</div>
              <strong style={{ fontSize: "24px", color: "#166534" }}>{misSolicitudes.filter(s => ["Licencia aprobada", "Licencia emitida", "Aprobado"].includes(s.estado)).length}</strong>
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
                        <a key={index} href={pdf.archivoUrl} onClick={(e) => { e.preventDefault(); abrirPdf(pdf.archivoUrl); }} target="_blank" rel="noreferrer">PDF {index + 1}</a>
                      ))}
                    </div>
                  )}

                  {["Licencia rechazada", "Rechazado"].includes(s.estado) && (
                    <div className="motivo-rechazo">
                      <strong>Motivo:</strong>
                      <p>{s.observacionFuncionario || s.observacionInspector || "No se registró motivo del rechazo."}</p>
                    </div>
                  )}

                  {["Licencia aprobada", "Licencia emitida", "Aprobado"].includes(s.estado) && (
                    <div className="vigencia-box">
                      <strong>Vence:</strong> {formatearFecha(obtenerFechaExpiracion(s))}
                    </div>
                  )}

                  <div className="solicitud-card-footer">
                    {["Licencia aprobada", "Licencia emitida", "Aprobado"].includes(s.estado) ? (
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

          {cargandoNotificaciones ? (
            <div className="empty-state">
              <div className="spinner" style={{ margin: "0 auto 10px" }} />
              <h3>Cargando notificaciones...</h3>
            </div>
          ) : notificaciones.length === 0 ? (
            <div className="empty-state empty-state-modern">
              <div style={{ width: "80px", height: "80px", borderRadius: "50%", background: "linear-gradient(135deg, #dbeafe, #93c5fd)", display: "grid", placeItems: "center", margin: "0 auto 16px", fontSize: "36px" }}>&#128276;</div>
              <h3>No tienes notificaciones</h3>
              <p>Cuando haya novedades en tus solicitudes, aparecerán aquí.</p>
            </div>
          ) : (
            <div style={{ display: "grid", gap: "10px" }}>
              {notificaciones.map((n) => (
                <div
                  key={n.id}
                  onClick={() => abrirNotificacion(n)}
                  style={{
                    padding: "16px",
                    border: `1px solid ${n.leida ? "#e2e8f0" : "#3b82f6"}`,
                    borderRadius: "12px",
                    background: n.leida ? "#ffffff" : "#f0f9ff",
                    cursor: n.leida ? "default" : "pointer",
                    transition: "all 0.2s ease",
                    boxShadow: n.leida ? "none" : "0 2px 8px rgba(59, 130, 246, 0.08)",
                  }}
                >
                  <div style={{ display: "flex", gap: "14px", alignItems: "flex-start" }}>
                    <span style={{ fontSize: "24px", flexShrink: 0 }}>{n.icono || "🔔"}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "6px" }}>
                        <strong style={{ color: "#0f172a", fontSize: "14.5px" }}>{n.titulo}</strong>
                        <span style={{
                          fontSize: "11px",
                          fontWeight: "700",
                          padding: "2px 8px",
                          borderRadius: "999px",
                          background: n.leida ? "#f1f5f9" : "#dbeafe",
                          color: n.leida ? "#475569" : "#1e40af",
                        }}>
                          {n.leida ? "Leída" : "No leída"}
                        </span>
                      </div>
                      <p style={{ margin: "4px 0 6px", fontSize: "13.5px", color: "#334155", lineHeight: 1.4 }}>{n.descripcion}</p>
                      <small style={{ color: "#94a3b8" }}>{new Date(n.fecha_hora).toLocaleString("es-PE")}</small>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {seccion === "nueva-solicitud" && (
        <>
          {paso === "solicitud" && (() => {
            // Helper: subir un doc específico (PDF, max 5MB)
            const subirDoc = (setter) => (e) => {
              const file = e.target.files[0];
              if (!file) return;
              if (file.type !== "application/pdf") {
                alert("Solo se permiten archivos en formato PDF.");
                return;
              }
              if (file.size > 5 * 1024 * 1024) {
                alert("El archivo no debe superar los 5 MB.");
                return;
              }
              setter(file);
            };

            // Determinar si RUC es persona natural (comienza con 10)
            const esPersonaNatural = form.ruc.startsWith("10");
            const esPersonaJuridica = form.ruc.startsWith("20");

            // Verificar si el DNI coincide con el RUC (persona natural: 10 + DNI + dígito = 11 dígitos)
            const dniEnRuc = esPersonaNatural && form.ruc.length === 11
              ? form.ruc.slice(2, 10) === dniSolicitante.trim()
              : true;

            // Giro requiere doc sanitario
            const giroNormalizado = (form.giro || "").toLowerCase();
            const requiereDocSanitario = giroNormalizado.includes("restaurante") ||
              giroNormalizado.includes("alimento") || giroNormalizado.includes("comida") ||
              giroNormalizado.includes("bar") || giroNormalizado.includes("cocina") ||
              giroNormalizado.includes("cafeteria") || giroNormalizado.includes("cafetera");
            const requiereDocDigemid = giroNormalizado.includes("farmacia") ||
              giroNormalizado.includes("botica") || giroNormalizado.includes("medicamento") ||
              giroNormalizado.includes("droguería");
            const requiereDocRepresentacion = esPersonaJuridica &&
              (relacionSolicitante === "Representante legal" || relacionSolicitante === "Apoderado");

            // Indicador de progreso
            const pasoLabels = ["Datos del solicitante", "Datos del negocio", "Tipo de contribuyente", "Documentos"];

            return (
              <section className="section-card section-card-modern">
                <div className="section-header">
                  <div>
                    <h2>Nueva solicitud de licencia</h2>
                    <p>Complete cada paso para registrar su solicitud de funcionamiento.</p>
                  </div>
                </div>

                {/* Indicador de pasos */}
                <div style={{ display: "flex", alignItems: "center", gap: "0", marginBottom: "32px", padding: "0 4px" }}>
                  {pasoLabels.map((label, idx) => {
                    const num = idx + 1;
                    const activo = wizardPaso === num;
                    const completado = wizardPaso > num;
                    return (
                      <div key={num} style={{ display: "flex", alignItems: "center", flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
                          <div style={{
                            width: "36px", height: "36px", borderRadius: "50%", display: "flex",
                            alignItems: "center", justifyContent: "center", fontWeight: "700", fontSize: "15px",
                            flexShrink: 0,
                            background: completado ? "#16a34a" : activo ? "#1e3a8a" : "#e2e8f0",
                            color: completado || activo ? "#fff" : "#64748b",
                            boxShadow: activo ? "0 0 0 4px #dbeafe" : "none",
                            transition: "all 0.2s"
                          }}>
                            {completado ? "✓" : num}
                          </div>
                          <span style={{ fontSize: "10px", fontWeight: "600", color: activo ? "#1e3a8a" : completado ? "#16a34a" : "#94a3b8", textAlign: "center", lineHeight: 1.2, maxWidth: "70px" }}>{label}</span>
                        </div>
                        {idx < pasoLabels.length - 1 && (
                          <div style={{ flex: 1, height: "3px", background: completado ? "#16a34a" : "#e2e8f0", margin: "0 4px", marginBottom: "20px", borderRadius: "2px", transition: "background 0.3s" }} />
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="formulario formulario-modern">

                  {/* ═══════════════════════════════════════════
                      PASO 1 — DATOS DEL SOLICITANTE (DNI)
                  ═══════════════════════════════════════════ */}
                  {wizardPaso >= 1 && (
                    <div className="form-block" style={{ border: wizardPaso === 1 ? "2px solid #2563eb" : "1px solid #e2e8f0", borderRadius: "14px", padding: "20px", marginBottom: "16px" }}>
                      <div className="block-title">
                        <span style={{ background: dniValidado ? "#16a34a" : wizardPaso === 1 ? "#1e3a8a" : "#64748b" }}>1</span>
                        <div>
                          <h3>Datos del solicitante</h3>
                          <p>Ingrese su DNI para verificar su identidad en RENIEC.</p>
                        </div>
                        {dniValidado && <span style={{ marginLeft: "auto", background: "#dcfce7", color: "#16a34a", padding: "4px 12px", borderRadius: "999px", fontSize: "13px", fontWeight: "700", flexShrink: 0 }}>✓ Verificado</span>}
                      </div>

                      <div className="ruc-row ruc-row-modern" style={{ marginTop: "12px" }}>
                        <input
                          type="text"
                          placeholder="Número de DNI (8 dígitos)"
                          value={dniSolicitante}
                          onChange={(e) => {
                            const v = e.target.value.replace(/\D/g, "").slice(0, 8);
                            setDniSolicitante(v);
                            setDniValidado(false);
                            setErrorDni("");
                            setSuccessDni("");
                            setNombresSolicitante("");
                            setApellidosSolicitante("");
                          }}
                          maxLength="8"
                          disabled={wizardPaso > 1}
                          style={{ background: wizardPaso > 1 ? "#f1f5f9" : undefined }}
                        />
                        <button type="button" onClick={buscarDni} disabled={buscandoDni || wizardPaso > 1}>
                          {buscandoDni ? "Consultando..." : "Consultar RENIEC"}
                        </button>
                      </div>

                      {errorDni && <p style={{ color: "#dc2626", fontWeight: "600", marginTop: "8px", fontSize: "14px" }}>{errorDni}</p>}
                      {successDni && <p style={{ color: "#16a34a", fontWeight: "600", marginTop: "8px", fontSize: "14px" }}>✓ {successDni}</p>}

                      {dniValidado && (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginTop: "14px" }}>
                          <div>
                            <label style={{ fontSize: "12px", fontWeight: "700", color: "#64748b", display: "block", marginBottom: "4px" }}>Nombres</label>
                            <input type="text" value={nombresSolicitante} readOnly disabled style={{ background: "#f1f5f9" }} />
                          </div>
                          <div>
                            <label style={{ fontSize: "12px", fontWeight: "700", color: "#64748b", display: "block", marginBottom: "4px" }}>Apellidos</label>
                            <input type="text" value={apellidosSolicitante} readOnly disabled style={{ background: "#f1f5f9" }} />
                          </div>
                        </div>
                      )}

                      {wizardPaso === 1 && dniValidado && (
                        <button
                          type="button"
                          className="btn-pago"
                          onClick={() => setWizardPaso(2)}
                          style={{ marginTop: "16px", background: "#1e3a8a" }}
                        >
                          Continuar →
                        </button>
                      )}
                    </div>
                  )}

                  {/* ═══════════════════════════════════════════
                      PASO 2 — DATOS DEL NEGOCIO (RUC)
                  ═══════════════════════════════════════════ */}
                  {wizardPaso >= 2 && (
                    <div className="form-block" style={{ border: wizardPaso === 2 ? "2px solid #2563eb" : "1px solid #e2e8f0", borderRadius: "14px", padding: "20px", marginBottom: "16px" }}>
                      <div className="block-title">
                        <span style={{ background: rucValidado ? "#16a34a" : wizardPaso === 2 ? "#1e3a8a" : "#64748b" }}>2</span>
                        <div>
                          <h3>Datos del negocio</h3>
                          <p>Ingrese el RUC para consultar la información en SUNAT.</p>
                        </div>
                        {rucValidado && <span style={{ marginLeft: "auto", background: "#dcfce7", color: "#16a34a", padding: "4px 12px", borderRadius: "999px", fontSize: "13px", fontWeight: "700", flexShrink: 0 }}>✓ SUNAT Válido</span>}
                      </div>

                      {/* Tipo de trámite */}
                      <div style={{ marginTop: "12px", marginBottom: "14px" }}>
                        <label style={{ fontSize: "12px", fontWeight: "700", color: "#64748b", display: "block", marginBottom: "4px" }}>Tipo de trámite</label>
                        <select name="tipoTramite" value={form.tipoTramite} onChange={manejarCambio} disabled={wizardPaso > 2} style={{ background: wizardPaso > 2 ? "#f1f5f9" : undefined }}>
                          <option value="Nueva licencia">Nueva licencia</option>
                          <option value="Renovación anual">Renovación anual</option>
                        </select>
                      </div>

                      <div className="ruc-row ruc-row-modern">
                        <input
                          type="text"
                          name="ruc"
                          placeholder="Ingrese RUC de 11 dígitos"
                          value={form.ruc}
                          onChange={manejarCambio}
                          maxLength="11"
                          disabled={wizardPaso > 2}
                          style={{ background: wizardPaso > 2 ? "#f1f5f9" : undefined }}
                        />
                        <button type="button" onClick={buscarRuc} disabled={buscando || wizardPaso > 2}>
                          {buscando ? "Buscando..." : "Consultar SUNAT"}
                        </button>
                      </div>

                      {errorRuc && <p style={{ color: "#dc2626", fontWeight: "600", marginTop: "8px", fontSize: "14px" }}>{errorRuc}</p>}
                      {successRuc && <p style={{ color: "#16a34a", fontWeight: "600", marginTop: "8px", fontSize: "14px" }}>✓ {successRuc}</p>}

                      {rucValidado && (
                        <div style={{ marginTop: "14px" }}>
                          <div className="form-grid">
                            <div>
                              <label style={{ fontSize: "12px", fontWeight: "700", color: "#64748b", display: "block", marginBottom: "4px" }}>Razón social</label>
                              <input type="text" value={form.razonSocial} readOnly disabled style={{ background: "#f1f5f9" }} />
                            </div>
                            <div>
                              <label style={{ fontSize: "12px", fontWeight: "700", color: "#64748b", display: "block", marginBottom: "4px" }}>Nombre comercial</label>
                              <input type="text" value={form.nombreNegocio} readOnly disabled style={{ background: "#f1f5f9" }} />
                            </div>
                            <div>
                              <label style={{ fontSize: "12px", fontWeight: "700", color: "#64748b", display: "block", marginBottom: "4px" }}>Giro comercial</label>
                              <input type="text" value={form.giro} readOnly disabled style={{ background: "#f1f5f9" }} />
                            </div>
                            <div>
                              <label style={{ fontSize: "12px", fontWeight: "700", color: "#64748b", display: "block", marginBottom: "4px" }}>Dirección fiscal</label>
                              <input type="text" value={form.direccion} readOnly disabled style={{ background: "#f1f5f9" }} />
                            </div>
                          </div>
                          <div className="form-grid" style={{ marginTop: "10px", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
                            <div>
                              <label style={{ fontSize: "12px", fontWeight: "700", color: "#64748b", display: "block", marginBottom: "4px" }}>Estado SUNAT</label>
                              <input type="text" value={form.estadoSunat} readOnly disabled style={{ background: "#f1f5f9" }} />
                            </div>
                            <div>
                              <label style={{ fontSize: "12px", fontWeight: "700", color: "#64748b", display: "block", marginBottom: "4px" }}>Condición</label>
                              <input type="text" value={form.condicionSunat} readOnly disabled style={{ background: "#f1f5f9" }} />
                            </div>
                            <div>
                              <label style={{ fontSize: "12px", fontWeight: "700", color: "#64748b", display: "block", marginBottom: "4px" }}>Departamento</label>
                              <input type="text" value={form.departamento} readOnly disabled style={{ background: "#f1f5f9" }} />
                            </div>
                            <div>
                              <label style={{ fontSize: "12px", fontWeight: "700", color: "#64748b", display: "block", marginBottom: "4px" }}>Provincia</label>
                              <input type="text" value={form.provincia} readOnly disabled style={{ background: "#f1f5f9" }} />
                            </div>
                            <div>
                              <label style={{ fontSize: "12px", fontWeight: "700", color: "#64748b", display: "block", marginBottom: "4px" }}>Distrito</label>
                              <input type="text" value={form.distrito} readOnly disabled style={{ background: "#f1f5f9" }} />
                            </div>
                          </div>
                        </div>
                      )}

                      {wizardPaso === 2 && (
                        <div style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
                          <button type="button" className="btn-outline" onClick={() => setWizardPaso(1)}>← Atrás</button>
                          <button
                            type="button"
                            className="btn-pago"
                            onClick={() => {
                              if (!rucValidado) { alert("Debe validar el RUC antes de continuar."); return; }
                              // Validación persona natural: DNI debe coincidir con el RUC
                              if (esPersonaNatural && !dniEnRuc) {
                                alert("El DNI ingresado no corresponde al titular del RUC.");
                                return;
                              }
                              setWizardPaso(3);
                            }}
                            style={{ background: "#1e3a8a" }}
                          >
                            Continuar →
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ═══════════════════════════════════════════
                      PASO 3 — TIPO DE CONTRIBUYENTE
                  ═══════════════════════════════════════════ */}
                  {wizardPaso >= 3 && (
                    <div className="form-block" style={{ border: wizardPaso === 3 ? "2px solid #2563eb" : "1px solid #e2e8f0", borderRadius: "14px", padding: "20px", marginBottom: "16px" }}>
                      <div className="block-title">
                        <span style={{ background: wizardPaso > 3 ? "#16a34a" : wizardPaso === 3 ? "#1e3a8a" : "#64748b" }}>3</span>
                        <div>
                          <h3>Tipo de contribuyente</h3>
                          <p>Determinado automáticamente según el RUC ingresado.</p>
                        </div>
                      </div>

                      <div style={{ marginTop: "12px", padding: "14px 18px", borderRadius: "12px", background: esPersonaNatural ? "#eff6ff" : "#f0fdf4", border: `1px solid ${esPersonaNatural ? "#bfdbfe" : "#bbf7d0"}` }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <span style={{ fontSize: "24px" }}>{esPersonaNatural ? "👤" : "🏢"}</span>
                          <div>
                            <strong style={{ color: "#0f172a", fontSize: "15px" }}>
                              {esPersonaNatural ? "Persona Natural con Negocio" : esPersonaJuridica ? "Persona Jurídica (Empresa)" : "RUC ingresado"}
                            </strong>
                            <p style={{ margin: "2px 0 0", fontSize: "13px", color: "#475569" }}>
                              {esPersonaNatural
                                ? "El RUC inicia con 10 — Contribuyente persona natural."
                                : esPersonaJuridica
                                  ? "El RUC inicia con 20 — Empresa o sociedad registrada."
                                  : "Tipo no identificado."}
                            </p>
                          </div>
                        </div>
                      </div>

                      {esPersonaJuridica && (
                        <div style={{ marginTop: "14px" }}>
                          <label style={{ fontSize: "13px", fontWeight: "700", color: "#374151", display: "block", marginBottom: "6px" }}>
                            Tipo de relación del solicitante con la empresa
                          </label>
                          <select
                            value={relacionSolicitante}
                            onChange={(e) => setRelacionSolicitante(e.target.value)}
                            disabled={wizardPaso > 3}
                            style={{ background: wizardPaso > 3 ? "#f1f5f9" : undefined }}
                          >
                            <option value="Dueño">Dueño / Accionista principal</option>
                            <option value="Representante legal">Representante legal</option>
                            <option value="Apoderado">Apoderado</option>
                          </select>
                          {wizardPaso === 3 && requiereDocRepresentacion && (
                            <p style={{ marginTop: "8px", fontSize: "13px", color: "#92400e", background: "#fef3c7", padding: "8px 12px", borderRadius: "8px" }}>
                              ⚠️ Deberá adjuntar el documento que acredita su representación en el siguiente paso.
                            </p>
                          )}
                        </div>
                      )}

                      {wizardPaso === 3 && (
                        <div style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
                          <button type="button" className="btn-outline" onClick={() => setWizardPaso(2)}>← Atrás</button>
                          <button type="button" className="btn-pago" onClick={() => setWizardPaso(4)} style={{ background: "#1e3a8a" }}>
                            Continuar →
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ═══════════════════════════════════════════
                      PASO 4 — DOCUMENTOS REQUERIDOS
                  ═══════════════════════════════════════════ */}
                  {wizardPaso >= 4 && (
                    <div className="form-block" style={{ border: "2px solid #2563eb", borderRadius: "14px", padding: "20px", marginBottom: "16px" }}>
                      <div className="block-title">
                        <span style={{ background: "#1e3a8a" }}>4</span>
                        <div>
                          <h3>Documentos requeridos</h3>
                          <p>Suba cada documento en formato PDF (máx. 5 MB por archivo).</p>
                        </div>
                      </div>

                      <p style={{ marginTop: "10px", fontSize: "13px", color: "#64748b", background: "#f8fafc", padding: "10px 14px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                        📋 Solo se aceptan archivos <strong>PDF</strong>. No se permiten JPG, PNG, DOC, ZIP ni otros formatos.
                      </p>

                      {/* Documentos obligatorios */}
                      <div style={{ marginTop: "18px", display: "grid", gap: "14px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <p style={{ fontWeight: "700", color: "#0f172a", fontSize: "14px", margin: 0 }}>📌 Documentos obligatorios</p>
                          <span style={{ fontSize: "12.5px", background: "#eff6ff", color: "#1e40af", padding: "4px 10px", borderRadius: "8px", fontWeight: "600", border: "1px solid #bfdbfe" }}>
                            Actividad: {ACTIVIDADES_CONFIG[determinarActividad(form.giro)]?.nombre || "General"}
                          </span>
                        </div>

                        {(() => {
                          const actividad = determinarActividad(form.giro);
                          const baseDocs = ACTIVIDADES_CONFIG[actividad]?.documentos || ACTIVIDADES_CONFIG.default.documentos;
                          const reqKeys = [...baseDocs];
                          if (form.ruc.startsWith("20") && !reqKeys.includes("representacion")) {
                            reqKeys.push("representacion");
                          }
                          const stateMap = getDocumentStateMap();

                          return reqKeys.map((key) => {
                            const item = stateMap[key];
                            if (!item) return null;

                            if (item.isPropiedad) {
                              return (
                                <div key={key} style={{ padding: "14px 16px", borderRadius: "10px", background: item.state ? "#f0fdf4" : "#f8fafc", border: `1px solid ${item.state ? "#86efac" : "#e2e8f0"}` }}>
                                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "10px" }}>
                                    <div style={{ flex: 1 }}>
                                      <p style={{ margin: 0, fontWeight: "600", fontSize: "13px", color: "#0f172a" }}>{item.label}</p>
                                      <select value={tipoPropiedadLocal} onChange={(e) => setTipoPropiedadLocal(e.target.value)} style={{ marginTop: "6px", fontSize: "13px", padding: "6px 10px", borderRadius: "8px", border: "1px solid #cbd5e1" }}>
                                        <option>Contrato de alquiler</option>
                                        <option>Título de propiedad</option>
                                        <option>Cesión de uso</option>
                                      </select>
                                      <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#94a3b8" }}>Ejemplo: {item.hint}</p>
                                    </div>
                                    {item.state
                                      ? <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                          <span style={{ fontSize: "12px", color: "#16a34a", fontWeight: "600" }}>✓ {item.state.name}</span>
                                          <button type="button" className="btn-quitar" onClick={() => item.setter(null)}>Quitar</button>
                                        </div>
                                      : <label style={{ cursor: "pointer", padding: "6px 14px", background: "#1e3a8a", color: "#fff", borderRadius: "8px", fontSize: "13px", fontWeight: "600", alignSelf: "flex-start" }}>
                                          Seleccionar PDF
                                          <input type="file" accept=".pdf" hidden onChange={subirDoc(item.setter)} />
                                        </label>}
                                  </div>
                                </div>
                              );
                            }

                            return (
                              <div key={key} style={{ padding: "14px 16px", borderRadius: "10px", background: item.state ? "#f0fdf4" : "#f8fafc", border: `1px solid ${item.state ? "#86efac" : "#e2e8f0"}` }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
                                  <div>
                                    <p style={{ margin: 0, fontWeight: "600", fontSize: "13px", color: "#0f172a" }}>{item.label}</p>
                                    <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#94a3b8" }}>Ejemplo: {item.hint}</p>
                                  </div>
                                  {item.state
                                    ? <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                        <span style={{ fontSize: "12px", color: "#16a34a", fontWeight: "600" }}>✓ {item.state.name}</span>
                                        <button type="button" className="btn-quitar" onClick={() => item.setter(null)}>Quitar</button>
                                      </div>
                                    : <label style={{ cursor: "pointer", padding: "6px 14px", background: "#1e3a8a", color: "#fff", borderRadius: "8px", fontSize: "13px", fontWeight: "600" }}>
                                        Seleccionar PDF
                                        <input type="file" accept=".pdf" hidden onChange={subirDoc(item.setter)} />
                                      </label>}
                                </div>
                              </div>
                            );
                          });
                        })()}
                      </div>

                      {/* Documentos adicionales libres (opcional) */}
                      <div style={{ marginTop: "18px", display: "grid", gap: "14px" }}>
                        <div style={{ padding: "14px 16px", borderRadius: "10px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
                            <div>
                              <p style={{ margin: 0, fontWeight: "600", fontSize: "13px", color: "#0f172a" }}>📎 Documentos adicionales (opcional)</p>
                              <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#94a3b8" }}>Adjunta documentos adicionales si son necesarios.</p>
                            </div>
                            {archivos.length < 2 && (
                              <label style={{ cursor: "pointer", padding: "6px 14px", background: "#1e3a8a", color: "#fff", borderRadius: "8px", fontSize: "13px", fontWeight: "600" }}>
                                Seleccionar PDF
                                <input type="file" accept=".pdf" hidden onChange={manejarArchivosAdicionales} />
                              </label>
                            )}
                          </div>
                        </div>

                        {archivos.length > 0 && (
                          <div style={{ display: "grid", gap: "10px" }}>
                            {archivos.map((file, index) => (
                              <div key={index} style={{ padding: "14px 16px", borderRadius: "10px", background: "#f0fdf4", border: "1px solid #86efac" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
                                  <div>
                                    <p style={{ margin: 0, fontWeight: "600", fontSize: "13px", color: "#0f172a" }}>Documento adicional {index + 1}</p>
                                    <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#94a3b8" }}>{file.name}</p>
                                  </div>
                                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                    <span style={{ fontSize: "12px", color: "#16a34a", fontWeight: "600" }}>✓ Seleccionado</span>
                                    <button type="button" className="btn-quitar" onClick={() => quitarArchivo(index)}>Quitar</button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
                        <button type="button" className="btn-outline" onClick={() => setWizardPaso(3)}>← Atrás</button>
                        <button
                          type="button"
                          className="btn-pago btn-full"
                          onClick={continuarPago}
                          style={{ background: "#1e3a8a" }}
                        >
                          Continuar al pago →
                        </button>
                      </div>
                    </div>
                  )}

                </div>
              </section>
            );
          })()}

          {paso === "pago" && (
            <section className="section-card section-card-modern">
              <div className="section-header">
                <div>
                  <h2>Pago del trámite</h2>
                  <p>Elige tu tipo de comprobante y forma de pago para continuar.</p>
                </div>
              </div>

              <div className="payment-layout">
                <aside className="resumen-pago resumen-pago-modern">
                  <h3>Resumen del trámite</h3>
                  <p><strong>Tipo de trámite:</strong> {form.tipoTramite}</p>
                  <p><strong>Solicitante:</strong> {nombresSolicitante} {apellidosSolicitante}</p>
                  <p><strong>DNI:</strong> {dniSolicitante}</p>
                  <p><strong>RUC:</strong> {form.ruc}</p>
                  <p><strong>Razón social:</strong> {form.razonSocial}</p>
                  {tipoComprobante && (
                    <p><strong>Comprobante:</strong> {tipoComprobante === "boleta" ? "Boleta de Venta" : "Factura Electrónica"}</p>
                  )}
                  <div className="monto-box"><span>Total a pagar</span><strong>S/{MONTO_TRAMITE.toFixed(2)}</strong></div>
                  <span className={`badge ${estadoPago === "Confirmado" ? "ok" : "warning"}`}>{estadoPago}</span>
                  {detallePago?.id && <p className="text-muted"><strong>Operación:</strong> {detallePago.id}</p>}
                </aside>

                <div className="detalle-pago detalle-pago-modern">
                  {estadoPago !== "Confirmado" ? (
                    <div className="voucher-box" style={{ padding: "28px", borderRadius: "18px", border: "1px solid #dbeafe", background: "linear-gradient(135deg, #ffffff 0%, #f8fbff 55%, #ecfdf5 100%)", boxShadow: "0 14px 35px rgba(15, 23, 42, 0.08)" }}>

                      {/* Selección de tipo de comprobante */}
                      <div style={{ marginBottom: "22px" }}>
                        <span style={{ display: "inline-block", padding: "7px 12px", borderRadius: "999px", background: "#e0f2fe", color: "#075985", fontWeight: "700", fontSize: "13px", marginBottom: "12px" }}>Tipo de comprobante</span>
                        <h3 style={{ margin: "0 0 8px", color: "#0f172a" }}>¿Qué tipo de comprobante deseas?</h3>
                        <p style={{ margin: "0 0 14px", color: "#475569", lineHeight: "1.6" }}>Selecciona según tu condición de contribuyente.</p>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                          <button
                            type="button"
                            onClick={() => setTipoComprobante("boleta")}
                            style={{
                              padding: "16px", borderRadius: "14px", border: `2px solid ${tipoComprobante === "boleta" ? "#2563eb" : "#e2e8f0"}`,
                              background: tipoComprobante === "boleta" ? "#eff6ff" : "#f8fafc",
                              cursor: "pointer", textAlign: "left", transition: "all 0.2s",
                            }}
                          >
                            <div style={{ fontSize: "24px", marginBottom: "6px" }}>&#128196;</div>
                            <strong style={{ color: "#0f172a", fontSize: "14px", display: "block" }}>Boleta de Venta</strong>
                            <span style={{ fontSize: "12px", color: "#64748b" }}>Persona Natural — Se completa con tu DNI</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setTipoComprobante("factura")}
                            style={{
                              padding: "16px", borderRadius: "14px", border: `2px solid ${tipoComprobante === "factura" ? "#16a34a" : "#e2e8f0"}`,
                              background: tipoComprobante === "factura" ? "#f0fdf4" : "#f8fafc",
                              cursor: "pointer", textAlign: "left", transition: "all 0.2s",
                            }}
                          >
                            <div style={{ fontSize: "24px", marginBottom: "6px" }}>&#128196;</div>
                            <strong style={{ color: "#0f172a", fontSize: "14px", display: "block" }}>Factura Electrónica</strong>
                            <span style={{ fontSize: "12px", color: "#64748b" }}>Persona Jurídica — Se completa con tu RUC</span>
                          </button>
                        </div>

                        {tipoComprobante && (
                          <div style={{ marginTop: "14px", padding: "14px 18px", borderRadius: "12px", background: tipoComprobante === "boleta" ? "#eff6ff" : "#f0fdf4", border: `1px solid ${tipoComprobante === "boleta" ? "#bfdbfe" : "#bbf7d0"}` }}>
                            <strong style={{ fontSize: "13px", color: "#0f172a" }}>Datos del comprobante:</strong>
                            {tipoComprobante === "boleta" ? (
                              <div style={{ marginTop: "6px", fontSize: "13px", color: "#475569" }}>
                                <p style={{ margin: "2px 0" }}><strong>DNI:</strong> {dniSolicitante}</p>
                                <p style={{ margin: "2px 0" }}><strong>Nombres:</strong> {nombresSolicitante} {apellidosSolicitante}</p>
                                <p style={{ margin: "2px 0" }}><strong>Correo:</strong> {usuario?.correo}</p>
                              </div>
                            ) : (
                              <div style={{ marginTop: "6px", fontSize: "13px", color: "#475569" }}>
                                <p style={{ margin: "2px 0" }}><strong>RUC:</strong> {form.ruc}</p>
                                <p style={{ margin: "2px 0" }}><strong>Razón Social:</strong> {form.razonSocial}</p>
                                <p style={{ margin: "2px 0" }}><strong>Dirección:</strong> {form.direccion}</p>
                                <p style={{ margin: "2px 0", fontSize: "12px", color: "#94a3b8" }}>Incluye IGV (18%)</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {!tipoComprobante && (
                        <p style={{ color: "#92400e", background: "#fef3c7", padding: "10px 14px", borderRadius: "8px", fontSize: "13px" }}>
                          Debe seleccionar un tipo de comprobante antes de continuar con el pago.
                        </p>
                      )}

                      {/* Opciones de pago (solo si ya eligió comprobante) */}
                      {tipoComprobante && (
                        <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "18px" }}>
                          <span style={{ display: "inline-block", padding: "7px 12px", borderRadius: "999px", background: "#fef3c7", color: "#92400e", fontWeight: "700", fontSize: "13px", marginBottom: "12px" }}>Forma de pago</span>
                          <h3 style={{ margin: "0 0 8px", color: "#0f172a" }}>Selecciona como deseas pagar</h3>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "14px", marginTop: "14px" }}>
                            <div style={{ border: "1px solid #bbf7d0", background: "#f0fdf4", borderRadius: "14px", padding: "18px" }}>
                              <div style={{ fontSize: "26px", marginBottom: "6px" }}>&#128179;</div>
                              <h4 style={{ margin: "0 0 6px", color: "#14532d", fontSize: "14px" }}>Pago TEST con Mercado Pago</h4>
                              <p style={{ color: "#475569", lineHeight: "1.5", fontSize: "13px", margin: "0 0 10px" }}>Abre Checkout Pro en ambiente de prueba.</p>
                              <button type="button" className="btn-pago btn-full" onClick={iniciarPagoMercadoPago} disabled={procesandoPago} style={{ fontSize: "13px" }}>{procesandoPago ? "Generando..." : "Pagar con MP TEST"}</button>
                            </div>
                            <div style={{ border: "1px solid #fed7aa", background: "#fff7ed", borderRadius: "14px", padding: "18px" }}>
                              <div style={{ fontSize: "26px", marginBottom: "6px" }}>&#129535;</div>
                              <h4 style={{ margin: "0 0 6px", color: "#7c2d12", fontSize: "14px" }}>Pago demo municipal</h4>
                              <p style={{ color: "#475569", lineHeight: "1.5", fontSize: "13px", margin: "0 0 10px" }}>Registra comprobante demo para continuar.</p>
                              <button type="button" className="btn-secundario btn-full" onClick={iniciarPagoDemo} disabled={procesandoPago} style={{ fontSize: "13px" }}>{procesandoPago ? "Registrando..." : "Confirmar pago demo"}</button>
                            </div>
                            <div style={{ border: "1px solid #cbd5e1", background: "#f8fafc", borderRadius: "14px", padding: "18px" }}>
                              <div style={{ fontSize: "26px", marginBottom: "6px" }}>&#127970;</div>
                              <h4 style={{ margin: "0 0 6px", color: "#334155", fontSize: "14px" }}>Pago presencial en caja</h4>
                              <p style={{ color: "#475569", lineHeight: "1.5", fontSize: "13px", margin: "0 0 10px" }}>Paga en la Municipalidad.</p>
                              <button type="button" className="btn-outline btn-full" onClick={iniciarPagoCaja} disabled={procesandoPago} style={{ fontSize: "13px" }}>Seleccionar caja</button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="voucher-box success-voucher">
                      <h3>&#10003; Pago confirmado</h3>
                      <p>El comprobante fue generado y guardado exitosamente.</p>
                      {detallePago?.id && <p><strong>Código de operación:</strong> {detallePago.id}</p>}
                      <p><strong>Método:</strong> {metodoPago}</p>

                      {comprobanteGenerado && (
                        <div style={{ marginTop: "18px", padding: "16px", background: "#f0fdf4", borderRadius: "12px", border: "1px solid #bbf7d0" }}>
                          <strong style={{ color: "#166534", fontSize: "14px" }}>Comprobante generado</strong>
                          <p style={{ margin: "4px 0 8px", fontSize: "13px", color: "#475569" }}>
                            {comprobanteGenerado.tipo_comprobante === "boleta" ? "Boleta" : "Factura"}: {comprobanteGenerado.serie}-{comprobanteGenerado.numero}
                          </p>
                          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                            {comprobanteGenerado.url_pdf && (
                              <a href={comprobanteGenerado.url_pdf} onClick={(e) => { e.preventDefault(); abrirPdf(comprobanteGenerado.url_pdf); }} target="_blank" rel="noreferrer"
                                style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "8px 16px", background: "#1e3a8a", color: "#fff", borderRadius: "8px", fontSize: "13px", fontWeight: "600", textDecoration: "none" }}>
                                &#128196; Ver comprobante
                              </a>
                            )}
                            <button type="button" className="btn-ok" style={{ fontSize: "13px" }} onClick={() => descargarComprobante(comprobanteGenerado)}>
                              &#11015; Descargar PDF
                            </button>
                            <button
                              type="button"
                              className="btn-secundario"
                              style={{ fontSize: "13px" }}
                              disabled={enviandoCorreo}
                              onClick={async () => {
                                try {
                                  setEnviandoCorreo(true);
                                  await enviarComprobantePorCorreo(comprobanteGenerado);
                                  alert("Comprobante enviado a tu correo electrónico.");
                                } catch (err) {
                                  alert("No se pudo enviar el correo: " + err.message);
                                } finally {
                                  setEnviandoCorreo(false);
                                }
                              }}
                            >
                              {enviandoCorreo ? "Enviando..." : "Enviar por correo"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="acciones-pago acciones-pago-modern">
                <button type="button" onClick={() => setPaso("solicitud")}>Volver</button>
                <button type="button" className="btn-pago" onClick={enviarSolicitud} disabled={guardando || !tipoComprobante || (estadoPago !== "Confirmado" && metodoPago !== "Pago presencial en caja")}>{guardando ? "Guardando solicitud..." : "Enviar solicitud"}</button>
              </div>
            </section>
          )}

          {paso === "confirmacion" && (
            <section className="section-card section-card-modern confirmacion" style={{ textAlign: "center", padding: "50px 28px" }}>
              <div className="success-circle" style={{ width: "80px", height: "80px", margin: "0 auto 20px", fontSize: "40px", boxShadow: "0 8px 30px rgba(22, 163, 74, 0.25)" }}>&#10003;</div>
              <h2 style={{ fontSize: "28px", marginBottom: "8px" }}>Solicitud registrada correctamente</h2>
              <p style={{ color: "#64748b", fontSize: "16px", maxWidth: "500px", margin: "0 auto 24px" }}>Tu pago fue registrado y la solicitud fue enviada exitosamente. La municipalidad revisará la documentación presentada.</p>
              <div className="resumen-pago resumen-pago-modern">
                <p><strong>Número de expediente:</strong> {expediente}</p>
                <p><strong>Solicitante:</strong> {nombresSolicitante} {apellidosSolicitante}</p>
                <p><strong>Tipo de trámite:</strong> {form.tipoTramite}</p>
                <p><strong>Estado de solicitud:</strong> Registrada</p>
                <p><strong>Estado de pago:</strong> PAGADO</p>
                <p><strong>Monto:</strong> S/{MONTO_TRAMITE.toFixed(2)}</p>
                {comprobanteGenerado && (
                  <p><strong>Comprobante:</strong> {comprobanteGenerado.serie}-{comprobanteGenerado.numero} ({comprobanteGenerado.tipo_comprobante === "boleta" ? "Boleta" : "Factura"})</p>
                )}
              </div>
              <div style={{ display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap", marginTop: "20px" }}>
                <button type="button" className="btn-pago" onClick={() => setPaso("misSolicitudes")}>&#128196; Ver mis solicitudes</button>
                {comprobanteGenerado && (
                  <button type="button" className="btn-ok" onClick={() => descargarComprobante(comprobanteGenerado)}>&#11015; Descargar comprobante</button>
                )}
                <button type="button" className="btn-outline" onClick={() => { setPaso("misSolicitudes"); nuevaSolicitud(); }}>&#127968; Volver al inicio</button>
              </div>
            </section>
          )}
        </>
      )}




      {seccion === "mis-comprobantes" && (
        <section className="section-card section-card-modern">
          <div className="section-header">
            <div>
              <h2>Mis pagos y comprobantes</h2>
              <p>Historial de comprobantes de pago de tus solicitudes.</p>
            </div>
            <button type="button" className="btn-outline" onClick={cargarComprobantes} disabled={cargandoComprobantes}>
              {cargandoComprobantes ? "Cargando..." : "Actualizar"}
            </button>
          </div>

          {cargandoComprobantes ? (
            <div className="empty-state">
              <div style={{ fontSize: "36px", marginBottom: "10px" }}>&#128196;</div>
              <h3>Cargando comprobantes...</h3>
            </div>
          ) : comprobantes.length === 0 ? (
            <div className="empty-state empty-state-modern">
              <div style={{ width: "80px", height: "80px", borderRadius: "50%", background: "linear-gradient(135deg, #fef3c7, #fde68a)", display: "grid", placeItems: "center", margin: "0 auto 16px", fontSize: "36px" }}>&#128196;</div>
              <h3>No tienes pagos registrados</h3>
              <p>Cuando realices el pago de una solicitud, tu comprobante aparecerá aquí.</p>
            </div>
          ) : (
            <div style={{ display: "grid", gap: "14px" }}>
              {comprobantes.map((comp) => (
                <div key={comp.id_comprobante} style={{
                  padding: "20px",
                  borderRadius: "14px",
                  border: "1px solid #e2e8f0",
                  background: "linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px" }}>
                    <div style={{ flex: 1, minWidth: "220px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px", flexWrap: "wrap" }}>
                        <span style={{
                          display: "inline-block",
                          padding: "3px 10px",
                          borderRadius: "999px",
                          fontSize: "11px",
                          fontWeight: "700",
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          background: comp.tipo_comprobante === "boleta" ? "#eff6ff" : "#f0fdf4",
                          color: comp.tipo_comprobante === "boleta" ? "#1e40af" : "#166534",
                          border: `1px solid ${comp.tipo_comprobante === "boleta" ? "#bfdbfe" : "#bbf7d0"}`,
                        }}>
                          {comp.tipo_comprobante === "boleta" ? "Boleta" : "Factura"}
                        </span>
                        <span style={{ fontFamily: "monospace", fontWeight: "700", color: "#0f172a", fontSize: "15px" }}>
                          {comp.serie}-{comp.numero}
                        </span>
                        <span style={{
                          display: "inline-block",
                          padding: "3px 10px",
                          borderRadius: "999px",
                          fontSize: "11px",
                          fontWeight: "700",
                          background: "#dcfce7",
                          color: "#166534",
                        }}>
                          {comp.estado}
                        </span>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "4px 16px" }}>
                        <p style={{ margin: "3px 0", fontSize: "13px", color: "#64748b" }}><strong>Código Operación:</strong> {comp.codigo_operacion || "N/A"}</p>
                        <p style={{ margin: "3px 0", fontSize: "13px", color: "#64748b" }}><strong>Código Solicitud:</strong> {comp.id_solicitud}</p>
                        <p style={{ margin: "3px 0", fontSize: "13px", color: "#64748b" }}><strong>Tipo de Trámite:</strong> {comp.tipo_tramite || "Licencia de Funcionamiento"}</p>
                        <p style={{ margin: "3px 0", fontSize: "13px", color: "#64748b" }}><strong>Fecha/Hora Pago:</strong> {comp.fecha_emision} {comp.hora_emision || ""}</p>
                        <p style={{ margin: "3px 0", fontSize: "13px", color: "#64748b" }}><strong>Método de Pago:</strong> {comp.metodo_pago}</p>
                        {comp.ruc_cliente && <p style={{ margin: "3px 0", fontSize: "13px", color: "#64748b" }}><strong>RUC Contribuyente:</strong> {comp.ruc_cliente}</p>}
                        {comp.dni_cliente && <p style={{ margin: "3px 0", fontSize: "13px", color: "#64748b" }}><strong>DNI Contribuyente:</strong> {comp.dni_cliente}</p>}
                      </div>
                    </div>
                    <div style={{ textAlign: "right", minWidth: "140px" }}>
                      <p style={{ margin: "0 0 8px", fontSize: "24px", fontWeight: "800", color: "#166534" }}>
                        S/{Number(comp.monto_total || comp.monto).toFixed(2)}
                      </p>
                      <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end", flexWrap: "wrap" }}>
                        <button
                          type="button"
                          className="btn-outline"
                          style={{ fontSize: "12px", padding: "6px 14px", fontWeight: "600" }}
                          onClick={() => setModalComprobante(comp)}
                        >
                          👁 Ver comprobante
                        </button>
                        <button
                          type="button"
                          className="btn-ok"
                          style={{ fontSize: "12px", padding: "6px 14px", fontWeight: "600" }}
                          onClick={() => descargarComprobante(comp)}
                        >
                          📥 Descargar PDF
                        </button>
                        <button
                          type="button"
                          className="btn-secundario"
                          style={{ fontSize: "12px", padding: "6px 14px", fontWeight: "600" }}
                          onClick={() => imprimirComprobante(comp)}
                        >
                          🖨 Imprimir
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
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
            
            {/* Cabecera de perfil */}
            <div style={{ display: "flex", alignItems: "center", gap: "16px", padding: "16px 20px", background: "#eff6ff", borderRadius: "14px", border: "1px solid #bfdbfe", marginBottom: "8px" }}>
              <div style={{ width: "56px", height: "56px", borderRadius: "50%", background: "#1e3a8a", color: "white", display: "grid", placeItems: "center", fontSize: "24px", fontWeight: "bold" }}>
                {usuario.nombre ? usuario.nombre.charAt(0).toUpperCase() : "U"}
              </div>
              <div>
                <h3 style={{ margin: 0, color: "#1e3a8a", fontSize: "16px", fontWeight: "700" }}>{usuario.nombre}</h3>
                <span style={{ color: "#1e40af", fontSize: "13px" }}>Ciudadano registrado</span>
              </div>
            </div>

            {/* Campos de datos */}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "14px 16px", background: "#f8fafc", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
              <span style={{ color: "#64748b", fontSize: "14px" }}>Nombre completo</span>
              <strong style={{ color: "#0f172a", fontSize: "14px" }}>{usuario.nombre}</strong>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", background: "#f8fafc", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
              <div>
                <span style={{ color: "#64748b", fontSize: "12px", display: "block" }}>Correo electrónico</span>
                <strong style={{ color: "#0f172a", fontSize: "14px" }}>{usuario.correo}</strong>
              </div>
              <button 
                type="button" 
                onClick={() => setModalCambiarCorreo(true)}
                style={{ padding: "6px 12px", fontSize: "12px", background: "#1e3a8a", color: "white", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "600" }}
              >
                Cambiar correo
              </button>
            </div>

            <div style={{ padding: "14px 16px", background: "#f8fafc", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <span style={{ color: "#64748b", fontSize: "12px", display: "block" }}>Contraseña</span>
                  <strong style={{ color: "#0f172a", fontSize: "14px" }}>••••••••••••</strong>
                </div>
                <button 
                  type="button" 
                  onClick={manejarCambiarPassword}
                  disabled={cargandoCambioPassword}
                  style={{ padding: "6px 12px", fontSize: "12px", background: "#64748b", color: "white", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "600" }}
                >
                  {cargandoCambioPassword ? "Enviando..." : "Cambiar contraseña"}
                </button>
              </div>
              {successPasswordReset && <div style={{ color: "#15803d", fontSize: "12px", marginTop: "8px", background: "#f0fdf4", padding: "8px 12px", borderRadius: "6px", border: "1px solid #bbf7d0" }}>&#10004; {successPasswordReset}</div>}
              {errorPasswordReset && <div style={{ color: "#b91c1c", fontSize: "12px", marginTop: "8px", background: "#fef2f2", padding: "8px 12px", borderRadius: "6px", border: "1px solid #fecaca" }}>&#9888; {errorPasswordReset}</div>}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", background: "#f8fafc", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
              <div>
                <span style={{ color: "#64748b", fontSize: "12px", display: "block" }}>Teléfono</span>
                <strong style={{ color: "#0f172a", fontSize: "14px" }}>{usuario.telefono || "No registrado"}</strong>
              </div>
              {usuario.telefono_verificado ? (
                <span style={{ background: "#f0fdf4", color: "#166534", padding: "4px 10px", borderRadius: "999px", fontSize: "12px", fontWeight: "600" }}>✓ Verificado</span>
              ) : (
                <span style={{ background: "#fffbeb", color: "#92400e", padding: "4px 10px", borderRadius: "999px", fontSize: "12px", fontWeight: "600" }}>⚠ No verificado</span>
              )}
            </div>

            {/* Configuración de notificaciones */}
            <div style={{ padding: "16px", background: "#f8fafc", borderRadius: "12px", border: "1px solid #e2e8f0", marginTop: "8px" }}>
              <h3 style={{ fontSize: "15px", fontWeight: "700", color: "#0f172a", margin: "0 0 12px" }}>Configuración de notificaciones</h3>
              
              <div style={{ display: "grid", gap: "10px", fontSize: "14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #e2e8f0", paddingBottom: "10px" }}>
                  <div>
                    <span style={{ display: "block", fontWeight: "600", color: "#334155" }}>Correo electrónico</span>
                    <span style={{ fontSize: "12px", color: "#64748b" }}>{usuario.correo}</span>
                  </div>
                  <span style={{ background: "#f0fdf4", color: "#166534", padding: "4px 10px", borderRadius: "999px", fontSize: "12px", fontWeight: "600" }}>✓ Verificado</span>
                </div>
                
                <div style={{ borderBottom: "1px solid #e2e8f0", paddingBottom: "10px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <span style={{ display: "block", fontWeight: "600", color: "#334155" }}>Número telefónico</span>
                      {editandoTelefono ? (
                        <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
                          <input
                            type="text"
                            placeholder="912345678"
                            value={telefonoInput}
                            onChange={(e) => setTelefonoInput(e.target.value.replace(/[^\d+]/g, ""))}
                            disabled={pasoVerificarTelefono || cargandoSms}
                            style={{
                              padding: "6px 10px",
                              fontSize: "13.5px",
                              border: "1px solid #cbd5e1",
                              borderRadius: "8px",
                              width: "150px"
                            }}
                          />
                          {!pasoVerificarTelefono && (
                            <button
                              type="button"
                              onClick={manejarEnviarOtpSms}
                              disabled={cargandoSms || !telefonoInput}
                              style={{
                                padding: "6px 12px",
                                fontSize: "12.5px",
                                background: "#2563eb",
                                color: "white",
                                border: "none",
                                borderRadius: "8px",
                                cursor: "pointer",
                                fontWeight: "600"
                              }}
                            >
                              {cargandoSms ? "Enviando..." : "Enviar código"}
                            </button>
                          )}
                        </div>
                      ) : (
                        <span style={{ fontSize: "14px", color: "#0f172a", fontWeight: "600", marginTop: "2px", display: "inline-block" }}>
                          {usuario.telefono || "No registrado"}
                        </span>
                      )}
                    </div>
                    <div>
                      {usuario.telefono_verificado ? (
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ background: "#f0fdf4", color: "#166534", padding: "4px 10px", borderRadius: "999px", fontSize: "12px", fontWeight: "600" }}>✓ Verificado</span>
                          {!editandoTelefono && (
                            <button
                              type="button"
                              onClick={() => { setEditandoTelefono(true); setPasoVerificarTelefono(false); }}
                              style={{ background: "none", border: "none", color: "#2563eb", fontSize: "12px", cursor: "pointer", textDecoration: "underline" }}
                            >
                              Cambiar
                            </button>
                          )}
                        </div>
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ background: "#fffbeb", color: "#92400e", padding: "4px 10px", borderRadius: "999px", fontSize: "12px", fontWeight: "600" }}>⚠ No verificado</span>
                          {editandoTelefono && usuario.telefono && (
                            <button
                              type="button"
                              onClick={() => setEditandoTelefono(false)}
                              style={{ background: "none", border: "none", color: "#64748b", fontSize: "12px", cursor: "pointer", textDecoration: "underline" }}
                            >
                              Cancelar
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Formulario de Código OTP */}
                  {pasoVerificarTelefono && (
                    <form onSubmit={manejarVerificarOtpSms} style={{ marginTop: "12px", padding: "12px", background: "white", borderRadius: "8px", border: "1px solid #cbd5e1" }}>
                      <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "#475569", marginBottom: "6px" }}>
                        Ingrese el código recibido por SMS (OTP de 6 dígitos)
                      </label>
                      <div style={{ display: "flex", gap: "10px" }}>
                        <input
                          type="text"
                          maxLength="6"
                          placeholder="Ej: 123456"
                          value={codigoSms}
                          onChange={(e) => setCodigoSms(e.target.value.replace(/\D/g, "").slice(0, 6))}
                          style={{ width: "120px", padding: "8px", textAlign: "center", fontSize: "16px", letterSpacing: "2px", fontWeight: "bold", border: "1px solid #cbd5e1", borderRadius: "6px" }}
                          required
                        />
                        <button type="submit" disabled={cargandoSms} style={{ padding: "8px 16px", background: "#16a34a", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: "600", fontSize: "13px" }}>
                          {cargandoSms ? "Verificando..." : "Verificar"}
                        </button>
                      </div>
                      <div style={{ marginTop: "8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <button 
                          type="button" 
                          onClick={manejarEnviarOtpSms} 
                          disabled={tiempoRestanteSms > 0 || cargandoSms || reenviosCount >= 3} 
                          style={{ background: "none", border: "none", color: (tiempoRestanteSms > 0 || reenviosCount >= 3) ? "#94a3b8" : "#2563eb", fontSize: "12px", cursor: (tiempoRestanteSms > 0 || reenviosCount >= 3) ? "default" : "pointer", fontWeight: "600" }}
                        >
                          {reenviosCount >= 3 ? "Límite de reenvíos alcanzado" : "Reenviar código"}
                        </button>
                        {tiempoRestanteSms > 0 && (
                          <span style={{ fontSize: "12px", color: "#64748b" }}>Espera {tiempoRestanteSms}s</span>
                        )}
                      </div>
                    </form>
                  )}
                  
                  {errorSms && <div style={{ color: "#b91c1c", fontSize: "12px", marginTop: "8px", background: "#fef2f2", padding: "8px 12px", borderRadius: "6px", border: "1px solid #fecaca" }}>&#9888; {errorSms}</div>}
                  {successSms && <div style={{ color: "#15803d", fontSize: "12px", marginTop: "8px", background: "#f0fdf4", padding: "8px 12px", borderRadius: "6px", border: "1px solid #bbf7d0" }}>&#10004; {successSms}</div>}
                </div>

                {/* Selección de Preferencias */}
                <div style={{ marginTop: "8px" }}>
                  <span style={{ display: "block", fontWeight: "700", color: "#0f172a", fontSize: "13px", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Notificaciones</span>
                  
                  <div style={{ display: "grid", gap: "10px" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "14px", color: "#334155" }}>
                      <input 
                        type="checkbox" 
                        checked={usuario.recibir_correos !== false} 
                        onChange={(e) => manejarCambiarPreferencias("email", e.target.checked)} 
                        style={{ width: "16px", height: "16px", accentColor: "#1f3b57" }}
                      />
                      Recibir correos electrónicos
                    </label>

                    <div>
                      <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: usuario.telefono_verificado ? "pointer" : "not-allowed", fontSize: "14px", color: usuario.telefono_verificado ? "#334155" : "#94a3b8" }}>
                        <input 
                          type="checkbox" 
                          checked={usuario.sms_habilitado && usuario.telefono_verificado} 
                          disabled={!usuario.telefono_verificado}
                          onChange={(e) => manejarCambiarPreferencias("sms", e.target.checked)} 
                          style={{ width: "16px", height: "16px", accentColor: "#1f3b57", cursor: usuario.telefono_verificado ? "pointer" : "not-allowed" }}
                        />
                        Recibir SMS
                      </label>
                      {!usuario.telefono_verificado && (
                        <p style={{ margin: "4px 0 0 24px", fontSize: "12px", color: "#b45309", fontWeight: "500" }}>
                          Debes verificar tu número telefónico para recibir mensajes SMS.
                        </p>
                      )}
                    </div>
                  </div>
                </div>

              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", padding: "14px 16px", background: "#f8fafc", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
              <span style={{ color: "#64748b", fontSize: "14px" }}>Rol</span>
              <strong style={{ color: "#0f172a", fontSize: "14px" }}>Solicitante</strong>
            </div>
          </div>
        </section>
      )}
      {modalComprobante && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(15, 23, 42, 0.6)",
          backdropFilter: "blur(4px)",
          display: "grid",
          placeItems: "center",
          zIndex: 9999,
          padding: "20px",
          overflowY: "auto",
        }}>
          <div style={{
            background: "white",
            borderRadius: "16px",
            width: "100%",
            maxWidth: "500px",
            boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
            overflow: "hidden",
            border: "1px solid #e2e8f0",
          }}>
            {/* Header */}
            <div style={{
              background: "#f0fdf4",
              borderBottom: "1px solid #bbf7d0",
              padding: "24px 20px",
              textAlign: "center",
            }}>
              <div style={{
                width: "48px",
                height: "48px",
                borderRadius: "50%",
                background: "#dcfce7",
                border: "2px solid #34d399",
                display: "grid",
                placeItems: "center",
                margin: "0 auto 12px",
                fontSize: "24px",
                color: "#059669",
              }}>
                ✓
              </div>
              <h2 style={{ margin: "0 0 4px", color: "#166534", fontSize: "18px", fontWeight: "800" }}>PAGO REALIZADO CORRECTAMENTE</h2>
              <p style={{ margin: 0, color: "#15803d", fontSize: "14px" }}>Comprobante generado exitosamente.</p>
            </div>

            {/* Content / Details */}
            {/* Content / Details */}
            <div style={{ padding: "20px" }}>
              {comprobantePdfUrl ? (
                <iframe
                  src={comprobantePdfUrl}
                  style={{
                    width: "100%",
                    height: "480px",
                    border: "1px solid #cbd5e1",
                    borderRadius: "8px",
                    boxSizing: "border-box"
                  }}
                  title="Vista previa del comprobante"
                />
              ) : (
                <div style={{ textAlign: "center", padding: "40px 0", color: "#64748b" }}>
                  Generando vista previa del comprobante...
                </div>
              )}
            </div>

            {/* Footer Buttons */}
            <div style={{
              background: "#f8fafc",
              borderTop: "1px solid #e2e8f0",
              padding: "16px 20px",
              display: "flex",
              gap: "8px",
              justifyContent: "flex-end",
            }}>
              <button
                type="button"
                onClick={() => descargarComprobante(modalComprobante)}
                style={{
                  padding: "10px 16px",
                  fontSize: "13px",
                  fontWeight: "600",
                  background: "#1e3a8a",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  cursor: "pointer",
                }}
              >
                📥 Descargar PDF
              </button>
              <button
                type="button"
                onClick={() => imprimirComprobante(modalComprobante)}
                style={{
                  padding: "10px 16px",
                  fontSize: "13px",
                  fontWeight: "600",
                  background: "#64748b",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  cursor: "pointer",
                }}
              >
                🖨 Imprimir
              </button>
              <button
                type="button"
                onClick={() => {
                  setModalComprobante(null);
                  if (paso === "confirmacion") {
                    setPaso("misSolicitudes");
                  }
                }}
                style={{
                  padding: "10px 16px",
                  fontSize: "13px",
                  fontWeight: "600",
                  background: "white",
                  color: "#334155",
                  border: "1px solid #cbd5e1",
                  borderRadius: "8px",
                  cursor: "pointer",
                }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
      {modalCambiarCorreo && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(15, 23, 42, 0.6)",
          backdropFilter: "blur(4px)",
          display: "grid",
          placeItems: "center",
          zIndex: 9999,
          padding: "20px",
        }}>
          <div style={{
            background: "white",
            borderRadius: "16px",
            width: "100%",
            maxWidth: "450px",
            boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
            overflow: "hidden",
            border: "1px solid #e2e8f0",
          }}>
            <div style={{ background: "#1f3b57", color: "white", padding: "20px", textAlign: "center" }}>
              <h3 style={{ margin: 0, fontSize: "18px", fontWeight: "700" }}>Cambiar correo electrónico</h3>
              <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#93c5fd" }}>Doble verificación de seguridad</p>
            </div>
            
            <div style={{ padding: "20px" }}>
              {/* PASO 1: Ingresar nuevo correo */}
              {pasoCambioCorreo === 1 && (
                <form onSubmit={manejarEnviarOtpActual} style={{ display: "grid", gap: "14px" }}>
                  <div>
                    <span style={{ display: "block", fontSize: "13px", color: "#64748b", marginBottom: "4px" }}>Correo actual</span>
                    <strong style={{ fontSize: "15px", color: "#0f172a" }}>{usuario.correo}</strong>
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "#475569", marginBottom: "6px" }}>Nuevo correo electrónico</label>
                    <input
                      type="email"
                      required
                      placeholder="nuevo@correo.com"
                      value={nuevoCorreo}
                      onChange={(e) => setNuevoCorreo(e.target.value)}
                      style={{ width: "100%", padding: "10px 12px", border: "1px solid #cbd5e1", borderRadius: "8px", fontSize: "14px", boxSizing: "border-box" }}
                    />
                  </div>
                  <button type="submit" disabled={cargandoCambioCorreo} style={{ padding: "10px", background: "#1e3a8a", color: "white", border: "none", borderRadius: "8px", fontWeight: "600", cursor: "pointer" }}>
                    {cargandoCambioCorreo ? "Verificando..." : "Enviar código al correo actual"}
                  </button>
                </form>
              )}

              {/* PASO 2: Ingresar código del correo actual */}
              {pasoCambioCorreo === 2 && (
                <form onSubmit={manejarVerificarOtpActual} style={{ display: "grid", gap: "14px" }}>
                  <p style={{ margin: 0, fontSize: "13.5px", color: "#475569", lineHeight: 1.4 }}>
                    Hemos enviado un código al correo actual <strong>{usuario.correo}</strong>.
                  </p>
                  <div>
                    <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "#475569", marginBottom: "6px" }}>Código de verificación (6 dígitos)</label>
                    <input
                      type="text"
                      maxLength="6"
                      required
                      placeholder="Ej: 123456"
                      value={codigoCorreoActual}
                      onChange={(e) => setCodigoCorreoActual(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      style={{ width: "100%", padding: "10px", textAlign: "center", fontSize: "18px", letterSpacing: "2px", fontWeight: "bold", border: "1px solid #cbd5e1", borderRadius: "8px", boxSizing: "border-box" }}
                    />
                  </div>
                  <button type="submit" disabled={cargandoCambioCorreo} style={{ padding: "10px", background: "#16a34a", color: "white", border: "none", borderRadius: "8px", fontWeight: "600", cursor: "pointer" }}>
                    {cargandoCambioCorreo ? "Verificando..." : "Confirmar código actual"}
                  </button>
                </form>
              )}

              {/* PASO 3: Ingresar código del nuevo correo */}
              {pasoCambioCorreo === 3 && (
                <form onSubmit={manejarVerificarOtpNuevo} style={{ display: "grid", gap: "14px" }}>
                  <p style={{ margin: 0, fontSize: "13.5px", color: "#475569", lineHeight: 1.4 }}>
                    Código del correo actual verificado. Ahora, hemos enviado un segundo código a tu nuevo correo: <strong>{nuevoCorreo}</strong>.
                  </p>
                  <div>
                    <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "#475569", marginBottom: "6px" }}>Código de confirmación (6 dígitos)</label>
                    <input
                      type="text"
                      maxLength="6"
                      required
                      placeholder="Ej: 123456"
                      value={codigoCorreoNuevo}
                      onChange={(e) => setCodigoCorreoNuevo(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      style={{ width: "100%", padding: "10px", textAlign: "center", fontSize: "18px", letterSpacing: "2px", fontWeight: "bold", border: "1px solid #cbd5e1", borderRadius: "8px", boxSizing: "border-box" }}
                    />
                  </div>
                  <button type="submit" disabled={cargandoCambioCorreo} style={{ padding: "10px", background: "#16a34a", color: "white", border: "none", borderRadius: "8px", fontWeight: "600", cursor: "pointer" }}>
                    {cargandoCambioCorreo ? "Confirmando..." : "Actualizar correo electrónico"}
                  </button>
                </form>
              )}

              {errorCambioCorreo && <div style={{ color: "#b91c1c", fontSize: "13px", marginTop: "12px", background: "#fef2f2", padding: "10px 12px", borderRadius: "8px", border: "1px solid #fecaca" }}>&#9888; {errorCambioCorreo}</div>}
              {successCambioCorreo && <div style={{ color: "#15803d", fontSize: "13px", marginTop: "12px", background: "#f0fdf4", padding: "10px 12px", borderRadius: "8px", border: "1px solid #bbf7d0" }}>&#10004; {successCambioCorreo}</div>}
            </div>

            <div style={{ background: "#f8fafc", borderTop: "1px solid #e2e8f0", padding: "12px 20px", display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => {
                  setModalCambiarCorreo(false);
                  setPasoCambioCorreo(1);
                  setNuevoCorreo("");
                  setCodigoCorreoActual("");
                  setCodigoCorreoNuevo("");
                  setErrorCambioCorreo("");
                  setSuccessCambioCorreo("");
                }}
                style={{ padding: "8px 16px", background: "white", color: "#334155", border: "1px solid #cbd5e1", borderRadius: "8px", fontSize: "13px", cursor: "pointer", fontWeight: "600" }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PanelNegocio;
