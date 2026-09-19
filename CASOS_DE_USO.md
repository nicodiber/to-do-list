# Casos de uso

Documentación viva (se actualiza junto con el código, mismo compromiso que `DICCIONARIO_DE_DATOS.md`/`LOGICA_FUNCIONES.md`/`REGLAS_DE_PRIORIDAD.md`) de los flujos con los que el usuario interactúa con Super To-Do List para cumplir un objetivo. Es la **foto de cómo funciona hoy** (baseline), separada a propósito de cualquier propuesta de mejora — sirve como punto de partida para el rediseño visual y funcional del frontend, no como el resultado de ese rediseño. Lo acordado para cambiar vive en [REDISENO.md](REDISENO.md). Las frases marcadas con ⏳ describen algo que el usuario pidió pero **todavía no existe** en el código.

Cada caso de uso sigue este formato:

- **Objetivo**: qué quiere lograr el usuario (no la vista — el objetivo).
- **Disparador**: qué lleva a este flujo.
- **Pasos**: la secuencia real de hoy, resumida con flechas.
- **Flujo usuario/sistema**: la misma secuencia, pero numerada y alternando explícitamente quién hace cada cosa (usuario / sistema), para poder analizar el proceso paso a paso. Es información duplicada a propósito: mismo contenido, otra perspectiva.
- **Vistas/funciones**: para trazabilidad con `LOGICA_FUNCIONES.md`.
- **Resultado**: qué cambió en los datos.
- **Fricciones**: algo que hoy es más lento/confuso/limitado de lo que podría ser — el insumo principal para el rediseño. Cuando el usuario ya adelantó una dirección concreta de cambio, queda como **nota abierta para rediseño** en vez de fricción genérica.

**Principio transversal — atajos de teclado**: la meta es que un usuario experto pueda manejar casi todo STDL sin mouse. Hoy solo existe el atajo global "N" (alta rápida de tarea). Cada caso de uso marca en Fricciones si le falta uno.

## Taxonomía de vistas

Clasificación de las pantallas por tipo de funcionalidad (además del agrupamiento por objetivo de abajo), para tenerla de referencia en el rediseño de navegación:

| Vista | Tipo | Casos de uso relacionados |
|---|---|---|
| Hoy | Visualizador | A1, A4, A5, A6 |
| 3 días | Visualizador | A7 |
| 8 días | Visualizador | A7 |
| Semana ⚠️ candidata a fusión con 8 días | Visualizador | A7 |
| Gantt | Visualizador | B2 |
| Todas | Visualizador | A8 |
| Informes | Visualizador | E1 |
| Tareas (listado + alta/edición) | ABM | A2, A3, A4, A5, B1 |
| Categorías | ABM | C1 |
| Ubicaciones | ABM | C2 |
| Metas | ABM | B1 |
| Personas | ABM | C3 |
| "Revisar mi día" | Asistente / flujo guiado | A6 |
| IA conectable (paneles en Metas/Tareas) | Asistente / flujo guiado — **suspendido** | — |
| Exportar / Importar JSON | Configuración / integración | D1 |
| Google Drive (cabecera de sincronización) | Configuración / integración | D2 |
| Google Calendar | Configuración / integración | D3 |
| Tema claro/oscuro | Configuración | — |
| Atajo de teclado "N" | Transversal | A2 |

---

## Bloque A — Loop diario

### A1. Ver qué hacer ahora / hoy

- **Objetivo**: saber qué tarea atacar en este momento, sin tener que pensar el orden a mano.
- **Disparador**: arranca el día, haber finalizado una tarea o aparece un rato libre.
- **Pasos**: abre Hoy (vista por defecto) → mira "Urgentes" (vencidas o con `tarea_fecha_limite` hoy, con su holgura en texto) → si no hay nada ahí, mira "Resto de tus pendientes" (todo lo demás ordenado por `compararPorPrioridad`) → si tiene tiempo libre y no hay apuro, mira el apartado "Elegí por categoría" dentro de Resto → opcionalmente filtra por ubicación actual (compartido con Tareas y 3/8 días).
- **Flujo usuario/sistema**:
  1. Usuario abre la app (o navega a Hoy).
  2. Sistema muestra Hoy: filtro "¿Dónde estás?" (si hay ubicaciones cargadas), sección "Urgentes", sección "Resto de tus pendientes" y, dentro de Resto, "Elegí por categoría".
  3. Usuario lee "Urgentes" (cada ítem con su holgura) y, si hay, decide cuál atacar.
  4. Si no hay urgentes, usuario mira "Resto" (orden `compararPorPrioridad`); con tiempo libre y sin apuro, mira "Elegí por categoría".
  5. Usuario (opcional) elige su ubicación actual.
  6. Sistema guarda esa preferencia (fuera de los datos de la app) y redibuja Hoy filtrada por ubicación.
  7. Usuario elige una tarea y sigue con A4 (completar) o A5 (reprogramar).
