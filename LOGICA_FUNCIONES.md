# Lógica de funciones

Documentación viva de qué hace cada función/módulo del proyecto, en lenguaje natural. Se actualiza junto con cada cambio funcional (mismo compromiso que ya existe para [DICCIONARIO_DE_DATOS.md](DICCIONARIO_DE_DATOS.md)) — al agregar o modificar una función con lógica no trivial, sumarla/actualizarla acá. Los nombres de campo mencionados son los de [DICCIONARIO_DE_DATOS.md](DICCIONARIO_DE_DATOS.md); las reglas de orden/prioridad están en [REGLAS_DE_PRIORIDAD.md](REGLAS_DE_PRIORIDAD.md) y no se repiten acá. No se documentan `assets/css/main.css`, `index.html` ni `manifest.json` (sin lógica de funciones, solo estructura/estilos).

## Arquitectura general

`assets/js/almacenamiento.js` mantiene un único objeto `estado` en memoria (`categorias`, `ubicaciones`, `metas`, `personas`, `tareas`). Las vistas (`views/*.view.js`) leen `estado` directamente y llaman `persistirYNotificar()` tras cualquier cambio, que sella los cambios, los guarda en un buffer local durable (IndexedDB), los sube a Google Drive (único destino de los datos) y vuelve a renderizar la vista activa. Las vistas no saben nada de Drive ni de la mezcla entre dispositivos. `assets/js/app.js` es el punto de entrada: arma la navegación, decide qué vista renderizar según el hash de la URL, e inicializa el resto de los módulos. Categoria es una entidad auto-referenciada (`categoria_padre_id`) — no existe una entidad Subcategoria separada.

---

## `assets/js/app.js`

Bootstrap y router de toda la app.

- **`vistaActual()`**: lee `location.hash` y devuelve la clave de vista correspondiente (o `'hoy'` si el hash no coincide con ninguna registrada en `VISTAS`).
- **`renderNav()` / `render()`**: `render()` es la función que se re-ejecuta en cada cambio de hash o de datos (registrada en `hashchange` y pasada a `suscribir()` de `almacenamiento.js`); redibuja la navegación, la cabecera de sincronización y llama al `render` de la vista activa. Si todavía no hay datos listos (`obtenerEstadoSync().datosListos` es falso) muestra la pantalla inicial en lugar de la vista; si esta pestaña es de solo lectura (otra pestaña tiene el bloqueo de edición) muestra un aviso arriba.
- **Cabecera de sincronización** (`actualizarCabeceraSync()`, suscripta con `suscribirSync()`): `#indicador-sync` muestra el estado (`sin-destino`, `conectando`, `verificando`, `guardando`, `pendiente`, `sincronizado`, `sin-conexion`, `sesion-vencida`, `error`) con la hora del último guardado y de la última verificación; `#boton-sync` ("Sincronizar ahora"); `#banner-sync` con los avisos de estado (sin conexión con la fecha de la copia de solo lectura, sesión vencida, "Conectado y sincronizado", hay cambios de otro dispositivo → "Actualizar", datos viejos de `localStorage` para mezclar/descartar, reloj desfasado); `#panel-avisos` con la lista de avisos de conflicto/borrado que se cierran a mano (`renderPanelAvisos`). Los clics se resuelven por delegación con `data-accion-sync`. Una actualización de estado solo redibuja la cabecera; las vistas solo se redibujan si cambia la clave de render (`datosListos | soloLectura | conectando`).
- **`renderPantallaInicial()`**: pantalla previa a tener datos (sin sesión de Google, o conectando): explica que los datos se guardan en el Drive del usuario y ofrece "Conectar con Google Drive". No se puede cargar tareas hasta conectar.
- **Atajo de teclado "N"**: un listener global de `keydown` que, si no hay modificadores (`Ctrl`/`Alt`/`Meta`) y el foco no está en un campo editable (`INPUT`/`TEXTAREA`/`SELECT`/`contentEditable`), navega a la vista Tareas (si no se está ya ahí) y enfoca el input de alta rápida (`#form-alta-rapida input[name="tarea_nombre"]`). Usa un flag módulo (`enfocarAltaRapidaAlEntrar`) para enfocar recién después de que el cambio de hash haya disparado el re-render de la vista.
- **Tema claro/oscuro**: `temaEfectivo()`/`aplicarTema()` leen/aplican la preferencia guardada en `localStorage` (una preferencia, nunca datos de tareas), con fallback a `prefers-color-scheme` del sistema.
- **Reprogramado automático al iniciar** (`reprogramarSiCorresponde()`): una sola vez, cuando los datos ya están listos (después de `inicializarAlmacenamiento()` o de conectar), se llama `reprogramarFechasSugeridasVencidas(estado.tareas)` (`tareas-logica.js`) y, si afectó alguna tarea, se persiste y se avisa con un `alert()`. Ver `REGLAS_DE_PRIORIDAD.md`.
- Wiring de los botones de la cabecera (sincronizar ahora, exportar/importar JSON, tema) hacia `almacenamiento.js`.
- Al final, llama `inicializarAlmacenamiento()` y registra el service worker (`sw.js`).

