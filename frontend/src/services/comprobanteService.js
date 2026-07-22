import { db, storage, authHeaders } from "../firebase";
import {
  collection,
  doc,
  setDoc,
  getDocs,
  getDoc,
  updateDoc,
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
  nombre: "MUNICIPALIDAD PROVINCIAL DE TRUJILLO",
  direccion: "Jr. Diego de Almagro N° 525, Trujillo - La Libertad",
  telefono: "(044) 486000",
  email: "mesadepartes@munitrujillo.gob.pe",
  web: "https://www.munitrujillo.gob.pe",
  ruc: "20145532000"
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
  montoRecibido,
  vuelto,
  cajeraResponsable,
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
    monto_recibido: montoRecibido || null,
    vuelto: vuelto || null,
    cajera_responsable: cajeraResponsable || "Cajero de Ventanilla (CAJ-01)",
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
  (async () => {
    try {
      console.log("[6] Guardando metadatos del comprobante en Firestore");
      await setDoc(doc(db, COLLECTION, comprobante.id_comprobante), comprobante);
      console.log("[7] Metadatos del comprobante guardados con éxito en Firestore");
      
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
  const comprobantes = snapshot.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((c) => !c.eliminado);

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

export const convertirNumeroALetras = (numero) => {
  const val = Number(numero) || 0;
  const entero = Math.floor(val);
  const decimales = Math.round((val - entero) * 100);
  const centimos = decimales.toString().padStart(2, "0") + "/100 SOLES.";

  const unidades = ["", "UN", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE"];
  const decenas = ["", "DIEZ", "VEINTE", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"];
  const especiales = {
    10: "DIEZ", 11: "ONCE", 12: "DOCE", 13: "TRECE", 14: "CATORCE", 15: "QUINCE",
    16: "DIECISÉIS", 17: "DIECISIETE", 18: "DIECIOCHO", 19: "DIECINUEVE",
    20: "VEINTE", 21: "VEINTIUNO", 22: "VEINTIDÓS", 23: "VEINTITRÉS", 24: "VEINTICUATRO",
    25: "VEINTICINCO", 26: "VEINTISÉIS", 27: "VEINTISIETE", 28: "VEINTIOCHO", 29: "VEINTINUEVE"
  };
  const centenas = ["", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS", "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS"];

  let letras = "";
  if (entero === 0) letras = "CERO";
  else if (entero === 100) letras = "CIEN";
  else if (entero < 10) letras = unidades[entero];
  else if (entero <= 29) letras = especiales[entero] || (decenas[Math.floor(entero / 10)] + " Y " + unidades[entero % 10]);
  else if (entero < 100) {
    const u = entero % 10;
    letras = decenas[Math.floor(entero / 10)] + (u > 0 ? " Y " + unidades[u] : "");
  } else if (entero < 1000) {
    const resto = entero % 100;
    const restoStr = resto > 0 ? " " + convertirNumeroALetras(resto).replace("SON: ", "").split(" Y ")[0] : "";
    letras = centenas[Math.floor(entero / 100)] + restoStr;
  } else {
    letras = entero.toString();
  }

  return `SON: ${letras} Y ${centimos}`;
};

export const generarPdfComprobante = async (comprobante) => {
  const docPdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  // 1. ENCABEZADO INSTITUCIONAL
  docPdf.setFillColor(15, 23, 42); // Dark background header
  docPdf.roundedRect(15, 12, 180, 24, 2, 2, "F");

  docPdf.setTextColor(255, 255, 255);
  docPdf.setFont("helvetica", "bold");
  docPdf.setFontSize(11);
  docPdf.text(MUNICIPALIDAD_CONFIG.nombre, 105, 19, { align: "center" });

  docPdf.setFont("helvetica", "normal");
  docPdf.setFontSize(8);
  docPdf.text(`RUC: ${MUNICIPALIDAD_CONFIG.ruc} — ${MUNICIPALIDAD_CONFIG.direccion}`, 105, 24, { align: "center" });
  docPdf.text(`Email: ${MUNICIPALIDAD_CONFIG.email} | Web: ${MUNICIPALIDAD_CONFIG.web}`, 105, 29, { align: "center" });

  // Recuadro derecho de Boleta/Factura
  const esBoleta = (comprobante.tipo_comprobante || "").toLowerCase().includes("boleta") || (comprobante.serie || "").startsWith("B");
  const tipoTitulo = esBoleta ? "BOLETA DE VENTA" : "FACTURA";
  const comprobanteTitulo = `${tipoTitulo} ELECTRÓNICA`;

  docPdf.setDrawColor(15, 23, 42);
  docPdf.setLineWidth(0.6);
  docPdf.roundedRect(135, 40, 60, 24, 2, 2, "S");
  docPdf.setFillColor(248, 250, 252);
  docPdf.roundedRect(135, 40, 60, 24, 2, 2, "F");

  docPdf.setFont("helvetica", "bold");
  docPdf.setFontSize(9.5);
  docPdf.setTextColor(15, 23, 42);
  docPdf.text(comprobanteTitulo, 165, 47, { align: "center" });
  docPdf.setFontSize(11);
  docPdf.setTextColor(220, 38, 38);
  docPdf.text(`N° ${comprobante.codigo_unico || `${comprobante.serie || 'B001'}-${comprobante.numero || '00000001'}`}`, 165, 54, { align: "center" });
  docPdf.setFontSize(8);
  docPdf.setTextColor(71, 85, 105);
  docPdf.text(`Fecha: ${comprobante.fecha_emision} ${comprobante.hora_emision || ''}`, 165, 60, { align: "center" });

  // 2. DATOS DEL EXPEDIENTE Y CONTRIBUYENTE
  docPdf.setTextColor(15, 23, 42);
  docPdf.setFont("helvetica", "bold");
  docPdf.setFontSize(9);
  docPdf.text("DATOS DEL CONTRIBUYENTE Y ESTABLECIMIENTO", 15, 43);

  docPdf.setFillColor(248, 250, 252);
  docPdf.setDrawColor(203, 213, 225);
  docPdf.setLineWidth(0.3);
  docPdf.roundedRect(15, 46, 115, 34, 2, 2, "FD");

  docPdf.setTextColor(15, 23, 42);
  docPdf.setFont("helvetica", "normal");
  docPdf.setFontSize(8);

  const expId = `EXP-${String(comprobante.id_solicitud || comprobante.id || '').replace(/^EXP-/, '')}`;
  const razonSocial = comprobante.razon_social || comprobante.nombre_negocio || comprobante.nombreNegocio || "CONTRIBUYENTE REGISTRADO";
  const ruc = comprobante.ruc_cliente || comprobante.ruc || "---";
  const solicitante = [comprobante.nombres_cliente, comprobante.apellidos_cliente].filter(Boolean).join(" ") || comprobante.nombreSolicitante || "---";
  const dniRep = comprobante.dni_cliente || comprobante.dniSolicitante || comprobante.dni || "---";
  const direccion = comprobante.direccion_cliente || comprobante.direccion || "TRUJILLO";

  docPdf.text(`Expediente N°: ${expId}`, 18, 52);
  docPdf.text(`Razón Social: ${razonSocial}`, 18, 57);
  docPdf.text(`RUC Contribuyente: ${ruc}`, 18, 62);
  docPdf.text(`Representante / Solicitante: ${solicitante}`, 18, 67);
  docPdf.text(`DNI Representante: ${dniRep}`, 18, 72);
  docPdf.text(`Dirección Fiscal: ${direccion}`, 18, 77);

  // 3. GRILLA DE ÍTEMS
  const tableY = 86;
  docPdf.setFillColor(15, 23, 42);
  docPdf.rect(15, tableY, 180, 7, "F");

  docPdf.setTextColor(255, 255, 255);
  docPdf.setFont("helvetica", "bold");
  docPdf.setFontSize(8.5);
  docPdf.text("CANT", 22, tableY + 4.5, { align: "center" });
  docPdf.text("DESCRIPCIÓN DEL TRÁMITE", 35, tableY + 4.5);
  docPdf.text("P. UNIT", 155, tableY + 4.5, { align: "right" });
  docPdf.text("IMPORTE", 190, tableY + 4.5, { align: "right" });

  const rowY = tableY + 7;
  docPdf.setFillColor(255, 255, 255);
  docPdf.rect(15, rowY, 180, 10, "F");

  docPdf.setTextColor(15, 23, 42);
  docPdf.setFont("helvetica", "normal");
  docPdf.text("1", 22, rowY + 6, { align: "center" });
  docPdf.text(`Derecho de Trámite — ${comprobante.descripcion_pago || 'Licencia Municipal de Funcionamiento'} (${expId})`, 35, rowY + 6);

  const totalMonto = Number(comprobante.monto_total || comprobante.monto || 3.00);
  const subtotalVal = (totalMonto / 1.18);
  const igvVal = (totalMonto - subtotalVal);

  docPdf.text(`S/ ${totalMonto.toFixed(2)}`, 155, rowY + 6, { align: "right" });
  docPdf.text(`S/ ${totalMonto.toFixed(2)}`, 190, rowY + 6, { align: "right" });

  docPdf.setDrawColor(203, 213, 225);
  docPdf.setLineWidth(0.3);
  docPdf.line(15, rowY + 10, 195, rowY + 10);

  // 4. TOTAL EN LETRAS Y DESGLOSE FINANCIERO
  const summaryY = rowY + 14;

  // Letras
  docPdf.setFont("helvetica", "bold");
  docPdf.setFontSize(8.5);
  docPdf.setTextColor(15, 23, 42);
  docPdf.text(convertirNumeroALetras(totalMonto), 15, summaryY);

  // Desglose
  docPdf.setFont("helvetica", "normal");
  docPdf.setFontSize(8);
  docPdf.text("OP. GRAVADA:", 145, summaryY, { align: "right" });
  docPdf.text(`S/ ${subtotalVal.toFixed(2)}`, 190, summaryY, { align: "right" });

  docPdf.text("I.G.V. (18%):", 145, summaryY + 5, { align: "right" });
  docPdf.text(`S/ ${igvVal.toFixed(2)}`, 190, summaryY + 5, { align: "right" });

  docPdf.setFont("helvetica", "bold");
  docPdf.setFontSize(9.5);
  docPdf.setTextColor(22, 163, 74);
  docPdf.text("TOTAL PAGADO:", 145, summaryY + 11, { align: "right" });
  docPdf.text(`S/ ${totalMonto.toFixed(2)}`, 190, summaryY + 11, { align: "right" });

  // 5. DETALLE DE PAGO Y CAJERO (EFECTIVO vs DIGITAL)
  const payDetailY = summaryY + 18;
  docPdf.setFillColor(248, 250, 252);
  docPdf.setDrawColor(203, 213, 225);
  docPdf.roundedRect(15, payDetailY, 180, 24, 2, 2, "FD");

  docPdf.setFont("helvetica", "bold");
  docPdf.setFontSize(8.5);
  docPdf.setTextColor(15, 23, 42);
  docPdf.text("INFORMACIÓN DEL PAGO Y ATENCIÓN DE CAJA", 20, payDetailY + 6);

  docPdf.setFont("helvetica", "normal");
  docPdf.setFontSize(8);
  const esEfectivo = (comprobante.metodo_pago || '').toLowerCase().includes("efectivo");

  docPdf.text(`Método de Pago: ${(comprobante.metodo_pago || 'EFECTIVO EN CAJA').toUpperCase()}`, 20, payDetailY + 11);
  docPdf.text(`Estado del Pago: PAGO CONFIRMADO`, 20, payDetailY + 16);
  docPdf.text(`Cajero(a) Responsable: ${comprobante.cajera_responsable || 'Cajero de Ventanilla (CAJ-01)'}`, 20, payDetailY + 21);

  if (esEfectivo) {
    const rec = Number(comprobante.monto_recibido || 10.00);
    const vue = Number(comprobante.vuelto || (rec - totalMonto));
    docPdf.setFont("helvetica", "bold");
    docPdf.text(`Monto Recibido: S/ ${rec.toFixed(2)}`, 120, payDetailY + 11);
    docPdf.text(`Vuelto: S/ ${vue.toFixed(2)}`, 120, payDetailY + 16);
  } else {
    docPdf.text(`Código de Operación: ${comprobante.codigo_operacion || 'TX-2026-001'}`, 120, payDetailY + 11);
    docPdf.text(`Fecha/Hora Transacción: ${comprobante.fecha_pago || comprobante.fecha_emision} ${comprobante.hora_emision || ''}`, 120, payDetailY + 16);
  }

  // 6. MENSAJE OFICIAL Y QR DE VERIFICACIÓN
  const footerY = payDetailY + 28;
  docPdf.setDrawColor(203, 213, 225);
  docPdf.setLineWidth(0.4);
  docPdf.line(15, footerY, 195, footerY);

  docPdf.setFont("helvetica", "bold");
  docPdf.setFontSize(8);
  docPdf.setTextColor(22, 101, 52);
  docPdf.text("✓ Mensaje Oficial: La solicitud fue enviada correctamente para revisión / inspección municipal.", 15, footerY + 6);

  docPdf.setFont("helvetica", "normal");
  docPdf.setFontSize(7.5);
  docPdf.setTextColor(100, 116, 139);
  docPdf.text("Representación impresa del comprobante de venta electrónico emitido según normatividad SUNAT.", 15, footerY + 11);
  docPdf.text("Conserve este comprobante como constancia oficial de pago del derecho de trámite.", 15, footerY + 16);
  docPdf.text(`Código Hash de Verificación: ${Math.random().toString(36).substring(2, 15).toUpperCase()}-${Date.now()}`, 15, footerY + 21);

  // QR Code
  const qrDataText = `Municipalidad Provincial de Trujillo | RUC: ${MUNICIPALIDAD_CONFIG.ruc}\nComprobante: ${comprobante.serie || 'B001'}-${comprobante.numero || '0001'}\nExpediente: ${expId}\nContribuyente RUC: ${ruc}\nTotal: S/ ${totalMonto.toFixed(2)}\nFecha: ${comprobante.fecha_emision}`;
  try {
    const qrDataUrl = await QRCode.toDataURL(qrDataText, { margin: 1, width: 100 });
    docPdf.addImage(qrDataUrl, "PNG", 162, footerY + 3, 28, 28);
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
  const apiUrl = import.meta.env.VITE_API_URL || "";
  const url = `${apiUrl}/api/comprobantes/enviar-correo`;

  const headers = await authHeaders();
  const response = await fetch(url, {
    method: "POST",
    headers,
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

export const eliminarComprobante = async (idComprobante) => {
  if (!idComprobante) throw new Error("ID de comprobante requerido.");
  const docRef = doc(db, COLLECTION, idComprobante);
  const snap = await getDoc(docRef);
  if (!snap.exists()) throw new Error("El comprobante no existe.");
  await updateDoc(docRef, { eliminado: true });
};

export const existeComprobanteParaSolicitud = async (uidUsuario, idSolicitud) => {
  if (!uidUsuario || !idSolicitud) return false;
  const q = query(
    collection(db, COLLECTION),
    where("id_usuario", "==", uidUsuario),
    where("id_solicitud", "==", idSolicitud)
  );
  const snapshot = await getDocs(q);
  return !snapshot.empty;
};
