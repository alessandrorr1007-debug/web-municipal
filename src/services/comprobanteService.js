import { db } from "../firebase";
import {
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  where,
  orderBy,
} from "firebase/firestore";
import jsPDF from "jspdf";

const COLLECTION = "comprobantes_pago";

const generarSerie = (tipo) => {
  return tipo === "boleta" ? "B001" : "F001";
};

const generarNumero = () => {
  const count = parseInt(localStorage.getItem("comprobante_count") || "0", 10) + 1;
  localStorage.setItem("comprobante_count", count.toString());
  return count.toString().padStart(8, "0");
};

const generarCodigoQR = (datos) => {
  const texto = `COMPROBANTE ${datos.tipo} | Serie: ${datos.serie}-${datos.numero} | Solicitud: ${datos.idSolicitud} | Monto: S/${datos.monto} | Fecha: ${datos.fechaEmision}`;
  return `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(texto)}`;
};

export const generarComprobante = async ({
  uidUsuario,
  correoUsuario,
  idSolicitud,
  tipo,
  dniCliente,
  rucCliente,
  razonSocial,
  descripcionPago,
  monto,
  metodoPago,
  estadoPago,
}) => {
  const serie = generarSerie(tipo);
  const numero = generarNumero();
  const fechaEmision = new Date().toLocaleDateString("es-PE");
  const horaEmision = new Date().toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
  const codigoQr = generarCodigoQR({ tipo, serie, numero, idSolicitud, monto, fechaEmision });
  const codigoUnico = `${serie}-${numero}`;

  const comprobante = {
    id_comprobante: `${uidUsuario}_${idSolicitud}_${Date.now()}`,
    id_usuario: uidUsuario,
    correo_usuario: correoUsuario,
    id_solicitud: idSolicitud,
    tipo_comprobante: tipo,
    serie,
    numero,
    codigo_unico: codigoUnico,
    dni_cliente: dniCliente || "",
    ruc_cliente: rucCliente || "",
    razon_social: razonSocial || "",
    descripcion_pago: descripcionPago || "Pago por derecho de trámite de licencia de funcionamiento",
    monto,
    metodo_pago: metodoPago,
    fecha_emision: fechaEmision,
    hora_emision: horaEmision,
    fecha_pago: fechaEmision,
    estado: estadoPago || "Pagado",
    codigo_qr: codigoQr,
  };

  await setDoc(doc(db, COLLECTION, comprobante.id_comprobante), comprobante);

  console.log("[COMPROBANTE] Guardado:", comprobante.id_comprobante);
  return comprobante;
};

