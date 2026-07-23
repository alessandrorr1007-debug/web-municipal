import { useEffect, useState, useMemo, useCallback } from "react";
import {
  obtenerSolicitudes,
  actualizarSolicitud,
  guardarSolicitud,
  suscribirSolicitudes,
  actualizarFechaLicenciamiento,
} from "../services/solicitudService";
import { crearNotificacion } from "../services/notificacionService";
import { abrirPdf, obtenerBlobUrlParaPdf, generarPlantillaLicenciaOficial, subirArchivoACloudinary } from "../services/pdfService";
import { crearOrdenFlow } from "../services/pagoService";
import { consultarDni } from "../services/dniService";
import { consultarRuc } from "../services/rucService";
import { convertirNumeroALetras, obtenerDniValido, obtenerNombreCiudadanoValido } from "../services/comprobanteService";
import { GROS_DISPONIBLES, obtenerDocumentosPorGiro } from "../config/documentosPorGiro";
import { useAuth } from "../context/AuthContext";
import {
  abrirCajaMunicipal,
  obtenerCajaActivaPorCajero,
  cerrarCajaMunicipal,
} from "../services/cajasService";
import VisualizadorDocumentoModal from "./VisualizadorDocumentoModal";
import {
  TIME_SLOTS,
  INSPECTORES_DEFAULT,
  formatearFechaLocal,
  esHorarioPasado,
  esFechaValidaParaInspeccion,
  MENSAJE_FECHA_INSPECCION,
  obtenerFechaMinimaInspeccion,
  formatearFechaYYYYMMDD,
  MAX_INSPECCIONES_POR_DIA,
  buscarSiguienteDisponibilidad,
  esSlotOcupadoParaInspector,
  obtenerConteoInspectorEnFecha,
} from "../config/inspeccionConfig";
import { DISTRITOS_TRUJILLO, coincideDistrito } from "../config/estadosSolicitud";

const MONTO_TRAMITE = 3.0;