## `assets/js/almacenamiento.js`

Estado en memoria, sincronización con Google Drive y migración de datos.

- **`estado`**: objeto exportado con las 5 colecciones de la app (`categorias`, `ubicaciones`, `metas`, `personas`, `tareas`). Es la única fuente de verdad en memoria; todas las vistas lo mutan directamente y después llaman `persistirYNotificar()`.
- **`suscribir(fn)` / `notificar()`**: observer simple para re-renderizar cuando cambian los datos. **`suscribirSync(fn)` / `obtenerEstadoSync()`**: observer aparte para el estado de sincronización (`estado`, `datosListos`, `soloLectura`, hora del último guardado/verificación, avisos, cambios remotos pendientes de aplicar, etc.), que solo redibuja la cabecera.
- **Migración retrocompatible**, en dos pasos (sin cambios): **`fusionarSubcategoriasEnCategorias`** y **`migrarCategoria`/`migrarUbicacion`/`migrarMeta`/`migrarPersona`/`migrarTarea`**, encadenados por `normalizarDatosCrudos`, que al final recalcula el bloqueo de cada tarea con `recalcularBloqueo`. Los archivos de Drive de versiones anteriores (sin sellos `*_modificado_en`) pasan por acá al leerse.
- **Guardar (`persistirYNotificar()`)**: es el único punto de guardado que usan las vistas. (1) `sellarCambios` compara contra la última foto y pone `*_modificado_en` a lo que cambió y registra las bajas en `eliminados`; (2) guarda el estado de trabajo en el buffer `pendiente` de IndexedDB (durable, sobrevive a recargar); (3) sube la versión local (`versionLocal++`) y el estado pasa a `pendiente`; (4) `programarSubida()` agenda la subida a Drive con un debounce de 2 s (antes de notificar, para que un error al redibujar una vista no impida la subida); (5) notifica a las vistas. **La UI solo pasa a `sincronizado` cuando Drive confirmó**; recién entonces se actualiza la copia `cache` y se borra `pendiente`.
- **`sincronizarAhora({ forzar })` / `sincronizarUnaVez()`**: pide a Drive los datos del archivo (`buscarArchivoRemoto`), lo crea si no existe, lo descarga y mezcla con `mezclar(local, remoto, base=cache)` si cambió, aplica el resultado y lo sube. Si el usuario editó durante la sincronización (cambió `versionLocal`), reintenta hasta 3 veces. Con cambios remotos y algo tipeándose en un campo (`hayTextoEnEdicion`), los difiere: la cabecera ofrece "Actualizar" y se aplican al salir del campo. Al aplicarlos notifica con `conservarBorradores`, para que los formularios a medio completar no se vacíen (ver `borradores.js`).
- **Verificación automática** (`verificar()`): al volver a la pestaña (`visibilitychange`), al recuperar red (`online`) y cada 5 minutos; solo actualiza la hora de "verificado" si no hay nada nuevo. Detecta además el reloj desfasado (>2 min) comparando la hora local con el `modifiedTime` devuelto en una subida.
- **Errores** (`manejarErrorSync`): sin red → `sin-conexion`; token vencido/401 → `sesion-vencida` (botón "Reconectar Drive"). En ambos los cambios siguen en `pendiente` y se suben al volver la conexión.
- **Conexión**: `conectarDrive()` (botón/pantalla inicial) pide el token unificado y sincroniza; `reconexionSilenciosa()` intenta reconectar sin popup al abrir la app, y `reconectarEnPrimerGesto()` reintenta en el primer clic/tecla del usuario si el navegador bloqueó el intento inicial (se vuelve a armar cada vez que se pierde la sesión, y mientras está armado `obtenerEstadoSync().reconectaConClic` es verdadero para que la cabecera avise "hacé clic en cualquier parte").
- **Avisos**: `agregarAvisos`, `descartarAviso(id)`, `descartarTodosLosAvisos()` — se guardan en IndexedDB y no se pierden al recargar. Los generan la mezcla (conflictos, ediciones vs. borrados) y la detección de archivos duplicados en Drive (se usa el más antiguo).
- **Bloqueo de edición** (`adquirirBloqueoEdicion`): Web Locks `stdl-editor`; la segunda pestaña abierta queda en solo lectura.
- **Datos viejos** (`leerDatosViejos`, `mezclarDatosViejos()`, `descartarDatosViejos()`): si en `localStorage` quedan datos de una versión anterior (`super-todo-list:datos`), se ofrece mezclarlos con Drive o descartarlos; si Drive no tiene archivo, se importan solos. Nunca se ignoran en silencio.
- **`exportarJSON()`**: descarga el `estado` completo como `.json`. **`importarJSON(archivo)`**: pide confirmación explícita (reemplaza todo lo que hay en Drive) y pasa por `normalizarDatosCrudos`.
- **`inicializarAlmacenamiento()`**: lee `pendiente`/`cache`/avisos de IndexedDB, muestra al instante lo último que hubo (pendiente si existe, si no la copia en cache; solo lectura si no hay conexión), adquiere el bloqueo de edición, intenta la sesión de Google y, si la hay, sincroniza. Registra los eventos de verificación y el aviso `beforeunload` si hay cambios sin confirmar.

