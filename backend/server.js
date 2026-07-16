import express from "express";
import cors from "cors";
import axios from "axios";
import dotenv from "dotenv";

import {
  MercadoPagoConfig,
  Payment,
  Preference,
} from "mercadopago";

dotenv.config();

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

app.listen(3000, () => {
  console.log("Servidor corriendo en puerto 3000");
});