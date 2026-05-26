import express from "express";
import cors from "cors";
import axios from "axios";
import dotenv from "dotenv";
import { MercadoPagoConfig, Payment } from "mercadopago";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

const TOKEN_DECOLECTA =
  process.env.DECOLECTA_TOKEN || process.env.VITE_DECOLECTA_TOKEN;

const MP_ACCESS_TOKEN =
  process.env.MERCADO_PAGO_ACCESS_TOKEN || process.env.MP_ACCESS_TOKEN;

const MONTO_TRAMITE = 100;

console.log("TOKEN DECOLECTA:", TOKEN_DECOLECTA ? "Existe" : "No existe");
console.log("TOKEN MERCADO PAGO:", MP_ACCESS_TOKEN ? "Existe" : "No existe");
console.log("MONTO TRÁMITE:", `S/${MONTO_TRAMITE}.00`);

const mpClient = new MercadoPagoConfig({
  accessToken: MP_ACCESS_TOKEN || "",
});

const payment = new Payment(mpClient);

app.get("/", (req, res) => {
  res.json({
    mensaje: "Backend SUNAT y Mercado Pago activo",
    monto: MONTO_TRAMITE,
  });
});

/* API SUNAT */
app.get("/api/ruc/:numero", async (req, res) => {
  try {
    const { numero } = req.params;

    if (!TOKEN_DECOLECTA) {
      return res.status(500).json({
        error: "Falta DECOLECTA_TOKEN en .env",
      });
    }

    if (!numero || numero.length !== 11) {
      return res.status(400).json({
        error: "El RUC debe tener 11 dígitos.",
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
    console.error("ERROR SUNAT:");
    console.error(error.response?.data || error.message);

    res.status(500).json({
      error: "Error consultando SUNAT",
      detalle: error.response?.data || error.message,
    });
  }
});

/* PAGO CON TARJETA */
app.post("/api/pagos/procesar-tarjeta", async (req, res) => {
  try {
    if (!MP_ACCESS_TOKEN) {
      return res.status(500).json({
        error: "Falta MERCADO_PAGO_ACCESS_TOKEN en .env",
      });
    }

    const {
      token,
      issuerId,
      paymentMethodId,
      installments,
      payer,
      ruc,
      razonSocial,
    } = req.body;

    if (!token) {
      return res.status(400).json({
        error: "Falta token de tarjeta",
      });
    }

    if (!paymentMethodId) {
      return res.status(400).json({
        error: "Falta paymentMethodId",
      });
    }

    if (!payer?.email) {
      return res.status(400).json({
        error: "Falta correo del pagador",
      });
    }

    const result = await payment.create({
      body: {
        transaction_amount: MONTO_TRAMITE,
        token,
        description: `Licencia municipal de funcionamiento - ${
          razonSocial || "Negocio"
        }`,
        installments: Number(installments) || 1,
        payment_method_id: paymentMethodId,
        issuer_id: issuerId || undefined,
        payer: {
          email: payer.email,
          identification: payer.identification || {
            type: "DNI",
            number: "12345678",
          },
        },
        external_reference: `RUC-${ruc || "SIN-RUC"}-${Date.now()}`,
      },
      requestOptions: {
        idempotencyKey: `tarjeta-${Date.now()}-${Math.random()
          .toString(36)
          .substring(2)}`,
      },
    });

    res.json({
      id: result.id,
      status: result.status,
      status_detail: result.status_detail,
      payment_method_id: result.payment_method_id,
      transaction_amount: result.transaction_amount,
      date_approved: result.date_approved,
    });
  } catch (error) {
    console.error("ERROR PROCESANDO TARJETA:");
    console.error(error.message);
    console.error(error.cause || error);

    res.status(500).json({
      error: "No se pudo procesar el pago con tarjeta",
      detalle: error.message,
      causa: error.cause || null,
    });
  }
});

/* VERIFICAR PAGO */
app.get("/api/pagos/verificar/:paymentId", async (req, res) => {
  try {
    const { paymentId } = req.params;

    if (!MP_ACCESS_TOKEN) {
      return res.status(500).json({
        error: "Falta MERCADO_PAGO_ACCESS_TOKEN en .env",
      });
    }

    const result = await payment.get({
      id: paymentId,
    });

    res.json({
      id: result.id,
      status: result.status,
      status_detail: result.status_detail,
      payment_method_id: result.payment_method_id,
      transaction_amount: result.transaction_amount,
      date_approved: result.date_approved,
    });
  } catch (error) {
    console.error("ERROR VERIFICANDO PAGO:");
    console.error(error.message);
    console.error(error.cause || error);

    res.status(500).json({
      error: "No se pudo verificar el pago",
      detalle: error.message,
      causa: error.cause || null,
    });
  }
});

app.listen(3000, () => {
  console.log("Backend SUNAT y Mercado Pago corriendo en puerto 3000");
});