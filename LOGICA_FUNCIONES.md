# Lógica de funciones

Documentación viva de qué hace cada función/módulo del proyecto, en lenguaje natural. Se actualiza junto con cada cambio funcional (mismo compromiso que ya existe para [DICCIONARIO_DE_DATOS.md](DICCIONARIO_DE_DATOS.md)) — al agregar o modificar una función con lógica no trivial, sumarla/actualizarla acá. Los nombres de campo mencionados son los de [DICCIONARIO_DE_DATOS.md](DICCIONARIO_DE_DATOS.md); las reglas de orden/prioridad están en [REGLAS_DE_PRIORIDAD.md](REGLAS_DE_PRIORIDAD.md) y no se repiten acá. No se documentan `assets/css/main.css`, `index.html` ni `manifest.json` (sin lógica de funciones, solo estructura/estilos).

## Arquitectura general

`assets/js/almacenamiento.js` mantiene un único objeto `estado` en memoria (`categorias`, `ubicaciones`, `metas`, `personas`, `tareas`). Las vistas (`views/*.view.js`) leen `estado` directamente y llaman `persistirYNotificar()` tras cualquier cambio, que guarda y vuelve a renderizar la vista activa. `assets/js/app.js` es el punto de entrada: arma la navegación, decide qué vista renderizar según el hash de la URL, e inicializa el resto de los módulos. Categoria es una entidad auto-referenciada (`categoria_padre_id`) — no existe una entidad Subcategoria separada.

---

## `assets/js/app.js`

Bootstrap y router de toda la app.

- **`vistaActual()`**: lee `location.hash` y devuelve la clave de vista correspondiente (o `'hoy'` si el hash no coincide con ninguna registrada en `VISTAS`).
- **`renderNav()` / `render()`**: `render()` es la función que se re-ejecuta en cada cambio de hash o de datos (registrada tanto en `window.addEventListener('hashchange', ...)` como pasada a `suscribir()` de `almacenamiento.js`); redibuja la navegación, el estado de conexión (carpeta/Drive) y llama al `render` de la vista activa.
- **`actualizarEstadoConexion()` / `actualizarBotonDrive()`**: texto/estado de los botones de la cabecera según si hay carpeta local elegida o conexión a Drive activa.
- **Atajo de teclado "N"**: un listener global de `keydown` que, si no hay modificadores (`Ctrl`/`Alt`/`Meta`) y el foco no está en un campo editable (`INPUT`/`TEXTAREA`/`SELECT`/`contentEditable`), navega a la vista Tareas (si no se está ya ahí) y enfoca el input de alta rápida (`#form-alta-rapida input[name="tarea_nombre"]`). Usa un flag módulo (`enfocarAltaRapidaAlEntrar`) para enfocar recién después de que el cambio de hash haya disparado el re-render de la vista.
- **Tema claro/oscuro**: `temaEfectivo()`/`aplicarTema()` leen/aplican la preferencia guardada en `localStorage` (clave separada de los datos de la app), con fallback a `prefers-color-scheme` del sistema.
- Wiring de los botones de la cabecera (elegir carpeta, Drive, exportar/importar JSON) hacia las funciones correspondientes de `almacenamiento.js`.
- Al final, llama `inicializarAlmacenamiento()` y registra el service worker (`sw.js`).

## `assets/js/almacenamiento.js`

Estado en memoria, persistencia y migración de datos.

