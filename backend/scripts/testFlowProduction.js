import axios from "axios";
import crypto from "crypto";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const FLOW_API_KEY = process.env.FLOW_API_KEY;
const FLOW_SECRET_KEY = process.env.FLOW_SECRET_KEY;
const FLOW_ENV = process.env.FLOW_ENV || "production";
const FLOW_BASE_URL = FLOW_ENV === "production" ? "https://www.flow.cl/api" : "https://sandbox.flow.cl/api";

const flowSign = (params) => {
  const sortedKeys = Object.keys(params).sort();
  const toSign = sortedKeys.map((k) => `${k}${params[k]}`).join("");
  return crypto.createHmac("sha256", FLOW_SECRET_KEY).update(toSign).digest("hex");
};

const flowBuildBody = (params) => {
  const sortedKeys = Object.keys(params).sort();
  return sortedKeys.map((k) => `${k}=${params[k]}`).join("&");
};

async function testFlow() {
  console.log("=== TEST DE CREACIÓN DE ORDEN CON FLOW PRODUCCIÓN ===");
  console.log("FLOW_BASE_URL:", FLOW_BASE_URL);
  console.log("FLOW_API_KEY:", FLOW_API_KEY);
  console.log("FLOW_SECRET_KEY:", FLOW_SECRET_KEY ? "Cargada (" + FLOW_SECRET_KEY.length + " chars)" : "No cargada");

  const params = {
    apiKey: FLOW_API_KEY,
    commerceOrder: `TEST-${Date.now()}`,
    subject: "Prueba de Pago Real Licencia Municipal",
    currency: "PEN",
    amount: 3,
    email: "alessandro.test@gmail.com",
    urlConfirmation: "http://localhost:5000/api/pagos/flow/callback",
    urlReturn: "http://localhost:5173/pago-exitoso",
  };

  const s = flowSign(params);
  const data = flowBuildBody(params);

  try {
    const response = await axios.post(
      `${FLOW_BASE_URL}/payment/create`,
      `${data}&s=${s}`,
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        timeout: 15000,
      }
    );

    console.log("\n[RESPUESTA FLOW EXITOSA]:");
    console.log("URL base Flow:", response.data.url);
    console.log("Token:", response.data.token);
    console.log("URL COMPLETA DE PAGO REAL:", `${response.data.url}?token=${response.data.token}`);
  } catch (error) {
    console.error("\n[ERROR FLOW]:");
    console.error("Status:", error.response?.status);
    console.error("Data:", JSON.stringify(error.response?.data || error.message));
  }
}

testFlow();