## `assets/js/borradores.js`

Conserva lo que el usuario ya escribió en los formularios cuando la vista se redibuja por cambios que llegaron de otro dispositivo.

- **`capturarBorradores(contenedor)`**: recorre los `input`/`textarea`/`select` del contenedor y guarda el valor de los que el usuario tocó (distintos de su valor inicial), identificándolos por formulario + nombre + tipo + posición, y cuál tenía el foco (con su selección).
- **`restaurarBorradores(contenedor, captura)`**: después de redibujar, vuelve a poner esos valores en los campos equivalentes (disparando `input`/`change` para que la interfaz dependiente se actualice) y devuelve el foco.
- Lo usa `render()` de `app.js` cuando `almacenamiento.js` notifica con `conservarBorradores: true` (solo al aplicar cambios remotos).

## `assets/js/sincronizacion.js`

Lógica **pura** (sin DOM ni red) de sellado y mezcla entre dispositivos. Toda la política de conflictos vive acá.

- **`COLECCIONES`**: configuración de las 5 colecciones (clave de id, campo de sello `*_modificado_en`, campo de nombre para los avisos, etiqueta).
- **`sellarCambios(estado, ultimo, base, eliminados, ahora)`**: compara cada entidad contra la última foto guardada; nueva o distinta → `*_modificado_en = ahora`; ausente ahora y presente antes → tombstone en `eliminados`. Usa `estable()` para comparar sin que importe el orden de las claves.
- **`mezclar(local, remoto, base, ahora)`**: por id y entidad completa. Si solo un lado cambió respecto de `base`, gana ese; si cambiaron ambos, gana el sello más nuevo (empate → remoto) y se genera un aviso con los campos y valores descartados; borrado vs. edición: se conserva lo más reciente y se avisa. Devuelve `{ estado, eliminados, avisos }`.
- **`datosParaArchivo(estado, eliminados, ahora)`**: arma el JSON de Drive (formato 2: colecciones, `eliminados`, `guardado_en`). **`fotoColecciones`**, **`copiarProfundo`**, **`difierenDatos`**, **`purgarEliminados`** (borra tombstones de más de 90 días).