- **Vistas/funciones**: `views/hoy.view.js` (`renderVistaHoy`, `renderItem`), `assets/js/tareas-logica.js` (`compararPorPrioridad`, `mejorTareaPorCategoria`, `calcularHolguraDias`, `esTareaAccionable`), `assets/js/ubicacion-actual.js`.
- **Resultado**: no cambia datos, es de solo lectura (salvo que desde acá se accione otro caso de uso, como completar o reprogramar).
- **Fricciones**: sin atajo de teclado para ir directo a Hoy. "Elegí por categoría" puede repetir una tarea que ya aparece en "Resto" (redundancia visual, ya conocida y aceptada por diseño).

### A2. Cargar una tarea (rápida o completa)

- **Objetivo**: no perder una idea o pendiente apenas surge, sin importar el dispositivo.
- **Disparador**: se le ocurre algo, en cualquier momento.
- **Pasos — alta rápida**: atajo de teclado "N" (o el input dedicado en Tareas) → escribe el nombre → confirma → tarea creada con todos los demás campos en su default (sin categoría, sin fechas, `tarea_duracion_min=15`, `pendiente`).
- **Pasos — alta completa**: en Tareas, formulario extendido (nombre con autocompletado por nombre ya usado — precarga categoría/importancia/duración/etc. si coincide exacto —, categoría en árbol, importancia, los 3 pares fecha+hora, duración, costo estimado, descripción, ubicación, "requiere buen tiempo", "es de mantenimiento" + intervalo, días hábiles) → Agregar tarea.
- **Flujo usuario/sistema — alta rápida**:
  1. Usuario presiona "N" (o va a Tareas y hace clic en el input de alta rápida).
  2. Sistema navega a Tareas (si hacía falta) y enfoca ese input.
  3. Usuario escribe el nombre y presiona Enter.
  4. Sistema crea la tarea con los valores por defecto, la guarda y redibuja la lista.
- **Flujo usuario/sistema — alta completa**:
  1. Usuario va a Tareas y empieza a completar el formulario extendido por el campo nombre.
  2. Sistema ofrece autocompletado por nombres de tareas ya existentes; si el nombre coincide exacto, precarga los demás atributos de esa tarea.
  3. Usuario completa el resto de los campos que quiera y presiona "Agregar tarea".
  4. Sistema exige solo el nombre, crea la tarea, la guarda y redibuja la lista.
  5. Usuario (si quiere una dependencia o meta) abre la tarea recién creada y usa el botón "Dependencia" o "Meta".
  6. Sistema muestra un desplegable único; al elegir, valida ciclos (solo dependencia), recalcula el bloqueo y guarda.
- **Vistas/funciones**: `views/tareas.view.js` (`#form-alta-rapida`, formulario principal, `tareasUnicasPorNombre`), `assets/js/modelos.js` (`crearTarea`), atajo "N" en `assets/js/app.js`.
- **Resultado**: nueva Tarea en `estado.tareas`, persistida.
- **Fricciones**: el atajo "N" solo cubre el alta rápida (nombre nomás), no hay atajo para abrir el formulario completo. Dependencia y meta **no** se cargan en el alta — requieren un segundo paso después de creada la tarea (ver A5 y B1).

### A3. Completar carga de tareas cargadas rápido

- **Objetivo**: cuando vuelve a una pantalla más cómoda (ej. la PC después de cargar varias cosas desde el celular) o desde celular ahora tiene más tiempo para cargar atributos a tarea creada previamente con solo nombre, encontrar rápido cuáles tareas quedaron con datos mínimos y completarlas.
- **Disparador**: hay al menos una tarea que tiene solo campo nombre cargado.
- **Pasos hoy**: **no existe un flujo dedicado.** Lo más cercano es ir a Todas y mirar manualmente cuáles tareas no tienen categoría/fecha, o usar el buscador si se acuerda el nombre — no hay un filtro ni una marca que identifique "esto se cargó rápido e incompleto".
- **Flujo usuario/sistema (recorrido de hoy, sin soporte dedicado)**:
  1. Usuario abre Todas.
  2. Sistema muestra todas las tareas en orden de prioridad.
  3. Usuario recorre la lista a ojo buscando las que no tienen categoría ni fechas (ordenar por Categoría o Fecha ayuda a juntarlas).
  4. Usuario hace clic en una de esas filas.
  5. Sistema lleva a Tareas con esa tarea ya abierta en edición.
  6. Usuario completa los atributos y guarda.
  7. Sistema persiste y redibuja; el usuario vuelve a Todas y repite con la siguiente.
- **Vistas/funciones**: ninguna.
- **Resultado**: n/a.
- **Fricciones**: **gap real**, no una fricción menor — falta una forma explícita de decir "mostrame lo incompleto". Insumo directo para el rediseño: filtro dedicado en Todas (por heurística — sin categoría, sin ninguna fecha — o por un campo explícito que distinga "alta rápida" de "alta completa").

### A4. Marcar una tarea cumplida

