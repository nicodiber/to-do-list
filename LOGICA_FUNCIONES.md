# Lógica de funciones

Documentación viva de qué hace cada función/módulo del proyecto, en lenguaje natural. Se actualiza junto con cada cambio funcional (mismo compromiso que ya existe para [DICCIONARIO_DE_DATOS.md](DICCIONARIO_DE_DATOS.md)) — al agregar o modificar una función con lógica no trivial, sumarla/actualizarla acá. Los nombres de campo mencionados son los de [DICCIONARIO_DE_DATOS.md](DICCIONARIO_DE_DATOS.md); las reglas de orden/prioridad están en [REGLAS_DE_PRIORIDAD.md](REGLAS_DE_PRIORIDAD.md) y no se repiten acá. No se documentan `assets/css/main.css`, `index.html` ni `manifest.json` (sin lógica de funciones, solo estructura/estilos).

## Arquitectura general

`assets/js/almacenamiento.js` mantiene un único objeto `estado` en memoria (`categorias`, `subcategorias`, `ubicaciones`, `metas`, `personas`, `tareas`). Las vistas (`views/*.view.js`) leen `estado` directamente y llaman `persistirYNotificar()` tras cualquier cambio, que guarda y vuelve a renderizar la vista activa. `assets/js/app.js` es el punto de entrada: arma la navegación, decide qué vista renderizar según el hash de la URL, e inicializa el resto de los módulos (notificaciones, service worker).

---

## `assets/js/app.js`

Bootstrap y router de toda la app.

- **`vistaActual()`**: lee `location.hash` y devuelve la clave de vista correspondiente (o `'hoy'` si el hash no coincide con ninguna registrada en `VISTAS`).
- **`renderNav()` / `render()`**: `render()` es la función que se re-ejecuta en cada cambio de hash o de datos (registrada tanto en `window.addEventListener('hashchange', ...)` como pasada a `suscribir()` de `almacenamiento.js`); redibuja la navegación, el estado de conexión (carpeta/Drive) y llama al `render` de la vista activa.
- **`actualizarEstadoConexion()` / `actualizarBotonDrive()`**: texto/estado de los botones de la cabecera según si hay carpeta local elegida o conexión a Drive activa.
- **Atajo de teclado "N"**: un listener global de `keydown` que, si no hay modificadores (`Ctrl`/`Alt`/`Meta`) y el foco no está en un campo editable (`INPUT`/`TEXTAREA`/`SELECT`/`contentEditable`), navega a la vista Tareas (si no se está ya ahí) y enfoca el input de alta rápida (`#form-alta-rapida input[name="tarea_nombre"]`). Usa un flag módulo (`enfocarAltaRapidaAlEntrar`) para enfocar recién después de que el cambio de hash haya disparado el re-render de la vista.
- **Tema claro/oscuro**: `temaEfectivo()`/`aplicarTema()` leen/aplican la preferencia guardada en `localStorage` (clave separada de los datos de la app), con fallback a `prefers-color-scheme` del sistema.
- Wiring de los botones de la cabecera (elegir carpeta, Drive, exportar/importar JSON, notificaciones) hacia las funciones correspondientes de `almacenamiento.js`/`notificaciones.js`.
- Al final, llama `inicializarAlmacenamiento()` y registra el service worker (`sw.js`), iniciando la revisión periódica de notificaciones con o sin service worker disponible.

## `assets/js/almacenamiento.js`

Estado en memoria, persistencia y migración de datos.

