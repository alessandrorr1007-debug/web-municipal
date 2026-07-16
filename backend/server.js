import express from "express";
import cors from "cors";
import axios from "axios";
import dotenv from "dotenv";
import nodemailer from "nodemailer";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

import {
  MercadoPagoConfig,
  Payment,
  Preference,
} from "mercadopago";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

app.use(cors());
app.use(express.json());

const TOKEN_DECOLECTA =
  process.env.DECOLECTA_TOKEN || process.env.VITE_DECOLECTA_TOKEN;

const MP_ACCESS_TOKEN =
  process.env.MERCADO_PAGO_ACCESS_TOKEN || process.env.MP_ACCESS_TOKEN;

const MONTO_TRAMITE = 3;

console.log("TOKEN DECOLECTA:", TOKEN_DECOLECTA ? "Existe" : "No existe");
console.log("TOKEN MERCADO PAGO:", MP_ACCESS_TOKEN ? "Existe" : "No existe");

const mpClient = new MercadoPagoConfig({
  accessToken: MP_ACCESS_TOKEN || "",
});

const payment = new Payment(mpClient);
const preference = new Preference(mpClient);

app.get("/", (req, res) => {
  res.json({
    mensaje: "Backend SUNAT y Mercado Pago activo",
    monto: MONTO_TRAMITE,
  });
});

/* =========================
   API SUNAT
========================= */

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

/* =========================
   CREAR PREFERENCIA CHECKOUT PRO
========================= */

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

/* =========================
   VERIFICAR PAGO
========================= */

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

const SMTP_EMAIL = process.env.SMTP_EMAIL;
const SMTP_PASSWORD = process.env.SMTP_PASSWORD;

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: SMTP_EMAIL,
    pass: SMTP_PASSWORD,
  },
});

console.log("SMTP EMAIL:", SMTP_EMAIL ? "Configurado" : "No configurado");

/* =========================
   ENVIAR CODIGO DE VERIFICACION
========================= */

app.post("/api/enviar-codigo", async (req, res) => {
  try {
    const { correo, codigo } = req.body;

    if (!correo || !codigo) {
      return res.status(400).json({ error: "Faltan correo o código" });
    }

    await transporter.sendMail({
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
    });

    res.json({ mensaje: "Correo enviado correctamente" });
  } catch (error) {
    console.error("ERROR ENVIANDO CODIGO:", error.message);
    res.status(500).json({ error: "No se pudo enviar el correo de verificación" });
  }
});

const distPath = join(__dirname, "..", "dist");
app.use(express.static(distPath));

app.use((req, res) => {
  res.sendFile(join(distPath, "index.html"));
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Servidor corriendo en puerto", process.env.PORT || 3000);
});