- **Objetivo**: registrar que se hizo algo y seguir.
- **Disparador**: termina una tarea.
- **Pasos**: desde Hoy, Tareas o "Revisar mi día", botón "Cumplida ✓" → si la tarea es de mantenimiento, campo opcional "¿cómo se podría mejorar para la próxima vez?" → Confirmar → se completa y (si aplica) se clona la siguiente instancia, se desbloquean las tareas que dependían de esta, y se ofrece exportarla a Google Calendar.
- **Flujo usuario/sistema (desde Hoy)**:
  1. Usuario hace clic en "Cumplida ✓" de una tarea.
  2. Sistema muestra un panel de confirmación (con el campo "¿cómo se podría mejorar…?" solo si la tarea es de mantenimiento).
  3. Usuario (opcional) escribe la nota y presiona "Confirmar".
  4. Sistema marca la tarea completada y fija `tarea_fecha_fin`; si es de mantenimiento, crea la siguiente instancia; desbloquea las tareas que dependían de esta; guarda y redibuja.
  5. Sistema muestra un cuadro del navegador: "¿Abrir «tarea» en Google Calendar para guardarla como registro histórico?".
  6. Usuario acepta o cancela.
  7. Si acepta, sistema abre una pestaña nueva de Google Calendar con el evento precargado, y el usuario lo guarda a mano allí. (Desde Tareas, el punto de partida es el desplegable "Cambiar estado" → Completada; el resto es igual.)
- **Vistas/funciones**: mismo patrón repetido en `views/hoy.view.js`, `views/tareas.view.js` y `assets/js/revision-dia.js`; `assets/js/tareas-logica.js` (`completarTarea`, `desbloquearDependientes`); `assets/js/exportar-calendar.js` (`ofrecerExportarACalendar`).
- **Resultado**: `tarea_estado='completada'`, `tarea_fecha_fin` seteada; posible clon nuevo (ver `PROCESOS_AUTOMATICOS.md`); posibles dependientes desbloqueadas; posible evento nuevo en Google Calendar.
- **Fricciones**: el flujo está duplicado casi idéntico en 3 archivos distintos (no es fricción de usuario, pero sí de mantenimiento de código — candidato a unificar en el rediseño). (La sugerencia de tarea de alto disfrute — Premack — se eliminó; el `confirm()` de exportar a Calendar no resulta invasivo según el usuario.)

### A5. Reprogramar una tarea

- **Objetivo**: mover la fecha de una tarea que no se va a cumplir cuando estaba prevista.
- **Disparador**: no se llegó a hacer (reactivo), se decide adelantar/atrasar a propósito (proactivo), o el sistema detecta que ya venció.
- **Pasos — reactivo**: botón "No cumplida ✗" → "Reprogramar" → panel con atajos de día/hora → confirma → se mueve `tarea_fecha_sugerida`, en cascada a dependientes.
- **Pasos — proactivo**: botón "Posponer" (disponible en Tareas, Hoy, 3/8 días) → mismo panel.
- **Pasos — automático**: `tarea_fecha_sugerida` vencida de una tarea activa se reprograma sola al abrir la app, con aviso (ver `PROCESOS_AUTOMATICOS.md`).
- **Pasos — fecha límite vencida**: botón "📅 Revalorizar fecha límite" (solo visible en "Urgentes" de Hoy) → mismo panel, pero escribe `tarea_fecha_limite` directamente, **sin** cascada a dependientes (a diferencia de los anteriores).
- **Flujo usuario/sistema — reactivo (desde Hoy)**:
  1. Usuario hace clic en "No cumplida ✗".
  2. Sistema muestra un panel con el botón "Reprogramar".
  3. Usuario hace clic en "Reprogramar".
  4. Sistema muestra atajos de día y de horario (opcional) y un selector de fecha, respetando los días hábiles de la tarea.
  5. Usuario elige día (y hora, si quiere) y confirma.
  6. Sistema mueve `tarea_fecha_sugerida`, desplaza en cascada a las tareas dependientes, guarda y redibuja.
- **Flujo usuario/sistema — automático**:
  1. Usuario abre la app.
  2. Sistema detecta tareas activas con `tarea_fecha_sugerida` vencida, las mueve a la próxima fecha disponible y guarda.
  3. Sistema avisa con un cuadro del navegador cuántas tareas reprogramó.
- **Flujo usuario/sistema — fecha límite vencida**:
  1. Usuario ve una tarea vencida en "Urgentes" y hace clic en "📅 Revalorizar fecha límite".
  2. Sistema muestra el mismo panel de atajos de día/hora.
  3. Usuario elige la nueva fecha y confirma.
  4. Sistema escribe `tarea_fecha_limite` de esa tarea únicamente (sin cascada), guarda y redibuja.
- **Vistas/funciones**: `assets/js/reprogramar.js` (`crearPanelReprogramar`, `siguienteDiaHabil`), `assets/js/tareas-logica.js` (`reprogramarTareaConCascada`, `reprogramarFechasSugeridasVencidas`), `views/hoy.view.js`, `views/tareas.view.js`, `assets/js/vista-agenda.js`, `assets/js/revision-dia.js`.
- **Resultado**: `tarea_fecha_sugerida` y/o `tarea_fecha_limite` actualizada; posible cascada a dependientes.
- **Fricciones**: 4 puntos de entrada distintos al mismo panel (consistente, pero repartido). La cascada no siempre es evidente para el usuario — no hay un resumen visual de "esto además corrió a estas otras N tareas".

### A6. "Revisar mi día" ⚠️ a redefinir