## `assets/js/almacenamiento-local.js`

IndexedDB (`super-todo-list`, versión 2) para lo que no puede depender de la red. Todas las operaciones fallan en silencio devolviendo `null` (con `hayAlmacenamientoLocal()` para saber si hay soporte).

- **`leerCache()` / `guardarCache()`**: última copia **confirmada por Drive** (datos + `modifiedTime`). Es la base de la mezcla y la copia de solo lectura sin conexión.
- **`leerPendiente()` / `guardarPendiente()` / `borrarPendiente()`**: estado de trabajo con cambios aún no confirmados por Drive. **Se borra únicamente después de que Drive confirma.**
- **`leerAvisos()` / `guardarAvisos()`**: avisos de conflicto sin descartar.

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
- **`textoHolgura(dias)`**: texto legible de una holgura ya calculada (ver `calcularHolguraDias` en `tareas-logica.js`) — "Vencida hace N días" / "Vence hoy" / "Quedan N días". Compartido entre `views/hoy.view.js` y `views/todas.view.js`.
- **`escaparHtml(texto)`**: sanitiza texto libre antes de insertarlo en `innerHTML`.

## `assets/js/tareas-logica.js`

Lógica de negocio central sobre tareas: mantenimiento cíclico, bloqueo por dependencia, prioridad (ver `REGLAS_DE_PRIORIDAD.md` para el detalle de orden, no repetido acá).

