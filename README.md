# Sistema Municipal de Licencias de Funcionamiento - Municipalidad de Trujillo

Este proyecto es una aplicacion web profesional de Licencias de Funcionamiento disenada para ser utilizada por una municipalidad real. Emplea un diseno moderno, limpio, responsivo y adaptado a las normativas de la Municipalidad de Trujillo.

---

## Arquitectura y Tecnologias

El sistema utiliza una arquitectura SPA hibrida cliente-servidor:
1. **Frontend**: React.js, Vite y Vanilla CSS (Diseno premium con paleta de colores institucionales).
2. **Backend**: Node.js, Express, Axios y Nodemailer.
3. **Base de Datos y Seguridad**: Firebase Auth y Firestore para control de sesiones, roles y persistencia en tiempo real.
4. **Integracion con APIs Externas**:
   - **Consulta de DNI**: Validacion automatica usando la API de Decolecta (RENIEC).
   - **Consulta de RUC**: Autocompletado de datos del local usando la API de Decolecta (SUNAT).
   - **Pasarela de Pagos**: Flow (Produccion) y Caja Municipal.
   - **Notificaciones por Correo**: Nodemailer con envio de codigos OTP.

---

## Roles del Sistema

El sistema cuenta exactamente con **5 roles** integrados con validaciones y seguridad en rutas y componentes:

1. **Administrador**:
   - Acceso a un Dashboard con metricas y graficos globales del sistema.
   - Gestion de usuarios internos (Cajeros y Funcionarios).
   - Auditoria de bitacora y configuracion general de parametros.

2. **Solicitante (Negocio / Contribuyente)**:
   - Registro validado por DNI (bloqueado el ingreso manual de nombres).
   - Creacion de nuevas solicitudes de licencia de funcionamiento (Validacion de RUC, carga de documentos PDF).
   - Seleccion de metodos de pago (Flow online o Pago presencial en Caja).
   - Panel de consulta de tramites y descarga de licencias emitidas (PDF + codigo QR).

3. **Cajero (Caja Municipal)**:
   - Dashboard de recaudacion.
   - Busqueda de tramites pendientes de cobro por DNI, Correo o Nro. Expediente.
   - Cobro de tasa de S/ 3.00, generacion de operacion y cambio automatico de estado a `Pagado`.
   - Generacion y simulacion de impresion de comprobantes de pago (tique de caja municipal).

4. **Funcionario (Mesa de Partes / Evaluador)**:
   - Evaluacion y revision de expedientes pagados o en revision.
   - Aprobacion, observacion o rechazo de solicitudes.
   - Programacion de inspecciones en local eligiendo Fecha y Hora en un modal, asignando automaticamente al inspector unico.

5. **Inspector (Campo)**:
   - Panel de agenda del dia donde ve sus visitas programadas (Negocio, Direccion, Responsable, Telefono, Fecha y Hora).
   - Subida de hasta 2 evidencias fotograficas desde local.
   - Registro de resultado: **Aprobado**, **Observado** o **No atendido**.
   - **Regla de Doble Observacion**: La primera observacion reprograma la visita automaticamente para 30 dias despues; la segunda reobservacion rechaza la solicitud de forma definitiva.

---

## Ciclo de Vida del Tramite (11 Estados)

1. `Registrado`
2. `Pendiente de pago`
3. `Pagado`
4. `En revision`
5. `Inspeccion programada`
6. `Inspeccion realizada`
7. `Observado`
8. `Reprogramado`
9. `Aprobado`
10. `Licencia emitida`
11. `Rechazado`

---

## Instalacion y Ejecucion Local

### Prerrequisitos
- Node.js (v18 o superior)
- Cuenta/Configuracion de Firebase Firestore y Auth

### 1. Variables de Entorno (.env)

Crea un archivo `.env` en la raiz del proyecto y otro en la carpeta `backend/.env` con la configuracion correspondiente:

**En `backend/.env`**:
```env
PORT=3000
DECOLECTA_TOKEN=tu_token_decolecta
SMTP_EMAIL=tu_correo_gmail
SMTP_PASSWORD=tu_app_password_gmail
FLOW_API_KEY=tu_api_key_flow
FLOW_SECRET_KEY=tu_secret_key_flow
FLOW_ENV=production
```

### 2. Levantar el Backend
```bash
npm install
npm start
```
El servidor backend correra en `http://localhost:3000`.

### 3. Levantar el Frontend
En otra terminal desde la raiz:
```bash
npm run dev
```
El frontend abrira en `http://localhost:5173`.
