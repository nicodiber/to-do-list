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
| Agenda (antes 3 y 8 días) | Visualizador | A7 |
| Semana | Visualizador | A7 |
| Gantt | Visualizador | B2 |
| Tabla | Visualizador | A8 |
| Estadísticas (antes Informes; solapas Resumen, Progreso por categoría y Hábitos) | Visualizador | E1, E2, E3 |
| Tareas (listado + alta/edición) | ABM | A2, A3, A4, A5, B1 |
| Categorías | ABM | C1 |
| Ubicaciones | ABM | C2 |
| Metas | ABM | B1 |
| Personas | ABM | C3 |
| Mejoras | ABM | E4 |
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
- **Pasos**: abre Hoy (vista por defecto) → mira "Urgentes" (vencidas o con `tarea_fecha_limite` hoy, con su holgura en texto) → si no hay nada ahí, mira "Próximos por categoría" (la tarea que más conviene de cada categoría raíz, con el camino de la categoría) → y "Resto de tus pendientes" (lo demás, ordenado por `compararPorPrioridad`, sin repetir lo de arriba) → opcionalmente filtra por ubicación actual (compartido con Tareas y Agenda) o enciende "🎯 Enfoque" para ocultar lo ya completado hoy.
- **Flujo usuario/sistema**:
  1. Usuario abre la app (o navega a Hoy).
  2. Sistema muestra Hoy: filtro "¿Dónde estás?" (si hay ubicaciones cargadas), botón "🎯 Enfoque", "Revisar mi día" y las secciones "Urgentes", "Próximos por categoría", "Resto de tus pendientes", "Todavía no pueden empezar", "Bloqueadas por otras tareas" y, al final, "Completadas hoy (N)" (solo con el enfoque apagado).
  3. Usuario lee "Urgentes" (cada ítem con su holgura) y, si hay, decide cuál atacar.
  4. Si no hay urgentes, mira "Próximos por categoría" (un rato libre sin apuro) o "Resto" (orden `compararPorPrioridad`).
  5. Usuario (opcional) elige su ubicación actual; el sistema guarda esa preferencia (fuera de los datos de la app) y redibuja Hoy filtrada.
  6. Usuario (opcional) enciende o apaga "🎯 Enfoque"; el sistema recuerda la elección en este dispositivo.
  7. Usuario elige una tarea y sigue con A4 (completar) o A5 (reprogramar). En las tareas de mantenimiento puede tildar los pasos del checklist ahí mismo.
- **Avisos en la tarjeta**: "💡 Mejora pendiente" (las notas de mejora sin aplicar de una tarea de mantenimiento, hasta 2), "☀️ Buen clima previsto" o "🌧️ Lluvia probable" (solo tareas que piden buen clima, ver `PROCESOS_AUTOMATICOS.md` 8) y "📅 Se superpone con…" con los botones "Posponer" y "Al próximo hueco libre" (ver D3 y `PROCESOS_AUTOMATICOS.md` 9 y 19).
- **Vistas/funciones**: `views/hoy.view.js` (`renderVistaHoy`, `renderItem`, `renderCompletada`), `assets/js/tareas-logica.js` (`compararPorPrioridad`, `mejorTareaPorCategoria`, `calcularHolguraDias`, `esTareaAccionable`), `assets/js/ubicacion-actual.js`, `assets/js/checklist-tarjeta.js`.
- **Resultado**: no cambia datos, es de solo lectura (salvo que desde acá se accione otro caso de uso, como completar, reprogramar o mover al próximo hueco libre).
- **Fricciones**: sin atajo de teclado para ir directo a Hoy. "Revisar mi día" (A6) sigue pendiente de redefinir ahora que Hoy ya permite cumplir, no cumplir y reprogramar cada tarea. Los días ("vence hoy", vencidas, Completadas hoy) se calculan en hora local del dispositivo, en 24 h.

### A2. Cargar una tarea (rápida o completa)