- **`estado`**: objeto exportado con las 5 colecciones de la app (`categorias`, `ubicaciones`, `metas`, `personas`, `tareas`). Es la única fuente de verdad; todas las vistas lo mutan directamente y después llaman `persistirYNotificar()`.
- **`suscribir(fn)` / `notificar()`**: patrón observer simple — cualquier módulo puede suscribirse para re-renderizar cuando cambian los datos.
- **Migración retrocompatible**, en dos pasos:
  - **`fusionarSubcategoriasEnCategorias(datosCrudos)`**: si los datos traen una colección `subcategorias` separada (formato de rondas anteriores), convierte cada una en una Categoria (reusando el mismo id como `categoria_id`, con `categoria_padre_id` = la categoría que era su padre), y reasigna `tarea.categoria_id = tarea.subcategoria_id` en cualquier tarea que tuviera ese campo.
  - **`migrarCategoria`, `migrarUbicacion`, `migrarMeta`, `migrarPersona`, `migrarTarea`**: migradores por entidad, tolerantes a 3 generaciones de formato (el original con clave `id`, el patrón `entidad_atributo` de la ronda anterior, y el formato actual), detectando cuál es por la presencia/ausencia de claves clave. `normalizarDatosCrudos(datos)` encadena ambos pasos y, al final, recorre las tareas migradas con `recalcularBloqueo` (de `tareas-logica.js`) para fijar el `tarea_estado` inicial correcto según `tarea_dependiente`.
- **Persistencia**: `guardarEnLocalStorage()` serializa `estado` completo a `localStorage`. `guardarTodo()` además escribe en la carpeta local elegida (si hay una) y sincroniza con Google Drive (si hay conexión). `persistirYNotificar()` es el atajo que usan las vistas: guarda y notifica a los suscriptores.
- **4 puntos de carga de datos externos** (todos pasan por `normalizarDatosCrudos`): `cargarDeLocalStorage()`, `cargarDesdeCarpeta()` (combina `categorias.json` + `tareas.json` en un solo objeto antes de normalizar, para que la fusión de Subcategoria pueda ver las tareas de ambos archivos), `conectarDrive()`, `importarJSON(archivo)`.
- **`elegirCarpetaDatos()` / `hayCarpetaDatosElegida()`**: File System Access API, con el handle guardado en IndexedDB para no tener que re-elegir la carpeta en cada sesión.
- **`exportarJSON()`**: descarga `estado` completo como archivo `.json`.
- **`inicializarAlmacenamiento()`**: orquesta el arranque — carga de `localStorage`, después intenta recuperar y cargar la carpeta local si había una guardada, y notifica al final.

## `assets/js/modelos.js`

Factories y constantes del modelo de datos — es la fuente de verdad de qué campos tiene cada entidad (debe coincidir 1:1 con `datos/esquema.json` y `DICCIONARIO_DE_DATOS.md`).

- **`crearCategoria`, `crearUbicacion`, `crearPersona`, `crearMeta`, `crearTarea`**: una factory por entidad. Reciben los campos propios de la entidad (con sus defaults) y devuelven el objeto completo, generando `entidad_id` con `generarId()`. `crearTarea` calcula `tarea_creada_en` una sola vez y la usa también como default de `tarea_fecha_inicio_habilitada` si no se pasó una.
- **Constantes de UI**: `ESTADOS_TAREA`/`ETIQUETAS_ESTADO` (`bloqueada`/`pendiente`/`completada`), `NIVELES_IMPORTANCIA`/`ETIQUETAS_IMPORTANCIA`/`ICONOS_IMPORTANCIA` (`urgente`/`importante`), `PLAZOS_META`/`ETIQUETAS_PLAZO`, `UNIDADES_MANTENIMIENTO`/`ETIQUETAS_UNIDAD_MANTENIMIENTO`.

## `assets/js/utilidades.js`

Helpers puros de fecha/formato/id, sin dependencias de `estado`. Reutilizados por casi todos los demás módulos.