- **Objetivo**: cerrar el día repasando una por una las tareas de hoy, sin tener que ir abriendo tarjeta por tarjeta.
- **Disparador**: ritual de cierre de día.
- **Pasos**: botón "Revisar mi día" (Hoy) → recibe la lista combinada de Urgentes + Resto → abre un `<dialog>` modal → por cada tarea: Cumplida / No cumplida / Saltar → al llegar al final, si hay conexión con Google Calendar muestra los eventos reales de hoy y pregunta en secuencia si para cada evento se generó una nueva tarea para cargar (alta rápida inline) *(⏳ hoy no es en secuencia por evento: se listan todos los eventos juntos y hay un único alta rápida — pedido del usuario, ver `REDISENO.md`)*; si no hay conexión, indica que no hay conexión y ofrece botón para intentar conectar → Si no conecta, indicar el mensaje correspondiente → Cerrar.
- **Flujo usuario/sistema**:
  1. Usuario hace clic en "Revisar mi día" (en Hoy).
  2. Sistema abre un diálogo modal con la primera tarea de la lista (Urgentes + Resto, sin completadas) y el progreso "Tarea 1 de N".
  3. Usuario elige Cumplida, No cumplida o Saltar.
  4. Si Cumplida: sistema pide confirmar (con la nota de mejora si es de mantenimiento); usuario confirma; sistema completa la tarea (todo lo de A4) y avanza. Si No cumplida: sistema ofrece "Reprogramar"; usuario elige fecha en el panel; sistema mueve la fecha y avanza. Si Saltar: sistema avanza sin cambios.
  5. Al terminar la lista, sistema muestra "¡Repasaste todas tus tareas de hoy!" y la sección de Calendar: sin conexión con Calendar (sesión vencida o permiso no concedido), un botón para reconectar con Google; con conexión, los eventos de hoy.
  6. Usuario (opcional) escribe el nombre de una tarea de continuidad en el alta rápida inline.
  7. Sistema crea esa tarea con valores por defecto, la guarda y la agrega a una lista de confirmación.
  8. Usuario presiona "Cerrar" (o "Cerrar repaso" en cualquier momento).
- **Vistas/funciones**: `assets/js/revision-dia.js` (`iniciarRevisionDia`, `renderPaso`, `renderPasoFinal`, `renderSeccionCalendario`), `assets/js/reprogramar.js`, `assets/js/tareas-logica.js`, `assets/js/google-calendar.js`.
- **Resultado**: igual que completar/reprogramar cada tarea una por una, más posibles tareas nuevas de continuidad.
- **⚠️ Pendiente de redefinir con el usuario** (marcado explícitamente, no resuelto acá): ¿tiene sentido como flujo modal separado, o alcanza con iterar la lista de Hoy directamente? ¿el paso de "eventos de Calendar → tarea nueva" debería vivir acá o en otro lugar del flujo diario?

### A7. Anticipar los próximos días

- **Objetivo**: ver qué se viene en los próximos días, para anticipar cuellos de botella sin esperar a que sea "hoy".
- **Disparador**: planificación de la semana, o repaso rápido de lo cargado.
- **Pasos**: navegar a "3 días" u "8 días" → tareas agrupadas por día según `fechaDeReferencia` (`tarea_fecha_sugerida` > `tarea_fecha_limite`) → dentro de cada día, ordenadas por hora/prioridad → posponer directo desde cada tarjeta. "Semana" ofrece una grilla horaria (07-23h) con las tareas de horario fijo ubicadas en su hora exacta y las proyectadas apiladas por prioridad, con arrastre para reprogramar.
- **Flujo usuario/sistema**:
  1. Usuario navega a "3 días" u "8 días".
  2. Sistema agrupa las tareas con fecha de referencia por día y, dentro de cada día, las ordena por hora y prioridad.
  3. Usuario revisa los días y detecta cuellos de botella.
  4. Usuario (opcional) hace clic en "Posponer" de una tarjeta.
  5. Sistema muestra el panel de reprogramar (A5) y, al confirmar, mueve la fecha y redibuja.
  6. (Semana) Usuario arrastra el borde de un bloque; sistema actualiza `tarea_fecha_sugerida`/`tarea_duracion_min` en pasos de 15 minutos y guarda.
- **Vistas/funciones**: `assets/js/vista-agenda.js` (`fechaDeReferencia`, lógica compartida entre 3/8 días), `views/tres-dias.view.js`, `views/ocho-dias.view.js`, `views/semana.view.js` ⚠️.
- **Resultado**: no cambia datos (salvo que se reprograme algo desde ahí).
- **Fricciones**: 3 vistas conceptualmente parecidas (3 días / 8 días / Semana) — el usuario ya identificó que 8 días le resuelve lo mismo que Semana, marcándola **candidata a fusionarse o eliminarse** en el rediseño (no se elimina en este documento, solo se deja anotado).

### A8. Auditar y corregir el orden de prioridad

