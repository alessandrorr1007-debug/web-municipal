import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

const TOKEN = process.env.DECOLECTA_TOKEN || "sk_17589.IQ5Ds3neL7RQrqlnTMeD59VIFvHySfj9";

async function testDecolecta() {
  console.log("=== PROBANDO DECOLECTA API ===");
  console.log("Token:", TOKEN);

  const endpoints = [
    "https://api.decolecta.com/v1/payments",
    "https://api.decolecta.com/v1/checkout",
    "https://api.decolecta.com/v1/cobros",
    "https://api.decolecta.com/v1/pay",
    "https://api.decolecta.com/v1/charge"
  ];

  for (const url of endpoints) {
    try {
      console.log(`\nProbando POST ${url}...`);
      const res = await axios.post(url, {
        amount: 3.00,
        currency: "PEN",
        description: "Derecho de Tramite Licencia Municipal"
      }, {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Content-Type": "application/json"
        }
      });
      console.log(`[EXITO] ${url} -> Status ${res.status}:`, res.data);
    } catch (err) {
      console.log(`[RESPUESTA] ${url} -> Status ${err.response?.status}:`, JSON.stringify(err.response?.data || err.message));
    }
  }
}

testDecolecta();