- **Objetivo**: no perder una idea o pendiente apenas surge, sin importar el dispositivo, y poder darle todos sus datos en el mismo momento si se quiere.
- **Disparador**: se le ocurre algo, en cualquier momento.
- **Pasos**: botón "＋" de la cabecera (o atajo "N", o "＋ Nueva tarea" en la vista Tareas) desde cualquier vista → se abre la ventana "Nueva tarea" con el cursor en el nombre → escribe el nombre → Enter → tarea creada y la ventana queda abierta, vacía y lista para la siguiente. Si antes de confirmar completa más campos (todos visibles debajo del nombre y opcionales: categoría, importancia, disfrute, los 3 pares fecha+hora, duración, costo, descripción, ubicación, meta, tarea previa y próxima, buen tiempo, mantenimiento con intervalo, desencadenante y checklist, días hábiles), se crea la tarea completa. Un solo formulario, un solo campo de nombre.
- **Flujo usuario/sistema**:
  1. Usuario hace clic en "＋" (o presiona "N", si no está escribiendo en un campo).
  2. Sistema abre la ventana "Nueva tarea" encima de la vista actual (sin cambiar de vista) y enfoca el nombre.
  3. Usuario escribe el nombre (la primera letra queda en mayúscula). Si coincide exacto con una tarea ya cargada, el sistema precarga sus demás datos como sugerencia —solo en los campos que el usuario todavía no tocó—; los ve debajo y los puede cambiar.
  4. Usuario (opcional) completa los demás campos —agrupados en las secciones 📝 Qué, 📅 Cuándo, 📍 Dónde y costo, 🔗 Enlaces y 🔁 Repetición, cada uno con su título; "Requiere buen tiempo" y "Es de mantenimiento" son interruptores Sí/No y los días hábiles son fichas L M X J V S D—, incluido "depende de (tarea previa)" y "bloquea a (tarea próxima)". Si la categoría, la ubicación o la meta que necesita no existe, elige "＋ Crear nueva…" en ese desplegable: se abre la ventana de esa entidad y, al guardarla, la nueva queda seleccionada sin perder lo ya escrito.
  5. Usuario presiona **Enter** (o "Agregar y cargar otra") o "Agregar". Si quiere empezar de cero, "🧹 Limpiar campos" vacía el formulario (con confirmación).
  6. Sistema valida: si el pedido de enlaces es contradictorio (regla 1 a 1, ver `REDISENO.md`), muestra el conflicto y **no crea la tarea ni limpia el formulario** para que el usuario reajuste. Si elige una tarea ya enlazada, la nueva se inserta en medio (P→A→N).
  7. Sistema crea la tarea y la guarda. Con Enter / "Agregar y cargar otra" vacía el formulario y vuelve el cursor al nombre para cargar la siguiente; con "Agregar" cierra la ventana. "Cancelar" (o Esc / clic afuera) pregunta antes de descartar solo si hay algo escrito.
- **Vistas/funciones**: `assets/js/modal-tarea.js` (`abrirAltaTarea`), `assets/js/dialogo-formulario.js`, `assets/js/formulario-tarea.js` (`htmlFormularioTarea`, `leerFormularioTarea`, `validarFormularioTarea`), `assets/js/dependencias.js` (`aplicarEnlace`), `assets/js/modelos.js` (`crearTarea`), botón "＋" y atajo "N" en `assets/js/app.js`, botón "＋ Nueva tarea" en `views/tareas.view.js`.
- **Resultado**: nueva Tarea en `estado.tareas`, persistida (y enlazada, si se pidió).
- **Fricciones**: si se escribe en el nombre algo que coincide con una tarea ya cargada, la precarga completa los campos que no se tocaron aunque el usuario solo quisiera una alta rápida (los ve debajo y los puede corregir); nunca pisa lo ya cargado.

### A3. Completar carga de tareas cargadas rápido

- **Objetivo**: cuando vuelve a una pantalla más cómoda (ej. la PC después de cargar varias cosas desde el celular) o desde el celular tiene más tiempo, encontrar rápido cuáles tareas quedaron con datos mínimos y completarlas.
- **Disparador**: hay al menos una tarea que tiene solo el nombre cargado (la cabecera muestra "📝 Completar carga de tareas (X)" solo si X > 0).
- **Pasos**: clic en "📝 Completar carga de tareas (X)" → ventana modal con cada tarea "solo con nombre" en su propio formulario → en cada una, "Actualizar" (guarda lo cargado) o "Dejar así" (la saca de la lista) → Cerrar.
- **Flujo usuario/sistema**:
  1. Sistema detecta las tareas sin completar que tienen todo en su valor por defecto (sin categoría, importancia, disfrute, fechas, descripción, ubicación, meta, mantenimiento, días hábiles ni enlaces, duración 15) y que no fueron marcadas con "Dejar así"; si hay al menos una, muestra el botón con su cantidad.
  2. Usuario hace clic en el botón.
  3. Sistema abre una ventana con esas tareas, cada una con el formulario completo.
  4. Usuario completa los datos de una y presiona "Actualizar".
  5. Sistema valida (mismas reglas que el alta y la edición), guarda, y la tarea sale de la lista apenas deja de ser "solo nombre"; el contador baja. Lo escrito en las demás tarjetas se conserva.
  6. Usuario, si una tarea debe quedar así a propósito (por ejemplo "Comprar pan"), presiona "Dejar así": se marca `tarea_carga_completa` y deja de aparecer.
- **Vistas/funciones**: `assets/js/carga-tareas.js` (`abrirCargaTareas`), `assets/js/tareas-logica.js` (`esTareaSoloConNombre`, `tareasSoloConNombre`), botón en `index.html`/`assets/js/app.js`.
- **Resultado**: tareas con más datos, o marcadas `tarea_carga_completa`.
- **Fricciones**: la lista no se actualiza sola si llegan cambios de otro dispositivo mientras está abierta (se ve al volver a abrirla).

### A4. Marcar una tarea cumplida

