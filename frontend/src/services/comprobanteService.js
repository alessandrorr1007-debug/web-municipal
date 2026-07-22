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

export const obtenerDniValido = (obj) => {
  if (!obj) return "---";

  const candidatos = [
    obj.dni_cliente,
    obj.dniRepresentante,
    obj.dniSolicitante,
    obj.dni,
    obj.representanteDni,
    obj.dniUsuario,
    obj.numDoc,
    obj.documento,
  ];

  for (const val of candidatos) {
    if (val !== undefined && val !== null) {
      const valStr = String(val).trim();
      const limpio = valStr.replace(/\D/g, "");
      if (limpio.length === 8) {
        return limpio;
      }
      if (valStr.length >= 6) {
        return valStr;
      }
    }
  }

  return "---";
};

export const obtenerNombreCiudadanoValido = (obj) => {
  if (!obj) return "Solicitante Registrado";

  // 1. Nombres + Apellidos directos
  const nom = obj.nombresSolicitante || obj.nombres_cliente || obj.nombres || "";
  const ape = obj.apellidosSolicitante || obj.apellidos_cliente || obj.apellidos || "";
  const nombresDirectos = [nom, ape].filter(Boolean).join(" ").trim();
  if (nombresDirectos.length > 2) {
    return nombresDirectos;
  }

  // 2. Nombre del solicitante / representante / usuario
  const candidatos = [
    obj.nombreSolicitante,
    obj.nombre_solicitante,
    obj.representante_legal,
    obj.representanteLegal,
    obj.solicitante,
    obj.usuarioNombre,
    obj.nombreUsuario,
  ];

  for (const c of candidatos) {
    if (c && typeof c === "string") {
      const cLimpio = c.trim();
      if (
        cLimpio &&
        cLimpio.toLowerCase() !== "representante legal" &&
        !cLimpio.endsWith("S.A.") &&
        !cLimpio.endsWith("S.A.C.") &&
        !cLimpio.endsWith("E.I.R.L.") &&
        !cLimpio.endsWith("S.R.L.")
      ) {
        return cLimpio;
      }
    }
  }

  // 3. Si es persona jurídica, usar Razón Social o Nombre del Negocio
  if (obj.razonSocial || obj.razon_social) {
    return String(obj.razonSocial || obj.razon_social).trim();
  }

  if (obj.nombreNegocio || obj.nombre_negocio) {
    return String(obj.nombreNegocio || obj.nombre_negocio).trim();
  }

  return "Solicitante Registrado";
};