- **`generarId()`**: UUID (`crypto.randomUUID` con fallback manual).
- **`hoyISO()` / `ahoraISO()`**: fecha (`YYYY-MM-DD`) y datetime ISO actuales.
- **`tieneHora(fechaISO)`**: `true` si el string tiene más de 10 caracteres (convención fecha±hora, ver `DICCIONARIO_DE_DATOS.md`).
- **`formatearFecha(fechaISO)` / `formatearFechaHora(fechaHoraISO)` / `formatearFechaOFechaHora(fechaISO)`**: de formato interno ISO a formato de pantalla `DD/MM/YYYY` (con o sin hora); la tercera elige automáticamente según `tieneHora`.
- **`esVencida(fechaLimiteISO)` / `esHoy(fechaISO)`**: comparan contra `hoyISO()`. `esHoy` compara solo los primeros 10 caracteres, para que una fecha con hora también matchee "hoy".
- **`noPuedeEmpezarTodavia(fechaInicioHabilitadaISO)`**: si el valor tiene hora, compara contra el instante actual (`new Date()`); si no, contra `hoyISO()`.
- **`fechaISOMasDias(dias, desdeISODate)`**: suma/resta días a una fecha.
- **`combinarFechaYHora(fechaISODate, horaHHMM)`**: arma un datetime ISO completo a partir de una fecha y una hora sueltas.
- **`desplazarFecha(fechaISO, deltaMs)`**: desplaza una fecha±hora por un delta en milisegundos, preservando si el resultado queda con o sin hora — usado por la cascada de reprogramación.
- **`diasEntreFechas(fechaISO1, fechaISO2)`**: diferencia en días enteros entre dos fechas.
- **`arbolCategorias(categorias, padreId, profundidad)`**: aplana el árbol de categorías (vía `categoria_padre_id`) en orden DFS, cada entrada con su nivel de profundidad — para selects/listas indentadas.
- **`caminoCategoria(categoria, todasLasCategorias)`**: arma el "camino" de nombres de una categoría hasta su raíz (ej. "Facultad / IR"), recorriendo `categoria_padre_id`.
- **`categoriaRaiz(categoria, todasLasCategorias)`**: sube por `categoria_padre_id` hasta la categoría sin padre. Usado por `compararPorPrioridad` para comparar tareas por la prioridad de su categoría raíz, no de la categoría directa.
- **`escaparHtml(texto)`**: sanitiza texto libre antes de insertarlo en `innerHTML`.

## `assets/js/tareas-logica.js`

Lógica de negocio central sobre tareas: mantenimiento cíclico, bloqueo por dependencia, prioridad (ver `REGLAS_DE_PRIORIDAD.md` para el detalle de orden, no repetido acá).

- **`calcularProximaFechaMantenimiento(desdeISODatetime, intervalo)`**: dado un `tarea_mantenimiento_intervalo` (`{ cantidad, unidad }`) y una fecha de referencia, calcula la próxima `tarea_fecha_limite`.
- **`completarTarea(tarea, listaTareas, opciones)`**: marca la tarea como `completada` y fija `tarea_fecha_fin`. Si tiene `tarea_mantenimiento`, clona una nueva instancia `pendiente` (vía `crearTarea`) con la próxima fecha límite calculada desde la fecha real de finalización, copiando categoría, nombre, duración, descripción (con la mejora sugerida anexada si se cargó una), intervalo de mantenimiento y costo estimado. Devuelve la tarea clonada o `null`. **No** desbloquea dependientes — eso lo hace `desbloquearDependientes`, que hay que llamar aparte.
- **`recalcularBloqueo(tarea, listaTareas)`**: fija `tarea_estado` según `tarea_dependiente` — `bloqueada` si apunta a una tarea no completada, `pendiente` si no. No toca tareas ya `completada`. Se llama al crear una tarea con dependencia, al editar/quitar la dependencia, y en cascada al completar una tarea (ver siguiente función).
- **`desbloquearDependientes(tareaCompletada, listaTareas)`**: al completar una tarea, encuentra las que dependían de ella (`tarea_dependiente === tareaCompletada.tarea_id`), les copia `tarea_fecha_inicio_habilitada = tareaCompletada.tarea_fecha_fin` y llama `recalcularBloqueo` sobre cada una.
- **`reprogramarTareaConCascada(tarea, nuevaFechaSugeridaISO, listaTareas)`**: actualiza `tarea_fecha_sugerida` y, si había un valor previo, desplaza en cascada (mismo delta de tiempo, vía `desplazarFecha`) a las tareas que dependen de ella (`tarea_dependiente === tarea.tarea_id`), ajustando también su `tarea_fecha_limite`.
- **`calcularHolguraDias(tarea)`**: días de margen antes de que venza `tarea_fecha_limite`, contados desde hoy (o desde `tarea_fecha_inicio_habilitada` si es futura). Ver `REGLAS_DE_PRIORIDAD.md` para la fórmula completa y las bandas.
- **`compararPorPrioridad(a, b, categorias)`**: ver `REGLAS_DE_PRIORIDAD.md`.
- **`mejorTareaPorCategoria(tareas, categorias)`**: ver `REGLAS_DE_PRIORIDAD.md`.
- **`puedeAgregarDependencia(tareaId, candidatoId, listaTareas)`**: valida que asignar `candidatoId` como `tarea_dependiente` de `tareaId` no cierre un ciclo, recorriendo la cadena de `tarea_dependiente` hacia atrás desde `candidatoId`.
- **`esTareaAccionable(tarea)`**: `true` si `tarea_estado === 'pendiente'` y ya se alcanzó `tarea_fecha_inicio_habilitada`.
- **`calcularEnfoque8020(tareas, categorias)`**: ver `REGLAS_DE_PRIORIDAD.md`.