- **Objetivo**: registrar que se hizo algo y seguir.
- **Disparador**: termina una tarea.
- **Pasos**: desde Hoy, Tareas o "Revisar mi día", botón "Cumplida ✓" → si la tarea es de mantenimiento, campo opcional "¿cómo se podría mejorar para la próxima vez?" → Confirmar → se completa y (si aplica) se clona la siguiente instancia, se desbloquean las tareas que dependían de esta, y se ofrece exportarla a Google Calendar.
- **Flujo usuario/sistema (desde Hoy)**:
  1. Usuario hace clic en "Cumplida ✓" de una tarea.
  2. Sistema muestra un panel de confirmación (con el campo "¿cómo se podría mejorar…?" solo si la tarea es de mantenimiento).
  3. Usuario (opcional) escribe la nota y presiona "Confirmar".
  4. Sistema marca la tarea completada y fija `tarea_fecha_fin`; si es de mantenimiento, crea la siguiente instancia; desbloquea las tareas que dependían de esta; guarda y redibuja.
  5. Sistema muestra una ventana de la página: "¿Abrir «tarea» en Google Calendar para guardarla como registro histórico?" con los botones "Abrir en Calendar" y "Cancelar". La tarea pasa a la sección "Completadas hoy" de Hoy, donde queda el botón "📅 Exportar a Calendar" (o "Exportar de nuevo", con la etiqueta "📅 Exportada") para hacerlo más tarde o repetirlo.
  6. Usuario acepta o cancela.
  7. Si acepta, sistema abre una pestaña nueva de Google Calendar con el evento precargado, y el usuario lo guarda a mano allí. (Desde Tareas, el punto de partida es el desplegable "Cambiar estado" → Completada; el resto es igual.)
- **Vistas/funciones**: mismo patrón repetido en `views/hoy.view.js`, `views/tareas.view.js` y `assets/js/revision-dia.js`; `assets/js/tareas-logica.js` (`cumplirTarea`, `reabrirTarea`); `assets/js/exportar-calendar.js` (`ofrecerExportarACalendar`); la sección "Completadas hoy" de `views/hoy.view.js`.
- **Resultado**: `tarea_estado='completada'`, `tarea_fecha_fin` seteada; se registra un cumplimiento; posible Mejora (si hay nota) y posible clon nuevo, enlazado a la cadena o al desencadenante (ver `PROCESOS_AUTOMATICOS.md`, procesos 1 y 15); posibles dependientes desbloqueadas; si se acepta abrir Calendar, `tarea_exportada_calendar` queda en `true`. **Reabrir** una completada (desplegable "Cambiar estado" → Pendiente en Tareas) deshace el cumplimiento y la marca de exportada, y borra la copia de mantenimiento si sigue sin tocar (si se modificó, se conserva y se avisa).
- **Fricciones**: las 3 vistas comparten ahora `cumplirTarea` (la lógica ya no está duplicada; el panel de confirmación sí sigue repetido en cada vista). (La sugerencia de tarea de alto disfrute — Premack — se eliminó; el `confirm()` de exportar a Calendar no resulta invasivo según el usuario.)

### A5. Reprogramar una tarea

- **Objetivo**: mover la fecha de una tarea que no se va a cumplir cuando estaba prevista.
- **Disparador**: no se llegó a hacer (reactivo), se decide adelantar/atrasar a propósito (proactivo), o el sistema detecta que ya venció.
- **Pasos — reactivo**: botón "No cumplida ✗" → "Reprogramar" → panel con atajos de día/hora → confirma → se mueve `tarea_fecha_sugerida`, en cascada a dependientes.
- **Pasos — proactivo**: botón "Posponer" (disponible en Tareas, Hoy y Agenda) → mismo panel.
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
- **Pasos**: navegar a "Agenda" (con el selector de 3, 8 o 15 días) → tareas agrupadas por día según `fechaDeReferencia` (`tarea_fecha_sugerida` > `tarea_fecha_limite`) → dentro de cada día, ordenadas por hora/prioridad → posponer directo desde cada tarjeta. "Semana" ofrece una grilla horaria (07-23h; en compu se ven los 7 días ajustados al ancho y en celular 3 o 4 por vez, con flechas) con las tareas de horario fijo ubicadas en su hora exacta y las proyectadas apiladas por prioridad, con arrastre para reprogramar.
- **Flujo usuario/sistema**:
  1. Usuario navega a "Agenda" y, si quiere, cambia el rango (3, 8 o 15 días; se recuerda la última elección).
  2. Sistema agrupa las tareas con fecha de referencia por día y, dentro de cada día, las ordena por hora y prioridad.
  3. Usuario revisa los días y detecta cuellos de botella.
  4. Usuario (opcional) hace clic en "Posponer" de una tarjeta.
  5. Sistema muestra el panel de reprogramar (A5) y, al confirmar, mueve la fecha y redibuja.
  6. (Semana) Usuario arrastra el borde de un bloque; sistema actualiza `tarea_fecha_sugerida`/`tarea_duracion_min` en pasos de 15 minutos y guarda.