- **`estado`**: objeto exportado con las 6 colecciones de la app. Es la única fuente de verdad; todas las vistas lo mutan directamente y después llaman `persistirYNotificar()`.
- **`suscribir(fn)` / `notificar()`**: patrón observer simple — cualquier módulo puede suscribirse para re-renderizar cuando cambian los datos.
- **Migración retrocompatible** (`migrarCategoria`, `migrarSubcategoria`, `migrarUbicacion`, `migrarMeta`, `migrarPersona`, `migrarTarea`, `normalizarDatosCrudos`): convierten datos guardados con el formato de campos anterior al patrón `entidad_atributo` actual (ver historial en `CHANGELOG.md`, v0.43.0). Detectan formato viejo por la presencia de la clave `id` a secas (ninguna entidad en el formato nuevo la usa). `normalizarDatosCrudos(datos)` aplica el migrador correspondiente a cada colección y tolera colecciones ausentes.
- **Persistencia**: `guardarEnLocalStorage()` serializa `estado` completo a `localStorage`. `guardarTodo()` además escribe en la carpeta local elegida (si hay una, vía File System Access API) y sincroniza con Google Drive (si hay conexión). `persistirYNotificar()` es el atajo que usan las vistas: guarda y notifica a los suscriptores.
- **4 puntos de carga de datos externos** (todos pasan por `normalizarDatosCrudos`):
  - `cargarDeLocalStorage()`: lee la clave de `localStorage` al iniciar.
  - `cargarDesdeCarpeta()`: lee `categorias.json`/`tareas.json` de la carpeta local elegida (dos archivos separados).
  - `conectarDrive()`: conecta vía OAuth (`google-drive-sync.js`) y, si el archivo remoto cambió desde la última sincronización conocida de este dispositivo, pregunta con un `confirm()` qué versión conservar (no hay merge automático).
  - `importarJSON(archivo)`: reemplaza `estado` completo con el contenido de un archivo `.json` elegido a mano.
- **`elegirCarpetaDatos()` / `hayCarpetaDatosElegida()`**: File System Access API (`showDirectoryPicker`), con el handle guardado en IndexedDB (`abrirBD`/`guardarHandleCarpeta`/`recuperarHandleCarpeta`) para no tener que re-elegir la carpeta en cada sesión.
- **`exportarJSON()`**: descarga `estado` completo como archivo `.json` con la fecha en el nombre.
- **`inicializarAlmacenamiento()`**: orquesta el arranque — carga de `localStorage`, después intenta recuperar y cargar la carpeta local si había una guardada, y notifica al final.

## `assets/js/modelos.js`

Factories y constantes del modelo de datos — es la fuente de verdad de qué campos tiene cada entidad (debe coincidir 1:1 con `datos/esquema.json` y `DICCIONARIO_DE_DATOS.md`).

- **`crearCategoria`, `crearSubcategoria`, `crearUbicacion`, `crearPersona`, `crearMeta`, `crearTarea`**: una factory por entidad. Reciben los campos propios de la entidad (con sus defaults) y devuelven el objeto completo, generando `entidad_id` con `generarId()` y, donde aplica, `entidad_creada_en` con `ahoraISO()` (ambas de `utilidades.js`).
- **Constantes de UI**: `ESTADOS_TAREA`/`ETIQUETAS_ESTADO`, `NIVELES_IMPORTANCIA`/`ETIQUETAS_IMPORTANCIA`/`ICONOS_IMPORTANCIA`/`ORDEN_IMPORTANCIA` (usada por `compararPorPrioridad`, ver `REGLAS_DE_PRIORIDAD.md`), `PLAZOS_META`/`ETIQUETAS_PLAZO`, `UNIDADES_MANTENIMIENTO`/`ETIQUETAS_UNIDAD_MANTENIMIENTO`.

## `assets/js/utilidades.js`

Helpers puros de fecha/formato/id, sin dependencias de `estado`. Reutilizados por casi todos los demás módulos.

- **`generarId()`**: UUID (`crypto.randomUUID` con fallback manual).
- **`hoyISO()` / `ahoraISO()`**: fecha (`YYYY-MM-DD`) y datetime ISO actuales.
- **`formatearFecha(fechaISO)` / `formatearFechaHora(fechaHoraISO)`**: de formato interno ISO a formato de pantalla `DD/MM/YYYY` (con u sin hora).
- **`esVencida(fechaLimiteISO)` / `esHoy(fechaISO)`**: comparan contra `hoyISO()`.
- **`noPuedeEmpezarTodavia(fechaInicioPosibleISO)`**: `true` si la fecha es futura respecto a hoy — usada para separar tareas "todavía no disponibles" y para `esTareaAccionable`.
- **`fechaISOMasDias(dias, desdeISODate)`**: suma/resta días a una fecha.
- **`combinarFechaYHora(fechaISODate, horaHHMM)`**: arma un datetime ISO completo a partir de una fecha y una hora sueltas — usado por el panel de reprogramar y por el arrastre en la vista Semana.
- **`diasEntreFechas(fechaISO1, fechaISO2)`**: diferencia en días enteros entre dos fechas.
- **`escaparHtml(texto)`**: sanitiza texto libre antes de insertarlo en `innerHTML` (previene XSS con notas/nombres de usuario).

