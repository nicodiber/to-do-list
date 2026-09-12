# Changelog

Formato de versión: `vMayor.Menor.Parche` (semver).

## [v0.12.0] - 2026-09-12

### Agregado

- Nueva entidad **Meta** (`{ id, nombre, plazo, descripcion, fecha_objetivo }`) con su propio ABM (vista "Metas"). Cada meta muestra su progreso (tareas completadas / tareas asociadas, con barra simple) y la lista de tareas asociadas con su estado.
- Las tareas ahora pueden aportar a una o varias metas (`metas_ids`): nuevo botón "Metas" en la vista Tareas con un panel checklist (mismo patrón que "Dependencias"). Al eliminar una meta, las tareas que la referenciaban quedan sin esa entrada.

## [v0.11.0] - 2026-09-11

### Agregado

- Botones ▲/▼ por categoría en la vista Categorías para reordenar su `orden` (antes quedaba fijo al crearla).
- La prioridad de categoría (`orden`) ahora se usa como desempate al ordenar tareas: en Tareas y en "Resto de tus pendientes" de Hoy (después de la fecha límite), en "Urgentes" de Hoy (criterio principal, ya que todas comparten la misma urgencia), y dentro de cada columna de día en las vistas de 3/8 días (después de la hora agendada). Nueva función compartida `compararPorPrioridad` en `assets/js/tareas-logica.js`.

## [v0.10.0] - 2026-09-10

### Agregado

- Nueva entidad **Ubicación** (`{ id, nombre, latitud, longitud }`) con su propio ABM (vista "Ubicaciones", igual patrón que Categorías). Las tareas ahora referencian `ubicacion_id` en vez del campo de texto libre `ubicacion` que se había agregado en v0.9.0 (**breaking change** interno: las tareas viejas quedan con un `ubicacion` huérfano sin uso, no se migra).
- Checkbox `requiere_clima_bueno` por tarea: si está activo y la tarea tiene una ubicación con coordenadas y una fecha resoluble dentro de los próximos 16 días, en **Hoy** y en las vistas de **3/8 días** se consulta el pronóstico real contra la API de Open-Meteo (gratis, sin API key) y se muestra un aviso "🌧️ Lluvia probable — considerá posponer" cuando la probabilidad de lluvia es alta. Nuevo módulo `assets/js/clima.js` con caché en memoria por ubicación/fecha.

### Cambiado

- Los filtros de ubicación en Tareas y Hoy ahora listan las ubicaciones del ABM en vez de valores de texto deduplicados.

## [v0.9.0] - 2026-09-10

### Agregado

- Campo `ubicacion` (texto libre, opcional) en las tareas: input en el alta y en editar (con autocompletado), badge "📍" en Tareas, Hoy y las vistas de 3/8 días.
- Filtro manual por ubicación ("¿dónde estás?") en la vista Tareas y en Hoy, construido dinámicamente a partir de las ubicaciones ya cargadas — sin GPS ni geolocalización.

## [v0.8.0] - 2026-09-10

### Agregado

- Campo `divisible`: checkbox en el alta y en editar, badge "⏸ Divisible" en el listado. Informativo por ahora.
- Campo `dias_habiles`: checklist de días de la semana en el alta y en editar. El panel de reprogramar (Tareas, Hoy, 3/8 días, Revisar mi día) ahora recibe los días hábiles de la tarea y ajusta automáticamente cualquier fecha elegida (atajo o manual) al próximo día permitido.

Con esto, Fase 2 queda completa salvo los ítems de baja prioridad documentados en el backlog (agrupar por similitud, prioridad entre categorías, SCRUM).

## [v0.7.0] - 2026-09-10

### Agregado

- Exportar a Google Calendar: al completar una tarea (desde Tareas, Hoy, o Revisar mi día), se pregunta si se quiere abrir en Google Calendar como registro histórico. Arma la URL de `calendar.google.com/render` con título, horario (fin = momento real de finalización, inicio = fin menos la duración real/estimada) y descripción (categoría, duración, notas) — sin OAuth ni API key, el usuario la guarda con un clic desde su sesión ya logueada. Nuevo módulo `assets/js/exportar-calendar.js`.

## [v0.6.0] - 2026-09-10

### Agregado

- Alta rápida de tareas: barra compacta arriba de la vista Tareas (solo nombre) para cargar algo al vuelo desde el celular.
- Autocompletado predictivo: el campo nombre del formulario detallado sugiere tareas ya creadas (`<datalist>`); al coincidir el nombre exacto, precarga categoría/subcategoría/duración/notas/mantenimiento.
- Edición de tarea: nuevo botón "Editar" por tarea en la vista Tareas, con panel para modificar nombre, categoría/subcategoría, fechas, duración, notas y mantenimiento de una tarea existente — necesario para que la alta rápida tenga sentido (cargar solo el nombre y completar el resto después).