- **Objetivo**: confirmar que el orden que calcula la app tiene sentido, y corregirlo puntualmente si no.
- **Disparador**: duda sobre por qué una tarea aparece antes/después de lo esperado; revisión periódica.
- **Pasos**: ir a Todas → ver el orden por defecto (`compararPorPrioridad`, el mismo que usa toda la app) → filtrar/buscar si hace falta → clic en un header de columna para mirar por un criterio puntual → si hay tareas empatadas, abrir "⚔️ Versus" → elegir cuál conviene antes de a pares (o "Da igual / Omitir") → `tarea_prioridad_manual` queda asignado a las tareas resueltas.
- **Flujo usuario/sistema**:
  1. Usuario abre Todas.
  2. Sistema muestra todas las tareas (de cualquier estado) en el orden real de prioridad, con su holgura.
  3. Usuario detecta algo mal ubicado y (opcional) filtra por categoría/estado/importancia, busca por nombre u ordena por una columna.
  4. Usuario hace clic en "⚔️ Versus".
  5. Sistema agrupa las tareas accionables empatadas y muestra dos de ellas lado a lado.
  6. Usuario elige la que conviene antes, o "Da igual / Omitir".
  7. Sistema, si se eligió, asigna `tarea_prioridad_manual` a ambas y guarda; si se omitió, solo recuerda el par. En ambos casos muestra el siguiente par (o "No hay tareas empatadas…").
  8. Usuario (si corrige un dato) hace clic en una fila; sistema lleva a Tareas con esa tarea abierta en edición.
- **Vistas/funciones**: `views/todas.view.js` (`renderVistaTodas`, `crearPanelVersus`, `construirClusteres`), `assets/js/tareas-logica.js` (`compararPorPrioridad`, `tareasEmpatadas`).
- **Resultado**: eventualmente, `tarea_prioridad_manual` asignado a algunas tareas.
- **Fricciones**: "Versus" opera sobre todas las tareas accionables de la app, sin acotarse a los filtros activos en ese momento en Todas — puede sentirse desconectado de lo que se estaba mirando.

---

## Bloque B — Planificación de objetivos

### B1. Crear y seguir una Meta

- **Objetivo**: tener un objetivo de mediano/largo plazo con tareas asociadas, y ver el avance.
- **Disparador**: define un nuevo objetivo.
- **Pasos**: Metas → formulario (nombre, plazo corto/mediano/largo, fecha objetivo opcional, descripción) → Agregar → asociar tareas desde el panel "Meta" en el alta o edición de cada tarea, en Tareas → volver a Metas para ver la barra de progreso (completadas/asociadas, calculado al vuelo) y el listado de tareas de esa meta.
- **Flujo usuario/sistema**:
  1. Usuario abre Metas, completa el formulario y presiona "Agregar meta".
  2. Sistema crea la meta, la guarda y la muestra con la barra en 0%.
  3. Usuario va a Tareas, abre una tarea y hace clic en "Meta".
  4. Sistema muestra un desplegable con las metas existentes.
  5. Usuario elige la meta; sistema guarda `meta_id` en la tarea.
  6. Usuario vuelve a Metas.
  7. Sistema calcula al vuelo cuántas tareas asociadas están completadas y muestra la barra, el "X/Y" y el listado.
- **Vistas/funciones**: `views/metas.view.js` (`renderVistaMetas`, `renderMeta`), `views/tareas.view.js` (`crearPanelMeta` — un `<select>` único), `assets/js/modelos.js` (`crearMeta`).
- **Resultado**: nueva Meta; tareas con `meta_id` asignado.
- **Fricciones**: la asociación es indirecta y de a una — hay que ir a Tareas y abrir el panel "Meta" de cada tarea por separado; no se puede asociar varias tareas de una desde la vista Metas.

### B2. Visualizar el Gantt

- **Objetivo**: ver en el tiempo un conjunto de tareas, con sus dependencias, para detectar solapamientos o cuellos de botella.
- **Disparador**: planificación de conjunto de tareas que tienen dependencia, o revisión general.
- **Pasos (hoy)**: ir a Gantt → elegir una Meta puntual o "Todas las metas" (agrupa por meta con separadores) → ve una barra por tarea (inicio = `tarea_fecha_inicio_habilitada`, fin = `tarea_fecha_limite`, con fallbacks entre fechas si falta alguna) coloreada por categoría, con flechas SVG de dependencia entre barras visibles, arrastrables en los bordes para ajustar inicio/fin → clic en una barra abre esa tarea en Tareas.
- **Flujo usuario/sistema**:
  1. Usuario abre Gantt.
  2. Sistema muestra el selector de Meta y la grilla temporal con las tareas que tienen meta asociada (o un mensaje si no hay metas o tareas asociadas).
  3. Usuario elige una meta puntual (o deja "Todas las metas").
  4. Sistema redibuja una fila por tarea, con su barra y las flechas de dependencia entre barras visibles.
  5. Usuario arrastra el borde izquierdo o derecho de una barra.
  6. Sistema actualiza `tarea_fecha_inicio_habilitada` (borde izquierdo) o `tarea_fecha_limite` (borde derecho) y guarda.
  7. Usuario (alternativa) hace clic en una barra; sistema lleva a Tareas con esa tarea abierta en edición.