export const obtenerTelefonoValido = (obj) => {
  if (!obj) return "---";

  const candidatos = [
    obj.telefono,
    obj.telefonoSolicitante,
    obj.telefonoContacto,
    obj.celular,
    obj.telefonoUsuario,
    obj.usuarioTelefono,
    obj.phone,
    obj.celularSolicitante,
  ];

  for (const val of candidatos) {
    if (val !== undefined && val !== null) {
      const valStr = String(val).trim();
      const limpio = valStr.replace(/\D/g, "");
      if (limpio.length >= 7) {
        return limpio;
      }
      if (valStr.length >= 6) {
        return valStr;
      }
    }
  }

  return "---";
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

  const tipoNorm = (comprobante.tipo_comprobante || comprobante.tipoComprobante || "").toLowerCase();
  const codComp = comprobante.codigo_unico || comprobante.codComprobante || comprobante.numeroOperacion || "";
  const esFactura = tipoNorm.includes("factura") || codComp.startsWith("F");
  const expId = `EXP-${String(comprobante.id_solicitud || comprobante.id || '').replace(/^EXP-/, '')}`;

  // 1. ENCABEZADO INSTITUCIONAL DE LA MUNICIPALIDAD
  docPdf.setFillColor(15, 23, 42);
  docPdf.roundedRect(15, 12, 180, 24, 2, 2, "F");

  docPdf.setTextColor(255, 255, 255);
  docPdf.setFont("helvetica", "bold");
  docPdf.setFontSize(11);
  docPdf.text("MUNICIPALIDAD PROVINCIAL DE TRUJILLO", 105, 18, { align: "center" });

  docPdf.setFont("helvetica", "normal");
  docPdf.setFontSize(7.5);
  docPdf.text("Gerencia de Desarrollo Económico Local — Subgerencia de Licencias de Funcionamiento", 105, 23, { align: "center" });
  docPdf.text("Jr. Diego de Almagro N° 525, Trujillo — Tel: (044) 486000", 105, 27, { align: "center" });
  docPdf.setFont("helvetica", "bold");
  docPdf.text("https://web-municipal-1.onrender.com", 105, 31, { align: "center" });

  // Recuadro derecho de Comprobante (UNICO LUGAR DEL RUC MUNICIPAL)
  const tipoTitulo = esFactura ? "FACTURA ELECTRÓNICA" : "BOLETA DE VENTA ELECTRÓNICA";
  const numSerieStr = codComp || `${esFactura ? 'F001' : 'B001'}-${expId.replace(/^EXP-/, '')}`;

  docPdf.setDrawColor(15, 23, 42);
  docPdf.setLineWidth(0.6);
  docPdf.roundedRect(130, 40, 65, 26, 2, 2, "S");
  docPdf.setFillColor(248, 250, 252);
  docPdf.roundedRect(130, 40, 65, 26, 2, 2, "F");

  docPdf.setFont("helvetica", "bold");
  docPdf.setFontSize(8.5);
  docPdf.setTextColor(71, 85, 105);
  docPdf.text("RUC: 20145532000", 162.5, 46, { align: "center" });
  docPdf.setFontSize(9.5);
  docPdf.setTextColor(15, 23, 42);
  docPdf.text(tipoTitulo, 162.5, 52, { align: "center" });
  docPdf.setFontSize(11);
  docPdf.setTextColor(220, 38, 38);
  docPdf.text(`N° ${numSerieStr}`, 162.5, 59, { align: "center" });

  // 2. DATOS DEL CLIENTE / CONTRIBUYENTE SEGÚN TIPO
  docPdf.setTextColor(15, 23, 42);
  docPdf.setFont("helvetica", "bold");
  docPdf.setFontSize(8.5);
  docPdf.text(esFactura ? "DATOS DEL CLIENTE (PERSONA JURÍDICA)" : "DATOS DEL CLIENTE (PERSONA NATURAL)", 15, 43);

  docPdf.setFillColor(248, 250, 252);
  docPdf.setDrawColor(203, 213, 225);
  docPdf.setLineWidth(0.3);
  docPdf.roundedRect(15, 46, 110, 34, 2, 2, "FD");

  docPdf.setTextColor(15, 23, 42);
  docPdf.setFont("helvetica", "normal");
  docPdf.setFontSize(7.5);

  const rucEstablecimiento = comprobante.ruc_cliente || comprobante.ruc || "---";
  const razonSocial = comprobante.razon_social || comprobante.razonSocial || comprobante.nombre_negocio || comprobante.nombreNegocio || "CONTRIBUYENTE REGISTRADO";
  const nombreComercial = comprobante.nombre_negocio || comprobante.nombreNegocio || razonSocial;
  const clienteNombre = obtenerNombreCiudadanoValido(comprobante);
  const clienteDni = obtenerDniValido(comprobante);
  const direccionFiscal = comprobante.direccion_cliente || comprobante.direccion || "TRUJILLO";

  if (esFactura) {
    // FACTURA: Razón Social, RUC de Empresa, Dirección Fiscal (NO DNI)
    docPdf.text(`Código Expediente: ${expId}`, 18, 51);
    docPdf.text(`Razón Social: ${razonSocial}`, 18, 56);
    docPdf.text(`RUC Contribuyente: ${rucEstablecimiento}`, 18, 61);
    docPdf.text(`Dirección Fiscal: ${direccionFiscal}`, 18, 66);
  } else {
    // BOLETA: Nombres y Apellidos, DNI (NO Dirección de Empresa, NO RUC)
    docPdf.text(`Código Expediente: ${expId}`, 18, 52);
    docPdf.text(`Cliente / Adquirente: ${clienteNombre}`, 18, 58);
    docPdf.text(`DNI / Doc. Identidad: ${clienteDni}`, 18, 64);
  }

  // 3. GRILLA DE ÍTEMS / DETALLE DE TRÁMITE
  const tableY = 86;
  docPdf.setFillColor(15, 23, 42);
  docPdf.rect(15, tableY, 180, 7, "F");

  docPdf.setTextColor(255, 255, 255);
  docPdf.setFont("helvetica", "bold");
  docPdf.setFontSize(7.5);
  docPdf.text("CANT", 20, tableY + 4.5, { align: "center" });
  docPdf.text("DESCRIPCIÓN", 32, tableY + 4.5);
  docPdf.text("VALOR UNIT", 120, tableY + 4.5, { align: "right" });
  docPdf.text("VALOR VENTA", 145, tableY + 4.5, { align: "right" });
  docPdf.text("IGV", 168, tableY + 4.5, { align: "right" });
  docPdf.text("IMPORTE", 190, tableY + 4.5, { align: "right" });

  const rowY = tableY + 7;
  docPdf.setFillColor(255, 255, 255);
  docPdf.rect(15, rowY, 180, 10, "F");

  docPdf.setTextColor(15, 23, 42);
  docPdf.setFont("helvetica", "normal");
  docPdf.setFontSize(7.5);
  docPdf.text("1", 20, rowY + 6, { align: "center" });
  docPdf.text(`Derecho de Trámite — ${comprobante.descripcion_pago || comprobante.tipoTramite || 'Licencia Municipal de Funcionamiento'} (${expId})`, 32, rowY + 6);

  const totalMonto = Number(comprobante.monto_total || comprobante.monto || 3.00);
  const subtotalVal = (totalMonto / 1.18);
  const igvVal = (totalMonto - subtotalVal);

  docPdf.text(`S/ ${subtotalVal.toFixed(2)}`, 120, rowY + 6, { align: "right" });
  docPdf.text(`S/ ${subtotalVal.toFixed(2)}`, 145, rowY + 6, { align: "right" });
  docPdf.text(`S/ ${esFactura ? igvVal.toFixed(2) : "0.00"}`, 168, rowY + 6, { align: "right" });
  docPdf.text(`S/ ${totalMonto.toFixed(2)}`, 190, rowY + 6, { align: "right" });

  docPdf.setDrawColor(203, 213, 225);
  docPdf.setLineWidth(0.3);
  docPdf.line(15, rowY + 10, 195, rowY + 10);

  // 4. RESUMEN FINANCIERO Y VALOR EN LETRAS (SIN DUPLICAR TOTAL PAGADO)
  const summaryY = rowY + 14;

  docPdf.setFont("helvetica", "bold");
  docPdf.setFontSize(8.5);
  docPdf.setTextColor(15, 23, 42);
  docPdf.text(convertirNumeroALetras(totalMonto), 15, summaryY);

  docPdf.setFont("helvetica", "normal");
  docPdf.setFontSize(7.5);

  if (esFactura) {
    docPdf.text("VALOR DE VENTA: S/", 105, summaryY, { align: "right" });
    docPdf.text(`${subtotalVal.toFixed(2)}`, 125, summaryY, { align: "right" });

    docPdf.text("IGV (18%): S/", 145, summaryY, { align: "right" });
    docPdf.text(`${igvVal.toFixed(2)}`, 160, summaryY, { align: "right" });

    docPdf.setFont("helvetica", "bold");
    docPdf.setFontSize(9);
    docPdf.setTextColor(185, 28, 28);
    docPdf.text("IMPORTE TOTAL: S/", 175, summaryY, { align: "right" });
    docPdf.text(`${totalMonto.toFixed(2)}`, 195, summaryY, { align: "right" });
  } else {
    docPdf.setFont("helvetica", "bold");
    docPdf.setFontSize(9);
    docPdf.setTextColor(29, 78, 216);
    docPdf.text("IMPORTE TOTAL: S/", 175, summaryY, { align: "right" });
    docPdf.text(`${totalMonto.toFixed(2)}`, 195, summaryY, { align: "right" });
  }

  // 5. DETALLE DE PAGO (EFECTIVO VS FLOW / DIGITAL)
  const payDetailY = summaryY + 14;
  docPdf.setFillColor(248, 250, 252);
  docPdf.setDrawColor(203, 213, 225);
  docPdf.roundedRect(15, payDetailY, 180, 24, 2, 2, "FD");

  docPdf.setFont("helvetica", "bold");
  docPdf.setFontSize(8.5);
  docPdf.setTextColor(15, 23, 42);
  docPdf.text("INFORMACIÓN DETALLADA DEL PAGO", 20, payDetailY + 6);

  docPdf.setFont("helvetica", "normal");
  docPdf.setFontSize(7.5);
  const metodoStr = String(comprobante.metodo_pago || comprobante.metodoPago || 'EFECTIVO EN CAJA MUNICIPAL');
  const esEfectivo = metodoStr.toLowerCase().includes("efectivo");
  const cajeroResp = String(comprobante.cajeraResponsable || comprobante.cajera_responsable || comprobante.usuarioCajero || "MARÍA LÓPEZ").toUpperCase();

  docPdf.text(`Método de Pago: ${metodoStr.toUpperCase()}`, 20, payDetailY + 11);
  docPdf.text(`Estado del Pago: PAGO CONFIRMADO`, 20, payDetailY + 15);
  docPdf.text(`Cajero Responsable: ${cajeroResp}`, 20, payDetailY + 19);

  if (esEfectivo) {
    const rec = Number(comprobante.monto_recibido || comprobante.montoRecibido || 10.00);
    const vue = Number(comprobante.vuelto || (rec - totalMonto));
    docPdf.setFont("helvetica", "bold");
    docPdf.text(`Monto Recibido: S/ ${rec.toFixed(2)}`, 120, payDetailY + 11);
    docPdf.text(`Vuelto Entregado: S/ ${vue.toFixed(2)}`, 120, payDetailY + 15);
  } else {
    // SI FUE FLOW O TARJETA -> NO MOSTRAR RECIBIDO NI VUELTO. MOSTRAR TRANSACCIÓN Y ESTADO APROBADO
    const flowOp = comprobante.codigo_operacion || comprobante.numeroOperacion || comprobante.flowOrder || `FLOW-${expId.replace(/^EXP-/, '')}`;
    docPdf.setFont("helvetica", "bold");
    docPdf.text(`ID Transacción Flow: ${flowOp}`, 120, payDetailY + 11);
    docPdf.text(`Estado Transacción: APROBADO`, 120, payDetailY + 15);
    docPdf.text(`Código Autorización: AUTH-FLOW-${expId.replace(/^EXP-/, '')}`, 120, payDetailY + 19);
  }

  // 6. PIE DE SEGURIDAD SUNAT Y MENSAJE INSTITUCIONAL MANDATORIO
  const footerY = payDetailY + 30;
  docPdf.setDrawColor(203, 213, 225);
  docPdf.setLineWidth(0.4);
  docPdf.line(15, footerY, 195, footerY);

  const seedString = `${rucEstablecimiento}-${numSerieStr}-${totalMonto.toFixed(2)}`;
  let hashHex = "";
  for (let i = 0; i < 40; i++) {
    const charCode = (seedString.charCodeAt(i % seedString.length) * (i + 13) * 7) % 16;
    hashHex += charCode.toString(16);
  }
  const verifCode = `V-${expId.replace(/^EXP-/, '')}-2026`;

  docPdf.setFont("helvetica", "bold");
  docPdf.setFontSize(8);
  docPdf.setTextColor(15, 23, 42);
  docPdf.text(`Representación impresa de la ${esFactura ? "Factura Electrónica" : "Boleta de Venta Electrónica"}`, 15, footerY + 6);

  docPdf.setFont("helvetica", "normal");
  docPdf.setFontSize(7.5);
  docPdf.setTextColor(71, 85, 105);
  docPdf.text(`Moneda: PEN (Soles Peruanos)`, 15, footerY + 11);
  docPdf.setFontSize(7);
  docPdf.setTextColor(71, 85, 105);
  const msg1 = "Este comprobante acredita únicamente el pago del derecho de trámite y no constituye la aprobación";
  const msg2 = "de la licencia de funcionamiento. La licencia será emitida únicamente si el procedimiento concluye favorablemente.";
  docPdf.text(msg1, 15, footerY + 14);
  docPdf.text(msg2, 15, footerY + 18);

  // CÓDIGO QR VISIBLE
  const qrDataText = `20145532000|${esFactura ? '01' : '03'}|${numSerieStr}|${igvVal.toFixed(2)}|${totalMonto.toFixed(2)}|2026-07-22|${esFactura ? '6' : '1'}|${esFactura ? rucEstablecimiento : clienteDni}|${hashStr}`;
  try {
    const qrDataUrl = await QRCode.toDataURL(qrDataText, { margin: 1, width: 100 });
    docPdf.addImage(qrDataUrl, "PNG", 162, footerY + 2, 28, 28);
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