- **`calcularProximaFechaMantenimiento(desdeISODatetime, intervalo)`**: dado un `tarea_mantenimiento_intervalo` (`{ cantidad, unidad }`) y una fecha de referencia, calcula la próxima `tarea_fecha_limite`.
- **`completarTarea(tarea, listaTareas, opciones)`**: marca la tarea como `completada` y fija `tarea_fecha_fin`. Si tiene `tarea_mantenimiento`, clona una nueva instancia `pendiente` (vía `crearTarea`) con la próxima fecha límite calculada desde la fecha real de finalización, copiando categoría, nombre, duración, descripción (con la mejora sugerida anexada si se cargó una), intervalo de mantenimiento y costo estimado. Devuelve la tarea clonada o `null`. **No** desbloquea dependientes — eso lo hace `desbloquearDependientes`, que hay que llamar aparte.
- **`recalcularBloqueo(tarea, listaTareas)`**: fija `tarea_estado` según `tarea_dependiente` — `bloqueada` si apunta a una tarea no completada, `pendiente` si no. No toca tareas ya `completada`. Se llama al crear una tarea con dependencia, al editar/quitar la dependencia, y en cascada al completar una tarea (ver siguiente función).
- **`desbloquearDependientes(tareaCompletada, listaTareas)`**: al completar una tarea, encuentra las que dependían de ella (`tarea_dependiente === tareaCompletada.tarea_id`), les copia `tarea_fecha_inicio_habilitada = tareaCompletada.tarea_fecha_fin` y llama `recalcularBloqueo` sobre cada una.
- **`reprogramarTareaConCascada(tarea, nuevaFechaSugeridaISO, listaTareas)`**: actualiza `tarea_fecha_sugerida` y, si había un valor previo, desplaza en cascada (mismo delta de tiempo, vía `desplazarFecha`) a las tareas que dependen de ella (`tarea_dependiente === tarea.tarea_id`), ajustando también su `tarea_fecha_limite`.
- **`calcularHolguraDias(tarea)`**: días de margen antes de que venza `tarea_fecha_limite`, contados desde hoy (o desde `tarea_fecha_inicio_habilitada` si es futura). Ver `REGLAS_DE_PRIORIDAD.md` para la fórmula completa y las bandas.
- **`compararPorPrioridad(a, b, categorias)`**: ver `REGLAS_DE_PRIORIDAD.md`. Internamente delega los niveles 1-4 en `compararEstructural` (no exportada), reusada también por `tareasEmpatadas`.
- **`tareasEmpatadas(a, b, categorias)`**: `true` si 2 tareas empatan en `compararEstructural` y ninguna tiene ya `tarea_prioridad_manual` asignado — usada por el panel "Versus" (`views/todas.view.js`) para armar los clusters a comparar.
- **`mejorTareaPorCategoria(tareas, categorias)`**: ver `REGLAS_DE_PRIORIDAD.md`.
- **`reprogramarFechasSugeridasVencidas(listaTareas)`**: reprograma automáticamente la `tarea_fecha_sugerida` vencida de toda tarea activa a la próxima fecha disponible (`calcularProximaFechaSugerida`, interna, reusa `siguienteDiaHabil` de `reprogramar.js`), en cascada vía `reprogramarTareaConCascada`. Se llama una vez al iniciar la app (`app.js`). Devuelve las tareas afectadas, para avisar al usuario. Ver `REGLAS_DE_PRIORIDAD.md`.
- **`puedeAgregarDependencia(tareaId, candidatoId, listaTareas)`**: valida que asignar `candidatoId` como `tarea_dependiente` de `tareaId` no cierre un ciclo, recorriendo la cadena de `tarea_dependiente` hacia atrás desde `candidatoId`.
- **`esTareaAccionable(tarea)`**: `true` si `tarea_estado === 'pendiente'` y ya se alcanzó `tarea_fecha_inicio_habilitada`.
- **`calcularEnfoque8020(tareas, categorias)`**: ver `REGLAS_DE_PRIORIDAD.md`.

## `assets/js/reprogramar.js`

UI del panel de reprogramar (usado desde Hoy, Tareas, 3/8 días y "Revisar mi día").

- **`crearPanelReprogramar({ onConfirmar, onCancelar, diasHabiles })`**: arma un panel con atajos de día (hoy/mañana/+7/+15/+30, y "primer [día de la semana] del próximo mes") y de horario **opcional** (mañana/tarde/tardecita/noche, o vacío). Si la tarea tiene `tarea_dias_habiles`, cualquier fecha elegida se ajusta automáticamente al próximo día hábil. Al confirmar, llama `onConfirmar(valor)` — solo la fecha (`YYYY-MM-DD`) si no se eligió horario, o un datetime ISO completo si sí. También usado por Hoy para revalorizar `tarea_fecha_limite` de una tarea vencida.
- **`siguienteDiaHabil(fechaISODate, diasHabiles)`** (exportada): próximo día que cumple `tarea_dias_habiles` desde una fecha dada (o la misma fecha si no hay restricción). Reusada por `reprogramarFechasSugeridasVencidas` en `tareas-logica.js`.

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

## `assets/js/vista-agenda.js`

Motor compartido de las vistas "3 días" y "8 días" (ambas son wrappers triviales).

