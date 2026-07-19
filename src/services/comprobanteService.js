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
import QRCode from "qrcode";

const COLLECTION = "comprobantes_pago";
const IGV_RATE = 0.18;

export const MUNICIPALIDAD_CONFIG = {
  nombre: "WEB-MUNICIPAL",
  direccion: "Plataforma Digital de Trámites Municipales",
  telefono: "",
  email: "webmunicipal01@gmail.com",
  web: "https://web-municipal-1.onrender.com",
  ruc: "20456789012"
};

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
}, onUploadComplete) => {
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
  const docPdf = await generarPdfComprobante(comprobante);
  console.log("[5] PDF generado");
  const nombrePdf = `${tipo.toUpperCase()}_${serie}_${numero}.pdf`;
  const pdfBlob = docPdf.output("blob");

  // Realizar la carga en Firebase de forma asíncrona en segundo plano
  // sin esperar con 'await' a que termine para retornar inmediatamente
  (async () => {
    try {
      // 1. Guardar metadatos en Firestore primero
      console.log("[6] Guardando metadatos del comprobante en Firestore");
      await setDoc(doc(db, COLLECTION, comprobante.id_comprobante), comprobante);
      console.log("[7] Metadatos del comprobante guardados con éxito en Firestore");
      
      // 2. Intentar subir el PDF a Storage de forma aislada
      try {
        console.log("[8] Subiendo PDF a Firebase Storage");
        const storageRef = ref(storage, `comprobantes/${uidUsuario}/${idSolicitud}/${nombrePdf}`);
        await uploadBytes(storageRef, pdfBlob, { contentType: "application/pdf" });
        const urlPdf = await getDownloadURL(storageRef);
        
        comprobante.url_pdf = urlPdf;
        comprobante.archivo_pdf_url = urlPdf;
        await setDoc(doc(db, COLLECTION, comprobante.id_comprobante), comprobante, { merge: true });
        console.log("[9] URL del PDF asociada correctamente en Firestore");
      } catch (storageErr) {
        console.error("[COMPROBANTE] Error al subir el PDF a Storage (se mantendrá visible en local):", storageErr);
      }

      if (onUploadComplete) {
        onUploadComplete(comprobante);
      }
    } catch (firebaseErr) {
      console.error("[COMPROBANTE] Error crítico guardando comprobante en Firebase:", firebaseErr);
    }
  })();

  console.log("[8] Respuesta local enviada inmediatamente al frontend");
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
    const datetimeA = `${a.fecha_emision || ""} ${a.hora_emision || ""}`.trim();
    const datetimeB = `${b.fecha_emision || ""} ${b.hora_emision || ""}`.trim();
    return datetimeB.localeCompare(datetimeA);
  });
};

export const obtenerComprobantePorId = async (idComprobante) => {
  if (!idComprobante) return null;
  const q = query(collection(db, COLLECTION), where("id_comprobante", "==", idComprobante));
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;
  return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
};

