# Acceso de usuarios de prueba

Procedimiento para dar y quitar acceso a la app mientras el proyecto de Google Cloud siga en modo **Testing** (la aplicación OAuth no está publicada). Es un documento para el desarrollador, no para los usuarios.

## Por qué hace falta

STDL inicia sesión con Google (Drive y Calendar). Con la pantalla de consentimiento en estado **Testing**, solo pueden autorizar la app las cuentas cargadas como **usuarios de prueba**; cualquier otra recibe el error «Acceso bloqueado: la app no completó el proceso de verificación» (`access_denied`).

- Hay un máximo de **100 usuarios de prueba** por proyecto.
- Los permisos que pide la app son `drive.file` (no sensible) y `calendar.readonly` (sensible): son los que obligan a verificar la app si algún día se publica para todo el mundo.
- Mientras la app no esté verificada, Google muestra a cada usuario el aviso **«Google no verificó esta app»**: tiene que elegir *Configuración avanzada → Ir a Super To-Do List (no seguro)*. Avisalo a quien invites.

## Dar acceso a un usuario nuevo

1. Pedile el **correo de Google** con el que va a iniciar sesión (tiene que ser una cuenta de Google, por ejemplo `@gmail.com` o una de Workspace).
2. Entrá a [Google Cloud Console](https://console.cloud.google.com/) y elegí el proyecto de STDL.
3. Menú **APIs y servicios → Pantalla de consentimiento de OAuth** (en la interfaz nueva: **Google Auth Platform → Público**).
4. En **Usuarios de prueba**, tocá **＋ Add users**, escribí el correo y guardá.
5. Avisale que ya puede entrar a <https://nicodiber.github.io/to-do-list/> y conectar con Google (con el aviso de «app no verificada» de arriba).

## Quitar el acceso a un usuario

1. En la misma pantalla, **Usuarios de prueba**, seleccioná el correo y tocá **Remove users**.
2. Para cortar también las sesiones ya abiertas, el usuario puede revocar la app en <https://myaccount.google.com/permissions>. Sus datos siguen en **su propio** Drive (archivo `super-todo-list-datos.json`): STDL no tiene copia.

## Cuando alguien «pierde la sesión» muy seguido

- La sesión de Google dura aproximadamente una hora y desde la v0.100.0 se renueva sola mientras la persona usa la app (cada clic o tecla). En **Configuraciones → Sesión de Google** hay un registro de conexiones, renovaciones y fallos con su motivo: pedile una captura.
- Causas habituales a revisar: el navegador bloquea las ventanas emergentes o las cookies de terceros, modo incógnito, extensiones que bloquean el inicio de sesión de Google, o la pestaña queda en segundo plano mucho tiempo.
- Las aplicaciones en estado Testing tienen vencimientos de autorización más cortos que las publicadas (por ejemplo, el consentimiento de los usuarios de prueba puede caducar a los 7 días y volver a pedirse). Si el registro muestra pedidos de autorización repetidos cada pocos días, esta es la causa probable y se resuelve publicando la app.

## Publicar la app (pasar de Testing a producción)

- Se hace en la misma pantalla de consentimiento: **Publicar aplicación**. Deja de hacer falta la lista de usuarios de prueba, pero sigue el aviso de «app no verificada» hasta que Google la verifique.
- La verificación pide, entre otras cosas: la **política de privacidad** y las **condiciones del servicio** (<https://nicodiber.github.io/to-do-list/privacidad.html> y <https://nicodiber.github.io/to-do-list/terminos.html>), un dominio verificado, un video que muestre el uso de los permisos y la justificación del permiso sensible de Calendar. Antes de pedirla conviene completar el correo de contacto en esas dos páginas.
- Mientras no se verifique, se puede seguir en Testing con hasta 100 usuarios de prueba.

## Lo que hay que completar a mano (pendiente)

- En la pantalla de consentimiento de Google Cloud, cambiar las URL de política de privacidad y de condiciones (hoy apuntan a la página principal) por las páginas anteriores.