- **`fechaDeReferencia(tarea)`** (exportada): resuelve la fecha (solo el día) por la que se agrupa una tarea — `tarea_fecha_sugerida` si tiene valor, si no `tarea_fecha_limite`. También la usa `views/todas.view.js`.
- **`renderVistaAgenda(contenedor, cantidadDias)`**: agrupa las tareas pendientes (filtradas por la "ubicación actual") por día, para los próximos `cantidadDias` empezando hoy.
- **`renderTarjetaTarea(tarea)`**: arma la tarjeta de una tarea (badges, aviso de bloqueo con la tarea de la que depende, aviso de clima) con un botón "Posponer" que reprograma vía `reprogramarTareaConCascada`.

## `assets/js/ia-conectable.js`

Capa de IA "conectable": arma prompts en texto plano para copiar/pegar en un LLM externo y parsea la respuesta pegada de vuelta. No llama a ninguna API de IA directamente — flujo 100% manual, offline-first.

- **`construirPromptSubtareas(meta)` / `parsearRespuestaSubtareas(texto)`**: pide una lista de tareas concretas para avanzar una Meta; contrato JSON con `tarea_nombre`/`tarea_duracion_min`/`dias_desde_hoy`/`tarea_descripcion`.
- **`construirPromptPrioridades(tareas, categorias)` / `parsearRespuestaPrioridades(texto, tareasDisponibles)`**: pide una `tarea_importancia` (`urgente`/`importante`) sugerida por tarea accionable actual; devuelve solo los cambios reales.
- **`construirPromptChatMeta(historial)` / `parsearRespuestaChatMeta(texto)`**: diálogo de ida y vuelta para definir una Meta desde una idea vaga.
- **`construirPromptFinalizarMeta(historial)` / `parsearRespuestaFinalizarMeta(texto)`**: cierra la conversación pidiendo un JSON con `meta_nombre`/`meta_plazo`/`meta_fecha_estimada`/`meta_descripcion`.

## `assets/js/google-auth.js`

Permiso único de Google para Drive y Calendar (un solo popup por sesión).

- **`conectar({ silencioso })`**: pide un token de acceso con los scopes `drive.file` + `calendar.readonly` juntos vía Google Identity Services. El token vive solo en memoria (~1 h). Con `silencioso: true` usa `prompt: 'none'` (sin popup visible; puede fallar si Google necesita interacción). El `TokenClient` es singleton, así que los callbacks reales delegan a handlers reasignables por cada llamada (una nueva conexión cancela la anterior en curso).
- **`hayToken()` / `obtenerTokenAcceso()` / `tieneScope('drive' | 'calendar')`**: `tieneScope` usa `hasGrantedAllScopes` porque el usuario puede desmarcar permisos en el consentimiento granular; con Drive denegado no se puede trabajar, con Calendar denegado se ocultan solo las funciones de Calendar.
- **`esperarGoogle()`**: espera a que cargue el script async de Google (solo la primera vez) y, si no llegó —por ejemplo porque la página se abrió sin internet—, lo vuelve a cargar por su cuenta (`cargarScriptGoogle`); `conectar()` también lo recarga si falta. **`soportaGoogle()`**, **`conectadoAlgunaVez()`** (flag de preferencia en `localStorage` para intentar la reconexión silenciosa), **`alPerderSesion(cb)`** / **`invalidarToken()`** (401 de Google → avisa a `almacenamiento.js`).

## `assets/js/google-drive-sync.js`

Cliente mínimo de Google Drive API v3 con `fetch`. El único destino de los datos.

- **`ErrorDrive`**: error con `codigo` (`sin-sesion`, `sesion-vencida`, `sin-conexion`, `no-encontrado`, `otro`) para que `almacenamiento.js` decida qué estado mostrar. `pedirDrive` envuelve el `fetch`, invalida el token ante un 401 y traduce los fallos de red.
- **`buscarArchivoRemoto()`**: busca `super-todo-list-datos.json` (con `drive.file` ve el archivo creado por la app en cualquier dispositivo). Devuelve `{ id, modifiedTime, createdTime, duplicados }`; si hay más de uno (dos dispositivos lo crearon a la vez) elige el más antiguo.
- **`leerArchivoRemoto(id)`**: descarga y parsea el contenido. **`guardarArchivoRemoto(datos)`**: crea (multipart) o actualiza (PATCH) el archivo; devuelve `{ id, modifiedTime, desfaseRelojMs }`.

