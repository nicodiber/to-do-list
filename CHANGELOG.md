# Changelog

Formato de versión: `vMayor.Menor.Parche` (semver).

## [v0.37.0] - 2026-09-16

### Agregado

- Revisar calendario al final del día — con datos reales: nuevo paso final en el asistente "Revisar mi día" (`assets/js/revision-dia.js`) que, gracias a la conexión OAuth con Google Calendar agregada en v0.35.0, muestra los eventos reales de hoy en vez de preguntar a ciegas. Si no hay conexión, ofrece conectar ahí mismo; si falla la consulta o no hay soporte, degrada a la pregunta manual. Un alta rápida permite cargar tareas de continuidad sin cerrar el diálogo, pudiendo agregar varias seguidas.

## [v0.36.0] - 2026-09-16

### Agregado

- Rediseño visual + modo claro/oscuro: `assets/css/main.css` centralizaba casi todos los colores en variables CSS, así que redefinirlas alcanzó para re-temear toda la app. Nuevo botón de tema en la cabecera que alterna entre claro/oscuro, guarda la preferencia en `localStorage` (clave `super-todo-list:tema`, separada de los datos de la app) y respeta `prefers-color-scheme` del sistema como default cuando no hay preferencia guardada. Retoques de modernización: transiciones suaves en botones/tarjetas, hover con elevación en `.item-tarea`/`.tarjeta-categoria`, nav con estilo "pill".

### Corregido

- Bug de cascada CSS preexistente: `.etiqueta-fecha` (definida más abajo en `main.css`) le ganaba a los colores especiales de `.etiqueta-agendada`/`.etiqueta-mantenimiento`/`.etiqueta-clima`/`.etiqueta-solapamiento-calendar`, que nunca se habían mostrado con su color distintivo. Se resolvió calificando esos selectores con el tag (`span.etiqueta-agendada`, etc.) para aumentar su especificidad.

## [v0.35.0] - 2026-09-16

### Agregado

- Google Calendar — lectura de eventos y detección de solapamientos: a diferencia de la exportación existente (sin OAuth), leer eventos reales requiere autenticarse. Se usa Google Identity Services (`accounts.google.com/gsi/client`, primera dependencia externa vía `<script>` del proyecto) con el flujo de token client de solo lectura (`calendar.readonly`); el token queda en memoria (sin backend, sin persistir nada sensible) y se renueva reconectando con un click cuando expira. Nuevo botón "Conectar con Google Calendar" en la vista Hoy (`views/hoy.view.js`) y nuevo módulo `assets/js/google-calendar.js` (`conectarGoogleCalendar`, `obtenerEventosDeHoy`, `calcularSolapamiento`). Las tareas agendadas (`fecha_hora_agendada`) que se superponen con un evento real de hoy muestran el aviso "📅 Se superpone con...", mismo patrón de badge asíncrono ya usado para el aviso de clima.

## [v0.34.0] - 2026-09-16

### Agregado

- Notificaciones — primer paso (locales, no push real): sin backend ni servidor propio, un Web Push real (VAPID + push service) no es viable, así que se implementa una revisión periódica en el cliente. Nuevo módulo `assets/js/notificaciones.js`: cada 60s (mientras la app está abierta) revisa si hay tareas con `fecha_hora_agendada` a menos de 10 minutos y dispara una notificación del navegador vía `registration.showNotification` (con fallback a `new Notification` si no hay service worker). Nuevo botón "Activar notificaciones" en la cabecera (`index.html`) para solicitar el permiso, con estados según `Notification.permission`. Nuevo campo `notificada_en_para` en Tarea (`assets/js/modelos.js`) para no repetir el aviso de la misma tarea, que se limpia automáticamente al reprogramarla. `sw.js` ahora maneja `notificationclick` para enfocar o abrir la app al tocar la notificación.

## [v0.33.0] - 2026-09-15

### Agregado

