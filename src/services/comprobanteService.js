import { db, storage } from "../firebase";
import {
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  where,
  orderBy,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import jsPDF from "jspdf";

const COLLECTION = "comprobantes_pago";
const IGV_RATE = 0.18;

const generarSerie = (tipo) => {
  return tipo === "boleta" ? "B001" : "F001";
};

const generarNumero = () => {
  const count = parseInt(localStorage.getItem("comprobante_count") || "0", 10) + 1;
  localStorage.setItem("comprobante_count", count.toString());
  return count.toString().padStart(8, "0");
};

const calcularIgv = (monto) => {
  const base = monto / (1 + IGV_RATE);
  const igv = monto - base;
  return { base: Math.round(base * 100) / 100, igv: Math.round(igv * 100) / 100 };
};

export const generarComprobante = async ({
  uidUsuario,
  correoUsuario,
  idSolicitud,
  tipo,
  dniCliente,
  nombresCliente,
  apellidosCliente,
  rucCliente,
  razonSocial,
  direccionCliente,
  descripcionPago,
  monto,
  metodoPago,
  estadoPago,
  codigoOperacion,
}) => {
  const serie = generarSerie(tipo);
  const numero = generarNumero();
  const fechaEmision = new Date().toLocaleDateString("es-PE");
  const horaEmision = new Date().toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
  const codigoUnico = `${serie}-${numero}`;

  let montoBase = monto;
  let montoIgv = 0;
  if (tipo === "factura") {
    const calc = calcularIgv(monto);
    montoBase = calc.base;
    montoIgv = calc.igv;
  }

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
    nombres_cliente: nombresCliente || "",
    apellidos_cliente: apellidosCliente || "",
    ruc_cliente: rucCliente || "",
    razon_social: razonSocial || "",
    direccion_cliente: direccionCliente || "",
    descripcion_pago: descripcionPago || "Pago por derecho de trámite de licencia de funcionamiento",
    monto_total: monto,
    monto: monto,
    monto_base: montoBase,
    monto_igv: montoIgv,
    metodo_pago: metodoPago,
    fecha_emision: fechaEmision,
    hora_emision: horaEmision,
    fecha_pago: fechaEmision,
    estado: estadoPago || "Pagado",
    codigo_operacion: codigoOperacion || `DEMO-${Date.now().toString().slice(-8)}`,
    url_pdf: "",
    archivo_pdf_url: "",
  };

  console.log("[4] Generando comprobante");
  const docPdf = generarPdfComprobante(comprobante);
  console.log("[5] PDF generado");
  const nombrePdf = `${tipo.toUpperCase()}_${serie}_${numero}.pdf`;
  const pdfBlob = docPdf.output("blob");

  console.log("[6] Guardando PDF");
  const storageRef = ref(storage, `comprobantes/${uidUsuario}/${idSolicitud}/${nombrePdf}`);
  await uploadBytes(storageRef, pdfBlob, { contentType: "application/pdf" });
  const urlPdf = await getDownloadURL(storageRef);
  comprobante.url_pdf = urlPdf;
  comprobante.archivo_pdf_url = urlPdf;

  await setDoc(doc(db, COLLECTION, comprobante.id_comprobante), comprobante);

  console.log("[7] PDF guardado");
  console.log("[COMPROBANTE] Guardado y subido:", comprobante.id_comprobante);
  console.log("[8] Respuesta enviada al frontend");
  return comprobante;
};

export const obtenerComprobantesPorUsuario = async (uidUsuario) => {
  if (!uidUsuario) return [];
  const q = query(
    collection(db, COLLECTION),
    where("id_usuario", "==", uidUsuario)
  );
  const snapshot = await getDocs(q);
  const comprobantes = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

  // Sort locally by fecha_emision/hora_emision to avoid index constraints
  return comprobantes.sort((a, b) => {
    return (b.fecha_emision || "").localeCompare(a.fecha_emision || "");
  });
};

export const obtenerComprobantePorId = async (idComprobante) => {
  if (!idComprobante) return null;
  const q = query(collection(db, COLLECTION), where("id_comprobante", "==", idComprobante));
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;
  return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
};