## `assets/js/google-calendar.js`

Lectura de eventos reales de Google Calendar. Usa el token de `google-auth.js` (ya no tiene conexión propia).

- **`soportaGoogleCalendar()` / `hayConexionGoogleCalendar()`**: `hayConexionGoogleCalendar` es verdadero si hay token y el usuario concedió el scope de Calendar.
- **`obtenerEventosDeHoy()`**: trae los eventos del día actual, con caché en memoria por día.
- **`calcularSolapamiento(tarea, eventos)`**: compara la ventana `[tarea_fecha_sugerida (con hora), +tarea_duracion_min]` contra cada evento y devuelve el primero que se superpone (usado en Hoy).

## `assets/js/ubicacion-actual.js`

- **`obtenerUbicacionActual()` / `establecerUbicacionActual(idUbicacion)`**: preferencia de "¿dónde estás?" compartida entre Hoy, Tareas y 3/8 días, en una clave propia de `localStorage` (preferencia de sesión, no dato de la app).

---

## `views/hoy.view.js`

Vista "Hoy": separa tareas urgentes del resto (ver `REGLAS_DE_PRIORIDAD.md`), con un asistente de cierre por tarjeta.

- **`renderVistaHoy(contenedor)`**: arma las secciones Urgentes / Resto (con el apartado "Elegí por categoría" vía `mejorTareaPorCategoria`) / Todavía no pueden empezar / Bloqueadas, filtradas por la ubicación actual. `bloqueadas` y `accionables` se separan directamente por `tarea_estado`.
- **`renderItem(tarea, opciones)`**: tarjeta de una tarea con sus badges (importancia, foco 80/20, categoría, fechas, holgura, estado, ubicación, costo, clima, solapamiento con Calendar). Si es accionable, agrega los botones "Cumplida"/"No cumplida" (sin pedir duración/costo real — se eliminaron de la app); si además está vencida, agrega "📅 Revalorizar fecha límite" (reusa `crearPanelReprogramar`, pero escribe directo `tarea.tarea_fecha_limite` sin cascada a dependientes — ver `REGLAS_DE_PRIORIDAD.md`).

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

## `views/todas.view.js`

Vista de referencia y auditoría: todas las tareas (de cualquier estado), con filtros y orden por columna.

- **`renderVistaTodas(contenedor)`**: por defecto ordena por `compararPorPrioridad` (el orden real de la app), para detectar de un vistazo si algo quedó mal priorizado. Filtros de categoría (inclusivo de descendientes, vía `idsCategoriaYDescendientes`), estado, importancia y buscador por nombre. Clic en un header de columna cambia el orden a esa columna sola (`COMPARADORES`), con toggle asc/desc y un botón "↺ Prioridad" para volver al orden por defecto. Clic en una fila abre esa tarea en edición en Tareas.
- **`idsCategoriaYDescendientes(categoriaId, categorias)`**: IDs de una categoría y todas sus descendientes, recorriendo `categoria_padre_id` hacia abajo — a diferencia del filtro de categoría de Tareas (que compara `categoria_id` exacto), este es inclusivo de descendientes.
- **`crearPanelVersus(contenedorVista)`**: panel toggleable (botón "⚔️ Versus") que ofrece de a un par de tareas empatadas (`construirClusteres`/`proximoParVersus`, sobre `esTareaAccionable`) para que el usuario elija cuál prefiere, o las omita. Ver `REGLAS_DE_PRIORIDAD.md` para el mecanismo completo (asignación de `tarea_prioridad_manual`, por qué "omitir" no asigna nada).

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