- **Vistas/funciones**: `assets/js/vista-agenda.js` (`fechaDeReferencia`, `renderVistaAgenda`), `views/agenda.view.js`, `views/semana.view.js`.
- **Resultado**: no cambia datos (salvo que se reprograme algo desde ahí).
- **Fricciones**: Agenda y Semana muestran lo mismo con formatos distintos (lista por día vs. grilla por horas); por ahora se mantienen las dos.

### A8. Auditar y corregir el orden de prioridad

- **Objetivo**: confirmar que el orden que calcula la app tiene sentido, y corregirlo puntualmente si no.
- **Disparador**: duda sobre por qué una tarea aparece antes/después de lo esperado; revisión periódica.
- **Pasos**: ir a Tabla → ver el orden por defecto (`compararPorPrioridad`, el mismo que usa toda la app) → filtrar/buscar si hace falta → clic en un header de columna para mirar por un criterio puntual → si hay tareas empatadas, abrir "⚔️ Versus" → elegir cuál conviene antes de a pares (o "Da igual / Omitir") → `tarea_prioridad_manual` queda asignado a las tareas resueltas.
- **Flujo usuario/sistema**:
  1. Usuario abre Tabla.
  2. Sistema muestra todas las tareas (de cualquier estado) en el orden real de prioridad, con su holgura.
  3. Usuario detecta algo mal ubicado y (opcional) filtra por categoría/estado/importancia, busca por nombre u ordena por una columna.
  4. Usuario hace clic en "⚔️ Versus".
  5. Sistema agrupa las tareas accionables empatadas y muestra dos de ellas lado a lado.
  6. Usuario elige la que conviene antes, o "Da igual / Omitir".
  7. Sistema, si se eligió, asigna `tarea_prioridad_manual` a ambas y guarda; si se omitió, solo recuerda el par. En ambos casos muestra el siguiente par (o "No hay tareas empatadas…").
  8. Usuario (si corrige un dato) hace clic en una fila; sistema abre la ventana de edición de esa tarea encima de Tabla (sin cambiar de vista).
- **Vistas/funciones**: `views/tabla.view.js` (`renderVistaTabla`, `crearPanelVersus`, `construirClusteres`), `assets/js/tareas-logica.js` (`compararPorPrioridad`, `tareasEmpatadas`).
- **Resultado**: eventualmente, `tarea_prioridad_manual` asignado a algunas tareas.
- **Fricciones**: "Versus" opera sobre todas las tareas accionables de la app, sin acotarse a los filtros activos en ese momento en Tabla — puede sentirse desconectado de lo que se estaba mirando.

---

### A9. Usar la app con el teclado

- **Objetivo**: manejar lo más usado sin el mouse.
- **Atajos** (teclas solas, con el cursor fuera de un campo y sin ninguna ventana abierta; se ignoran con Ctrl, Alt o Meta y en la pantalla inicial):
  - **1…9 y 0**: abren las diez primeras pestañas en su orden (1 Hoy · 2 Agenda · 3 Semana · 4 Gantt · 5 Tabla · 6 Categorías · 7 Ubicaciones · 8 Metas · 9 Tareas · 0 Estadísticas). Mejoras, Personas y Configuraciones solo con el mouse.
  - **N**: nueva tarea. **F**: lleva el cursor al buscador o al primer filtro de la vista. **?** (o el botón ⌨️ de la cabecera): abre la ayuda con la lista de atajos.
  - En una ventana de formulario: **Ctrl+Enter** guarda o agrega (con el botón principal); **Enter** en el nombre de una tarea nueva la agrega y deja la ventana abierta; **Esc** cierra.
- **Tooltips**: al pasar el mouse por pestañas, botones, filtros y campos del formulario aparece el `title` del navegador con una explicación y, si hay atajo, su tecla ("Hoy (tecla 1)").
- **Vistas/funciones**: `assets/js/atajos.js` (`configurarAtajos`, `abrirAyudaAtajos`), `assets/js/dialogo-formulario.js` (Ctrl+Enter), `assets/js/app.js` (orden de las pestañas).
- **Fricciones**: las teclas se eligieron para no chocar con el navegador ni con Windows (por eso no se usa Ctrl); en el celular no hay atajos ni tooltips.

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

