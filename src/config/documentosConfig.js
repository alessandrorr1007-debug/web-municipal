export const DOCUMENTOS_DEFINICIONES = {
  identidad: {
    key: "identidad",
    label: "1. Documento de identidad del solicitante",
    hint: "DNI_Solicitante.pdf",
    tipo: "obligatorio"
  },
  ruc: {
    key: "ruc",
    label: "2. Ficha RUC SUNAT",
    hint: "Ficha_RUC.pdf",
    tipo: "obligatorio"
  },
  propiedad: {
    key: "propiedad",
    label: "3. Documento que acredita propiedad o uso del local",
    hint: "Contrato_Local.pdf",
    tipo: "obligatorio",
    isPropiedad: true
  },
  plano: {
    key: "plano",
    label: "4. Plano de distribución del establecimiento",
    hint: "Plano_Establecimiento.pdf",
    tipo: "obligatorio"
  },
  dj: {
    key: "dj",
    label: "5. Declaración jurada de seguridad",
    hint: "Declaracion_Jurada.pdf",
    tipo: "obligatorio"
  },
  sanitario: {
    key: "sanitario",
    label: "6. Certificado sanitario de salubridad",
    hint: "Certificado_Sanitario.pdf",
    tipo: "obligatorio"
  },
  autorizacion_sanitaria: {
    key: "autorizacion_sanitaria",
    label: "7. Autorización sanitaria del establecimiento",
    hint: "Autorizacion_Sanitaria.pdf",
    tipo: "obligatorio"
  },
  responsable_tecnico: {
    key: "responsable_tecnico",
    label: "8. Título/Colegiatura del Responsable Técnico",
    hint: "Responsable_Tecnico.pdf",
    tipo: "obligatorio"
  }
};

export const ACTIVIDADES_CONFIG = {
  restaurante: {
    nombre: "Restaurante",
    keywords: ["restaurante", "comidas", "bebidas", "cafeteria", "cater", "chifa", "polleria", "bar", "snack"],
    documentos: ["identidad", "ruc", "propiedad", "plano", "dj", "sanitario"]
  },
  farmacia: {
    nombre: "Farmacia / Botica / Establecimiento de Salud",
    keywords: ["farmacia", "botica", "medicamentos", "drogueria", "salud", "dental", "consultorio", "clinica"],
    documentos: ["identidad", "ruc", "propiedad", "plano", "dj", "autorizacion_sanitaria", "responsable_tecnico"]
  },
  barberia: {
    nombre: "Barbería / Peluquería / Salón de Belleza",
    keywords: ["barberia", "peluqueria", "estetica", "belleza", "salon de belleza", "spa", "cosmeto"],
    documentos: ["identidad", "ruc", "propiedad", "plano", "dj"]
  },
  oficina: {
    nombre: "Oficina Administrativa / Servicios Profesionales",
    keywords: ["oficina", "consultoria", "servicios profesionales", "administracion", "asesoria", "estudio juridico", "estudio contable", "agencia", "cowork"],
    documentos: ["identidad", "ruc", "propiedad", "dj"]
  },
  default: {
    nombre: "Comercio / Otros Servicios",
    keywords: [],
    documentos: ["identidad", "ruc", "propiedad", "plano", "dj"]
  }
};

export const determinarActividad = (giro) => {
  if (!giro) return "default";
  const normalized = giro.toLowerCase();
  
  for (const [key, value] of Object.entries(ACTIVIDADES_CONFIG)) {
    if (key === "default") continue;
    if (value.keywords.some(keyword => normalized.includes(keyword))) {
      return key;
    }
  }
  return "default";
};
