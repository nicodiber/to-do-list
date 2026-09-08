# Super To-Do List

Plataforma personal de gestión de tareas y objetivos, pensada para reemplazar la combinación actual de Notion + Google Calendar + Google Tasks con algo que prioriza automáticamente qué hacer ahora en vez de forzar una reprogramación manual constante.

La visión completa está en [SPEC.md](SPEC.md), el backlog de funcionalidades futuras en [BACKLOG.md](BACKLOG.md), el modelo de datos en [DICCIONARIO_DE_DATOS.md](DICCIONARIO_DE_DATOS.md) y las notas originales del brainstorm en [NOTAS_ORIGINALES.md](NOTAS_ORIGINALES.md).

## Estado actual

**v0.1.0 — MVP.** ABM de categorías/subcategorías/tareas, vista "Hoy", vista "Tareas" con filtros, y persistencia en un archivo JSON local. Ver [CHANGELOG.md](CHANGELOG.md).

## Cómo correrlo

Es una app 100% cliente, sin instalación ni backend. Dos formas de abrirla:

1. **Directo:** doble clic en `index.html`. Funciona, pero algunos navegadores restringen la File System Access API al abrir por `file://`.
2. **Recomendado — con un servidor estático simple** (mejor soporte de la API para elegir carpeta de datos):
   ```bash
   npx serve .
   ```
   o, si tenés Python instalado:
   ```bash
   python -m http.server 8000
   ```
   y abrís `http://localhost:8000` en el navegador.

Usá **Chrome o Edge** para la mejor experiencia (soportan la File System Access API). En otros navegadores la app funciona igual guardando en `localStorage`, con exportar/importar JSON como respaldo manual.

## Cómo funciona la persistencia y la sincronización

- Al usar el botón **"Elegir carpeta de datos"**, el navegador te deja seleccionar (o crear) una carpeta en tu disco. La app lee y escribe ahí `categorias.json` y `tareas.json`.
- **Recomendación:** elegí una carpeta dentro de tu **Google Drive** local (la app de escritorio de Drive). Así, al sincronizarse Drive entre tus computadoras, tus tareas quedan disponibles en todas sin que la app tenga que integrarse con ninguna API de Drive.
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

Convenciones de desarrollo (idioma, arquitectura, flujo de Git) en [AGENTS.md](AGENTS.md).

## Roadmap

Este MVP es intencionalmente mínimo. Todo lo demás (dependencias entre tareas, tareas de mantenimiento cíclicas, integración con Google Calendar, capa de IA opcional, informes de productividad, etc.) está relevado y priorizado por fase en [BACKLOG.md](BACKLOG.md).
