import { useEffect, useState } from "react";
import { consultarRuc } from "../services/rucService";
import { consultarDni } from "../services/dniService";
import { crearOrdenFlow, verificarPagoFlow, obtenerConfiguracionPago } from "../services/pagoService";
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
  existeComprobanteParaSolicitud,
  eliminarComprobante,
} from "../services/comprobanteService";
import { abrirPdf, convertirPdfABase64, normalizarTexto } from "../services/pdfService";
import { crearNotificacion, marcarComoLeida, marcarTodasComoLeidas } from "../services/notificacionService";
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

function PanelNegocio({ seccion, cambiarSeccion }) {
  const { usuario } = useAuth();
  const MONTO_TRAMITE = 3;

  const getErrorMessage = (err) => {
    if (!err) return "Ocurrió un error inesperado";
    if (typeof err === "string") return err;
    if (err?.response?.data) {
      const d = err.response.data;
      if (typeof d === "string") return d;
      return d.detalle || d.error || d.message || JSON.stringify(d);
    }
    if (err?.message) return err.message;
    try { return JSON.stringify(err); } catch { return String(err); }
  };

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
  const [contrasenaActual, setContrasenaActual] = useState("");
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
    if (!contrasenaActual || contrasenaActual.length < 6) {
      setErrorCambioCorreo("Ingresa tu contraseña actual (mínimo 6 caracteres).");
      return;
    }
    setErrorCambioCorreo("");
    setSuccessCambioCorreo("");
    setCargandoCambioCorreo(true);
    try {
      await verificarOtpCorreoNuevo(usuario.correo, nuevoCorreo.trim().toLowerCase(), codigoCorreoNuevo);
      await actualizarCorreoDeUsuario(usuario.uid, nuevoCorreo.trim().toLowerCase(), contrasenaActual);
      
      setSuccessCambioCorreo("Correo electrónico actualizado correctamente.");
      setTimeout(() => {
        setModalCambiarCorreo(false);
        setPasoCambioCorreo(1);
        setNuevoCorreo("");
        setCodigoCorreoActual("");
        setCodigoCorreoNuevo("");
        setContrasenaActual("");
        setErrorCambioCorreo("");
        setSuccessCambioCorreo("");
      }, 3000);
    } catch (err) {
      setErrorCambioCorreo(err.message || "Código incorrecto o contraseña inválida.");
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

  const [solicitudDetalle, setSolicitudDetalle] = useState(null);
  const [detalleEnriquecido, setDetalleEnriquecido] = useState(null);
  const [filtroNoti, setFiltroNoti] = useState("nuevas");

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
  const [demoHabilitado, setDemoHabilitado] = useState(false);

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

  const obtenerProximoPaso = (s) => {
    if (s.estadoPago !== "Confirmado") {
      return {
        texto: "Debe realizar el pago del derecho de trámite de S/ 3.00 para continuar con la evaluación.",
        accion: "Pago Pendiente",
        clase: "pending",
        color: "#ef4444"
      };
    }
    if (["En revision", "En revisión", "En revision (Inspección)", "En revisión (Inspección)"].includes(s.estado)) {
      if (!s.fechaVisitaInspector) {
        return {
          texto: "Esperando programación de inspección técnica de seguridad por parte del personal de la municipalidad.",
          accion: "Evaluación en Proceso",
          clase: "review",
          color: "#f59e0b"
        };
      } else {
        return {
          texto: `Recibir al inspector de seguridad programado para el día ${s.fechaVisitaInspector} a las ${s.horaVisitaInspector || "08:00"}.`,
          accion: "Inspección Programada",
          clase: "review",
          color: "#f59e0b"
        };
      }
    }
    if (["Observado", "Observada"].includes(s.estado)) {
      return {
        texto: `Subsanar las observaciones indicadas por el inspector: ${s.observacionFuncionario || s.observacionInspector || ""}`,
        accion: "Subsanar Observaciones",
        clase: "pending",
        color: "#ef4444"
      };
    }
    if (["Licencia aprobada", "Licencia emitida", "Aprobado"].includes(s.estado)) {
      return {
        texto: "Su trámite ha finalizado exitosamente. Ya puede descargar e imprimir su Licencia de Funcionamiento.",
        accion: "Trámite Completado",
        clase: "success",
        color: "#10b981"
      };
    }
    if (["Licencia rechazada", "Rechazado", "Rechazada"].includes(s.estado)) {
      return {
        texto: `Trámite denegado. Motivo: ${s.observacionFuncionario || "No cumple con las normativas municipales."}`,
        accion: "Rechazado",
        clase: "pending",
        color: "#ef4444"
      };
    }
    return {
      texto: "Esperando validación de la solicitud en las oficinas municipales.",
      accion: "Revisión Inicial",
      clase: "review",
      color: "#64748b"
    };
  };

  const obtenerIconoNotificacion = (n) => {
    const t = (n.titulo || "").toLowerCase();
    const d = (n.descripcion || "").toLowerCase();
    if (t.includes("pago") || d.includes("pago")) return "💳";
    if (t.includes("comprobante") || d.includes("comprobante")) return "📄";
    if (t.includes("documento") || t.includes("archivo") || d.includes("documento")) return "📎";
    if (t.includes("solicitud") || t.includes("expediente") || d.includes("solicitud")) return "📝";
    return n.icono || "🔔";
  };

  const abrirNotificacion = async (n) => {
    if (!n.leida) {
      await marcarComoLeida(n.id);
    }
  };

  const marcarTodasLeidas = async () => {
    if (!usuario?.uid) return;
    await marcarTodasComoLeidas(usuario.uid);
  };

  useEffect(() => {
    if (!solicitudDetalle) {
      setDetalleEnriquecido(null);
      return;
    }

    const base = { ...solicitudDetalle };
    setDetalleEnriquecido(base);

    const tieneUbigeo = base.departamento || base.provincia || base.distrito;
    if (tieneUbigeo || !base.ruc) return;

    let cancelado = false;
    (async () => {
      try {
        const data = await consultarRuc(base.ruc);
        if (cancelado) return;
        setDetalleEnriquecido((prev) => ({
          ...prev,
          departamento: prev.departamento || data.departamento || "",
          provincia: prev.provincia || data.provincia || "",
          distrito: prev.distrito || data.distrito || "",
        }));
      } catch (e) {
        console.error("No se pudo enriquecer ubigeo:", e);
      }
    })();

    return () => { cancelado = true; };
  }, [solicitudDetalle?.id]);

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

  const confirmarPagoFlow = (datosPago = {}) => {
    setMetodoPago("Flow");
    setEstadoPago("Confirmado");
    setDetallePago((prev) => ({
      ...(prev || {}),
      ...datosPago,
      status: "approved",
      metodo: "flow",
    }));
  };

  const verificarPagoFlowToken = async (token) => {
    try {
      setProcesandoPago(true);
      const resultado = await verificarPagoFlow(token);

      if (resultado.status === 1) {
        const solicitudId = resultado.commerceOrder;
        console.log("[FLOW] Pago aprobado. commerceOrder:", solicitudId);

        try {
          await updateDoc(doc(db, "solicitudes", solicitudId), {
            estadoPago: "Confirmado",
            pago: "Confirmado",
            metodoPago: "Flow",
            comprobantePago: "Pago confirmado vía Flow",
            montoPagado: resultado.amount || MONTO_TRAMITE,
            pagoId: String(resultado.flowOrder || token),
            pagoEstadoDetalle: "approved",
            flowToken: token,
            actualizadoEn: new Date().toISOString(),
          });
          console.log("[FLOW] Solicitud actualizada en Firestore");
        } catch (fireErr) {
          console.error("[FLOW] Error actualizando Firestore:", fireErr);
        }

        localStorage.removeItem("flow_pago_pendiente");
        localStorage.removeItem("flow_pago_estado");

        alert("¡Pago confirmado correctamente! Tu solicitud EXP-" + solicitudId + " ha sido registrada.");
        cargarMisSolicitudes().catch(() => {});
        cambiarSeccion?.("mis-solicitudes");
      } else {
        setEstadoPago("Pendiente");
        localStorage.removeItem("flow_pago_pendiente");
      }
    } catch (error) {
      console.error("Error verificando pago Flow:", error);
      alert(getErrorMessage(error) || "No se pudo verificar el estado del pago.");
    } finally {
      setProcesandoPago(false);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const flowToken = params.get("token");

    if (flowToken) {
      localStorage.setItem("flow_pago_pendiente", JSON.stringify({
        id: flowToken,
        token: flowToken,
        status: "pending",
      }));
      verificarPagoFlowToken(flowToken);
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }

    const pagoGuardado = localStorage.getItem("flow_pago_pendiente");

    if (pagoGuardado) {
      try {
        const datosPago = JSON.parse(pagoGuardado);

        if (datosPago?.token) {
          verificarPagoFlowToken(datosPago.token);
        }
      } catch (error) {
        console.error("No se pudo leer el estado del pago de Flow.", error);
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
      let lista = await obtenerComprobantesPorUsuario(usuario?.uid);
      
      const solicitudesDeUsuario = misSolicitudes.length > 0 ? misSolicitudes : await obtenerSolicitudes(usuario?.uid);
      const solicitudesPagadas = solicitudesDeUsuario.filter(sol => sol.estadoPago === "Confirmado");
      
      let huboCambios = false;
      for (const sol of solicitudesPagadas) {
        const tieneComprobanteVisible = lista.some(comp => comp.id_solicitud === sol.id);
        if (tieneComprobanteVisible) continue;

        const existioComprobante = await existeComprobanteParaSolicitud(usuario?.uid, sol.id);
        if (existioComprobante) continue;

        console.log(`[COMPROBANTE AUTO-GEN] Generando comprobante faltante para solicitud: ${sol.id}`);
        const tipoFinal = sol.ruc?.startsWith("20") ? "factura" : "boleta";
        const dNombres = sol.nombresSolicitante || usuario?.nombre || "";
        const dApellidos = sol.apellidosSolicitante || "";
        
        await generarComprobante({
          uidUsuario: usuario?.uid || "",
          correoUsuario: usuario?.correo || "",
          idSolicitud: sol.id,
          tipo: tipoFinal,
          dniCliente: sol.dniSolicitante || usuario?.dni || "",
          nombresCliente: dNombres,
          apellidosCliente: dApellidos,
          rucCliente: sol.ruc || "",
          razonSocial: sol.razonSocial || "",
          direccionCliente: sol.direccion || "",
          descripcionPago: "Pago por derecho de trámite de licencia de funcionamiento",
          monto: MONTO_TRAMITE,
          metodoPago: sol.metodoPago || "Pago registrado",
          estadoPago: "Pagado",
          codigoOperacion: `DEMO-${Date.now().toString().slice(-8)}`
        });
        huboCambios = true;
      }
      
      if (huboCambios) {
        lista = await obtenerComprobantesPorUsuario(usuario?.uid);
      }
      
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

  const handleEliminarComprobante = async (comp) => {
    if (!window.confirm("¿Está seguro de eliminar este comprobante? No volverá a aparecer en esta lista.")) return;
    try {
      await eliminarComprobante(comp.id);
      setComprobantes((prev) => prev.filter((c) => c.id !== comp.id));
      alert("Comprobante eliminado correctamente.");
    } catch (error) {
      console.error("Error al eliminar comprobante:", error);
      alert("No se pudo eliminar el comprobante.");
    }
  };

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

      if (usuario?.uid && dniSolicitante.trim()) {
        try {
          await updateDoc(doc(db, "usuarios", usuario.uid), { dni: dniSolicitante.trim() });
        } catch (e) {
          console.error("No se pudo guardar DNI en perfil:", e);
        }
      }
    } catch (error) {
      console.error(error);
      const msg = error.message || "";
      if (msg.includes("no encontrado") || msg.includes("404")) {
        setErrorDni("DNI no encontrado. Verifique el número ingresado.");
      } else if (msg.includes("Failed to fetch") || msg.includes("conectar")) {
        setErrorDni("No se pudo conectar con el servidor backend. Asegúrese de que el backend esté ejecutándose (npm start o node backend/server.js).");
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
    obtenerConfiguracionPago().then(cfg => setDemoHabilitado(cfg.demoEnabled)).catch(() => {});
  };

  const iniciarPagoFlow = async () => {
    try {
      setProcesandoPago(true);

      const emailUsuario = usuario?.correo || usuario?.email || "";

      if (!emailUsuario || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailUsuario)) {
        alert(
          "Tu perfil no tiene un correo electrónico válido. Actualiza tu perfil antes de continuar con el pago."
        );
        cambiarSeccion?.("mi-cuenta");
        return;
      }

      const todosLosDocs = [
        docIdentidad, docFichaRuc, docAcreditaLocal, docPlano,
        docDj, docSanitario, docDigemid, docRepresentacion, docRepresentacionLegal, ...archivos,
      ].filter(Boolean);

      if (todosLosDocs.length === 0) {
        alert("Debe subir al menos un documento antes de continuar con el pago.");
        return;
      }

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

      console.log("[FLOW] Subiendo documentos...");
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
          console.error("[FLOW] Error subiendo archivo:", archivo.name, err);
          erroresSubida.push(`${archivo.name}: ${err.message}`);
        }
      }

      if (pdfsSubidos.length === 0) {
        const errorMsg = erroresSubida.length > 0
          ? `No se pudo subir ningún archivo:\n${erroresSubida.join("\n")}`
          : "No se pudo subir ningún archivo. Verifique su conexión e intente nuevamente.";
        alert(errorMsg);
        return;
      }

      const tipoContribuyente = form.ruc.startsWith("20") ? "Persona Jurídica" : "Persona Natural";

      console.log("[FLOW] Guardando solicitud...");
      const nueva = await conTimeout(
        guardarSolicitud({
          uidUsuario: usuario?.uid || "",
          correoUsuario: emailUsuario,
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
          metodoPago: "Flow",
          estadoPago: "Pendiente",
          comprobantePago: "Pago pendiente vía Flow",
          estado: "PENDIENTE_PAGO",
          inspeccion: "Sin inspección",
          recomendacionInspector: "", observacionInspector: "",
          evidenciasInspector: [], decisionFuncionario: "",
          observacionFuncionario: "", numeroLicencia: "",
          fechaAprobacion: "", fechaExpiracionLicencia: "",
          pagoId: "", pagoEstadoDetalle: "",
        }),
        15000,
        "Tiempo de espera agotado al registrar la solicitud."
      );

      console.log("[FLOW] Solicitud guardada:", nueva.id);

      await crearNotificacion(usuario?.uid, {
        titulo: "Solicitud registrada",
        descripcion: `Su solicitud EXP-${nueva.id} de Licencia de Funcionamiento se ha registrado correctamente. Pendiente de pago.`,
        icono: "📝",
      }, emailUsuario);

      const nombreCompleto = [usuario?.nombre, usuario?.apellido].filter(Boolean).join(" ") || "Ciudadano";

      console.log("[FLOW] Creando orden de pago con commerceOrder:", nueva.id);
      const resultado = await crearOrdenFlow({
        solicitudId: nueva.id,
        amount: 3,
        email: emailUsuario,
        buyerName: nombreCompleto,
        subject: "Derecho de trámite - Licencia Municipal",
      });

      localStorage.removeItem("flow_pago_pendiente");
      localStorage.setItem(
        "flow_pago_pendiente",
        JSON.stringify({
          token: resultado.token,
          solicitudId: nueva.id,
        })
      );

      window.location.href = resultado.paymentUrl || resultado.url;
    } catch (error) {
      console.error("[FLOW] Error:", error);
      alert(getErrorMessage(error) || "No se pudo iniciar el pago con Flow.");
    } finally {
      setProcesandoPago(false);
    }
  };

  const iniciarPagoCaja = () => {
    setMetodoPago("Pago presencial en caja");
    setEstadoPago("Pendiente de pago en caja");
    setDetallePago({
      id: "PENDIENTE-CAJA",
      status: "pending",
      metodo: "caja_municipal",
    });
    alert("Pago en caja seleccionado. Debe acercarse a la Municipalidad para realizar el pago de S/ 3.00 antes de que su solicitud sea procesada. Ya puedes enviar la solicitud.");
  };

  const iniciarPagoDemo = async () => {
    try {
      setProcesandoPago(true);

      const emailUsuario = usuario?.correo || usuario?.email || "";

      if (!emailUsuario || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailUsuario)) {
        alert(
          "Tu perfil no tiene un correo electrónico válido. Actualiza tu perfil antes de continuar."
        );
        cambiarSeccion?.("mi-cuenta");
        return;
      }

      const todosLosDocs = [
        docIdentidad, docFichaRuc, docAcreditaLocal, docPlano,
        docDj, docSanitario, docDigemid, docRepresentacion, docRepresentacionLegal, ...archivos,
      ].filter(Boolean);

      if (todosLosDocs.length === 0) {
        alert("Debe subir al menos un documento antes de continuar con el pago.");
        return;
      }

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

      console.log("[DEMO] Subiendo documentos...");
      const pdfsSubidos = [];
      for (const archivo of todosLosDocs) {
        try {
          const resultado = await conTimeout(
            convertirPdfABase64(archivo),
            15000,
            `Tiempo de espera agotado al subir el archivo ${archivo.name}.`
          );
          pdfsSubidos.push(resultado);
        } catch (err) {
          console.error("[DEMO] Error subiendo archivo:", archivo.name, err);
        }
      }

      if (pdfsSubidos.length === 0) {
        alert("No se pudo subir ningún archivo.");
        return;
      }

      const tipoContribuyente = form.ruc.startsWith("20") ? "Persona Jurídica" : "Persona Natural";

      console.log("[DEMO] Guardando solicitud...");
      const nueva = await conTimeout(
        guardarSolicitud({
          uidUsuario: usuario?.uid || "",
          correoUsuario: emailUsuario,
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
          metodoPago: "DEMO",
          estadoPago: "Confirmado",
          comprobantePago: "Pago simulado (DEMO)",
          fechaPago: new Date().toISOString(),
          estado: "PENDIENTE_PAGO",
          inspeccion: "Sin inspección",
          recomendacionInspector: "", observacionInspector: "",
          evidenciasInspector: [], decisionFuncionario: "",
          observacionFuncionario: "", numeroLicencia: "",
          fechaAprobacion: "", fechaExpiracionLicencia: "",
          pagoId: `DEMO-${Date.now().toString().slice(-8)}`,
          pagoEstadoDetalle: "approved_demo",
        }),
        15000,
        "Tiempo de espera agotado al registrar la solicitud."
      );

      console.log("[DEMO] Solicitud guardada:", nueva.id);

      await crearNotificacion(usuario?.uid, {
        titulo: "Solicitud registrada (Demo)",
        descripcion: `Su solicitud EXP-${nueva.id} ha sido registrada en modo demo. El pago ha sido simulado.`,
        icono: "🧪",
      }, emailUsuario);

      alert("Pago demo simulado correctamente. Tu solicitud EXP-" + nueva.id + " ha sido registrada.");
      cargarMisSolicitudes().catch(() => {});
      cambiarSeccion?.("mis-solicitudes");
    } catch (error) {
      console.error("[DEMO] Error:", error);
      alert(getErrorMessage(error) || "No se pudo procesar el pago demo.");
    } finally {
      setProcesandoPago(false);
    }
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
      }, usuario?.correo || "");

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
        }, usuario?.correo || "");

        await crearNotificacion(usuario?.uid, {
          titulo: "Comprobante generado",
          descripcion: `Se generó con éxito el comprobante ${comp.serie}-${comp.numero} de su pago.`,
          icono: "📄",
        }, usuario?.correo || "");
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
      alert(getErrorMessage(error) || "No se pudo guardar la solicitud. Intente nuevamente.");
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
    localStorage.removeItem("flow_pago_estado");
    localStorage.removeItem("flow_pago_pendiente");

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
    localStorage.removeItem("flow_pago_estado");
    localStorage.removeItem("flow_pago_pendiente");

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
              <span className="eyebrow">Portal Digital Ciudadano</span>
              <h1>WEB-MUNICIPAL</h1>
              <p>Gestiona tus solicitudes de licencia de funcionamiento de forma digital, rapida y transparente.</p>
            </div>
            <div className="hero-card">
              <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#dbeafe" }}>Derecho de tramite</span>
              <strong style={{ fontSize: "28px" }}>S/{MONTO_TRAMITE.toFixed(2)}</strong>
              <small style={{ color: "#bfdbfe" }}>Tasa unica de Licencia</small>
            </div>
          </div>

          <div className="dashboard-grid-modern" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            <div className="dashboard-card-modern">
              <div className="dashboard-card-icon-wrapper" style={{ background: "#eff6ff", color: "#2563eb" }}>📄</div>
              <div className="dashboard-card-info">
                <h3>Solicitudes activas</h3>
                <div className="count">{misSolicitudes.filter(s => !["Licencia aprobada", "Licencia emitida", "Aprobado", "Licencia rechazada", "Rechazado", "Rechazada"].includes(s.estado)).length}</div>
                <small style={{ fontSize: "11.5px", color: "#94a3b8" }}>Tramites en proceso</small>
              </div>
            </div>

            <div className="dashboard-card-modern">
              <div className="dashboard-card-icon-wrapper" style={{ background: "#fef3c7", color: "#d97706" }}>🔔</div>
              <div className="dashboard-card-info">
                <h3>Notificaciones</h3>
                <div className="count">{notificaciones.filter(n => !n.leida).length}</div>
                <small style={{ fontSize: "11.5px", color: "#94a3b8" }}>Mensajes nuevos</small>
              </div>
            </div>

            <div className="dashboard-card-modern">
              <div className="dashboard-card-icon-wrapper" style={{ background: (() => {
                const licActiva = misSolicitudes.find(s => ["Licencia aprobada", "Licencia emitida", "Aprobado"].includes(s.estado) && !licenciaVencida(s));
                if (licActiva) return "#f0fdf4";
                if (misSolicitudes.some(s => licenciaVencida(s))) return "#fef2f2";
                return "#f1f5f9";
              })(), color: (() => {
                const licActiva = misSolicitudes.find(s => ["Licencia aprobada", "Licencia emitida", "Aprobado"].includes(s.estado) && !licenciaVencida(s));
                if (licActiva) return "#16a34a";
                if (misSolicitudes.some(s => licenciaVencida(s))) return "#dc2626";
                return "#94a3b8";
              })() }}>🪪</div>
              <div className="dashboard-card-info">
                <h3>Licencia digital</h3>
                <div className="count" style={{ fontSize: "20px" }}>
                  {(() => {
                    const licActiva = misSolicitudes.find(s => ["Licencia aprobada", "Licencia emitida", "Aprobado"].includes(s.estado) && !licenciaVencida(s));
                    if (licActiva) return "Vigente";
                    if (misSolicitudes.some(s => licenciaVencida(s))) return "Vencida";
                    return "No disponible";
                  })()}
                </div>
                <small style={{ fontSize: "11.5px", color: "#94a3b8" }}>Estado de tu licencia</small>
              </div>
            </div>
          </div>

          {misSolicitudes.length > 0 && (() => {
            const activas = misSolicitudes.filter(s => !["Licencia aprobada", "Licencia emitida", "Aprobado", "Licencia rechazada", "Rechazado", "Rechazada"].includes(s.estado));
            const masReciente = activas[0] || misSolicitudes[0];
            const pasoInfo = obtenerProximoPaso(masReciente);
            const estadoVisible = obtenerEstadoVisible(masReciente);

            return (
              <div style={{ marginTop: "28px" }}>
                <div style={{
                  background: "linear-gradient(135deg, #f8fafc 0%, #eff6ff 100%)",
                  border: "1px solid #e2e8f0",
                  borderRadius: "16px",
                  padding: "24px",
                  display: "grid",
                  gap: "16px",
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <div style={{ width: "40px", height: "40px", borderRadius: "12px", background: "#1f3b57", display: "grid", placeItems: "center", color: "white", fontSize: "18px" }}>📋</div>
                      <div>
                        <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", color: "#64748b", letterSpacing: "0.05em" }}>Expediente mas reciente</span>
                        <h3 style={{ margin: 0, fontFamily: "monospace", fontSize: "16px", color: "#0f172a" }}>{masReciente.id}</h3>
                      </div>
                    </div>
                    <span className={`badge ${badgeClase(estadoVisible)}`} style={{ padding: "5px 12px", fontSize: "12px" }}>
                      {estadoVisible}
                    </span>
                  </div>

                  <div style={{ display: "grid", gap: "10px", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
                    <div style={{ background: "white", borderRadius: "10px", padding: "14px", border: "1px solid #e2e8f0" }}>
                      <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", color: "#64748b", letterSpacing: "0.05em" }}>Negocio</span>
                      <p style={{ margin: "4px 0 0", fontSize: "14px", fontWeight: 600, color: "#0f172a" }}>{masReciente.nombreNegocio || "Sin nombre"}</p>
                    </div>
                    <div style={{ background: "white", borderRadius: "10px", padding: "14px", border: "1px solid #e2e8f0" }}>
                      <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", color: "#64748b", letterSpacing: "0.05em" }}>Tipo de tramite</span>
                      <p style={{ margin: "4px 0 0", fontSize: "14px", fontWeight: 600, color: "#0f172a" }}>{masReciente.tipoTramite || "Nueva licencia"}</p>
                    </div>
                    <div style={{ background: "white", borderRadius: "10px", padding: "14px", border: "1px solid #e2e8f0" }}>
                      <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", color: "#64748b", letterSpacing: "0.05em" }}>Fecha de registro</span>
                      <p style={{ margin: "4px 0 0", fontSize: "14px", fontWeight: 600, color: "#0f172a" }}>{masReciente.fecha || "Sin fecha"}</p>
                    </div>
                  </div>

                  <div style={{
                    background: pasoInfo.clase === "success" ? "#f0fdf4" : pasoInfo.clase === "pending" ? "#fef2f2" : "#fffbeb",
                    border: `1px solid ${pasoInfo.clase === "success" ? "#bbf7d0" : pasoInfo.clase === "pending" ? "#fecaca" : "#fde68a"}`,
                    borderRadius: "12px",
                    padding: "16px 18px",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                      <span style={{ fontSize: "16px" }}>
                        {pasoInfo.clase === "success" ? "✅" : pasoInfo.clase === "pending" ? "⚠️" : "⏳"}
                      </span>
                      <span style={{ fontSize: "12px", fontWeight: 800, textTransform: "uppercase", color: pasoInfo.color, letterSpacing: "0.04em" }}>
                        Proximo paso: {pasoInfo.accion}
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: "13.5px", color: "#334155", lineHeight: 1.5 }}>{pasoInfo.texto}</p>
                  </div>

                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="btn-secundario"
                      style={{ fontSize: "13px", padding: "10px 18px", display: "flex", alignItems: "center", gap: "6px" }}
                      onClick={() => setSolicitudDetalle(masReciente)}
                    >
                      👁 Ver detalle
                    </button>
                    {["Licencia aprobada", "Licencia emitida", "Aprobado"].includes(masReciente.estado) && !licenciaVencida(masReciente) && (
                      <button
                        type="button"
                        className="btn-ok"
                        style={{ fontSize: "13px", padding: "10px 18px" }}
                        onClick={() => descargarLicencia(masReciente)}
                      >
                        📥 Descargar licencia
                      </button>
                    )}
                    {activas.length > 1 && (
                      <button
                        type="button"
                        className="btn-outline"
                        style={{ fontSize: "13px", padding: "10px 18px" }}
                        onClick={() => cambiarSeccion?.("mis-solicitudes")}
                      >
                        Ver todas ({activas.length})
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}

          {misSolicitudes.length === 0 && (
            <div style={{ marginTop: "28px", textAlign: "center", padding: "32px 20px", background: "#f8fafc", borderRadius: "16px", border: "1px dashed #e2e8f0" }}>
              <div style={{ width: "64px", height: "64px", borderRadius: "50%", background: "linear-gradient(135deg, #eff6ff, #dbeafe)", display: "grid", placeItems: "center", margin: "0 auto 14px", fontSize: "30px" }}>&#128196;</div>
              <h3 style={{ color: "#0f172a", fontSize: "16px", margin: "0 0 6px" }}>Sin solicitudes activas</h3>
              <p style={{ color: "#64748b", fontSize: "13.5px", margin: "0 0 18px", maxWidth: "360px", marginLeft: "auto", marginRight: "auto" }}>Registra tu primera solicitud de licencia de funcionamiento para comenzar el tramite.</p>
              <button
                type="button"
                className="btn-primary"
                style={{ fontSize: "14px", padding: "12px 28px" }}
                onClick={() => cambiarSeccion?.("nueva-solicitud")}
              >
                + Nueva solicitud
              </button>
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
              {misSolicitudes.map((s) => {
                const pasoInfo = obtenerProximoPaso(s);
                return (
                  <article className="solicitud-card" key={s.id} style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                    <div>
                      <div className="solicitud-card-header" style={{ marginBottom: "12px" }}>
                        <div>
                          <span style={{ fontSize: "11px", fontWeight: "700", textTransform: "uppercase", color: "#64748b", letterSpacing: "0.05em" }}>Expediente</span>
                          <h3 style={{ fontFamily: "monospace", fontSize: "18px", margin: "2px 0 0 0", color: "#0f172a" }}>{s.id}</h3>
                        </div>
                        <span className={`badge ${badgeClase(obtenerEstadoVisible(s))}`} style={{ padding: "4px 10px", fontSize: "11.5px" }}>
                          {obtenerEstadoVisible(s)}
                        </span>
                      </div>
                      
                      <div className="solicitud-card-body" style={{ background: "#f8fafc", padding: "14px", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "13px", display: "grid", gap: "6px" }}>
                        <p style={{ margin: 0 }}><strong>Tipo de Trámite:</strong> {s.tipoTramite || "Nueva licencia"}</p>
                        <p style={{ margin: 0 }}><strong>Negocio:</strong> {s.nombreNegocio}</p>
                        <p style={{ margin: 0 }}><strong>Fecha de Registro:</strong> {s.fecha}</p>
                      </div>

                      {/* Cuadro destacado de Próximo Paso */}
                      <div className={`proximo-paso-box ${pasoInfo.clase}`} style={{ margin: "14px 0" }}>
                        <div style={{ fontSize: "11px", fontWeight: "800", textTransform: "uppercase", color: pasoInfo.color, letterSpacing: "0.05em", marginBottom: "4px" }}>
                          Próximo Paso: {pasoInfo.accion}
                        </div>
                        <p style={{ margin: 0, fontSize: "12.5px", color: "#334155", lineHeight: 1.4 }}>{pasoInfo.texto}</p>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
                      <button 
                        type="button" 
                        className="btn-secundario" 
                        style={{ flex: 1, fontSize: "13px", padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
                        onClick={() => setSolicitudDetalle(s)}
                      >
                        👁 Ver detalle completo
                      </button>
                      
                      {["Licencia aprobada", "Licencia emitida", "Aprobado"].includes(s.estado) && !licenciaVencida(s) && (
                        <button 
                          type="button" 
                          className="btn-ok" 
                          style={{ fontSize: "13px", padding: "10px 14px" }}
                          onClick={() => descargarLicencia(s)}
                        >
                          📥 Licencia
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {seccion === "notificaciones" && (
        <section className="section-card section-card-modern">
          <div className="section-header" style={{ marginBottom: "16px" }}>
            <div>
              <h2>Centro de notificaciones</h2>
              <p>Actualizaciones sobre tus solicitudes y comprobantes en la plataforma.</p>
            </div>
            {notificaciones.some(n => !n.leida) && (
              <button
                type="button"
                className="btn-outline"
                style={{ fontSize: "12px", padding: "8px 16px", whiteSpace: "nowrap" }}
                onClick={marcarTodasLeidas}
              >
                ✓ Marcar todas como leídas
              </button>
            )}
          </div>

          <div className="noti-tabs">
            <button 
              className={`noti-tab-btn ${filtroNoti === "nuevas" ? "active" : ""}`}
              onClick={() => setFiltroNoti("nuevas")}
            >
              Nuevas ({notificaciones.filter(n => !n.leida).length})
            </button>
            <button 
              className={`noti-tab-btn ${filtroNoti === "leidas" ? "active" : ""}`}
              onClick={() => setFiltroNoti("leidas")}
            >
              Leídas ({notificaciones.filter(n => n.leida).length})
            </button>
          </div>

          {cargandoNotificaciones ? (
            <div className="empty-state">
              <div className="spinner" style={{ margin: "0 auto 10px" }} />
              <h3>Cargando notificaciones...</h3>
            </div>
          ) : (() => {
            const listado = notificaciones.filter(n => filtroNoti === "nuevas" ? !n.leida : n.leida);
            if (listado.length === 0) {
              return (
                <div className="empty-state empty-state-modern">
                  <div style={{ width: "80px", height: "80px", borderRadius: "50%", background: "linear-gradient(135deg, #dbeafe, #93c5fd)", display: "grid", placeItems: "center", margin: "0 auto 16px", fontSize: "36px" }}>🔔</div>
                  <h3>No tienes notificaciones {filtroNoti === "nuevas" ? "nuevas" : "leídas"}</h3>
                  <p>Cuando haya novedades sobre tu trámite, aparecerán en esta sección.</p>
                </div>
              );
            }
            return (
              <div style={{ display: "grid", gap: "10px" }}>
                {listado.map((n) => {
                  const icono = obtenerIconoNotificacion(n);
                  const esNueva = !n.leida;
                  return (
                    <div
                      key={n.id}
                      onClick={() => abrirNotificacion(n)}
                      style={{
                        padding: "14px 18px",
                        border: `1px solid ${esNueva ? "#bfdbfe" : "#e2e8f0"}`,
                        borderLeft: esNueva ? "4px solid #2563eb" : "4px solid transparent",
                        borderRadius: "10px",
                        background: esNueva ? "#f0f9ff" : "#f8fafc",
                        cursor: "pointer",
                        transition: "all 0.2s ease",
                        opacity: esNueva ? 1 : 0.75,
                      }}
                    >
                      <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                        <span style={{ 
                          fontSize: "18px", 
                          flexShrink: 0,
                          width: "36px",
                          height: "36px",
                          background: esNueva ? "#dbeafe" : "#f1f5f9",
                          borderRadius: "8px",
                          display: "grid",
                          placeItems: "center"
                        }}>{icono}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
                            <strong style={{ color: esNueva ? "#0f172a" : "#64748b", fontSize: "13.5px" }}>{n.titulo}</strong>
                            <span style={{
                              fontSize: "10px",
                              fontWeight: "800",
                              textTransform: "uppercase",
                              padding: "2px 8px",
                              borderRadius: "999px",
                              flexShrink: 0,
                              background: esNueva ? "#dbeafe" : "#f1f5f9",
                              color: esNueva ? "#1e40af" : "#94a3b8",
                            }}>
                              {esNueva ? "Nueva" : "Leída"}
                            </span>
                          </div>
                          <p style={{ margin: "3px 0 4px", fontSize: "13px", color: esNueva ? "#334155" : "#94a3b8", lineHeight: 1.4 }}>{n.descripcion}</p>
                          <small style={{ color: "#94a3b8", fontSize: "11.5px" }}>
                            {new Date(n.fecha_hora).toLocaleString("es-PE")}
                            {n.fechaLectura && ` · Leída el ${new Date(n.fechaLectura).toLocaleString("es-PE")}`}
                          </small>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
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
                              <h4 style={{ margin: "0 0 6px", color: "#14532d", fontSize: "14px" }}>Pago en línea con Flow</h4>
                              <p style={{ color: "#475569", lineHeight: "1.5", fontSize: "13px", margin: "0 0 10px" }}>Red segura de pago. Se te redirigirá para completar el pago.</p>
                              <button type="button" className="btn-pago btn-full" onClick={iniciarPagoFlow} disabled={procesandoPago} style={{ fontSize: "13px" }}>{procesandoPago ? "Generando..." : "Pagar con Flow"}</button>
                            </div>
                            <div style={{ border: "1px solid #cbd5e1", background: "#f8fafc", borderRadius: "14px", padding: "18px" }}>
                              <div style={{ fontSize: "26px", marginBottom: "6px" }}>&#127970;</div>
                              <h4 style={{ margin: "0 0 6px", color: "#334155", fontSize: "14px" }}>Pago presencial en caja</h4>
                              <p style={{ color: "#475569", lineHeight: "1.5", fontSize: "13px", margin: "0 0 10px" }}>Paga en la Municipalidad.</p>
                              <button type="button" className="btn-outline btn-full" onClick={iniciarPagoCaja} disabled={procesandoPago} style={{ fontSize: "13px" }}>Seleccionar caja</button>
                            </div>
                            {demoHabilitado && (
                            <div style={{ border: "1px solid #e9d5ff", background: "#faf5ff", borderRadius: "14px", padding: "18px" }}>
                              <div style={{ fontSize: "26px", marginBottom: "6px" }}>&#129513;</div>
                              <h4 style={{ margin: "0 0 6px", color: "#6b21a8", fontSize: "14px" }}>Pago Demo (simulación)</h4>
                              <p style={{ color: "#475569", lineHeight: "1.5", fontSize: "13px", margin: "0 0 10px" }}>Simula un pago aprobado sin costo. Solo para pruebas.</p>
                              <button type="button" className="btn-outline btn-full" onClick={iniciarPagoDemo} disabled={procesandoPago} style={{ fontSize: "13px", color: "#6b21a8", borderColor: "#d8b4fe" }}>Simular pago Demo</button>
                            </div>
                            )}
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
                <p><strong>Estado de pago:</strong> {estadoPago === "Confirmado" ? "PAGADO" : estadoPago}</p>
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
              <div className="spinner" style={{ margin: "0 auto 10px" }} />
              <h3>Cargando comprobantes...</h3>
            </div>
          ) : comprobantes.length === 0 ? (
            <div className="empty-state empty-state-modern">
              <div style={{ width: "80px", height: "80px", borderRadius: "50%", background: "linear-gradient(135deg, #fef3c7, #fde68a)", display: "grid", placeItems: "center", margin: "0 auto 16px", fontSize: "36px" }}>&#128196;</div>
              <h3>No tienes pagos registrados</h3>
              <p>Cuando realices el pago de una solicitud, tu comprobante aparecerá aquí.</p>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "16px" }}>
              {comprobantes.map((comp) => {
                const esPagado = comp.estado === "Pagado" || comp.estado === "emitido" || comp.estado === "Emitido";
                return (
                  <div key={comp.id_comprobante} style={{
                    padding: "24px",
                    borderRadius: "16px",
                    border: "1px solid #e2e8f0",
                    background: "#ffffff",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.03)",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    gap: "16px"
                  }}>
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                        <span style={{
                          fontFamily: "monospace",
                          fontWeight: "800",
                          color: "#1e3a8a",
                          fontSize: "14.5px"
                        }}>
                          {comp.tipo_comprobante === "boleta" ? "BOLETA" : "FACTURA"} {comp.serie}-{comp.numero}
                        </span>
                        <span style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          padding: "4px 10px",
                          borderRadius: "999px",
                          fontSize: "11px",
                          fontWeight: "800",
                          background: esPagado ? "#dcfce7" : "#fef3c7",
                          color: esPagado ? "#15803d" : "#b45309"
                        }}>
                          {esPagado ? "✅ Pagado" : "⏳ Pendiente"}
                        </span>
                      </div>
                      
                      <div style={{ display: "grid", gap: "6px", fontSize: "13px", color: "#475569" }}>
                        <p style={{ margin: 0 }}><strong>Código Solicitud:</strong> <span style={{ fontFamily: "monospace" }}>{comp.id_solicitud}</span></p>
                        <p style={{ margin: 0 }}><strong>Fecha de Emisión:</strong> {comp.fecha_emision} {comp.hora_emision || ""}</p>
                        <p style={{ margin: 0 }}><strong>Método de Pago:</strong> {comp.metodo_pago}</p>
                        <p style={{ margin: 0 }}><strong>Operación:</strong> <span style={{ fontFamily: "monospace" }}>{comp.codigo_operacion || "N/A"}</span></p>
                      </div>
                    </div>

                    <div style={{ borderTop: "1px dashed #e2e8f0", paddingTop: "14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <span style={{ fontSize: "11px", color: "#94a3b8", display: "block" }}>MONTO TOTAL</span>
                        <strong style={{ fontSize: "20px", color: "#166534" }}>S/ {Number(comp.monto_total || comp.monto).toFixed(2)}</strong>
                      </div>
                      <div style={{ display: "flex", gap: "6px" }}>
                        <button
                          type="button"
                          className="btn-outline"
                          style={{ fontSize: "12px", padding: "6px 12px", borderRadius: "8px" }}
                          onClick={() => setModalComprobante(comp)}
                        >
                          👁 Ver
                        </button>
                        <button
                          type="button"
                          className="btn-ok"
                          style={{ fontSize: "12px", padding: "6px 12px", borderRadius: "8px" }}
                          onClick={() => descargarComprobante(comp)}
                        >
                          📥 Descargar
                        </button>
                        <button
                          type="button"
                          style={{ fontSize: "12px", padding: "6px 12px", borderRadius: "8px", background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca", cursor: "pointer", fontWeight: "600" }}
                          onClick={() => handleEliminarComprobante(comp)}
                        >
                          🗑
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
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

              {/* PASO 3: Ingresar código del nuevo correo + contraseña */}
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
                  <div>
                    <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "#475569", marginBottom: "6px" }}>Contraseña actual (para confirmar identidad)</label>
                    <input
                      type="password"
                      required
                      placeholder="Tu contraseña actual"
                      value={contrasenaActual}
                      onChange={(e) => setContrasenaActual(e.target.value)}
                      style={{ width: "100%", padding: "10px 12px", border: "1px solid #cbd5e1", borderRadius: "8px", fontSize: "14px", boxSizing: "border-box" }}
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

      {/* MODAL DETALLE DE EXPEDIENTE */}
      {solicitudDetalle && (() => {
        const d = detalleEnriquecido || solicitudDetalle;
        return (
        <div className="modal-backdrop-modern" onClick={() => setSolicitudDetalle(null)}>
          <div className="modal-content-modern" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-modern">
              <div>
                <span style={{ fontSize: "11px", fontWeight: "700", textTransform: "uppercase", color: "#64748b", letterSpacing: "0.05em" }}>Expediente Completo</span>
                <h2 style={{ fontFamily: "monospace", fontSize: "18px" }}>{solicitudDetalle.id}</h2>
              </div>
              <button className="modal-close-btn" onClick={() => setSolicitudDetalle(null)}>&#10005;</button>
            </div>
            
            <div className="modal-body-modern">
              
              {/* Tarjeta 1: Información General */}
              <div className="detail-section-card">
                <h3 className="detail-section-title">🏢 Información General del Establecimiento</h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px 24px", fontSize: "13px" }}>
                  <p style={{ margin: 0 }}><strong>RUC:</strong> {d.ruc}</p>
                  <p style={{ margin: 0 }}><strong>Razón Social:</strong> {normalizarTexto(d.razonSocial) || "N/A"}</p>
                  <p style={{ margin: 0 }}><strong>Nombre de Negocio:</strong> {normalizarTexto(d.nombreNegocio) || "N/A"}</p>
                  <p style={{ margin: 0 }}><strong>Giro Comercial:</strong> {normalizarTexto(d.giro) || "N/A"}</p>
                  <p style={{ margin: 0 }}><strong>Dirección:</strong> {normalizarTexto(d.direccion) || "N/A"}</p>
                  <p style={{ margin: 0 }}>
                    <strong>Ubigeo:</strong>{" "}
                    {[d.departamento, d.provincia, d.distrito]
                      .filter(Boolean)
                      .join(" - ") || "No registrado"}
                  </p>
                </div>
                <hr style={{ border: "none", borderTop: "1px solid #e2e8f0", margin: "16px 0 12px" }} />
                <h4 style={{ fontSize: "13px", fontWeight: "700", color: "#475569", margin: "0 0 10px", textTransform: "uppercase", letterSpacing: "0.04em" }}>Datos del Solicitante</h4>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px 24px", fontSize: "13px" }}>
                  <p style={{ margin: 0 }}>
                    <strong>DNI:</strong>{" "}
                    {d.dniSolicitante || usuario?.dni || "No registrado"}
                  </p>
                  <p style={{ margin: 0 }}>
                    <strong>Nombres Solicitante:</strong>{" "}
                    {[d.nombresSolicitante, d.apellidosSolicitante].filter(Boolean).join(" ") || usuario?.nombre || "N/A"}
                  </p>
                  <p style={{ margin: 0 }}>
                    <strong>Correo Electrónico:</strong>{" "}
                    {d.correoUsuario || usuario?.correo || "N/A"}
                  </p>
                </div>
              </div>

              {/* Tarjeta 2: Información de Pago */}
              <div className="detail-section-card">
                <h3 className="detail-section-title">💳 Estado de Pago</h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px 24px", fontSize: "13px" }}>
                  <p style={{ margin: 0 }}>
                    <strong>Estado del Pago:</strong>{" "}
                    <span style={{ 
                      padding: "2px 8px", 
                      borderRadius: "999px", 
                      fontSize: "11px", 
                      fontWeight: "700",
                      background: d.estadoPago === "Confirmado" ? "#dcfce7" : "#fee2e2",
                      color: d.estadoPago === "Confirmado" ? "#166534" : "#991b1b"
                    }}>
                      {d.estadoPago === "Confirmado" ? "Confirmado" : d.estadoPago || "Pendiente"}
                    </span>
                  </p>
                  <p style={{ margin: 0 }}><strong>Monto Pagado:</strong> S/ {Number(d.montoPagado || 3).toFixed(2)}</p>
                  <p style={{ margin: 0 }}><strong>Método de Pago:</strong> {d.metodoPago || "No registrado"}</p>
                  <p style={{ margin: 0 }}><strong>Código Operación:</strong> {d.pagoId || "N/A"}</p>
                </div>
              </div>

              {/* Tarjeta 3: Documentos Adjuntados */}
              <div className="detail-section-card">
                <h3 className="detail-section-title">📄 Documentos Adjuntos</h3>
                {(!d.archivosPdf || d.archivosPdf.filter(pdf => pdf && pdf.archivoUrl).length === 0) ? (
                  <p style={{ margin: 0, fontSize: "13px", color: "#64748b", fontStyle: "italic" }}>No hay documentos disponibles</p>
                ) : (
                  <div className="file-grid">
                    {d.archivosPdf.filter(pdf => pdf && pdf.archivoUrl).map((pdf, idx) => (
                      <div className="file-card-modern" key={pdf.documentId || idx}>
                        <div className="file-card-icon">📄</div>
                        <div className="file-card-info">
                          <p className="name" title={pdf.archivoNombre || `Documento ${idx + 1}`}>{pdf.archivoNombre || `Documento ${idx + 1}`}</p>
                          <p className="meta">{pdf.tipo === "application/pdf" ? "Archivo PDF" : "Documento"} • {pdf.tamaño ? `${(pdf.tamaño / 1024 / 1024).toFixed(2)} MB` : "Verificado"}</p>
                        </div>
                        <a 
                          href="#"
                          onClick={(e) => { e.preventDefault(); abrirPdf(pdf.archivoUrl); }}
                          className="file-card-btn"
                        >
                          Ver documento
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Tarjeta 4: Estado del Trámite & Timeline */}
              <div className="detail-section-card">
                <h3 className="detail-section-title">⏳ Historial y Estado del Trámite</h3>
                <div style={{ padding: "10px 0" }}>
                  <Timeline solicitud={d} />
                </div>
              </div>

              {/* Observación / Rechazo / Motivo si aplica */}
              {["Licencia rechazada", "Rechazado", "Observado", "Observada"].includes(d.estado) && (
                <div className="detail-section-card" style={{ background: "#fff5f5", border: "1px solid #fecaca" }}>
                  <h3 className="detail-section-title" style={{ color: "#991b1b" }}>⚠️ Observaciones de la Municipalidad</h3>
                  <p style={{ margin: 0, fontSize: "13.5px", color: "#991b1b", lineHeight: 1.5 }}>
                    {d.observacionFuncionario || d.observacionInspector || "Revisión técnica pendiente de subsanación."}
                  </p>
                </div>
              )}

              {/* Acciones principales en el pie del expediente */}
              <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "10px", borderTop: "1px solid #e2e8f0", paddingTop: "18px" }}>
                <button type="button" className="btn-outline" onClick={() => setSolicitudDetalle(null)}>
                  Cerrar Detalles
                </button>
                {["Licencia aprobada", "Licencia emitida", "Aprobado"].includes(d.estado) && (
                  <>
                    {!licenciaVencida(d) && (
                      <button type="button" className="btn-ok" onClick={() => descargarLicencia(d)}>
                        Descargar Licencia
                      </button>
                    )}
                    <button type="button" className="btn-secundario" onClick={() => { setSolicitudDetalle(null); renovarLicencia(d); }}>
                      Renovar Licencia
                    </button>
                  </>
                )}
              </div>
              
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  );
}

export default PanelNegocio;
