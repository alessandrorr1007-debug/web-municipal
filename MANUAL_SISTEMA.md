# Manual de Funcionamiento del Sistema Municipal de Licencias

Este documento detalla el funcionamiento completo del **Sistema Web de Licencias de Funcionamiento** para la **Municipalidad Provincial de Trujillo**, especificando las responsabilidades, flujos de trabajo y capacidades de cada rol del sistema: **Administrador**, **Cajero** e **Inspector**.

---

## 📌 Resumen General del Sistema

El sistema gestiona de manera integral el procedimiento administrativo de emisión de **Licencias de Funcionamiento Municipal**, desde el registro presencial en ventanilla y cobro de la tasa, hasta la inspección técnica en terreno y emisión del dictamen final.

### Flujo Principal del Expediente
```
[Ventanilla / Cajero] ➔ [Validación RENIEC / SUNAT] ➔ [Carga de Plano PDF]
 ➔ [Cobro Tasa S/ 3.00 (Irreversible)] ➔ [Programación Automática de Inspección]
 ➔ [Notificación por Correo al Ciudadano] ➔ [Inspección Técnica en Terreno]
 ➔ [Dictamen Final: Aprobado / Desaprobado] ➔ [Registro en Historial Auditado]
```

---

## 🛡️ 1. Rol Administrador

El Administrador es la autoridad central encargada de velar por la seguridad, integridad y gestión de usuarios del sistema.

### Credenciales y Acceso
- **Correo Principal:** `medicitasapp01@gmail.com`
- **Rol:** `administrador`

### Funcionalidades Clave

#### A. Gestión de Cuentas de Usuarios (`/gestion-usuarios`)
* **Creación de Cuentas:** Permite registrar nuevas cuentas del sistema asignando los roles operativos de **Cajero** e **Inspector**.
* **Protección del Rol Administrador:** El rol de la cuenta principal de Administrador está protegido con la etiqueta `🛡️ Protegido` y la norma de Administrador Único. En el modal de edición, el campo de rol permanece **deshabilitado (`disabled`)** con la viñeta:
  > `🔒 El rol de la cuenta de Administrador está protegido y no se puede modificar.`
* **Inhabilitación / Activación de Cuentas:** Puede cambiar en tiempo real el estado de cualquier usuario entre `Activo` e `Inactivo`.
* **Eliminación Total (Firestore + Firebase Auth):** Al eliminar un usuario desde la interfaz, el sistema ejecuta la eliminación síncrona en la base de datos Firestore y en el servicio de autenticación Firebase Auth mediante la API administrativa.

#### B. Control de Sesión Única Activa
* Cada cuenta cuenta con un identificador de sesión único (`sesionId`) gestionado por pestaña (`sessionStorage`).
* Si se inicia sesión en una misma cuenta desde otro navegador, dispositivo o pestaña, el inicio de sesión anterior detecta el cambio en tiempo real, finaliza la sesión (`signOut`) y notifica al usuario:
  > `⚠️ Se ha iniciado sesión en esta cuenta desde otro navegador o dispositivo. Su sesión anterior ha sido cerrada.`

---

## 💰 2. Rol Cajera Municipal

La Cajera atiende al ciudadano en ventanilla, realiza las verificaciones oficiales con entidades del Estado, cobra la tasa municipal y agenda la visita técnica.

### Credenciales de Ejemplo
- **Correo Principal:** `alessandropaul19@gmail.com`
- **Rol:** `cajero`

### Funcionalidades Clave

#### A. Registro Presencial de Solicitud de Licencia
1. **Validación de Identidad RENIEC (Paso 1):**
   - Ingrese el DNI del solicitante (8 dígitos).
   - Consulta síncrona a RENIEC: Autocompleta de forma obligatoria los nombres y apellidos oficiales (campos bloqueados para evitar alteraciones).
2. **Datos de Contacto (Paso 2):**
   - Registra el **Número de Teléfono Celular** (9 dígitos que inician con 9) y el **Correo Electrónico de Notificaciones** del ciudadano.
3. **Validación del Establecimiento Comercial SUNAT (Paso 3):**
   - Ingrese el RUC de 11 dígitos.
   - Consulta síncrona a SUNAT: Verifica Razón Social, Nombre Comercial, Dirección Fiscal, Distrito, Provincia y Departamento.
   - **Reglas de Control SUNAT:**
     * **Estado del Contribuyente:** Debe ser estrictamente `ACTIVO`.
     * **Condición del Contribuyente:** Debe ser estrictamente `HABIDO`.
     * **Jurisdicción:** Debe pertenecer a la provincia de **Trujillo**.