## `assets/js/tareas-logica.js`

Lógica de negocio central sobre tareas: mantenimiento cíclico, dependencias, prioridad (ver `REGLAS_DE_PRIORIDAD.md` para el detalle de orden/prioridad, no repetido acá).

- **`calcularProximaFechaMantenimiento(desdeISODatetime, mantenimiento)`**: dado un `tarea_mantenimiento` (`{ cantidad, unidad }`) y una fecha de referencia, calcula la próxima `tarea_fecha_limite`.
- **`completarTarea(tarea, listaTareas, opciones)`**: marca la tarea como `completada`, guarda `tarea_duracion_real_min`/`tarea_costo_real` si se pasaron. Si la tarea tiene `tarea_mantenimiento`, clona una nueva instancia `pendiente` (vía `crearTarea`) con la próxima fecha límite calculada desde la fecha real de finalización (no la teórica), copiando categoría, subcategoría, nombre, duración estimada, notas (con la mejora sugerida anexada si se cargó una), mantenimiento, recompensa y costo estimado. Devuelve la tarea clonada o `null` si no aplica mantenimiento.
- **`reprogramarTareaConCascada(tarea, nuevaFechaHoraISO, listaTareas)`**: actualiza `tarea_fecha_hora_agendada` y, si había una fecha previa, desplaza en cascada (mismo delta de tiempo) a todas las tareas que dependen de ella directa o indirectamente (`desplazarDependientes`), ajustando también sus `tarea_fecha_limite`/`tarea_fecha_sugerida`.
- **`tareaEstaBloqueada(tarea, listaTareas)`**: ver `REGLAS_DE_PRIORIDAD.md`.
- **`compararPorPrioridad(a, b, categorias)`**: ver `REGLAS_DE_PRIORIDAD.md`.
- **`puedeAgregarDependencia(tareaId, candidatoId, listaTareas)` / `existeCaminoDeDependencias(...)`**: valida que agregar una dependencia no cree un ciclo (directo o indirecto) en el grafo de dependencias, recorriéndolo recursivamente.
- **`esTareaAccionable(tarea, listaTareas)`**: ver `REGLAS_DE_PRIORIDAD.md`.
- **`calcularEnfoque8020(tareas, categorias)`**: ver `REGLAS_DE_PRIORIDAD.md`.

## `assets/js/reprogramar.js`

UI del panel de reprogramar (usado desde Hoy, Tareas, 3/8 días y "Revisar mi día").

- **`crearPanelReprogramar({ onConfirmar, onCancelar, diasHabiles })`**: arma un panel con atajos de día (hoy/mañana/+7/+15/+30, y "primer [día de la semana] del próximo mes") y de horario (mañana/tarde/tardecita/noche), más selectores manuales de fecha/hora. Si la tarea tiene `tarea_dias_habiles`, cualquier fecha elegida se ajusta automáticamente al próximo día hábil (`siguienteDiaHabil`/`esDiaHabil`). Al confirmar, llama `onConfirmar(fechaHoraISO)` combinando fecha y hora con `combinarFechaYHora`.

## `assets/js/revision-dia.js`

Asistente "Revisar mi día": repasa una por una las tareas accionables del día en un `<dialog>`.

- **`iniciarRevisionDia(tareas)`**: arma la cola de tareas activas (no completadas) y muestra el diálogo, paso a paso (`renderPaso`/`avanzar`).
- **`renderPaso()`**: por cada tarea, ofrece "Cumplida" (pide duración real, costo real opcional, y si la tarea tiene `tarea_mantenimiento` una nota de mejora opcional — llama `completarTarea`), "No cumplida" (abre directamente el panel de reprogramar, sin pedir motivo — el campo `motivo_incumplimiento` se eliminó en v0.43.0) o "Saltar".
- **`renderPasoFinal(dlg)` / `renderSeccionCalendario(contenedor)`**: al terminar la cola, si hay conexión con Google Calendar (`google-calendar.js`) muestra los eventos reales del día; si no, o si falla la consulta, ofrece un alta rápida de "tareas de continuidad" (`wirePreguntaContinuidad`) para cargar tareas nuevas surgidas de la revisión sin cerrar el diálogo.

