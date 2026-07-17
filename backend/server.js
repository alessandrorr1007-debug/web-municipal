import express from "express";
import cors from "cors";
import axios from "axios";
import dotenv from "dotenv";
import nodemailer from "nodemailer";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import fs from "fs";

import {
  MercadoPagoConfig,
  Payment,
  Preference,
} from "mercadopago";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, ".env") });
const distPath = join(__dirname, "..", "dist");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

const TOKEN_DECOLECTA =
  process.env.DECOLECTA_TOKEN || process.env.VITE_DECOLECTA_TOKEN;

const MP_ACCESS_TOKEN =
  process.env.MERCADO_PAGO_ACCESS_TOKEN || process.env.MP_ACCESS_TOKEN;

const MONTO_TRAMITE = 3;

const SMTP_EMAIL = process.env.SMTP_EMAIL || "";
const SMTP_PASSWORD = process.env.SMTP_PASSWORD || "";

console.log("=== SERVIDOR MUNICIPAL ===");
console.log("PORT:", PORT);
console.log("SMTP EMAIL:", SMTP_EMAIL ? "Configurado" : "No configurado");
console.log("DIST path:", distPath);
console.log("DIST exists:", fs.existsSync(distPath));

const mpClient = new MercadoPagoConfig({
  accessToken: MP_ACCESS_TOKEN || "",
});

const payment = new Payment(mpClient);
const preference = new Preference(mpClient);

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

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    smtp: SMTP_EMAIL ? "configurado" : "no configurado",
    decolecta: TOKEN_DECOLECTA ? "configurado" : "no configurado",
    timestamp: new Date().toISOString(),
  });
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

    const rucNum = data.numero_documento;
    const razonSocial = data.razon_social;
    const nombreComercial = data.nombre_comercial || "";
    const estado = (data.estado || "").toUpperCase().trim();
    const condicion = (data.condicion || "").toUpperCase().trim();
    const direccion = data.direccion || "";
    const departamento = data.departamento || "";
    const provincia = data.provincia || "";
    const distrito = data.distrito || "";
    const giroComercial = data.actividad_economica || "Actividad económica no especificada";

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