## `assets/js/reprogramar.js`

UI del panel de reprogramar (usado desde Hoy, Tareas, 3/8 días y "Revisar mi día").

- **`crearPanelReprogramar({ onConfirmar, onCancelar, diasHabiles })`**: arma un panel con atajos de día (hoy/mañana/+7/+15/+30, y "primer [día de la semana] del próximo mes") y de horario **opcional** (mañana/tarde/tardecita/noche, o vacío). Si la tarea tiene `tarea_dias_habiles`, cualquier fecha elegida se ajusta automáticamente al próximo día hábil. Al confirmar, llama `onConfirmar(valor)` — solo la fecha (`YYYY-MM-DD`) si no se eligió horario, o un datetime ISO completo si sí.

## `assets/js/revision-dia.js`

Asistente "Revisar mi día": repasa una por una las tareas activas del día en un `<dialog>`.

- **`iniciarRevisionDia(tareas)`**: arma la cola de tareas no completadas y muestra el diálogo, paso a paso.
- **`renderPaso()`**: por cada tarea, ofrece "Cumplida" (si tiene `tarea_mantenimiento`, pide una nota de mejora opcional, y llama `completarTarea` + `desbloquearDependientes`), "No cumplida" (abre directamente el panel de reprogramar) o "Saltar".
- **`renderPasoFinal(dlg)` / `renderSeccionCalendario(contenedor)`**: al terminar la cola, si hay conexión con Google Calendar muestra los eventos reales del día; si no, ofrece un alta rápida de "tareas de continuidad" (`wirePreguntaContinuidad`).

## `assets/js/exportar-calendar.js`

Exportación puntual de una tarea completada a Google Calendar (sin OAuth).

- **`construirUrlExportarGoogleCalendar(tarea)`**: arma una URL de `calendar.google.com/render` con el evento precargado (inicio = `tarea_fecha_fin` menos `tarea_duracion_min`, detalle con categoría/descripción).
- **`ofrecerExportarACalendar(tarea)`**: pregunta con un `confirm()` si se quiere abrir esa URL en una pestaña nueva.

## `assets/js/clima.js`

Consulta de pronóstico real (Open-Meteo, sin API key) para tareas con `tarea_requiere_clima_bueno`.

- **`fechaDeReferencia(tarea)`** (privada): resuelve fecha y hora aproximada a partir de `tarea_fecha_sugerida` (con su hora si la tiene) o, si no hay, `tarea_fecha_limite` (a las 12:00 si no tiene hora propia).
- **`obtenerPronosticoUbicacion(latitud, longitud)`**: fetch a Open-Meteo, con caché en memoria por coordenadas.
- **`evaluarClimaTarea(tarea)`**: si no aplica (no requiere clima, sin ubicación con coordenadas, sin fecha resoluble, fuera de la ventana de 16 días, o falló la consulta), devuelve `null`. Si hay datos, devuelve `{ favorable, probabilidadLluvia }`.