- **Objetivo**: ver en el tiempo todas las tareas, con sus cadenas de dependencia, para detectar solapamientos, cuellos de botella y tareas que no llegan a su fecha límite.
- **Disparador**: planificación de conjunto de tareas que tienen dependencia, o revisión general.
- **Pasos**: ir a Gantt → elegir el modo (**Plan**: cada tarea en su día sugerido; **Ventana**: el margen entre la fecha habilitada y el límite) y la escala (2 · 4 · 12 semanas, con "Hoy" para volver) → opcionalmente agrupar (categoría principal, meta o nada) y filtrar (categoría con sus subcategorías, meta, estado, texto en el nombre) → leer las barras y flechas → arrastrar o tocar una tarea.
- **Flujo usuario/sistema**:
  1. Usuario abre Gantt.
  2. Sistema (`construirFilas`, `assets/js/gantt-modelo.js`) arma una fila por cada tarea pendiente o bloqueada (por defecto), agrupada en carriles, con su posición en el tiempo: el día de su fecha sugerida si la tiene; si no, una **posición estimada** (barra punteada) que se calcula al dibujar y no se guarda: las tareas sin fecha y sin previa hacen una cola por prioridad dentro de su carril, una por día desde hoy (sin pasar antes de su fecha habilitada, si la cargaste), y las que tienen previa van el día siguiente a la de su previa. La fecha de creación nunca se usa.
  3. Sistema dibuja la línea de hoy, la bandera ⚑ del límite (roja si venció o si el día plan cae después del límite) y flechas: de la previa a la próxima (roja si la próxima queda antes que su previa) y punteada 🔁 del desencadenante a la tarea que activa (anillo de mantenimiento).
  4. Usuario cambia el modo, la escala, la agrupación o los filtros; el sistema redibuja conservando el desplazamiento (la escala recentra en hoy) y recuerda modo, escala y agrupación en este dispositivo.
  5. Usuario arrastra una barra (modo Plan): el sistema cambia `tarea_fecha_sugerida` (conservando la hora si tenía), desplaza en cascada las tareas encadenadas detrás (`reprogramarTareaConCascada`) y, si la tarea queda antes de que termine su previa, la guarda igual y avisa (la flecha se pone roja). Una tarea con posición estimada queda con fecha real al moverla, o con el botón 📌 de su fila.
  6. Usuario arrastra el borde izquierdo o derecho de una barra (modo Ventana): el sistema cambia `tarea_fecha_inicio_habilitada` o `tarea_fecha_limite` y guarda.
  7. Usuario hace clic (sin arrastrar) en una barra o en el nombre: se abre la ventana de edición de esa tarea encima del Gantt.
- **Vistas/funciones**: `views/gantt.view.js` (`renderVistaGantt`, `dibujarGrilla`, `dibujarFlechas`, `conectarInteracciones`), `assets/js/gantt-modelo.js` (`calcularPosiciones`, `calcularVentana`, `construirFilas`, `calcularConexiones`, `aplicarFiltros`, `habilitadaReal`), `assets/js/tareas-logica.js` (`reprogramarTareaConCascada`).
- **Resultado**: posible cambio de `tarea_fecha_sugerida` (arrastrar una barra en Plan o "📌 Fijar"), de `tarea_fecha_inicio_habilitada` o de `tarea_fecha_limite` (bordes en Ventana), más el desplazamiento en cascada de las tareas encadenadas.
- **Fricciones**: la posición estimada reparte una tarea por día y por carril sin mirar la duración (reparto por minutos disponibles: backlog); las tareas completadas se ven solo con el filtro de estado; las flechas del anillo son una guía y no se recalculan cuando la cadena cambia de carril; el arrastre en celular usa toques (se prueba mejor con el ratón).

## Bloque C — Estructura y organización (ABMs)

### C1. Gestionar categorías

- **Objetivo**: estructurar las áreas de la vida en un árbol, y decidir su prioridad relativa.
- **Pasos**: Categorías → "＋ Nueva categoría" (ventana modal: nombre, descripción, color, categoría padre opcional — sin límite de niveles —, disfrute 1-5 estrellas) → la nueva entra al final del orden entre sus hermanas → "Editar" en una tarjeta para cambiar cualquier campo, incluido el padre → reordenar con ▲/▼ (acotado a hermanas del mismo padre) → eliminar (hijas se promueven a raíz, tareas asociadas quedan sin categoría — ver `PROCESOS_AUTOMATICOS.md`). También se puede crear una categoría desde el desplegable "＋ Crear nueva categoría…" del formulario de una tarea.
- **Flujo usuario/sistema**:
  1. Usuario abre Categorías y presiona "＋ Nueva categoría"; sistema abre la ventana.
  2. Usuario completa los campos y presiona "Agregar categoría"; sistema la crea al final del orden entre sus hermanas, la guarda y redibuja el árbol.
  3. Usuario presiona "Editar" en una categoría; sistema abre la misma ventana con sus datos. El desplegable de padre **no ofrece la propia categoría ni sus descendientes** (crearía un ciclo).
  4. Usuario cambia lo que quiera y guarda; si cambió el padre, la categoría pasa al final de sus nuevas hermanas. Las tareas conservan su categoría. Si hay cambios sin guardar y cierra la ventana (Esc, clic afuera o Cancelar), el sistema pregunta antes de descartarlos.
  5. Usuario presiona ▲ o ▼; sistema intercambia su prioridad con la hermana adyacente (mismo padre).
  6. Usuario presiona ✕; sistema pide confirmación (las hijas quedan promovidas y las tareas sin categoría) y, si acepta, elimina.
