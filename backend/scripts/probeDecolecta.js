import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

const TOKEN = process.env.DECOLECTA_TOKEN || "sk_17589.IQ5Ds3neL7RQrqlnTMeD59VIFvHySfj9";

async function probeDecolecta() {
  const routes = [
    "",
    "v1",
    "v1/reniec/dni?numero=20438637380",
    "v1/sunat/ruc/full?numero=20438637380",
    "v1/cobro",
    "v1/cobros",
    "v1/pago",
    "v1/pagos",
    "v1/pasarela",
    "v1/yape",
    "v1/plin",
    "v1/izipay",
    "v1/niubiz",
    "v1/culqi",
    "v1/mercadopago"
  ];

  for (const r of routes) {
    try {
      const url = `https://api.decolecta.com/${r}`;
      const res = await axios.get(url, {
        headers: { Authorization: `Bearer ${TOKEN}` }
      });
      console.log(`GET ${url} -> Status ${res.status}:`, JSON.stringify(res.data).substring(0, 100));
    } catch (err) {
      console.log(`GET https://api.decolecta.com/${r} -> Status ${err.response?.status}:`, JSON.stringify(err.response?.data || err.message));
    }
  }
}

probeDecolecta();