## `assets/js/exportar-calendar.js`

Exportación puntual de una tarea completada a Google Calendar (sin OAuth).

- **`construirUrlExportarGoogleCalendar(tarea)`**: arma una URL de `calendar.google.com/render` con el evento precargado (inicio = `tarea_completada_en` menos la duración real/estimada, detalle con categoría/subcategoría/notas).
- **`ofrecerExportarACalendar(tarea)`**: pregunta con un `confirm()` si se quiere abrir esa URL en una pestaña nueva.

## `assets/js/clima.js`

Consulta de pronóstico real (Open-Meteo, sin API key) para tareas con `tarea_requiere_clima_bueno`.

- **`fechaDeReferencia(tarea)`** (privada, no confundir con la homónima de `vista-agenda.js`): resuelve fecha y hora aproximada a partir de `tarea_fecha_hora_agendada` (con su hora real) o, si no hay, `tarea_fecha_limite`/`tarea_fecha_sugerida` (a las 12:00 por defecto).
- **`obtenerPronosticoUbicacion(latitud, longitud)`**: fetch a la API de Open-Meteo, con caché en memoria por coordenadas (`cachePronosticos`) para no repetir la consulta.
- **`evaluarClimaTarea(tarea)`**: si la tarea no requiere clima bueno, no tiene ubicación con coordenadas, no tiene fecha resoluble, o esa fecha cae fuera de la ventana gratuita de pronóstico (16 días), devuelve `null`. Si hay datos, devuelve `{ favorable, probabilidadLluvia }` para que la vista muestre un aviso si la probabilidad de lluvia supera el umbral.

## `assets/js/recompensa.js`

- **`mostrarRecompensaSiCorresponde(tarea)`**: si la tarea tiene `tarea_recompensa` cargada, muestra un `alert()` felicitando y recordando la recompensa. Se llama en los 3 caminos donde se puede completar una tarea (Hoy, Tareas, "Revisar mi día").

## `assets/js/disfrute.js`

- **`sugerirTareaDeAltoDisfrute(tareaCompletada)`**: si la categoría de la tarea recién completada tiene `categoria_disfrute` bajo (≤2), busca entre las tareas accionables una de una categoría con `categoria_disfrute` alto (≥4) y sugiere continuar con ella (`alert()`) — principio de Premack aplicado a nivel categoría. No hace nada si no hay categoría, si no es de bajo disfrute, o si no hay ninguna candidata.

## `assets/js/vista-agenda.js`

Motor compartido de las vistas "3 días" y "8 días" (ambas son wrappers triviales que llaman `renderVistaAgenda` con distinta cantidad de días).

- **`fechaDeReferencia(tarea)`** (exportada): resuelve la fecha por la que se agrupa una tarea en la agenda — `tarea_fecha_hora_agendada` (solo la parte de fecha) > `tarea_fecha_limite` > `tarea_fecha_sugerida`, la primera que tenga valor. También la usa `views/tabla.view.js` para ordenar.
- **`renderVistaAgenda(contenedor, cantidadDias)`**: agrupa las tareas pendientes (filtradas por la "ubicación actual", ver `ubicacion-actual.js`) por día, para los próximos `cantidadDias` empezando hoy, y arma una columna por día (`renderColumnaDia`).
- **`renderTarjetaTarea(tarea)`**: arma la tarjeta de una tarea dentro de la agenda (mismos badges que Hoy/Tareas) con un botón "Posponer" que abre el panel de reprogramar (`reprogramar.js`) y aplica `reprogramarTareaConCascada`.

## `assets/js/ia-conectable.js`

Capa de IA "conectable": arma prompts en texto plano para copiar/pegar en un LLM externo (ChatGPT, Claude, etc.) y parsea la respuesta pegada de vuelta. No llama a ninguna API de IA directamente — flujo 100% manual, offline-first.