const dibujarEncabezado = (doc, tipoTitulo, pageWidth, margin) => {
  doc.setFillColor(31, 59, 87);
  doc.rect(0, 0, pageWidth, 42, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(17);
  doc.setFont("helvetica", "bold");
  doc.text("MUNICIPALIDAD DE TRUJILLO", pageWidth / 2, 14, { align: "center" });

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("RUC: 20456789012 | Jr. San Martín 328, Trujillo - La Libertad", pageWidth / 2, 21, { align: "center" });
  doc.text("Tel: (044) 231234 | Email: webmunicipal01@gmail.com", pageWidth / 2, 27, { align: "center" });

  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.3);
  doc.line(margin + 20, 31, pageWidth - margin - 20, 31);

  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text(tipoTitulo, pageWidth / 2, 39, { align: "center" });
};

const dibujarSerieNumero = (doc, serieNumero, pageWidth, margin, y) => {
  doc.setDrawColor(31, 59, 87);
  doc.setLineWidth(0.5);
  doc.roundedRect(pageWidth - margin - 58, y - 2, 58, 15, 2, 2, "S");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.setFont("helvetica", "normal");
  doc.text("SERIE - NÚMERO", pageWidth - margin - 29, y + 2.5, { align: "center" });
  doc.setFontSize(13);
  doc.setTextColor(31, 59, 87);
  doc.setFont("helvetica", "bold");
  doc.text(serieNumero, pageWidth - margin - 29, y + 10, { align: "center" });
};

const dibujarClienteBoleta = (doc, comprobante, pageWidth, margin, y) => {
  const h = 24;
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margin, y, pageWidth - margin * 2, h, 2, 2, "F");

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(31, 59, 87);
  doc.text("DATOS DEL CLIENTE (BOLETA)", margin + 6, y + 8);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);

  const col1 = margin + 6;
  const col2 = margin + (pageWidth - margin * 2) / 2 + 4;

  doc.text(`DNI: ${comprobante.dni_cliente || "N/A"}`, col1, y + 16);
  doc.text(`Nombres: ${(comprobante.nombres_cliente || "")} ${(comprobante.apellidos_cliente || "")}`.trim() || "N/A", col1, y + 22);
  doc.text(`Correo: ${comprobante.correo_usuario || "N/A"}`, col2, y + 16);

  return y + h;
};

const dibujarClienteFactura = (doc, comprobante, pageWidth, margin, y) => {
  const h = 32;
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margin, y, pageWidth - margin * 2, h, 2, 2, "F");

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(31, 59, 87);
  doc.text("DATOS DEL CLIENTE (FACTURA)", margin + 6, y + 8);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);

  const col1 = margin + 6;
  const col2 = margin + (pageWidth - margin * 2) / 2 + 4;

  doc.text(`RUC: ${comprobante.ruc_cliente || "N/A"}`, col1, y + 16);
  doc.text(`Razón Social: ${comprobante.razon_social || "N/A"}`, col1, y + 22);
  doc.text(`Dirección fiscal: ${comprobante.direccion_cliente || "Trujillo - La Libertad"}`, col1, y + 28);

  return y + h;
};

const dibujarDetalle = (doc, comprobante, pageWidth, margin, y) => {
  const esFactura = comprobante.tipo_comprobante === "factura";
  const colDesc = margin + 6;
  const colCant = margin + 105;
  const colPrec = margin + 128;
  const colTotal = pageWidth - margin - 6;

  doc.setFillColor(31, 59, 87);
  doc.rect(margin, y, pageWidth - margin * 2, 10, "F");
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
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
  doc.setFontSize(8.5);
  doc.text(comprobante.descripcion_pago || "Derecho de trámite", colDesc, y);
  doc.text("1", colCant, y);
  doc.text(`S/${Number(comprobante.monto_total).toFixed(2)}`, colPrec, y);
  doc.setFont("helvetica", "bold");
  doc.text(`S/${Number(comprobante.monto_total).toFixed(2)}`, colTotal, y, { align: "right" });

  y += 5;
  doc.line(margin, y, pageWidth - margin, y);

  if (esFactura) {
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text("Valor de venta:", margin + 70, y);
    doc.text(`S/${Number(comprobante.monto_base).toFixed(2)}`, colTotal, y, { align: "right" });
    y += 5;
    doc.text("IGV (18%):", margin + 70, y);
    doc.text(`S/${Number(comprobante.monto_igv).toFixed(2)}`, colTotal, y, { align: "right" });
    y += 3;
    doc.setDrawColor(31, 59, 87);
    doc.setLineWidth(0.3);
    doc.line(margin + 68, y, pageWidth - margin, y);
  }

  y += 7;
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(31, 59, 87);
  doc.text(`TOTAL: S/${Number(comprobante.monto_total).toFixed(2)}`, colTotal, y, { align: "right" });

  return y + 8;
};

