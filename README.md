# Super To-Do List

Plataforma personal de gestión de tareas y objetivos, pensada para asistir y priorizar automáticamente qué hacer ahora y evitar reprogramación manual de fechas.

La visión completa está en [SPEC.md](SPEC.md), el backlog de funcionalidades futuras en [BACKLOG.md](BACKLOG.md), el modelo de datos en [DICCIONARIO_DE_DATOS.md](DICCIONARIO_DE_DATOS.md) y las notas originales del brainstorm en [NOTAS_ORIGINALES.md](NOTAS_ORIGINALES.md).

Documentación de cómo funciona: [CASOS_DE_USO.md](CASOS_DE_USO.md) (flujos de usuario, foto de hoy), [PROCESOS_AUTOMATICOS.md](PROCESOS_AUTOMATICOS.md) (lo que el sistema hace solo), [REGLAS_DE_PRIORIDAD.md](REGLAS_DE_PRIORIDAD.md) (cómo se ordenan las tareas), [LOGICA_FUNCIONES.md](LOGICA_FUNCIONES.md) (qué hace cada función) y [REDISENO.md](REDISENO.md) (lo acordado para cambiar).

## Estado actual

**v0.58.0.** Gestión de tareas con categorías jerárquicas, dependencias, tareas de mantenimiento cíclicas, algoritmo de prioridad (holgura + categoría + importancia, con desempate manual "Versus"), vistas Hoy / 3 días / 8 días / Semana / Gantt / Todas / Informes, almacenamiento en Google Drive (único destino, con sincronización entre dispositivos) e integración con Google Calendar. Actualmente en el rediseño del frontend, por rondas, antes de cargar datos reales (la ronda 1, almacenamiento, ya está hecha). Ver [CHANGELOG.md](CHANGELOG.md).

## Cómo correrlo

Es una app 100% cliente, sin instalación ni backend:

1. **Web**: https://nicodiber.github.io/to-do-list/ (instalable como PWA en PC y celular).
2. La primera vez, la app pide **conectar con Google** (un solo permiso para Drive y Calendar de solo lectura). Sin conexión a Drive no se pueden cargar tareas.

Usá un navegador moderno (Chrome, Edge, Safari o Firefox). La app usa IndexedDB, Web Locks y Google Identity Services.

## Cómo funciona la persistencia y la sincronización

- **Google Drive es el único destino de los datos**, en todos los dispositivos: un archivo `super-todo-list-datos.json` en tu Drive (la app solo ve los archivos que ella misma crea; permiso `drive.file`). No hace falta la app de escritorio de Drive ni elegir carpetas.
- **Nada se pierde en silencio**: cada cambio se guarda de inmediato en un buffer local del navegador (IndexedDB), se sube a Drive a los ~2 segundos y **recién cuando Drive confirma** la cabecera muestra "✅ Sincronizado" con la hora. Si se corta internet o vence la sesión de Google, los cambios quedan como "⏳ pendiente" y se suben al reconectar; podés seguir editando sin conexión.
- **Varios dispositivos**: la app verifica Drive al volver a la pestaña, al recuperar internet y cada 5 minutos. Si otro dispositivo cambió algo, lo mezcla por tarea/entidad (gana el cambio más reciente) y, si algo se descartó, deja un **aviso** en la cabecera diciendo qué campo y qué valor, hasta que lo cierres.
- **Sin conexión al abrir**: se muestra la última copia sincronizada, en solo lectura, con su fecha.
- `localStorage` guarda solo preferencias (tema, ubicación actual); nunca tus tareas.
- **"Exportar JSON" / "Importar JSON"** en la cabecera sirven de respaldo manual (importar pide confirmación porque reemplaza todo, también en Drive).
- Los datos reales **no se versionan** en este repositorio: viven en tu Drive.

### Configuración de Google (para quien despliegue su propia copia)

- En Google Cloud Console, la pantalla de consentimiento debe incluir los permisos `drive.file` y `calendar.readonly`.
- Con la app OAuth en modo "Testing", el consentimiento caduca a los ~7 días; publicarla **"En producción"** (uso personal, sin verificar: mostrará una vez el aviso "app no verificada") evita tener que volver a autorizar.

## Estructura del proyecto

```
index.html          Punto de entrada
assets/css/         Estilos
assets/js/          Motor de la app: estado, persistencia, modelos, utilidades, router
views/               Una vista por pantalla (Hoy, Tareas, Categorías)
datos/               Esquema JSON y datos de ejemplo (versionados); los datos reales no se versionan
```

Convenciones de desarrollo (idioma, arquitectura, flujo de Git, información para Claude) en [AGENTS.md](AGENTS.md).

## Roadmap

Lo pendiente está en [BACKLOG.md](BACKLOG.md) y lo ya acordado para el rediseño (incluido el cambio de almacenamiento a Google Drive como único destino) en [REDISENO.md](REDISENO.md).