## [v0.5.0] - 2026-09-10

### Agregado

- Atajo "primer [día de la semana] del próximo mes" en el panel de reprogramar.
- Asistente de cierre a nivel día completo: botón "Revisar mi día" en Hoy abre un diálogo que repasa una por una las tareas accionables (Cumplida/No cumplida/Saltar), avanzando automáticamente. Nuevo módulo `assets/js/revision-dia.js`.
- Mejora continua para tareas de mantenimiento: al completarlas (desde cualquiera de los 3 caminos: Tareas, Hoy por tarjeta, o Revisar mi día) se pregunta opcionalmente qué mejorar la próxima vez, y queda anotado en la instancia clonada.
- Detección de dependencias cíclicas más allá de un ciclo directo: `puedeAgregarDependencia` ahora recorre todo el grafo de dependencias en profundidad.

## [v0.4.0] - 2026-09-08

### Agregado

- Vistas "3 días" y "8 días": agrupan las tareas pendientes por día (usando `fecha_hora_agendada`, si no `fecha_limite`, si no `fecha_sugerida`, en ese orden) para anticipar cuellos de botella antes de que se vuelvan urgentes. Cada tarjeta muestra las mismas etiquetas que en Tareas/Hoy (categoría, fechas, mantenimiento, bloqueada) y permite "Posponer" directamente.
- Nuevo módulo `assets/js/vista-agenda.js` con la lógica de agrupamiento por día, compartida por ambas vistas (`views/tres-dias.view.js` y `views/ocho-dias.view.js` son wrappers finos sobre el mismo renderer).

## [v0.3.0] - 2026-09-08

### Agregado

- Dependencias entre tareas (`dependencias`): panel "Dependencias" en la vista Tareas para marcar de qué otras tareas depende una. Una tarea con dependencias sin completar queda "bloqueada": no aparece como accionable en la vista Hoy (nueva sección "Bloqueadas por otras tareas") y se marca con un aviso en la vista Tareas.
- Reprogramación en cascada: al posponer una tarea que ya tenía una fecha agendada, las tareas que dependen de ella se corren automáticamente el mismo delta de tiempo.
- Tareas de mantenimiento cíclicas (`mantenimiento`): al completar una tarea marcada como mantenimiento (desde el selector de estado o desde el asistente de cierre de Hoy), la instancia queda `completada` como historial y se crea automáticamente una nueva tarea `pendiente` con la fecha límite recalculada desde la fecha real de finalización.
- Nuevo módulo `assets/js/tareas-logica.js` con la lógica compartida entre vistas (completar tarea, reprogramar con cascada, chequeo de bloqueo, validación de dependencias).

## [v0.2.0] - 2026-09-08

### Agregado

- Campo `fecha_inicio_posible` en las tareas: la vista "Hoy" separa en una sección aparte ("Todavía no pueden empezar") las tareas cuya fecha de inicio todavía no llegó.
- Botón "Posponer" (vista Tareas y vista Hoy) con panel de atajos de reprogramación: día (Hoy, Mañana, +7/+15/+30 días o fecha manual) + horario (Mañana 07:00, Tarde 12:00, Tardecita 17:00, Noche 20:00 o manual). Guarda el resultado en el nuevo campo `fecha_hora_agendada`.
- Asistente de cierre en la vista "Hoy": botones "Cumplida ✓" (pide duración real y la guarda en `duracion_real_min`) y "No cumplida ✗" (pide motivo, lo guarda en `motivo_incumplimiento`, y abre el panel de reprogramación).

## [v0.1.0] - 2026-09-08

### Agregado

- Estructura inicial del proyecto: carpetas `assets/`, `views/`, `datos/` y documentación base (`README.md`, `AGENTS.md`, `SPEC.md`, `BACKLOG.md`, `DICCIONARIO_DE_DATOS.md`, `NOTAS_ORIGINALES.md`).
- MVP funcional 100% cliente (HTML/CSS/JS vanilla, sin backend):
  - ABM de categorías y subcategorías.
  - ABM de tareas (nombre, categoría/subcategoría, estado, fecha límite, fecha sugerida, duración estimada, notas).
  - Vista "Hoy" con separación entre tareas urgentes (vencidas o de hoy) y el resto de pendientes.
  - Vista "Tareas" con filtros por categoría/estado y orden por fecha límite.
  - Vista "Categorías" para administrar la jerarquía.
  - Persistencia en JSON local vía File System Access API (carpeta elegida por el usuario, pensada para vivir dentro de Google Drive), con `localStorage` de respaldo y exportar/importar JSON manual como fallback.
- Datos y esquema de ejemplo versionados en `datos/`.