- Chatbot para definir metas — primer paso: nuevo botón "Definir meta charlando con IA" en la vista Metas. A diferencia de los paneles de IA de un solo turno (v0.31.0, v0.32.0), permite una conversación de ida y vuelta: cada mensaje se agrega a un historial en memoria que se reenvía completo en cada prompt (sin backend, el LLM externo no tiene memoria propia entre turnos). Al finalizar la charla, un último prompt le pide a la IA un JSON con los datos de la meta (nombre, plazo, fecha objetivo, descripción), que se previsualiza y crea con `crearMeta` igual que el formulario manual. Nuevas funciones en `assets/js/ia-conectable.js`: `construirPromptChatMeta`, `parsearRespuestaChatMeta`, `construirPromptFinalizarMeta`, `parsearRespuestaFinalizarMeta`.

## [v0.32.0] - 2026-09-15

### Agregado

- IA conectable — reestructurar prioridades: nuevo botón "Reestructurar prioridades con IA" en la vista Tareas. Arma un prompt con las tareas accionables actuales (id, nombre, categoría, fecha límite, importancia actual) pidiéndole a un asistente de IA externo que sugiera una nueva importancia para cada una; al pegar la respuesta (JSON) previsualiza solo los cambios reales (donde la sugerida difiere de la actual) con checkboxes, y aplica únicamente los seleccionados. Mismo flujo manual de copiar/pegar que la sugerencia de subtareas de v0.31.0 (`assets/js/ia-conectable.js`).

## [v0.31.0] - 2026-09-15

### Agregado

- Capa de IA conectable — primer paso: nuevo módulo `assets/js/ia-conectable.js` y botón "Sugerir tareas con IA" en cada meta de la vista Metas. Arma un prompt para copiar/pegar en un asistente de IA externo (ChatGPT, Claude, etc.) pidiéndole tareas concretas para esa meta; permite pegar la respuesta (JSON), previsualizar las tareas propuestas con checkboxes, y agregar las seleccionadas asociadas a la meta. Flujo 100% manual (copiar/pegar) — el core de la app nunca llama a ninguna API de LLM ni depende de tokens.

## [v0.30.0] - 2026-09-15

### Agregado

- Nueva sección "Throughput semanal" en Informes: gráfico de barras con la cantidad de tareas completadas por semana (últimas 8 semanas, buckets de 7 días) y el promedio semanal en esa ventana. Calculado al vuelo sobre `completada_en`, sin campos ni entidades nuevas.

## [v0.29.0] - 2026-09-15

### Agregado

- PWA — precachear el app shell: `sw.js` ahora precachea en `install` el app shell completo (`ARCHIVOS_PRECACHE`), usando `cache: 'reload'` para saltear la caché HTTP del navegador al precachear. La primera carga sin conexión y sin visitas previas ahora también funciona (antes el caché arrancaba vacío). `AGENTS.md` documenta mantener esa lista al agregar archivos nuevos.

## [v0.28.0] - 2026-09-15

### Agregado

- PWA — primer paso: `manifest.json` (instalable, con ícono `assets/icons/icon.svg`) y `sw.js` (service worker registrado desde `assets/js/app.js`). Estrategia network-first: intenta red primero y cae a caché solo sin conexión, para no interferir con la caché agresiva del navegador que ya afecta el desarrollo de este proyecto. No precachea un app shell fijo — el caché se va poblando con el uso normal.

## [v0.27.0] - 2026-09-15

### Agregado

- Vista "Gantt": las tareas bloqueadas ahora muestran una flecha SVG que conecta el final de la barra bloqueante con el inicio de la bloqueada, cuando ambas están visibles en el filtro actual (se recalcula en cada render, incluido tras un arrastre). El texto "Bloqueada por..." se mantiene como respaldo para cuando la bloqueante no está visible. Con esto queda cerrada la idea de la vista Gantt (grilla v0.25.0, arrastre v0.26.0, flechas v0.27.0).

## [v0.26.0] - 2026-09-15

### Agregado