- **Vistas/funciones**: `views/categorias.view.js`, `assets/js/formularios-entidades.js` (`abrirDialogoCategoria`), `assets/js/dialogo-formulario.js`, `assets/js/utilidades.js` (`arbolCategorias`, `descendientesDeCategoria`).
- **Resultado**: estructura de categorías y/o su orden actualizados.
- **Fricciones**: no se puede mover una categoría a otro lugar del orden más que con ▲/▼ (paso a paso).

### C2. Gestionar ubicaciones

- **Objetivo**: tener lugares con coordenadas para poder chequear el clima real de las tareas asociadas.
- **Pasos**: Ubicaciones → "＋ Nueva ubicación" (nombre, latitud, longitud a mano) → "Editar" → eliminar (tareas asociadas quedan sin ubicación). También se puede crear desde el desplegable "＋ Crear nueva ubicación…" del formulario de una tarea.
- **Flujo usuario/sistema**:
  1. Usuario presiona "＋ Nueva ubicación"; sistema abre la ventana, con una ayuda del formato: grados decimales (latitud −90 a 90, longitud −180 a 180, sur y oeste negativos).
  2. Usuario escribe el nombre y las coordenadas (obtenidas por fuera de la app; si pega el par "lat, lon" que copia Google Maps en Latitud, se reparte solo).
  3. Sistema valida los rangos, crea la ubicación, la guarda y la lista.
  4. Usuario presiona "Editar" para cambiar nombre o coordenadas, o ✕ para eliminar (con confirmación; las tareas asociadas quedan sin ubicación).
- **Vistas/funciones**: `views/ubicaciones.view.js`, `assets/js/formularios-entidades.js` (`abrirDialogoUbicacion`).
- **Resultado**: Ubicacion nueva, editada o eliminada.
- **Fricciones**: coordenadas 100% manuales, sin buscador de dirección ni GPS (decisión del usuario por ahora): hay que conseguirlas afuera.

### C3. Gestionar personas

- **Objetivo**: no perder de vista hace cuánto no se ve/habla con alguien importante.
- **Pasos**: Personas → alta (nombre, último contacto) → lista ordenada de mayor a menor tiempo sin contacto → "Editar" permite cambiar el nombre y la fecha del último contacto (además de "Marcar contacto hoy", que fija la de hoy) → eliminar.
- **Flujo usuario/sistema**:
  1. Usuario abre Personas, presiona "＋ Nueva persona", completa el nombre (y opcionalmente el último contacto) y presiona "Agregar persona".
  2. Sistema crea la persona, la guarda y ordena la lista de mayor a menor tiempo sin contacto (sin registro va primero).
  3. Usuario presiona "Marcar contacto hoy" en una persona.
  4. Sistema fija `persona_ultimo_contacto` en la fecha de hoy, guarda y reordena.
  5. Usuario (alternativa) presiona "Editar", cambia el nombre o el último contacto y guarda; o presiona ✕ y confirma y el sistema elimina la persona.
- **Vistas/funciones**: `views/personas.view.js`, `assets/js/formularios-entidades.js` (`abrirDialogoPersona`).
- **Resultado**: Persona nueva, actualizada o eliminada.
- **Fricciones**: sin relación con Tareas — no se puede crear una tarea del tipo "llamar a X" vinculada a una persona; es una lista aislada del resto del sistema.

---

## Bloque D — Datos y confiabilidad

### D1. Exportar / importar JSON

- **Objetivo**: llevarse una copia de los datos en un archivo propio (respaldo) o restaurar una.
- **Pasos**: en la vista **Configuraciones**, "Exportar JSON" descarga un archivo con la fecha en el nombre; "Importar JSON" pide **confirmación explícita** (reemplaza todo lo que hay en Drive) y, si se acepta, reemplaza todo el estado con el contenido del archivo elegido. El modo "carpeta local" ya no existe: Google Drive es el único destino de los datos (ver D2).
- **Flujo usuario/sistema**:
  1. Usuario hace clic en "Exportar JSON"; sistema descarga un archivo con la fecha en el nombre.
  2. Usuario elige un archivo en "Importar JSON".
  3. Sistema muestra una confirmación: "Esto reemplaza todos los datos actuales (también en Drive)".
  4. Usuario confirma; sistema lee el archivo, migra el formato si hace falta, reemplaza el estado y lo guarda como cualquier otro cambio (buffer local → Drive; ver D2).
