# Tecnologías utilizadas

Lista de todo lo que usa Super To-Do List, qué hace cada cosa y dónde se usa. La app es **100 % del lado del cliente**: no tiene servidor propio, ni base de datos propia, ni paso de compilación. Los datos de cada persona viven en su propio Google Drive.

## Lenguajes y formatos

| Tecnología | Para qué se usa | Dónde |
|---|---|---|
| **HTML5** | Estructura de la página; el resto de la interfaz se arma desde JavaScript. | `index.html` |
| **CSS3** | Estilos: variables (temas oscuro y claro), Flexbox y Grid, `color-mix`, `:focus-visible`, diseño adaptable a celular. Sin preprocesadores ni frameworks. | `assets/css/main.css` |
| **JavaScript (módulos ES)** | Toda la lógica. Sin frameworks, sin bibliotecas, sin `npm` y sin *bundler*: el navegador carga los módulos directamente. | `assets/js/*.js`, `views/*.view.js` |
| **JSON** | Formato de los datos (el archivo de Drive, la copia local y Exportar/Importar) y del manifiesto de la app. Esquema descrito en `datos/esquema.json`. | Drive, IndexedDB, `manifest.json` |
| **Markdown** | Documentación del proyecto. | `*.md` |
| **SVG** | Ícono de la app y las flechas del Gantt. | `assets/icons/icon.svg`, `views/gantt.view.js` |

## APIs del navegador

| API | Para qué se usa | Dónde |
|---|---|---|
| **Service Worker + Cache API** | Que la app abra sin conexión y se instale como aplicación. | `sw.js` |
| **Web App Manifest** | Instalación como aplicación (nombre, colores, íconos PNG y SVG). | `manifest.json` |
| **IndexedDB** | Copia local de lo último confirmado en Drive y buffer de cambios pendientes de subir. | `assets/js/almacenamiento-local.js` |
| **`localStorage`** | Solo preferencias de este dispositivo (tema, zoom del Gantt, filtros, franja horaria…); nunca datos de tareas. | varios módulos |
| **Web Locks API** | Que solo una pestaña edite a la vez (la otra queda en solo lectura). | `assets/js/almacenamiento.js` |
| **Elemento `<dialog>`** | Todas las ventanas modales (alta, edición, ayuda de atajos, revisión del día). | `assets/js/dialogo-formulario.js` y otros |
| **Pointer Events** | Arrastrar tareas en Semana y en el Gantt (mouse y táctil). | `views/semana.view.js`, `views/gantt.view.js` |
| **Fetch** | Llamadas a las APIs de Google y de Open-Meteo. | `assets/js/google-*.js`, `assets/js/clima.js` |
| **Clipboard** | Copiar el texto para pegarlo en la IA. | `views/metas.view.js`, `views/tareas.view.js` |
| **`crypto.randomUUID`** | Identificadores únicos de cada dato. | `assets/js/utilidades.js` |
| **Eventos de visibilidad y de red** | Verificar contra Drive al volver a la pestaña o al recuperar la conexión. | `assets/js/almacenamiento.js` |

## Servicios de terceros

| Servicio | Para qué se usa | Dónde |
|---|---|---|
| **Google Identity Services** (OAuth 2.0, *token client*) | Iniciar sesión con Google y obtener el permiso de Drive y de Calendar en un solo paso. | `assets/js/google-auth.js` |
| **Google Drive API v3** (permiso `drive.file`) | Guardar y leer el archivo de datos `super-todo-list-datos.json` del propio Drive de la persona. La app solo ve lo que ella misma crea. | `assets/js/google-drive-sync.js` |
| **Google Calendar API v3** (solo lectura) | Leer los eventos (de todos tus calendarios, con `calendarList` y `events`) para avisar superposiciones, buscar el próximo hueco libre, calcular tu tiempo disponible y mostrarlos en Semana. | `assets/js/google-calendar.js` |
| **Google Calendar (URL de creación de eventos)** | Abrir Calendar con una tarea completada ya cargada para guardarla como registro; sin API. | `assets/js/exportar-calendar.js` |
| **Open-Meteo** | Pronóstico del tiempo (probabilidad de lluvia) para las tareas que piden buen clima; gratis y sin clave. | `assets/js/clima.js` |

## Publicación y control de versiones

| Tecnología | Para qué se usa |
|---|---|
| **GitHub Pages** | Publica la app desde la rama `main`: https://nicodiber.github.io/to-do-list/ |
| **Git y GitHub** | Historial y código fuente. Se trabaja en la rama `develop` y se pasa a `main` con cada versión validada. |

## Herramientas de desarrollo

| Herramienta | Para qué se usa |
|---|---|
| **Claude Code** | Asistente de programación con el que se desarrolla el proyecto. |
| **Navegador integrado de Claude Code** | Probar la app y las vistas (incluido el ancho de celular) durante el desarrollo. |
| **Python (`http.server`)** | Servidor local para probar la app (`.claude/launch.json`, puerto 5173). |
| **Python + NumPy** | Script puntual que generó los íconos PNG a partir del diseño del ícono. |

## Lo que la app no usa

Frameworks o bibliotecas de interfaz, `npm`, herramientas de compilación, servidor propio, base de datos propia, *cookies* de seguimiento ni servicios de analítica (la analítica de uso está pensada para la v1.0.0; ver `BACKLOG.md`).