- Vista "Gantt": cada barra ahora tiene asas de arrastre en el borde izquierdo/derecho (Pointer Events, mismo mecanismo que la vista Semana) para reprogramar `fecha_inicio_posible` (asa izquierda, mueve el inicio manteniendo el final) o `fecha_limite` (asa derecha, mueve el final manteniendo el inicio) directamente desde el Gantt, en pasos de un día.

## [v0.25.0] - 2026-09-15

### Agregado

- Nueva vista **"Gantt"** — primer paso: selector de Meta (o "Todas las metas"); línea de tiempo horizontal con una barra por tarea asociada, posicionada/dimensionada según fecha de inicio y fin, coloreada por categoría/subcategoría. Las tareas bloqueadas muestran un aviso de texto ("Bloqueada por..."). Clic en una barra navega a Tareas con el panel de edición abierto. No incluye todavía arrastrar para reprogramar ni flechas de dependencia dibujadas — quedan en el backlog como ítems separados.
- Nueva función compartida `diasEntreFechas` (`assets/js/utilidades.js`), que reemplaza el cálculo que tenía duplicado `views/personas.view.js`.

## [v0.24.0] - 2026-09-15

### Agregado

- Nueva entidad **Persona** (`{ id, nombre, ultimo_contacto, notas }`) con su propio ABM (vista "Personas"). La lista se ordena de mayor a menor tiempo sin contacto (las personas sin `ultimo_contacto` registrado quedan primero); botón "Marcar contacto hoy" para actualizar la fecha en un clic.

### Descartado

- "Rutina diaria configurable" se descarta como ítem aparte del backlog: ya se resuelve con el campo `mantenimiento` existente (`cantidad: 1, unidad: 'dias'`), no requiere una entidad nueva.

## [v0.23.0] - 2026-09-15

### Agregado

- Campos `costo_estimado` (default `0`) y `costo_real` (default `null`) por tarea, mismo patrón que `duracion_estimada_min`/`duracion_real_min`: input en el alta y en editar, badge "💰" en Tareas/Hoy/3-8 días, y captura opcional del costo real al completar una tarea desde Hoy o "Revisar mi día" (junto a la duración real). Se conserva `costo_estimado` al clonarse una instancia de mantenimiento.
- Nueva sección "Costos" en Informes: proyección del costo estimado de las tareas pendientes, y comparación de costo estimado vs. real sobre las tareas completadas con ambos datos cargados.

## [v0.22.0] - 2026-09-15

### Agregado

- Regla 80/20 (Pareto): nueva función compartida `calcularEnfoque8020` (`assets/js/tareas-logica.js`) que toma el 20% superior (redondeado hacia arriba) de las tareas pendientes accionables según el orden de prioridad ya existente (importancia + prioridad de categoría + fecha límite). Se muestra como badge "🎯 Foco 80/20" en Tareas y Hoy, y como lista en una nueva sección "Enfoque 80/20 (Pareto)" en Informes.
- Nueva función compartida `esTareaAccionable` (`assets/js/tareas-logica.js`), que reemplaza la lógica duplicada que tenían `assets/js/disfrute.js` y `views/semana.view.js`.

## [v0.21.0] - 2026-09-15

### Agregado

- Vista "Semana": las asas de arrastre (ya existentes para tareas fijas desde v0.20.0) ahora también funcionan sobre bloques proyectados. Arrastrar cualquiera de las dos asas de un bloque proyectado le asigna `fecha_hora_agendada` según la posición soltada — la tarea pasa a listarse como fija en el siguiente render, sin pasar por el panel de edición. Completa la idea original de la vista semanal.

## [v0.20.0] - 2026-09-15

### Agregado

- Vista "Semana": los bloques de tareas fijas ahora tienen asas de arrastre en el borde superior e inferior (Pointer Events, funciona también por touch) para reprogramar `fecha_hora_agendada` (asa superior, mueve el inicio manteniendo el final) o `duracion_estimada_min` (asa inferior, mueve el final manteniendo el inicio) directamente desde la grilla, en pasos de 15 minutos, sin abrir el panel de edición. Los bloques proyectados siguen siendo solo clic-para-editar.

## [v0.19.0] - 2026-09-15

