export const GROS_DISPONIBLES = [
  { value: "restaurante", label: "Restaurante / Cafeteria" },
  { value: "farmacia", label: "Farmacia" },
  { value: "hotel", label: "Hotel / Hospedaje" },
  { value: "tienda", label: "Tienda / Minimarket" },
  { value: "ferreteria", label: "Ferreteria" },
  { value: "taller", label: "Taller Mecanico" },
  { value: "estetica", label: "Centro de Estetica / Barberia" },
  { value: "abogado", label: "Despacho Juridico / Abogado" },
  { value: "consultorio", label: "Consultorio Medico / Odontologico" },
  { value: "academia", label: "Academia / Instituto de Educacion" },
  { value: "tecnologia", label: "Cyber / Tecnologia" },
  { value: "construccion", label: "Construccion / Materiales" },
  { value: "transporte", label: "Transporte / Logistica" },
  { value: "agro", label: "Agro / Campo / Ganaderia" },
  { value: "general", label: "General / Otro" },
];

const BASE_DOCUMENTOS = [
  {
    categoria: "Identificacion",
    documentos: [
      { id: "dni", nombre: "DNI del titular", obligatorio: true },
      { id: "carnet_inei", nombre: "Carnet INEI (si aplica)", obligatorio: false },
    ],
  },
  {
    categoria: "Establecimiento",
    documentos: [
      { id: "constancia_domicilio", nombre: "Constancia de domicilio o recibos de servicios", obligatorio: true },
      { id: "plano_ubicacion", nombre: "Plano de ubicacion / Croquis del local", obligatorio: false },
      { id: "fotos_local", nombre: "Fotografias del local (frente, interior, letrero)", obligatorio: true },
    ],
  },
];

