# Sistema Municipal de Licencias de Funcionamiento

Aplicación web profesional de Licencias de Funcionamiento diseñada para la **Municipalidad de Trujillo**. Arquitectura SPA híbrida cliente-servidor con panel multi-rol, pagos en línea y gestión completa de expedientes.

---

## Arquitectura

```
WebMunicipal/
├── frontend/               React 19 + Vite 8
│   ├── src/
│   │   ├── components/     Paneles por rol, Login, Sidebar, etc.
│   │   ├── config/         Estados, documentos, inspecciones
│   │   ├── context/        AuthContext (Firebase Auth)
│   │   ├── services/       API calls (auth, pagos, DNI/RUC, PDF, etc.)
│   │   └── firebase.js     Configuración Firebase
│   ├── index.html
│   └── vite.config.js
├── backend/                Express 5 + Node.js
│   ├── server.js           API REST + SPA fallback
│   ├── emailProvider.js    Wrapper Nodemailer (Gmail SMTP)
│   └── scripts/
│       └── setup-users.js  Seed de usuarios de prueba (Firebase Admin)
├── render.yaml             Configuración de despliegue
└── package.json            Scripts raíz (dev, build, start)
```

## Stack Tecnológico

| Capa | Tecnologías |
|------|-------------|
| Frontend | React 19, Vite 8, Vanilla CSS |
| Backend | Express 5, Node.js, Axios |
| Base de datos | Firebase Auth + Firestore |
| Pagos | Flow (producción) + Caja Municipal (presencial) + Demo |
| Documentos | DNI y RUC vía Decolecta (RENIEC/SUNAT) |
| Correo | Nodemailer (Gmail SMTP) |
| PDF | jsPDF + QRCode |
| Despliegue | Render.com |

---

## Roles del Sistema

### 1. Administrador (`medicitasapp01@gmail.com` / `admin321`)
- Dashboard con métricas y gráficos globales
- Gestión de usuarios (Cajeros, Funcionarios, Inspectores)
- Gestión de roles
- Configuración del sistema
- Reportes consolidados
- Auditoría de bitácora

### 2. Cajero (`alessandropaul19@gmail.com` / `cajeroprueba`)
- Creación de nuevas solicitudes (wizard multi-paso)
- Búsqueda de trámites por DNI, correo o N° Expediente
- Validación SUNAT (estado y condición obligatorios)
- Cobro de tasa (S/ 3.00) y generación de comprobante
- 3 opciones de pago: Flow en línea, Caja presencial, Demo simulación

### 3. Funcionario
- Evaluación y revisión de expedientes pagados
- Aprobación, observación o rechazo de solicitudes
- Programación de inspecciones (fecha mínima: mañana, máximo 4/día por inspector)
- Asignación automática de inspector y franja horaria

### 4. Inspector (`arodriguezr1020@gmail.com` / `inspectorprueba`)
- Panel de agenda del día con visitas programadas
- Subida de hasta 2 evidencias fotográficas
- Registro de resultado: Aprobado, Observado o No atendido
- Regla de doble observación (2da observación = rechazo definitivo)

### 5. Solicitante (Negocio / Contribuyente)
- Registro validado por DNI
- Creación de solicitudes con carga de documentos PDF
- Selección de método de pago
- Consulta de trámites y descarga de licencias (PDF + QR)

---

## Ciclo de Vida del Trámite

```
Registrado → Pendiente de pago → Pagado → En revisión → Inspección programada
    → Inspección realizada → Aprobado → Licencia emitida
    
    En cualquier punto puede pasar a: Observado → Reprogramado → ...
    O directamente a: Rechazado
```

**Estados:** Registrado, Pendiente de pago, Pagado, En revisión, Inspección programada, Inspección realizada, Observado, Reprogramado, Aprobado, Licencia emitida, Rechazado

---

## Instalación y Ejecución Local

### Prerrequisitos
- Node.js v18+
- Cuenta de Firebase (Auth + Firestore)

### 1. Instalar dependencias

```bash
# Desde la raíz
npm run install:all
```

Esto instala dependencias en `frontend/` y `backend/`.

### 2. Configurar variables de entorno

**`frontend/.env`** (ya creado con valores de ejemplo):
```env
VITE_FIREBASE_API_KEY=tu_api_key
VITE_FIREBASE_AUTH_DOMAIN=tu_proyecto.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=tu_proyecto_id
VITE_FIREBASE_STORAGE_BUCKET=tu_proyecto.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=tu_sender_id
VITE_FIREBASE_APP_ID=tu_app_id
VITE_API_URL=http://localhost:3000
```

**`backend/.env`**:
```env
PORT=3000
DECOLECTA_TOKEN=tu_token_decolecta
SMTP_EMAIL=tu_correo_gmail
SMTP_PASSWORD=tu_app_password_gmail
FLOW_API_KEY=tu_api_key_flow
FLOW_SECRET_KEY=tu_secret_key_flow
FLOW_ENV=production
PAYMENT_DEMO_ENABLED=true
FRONTEND_URL=http://localhost:5173
```

### 3. Crear usuarios de prueba (opcional)

Descarga `firebase-service-account.json` desde Firebase Console → Project Settings → Service Accounts y guárdalo en `backend/`.

```bash
npm run setup-users
```

Esto crea los 3 usuarios de prueba en Firebase Auth + Firestore.

### 4. Levantar el sistema

```bash
# Frontend (terminal 1)
cd frontend && npm run dev

# Backend (terminal 2)
cd backend && npm run start   # o desde raíz: npm start
```

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:3000`

### 5. Build para producción

```bash
npm run build    # Compila frontend/ → frontend/dist/
npm start        # Inicia backend que sirve frontend/dist/
```

---

## Despliegue en Render

El archivo `render.yaml` configura automáticamente:
- **Build:** `cd frontend && npm install && npm run build && cd ../backend && npm install`
- **Start:** `node backend/server.js`

El backend sirve los archivos estáticos de `frontend/dist/` y maneja el SPA fallback.

---

## APIs Externas

| Servicio | Uso | Endpoint Backend |
|----------|-----|------------------|
| Decolecta | Consulta DNI (RENIEC) | `/api/consultar-dni/:numero` |
| Decolecta | Consulta RUC (SUNAT) | `/api/consultar-ruc/:numero` |
| Flow | Crear orden de pago | `/api/pagos/crear-orden` |
| Flow | Verificar pago | `/api/pagos/verificar/:token` |
| Flow | Callback webhook | `/api/pagos/flow/callback` |

---

## Usuarios de Prueba

| Rol | Email | Contraseña |
|-----|-------|------------|
| Cajero | `alessandropaul19@gmail.com` | `cajeroprueba` |
| Inspector | `arodriguezr1020@gmail.com` | `inspectorprueba` |
| Administrador | `medicitasapp01@gmail.com` | `admin321` |

---

## Comandos Disponibles

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Frontend en modo desarrollo (Vite) |
| `npm run build` | Compilar frontend para producción |
| `npm start` | Iniciar backend en producción |
| `npm run setup-users` | Crear usuarios de prueba en Firebase |
| `npm run install:all` | Instalar dependencias de frontend + backend |
