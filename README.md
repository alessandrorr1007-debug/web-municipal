# Sistema Municipal de Licencias de Funcionamiento - Municipalidad de Trujillo

Este proyecto es una aplicación web profesional de Licencias de Funcionamiento diseñada para ser utilizada por una municipalidad real. Emplea un diseño moderno, limpio, responsivo y adaptado a las normativas de la Municipalidad de Trujillo.

---

## 🚀 Arquitectura y Tecnologías

El sistema utiliza una arquitectura SPA híbrida cliente-servidor:
1. **Frontend**: React.js, Vite y Vanilla CSS (Diseño premium con paleta de colores institucionales).
2. **Backend**: Node.js, Express, Axios y Nodemailer.
3. **Base de Datos y Seguridad**: Firebase Auth y Firestore para control de sesiones, roles y persistencia en tiempo real.
4. **Integración con APIs Externas**:
   - **Consulta de DNI**: Validación automática usando la API de Decolecta (RENIEC).
   - **Consulta de RUC**: Autocompletado de datos del local usando la API de Decolecta (SUNAT).
   - **Pasarela de Pagos**: Mercado Pago Checkout Pro (Ambiente Sandbox) y simulación de Caja Municipal.
   - **Notificaciones por Correo**: Nodemailer con envío de códigos OTP.

---

## 👥 Roles del Sistema

El sistema cuenta exactamente con **5 roles** integrados con validaciones y seguridad en rutas y componentes:

1. **Administrador**:
   - Acceso a un Dashboard con métricas y gráficos globales del sistema.
   - Gestión de usuarios internos (Cajeros y Funcionarios).
   - **Restricción estricta de Inspector Único**: Bloquea la posibilidad de crear un segundo inspector; solo permite editar, activar/desactivar y cambiar la contraseña del inspector único.
   - Auditoría de bitácora y configuración general de parámetros.

2. **Solicitante (Negocio / Contribuyente)**:
   - Registro validado por DNI (bloqueado el ingreso manual de nombres).
   - Creación de nuevas solicitudes de licencia de funcionamiento (Validación de RUC, carga de documentos PDF).
   - Selección de métodos de pago (Mercado Pago online o Pago presencial en Caja).
   - Panel de consulta de trámites y descarga de licencias emitidas (PDF + código QR).

3. **Cajero (Caja Municipal)**:
   - Dashboard de recaudación.
   - Búsqueda de trámites pendientes de cobro por DNI, Correo o Nro. Expediente.
   - Cobro de tasa de S/ 3.00, generación de operación y cambio automático de estado a `Pagado`.
   - Generación y simulación de impresión de comprobantes de pago (tique de caja municipal).

4. **Funcionario (Mesa de Partes / Evaluador)**:
   - Evaluación y revisión de expedientes pagados o en revisión.
   - Aprobación, observación o rechazo de solicitudes.
   - Programación de inspecciones en local eligiendo Fecha y Hora en un modal, asignando automáticamente al inspector único.

5. **Inspector (Campo)**:
   - Panel de agenda del día donde ve sus visitas programadas (Negocio, Dirección, Responsable, Teléfono, Fecha y Hora).
   - Subida de hasta 2 evidencias fotográficas desde local.
   - Registro de resultado: **Aprobado**, **Observado** o **No atendido**.
   - **Regla de Doble Observación**: La primera observación reprograma la visita automáticamente para 30 días después; la segunda reobservación rechaza la solicitud de forma definitiva.

---

## 📈 Ciclo de Vida del Trámite (11 Estados)

1. `Registrado`
2. `Pendiente de pago`
3. `Pagado`
4. `En revisión`
5. `Inspección programada`
6. `Inspección realizada`
7. `Observado`
8. `Reprogramado`
9. `Aprobado`
10. `Licencia emitida`
11. `Rechazado`

---

## 💻 Instalación y Ejecución Local

### Prerrequisitos
- Node.js (v18 o superior)
- Cuenta/Configuración de Firebase Firestore y Auth

### 1. Variables de Entorno (.env)

Crea un archivo `.env` en la raíz del proyecto y otro en la carpeta `backend/.env` con la configuración correspondiente:

**En `backend/.env`**:
```env
PORT=3000
DECOLECTA_TOKEN=tu_token_decolecta
MERCADOPAGO_ACCESS_TOKEN=tu_token_mercado_pago
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_EMAIL=tu_correo_gmail
SMTP_PASSWORD=tu_app_password_gmail
```

### 2. Levantar el Backend
```bash
npm install
npm start
```
El servidor backend correrá en `http://localhost:3000`.

### 3. Levantar el Frontend
En otra terminal desde la raíz:
```bash
npm run dev
```
El frontend abrirá en `http://localhost:5173`.