- **`construirPromptSubtareas(meta)` / `parsearRespuestaSubtareas(texto)`**: pide una lista de tareas concretas para avanzar una Meta; el contrato JSON esperado usa las claves `tarea_nombre`/`tarea_duracion_estimada_min`/`dias_desde_hoy`/`tarea_notas` (las 3 primeras mapean directo a campos de Tarea; `dias_desde_hoy` es transitorio, se resuelve a `tarea_fecha_sugerida` en el caller).
- **`construirPromptPrioridades(tareas, categorias)` / `parsearRespuestaPrioridades(texto, tareasDisponibles)`**: pide una `tarea_importancia` sugerida por tarea accionable actual; devuelve solo los cambios reales (donde la sugerida difiere de la actual).
- **`construirPromptChatMeta(historial)` / `parsearRespuestaChatMeta(texto)`**: diálogo de ida y vuelta para definir una Meta desde una idea vaga — cada prompt reenvía el historial completo (el LLM externo no tiene memoria entre turnos).
- **`construirPromptFinalizarMeta(historial)` / `parsearRespuestaFinalizarMeta(texto)`**: cierra la conversación pidiendo un JSON con `meta_nombre`/`meta_plazo`/`meta_fecha_objetivo`/`meta_descripcion`, listo para pasarle a `crearMeta`.

## `assets/js/notificaciones.js`

Notificaciones locales del navegador (no hay push real, la app no tiene backend).

- **`soportaNotificaciones()` / `permisoNotificacionesConcedido()` / `permisoNotificacionesDenegado()` / `solicitarPermisoNotificaciones()`**: wrappers sobre la Notification API.
- **`revisarTareasProximas(estado, registroSW)`**: busca tareas con `tarea_fecha_hora_agendada` dentro de los próximos 10 minutos (con 2 minutos de tolerancia de atraso) que todavía no se notificaron para ese horario exacto (`tarea_notificada_en_para !== tarea_fecha_hora_agendada`), y dispara una notificación por cada una (vía el service worker si está disponible, si no vía `Notification` directo). Marca `tarea_notificada_en_para` para no repetir el aviso.
- **`iniciarRevisionNotificaciones(estado, registroSW)`**: corre `revisarTareasProximas` de inmediato y después cada 60 segundos mientras la pestaña esté abierta.

## `assets/js/google-calendar.js`

Lectura de eventos reales de Google Calendar (requiere OAuth, a diferencia de la exportación puntual).

- **`soportaGoogleCalendar()` / `hayConexionGoogleCalendar()` / `conectarGoogleCalendar()`**: Google Identity Services (token client, scope de solo lectura), token en memoria (no persiste, expira en ~1h).
- **`obtenerEventosDeHoy()`**: trae los eventos del día actual, con caché en memoria por día.
- **`calcularSolapamiento(tarea, eventos)`**: compara la ventana `[tarea_fecha_hora_agendada, +tarea_duracion_estimada_min]` contra cada evento y devuelve el primero que se superpone (usado en Hoy para el aviso "📅 Se superpone con...").

## `assets/js/google-drive-sync.js`

Sincronización vía Google Drive API (OAuth, scope `drive.file` — la app solo ve archivos que ella misma crea).

- **`soportaGoogleDrive()` / `hayConexionDrive()` / `conectarDriveOAuth()`**: mismo patrón de token client que `google-calendar.js`, con su propio Client ID/scope.
- **`buscarArchivoRemoto()`**: busca (o reusa de la sesión) el archivo `super-todo-list-datos.json` en el Drive del usuario; devuelve `{ id, modifiedTime }` o `null`.
- **`leerArchivoRemoto(id)` / `guardarArchivoRemoto(datos)`**: descarga el contenido del archivo remoto, o lo crea/actualiza (multipart upload la primera vez, `PATCH` las siguientes) con el `estado` completo.

## `assets/js/ubicacion-actual.js`

- **`obtenerUbicacionActual()` / `establecerUbicacionActual(idUbicacion)`**: preferencia de "¿dónde estás?" compartida entre Hoy, Tareas y 3/8 días, en una clave propia de `localStorage` (no en `estado` — es preferencia de sesión, no dato de la app, no se sincroniza vía Drive/carpeta). Mismo patrón que el tema claro/oscuro.

---

## `views/hoy.view.js`

Vista "Hoy": separa tareas urgentes del resto (ver `REGLAS_DE_PRIORIDAD.md`), con un asistente de cierre por tarjeta.