- **Vistas/funciones**: `views/configuraciones.view.js`, `assets/js/almacenamiento.js` (`exportarJSON`, `importarJSON`, `borrarTodosLosDatos`).
- **Resultado**: archivo descargado, o estado reemplazado por el JSON importado (y subido a Drive).
- **Fricciones**: importar reemplaza todo, no mezcla.
- **Borrar todos los datos** (misma vista): pide una confirmación y luego escribir BORRAR; vacía tareas, categorías, ubicaciones, metas, personas, mejoras y cumplimientos, también en Drive y en los otros dispositivos. Conviene exportar antes una copia.

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
- **Pasos — exportar una completada**: al completar una tarea, una ventana de la página pregunta si se quiere abrir en Calendar con los datos precargados (nombre, tarea_fecha_fin, duración) → si acepta, se abre `calendar.google.com/render` en una pestaña nueva y el usuario la guarda a mano ahí (sin OAuth).
- **Pasos — detectar solapamientos**: no hay un botón aparte para Calendar: se concede junto con Drive (D2). Con el permiso concedido, cada tarea con `tarea_fecha_sugerida` con hora se compara contra los eventos reales de **hoy y los próximos 15 días** (`DIAS_HORIZONTE_CALENDAR`), y si se superpone se muestra un aviso con dos botones: **"Posponer"** (panel de fecha y hora) y **"Al próximo hueco libre"** (la mueve al primer momento sin choques). Si el usuario desmarcó el permiso de Calendar al autorizar, esos avisos simplemente no aparecen.
- **Pasos — "Revisar mi día"**: si hay conexión, el paso final muestra los eventos reales del día (ver A6).
- **Flujo usuario/sistema — detectar solapamientos**:
  1. Usuario autoriza Google (Drive y Calendar de solo lectura, ver D2).
  2. Sistema guarda el token en memoria (no persiste) y redibuja Hoy.
  3. Sistema, por cada tarea con `tarea_fecha_sugerida` con hora, consulta los eventos de los próximos 15 días (una sola consulta por rango, con caché en memoria de 5 minutos) y compara ventanas.
  4. Sistema muestra "📅 Se superpone con…" (con el día si no es hoy) y los botones "Posponer" y "Al próximo hueco libre" en las tareas que chocan con un evento. (El flujo de exportar una completada está en A4, pasos 5-7.)
  5. Si el usuario elige "Al próximo hueco libre", el sistema busca desde la hora sugerida (nunca antes de ahora), en pasos de 15 minutos, el primer momento en que la ventana `[inicio, inicio + tarea_duracion_min]` cae dentro de la franja horaria elegida en Configuraciones, en un día hábil de la tarea, y no choca con ningún evento; reprograma con `reprogramarTareaConCascada`. Si no hay hueco en el horizonte, avisa y abre el panel de Posponer.
  6. Al usar "Sincronizar ahora" o volver a la pestaña, el sistema olvida los eventos guardados y (si se está mirando Hoy) redibuja: los avisos aparecen o desaparecen según lo que hay ahora en Calendar.
- **Vistas/funciones**: `assets/js/exportar-calendar.js`, `assets/js/google-calendar.js`, `assets/js/google-auth.js`, `views/hoy.view.js`, `assets/js/revision-dia.js`, `assets/js/preferencias-horario.js`.
- **Resultado**: eventos creados en Calendar (fuera de STDL); ningún dato de STDL cambia por esto, salvo que el usuario reprograme a partir del aviso de solapamiento.
- **Fricciones**: la lectura de eventos cubre desde hoy hasta 15 días adelante (constante `DIAS_HORIZONTE_CALENDAR`, todavía no configurable) — no hay lectura de eventos pasados (relevante para la nota abierta de Estadísticas, E1), y Agenda y Semana todavía no muestran los eventos de Calendar. La franja horaria del "próximo hueco libre" se elige en **Configuraciones** ("Agenda y Calendar", desde/hasta en tramos de 30 minutos; por defecto 00:00 a 24:00; se guarda en este dispositivo). Exportar es manual paso a paso (abrir pestaña, guardar a mano); no queda una confirmación de que efectivamente se guardó.

---

## Bloque E — Analítica

### E1. Ver Estadísticas (solapa Resumen)

*(Estadísticas tiene tres solapas internas: Resumen, Progreso por categoría —E3— y Hábitos —E2—. Este caso describe el Resumen.)*

- **Objetivo**: entender de un vistazo cómo viene la carga de trabajo y el uso del tiempo.
- **Pasos**: ir a Estadísticas → 3 secciones: completadas (últimos 7 días) vs. pendientes por categoría; costo estimado total de pendientes; throughput semanal (las 2 últimas semanas completadas y las 6 próximas planificadas, gráfico de barras con leyenda).
- **Flujo usuario/sistema**:
  1. Usuario abre Estadísticas.
  2. Sistema calcula al vuelo, sobre las tareas y categorías en memoria, las 3 secciones (completadas vs. pendientes por categoría, costo estimado de pendientes, throughput semanal) y las muestra.
  3. Usuario lee; no hay acciones en esta vista.
