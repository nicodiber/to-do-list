# Plan B: qué hacer si algo se cae

STDL depende de dos servicios externos: **GitHub Pages** (sirve la app) y **Google** (Drive guarda tus datos, Identity Services te deja iniciar sesión y Calendar aporta tus eventos). Este documento explica cómo no perder tu información y cómo seguir usando la app si alguno falla o cambia sus condiciones.

## Regla de oro: tener siempre una copia reciente

- **Configuraciones → Copia de seguridad → «⬇️ Exportar JSON»** descarga todos tus datos en un archivo (`super-todo-list-AAAA-MM-DD.json`). Funciona **sin conexión y sin sesión de Google**: exporta lo que la app tiene cargado en memoria (si abriste la app y ves tus tareas, se puede exportar).
- Desde la v0.105.0 la app **te recuerda exportar**: si pasaron más de N días desde la última exportación en este dispositivo (por defecto 30), una ventana te avisa y te deja exportar en un clic. En la misma sección de Configuraciones elegís cada cuántos días (o «nunca»).
- Guardá el archivo fuera de Google (disco, otro servicio): si el problema es la cuenta de Google, una copia en el mismo Drive no sirve.

## Escenario 1: Google Drive o el inicio de sesión de Google no funcionan

- La app **sigue funcionando con la copia local** del último estado sincronizado (se guarda en este navegador, IndexedDB). Los cambios quedan «pendientes» y se suben solos cuando vuelva Google.
- Mientras tanto no se asignan horarios nuevos (no se puede leer Calendar con seguridad); lo ya agendado se ve igual.
- Si el problema dura mucho: exportá una copia (ver arriba) y guardala. Tus datos también están en tu Drive, en el archivo `super-todo-list-datos.json`, y se pueden bajar a mano desde drive.google.com.
- **Todavía no hay un destino de datos alternativo a Drive** (la opción de carpeta local se retiró en la v0.51.0 a propósito). Si hiciera falta, volvería como respaldo y no como destino principal: está anotado en `BACKLOG.md` (Plan B).

## Escenario 2: GitHub Pages no está disponible

La app es un sitio estático: solo HTML, CSS y JavaScript, **sin servidor propio ni paso de compilación**. Se puede servir desde cualquier lado:

1. **Instalada como PWA**: si ya la instalaste (o la abriste antes), el navegador guarda los archivos y abre la app sin conexión con la última copia local.
2. **Otro hosting estático** (Cloudflare Pages, Netlify, Vercel, un servidor propio…): subí el contenido del repositorio tal cual (no hay nada que construir) y abrí la dirección nueva.
3. **En tu computadora**: desde la carpeta del repositorio, `python -m http.server 5173` y abrí `http://localhost:5173/`.

### Importante: el CLIENT_ID de Google está atado al origen

El inicio de sesión con Google solo funciona desde las direcciones autorizadas en Google Cloud Console (proyecto de STDL → APIs y servicios → Credenciales → ID de cliente OAuth → «Orígenes de JavaScript autorizados»). Hoy está autorizado `https://nicodiber.github.io` (y `http://localhost:5173` para pruebas). Para usar otra dirección hay que **agregarla ahí** (los cambios tardan unos minutos). Sin eso la app abre y muestra tus datos locales, pero no puede conectar con Drive ni con Calendar.

Si cambia el `CLIENT_ID` (otro proyecto de Google Cloud), se edita la constante `CLIENT_ID` de `assets/js/google-auth.js`.

## Escenario 3: Google cambia sus condiciones o hay que dejar de usarlo

- **Tus datos son un JSON simple** (esquema en `datos/esquema.json`, campos explicados en `DICCIONARIO_DE_DATOS.md`): se pueden leer y migrar a otra herramienta con un script.
- Mientras tanto, importar y exportar JSON permite mover los datos entre navegadores o dispositivos sin Google (**Configuraciones → Importar JSON** reemplaza todo).

## Qué pasa si se cierra el navegador antes de que diga «guardado»

Cada cambio se guarda de inmediato en el navegador (IndexedDB, estado «pendiente») y recién después se sube a Drive (unos 2 segundos más tarde). Si la pestaña se cierra antes, el cambio **no se pierde**: queda pendiente y se sube solo al volver a abrir y reconectar. Al cerrar con cambios sin confirmar, el navegador además pregunta antes de salir. El único riesgo es un apagado brusco (corte de luz) justo entre la escritura local y su persistencia en disco, que es muy improbable (IndexedDB confirma la escritura antes de devolver el control).

## Lista de comprobación rápida

1. ¿Tengo un JSON exportado hace menos de un mes y guardado fuera de Google?
2. ¿La app está instalada como PWA (para abrirla sin conexión)?
3. ¿Sé qué origen tengo que agregar en Google Cloud si cambio de hosting?