- **`renderVistaHoy(contenedor)`**: arma las secciones Urgentes / Resto / Todavía no pueden empezar / Bloqueadas, filtradas por la ubicación actual.
- **`renderItem(tarea, opciones)`**: tarjeta de una tarea con todos sus badges (importancia, foco 80/20, categoría, fechas, estado, ubicación, recompensa, costo, genera_dinero, aviso de clima, aviso de solapamiento con Calendar). Si `soloInfo` es `false` (tareas accionables), agrega los botones "Cumplida"/"No cumplida" que abren el panel de cierre correspondiente (duración/costo real, o reprogramar directo).

## `views/tres-dias.view.js` / `views/ocho-dias.view.js`

Wrappers triviales: delegan en `renderVistaAgenda(contenedor, 3)` / `renderVistaAgenda(contenedor, 8)` de `vista-agenda.js`. Sin lógica propia.

## `views/semana.view.js`

Vista "Semana": grilla horaria de 7 días (07:00-23:00) con tareas fijas y proyectadas.

- **`renderVistaSemana(contenedor)`**: arma la grilla (`renderColumnaHoras` + una `renderColumnaDia` por día).
- **`renderColumnaDia(fechaDia, hoy)`**: separa tareas "fijas" (con `tarea_fecha_hora_agendada` ese día, ubicadas en su horario exacto) de "proyectadas" (accionables sin horario agendado cuya `tarea_fecha_sugerida`/`tarea_fecha_limite` cae ese día, apiladas por prioridad — ver `REGLAS_DE_PRIORIDAD.md`).
- **`renderBloqueTarea(...)` / `agregarAsasArrastre(...)`**: cada bloque tiene asas arrastrables en el borde superior/inferior (Pointer Events) para modificar `tarea_fecha_hora_agendada`/`tarea_duracion_estimada_min` directamente desde la grilla, en pasos de 15 minutos. Arrastrar una tarea proyectada le asigna un horario real y pasa a listarse como fija.

## `views/tareas.view.js`

La vista más grande: ABM completo de tareas, filtros, y los paneles de dependencias/metas/edición/IA.

- **`renderVistaTareas(contenedor)`**: arma el formulario de alta (rápida y detallada), los filtros (categoría/estado/ubicación/importancia/multitasking/agrupar por categoría) y la lista filtrada/ordenada (ver `REGLAS_DE_PRIORIDAD.md`).
- **`tareasUnicasPorNombre()`**: para el `<datalist>` de autocompletado y para precargar los demás campos del formulario cuando el nombre tipeado coincide con una tarea ya creada (toma la más reciente por nombre).
- **`renderTarea(tarea, enfoqueIds)`**: tarjeta con todos los badges y las acciones (cambiar estado, posponer, dependencias, metas, editar, eliminar).
- **`crearPanelEditar(tarea)`**: formulario de edición completo, con los mismos campos que el alta, precargados.
- **`crearPanelDependencias(tarea)` / `crearPanelMetas(tarea)`**: paneles de checkboxes para editar `dependencias` (validando ciclos vía `puedeAgregarDependencia`) y `metas_ids`.
- **`crearPanelIAPrioridades()`**: UI del flujo de copiar/pegar con IA para reestructurar `tarea_importancia` de las tareas accionables (`ia-conectable.js`).

## `views/tabla.view.js`

- **`renderVistaTabla(contenedor)`**: todas las tareas no completadas en formato tabla (Nombre/Categoría/Importancia/Estado/Fecha/Días), ordenadas por `fechaDeReferencia` (`vista-agenda.js`). Clic en una fila abre esa tarea en edición en Tareas (`abrirEdicionAlEntrar`).
- **`formatearDias(dias)`**: texto relativo ("Hoy"/"En 3 días"/"Vencida hace 2 días") a partir de la diferencia en días calculada con `diasEntreFechas`.

## `views/categorias.view.js`

ABM de categorías y subcategorías.

- **`renderVistaCategorias(contenedor)`**: alta de categoría (nombre/color/disfrute) y lista ordenada por `categoria_orden`.
- **`renderCategoria(categoria, indice, categoriasOrdenadas)`**: tarjeta con botones ▲/▼ para reordenar (`intercambiarPrioridad`, intercambia `categoria_orden` con la adyacente), eliminar (deja las tareas/subcategorías asociadas sin categoría), y el ABM inline de subcategorías de esa categoría.

## `views/ubicaciones.view.js`

