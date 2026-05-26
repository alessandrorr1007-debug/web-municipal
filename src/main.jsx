import React from "react";
import ReactDOM from "react-dom/client";
import { initMercadoPago } from "@mercadopago/sdk-react";

import App from "./App.jsx";
import "./style.css";
import { AuthProvider } from "./context/AuthContext.jsx";

initMercadoPago(import.meta.env.VITE_MP_PUBLIC_KEY, {
  locale: "es-PE",
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <AuthProvider>
    <App />
  </AuthProvider>
);