const convertirNumeroALetras = (numero) => {
  const unidades = ["", "UN", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE"];
  const decenas = ["", "DIEZ", "VEINTE", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"];
  const especiales = {
    11: "ONCE", 12: "DOCE", 13: "TRECE", 14: "CATORCE", 15: "QUINCE",
    16: "DIECISÉIS", 17: "DIECISIETE", 18: "DIECIOCHO", 19: "DIECINUEVE",
    21: "VEINTIUNO", 22: "VEINTIDOS", 23: "VEINTITRES", 24: "VEINTICUATRO",
    25: "VEINTICINCO", 26: "VEINTISÉIS", 27: "VEINTISIETE", 28: "VEINTIOCHO", 29: "VEINTINUEVE"
  };
  const centenas = ["", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS", "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS"];

  const entero = Math.floor(numero);
  const decimales = Math.round((numero - entero) * 100);
  const centimos = decimales.toString().padStart(2, "0") + "/100 SOLES";

  if (entero === 0) return `SON: CERO CON ${centimos}`;
  if (entero === 100) return `SON: CIEN CON ${centimos}`;

  let letras = "";
  if (entero < 10) {
    letras = unidades[entero];
  } else if (entero < 30) {
    letras = especiales[entero] || (decenas[Math.floor(entero / 10)] + " Y " + unidades[entero % 10]);
  } else if (entero < 100) {
    const u = entero % 10;
    letras = decenas[Math.floor(entero / 10)] + (u > 0 ? " Y " + unidades[u] : "");
  } else if (entero < 1000) {
    const resto = entero % 100;
    letras = centenas[Math.floor(entero / 100)] + (resto > 0 ? " " + convertirNumeroALetras(resto).replace("SON: ", "").split(" CON ")[0] : "");
  } else {
    letras = entero.toString();
  }

  return `SON: ${letras} CON ${centimos}`;
};

export const generarPdfComprobante = async (comprobante) => {
  const docPdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = docPdf.internal.pageSize.getWidth();
  const margin = 15;

  // 1. ENCABEZADO
  // Escudo Municipal Vectorial
  docPdf.setFillColor(30, 58, 138); // Dark blue shield
  docPdf.triangle(15, 15, 31, 15, 23, 27, "F");
  docPdf.setFillColor(224, 242, 254); // Light blue details
  docPdf.circle(23, 19, 2.5, "F");

  // Nombre de la Municipalidad y datos
  docPdf.setTextColor(30, 58, 138);
  docPdf.setFont("helvetica", "bold");
  docPdf.setFontSize(11);
  docPdf.text(MUNICIPALIDAD_CONFIG.nombre, 34, 18);
  
  docPdf.setTextColor(71, 85, 105);
  docPdf.setFont("helvetica", "normal");
  docPdf.setFontSize(8);
  docPdf.text(MUNICIPALIDAD_CONFIG.direccion, 34, 22);
  docPdf.text(`Email: ${MUNICIPALIDAD_CONFIG.email}`, 34, 26);
  docPdf.text(`Web: ${MUNICIPALIDAD_CONFIG.web}`, 34, 30);

  // Recuadro derecho de Boleta/Factura
  docPdf.setDrawColor(30, 58, 138);
  docPdf.setLineWidth(0.5);
  docPdf.roundedRect(135, 15, 60, 26, 2, 2, "S");

  docPdf.setFont("helvetica", "bold");
  docPdf.setFontSize(9.5);
  docPdf.text("R.U.C. 20456789012", 165, 21, { align: "center" });

  const esBoleta = comprobante.tipo_comprobante === "boleta";
  const tipoTitulo = esBoleta ? "BOLETA DE VENTA" : "FACTURA";
  const comprobanteTitulo = `${tipoTitulo} ELECTRÓNICA`;
  docPdf.setFontSize(9);
  docPdf.text(comprobanteTitulo, 165, 26, { align: "center" });

  docPdf.setFontSize(11);
  docPdf.setTextColor(30, 58, 138);
  docPdf.text(`${comprobante.serie}-${comprobante.numero}`, 165, 33, { align: "center" });

  // Línea divisoria
  docPdf.setDrawColor(226, 232, 240);
  docPdf.setLineWidth(0.4);
  docPdf.line(15, 46, 195, 46);

  // 2. DATOS DEL CONTRIBUYENTE
  docPdf.setTextColor(30, 58, 138);
  docPdf.setFont("helvetica", "bold");
  docPdf.setFontSize(9);
  docPdf.text("I. DATOS DEL CONTRIBUYENTE", 15, 52);

  docPdf.setFillColor(248, 250, 252);
  docPdf.roundedRect(15, 55, 180, 24, 2, 2, "F");
  
  docPdf.setTextColor(15, 23, 42);
  docPdf.setFont("helvetica", "normal");
  docPdf.setFontSize(8.5);
  
  const nombreCliente = esBoleta 
    ? `${comprobante.nombres_cliente || ""} ${comprobante.apellidos_cliente || ""}`.trim() 
    : (comprobante.razon_social || "N/A");
  const docIdentidad = esBoleta ? (comprobante.dni_cliente || "N/A") : (comprobante.ruc_cliente || "N/A");
  const docIdentidadLabel = esBoleta ? "DNI" : "RUC";

  docPdf.text(`Contribuyente: ${nombreCliente}`, 20, 61);
  docPdf.text(`${docIdentidadLabel}: ${docIdentidad}`, 20, 67);
  docPdf.text(`Dirección: ${comprobante.direccion_cliente || "Jr. San Martín 328, Trujillo"}`, 20, 73);

  docPdf.text(`Fecha Emisión: ${comprobante.fecha_emision}`, 120, 61);
  docPdf.text(`Hora Emisión: ${comprobante.hora_emision || "N/A"}`, 120, 67);
  docPdf.text(`Moneda: SOLES (S/)`, 120, 73);

  // 3. INFORMACIÓN DEL TRÁMITE
  docPdf.setTextColor(30, 58, 138);
  docPdf.setFont("helvetica", "bold");
  docPdf.setFontSize(9);
  docPdf.text("II. DETALLE DEL TRÁMITE", 15, 87);

  docPdf.setFillColor(248, 250, 252);
  docPdf.roundedRect(15, 90, 180, 24, 2, 2, "F");

  docPdf.setTextColor(15, 23, 42);
  docPdf.setFont("helvetica", "normal");
  docPdf.setFontSize(8.5);

  docPdf.text(`Código Solicitud: ${comprobante.id_solicitud}`, 20, 96);
  docPdf.text(`Tipo de Trámite: Licencia de Funcionamiento`, 20, 102);
  docPdf.text(`Giro de Negocio: ${comprobante.giro || "Trámite de Licencia"}`, 20, 108);

  docPdf.text(`Código Operación: ${comprobante.codigo_operacion}`, 120, 96);
  docPdf.text(`Estado del Trámite: PAGADO`, 120, 102);
  docPdf.text(`Canal de Registro: Online`, 120, 108);

  // 4. DETALLE DEL COMPROBANTE (TABLA)
  docPdf.setTextColor(30, 58, 138);
  docPdf.setFont("helvetica", "bold");
  docPdf.setFontSize(9);
  docPdf.text("III. DETALLE DEL COMPROBANTE", 15, 122);

  // Header tabla
  docPdf.setFillColor(30, 58, 138);
  docPdf.rect(15, 125, 180, 7, "F");
  
  docPdf.setTextColor(255, 255, 255);
  docPdf.setFont("helvetica", "bold");
  docPdf.setFontSize(8.5);
  docPdf.text("CANTIDAD", 20, 129.5);
  docPdf.text("DESCRIPCIÓN", 45, 129.5);
  docPdf.text("VALOR UNITARIO", 150, 129.5, { align: "right" });
  docPdf.text("IMPORTE", 190, 129.5, { align: "right" });

  // Filas tabla
  docPdf.setTextColor(15, 23, 42);
  docPdf.setFont("helvetica", "normal");
  const rowY = 132;
  docPdf.setFillColor(255, 255, 255);
  docPdf.rect(15, rowY, 180, 10, "F");
  
  docPdf.text("1", 20, rowY + 6);
  docPdf.text("Derecho de trámite por Licencia de Funcionamiento", 45, rowY + 6);
  const totalMonto = Number(comprobante.monto_total || comprobante.monto);
  const baseValue = esBoleta ? totalMonto : Number(comprobante.monto_base || totalMonto);
  docPdf.text(`S/ ${baseValue.toFixed(2)}`, 150, rowY + 6, { align: "right" });
  docPdf.text(`S/ ${totalMonto.toFixed(2)}`, 190, rowY + 6, { align: "right" });

  docPdf.setDrawColor(226, 232, 240);
  docPdf.setLineWidth(0.3);
  docPdf.line(15, rowY + 10, 195, rowY + 10);

  // 5. TOTALES Y MONTO EN LETRAS
  const lettersY = 153;
  // Monto en letras
  docPdf.setTextColor(15, 23, 42);
  docPdf.setFont("helvetica", "bold");
  docPdf.setFontSize(8.5);
  docPdf.text(convertirNumeroALetras(totalMonto), 15, lettersY + 5);

  // Totales
  docPdf.setFont("helvetica", "normal");
  if (!esBoleta) {
    // Factura: Subtotal, IGV, Total
    const subtotalVal = Number(comprobante.monto_base || (totalMonto / 1.18));
    const igvVal = Number(comprobante.monto_igv || (totalMonto - subtotalVal));
    docPdf.text("Subtotal:", 145, lettersY + 5, { align: "right" });
    docPdf.text(`S/ ${subtotalVal.toFixed(2)}`, 190, lettersY + 5, { align: "right" });
    docPdf.text("I.G.V. 18%:", 145, lettersY + 10, { align: "right" });
    docPdf.text(`S/ ${igvVal.toFixed(2)}`, 190, lettersY + 10, { align: "right" });
    
    docPdf.setFont("helvetica", "bold");
    docPdf.setTextColor(30, 58, 138);
    docPdf.text("TOTAL PAGADO:", 145, lettersY + 16, { align: "right" });
    docPdf.text(`S/ ${totalMonto.toFixed(2)}`, 190, lettersY + 16, { align: "right" });
  } else {
    // Boleta: Subtotal, Descuento, Total
    docPdf.text("Subtotal:", 145, lettersY + 5, { align: "right" });
    docPdf.text(`S/ ${totalMonto.toFixed(2)}`, 190, lettersY + 5, { align: "right" });
    docPdf.text("Descuento:", 145, lettersY + 10, { align: "right" });
    docPdf.text("S/ 0.00", 190, lettersY + 10, { align: "right" });

    docPdf.setFont("helvetica", "bold");
    docPdf.setTextColor(30, 58, 138);
    docPdf.text("TOTAL PAGADO:", 145, lettersY + 16, { align: "right" });
    docPdf.text(`S/ ${totalMonto.toFixed(2)}`, 190, lettersY + 16, { align: "right" });
  }

  // 6. INFORMACIÓN DE PAGO
  docPdf.setTextColor(30, 58, 138);
  docPdf.setFont("helvetica", "bold");
  docPdf.setFontSize(9);
  docPdf.text("IV. DETALLE DE LA TRANSACCIÓN", 15, 182);

  docPdf.setFillColor(240, 253, 244); // Green background
  docPdf.setDrawColor(134, 239, 172);
  docPdf.roundedRect(15, 185, 180, 22, 2, 2, "FD");

  docPdf.setTextColor(22, 101, 52);
  docPdf.setFont("helvetica", "bold");
  docPdf.text("TRANSACCIÓN CONFIRMADA - ESTADO: PAGADO", 20, 191);

  docPdf.setTextColor(15, 23, 42);
  docPdf.setFont("helvetica", "normal");
  docPdf.setFontSize(8);
  const pagoFecha = comprobante.fecha_pago || comprobante.fecha_emision;
  docPdf.text(`Método: ${comprobante.metodo_pago}  |  Operación: ${comprobante.codigo_operacion}  |  Fecha: ${pagoFecha} ${comprobante.hora_emision || ""}`, 20, 197);

  // 7. PIE DEL DOCUMENTO Y QR
  const footerY = 222;
  docPdf.setDrawColor(226, 232, 240);
  docPdf.setLineWidth(0.4);
  docPdf.line(15, footerY, 195, footerY);

  docPdf.setTextColor(100, 116, 139);
  docPdf.setFont("helvetica", "normal");
  docPdf.setFontSize(7.5);
  docPdf.text("Este comprobante fue generado electrónicamente por el Sistema Municipal de Licencias.", 15, footerY + 8);
  docPdf.text("Conserve este documento para cualquier consulta futura.", 15, footerY + 12);
  docPdf.text("La validación de la autenticidad de este documento se puede realizar con el código QR adjunto.", 15, footerY + 16);
  docPdf.text(`Representación impresa de la ${comprobanteTitulo}.`, 15, footerY + 20);
  
  const printTimestamp = new Date().toLocaleString("es-PE");
  docPdf.text(`Fecha y hora de generación: ${printTimestamp}`, 15, footerY + 26);

  // QR Code
  const qrDataText = `Expediente: ${comprobante.id_solicitud}\nComprobante: ${comprobante.serie}-${comprobante.numero}\nMonto: S/ ${totalMonto.toFixed(2)}\nOperacion: ${comprobante.codigo_operacion}\nFecha: ${comprobante.fecha_emision} ${comprobante.hora_emision || ""}`;
  try {
    const qrDataUrl = await QRCode.toDataURL(qrDataText, { margin: 1, width: 100 });
    docPdf.addImage(qrDataUrl, "PNG", 163, footerY + 5, 32, 32);
  } catch (err) {
    console.error("Error al generar código QR en el PDF:", err);
  }

  return docPdf;
};

export const descargarComprobante = async (comprobante) => {
  const docPdf = await generarPdfComprobante(comprobante);
  const nombreArchivo = `${comprobante.tipo_comprobante === "boleta" ? "BOLETA" : "FACTURA"}_${comprobante.serie}_${comprobante.numero}.pdf`;
  docPdf.save(nombreArchivo);
};

export const imprimirComprobante = async (comprobante) => {
  const docPdf = await generarPdfComprobante(comprobante);
  const pdfBlob = docPdf.output("blob");
  const blobUrl = URL.createObjectURL(pdfBlob);

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "none";
  iframe.src = blobUrl;

  document.body.appendChild(iframe);

  iframe.onload = () => {
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
    setTimeout(() => {
      document.body.removeChild(iframe);
      URL.revokeObjectURL(blobUrl);
    }, 2000);
  };
};

export const enviarComprobantePorCorreo = async (comprobante) => {
  const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:3000";
  const url = `${apiUrl}/api/comprobantes/enviar-correo`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(comprobante),
  });

  const contentType = response.headers.get("content-type");
  if (!contentType || !contentType.includes("application/json")) {
    throw new Error(`El servidor no devolvió una respuesta JSON válida (código HTTP: ${response.status}).`);
  }

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "No se pudo enviar el comprobante por correo.");
  }

  return data;
};