## `assets/js/disfrute.js`

- **`sugerirTareaDeAltoDisfrute(tareaCompletada)`**: si la categoría de la tarea recién completada tiene `categoria_disfrute` bajo (≤2), busca entre las tareas accionables una de una categoría con `categoria_disfrute` alto (≥4) y sugiere continuar con ella — principio de Premack a nivel categoría.

## `assets/js/vista-agenda.js`

Motor compartido de las vistas "3 días" y "8 días" (ambas son wrappers triviales).

- **`fechaDeReferencia(tarea)`** (exportada): resuelve la fecha (solo el día) por la que se agrupa una tarea — `tarea_fecha_sugerida` si tiene valor, si no `tarea_fecha_limite`. También la usa `views/tabla.view.js`.
- **`renderVistaAgenda(contenedor, cantidadDias)`**: agrupa las tareas pendientes (filtradas por la "ubicación actual") por día, para los próximos `cantidadDias` empezando hoy.
- **`renderTarjetaTarea(tarea)`**: arma la tarjeta de una tarea (badges, aviso de bloqueo con la tarea de la que depende, aviso de clima) con un botón "Posponer" que reprograma vía `reprogramarTareaConCascada`.

## `assets/js/ia-conectable.js`

Capa de IA "conectable": arma prompts en texto plano para copiar/pegar en un LLM externo y parsea la respuesta pegada de vuelta. No llama a ninguna API de IA directamente — flujo 100% manual, offline-first.

- **`construirPromptSubtareas(meta)` / `parsearRespuestaSubtareas(texto)`**: pide una lista de tareas concretas para avanzar una Meta; contrato JSON con `tarea_nombre`/`tarea_duracion_min`/`dias_desde_hoy`/`tarea_descripcion`.
- **`construirPromptPrioridades(tareas, categorias)` / `parsearRespuestaPrioridades(texto, tareasDisponibles)`**: pide una `tarea_importancia` (`urgente`/`importante`) sugerida por tarea accionable actual; devuelve solo los cambios reales.
- **`construirPromptChatMeta(historial)` / `parsearRespuestaChatMeta(texto)`**: diálogo de ida y vuelta para definir una Meta desde una idea vaga.
- **`construirPromptFinalizarMeta(historial)` / `parsearRespuestaFinalizarMeta(texto)`**: cierra la conversación pidiendo un JSON con `meta_nombre`/`meta_plazo`/`meta_fecha_estimada`/`meta_descripcion`.

## `assets/js/google-calendar.js`

Lectura de eventos reales de Google Calendar (requiere OAuth, a diferencia de la exportación puntual).

- **`soportaGoogleCalendar()` / `hayConexionGoogleCalendar()` / `conectarGoogleCalendar()`**: Google Identity Services (token client, scope de solo lectura), token en memoria (no persiste, expira en ~1h).
- **`obtenerEventosDeHoy()`**: trae los eventos del día actual, con caché en memoria por día.
- **`calcularSolapamiento(tarea, eventos)`**: compara la ventana `[tarea_fecha_sugerida (con hora), +tarea_duracion_min]` contra cada evento y devuelve el primero que se superpone (usado en Hoy).

## `assets/js/google-drive-sync.js`

Sincronización vía Google Drive API (OAuth, scope `drive.file`).

- **`soportaGoogleDrive()` / `hayConexionDrive()` / `conectarDriveOAuth()`**: mismo patrón de token client que `google-calendar.js`.
- **`buscarArchivoRemoto()`**: busca (o reusa de la sesión) el archivo `super-todo-list-datos.json` en Drive.
- **`leerArchivoRemoto(id)` / `guardarArchivoRemoto(datos)`**: descarga o crea/actualiza el archivo remoto con el `estado` completo.