const DOC_NEGOCIO_ESPECIFICO = {
  restaurante: {
    etiqueta: "Restaurante / Cafeteria",
    documentos: [
      { id: "licencia_sanitaria", nombre: "Licencia de Funcionamiento Sanitario (DIGESA/SMV)", obligatorio: true },
      { id: "certificado_manipulador", nombre: "Certificado de Manipulador de Alimentos", obligatorio: true },
      { id: "plan_cocina", nombre: "Plano de Area de Cocina y Despacho", obligatorio: false },
      { id: "libro_fumigacion", nombre: "Libro de Fumigacion y Control de Plagas", obligatorio: false },
      { id: "fotos_cocina", nombre: "Fotografias de area de cocinas y almacen", obligatorio: false },
      { id: "contrato_alquiler", nombre: "Contrato de Arrendamiento / Titulo de Propiedad", obligatorio: true },
    ],
  },
  farmacia: {
    etiqueta: "Farmacia",
    documentos: [
      { id: "registro_digemid", nombre: "Registro Sanitario DIGEMID del Local", obligatorio: true },
      { id: "personal_habil", nombre: "DNI y Colegiatura del Quimico Farmaceutico Responsable", obligatorio: true },
      { id: "plano_ambientes", nombre: "Plano de Ambientes con areas diferenciadas", obligatorio: true },
      { id: "inventario_medicamentos", nombre: "Inventario de Estanteria y Zona de Medicamentos", obligatorio: false },
      { id: "libro_farmaco", nombre: "Libro de Registro de Farmacos Controlados", obligatorio: false },
      { id: "fotos_ambientes", nombre: "Fotografias de todos los ambientes", obligatorio: false },
      { id: "contrato_alquiler", nombre: "Contrato de Arrendamiento / Titulo de Propiedad", obligatorio: true },
    ],
  },
  hotel: {
    etiqueta: "Hotel / Hospedaje",
    documentos: [
      { id: "registro_sutur", nombre: "Registro SUTUR / Certificado de Funcionamiento", obligatorio: true },
      { id: "plano_hotel", nombre: "Plano de Distribucion de Habitaciones y Zonas Comunes", obligatorio: true },
      { id: "extintores", nombre: "Constancia de Mantenimiento de Extintores", obligatorio: true },
      { id: "libro_fumigacion_hotel", nombre: "Libro de Fumigacion", obligatorio: false },
      { id: "fotos_habitaciones", nombre: "Fotografias de habitaciones y zonas comunes", obligatorio: false },
      { id: "contrato_alquiler", nombre: "Contrato de Arrendamiento / Titulo de Propiedad", obligatorio: true },
    ],
  },
  tienda: {
    etiqueta: "Tienda / Minimarket",
    documentos: [
      { id: "sunat_constancia", nombre: "Constancia de Inscripcion SUNAT", obligatorio: true },
      { id: "plano_local", nombre: "Plano del Local", obligatorio: false },
      { id: "fotos_local", nombre: "Fotografias del Local (frente y estanteria)", obligatorio: false },
      { id: "contrato_alquiler", nombre: "Contrato de Arrendamiento / Titulo de Propiedad", obligatorio: true },
    ],
  },
  ferreteria: {
    etiqueta: "Ferreteria",
    documentos: [
      { id: "sunat_constancia", nombre: "Constancia de Inscripcion SUNAT", obligatorio: true },
      { id: "plano_almacen", nombre: "Plano del Local y Zona de Almacen", obligatorio: false },
      { id: "fotos_local", nombre: "Fotografias del Local", obligatorio: false },
      { id: "contrato_alquiler", nombre: "Contrato de Arrendamiento / Titulo de Propiedad", obligatorio: true },
    ],
  },
  taller: {
    etiqueta: "Taller Mecanico",
    documentos: [
      { id: "certificado_ambiental", nombre: "Certificado de Impacto Ambiental / Declaracion Jurada Ambiental", obligatorio: true },
      { id: "sunat_constancia", nombre: "Constancia de Inscripcion SUNAT", obligatorio: true },
      { id: "plano_taller", nombre: "Plano del Taller con areas de servicio", obligatorio: false },
      { id: "fotos_taller", nombre: "Fotografias del Taller y Equipamiento", obligatorio: false },
      { id: "contrato_alquiler", nombre: "Contrato de Arrendamiento / Titulo de Propiedad", obligatorio: true },
    ],
  },
  estetica: {
    etiqueta: "Centro de Estetica / Barberia",
    documentos: [
      { id: "certificado_sanitario", nombre: "Certificado de Habilitacion Sanitaria", obligatorio: true },
      { id: "personal_capacitado", nombre: "Certificados de Capacitacion del Personal", obligatorio: false },
      { id: "inventario_equipos", nombre: "Inventario de Equipos y Herramientas", obligatorio: false },
      { id: "fotos_local", nombre: "Fotografias del Local", obligatorio: false },
      { id: "contrato_alquiler", nombre: "Contrato de Arrendamiento / Titulo de Propiedad", obligatorio: true },
    ],
  },
  abogado: {
    etiqueta: "Despacho Juridico",
    documentos: [
      { id: "colegiatura", nombre: "Colegiatura del Abogado", obligatorio: true },
      { id: "sunat_constancia", nombre: "Constancia de Inscripcion SUNAT", obligatorio: true },
      { id: "plano_despacho", nombre: "Plano o Croquis del Despacho", obligatorio: false },
      { id: "fotos_despacho", nombre: "Fotografias del Despacho", obligatorio: false },
      { id: "contrato_alquiler", nombre: "Contrato de Arrendamiento / Titulo de Propiedad", obligatorio: true },
    ],
  },
  consultorio: {
    etiqueta: "Consultorio Medico / Odontologico",
    documentos: [
      { id: "registro_cmp", nombre: "Registro CMP / CNO del Profesional", obligatorio: true },
      { id: "licencia_sanitaria", nombre: "Licencia de Funcionamiento Sanitario", obligatorio: true },
      { id: "plano_consultorio", nombre: "Plano de Ambientes con zonas limpias/sucias", obligatorio: true },
      { id: "bioseguridad", nombre: "Protocolo de Bioseguridad", obligatorio: true },
      { id: "fotos_consultorio", nombre: "Fotografias del Consultorio y Equipamiento", obligatorio: false },
      { id: "contrato_alquiler", nombre: "Contrato de Arrendamiento / Titulo de Propiedad", obligatorio: true },
    ],
  },
  academia: {
    etiqueta: "Academia / Instituto",
    documentos: [
      { id: "licencia_minedu", nombre: "Licencia de Funcionamiento MINEDU", obligatorio: true },
      { id: "plano_aulas", nombre: "Plano de Aulas y Zonas Comunes", obligatorio: false },
      { id: "fotos_aulas", nombre: "Fotografias de Aulas y Zonas Comunes", obligatorio: false },
      { id: "contrato_alquiler", nombre: "Contrato de Arrendamiento / Titulo de Propiedad", obligatorio: true },
    ],
  },
  tecnologia: {
    etiqueta: "Cyber / Tecnologia",
    documentos: [
      { id: "sunat_constancia", nombre: "Constancia de Inscripcion SUNAT", obligatorio: true },
      { id: "plano_local", nombre: "Plano del Local", obligatorio: false },
      { id: "inventario_equipos", nombre: "Inventario de Equipos Informaticos", obligatorio: false },
      { id: "fotos_local", nombre: "Fotografias del Local", obligatorio: false },
      { id: "contrato_alquiler", nombre: "Contrato de Arrendamiento / Titulo de Propiedad", obligatorio: true },
    ],
  },
  construccion: {
    etiqueta: "Construccion / Materiales",
    documentos: [
      { id: "sunat_constancia", nombre: "Constancia de Inscripcion SUNAT", obligatorio: true },
      { id: "certificado_seguridad", nombre: "Certificado de Seguridad en la Construccion", obligatorio: false },
      { id: "plano_local", nombre: "Plano del Local / Almacen", obligatorio: false },
      { id: "fotos_local", nombre: "Fotografias del Local", obligatorio: false },
      { id: "contrato_alquiler", nombre: "Contrato de Arrendamiento / Titulo de Propiedad", obligatorio: true },
    ],
  },
  transporte: {
    etiqueta: "Transporte / Logistica",
    documentos: [
      { id: "sunat_constancia", nombre: "Constancia de Inscripcion SUNAT", obligatorio: true },
      { id: "plano_local", nombre: "Plano de la Sede / Local", obligatorio: false },
      { id: "fotos_local", nombre: "Fotografias de la Sede", obligatorio: false },
      { id: "contrato_alquiler", nombre: "Contrato de Arrendamiento / Titulo de Propiedad", obligatorio: true },
    ],
  },
  agro: {
    etiqueta: "Agro / Campo",
    documentos: [
      { id: "sunat_constancia", nombre: "Constancia de Inscripcion SUNAT", obligatorio: true },
      { id: "certificado_agro", nombre: "Certificado de Buenas Practicas Agricolas (si aplica)", obligatorio: false },
      { id: "plano_propiedad", nombre: "Plano de la Propiedad o Predio", obligatorio: false },
      { id: "fotos_predio", nombre: "Fotografias del Predio", obligatorio: false },
    ],
  },
  general: {
    etiqueta: "General / Otro",
    documentos: [
      { id: "sunat_constancia", nombre: "Constancia de Inscripcion SUNAT", obligatorio: true },
      { id: "plano_local", nombre: "Plano del Local", obligatorio: false },
      { id: "fotos_local", nombre: "Fotografias del Local", obligatorio: false },
      { id: "contrato_alquiler", nombre: "Contrato de Arrendamiento / Titulo de Propiedad", obligatorio: true },
    ],
  },
};

const DOCUMENTOS_SISTEMA = [
  { id: "factura", nombre: "Factura / Boleta de Pago", obligatorio: true },
  { id: "comprobante_pago", nombre: "Comprobante de Pago del Arancel", obligatorio: true },
  { id: "licencia_emitida", nombre: "Licencia Emitida", obligatorio: false },
];

export const obtenerDocumentosPorGiro = (giro) => {
  return {
    ciudadano: [
      { id: "plano_local", nombre: "Plano Arquitectónico y de Distribución del Local (PDF)", obligatorio: true }
    ],
    sistema: DOCUMENTOS_SISTEMA.map((d) => ({ ...d, tipo: "sistema" })),
    giroLabel: "Plano del Local (PDF Obligatorio)",
  };
};

export const obtenerClaseDocRequerido = (docId, archivosExistentes, ciudadano = true) => {
  if (!archivosExistentes || archivosExistentes.length === 0) return "no-subido";
  return "subido";
};