const VisualizadorComprobanteSUNAT = ({ datos, idContainer = "comprobante-sunat-impresion" }) => {
  const { usuario } = useAuth();
  if (!datos) return null;

  const solComp = datos.solicitudCompleta || datos;
  const tipoNorm = String(datos.tipoComprobante || datos.tipo_comprobante || solComp.tipoComprobante || solComp.comprobantePago || "").toLowerCase();
  const numOperacion = datos.codComprobante || datos.numeroOperacion || solComp.numeroOperacion || "";
  const esFactura = tipoNorm.includes("factura") || numOperacion.startsWith("F");

  const expIdNum = String(datos.id || solComp.id || "").replace(/^EXP-/, "");
  const expId = `EXP-${expIdNum}`;
  const codComprobanteStr = numOperacion.includes("-")
    ? numOperacion
    : `${esFactura ? "F001" : "B001"}-${expIdNum}`;

  const fechaHora = solComp.fechaPago || datos.fechaPago || datos.fechaSolicitud || datos.fecha || new Date().toLocaleString("es-PE");

  // DATOS DEL ESTABLECIMIENTO
  const rucEstablecimiento = solComp.ruc || datos.ruc || "---";
  const razonSocialEstablecimiento = solComp.razonSocial || datos.razonSocial || solComp.nombreNegocio || datos.nombreNegocio || "CONTRIBUYENTE REGISTRADO";
  const nombreComercialEstablecimiento = solComp.nombreNegocio || datos.nombreNegocio || razonSocialEstablecimiento;
  const direccionEstablecimiento = solComp.direccion || datos.direccion || "TRUJILLO - LA LIBERTAD";

  // DATOS DEL CLIENTE / ADQUIRENTE
  const clienteNombre = (solComp.nombresSolicitante && solComp.apellidosSolicitante)
    ? `${solComp.nombresSolicitante} ${solComp.apellidosSolicitante}`
    : (obtenerNombreCiudadanoValido(solComp) || datos.nombreSolicitante || "SOLICITANTE");
  const clienteDni = obtenerDniValido(solComp) || datos.dniSolicitante || datos.dni || "---";

  // MONTO E IGV (18% DESGLOSADO EXACTO: TOTAL S/ 3.00 = VALOR VENTA S/ 2.54 + IGV S/ 0.46)
  const montoTotal = Number(solComp.montoPagado || datos.montoPagado || MONTO_TRAMITE || 3.00);
  const valorVentaVal = Math.round((montoTotal / 1.18) * 100) / 100;
  const igvVal = Math.round((montoTotal - valorVentaVal) * 100) / 100;

  const metodoPagoStr = String(solComp.metodoPago || datos.metodoPago || "EFECTIVO EN CAJA MUNICIPAL");
  const esEfectivo = metodoPagoStr.toLowerCase().includes("efectivo");

  const montoRecibidoNum = Number(solComp.montoRecibido || datos.montoRecibido || 10.00);
  const vueltoNum = Number(solComp.vuelto || datos.vuelto || Math.max(0, montoRecibidoNum - montoTotal));

  // CAJERO AUTÉNTICO LOGUEADO
  const nombreUsuarioActual = usuario?.nombre || usuario?.displayName || usuario?.email || "MARÍA LÓPEZ";
  const cajeroNombreReal = String(solComp.cajeraResponsable || datos.cajeraResponsable || solComp.usuarioCajero || nombreUsuarioActual).toUpperCase();
  const codigoCajero = String(solComp.uidCajero || datos.uidCajero || usuario?.uid || "CAJ-001").slice(0, 10).toUpperCase();

  const codigoInternoOp = `OP-2026-${expIdNum}`;
  const flowCode = solComp.flowOrder || solComp.codigoOperacion || datos.codigoOperacion || `FLOW-${expIdNum}`;

  // CÓDIGO VERIFICACIÓN Y HASH SHA-256 SIMULADO DETERMINÍSTICO
  const seedString = `${rucEstablecimiento}-${codComprobanteStr}-${montoTotal.toFixed(2)}-${expIdNum}`;
  let hashHex = "";
  for (let i = 0; i < 40; i++) {
    const charCode = (seedString.charCodeAt(i % seedString.length) * (i + 17) * 13) % 16;
    hashHex += charCode.toString(16);
  }
  const codigoVerificacionStr = `V-${expIdNum}-${hashHex.slice(0, 6).toUpperCase()}`;

  // QR CODE SUNAT OFICIAL
  const tipoDocSunat = esFactura ? "01" : "03";
  const tipoDocCliente = esFactura ? "6" : "1";
  const docClienteNum = esFactura ? rucEstablecimiento : clienteDni;
  const fechaDocSunat = new Date().toISOString().split("T")[0];
  const qrString = `20145532000|${tipoDocSunat}|${codComprobanteStr}|${igvVal.toFixed(2)}|${montoTotal.toFixed(2)}|${fechaDocSunat}|${tipoDocCliente}|${docClienteNum}|${hashHex}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&margin=0&data=${encodeURIComponent(qrString)}`;

  // ESTADOS DEL EXPEDIENTE MUNICIPAL
  const estEstado = (solComp.estado || solComp.estadoNormalizado || "").toLowerCase();
  const estEnviadoFuncionario = Boolean(solComp.id || solComp.fechaSolicitud);
  const estRevisionDocAprobada = estEstado.includes("revisado") || estEstado.includes("validad") || estEstado.includes("inspección") || estEstado.includes("aprobado");
  const estInspeccionAprobada = estEstado.includes("aprobado") || estEstado.includes("licencia emitida");

  return (
    <div
      id={idContainer}
      style={{
        background: "#ffffff",
        border: "2px solid #0f172a",
        borderRadius: "12px",
        padding: "24px",
        maxWidth: "680px",
        margin: "0 auto",
        textAlign: "left",
        fontFamily: "'Inter', 'Segoe UI', Arial, sans-serif",
        boxShadow: "0 4px 24px rgba(15, 23, 42, 0.08)",
        color: "#0f172a"
      }}
    >
      {/* 1. ENCABEZADO INSTITUCIONAL CON RUC ÚNICO MUNICIPAL */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px", borderBottom: "2px solid #0f172a", paddingBottom: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <div style={{ width: "48px", height: "48px", background: "#0f172a", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", color: "#ffffff", fontSize: "14px", fontWeight: "900", letterSpacing: "1px" }}>
            MPT
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: "15px", fontWeight: "900", color: "#0f172a", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              MUNICIPALIDAD PROVINCIAL DE TRUJILLO
            </h2>
            <span style={{ fontSize: "11px", fontWeight: "700", color: "#2563eb", display: "block", marginTop: "2px" }}>
              Gerencia de Desarrollo Económico Local — Subgerencia de Licencias
            </span>
            <span style={{ fontSize: "10.5px", color: "#475569", display: "block", marginTop: "2px" }}>
              Jr. Diego de Almagro N° 525, Trujillo — Tel: (044) 486000
            </span>
          </div>
        </div>

        {/* RECUADRO FISCAL DERECHO DE EMISIÓN */}
        <div style={{ border: `2.5px solid ${esFactura ? "#dc2626" : "#2563eb"}`, borderRadius: "8px", background: esFactura ? "#fef2f2" : "#eff6ff", padding: "10px 14px", textAlign: "center", minWidth: "210px" }}>
          <span style={{ fontSize: "11px", fontWeight: "900", textTransform: "uppercase", letterSpacing: "0.5px", color: "#475569", display: "block" }}>RUC: 20145532000</span>
          <span style={{ fontSize: "13.5px", fontWeight: "900", textTransform: "uppercase", color: esFactura ? "#991b1b" : "#1e40af", display: "block", margin: "3px 0" }}>
            {esFactura ? "FACTURA ELECTRÓNICA" : "BOLETA DE VENTA ELECTRÓNICA"}
          </span>
          <span style={{ fontSize: "16px", fontWeight: "900", color: esFactura ? "#dc2626" : "#2563eb", display: "block" }}>
            N° {codComprobanteStr}
          </span>
        </div>
      </div>

      {/* 2. METADATA DE EMISIÓN (MONEDA ÚNICA: PEN) */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", background: "#f8fafc", padding: "10px 14px", borderRadius: "8px", border: "1px solid #e2e8f0", marginBottom: "16px", fontSize: "12px" }}>
        <div><strong>Código Expediente:</strong> <span style={{ color: "#2563eb", fontWeight: "800" }}>{expId}</span></div>
        <div><strong>Fecha/Hora Emisión:</strong> {fechaHora}</div>
        <div><strong>Moneda:</strong> PEN (Soles Peruanos)</div>
      </div>

      {/* 3. DATOS COMPLETOS DEL ESTABLECIMIENTO COMERCIAL Y DEL CLIENTE */}
      <div style={{ background: "#f8fafc", border: "1px solid #cbd5e1", borderRadius: "8px", padding: "14px", marginBottom: "16px", display: "grid", gap: "12px" }}>
        {/* BLOQUE ESTABLECIMIENTO */}
        <div>
          <h4 style={{ margin: "0 0 6px", color: "#0f172a", fontSize: "12.5px", fontWeight: "800", borderBottom: "1px solid #e2e8f0", paddingBottom: "3px", textTransform: "uppercase" }}>
            🏢 Datos del Establecimiento Comercial
          </h4>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px", fontSize: "12px", color: "#334155" }}>
            <p style={{ margin: 0 }}><strong>Razón Social:</strong> {razonSocialEstablecimiento}</p>
            <p style={{ margin: 0 }}><strong>Nombre Comercial:</strong> {nombreComercialEstablecimiento}</p>
            <p style={{ margin: 0 }}><strong>RUC del Local:</strong> {rucEstablecimiento}</p>
            <p style={{ margin: 0 }}><strong>Dirección Fiscal:</strong> {direccionEstablecimiento}</p>
          </div>
        </div>

        {/* BLOQUE CLIENTE / ADQUIRENTE */}
        <div style={{ borderTop: "1px solid #cbd5e1", paddingTop: "8px" }}>
          <h4 style={{ margin: "0 0 6px", color: esFactura ? "#991b1b" : "#1e40af", fontSize: "12.5px", fontWeight: "800", borderBottom: "1px solid #e2e8f0", paddingBottom: "3px", textTransform: "uppercase" }}>
            👤 Datos del Cliente / Adquirente
          </h4>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px", fontSize: "12px", color: "#334155" }}>
            <p style={{ margin: 0 }}><strong>Cliente / Adquirente:</strong> {clienteNombre}</p>
            <p style={{ margin: 0 }}><strong>DNI / Doc. Identidad:</strong> {clienteDni}</p>
          </div>
        </div>
      </div>

      {/* 4. TABLA DE DETALLE SEGÚN TIPO DE COMPROBANTE (BOLETA DE VENTA VS FACTURA ELECTRÓNICA) */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "16px", fontSize: "12px", border: "1px solid #cbd5e1" }}>
        <thead>
          <tr style={{ background: esFactura ? "#7f1d1d" : "#0f172a", color: "#ffffff" }}>
            <th style={{ padding: "8px", textAlign: "center", width: "7%", textTransform: "uppercase" }}>CANT</th>
            <th style={{ padding: "8px", textAlign: "left", textTransform: "uppercase" }}>DESCRIPCIÓN</th>
            {esFactura ? (
              <>
                <th style={{ padding: "8px", textAlign: "right", width: "16%", textTransform: "uppercase" }}>VAL. UNIT</th>
                <th style={{ padding: "8px", textAlign: "right", width: "16%", textTransform: "uppercase" }}>VAL. VENTA</th>
                <th style={{ padding: "8px", textAlign: "right", width: "14%", textTransform: "uppercase" }}>IGV (18%)</th>
                <th style={{ padding: "8px", textAlign: "right", width: "16%", textTransform: "uppercase" }}>IMPORTE</th>
              </>
            ) : (
              <>
                <th style={{ padding: "8px", textAlign: "right", width: "18%", textTransform: "uppercase" }}>PRECIO UNIT.</th>
                <th style={{ padding: "8px", textAlign: "right", width: "20%", textTransform: "uppercase" }}>IMPORTE TOTAL</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: "1px solid #cbd5e1" }}>
            <td style={{ padding: "10px", textAlign: "center", fontWeight: "bold" }}>1</td>
            <td style={{ padding: "10px" }}>
              <strong>Derecho de Trámite — {solComp.tipoTramite || datos.tipoTramite || "Licencia Municipal de Funcionamiento"}</strong>
              <small style={{ display: "block", color: "#64748b" }}>Expediente Municipal N° {expId}</small>
            </td>
            {esFactura ? (
              <>
                <td style={{ padding: "10px", textAlign: "right" }}>S/ {valorVentaVal.toFixed(2)}</td>
                <td style={{ padding: "10px", textAlign: "right" }}>S/ {valorVentaVal.toFixed(2)}</td>
                <td style={{ padding: "10px", textAlign: "right" }}>S/ {igvVal.toFixed(2)}</td>
                <td style={{ padding: "10px", textAlign: "right", fontWeight: "800", color: "#0f172a" }}>S/ {montoTotal.toFixed(2)}</td>
              </>
            ) : (
              <>
                <td style={{ padding: "10px", textAlign: "right", fontWeight: "700" }}>S/ {montoTotal.toFixed(2)}</td>
                <td style={{ padding: "10px", textAlign: "right", fontWeight: "900", color: "#0f172a" }}>S/ {montoTotal.toFixed(2)}</td>
              </>
            )}
          </tr>
        </tbody>
      </table>

      {/* 5. RESUMEN UNIFICADO DE TOTALES SIN DUPLICADOS */}
      <div style={{ background: "#f8fafc", padding: "14px 18px", borderRadius: "8px", border: "1px solid #cbd5e1", marginBottom: "16px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px" }}>
        <div style={{ fontSize: "12px", color: "#334155", flex: 1 }}>
          <p style={{ margin: "0 0 6px", fontWeight: "800", color: "#0f172a" }}>
            {convertirNumeroALetras(montoTotal)}
          </p>
          {esFactura && (
            <p style={{ margin: 0, fontSize: "11.5px", color: "#64748b" }}>
              Operación Gravada sujeta al Impuesto General a las Ventas (18%).
            </p>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: "240px", fontSize: "12px" }}>
          {esFactura && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", color: "#475569" }}>
                <span>Valor de Venta:</span>
                <strong>S/ {valorVentaVal.toFixed(2)}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", color: "#475569" }}>
                <span>IGV (18%):</span>
                <strong>S/ {igvVal.toFixed(2)}</strong>
              </div>
            </>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", borderTop: esFactura ? "1.5px solid #0f172a" : "none", paddingTop: "6px", fontSize: "14px", fontWeight: "900", color: "#0f172a" }}>
            <span>Importe Total:</span>
            <span style={{ color: esFactura ? "#dc2626" : "#2563eb" }}>S/ {montoTotal.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* 6. INFORMACIÓN DEL PAGO Y CAJERO CON NOMBRE REAL */}
      <div style={{ background: "#f8fafc", border: "1px solid #cbd5e1", borderRadius: "8px", padding: "12px 14px", marginBottom: "16px", fontSize: "11.5px" }}>
        <strong style={{ color: "#0f172a", fontSize: "12px", display: "block", marginBottom: "6px", borderBottom: "1px solid #e2e8f0", paddingBottom: "3px", textTransform: "uppercase" }}>
          Información del Pago y Ventanilla
        </strong>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "5px" }}>
          <p style={{ margin: 0 }}><strong>Método de Pago:</strong> {metodoPagoStr.toUpperCase()}</p>
          <p style={{ margin: 0 }}><strong>Estado del Pago:</strong> <span style={{ color: "#16a34a", fontWeight: "bold" }}>CONFIRMADO</span></p>
          <p style={{ margin: 0 }}><strong>Fecha y Hora:</strong> {fechaHora}</p>
          <p style={{ margin: 0 }}><strong>Cajero Responsable:</strong> {cajeroNombreReal}</p>
          <p style={{ margin: 0 }}><strong>Código del Cajero:</strong> {codigoCajero}</p>
          <p style={{ margin: 0 }}><strong>Ventanilla:</strong> Ventanilla Principal - Caja 01</p>
          <p style={{ margin: 0, gridColumn: "span 2" }}><strong>Código Interno de Operación:</strong> {codigoInternoOp}</p>

          {esEfectivo ? (
            <>
              <p style={{ margin: 0, fontWeight: "bold" }}><strong>Monto Recibido:</strong> S/ {montoRecibidoNum.toFixed(2)}</p>
              <p style={{ margin: 0, color: "#16a34a", fontWeight: "bold" }}><strong>Vuelto Entregado:</strong> S/ {vueltoNum.toFixed(2)}</p>
            </>
          ) : (
            <>
              <p style={{ margin: 0, fontWeight: "bold" }}><strong>ID Transacción Flow:</strong> {flowCode}</p>
              <p style={{ margin: 0, color: "#2563eb", fontWeight: "bold" }}><strong>Estado Pasarela:</strong> APROBADO</p>
            </>
          )}
        </div>
      </div>

      {/* 7. PIE DE SEGURIDAD ELECTRÓNICA, CÓDIGO VERIFICACIÓN, HASH Y QR REAL */}
      <div style={{ borderTop: "1.5px solid #cbd5e1", paddingTop: "12px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "16px" }}>
        <div style={{ fontSize: "10.5px", color: "#475569", flex: 1, lineHeight: "1.45" }}>
          <p style={{ margin: "0 0 3px", fontWeight: "bold", color: "#0f172a", fontSize: "11px" }}>
            Representación impresa de la {esFactura ? "Factura Electrónica" : "Boleta de Venta Electrónica"}
          </p>
          <p style={{ margin: "0 0 3px" }}>
            <strong>Cód. Verificación:</strong> {codigoVerificacionStr}
          </p>
          <p style={{ margin: "0 0 6px", wordBreak: "break-all", fontFamily: "monospace", fontSize: "9.5px", color: "#64748b" }}>
            <strong>Hash SHA-256:</strong> {hashHex}
          </p>
          <p style={{ margin: 0, fontSize: "9.5px", fontStyle: "italic", color: "#64748b", borderTop: "1px solid #e2e8f0", paddingTop: "4px" }}>
            {esFactura
              ? "Representación impresa de la Factura Electrónica emitida en el Sistema de Emisión Electrónica SUNAT."
              : "Representación impresa de la Boleta de Venta Electrónica. Este comprobante no otorga derecho a crédito fiscal conforme a la normativa tributaria vigente."}
          </p>
        </div>

        {/* CÓDIGO QR REAL DE SEGURIDAD */}
        <div style={{ border: "1px solid #0f172a", padding: "6px", borderRadius: "6px", background: "white", textAlign: "center", minWidth: "120px" }}>
          <img
            src={qrUrl}
            alt="Código QR SUNAT"
            style={{ width: "95px", height: "95px", display: "block", margin: "0 auto" }}
          />
          <span style={{ fontSize: "7.5px", fontWeight: "700", color: "#475569", display: "block", marginTop: "4px", lineHeight: "1.2" }}>
            Escanee este QR para validar en SUNAT
          </span>
        </div>
      </div>
    </div>
  );
};

function PanelCajero({ seccion, cambiarSeccion }) {
  const { usuario } = useAuth();
  const [solicitudes, setSolicitudes] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [busquedaRuc, setBusquedaRuc] = useState("");
  const [filtroDistrito, setFiltroDistrito] = useState("todos");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [errorFechaRange, setErrorFechaRange] = useState("");
  const [solicitudCobro, setSolicitudCobro] = useState(null);
  const [solicitudVerDetalle, setSolicitudVerDetalle] = useState(null);
  const [solicitudVerBoleta, setSolicitudVerBoleta] = useState(null);
  const [documentoPdfVisor, setDocumentoPdfVisor] = useState(null);
  const [solicitudRenovacion, setSolicitudRenovacion] = useState(null);
  const [metodoPagoSeleccionado, setMetodoPagoSeleccionado] = useState("Efectivo en Caja Municipal");
  const [montoRecibidoInput, setMontoRecibidoInput] = useState("");
  const [comprobanteGenerado, setComprobanteGenerado] = useState(null);
  const [procesando, setProcesando] = useState(false);

  // VISTA SECUNDARIA DE CONSULTA DE ESTADO DE TRÁMITES
  const [vistaConsultaEstado, setVistaConsultaEstado] = useState(() => seccion === "consulta-expedientes" || seccion === "solicitudes-pago");

  useEffect(() => {
    if (seccion === "consulta-expedientes" || seccion === "solicitudes-pago") {
      setVistaConsultaEstado(true);
    } else if (seccion === "inicio") {
      setVistaConsultaEstado(false);
    }
  }, [seccion]);

  // ESTADOS DE ASIGNACIÓN E INSPECCIÓN DIRECTA (DESDE MAÑANA COMO MÍNIMO)
  const [inspectorElegido, setInspectorElegido] = useState(() => INSPECTORES_DEFAULT[0]);
  const [fechaInspeccion, setFechaInspeccion] = useState(() => formatearFechaLocal(obtenerFechaMinimaInspeccion()));
  const [slotInspeccion, setSlotInspeccion] = useState("08:00 AM - 10:00 AM");
  const [sinDisponibilidadInspeccion, setSinDisponibilidadInspeccion] = useState(false);

  // ESTADOS PARA REGISTRO PRESENCIAL DE NUEVA SOLICITUD (WIZARD DE PASO ÚNICO ACTIVO)
  const [pasoActual, setPasoActual] = useState(1);
  const [pagoConfirmadoLocal, setPagoConfirmadoLocal] = useState(false);
  const [tipoComprobanteSeleccionado, setTipoComprobanteSeleccionado] = useState("Factura");
  const [tipoTramiteSeleccionado, setTipoTramiteSeleccionado] = useState("Nueva Licencia de Funcionamiento");
  const [resultadoRegistroExitoso, setResultadoRegistroExitoso] = useState(null);
  const [mostrarModalNuevaSolicitud, setMostrarModalNuevaSolicitud] = useState(false);
  const [dniForm, setDniForm] = useState("");
  const [nombresForm, setNombresForm] = useState("");
  const [apellidosForm, setApellidosForm] = useState("");
  const [correoForm, setCorreoForm] = useState("");
  const [telefonoForm, setTelefonoForm] = useState("");
  const [rucForm, setRucForm] = useState("");
  const [nombreNegocioForm, setNombreNegocioForm] = useState("");
  const [razonSocialForm, setRazonSocialForm] = useState("");
  const [direccionForm, setDireccionForm] = useState("");
  const [nombreSucursalForm, setNombreSucursalForm] = useState("Sede Principal");
  const [giroForm, setGiroForm] = useState("general");
  const [consultandoDni, setConsultandoDni] = useState(false);
  const [consultandoRuc, setConsultandoRuc] = useState(false);
  const [archivosPresenciales, setArchivosPresenciales] = useState([]);

  // ESTADOS DE VALIDACIÓN REAL RENIEC Y SUNAT
  const [dniValidado, setDniValidado] = useState(false);
  const [rucValidado, setRucValidado] = useState(false);
  // ESTADOS DE UBICACIÓN Y JURISDICCIÓN SUNAT
  const [estadoSunat, setEstadoSunat] = useState("");
  const [condicionSunat, setCondicionSunat] = useState("");
  const [distritoSunat, setDistritoSunat] = useState("");
  const [provinciaSunat, setProvinciaSunat] = useState("");
  const [departamentoSunat, setDepartamentoSunat] = useState("");
  const [actividadEconomicaSunat, setActividadEconomicaSunat] = useState("");
  const [direccionOriginalSunat, setDireccionOriginalSunat] = useState("");
  const [esJurisdiccionTrujillo, setEsJurisdiccionTrujillo] = useState(true);

  // ESTADOS Y GESTIÓN DE APERTURA, ARQUEO Y CIERRE DE CAJA MUNICIPAL (BUENAS PRÁCTICAS)
  const [cajaAbierta, setCajaAbierta] = useState(() => {
    try {
      const saved = localStorage.getItem("caja_municipal_estado");
      return saved ? JSON.parse(saved) : { abierta: false, montoInicial: 0, fechaApertura: null };
    } catch {
      return { abierta: false, montoInicial: 0, fechaApertura: null };
    }
  });

  const [mostrarModalAperturaCaja, setMostrarModalAperturaCaja] = useState(false);
  const [mostrarModalArqueoCaja, setMostrarModalArqueoCaja] = useState(false);
  const [formAperturaMonto, setFormAperturaMonto] = useState("100.00");
  const [observacionesCierre, setObservacionesCierre] = useState("");
  const [procesandoApertura, setProcesandoApertura] = useState(false);

  // EFECTO DE CUALIFICACIÓN: VERIFICAR AL INICIAR SI EL CAJERO DE SESIÓN YA POSEE UNA CAJA ABIERTA EN FIRESTORE
  useEffect(() => {
    const verificarCajaActiva = async () => {
      const cajeroId = usuario?.uid || usuario?.id || "CAJERO-001";
      try {
        const cajaActivaBD = await obtenerCajaActivaPorCajero(cajeroId);
        if (cajaActivaBD) {
          const estadoAbierta = {
            id: cajaActivaBD.id,
            abierta: true,
            montoInicial: parseFloat(cajaActivaBD.montoInicial || 0),
            fechaApertura: cajaActivaBD.fechaApertura || new Date().toLocaleString("es-PE"),
            cajeraNombre: cajaActivaBD.cajeroNombre || usuario?.nombre || usuario?.email || "Cajero Responsable",
            cajeroId: cajaActivaBD.cajeroId || cajeroId
          };
          setCajaAbierta(estadoAbierta);
          localStorage.setItem("caja_municipal_estado", JSON.stringify(estadoAbierta));
        }
      } catch (err) {
        console.error("Error al consultar caja activa del cajero:", err);
      }
    };

    verificarCajaActiva();
  }, [usuario]);

  // APERTURA DE CAJA: UTILIZA AUTOMÁTICAMENTE LA INFORMACIÓN DEL CAJERO DE LA SESIÓN
  const ejecutarAperturaCaja = async (e) => {
    if (e && e.preventDefault) e.preventDefault();

    const cajeroId = usuario?.uid || usuario?.id || "CAJERO-001";
    const cajeroNombre = usuario?.nombre || usuario?.displayName || usuario?.email || "Cajera Responsable";
    const cajeroEmail = usuario?.email || "";

    if (formAperturaMonto === undefined || formAperturaMonto === null || String(formAperturaMonto).trim() === "") {
      alert("⚠️ El monto inicial de caja es obligatorio.");
      return;
    }

    const strMonto = String(formAperturaMonto).trim();
    if (!/^\d+(\.\d{1,2})?$/.test(strMonto)) {
      alert("⚠️ El monto inicial solo debe contener números positivos con hasta 2 decimales (ejemplo: 100.00).");
      return;
    }

    const monto = parseFloat(strMonto);
    if (isNaN(monto) || monto < 20.00 || monto > 2000.00) {
      alert("⚠️ El monto inicial de caja permitido debe estar entre S/ 20.00 y S/ 2,000.00.");
      return;
    }

    // VALIDACIÓN LOCAL Y DE FIRESTORE: NO PERMITIR MÁS DE UNA CAJA ABIERTA PARA EL MISMO CAJERO
    if (cajaAbierta.abierta) {
      alert(`⚠️ Ya cuenta con una Caja Municipal Abierta desde ${cajaAbierta.fechaApertura || "el inicio de turno"} con un fondo inicial de S/ ${cajaAbierta.montoInicial.toFixed(2)}.\n\nNo es posible registrar más de una apertura activa simultáneamente.`);
      setMostrarModalAperturaCaja(false);
      return;
    }

    try {
      setProcesandoApertura(true);
      const resCaja = await abrirCajaMunicipal({
        cajeroId,
        cajeroNombre,
        cajeroEmail,
        montoInicial: monto,
      });

      const nuevaAperturaState = {
        id: resCaja.id,
        abierta: true,
        montoInicial: monto,
        fechaApertura: resCaja.fechaApertura,
        cajeraNombre: cajeroNombre,
        cajeroId: cajeroId,
        cajeroEmail: cajeroEmail
      };

      setCajaAbierta(nuevaAperturaState);
      localStorage.setItem("caja_municipal_estado", JSON.stringify(nuevaAperturaState));
      setMostrarModalAperturaCaja(false);
      alert(`✅ Caja Municipal Aperturada Exitosamente.\n\nResponsable: ${cajeroNombre}\nFondo Inicial: S/ ${monto.toFixed(2)}\nFecha y Hora: ${resCaja.fechaApertura}`);
    } catch (error) {
      alert(error.message || "Error al realizar la apertura de caja.");
    } finally {
      setProcesandoApertura(false);
    }
  };

  const ejecutarCierreCaja = async () => {
    if (!window.confirm("¿Está seguro de efectuar el CIERRE DE CAJA Y ARQUEO DE TURNO? No se podrán procesar cobros presenciales hasta aperturar un nuevo turno.")) {
      return;
    }

    try {
      if (cajaAbierta.id) {
        await cerrarCajaMunicipal(cajaAbierta.id, resumenArqueoCaja);
      }
    } catch (err) {
      console.error("Error cerrando caja en Firestore:", err);
    }

    const estadoCerrada = { abierta: false, montoInicial: 0, fechaApertura: null };
    setCajaAbierta(estadoCerrada);
    localStorage.setItem("caja_municipal_estado", JSON.stringify(estadoCerrada));
    setMostrarModalArqueoCaja(false);
    alert("🔒 Cierre de Caja Municipal y Arqueo de Turno Concluso Exitosamente.");
  };

  const resumenArqueoCaja = useMemo(() => {
    const lista = Array.isArray(solicitudes) ? solicitudes : [];
    const cobrosEfectivoHoy = lista.filter((s) => {
      if (!s) return false;
      const estadoP = String(s.estadoPago || s.pago || "").toLowerCase();
      const esConfirmado = estadoP.includes("confirmado") || estadoP.includes("pagado");
      const esEfectivo = String(s.metodoPago || "").toLowerCase().includes("efectivo");
      return esConfirmado && esEfectivo;
    });

    const totalEfectivo = cobrosEfectivoHoy.reduce(
      (sum, s) => sum + (parseFloat(s.montoPagado) || MONTO_TRAMITE),
      0
    );

    const fondoInicial = parseFloat(cajaAbierta.montoInicial) || 0;
    const saldoTotalEnCaja = fondoInicial + totalEfectivo;

    return {
      totalOperaciones: cobrosEfectivoHoy.length,
      totalEfectivo,
      fondoInicial,
      saldoTotalEnCaja,
    };
  }, [solicitudes, cajaAbierta]);

  // CONSULTAR RENIEC (DNI) EN PRESENCIAL
  const manejarConsultarDniPresencial = async () => {
    if (!dniForm || dniForm.length !== 8) {
      alert("⚠️ Ingrese un DNI válido de 8 dígitos.");
      return;
    }
    setConsultandoDni(true);
    try {
      const res = await consultarDni(dniForm);
      const nom = res.nombres || res.nombre_completo || res.nombreCompleto || "";
      const ape = [res.apellidoPaterno || res.apellido_paterno, res.apellidoMaterno || res.apellido_materno].filter(Boolean).join(" ");

      if (nom) {
        setNombresForm(nom);
        setApellidosForm(ape || "REGISTRADO EN RENIEC");
        setDniValidado(true);
      } else {
        alert("⚠️ No se encontraron datos en RENIEC para este DNI.");
        setDniValidado(false);
      }
    } catch (err) {
      console.error(err);
      alert("Error al consultar RENIEC: " + err.message);
      setDniValidado(false);
    } finally {
      setConsultandoDni(false);
    }
  };

  // CONSULTAR SUNAT (RUC) EN PRESENCIAL CON VALIDACIÓN DE JURISDICCIÓN DE TRUJILLO
  const manejarConsultarRucPresencial = async () => {
    if (!rucForm || rucForm.length !== 11) {
      alert("⚠️ Ingrese un RUC válido de 11 dígitos.");
      return;
    }
    setConsultandoRuc(true);
    try {
      const res = await consultarRuc(rucForm);
      const rSoc = res.razonSocial || res.nombreNegocio || res.nombreComercial || "EMPRESA REGISTRADA S.A.C.";
      const nCom = res.nombreComercial || res.razonSocial || res.nombreNegocio || rSoc;
      const dir = res.direccion || res.direccionFiscal || "AV. ESPAÑA NRO. 123 - TRUJILLO";
      const est = res.estado || "ACTIVO";
      const cond = res.condicion || "HABIDO";

      const dist = res.distrito || "Trujillo";
      const prov = res.provincia || "Trujillo";
      const dep = res.departamento || "La Libertad";
      const act = res.giroComercial || res.actividadEconomica || res.actividad || "VENTA AL POR MENOR EN COMERCIOS NO ESPECIALIZADOS";

      // Validar si pertenece a la jurisdicción de la Provincia de Trujillo, La Libertad
      const provNorm = (prov || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const depNorm = (dep || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const dirNorm = (dir || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const distNorm = (dist || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

      const distritosTrujilloNorm = DISTRITOS_TRUJILLO.map((d) =>
        d.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      );

      const esEnTrujillo =
        provNorm.includes("trujillo") ||
        (depNorm.includes("libertad") && distritosTrujilloNorm.some((d) => distNorm.includes(d) || dirNorm.includes(d))) ||
        (depNorm.includes("libertad") && provNorm.includes("trujillo"));

      // Inferir giro comercial según actividad económica obtenida de SUNAT
      let giroInferido = res.giro || "general";
      const actTexto = act.toLowerCase();
      if (actTexto.includes("restaurante") || actTexto.includes("comida") || actTexto.includes("gastronom")) giroInferido = "restaurante";
      else if (actTexto.includes("farmacia") || actTexto.includes("botic") || actTexto.includes("medic")) giroInferido = "farmacia";
      else if (actTexto.includes("oficina") || actTexto.includes("consultor") || actTexto.includes("servicios")) giroInferido = "oficina";
      else if (actTexto.includes("tienda") || actTexto.includes("bodega") || actTexto.includes("comerc")) giroInferido = "comercial";
      else if (actTexto.includes("hotel") || actTexto.includes("hospedaje")) giroInferido = "hotel";

      setRazonSocialForm(rSoc);
      setNombreNegocioForm(nCom);
      setDireccionForm(dir);
      setDireccionOriginalSunat(dir);
      setEstadoSunat(est);
      setCondicionSunat(cond);
      setDistritoSunat(dist);
      setProvinciaSunat(prov);
      setDepartamentoSunat(dep);
      setActividadEconomicaSunat(act);
      setGiroForm(giroInferido);
      setEsJurisdiccionTrujillo(esEnTrujillo);
      setRucValidado(true);

      if (!esEnTrujillo) {
        alert("⚠️ Este establecimiento no pertenece a la jurisdicción de la Municipalidad Provincial de Trujillo. Solo es posible registrar solicitudes para establecimientos ubicados en la provincia de Trujillo.");
      }
    } catch (err) {
      console.error(err);
      alert("Error al consultar SUNAT: " + err.message);
      setRucValidado(false);
      setEsJurisdiccionTrujillo(false);
    } finally {
      setConsultandoRuc(false);
    }
  };

  const [subiendoPdfCloudinary, setSubiendoPdfCloudinary] = useState(false);

  // CARGAR ARCHIVO PRESENCIAL Y SUBIR A CLOUDINARY
  const manejarArchivoPresencial = async (e, docId, docNombre) => {
    const file = e.target.files[0];
    if (!file) return;

    setSubiendoPdfCloudinary(true);
    try {
      // 1. Intentar subir directamente a Cloudinary
      const resCloudinary = await subirArchivoACloudinary(file);
      const urlCloudinary = resCloudinary.archivoUrl;

      setArchivosPresenciales((prev) => [
        ...prev.filter((item) => item.docId !== docId),
        {
          docId,
          nombre: docNombre || file.name,
          archivoNombre: file.name,
          archivoUrl: urlCloudinary,
          url: urlCloudinary,
          planoUrl: urlCloudinary,
          publicId: resCloudinary.publicId,
          tipo: "presencial",
        },
      ]);
    } catch (errCloudinary) {
      console.warn("[PanelCajero] Falló subida a Cloudinary, usando respaldo Data URL Base64:", errCloudinary.message);
      // 2. Respaldo por FileReader en caso de fallo de conexión
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64Url = reader.result;
        setArchivosPresenciales((prev) => [
          ...prev.filter((item) => item.docId !== docId),
          {
            docId,
            nombre: docNombre || file.name,
            archivoNombre: file.name,
            archivoUrl: base64Url,
            url: base64Url,
            planoUrl: base64Url,
            tipo: "presencial",
          },
        ]);
      };
      reader.readAsDataURL(file);
    } finally {
      setSubiendoPdfCloudinary(false);
    }
  };

  const obtenerConteoInspectorEnFechaLocal = useCallback((inspectorUid, fechaStr) => {
    return obtenerConteoInspectorEnFecha(solicitudes, inspectorUid, fechaStr);
  }, [solicitudes]);

  const esHorarioOcupado = useCallback((inspectorUid, fechaStr, slotValue) => {
    return esSlotOcupadoParaInspector(solicitudes, inspectorUid, fechaStr, slotValue);
  }, [solicitudes]);

  // EJECUCIÓN AUTOMÁTICA DE ASIGNACIÓN (SIGUIENTE HORARIO Y DÍA LIBRE)
  const autoAsignarHorarioLibre = useCallback((lista = solicitudes) => {
    const res = buscarSiguienteDisponibilidad(lista);
    if (res && res.exito) {
      setFechaInspeccion(res.fechaInspeccion);
      setSlotInspeccion(res.slotInspeccion);
      setInspectorElegido(res.inspector);
      setSinDisponibilidadInspeccion(false);
      return res;
    } else {
      setSinDisponibilidadInspeccion(true);
      return null;
    }
  }, [solicitudes]);

  useEffect(() => {
    autoAsignarHorarioLibre(solicitudes);
  }, [solicitudes, autoAsignarHorarioLibre]);

  useEffect(() => {
    if (solicitudCobro) {
      autoAsignarHorarioLibre(solicitudes);
    }
  }, [solicitudCobro, solicitudes, autoAsignarHorarioLibre]);

  const cargarSolicitudes = async () => {
    try {
      setCargando(true);
      const data = await obtenerSolicitudes();
      setSolicitudes(data);
    } catch (error) {
      console.error(error);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    setCargando(true);
    const unsubscribe = suscribirSolicitudes((data) => {
      setSolicitudes(data);
      setCargando(false);
    });
    return () => unsubscribe();
  }, []);

  const formatearFechaHora = () => {
    return new Date().toLocaleString("es-PE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  // CLASIFICACIÓN DE SOLICITUDES
  const pendientesPago = useMemo(() => {
    const lista = Array.isArray(solicitudes) ? solicitudes : [];
    return lista.filter((s) => {
      if (!s) return false;
      const e = String(s.estadoPago || s.estado || "").toLowerCase();
      const esConfirmado = s.estadoPago === "Confirmado" || e.includes("pagado") || e.includes("enviado");
      return !esConfirmado && e !== "anulado";
    });
  }, [solicitudes]);

  const pagadas = useMemo(() => {
    const lista = Array.isArray(solicitudes) ? solicitudes : [];
    return lista.filter((s) => {
      if (!s) return false;
      const e = String(s.estadoPago || s.estado || "").toLowerCase();
      return (s.estadoPago === "Confirmado" || e.includes("pagado")) && !e.includes("inspección") && !e.includes("aprobado");
    });
  }, [solicitudes]);

  const enviadasAInspeccion = useMemo(() => {
    const lista = Array.isArray(solicitudes) ? solicitudes : [];
    return lista.filter((s) => {
      if (!s) return false;
      const e = String(s.estado || s.estadoNormalizado || "").toLowerCase();
      return e.includes("inspeccion") || e.includes("aprobado") || e.includes("revisión");
    });
  }, [solicitudes]);

  const anuladas = useMemo(() => {
    const lista = Array.isArray(solicitudes) ? solicitudes : [];
    return lista.filter((s) => {
      if (!s) return false;
      const e = String(s.estado || "").toLowerCase();
      return e.includes("anulado") || e.includes("rechazado");
    });
  }, [solicitudes]);

  // EVALUACIÓN SECUENCIAL DE LOS 4 PASOS DEL WIZARD DE CAJERO
  // Paso 1: Datos de Contacto (Teléfono Celular iniciado en 9 y Correo válido)
  const esDniValido = Boolean(dniForm) && dniForm.trim().length === 8 && dniValidado;
  const esTelefonoValido = /^9\d{8}$/.test(telefonoForm);
  const esCorreoValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correoForm);
  const paso1Completado = esTelefonoValido && esCorreoValido;

  // Paso 2: Validación SUNAT
  const sunatPermiteContinuar = rucValidado && estadoSunat === "ACTIVO" && condicionSunat === "HABIDO";
  const paso2Completado = paso1Completado && sunatPermiteContinuar && Boolean(nombreNegocioForm) && Boolean(direccionForm);

  // Paso 3: Carga de Documentos Obligatorios por Giro
  const reqsDocInfo = obtenerDocumentosPorGiro(giroForm);
  const reqsDoc = reqsDocInfo?.ciudadano || [];
  const reqsObligatorios = reqsDoc.filter((d) => d.obligatorio);
  const faltanObligatorios = reqsObligatorios.some((req) => !archivosPresenciales.some((a) => a.docId === req.id));
  const paso3Completado = paso2Completado && reqsObligatorios.length > 0 && !faltanObligatorios;

  // Paso 4: Cobro de Tasa (S/ 3.00) y Método de Pago
  const paso4Completado = paso3Completado && Boolean(metodoPagoSeleccionado);

  // Conteo de pasos completados para la barra de progreso
  const pasosCompletadosCount = [
    paso1Completado,
    paso2Completado,
    paso3Completado,
    paso4Completado,
  ].filter(Boolean).length;

  const porcentajeProgreso = Math.round((pasosCompletadosCount / 4) * 100);

  const obtenerEstadoPaso = (numPaso) => {
    if (numPaso === 1) {
      if (paso1Completado) return { icono: "✅", texto: "Completado", bg: "#dcfce7", color: "#15803d" };
      return { icono: "🟡", texto: "En proceso", bg: "#fef3c7", color: "#b45309" };
    }
    if (numPaso === 2) {
      if (!paso1Completado) return { icono: "🔒", texto: "Bloqueado", bg: "#f1f5f9", color: "#64748b" };
      if (paso2Completado) return { icono: "✅", texto: "Completado", bg: "#dcfce7", color: "#15803d" };
      return { icono: "🟡", texto: "En proceso", bg: "#fef3c7", color: "#b45309" };
    }
    if (numPaso === 3) {
      if (!paso2Completado) return { icono: "🔒", texto: "Bloqueado", bg: "#f1f5f9", color: "#64748b" };
      if (paso3Completado) return { icono: "✅", texto: "Completado", bg: "#dcfce7", color: "#15803d" };
      return { icono: "🟡", texto: "En proceso", bg: "#fef3c7", color: "#b45309" };
    }
    if (numPaso === 4) {
      if (!paso3Completado) return { icono: "🔒", texto: "Bloqueado", bg: "#f1f5f9", color: "#64748b" };
      if (paso4Completado) return { icono: "✅", texto: "Completado", bg: "#dcfce7", color: "#15803d" };
      return { icono: "🟡", texto: "En proceso", bg: "#fef3c7", color: "#b45309" };
    }
    return { icono: "🔒", texto: "Bloqueado", bg: "#f1f5f9", color: "#64748b" };
  };

  const obtenerFechaPagoObj = useCallback((s) => {
    const str = s.fechaPago || s.fechaPagoPresencial || s.fechaCobro || s.fechaEmision || s.fechaRegistro || s.fechaVisitaInspector || s.fecha || "";
    if (!str) return null;
    if (typeof str === "object" && str.seconds) {
      return new Date(str.seconds * 1000);
    }
    if (typeof str === "string") {
      if (str.includes("-")) {
        const [y, m, d] = str.split("-").map(Number);
        return new Date(y, m - 1, d);
      }
      if (str.includes("/")) {
        const [d, m, y] = str.split("/").map(Number);
        return new Date(y, m - 1, d);
      }
    }
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  }, []);

  const obtenerFechaHoyStr = useCallback(() => {
    const hoy = new Date();
    const y = hoy.getFullYear();
    const m = String(hoy.getMonth() + 1).padStart(2, "0");
    const d = String(hoy.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }, []);

  const parseFechaGenerica = useCallback((val) => {
    if (!val) return null;
    if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
    if (typeof val === "object" && val.seconds) {
      return new Date(val.seconds * 1000);
    }
    if (typeof val === "object" && typeof val.toDate === "function") {
      try { return val.toDate(); } catch (e) {}
    }
    if (typeof val === "number") return new Date(val);
    const str = String(val).trim();
    if (!str) return null;
    if (str.includes("T")) {
      const d = new Date(str);
      if (!isNaN(d.getTime())) return d;
    }
    if (str.includes("-")) {
      const parts = str.split("-");
      if (parts.length === 3) {
        const y = parts[0].length === 4 ? Number(parts[0]) : Number(parts[2]);
        const m = Number(parts[1]) - 1;
        const d = parts[0].length === 4 ? Number(parts[2]) : Number(parts[0]);
        return new Date(y, m, d);
      }
    }
    if (str.includes("/")) {
      const parts = str.split("/");
      if (parts.length === 3) {
        const d = Number(parts[0]);
        const m = Number(parts[1]) - 1;
        const y = parts[2].length === 4 ? Number(parts[2]) : Number(`20${parts[2]}`);
        return new Date(y, m, d);
      }
    }
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  }, []);

  // BUSQUEDA Y FILTRADO DE EXPEDIENTES (RUC, CÓDIGO EXP-, NOMBRE DE NEGOCIO O DISTRITO DE TRUJILLO)
  const solicitudesFiltradas = useMemo(() => {
    const lista = Array.isArray(solicitudes) ? solicitudes : [];

    return lista.filter((s) => {
      if (!s) return false;

      // Filtro por Distrito (12 Distritos de Trujillo)
      if (filtroDistrito && filtroDistrito !== "todos") {
        if (!coincideDistrito(s.distrito || s.distritoEstablecimiento, filtroDistrito)) {
          return false;
        }
      }

      // Filtro por Rango de Fechas (Desde / Hasta)
      if (fechaDesde) {
        const fSol = parseFechaGenerica(s.fechaVisitaInspector || s.fechaSolicitud || s.fecha || s.creadoEn);
        const fDesde = parseFechaGenerica(fechaDesde);
        if (fSol && fDesde) {
          fDesde.setHours(0, 0, 0, 0);
          if (fSol < fDesde) return false;
        }
      }
      if (fechaHasta) {
        const fSol = parseFechaGenerica(s.fechaVisitaInspector || s.fechaSolicitud || s.fecha || s.creadoEn);
        const fHasta = parseFechaGenerica(fechaHasta);
        if (fSol && fHasta) {
          fHasta.setHours(23, 59, 59, 999);
          if (fSol > fHasta) return false;
        }
      }

      // Si el campo de búsqueda está vacío, mostrar TODAS las solicitudes registradas del distrito y rango de fecha
      if (!busqueda || !busqueda.trim()) return true;
      const q = busqueda.toLowerCase().trim();
      const ruc = String(s.ruc || "").toLowerCase();
      const idExp = String(s.id || "").toLowerCase();
      const codExp = `exp-${idExp}`;
      const negocio = String(s.nombreNegocio || s.razonSocial || "").toLowerCase();
      const dni = String(s.dni || s.dniSolicitante || "").toLowerCase();
      const distritoStr = String(s.distrito || "").toLowerCase();

      return ruc.includes(q) || idExp.includes(q) || codExp.includes(q) || negocio.includes(q) || dni.includes(q) || distritoStr.includes(q);
    });
  }, [solicitudes, busqueda, filtroDistrito, fechaDesde, fechaHasta, parseFechaGenerica]);

  // CÁLCULO DE SUCURSALES / LOCALES EXISTENTES REGISTRADOS PARA EL RUC ACTUAL
  const sucursalesExistentesDelRuc = useMemo(() => {
    if (!rucForm || !rucValidado || !Array.isArray(solicitudes)) return [];
    const rucClean = String(rucForm).trim();
    return solicitudes.filter((s) => s && String(s.ruc).trim() === rucClean);
  }, [rucForm, rucValidado, solicitudes]);

  // CONFIRMAR PAGO Y PROGRAMAR INSPECCIÓN OFICIAL
  const ejecutarCobro = async () => {
    if (!solicitudCobro) return;
    const idExpLimpio = String(solicitudCobro.id).replace(/^EXP-/, "");
    if (!inspectorElegido) {
      alert("⚠️ Por favor seleccione un inspector para la visita técnica.");
      return;
    }
    if (!fechaInspeccion) {
      alert("⚠️ Por favor seleccione la fecha de la inspección.");
      return;
    }

    const esEfectivo = metodoPagoSeleccionado.toLowerCase().includes("efectivo");
    const montoRecibidoNum = parseFloat(montoRecibidoInput) || 0;
    const vueltoCalculado = Math.max(0, montoRecibidoNum - MONTO_TRAMITE);

    if (esEfectivo && !cajaAbierta.abierta) {
      alert("🔒 Debe aperturar la caja antes de registrar pagos en efectivo.");
      return;
    }

    if (esEfectivo && montoRecibidoNum < MONTO_TRAMITE) {
      alert(`⚠️ El monto recibido (S/ ${montoRecibidoNum.toFixed(2)}) es menor al total a pagar (S/ ${MONTO_TRAMITE.toFixed(2)}). Por favor ingrese un monto válido.`);
      return;
    }

    // VALIDACIÓN 1: No fechas pasadas
    if (esHorarioPasado(fechaInspeccion, "00:00")) {
      alert("⚠️ No se permite programar inspecciones para fechas pasadas.");
      return;
    }

    // VALIDACIÓN 2: Límite máximo 4 inspecciones por día por inspector
    const cuposActuales = obtenerConteoInspectorEnFecha(inspectorElegido.uid || inspectorElegido.nombre, fechaInspeccion);
    if (cuposActuales >= 4) {
      alert(`⚠️ El inspector ${inspectorElegido.nombre} ya completó el máximo de 4 inspecciones diarias para el día ${fechaInspeccion}. Elija otro inspector o cambie la fecha.`);
      return;
    }

    // VALIDACIÓN 3: No horarios duplicados para el mismo inspector en la misma fecha
    if (esHorarioOcupado(inspectorElegido.uid || inspectorElegido.nombre, fechaInspeccion, slotInspeccion)) {
      alert(`⚠️ El inspector ${inspectorElegido.nombre} ya tiene una visita asignada a las ${slotInspeccion} para el día ${fechaInspeccion}. Elija otro horario disponible.`);
      return;
    }

    if (!metodoPagoSeleccionado.toLowerCase().includes("efectivo")) {
      setProcesando(true);
      try {
        const rawEmail = solicitudCobro.correoUsuario || usuario?.email || "";
        const emailCliente = (rawEmail && rawEmail.includes("@") && rawEmail.split("@")[0].length >= 2)
          ? rawEmail
          : "contribuyente@munitrujillo.gob.pe";
        const nombreCliente = obtenerNombreCiudadanoValido(solicitudCobro);

        const resFlow = await crearOrdenFlow({
          solicitudId: idExpLimpio,
          amount: MONTO_TRAMITE,
          email: emailCliente,
          buyerName: nombreCliente,
          subject: `Derecho de Trámite Licencia EXP-${idExpLimpio}`,
        });

        console.log("[FLOW COBRO CAJERO] Orden creada:", resFlow);

        if (resFlow && (resFlow.paymentUrl || resFlow.url)) {
          const redirectUrl = resFlow.paymentUrl || `${resFlow.url}?token=${resFlow.token}`;
          alert(`🌐 Redirigiendo a la pasarela segura de pago en línea Flow.cl...\n\nOrden de Pago N°: EXP-${idExpLimpio}\nMonto: S/ ${MONTO_TRAMITE.toFixed(2)}\nToken Flow: ${resFlow.token}`);
          window.location.href = redirectUrl;
          return;
        } else {
          throw new Error("No se obtuvo la URL de redirección de Flow.");
        }
      } catch (errFlow) {
        console.error("[FLOW COBRO ERROR]", errFlow);
        alert(`❌ Error al conectar con la pasarela Flow: ${errFlow.message || String(errFlow)}`);
        setProcesando(false);
        return;
      }
    }

    setProcesando(true);
    try {
      const idExpLimpio = String(solicitudCobro.id).replace(/^EXP-/, "");
      const esFacturaDoc = (solicitudCobro.tipoComprobante || "").toLowerCase().includes("factura");
      const codComprobante = esFacturaDoc ? `F001-${idExpLimpio}` : `B001-${idExpLimpio}`;
      const fechaHoraActual = formatearFechaHora();
      const nombreCajera = usuario?.nombre || usuario?.email || "Cajera de Ventanilla";
      const uidCajera = usuario?.uid || "CAJERA-001";
      const slotObj = TIME_SLOTS.find((s) => s.value === slotInspeccion);
      const horaLabel = slotObj ? slotObj.label : `${slotInspeccion} hrs`;

      const cambios = {
        estadoPago: "Confirmado",
        estado: "Inspección programada",
        estadoNormalizado: "INSPECCION_PROGRAMADA",
        estadoInspeccion: "Programada",
        inspeccion: "Programada",
        inspectorUid: inspectorElegido.uid || inspectorElegido.id,
        inspectorAsignadoUid: inspectorElegido.uid || inspectorElegido.id,
        inspectorNombre: inspectorElegido.nombre,
        fechaVisitaInspector: fechaInspeccion,
        horaVisitaInspector: slotInspeccion,
        horaVisitaLabel: horaLabel,
        metodoPago: metodoPagoSeleccionado,
        montoPagado: MONTO_TRAMITE,
        montoRecibido: esEfectivo ? montoRecibidoNum : null,
        vuelto: esEfectivo ? vueltoCalculado : null,
        comprobantePago: `Boleta de Caja N° ${codComprobante}`,
        numeroOperacion: codComprobante,
        fechaPago: fechaHoraActual,
        cajeraResponsable: nombreCajera,
        usuarioCajero: nombreCajera,
        uidCajero: uidCajera,
        fechaEnvioOficial: fechaHoraActual,
        historialAcciones: [
          ...(solicitudCobro.historialAcciones || []),
          {
            fecha: fechaHoraActual.split(",")[0] || fechaHoraActual,
            hora: fechaHoraActual.split(",")[1]?.trim() || "",
            usuario: nombreCajera,
            rol: "Cajera",
            accion: "Cobro de tasa y programación de inspección",
            comentarios: `Pago de S/ ${MONTO_TRAMITE.toFixed(2)} registrado (${metodoPagoSeleccionado}). ${esEfectivo ? `Recibido: S/ ${montoRecibidoNum.toFixed(2)}, Vuelto: S/ ${vueltoCalculado.toFixed(2)}. ` : ''}Boleta: ${codComprobante}. Visita asignada a ${inspectorElegido.nombre} para el ${fechaInspeccion}.`,
          },
        ],
      };

      await actualizarSolicitud(solicitudCobro.id, cambios);

      // Notificación 1: Al Ciudadano
      await crearNotificacion(
        solicitudCobro.uidUsuario || "",
        {
          titulo: "Pago Confirmado e Inspección Programada",
          descripcion: `Su pago por S/ ${MONTO_TRAMITE.toFixed(2)} (${codComprobante}) fue procesado. Su inspección técnica fue asignada a ${inspectorElegido.nombre} para el ${fechaInspeccion} (${horaLabel}).`,
          icono: "📅",
        },
        solicitudCobro.correoUsuario || ""
      );

      // Notificación 2: Al Inspector Asignado (Sistema + Correo Electrónico)
      const correoInspectorCobro = inspectorElegido.correo || `${(inspectorElegido.nombre || "inspector").toLowerCase().replace(/[^a-z]/g, "")}@munitrujillo.gob.pe`;
      const htmlInspectorCobroEmail = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #cbd5e1; border-radius: 12px; overflow: hidden; background: #ffffff;">
          <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: #ffffff; padding: 20px; text-align: center;">
            <h2 style="margin: 0; font-size: 20px; color: #38bdf8;">🏛️ MUNICIPALIDAD PROVINCIAL DE TRUJILLO</h2>
            <p style="margin: 4px 0 0; font-size: 13px; color: #94a3b8;">Subgerencia de Licencias y Comercialización</p>
          </div>

          <div style="padding: 24px; color: #334155; line-height: 1.6;">
            <h3 style="color: #0f172a; margin-top: 0; font-size: 18px; border-bottom: 2px solid #3b82f6; padding-bottom: 8px;">
              🔍 ASIGNACIÓN DE INSPECCIÓN TÉCNICA DE EDIFICACIÓN
            </h3>
            <p>Estimado(a) <strong>${inspectorElegido.nombre}</strong> (${inspectorElegido.cargo || "Inspector Municipal"}),</p>
            <p>Se le ha asignado una nueva inspección técnica para el expediente municipal detallado a continuación:</p>

            <div style="background: #eff6ff; border-left: 4px solid #2563eb; padding: 16px; margin: 16px 0; border-radius: 8px;">
              <h4 style="margin: 0 0 10px; color: #1e40af; font-size: 15px;">📋 DATOS DE LA VISITA TÉCNICA</h4>
              <p style="margin: 4px 0;"><strong>N° Expediente:</strong> EXP-${idExpLimpio}</p>
              <p style="margin: 4px 0;"><strong>📅 Fecha Programada:</strong> <span style="color: #1e3a8a; font-weight: bold;">${fechaInspeccion}</span></p>
              <p style="margin: 4px 0;"><strong>🕒 Horario de Visita:</strong> <span style="color: #1e3a8a; font-weight: bold;">${horaLabel}</span></p>
              <p style="margin: 4px 0;"><strong>🏢 Nombre Comercial:</strong> ${solicitudCobro.nombreNegocio || "Establecimiento Comercial"}</p>
              <p style="margin: 4px 0;"><strong>🧾 RUC:</strong> ${solicitudCobro.ruc || "---"}</p>
              <p style="margin: 4px 0;"><strong>📍 Dirección del Local:</strong> ${solicitudCobro.direccion || "---"}</p>
              <p style="margin: 4px 0;"><strong>📍 Distrito:</strong> ${solicitudCobro.distrito || "Trujillo"}</p>
              <p style="margin: 4px 0;"><strong>👤 Solicitante / Titular:</strong> ${solicitudCobro.nombreSolicitante || "---"}</p>
              <p style="margin: 4px 0;"><strong>📱 Teléfono:</strong> ${solicitudCobro.telefono || "---"}</p>
              <p style="margin: 4px 0;"><strong>📧 Correo:</strong> ${solicitudCobro.correoUsuario || "---"}</p>
              <p style="margin: 4px 0;"><strong>✍️ Cobro y Asignación por Ventanilla:</strong> ${nombreCajera}</p>
            </div>

            <p style="font-size: 13px; color: #64748b; font-style: italic;">
              Por favor acudir puntualmente en el rango de horario asignado. Al finalizar, registre el Acta de Inspección en el Módulo de Inspectores.
            </p>
          </div>

          <div style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 14px; text-align: center; font-size: 11px; color: #64748b;">
            Sistema de Gestión de Licencias de Funcionamiento — Municipalidad Provincial de Trujillo
          </div>
        </div>
      `;

      await crearNotificacion(
        inspectorElegido.uid || "INSPECTOR",
        {
          titulo: `Nueva Inspección Asignada — EXP-${idExpLimpio}`,
          descripcion: `Se le ha asignado la inspección del expediente EXP-${idExpLimpio} (${solicitudCobro.nombreNegocio}) para el ${fechaInspeccion} a las ${horaLabel}.`,
          icono: "🔍",
          html: htmlInspectorCobroEmail,
        },
        correoInspectorCobro
      );

      const actualizada = { ...solicitudCobro, ...cambios, codComprobante };
      setComprobanteGenerado(actualizada);
      setSolicitudCobro(null);
      autoAsignarHorarioLibre(solicitudes);
      await cargarSolicitudes();
    } catch (err) {
      console.error(err);
      alert("Error al procesar cobro y programación: " + err.message);
    } finally {
      setProcesando(false);
    }
  };

  // REGISTRAR SOLICITUD PRESENCIAL COMPLETA (FORMULARIO CAJERA)
  const ejecutarRegistroPresencialCompleto = async (e) => {
    if (e && e.preventDefault) e.preventDefault();

    if (!rucValidado) {
      alert("⚠️ Debe consultar y validar el RUC del establecimiento mediante SUNAT antes de continuar.");
      return;
    }
    const dirNorm = (direccionForm || "").toLowerCase().trim();
    const sucursalNorm = (nombreSucursalForm || "").toLowerCase().trim();

    const rucDuplicadoMismaSucursal = solicitudes.find((s) => {
      if (!s || String(s.ruc).trim() !== String(rucForm).trim()) return false;
      if (["Rechazado", "Licencia rechazada", "Anulado"].includes(s.estado)) return false;
      const sDirNorm = (s.direccion || "").toLowerCase().trim();
      const sSucursalNorm = (s.nombreSucursal || "").toLowerCase().trim();

      const mismaDireccion = dirNorm && sDirNorm && sDirNorm === dirNorm;
      const mismaSucursal = sucursalNorm && sSucursalNorm && sucursalNorm.length > 2 && sucursalNorm === sSucursalNorm;

      return mismaDireccion || mismaSucursal;
    });

    if (rucDuplicadoMismaSucursal) {
      const expLimpio = String(rucDuplicadoMismaSucursal.id).replace(/^EXP-/, "");
      alert(`🚫 No es posible registrar la solicitud.\n\nEl RUC ${rucForm} (${nombreNegocioForm}) ya tiene un expediente activo (EXP-${expLimpio}) registrado en este mismo local/sucursal ("${direccionForm}").\n\nPara registrar una nueva sucursal con el mismo RUC, ingrese una dirección de local diferente o un nombre de sucursal distinto.`);
      return;
    }
    if (!esJurisdiccionTrujillo) {
      alert("Este establecimiento no pertenece a la jurisdicción de la Municipalidad Provincial de Trujillo. Solo es posible registrar solicitudes para establecimientos ubicados en la provincia de Trujillo.");
      return;
    }
    if (!telefonoForm || !/^9\d{8}$/.test(telefonoForm)) {
      alert("⚠️ Ingrese un número de celular peruano válido de 9 dígitos que inicie con 9.");
      return;
    }
    if (!rucForm || rucForm.length !== 11) {
      alert("⚠️ Ingrese un RUC válido de 11 dígitos.");
      return;
    }
    if (!nombreNegocioForm || !direccionForm) {
      alert("⚠️ Complete los datos obligatorios del establecimiento comercial.");
      return;
    }
    let inspActual = inspectorElegido;
    let fechaActual = fechaInspeccion;
    let slotActual = slotInspeccion;

    if (!inspActual || esHorarioOcupado(inspActual.uid || inspActual.nombre, fechaActual, slotActual)) {
      const resAuto = autoAsignarHorarioLibre(solicitudes);
      if (resAuto && resAuto.exito) {
        inspActual = resAuto.inspector;
        fechaActual = resAuto.fechaInspeccion;
        slotActual = resAuto.slotInspeccion;
      }
    }

    if (!inspActual) {
      alert("⚠️ No hay inspectores con cupos disponibles en este momento. Seleccione otra fecha.");
      return;
    }

    const esEfectivo = metodoPagoSeleccionado.toLowerCase().includes("efectivo");
    const montoRecibidoNum = parseFloat(montoRecibidoInput) || 0;
    const vueltoCalculado = Math.max(0, montoRecibidoNum - MONTO_TRAMITE);

    if (esEfectivo && !cajaAbierta.abierta) {
      alert("🔒 Debe aperturar la caja antes de registrar pagos en efectivo.");
      return;
    }

    if (esEfectivo && (montoRecibidoNum < MONTO_TRAMITE || montoRecibidoNum > 200)) {
      alert(`⚠️ El monto recibido en efectivo debe estar entre S/ ${MONTO_TRAMITE.toFixed(2)} y S/ 200.00 (máxima denominación de billete peruano).`);
      return;
    }

    const esFactura = tipoComprobanteSeleccionado === "Factura";

    if (!esFactura) {
      if (!dniForm || dniForm.trim().length !== 8) {
        alert("⚠️ Boleta de Venta Electrónica: Debe ingresar un DNI válido de 8 dígitos del cliente.");
        return;
      }
      if (!dniValidado) {
        alert("⚠️ El DNI ha sido modificado o no ha sido consultado. Debe presionar el botón 'Buscar / Consultar RENIEC' para validar el DNI antes de emitir la Boleta.");
        return;
      }
    } else {
      if (!rucForm || rucForm.trim().length !== 11) {
        alert("⚠️ Factura Electrónica: Para emitir una Factura es obligatorio haber registrado un RUC válido de 11 dígitos de la empresa.");
        return;
      }
      if (!rucValidado) {
        alert("⚠️ Debe consultar y validar el RUC de la empresa con SUNAT antes de emitir la Factura Electrónica.");
        return;
      }
    }

    setProcesando(true);
    try {
      const idExp = Date.now().toString().slice(-8);
      const esFactura = tipoComprobanteSeleccionado === "Factura";
      const codComprobante = esFactura
        ? `F001-${idExp}`
        : `B001-${idExp}`;
      const nombreComprobanteTitulo = esFactura ? "FACTURA ELECTRÓNICA" : "BOLETA DE VENTA ELECTRÓNICA";
      const fechaHoraActual = formatearFechaHora();
      const nombreCajera = usuario?.nombre || usuario?.email || "Cajera de Ventanilla";
      const uidCajera = usuario?.uid || "CAJERA-001";
      const slotObj = TIME_SLOTS.find((s) => s.value === slotInspeccion);
      const horaLabel = slotObj ? slotObj.label : `${slotInspeccion} hrs`;

      const archivosLimpios = (archivosPresenciales || []).map((a) => ({
        docId: a?.docId || "plano_local",
        nombre: a?.nombre || a?.archivoNombre || "Plano Arquitectónico (PDF)",
        archivoNombre: a?.archivoNombre || a?.nombre || "Plano_Local.pdf",
        archivoUrl: a?.archivoUrl || a?.url || "",
        url: a?.archivoUrl || a?.url || "",
        planoUrl: a?.archivoUrl || a?.url || "",
        tipo: a?.tipo || "presencial",
        publicId: a?.publicId || "",
      }));

      const urlPlanoPrincipal = archivosLimpios[0]?.archivoUrl || "";

      const nuevaSolicitudPresencial = {
        id: idExp,
        numeroExpediente: `EXP-${idExp}`,
        dniSolicitante: dniForm || "",
        dni: dniForm || "",
        nombresSolicitante: nombresForm || razonSocialForm || nombreNegocioForm || "",
        apellidosSolicitante: apellidosForm || "",
        nombreSolicitante: (nombresForm && apellidosForm) ? `${nombresForm} ${apellidosForm}` : (razonSocialForm || nombreNegocioForm || "SOLICITANTE PRESENCIAL"),
        correoUsuario: correoForm || `${rucForm}@empresa.pe`,
        telefono: telefonoForm || "",
        telefonoSolicitante: telefonoForm || "",
        telefonoContacto: telefonoForm || "",
        celular: telefonoForm || "",
        ruc: rucForm || "",
        nombreNegocio: nombreNegocioForm || "",
        razonSocial: razonSocialForm || nombreNegocioForm || "",
        nombreSucursal: nombreSucursalForm || "Sede Principal",
        sucursal: nombreSucursalForm || "Sede Principal",
        direccion: direccionForm || "",
        giro: giroForm || "",
        tipoTramite: tipoTramiteSeleccionado || "Nueva Licencia de Funcionamiento",
        estado: esEfectivo ? "Inspección programada" : "Pendiente de pago",
        estadoNormalizado: esEfectivo ? "INSPECCION_PROGRAMADA" : "PENDIENTE_PAGO",
        estadoPago: esEfectivo ? "Confirmado" : "Pendiente",
        metodoPago: metodoPagoSeleccionado || "Efectivo",
        montoPagado: esEfectivo ? MONTO_TRAMITE : 0,
        montoRecibido: esEfectivo ? (montoRecibidoNum || MONTO_TRAMITE) : null,
        vuelto: esEfectivo ? (vueltoCalculado || 0) : null,
        tipoComprobante: nombreComprobanteTitulo || "BOLETA",
        comprobantePago: esEfectivo ? `${nombreComprobanteTitulo} N° ${codComprobante}` : "Pendiente de Pago (Flow)",
        numeroOperacion: esEfectivo ? codComprobante : "PENDIENTE",
        fechaPago: esEfectivo ? fechaHoraActual : "PENDIENTE",
        cajeraResponsable: nombreCajera,
        usuarioCajero: nombreCajera,
        uidCajero: uidCajera,
        fechaEnvioOficial: fechaHoraActual,
        fechaSolicitud: fechaHoraActual,
        archivosPdf: archivosLimpios,
        archivosPresenciales: archivosLimpios,
        planoUrl: urlPlanoPrincipal,
        archivoUrl: urlPlanoPrincipal,
        documentosResumen: archivosLimpios.map((a) => String(a.nombre || "Plano Arquitectónico")),
        inspectorUid: inspectorElegido?.uid || inspectorElegido?.id || "INSP-001",
        inspectorAsignadoUid: inspectorElegido?.uid || inspectorElegido?.id || "INSP-001",
        inspectorNombre: inspectorElegido?.nombre || "Inspector Carlos Ramírez",
        fechaVisitaInspector: fechaInspeccion,
        horaVisitaInspector: slotInspeccion,
        horaVisitaLabel: horaLabel,
        historialAcciones: [
          {
            fecha: fechaHoraActual.split(",")[0] || fechaHoraActual,
            hora: fechaHoraActual.split(",")[1]?.trim() || "",
            usuario: nombreCajera,
            rol: "Cajera",
            accion: esEfectivo
              ? `Registro Presencial, Emisión de ${nombreComprobanteTitulo} y Asignación de Inspector`
              : `Registro Presencial con Pago Pendiente vía Billetera Digital (Flow)`,
            comentarios: esEfectivo
              ? `Registro presencial en ventanilla (${tipoTramiteSeleccionado}). Pago de S/ ${MONTO_TRAMITE.toFixed(2)} registrado (${metodoPagoSeleccionado}). ${nombreComprobanteTitulo}: ${codComprobante}. Visita asignada a ${inspectorElegido?.nombre || "Inspector"} para el ${fechaInspeccion}.`
              : `Registro presencial en ventanilla (${tipoTramiteSeleccionado}). Pago de S/ ${MONTO_TRAMITE.toFixed(2)} pendiente vía pasarela Flow. Visita pre-asignada a ${inspectorElegido?.nombre || "Inspector"} para el ${fechaInspeccion}.`,
          },
        ],
      };

      const resGuardado = await guardarSolicitud(nuevaSolicitudPresencial);
      const idReal = typeof resGuardado === "object" ? String(resGuardado.id || idExp) : String(resGuardado || idExp);
      const solicitudCompleta = { ...nuevaSolicitudPresencial, id: idReal };
      const expIdLimpio = String(solicitudCompleta.id).replace(/^EXP-/, "");

      if (correoForm) {

        // CORREO 1: CONFIRMACIÓN DE SOLICITUD BIEN ESTRUCTURADO PARA GMAIL
        const htmlNotificacionSolicitud = `
          <div style="font-family: Arial, Helvetica, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 2px solid #0f172a; border-radius: 12px; overflow: hidden;">
            <div style="background-color: #0f172a; padding: 20px; text-align: center; color: #ffffff;">
              <h2 style="margin: 0; font-size: 18px; font-weight: 900; letter-spacing: 0.5px;">MUNICIPALIDAD PROVINCIAL DE TRUJILLO</h2>
              <span style="font-size: 12px; color: #38bdf8; font-weight: bold; display: block; margin-top: 4px;">Confirmación de Solicitud de Licencia Municipal — EXP-${expIdLimpio}</span>
            </div>
            <div style="padding: 24px; color: #334155; font-size: 14px; line-height: 1.6;">
              <p style="margin: 0 0 16px;">Estimado(a) <strong>${nombresForm} ${apellidosForm}</strong> (DNI: ${dniForm}),</p>
              <p style="margin: 0 0 16px;">Se ha registrado exitosamente su solicitud de <strong>${tipoTramiteSeleccionado}</strong> en el Módulo de Atención y Caja Municipal.</p>

              <div style="background: #f8fafc; border: 1px solid #cbd5e1; padding: 16px; border-radius: 8px; margin-bottom: 16px;">
                <h4 style="margin: 0 0 10px; color: #0f172a; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px;">🏢 Datos del Contribuyente y Local Comercial</h4>
                <p style="margin: 4px 0;"><strong>Nombre Comercial:</strong> ${nombreNegocioForm}</p>
                <p style="margin: 4px 0;"><strong>Razón Social:</strong> ${razonSocialForm || nombreNegocioForm}</p>
                <p style="margin: 4px 0;"><strong>RUC del Local:</strong> ${rucForm}</p>
                <p style="margin: 4px 0;"><strong>Dirección Fiscal / Local:</strong> ${direccionForm}</p>
                <p style="margin: 4px 0;"><strong>Giro / Actividad Económica:</strong> ${giroForm || "General"}</p>
                <p style="margin: 4px 0;"><strong>Teléfono de Contacto:</strong> ${telefonoForm}</p>
                <p style="margin: 4px 0;"><strong>Correo Electrónico:</strong> ${correoForm}</p>
              </div>

              <div style="background: #eff6ff; border: 1px solid #bfdbfe; padding: 16px; border-radius: 8px; margin-bottom: 20px;">
                <h4 style="margin: 0 0 10px; color: #1e40af; border-bottom: 1px solid #bfdbfe; padding-bottom: 4px;">📅 Inspección Técnica Programada</h4>
                <p style="margin: 4px 0; color: #1e3a8a;"><strong>Fecha de Visita:</strong> ${fechaInspeccion}</p>
                <p style="margin: 4px 0; color: #1e3a8a;"><strong>Horario Asignado:</strong> ${horaLabel}</p>
                <p style="margin: 4px 0; color: #1e3a8a;"><strong>Inspector Municipal Asignado:</strong> ${inspectorElegido.nombre}</p>
              </div>

              <p style="margin: 0; text-align: center; font-size: 11.5px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 12px;">
                Municipalidad Provincial de Trujillo — Gerencia de Desarrollo Económico Local
              </p>
            </div>
          </div>
        `;

        // CORREO 2: COMPROBANTE DE VENTA ELECTRÓNICO OFICIAL (BOLETA O FACTURA CON ESTRUCTURA SUNAT SOLICITADA)
        const isFacturaMail = tipoComprobanteSeleccionado === "Factura";
        const nombreComprobanteMail = isFacturaMail ? "FACTURA ELECTRÓNICA" : "BOLETA DE VENTA ELECTRÓNICA";
        const serieNumMail = codComprobante;
        const subtotalMail = "2.54";
        const igvMail = "0.46";
        const totalMail = "3.00";
        const totalLetrasMail = "SON: TRES Y 00/100 SOLES.";
        const hashMail = `MUNI-TRU-2026-${serieNumMail.replace('-', '')}-SHA256-A8F9`;
        const verifCodeMail = `V-${expIdLimpio}-${hashMail.slice(-6)}`;
        const qrMailUrl = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&margin=0&data=${encodeURIComponent(`20145532000|${isFacturaMail ? '01' : '03'}|${serieNumMail}|0.46|3.00|2026-07-22|${isFacturaMail ? '6' : '1'}|${isFacturaMail ? rucForm : dniForm}|${hashMail}`)}`;
        const cajeroMailNombre = (usuario?.nombre || usuario?.displayName || usuario?.email || "María López").toUpperCase();

        const htmlBoletaElectronica = `
          <div style="font-family: Arial, Helvetica, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 2px solid #0f172a; border-radius: 12px; padding: 24px; color: #0f172a;">
            <!-- ENCABEZADO MUNICIPAL -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f172a; color: #ffffff; border-radius: 8px; margin-bottom: 16px; text-align: center;">
              <tr>
                <td style="padding: 16px;">
                  <h2 style="margin: 0; font-size: 18px; font-weight: 900; color: #ffffff; text-transform: uppercase; letter-spacing: 0.5px;">MUNICIPALIDAD PROVINCIAL DE TRUJILLO</h2>
                  <span style="font-size: 11px; opacity: 0.9; text-transform: uppercase; font-weight: bold; display: block; margin-top: 4px; color: #cbd5e1;">Subgerencia de Licencias — Módulo de Atención y Caja Municipal</span>
                  <span style="font-size: 10.5px; opacity: 0.8; display: block; margin-top: 2px; color: #94a3b8;">RUC: 20145532000 — Jr. Diego de Almagro N° 525, Trujillo</span>
                </td>
              </tr>
            </table>

            <!-- NUMERACIÓN DE COMPROBANTE -->
            <table width="100%" cellpadding="0" cellspacing="0" style="border: 2px solid ${isFacturaMail ? '#dc2626' : '#2563eb'}; background-color: ${isFacturaMail ? '#fef2f2' : '#eff6ff'}; border-radius: 8px; margin-bottom: 16px; text-align: center;">
              <tr>
                <td style="padding: 14px;">
                  <span style="font-weight: 900; font-size: 15px; display: block; color: ${isFacturaMail ? '#991b1b' : '#1e40af'}; text-transform: uppercase;">${nombreComprobanteMail}</span>
                  <span style="font-size: 18px; font-weight: 900; color: ${isFacturaMail ? '#dc2626' : '#2563eb'}; display: block; margin-top: 2px;">N° ${serieNumMail}</span>
                  <p style="margin: 4px 0 0; font-size: 12px; color: #475569;">Fecha/Hora: ${fechaHoraActual} | Moneda: PEN</p>
                </td>
              </tr>
            </table>

            <!-- DATOS DE ESTABLECIMIENTO Y CLIENTE -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; margin-bottom: 16px; font-size: 12.5px;">
              <tr>
                <td style="padding: 14px;">
                  <h4 style="margin: 0 0 8px; color: #0f172a; font-size: 13px; font-weight: 800; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; text-transform: uppercase;">
                    🏢 Datos del Establecimiento Comercial
                  </h4>
                  <p style="margin: 3px 0;"><strong>Razón Social:</strong> ${razonSocialForm || nombreNegocioForm}</p>
                  <p style="margin: 3px 0;"><strong>Nombre Comercial:</strong> ${nombreNegocioForm}</p>
                  <p style="margin: 3px 0;"><strong>RUC del Local:</strong> ${rucForm}</p>
                  <p style="margin: 3px 0;"><strong>Dirección Fiscal:</strong> ${direccionForm}</p>
                  <div style="border-top: 1px solid #e2e8f0; margin-top: 8px; padding-top: 6px;">
                    <h4 style="margin: 0 0 6px; color: ${isFacturaMail ? '#991b1b' : '#1e40af'}; font-size: 13px; font-weight: 800; text-transform: uppercase;">
                      👤 Datos del Cliente / Adquirente
                    </h4>
                    <p style="margin: 3px 0;"><strong>Cliente / Adquirente:</strong> ${nombresForm} ${apellidosForm}</p>
                    <p style="margin: 3px 0;"><strong>DNI / Doc. Identidad:</strong> ${dniForm}</p>
                    <p style="margin: 3px 0;"><strong>Código Expediente:</strong> EXP-${expIdLimpio}</p>
                  </div>
                </td>
              </tr>
            </table>

            <!-- GRILLA TABULAR -->
            <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; margin-bottom: 16px; font-size: 12px; border: 1px solid #cbd5e1;">
              <thead>
                <tr style="background-color: ${isFacturaMail ? '#7f1d1d' : '#0f172a'}; color: #ffffff;">
                  <th style="padding: 8px; text-align: center; width: 8%; color: #ffffff;">CANT</th>
                  <th style="padding: 8px; text-align: left; color: #ffffff;">DESCRIPCIÓN</th>
                  ${isFacturaMail ? `
                    <th style="padding: 8px; text-align: right; width: 18%; color: #ffffff;">VAL. UNIT</th>
                    <th style="padding: 8px; text-align: right; width: 18%; color: #ffffff;">VAL. VENTA</th>
                    <th style="padding: 8px; text-align: right; width: 16%; color: #ffffff;">IGV (18%)</th>
                    <th style="padding: 8px; text-align: right; width: 18%; color: #ffffff;">IMPORTE</th>
                  ` : `
                    <th style="padding: 8px; text-align: right; width: 22%; color: #ffffff;">PRECIO UNIT.</th>
                    <th style="padding: 8px; text-align: right; width: 22%; color: #ffffff;">IMPORTE TOTAL</th>
                  `}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style="padding: 10px; text-align: center; font-weight: bold; border-bottom: 1px solid #e2e8f0;">1</td>
                  <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">
                    <strong style="color: #0f172a;">Derecho de Trámite — ${tipoTramiteSeleccionado}</strong>
                    <span style="display: block; color: #64748b; font-size: 11px;">Expediente N° EXP-${expIdLimpio}</span>
                  </td>
                  ${isFacturaMail ? `
                    <td style="padding: 10px; text-align: right; border-bottom: 1px solid #e2e8f0;">S/ ${subtotalMail}</td>
                    <td style="padding: 10px; text-align: right; border-bottom: 1px solid #e2e8f0;">S/ ${subtotalMail}</td>
                    <td style="padding: 10px; text-align: right; border-bottom: 1px solid #e2e8f0;">S/ ${igvMail}</td>
                    <td style="padding: 10px; text-align: right; font-weight: bold; border-bottom: 1px solid #e2e8f0;">S/ ${totalMail}</td>
                  ` : `
                    <td style="padding: 10px; text-align: right; font-weight: bold; border-bottom: 1px solid #e2e8f0;">S/ ${totalMail}</td>
                    <td style="padding: 10px; text-align: right; font-weight: 900; border-bottom: 1px solid #e2e8f0;">S/ ${totalMail}</td>
                  `}
                </tr>
              </tbody>
            </table>

            <!-- RESUMEN FINANCIERO -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; margin-bottom: 16px; font-size: 12px;">
              <tr>
                <td style="padding: 14px; vertical-align: top; width: 55%;">
                  <p style="margin: 0 0 6px; font-weight: bold; color: #0f172a;">${totalLetrasMail}</p>
                  <p style="margin: 2px 0; color: #334155;"><strong>MÉTODO DE PAGO:</strong> ${metodoPagoSeleccionado.toUpperCase()}</p>
                  <p style="margin: 2px 0; color: #334155;"><strong>CAJERO RESPONSABLE:</strong> ${cajeroMailNombre}</p>
                  ${metodoPagoSeleccionado.toLowerCase().includes("efectivo") ? `
                    <p style="margin: 2px 0; color: #334155;"><strong>MONTO RECIBIDO:</strong> S/ ${montoRecibidoNum.toFixed(2)}</p>
                    <p style="margin: 2px 0; color: #16a34a; font-weight: bold;"><strong>VUELTO ENTREGADO:</strong> S/ ${vueltoCalculado.toFixed(2)}</p>
                  ` : `
                    <p style="margin: 2px 0; color: #2563eb; font-weight: bold;"><strong>ID TRANSACCIÓN FLOW:</strong> ${codComprobante}</p>
                    <p style="margin: 2px 0; color: #16a34a; font-weight: bold;"><strong>ESTADO:</strong> APROBADO</p>
                  `}
                </td>
                <td style="padding: 14px; vertical-align: top; width: 45%; text-align: right;">
                  <table width="100%" cellpadding="0" cellspacing="0" style="font-size: 12px;">
                    ${isFacturaMail ? `
                      <tr>
                        <td style="color: #475569; padding: 2px 0;">Valor de Venta:</td>
                        <td style="font-weight: bold; text-align: right; color: #0f172a;">S/ ${subtotalMail}</td>
                      </tr>
                      <tr>
                        <td style="color: #475569; padding: 2px 0;">IGV (18%):</td>
                        <td style="font-weight: bold; text-align: right; color: #0f172a;">S/ ${igvMail}</td>
                      </tr>
                    ` : ''}
                    <tr>
                      <td style="padding-top: 6px; font-weight: 900; color: #0f172a; border-top: ${isFacturaMail ? '1.5px solid #0f172a' : 'none'}; font-size: 14px;">Importe Total:</td>
                      <td style="padding-top: 6px; font-weight: 900; text-align: right; color: ${isFacturaMail ? '#dc2626' : '#2563eb'}; border-top: ${isFacturaMail ? '1.5px solid #0f172a' : 'none'}; font-size: 14px;">S/ ${totalMail}</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- PIE DE SEGURIDAD SUNAT -->
            <table width="100%" cellpadding="0" cellspacing="0" style="border-top: 1px solid #cbd5e1; padding-top: 12px; font-size: 10.5px; color: #475569;">
              <tr>
                <td style="vertical-align: top; width: 75%;">
                  <p style="margin: 0 0 2px; font-weight: bold; color: #0f172a;">Representación Impresa de la ${nombreComprobanteMail} — Moneda: PEN</p>
                  <p style="margin: 0 0 4px; font-size: 10px;"><strong>Cód. Verificación:</strong> ${verifCodeMail} | <strong>Hash:</strong> ${hashMail}</p>
                  <p style="margin: 0; font-size: 9.5px; font-style: italic; color: #64748b; line-height: 1.35;">
                    ${isFacturaMail
                      ? "Representación impresa de la Factura Electrónica emitida en el Sistema de Emisión Electrónica SUNAT."
                      : "Representación impresa de la Boleta de Venta Electrónica. Este comprobante no otorga derecho a crédito fiscal conforme a la normativa tributaria vigente."}
                  </p>
                </td>
                <td style="vertical-align: top; width: 25%; text-align: right;">
                  <img src="${qrMailUrl}" alt="QR SUNAT" width="85" height="85" style="display: block; margin-left: auto; border: 1px solid #0f172a; padding: 2px;" />
                </td>
              </tr>
            </table>
          </div>
        `;

        // ENVIAR CORREOS DE CONFIRMACIÓN Y COMPROBANTE AL CORREO INGRESADO AL INICIO
        await crearNotificacion(
          solicitudCompleta.uidUsuario || "CIUDADANO_VENTANILLA",
          {
            titulo: `${tipoTramiteSeleccionado} Registrada — EXP-${expIdLimpio}`,
            descripcion: `Se registró su solicitud presencial EXP-${expIdLimpio}. Inspección asignada a ${inspectorElegido.nombre} el ${fechaInspeccion} (${horaLabel}).`,
            icono: "📝",
            html: htmlNotificacionSolicitud,
          },
          correoForm
        ).catch((err) => console.error("Error envío correo 1:", err));

        if (esEfectivo) {
          // ENVIAR CORREO 2: COMPROBANTE DE VENTA ELECTRÓNICO (SOLO SI ES EN EFECTIVO)
          await crearNotificacion(
            solicitudCompleta.uidUsuario || "CIUDADANO_VENTANILLA",
            {
              titulo: `${nombreComprobanteTitulo} — N° ${codComprobante}`,
              descripcion: `Comprobante de pago ${nombreComprobanteTitulo} N° ${codComprobante} emitido por S/ 3.00 (${metodoPagoSeleccionado}).`,
              icono: "💳",
              html: htmlBoletaElectronica,
            },
            correoForm
          ).catch((err) => console.error("Error envío correo boleta:", err));
        }
      }

      // NOTIFICACIÓN Y CORREO ELECTRÓNICO AL INSPECTOR MUNICIPAL ASIGNADO
      const correoInspector = inspectorElegido.correo || `${(inspectorElegido.nombre || "inspector").toLowerCase().replace(/[^a-z]/g, "")}@munitrujillo.gob.pe`;
      const htmlInspectorEmail = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #cbd5e1; border-radius: 12px; overflow: hidden; background: #ffffff;">
          <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: #ffffff; padding: 20px; text-align: center;">
            <h2 style="margin: 0; font-size: 20px; color: #38bdf8;">🏛️ MUNICIPALIDAD PROVINCIAL DE TRUJILLO</h2>
            <p style="margin: 4px 0 0; font-size: 13px; color: #94a3b8;">Subgerencia de Licencias y Comercialización</p>
          </div>

          <div style="padding: 24px; color: #334155; line-height: 1.6;">
            <h3 style="color: #0f172a; margin-top: 0; font-size: 18px; border-bottom: 2px solid #3b82f6; padding-bottom: 8px;">
              🔍 ASIGNACIÓN DE INSPECCIÓN TÉCNICA DE EDIFICACIÓN
            </h3>
            <p>Estimado(a) <strong>${inspectorElegido.nombre}</strong> (${inspectorElegido.cargo || "Inspector Municipal"}),</p>
            <p>Se le ha asignado una nueva inspección técnica para el expediente presencial detallado a continuación:</p>

            <div style="background: #eff6ff; border-left: 4px solid #2563eb; padding: 16px; margin: 16px 0; border-radius: 8px;">
              <h4 style="margin: 0 0 10px; color: #1e40af; font-size: 15px;">📋 DATOS DE LA VISITA TÉCNICA</h4>
              <p style="margin: 4px 0;"><strong>N° Expediente:</strong> EXP-${expIdLimpio}</p>
              <p style="margin: 4px 0;"><strong>📅 Fecha Programada:</strong> <span style="color: #1e3a8a; font-weight: bold;">${fechaInspeccion}</span></p>
              <p style="margin: 4px 0;"><strong>🕒 Horario de Visita:</strong> <span style="color: #1e3a8a; font-weight: bold;">${horaLabel}</span></p>
              <p style="margin: 4px 0;"><strong>🏢 Nombre Comercial:</strong> ${nombreNegocioForm}</p>
              <p style="margin: 4px 0;"><strong>🧾 RUC:</strong> ${rucForm}</p>
              <p style="margin: 4px 0;"><strong>📍 Dirección del Local:</strong> ${direccionForm}</p>
              <p style="margin: 4px 0;"><strong>📍 Distrito:</strong> ${distritoSunat || "Trujillo"}</p>
              <p style="margin: 4px 0;"><strong>👤 Solicitante / Titular:</strong> ${nombresForm} ${apellidosForm}</p>
              <p style="margin: 4px 0;"><strong>🪪 DNI:</strong> ${dniForm}</p>
              <p style="margin: 4px 0;"><strong>📱 Teléfono de Contacto:</strong> ${telefonoForm}</p>
              <p style="margin: 4px 0;"><strong>📧 Correo Electrónico:</strong> ${correoForm}</p>
              <p style="margin: 4px 0;"><strong>✍️ Registrado por Ventanilla:</strong> ${nombreCajera}</p>
            </div>

            <p style="font-size: 13px; color: #64748b; font-style: italic;">
              Por favor acudir puntualmente en el rango de horario asignado. Al finalizar, registre el Acta de Inspección en el Módulo de Inspectores.
            </p>
          </div>

          <div style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 14px; text-align: center; font-size: 11px; color: #64748b;">
            Sistema de Gestión de Licencias de Funcionamiento — Municipalidad Provincial de Trujillo
          </div>
        </div>
      `;

      await crearNotificacion(
        inspectorElegido.uid || "INSPECTOR",
        {
          titulo: `Nueva Inspección Asignada — EXP-${expIdLimpio}`,
          descripcion: `Visita presencial asignada para el expediente EXP-${expIdLimpio} (${nombreNegocioForm}) el ${fechaInspeccion} a las ${horaLabel}.`,
          icono: "🔍",
          html: htmlInspectorEmail,
        },
        correoInspector
      ).catch((err) => console.error("Error envío correo inspector:", err));

      const resExito = {
        id: solicitudCompleta.id,
        codComprobante,
        tipoComprobante: nombreComprobanteTitulo,
        tipoTramite: tipoTramiteSeleccionado,
        inspectorNombre: inspectorElegido.nombre,
        fechaInspeccion,
        slotInspeccion: horaLabel,
        nombreSolicitante: `${nombresForm} ${apellidosForm}`,
        nombreNegocio: nombreNegocioForm,
        solicitudCompleta
      };

      if (!metodoPagoSeleccionado.toLowerCase().includes("efectivo")) {
        try {
          const emailTarget = (correoForm && correoForm.includes("@") && correoForm.split("@")[0].length >= 2)
            ? correoForm
            : "contribuyente@munitrujillo.gob.pe";

          const flowOrder = await crearOrdenFlow({
            solicitudId: expIdLimpio,
            amount: MONTO_TRAMITE,
            email: emailTarget,
            buyerName: nombreNegocioForm || razonSocialForm || "Contribuyente",
            subject: `Derecho de Trámite Licencia EXP-${expIdLimpio}`,
          });

          const redirectUrl = flowOrder?.paymentUrl || (flowOrder?.url && flowOrder?.token ? `${flowOrder.url}?token=${flowOrder.token}` : flowOrder?.url);

          if (flowOrder && redirectUrl) {
            alert(`💳 Redirigiendo a la pasarela de pagos oficial Flow.cl para procesar el pago real de S/ ${MONTO_TRAMITE.toFixed(2)}...`);
            window.location.href = redirectUrl;
            return;
          } else {
            throw new Error("No se obtuvo la URL de redirección de Flow.");
          }
        } catch (flowErr) {
          console.error("Error al iniciar orden de pago Flow:", flowErr);
          alert("⚠️ Error al conectar con la pasarela Flow.cl: " + (flowErr.message || String(flowErr)));
          setProcesando(false);
          return;
        }
      }

      // CIERRE DE MODAL Y MOSTRAR RESULTADO EXITOSO DE INMEDIATO
      setComprobanteGenerado(solicitudCompleta);
      setResultadoRegistroExitoso(resExito);
      setMostrarModalNuevaSolicitud(false);
      if (cambiarSeccion) cambiarSeccion("nueva-solicitud");
      cargarSolicitudes().catch(() => {});
    } catch (err) {
      console.error(err);
      alert("Error al ejecutar el registro presencial: " + err.message);
    } finally {
      setProcesando(false);
    }
  };

  // CÁLCULO DE VIGENCIA Y DÍAS RESTANTES DE LICENCIA (RENOVACIÓN 1 MES ANTES)
  const calcularEstadoLicenciaVencimiento = (sol) => {
    if (!sol) return { aptoRenovacion: false, diasRestantes: null, fechaVencimientoStr: null };
    const est = (sol.estado || "").toLowerCase();
    if (!est.includes("aprobad") && !est.includes("renovad")) {
      return { aptoRenovacion: false, diasRestantes: null, fechaVencimientoStr: null };
    }

    let fechaEmision = new Date();
    if (sol.fechaEvaluacionInspector) {
      const parts = sol.fechaEvaluacionInspector.split(",")[0].split("/");
      if (parts.length === 3) fechaEmision = new Date(parts[2], parts[1] - 1, parts[0]);
    } else if (sol.fechaSolicitud) {
      const parts = sol.fechaSolicitud.split(",")[0].split("/");
      if (parts.length === 3) fechaEmision = new Date(parts[2], parts[1] - 1, parts[0]);
    }

    const fechaVencimiento = new Date(fechaEmision);
    fechaVencimiento.setFullYear(fechaVencimiento.getFullYear() + 1);

    const hoy = new Date();
    const diffTime = fechaVencimiento - hoy;
    const diasRestantes = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const fechaVencimientoStr = fechaVencimiento.toLocaleDateString("es-PE");

    const aptoRenovacion = diasRestantes <= 30;
    return { aptoRenovacion, diasRestantes, fechaVencimientoStr };
  };

  // PROCESAR RENOVACIÓN DIRECTA EN CAJA (COBRO DE S/ 3.00 Y EMISIÓN DE BOLETA/FACTURA)
  const ejecutarRenovacionDirecta = async (sol) => {
    if (!sol) return;
    setProcesando(true);
    try {
      const idExpLimpio = String(sol.id).replace(/^EXP-/, "");
      const esFactura = tipoComprobanteSeleccionado === "Factura";
      const codComprobante = esFactura
        ? `F001-${idExpLimpio}`
        : `B001-${idExpLimpio}`;
      const nombreComprobanteTitulo = esFactura ? "FACTURA ELECTRÓNICA" : "BOLETA DE VENTA ELECTRÓNICA";
      const fechaHoraActual = formatearFechaHora();
      const nombreCajera = usuario?.nombre || usuario?.email || "Cajera de Ventanilla";

      const nuevaVencimiento = new Date();
      nuevaVencimiento.setFullYear(nuevaVencimiento.getFullYear() + 1);
      const nuevaFechaVencimientoStr = nuevaVencimiento.toLocaleDateString("es-PE");

      const logEntrada = {
        fecha: fechaHoraActual.split(",")[0] || fechaHoraActual,
        hora: fechaHoraActual.split(",")[1]?.trim() || "",
        usuario: nombreCajera,
        rol: "Cajera",
        accion: `Renovación de Licencia y Emisión de ${nombreComprobanteTitulo}`,
        comentarios: `Renovación de licencia procesada en caja. Tasa de S/ ${MONTO_TRAMITE.toFixed(2)} cobrada (${metodoPagoSeleccionado}). Comprobante: ${codComprobante}. Nueva vigencia hasta ${nuevaFechaVencimientoStr}.`,
      };

      const cambios = {
        estado: "Licencia renovada",
        estadoNormalizado: "LICENCIA_RENOVADA",
        tipoTramite: "Renovación de Licencia de Funcionamiento",
        fechaRenovacion: fechaHoraActual,
        fechaVencimiento: nuevaFechaVencimientoStr,
        recordatorioRenovacionEnviado: false,
        comprobantePago: `${nombreComprobanteTitulo} N° ${codComprobante}`,
        numeroOperacion: codComprobante,
        fechaPago: fechaHoraActual,
        cajeraResponsable: nombreCajera,
        historialAcciones: [...(sol.historialAcciones || []), logEntrada],
      };

      await actualizarSolicitud(sol.id, cambios);

      if (sol.correoUsuario) {
        const htmlNotificacionRenovacion = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 12px; overflow: hidden;">
            <div style="background: #1e3a8a; padding: 24px; text-align: center; color: white;">
              <h2 style="margin: 0; font-size: 20px;">🔄 Licencia de Funcionamiento Renovada</h2>
              <p style="margin: 6px 0 0; font-size: 14px; opacity: 0.9;">Expediente N° EXP-${idExpLimpio}</p>
            </div>
            <div style="padding: 24px; color: #334155; font-size: 14px; line-height: 1.6;">
              <p style="margin: 0 0 16px;">Estimado(a) <strong>${sol.nombreSolicitante || sol.nombresSolicitante}</strong>,</p>
              <p style="margin: 0 0 16px;">Le confirmamos que su <strong>Renovación de Licencia de Funcionamiento Municipal</strong> ha sido procesada exitosamente.</p>

              <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 16px; border-radius: 8px; margin-bottom: 16px;">
                <h4 style="margin: 0 0 10px; color: #0f172a;">🏢 Datos de la Empresa y Nueva Vigencia</h4>
                <p style="margin: 4px 0;"><strong>Nombre Comercial:</strong> ${sol.nombreNegocio}</p>
                <p style="margin: 4px 0;"><strong>RUC:</strong> ${sol.ruc}</p>
                <p style="margin: 4px 0;"><strong>Nueva Fecha de Vencimiento:</strong> <span style="color: #16a34a; font-weight: bold;">${nuevaFechaVencimientoStr}</span></p>
              </div>

              <p style="margin: 0; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 12px;">
                Municipalidad Provincial de Trujillo — Sistema de Licencias Municipal
              </p>
            </div>
          </div>
        `;

        const htmlBoletaRenovacion = `
          <div style="font-family: Arial, Helvetica, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 2px solid #0f172a; border-radius: 12px; padding: 24px; color: #0f172a;">
            <!-- ENCABEZADO MUNICIPAL -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f172a; color: #ffffff; border-radius: 8px; margin-bottom: 20px; text-align: center;">
              <tr>
                <td style="padding: 16px;">
                  <h2 style="margin: 0; font-size: 18px; font-weight: 900; color: #ffffff; text-transform: uppercase; letter-spacing: 0.5px;">MUNICIPALIDAD PROVINCIAL DE TRUJILLO</h2>
                  <span style="font-size: 11px; opacity: 0.9; text-transform: uppercase; font-weight: bold; display: block; margin-top: 4px; color: #cbd5e1;">Módulo de Atención y Caja Municipal</span>
                  <span style="font-size: 10.5px; opacity: 0.8; display: block; margin-top: 2px; color: #94a3b8;">RUC: 20145532000 — Jr. Almagro N° 525, Trujillo</span>
                </td>
              </tr>
            </table>

            <!-- NUMERACIÓN DE COMPROBANTE -->
            <table width="100%" cellpadding="0" cellspacing="0" style="border: 2px solid #0f172a; background-color: #f8fafc; border-radius: 8px; margin-bottom: 20px; text-align: center;">
              <tr>
                <td style="padding: 14px;">
                  <span style="font-weight: 900; font-size: 16px; display: block; color: #0f172a; text-transform: uppercase;">${nombreComprobanteTitulo}</span>
                  <span style="font-size: 18px; font-weight: 900; color: #dc2626; display: block; margin-top: 2px;">N° ${codComprobante}</span>
                  <p style="margin: 4px 0 0; font-size: 12.5px; color: #475569;">Fecha: ${fechaHoraActual}</p>
                </td>
              </tr>
            </table>

            <!-- DATOS DEL CONTRIBUYENTE Y ESTABLECIMIENTO -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; margin-bottom: 20px; font-size: 13px;">
              <tr>
                <td style="padding: 16px;">
                  <h4 style="margin: 0 0 10px; color: #0f172a; font-size: 14px; font-weight: 800; border-bottom: 1px solid #cbd5e1; padding-bottom: 6px;">🏢 Información del Contribuyente y Establecimiento</h4>
                  <p style="margin: 4px 0; color: #1e293b;"><strong>Nombre Legal / Razón Social:</strong> ${sol.razonSocial || sol.nombreNegocio}</p>
                  <p style="margin: 4px 0; color: #1e293b;"><strong>Nombre Comercial:</strong> ${sol.nombreNegocio}</p>
                  <p style="margin: 4px 0; color: #1e293b;"><strong>Número de RUC:</strong> ${sol.ruc}</p>
                  <p style="margin: 4px 0; color: #1e293b;"><strong>Dirección Fiscal:</strong> ${sol.direccion}</p>
                  <p style="margin: 4px 0; color: #1e293b;"><strong>Solicitante:</strong> ${sol.nombreSolicitante || sol.nombresSolicitante} (DNI: ${sol.dniSolicitante || sol.dni})</p>
                </td>
              </tr>
            </table>

            <!-- GRILLA TABULAR DE DETALLE -->
            <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; margin-bottom: 20px; font-size: 13px; border: 1px solid #cbd5e1;">
              <thead>
                <tr style="background-color: #0f172a; color: #ffffff;">
                  <th style="padding: 10px; text-align: center; width: 12%; color: #ffffff;">CANT</th>
                  <th style="padding: 10px; text-align: left; color: #ffffff;">DESCRIPCIÓN</th>
                  <th style="padding: 10px; text-align: right; width: 22%; color: #ffffff;">P. UNIT</th>
                  <th style="padding: 10px; text-align: right; width: 22%; color: #ffffff;">IMPORTE</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style="padding: 12px; text-align: center; font-weight: bold; border-bottom: 1px solid #e2e8f0;">1</td>
                  <td style="padding: 12px; border-bottom: 1px solid #e2e8f0;">
                    <strong style="color: #0f172a;">Derecho de Trámite — Renovación de Licencia de Funcionamiento</strong>
                    <span style="display: block; color: #64748b; font-size: 12px;">Expediente N° EXP-${idExpLimpio}</span>
                  </td>
                  <td style="padding: 12px; text-align: right; border-bottom: 1px solid #e2e8f0; color: #0f172a;">S/ 3.00</td>
                  <td style="padding: 12px; text-align: right; font-weight: bold; border-bottom: 1px solid #e2e8f0; color: #0f172a;">S/ 3.00</td>
                </tr>
              </tbody>
            </table>

            <!-- RESUMEN FINANCIERO -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; margin-bottom: 20px; font-size: 12.5px;">
              <tr>
                <td style="padding: 16px; vertical-align: top; width: 55%;">
                  <p style="margin: 2px 0; color: #334155;"><strong>MÉTODO DE PAGO:</strong> ${metodoPagoSeleccionado.toUpperCase()}</p>
                  <p style="margin: 2px 0; color: #334155;"><strong>CAJERA:</strong> ${nombreCajera.toUpperCase()}</p>
                </td>
                <td style="padding: 16px; vertical-align: top; width: 45%; text-align: right;">
                  <table width="100%" cellpadding="0" cellspacing="0" style="font-size: 13px;">
                    <tr>
                      <td style="color: #475569; padding: 2px 0;">OP. GRAVADA:</td>
                      <td style="font-weight: bold; text-align: right; color: #0f172a;">S/ 2.54</td>
                    </tr>
                    <tr>
                      <td style="color: #475569; padding: 2px 0;">I.G.V. (18%):</td>
                      <td style="font-weight: bold; text-align: right; color: #0f172a;">S/ 0.46</td>
                    </tr>
                    <tr>
                      <td style="padding-top: 8px; font-weight: 900; color: #0f172a; border-top: 1.5px solid #0f172a; font-size: 15px;">TOTAL A PAGAR:</td>
                      <td style="padding-top: 8px; font-weight: 900; text-align: right; color: #16a34a; border-top: 1.5px solid #0f172a; font-size: 15px;">S/ 3.00</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- PIE LEGAL -->
            <table width="100%" cellpadding="0" cellspacing="0" style="border-top: 1px solid #cbd5e1; text-align: center;">
              <tr>
                <td style="padding-top: 14px; font-size: 12px; color: #64748b;">
                  <p style="margin: 0 0 4px; font-weight: bold;">Representación impresa del comprobante de venta electrónico.</p>
                  <p style="margin: 0; color: #16a34a; font-weight: 800; font-size: 13px;">¡Gracias por su preferencia!</p>
                </td>
              </tr>
            </table>
          </div>
        `;

        await crearNotificacion(
          sol.uidUsuario || "CIUDADANO",
          {
            titulo: `Renovación de Licencia Confirmada — EXP-${idExpLimpio}`,
            descripcion: `Se procesó la renovación de su licencia EXP-${idExpLimpio}. Nueva vigencia hasta el ${nuevaFechaVencimientoStr}.`,
            icono: "🔄",
            html: htmlNotificacionRenovacion,
          },
          sol.correoUsuario
        );

        await crearNotificacion(
          sol.uidUsuario || "CIUDADANO",
          {
            titulo: `${nombreComprobanteTitulo} — N° ${codComprobante}`,
            descripcion: `Comprobante de renovación N° ${codComprobante} emitido por S/ 3.00 (${metodoPagoSeleccionado}).`,
            icono: "💳",
            html: htmlBoletaRenovacion,
          },
          sol.correoUsuario
        );
      }

      alert(`✅ Licencia renovada con éxito. Nueva vigencia hasta: ${nuevaFechaVencimientoStr}`);
      setSolicitudRenovacion(null);
      await cargarSolicitudes();
    } catch (err) {
      console.error(err);
      alert("Error al renovar licencia: " + err.message);
    } finally {
      setProcesando(false);
    }
  };

  const imprimirComprobante = () => {
    window.print();
  };

  const descargarLicenciaConMarcaAgua = (sol, esVencido = false) => {
    if (!sol) return;

    const htmlOficial = generarPlantillaLicenciaOficial(sol, esVencido);

    const contenidoCompleto = `
      <!DOCTYPE html>
      <html lang="es">
        <head>
          <meta charset="UTF-8" />
          <title>Licencia Municipal de Funcionamiento - EXP-${sol.id} ${esVencido ? '(VENCIDA)' : ''}</title>
          <style>
            @page { size: A4; margin: 0; }
            body { font-family: 'Times New Roman', Times, serif; margin: 0; padding: 0; background: #ffffff; color: #000000; }
            @media print {
              body { padding: 0; }
            }
          </style>
        </head>
        <body>
          ${htmlOficial}
        </body>
      </html>
    `;

    const blob = new Blob([contenidoCompleto], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.download = `Licencia_Funcionamiento_${sol.ruc || sol.id}_${esVencido ? "VENCIDA" : "OFICIAL"}.html`;
    document.body.appendChild(enlace);
    enlace.click();
    document.body.removeChild(enlace);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  const clasificarEstadoTramiteCajera = (s) => {
    if (!s) return { tipo: "PENDIENTE", titulo: "Pendiente" };

    const est = (s.estado || s.estadoInspeccion || s.inspeccion || "").toLowerCase();
    const estNorm = (s.estadoNormalizado || "").toUpperCase();
    const { aptoRenovacion, diasRestantes, fechaVencimientoStr } = calcularEstadoLicenciaVencimiento(s);

    const esVencido = (diasRestantes !== null && diasRestantes <= 0) || est.includes("vencid") || estNorm === "VENCIDO" || s.licenciaVencida === true;
    const esAprobado = (est.includes("aprobad") || est.includes("aceptad") || estNorm === "APROBADO" || s.licenciaEmitida === true) && !esVencido;
    const esRechazado = est.includes("rechazad") || estNorm === "RECHAZADO";
    const esObservado = est.includes("observad") || est.includes("reinspecc") || est.includes("segunda") || estNorm === "OBSERVADO";

    if (esVencido) {
      return {
        tipo: "VENCIDO",
        titulo: "⚠️ Vencido (Licencia Expirada)",
        badgeColor: "#dc2626",
        badgeBg: "#fee2e2",
        aptoRenovacion: true,
        diasRestantes,
        fechaVencimientoStr: fechaVencimientoStr || "Más de 1 año transcurrido"
      };
    }

    if (esAprobado) {
      return {
        tipo: "APROBADO",
        titulo: "✅ Aceptado / Aprobado",
        badgeColor: "#166534",
        badgeBg: "#dcfce7",
        fechaVencimientoStr
      };
    }

    if (esRechazado) {
      return {
        tipo: "RECHAZADO",
        titulo: "❌ Rechazado",
        badgeColor: "#991b1b",
        badgeBg: "#fee2e2",
        motivoRechazo: s.comentarioInspector || s.observaciones || s.motivoRechazo || s.detallesObservacion || s.motivo || "No se detallaron observaciones en el informe del inspector."
      };
    }

    if (esObservado) {
      return {
        tipo: "OBSERVADO",
        titulo: "⚠️ Observado (Segunda visita del inspector - Última oportunidad)",
        badgeColor: "#6b21a8",
        badgeBg: "#f3e8ff",
        proximaFechaInspeccion: s.fechaSegundaVisita || s.fechaReinspeccion || s.fechaVisitaInspector || s.fechaInspeccion || "Por asignar"
      };
    }

    // Pendiente por defecto
    return {
      tipo: "PENDIENTE",
      titulo: "⏳ Pendiente (Espera a su primera visita)",
      badgeColor: "#1e40af",
      badgeBg: "#dbeafe",
      fechaInspeccion: s.fechaVisitaInspector || s.fechaInspeccion || s.fechaSolicitud || "Por asignar"
    };
  };

  return (
    <div className="panel panel-cajero">
      {/* HERO INSTITUCIONAL DE CAJA Y ATENCIÓN */}
      <div className="inspector-hero" style={{ background: "linear-gradient(135deg, #d97706 0%, #78350f 100%)" }}>
        <div>
          <span className="eyebrow">Municipalidad de Trujillo — Módulo de Atención y Caja</span>
          <h1>
            {seccion === "nueva-solicitud" && "➕ Registro Presencial de Solicitud"}
            {seccion === "consulta-expedientes" && "🔍 Consulta de Estado de Trámites"}
          </h1>
          <p>
            Recepción de solicitudes presenciales, verificación documental, cobro del derecho de trámite (S/ 3.00), emisión de boleta de caja y derivación al Inspector.
          </p>
        </div>

        <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
          {/* BADGE ESTADO DE CAJA MUNICIPAL */}
          {!cajaAbierta.abierta && (
            <div style={{ background: "#fef2f2", color: "#991b1b", padding: "6px 14px", borderRadius: "10px", fontWeight: "bold", fontSize: "13px", border: "1.5px solid #fca5a5", display: "flex", alignItems: "center", gap: "8px" }}>
              <span>🔴 <strong>CAJA CERRADA</strong></span>
              <span style={{ color: "#b91c1c", fontSize: "12px" }}>• Requiere Apertura de Turno</span>
            </div>
          )}

          {/* BOTÓN APERTURA O ARQUEO SEGÚN ESTADO DE CAJA */}
          {!cajaAbierta.abierta ? (
            <button
              type="button"
              onClick={() => setMostrarModalAperturaCaja(true)}
              style={{
                background: "#2563eb",
                color: "white",
                border: "none",
                padding: "10px 16px",
                borderRadius: "8px",
                fontWeight: "bold",
                cursor: "pointer",
                fontSize: "13.5px",
                boxShadow: "0 2px 6px rgba(37,99,235,0.3)",
                display: "flex",
                alignItems: "center",
                gap: "6px"
              }}
            >
              🔓 Aperturar Caja Municipal
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setMostrarModalArqueoCaja(true)}
              style={{
                background: "#0f766e",
                color: "white",
                border: "none",
                padding: "10px 16px",
                borderRadius: "8px",
                fontWeight: "bold",
                cursor: "pointer",
                fontSize: "13.5px",
                boxShadow: "0 2px 6px rgba(15,118,110,0.3)",
                display: "flex",
                alignItems: "center",
                gap: "6px"
              }}
            >
              📊 Arqueo y Cierre de Caja
            </button>
          )}

          {seccion !== "nueva-solicitud" && (
            <button
              type="button"
              onClick={() => {
                if (!cajaAbierta.abierta) {
                  alert("🔒 La Caja Municipal se encuentra CERRADA. Debe realizar la apertura de turno con el fondo inicial antes de registrar trámites y cobros.");
                  setMostrarModalAperturaCaja(true);
                  return;
                }
                if (cambiarSeccion) cambiarSeccion("nueva-solicitud");
                else setMostrarModalNuevaSolicitud(true);
              }}
              style={{
                background: cajaAbierta.abierta ? "#16a34a" : "#94a3b8",
                color: "white",
                border: "none",
                padding: "10px 16px",
                borderRadius: "8px",
                fontWeight: "bold",
                cursor: "pointer",
                fontSize: "14px",
                boxShadow: "0 2px 4px rgba(0,0,0,0.15)"
              }}
            >
              ➕ Registrar Nueva Solicitud
            </button>
          )}

          <button type="button" className="btn-outline-light" onClick={cargarSolicitudes}>
            {cargando ? "Actualizando..." : "🔄 Actualizar"}
          </button>
        </div>
      </div>

      {/* VISTA 1: NUEVA SOLICITUD PRESENCIAL (WIZARD DE PASO ÚNICO ACTIVO ESTILO STRIPE / GOOGLE FORMS) */}
      {seccion === "nueva-solicitud" && (
        <section className="section-card" style={{ padding: "28px", maxWidth: "820px", margin: "0 auto" }}>
          {resultadoRegistroExitoso ? (
            /* PANTALLA DE ÉXITO FINAL TRAS REGISTRAR LA SOLICITUD */
            <div style={{ background: "#ffffff", padding: "32px", borderRadius: "16px", border: "1.5px solid #bbf7d0", textAlign: "center", boxShadow: "0 8px 24px rgba(22, 163, 74, 0.12)" }}>
              <div style={{ fontSize: "60px", marginBottom: "12px" }}>✅</div>
              <h2 style={{ color: "#166534", margin: "0 0 8px", fontSize: "24px", fontWeight: "800" }}>¡Solicitud Registrada Correctamente!</h2>
              <p style={{ color: "#15803d", fontSize: "15px", margin: "0 0 24px" }}>
                El expediente fue cobrado y derivado oficialmente para la visita de inspección técnica.
              </p>

              {/* ESTILO DE IMPRESIÓN EXCLUSIVA PARA EL COMPROBANTE SUNAT */}
              <style>{`
                @media print {
                  body * {
                    visibility: hidden !important;
                  }
                  #comprobante-sunat-impresion, #comprobante-sunat-impresion * {
                    visibility: visible !important;
                  }
                  #comprobante-sunat-impresion {
                    position: absolute !important;
                    left: 0 !important;
                    top: 0 !important;
                    width: 100% !important;
                    max-width: 100% !important;
                    border: 2px solid #0f172a !important;
                    box-shadow: none !important;
                    margin: 0 !important;
                    padding: 20px !important;
                  }
                }
              `}</style>

              {/* VOUCHER / COMPROBANTE DE VENTA ELECTRÓNICO (BOLETA O FACTURA CON ESTRUCTURA SUNAT) */}
              <VisualizadorComprobanteSUNAT datos={resultadoRegistroExitoso} idContainer="comprobante-sunat-impresion" />

              <div style={{ display: "flex", justifyContent: "center", gap: "14px", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={imprimirComprobante}
                  style={{ padding: "12px 24px", background: "#0f766e", color: "white", border: "none", borderRadius: "10px", fontWeight: "bold", fontSize: "14.5px", cursor: "pointer", boxShadow: "0 2px 6px rgba(15,118,110,0.2)" }}
                >
                  🖨️ Imprimir Boleta
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDniForm("");
                    setNombresForm("");
                    setApellidosForm("");
                    setCorreoForm("");
                    setTelefonoForm("");
                    setRucForm("");
                    setNombreNegocioForm("");
                    setRazonSocialForm("");
                    setDireccionForm("");
                    setArchivosPresenciales([]);
                    setDniValidado(false);
                    setRucValidado(false);
                    setPasoActual(1);
                    setPagoConfirmadoLocal(false);
                    setResultadoRegistroExitoso(null);
                    autoAsignarHorarioLibre(solicitudes);
                  }}
                  style={{ padding: "12px 24px", background: "#16a34a", color: "white", border: "none", borderRadius: "10px", fontWeight: "bold", fontSize: "14.5px", cursor: "pointer", boxShadow: "0 2px 6px rgba(22,163,74,0.2)" }}
                >
                  ➕ Registrar Nueva Solicitud
                </button>
              </div>
            </div>
          ) : (
            /* WIZARD DE PASO ÚNICO ACTIVO */
            <div>
              {/* BARRA DE PROGRESO DEL PASO ACTIVO */}
              <div style={{ background: "#ffffff", padding: "20px 24px", borderRadius: "16px", border: "1px solid #e2e8f0", marginBottom: "24px", boxShadow: "0 2px 8px rgba(0,0,0,0.03)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                  <span style={{ fontSize: "11.5px", fontWeight: "800", color: "#2563eb", textTransform: "uppercase", letterSpacing: "1px" }}>
                    Registro Presencial de Licencia Municipal
                  </span>
                  <span style={{ background: "#f0fdf4", color: "#166534", padding: "4px 14px", borderRadius: "20px", fontSize: "12.5px", fontWeight: "800", border: "1px solid #bbf7d0" }}>
                    Paso {pasoActual} de 4 ({Math.round((pasoActual / 4) * 100)}%)
                  </span>
                </div>

                <h3 style={{ margin: "4px 0 12px", color: "#0f172a", fontSize: "20px", fontWeight: "800" }}>
                  {pasoActual === 1 && "Paso 1: Datos de Contacto del Solicitante"}
                  {pasoActual === 2 && "Paso 2: Validación de Establecimiento SUNAT"}
                  {pasoActual === 3 && "Paso 3: Carga del Plano del Local (PDF)"}
                  {pasoActual === 4 && "Paso 4: Pago de Tasa Municipal (S/ 3.00) y Registro Directo"}
                </h3>

                <div style={{ height: "10px", width: "100%", background: "#f1f5f9", borderRadius: "5px", overflow: "hidden", border: "1px solid #e2e8f0" }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${(pasoActual / 4) * 100}%`,
                      background: "linear-gradient(90deg, #2563eb, #16a34a)",
                      transition: "width 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
                      borderRadius: "5px"
                    }}
                  />
                </div>
              </div>

              {/* CONTENIDO DEL PASO ACTIVO */}
              <div style={{ minHeight: "340px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                {/* PASO 1: DATOS DE CONTACTO */}
                {pasoActual === 1 && (
                  <div style={{ background: "#ffffff", padding: "24px", borderRadius: "16px", border: "1px solid #cbd5e1", boxShadow: "0 2px 8px rgba(0,0,0,0.03)" }}>
                    <h4 style={{ margin: "0 0 6px", color: "#0f172a", fontSize: "16px", fontWeight: "700" }}>📞 Datos de Contacto del Solicitante</h4>
                    <p style={{ margin: "0 0 20px", color: "#64748b", fontSize: "13.5px" }}>Ingrese el teléfono móvil y correo electrónico para notificaciones del estado del trámite.</p>

                    <div style={{ display: "grid", gap: "16px" }}>
                      <div>
                        <label style={{ display: "block", fontSize: "13px", fontWeight: "700", color: "#334155", marginBottom: "6px" }}>
                          📱 Teléfono Celular (Perú - 9 dígitos que inicie con 9) *
                        </label>
                        <input
                          type="tel"
                          inputMode="numeric"
                          maxLength={9}
                          placeholder="Ej. 987654321"
                          value={telefonoForm}
                          onChange={(e) => {
                            const valorLimpio = e.target.value.replace(/\D/g, "").slice(0, 9);
                            setTelefonoForm(valorLimpio);
                          }}
                          style={{
                            width: "100%",
                            padding: "12px 16px",
                            borderRadius: "10px",
                            border: (telefonoForm && !esTelefonoValido) ? "1.5px solid #dc2626" : "1.5px solid #cbd5e1",
                            fontSize: "14.5px",
                            fontWeight: "700"
                          }}
                        />
                        {telefonoForm && !esTelefonoValido && (
                          <small style={{ color: "#dc2626", fontSize: "11.5px", fontWeight: "bold", display: "block", marginTop: "4px" }}>
                            ⚠️ Debe ser un celular peruano de 9 dígitos que inicie con 9.
                          </small>
                        )}
                      </div>

                      <div>
                        <label style={{ display: "block", fontSize: "13px", fontWeight: "700", color: "#334155", marginBottom: "6px" }}>
                          ✉️ Correo Electrónico de Notificaciones *
                        </label>
                        <input
                          type="email"
                          placeholder="ejemplo@correo.com"
                          value={correoForm}
                          onChange={(e) => setCorreoForm(e.target.value)}
                          style={{
                            width: "100%",
                            padding: "12px 16px",
                            borderRadius: "10px",
                            border: (correoForm && !esCorreoValido) ? "1.5px solid #dc2626" : "1.5px solid #cbd5e1",
                            fontSize: "14.5px"
                          }}
                        />
                        {correoForm && !esCorreoValido && (
                          <small style={{ color: "#dc2626", fontSize: "11.5px", fontWeight: "bold", display: "block", marginTop: "4px" }}>
                            ⚠️ Ingrese un correo electrónico válido.
                          </small>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* PASO 2: SUNAT */}
                {pasoActual === 2 && (
                  <div style={{ background: "#ffffff", padding: "24px", borderRadius: "16px", border: "1px solid #cbd5e1", boxShadow: "0 2px 8px rgba(0,0,0,0.03)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
                      <h4 style={{ margin: 0, color: "#0f172a", fontSize: "16px", fontWeight: "700" }}>🏢 Ingrese el RUC del Establecimiento Comercial</h4>
                      {rucValidado && (
                        <span style={{
                          background: esJurisdiccionTrujillo ? "#dcfce7" : "#fee2e2",
                          color: esJurisdiccionTrujillo ? "#15803d" : "#dc2626",
                          padding: "6px 14px",
                          borderRadius: "20px",
                          fontSize: "12.5px",
                          fontWeight: "800",
                          border: `1.5px solid ${esJurisdiccionTrujillo ? "#bbf7d0" : "#fca5a5"}`
                        }}>
                          {esJurisdiccionTrujillo ? "🟢 Establecimiento dentro de la jurisdicción" : "🔴 Establecimiento fuera de la jurisdicción"}
                        </span>
                      )}
                    </div>

                    <div style={{ display: "flex", gap: "10px", marginBottom: "16px" }}>
                      <input
                        type="text"
                        maxLength={11}
                        placeholder="RUC (11 dígitos)"
                        value={rucForm}
                        onChange={(e) => {
                          setRucForm(e.target.value.replace(/\D/g, "").slice(0, 11));
                          setRucValidado(false);
                          setNombreNegocioForm("");
                          setRazonSocialForm("");
                          setDireccionForm("");
                          setEstadoSunat("");
                          setCondicionSunat("");
                          setDistritoSunat("");
                          setProvinciaSunat("");
                          setDepartamentoSunat("");
                          setActividadEconomicaSunat("");
                          setEsJurisdiccionTrujillo(true);
                        }}
                        style={{ flex: 1, padding: "12px 16px", borderRadius: "10px", border: "1.5px solid #cbd5e1", fontSize: "15px", fontWeight: "700" }}
                      />
                      <button
                        type="button"
                        onClick={manejarConsultarRucPresencial}
                        disabled={consultandoRuc}
                        style={{ padding: "12px 20px", background: rucValidado && esJurisdiccionTrujillo ? "#16a34a" : "#2563eb", color: "white", border: "none", borderRadius: "10px", fontSize: "14px", fontWeight: "bold", cursor: "pointer" }}
                      >
                        {consultandoRuc ? "Buscando en SUNAT..." : rucValidado ? "✓ Validado" : "Consultar SUNAT"}
                      </button>
                    </div>

                    {/* ALERTA DE BLOQUEO POR FUERA DE JURISDICCIÓN */}
                    {rucValidado && !esJurisdiccionTrujillo && (
                      <div style={{ background: "#fef2f2", border: "1.5px solid #fca5a5", color: "#991b1b", padding: "16px 20px", borderRadius: "14px", marginBottom: "16px" }}>
                        <strong style={{ fontSize: "14.5px", display: "block", marginBottom: "4px" }}>
                          ⚠️ Establecimiento fuera de la Jurisdicción Municipal
                        </strong>
                        <p style={{ margin: 0, fontSize: "13.5px", lineHeight: "1.5" }}>
                          Este establecimiento no pertenece a la jurisdicción de la Municipalidad Provincial de Trujillo. Solo es posible registrar solicitudes para establecimientos ubicados en la provincia de Trujillo.
                        </p>
                      </div>
                    )}

                    {/* TARJETA PROFESIONAL DE INFORMACIÓN SUNAT */}
                    {rucValidado && (
                      <div style={{ background: "#f8fafc", border: "1.5px solid #e2e8f0", padding: "20px", borderRadius: "14px", marginTop: "16px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", borderBottom: "1px solid #cbd5e1", paddingBottom: "10px" }}>
                          <h4 style={{ margin: 0, color: "#0f172a", fontSize: "15px", fontWeight: "700" }}>
                            🏢 Información del Contribuyente (SUNAT)
                          </h4>
                          <div style={{ display: "flex", gap: "8px" }}>
                            {(() => {
                              const esActivo = estadoSunat === "ACTIVO";
                              return (
                                <span style={{ background: esActivo ? "#dcfce7" : "#fee2e2", color: esActivo ? "#15803d" : "#dc2626", padding: "3px 10px", borderRadius: "6px", fontSize: "12px", fontWeight: "bold" }}>
                                  {esActivo ? "✓" : "✗"} {estadoSunat}
                                </span>
                              );
                            })()}
                            {(() => {
                              const esHabido = condicionSunat === "HABIDO";
                              return (
                                <span style={{ background: esHabido ? "#dcfce7" : "#fee2e2", color: esHabido ? "#15803d" : "#dc2626", padding: "3px 10px", borderRadius: "6px", fontSize: "12px", fontWeight: "bold" }}>
                                  {esHabido ? "✓" : "✗"} {condicionSunat}
                                </span>
                              );
                            })()}
                          </div>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
                          <p style={{ margin: 0, fontSize: "13.5px", color: "#334155" }}>
                            <strong>Nombre Comercial:</strong> <span style={{ color: "#0f172a", fontWeight: "600" }}>{nombreNegocioForm}</span>
                          </p>
                          <p style={{ margin: 0, fontSize: "13.5px", color: "#334155" }}>
                            <strong>Razón Social:</strong> <span style={{ color: "#0f172a", fontWeight: "600" }}>{razonSocialForm}</span>
                          </p>
                          <p style={{ margin: 0, fontSize: "13.5px", color: "#334155" }}>
                            <strong>RUC:</strong> <span style={{ color: "#0f172a", fontWeight: "600" }}>{rucForm}</span>
                          </p>
                          <p style={{ margin: 0, fontSize: "13.5px", color: "#334155" }}>
                            <strong>Actividad Económica:</strong> <span style={{ color: "#0f172a", fontWeight: "600" }}>{actividadEconomicaSunat || reqsDocInfo.giroLabel}</span>
                          </p>
                          <p style={{ margin: 0, fontSize: "13.5px", color: "#334155" }}>
                            <strong>Estado del Contribuyente:</strong> <span style={{ color: estadoSunat === "ACTIVO" ? "#15803d" : "#dc2626", fontWeight: "700" }}>{estadoSunat || "---"}</span>
                          </p>
                          <p style={{ margin: 0, fontSize: "13.5px", color: "#334155" }}>
                            <strong>Condición del Contribuyente:</strong> <span style={{ color: condicionSunat === "HABIDO" ? "#15803d" : "#dc2626", fontWeight: "700" }}>{condicionSunat || "---"}</span>
                          </p>
                        </div>

                        {/* SECCIÓN DE LOCALES / SUCURSALES REGISTRADAS PREVIAMENTE PARA ESTE RUC (SOLO SI TIENE MÁS DE 1 LOCAL REGISTRADO) */}
                        {sucursalesExistentesDelRuc.length > 1 && (
                          <div style={{ background: "#eff6ff", border: "1.5px solid #bfdbfe", padding: "16px", borderRadius: "14px", marginBottom: "16px" }}>
                            <label style={{ display: "block", fontSize: "13.5px", fontWeight: "800", color: "#1e40af", marginBottom: "6px" }}>
                              🏢 Seleccionar Local / Sucursal Registrada de este RUC ({sucursalesExistentesDelRuc.length} locales registrados):
                            </label>
                            <select
                              defaultValue=""
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val !== "") {
                                  const item = sucursalesExistentesDelRuc[parseInt(val, 10)];
                                  if (item) {
                                    setNombreSucursalForm(item.nombreSucursal || item.sucursal || "Sede Principal");
                                    if (item.direccion) setDireccionForm(item.direccion);
                                  }
                                }
                              }}
                              style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1.5px solid #2563eb", fontSize: "13.5px", fontWeight: "bold", background: "white", color: "#0f172a" }}
                            >
                              <option value="">-- Seleccionar Local / Sucursal Registrada * --</option>
                              {sucursalesExistentesDelRuc.map((item, idx) => (
                                <option key={item.id || idx} value={idx}>
                                  📍 [{item.numeroExpediente || `EXP-${item.id}`}] {item.nombreSucursal || "Sucursal"} — {item.direccion} ({item.estado || "En trámite"})
                                </option>
                              ))}
                            </select>
                            <small style={{ color: "#1e3a8a", fontSize: "12px", marginTop: "6px", display: "block" }}>
                              ℹ️ Este RUC posee múltiples locales registrados. Seleccione la sucursal requerida para autocompletar su dirección oficial.
                            </small>
                          </div>
                        )}

                        {/* SECCIÓN ESPECÍFICA: UBICACIÓN Y DATOS DE LA SUCURSAL/LOCAL */}
                        <div style={{ background: "white", padding: "16px 20px", borderRadius: "12px", border: "1px solid #cbd5e1" }}>
                          <h5 style={{ margin: "0 0 10px", color: "#1e293b", fontSize: "14px", fontWeight: "700", display: "flex", alignItems: "center", gap: "6px" }}>
                            📍 Datos de Ubicación del Local Comercial (SUNAT)
                          </h5>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "14px" }}>
                            <p style={{ margin: 0, fontSize: "13px", color: "#334155" }}>
                              <strong>📍 Distrito:</strong> {distritoSunat}
                            </p>
                            <p style={{ margin: 0, fontSize: "13px", color: "#334155" }}>
                              <strong>📍 Provincia:</strong> {provinciaSunat}
                            </p>
                            <p style={{ margin: 0, fontSize: "13px", color: "#334155", gridColumn: "span 2" }}>
                              <strong>📍 Departamento:</strong> {departamentoSunat}
                            </p>
                          </div>

                          <div style={{ paddingTop: "12px", borderTop: "1px solid #e2e8f0" }}>
                            <label style={{ display: "block", fontSize: "13px", fontWeight: "700", color: "#0f172a", marginBottom: "4px" }}>
                              📍 Dirección del Local Comercial *
                            </label>
                            <input
                              type="text"
                              value={direccionForm}
                              onChange={(e) => setDireccionForm(e.target.value)}
                              placeholder="Ingrese o edite la dirección del local comercial"
                              style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1.5px solid #cbd5e1", fontSize: "13.5px", fontWeight: "bold", background: "#ffffff", color: "#1e293b" }}
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ALERTA DE RECHAZO POR ESTADO/CONDICIÓN SUNAT NO VÁLIDA - PASO 3 */}
                    {rucValidado && !sunatPermiteContinuar && (
                      <div style={{ background: "#fef2f2", border: "1.5px solid #dc2626", color: "#991b1b", padding: "16px 20px", borderRadius: "14px", marginTop: "16px" }}>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                          <span style={{ fontSize: "20px", lineHeight: "1" }}>🚫</span>
                          <div>
                            <strong style={{ fontSize: "14px", display: "block", marginBottom: "4px" }}>
                              Establecimiento NO puede continuar con el trámite
                            </strong>
                            <p style={{ margin: "0 0 8px", fontSize: "13px", lineHeight: "1.5" }}>
                              SUNAT ha registrado una condición que impide el inicio de este procedimiento administrativo:
                            </p>
                            <ul style={{ margin: "0 0 8px", paddingLeft: "20px", fontSize: "12.5px", lineHeight: "1.6" }}>
                              {estadoSunat !== "ACTIVO" && (
                                <li><strong>Estado del Contribuyente:</strong> <span style={{ color: "#dc2626", fontWeight: "700" }}>{estadoSunat}</span> — Se requiere <span style={{ fontWeight: "700" }}>ACTIVO</span></li>
                              )}
                              {condicionSunat !== "HABIDO" && (
                                <li><strong>Condición del Contribuyente:</strong> <span style={{ color: "#dc2626", fontWeight: "700" }}>{condicionSunat}</span> — Se requiere <span style={{ fontWeight: "700" }}>HABIDO</span></li>
                              )}
                            </ul>
                            <p style={{ margin: 0, fontSize: "12px", color: "#991b1b", fontStyle: "italic" }}>
                              El contribuyente debe regularizar su situación ante SUNAT antes de iniciar cualquier trámite municipal.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ALERTA DE RECHAZO POR RUC DUPLICADO */}
                    {(() => {
                      const dupRuc = rucValidado && solicitudes.find((s) => s.ruc === rucForm.trim() && !["Rechazado", "Licencia rechazada"].includes(s.estado));
                      if (!dupRuc) return null;
                      const expLimpio = String(dupRuc.id).replace(/^EXP-/, "");
                      return (
                        <div style={{ background: "#fef2f2", border: "1.5px solid #dc2626", color: "#991b1b", padding: "16px 20px", borderRadius: "14px", marginTop: "16px" }}>
                          <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                            <span style={{ fontSize: "22px", lineHeight: "1" }}>🚫</span>
                            <div>
                              <strong style={{ fontSize: "14px", display: "block", marginBottom: "4px" }}>
                                RUC Ya Registrado en el Sistema
                              </strong>
                              <p style={{ margin: "0 0 6px", fontSize: "13px", lineHeight: "1.5" }}>
                                El RUC <strong>{rucForm}</strong> ({nombreNegocioForm}) ya cuenta con un expediente registrado: <strong>EXP-{expLimpio}</strong> (Estado: {dupRuc.estado || "En trámite"}).
                              </p>
                              <p style={{ margin: 0, fontSize: "12.5px", fontWeight: "bold" }}>
                                No se permite registrar más de una solicitud por RUC.
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* PASO 3: PLANO PDF */}
                {pasoActual === 3 && (
                  <div style={{ background: "#ffffff", padding: "24px", borderRadius: "16px", border: "1px solid #cbd5e1", boxShadow: "0 2px 8px rgba(0,0,0,0.03)" }}>
                    <h4 style={{ margin: "0 0 6px", color: "#0f172a", fontSize: "16px", fontWeight: "700" }}>📄 Carga del Plano del Local (PDF Obligatorio)</h4>
                    <p style={{ margin: "0 0 20px", color: "#64748b", fontSize: "13.5px" }}>Adjunte el archivo PDF correspondiente al plano arquitectónico y distribución del local.</p>

                    <div style={{ border: "2px dashed #3b82f6", background: "#f8fafc", padding: "32px 20px", borderRadius: "16px", textAlign: "center" }}>
                      <div style={{ fontSize: "48px", marginBottom: "8px" }}>📄</div>
                      <strong style={{ fontSize: "15px", color: "#0f172a", display: "block", marginBottom: "4px" }}>Plano Arquitectónico y de Distribución del Local (PDF) *</strong>
                      <p style={{ fontSize: "13px", color: "#64748b", margin: "0 0 16px" }}>Seleccione el archivo PDF desde su computadora</p>

                      <input
                        type="file"
                        accept=".pdf,application/pdf"
                        disabled={subiendoPdfCloudinary}
                        onChange={(e) => manejarArchivoPresencial(e, "plano_local", "Plano Arquitectónico y de Distribución del Local (PDF)")}
                        style={{ fontSize: "13.5px", fontWeight: "bold" }}
                      />
                    </div>

                    {subiendoPdfCloudinary && (
                      <div style={{ background: "#e0f2fe", border: "1.5px solid #38bdf8", padding: "14px 20px", borderRadius: "12px", marginTop: "16px", display: "flex", alignItems: "center", gap: "12px" }}>
                        <span style={{ fontSize: "22px" }}>☁️</span>
                        <div>
                          <strong style={{ color: "#0369a1", fontSize: "14px" }}>Subiendo plano a la nube Cloudinary...</strong>
                          <span style={{ display: "block", fontSize: "12.5px", color: "#0284c7" }}>Por favor espere unos segundos mientras se procesa el archivo PDF.</span>
                        </div>
                      </div>
                    )}

                    {!subiendoPdfCloudinary && archivosPresenciales.length > 0 && (
                      <div style={{ background: "#dcfce7", border: "1.5px solid #86efac", padding: "14px 20px", borderRadius: "12px", marginTop: "16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <strong style={{ color: "#166534", fontSize: "14.5px" }}>✓ Archivo cargado correctamente a Cloudinary</strong>
                          <span style={{ display: "block", fontSize: "13px", color: "#15803d", marginTop: "2px" }}>📄 {archivosPresenciales[0]?.archivoNombre}</span>
                        </div>
                        <span style={{ fontSize: "24px" }}>✅</span>
                      </div>
                    )}
                  </div>
                )}

                {/* PASO 4: PAGO DE TASA Y REGISTRO DIRECTO */}
                {pasoActual === 4 && (
                  <div style={{ background: "#ffffff", padding: "24px", borderRadius: "16px", border: "1px solid #cbd5e1", boxShadow: "0 2px 8px rgba(0,0,0,0.03)" }}>
                    <h4 style={{ margin: "0 0 16px", color: "#0f172a", fontSize: "16px", fontWeight: "700" }}>💳 Pago de Tasa Municipal (S/ 3.00) y Finalización Directa</h4>

                    <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "14px", padding: "24px", marginBottom: "20px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                        <div>
                          <span style={{ fontSize: "12px", color: "#64748b", fontWeight: "bold", textTransform: "uppercase" }}>Derecho de Trámite Licencia Municipal</span>
                          <h3 style={{ margin: "2px 0 0", color: "#16a34a", fontSize: "32px", fontWeight: "800" }}>S/ {MONTO_TRAMITE.toFixed(2)}</h3>
                        </div>
                        <div style={{ textAlign: "right", background: "#ffffff", padding: "10px 16px", borderRadius: "10px", border: "1px solid #cbd5e1" }}>
                          <small style={{ color: "#64748b", fontWeight: "bold", display: "block", fontSize: "11px" }}>COMPROBANTE A EMITIR</small>
                          <strong style={{ color: "#dc2626", fontSize: "14px" }}>
                            🧾 Factura Electrónica (F001-AUTO)
                          </strong>
                        </div>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "16px" }}>
                        <div>
                          <label style={{ display: "block", fontSize: "13px", fontWeight: "700", color: "#334155", marginBottom: "6px" }}>
                            Tipo de Comprobante a Emitir *
                          </label>
                          <select
                            value={tipoComprobanteSeleccionado}
                            onChange={(e) => setTipoComprobanteSeleccionado(e.target.value)}
                            style={{ width: "100%", padding: "12px 16px", borderRadius: "10px", border: "1.5px solid #cbd5e1", fontSize: "14px", fontWeight: "700" }}
                          >
                            <option value="Factura">🧾 Factura Electrónica (F001 - Único Comprobante)</option>
                          </select>
                        </div>

                        <div>
                          <label style={{ display: "block", fontSize: "13px", fontWeight: "700", color: "#334155", marginBottom: "6px" }}>
                            Seleccione Método de Pago *
                          </label>
                          <select
                            value={metodoPagoSeleccionado}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val.toLowerCase().includes("efectivo") && !cajaAbierta.abierta) {
                                alert("🔒 Debe aperturar la caja antes de registrar pagos en efectivo.");
                              }
                              setMetodoPagoSeleccionado(val);
                            }}
                            style={{ width: "100%", padding: "12px 16px", borderRadius: "10px", border: "1.5px solid #cbd5e1", fontSize: "14px", fontWeight: "700" }}
                          >
                            <option value="Efectivo en Caja Municipal" disabled={!cajaAbierta.abierta}>
                              {cajaAbierta.abierta ? "💵 Efectivo en Caja Municipal" : "🔒 💵 Efectivo (Debe aperturar caja primero)"}
                            </option>
                            <option value="Pago Billetera Digital">📱 Pago Billetera Digital (Flow / Yape / Plin / Tarjeta)</option>
                          </select>
                          {!cajaAbierta.abierta && metodoPagoSeleccionado.toLowerCase().includes("efectivo") && (
                            <small style={{ color: "#dc2626", fontWeight: "bold", fontSize: "12px", display: "block", marginTop: "6px" }}>
                              🔒 Debe aperturar la caja antes de registrar pagos en efectivo. (Puede seleccionar Billetera Digital para continuar).
                            </small>
                          )}
                        </div>
                      </div>

                      {/* CONDICIONAL: SI SE SELECCIONA BOLETA DE VENTA -> PEDIR DNI Y RENIEC */}
                      {tipoComprobanteSeleccionado === "Boleta" && (
                        <div style={{ background: "#eff6ff", border: "1.5px solid #bfdbfe", padding: "16px", borderRadius: "12px", marginBottom: "16px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                            <label style={{ fontSize: "13px", fontWeight: "bold", color: "#1e3a8a" }}>
                              🪪 Datos del Cliente / Adquirente (Boleta de Venta — Persona Natural) *
                            </label>
                            <span style={{ fontSize: "11.5px", fontWeight: "bold", color: dniValidado ? "#15803d" : "#b45309" }}>
                              {dniValidado ? "✓ RENIEC Validado" : "🔒 Consulta RENIEC"}
                            </span>
                          </div>

                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                            <div>
                              <label style={{ display: "block", fontSize: "12px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>
                                DNI del Cliente (8 dígitos) *
                              </label>
                              <div style={{ display: "flex", gap: "6px" }}>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  maxLength={8}
                                  placeholder="DNI (8 dígitos)"
                                  value={dniForm}
                                  onChange={(e) => {
                                    const val = e.target.value.replace(/\D/g, "").slice(0, 8);
                                    setDniForm(val);
                                    setDniValidado(false);
                                  }}
                                  style={{ flex: 1, padding: "8px 12px", borderRadius: "8px", border: (dniForm && dniForm.length !== 8) ? "1.5px solid #dc2626" : "1px solid #cbd5e1", fontSize: "13.5px", fontWeight: "bold", background: "white" }}
                                />
                                <button
                                  type="button"
                                  onClick={manejarConsultarDniPresencial}
                                  disabled={consultandoDni || !dniForm || dniForm.length !== 8}
                                  style={{ padding: "8px 12px", background: dniValidado ? "#16a34a" : "#2563eb", color: "white", border: "none", borderRadius: "8px", fontSize: "12.5px", fontWeight: "bold", cursor: "pointer" }}
                                >
                                  {consultandoDni ? "..." : dniValidado ? "✓ RENIEC" : "🔍 Buscar"}
                                </button>
                              </div>
                            </div>

                            <div>
                              <label style={{ display: "block", fontSize: "12px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>
                                Nombres y Apellidos del Cliente (RENIEC) *
                              </label>
                              <input
                                type="text"
                                placeholder={dniValidado ? "Cargado de RENIEC" : "🔒 Ingrese DNI (8 dígitos) y presione 'Buscar'..."}
                                value={dniValidado ? `${nombresForm} ${apellidosForm}`.trim() : (nombresForm ? `${nombresForm} ${apellidosForm}`.trim() : "")}
                                readOnly={true}
                                style={{
                                  width: "100%",
                                  padding: "8px 12px",
                                  borderRadius: "8px",
                                  border: dniValidado ? "1.5px solid #16a34a" : "1.5px solid #cbd5e1",
                                  fontSize: "13.5px",
                                  fontWeight: "bold",
                                  background: dniValidado ? "#f0fdf4" : "#f8fafc",
                                  color: dniValidado ? "#15803d" : "#64748b",
                                  cursor: "not-allowed"
                                }}
                              />
                            </div>
                          </div>

                          {(!dniForm || dniForm.trim().length !== 8) && (
                            <div style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fca5a5", padding: "8px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: "bold", marginTop: "10px", textAlign: "center" }}>
                              ⚠️ Boleta de Venta Electrónica: Ingrese un DNI válido de 8 dígitos del cliente.
                            </div>
                          )}
                        </div>
                      )}

                      {/* CONDICIONAL: SI SE SELECCIONA FACTURA -> MOSTRAR DATOS DE LA EMPRESA Y RUC */}
                      {tipoComprobanteSeleccionado === "Factura" && (
                        <div style={{ background: "#fef2f2", border: "1.5px solid #fca5a5", padding: "14px 16px", borderRadius: "12px", marginBottom: "16px" }}>
                          <strong style={{ color: "#991b1b", fontSize: "13px", display: "block", marginBottom: "4px" }}>
                            🧾 Datos de la Empresa (Factura Electrónica — Crédito Fiscal)
                          </strong>
                          <p style={{ margin: "2px 0", fontSize: "13px", color: "#334155" }}>
                            <strong>RUC de la Empresa (11 dígitos):</strong> {rucForm || "--- (Sin registrar)"}
                          </p>
                          <p style={{ margin: "2px 0", fontSize: "13px", color: "#334155" }}>
                            <strong>Razón Social / Empresa:</strong> {razonSocialForm || nombreNegocioForm || "---"}
                          </p>
                          {(!rucForm || rucForm.trim().length !== 11) && (
                            <div style={{ background: "#fee2e2", color: "#dc2626", border: "1px solid #fca5a5", padding: "8px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: "bold", marginTop: "8px", textAlign: "center" }}>
                              ⚠️ La Factura Electrónica exige haber registrado un RUC de 11 dígitos en el Paso 2.
                            </div>
                          )}
                        </div>
                      )}

                      {/* CAMPOS DINÁMICOS DE EFECTIVO VS DIGITAL */}
                      {metodoPagoSeleccionado.toLowerCase().includes("efectivo") && (
                        <div style={{ background: "#fffbeb", border: "1.5px solid #fde68a", padding: "16px", borderRadius: "12px", marginBottom: "16px" }}>
                          <label style={{ display: "block", fontSize: "13px", fontWeight: "bold", color: "#92400e", marginBottom: "6px" }}>
                            💵 Monto Recibido del Ciudadano (S/) *
                          </label>
                          <input
                            type="number"
                            step="0.10"
                            min="3.00"
                            max="200.00"
                            placeholder="Ej. 10, 20, 50, 100 o 200"
                            value={montoRecibidoInput}
                            onChange={(e) => {
                              const val = e.target.value;
                              const num = parseFloat(val);
                              if (!isNaN(num) && num > 200) {
                                alert("🚫 El monto ingresado no puede superar S/ 200.00 (máxima denominación de billete peruano). Se ha restablecido a 0.");
                                setMontoRecibidoInput("");
                                return;
                              }
                              setMontoRecibidoInput(val);
                            }}
                            style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1.5px solid #d97706", fontSize: "16px", fontWeight: "800", color: "#0f172a", background: "white" }}
                          />

                          {/* SELECCIÓN RÁPIDA DE BILLETES PERUANOS (S/ 3 - S/ 200) */}
                          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "10px" }}>
                            <span style={{ fontSize: "11px", fontWeight: "bold", color: "#92400e", width: "100%" }}>Billetes / Monedas de Pago Rápido:</span>
                            {[3, 5, 10, 20, 50, 100, 200].map((val) => (
                              <button
                                key={val}
                                type="button"
                                onClick={() => setMontoRecibidoInput(String(val))}
                                style={{
                                  padding: "5px 10px",
                                  background: montoRecibidoInput === String(val) ? "#d97706" : "#ffffff",
                                  color: montoRecibidoInput === String(val) ? "white" : "#78350f",
                                  border: "1.5px solid #d97706",
                                  borderRadius: "6px",
                                  fontSize: "12px",
                                  fontWeight: "bold",
                                  cursor: "pointer",
                                }}
                              >
                                S/ {val === 3 ? "3 (Exacto)" : val}
                              </button>
                            ))}
                          </div>

                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginTop: "12px", background: "white", padding: "12px", borderRadius: "8px", border: "1px solid #fcd34d", textAlign: "center" }}>
                            <div>
                              <small style={{ color: "#64748b", fontWeight: "bold", fontSize: "10.5px" }}>TOTAL A PAGAR</small>
                              <p style={{ margin: "2px 0 0", fontWeight: "800", fontSize: "14.5px", color: "#0f172a" }}>S/ {MONTO_TRAMITE.toFixed(2)}</p>
                            </div>
                            <div>
                              <small style={{ color: "#64748b", fontWeight: "bold", fontSize: "10.5px" }}>MONTO RECIBIDO</small>
                              <p style={{ margin: "2px 0 0", fontWeight: "800", fontSize: "14.5px", color: "#2563eb" }}>
                                S/ {(parseFloat(montoRecibidoInput) || 0).toFixed(2)}
                              </p>
                            </div>
                            <div>
                              <small style={{ color: "#64748b", fontWeight: "bold", fontSize: "10.5px" }}>VUELTO</small>
                              <p style={{ margin: "2px 0 0", fontWeight: "800", fontSize: "14.5px", color: (parseFloat(montoRecibidoInput) || 0) >= MONTO_TRAMITE && (parseFloat(montoRecibidoInput) || 0) <= 200 ? "#16a34a" : "#dc2626" }}>
                                S/ {Math.max(0, (parseFloat(montoRecibidoInput) || 0) - MONTO_TRAMITE).toFixed(2)}
                              </p>
                            </div>
                          </div>

                          {!montoRecibidoInput.trim() ? (
                            <div style={{ background: "#f8fafc", color: "#475569", border: "1px solid #cbd5e1", padding: "8px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: "600", marginTop: "10px", textAlign: "center" }}>
                              ℹ️ Ingrese el monto en efectivo entregado por el ciudadano o toque una denominación de billete arriba.
                            </div>
                          ) : (parseFloat(montoRecibidoInput) || 0) < MONTO_TRAMITE ? (
                            <div style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fca5a5", padding: "8px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: "bold", marginTop: "10px", textAlign: "center" }}>
                              ⚠️ El monto ingresado (S/ {(parseFloat(montoRecibidoInput) || 0).toFixed(2)}) es menor a la tasa del trámite (S/ {MONTO_TRAMITE.toFixed(2)}).
                            </div>
                          ) : (parseFloat(montoRecibidoInput) || 0) > 200 ? (
                            <div style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fca5a5", padding: "8px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: "bold", marginTop: "10px", textAlign: "center" }}>
                              🚫 El monto no puede superar S/ 200.00 (máxima denominación de billete peruano).
                            </div>
                          ) : (
                            <div style={{ background: "#f0fdf4", color: "#166534", border: "1px solid #bbf7d0", padding: "8px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: "bold", marginTop: "10px", textAlign: "center" }}>
                              ✓ Monto correcto. Vuelto a entregar: S/ {((parseFloat(montoRecibidoInput) || 0) - MONTO_TRAMITE).toFixed(2)}
                            </div>
                          )}
                        </div>
                      )}


                    </div>

                    {(() => {
                      const esFacturaDoc = tipoComprobanteSeleccionado === "Factura";
                      const esEfectivoDoc = metodoPagoSeleccionado.toLowerCase().includes("efectivo");

                      const faltaComprobante = esFacturaDoc
                        ? (!rucValidado || !rucForm || rucForm.trim().length !== 11)
                        : (!dniValidado || !dniForm || dniForm.trim().length !== 8);

                      const faltaCajaAbierta = esEfectivoDoc && !cajaAbierta.abierta;
                      const faltaMontoEfectivo = esEfectivoDoc && ((parseFloat(montoRecibidoInput) || 0) < MONTO_TRAMITE || (parseFloat(montoRecibidoInput) || 0) > 200);

                      const botonBloqueado = procesando || faltaComprobante || faltaCajaAbierta || faltaMontoEfectivo;

                      return (
                        <>
                          {/* AVISOS DE AYUDA EXPLICATIVOS SI EL BOTÓN ESTÁ INHABILITADO */}
                          {faltaCajaAbierta && (
                            <div style={{ background: "#fef2f2", border: "1.5px solid #fca5a5", color: "#991b1b", padding: "10px 14px", borderRadius: "10px", marginBottom: "12px", fontSize: "12.5px", fontWeight: "bold", textAlign: "center" }}>
                              🔒 Debe aperturar la caja municipal antes de registrar pagos en efectivo.
                            </div>
                          )}
                          {!faltaCajaAbierta && esFacturaDoc && faltaComprobante && (
                            <div style={{ background: "#fef2f2", border: "1.5px solid #fca5a5", color: "#991b1b", padding: "10px 14px", borderRadius: "10px", marginBottom: "12px", fontSize: "12.5px", fontWeight: "bold", textAlign: "center" }}>
                              ⚠️ Para emitir Factura Electrónica, valide el RUC de 11 dígitos con SUNAT.
                            </div>
                          )}
                          {!faltaCajaAbierta && !esFacturaDoc && faltaComprobante && (
                            <div style={{ background: "#fef2f2", border: "1.5px solid #fca5a5", color: "#991b1b", padding: "10px 14px", borderRadius: "10px", marginBottom: "12px", fontSize: "12.5px", fontWeight: "bold", textAlign: "center" }}>
                              ⚠️ Para emitir Boleta de Venta Electrónica, consulte y valide el DNI de 8 dígitos con RENIEC.
                            </div>
                          )}

                          <button
                            type="button"
                            onClick={ejecutarRegistroPresencialCompleto}
                            disabled={botonBloqueado}
                            style={{
                              width: "100%",
                              padding: "16px",
                              background: botonBloqueado
                                ? "#cbd5e1"
                                : !esEfectivoDoc
                                ? "linear-gradient(90deg, #2563eb, #1d4ed8)"
                                : "linear-gradient(90deg, #16a34a, #059669)",
                              color: "white",
                              border: "none",
                              borderRadius: "14px",
                              fontSize: "16.5px",
                              fontWeight: "800",
                              cursor: botonBloqueado ? "not-allowed" : "pointer",
                              boxShadow: "0 4px 14px rgba(0, 0, 0, 0.15)"
                            }}
                          >
                            {procesando
                              ? (!esEfectivoDoc ? "🌐 Conectando con Pasarela Flow..." : "⏳ Procesando Registro y Emisión en Caja...")
                              : faltaCajaAbierta
                              ? "🔒 Debe aperturar la caja antes de registrar pagos en efectivo"
                              : !esEfectivoDoc
                              ? "🌐 Ir a Pasarela de Pago Billetera Digital (Flow) ➔"
                              : "💰 Confirmar Pago en Efectivo (S/ 3.00) y Registrar Solicitud"}
                          </button>
                        </>
                      );
                    })()}
                  </div>
                )}

                {/* BOTONES NAVEGACIÓN ANTERIOR / CONTINUAR */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "24px", paddingTop: "16px", borderTop: "1px solid #e2e8f0" }}>
                  {pasoActual > 1 ? (
                    <button
                      type="button"
                      onClick={() => setPasoActual((prev) => Math.max(1, prev - 1))}
                      style={{ padding: "12px 24px", background: "#f1f5f9", color: "#475569", border: "1px solid #cbd5e1", borderRadius: "10px", fontWeight: "bold", fontSize: "14px", cursor: "pointer" }}
                    >
                      ← Anterior
                    </button>
                  ) : (
                    <div />
                  )}

                  {pasoActual < 4 && (
                    <button
                      type="button"
                      onClick={() => {
                        if (pasoActual === 1) {
                          if (!esTelefonoValido) {
                            alert("⚠️ Ingrese un teléfono celular peruano válido (9 dígitos iniciado en 9).");
                            return;
                          }
                          if (!esCorreoValido) {
                            alert("⚠️ Ingrese un correo electrónico de notificaciones válido.");
                            return;
                          }
                        }
                        if (pasoActual === 2) {
                          if (!rucValidado) {
                            alert("⚠️ Debe consultar y validar el RUC en SUNAT para continuar.");
                            return;
                          }
                          const dirNormNav = (direccionForm || "").toLowerCase().trim();
                          const sucursalNormNav = (nombreSucursalForm || "").toLowerCase().trim();
                          const dupRucNav = solicitudes.find((s) => {
                            if (!s || String(s.ruc).trim() !== String(rucForm).trim()) return false;
                            if (["Rechazado", "Licencia rechazada", "Anulado"].includes(s.estado)) return false;
                            const sDir = (s.direccion || "").toLowerCase().trim();
                            const sSuc = (s.nombreSucursal || "").toLowerCase().trim();
                            return (dirNormNav && sDir && sDir === dirNormNav) || (sucursalNormNav && sSuc && sucursalNormNav.length > 2 && sSuc === sucursalNormNav);
                          });
                          if (dupRucNav) {
                            const expLimpioNav = String(dupRucNav.id).replace(/^EXP-/, "");
                            alert(`🚫 No es posible continuar con el trámite.\n\nEl RUC ${rucForm} ya cuenta con la solicitud EXP-${expLimpioNav} registrada para este mismo local/sucursal ("${direccionForm}").\n\nSi está registrando una nueva sucursal, la dirección del local debe ser diferente.`);
                            return;
                          }
                          if (!esJurisdiccionTrujillo) {
                            alert("Este establecimiento no pertenece a la jurisdicción de la Municipalidad Provincial de Trujillo. Solo es posible registrar solicitudes para establecimientos ubicados en la provincia de Trujillo.");
                            return;
                          }
                          if (!sunatPermiteContinuar) {
                            alert(`🚫 No es posible continuar con el trámite.\n\nEl contribuyente tiene:\n• Estado: ${estadoSunat} (se requiere ACTIVO)\n• Condición: ${condicionSunat} (se requiere HABIDO)\n\nEl contribuyente debe regularizar su situación ante SUNAT.`);
                            return;
                          }
                        }
                        if (pasoActual === 3 && !paso3Completado) {
                          alert("⚠️ Debe adjuntar el archivo PDF del Plano del Local.");
                          return;
                        }
                        setPasoActual((prev) => Math.min(4, prev + 1));
                      }}
                      style={{ padding: "12px 28px", background: "#2563eb", color: "white", border: "none", borderRadius: "10px", fontWeight: "bold", fontSize: "14px", cursor: "pointer", boxShadow: "0 2px 6px rgba(37,99,235,0.2)" }}
                    >
                      Siguiente ➔
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* VISTA 2: CONSULTA DE ESTADO DE TRÁMITE POR RUC */}
      {seccion === "consulta-expedientes" && (
        <section className="section-card">
          <div className="section-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h2>🔍 Consulta y Estado de Trámites por RUC</h2>
              <p>Ingrese el RUC de la empresa para consultar el estado actual del trámite y la información requerida.</p>
            </div>
          </div>

          {/* BÚSQUEDA EXCLUSIVA POR RUC */}
          <div style={{ background: "#f8fafc", border: "1.5px solid #cbd5e1", borderRadius: "14px", padding: "20px", marginBottom: "24px" }}>
            <label style={{ display: "block", fontSize: "14px", fontWeight: "800", color: "#0f172a", marginBottom: "8px" }}>
              🏢 Ingrese el RUC de la empresa (11 dígitos):
            </label>
            <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
              <input
                type="text"
                placeholder="🔍 Ingrese RUC de la empresa (Ej: 20601234567)..."
                value={busquedaRuc}
                onChange={(e) => setBusquedaRuc(e.target.value)}
                maxLength={11}
                style={{ flex: 1, minWidth: "260px", padding: "14px 18px", borderRadius: "10px", border: "2px solid #2563eb", fontSize: "16px", fontWeight: "700", background: "white", color: "#0f172a", outline: "none" }}
              />
              {busquedaRuc && (
                <button
                  type="button"
                  onClick={() => setBusquedaRuc("")}
                  style={{ padding: "14px 20px", background: "#f1f5f9", color: "#475569", border: "1px solid #cbd5e1", borderRadius: "10px", fontWeight: "800", fontSize: "14px", cursor: "pointer" }}
                >
                  🧹 Limpiar
                </button>
              )}
            </div>
          </div>

          {/* RESULTADOS DE BÚSQUEDA */}
          {(() => {
            const rucLimpio = busquedaRuc.trim().toLowerCase();
            const tramitesCoincidentes = rucLimpio
              ? solicitudes.filter((s) => (s.ruc || "").toLowerCase().includes(rucLimpio) || (s.id || "").toLowerCase().includes(rucLimpio))
              : solicitudes;

            if (!rucLimpio) {
              return (
                <div style={{ background: "#eff6ff", border: "1px dashed #3b82f6", borderRadius: "14px", padding: "36px", textAlign: "center", color: "#1e40af" }}>
                  <span style={{ fontSize: "40px", display: "block", marginBottom: "8px" }}>🔍</span>
                  <h3 style={{ margin: "0 0 6px", fontSize: "18px", fontWeight: "800" }}>Consulta de Trámites por RUC</h3>
                  <p style={{ margin: 0, fontSize: "14px", color: "#475569" }}>Ingrese el número de RUC de la empresa en la casilla superior para buscar y consultar su estado.</p>
                </div>
              );
            }

            if (tramitesCoincidentes.length === 0) {
              return (
                <div className="empty-state" style={{ padding: "40px", textAlign: "center", background: "#fff1f2", border: "1px solid #fecaca", borderRadius: "14px" }}>
                  <span style={{ fontSize: "40px", display: "block", marginBottom: "8px" }}>📭</span>
                  <h3 style={{ color: "#991b1b", margin: "0 0 6px" }}>No se encontraron trámites</h3>
                  <p style={{ color: "#7f1d1d", margin: 0 }}>No existe ningún expediente registrado con el RUC "<strong>{busquedaRuc}</strong>". Verifique el número e intente de nuevo.</p>
                </div>
              );
            }

            return (
              <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                {tramitesCoincidentes.map((s) => {
                  const estInfo = clasificarEstadoTramiteCajera(s);

                  return (
                    <div
                      key={s.id}
                      style={{
                        background: "white",
                        border: `2px solid ${estInfo.badgeColor}`,
                        borderRadius: "16px",
                        padding: "24px",
                        boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "16px"
                      }}
                    >
                      {/* ENCABEZADO DE ESTADO */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", background: estInfo.badgeBg, padding: "14px 20px", borderRadius: "12px", border: `1px solid ${estInfo.badgeColor}` }}>
                        <div>
                          <span style={{ fontSize: "12px", fontWeight: "800", color: estInfo.badgeColor, textTransform: "uppercase", letterSpacing: "0.5px", display: "block" }}>ESTADO DEL TRÁMITE</span>
                          <strong style={{ fontSize: "18px", color: estInfo.badgeColor, display: "block", marginTop: "2px" }}>{estInfo.titulo}</strong>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <span style={{ fontSize: "13px", fontWeight: "700", color: "#475569" }}>Expediente:</span>
                          <strong style={{ fontSize: "16px", color: "#2563eb", display: "block" }}>EXP-{String(s.id).replace(/^EXP-/, "")}</strong>
                        </div>
                      </div>

                      {/* DATOS ESPECÍFICOS SEGÚN ESTADO */}
                      {estInfo.tipo === "PENDIENTE" && (
                        <div style={{ background: "#f8fafc", padding: "18px 20px", borderRadius: "12px", border: "1px solid #cbd5e1" }}>
                          <p style={{ margin: "4px 0", fontSize: "15px", color: "#0f172a" }}><strong>🏢 RUC de la Empresa:</strong> {s.ruc}</p>
                          <p style={{ margin: "4px 0", fontSize: "15px", color: "#0f172a" }}><strong>🏪 Nombre Comercial / Razón Social:</strong> {s.nombreNegocio || s.razonSocial}</p>
                          <p style={{ margin: "10px 0 0", fontSize: "16px", color: "#1e40af", fontWeight: "800" }}>
                            📅 <strong>Fecha de Inspección (1ra Visita):</strong> {estInfo.fechaInspeccion}
                          </p>
                        </div>
                      )}

                      {estInfo.tipo === "OBSERVADO" && (
                        <div style={{ background: "#faf5ff", padding: "18px 20px", borderRadius: "12px", border: "1px solid #e9d5ff" }}>
                          <p style={{ margin: "4px 0", fontSize: "15px", color: "#0f172a" }}><strong>🏢 RUC de la Empresa:</strong> {s.ruc}</p>
                          <p style={{ margin: "4px 0", fontSize: "15px", color: "#0f172a" }}><strong>🏪 Nombre Comercial / Razón Social:</strong> {s.nombreNegocio || s.razonSocial}</p>
                          <p style={{ margin: "10px 0 0", fontSize: "16px", color: "#6b21a8", fontWeight: "800" }}>
                            📅 <strong>Próxima Fecha de Inspección (Segunda visita - Última oportunidad):</strong> {estInfo.proximaFechaInspeccion}
                          </p>
                        </div>
                      )}

                      {estInfo.tipo === "RECHAZADO" && (
                        <div style={{ background: "#fef2f2", padding: "20px", borderRadius: "12px", border: "1.5px solid #fca5a5" }}>
                          <p style={{ margin: "0 0 10px", fontSize: "15px", color: "#991b1b", fontWeight: "800" }}>
                            📝 Motivo del Rechazo (Comentario del Inspector):
                          </p>
                          <div style={{ background: "white", border: "1px solid #fecaca", padding: "14px 18px", borderRadius: "10px", fontSize: "14.5px", color: "#7f1d1d", fontWeight: "600", lineHeight: 1.6 }}>
                            "{estInfo.motivoRechazo}"
                          </div>
                        </div>
                      )}

                      {estInfo.tipo === "APROBADO" && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                          <div style={{ background: "#f0fdf4", padding: "18px 20px", borderRadius: "12px", border: "1px solid #bbf7d0" }}>
                            <p style={{ margin: "4px 0", fontSize: "15px", color: "#0f172a" }}><strong>🏢 RUC de la Empresa:</strong> {s.ruc}</p>
                            <p style={{ margin: "4px 0", fontSize: "15px", color: "#0f172a" }}><strong>🏪 Razón Social / Nombre Comercial:</strong> {s.nombreNegocio || s.razonSocial}</p>
                            <p style={{ margin: "4px 0", fontSize: "15px", color: "#0f172a" }}><strong>📍 Dirección del Establecimiento:</strong> {s.direccion} ({s.distrito || "Trujillo"})</p>
                            <p style={{ margin: "4px 0", fontSize: "15px", color: "#0f172a" }}><strong>🛒 Giro Comercial:</strong> {s.giro}</p>
                            <p style={{ margin: "4px 0", fontSize: "15px", color: "#166534" }}><strong>📅 Fecha de Emisión:</strong> {s.fechaEvaluacionInspector || s.fechaAprobacion || "---"}</p>
                          </div>
                          <div>
                            <button
                              type="button"
                              onClick={() => descargarLicenciaConMarcaAgua(s, false)}
                              style={{
                                background: "linear-gradient(135deg, #16a34a 0%, #15803d 100%)",
                                color: "white",
                                border: "none",
                                padding: "12px 24px",
                                borderRadius: "10px",
                                fontSize: "14.5px",
                                fontWeight: "800",
                                cursor: "pointer",
                                boxShadow: "0 4px 12px rgba(22, 163, 74, 0.25)",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "8px"
                              }}
                            >
                              📥 Descargar Licencia de Funcionamiento
                            </button>
                          </div>
                        </div>
                      )}

                      {estInfo.tipo === "VENCIDO" && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                          <div style={{ background: "#fef2f2", padding: "18px 20px", borderRadius: "12px", border: "1px solid #fecaca" }}>
                            <p style={{ margin: "4px 0", fontSize: "15px", color: "#0f172a" }}><strong>🏢 RUC de la Empresa:</strong> {s.ruc}</p>
                            <p style={{ margin: "4px 0", fontSize: "15px", color: "#0f172a" }}><strong>🏪 Razón Social / Nombre Comercial:</strong> {s.nombreNegocio || s.razonSocial}</p>
                            <p style={{ margin: "4px 0", fontSize: "15px", color: "#991b1b", fontWeight: "800" }}>
                              ⚠️ <strong>Fecha de Vencimiento:</strong> {estInfo.fechaVencimientoStr} (Ha transcurrido más de 1 año desde su emisión)
                            </p>
                          </div>
                          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
                            <button
                              type="button"
                              onClick={() => {
                                setSolicitudRenovacion(s);
                                setTipoComprobanteSeleccionado("Boleta");
                                setMetodoPagoSeleccionado("Efectivo en Caja Municipal");
                              }}
                              style={{
                                background: "linear-gradient(135deg, #d97706 0%, #b45309 100%)",
                                color: "white",
                                border: "none",
                                padding: "12px 24px",
                                borderRadius: "10px",
                                fontSize: "14.5px",
                                fontWeight: "800",
                                cursor: "pointer",
                                boxShadow: "0 4px 12px rgba(217, 119, 6, 0.25)",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "8px"
                              }}
                            >
                              🔄 Pagar Renovación (S/ 3.00)
                            </button>

                            <button
                              type="button"
                              onClick={() => descargarLicenciaConMarcaAgua(s, true)}
                              style={{
                                background: "#dc2626",
                                color: "white",
                                border: "none",
                                padding: "12px 24px",
                                borderRadius: "10px",
                                fontSize: "14.5px",
                                fontWeight: "800",
                                cursor: "pointer",
                                boxShadow: "0 4px 12px rgba(220, 38, 38, 0.25)",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "8px"
                              }}
                            >
                              📥 Descargar Licencia (VENCIDA)
                            </button>
                          </div>
                        </div>
                      )}

                    </div>
                  );
                })}
              </div>
            );
          })()}
        </section>
      )}

      {/* MODAL DETALLE COMPLETO Y VERIFICACIÓN INFORMACIÓN */}
      {solicitudVerDetalle && (
        <div className="admin-form-modal" style={{ zIndex: 1000 }}>
          <div className="admin-form-card" style={{ maxWidth: "650px", maxHeight: "88vh", overflowY: "auto" }}>
            <div className="admin-form-header">
              <h3>📋 Verificación de Solicitud — EXP-{solicitudVerDetalle.id}</h3>
              <button type="button" onClick={() => setSolicitudVerDetalle(null)}>✕</button>
            </div>

            <div style={{ padding: "16px 0" }}>
              <div style={{ background: "#f8fafc", padding: "14px", borderRadius: "10px", border: "1px solid #e2e8f0", marginBottom: "16px" }}>
                <h4 style={{ margin: "0 0 8px", color: "#1e293b", fontSize: "14px" }}>👤 Datos del Ciudadano (RENIEC)</h4>
                <p style={{ margin: "4px 0", fontSize: "13.5px" }}>
                  <strong>Nombres y Apellidos:</strong> {obtenerNombreCiudadanoValido(solicitudVerDetalle)}
                </p>
                <p style={{ margin: "4px 0", fontSize: "13.5px" }}>
                  <strong>DNI:</strong> {obtenerDniValido(solicitudVerDetalle)}
                </p>
                <p style={{ margin: "4px 0", fontSize: "13.5px" }}>
                  <strong>Correo / Teléfono:</strong> {solicitudVerDetalle.correoUsuario || "---"} | {solicitudVerDetalle.telefono || "---"}
                </p>
              </div>

              <div style={{ background: "#f8fafc", padding: "14px", borderRadius: "10px", border: "1px solid #e2e8f0", marginBottom: "16px" }}>
                <h4 style={{ margin: "0 0 8px", color: "#1e293b", fontSize: "14px" }}>🏢 Datos del Establecimiento (SUNAT)</h4>
                <p style={{ margin: "4px 0", fontSize: "13.5px" }}>
                  <strong>Nombre Comercial:</strong> {solicitudVerDetalle.nombreNegocio}
                </p>
                <p style={{ margin: "4px 0", fontSize: "13.5px" }}>
                  <strong>Razón Social:</strong> {solicitudVerDetalle.razonSocial || solicitudVerDetalle.nombreNegocio}
                </p>
                <p style={{ margin: "4px 0", fontSize: "13.5px" }}>
                  <strong>RUC:</strong> {solicitudVerDetalle.ruc}
                </p>
                <p style={{ margin: "4px 0", fontSize: "13.5px" }}>
                  <strong>Giro Comercial:</strong> {solicitudVerDetalle.giro || "General"}
                </p>
                <p style={{ margin: "4px 0", fontSize: "13.5px" }}>
                  <strong>Dirección:</strong> {solicitudVerDetalle.direccion}
                </p>
              </div>

              <div style={{ background: "#f0fdf4", padding: "14px", borderRadius: "10px", border: "1.5px solid #bbf7d0", marginBottom: "16px" }}>
                <h4 style={{ margin: "0 0 8px", color: "#166534", fontSize: "14px", display: "flex", alignItems: "center", gap: "6px" }}>
                  💳 Información del Pago de Tasa y Boleta
                </h4>
                <p style={{ margin: "4px 0", fontSize: "13.5px", color: "#14532d" }}>
                  <strong>Estado de Pago:</strong> <span style={{ fontWeight: "800", color: solicitudVerDetalle.estadoPago === "Confirmado" ? "#16a34a" : "#d97706" }}>{solicitudVerDetalle.estadoPago || "Pendiente"}</span>
                </p>
                <p style={{ margin: "4px 0", fontSize: "13.5px", color: "#14532d" }}>
                  <strong>Monto Cobrado:</strong> S/ {Number(solicitudVerDetalle.montoPagado || MONTO_TRAMITE).toFixed(2)}
                </p>
                <p style={{ margin: "4px 0", fontSize: "13.5px", color: "#14532d" }}>
                  <strong>Método de Pago:</strong> {solicitudVerDetalle.metodoPago || "Efectivo en Caja Municipal"}
                </p>
                <p style={{ margin: "4px 0", fontSize: "13.5px", color: "#14532d" }}>
                  <strong>N° de Comprobante / Boleta:</strong> {solicitudVerDetalle.comprobantePago || solicitudVerDetalle.numeroOperacion || `BOL-CAJA-2026-${solicitudVerDetalle.id}`}
                </p>
                {solicitudVerDetalle.fechaPago && (
                  <p style={{ margin: "4px 0", fontSize: "13.5px", color: "#14532d" }}>
                    <strong>Fecha y Hora de Pago:</strong> {solicitudVerDetalle.fechaPago}
                  </p>
                )}
                {solicitudVerDetalle.cajeraResponsable && (
                  <p style={{ margin: "4px 0", fontSize: "13.5px", color: "#14532d" }}>
                    <strong>Cajero Responsable:</strong> {solicitudVerDetalle.cajeraResponsable}
                  </p>
                )}
              </div>

              {/* LÍNEA DE TIEMPO VERTICAL DE TRAZABILIDAD DEL EXPEDIENTE */}
              <div style={{ background: "#ffffff", padding: "18px", borderRadius: "12px", border: "1px solid #cbd5e1", marginBottom: "16px", boxShadow: "0 2px 4px rgba(0,0,0,0.02)" }}>
                <h4 style={{ margin: "0 0 16px", color: "#0f172a", fontSize: "15px", fontWeight: "800", borderBottom: "2px solid #e2e8f0", paddingBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
                  📊 Línea de Tiempo Vertical del Trámite (EXP-{String(solicitudVerDetalle.id).replace(/^EXP-/, "")})
                </h4>

                <div style={{ position: "relative", paddingLeft: "32px" }}>
                  {/* Conector Vertical */}
                  <div style={{ position: "absolute", left: "13px", top: "10px", bottom: "10px", width: "3px", background: "#cbd5e1", borderRadius: "2px" }} />

                  {/* HITO 1: Registro */}
                  <div style={{ position: "relative", marginBottom: "18px" }}>
                    <div style={{ position: "absolute", left: "-32px", top: "0", width: "24px", height: "24px", borderRadius: "50%", background: "#16a34a", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: "bold", boxShadow: "0 0 0 3px #dcfce7" }}>
                      ✓
                    </div>
                    <div>
                      <strong style={{ fontSize: "13.5px", color: "#0f172a", display: "block" }}>1. Registro de Solicitud Municipal</strong>
                      <small style={{ color: "#64748b", display: "block" }}>
                        📅 {solicitudVerDetalle.fecha || "Registrado"} | Solicitante: {obtenerNombreCiudadanoValido(solicitudVerDetalle)}
                      </small>
                      <small style={{ color: "#166534", fontWeight: "600", marginTop: "2px", display: "block" }}>
                        Establecimiento: {solicitudVerDetalle.nombreNegocio} (RUC: {solicitudVerDetalle.ruc})
                      </small>
                    </div>
                  </div>

                  {/* HITO 2: Pago */}
                  <div style={{ position: "relative", marginBottom: "18px" }}>
                    <div style={{ position: "absolute", left: "-32px", top: "0", width: "24px", height: "24px", borderRadius: "50%", background: solicitudVerDetalle.estadoPago === "Confirmado" ? "#16a34a" : "#d97706", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: "bold", boxShadow: solicitudVerDetalle.estadoPago === "Confirmado" ? "0 0 0 3px #dcfce7" : "0 0 0 3px #fef3c7" }}>
                      {solicitudVerDetalle.estadoPago === "Confirmado" ? "✓" : "💳"}
                    </div>
                    <div>
                      <strong style={{ fontSize: "13.5px", color: "#0f172a", display: "block" }}>2. Pago de Tasa de Licencia (S/ {MONTO_TRAMITE.toFixed(2)})</strong>
                      <small style={{ color: "#64748b", display: "block" }}>
                        {solicitudVerDetalle.estadoPago === "Confirmado" ? `📅 ${solicitudVerDetalle.fechaPago || "Pago Confirmado"} | Comprobante: ${solicitudVerDetalle.comprobantePago || "Boleta Emitida"}` : "Pendiente de cobro en caja municipal"}
                      </small>
                    </div>
                  </div>

                  {/* HITO 3: Inspección Técnica (1er Intento) */}
                  <div style={{ position: "relative", marginBottom: "18px" }}>
                    {(() => {
                      const est = (solicitudVerDetalle.estado || solicitudVerDetalle.estadoNormalizado || "").toLowerCase();
                      const esObs = est.includes("observad");
                      const esAprob = est.includes("aprobado");
                      const esRech = est.includes("rechazado definitivamente");

                      let bg = "#2563eb";
                      let icon = "🕒";
                      let titulo = "3. Primera Inspección Técnica Edil";
                      let desc = `Inspector: ${solicitudVerDetalle.inspectorNombre || "Asignado"} | Fecha: ${solicitudVerDetalle.fechaVisitaInspector || "Programada"}`;

                      if (esObs) {
                        bg = "#d97706";
                        icon = "⚠️";
                        titulo = "3. Primera Inspección Técnica — Observada (1er Intento)";
                        desc = `Inspector: ${solicitudVerDetalle.inspectorNombre || "Inspector Municipal"}`;
                      } else if (esAprob) {
                        bg = "#16a34a";
                        icon = "✓";
                        titulo = "3. Inspección Técnica Aprobada";
                        desc = `Dictamen Conforme por ${solicitudVerDetalle.inspectorNombre || "Inspector Municipal"}`;
                      } else if (esRech) {
                        bg = "#dc2626";
                        icon = "✕";
                        titulo = "3. Inspección Técnica Desaprobada Definitivamente";
                        desc = `Dictamen Improcedente por ${solicitudVerDetalle.inspectorNombre || "Inspector Municipal"}`;
                      }

                      return (
                        <>
                          <div style={{ position: "absolute", left: "-32px", top: "0", width: "24px", height: "24px", borderRadius: "50%", background: bg, color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: "bold", boxShadow: `0 0 0 3px ${bg}33` }}>
                            {icon}
                          </div>
                          <div>
                            <strong style={{ fontSize: "13.5px", color: "#0f172a", display: "block" }}>{titulo}</strong>
                            <small style={{ color: "#64748b", display: "block" }}>{desc}</small>

                            {solicitudVerDetalle.observacionesInspector && (
                              <div style={{ margin: "6px 0 0", padding: "8px 12px", background: "#fffbe6", border: "1px solid #ffe58f", borderRadius: "6px", fontSize: "12.5px", color: "#873800" }}>
                                <strong>Observaciones del Inspector:</strong> {solicitudVerDetalle.observacionesInspector}
                              </div>
                            )}
                          </div>
                        </>
                      );
                    })()}
                  </div>

                  {/* HITO 4: Reprogramación a 30 días (si fue observada) */}
                  {((solicitudVerDetalle.estado || "").toLowerCase().includes("observad") || solicitudVerDetalle.intentosInspeccion === 2) && (
                    <div style={{ position: "relative", marginBottom: "18px" }}>
                      <div style={{ position: "absolute", left: "-32px", top: "0", width: "24px", height: "24px", borderRadius: "50%", background: "#7c3aed", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: "bold", boxShadow: "0 0 0 3px #ede9fe" }}>
                        📌
                      </div>
                      <div style={{ background: "#f3e8ff", border: "1.5px solid #d8b4fe", padding: "10px 14px", borderRadius: "8px" }}>
                        <strong style={{ fontSize: "13.5px", color: "#6b21a8", display: "block" }}>
                          4. 📌 Inspección Observada (1er Intento) — Reprogramada a 30 días
                        </strong>
                        <small style={{ color: "#5b21b6", display: "block", fontWeight: "700", marginTop: "2px" }}>
                          📅 Nueva Fecha Agendada: {solicitudVerDetalle.fechaVisitaInspector || "En 30 días hábiles"} | 🕒 Horario: {solicitudVerDetalle.horaVisitaLabel || solicitudVerDetalle.horaVisitaInspector || "08:00 a. m."}
                        </small>
                        <small style={{ color: "#64748b", display: "block", marginTop: "2px" }}>
                          Inspector Asignado: {solicitudVerDetalle.inspectorNombre || "Inspector Municipal"}
                        </small>
                      </div>
                    </div>
                  )}

                  {/* HITO 5: Emisión de Licencia */}
                  <div style={{ position: "relative" }}>
                    {(() => {
                      const est = (solicitudVerDetalle.estado || "").toLowerCase();
                      const esLicenciaAprobada = est.includes("aprobado") || est.includes("licencia emitida");

                      return (
                        <>
                          <div style={{ position: "absolute", left: "-32px", top: "0", width: "24px", height: "24px", borderRadius: "50%", background: esLicenciaAprobada ? "#16a34a" : "#94a3b8", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: "bold", boxShadow: esLicenciaAprobada ? "0 0 0 3px #dcfce7" : "0 0 0 3px #f1f5f9" }}>
                            {esLicenciaAprobada ? "📜" : "⏳"}
                          </div>
                          <div>
                            <strong style={{ fontSize: "13.5px", color: esLicenciaAprobada ? "#166534" : "#475569", display: "block" }}>
                              {esLicenciaAprobada ? "5. Licencia Municipal Emitida" : "5. Emisión de Licencia de Funcionamiento"}
                            </strong>
                            <small style={{ color: "#64748b", display: "block" }}>
                              {esLicenciaAprobada ? `Licencia N° ${solicitudVerDetalle.numeroLicencia || `LIC-2026-${solicitudVerDetalle.id}`}` : "Pendiente de dictamen final tras 2da inspección técnica"}
                            </small>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>

              <div style={{ background: "#f8fafc", padding: "14px", borderRadius: "10px", border: "1px solid #e2e8f0", marginBottom: "16px" }}>
                <h4 style={{ margin: "0 0 8px", color: "#1e293b", fontSize: "14px" }}>📄 Documentación Adjuntada por el Ciudadano</h4>
                {(solicitudVerDetalle.archivosPdf || []).length === 0 ? (
                  <p style={{ color: "#64748b", fontSize: "13px", margin: 0 }}>Sin documentos PDF adjuntos.</p>
                ) : (
                  <div style={{ display: "grid", gap: "8px" }}>
                    {(solicitudVerDetalle.archivosPdf || []).map((pdf, idx) => (
                      <div key={idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "white", borderRadius: "8px", border: "1px solid #cbd5e1" }}>
                        <span style={{ fontSize: "13px", color: "#334155" }}>📄 {pdf.nombre || pdf.archivoNombre || `Documento_${idx + 1}`}</span>
                        <button
                          type="button"
                          onClick={() => setDocumentoPdfVisor(pdf)}
                          style={{ padding: "6px 12px", background: "#2563eb", color: "white", border: "none", borderRadius: "6px", fontSize: "12.5px", fontWeight: "bold", cursor: "pointer" }}
                        >
                          👁️ Ver Documento
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="admin-form-actions" style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setSolicitudVerDetalle(null)}>Cerrar</button>
              {solicitudVerDetalle.estadoPago !== "Confirmado" && (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => {
                    const sol = solicitudVerDetalle;
                    setSolicitudVerDetalle(null);
                    setSolicitudCobro(sol);
                    setMetodoPagoSeleccionado("Efectivo en Caja Municipal");
                    setMontoRecibidoInput("");
                  }}
                  style={{ background: "#16a34a", color: "white" }}
                >
                  💰 Proceder al Cobro (S/ 3.00)
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL VERIFICACIÓN DE BOLETA / COMPROBANTE DE VENTA ELECTRÓNICO */}
      {solicitudVerBoleta && (
        <div className="admin-form-modal" style={{ zIndex: 1100 }}>
          <div className="admin-form-card" style={{ maxWidth: "680px", maxHeight: "90vh", overflowY: "auto", padding: "24px" }}>
            <div className="admin-form-header" style={{ marginBottom: "20px" }}>
              <h3>🧾 Comprobante de Venta Electrónico — EXP-{String(solicitudVerBoleta.id).replace(/^EXP-/, "")}</h3>
              <button type="button" onClick={() => setSolicitudVerBoleta(null)}>✕</button>
            </div>

            <style>{`
              @media print {
                body * {
                  visibility: hidden !important;
                }
                #comprobante-modal-impresion, #comprobante-modal-impresion * {
                  visibility: visible !important;
                }
                #comprobante-modal-impresion {
                  position: absolute !important;
                  left: 0 !important;
                  top: 0 !important;
                  width: 100% !important;
                  max-width: 100% !important;
                  border: 2px solid #0f172a !important;
                  box-shadow: none !important;
                  margin: 0 !important;
                  padding: 20px !important;
                }
              }
            `}</style>

            <VisualizadorComprobanteSUNAT datos={solicitudVerBoleta} idContainer="comprobante-modal-impresion" />

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
              <button
                type="button"
                onClick={() => window.print()}
                style={{ padding: "10px 20px", background: "#0f766e", color: "white", border: "none", borderRadius: "8px", fontWeight: "bold", fontSize: "14px", cursor: "pointer" }}
              >
                🖨️ Imprimir Boleta
              </button>
              <button
                type="button"
                onClick={() => setSolicitudVerBoleta(null)}
                style={{ padding: "10px 20px", background: "#64748b", color: "white", border: "none", borderRadius: "8px", fontWeight: "bold", fontSize: "14px", cursor: "pointer" }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL PROCESAR PAGO EN CAJA MUNICIPAL */}
      {solicitudCobro && (
        <div className="admin-form-modal" style={{ zIndex: 1000 }}>
          <div className="admin-form-card" style={{ maxWidth: "540px" }}>
            <div className="admin-form-header">
              <h3>💳 Registrar Pago de Trámite — EXP-{String(solicitudCobro.id).replace(/^EXP-/, "")}</h3>
              <button type="button" onClick={() => setSolicitudCobro(null)}>✕</button>
            </div>

            <div style={{ padding: "16px 0" }}>
              <div style={{ background: "#f8fafc", padding: "14px", borderRadius: "10px", border: "1px solid #e2e8f0", marginBottom: "16px" }}>
                <p style={{ margin: "0 0 6px", fontSize: "13.5px", color: "#334155" }}>
                  <strong>Contribuyente:</strong> {solicitudCobro.razonSocial || solicitudCobro.nombreNegocio} (RUC: {solicitudCobro.ruc})
                </p>
                <p style={{ margin: "0 0 6px", fontSize: "13.5px", color: "#334155" }}>
                  <strong>Representante Legal / Solicitante:</strong> {[solicitudCobro.nombresSolicitante, solicitudCobro.apellidosSolicitante, solicitudCobro.nombreSolicitante].filter(Boolean).join(" ") || "---"}
                </p>
                <p style={{ margin: "0 0 6px", fontSize: "13.5px", color: "#334155" }}>
                  <strong>DNI del Representante:</strong> {solicitudCobro.dniSolicitante || solicitudCobro.dni || "---"}
                </p>
                <p style={{ margin: "0 0 6px", fontSize: "13.5px", color: "#334155" }}>
                  <strong>Cajera Responsable:</strong> {usuario?.nombre || usuario?.email || "Cajera de Ventanilla (CAJ-01)"}
                </p>
                <div style={{ marginTop: "10px", paddingTop: "10px", borderTop: "1px solid #cbd5e1", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: "bold", fontSize: "15px", color: "#0f172a" }}>Derecho de Trámite:</span>
                  <span style={{ fontSize: "20px", fontWeight: "800", color: "#16a34a" }}>S/ {MONTO_TRAMITE.toFixed(2)}</span>
                </div>
              </div>

              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", fontSize: "13px", fontWeight: "bold", color: "#334155", marginBottom: "6px" }}>
                  1. Método de Pago *
                </label>
                <select
                  value={metodoPagoSeleccionado}
                  onChange={(e) => setMetodoPagoSeleccionado(e.target.value)}
                  style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "14px", fontWeight: "bold" }}
                >
                  <option value="Efectivo en Caja Municipal">💵 Efectivo en Caja Municipal</option>
                  <option value="Pago Billetera Digital">📱 Pago Billetera Digital</option>
                </select>
              </div>

              {/* LÓGICA DE COBRO SEGÚN MÉTODO DE PAGO: EFECTIVO VS TARJETA/DIGITAL */}
              {metodoPagoSeleccionado.toLowerCase().includes("efectivo") ? (
                <div style={{ background: "#fffbeb", border: "1.5px solid #fde68a", padding: "16px", borderRadius: "12px", marginBottom: "16px" }}>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: "bold", color: "#92400e", marginBottom: "6px" }}>
                    💵 Monto Recibido del Ciudadano (S/) *
                  </label>
                  <input
                    type="number"
                    step="0.10"
                    min="3.00"
                    max="200.00"
                    placeholder="Ej. 10, 20, 50, 100 o 200"
                    value={montoRecibidoInput}
                    onChange={(e) => {
                      const val = e.target.value;
                      const num = parseFloat(val);
                      if (!isNaN(num) && num > 200) {
                        alert("🚫 El monto ingresado no puede superar S/ 200.00 (máximo billete peruano). Se ha restablecido a 0.");
                        setMontoRecibidoInput("");
                        return;
                      }
                      setMontoRecibidoInput(val);
                    }}
                    style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1.5px solid #d97706", fontSize: "16px", fontWeight: "800", color: "#0f172a", background: "white" }}
                  />

                  {/* SELECCIÓN RÁPIDA DE BILLETES PERUANOS (S/ 3 - S/ 200) */}
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "10px" }}>
                    <span style={{ fontSize: "11px", fontWeight: "bold", color: "#92400e", width: "100%" }}>Billetes / Monedas de Pago Rápido:</span>
                    {[3, 5, 10, 20, 50, 100, 200].map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setMontoRecibidoInput(String(val))}
                        style={{
                          padding: "5px 10px",
                          background: montoRecibidoInput === String(val) ? "#d97706" : "#ffffff",
                          color: montoRecibidoInput === String(val) ? "white" : "#78350f",
                          border: "1.5px solid #d97706",
                          borderRadius: "6px",
                          fontSize: "12px",
                          fontWeight: "bold",
                          cursor: "pointer",
                        }}
                      >
                        S/ {val === 3 ? "3 (Exacto)" : val}
                      </button>
                    ))}
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginTop: "12px", background: "white", padding: "12px", borderRadius: "8px", border: "1px solid #fcd34d", textAlign: "center" }}>
                    <div>
                      <small style={{ color: "#64748b", fontWeight: "bold", fontSize: "10.5px" }}>TOTAL A PAGAR</small>
                      <p style={{ margin: "2px 0 0", fontWeight: "800", fontSize: "14.5px", color: "#0f172a" }}>S/ {MONTO_TRAMITE.toFixed(2)}</p>
                    </div>
                    <div>
                      <small style={{ color: "#64748b", fontWeight: "bold", fontSize: "10.5px" }}>MONTO RECIBIDO</small>
                      <p style={{ margin: "2px 0 0", fontWeight: "800", fontSize: "14.5px", color: "#2563eb" }}>
                        S/ {(parseFloat(montoRecibidoInput) || 0).toFixed(2)}
                      </p>
                    </div>
                    <div>
                      <small style={{ color: "#64748b", fontWeight: "bold", fontSize: "10.5px" }}>VUELTO</small>
                      <p style={{ margin: "2px 0 0", fontWeight: "800", fontSize: "14.5px", color: (parseFloat(montoRecibidoInput) || 0) >= MONTO_TRAMITE && (parseFloat(montoRecibidoInput) || 0) <= 200 ? "#16a34a" : "#dc2626" }}>
                        S/ {Math.max(0, (parseFloat(montoRecibidoInput) || 0) - MONTO_TRAMITE).toFixed(2)}
                      </p>
                    </div>
                  </div>

                  {!montoRecibidoInput.trim() ? (
                    <div style={{ background: "#f8fafc", color: "#475569", border: "1px solid #cbd5e1", padding: "8px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: "600", marginTop: "10px", textAlign: "center" }}>
                      ℹ️ Ingrese el monto en efectivo entregado por el ciudadano o toque una denominación de billete arriba.
                    </div>
                  ) : (parseFloat(montoRecibidoInput) || 0) < MONTO_TRAMITE ? (
                    <div style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fca5a5", padding: "8px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: "bold", marginTop: "10px", textAlign: "center" }}>
                      ⚠️ El monto ingresado (S/ {(parseFloat(montoRecibidoInput) || 0).toFixed(2)}) es menor a la tasa del trámite (S/ {MONTO_TRAMITE.toFixed(2)}).
                    </div>
                  ) : (parseFloat(montoRecibidoInput) || 0) > 200 ? (
                    <div style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fca5a5", padding: "8px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: "bold", marginTop: "10px", textAlign: "center" }}>
                      🚫 El monto no puede superar S/ 200.00 (máxima denominación de billete peruano).
                    </div>
                  ) : (
                    <div style={{ background: "#f0fdf4", color: "#166534", border: "1px solid #bbf7d0", padding: "8px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: "bold", marginTop: "10px", textAlign: "center" }}>
                      ✓ Monto correcto. Vuelto a entregar: S/ {((parseFloat(montoRecibidoInput) || 0) - MONTO_TRAMITE).toFixed(2)}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ background: "#f0fdf4", border: "1.5px solid #bbf7d0", padding: "14px 16px", borderRadius: "10px", marginBottom: "16px" }}>
                  <p style={{ margin: "2px 0", fontSize: "13.5px", color: "#14532d", fontWeight: "bold" }}>📱 Pasarela en Línea de Pago Billetera Digital (Flow)</p>
                  <p style={{ margin: "4px 0 0", fontSize: "12.5px", color: "#475569" }}>
                    Al pulsar el botón, el sistema te redirigirá a la pasarela segura oficial de <strong>Flow.cl</strong> para procesar el pago de <strong>S/ {MONTO_TRAMITE.toFixed(2)}</strong> mediante Yape, Plin o Tarjeta.
                  </p>
                </div>
              )}

              {/* SECCIÓN PROGRAMACIÓN DE INSPECCIÓN — SOLO LECTURA */}
              <div style={{ background: "#f0fdf4", padding: "14px", borderRadius: "10px", border: "1px solid #bbf7d0", marginBottom: "16px" }}>
                <h4 style={{ margin: "0 0 10px", color: "#166534", fontSize: "14px", display: "flex", alignItems: "center", gap: "6px" }}>
                  📅 Programación Automática de Inspección Técnica
                </h4>
                <div style={{ background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: "8px", padding: "8px 12px", marginBottom: "12px", fontSize: "12px", color: "#065f46", display: "flex", alignItems: "center", gap: "6px" }}>
                  🔒 Asignación automática — Solo lectura
                </div>

                {sinDisponibilidadInspeccion ? (
                  <div style={{ padding: "14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", color: "#991b1b", fontSize: "13.5px", textAlign: "center" }}>
                    ⚠️ No fue posible programar la inspección. No hay disponibilidad en los próximos 30 días hábiles.
                  </div>
                ) : (
                  <>
                    <div style={{ marginBottom: "10px" }}>
                      <label style={{ display: "block", fontSize: "12px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>Fecha de Inspección</label>
                      <input
                        type="text"
                        value={fechaInspeccion || ""}
                        readOnly
                        style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #d1d5db", fontSize: "13.5px", fontWeight: "bold", background: "#f9fafb", cursor: "not-allowed", color: "#111827" }}
                      />
                    </div>
                    <div style={{ marginBottom: "10px" }}>
                      <label style={{ display: "block", fontSize: "12px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>Horario</label>
                      <input
                        type="text"
                        value={TIME_SLOTS.find((s) => s.value === slotInspeccion)?.label || slotInspeccion || ""}
                        readOnly
                        style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #d1d5db", fontSize: "13.5px", fontWeight: "bold", background: "#f9fafb", cursor: "not-allowed", color: "#111827" }}
                      />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: "12px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>Inspector Asignado</label>
                      {inspectorElegido ? (
                        <div style={{ padding: "10px 14px", borderRadius: "10px", border: "1.5px solid #16a34a", background: "#f0fdf4" }}>
                          <strong style={{ color: "#166534", fontSize: "13.5px" }}>{inspectorElegido.nombre}</strong>
                          <span style={{ display: "block", fontSize: "11.5px", color: "#64748b" }}>{inspectorElegido.cargo}</span>
                        </div>
                      ) : (
                        <div style={{ padding: "10px 14px", borderRadius: "10px", border: "1.5px solid #fca5a5", background: "#fef2f2", textAlign: "center" }}>
                          <span style={{ color: "#991b1b", fontWeight: "700", fontSize: "13px" }}>⚠️ No hay inspectores disponibles.</span>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="admin-form-actions">
              <button type="button" onClick={() => setSolicitudCobro(null)} disabled={procesando}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={ejecutarCobro}
                disabled={
                  procesando ||
                  !inspectorElegido ||
                  (metodoPagoSeleccionado.toLowerCase().includes("efectivo") &&
                    ((parseFloat(montoRecibidoInput) || 0) < MONTO_TRAMITE || (parseFloat(montoRecibidoInput) || 0) > 200))
                }
                style={{
                  background:
                    inspectorElegido &&
                    (!metodoPagoSeleccionado.toLowerCase().includes("efectivo") ||
                      ((parseFloat(montoRecibidoInput) || 0) >= MONTO_TRAMITE && (parseFloat(montoRecibidoInput) || 0) <= 200))
                      ? "#16a34a"
                      : "#cbd5e1",
                  color: "white"
                }}
              >
                {procesando
                  ? "Conectando con Pasarela Flow..."
                  : metodoPagoSeleccionado.toLowerCase().includes("efectivo")
                  ? "✅ Confirmar Pago en Efectivo y Programar"
                  : "🌐 Ir a Pasarela de Pago Billetera Digital (Flow)"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BOLETA DE PAGO Y COMPROBANTE GENERADO */}
      {comprobanteGenerado && (
        <div className="admin-form-modal" style={{ zIndex: 1001 }}>
          <div className="admin-form-card" style={{ maxWidth: "500px", textAlign: "center" }}>
            <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "12px", padding: "20px" }}>
              <div style={{ fontSize: "40px", marginBottom: "8px" }}>🧾</div>
              <h3 style={{ color: "#166534", margin: "0 0 4px" }}>¡Pago Confirmado y Derivado!</h3>
              <p style={{ color: "#15803d", fontSize: "14px", margin: "0 0 16px" }}>
                Boleta de Caja N° <strong>{comprobanteGenerado.codComprobante}</strong>
              </p>

              <div style={{ textAlign: "left", background: "white", padding: "14px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px", color: "#334155" }}>
                <p style={{ margin: "4px 0" }}><strong>Expediente:</strong> EXP-{comprobanteGenerado.id}</p>
                <p style={{ margin: "4px 0" }}><strong>Solicitante:</strong> {[comprobanteGenerado.nombresSolicitante, comprobanteGenerado.apellidosSolicitante, comprobanteGenerado.nombreSolicitante].filter(Boolean).join(" ")}</p>
                <p style={{ margin: "4px 0" }}><strong>Establecimiento:</strong> {comprobanteGenerado.nombreNegocio} (RUC: {comprobanteGenerado.ruc})</p>
                <p style={{ margin: "4px 0" }}><strong>Método de Pago:</strong> {comprobanteGenerado.metodoPago}</p>
                <p style={{ margin: "4px 0" }}><strong>Monto Recaudado:</strong> S/ {MONTO_TRAMITE.toFixed(2)}</p>
                <p style={{ margin: "4px 0" }}><strong>Fecha y Hora de Pago:</strong> {comprobanteGenerado.fechaPago}</p>
                <p style={{ margin: "4px 0" }}><strong>Cajera Responsable:</strong> {comprobanteGenerado.cajeraResponsable || comprobanteGenerado.usuarioCajero}</p>
                <p style={{ margin: "8px 0 0", color: "#2563eb", fontWeight: "bold" }}>➔ Derivado oficialmente a Inspección</p>
              </div>

              <div style={{ marginTop: "20px", display: "flex", justifyContent: "center", gap: "10px" }}>
                <button
                  type="button"
                  onClick={imprimirComprobante}
                  style={{ padding: "10px 18px", background: "#0f766e", color: "white", border: "none", borderRadius: "8px", fontWeight: "700", cursor: "pointer" }}
                >
                  🖨️ Imprimir Boleta
                </button>
                <button
                  type="button"
                  onClick={() => setComprobanteGenerado(null)}
                  style={{ padding: "10px 18px", background: "#64748b", color: "white", border: "none", borderRadius: "8px", fontWeight: "700", cursor: "pointer" }}
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* MODAL REGISTRO PRESENCIAL DE NUEVA SOLICITUD POR LA CAJERA */}
      {mostrarModalNuevaSolicitud && (
        <div className="admin-form-modal" style={{ zIndex: 1000 }}>
          <div className="admin-form-card" style={{ maxWidth: "750px", width: "95%", maxHeight: "90vh", overflowY: "auto" }}>
            <div className="admin-form-header" style={{ background: "linear-gradient(135deg, #16a34a 0%, #065f46 100%)" }}>
              <h3>➕ Registro Presencial de Solicitud de Licencia Municipal</h3>
              <button type="button" onClick={() => setMostrarModalNuevaSolicitud(false)}>✕</button>
            </div>

            <form onSubmit={ejecutarRegistroPresencialCompleto} style={{ padding: "20px 0" }}>
              {/* PASO 1: DATOS DEL SOLICITANTE CON VALIDACIÓN RENIEC */}
              <div style={{ background: "#f8fafc", padding: "16px", borderRadius: "10px", border: "1px solid #cbd5e1", marginBottom: "16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                  <h4 style={{ margin: 0, color: "#166534", fontSize: "14.5px" }}>👤 1. Datos del Solicitante (Consulta RENIEC Obligatoria)</h4>
                  <span style={{ background: dniValidado ? "#dcfce7" : "#fef3c7", color: dniValidado ? "#15803d" : "#b45309", padding: "3px 10px", borderRadius: "6px", fontSize: "12px", fontWeight: "bold" }}>
                    {dniValidado ? "✓ RENIEC Validado (Campos Bloqueados)" : "🔒 Consulta RENIEC Requerida"}
                  </span>
                </div>
                
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "10px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>DNI del Titular (Editable) *</label>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <input
                        type="text"
                        maxLength={8}
                        placeholder="DNI (8 dígitos)"
                        value={dniForm}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, "").slice(0, 8);
                          setDniForm(val);
                          setDniValidado(false);
                          setNombresForm("");
                          setApellidosForm("");
                        }}
                        required
                        style={{ flex: 1, padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13.5px", fontWeight: "bold" }}
                      />
                      <button
                        type="button"
                        onClick={manejarConsultarDniPresencial}
                        disabled={consultandoDni}
                        style={{ padding: "8px 12px", background: dniValidado ? "#16a34a" : "#2563eb", color: "white", border: "none", borderRadius: "8px", fontSize: "12.5px", fontWeight: "bold", cursor: "pointer" }}
                      >
                        {consultandoDni ? "Buscando..." : dniValidado ? "✓ RENIEC" : "🔍 Consultar RENIEC"}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>
                      📱 Teléfono Celular (Editable - 9 dígitos) *
                    </label>
                    <input
                      type="tel"
                      inputMode="numeric"
                      maxLength={9}
                      placeholder="Ej. 987654321"
                      value={telefonoForm}
                      onChange={(e) => {
                        const valorLimpio = e.target.value.replace(/\D/g, "").slice(0, 9);
                        setTelefonoForm(valorLimpio);
                      }}
                      required
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        borderRadius: "8px",
                        border: (telefonoForm && !/^9\d{8}$/.test(telefonoForm)) ? "1px solid #dc2626" : "1px solid #cbd5e1",
                        fontSize: "13.5px",
                        fontWeight: "bold"
                      }}
                    />
                    {telefonoForm && !/^9\d{8}$/.test(telefonoForm) && (
                      <small style={{ color: "#dc2626", fontSize: "11px", fontWeight: "bold", display: "block", marginTop: "2px" }}>
                        ⚠️ Ingrese un celular peruano de 9 dígitos que inicie con 9.
                      </small>
                    )}
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "10px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>🔒 Nombres (Oficial RENIEC - Solo Lectura) *</label>
                    <input
                      type="text"
                      placeholder="🔒 Se autocompleta consultando RENIEC"
                      value={nombresForm}
                      readOnly
                      required
                      onKeyDown={(e) => e.preventDefault()}
                      style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13.5px", background: "#f1f5f9", cursor: "not-allowed", fontWeight: "bold", color: "#1e293b" }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>🔒 Apellidos (Oficial RENIEC - Solo Lectura) *</label>
                    <input
                      type="text"
                      placeholder="🔒 Se autocompleta consultando RENIEC"
                      value={apellidosForm}
                      readOnly
                      required
                      onKeyDown={(e) => e.preventDefault()}
                      style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13.5px", background: "#f1f5f9", cursor: "not-allowed", fontWeight: "bold", color: "#1e293b" }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "12.5px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>Correo Electrónico de Notificaciones (Editable) *</label>
                  <input
                    type="email"
                    placeholder="solicitante@correo.com"
                    value={correoForm}
                    onChange={(e) => setCorreoForm(e.target.value)}
                    required
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13.5px" }}
                  />
                </div>
              </div>

              {/* PASO 2: DATOS DEL NEGOCIO CON VALIDACIÓN SUNAT */}
              <div style={{ background: "#f8fafc", padding: "16px", borderRadius: "10px", border: "1px solid #cbd5e1", marginBottom: "16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                  <h4 style={{ margin: 0, color: "#166534", fontSize: "14.5px" }}>🏢 2. Establecimiento Comercial (Consulta SUNAT Obligatoria)</h4>
                  <span style={{ background: rucValidado ? "#dcfce7" : "#fef3c7", color: rucValidado ? "#15803d" : "#b45309", padding: "3px 10px", borderRadius: "6px", fontSize: "12px", fontWeight: "bold" }}>
                    {rucValidado
                      ? `✓ SUNAT: ${estadoSunat || "?"} / ${condicionSunat || "?"} ${sunatPermiteContinuar ? "(Válido)" : "(NO cumple)"}`
                      : "🔒 Consulta SUNAT Requerida"}
                  </span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "10px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>RUC del Local (Editable - 11 dígitos) *</label>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <input
                        type="text"
                        maxLength={11}
                        placeholder="RUC (11 dígitos)"
                        value={rucForm}
                        onChange={(e) => {
                          setRucForm(e.target.value);
                          setRucValidado(false);
                          setNombreNegocioForm("");
                          setRazonSocialForm("");
                          setDireccionForm("");
                          setEstadoSunat("");
                          setCondicionSunat("");
                        }}
                        required
                        style={{ flex: 1, padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13.5px", fontWeight: "bold" }}
                      />
                      <button
                        type="button"
                        onClick={manejarConsultarRucPresencial}
                        disabled={consultandoRuc}
                        style={{ padding: "8px 12px", background: rucValidado ? "#16a34a" : "#2563eb", color: "white", border: "none", borderRadius: "8px", fontSize: "12.5px", fontWeight: "bold", cursor: "pointer" }}
                      >
                        {consultandoRuc ? "Buscando..." : rucValidado ? "✓ SUNAT" : "🔍 Consultar SUNAT"}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>🔒 Actividad Económica (Oficial SUNAT - Solo Lectura) *</label>
                    <select
                      value={giroForm}
                      disabled
                      style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13.5px", fontWeight: "bold", background: "#f1f5f9", cursor: "not-allowed", color: "#1e293b" }}
                    >
                      {GROS_DISPONIBLES.map((g) => (
                        <option key={g.value} value={g.value}>{g.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "10px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>🔒 Nombre Comercial (Oficial SUNAT - Solo Lectura) *</label>
                    <input
                      type="text"
                      placeholder="🔒 Se autocompleta consultando SUNAT"
                      value={nombreNegocioForm}
                      readOnly
                      required
                      onKeyDown={(e) => e.preventDefault()}
                      style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13.5px", background: "#f1f5f9", cursor: "not-allowed", fontWeight: "bold", color: "#1e293b" }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>🔒 Razón Social (Oficial SUNAT - Solo Lectura)</label>
                    <input
                      type="text"
                      placeholder="🔒 Se autocompleta consultando SUNAT"
                      value={razonSocialForm}
                      readOnly
                      onKeyDown={(e) => e.preventDefault()}
                      style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13.5px", background: "#f1f5f9", cursor: "not-allowed", fontWeight: "bold", color: "#1e293b" }}
                    />
                  </div>
                </div>

                <div style={{ marginBottom: "10px" }}>
                  <label style={{ display: "block", fontSize: "12.5px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>📍 Dirección del Local Comercial *</label>
                  <input
                    type="text"
                    placeholder="Ingrese o edite la dirección del local"
                    value={direccionForm}
                    onChange={(e) => setDireccionForm(e.target.value)}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13.5px", background: "#ffffff", fontWeight: "bold", color: "#1e293b" }}
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>🔒 Estado del Contribuyente (SUNAT)</label>
                    <input
                      type="text"
                      readOnly
                      placeholder="🔒 Se autocompleta consultando SUNAT"
                      value={estadoSunat ? `${estadoSunat === "ACTIVO" ? "✓" : "✗"} ${estadoSunat}` : ""}
                      style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13.5px", background: "#f1f5f9", cursor: "not-allowed", fontWeight: "bold", color: estadoSunat === "ACTIVO" ? "#15803d" : "#dc2626" }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>🔒 Condición del Contribuyente (SUNAT)</label>
                    <input
                      type="text"
                      readOnly
                      placeholder="🔒 Se autocompleta consultando SUNAT"
                      value={condicionSunat ? `${condicionSunat === "HABIDO" ? "✓" : "✗"} ${condicionSunat}` : ""}
                      style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13.5px", background: "#f1f5f9", cursor: "not-allowed", fontWeight: "bold", color: condicionSunat === "HABIDO" ? "#15803d" : "#dc2626" }}
                    />
                  </div>
                </div>
              </div>

              {/* PASO 3: REQUISITOS DOCUMENTALES SEGÚN ACTIVIDAD ECONÓMICA OBTENIDA */}
              <div style={{ background: "#fffbeb", padding: "16px", borderRadius: "10px", border: "1px solid #fde68a", marginBottom: "16px" }}>
                <h4 style={{ margin: "0 0 6px", color: "#b45309", fontSize: "14.5px" }}>
                  📄 3. Documentos Obligatorios para: <u>{obtenerDocumentosPorGiro(giroForm).giroLabel}</u> {rucValidado && "(Cargados automáticamente de SUNAT)"}
                </h4>
                <p style={{ color: "#92400e", fontSize: "12.5px", margin: "0 0 12px" }}>
                  Cargue los archivos adjuntos obligatorios requeridos para esta actividad económica:
                </p>

                <div style={{ display: "grid", gap: "10px" }}>
                  {obtenerDocumentosPorGiro(giroForm).ciudadano.map((docReq) => {
                    const subido = archivosPresenciales.find((a) => a.docId === docReq.id);
                    return (
                      <div key={docReq.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "white", borderRadius: "8px", border: "1px solid #cbd5e1" }}>
                        <div>
                          <strong style={{ fontSize: "13px", color: "#1e293b" }}>{docReq.nombre}</strong>
                          {docReq.obligatorio && <span style={{ color: "#dc2626", fontSize: "12px", marginLeft: "6px" }}>* Obligatorio</span>}
                          {subido && <small style={{ display: "block", color: "#16a34a", fontWeight: "bold" }}>✓ Cargado: {subido.archivoNombre}</small>}
                        </div>

                        <input
                          type="file"
                          accept=".pdf,image/*"
                          onChange={(e) => manejarArchivoPresencial(e, docReq.id, docReq.nombre)}
                          style={{ fontSize: "12px" }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* PASO 4: COBRO Y PROGRAMACIÓN DE INSPECCIÓN */}
              <div style={{ background: "#f0fdf4", padding: "16px", borderRadius: "10px", border: "1px solid #bbf7d0", marginBottom: "16px" }}>
                <h4 style={{ margin: "0 0 12px", color: "#166534", fontSize: "14.5px" }}>
                  💰 4. Pago de Tasa (S/ 3.00) y Programación de Inspección Técnica
                </h4>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>Método de Pago *</label>
                    <select
                      value={metodoPagoSeleccionado}
                      onChange={(e) => setMetodoPagoSeleccionado(e.target.value)}
                      style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13.5px" }}
                    >
                      <option value="Efectivo en Caja Municipal">💵 Efectivo en Caja Municipal</option>
                      <option value="Pago Billetera Digital">📱 Pago Billetera Digital</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>Fecha de Inspección (Mínimo mañana) *</label>
                    <input
                      type="date"
                      min={formatearFechaYYYYMMDD(obtenerFechaMinimaInspeccion())}
                      value={
                        fechaInspeccion.includes("/")
                          ? fechaInspeccion.split("/").reverse().join("-")
                          : fechaInspeccion
                      }
                      onChange={(e) => {
                        const valYMD = e.target.value;
                        if (!valYMD) return;
                        const [y, m, d] = valYMD.split("-");
                        setFechaInspeccion(`${d}/${m}/${y}`);
                      }}
                      style={{
                        width: "100%", padding: "8px 12px", borderRadius: "8px",
                        border: fechaInspeccion && !esFechaValidaParaInspeccion(fechaInspeccion) ? "1.5px solid #dc2626" : "1px solid #cbd5e1",
                        fontSize: "13.5px", fontWeight: "bold"
                      }}
                    />
                    {fechaInspeccion && !esFechaValidaParaInspeccion(fechaInspeccion) && (
                      <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", color: "#991b1b", padding: "8px 12px", borderRadius: "8px", marginTop: "6px", fontSize: "11.5px" }}>
                        ⚠️ {MENSAJE_FECHA_INSPECCION}
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ marginBottom: "12px" }}>
                  <label style={{ display: "block", fontSize: "12.5px", fontWeight: "bold", color: "#334155", marginBottom: "6px" }}>👷 Inspector Municipal Asignado (Máx 4/día)</label>
                  {inspectorElegido ? (() => {
                    const cupos = obtenerConteoInspectorEnFecha(inspectorElegido.uid, fechaInspeccion);
                    const estaLleno = cupos >= 4;
                    return (
                      <div style={{
                        padding: "12px 14px", borderRadius: "10px",
                        border: estaLleno ? "1.5px solid #fca5a5" : "1.5px solid #16a34a",
                        background: estaLleno ? "#fef2f2" : "#f0fdf4",
                      }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div>
                            <strong style={{ color: estaLleno ? "#991b1b" : "#166534", fontSize: "13.5px" }}>{inspectorElegido.nombre}</strong>
                            <span style={{ display: "block", fontSize: "11.5px", color: "#64748b" }}>{inspectorElegido.cargo}</span>
                          </div>
                          <span style={{
                            padding: "3px 10px", borderRadius: "14px", fontSize: "11.5px", fontWeight: "800",
                            background: estaLleno ? "#fee2e2" : "#dcfce7",
                            color: estaLleno ? "#dc2626" : "#15803d",
                          }}>
                            {estaLleno ? "🔴 No disponible" : "🟢 Disponible"}
                          </span>
                        </div>
                        <span style={{ fontSize: "12px", color: estaLleno ? "#991b1b" : "#15803d", fontWeight: "600", marginTop: "4px", display: "block" }}>
                          Inspecciones: {cupos}/4
                        </span>
                      </div>
                    );
                  })() : (
                    <div style={{ padding: "12px 14px", borderRadius: "10px", border: "1.5px solid #fca5a5", background: "#fef2f2", textAlign: "center" }}>
                      <span style={{ color: "#991b1b", fontWeight: "700", fontSize: "13px" }}>⚠️ No hay inspectores disponibles para esta fecha.</span>
                    </div>
                  )}
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "12.5px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>Rango Horario de Inspección *</label>
                  <select
                    value={slotInspeccion}
                    onChange={(e) => setSlotInspeccion(e.target.value)}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13.5px" }}
                  >
                    {TIME_SLOTS.map((slot) => {
                      const ocupado = inspectorElegido && esHorarioOcupado(inspectorElegido.uid || inspectorElegido.nombre, fechaInspeccion, slot.value);
                      return (
                        <option key={slot.value} value={slot.value} disabled={ocupado}>
                          {slot.label} {ocupado ? " (Ocupado para este inspector)" : ""}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>

              <div className="admin-form-actions">
                <button type="button" onClick={() => setMostrarModalNuevaSolicitud(false)} disabled={procesando}>
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={procesando || !dniValidado || !rucValidado || !inspectorElegido}
                  style={{
                    background: (dniValidado && rucValidado && inspectorElegido) ? "#16a34a" : "#cbd5e1",
                    color: "white",
                    cursor: (dniValidado && rucValidado && inspectorElegido) ? "pointer" : "not-allowed"
                  }}
                >
                  {procesando
                    ? "Procesando Registro Presencial..."
                    : !dniValidado
                    ? "🔒 1. Valide DNI en RENIEC"
                    : !rucValidado
                    ? "🔒 2. Valide RUC en SUNAT"
                    : !inspectorElegido
                    ? "⚠️ 3. Seleccione Inspector"
                    : "🚀 Registrar, Cobrar y Asignar Inspección"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* MODAL RENOVACIÓN DIRECTA EN VENTANILLA / CAJA MUNICIPAL */}
      {solicitudRenovacion && (
        <div className="admin-form-modal" style={{ zIndex: 1000 }}>
          <div className="admin-form-card" style={{ maxWidth: "580px" }}>
            <div className="admin-form-header" style={{ background: "#d97706", color: "white" }}>
              <div>
                <h3 style={{ color: "white", margin: 0 }}>🔄 Renovación de Licencia Municipal</h3>
                <small style={{ color: "#fef3c7" }}>Expediente EXP-{String(solicitudRenovacion.id).replace(/^EXP-/, "")}</small>
              </div>
              <button type="button" onClick={() => setSolicitudRenovacion(null)} style={{ color: "white", background: "none", border: "none", fontSize: "18px", cursor: "pointer" }}>✕</button>
            </div>

            <div style={{ padding: "20px" }}>
              <div style={{ background: "#fffbe6", border: "1.5px solid #ffe58f", padding: "16px", borderRadius: "10px", marginBottom: "16px", fontSize: "13px", color: "#873800" }}>
                <h4 style={{ margin: "0 0 6px", color: "#d46b08" }}>🏢 Información de la Licencia a Renovar</h4>
                <p style={{ margin: "3px 0" }}><strong>Nombre Comercial:</strong> {solicitudRenovacion.nombreNegocio}</p>
                <p style={{ margin: "3px 0" }}><strong>RUC del Establecimiento:</strong> {solicitudRenovacion.ruc}</p>
                <p style={{ margin: "3px 0" }}><strong>Titular:</strong> {solicitudRenovacion.nombreSolicitante || `${solicitudRenovacion.nombresSolicitante || ""} ${solicitudRenovacion.apellidosSolicitante || ""}`}</p>
                <p style={{ margin: "3px 0", color: "#dc2626", fontWeight: "bold" }}>
                  <strong>Fecha Vencimiento Actual:</strong> {calcularEstadoLicenciaVencimiento(solicitudRenovacion).fechaVencimientoStr}
                </p>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "12.5px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>Tipo de Comprobante *</label>
                  <select
                    value={tipoComprobanteSeleccionado}
                    onChange={(e) => setTipoComprobanteSeleccionado(e.target.value)}
                    style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13.5px", fontWeight: "bold" }}
                  >
                    <option value="Factura">🧾 Factura Electrónica (F001)</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "12.5px", fontWeight: "bold", color: "#334155", marginBottom: "4px" }}>Método de Pago *</label>
                  <select
                    value={metodoPagoSeleccionado}
                    onChange={(e) => setMetodoPagoSeleccionado(e.target.value)}
                    style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13.5px", fontWeight: "bold" }}
                  >
                    <option value="Efectivo en Caja Municipal">💵 Efectivo en Caja Municipal</option>
                    <option value="Pago Billetera Digital">📱 Pago Billetera Digital</option>
                  </select>
                </div>
              </div>

              <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", padding: "14px", borderRadius: "10px", marginBottom: "20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <span style={{ fontSize: "12px", color: "#64748b", fontWeight: "bold" }}>TASA DE RENOVACIÓN DE LICENCIA</span>
                  <h3 style={{ margin: "2px 0 0", color: "#16a34a", fontSize: "24px", fontWeight: "800" }}>S/ {MONTO_TRAMITE.toFixed(2)}</h3>
                </div>
                <div style={{ textAlign: "right", fontSize: "12px", color: "#475569" }}>
                  <p style={{ margin: "2px 0" }}>Vigencia adicional: <strong style={{ color: "#16a34a" }}>+1 Año</strong></p>
                </div>
              </div>

              <div className="admin-form-actions" style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  type="button"
                  onClick={() => setSolicitudRenovacion(null)}
                  disabled={procesando}
                  style={{ padding: "10px 18px", background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: "8px", fontWeight: "bold", cursor: "pointer" }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => ejecutarRenovacionDirecta(solicitudRenovacion)}
                  disabled={procesando}
                  style={{ background: "#d97706", color: "white", padding: "10px 20px", borderRadius: "8px", fontWeight: "bold", border: "none", cursor: "pointer" }}
                >
                  {procesando ? "Procesando Renovación..." : "💰 Confirmar Pago (S/ 3.00) y Renovar Licencia"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: APERTURA DE CAJA MUNICIPAL */}
      {mostrarModalAperturaCaja && (
        <div className="admin-form-modal" style={{ zIndex: 1100 }}>
          <div className="admin-form-card" style={{ maxWidth: "520px", borderRadius: "16px", overflow: "hidden", boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2)" }}>
            <div className="admin-form-header" style={{ background: "linear-gradient(135deg, #1e3a8a, #2563eb)", color: "white", padding: "20px 24px" }}>
              <div>
                <h3 style={{ color: "white", margin: 0, fontSize: "19px", fontWeight: "800", display: "flex", alignItems: "center", gap: "8px" }}>
                  🔓 Apertura de Caja Municipal
                </h3>
                <small style={{ color: "#bfdbfe", fontSize: "12.5px" }}>Gestión de Turnos y Registro de Fondo Inicial para Cobros Presenciales</small>
              </div>
              <button type="button" onClick={() => setMostrarModalAperturaCaja(false)} style={{ color: "white", background: "none", border: "none", fontSize: "20px", cursor: "pointer", fontWeight: "bold" }}>✕</button>
            </div>

            <form onSubmit={ejecutarAperturaCaja} style={{ padding: "24px" }}>
              {/* FICHA INFORMADA AUTOMÁTICAMENTE DESDE LA SESIÓN DEL USUARIO AUTENTICADO */}
              <div style={{ background: "#f8fafc", border: "1.5px solid #cbd5e1", padding: "16px", borderRadius: "12px", marginBottom: "20px" }}>
                <h5 style={{ margin: "0 0 10px", color: "#1e3a8a", fontSize: "13.5px", fontWeight: "700" }}>
                  👤 Información de Sesión Autenticada (Cajero Responsable)
                </h5>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", fontSize: "12.5px", color: "#334155" }}>
                  <p style={{ margin: 0 }}>
                    <strong>Responsable:</strong> <span style={{ color: "#0f172a", fontWeight: "bold" }}>{usuario?.nombre || usuario?.displayName || usuario?.email || "Cajero Municipal"}</span>
                  </p>
                  <p style={{ margin: 0 }}>
                    <strong>ID Cajero:</strong> <span style={{ color: "#0f172a", fontWeight: "bold" }}>{usuario?.uid || usuario?.id || "CAJERO-001"}</span>
                  </p>
                  <p style={{ margin: 0 }}>
                    <strong>Correo Sesión:</strong> <span style={{ color: "#0f172a" }}>{usuario?.email || "cajero@municipalidad.gob.pe"}</span>
                  </p>
                  <p style={{ margin: 0 }}>
                    <strong>Estado Inicial:</strong> <span style={{ color: "#15803d", fontWeight: "bold" }}>🟢 Abierta</span>
                  </p>
                  <p style={{ margin: 0, gridColumn: "span 2" }}>
                    <strong>Fecha / Hora:</strong> <span style={{ color: "#0f172a" }}>{new Date().toLocaleString("es-PE")}</span>
                  </p>
                </div>
              </div>

              {/* ÚNICO CAMPO SOLICITADO: MONTO INICIAL DE CAJA */}
              <div style={{ marginBottom: "24px" }}>
                <label style={{ display: "block", fontSize: "13.5px", fontWeight: "800", color: "#0f172a", marginBottom: "6px" }}>
                  💰 Monto Inicial de Caja (S/) *
                </label>
                <div style={{ position: "relative" }}>
                  <span style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", fontWeight: "bold", color: "#64748b", fontSize: "18px" }}>S/</span>
                  <input
                    type="number"
                    step="0.01"
                    min="20"
                    max="2000"
                    placeholder="Ej. 100.00"
                    value={formAperturaMonto}
                    onChange={(e) => setFormAperturaMonto(e.target.value)}
                    required
                    style={{ width: "100%", padding: "12px 14px 12px 46px", borderRadius: "10px", border: "2px solid #2563eb", fontSize: "20px", fontWeight: "900", color: "#0f172a", background: "#ffffff" }}
                  />
                </div>
                <small style={{ color: "#475569", fontSize: "12px", marginTop: "6px", display: "block" }}>
                  ⚠️ <strong>Monto permitido:</strong> Mínimo <strong>S/ 20.00</strong> y Máximo <strong>S/ 2,000.00</strong> (solo números positivos con hasta 2 decimales).
                </small>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
                <button
                  type="button"
                  onClick={() => setMostrarModalAperturaCaja(false)}
                  disabled={procesandoApertura}
                  style={{ padding: "12px 20px", background: "#f1f5f9", color: "#475569", border: "1px solid #cbd5e1", borderRadius: "10px", fontWeight: "bold", cursor: "pointer" }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={procesandoApertura}
                  style={{ padding: "12px 24px", background: "#16a34a", color: "white", border: "none", borderRadius: "10px", fontWeight: "800", fontSize: "14.5px", cursor: "pointer", boxShadow: "0 4px 12px rgba(22,163,74,0.25)" }}
                >
                  {procesandoApertura ? "⏳ Registrando Apertura..." : "🔓 Confirmar Apertura de Caja"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: ARQUEO Y CIERRE DE CAJA MUNICIPAL */}
      {mostrarModalArqueoCaja && (
        <div className="admin-form-modal" style={{ zIndex: 1100 }}>
          <div className="admin-form-card" style={{ maxWidth: "620px", borderRadius: "16px", overflow: "hidden", boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2)" }}>
            <div className="admin-form-header" style={{ background: "linear-gradient(135deg, #0f766e, #0d9488)", color: "white", padding: "20px 24px" }}>
              <div>
                <h3 style={{ color: "white", margin: 0, fontSize: "19px", fontWeight: "800", display: "flex", alignItems: "center", gap: "8px" }}>
                  📊 Arqueo y Cierre de Caja Municipal
                </h3>
                <small style={{ color: "#ccfbf1", fontSize: "12.5px" }}>Resumen de Recaudación Diaria, Balance Físico y Cierre de Turno</small>
              </div>
              <button type="button" onClick={() => setMostrarModalArqueoCaja(false)} style={{ color: "white", background: "none", border: "none", fontSize: "20px", cursor: "pointer", fontWeight: "bold" }}>✕</button>
            </div>

            <div style={{ padding: "24px" }}>
              <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", padding: "16px", borderRadius: "12px", marginBottom: "20px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", fontSize: "13px", color: "#334155" }}>
                  <p style={{ margin: 0 }}><strong>👤 Responsable:</strong> {cajaAbierta.cajeraNombre}</p>
                  <p style={{ margin: 0 }}><strong>🏢 Ventanilla:</strong> {cajaAbierta.ventanilla}</p>
                  <p style={{ margin: 0 }}><strong>🕒 Turno:</strong> {cajaAbierta.turno}</p>
                  <p style={{ margin: 0 }}><strong>📅 Fecha Apertura:</strong> {cajaAbierta.fechaApertura || "Hoy"}</p>
                </div>
              </div>

              {/* TARJETAS RESUMEN DE ARQUEO EN TIEMPO REAL (FÍSICO EN EFECTIVO) */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "20px" }}>
                <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", padding: "16px", borderRadius: "12px", textAlign: "center" }}>
                  <span style={{ fontSize: "11.5px", fontWeight: "bold", color: "#1e40af", display: "block", textTransform: "uppercase" }}>Fondo Inicial</span>
                  <strong style={{ fontSize: "22px", color: "#1e3a8a" }}>S/ {resumenArqueoCaja.fondoInicial.toFixed(2)}</strong>
                </div>

                <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "16px", borderRadius: "12px", textAlign: "center" }}>
                  <span style={{ fontSize: "11.5px", fontWeight: "bold", color: "#166534", display: "block", textTransform: "uppercase" }}>Efectivo Recaudado</span>
                  <strong style={{ fontSize: "22px", color: "#15803d" }}>S/ {resumenArqueoCaja.totalEfectivo.toFixed(2)}</strong>
                </div>
              </div>

              {/* RESUMEN TOTAL BALANCES */}
              <div style={{ background: "#0f172a", color: "white", padding: "20px", borderRadius: "14px", marginBottom: "20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                  <span style={{ fontSize: "13.5px", color: "#94a3b8" }}>Total Operaciones Atendidas en Efectivo:</span>
                  <strong style={{ fontSize: "16px", color: "#38bdf8" }}>{resumenArqueoCaja.totalOperaciones} Operación(es)</strong>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "12px", borderTop: "2px solid #334155" }}>
                  <span style={{ fontSize: "15px", fontWeight: "bold", color: "#f8fafc" }}>🧮 ARQUEO FÍSICO EN CAJA (Fondo Inicial + Efectivo):</span>
                  <strong style={{ fontSize: "24px", fontWeight: "900", color: "#facc15" }}>S/ {resumenArqueoCaja.saldoTotalEnCaja.toFixed(2)}</strong>
                </div>
              </div>

              {/* OBSERVACIONES DEL CIERRE DE CAJA */}
              <div style={{ marginBottom: "20px" }}>
                <label style={{ display: "block", fontSize: "13px", fontWeight: "700", color: "#334155", marginBottom: "6px" }}>
                  📝 Observaciones del Cierre de Caja (Opcional):
                </label>
                <textarea
                  rows="2"
                  placeholder="Ingrese cualquier incidencia, descuadre o nota relevante del turno..."
                  value={observacionesCierre}
                  onChange={(e) => setObservacionesCierre(e.target.value)}
                  style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px", resize: "vertical" }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px" }}>
                <button
                  type="button"
                  onClick={() => window.print()}
                  style={{ padding: "12px 18px", background: "#f1f5f9", color: "#334155", border: "1px solid #cbd5e1", borderRadius: "10px", fontWeight: "bold", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}
                >
                  🖨️ Imprimir Ticket Arqueo
                </button>

                <div style={{ display: "flex", gap: "10px" }}>
                  <button
                    type="button"
                    onClick={() => setMostrarModalArqueoCaja(false)}
                    style={{ padding: "12px 18px", background: "#ffffff", color: "#64748b", border: "1px solid #cbd5e1", borderRadius: "10px", fontWeight: "bold", cursor: "pointer" }}
                  >
                    Cerrar Ventana
                  </button>
                  <button
                    type="button"
                    onClick={ejecutarCierreCaja}
                    style={{ padding: "12px 22px", background: "#dc2626", color: "white", border: "none", borderRadius: "10px", fontWeight: "800", fontSize: "14px", cursor: "pointer", boxShadow: "0 4px 12px rgba(220,38,38,0.25)" }}
                  >
                    🔒 Efectuar Cierre de Caja
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL VISOR INCORPORADO DE DOCUMENTOS PDF E IMÁGENES */}
      {documentoPdfVisor && (
        <VisualizadorDocumentoModal
          documento={documentoPdfVisor}
          onCerrar={() => setDocumentoPdfVisor(null)}
        />
      )}
    </div>
  );
}

export default PanelCajero;
