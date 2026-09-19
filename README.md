# Super To-Do List

Plataforma personal de gestión de tareas y objetivos, pensada para asistir y priorizar automáticamente qué hacer ahora y evitar reprogramación manual de fechas.

La visión completa está en [SPEC.md](SPEC.md), el backlog de funcionalidades futuras en [BACKLOG.md](BACKLOG.md), el modelo de datos en [DICCIONARIO_DE_DATOS.md](DICCIONARIO_DE_DATOS.md) y las notas originales del brainstorm en [NOTAS_ORIGINALES.md](NOTAS_ORIGINALES.md).

Documentación de cómo funciona: [CASOS_DE_USO.md](CASOS_DE_USO.md) (flujos de usuario, foto de hoy), [PROCESOS_AUTOMATICOS.md](PROCESOS_AUTOMATICOS.md) (lo que el sistema hace solo), [REGLAS_DE_PRIORIDAD.md](REGLAS_DE_PRIORIDAD.md) (cómo se ordenan las tareas), [LOGICA_FUNCIONES.md](LOGICA_FUNCIONES.md) (qué hace cada función) y [REDISENO.md](REDISENO.md) (lo acordado para cambiar).

## Estado actual

**v0.50.0.** Gestión de tareas con categorías jerárquicas, dependencias, tareas de mantenimiento cíclicas, algoritmo de prioridad (holgura + categoría + importancia, con desempate manual "Versus"), vistas Hoy / 3 días / 8 días / Semana / Gantt / Todas / Informes, sincronización con Google Drive e integración con Google Calendar. Actualmente en definición del rediseño del frontend antes de cargar datos reales. Ver [CHANGELOG.md](CHANGELOG.md).

## Cómo correrlo

Es una app 100% cliente, sin instalación ni backend. Dos formas de abrirla:

1. **Recomendado — Web**:
   https://nicodiber.github.io/to-do-list/

Usá **Chrome o Edge** para la mejor experiencia (soportan la File System Access API). En otros navegadores la app funciona igual guardando en `localStorage`, con exportar/importar JSON como respaldo manual.

## Cómo funciona la persistencia y la sincronización

- Al usar el botón **"Elegir carpeta de datos"**, el navegador te deja seleccionar (o crear) una carpeta en tu disco. La app lee y escribe ahí `categorias.json` y `tareas.json`.
- **Recomendación:** elegí una carpeta dentro de tu **Google Drive** local (la app de escritorio de Drive). Así, al sincronizarse Drive entre todos tus dispositivos (computadoras y celulares), tus tareas quedan disponibles en todas sin que la app tenga que integrarse con ninguna API de Drive.
- Mientras tanto, todo se guarda también en `localStorage` del navegador como caché/respaldo.
- Si tu navegador no soporta elegir carpeta, o todavía no elegiste una, podés usar **"Exportar JSON"** / **"Importar JSON"** para mover tus datos manualmente.
- Los archivos de datos reales (`datos/categorias.json`, `datos/tareas.json`) **no se versionan** en este repo — quedan en tu carpeta de Drive, fuera de Git.

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