- **Vistas/funciones**: `views/gantt.view.js` (`renderVistaGantt`, `renderGrillaGantt`, `renderFlechasDependencia`, `agregarAsasGantt`).
- **Resultado**: posible cambio de `tarea_fecha_inicio_habilitada`/`tarea_fecha_limite` si se arrastra una barra.
- **Nota abierta para rediseño** (del usuario): el Gantt no debería estar limitado a tareas con una Meta asociada — tendría que mostrar cualquier tarea, con filtros según lo que el usuario quiera visualizar en cada momento. A definir: si conviene usar `tarea_fecha_sugerida` en vez de (o además de) `tarea_fecha_inicio_habilitada`, y cómo visualizar `tarea_fecha_limite` (hoy el fin de la barra ES el límite; si se separan ambos conceptos, hace falta una marca visual distinta para cada uno).
- **Fricciones**: hoy una tarea sin `meta_id` nunca aparece en Gantt, aunque tenga fechas y dependencias cargadas.

---

## Bloque C — Estructura y organización (ABMs)

### C1. Gestionar categorías

- **Objetivo**: estructurar las áreas de la vida en un árbol, y decidir su prioridad relativa.
- **Pasos**: Categorías → alta (nombre, descripción, color, categoría padre opcional — sin límite de niveles —, disfrute 1-5 estrellas) → la nueva entra al final del orden entre sus hermanas → reordenar con ▲/▼ (acotado a hermanas del mismo padre) → eliminar (hijas se promueven a raíz, tareas asociadas quedan sin categoría — ver `PROCESOS_AUTOMATICOS.md`).
- **Flujo usuario/sistema**:
  1. Usuario abre Categorías, completa el formulario (nombre, descripción, color, padre opcional, disfrute) y presiona "Agregar categoría".
  2. Sistema crea la categoría al final del orden entre sus hermanas, la guarda y redibuja el árbol.
  3. Usuario presiona ▲ o ▼ en una categoría.
  4. Sistema intercambia su prioridad con la hermana adyacente (mismo padre), guarda y redibuja.
  5. Usuario presiona ✕.
  6. Sistema pide confirmación advirtiendo que las hijas quedan promovidas y las tareas sin categoría.
  7. Si el usuario acepta, sistema promueve las hijas, desvincula las tareas, elimina la categoría y guarda.
- **Vistas/funciones**: `views/categorias.view.js`, `assets/js/modelos.js` (`crearCategoria`), `assets/js/utilidades.js` (`arbolCategorias`).
- **Resultado**: estructura de categorías y/o su orden actualizados.
- **Fricciones**: **no existe edición** — una vez creada, una categoría solo se puede reordenar o eliminar; para cambiar nombre/color/descripción/disfrute hay que borrarla y recrearla (con el efecto colateral de que sus tareas quedan sin categoría en el medio).

### C2. Gestionar ubicaciones

- **Objetivo**: tener lugares con coordenadas para poder chequear el clima real de las tareas asociadas.
- **Pasos**: Ubicaciones → alta (nombre, latitud, longitud a mano) → eliminar (tareas asociadas quedan sin ubicación).
- **Flujo usuario/sistema**:
  1. Usuario abre Ubicaciones y completa nombre, latitud y longitud (obtenidas por fuera de la app).
  2. Usuario presiona "Agregar ubicación".
  3. Sistema crea la ubicación, la guarda y la lista.
  4. Usuario presiona ✕ en una ubicación.
  5. Sistema pide confirmación (las tareas asociadas quedan sin ubicación); si se acepta, desvincula las tareas, elimina y guarda.
- **Vistas/funciones**: `views/ubicaciones.view.js`, `assets/js/modelos.js` (`crearUbicacion`).
- **Resultado**: Ubicacion nueva o eliminada.
- **Fricciones**: coordenadas 100% manuales, sin buscador de dirección ni GPS — hay que conseguirlas afuera y copiar/pegar. Mismo problema que Categorías: **no se puede editar**, solo crear/eliminar.

### C3. Gestionar personas

- **Objetivo**: no perder de vista hace cuánto no se ve/habla con alguien importante.
- **Pasos**: Personas → alta (nombre, último contacto) → lista ordenada de mayor a menor tiempo sin contacto → botón "Editar último contacto" permite indicar fecha a guardar *(⏳ no existe hoy: solo hay "Marcar contacto hoy", que fija la fecha de hoy — pedido del usuario, ver `REDISENO.md`)* → eliminar.
- **Flujo usuario/sistema**:
  1. Usuario abre Personas, completa el nombre (y opcionalmente el último contacto) y presiona "Agregar persona".
  2. Sistema crea la persona, la guarda y ordena la lista de mayor a menor tiempo sin contacto (sin registro va primero).
  3. Usuario presiona "Marcar contacto hoy" en una persona.
  4. Sistema fija `persona_ultimo_contacto` en la fecha de hoy, guarda y reordena.
  5. Usuario (alternativa) presiona ✕ y confirma; sistema elimina la persona.
- **Vistas/funciones**: `views/personas.view.js`, `assets/js/modelos.js` (`crearPersona`).
- **Resultado**: Persona nueva, actualizada o eliminada.
- **Fricciones**: sin relación con Tareas — no se puede crear una tarea del tipo "llamar a X" vinculada a una persona; es una lista aislada del resto del sistema.