app.get("/api/ruc/:numero", async (req, res) => {
  try {
    const { numero } = req.params;

    if (!TOKEN_DECOLECTA) {
      return res.status(500).json({
        error: "Falta DECOLECTA_TOKEN en .env",
      });
    }

    const response = await axios.get(
      `https://api.decolecta.com/v1/sunat/ruc/full?numero=${numero}`,
      {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${TOKEN_DECOLECTA}`,
        },
      }
    );

    res.json(response.data);
  } catch (error) {
    console.error(error.response?.data || error.message);

    res.status(500).json({
      error: "Error consultando SUNAT",
      detalle: error.response?.data || error.message,
    });
  }
});

app.post("/api/pagos/crear-preferencia", async (req, res) => {
  try {
    const { ruc, razonSocial } = req.body;

    const result = await preference.create({
      body: {
        items: [
          {
            id: "LICENCIA-MUNICIPAL",
            title: `Licencia Municipal - ${razonSocial || "Negocio"}`,
            quantity: 1,
            currency_id: "PEN",
            unit_price: MONTO_TRAMITE,
          },
        ],

        payer: {
          email: "test_user_650000@testuser.com",
        },

        external_reference: `RUC-${ruc || "SIN-RUC"}-${Date.now()}`,

        back_urls: {
          success: "https://web-municipal-1.onrender.com",
          failure: "https://web-municipal-1.onrender.com",
          pending: "https://web-municipal-1.onrender.com",
        },

        auto_return: "approved",
      },
    });

    res.json({
      id: result.id,
      init_point: result.init_point,
      sandbox_init_point: result.sandbox_init_point,
    });
  } catch (error) {
    console.error("ERROR CREANDO PREFERENCIA:");
    console.error(error);

    res.status(500).json({
      error: "No se pudo crear la preferencia de pago",
      detalle: error.message,
    });
  }
});

app.get("/api/pagos/verificar/:paymentId", async (req, res) => {
  try {
    const { paymentId } = req.params;

    const result = await payment.get({
      id: paymentId,
    });

    res.json({
      id: result.id,
      status: result.status,
      status_detail: result.status_detail,
      transaction_amount: result.transaction_amount,
      payment_method_id: result.payment_method_id,
      date_approved: result.date_approved,
    });
  } catch (error) {
    console.error("ERROR VERIFICANDO PAGO:");
    console.error(error);

    res.status(500).json({
      error: "No se pudo verificar el pago",
      detalle: error.message,
    });
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

app.post("/api/cambiar-contrasena", async (req, res) => {
  console.log("=== ENDPOINT /api/cambiar-contrasena ===");

  try {
    const { correo, codigo, nuevaContrasena } = req.body;

    if (!correo || !codigo || !nuevaContrasena) {
      return res.status(400).json({ error: "Faltan parámetros: correo, código y nueva contraseña." });
    }

    if (nuevaContrasena.length < 8) {
      return res.status(400).json({ error: "La contraseña debe tener al menos 8 caracteres." });
    }

    if (!/[a-zA-Z]/.test(nuevaContrasena) || !/\d/.test(nuevaContrasena)) {
      return res.status(400).json({ error: "La contraseña debe contener al menos una letra y un número." });
    }

    console.log("1. Parámetros OK. Verificando código y cambiando contraseña para:", correo);

    const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || "AIzaSyC_LEdrAj9R9epUNj9ZMhwE2al1TIfoUko";

    // Paso 1: Obtener la contraseña actual desde Firestore via REST API (read)
    // No tenemos admin SDK, así que usamos la contraseña almacenada en Firestore
    // que se guardó durante el registro
    const axiosAdmin = axios.create();

    // Paso 2: Usar signInWithPassword para obtener idToken con las credenciales actuales
    // Primero necesitamos la contraseña actual del usuario (almacenada en Firestore)
    // Usamos el endpoint REST de Firestore para leer el documento
    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/web-municipal-32860/databases/(default)/documents/usuarios`;

    // Buscar usuario por correo
    const usuarioResponse = await axiosAdmin.get(
      `${firestoreUrl}?filter=fieldPath%3Dcorreo%20op%3DEQUAL%20value%3DstringType%2C${encodeURIComponent(correo)}`,
      { timeout: 10000 }
    );

    const documentos = usuarioResponse.data?.documents;
    if (!documentos || documentos.length === 0) {
      return res.status(404).json({ error: "No se encontró una cuenta con ese correo electrónico." });
    }

    const usuarioDoc = documentos[0];
    const campos = {};
    if (usuarioDoc.fields) {
      Object.keys(usuarioDoc.fields).forEach((key) => {
        const field = usuarioDoc.fields[key];
        campos[key] = field.stringValue || field.integerValue || field.booleanValue || "";
      });
    }

    const contrasenaActual = campos.contraseña;
    if (!contrasenaActual) {
      return res.status(400).json({ error: "No se pudo recuperar la información de la cuenta." });
    }

    console.log("2. Contraseña actual obtenida de Firestore");

    // Paso 3: Iniciar sesión temporalmente para obtener idToken
    const signInResponse = await axiosAdmin.post(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
      {
        email: correo,
        password: contrasenaActual,
        returnSecureToken: true,
      },
      { timeout: 10000 }
    );

    const idToken = signInResponse.data.idToken;
    console.log("3. Sesión temporal obtenida (idToken)");

    // Paso 4: Cambiar la contraseña
    const updateResponse = await axiosAdmin.post(
      `https://identitytoolkit.googleapis.com/v1/accounts:update?key=${FIREBASE_API_KEY}`,
      {
        idToken: idToken,
        password: nuevaContrasena,
        returnSecureToken: true,
      },
      { timeout: 10000 }
    );

    console.log("4. Contraseña cambiada exitosamente");

    // Paso 5: Actualizar la contraseña en Firestore
    const updateId = usuarioDoc.name.split("/").pop();
    await axiosAdmin.patch(
      `https://firestore.googleapis.com/v1/projects/web-municipal-32860/databases/(default)/documents/usuarios/${updateId}?updateMask.fieldPaths=contraseña`,
      {
        fields: {
          contraseña: { stringValue: nuevaContrasena },
        },
      },
      { timeout: 10000 }
    );

    console.log("5. Contraseña actualizada en Firestore");

    res.json({ mensaje: "Contraseña actualizada correctamente. Ya puedes iniciar sesión." });
  } catch (error) {
    console.error("=== ERROR CAMBIANDO CONTRASEÑA ===");
    console.error("Status:", error.response?.status);
    console.error("Data:", JSON.stringify(error.response?.data));
    console.error("Message:", error.message);

    if (error.response?.data?.error?.message === "INVALID_PASSWORD" || error.response?.data?.error?.message === "EMAIL_NOT_FOUND") {
      return res.status(400).json({ error: "No se pudo verificar la cuenta. Contacta al administrador." });
    }

    res.status(500).json({
      error: "No se pudo cambiar la contraseña. Intenta nuevamente.",
      detalle: error.response?.data?.error?.message || error.message,
    });
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

app.post("/api/comprobantes/enviar-correo", async (req, res) => {
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
      from: `"Municipalidad de Trujillo" <${SMTP_EMAIL}>`,
      to: correo_usuario,
      subject: `${tipoLabel} — ${codigo_unico} | Comprobante de pago municipal`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 28px; color: #334155; line-height: 1.6; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
          <div style="text-align: center; margin-bottom: 20px; padding: 16px; background: #1f3b57; border-radius: 10px;">
            <h1 style="color: white; font-size: 18px; margin: 0;">Municipalidad de Trujillo</h1>
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
            Este comprobante fue generado automáticamente por el sistema municipal.<br/>
            Municipalidad de Trujillo — Sistema de Licencias v1.0
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

/* =========================
   STATIC FILES & SPA
========================= */

if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
}

app.use((req, res) => {
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