4. **Carga de Documentación Obligatoria (Paso 4):**
   - Carga el archivo PDF correspondiente al **Plano Arquitectónico y de Distribución del Local**.
5. **Cobro de Tasa Municipal e Irreversibilidad (Paso 5):**
   - Selecciona el Método de Pago (Efectivo en Caja Municipal o Tarjeta / Pago Digital).
   - Confirma el cobro de la tasa oficial de **S/ 3.00**.
   - **Carácter Irreversible:** Una vez confirmado el pago, el comprobante (Boleta de Caja N° `BOL-CAJA-2026-XXXXXX`) se emite de inmediato y la solicitud no puede ser cancelada ni devuelta.
6. **Programación Automática de Inspección (Paso 6):**
   - Asigna automáticamente la fecha de visita (mínimo a partir del día siguiente hábil).
   - Asigna el inspector disponible respetando el **límite máximo de 4 inspecciones diarias por inspector**.
   - Asigna el turno de horario (ej. `08:00 AM - 10:00 AM`).

#### B. Envío Automático de Correo al Ciudadano
- Al completar el cobro, el sistema despacha un correo electrónico y notificación en tiempo real al ciudadano:
  > **📜 Solicitud EXP-XXXX Registrada y Pago Confirmado**
  > *Se ha procesado exitosamente el pago de su solicitud. Su inspección técnica presencial ha sido agendada para el día **[FECHA]** en el horario de **[HORARIO]** a cargo del Inspector Municipal **[INSPECTOR]**.*

#### C. Módulo de Consulta de Trámites e Historial de Pagos
- Permite buscar expedientes registrados por Código (`EXP-XXXX`), DNI, RUC o Nombre.
- Genera e imprime la **Boleta de Caja Municipal**.

---

## 🔍 3. Rol Inspector Municipal

El Inspector realiza la visita técnica física al local comercial y dictamina el resultado de la inspección.

### Credenciales de Ejemplo
- **Correo Principal:** `arodriguezr1020@gmail.com`
- **Rol:** `inspector`

### Secciones del Panel Inspector

#### A. Sección "Inspecciones" (`seccion === "inspecciones"`)
- **VISTA DIRECTA DE HOY:** Carga limpiamente la lista de inspecciones agendadas para el día de hoy.
- **Datos de Contacto Visibles:** Cada fila de la tabla muestra de forma destacada los datos del ciudadano:
  > `📱 Cel: 987654321` | `✉️ correo@ejemplo.com`
- **Acción "🔍 Atender Expediente":** Abre el formulario de evaluación técnica en terreno.
- **Formulario de Evaluación:**
  * Permite seleccionar el Dictamen: **Aprobar** o **Desaprobar**.
  * Permite ingresar las observaciones e informe técnico descriptivo.
  * Permite adjuntar hasta **2 fotografías de evidencia** de la visita técnica (guardadas en Base64).
  * Al guardar, notifica automáticamente al ciudadano y traslada el expediente al Historial de Inspecciones.

#### B. Sección "Historial de Inspecciones" (`seccion === "historial-inspecciones"`)
- **REGISTRO HISTÓRICO AUDITADO:** Muestra la lista completa de todas las inspecciones finalizadas y evaluadas.
- **Buscador Especializado:** Permite buscar inspecciones pasadas por **DNI**, **RUC** o **Código de Expediente** (`EXP-XXXX`).
- **Filtro de Dictamen Exclusivo:** Menú desplegable para filtrar por el resultado emitido:
  * `📌 Todos los dictámenes`
  * `✅ Aprobadas`
  * `❌ Desaprobadas`
- **Acción "👁️ Ver Detalles":** Abre el expediente con el dictamen final, el informe del inspector, las fotografías de evidencia adjuntas y la trazabilidad de acciones auditadas.

---

## 🛠️ Resumen de Credenciales de Prueba

| Rol | Correo Electrónico | Contraseña | Vista Principal |
|-----|-------------------|------------|-----------------|
| **Administrador** | `medicitasapp01@gmail.com` | `admin321` | Gestión de Usuarios |
| **Cajera** | `alessandropaul19@gmail.com` | `cajeroprueba` | Registro Presencial / Cobro |
| **Inspector** | `arodriguezr1020@gmail.com` | `inspectorprueba` | Inspecciones de Hoy |
