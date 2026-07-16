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

    console.log("Consultando Decolecta RENIEC para DNI:", dni);

    const response = await axios.get(
      `https://api.decolecta.com/v1/reniec/dni?numero=${dni}`,
      {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${TOKEN_DECOLECTA}`,
        },
      }
    );

    console.log("Respuesta Decolecta:", JSON.stringify(response.data));

    const resBody = response.data;
    const data = resBody.data || resBody;

    if (!data || !data.document_number) {
      console.log("document_number no encontrado en la respuesta:", resBody);
      return res.status(404).json({ error: "DNI no encontrado en registros de RENIEC." });
    }

    res.json({
      success: true,
      data: {
        dni: data.document_number,
        nombres: data.first_name || "",
        apellido_paterno: data.first_last_name || "",
        apellido_materno: data.second_last_name || "",
        nombre_completo: data.full_name || `${data.first_name || ""} ${data.first_last_name || ""} ${data.second_last_name || ""}`.trim(),
      },
    });
  } catch (error) {
    console.error("=== ERROR CONSULTANDO DNI ===");
    console.error("Status:", error.response?.status);
    console.error("Data:", JSON.stringify(error.response?.data));
    console.error("Message:", error.message);

    if (error.response?.status === 401) {
      return res.status(501).json({ error: "Token de Decolecta inválido o expirado." });
    }
    if (error.response?.status === 404) {
      return res.status(404).json({ error: "DNI no encontrado en registros de RENIEC." });
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
      return res.status(400).json({ error: "El RUC debe tener exactamente 11 dígitos." });
    }

    if (!TOKEN_DECOLECTA) {
      console.error("DECOLECTA_TOKEN no configurado");
      return res.status(500).json({ error: "Servicio de consulta no configurado. Token faltante." });
    }

    console.log("Consultando Decolecta SUNAT para RUC:", ruc);

    const response = await axios.get(
      `https://api.decolecta.com/v1/sunat/ruc/full?numero=${ruc}`,
      {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${TOKEN_DECOLECTA}`,
        },
      }
    );

    console.log("Respuesta Decolecta SUNAT:", JSON.stringify(response.data));

    if (!response.data || !response.data.data) {
      console.log("Sin datos en la respuesta");
      return res.status(404).json({ error: "RUC no encontrado en registros de SUNAT." });
    }

    res.json(response.data);
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
    const { correo, codigo } = req.body;

    if (!correo || !codigo) {
      console.error("Faltan parámetros:", { correo, codigo });
      return res.status(400).json({ error: "Faltan correo o código" });
    }

    console.log("1. Parámetros OK - Email:", correo, "- Código:", codigo);

    if (!transporter) {
      console.error("2. SMTP no configurado - transporter es null");
      return res.status(500).json({ error: "Servicio de correo no configurado" });
    }

    console.log("2. Transporter SMTP disponible");

    const mailOptions = {
      from: `"Municipalidad de Trujillo" <${SMTP_EMAIL}>`,
      to: correo,
      subject: "Código de verificación - Sistema de Licencias",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #f8fafc; border-radius: 16px;">
          <div style="text-align: center; margin-bottom: 24px;">
            <div style="width: 64px; height: 64px; background: #1f3b57; border-radius: 14px; display: inline-grid; place-items: center; color: white; font-size: 28px; font-weight: bold;">&#9881;</div>
          </div>
          <h1 style="color: #0f172a; font-size: 22px; text-align: center; margin: 0 0 8px;">Verifica tu correo electrónico</h1>
          <p style="color: #64748b; font-size: 14px; text-align: center; margin: 0 0 24px; line-height: 1.5;">
            Usa el siguiente código de verificación para completar tu registro en el Sistema de Licencias Municipales.
          </p>
          <div style="background: white; border: 2px solid #e2e8f0; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 24px;">
            <p style="color: #64748b; font-size: 12px; margin: 0 0 8px; text-transform: uppercase; letter-spacing: 1px;">Código de verificación</p>
            <p style="color: #1f3b57; font-size: 36px; font-weight: bold; letter-spacing: 8px; margin: 0;">${codigo}</p>
          </div>
          <p style="color: #94a3b8; font-size: 12px; text-align: center; margin: 0 0 8px;">
            Este código expira en 5 minutos. Si no solicitaste este registro, ignora este correo.
          </p>
          <p style="color: #94a3b8; font-size: 11px; text-align: center; margin: 0;">
            Municipalidad de Trujillo &mdash; Sistema de Licencias v1.0
          </p>
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
    console.log("   accepted:", result.accepted);
    console.log("   rejected:", result.rejected);

    res.json({ mensaje: "Correo enviado correctamente" });
  } catch (error) {
    console.error("=== ERROR ENVIANDO CORREO ===");
    console.error("Tipo de error:", error.constructor.name);
    console.error("Mensaje:", error.message);
    console.error("Código:", error.code);
    console.error("Comando:", error.command);
    console.error("Stack completo:", error.stack);
    console.error("=== FIN ERROR ===");
    res.status(500).json({ error: "No se pudo enviar el correo de verificación", detalle: error.message });
  }
});

app.post("/api/enviar-recuperacion", async (req, res) => {
  console.log("=== ENDPOINT /api/enviar-recuperacion ===");

  try {
    const { correo, codigo } = req.body;

    if (!correo || !codigo) {
      return res.status(400).json({ error: "Faltan correo o código" });
    }

    console.log("1. Email destino:", correo, "- Código:", codigo);

    if (!transporter) {
      console.error("2. SMTP no configurado");
      return res.status(500).json({ error: "Servicio de correo no configurado" });
    }

    console.log("2. Transporter SMTP disponible");

    const mailOptions = {
      from: `"Municipalidad de Trujillo" <${SMTP_EMAIL}>`,
      to: correo,
      subject: "Recuperación de contraseña - Municipalidad de Trujillo",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #f8fafc; border-radius: 16px;">
          <div style="text-align: center; margin-bottom: 24px;">
            <div style="width: 64px; height: 64px; background: #1f3b57; border-radius: 14px; display: inline-grid; place-items: center; color: white; font-size: 28px; font-weight: bold;">&#128274;</div>
          </div>
          <h1 style="color: #0f172a; font-size: 22px; text-align: center; margin: 0 0 8px;">Recuperar contraseña</h1>
          <p style="color: #64748b; font-size: 14px; text-align: center; margin: 0 0 24px; line-height: 1.5;">
            Recibimos una solicitud para restablecer la contraseña de tu cuenta en el Sistema de Licencias Municipales.
          </p>
          <div style="background: white; border: 2px solid #e2e8f0; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 24px;">
            <p style="color: #64748b; font-size: 12px; margin: 0 0 8px; text-transform: uppercase; letter-spacing: 1px;">Tu código de verificación</p>
            <p style="color: #1f3b57; font-size: 36px; font-weight: bold; letter-spacing: 8px; margin: 0;">${codigo}</p>
          </div>
          <p style="color: #94a3b8; font-size: 12px; text-align: center; margin: 0 0 8px;">
            Este código expira en 5 minutos. Si no solicitaste este cambio, ignora este correo.
          </p>
          <p style="color: #94a3b8; font-size: 11px; text-align: center; margin: 0;">
            Municipalidad de Trujillo &mdash; Sistema de Licencias v1.0
          </p>
        </div>
      `,
    };

    console.log("3. Llamando a transporter.sendMail()...");
    const result = await transporter.sendMail(mailOptions);

    console.log("4. Correo de recuperación enviado:");
    console.log("   messageId:", result.messageId);
    console.log("   accepted:", result.accepted);

    res.json({ mensaje: "Correo de recuperación enviado correctamente" });
  } catch (error) {
    console.error("=== ERROR ENVIANDO RECUPERACIÓN ===");
    console.error("Mensaje:", error.message);
    console.error("Código:", error.code);
    console.error("Stack:", error.stack);
    console.error("=== FIN ERROR ===");
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
