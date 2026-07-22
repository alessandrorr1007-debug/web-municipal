import { useEffect, useState, useRef } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { verificarPagoFlow } from "../services/pagoService";
import { buscarSiguienteDisponibilidad } from "../config/inspeccionConfig";
import { obtenerSolicitudes } from "../services/solicitudService";

const MONTO_TRAMITE = 3;

console.log("[PagoExitoso] Módulo cargado");

export default function PagoExitoso({ onRedirect }) {
  console.log("[PagoExitoso] Componente montado");

  const [estado, setEstado] = useState("verificando");
  const [mensaje, setMensaje] = useState("Verificando tu pago con Flow...");
  const onRedirectRef = useRef(onRedirect);
  onRedirectRef.current = onRedirect;

  useEffect(() => {
    console.log("[PagoExitoso] useEffect ejecutado");

    try {
      const params = new URLSearchParams(window.location.search);
      const token = params.get("token");
      console.log("[PagoExitoso] token:", token ? token.substring(0, 10) + "..." : "NULL");

      if (!token) {
        console.log("[PagoExitoso] Sin token, mostrando error");
        setEstado("error");
        setMensaje("No se detectó ningún token de pago en la URL.");
        return;
      }

      let cancelado = false;

      const verificar = async () => {
        try {
          console.log("[PagoExitoso] Iniciando verificación con Flow...");
          const resultado = await verificarPagoFlow(token);
          console.log("[PagoExitoso] Resultado:", JSON.stringify(resultado).substring(0, 200));

          if (cancelado) {
            console.log("[PagoExitoso] Cancelado, abortando");
            return;
          }

          if (resultado.status === 1) {
            console.log("[PagoExitoso] Pago APROBADO. commerceOrder:", resultado.commerceOrder);
            const solicitudId = resultado.commerceOrder;

            try {
              console.log("[PagoExitoso] Buscando siguiente cupo disponible para inspección...");
              let datosInspeccion = {};
              try {
                const todasSol = await obtenerSolicitudes();
                const resSlot = buscarSiguienteDisponibilidad(todasSol);
                if (resSlot.exito) {
                  datosInspeccion = {
                    estado: "Inspección programada",
                    estadoNormalizado: "INSPECCION_PROGRAMADA",
                    inspeccion: "Programada",
                    inspectorUid: resSlot.inspector.uid || resSlot.inspector.id,
                    inspectorAsignadoUid: resSlot.inspector.uid || resSlot.inspector.id,
                    inspectorNombre: resSlot.inspector.nombre,
                    fechaVisitaInspector: resSlot.fechaInspeccion,
                    horaVisitaInspector: resSlot.slotInspeccion,
                    horaVisitaLabel: resSlot.horaLabel,
                  };
                }
              } catch (slotErr) {
                console.warn("[PagoExitoso] Error al buscar cupo libre:", slotErr);
              }

              const expClean = String(solicitudId).replace(/^EXP-/, "");
              console.log("[PagoExitoso] Actualizando Firestore...");
              await updateDoc(doc(db, "solicitudes", expClean), {
                estadoPago: "Confirmado",
                pago: "Confirmado",
                metodoPago: "Flow",
                tipoComprobante: "Boleta de Venta Electrónica",
                comprobantePago: `Boleta Electrónica N° B001-${expClean}`,
                numeroOperacion: `B001-${expClean}`,
                montoPagado: resultado.amount || MONTO_TRAMITE,
                pagoId: String(resultado.flowOrder || token),
                pagoEstadoDetalle: "approved",
                flowToken: token,
                fechaPago: new Date().toLocaleString("es-PE"),
                actualizadoEn: new Date().toISOString(),
                ...datosInspeccion,
              });
              console.log("[PagoExitoso] Firestore actualizado OK con fecha inspección:", datosInspeccion.fechaVisitaInspector);
            } catch (fireErr) {
              console.error("[PagoExitoso] Error actualizando Firestore:", fireErr);
            }

            localStorage.removeItem("flow_pago_pendiente");
            localStorage.removeItem("flow_pago_estado");

            setEstado("exito");
            setMensaje("¡Pago confirmado correctamente! Redirigiendo...");

            setTimeout(() => {
              if (!cancelado) {
                console.log("[PagoExitoso] Redirigiendo a mis-solicitudes (éxito)");
                window.history.replaceState({}, document.title, "/");
                onRedirectRef.current?.("mis-solicitudes");
              }
            }, 2500);
          } else {
            console.log("[PagoExitoso] Pago NO aprobado. Status:", resultado.status);
            localStorage.removeItem("flow_pago_pendiente");
            setEstado("pendiente");
            setMensaje("El pago aún no fue confirmado por Flow. Puede tardar unos segundos. Serás redirigido...");
            setTimeout(() => {
              if (!cancelado) {
                console.log("[PagoExitoso] Redirigiendo a mis-solicitudes (pendiente)");
                window.history.replaceState({}, document.title, "/");
                onRedirectRef.current?.("mis-solicitudes");
              }
            }, 3500);
          }
        } catch (error) {
          console.error("[PagoExitoso] Error verificando pago:", error);
          localStorage.removeItem("flow_pago_pendiente");
          setEstado("error");
          setMensaje("Pago realizado correctamente, pero ocurrió un error al cargar la información.");
          setTimeout(() => {
            if (!cancelado) {
              console.log("[PagoExitoso] Redirigiendo a mis-solicitudes (error)");
              window.history.replaceState({}, document.title, "/");
              onRedirectRef.current?.("mis-solicitudes");
            }
          }, 4000);
        }
      };

      verificar();

      return () => {
        console.log("[PagoExitoso] Cleanup: cancelado = true");
        cancelado = true;
      };
    } catch (err) {
      console.error("[PagoExitoso] Error en useEffect:", err);
      setEstado("error");
      setMensaje("Pago realizado correctamente, pero ocurrió un error al cargar la información.");
    }
  }, []);

  console.log("[PagoExitoso] Renderizando estado:", estado);

  const iconColor = {
    verificando: "#2563eb",
    exito: "#16a34a",
    pendiente: "#d97706",
    error: "#dc2626",
  };

  const bgColor = {
    verificando: "#eff6ff",
    exito: "#f0fdf4",
    pendiente: "#fef3c7",
    error: "#fee2e2",
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center",
      justifyContent: "center", background: "#f1f5f9",
      fontFamily: "system-ui, -apple-system, sans-serif", padding: "24px",
    }}>
      <style>{`@keyframes pago-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <div style={{
        background: "white", borderRadius: "20px", padding: "48px 40px",
        maxWidth: "480px", width: "100%", textAlign: "center",
        boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
      }}>
        <div style={{
          width: "72px", height: "72px", borderRadius: "50%",
          background: bgColor[estado], display: "grid", placeItems: "center",
          margin: "0 auto 24px", fontSize: "32px", color: iconColor[estado],
        }}>
          {estado === "verificando" && (
            <div style={{
              width: "36px", height: "36px", border: "4px solid #dbeafe",
              borderTopColor: "#2563eb", borderRadius: "50%",
              animation: "pago-spin 1s linear infinite",
            }} />
          )}
          {estado === "exito" && "\u2713"}
          {estado === "pendiente" && "\u23F3"}
          {estado === "error" && "\u26A0"}
        </div>

        <h2 style={{ color: iconColor[estado], marginBottom: "12px", fontSize: "22px", fontWeight: 800 }}>
          {estado === "verificando" && "Procesando pago"}
          {estado === "exito" && "Pago exitoso"}
          {estado === "pendiente" && "Pago pendiente"}
          {estado === "error" && "Aviso"}
        </h2>

        <p style={{ color: "#64748b", fontSize: "15px", lineHeight: 1.6, marginBottom: "28px" }}>
          {mensaje}
        </p>

        {estado === "exito" && (
          <div style={{
            display: "inline-flex", alignItems: "center", gap: "8px",
            background: "#f0fdf4", color: "#16a34a", padding: "10px 20px",
            borderRadius: "12px", fontSize: "14px", fontWeight: 600,
          }}>
            {"\u2713"} Pago confirmado
          </div>
        )}

        {estado === "error" && (
          <button
            type="button"
            onClick={() => {
              console.log("[PagoExitoso] Click botón ir a mis-solicitudes");
              window.history.replaceState({}, document.title, "/");
              onRedirectRef.current?.("mis-solicitudes");
            }}
            style={{
              background: "#1f3b57", color: "white", border: "none",
              padding: "12px 28px", borderRadius: "12px", fontSize: "14px",
              fontWeight: 700, cursor: "pointer",
            }}
          >
            Ir a mis solicitudes
          </button>
        )}
      </div>
    </div>
  );
}