---

## Bloque D — Datos y confiabilidad

### D1. Exportar / importar JSON

- **Objetivo**: llevarse una copia de los datos en un archivo propio (respaldo) o restaurar una.
- **Pasos**: "Exportar JSON" (cabecera) descarga un archivo con la fecha en el nombre; "Importar JSON" pide **confirmación explícita** (reemplaza todo lo que hay en Drive) y, si se acepta, reemplaza todo el estado con el contenido del archivo elegido. El modo "carpeta local" ya no existe: Google Drive es el único destino de los datos (ver D2).
- **Flujo usuario/sistema**:
  1. Usuario hace clic en "Exportar JSON"; sistema descarga un archivo con la fecha en el nombre.
  2. Usuario elige un archivo en "Importar JSON".
  3. Sistema muestra una confirmación: "Esto reemplaza todos los datos actuales (también en Drive)".
  4. Usuario confirma; sistema lee el archivo, migra el formato si hace falta, reemplaza el estado y lo guarda como cualquier otro cambio (buffer local → Drive; ver D2).
- **Vistas/funciones**: `assets/js/almacenamiento.js` (`exportarJSON`, `importarJSON`), botones de cabecera en `assets/js/app.js`.
- **Resultado**: archivo descargado, o estado reemplazado por el JSON importado (y subido a Drive).
- **Fricciones**: importar reemplaza todo, no mezcla. ⏳ En el rediseño, Exportar/Importar pasan a la vista Configuraciones (Ronda 5, ver `REDISENO.md`).

### D2. Conectar Google y sincronizar con Drive

- **Objetivo**: tener los datos disponibles y al día entre PC y celular, sin perder nada aunque se corte la conexión o se edite desde dos dispositivos.
- **Disparador**: primera vez que se abre la app en un dispositivo, o cada vez que hay que reconectar la sesión de Google (el token dura ~1 hora).
- **Pasos**: sin datos → pantalla inicial "Conectar con Google Drive" → popup de autorización de Google (**un solo permiso** que incluye Drive y Calendar de solo lectura) → si Drive no tiene el archivo de datos, lo crea con lo que hay (o con datos vacíos); si lo tiene, lo carga → a partir de ahí, cada cambio se guarda primero en un buffer local durable y se sube a Drive a los 2 s → la cabecera muestra siempre el estado de sincronización, la hora del último guardado y la de la última verificación, y un botón "Sincronizar ahora" → al volver a la pestaña, al recuperar red y cada 5 minutos, el sistema verifica solo si otro dispositivo cambió algo y lo mezcla.
- **Flujo usuario/sistema — primera conexión**:
  1. Usuario abre la app; sistema muestra la pantalla inicial (no deja cargar tareas hasta conectar).
  2. Usuario hace clic en "Conectar con Google Drive" y autoriza en el popup de Google (Drive y Calendar).
  3. Sistema busca `super-todo-list-datos.json` en Drive. Si no existe lo crea; si existe lo descarga. Guarda una copia local confirmada (`cache`).
  4. Sistema muestra la app y la cabecera pasa a "✅ Sincronizado" con fecha y hora.
- **Flujo usuario/sistema — cada cambio**:
  1. Usuario crea/edita/elimina algo.
  2. Sistema guarda de inmediato en el buffer local (IndexedDB) y la cabecera pasa a "⏳ pendiente".
  3. Sistema sube a Drive (debounce de 2 s) y, **recién cuando Drive confirma**, pasa a "✅ Sincronizado" con la hora y borra el buffer.
- **Flujo usuario/sistema — otro dispositivo cambió algo**:
  1. Sistema (al volver a la pestaña, cada 5 min o al recuperar red) compara la fecha de modificación de Drive.
  2. Si cambió, sistema descarga y mezcla por entidad (gana el cambio más reciente; si el mismo campo cambió en ambos lados, gana el más nuevo).
  3. Si algo se descartó, sistema deja un **aviso** en la cabecera con qué campo y qué valor se descartó; el usuario lo cierra a mano.
  4. Si el usuario está escribiendo, sistema difiere la actualización y muestra "Actualizar".
- **Flujo usuario/sistema — sin conexión / sesión vencida**:
  1. Sistema pasa a "Sin conexión" (copia de solo lectura con su fecha) o "Sesión vencida — Reconectar Drive". Las ediciones siguen guardándose en el buffer local.
  2. Al volver la conexión (o al reconectar), sistema mezcla y sube lo pendiente.
- **Vistas/funciones**: `assets/js/almacenamiento.js`, `assets/js/sincronizacion.js`, `assets/js/almacenamiento-local.js`, `assets/js/google-auth.js`, `assets/js/google-drive-sync.js`, cabecera y pantalla inicial en `assets/js/app.js`.
- **Resultado**: los datos viven en un único archivo del Drive del usuario; nada se pierde en silencio (buffer local hasta confirmar + avisos de conflicto). `localStorage` no guarda datos de tareas, solo preferencias.
- **Fricciones**: el token de Google no se persiste (dura ~1 hora): al abrir la app el sistema intenta reconectar sin popup; como el navegador suele bloquearlo (no hay un clic todavía), la cabecera avisa "hacé clic en cualquier parte de la página" y el primer clic reconecta y sincroniza solo (también existe el botón "Reconectar Drive"). Si abrís la app en dos pestañas, la segunda queda en solo lectura. Si nunca se validó "En producción" la app de Google, el consentimiento puede caducar a los ~7 días.

