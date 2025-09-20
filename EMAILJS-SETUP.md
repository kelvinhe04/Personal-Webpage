# Configuración de EmailJS para el Formulario de Contacto

Para que el formulario de contacto funcione correctamente, necesitas configurar EmailJS. Sigue estos pasos:

## 🚨 SOLUCIÓN RÁPIDA para Error 412

Si tienes el error "Request had insufficient authentication scopes", haz esto **AHORA**:

### Paso 1: Revocar acceso actual

1. Ve a https://myaccount.google.com/permissions
2. Busca "EmailJS" en la lista
3. Haz click y selecciona "Eliminar acceso"

### Paso 2: Usar método SMTP (más confiable)

1. En EmailJS, elimina tu servicio Gmail actual
2. Crea un **nuevo servicio "Personal Email"**
3. Configura así:
    ```
    SMTP Server: smtp.gmail.com
    Port: 587
    Username: tuemailcompleto@gmail.com
    Password: [contraseña de aplicación - ver abajo]
    ```

### Paso 3: Crear contraseña de aplicación

1. Ve a https://myaccount.google.com/security
2. Activa "Verificación en 2 pasos" si no la tienes
3. Busca "Contraseñas de aplicaciones"
4. Selecciona "Otra (nombre personalizado)"
5. Escribe "EmailJS Portfolio"
6. Copia la contraseña de 16 caracteres que te da
7. Úsala en el campo "Password" de EmailJS

¡Con esto debería funcionar perfectamente!

---

## 1. Crear cuenta en EmailJS

1. Ve a [EmailJS](https://www.emailjs.com/)
2. Crea una cuenta gratuita
3. Verifica tu email

## 2. Configurar un servicio de email

### ⚠️ IMPORTANTE: Problema común con Gmail

Si ves el error "Request had insufficient authentication scopes", sigue estos pasos:

**Opción A: Usar Gmail correctamente**

1. En el dashboard de EmailJS, ve a **Email Services**
2. Haz click en **Add New Service**
3. Selecciona **Gmail**
4. **IMPORTANTE**: Cuando te pida autorización, asegúrate de:
    - Usar una cuenta Gmail personal (no de empresa/workspace)
    - Aceptar TODOS los permisos que solicite
    - Si ya autorizaste antes, ve a [Google Account Permissions](https://myaccount.google.com/permissions) y revoca el acceso a EmailJS, luego vuelve a autorizar

**Opción B: Usar un servicio alternativo (RECOMENDADO)**

1. En lugar de Gmail, selecciona **Personal Email**
2. Esto te permitirá usar cualquier email SMTP
3. Configura con estos datos si tienes Gmail:
    - SMTP Server: `smtp.gmail.com`
    - Port: `587`
    - Username: tu email completo
    - Password: **Contraseña de aplicación** (no tu contraseña normal)

**Para crear una contraseña de aplicación en Gmail:**

1. Ve a [Google Account Security](https://myaccount.google.com/security)
2. Activa la verificación en 2 pasos si no la tienes
3. Ve a "Contraseñas de aplicaciones"
4. Genera una nueva contraseña para "EmailJS"
5. Usa esa contraseña de 16 caracteres en EmailJS

6. Copia el **Service ID** que se genera

## 3. Crear una plantilla de email

1. Ve a **Email Templates**
2. Haz click en **Create New Template**
3. **Selecciona "Contact Us"** (es la opción correcta para formularios de contacto)
4. Modifica la plantilla con este contenido:

**En el campo "Subject":**

```
Nuevo mensaje de {{subject}} - Portfolio
```

**En el campo "Content" (cuerpo del email):**

```
Hola,

Has recibido un nuevo mensaje desde tu portfolio web:

Nombre: {{from_name}}
Email: {{reply_to}}
Asunto: {{subject}}

Mensaje:
{{message}}

---
Este mensaje fue enviado desde https://tu-portfolio.com
Puedes responder directamente a este email.
```

5. Guarda la plantilla y copia el **Template ID** que aparece

## 4. Obtener la clave pública

1. Ve a **Account** > **General**
2. Copia tu **Public Key**

## 5. Actualizar el código

En el archivo `assets/scripts/script.js`, reemplaza estos valores:

```javascript
// Línea 128: Reemplaza con tu Public Key
emailjs.init("TU_PUBLIC_KEY_AQUI");

// Líneas 151-152: Reemplaza con tus IDs
const result = await emailjs.sendForm(
    "TU_SERVICE_ID_AQUI", // Service ID
    "TU_TEMPLATE_ID_AQUI", // Template ID
    form
);
```

## 6. Variables disponibles en la plantilla

-   `{{from_name}}` - Nombre del usuario
-   `{{reply_to}}` - Email del usuario
-   `{{subject}}` - Asunto del mensaje
-   `{{message}}` - Contenido del mensaje

## 7. Límites del plan gratuito

-   200 emails por mes
-   Suficiente para un portfolio personal

## Ejemplo de configuración completa

```javascript
// Configuración de ejemplo (reemplaza con tus valores reales)
emailjs.init("user_aBcDeFgHiJkLmNoPqR");

const result = await emailjs.sendForm(
    "service_abc123", // Tu Service ID
    "template_xyz789", // Tu Template ID
    form
);
```

## Pruebas

1. Guarda los cambios
2. Abre tu portfolio en el navegador
3. Completa el formulario de contacto
4. Verifica que recibas el email en tu bandeja de entrada

## Solución de problemas

### Error 412: "Request had insufficient authentication scopes"

Este error significa que Gmail no tiene los permisos correctos. Soluciones:

1. **Revocar y reautorizar Gmail:**

    - Ve a [Google Account Permissions](https://myaccount.google.com/permissions)
    - Busca "EmailJS" y revoca el acceso
    - Vuelve a EmailJS y configura Gmail desde cero
    - Acepta TODOS los permisos cuando te los pida

2. **Cambiar a Personal Email con SMTP:**

    - Elimina el servicio Gmail en EmailJS
    - Crea un servicio "Personal Email"
    - Usa configuración SMTP manual (más estable)

3. **Usar otro proveedor:**
    - Considera usar Outlook, Yahoo o un servicio SMTP personalizado
    - Son generalmente más estables que la integración directa con Gmail

### Otros errores comunes:

Si tienes problemas:

-   **Error 400**: Verifica que todos los IDs estén correctos
-   **Error 422**: Revisa la configuración del servicio de email
-   **Sin conexión**: Revisa la consola del navegador para errores
-   **Emails no llegan**: Verifica que tu email no esté en spam
-   **Template error**: Asegúrate de que las variables `{{from_name}}`, `{{reply_to}}`, etc. estén en la plantilla

¡Listo! Tu formulario de contacto ahora enviará emails reales.
