# Acceso para usuarios de prueba

Procedimiento chico para dejar que **una persona puntual** pruebe Super To-Do List mientras la app de Google sigue en modo **"Testing"** (antes de la v1.0.0). No tiene la formalidad del ítem grande del backlog ("Acceso de usuarios nuevos y feedback por email": botón "Pedir acceso", feedback por mail, política de privacidad) — es solo para destrabar una prueba puntual con alguien de confianza.

## Por qué hace falta

La app usa **Google Identity Services** para pedir permiso de Drive (guardar los datos) y de Calendar (solo lectura) — ver `assets/js/google-auth.js` y `TECNOLOGIAS.md`. Mientras el proyecto de Google Cloud esté en modo "Testing" (no publicado), **solo pueden autorizarla las cuentas que el desarrollador agregó a mano** como "usuarios de prueba". Sin eso, Google le muestra a la persona un error de acceso al intentar conectar.

## Qué necesitás de la persona

Solo su **dirección de Gmail** (o de Google Workspace) — la misma cuenta con la que va a usar la app y en la que va a vivir su archivo de datos en Drive.

## Pasos (desarrollador)

1. Entrar a [Google Cloud Console](https://console.cloud.google.com/) con la cuenta dueña del proyecto → elegir el proyecto de Super To-Do List.
2. Ir a **APIs y servicios → Pantalla de consentimiento de OAuth**.
3. Bajar hasta **"Usuarios de prueba"** → **"+ Agregar usuarios"**.
4. Pegar la dirección de Gmail de la persona → **Guardar**.
5. Avisarle que ya puede entrar (paso siguiente).

Sin build ni deploy de por medio: el cambio es inmediato del lado de Google, no hace falta tocar el repositorio ni la app.

## Qué avisarle a la persona

- El link de la app: **https://nicodiber.github.io/to-do-list/**.
- Es un **proyecto personal en desarrollo**, no una app terminada: puede tener cambios bruscos entre versiones y, alguna vez, algún error.
- Sus datos (tareas, categorías, etc.) se guardan en un **único archivo dentro de su propio Google Drive** (`super-todo-list-datos.json`); nadie más los ve, ni pasan por ningún servidor propio del proyecto.
- El permiso que pide es acotado: **Drive** solo puede ver y tocar los archivos que la propia app crea (no el resto de su Drive) y **Calendar** es de **solo lectura** (la app nunca crea ni modifica eventos).
- Al conectar va a ver la pantalla de Google con el aviso **"Google no verificó esta app"** (normal en modo Testing): para seguir, "Avanzado" → "Ir a Super To-Do List (no seguro)". Es la app real del desarrollador, no una app de terceros.
- Puede desconectar el acceso cuando quiera desde **myaccount.google.com → Seguridad → Tus conexiones con apps de terceros**.

## Qué no hace falta todavía

- Política de privacidad ni términos y condiciones formales (quedan para antes de compartir la app más ampliamente, ver `BACKLOG.md`).
- Canal oficial de feedback: alcanza con pedirle que te escriba directo (chat, mail personal).
- Seguimiento de uso / analítica: no está implementado todavía.

## Límites conocidos

- Google permite hasta **100 usuarios de prueba** por app en modo Testing.
- Si alguien se saca de la lista de usuarios de prueba, pierde el acceso de inmediato (sus datos en su Drive no se tocan, solo no puede volver a conectar).
- La sesión de Google no se persiste entre pestañas/reinicios del navegador: cada persona reconecta con un clic cuando hace falta (igual que el desarrollador).