export const obtenerComprobantesPorUsuario = async (uidUsuario) => {
  if (!uidUsuario) return [];
  const q = query(
    collection(db, COLLECTION),
    where("id_usuario", "==", uidUsuario),
    orderBy("fecha_emision", "desc")
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
};

export const obtenerComprobantePorId = async (idComprobante) => {
  if (!idComprobante) return null;
  const q = query(collection(db, COLLECTION), where("id_comprobante", "==", idComprobante));
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;
  return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
};

export const generarPdfComprobante = (comprobante) => {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 18;
  let y = 15;

  const esBoleta = comprobante.tipo_comprobante === "boleta";
  const tipoTitulo = esBoleta ? "BOLETA DE VENTA ELECTRÓNICA" : "FACTURA ELECTRÓNICA";
  const serieNumero = `${comprobante.serie}-${comprobante.numero}`;

  // === ENCABEZADO ===
  doc.setFillColor(31, 59, 87);
  doc.rect(0, 0, pageWidth, 38, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("MUNICIPALIDAD DE TRUJILLO", pageWidth / 2, 14, { align: "center" });

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("RUC: 20456789012 | Jr. San Martín 328, Trujillo - La Libertad", pageWidth / 2, 21, { align: "center" });
  doc.text("Tel: (044) 231234 | Email: webmunicipal01@gmail.com", pageWidth / 2, 26, { align: "center" });

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(tipoTitulo, pageWidth / 2, 35, { align: "center" });

  y = 48;

  // === SERIE Y NÚMERO ===
  doc.setDrawColor(31, 59, 87);
  doc.setLineWidth(0.5);
  doc.roundedRect(pageWidth - margin - 55, y - 2, 55, 14, 2, 2, "S");
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text("SERIE - NÚMERO", pageWidth - margin - 27.5, y + 2, { align: "center" });
  doc.setFontSize(12);
  doc.setTextColor(31, 59, 87);
  doc.setFont("helvetica", "bold");
  doc.text(serieNumero, pageWidth - margin - 27.5, y + 9, { align: "center" });

  y += 20;

  // === DATOS DEL CLIENTE ===
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margin, y, pageWidth - margin * 2, esBoleta ? 22 : 30, 2, 2, "F");
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(31, 59, 87);
  doc.text(esBoleta ? "DATOS DEL CLIENTE (BOLETA)" : "DATOS DEL CLIENTE (FACTURA)", margin + 6, y + 8);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);

  if (esBoleta) {
    doc.text(`DNI: ${comprobante.dni_cliente || "No registrado"}`, margin + 6, y + 15);
    doc.text(`Nombres: ${comprobante.razon_social || "No registrado"}`, margin + 6, y + 20);
  } else {
    doc.text(`RUC: ${comprobante.ruc_cliente || "No registrado"}`, margin + 6, y + 15);
    doc.text(`Razón Social: ${comprobante.razon_social || "No registrado"}`, margin + 6, y + 20);
    doc.text(`Dirección fiscal: ${comprobante.ruc_cliente ? "Trujillo - La Libertad" : "No registrado"}`, margin + 6, y + 25);
  }

  y += esBoleta ? 30 : 38;

  // === DETALLE DEL PAGO ===
  doc.setFillColor(31, 59, 87);
  doc.rect(margin, y, pageWidth - margin * 2, 10, "F");
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  const colDesc = margin + 6;
  const colCant = margin + 110;
  const colPrec = margin + 135;
  const colTotal = pageWidth - margin - 6;
  doc.text("DESCRIPCIÓN", colDesc, y + 7);
  doc.text("CANT.", colCant, y + 7);
  doc.text("P. UNIT.", colPrec, y + 7);
  doc.text("TOTAL", colTotal, y + 7, { align: "right" });

  y += 10;

  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageWidth - margin, y);

  y += 7;
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(comprobante.descripcion_pago || "Pago por derecho de trámite", colDesc, y);
  doc.text("1", colCant, y);
  doc.text(`S/${Number(comprobante.monto).toFixed(2)}`, colPrec, y);
  doc.setFont("helvetica", "bold");
  doc.text(`S/${Number(comprobante.monto).toFixed(2)}`, colTotal, y, { align: "right" });

  y += 5;
  doc.setDrawColor(226, 232, 240);
  doc.line(margin, y, pageWidth - margin, y);

  y += 8;
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(31, 59, 87);
  doc.text(`TOTAL: S/${Number(comprobante.monto).toFixed(2)}`, colTotal, y, { align: "right" });

  y += 16;

  // === DATOS DEL PAGO ===
  doc.setFillColor(240, 253, 244);
  doc.roundedRect(margin, y, pageWidth - margin * 2, 36, 2, 2, "F");
  doc.setDrawColor(134, 239, 172);
  doc.roundedRect(margin, y, pageWidth - margin * 2, 36, 2, 2, "S");

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(22, 101, 52);
  doc.text("DATOS DEL PAGO", margin + 6, y + 9);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);

  const xCol1 = margin + 6;
  const xCol2 = margin + (pageWidth - margin * 2) / 2 + 4;

  doc.text(`Serie - Número: ${serieNumero}`, xCol1, y + 17);
  doc.text(`Fecha emisión: ${comprobante.fecha_emision || "N/A"}`, xCol1, y + 23);
  doc.text(`Hora: ${comprobante.hora_emision || "N/A"}`, xCol1, y + 29);

  doc.text(`Método de pago: ${comprobante.metodo_pago || "N/A"}`, xCol2, y + 17);
  doc.text(`Fecha pago: ${comprobante.fecha_pago || comprobante.fecha_emision || "N/A"}`, xCol2, y + 23);
  doc.text(`Estado: ${comprobante.estado || "Pagado"}`, xCol2, y + 29);

  y += 44;

  // === CÓDIGO QR ===
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(`Código único: ${serieNumero} | Expediente: ${comprobante.id_solicitud}`, pageWidth / 2, y, { align: "center" });
  y += 3;

  // QR text-based
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(pageWidth / 2 - 20, y, 40, 40, 2, 2, "S");
  doc.setFontSize(7);
  doc.text("QR", pageWidth / 2, y + 22, { align: "center" });
  doc.text("VALIDACIÓN", pageWidth / 2, y + 27, { align: "center" });

  y += 46;

  // === PIE DE PÁGINA ===
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;

  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text("Documento generado automáticamente por el sistema municipal.", pageWidth / 2, y, { align: "center" });
  y += 4;
  doc.text("Municipalidad de Trujillo — Sistema de Licencias v1.0", pageWidth / 2, y, { align: "center" });

  return doc;
};

export const descargarComprobante = (comprobante) => {
  const docPdf = generarPdfComprobante(comprobante);
  const nombreArchivo = `${comprobante.tipo_comprobante === "boleta" ? "BOLETA" : "FACTURA"}_${comprobante.serie}_${comprobante.numero}.pdf`;
  docPdf.save(nombreArchivo);
};

export const enviarComprobantePorCorreo = async (comprobante) => {
  const apiUrl = import.meta.env.PROD ? "" : (import.meta.env.VITE_API_URL || "http://localhost:3000");
  const url = `${apiUrl}/api/comprobantes/enviar-correo`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(comprobante),
  });

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || "No se pudo enviar el comprobante por correo.");
  }

  return response.json();
};