## `assets/js/ubicacion-actual.js`

- **`obtenerUbicacionActual()` / `establecerUbicacionActual(idUbicacion)`**: preferencia de "¿dónde estás?" compartida entre Hoy, Tareas y 3/8 días, en una clave propia de `localStorage` (preferencia de sesión, no dato de la app).

---

## `views/hoy.view.js`

Vista "Hoy": separa tareas urgentes del resto (ver `REGLAS_DE_PRIORIDAD.md`), con un asistente de cierre por tarjeta.

- **`renderVistaHoy(contenedor)`**: arma las secciones Urgentes / Resto (con el apartado "Elegí por categoría" vía `mejorTareaPorCategoria`) / Todavía no pueden empezar / Bloqueadas, filtradas por la ubicación actual. `bloqueadas` y `accionables` se separan directamente por `tarea_estado`.
- **`renderItem(tarea, opciones)`**: tarjeta de una tarea con sus badges (importancia, foco 80/20, categoría, fechas, holgura, estado, ubicación, costo, clima, solapamiento con Calendar). Si es accionable, agrega los botones "Cumplida"/"No cumplida" (sin pedir duración/costo real — se eliminaron de la app).

## `views/tres-dias.view.js` / `views/ocho-dias.view.js`

Wrappers triviales: delegan en `renderVistaAgenda(contenedor, 3)` / `renderVistaAgenda(contenedor, 8)`. Sin lógica propia.

## `views/semana.view.js`

Vista "Semana": grilla horaria de 7 días (07:00-23:00) con tareas fijas y proyectadas.

- **`renderVistaSemana(contenedor)`**: arma la grilla.
- **`renderColumnaDia(fechaDia, hoy)`**: separa tareas "fijas" (`tarea_fecha_sugerida` con hora ese día) de "proyectadas" (accionables sin hora en `tarea_fecha_sugerida`, cuya fecha de referencia cae ese día, apiladas por prioridad).
- **`renderBloqueTarea(...)` / `agregarAsasArrastre(...)`**: cada bloque tiene asas arrastrables (Pointer Events) para modificar `tarea_fecha_sugerida` (agregándole/cambiándole la hora)/`tarea_duracion_min` directamente desde la grilla, en pasos de 15 minutos.

## `views/tareas.view.js`

La vista más grande: ABM completo de tareas, filtros, y los paneles de dependencia/meta/edición/IA.

- **`renderVistaTareas(contenedor)`**: arma el formulario de alta (rápida y detallada, con categoría en árbol indentado, fecha±hora opcional para los 3 campos de fecha) y la lista filtrada/ordenada.
- **`tareasUnicasPorNombre()`**: para el `<datalist>` de autocompletado y para precargar el resto del formulario cuando el nombre coincide con una tarea ya creada.
- **`renderTarea(tarea, enfoqueIds)`**: tarjeta con los badges y acciones (cambiar estado — solo `pendiente`/`completada`, `bloqueada` se muestra como badge de solo lectura —, posponer, dependencia, meta, editar, eliminar).
- **`crearPanelEditar(tarea)`**: formulario de edición completo.
- **`crearPanelDependencia(tarea)` / `crearPanelMeta(tarea)`**: paneles con un `<select>` único (ya no checklist, porque `tarea_dependiente`/`meta_id` son referencias singulares) para editar la dependencia (validando ciclos vía `puedeAgregarDependencia` y recalculando bloqueo) y la meta.
- **`crearPanelIAPrioridades()`**: UI del flujo de copiar/pegar con IA para reestructurar `tarea_importancia` de las tareas accionables.

## `views/tabla.view.js`

- **`renderVistaTabla(contenedor)`**: todas las tareas no completadas en formato tabla, ordenadas por `fechaDeReferencia`. Clic en una fila abre esa tarea en edición en Tareas.
- **`formatearDias(dias)`**: texto relativo ("Hoy"/"En 3 días"/"Vencida hace 2 días").

