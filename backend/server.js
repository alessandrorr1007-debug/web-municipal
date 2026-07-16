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

    if (!data || (!data.numero_documento && !data.razon_social)) {
      console.log("Sin datos o sin razon_social/numero_documento en la respuesta.");
      console.log("Resultado de la validación: NO VÁLIDO");
      console.log("Motivo: RUC no encontrado en registros de SUNAT");
      return res.status(404).json({ error: "RUC no encontrado en registros de SUNAT." });
    }

    const rucNum = data.numero_documento || data.ruc || ruc;
    const razonSocial = data.razon_social || "";
    const estado = (data.estado || "").toUpperCase().trim();
    const condicion = (data.condicion || "").toUpperCase().trim();
    const direccion = data.direccion || "";
    const departamento = data.departamento || "";
    const provincia = data.provincia || "";
    const distrito = data.distrito || "";

    let esValido = true;
    let motivoRechazo = "";

    if (estado !== "ACTIVO") {
      esValido = false;
      motivoRechazo = "El RUC se encuentra inactivo o dado de baja en SUNAT. No es posible registrar una solicitud de licencia.";
    } else if (condicion !== "HABIDO") {
      esValido = false;
      motivoRechazo = "El contribuyente no tiene una condición válida en SUNAT. Regularice su situación antes de solicitar una licencia.";
    }

    const payload = {
      success: true,
      ruc: rucNum,
      razonSocial,
      estado,
      condicion,
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
      return res.status(404).json({ error: "RUC no encontrado en registros de SUNAT." });
    }
    if (error.response?.status === 429) {
      return res.status(429).json({ error: "Límite de consultas alcanzado. Intenta más tarde." });
    }

    res.status(500).json({
      error: "Error al consultar el RUC. Intenta nuevamente.",
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