const dibujarDatosPago = (doc, comprobante, pageWidth, margin, y) => {
  const h = 38;
  doc.setFillColor(240, 253, 244);
  doc.roundedRect(margin, y, pageWidth - margin * 2, h, 2, 2, "F");
  doc.setDrawColor(134, 239, 172);
  doc.roundedRect(margin, y, pageWidth - margin * 2, h, 2, 2, "S");

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(22, 101, 52);
  doc.text("DATOS DEL PAGO", margin + 6, y + 10);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);

  const xCol1 = margin + 6;
  const xCol2 = margin + (pageWidth - margin * 2) / 2 + 4;

  doc.text(`Serie - Número: ${comprobante.serie}-${comprobante.numero}`, xCol1, y + 19);
  doc.text(`Fecha emisión: ${comprobante.fecha_emision || "N/A"}`, xCol1, y + 25);
  doc.text(`Hora: ${comprobante.hora_emision || "N/A"}`, xCol1, y + 31);

  doc.text(`Método de pago: ${comprobante.metodo_pago || "N/A"}`, xCol2, y + 19);
  doc.text(`Fecha pago: ${comprobante.fecha_pago || comprobante.fecha_emision || "N/A"}`, xCol2, y + 25);
  doc.text(`Estado: ${comprobante.estado || "Pagado"}`, xCol2, y + 31);

  return y + h + 8;
};

const dibujarPie = (doc, comprobante, pageWidth, margin, y) => {
  const serieNumero = `${comprobante.serie}-${comprobante.numero}`;

  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(`Código único: ${serieNumero} | Expediente: ${comprobante.id_solicitud}`, pageWidth / 2, y, { align: "center" });
  y += 4;

  doc.setDrawColor(31, 59, 87);
  doc.setLineWidth(0.3);
  doc.roundedRect(pageWidth / 2 - 18, y, 36, 36, 2, 2, "S");
  doc.setFontSize(7);
  doc.setTextColor(31, 59, 87);
  doc.setFont("helvetica", "bold");
  doc.text("VALIDAR EN", pageWidth / 2, y + 14, { align: "center" });
  doc.text("MUNICIPALIDAD", pageWidth / 2, y + 19, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.text(serieNumero, pageWidth / 2, y + 27, { align: "center" });

  y += 42;
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageWidth - margin, y);
  y += 5;

  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.setFont("helvetica", "normal");
  doc.text("Documento generado automáticamente por el sistema municipal. — Municipalidad de Trujillo v1.0", pageWidth / 2, y, { align: "center" });

  return y;
};

export const generarPdfComprobante = (comprobante) => {
  const docPdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  const pageWidth = docPdf.internal.pageSize.getWidth();
  const margin = 18;

  const esBoleta = comprobante.tipo_comprobante === "boleta";
  const tipoTitulo = esBoleta ? "BOLETA DE VENTA ELECTRÓNICA" : "FACTURA ELECTRÓNICA";

  dibujarEncabezado(docPdf, tipoTitulo, pageWidth, margin);

  let y = 52;
  dibujarSerieNumero(docPdf, `${comprobante.serie}-${comprobante.numero}`, pageWidth, margin, y);

  y += 22;
  if (esBoleta) {
    y = dibujarClienteBoleta(docPdf, comprobante, pageWidth, margin, y);
  } else {
    y = dibujarClienteFactura(docPdf, comprobante, pageWidth, margin, y);
  }

  y += 10;
  y = dibujarDetalle(docPdf, comprobante, pageWidth, margin, y);

  y += 6;
  y = dibujarDatosPago(docPdf, comprobante, pageWidth, margin, y);

  dibujarPie(docPdf, comprobante, pageWidth, margin, y);

  return docPdf;
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