## `views/categorias.view.js`

ABM de categorías, ahora un árbol (Subcategoria ya no existe como entidad separada).

- **`renderVistaCategorias(contenedor)`**: alta de categoría (nombre/descripción/color/padre/disfrute) y lista renderizada como árbol recursivo (`arbolCategorias`).
- **`renderCategoria(categoria, profundidad)`**: tarjeta indentada según su profundidad, con botones ▲/▼ para reordenar entre **hermanos** (mismo `categoria_padre_id`, `intercambiarPrioridad` intercambia `categoria_prioridad`), y eliminar (las categorías hijas quedan promovidas — `categoria_padre_id: null` —, y las tareas asociadas quedan sin categoría).

## `views/ubicaciones.view.js`

- **`renderVistaUbicaciones(contenedor)` / `renderUbicacion(ubicacion)`**: ABM simple (nombre + latitud + longitud). Al eliminar, las tareas que la referenciaban quedan con `ubicacion_id: null`.

## `views/metas.view.js`

ABM de metas, con progreso calculado al vuelo y los flujos de IA conectable.

- **`renderVistaMetas(contenedor)` / `renderMeta(meta)`**: alta de meta y tarjeta con progreso (tareas con `meta_id` igual a esta meta, completadas vs. total).
- **`crearPanelIA(meta)`**: flujo de copiar/pegar para sugerir subtareas, con preview antes de confirmarlas.
- **`crearPanelChatMeta(contenedorPanel)`**: flujo conversacional para definir una meta desde cero.

## `views/gantt.view.js`

Diagrama de Gantt por Meta.

- **`renderVistaGantt(contenedor)`**: filtro por meta (o todas, vía `tareasDeMeta` que compara `t.meta_id === metaId`), arma las filas y llama `renderGrillaGantt` + `renderFlechasDependencia`.
- **`renderGrillaGantt(filas)`**: calcula el rango de fechas visible y dibuja una fila por tarea, con asas de arrastre (`agregarAsasGantt`) para modificar `tarea_fecha_inicio_habilitada`/`tarea_fecha_limite`.
- **`renderFlechasDependencia(grilla, filas)`**: dibuja una flecha SVG por cada tarea con `tarea_dependiente` visible en el filtro actual (relación uno-a-uno, ya no hay múltiples bloqueantes por tarea).

## `views/personas.view.js`

- **`renderVistaPersonas(contenedor)`**: ABM de personas, ordenadas de mayor a menor tiempo sin contacto.
- **`renderPersona(persona)`**: tarjeta con botón "Marcar contacto hoy".

## `views/informes.view.js`

Métricas calculadas al vuelo sobre `estado.tareas`, sin histórico propio guardado.

- **`calcularPorCategoria(desde)`**: completadas en la ventana vs. pendientes actuales (`ESTADOS_ACTIVOS = ['bloqueada', 'pendiente']`), por categoría.
- **`calcularProyeccionCostos()`**: suma de `tarea_costo_estimado` de las tareas pendientes activas.
- **`calcularThroughputSemanal()`**: cantidad de tareas completadas por semana, últimas 8 semanas, sobre `tarea_fecha_fin`.
- **`renderVistaInformes(contenedor)`**: arma las secciones Completadas vs. pendientes / Enfoque 80/20 / Costos (proyección de pendientes) / Throughput semanal. Ya no incluye comparación de duración/costo real vs. estimado (esos campos se eliminaron del modelo).

## `sw.js`

Service worker de la PWA — estrategia network-first.

- **`install`**: precachea el app shell completo (`ARCHIVOS_PRECACHE`) con `{ cache: 'reload' }` para evitar que el CDN sirva una copia vieja.
- **`activate`**: borra cualquier caché con un nombre distinto al `CACHE_NAME` actual (se bumpea en cada entrega que cambie archivos del shell).
- **`fetch`**: red primero, cae a caché si falla (sin conexión).
