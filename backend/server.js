import express from "express";
import cors from "cors";
import axios from "axios";
import crypto from "crypto";
import dotenv from "dotenv";
import nodemailer from "nodemailer";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import fs from "fs";
import { smsProvider } from "./smsProvider.js";
import { emailProvider } from "./emailProvider.js";
import { initializeApp } from "firebase/app";
import { initializeFirestore, doc, getDoc, getDocs, setDoc, updateDoc, collection, serverTimestamp } from "firebase/firestore";



const __filename = fileURLToPath(import.meta.url);

const MUNICIPALIDAD_CONFIG = {
  nombre: "WEB-MUNICIPAL",
  correo: "webmunicipal01@gmail.com",
  url: "https://web-municipal-1.onrender.com",
  sistemaNombre: "Sistema de Licencias v1.0"
};
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, ".env") });
const distPath = join(__dirname, "..", "dist");

const app = express();

app.use(cors());
app.use(express.json());

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
};

const firebaseApp = initializeApp(firebaseConfig);
const db = initializeFirestore(firebaseApp, {
  experimentalForceLongPolling: true,
  ignoreUndefinedProperties: true,
});

const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY;

const verificarToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token de autenticación requerido." });
  }

  const idToken = authHeader.split("Bearer ")[1];

  try {
    const response = await axios.post(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`,
      { idToken },
      { timeout: 8000 }
    );

    const users = response.data.users;
    if (!users || users.length === 0) {
      return res.status(401).json({ error: "Token inválido o expirado." });
    }

    req.usuarioFirebase = {
      uid: users[0].localId,
      email: users[0].email,
    };

    next();
  } catch (error) {
    console.error("[AUTH] Error verificando token:", error.response?.data?.error?.message || error.message);
    return res.status(401).json({ error: "Token inválido o expirado." });
  }
};

const PORT = process.env.PORT || 3000;

const TOKEN_DECOLECTA =
  process.env.DECOLECTA_TOKEN;

const FLOW_API_KEY = process.env.FLOW_API_KEY || "";
const FLOW_SECRET_KEY = process.env.FLOW_SECRET_KEY || "";
const FLOW_BASE_URL =
  process.env.FLOW_ENV === "production"
    ? "https://www.flow.cl/api"
    : "https://sandbox.flow.cl/api";

const MONTO_TRAMITE = 3;

console.log("═══════════════════════════════════════════════");
console.log("  FLOW PAYMENT GATEWAY — DIAGNÓSTICO");
console.log("═══════════════════════════════════════════════");
console.log("[FLOW] FLOW_ENV:", process.env.FLOW_ENV || "(no definido)");
console.log("[FLOW] Base URL:", FLOW_BASE_URL);
console.log("");
console.log("[FLOW] FLOW_API_KEY:");
console.log("  - Cargada:", !!FLOW_API_KEY);
console.log("  - Longitud:", FLOW_API_KEY.length);
console.log("  - Primeros 6:", FLOW_API_KEY.substring(0, 6));
console.log("  - Últimos 4:", FLOW_API_KEY.substring(FLOW_API_KEY.length - 4));
console.log("  - Formato UUID:", /^\w{8}-\w{4}-\w{4}-\w{4}-\w{12}$/.test(FLOW_API_KEY) ? "VÁLIDO" : "INVÁLIDO");
console.log("");
console.log("[FLOW] FLOW_SECRET_KEY:");
console.log("  - Cargada:", !!FLOW_SECRET_KEY);
console.log("  - Longitud:", FLOW_SECRET_KEY.length);
console.log("  - Últimos 4:", FLOW_SECRET_KEY.substring(FLOW_SECRET_KEY.length - 4));
console.log("  - Solo hex:", /^[0-9a-fA-F]+$/.test(FLOW_SECRET_KEY) ? "SÍ" : "NO");
console.log("═══════════════════════════════════════════════");

const SMTP_EMAIL = process.env.SMTP_EMAIL || "";
const SMTP_PASSWORD = process.env.SMTP_PASSWORD || "";

console.log("=== SERVIDOR MUNICIPAL ===");
console.log("PORT:", PORT);
console.log("SMTP EMAIL:", SMTP_EMAIL ? "Configurado" : "No configurado");
console.log("DIST path:", distPath);
console.log("DIST exists:", fs.existsSync(distPath));

const transporter = SMTP_EMAIL && SMTP_PASSWORD
  ? nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: {
        user: SMTP_EMAIL,
        pass: SMTP_PASSWORD,
      },
    })
  : null;

if (transporter) {
  transporter.verify().then(() => {
    console.log("SMTP: Conexion verificada correctamente");
  }).catch((err) => {
    console.error("SMTP: Error de conexion:", err.message);
  });
}

/* =========================
   API ROUTES
========================= */

const generarIdExpediente = () => {
  return "EXP-" + Date.now().toString().slice(-8);
};

const promiseWithTimeout = (promise, ms, timeoutMessage) => {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), ms);
  });
  return Promise.race([
    promise.then((res) => {
      clearTimeout(timeoutId);
      return res;
    }),
    timeoutPromise,
  ]);
};

app.post("/api/solicitudes", verificarToken, async (req, res) => {
  console.log("=== ENDPOINT POST /api/solicitudes ===");
  try {
    const solicitud = req.body;
    const id = generarIdExpediente();
    const archivosPdfRaw = solicitud.archivosPdf || [];
    const archivosPdf = archivosPdfRaw.map((pdf, idx) => ({
      ...pdf,
      userId: solicitud.uidUsuario || "",
      solicitudId: id,
      documentId: pdf.publicId || `doc-${id}-${idx}-${Math.random().toString(36).substr(2, 5)}`
    }));

    const nuevaSolicitud = {
      id,
      fecha: new Date().toLocaleString("es-PE"),
      creadoEn: serverTimestamp(),
      actualizadoEn: serverTimestamp(),

      uidUsuario: solicitud.uidUsuario || "",
      correoUsuario: solicitud.correoUsuario || "",
      nombreSolicitante: solicitud.nombreSolicitante || "",
      telefonoSolicitante: solicitud.telefonoSolicitante || "",

      dniSolicitante: solicitud.dniSolicitante || "",
      nombresSolicitante: solicitud.nombresSolicitante || "",
      apellidosSolicitante: solicitud.apellidosSolicitante || "",

      canalRegistro: solicitud.canalRegistro || "online",

      tipoTramite: solicitud.tipoTramite || "Nueva licencia",

      ruc: solicitud.ruc || "",
      nombreNegocio: solicitud.nombreNegocio || "",
      razonSocial: solicitud.razonSocial || "",
      direccion: solicitud.direccion || "",
      giro: solicitud.giro || "",
      estadoSunat: solicitud.estadoSunat || "",
      condicionSunat: solicitud.condicionSunat || "",

      departamento: solicitud.departamento || "",
      provincia: solicitud.provincia || "",
      distrito: solicitud.distrito || "",

      archivosPdf,

      archivo: solicitud.archivoNombre || archivosPdf[0]?.archivoNombre || "Sin archivo",
      archivoNombre: solicitud.archivoNombre || archivosPdf[0]?.archivoNombre || "Sin archivo",
      archivoUrl: solicitud.archivoUrl || archivosPdf[0]?.archivoUrl || "",

      metodoPago: solicitud.metodoPago || "",
      estadoPago: solicitud.estadoPago || "Pendiente de validacion",
      pago: solicitud.pago || solicitud.estadoPago || "Pendiente de validacion",
      comprobantePago: solicitud.comprobantePago || "",
      montoPagado: solicitud.montoPagado || 0,

      estado: solicitud.estado || "PENDIENTE_PAGO",

      fechaVisitaInspector: solicitud.fechaVisitaInspector || "",
      programadoPor: solicitud.programadoPor || "",
      nombreProgramador: solicitud.nombreProgramador || "",

      inspeccion: solicitud.inspeccion || "Sin inspeccion",
      resultadoInspeccion: solicitud.resultadoInspeccion || "",

      observacion: solicitud.observacion || "",
      observacionInspector: solicitud.observacionInspector || "",
      recomendacionInspector: solicitud.recomendacionInspector || "",
      evidenciasInspector: solicitud.evidenciasInspector || [],
      fechaInspeccion: solicitud.fechaInspeccion || "",

      cantidadReobservaciones: solicitud.cantidadReobservaciones || 0,
      historialReobservaciones: solicitud.historialReobservaciones || [],

      decisionFuncionario: solicitud.decisionFuncionario || "",
      observacionFuncionario: solicitud.observacionFuncionario || "",
      fechaDecisionFuncionario: solicitud.fechaDecisionFuncionario || "",

      numeroLicencia: solicitud.numeroLicencia || "",
      fechaAprobacion: solicitud.fechaAprobacion || "",
      fechaExpiracionLicencia: solicitud.fechaExpiracionLicencia || "",
      fechaVencimiento: solicitud.fechaVencimiento || "",
      licenciaVigente: solicitud.licenciaVigente || false,
      licenciaRenovada: solicitud.licenciaRenovada || false,
      fechaRenovacion: solicitud.fechaRenovacion || "",
      resultadoFinal: solicitud.resultadoFinal || "",

      licenciaAnterior: solicitud.licenciaAnterior || "",
      qrVerificacion: solicitud.qrVerificacion || "",

      pagoId: solicitud.pagoId || "",
      pagoEstadoDetalle: solicitud.pagoEstadoDetalle || "",

      notificaciones: solicitud.notificaciones || [],
    };

    // Save to Firestore with timeout
    await promiseWithTimeout(
      setDoc(doc(db, "solicitudes", id), nuevaSolicitud),
      12000,
      "Tiempo de espera agotado al guardar la solicitud en Firestore."
    );

    // Save or update business local relationship in negocios collection
    if (solicitud.ruc && solicitud.uidUsuario) {
      try {
        await promiseWithTimeout(
          setDoc(doc(db, "negocios", solicitud.ruc), {
            ruc: solicitud.ruc,
            uidUsuario: solicitud.uidUsuario,
            razonSocial: solicitud.razonSocial || "",
            nombreNegocio: solicitud.nombreNegocio || "",
            direccion: solicitud.direccion || "",
            giro: solicitud.giro || "",
            estadoSunat: solicitud.estadoSunat || "",
            condicionSunat: solicitud.condicionSunat || "",
            actualizadoEn: serverTimestamp(),
          }, { merge: true }),
          8000,
          "Tiempo de espera agotado al guardar el negocio en Firestore."
        );
        console.log("[DEBUG Backend] Negocio guardado/vinculado:", solicitud.ruc);
      } catch (e) {
        console.error("[DEBUG Backend] Error vinculando local de negocio:", e.message);
      }
    }

    console.log("[DEBUG Backend] Solicitud guardada con ID:", id);

    return res.status(200).json({
      success: true,
      message: "Solicitud guardada correctamente",
      idSolicitud: id,
    });
  } catch (error) {
    console.error("=== ERROR GUARDANDO SOLICITUD EN BACKEND ===");
    console.error("Mensaje:", error.message);
    return res.status(500).json({
      success: false,
      message: "Error al guardar la solicitud en la base de datos.",
      error: error.message || "Error desconocido",
      detalle: error.message,
    });
  }
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    smtp: SMTP_EMAIL ? "configurado" : "no configurado",
    decolecta: TOKEN_DECOLECTA ? "configurado" : "no configurado",
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/documento-proxy", verificarToken, async (req, res) => {
  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({ error: "Parámetro 'url' requerido." });
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch {
      return res.status(400).json({ error: "URL inválida." });
    }

    const allowedHosts = ["res.cloudinary.com", "firebasestorage.googleapis.com"];
    if (!allowedHosts.includes(parsedUrl.hostname)) {
      return res.status(403).json({ error: "Dominio no permitido." });
    }

    const response = await axios.get(url, {
      responseType: "stream",
      timeout: 15000,
      headers: { Accept: "*/*" },
    });

    const contentType = response.headers["content-type"] || "application/octet-stream";
    const contentLength = response.headers["content-length"];

    res.setHeader("Content-Type", contentType);
    if (contentLength) {
      res.setHeader("Content-Length", contentLength);
    }
    res.setHeader("Cache-Control", "private, max-age=300");
    res.setHeader("Access-Control-Allow-Origin", "*");

    response.data.pipe(res);
  } catch (error) {
    console.error("=== ERROR EN PROXY DE DOCUMENTO ===");
    console.error("URL:", req.query.url);
    console.error("Status:", error.response?.status);
    console.error("Message:", error.message);

    if (error.response?.status === 404) {
      return res.status(404).json({ error: "El documento no fue encontrado en el servidor remoto." });
    }
    if (error.response?.status === 401 || error.response?.status === 403) {
      return res.status(401).json({ error: "El documento no está disponible actualmente." });
    }

    res.status(502).json({ error: "No se pudo obtener el documento. Intente más tarde." });
  }
});

app.get("/api/consultar-dni/:dni", async (req, res) => {
  console.log("=== ENDPOINT /api/consultar-dni ===");
  console.log("DNI recibido:", req.params.dni);

  try {
    const { dni } = req.params;

    if (!/^\d{8}$/.test(dni)) {
      console.log("DNI con formato inválido:", dni);
      return res.status(400).json({ error: "El DNI debe tener exactamente 8 dígitos." });
    }

    if (!TOKEN_DECOLECTA) {
      console.error("DECOLECTA_TOKEN no configurado");
      return res.status(500).json({ error: "Servicio de consulta no configurado. Token faltante." });
    }

    const targetUrl = `https://api.decolecta.com/v1/reniec/dni?numero=${dni}`;
    console.log("URL consultada:", targetUrl);

    const response = await axios.get(
      targetUrl,
      {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${TOKEN_DECOLECTA}`,
        },
      }
    );

    console.log("Código HTTP recibido:", response.status);
    console.log("Respuesta completa de Decolecta:", JSON.stringify(response.data, null, 2));

    const resBody = response.data;
    const data = resBody.data || resBody;

    if (!data || !data.document_number) {
      console.log("No se encontró document_number en la respuesta de Decolecta.");
      return res.status(404).json({ error: "DNI no encontrado" });
    }

    const payload = {
      success: true,
      dni: data.document_number,
      nombreCompleto: data.full_name || `${data.first_name || ""} ${data.first_last_name || ""} ${data.second_last_name || ""}`.trim(),
      nombres: data.first_name || "",
      apellidoPaterno: data.first_last_name || "",
      apellidoMaterno: data.second_last_name || ""
    };

    console.log("Objeto que se envía al frontend:", JSON.stringify(payload, null, 2));
    res.json(payload);
  } catch (error) {
    console.error("=== ERROR CONSULTANDO DNI ===");
    console.error("Status:", error.response?.status);
    console.error("Data:", JSON.stringify(error.response?.data));
    console.error("Message:", error.message);

    if (error.response?.status === 401) {
      return res.status(501).json({ error: "Token de Decolecta inválido o expirado." });
    }
    if (error.response?.status === 404) {
      return res.status(404).json({ error: "DNI no encontrado" });
    }
    if (error.response?.status === 429) {
      return res.status(429).json({ error: "Límite de consultas alcanzado. Intenta más tarde." });
    }

    res.status(500).json({
      error: "Error al consultar el DNI. Intenta nuevamente.",
      detalle: error.response?.data || error.message,
    });
  }
});

app.get("/api/consultar-ruc/:ruc", async (req, res) => {
  console.log("=== ENDPOINT /api/consultar-ruc ===");
  console.log("RUC recibido:", req.params.ruc);

  try {
    const { ruc } = req.params;

    if (!/^\d{11}$/.test(ruc)) {
      console.log("RUC con formato inválido:", ruc);
      return res.status(400).json({ error: "El RUC debe tener exactamente 11 dígitos." });
    }

    if (!TOKEN_DECOLECTA) {
      console.error("DECOLECTA_TOKEN no configurado");
      return res.status(500).json({ error: "Servicio de consulta no configurado. Token faltante." });
    }

    const targetUrl = `https://api.decolecta.com/v1/sunat/ruc/full?numero=${ruc}`;
    console.log("URL consultada:", targetUrl);

    const response = await axios.get(
      targetUrl,
      {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${TOKEN_DECOLECTA}`,
        },
      }
    );

    console.log("Código HTTP recibido:", response.status);
    console.log("Respuesta completa de Decolecta:", JSON.stringify(response.data, null, 2));

    const resBody = response.data;
    const data = resBody.data || resBody;

    if (!data || !data.razon_social || !data.numero_documento) {
      console.log("Sin razon_social o numero_documento en la respuesta.");
      console.log("Resultado de la validación: NO VÁLIDO");
      console.log("Motivo: El RUC ingresado no se encuentra registrado en SUNAT.");
      return res.status(404).json({ error: "El RUC ingresado no se encuentra registrado en SUNAT." });
    }

    const normalizeText = (text) => {
      if (!text) return "";
      return text
        .replace(/['']/g, "'")
        .replace(/['']/g, "'")
        .replace(/\s+/g, " ")
        .replace(/,\s*,/g, ",")
        .replace(/^\s*,\s*|\s*,\s*$/g, "")
        .trim();
    };

    const rucNum = data.numero_documento;
    const razonSocial = normalizeText(data.razon_social);
    const nombreComercial = normalizeText(data.nombre_comercial);
    const estado = (data.estado || "").toUpperCase().trim();
    const condicion = (data.condicion || "").toUpperCase().trim();
    const direccion = normalizeText(data.direccion);
    const departamento = normalizeText(data.departamento);
    const provincia = normalizeText(data.provincia);
    const distrito = normalizeText(data.distrito);
    const giroComercial = normalizeText(data.actividad_economica) || "Actividad económica no especificada";

    let esValido = true;
    let motivoRechazo = "";

    if (estado !== "ACTIVO") {
      esValido = false;
      motivoRechazo = "El RUC se encuentra inactivo. No puede continuar con el registro.";
    } else if (condicion !== "HABIDO") {
      esValido = false;
      motivoRechazo = "El contribuyente no cumple las condiciones necesarias para registrarse.";
    }

    const payload = {
      success: true,
      ruc: rucNum,
      nombreNegocio: razonSocial,
      nombreComercial: nombreComercial,
      giroComercial: giroComercial,
      estado: estado,
      condicion: condicion,
      direccion,
      departamento,
      provincia,
      distrito,
      esValido,
      motivoRechazo
    };

    console.log("Objeto enviado al frontend:", JSON.stringify(payload, null, 2));
    console.log("Resultado de la validación:", esValido ? "VÁLIDO" : "NO VÁLIDO");
    if (!esValido) {
      console.log("Motivo de rechazo:", motivoRechazo);
    }

    res.json(payload);
  } catch (error) {
    console.error("=== ERROR CONSULTANDO RUC ===");
    console.error("Status:", error.response?.status);
    console.error("Data:", JSON.stringify(error.response?.data));
    console.error("Message:", error.message);

    if (error.response?.status === 401) {
      return res.status(501).json({ error: "Token de Decolecta inválido o expirado." });
    }
    if (error.response?.status === 404) {
      return res.status(404).json({ error: "El RUC ingresado no se encuentra registrado en SUNAT." });
    }
    if (error.response?.status === 429) {
      return res.status(429).json({ error: "Límite de consultas alcanzado. Intenta más tarde." });
    }

    res.status(500).json({
      error: "El RUC ingresado no se encuentra registrado en SUNAT.",
      detalle: error.response?.data || error.message,
    });
  }
});

/* =========================
   FLOW PAYMENT GATEWAY
========================= */

const flowSign = (params) => {
  const sortedKeys = Object.keys(params).sort();
  const toSign = sortedKeys.map((k) => `${k}${params[k]}`).join("");
  console.log("[FLOW] toSign:", toSign.substring(0, 80) + "...");
  return crypto.createHmac("sha256", FLOW_SECRET_KEY).update(toSign).digest("hex");
};

const flowBuildBody = (params) => {
  const sortedKeys = Object.keys(params).sort();
  return sortedKeys.map((k) => `${k}=${params[k]}`).join("&");
};

app.post("/api/pagos/flow/crear-orden", verificarToken, async (req, res) => {
  try {
    if (!FLOW_API_KEY || !FLOW_SECRET_KEY) {
      return res.status(500).json({ error: "Flow no está configurado. Faltan credenciales." });
    }

    const { commerceOrder, subject, amount, email, urlConfirmation, urlReturn } = req.body;

    if (!commerceOrder || !amount || !email) {
      return res.status(400).json({ error: "Faltan parámetros requeridos: commerceOrder, amount, email." });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "El correo electrónico no tiene un formato válido." });
    }

    const params = {
      apiKey: FLOW_API_KEY,
      commerceOrder: String(commerceOrder),
      subject: subject || "Derecho de trámite - Licencia Municipal",
      currency: "PEN",
      amount: Number(amount),
      email,
      urlConfirmation: urlConfirmation || `${MUNICIPALIDAD_CONFIG.url}/api/pagos/flow/callback`,
      urlReturn: urlReturn || `${MUNICIPALIDAD_CONFIG.url}/pago-exitoso`,
    };

    console.log("[FLOW] === CREANDO ORDEN ===");
    console.log("[FLOW] apiKey length:", FLOW_API_KEY.length);
    console.log("[FLOW] apiKey prefix:", FLOW_API_KEY.substring(0, 6) + "...");
    console.log("[FLOW] secretKey loaded:", !!FLOW_SECRET_KEY, "(length:", FLOW_SECRET_KEY.length + ")");
    console.log("[FLOW] params:", JSON.stringify({ ...params, apiKey: "(hidden)" }, null, 2));

    const s = flowSign(params);
    const data = flowBuildBody(params);

    console.log("[FLOW] signature:", s);
    console.log("[FLOW] body preview:", data.substring(0, 100) + "...");

    const response = await axios.post(
      `${FLOW_BASE_URL}/payment/create`,
      `${data}&s=${s}`,
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        timeout: 15000,
      }
    );

    const { url, token } = response.data;
    if (!url || !token) {
      return res.status(500).json({ error: "Flow no devolvió url o token." });
    }

    console.log("[FLOW] Orden creada OK:", { commerceOrder, token: token.substring(0, 10) + "..." });

    res.json({ url, token, paymentUrl: `${url}?token=${token}` });
  } catch (error) {
    console.error("[FLOW] Error creando orden:");
    console.error("[FLOW] Status:", error.response?.status);
    console.error("[FLOW] Data:", JSON.stringify(error.response?.data));
    console.error("[FLOW] Message:", error.message);
    const rawDetalle = error.response?.data || error.message;
    const detalle = typeof rawDetalle === "object" ? JSON.stringify(rawDetalle) : String(rawDetalle);
    res.status(500).json({
      error: "No se pudo crear la orden de pago con Flow",
      detalle,
    });
  }
});

app.get("/api/pagos/flow/status/:token", verificarToken, async (req, res) => {
  try {
    if (!FLOW_API_KEY || !FLOW_SECRET_KEY) {
      return res.status(500).json({ error: "Flow no está configurado." });
    }

    const { token } = req.params;
    const params = { apiKey: FLOW_API_KEY, token };
    const s = flowSign(params);

    const response = await axios.get(`${FLOW_BASE_URL}/payment/getStatus`, {
      params: { ...params, s },
      timeout: 10000,
    });

    res.json(response.data);
  } catch (error) {
    console.error("[FLOW] Error consultando estado:", error.response?.data || error.message);
    res.status(500).json({ error: "No se pudo consultar el estado del pago." });
  }
});

app.post("/api/pagos/flow/callback", express.urlencoded({ extended: false }), async (req, res) => {
  try {
    console.log("[FLOW CALLBACK] Body recibido:", req.body);

    const token = req.body.token;
    if (!token) {
      return res.status(400).send("Token requerido");
    }

    if (!FLOW_API_KEY || !FLOW_SECRET_KEY) {
      console.error("[FLOW CALLBACK] Flow no configurado");
      return res.status(500).send("Flow no configurado");
    }

    const params = { apiKey: FLOW_API_KEY, token };
    const s = flowSign(params);
    const response = await axios.get(`${FLOW_BASE_URL}/payment/getStatus`, {
      params: { ...params, s },
      timeout: 10000,
    });

    const paymentData = response.data;
    console.log("[FLOW CALLBACK] Estado del pago:", JSON.stringify(paymentData));

    if (paymentData.status === 1) {
      console.log("[FLOW CALLBACK] Pago APROBADO para orden:", paymentData.commerceOrder);

      const solicitudRef = doc(db, "solicitudes", paymentData.commerceOrder);
      const solicitudSnap = await getDoc(solicitudRef);

      if (solicitudSnap.exists()) {
        const solicitudData = solicitudSnap.data();
        const uidUsuario = solicitudData.uidUsuario || "";
        const correoUsuario = solicitudData.correoUsuario || "";

        await updateDoc(solicitudRef, {
            estadoPago: "Confirmado",
            pago: "Confirmado",
            metodoPago: "Flow",
            comprobantePago: "Pago confirmado vía Flow",
            montoPagado: paymentData.amount || MONTO_TRAMITE,
            pagoId: String(paymentData.flowOrder || token),
            pagoEstadoDetalle: "approved",
            pagoFecha: paymentData.paymentData?.date || new Date().toISOString(),
            pagoMedio: paymentData.paymentData?.media || "Flow",
            flowToken: token,
            flowCommerceOrder: paymentData.commerceOrder,
            actualizadoEn: serverTimestamp(),
          });

        if (uidUsuario) {
          const idNotificacion = `flow-${paymentData.commerceOrder}-${Date.now()}`;
          await setDoc(doc(db, "notificaciones", idNotificacion), {
            id_notificacion: idNotificacion,
            uid_usuario: uidUsuario,
            titulo: "Pago confirmado",
            descripcion: `Tu pago de S/${MONTO_TRAMITE.toFixed(2)} para la solicitud EXP-${paymentData.commerceOrder} ha sido confirmado vía Flow.`,
            icono: "💳",
            fecha_hora: new Date().toISOString(),
            leida: false,
          });

          if (correoUsuario && transporter) {
            transporter.sendMail({
              from: `"${MUNICIPALIDAD_CONFIG.nombre}" <${SMTP_EMAIL}>`,
              to: correoUsuario,
              subject: "Pago confirmado - Solicitud municipal",
              html: `<div style="font-family:Arial,sans-serif;padding:20px;color:#1e293b;">
                <h2 style="color:#0f766e;">Pago confirmado</h2>
                <p>Tu pago de <strong>S/${MONTO_TRAMITE.toFixed(2)}</strong> para la solicitud <strong>EXP-${paymentData.commerceOrder}</strong> ha sido procesado exitosamente a través de Flow.</p>
                <p>Puedes continuar con tu trámite desde tu panel de usuario.</p>
                <p style="color:#64748b;font-size:12px;margin-top:20px;">${MUNICIPALIDAD_CONFIG.nombre}</p>
              </div>`,
            }).catch((e) => console.error("[FLOW] Error enviando correo:", e.message));
          }
        }
      }
    } else {
      console.log("[FLOW CALLBACK] Pago NO aprobado. Status:", paymentData.status);
    }

    res.status(200).send("OK");
  } catch (error) {
    console.error("[FLOW CALLBACK] Error:", error.message);
    res.status(200).send("OK");
  }
});

// Map for email change OTPs
// key: email, value: { codigo, expiracion, intentos, verificado }
const changeEmailOtps = new Map();

// 1. Enviar código al correo actual
app.post("/api/email-change/enviar-codigo-actual", verificarToken, async (req, res) => {
  const { correoActual } = req.body;
  if (!correoActual) {
    return res.status(400).json({ error: "El correo actual es requerido." });
  }

  const codigo = Math.floor(100000 + Math.random() * 900000).toString();
  const expiracion = Date.now() + 5 * 60 * 1000; // 5 minutes

  changeEmailOtps.set(correoActual, {
    codigo,
    expiracion,
    intentos: 0,
    verificado: false
  });

  console.log(`[CAMBIO CORREO] OTP para correo actual ${correoActual}: ${codigo}`);

  if (!transporter) {
    return res.json({ success: true, mensaje: "Código enviado (simulado en consola)." });
  }

  const mailOptions = {
    from: `"Web Municipal" <${SMTP_EMAIL}>`,
    to: correoActual,
    subject: "Verificación para cambio de correo",
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #1e3a8a;">
        <h2>Verificación para cambio de correo electrónico</h2>
        <p>Has solicitado cambiar el correo electrónico de tu cuenta en la Web Municipal.</p>
        <p>Para continuar, ingresa el siguiente código de verificación en el sistema:</p>
        <div style="background: #f1f5f9; padding: 16px; border-radius: 8px; font-size: 24px; font-weight: bold; letter-spacing: 4px; text-align: center; margin: 20px 0; color: #0f172a;">
          ${codigo}
        </div>
        <p>Este código expira en 5 minutos y es de un solo uso.</p>
        <p>Si no solicitaste este cambio, puedes ignorar este mensaje.</p>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    res.json({ success: true, mensaje: "Código enviado correctamente." });
  } catch (err) {
    console.error("[CAMBIO CORREO] Error enviando mail a correo actual:", err);
    res.status(500).json({ error: "No se pudo enviar el correo de verificación." });
  }
});

// 2. Verificar código del correo actual
app.post("/api/email-change/verificar-codigo-actual", verificarToken, async (req, res) => {
  const { correoActual, codigo } = req.body;
  if (!correoActual || !codigo) {
    return res.status(400).json({ error: "El correo y el código son requeridos." });
  }

  const otpData = changeEmailOtps.get(correoActual);
  if (!otpData) {
    return res.status(400).json({ error: "No se ha solicitado un código para este correo." });
  }

  if (Date.now() > otpData.expiracion) {
    changeEmailOtps.delete(correoActual);
    return res.status(400).json({ error: "El código ha expirado." });
  }

  if (otpData.intentos >= 5) {
    changeEmailOtps.delete(correoActual);
    return res.status(400).json({ error: "Se ha excedido el límite de 5 intentos fallidos. Solicita un nuevo código." });
  }

  if (otpData.codigo !== codigo) {
    otpData.intentos += 1;
    changeEmailOtps.set(correoActual, otpData);
    return res.status(400).json({ error: `Código incorrecto. Intentos restantes: ${5 - otpData.intentos}` });
  }

  // Código correcto
  otpData.verificado = true;
  changeEmailOtps.set(correoActual, otpData);
  res.json({ success: true, mensaje: "Código del correo actual verificado correctamente." });
});

// 3. Enviar código al nuevo correo electrónico
app.post("/api/email-change/enviar-codigo-nuevo", verificarToken, async (req, res) => {
  const { correoActual, correoNuevo } = req.body;
  if (!correoActual || !correoNuevo) {
    return res.status(400).json({ error: "El correo actual y el nuevo son requeridos." });
  }

  // Verificar que el código del correo actual ya fue verificado
  const otpDataActual = changeEmailOtps.get(correoActual);
  if (!otpDataActual || !otpDataActual.verificado) {
    return res.status(403).json({ error: "Primero debes verificar el código de tu correo actual." });
  }

  const codigo = Math.floor(100000 + Math.random() * 900000).toString();
  const expiracion = Date.now() + 5 * 60 * 1000; // 5 minutes

  changeEmailOtps.set(correoNuevo, {
    codigo,
    expiracion,
    intentos: 0,
    verificado: false
  });

  console.log(`[CAMBIO CORREO] OTP para correo nuevo ${correoNuevo}: ${codigo}`);

  if (!transporter) {
    return res.json({ success: true, mensaje: "Código enviado (simulado en consola)." });
  }

  const mailOptions = {
    from: `"Web Municipal" <${SMTP_EMAIL}>`,
    to: correoNuevo,
    subject: "Confirmación de nuevo correo",
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #1e3a8a;">
        <h2>Confirmación de nuevo correo electrónico</h2>
        <p>Estás confirmando este correo como tu nueva dirección de correo en la Web Municipal.</p>
        <p>Para finalizar la actualización, ingresa el siguiente código de confirmación en el sistema:</p>
        <div style="background: #f1f5f9; padding: 16px; border-radius: 8px; font-size: 24px; font-weight: bold; letter-spacing: 4px; text-align: center; margin: 20px 0; color: #0f172a;">
          ${codigo}
        </div>
        <p>Este código expira en 5 minutos y es de un solo uso.</p>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    res.json({ success: true, mensaje: "Código enviado al nuevo correo correctamente." });
  } catch (err) {
    console.error("[CAMBIO CORREO] Error enviando mail a correo nuevo:", err);
    res.status(500).json({ error: "No se pudo enviar el correo de confirmación al nuevo correo electrónico." });
  }
});

// 4. Verificar código del nuevo correo electrónico
app.post("/api/email-change/verificar-codigo-nuevo", verificarToken, async (req, res) => {
  const { correoActual, correoNuevo, codigo } = req.body;
  if (!correoActual || !correoNuevo || !codigo) {
    return res.status(400).json({ error: "Todos los campos son requeridos." });
  }

  // Verificar correo actual
  const otpDataActual = changeEmailOtps.get(correoActual);
  if (!otpDataActual || !otpDataActual.verificado) {
    return res.status(403).json({ error: "Petición no autorizada. Falta verificar el correo actual." });
  }

  const otpDataNuevo = changeEmailOtps.get(correoNuevo);
  if (!otpDataNuevo) {
    return res.status(400).json({ error: "No se ha solicitado un código para el nuevo correo." });
  }

  if (Date.now() > otpDataNuevo.expiracion) {
    changeEmailOtps.delete(correoNuevo);
    return res.status(400).json({ error: "El código del nuevo correo ha expirado." });
  }

  if (otpDataNuevo.intentos >= 5) {
    changeEmailOtps.delete(correoNuevo);
    return res.status(400).json({ error: "Se ha excedido el límite de 5 intentos fallidos en el nuevo correo. Solicita un nuevo código." });
  }

  if (otpDataNuevo.codigo !== codigo) {
    otpDataNuevo.intentos += 1;
    changeEmailOtps.set(correoNuevo, otpDataNuevo);
    return res.status(400).json({ error: `Código incorrecto. Intentos restantes: ${5 - otpDataNuevo.intentos}` });
  }

  // Eliminar ambos códigos de la memoria para que sean estrictamente de un solo uso
  changeEmailOtps.delete(correoActual);
  changeEmailOtps.delete(correoNuevo);

  res.json({ success: true, mensaje: "Ambos correos verificados correctamente." });
});

app.post("/api/email/enviar-notificacion", verificarToken, async (req, res) => {
  const { correoUsuario, titulo, descripcion } = req.body;
  if (!correoUsuario || !titulo || !descripcion) {
    return res.status(400).json({ error: "Faltan correoUsuario, titulo o descripcion." });
  }

  try {
    let subject = titulo;
    
    // Standardize subjects based on requirements
    if (titulo.toLowerCase().includes("registrada")) {
      subject = "Solicitud registrada correctamente";
    } else if (titulo.toLowerCase().includes("pago confirmado")) {
      subject = "Pago confirmado";
    } else if (titulo.toLowerCase().includes("comprobante generado")) {
      subject = "Comprobante generado";
    }

    await emailProvider.sendEmail(correoUsuario, subject, descripcion);
    res.json({ success: true, mensaje: "Correo de notificación enviado correctamente." });
  } catch (err) {
    console.error("[API NOTIFICACION CORREO] Error al enviar email:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/enviar-codigo", async (req, res) => {
  console.log("=== ENDPOINT /api/enviar-codigo ===");
  console.log("Body recibido:", JSON.stringify(req.body));

  try {
    const { correo, codigo, nombre } = req.body;

    if (!correo || !codigo) {
      console.error("Faltan parámetros:", { correo, codigo });
      return res.status(400).json({ error: "Faltan correo o código" });
    }

    const nameRegex = /^[A-Za-zÁÉÍÓÚáéíóúÑñÜü\s'-]+$/;
    if (nombre && !nameRegex.test(nombre)) {
      console.error("Nombre contiene caracteres inválidos:", nombre);
      return res.status(400).json({ error: "Los nombres y apellidos solo pueden contener letras." });
    }

    const nombreUsuario = nombre || "Ciudadano";
    console.log("1. Parámetros OK - Email:", correo, "- Código:", codigo, "- Nombre:", nombreUsuario);

    if (!transporter) {
      console.error("2. SMTP no configurado - transporter es null");
      return res.status(500).json({ error: "Servicio de correo no configurado" });
    }

    console.log("2. Transporter SMTP disponible");

    const mailOptions = {
      from: `"Web Municipal" <${SMTP_EMAIL}>`,
      to: correo,
      subject: "Código de verificación para crear tu cuenta",
      text: `Hola ${nombreUsuario},\n\nTu código de verificación es:\n\n${codigo}\n\nEste código tiene una duración limitada.\n\nNo compartas este código con nadie.\n\nSi no solicitaste este código, puedes ignorar este mensaje.\n\nWeb Municipal.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #334155; line-height: 1.6; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
          <p style="font-size: 16px; margin-bottom: 16px; color: #0f172a;">Hola <strong>${nombreUsuario}</strong>,</p>
          <p style="font-size: 16px; margin-bottom: 16px; color: #334155;">Tu código de verificación es:</p>
          <div style="font-size: 32px; font-weight: bold; color: #1e3a8a; letter-spacing: 4px; margin: 24px 0; background: #f1f5f9; padding: 16px; text-align: center; border-radius: 8px; border: 1px solid #cbd5e1;">
            ${codigo}
          </div>
          <p style="font-size: 14px; color: #64748b; margin-bottom: 6px;">Este código tiene una duración limitada.</p>
          <p style="font-size: 14px; color: #64748b; margin-bottom: 24px;">No compartas este código con nadie.</p>
          <p style="font-size: 13px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 16px; margin-bottom: 8px;">
            Si no solicitaste este código, puedes ignorar este mensaje.
          </p>
          <p style="font-size: 14px; font-weight: bold; color: #1e3a8a; margin: 0;">Web Municipal.</p>
        </div>
      `,
    };

    console.log("3. Llamando a transporter.sendMail()...");
    console.log("   From:", mailOptions.from);
    console.log("   To:", mailOptions.to);

    const result = await transporter.sendMail(mailOptions);

    console.log("4. sendMail() respondió OK:");
    console.log("   messageId:", result.messageId);
    console.log("   response:", result.response);

    res.json({ mensaje: "Correo enviado correctamente" });
  } catch (error) {
    console.error("=== ERROR ENVIANDO CORREO ===");
    console.error("Mensaje:", error.message);
    res.status(500).json({ error: "No se pudo enviar el correo de verificación", detalle: error.message });
  }
});

app.post("/api/enviar-recuperacion", async (req, res) => {
  console.log("=== ENDPOINT /api/enviar-recuperacion ===");

  try {
    const { correo, codigo, nombre } = req.body;

    if (!correo || !codigo) {
      return res.status(400).json({ error: "Faltan correo o código" });
    }

    const nombreUsuario = nombre || "Ciudadano";
    console.log("1. Email destino:", correo, "- Código:", codigo, "- Nombre:", nombreUsuario);

    if (!transporter) {
      console.error("2. SMTP no configurado");
      return res.status(500).json({ error: "Servicio de correo no configurado" });
    }

    console.log("2. Transporter SMTP disponible");

    const mailOptions = {
      from: `"Web Municipal" <${SMTP_EMAIL}>`,
      to: correo,
      subject: "Código para restablecer tu contraseña",
      text: `Hola ${nombreUsuario},\n\nTu código para recuperar tu contraseña es:\n\n${codigo}\n\nEste código tiene una duración limitada.\n\nSi no realizaste esta solicitud, ignora este mensaje.\n\nWeb Municipal.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #334155; line-height: 1.6; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
          <p style="font-size: 16px; margin-bottom: 16px; color: #0f172a;">Hola <strong>${nombreUsuario}</strong>,</p>
          <p style="font-size: 16px; margin-bottom: 16px; color: #334155;">Tu código para recuperar tu contraseña es:</p>
          <div style="font-size: 32px; font-weight: bold; color: #1e3a8a; letter-spacing: 4px; margin: 24px 0; background: #f1f5f9; padding: 16px; text-align: center; border-radius: 8px; border: 1px solid #cbd5e1;">
            ${codigo}
          </div>
          <p style="font-size: 14px; color: #64748b; margin-bottom: 24px;">Este código tiene una duración limitada.</p>
          <p style="font-size: 13px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 16px; margin-bottom: 8px;">
            Si no realizaste esta solicitud, ignora este mensaje.
          </p>
          <p style="font-size: 14px; font-weight: bold; color: #1e3a8a; margin: 0;">Web Municipal.</p>
        </div>
      `,
    };

    console.log("3. Llamando a transporter.sendMail()...");
    const result = await transporter.sendMail(mailOptions);

    console.log("4. Correo de recuperación enviado:");
    console.log("   messageId:", result.messageId);

    res.json({ mensaje: "Correo de recuperación enviado correctamente" });
  } catch (error) {
    console.error("=== ERROR ENVIANDO RECUPERACIÓN ===");
    console.error("Mensaje:", error.message);
    res.status(500).json({ error: "No se pudo enviar el correo de recuperación", detalle: error.message });
  }
});

app.post("/api/comprobantes/enviar-correo", verificarToken, async (req, res) => {
  console.log("=== ENDPOINT /api/comprobantes/enviar-correo ===");

  try {
    const { correo_usuario, codigo_unico, tipo_comprobante, monto_total, id_solicitud, fecha_emision, url_pdf, serie, numero } = req.body;

    if (!correo_usuario || !codigo_unico) {
      return res.status(400).json({ error: "Faltan parámetros obligatorios." });
    }

    if (!transporter) {
      return res.status(500).json({ error: "Servicio de correo no configurado." });
    }

    const tipoLabel = tipo_comprobante === "boleta" ? "Boleta de Venta Electrónica" : "Factura Electrónica";
    const nombrePdf = `${tipo_comprobante === "boleta" ? "BOLETA" : "FACTURA"}_${serie || codigo_unico.split("-")[0]}_${numero || codigo_unico.split("-")[1]}.pdf`;

    const mailOptions = {
      from: `"${MUNICIPALIDAD_CONFIG.nombre}" <${SMTP_EMAIL}>`,
      to: correo_usuario,
      subject: `${tipoLabel} — ${codigo_unico} | Comprobante de pago municipal`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 28px; color: #334155; line-height: 1.6; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
          <div style="text-align: center; margin-bottom: 20px; padding: 16px; background: #1f3b57; border-radius: 10px;">
            <h1 style="color: white; font-size: 18px; margin: 0;">${MUNICIPALIDAD_CONFIG.nombre}</h1>
            <p style="color: #93c5fd; font-size: 12px; margin: 4px 0 0;">Sistema de Licencias Municipales</p>
          </div>

          <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 14px; margin-bottom: 16px; text-align: center;">
            <p style="margin: 0; color: #166534; font-size: 15px; font-weight: 700;">&#10003; Pago registrado exitosamente</p>
            <p style="margin: 4px 0 0; color: #166534; font-size: 13px;">Tu comprobante de pago ha sido generado.</p>
          </div>

          <h2 style="color: #0f172a; font-size: 16px; margin: 0 0 10px;">${tipoLabel}</h2>

          <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #64748b; border-bottom: 1px solid #f1f5f9;">Tipo de comprobante</td>
              <td style="padding: 8px 0; color: #0f172a; font-weight: 600; border-bottom: 1px solid #f1f5f9; text-align: right;">${tipoLabel}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748b; border-bottom: 1px solid #f1f5f9;">Serie - Número</td>
              <td style="padding: 8px 0; color: #0f172a; font-weight: 600; border-bottom: 1px solid #f1f5f9; text-align: right;">${codigo_unico}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748b; border-bottom: 1px solid #f1f5f9;">Expediente</td>
              <td style="padding: 8px 0; color: #0f172a; font-weight: 600; border-bottom: 1px solid #f1f5f9; text-align: right;">${id_solicitud || "N/A"}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748b; border-bottom: 1px solid #f1f5f9;">Fecha de emisión</td>
              <td style="padding: 8px 0; color: #0f172a; font-weight: 600; border-bottom: 1px solid #f1f5f9; text-align: right;">${fecha_emision || "N/A"}</td>
            </tr>
            <tr>
              <td style="padding: 10px 0; color: #64748b; font-size: 16px;">Monto pagado</td>
              <td style="padding: 10px 0; color: #166534; font-weight: 700; font-size: 20px; text-align: right;">S/${Number(monto_total || 0).toFixed(2)}</td>
            </tr>
          </table>

          ${url_pdf ? `
          <div style="text-align: center; margin: 20px 0;">
            <a href="${url_pdf}" target="_blank" style="display: inline-block; padding: 14px 32px; background: #1e3a8a; color: #ffffff; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 15px;">
              &#128196; Descargar comprobante PDF
            </a>
            <p style="margin: 8px 0 0; font-size: 12px; color: #94a3b8;">${nombrePdf}</p>
          </div>
          ` : ""}

          <p style="font-size: 13px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 14px; margin-top: 16px; text-align: center;">
            Este comprobante fue generado automáticamente por la plataforma.<br/>
            ${MUNICIPALIDAD_CONFIG.nombre} — ${MUNICIPALIDAD_CONFIG.sistemaNombre}
          </p>
        </div>
      `,
    };

    const result = await transporter.sendMail(mailOptions);
    console.log("[COMPROBANTE] Correo enviado:", result.messageId);

    res.json({ mensaje: "Comprobante enviado por correo correctamente." });
  } catch (error) {
    console.error("=== ERROR ENVIANDO COMPROBANTE POR CORREO ===");
    console.error("Mensaje:", error.message);
    res.status(500).json({ error: "No se pudo enviar el comprobante.", detalle: error.message });
  }
});

const otpsSms = new Map(); // key: telefono, value: { codigo, expiracion, intentos, usado }

app.post("/api/sms/enviar-otp", verificarToken, async (req, res) => {
  try {
    const { telefono } = req.body;
    if (!telefono || !/^\d{9}$/.test(telefono)) {
      return res.status(400).json({ error: "Número telefónico inválido (debe tener 9 dígitos)." });
    }

    // Generate 6-digit code
    const codigo = Math.floor(100000 + Math.random() * 900000).toString();
    const expiracion = Date.now() + 5 * 60 * 1000; // 5 minutes

    otpsSms.set(telefono, {
      codigo,
      expiracion,
      intentos: 0,
      usado: false
    });

    console.log(`[OTP SMS] Generado código ${codigo} para ${telefono}`);

    // Send SMS via decoupled provider
    await smsProvider.sendSMS(
      telefono,
      `Tu codigo de verificacion municipal para habilitar notificaciones SMS es: ${codigo}. Valido por 5 minutos.`
    );

    res.json({ mensaje: "Código OTP enviado correctamente por SMS." });
  } catch (error) {
    console.error("Error al enviar OTP SMS:", error.message);
    res.status(500).json({ error: "No se pudo enviar el código OTP por SMS." });
  }
});

app.post("/api/sms/verificar-otp", verificarToken, async (req, res) => {
  try {
    const { telefono, codigo } = req.body;

    if (!telefono || !codigo) {
      return res.status(400).json({ error: "Faltan parámetros: teléfono y código." });
    }

    const otpData = otpsSms.get(telefono);

    if (!otpData) {
      return res.status(400).json({ error: "No se solicitó ningún código para este número de teléfono." });
    }

    if (otpData.usado) {
      return res.status(400).json({ error: "El código ya ha sido utilizado." });
    }

    if (Date.now() > otpData.expiracion) {
      return res.status(400).json({ error: "El código ha expirado. Solicita uno nuevo." });
    }

    // Increment attempts
    otpData.intentos += 1;

    if (otpData.intentos > 5) {
      return res.status(400).json({ error: "Has alcanzado el límite máximo de 5 intentos." });
    }

    if (otpData.codigo !== codigo) {
      return res.status(400).json({ error: "El código ingresado es incorrecto." });
    }

    // Mark as used
    otpData.usado = true;
    otpsSms.delete(telefono); // Clean up

    res.json({ success: true, mensaje: "Tu número telefónico ha sido verificado correctamente." });
  } catch (error) {
    console.error("Error al verificar OTP SMS:", error.message);
    res.status(500).json({ error: "Error al verificar el código OTP." });
  }
});


/* =========================
   STATIC FILES & SPA
========================= */

if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
}

app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ error: "Ruta de API no encontrada." });
  }
  const indexPath = join(distPath, "index.html");
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).json({ error: "Frontend no encontrado" });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