### Agregado

- Nueva vista **"Semana"**: grilla de 7 días (empezando hoy) por 16 horas (07:00-23:00). Las tareas con `fecha_hora_agendada` (fijas) se ubican en su día y horario exacto; las tareas pendientes sin agendar pero con fecha sugerida o límite dentro de la semana (proyectadas) se apilan por prioridad a partir de las 07:00, con estilo punteado para diferenciarlas. Clic en cualquier bloque navega a Tareas con el panel de edición de esa tarea ya abierto (`abrirEdicionAlEntrar` en `views/tareas.view.js`). No incluye todavía arrastrar para reprogramar — queda en el backlog como ítem separado.

## [v0.18.0] - 2026-09-15

### Agregado

- Campo `importancia` (enum `baja`/`media`/`alta`, default `media`) por tarea: select en el alta y en editar, badge con ícono (🔴/🟡/🟢) en Tareas, Hoy y las vistas de 3/8 días, y filtro "Importancia" en Tareas.
- `compararPorPrioridad` (usada por Tareas, Hoy y 3/8 días) ahora ordena primero por importancia y recién después por la prioridad de categoría, permitiendo destacar una tarea puntual por encima de otras de la misma categoría/fecha.

## [v0.17.0] - 2026-09-14

### Agregado

- Campo `multitasking` (booleano, default `false`) por tarea: checkbox en el alta y en editar, badge "🎧 Multitasking" en la vista Tareas, y filtro "Solo multitasking" para encontrar tareas que se pueden hacer en simultáneo con otra actividad de baja atención (ej. escuchar un podcast mientras se plancha).
- Toggle "Agrupar por categoría" en la vista Tareas: agrupa el listado filtrado por categoría (orden según `Categoria.orden`, con un grupo "Sin categoría" al final), en vez de la lista plana por fecha/prioridad.

## [v0.16.0] - 2026-09-12

### Agregado

- Campo `disfrute` (1-5, default 3) por categoría: select en el alta, indicador de estrellas en la tarjeta de la vista Categorías.
- Sugerencia automática al completar una tarea de una categoría de bajo disfrute (1-2): si hay alguna tarea accionable de una categoría de alto disfrute (4-5), se sugiere continuar con ella. Se muestra en los 3 caminos de completar (Tareas, Hoy, Revisar mi día), junto al aviso de recompensa. Nuevo módulo `assets/js/disfrute.js`.

## [v0.15.0] - 2026-09-12

### Agregado

- Campo `recompensa` (texto libre, opcional) por tarea: input en el alta y en editar, se suma al autocompletado, badge "🎁" en Tareas/Hoy/3-8 días.
- Al completar una tarea (desde cualquiera de los 3 caminos: Tareas, Hoy, Revisar mi día), si tiene recompensa cargada se muestra un aviso "🎉 ¡Completaste... ! Te ganaste: ...", antes de la pregunta de exportar a Calendar. Nuevo módulo `assets/js/recompensa.js`.
- Las tareas de mantenimiento conservan la recompensa al clonarse la siguiente instancia.

## [v0.14.0] - 2026-09-12

### Agregado

- Nueva vista **"Informes"**, 100% de lectura sobre los últimos 7 días: tabla de tareas completadas vs. pendientes por categoría, promedio de duración estimada vs. real (con la diferencia porcentual), e índice de procrastinación (proxy sobre el estado actual: tareas pospuestas al menos una vez y sin completar, contra completadas recientes). No se agregan campos nuevos al modelo — todo se calcula al vuelo sobre datos que ya existían.

## [v0.13.0] - 2026-09-12

### Agregado

- Las subcategorías ahora tienen su propio `color` (hereda el de la categoría padre por defecto al crearla, se puede elegir otro). Se muestra como un punto de color junto al nombre en la vista Categorías.
- Los badges de categoría/subcategoría en Tareas, Hoy y las vistas de 3/8 días usan el color de la subcategoría cuando la tarea tiene una asignada (antes siempre usaban el de la categoría).

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