### D3. Conectar y usar Google Calendar

- **Objetivo**: usar Calendar como la fuente de verdad de lo agendado con horario fijo y de lo que realmente pasó, en paralelo a STDL.
- **Pasos — exportar una completada**: al completar una tarea, un `confirm()` pregunta si se quiere abrir en Calendar con los datos precargados (nombre, tarea_fecha_fin, duración) → si acepta, se abre `calendar.google.com/render` en una pestaña nueva y el usuario la guarda a mano ahí (sin OAuth).
- **Pasos — detectar solapamientos**: no hay un botón aparte para Calendar: se concede junto con Drive (D2). Con el permiso concedido, cada tarea con `tarea_fecha_sugerida` con hora se compara contra los eventos reales de **hoy**, y si se superpone se muestra un aviso *(⏳ falta el botón "Posponer" junto al aviso — pedido del usuario, ver `REDISENO.md`)*. Si el usuario desmarcó el permiso de Calendar al autorizar, esos avisos simplemente no aparecen.
- **Pasos — "Revisar mi día"**: si hay conexión, el paso final muestra los eventos reales del día (ver A6).
- **Flujo usuario/sistema — detectar solapamientos**:
  1. Usuario autoriza Google (Drive y Calendar de solo lectura, ver D2).
  2. Sistema guarda el token en memoria (no persiste) y redibuja Hoy.
  3. Sistema, por cada tarea con `tarea_fecha_sugerida` con hora, consulta los eventos de hoy (con caché en memoria por día) y compara ventanas.
  4. Sistema muestra "📅 Se superpone con…" en las tareas que chocan con un evento. (El flujo de exportar una completada está en A4, pasos 5-7.)
- **Vistas/funciones**: `assets/js/exportar-calendar.js`, `assets/js/google-calendar.js`, `assets/js/google-auth.js`, `views/hoy.view.js`, `assets/js/revision-dia.js`.
- **Resultado**: eventos creados en Calendar (fuera de STDL); ningún dato de STDL cambia por esto, salvo que el usuario reprograme a partir del aviso de solapamiento.
- **Fricciones**: la lectura de eventos hoy solo cubre **el día de hoy** — no hay lectura de eventos pasados ni de rangos futuros (relevante para la nota abierta de Informes, E1). Exportar es manual paso a paso (abrir pestaña, guardar a mano); no queda una confirmación de que efectivamente se guardó.

---

## Bloque E — Analítica

### E1. Ver Informes

- **Objetivo**: entender de un vistazo cómo viene la carga de trabajo y el uso del tiempo.
- **Pasos**: ir a Informes → 4 secciones: completadas (últimos 7 días) vs. pendientes por categoría; Enfoque 80/20 (lista); costo estimado total de pendientes; throughput semanal (últimas 8 semanas, gráfico de barras).
- **Flujo usuario/sistema**:
  1. Usuario abre Informes.
  2. Sistema calcula al vuelo, sobre las tareas y categorías en memoria, las 4 secciones (completadas vs. pendientes por categoría, Enfoque 80/20, costo estimado de pendientes, throughput semanal) y las muestra.
  3. Usuario lee; no hay acciones en esta vista.
- **Vistas/funciones**: `views/informes.view.js` — todo el cálculo es local y en vivo sobre `estado.tareas`/`estado.categorias`, sin ningún dato propio persistido.
- **Resultado**: no cambia datos, es de solo lectura con datos y gráficos.
- **Nota abierta para rediseño** (del usuario): evaluar que el historial "real" de lo ocurrido viva en Google Calendar (agenda fija + registro de lo que pasó) en vez de en STDL, ya que STDL está pensado para gestionar pendientes, no como bitácora histórica. Hoy Informes depende 100% de `tarea_fecha_fin`/`tarea_estado` propios de STDL; migrar a Calendar como fuente implicaría leer un **rango histórico** de eventos (hoy `google-calendar.js` solo lee el día de hoy, ver D3) y resolver cómo cruzar esos eventos con categorías/costos de STDL.
- **Fricciones**: throughput y completadas dependen enteramente de que el usuario complete las tareas *dentro* de STDL — si termina algo y lo anota directo en Calendar sin pasar por acá, no cuenta para estas métricas (tensión directa con la nota de arriba).

---

## Fuera de alcance — IA conectable (suspendido)

Existe hoy (`assets/js/ia-conectable.js`, paneles en Metas y Tareas para sugerir subtareas de una meta, definir una meta charlando, y reestructurar prioridades — todo por copiar/pegar manual con un LLM externo, sin API ni tokens propios). Por pedido explícito del usuario, se **suspende todo análisis y rediseño** de esta funcionalidad hasta después de v1.0.