- **Vistas/funciones**: `views/estadisticas.view.js` — todo el cálculo es local y en vivo sobre `estado.tareas`/`estado.categorias`, sin ningún dato propio persistido.
- **Resultado**: no cambia datos, es de solo lectura con datos y gráficos.
- **Nota abierta para rediseño** (del usuario): evaluar que el historial "real" de lo ocurrido viva en Google Calendar (agenda fija + registro de lo que pasó) en vez de en STDL, ya que STDL está pensado para gestionar pendientes, no como bitácora histórica. Hoy Informes depende 100% de `tarea_fecha_fin`/`tarea_estado` propios de STDL; migrar a Calendar como fuente implicaría leer un **rango histórico** de eventos (hoy `google-calendar.js` solo lee el día de hoy, ver D3) y resolver cómo cruzar esos eventos con categorías/costos de STDL.
- **Fricciones**: throughput y completadas dependen enteramente de que el usuario complete las tareas *dentro* de STDL — si termina algo y lo anota directo en Calendar sin pasar por acá, no cuenta para estas métricas (tensión directa con la nota de arriba).

---

### E2. Seguir mis hábitos

- **Objetivo**: ver de un vistazo si estoy cumpliendo las tareas que se repiten ("lo que no se mide no se mejora").
- **Pasos**: Estadísticas → solapa "Hábitos" → elegir el período (7 · 30 · 90 días) → leer la matriz: una fila por hábito (tarea de mantenimiento), una columna por día, hoy al final; a la derecha del nombre, la racha 🔥 y el porcentaje de cumplimiento.
- **Flujo usuario/sistema**:
  1. Usuario abre la solapa "Hábitos".
  2. Sistema arma (`calcularMapaHabitos`, `assets/js/habitos.js`) una fila por cada tarea de mantenimiento con cumplimientos o con su repetición abierta, y una celda por día: ✓ cumplido, ✗ incumplido (en un hábito diario, un día hábil sin hacer; en los demás, un vencimiento que se cumplió tarde o sigue vencido), ▫ pendiente hoy, · no aplica (días no hábiles, antes del primer registro, entre vencimientos).
  3. Sistema calcula la racha (días hábiles seguidos cumplidos; en hábitos no diarios, veces seguidas a tiempo) y el porcentaje del período solo sobre los días que tocaban.
  4. Sistema muestra debajo la **actividad por categoría** (una fila por categoría raíz; ✓ si ese día se cumplió alguna tarea de la categoría o de sus subcategorías; sin actividad queda en blanco).
  5. Usuario cambia el período; el sistema recuerda la elección en este dispositivo. En celular la matriz se desplaza hacia el costado y arranca mostrando los últimos días.
- **Vistas/funciones**: `views/habitos.view.js`, `assets/js/habitos.js`.
- **Resultado**: no cambia datos, es de solo lectura sobre los cumplimientos (que se registran al cumplir una tarea, ver A4).
- **Fricciones**: un hábito que dejaste de hacer sigue apareciendo (ocultar/archivar hábitos está en el backlog); la identidad del hábito es el nombre, aunque al renombrar la tarea el historial se actualiza solo; los días no hábiles se marcan "no aplica" en lugar de quitar la columna; no hay calendario anual por hábito todavía (backlog).

### E3. Ver el progreso por categoría

- **Objetivo**: saber cuánto falta en cada área y cuándo vence lo que queda.
- **Pasos**: Estadísticas → solapa "Progreso por categoría" → una tarjeta por categoría principal (con todas sus subcategorías sumadas): completadas de total con barra, tareas vencidas, tiempo a la próxima fecha límite, a la próxima fecha sugerida y a la última fecha límite; "Ver subcategorías" muestra lo mismo por cada una.
- **Vistas/funciones**: `views/progreso.view.js`, `assets/js/progreso-categorias.js` (`calcularProgresoPorCategoria`, `calcularMetricas`).
- **Resultado**: no cambia datos. Las tareas sin categoría van en una tarjeta aparte.

### E4. Repasar y aplicar mejoras

- **Objetivo**: convertir las notas de "¿qué podrías mejorar la próxima vez?" en mejoras reales de la rutina.
- **Pasos**: al cumplir una tarea de mantenimiento se anota la mejora (A4) → vista **Mejoras** (después de Tareas) → filtro Pendientes / Aplicadas / Todas → notas agrupadas por tarea, cada una con su fecha → "Marcar aplicada" cuando ya se incorporó (o "Volver a pendiente"), "Editar" para corregir el texto, "Eliminar" para quitarla. Mientras estén pendientes, se ven también en la tarjeta de Hoy de esa tarea ("💡 Mejora pendiente").
- **Vistas/funciones**: `views/mejoras.view.js`; `views/hoy.view.js` (`htmlMejorasPendientes`).
- **Resultado**: cambia `mejora_aplicada` o `mejora_texto`, o elimina la nota (queda registrada la eliminación para las demás pantallas y dispositivos, como cualquier baja).

---

## Fuera de alcance — IA conectable (suspendido)

Existe hoy (`assets/js/ia-conectable.js`, paneles en Metas y Tareas para sugerir subtareas de una meta, definir una meta charlando, y reestructurar prioridades — todo por copiar/pegar manual con un LLM externo, sin API ni tokens propios). Por pedido explícito del usuario, se **suspende todo análisis y rediseño** de esta funcionalidad hasta después de v1.0.
