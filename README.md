# Sistema Municipal de Licencias de Funcionamiento

Aplicación web profesional para la gestión integral de **Licencias de Funcionamiento Municipal** diseñada para la **Municipalidad Provincial de Trujillo**.

[![Estado del Despliegue](https://img.shields.io/badge/Despliegue-Render.com-green.svg)](https://webmunicipal.onrender.com)
[![Licencia](https://img.shields.io/badge/Municipalidad-Trujillo-blue.svg)](#)

---

## 📄 Guía Completa de Funcionamiento

Para conocer a detalle el funcionamiento paso a paso de los roles **Administrador**, **Cajero** e **Inspector**, consulta el archivo de documentación oficial:

👉 **[MANUAL_SISTEMA.md](MANUAL_SISTEMA.md)**

---

## 🏛️ Estructura y Roles del Sistema

| Rol | Función Principal | Funcionalidades Clave |
|-----|------------------|----------------------|
| 🛡️ **Administrador** | Gestión de Usuarios y Seguridad | • Registro de cuentas para Cajeros e Inspectores.<br>• Protección de Rol Administrador (`🛡️ Protegido`).<br>• Inhabilitación / Activación de cuentas.<br>• Eliminación síncrona en Firestore y Firebase Auth.<br>• Control de Sesión Única Activa (`sessionStorage`). |
| 💰 **Cajera Municipal** | Registro Presencial y Cobro de Tasa | • Validación obligatoria RENIEC (DNI 8 dígitos).<br>• Validación obligatoria SUNAT (RUC 11 dígitos, ACTIVO, HABIDO y Jurisdicción Trujillo).<br>• Carga de Plano PDF del Local Comercial.<br>• Cobro de Tasa Municipal (S/ 3.00) irreversible y emisión de Boleta.<br>• Asignación automática de fecha/horario e inspector (Máx 4/día).<br>• Notificación/Correo automático al ciudadano. |
| 🔍 **Inspector Municipal** | Inspección Técnica y Dictamen | • Vista directa de **Inspecciones de Hoy**.<br>• Visibilidad de Celular y Correo del ciudadano.<br>• Dictamen técnico en terreno (**Aprobar** / **Desaprobar**).<br>• Carga de hasta 2 fotografías de evidencia.<br>• **Historial de Inspecciones Atendidas** con Buscador (DNI, RUC, Expediente) y Filtro por Dictamen (**Aprobadas** / **Desaprobadas**). |

---

## 🛠️ Stack Tecnológico

| Capa | Tecnologías |
|------|-------------|
| **Frontend** | React 19, Vite 8, Vanilla CSS |
| **Backend** | Express 5, Node.js |
| **Autenticación & BD** | Firebase Auth + Firebase Cloud Firestore |
| **APIs Externas** | Decolecta API (RENIEC para DNI / SUNAT para RUC) |
| **Notificaciones** | Nodemailer (Gmail SMTP) |
| **Despliegue** | Render.com (SPA + Express REST API) |

---

## 🔑 Credenciales de Prueba

| Rol | Correo Electrónico | Contraseña |
|-----|-------------------|------------|
| **Administrador** | `medicitasapp01@gmail.com` | `admin321` |
| **Cajera** | `alessandropaul19@gmail.com` | `cajeroprueba` |
| **Inspector** | `arodriguezr1020@gmail.com` | `inspectorprueba` |

---

## 💻 Ejecución Local

### Prerrequisitos
- Node.js v18+
- Proyecto Firebase activo

### 1. Instalación de Dependencias

```bash
# Instala dependencias en frontend y backend
npm run install:all
```

### 2. Variables de Entorno

**`frontend/.env`**:
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
FRONTEND_URL=http://localhost:5173
```

### 3. Iniciar Servidores de Desarrollo

```bash
# Terminal 1 - Frontend (Vite)
cd frontend && npm run dev

# Terminal 2 - Backend (Express)
cd backend && npm run start
```

---

## 🚀 Despliegue en Render

El repositorio está listo para despliegue continuo en **Render.com** mediante `render.yaml`:
- **Build Command:** `cd frontend && npm install && npm run build && cd ../backend && npm install`
- **Start Command:** `node backend/server.js`

El servidor Express sirve los activos estáticos del frontend desde `frontend/dist` con soporte para enrutamiento SPA.