- **`renderVistaUbicaciones(contenedor)` / `renderUbicacion(ubicacion)`**: ABM simple (nombre + latitud + longitud). Al eliminar una ubicación, las tareas que la referenciaban quedan con `ubicacion_id: null`.

## `views/metas.view.js`

ABM de metas, con progreso calculado al vuelo y los flujos de IA conectable para esa Meta.

- **`renderVistaMetas(contenedor)` / `renderMeta(meta)`**: alta de meta y tarjeta con progreso (tareas con `metas_ids` que incluyen esta meta, completadas vs. total) y barra de progreso.
- **`crearPanelIA(meta)`**: flujo de copiar/pegar para sugerir subtareas (`ia-conectable.js`), con preview de qué tareas se van a crear antes de confirmarlas.
- **`crearPanelChatMeta(contenedorPanel)`**: flujo conversacional de ida y vuelta para definir una meta desde cero, con un paso final que arma la meta a partir del JSON devuelto por el LLM.

## `views/gantt.view.js`

Diagrama de Gantt por Meta.

- **`renderVistaGantt(contenedor)`**: filtro por meta (o todas), arma las filas (`fechaInicioTarea`/`fechaFinTarea` resuelven el rango de cada tarea) y llama `renderGrillaGantt` + `renderFlechasDependencia`.
- **`renderGrillaGantt(filas)`**: calcula el rango total de fechas visible, dibuja el encabezado con marcas de fecha y una fila por tarea (`renderFilaGanttHtml`), agregando asas de arrastre (`agregarAsasGantt`, Pointer Events) para modificar `tarea_fecha_inicio_posible`/`tarea_fecha_limite` directamente.
- **`renderFlechasDependencia(grilla, filas)`**: dibuja flechas SVG entre tareas bloqueantes/bloqueadas cuando ambas están visibles en el filtro actual.

## `views/personas.view.js`

- **`renderVistaPersonas(contenedor)`**: ABM de personas, ordenadas de mayor a menor tiempo sin contacto (`diasDesdeContacto`, sin registro = primero).
- **`renderPersona(persona)`**: tarjeta con botón "Marcar contacto hoy" (actualiza `persona_ultimo_contacto` a la fecha actual).

## `views/informes.view.js`

Métricas calculadas al vuelo sobre `estado.tareas`, sin histórico propio guardado (ventana de los últimos 7 días salvo que se indique otra cosa).

- **`calcularPorCategoria(desde)`**: completadas en la ventana vs. pendientes actuales, por categoría (y una fila "Sin categoría").
- **`calcularDuraciones()` / `calcularCostosRealVsEstimado()`**: promedio/total estimado vs. real, sobre tareas completadas que tengan ambos datos cargados (`tarea_duracion_estimada_min`+`tarea_duracion_real_min`, `tarea_costo_estimado`+`tarea_costo_real`).
- **`calcularProyeccionCostos()`**: suma de `tarea_costo_estimado` de las tareas pendientes activas.
- **`calcularThroughputSemanal()`**: cantidad de tareas completadas por semana, últimas 8 semanas, sobre `tarea_completada_en`.
- **`renderVistaInformes(contenedor)`**: arma las secciones Completadas vs. pendientes / Duración / Enfoque 80/20 (`calcularEnfoque8020`, ver `REGLAS_DE_PRIORIDAD.md`) / Costos / Throughput semanal.

## `sw.js`

Service worker de la PWA — estrategia network-first (nunca cache-first, para no interferir con el desarrollo activo ni servir contenido viejo).

- **`install`**: precachea el app shell completo (`ARCHIVOS_PRECACHE`, lista mantenida a mano — ver `AGENTS.md`) con `{ cache: 'reload' }` para evitar que el CDN de GitHub Pages sirva una copia vieja desde su propia caché HTTP.
- **`activate`**: borra cualquier caché con un nombre distinto al `CACHE_NAME` actual (se bumpea en cada entrega que cambie archivos del shell, para forzar la actualización).
- **`fetch`**: para pedidos del mismo origen, intenta red primero (`{ cache: 'reload' }`, mismo motivo que en `install`) y cachea la respuesta; si falla (sin conexión), cae a lo que haya en caché.
- **`notificationclick`**: al hacer clic en una notificación, enfoca una pestaña ya abierta de la app (navegándola a la URL de la notificación) o abre una nueva si no hay ninguna.
