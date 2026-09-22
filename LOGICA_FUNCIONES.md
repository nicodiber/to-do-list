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
- **Botón "＋" y "Completar carga de tareas (X)"** (`actualizarBotonesTareas`, en cada `render()`): el "＋" se muestra siempre que haya datos y no sea una pestaña de solo lectura, y hace lo mismo que el atajo "N" (`irAlAltaDeTarea`); el botón de completar carga aparece solo si `tareasSoloConNombre` devuelve al menos una tarea y abre `abrirCargaTareas`.
- **Borradores en `render()`**: en redibujados por cambios de otro dispositivo se conserva todo lo escrito; en redibujados locales solo los formularios marcados `data-conservar-borrador` (el alta de tareas).
- **Refresco de Calendar** (`refrescarCalendar()`): al usar "Sincronizar ahora" y al volver a la pestaña (`visibilitychange`), si hay conexión con Calendar llama a `invalidarCacheEventos()` y, si la vista actual es Hoy, redibuja (salvo con una ventana abierta, texto a medio escribir o un panel de cierre/reprogramación abierto en una tarjeta).
- **Atajos de teclado**: `configurarAtajos` (`assets/js/atajos.js`) registra un único `keydown` global; `app.js` le pasa el orden de `VISTAS` (las diez primeras se abren con las teclas 1…9 y 0), `irAVista`, `abrirNuevaTarea` (el mismo que usa el botón "＋") y `puedeUsarse()` (datos listos y no solo lectura). El botón ⌨️ de la cabecera abre la ayuda. El `title` de cada pestaña muestra su tecla.
- **Tema claro/oscuro**: `temaEfectivo()`/`aplicarTema()` leen/aplican la preferencia guardada en `localStorage` (una preferencia, nunca datos de tareas). **El oscuro es el valor por defecto**: sin elección guardada la app se abre en oscuro aunque el sistema esté en claro (ya no sigue `prefers-color-scheme`). `aplicarTema` también actualiza `theme-color`.
- **Reprogramado automático al iniciar** (`reprogramarSiCorresponde()`): una sola vez, cuando los datos ya están listos (después de `inicializarAlmacenamiento()` o de conectar), se llama `reprogramarFechasSugeridasVencidas(estado.tareas)` (`tareas-logica.js`) y, si afectó alguna tarea, se persiste y se avisa con un `alert()`. Ver `REGLAS_DE_PRIORIDAD.md`.
- Wiring de los botones de la cabecera (sincronizar ahora, exportar/importar JSON, tema) hacia `almacenamiento.js`.
- Al final, llama `inicializarAlmacenamiento()` y registra el service worker (`sw.js`).

## `assets/js/almacenamiento.js`

Estado en memoria, sincronización con Google Drive y migración de datos.

- **Guarda de versión** (Ronda 9b): al leer el archivo de Drive, si su `formato` es mayor que `FORMATO_ARCHIVO` (3), `sincronizarUnaVez` pone `sync.soloLectura` y un mensaje de error, y no sube nada. **`persistirYNotificar({ sinNotificar })`**: con `sinNotificar: true` guarda sin redibujar las vistas (lo usa Configuraciones campo por campo).
- **`estado`**: objeto exportado con las 8 colecciones de la app (`categorias`, `ubicaciones`, `metas`, `personas`, `tareas`, `mejoras`, `cumplimientos`, `preferencias`). Es la única fuente de verdad en memoria; todas las vistas lo mutan directamente y después llaman `persistirYNotificar()`.
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

## `assets/js/dependencias.js`

Dependencias entre tareas (lógica pura). Regla 1 a 1: cada tarea bloquea a como máximo una tarea activa (sin completar) y es bloqueada por como máximo una.

- **`recalcularBloqueo(tarea, lista)` / `puedeAgregarDependencia(tareaId, candidatoId, lista)`**: movidas desde `tareas-logica.js` (que las reexporta). Bloqueada si la previa no está completada; sin auto-referencia ni ciclos.
- **`proximasActivas(id, lista)` / `tareaProxima(id, lista)`**: las tareas activas que dependen directamente de `id` (regla 1 a 1: a lo sumo una).
- **`evaluarEnlace(tareaId, { previaId, proximaId }, lista)` / `aplicarEnlace(...)`**: cada valor puede ser un id, `null` (quitar) o `undefined` (dejar). Si se elige una tarea ya enlazada, se **inserta en medio** (elegir solo la previa P, o solo la próxima N, o ambas cuando son consecutivas → P→A→N); si se eligen las dos y no son consecutivas se **rechaza** con el conflicto explicado (`{ ok: false, motivo }`). También rechaza auto-referencia, ciclos, tareas completadas y el uso simultáneo de desencadenante y previa. `aplicarEnlace` muta las dependencias y recalcula los bloqueos.
- **`opcionesPrevia(tarea, lista)` / `opcionesProxima(tarea, lista)`**: opciones de los desplegables (tareas sin completar que no crean un ciclo) con `ocupadaPor` (la tarea ya enlazada), para rotular "se inserta en medio".
- **`reconectarAlEliminar(tarea, lista)`**: al eliminar una tarea del medio, las que dependían de ella pasan a depender de su previa; el desencadenante que la apuntaba pasa a su previa.
- **`tareasDeLaCadenaNoRepetibles(tarea, lista)`**: sigue las próximas de una tarea de mantenimiento hasta su desencadenante y devuelve las tareas de esa cadena que no son de mantenimiento (`[]` si no hay desencadenante o la cadena no llega hasta él).
- **`repararEnlaces(tareas)`**: tras mezclar cambios de dos dispositivos, si una previa quedó con más de una tarea activa detrás conserva el enlace de la más antigua y suelta el resto; si se formó un ciclo, lo corta por la más nueva. Devuelve las reparaciones para dejar avisos. Solo la usa la sincronización con Drive.

## `assets/js/borradores.js`

Conserva lo que el usuario ya escribió en los formularios cuando la vista se redibuja por cambios que llegaron de otro dispositivo.

- **`capturarBorradores(contenedor, { soloEn })`**: recorre los `input`/`textarea`/`select` del contenedor y guarda el valor de los que el usuario tocó (distintos de su valor inicial), identificándolos por formulario (su `id`) + nombre + tipo + posición, y cuál tenía el foco (con su selección). Con `soloEn` (un selector) mira solo los campos dentro de elementos que lo cumplan.
- **`restaurarBorradores(contenedor, captura)`**: después de redibujar, vuelve a poner esos valores en los campos equivalentes (disparando `input`/`change` para que la interfaz dependiente se actualice) y devuelve el foco.
- Lo usa `render()` de `app.js` cuando `almacenamiento.js` notifica con `conservarBorradores: true` (solo al aplicar cambios remotos).

## `assets/js/sincronizacion.js`

Lógica **pura** (sin DOM ni red) de sellado y mezcla entre dispositivos. Toda la política de conflictos vive acá.

- **`COLECCIONES`**: configuración de las 8 colecciones (clave de id, campo de sello `*_modificado_en`, campo de nombre para los avisos, etiqueta).
- **`sellarCambios(estado, ultimo, base, eliminados, ahora)`**: compara cada entidad contra la última foto guardada; nueva o distinta → `*_modificado_en = ahora`; ausente ahora y presente antes → tombstone en `eliminados`. Usa `estable()` para comparar sin que importe el orden de las claves.
- **`mezclar(local, remoto, base, ahora)`**: por id y entidad completa. Si solo un lado cambió respecto de `base`, gana ese; si cambiaron ambos, gana el sello más nuevo (empate → remoto) y se genera un aviso con los campos y valores descartados; borrado vs. edición: se conserva lo más reciente y se avisa. Devuelve `{ estado, eliminados, avisos }`.
- **`datosParaArchivo(estado, eliminados, ahora)`**: arma el JSON de Drive (formato 3: colecciones, `eliminados`, `guardado_en`). **`fotoColecciones`**, **`copiarProfundo`**, **`difierenDatos`**, **`purgarEliminados`** (borra tombstones de más de 90 días).

## `assets/js/almacenamiento-local.js`

IndexedDB (`super-todo-list`, versión 2) para lo que no puede depender de la red. Todas las operaciones fallan en silencio devolviendo `null` (con `hayAlmacenamientoLocal()` para saber si hay soporte).

- **`leerCache()` / `guardarCache()`**: última copia **confirmada por Drive** (datos + `modifiedTime`). Es la base de la mezcla y la copia de solo lectura sin conexión.
- **`leerPendiente()` / `guardarPendiente()` / `borrarPendiente()`**: estado de trabajo con cambios aún no confirmados por Drive. **Se borra únicamente después de que Drive confirma.**
- **`leerAvisos()` / `guardarAvisos()`**: avisos de conflicto sin descartar.

## `assets/js/modelos.js`

Factories y constantes del modelo de datos — es la fuente de verdad de qué campos tiene cada entidad (debe coincidir 1:1 con `datos/esquema.json` y `DICCIONARIO_DE_DATOS.md`).

- **`crearCategoria`, `crearUbicacion`, `crearPersona`, `crearMeta`, `crearTarea`, `crearMejora`, `crearCumplimiento`**: una factory por entidad (`crearCumplimiento` recibe la tarea cumplida y la fecha). Reciben los campos propios de la entidad (con sus defaults) y devuelven el objeto completo, generando `entidad_id` con `generarId()`. `crearTarea` calcula `tarea_creada_en` una sola vez y la usa también como default de `tarea_fecha_inicio_habilitada` si no se pasó una.
- **Constantes de UI**: `ESTADOS_TAREA`/`ETIQUETAS_ESTADO` (`bloqueada`/`pendiente`/`completada`), `NIVELES_IMPORTANCIA`/`ETIQUETAS_IMPORTANCIA`/`ICONOS_IMPORTANCIA` (`urgente`/`importante`), `PLAZOS_META`/`ETIQUETAS_PLAZO`, `UNIDADES_MANTENIMIENTO`/`ETIQUETAS_UNIDAD_MANTENIMIENTO`.

## `assets/js/utilidades.js`

Helpers puros de fecha/formato/id, sin dependencias de `estado`. Reutilizados por casi todos los demás módulos.

- **`generarId()`**: UUID (`crypto.randomUUID` con fallback manual).
- **`fechaLocalISO(fecha)`**: el día local de un `Date` como `YYYY-MM-DD`. **`diaLocal(fechaISO)`**: el día local de un valor de tarea (la misma fecha si no lleva hora; el día local del instante si la lleva) — reemplaza a cortar el texto con `.slice(0, 10)`. **`formatearHora(fechaISO)`**: `HH:MM` en 24 h y hora local. La zona de referencia es la del dispositivo (ver `DICCIONARIO_DE_DATOS.md`).
- **`hoyISO()` / `ahoraISO()`**: el día **local** de hoy (`YYYY-MM-DD`) y el instante actual (datetime ISO en UTC).
- **`tieneHora(fechaISO)`**: `true` si el string tiene más de 10 caracteres (convención fecha±hora, ver `DICCIONARIO_DE_DATOS.md`).
- **`formatearFecha(fechaISO)` / `formatearFechaHora(fechaHoraISO)` / `formatearFechaOFechaHora(fechaISO)`**: de formato interno ISO a formato de pantalla `DD/MM/YYYY` (con o sin hora); la tercera elige automáticamente según `tieneHora`.
- **`esVencida(fechaLimiteISO)` / `esHoy(fechaISO)`**: comparan el día local (`diaLocal`) del valor contra `hoyISO()`, para que una fecha con hora también matchee "hoy".
- **`noPuedeEmpezarTodavia(fechaInicioHabilitadaISO)`**: si el valor tiene hora, compara contra el instante actual (`new Date()`); si no, contra `hoyISO()`.
- **`fechaISOMasDias(dias, desdeISODate)`**: suma/resta días a una fecha (día local).
- **`combinarFechaYHora(fechaISODate, horaHHMM)`**: arma un datetime ISO completo a partir de una fecha y una hora sueltas.
- **`desplazarFecha(fechaISO, deltaMs)`**: desplaza una fecha±hora por un delta en milisegundos, preservando si el resultado queda con o sin hora — usado por la cascada de reprogramación.
- **`diasEntreFechas(fechaISO1, fechaISO2)`**: diferencia en días enteros entre dos fechas.
- **`arbolCategorias(categorias, padreId, profundidad)`**: aplana el árbol de categorías (vía `categoria_padre_id`) en orden DFS, cada entrada con su nivel de profundidad — para selects/listas indentadas.
- **`caminoCategoria(categoria, todasLasCategorias)`**: arma el "camino" de nombres de una categoría hasta su raíz (ej. "Facultad / IR"), recorriendo `categoria_padre_id`.
- **`categoriaRaiz(categoria, todasLasCategorias)`**: sube por `categoria_padre_id` hasta la categoría sin padre. Usado por `compararPorPrioridad` para comparar tareas por la prioridad de su categoría raíz, no de la categoría directa.
- **`textoHolgura(dias)`**: texto legible de una holgura ya calculada (ver `calcularHolguraDias` en `tareas-logica.js`) — "Vencida hace N días" / "Vence hoy" / "Quedan N días". Compartido entre `views/hoy.view.js` y `views/tabla.view.js`.
- **`escaparHtml(texto)`**: sanitiza texto libre antes de insertarlo en `innerHTML`.

## `assets/js/tareas-logica.js`

Lógica de negocio central sobre tareas: mantenimiento cíclico, bloqueo por dependencia, prioridad (ver `REGLAS_DE_PRIORIDAD.md` para el detalle de orden, no repetido acá).

- **`calcularProximaFechaMantenimiento(desdeISODatetime, intervalo)`**: dado un `tarea_mantenimiento_intervalo` (`{ cantidad, unidad }`) y una fecha de referencia, calcula la próxima `tarea_fecha_limite`.
- **`fechaFinDeRepeticion(tarea, listaTareas)`** (Ronda 9a): hasta qué día se repite una tarea de mantenimiento (hábito temporal), o `''` si no termina: lo más temprano entre `tarea_repetir_hasta` y lo que marque `tarea_repetir_hasta_tarea` (el día en que se cumplió esa otra tarea o, si sigue pendiente, su fecha límite o sugerida; si ya no existe se ignora).
- **`completarTarea(tarea, listaTareas, opciones)`**: marca la tarea como `completada` y fija `tarea_fecha_fin`. Si tiene `tarea_mantenimiento`, clona una nueva instancia `pendiente` (vía `crearTarea`) con la próxima fecha límite calculada desde la fecha real de finalización, copiando categoría, nombre, duración, descripción (con la mejora sugerida anexada si se cargó una), intervalo de mantenimiento, costo estimado, disfrute, importancia, ubicación, días hábiles, clima, meta, el `tarea_desencadenante` y el checklist con todos los ítems destildados. Devuelve la tarea clonada o `null`. Es una pieza interna: las vistas usan `cumplirTarea`, que además enlaza la copia, desbloquea dependientes y registra cumplimiento y mejora.
- **`cumplirTarea(tarea, estado, { notaMejora })`**: cumple una tarea: `completarTarea`, registra el **cumplimiento** (`estado.cumplimientos`), crea la **Mejora** si hay nota (`estado.mejoras`), enlaza la copia de mantenimiento y desbloquea dependientes. Reemplaza el par `completarTarea` + `desbloquearDependientes` que repetían Hoy, Tareas y "Revisar mi día". Enlace de la copia: si la original tenía previa P, la copia depende de la instancia vigente de P; si no, y tenía `tarea_desencadenante` D, queda bloqueada por la instancia vigente de D (así una cadena o un anillo A→B→C→D→A se repite entero). Nunca crea un enlace que rompa la regla 1 a 1 o forme un ciclo.
- **`esTareaSoloConNombre(tarea, lista)` / `tareasSoloConNombre(lista)`**: una tarea sin completar con todo en su valor por defecto (sin categoría, importancia, disfrute, meta, fechas, descripción, ubicación, clima, costo, mantenimiento, días hábiles, checklist, desencadenante ni enlaces, duración 15) y sin `tarea_carga_completa`. Alimenta el botón "Completar carga de tareas (X)".
- **`instanciaPendiente(tarea, lista, excluirIds)`**: la instancia vigente de una tarea — ella misma si no está completada, o la copia de mantenimiento pendiente con el mismo `tarea_nombre` (la más antigua).
- **`reabrirTarea(tarea, estado)`**: vuelve la tarea a `pendiente` (o `bloqueada` si su previa no está completa), borra su cumplimiento, pone `tarea_exportada_calendar = false` y recalcula a las dependientes. Si era de mantenimiento borra la copia que había generado solo si sigue sin tocar (sin completar, sin dependientes y sin ediciones posteriores: su `tarea_modificado_en` está a menos de 10 s de su creación); si se tocó la conserva. Devuelve `{ copiaEliminada, copiaConservada }`. La Mejora se conserva.
- **`eliminarTarea(tarea, estado)`**: elimina la tarea y reconecta la cadena (`reconectarAlEliminar`). No borra cumplimientos ni mejoras (historial).
- **`recalcularBloqueo(tarea, listaTareas)`** (ahora en `dependencias.js`, reexportada): fija `tarea_estado` según `tarea_dependiente` — `bloqueada` si apunta a una tarea no completada, `pendiente` si no. No toca tareas ya `completada`. Se llama al crear una tarea con dependencia, al editar/quitar la dependencia, y en cascada al completar una tarea (ver siguiente función).
- **`desbloquearDependientes(tareaCompletada, listaTareas)`**: al completar una tarea, encuentra las que dependían de ella (`tarea_dependiente === tareaCompletada.tarea_id`), les copia `tarea_fecha_inicio_habilitada = tareaCompletada.tarea_fecha_fin` y llama `recalcularBloqueo` sobre cada una.
- **`reprogramarTareaConCascada(tarea, nuevaFechaSugeridaISO, listaTareas)`**: actualiza `tarea_fecha_sugerida` y, si había un valor previo, desplaza en cascada (mismo delta de tiempo, vía `desplazarFecha`) a las tareas que dependen de ella (`tarea_dependiente === tarea.tarea_id`), ajustando también su `tarea_fecha_limite`.
- **`calcularHolguraDias(tarea)`**: días de margen antes de que venza `tarea_fecha_limite`, contados desde hoy (o desde `tarea_fecha_inicio_habilitada` si es futura). Ver `REGLAS_DE_PRIORIDAD.md` para la fórmula completa y las bandas.
- **`compararPorPrioridad(a, b, categorias)`**: ver `REGLAS_DE_PRIORIDAD.md`. Internamente delega los niveles 1-4 en `compararEstructural` (no exportada), reusada también por `tareasEmpatadas`.
- **`tareasEmpatadas(a, b, categorias)`**: `true` si 2 tareas empatan en `compararEstructural` y ninguna tiene ya `tarea_prioridad_manual` asignado — usada por el panel "Versus" (`views/tabla.view.js`) para armar los clusters a comparar.
- **`mejorTareaPorCategoria(tareas, categorias)`**: ver `REGLAS_DE_PRIORIDAD.md`.
- **`reprogramarFechasSugeridasVencidas(listaTareas)`**: reprograma automáticamente la `tarea_fecha_sugerida` vencida de toda tarea activa a la próxima fecha disponible (`calcularProximaFechaSugerida`, interna, reusa `siguienteDiaHabil` de `reprogramar.js`), en cascada vía `reprogramarTareaConCascada`. Se llama una vez al iniciar la app (`app.js`). Devuelve las tareas afectadas, para avisar al usuario. Ver `REGLAS_DE_PRIORIDAD.md`.
- **`puedeAgregarDependencia(tareaId, candidatoId, listaTareas)`** (ahora en `dependencias.js`, reexportada): valida que asignar `candidatoId` como `tarea_dependiente` de `tareaId` no cierre un ciclo, recorriendo la cadena de `tarea_dependiente` hacia atrás desde `candidatoId`.
- **`esTareaAccionable(tarea)`**: `true` si `tarea_estado === 'pendiente'` y ya se alcanzó `tarea_fecha_inicio_habilitada`.
- **`renombrarHistorial(estado, nombreViejo, nombreNuevo)`**: pasa al nombre nuevo los cumplimientos y las notas de mejora de una tarea de mantenimiento (la identidad de un hábito es el nombre) y devuelve cuántos registros cambió; la llama la ventana de edición (`modal-tarea.js`) al renombrar una tarea que era de mantenimiento.
- **`ordenarConCadenas(tareasOrdenadas)`** (v0.64.0): reordena una lista ya priorizada para que cada tarea bloqueada quede justo detrás de su tarea previa (una cadena se ve junta, en el orden en que se va a poder hacer, no separada entre pendientes y bloqueadas). Una bloqueada cuya previa no está en la lista (por ejemplo, un filtro la dejó afuera) cae al final, en su orden original. Pura. La usan `views/tareas.view.js` y `views/tabla.view.js` (esta última solo con el orden por defecto, sin columna elegida).

## `assets/js/reprogramar.js`

UI del panel de reprogramar (usado desde Hoy, Tareas, 3/8 días y "Revisar mi día").

- **`crearPanelReprogramar({ onConfirmar, onCancelar, diasHabiles })`**: arma un panel con atajos de día (hoy/mañana/+7/+15/+30, y "primer [día de la semana] del próximo mes") y de horario **opcional** (mañana/tarde/tardecita/noche, o vacío). Si la tarea tiene `tarea_dias_habiles`, cualquier fecha elegida se ajusta automáticamente al próximo día hábil. Al confirmar, llama `onConfirmar(valor)` — solo la fecha (`YYYY-MM-DD`) si no se eligió horario, o un datetime ISO completo si sí. También usado por Hoy para revalorizar `tarea_fecha_limite` de una tarea vencida.
- **`siguienteDiaHabil(fechaISODate, diasHabiles)`** (exportada): próximo día que cumple `tarea_dias_habiles` desde una fecha dada (o la misma fecha si no hay restricción). Reusada por `reprogramarFechasSugeridasVencidas` en `tareas-logica.js`.

## `assets/js/revision-dia.js`

Asistente "Revisar mi día": repasa una por una las tareas activas del día en un `<dialog>`.

- **`iniciarRevisionDia(tareas)`**: arma la cola de tareas no completadas y muestra el diálogo, paso a paso.
- **`renderPaso()`**: por cada tarea, ofrece "Cumplida" (si tiene `tarea_mantenimiento`, pide una nota de mejora opcional, y llama `cumplirTarea`), "No cumplida" (abre directamente el panel de reprogramar) o "Saltar".
- **`renderPasoFinal(dlg)` / `renderSeccionCalendario(contenedor)`**: al terminar la cola, si hay conexión con Google Calendar muestra los eventos reales del día; si no, ofrece un alta rápida de "tareas de continuidad" (`wirePreguntaContinuidad`).

## `assets/js/exportar-calendar.js`

Exportación puntual de una tarea completada a Google Calendar (sin OAuth).

- **`construirUrlExportarGoogleCalendar(tarea)`**: arma una URL de `calendar.google.com/render` con el evento precargado (inicio = `tarea_fecha_fin` menos `tarea_duracion_min`, detalle con categoría/descripción).
- **`ofrecerExportarACalendar(tarea)`**: abre una ventana de la propia página (`abrirDialogoFormulario`) que pregunta si se quiere abrir esa URL; el clic en "Abrir en Calendar" abre la pestaña (un `confirm()` del navegador vence el permiso y la pestaña se bloqueaba), marca `tarea_exportada_calendar` y persiste. Si el navegador bloquea la pestaña, avisa y no la marca.

## `assets/js/clima.js`

Consulta de pronóstico real (Open-Meteo, sin API key) para tareas con `tarea_requiere_clima_bueno`.

- **`fechaDeReferencia(tarea)`** (privada): resuelve fecha y hora aproximada a partir de `tarea_fecha_sugerida` (con su hora si la tiene) o, si no hay, `tarea_fecha_limite` (a las 12:00 si no tiene hora propia).
- **`obtenerPronosticoUbicacion(latitud, longitud)`**: fetch a Open-Meteo, con caché en memoria por coordenadas.
- **`evaluarClimaTarea(tarea)`**: si no aplica (no requiere clima, sin ubicación con coordenadas, sin fecha resoluble, fuera de la ventana de 16 días, o falló la consulta), devuelve `null`. Si hay datos, devuelve `{ favorable, probabilidadLluvia }`.

## `assets/js/vista-agenda.js`

Motor de la vista Agenda (`views/agenda.view.js` le pasa la cantidad de días).

- **`fechaDeReferencia(tarea)`** (exportada): resuelve la fecha (solo el día) por la que se agrupa una tarea — `tarea_fecha_sugerida` si tiene valor, si no `tarea_fecha_limite`. También la usa `views/tabla.view.js`.
- **`renderVistaAgenda(contenedor, cantidadDias, alCambiarRango)`**: agrupa las tareas pendientes (filtradas por la "ubicación actual") por día, para los próximos `cantidadDias` empezando hoy, con el selector 3 · 8 · 15 días (avisa la elección con `alCambiarRango`).
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

- **`diasHorizonteCalendar()`**: cuántos días hacia adelante se leen los eventos (`pref_horizonte_dias`, 90 por defecto; antes la constante `DIAS_HORIZONTE_CALENDAR` valía 15).
- **`soportaGoogleCalendar()` / `hayConexionGoogleCalendar()`**: `hayConexionGoogleCalendar` es verdadero si hay token y el usuario concedió el scope de Calendar.
- **`listarCalendarios()`**: los calendarios del usuario (`{ id, nombre, color, principal }`, el principal primero; mismo permiso de solo lectura). Con caché de 5 minutos; sin conexión o con error devuelve `[]`.
- **`obtenerEventos(desde, hasta)`** (async): los eventos **que ocupan tiempo** entre dos fechas locales `YYYY-MM-DD`, ambas incluidas, de todos los calendarios elegidos (`pref_calendarios`; sin lista, todos). Cada evento trae `{ id, resumen, inicio, fin, todoElDia, rechazado, disponible, calendarioId, calendarioNombre, color, enlace }` (los de todo el día se pasan a medianoche local). Se descartan los que las preferencias mandan ignorar (**`ocupaTiempo`**). Pagina (250 por página), consulta cada calendario por separado (si falla uno, siguen los demás) y cachea los eventos completos 5 minutos por rango y calendarios; los filtros se aplican al leer.
- **`obtenerEventosParaMostrar(desde, hasta)`**: todos los eventos salvo los rechazados y, si `pref_ignorar_disponible` está activo, los marcados «Disponible» (v0.64.0; antes solo influía en la capacidad, no en lo que se mostraba en Semana). Los de todo el día se muestran siempre.
- **`obtenerEventosDeHoy()` / `obtenerEventosDelHorizonte()`**: atajos de `obtenerEventos` para hoy y para hoy + el horizonte (este último es el que usa Hoy).
- **`invalidarCacheEventos()`**: vacía la caché de eventos y de calendarios; la usa `app.js` al sincronizar y al volver a la pestaña, y Configuraciones al cambiar calendarios u horizonte.
- **`calcularSolapamiento(tarea, eventos)`**: compara la ventana `[tarea_fecha_sugerida (con hora), +tarea_duracion_min]` contra cada evento y devuelve el primero que se superpone (usado en Hoy). Pura.
- **`buscarHuecoLibre(eventos, duracionMin, { desde, dias, franja, diasHabiles })`**: primer inicio (datetime ISO) en pasos de 15 minutos, desde `desde` durante `dias` días, cuya ventana entera cae dentro de la franja horaria del día (`{ inicio: 'HH:MM', fin: 'HH:MM' }`, el fin puede ser `24:00`), en un día hábil (`diasHabiles` vacío = todos) y sin choque con ningún evento; ante un choque salta al final de ese evento redondeado a 15 minutos. Devuelve `null` si no hay hueco. Pura, sin red.

## `assets/js/preferencias.js`

- **`obtenerPreferencias()`**: copia de las preferencias vigentes (`estado.preferencias[0]`, con los valores por defecto de `PREFERENCIAS_POR_DEFECTO` si no hay registro; la franja vieja de `localStorage` se usa como valor inicial). **`guardarPreferencias(parcial, { sinNotificar })`**: crea el registro la primera vez (y borra la clave vieja de la franja), aplica los cambios, descarta las capacidades de fechas pasadas y llama a `persistirYNotificar`. **`guardarCapacidadDeFecha(dia, minutos | null)`**: fija o quita la capacidad de un día.

## `assets/js/preferencias-horario.js`

- **`obtenerFranjaHoraria()` / `establecerFranjaHoraria({ inicio, fin })`**: envoltorio de `pref_franja` (ahora en Drive) que conserva la API de antes; `establecerFranjaHoraria` valida (inicio anterior al fin) y guarda sin redibujar. **`HORAS_FRANJA`**, **`FRANJA_POR_DEFECTO`**.

## `assets/js/capacidad.js`

Lógica **pura**: la consulta común de cuánto tiempo hay disponible cada día y cuánto lleva comprometido. Hoy la usa Semana (el Gantt y la reprogramación de fechas vencidas se sumarán).

- **`crearCalculadoraCapacidad({ preferencias, eventos, tareas, hoy, ahora, excluirIds })`** → `(dia) => { dia, tope, fija, libreCalendar, capacidad, carga, restante, sobrecarga }`, con memo por día. `tope`: la capacidad fijada para esa fecha o el tope de su día de la semana; `libreCalendar`: minutos de la franja sin los eventos que ocupan (y, hoy, sin lo que ya pasó); `capacidad = min(tope, libreCalendar)` (o `tope` si el usuario fijó ese día); `carga`: minutos de las tareas sin completar con fecha sugerida ese día (salvo `excluirIds`); `restante = max(0, capacidad − carga)`.
- **`minutosOcupados(eventos, dia, franja, hastaMs)`** y **`unirIntervalos(intervalos)`**: la unión de intervalos que se pisan.

## `assets/js/boton-flotante.js`

- **`agregarBotonFlotante(contenedor, { titulo, alClic })`** (v0.64.0): botón "＋" `position: fixed` (siempre visible, aunque la lista sea larga), mismo look que el "＋" de la cabecera. Lo usan Categorías, Ubicaciones, Metas, Tareas y Personas.

## `assets/js/selector-color.js`

Selector de color propio (v0.64.0), parecido al nativo del navegador pero con Aplicar/Cancelar y un dado — hoy lo usa solo `categoria_color` (`assets/js/formularios-entidades.js`). Puro: `hsvAHex(h, s, v)` / `hexAHsv(hex)`.

- **`crearSelectorColor({ contenedor, nombreCampo, valorInicial })`**: arma un botón-disparador (muestra + hex) y un popover con el área de saturación/valor y la barra de tono (arrastre con Pointer Events), un campo de hex, el dado 🎲 (sortea un HSV con saturación y brillo acotados) y Aplicar/Cancelar. El popover es `position: fixed` (calculado con `getBoundingClientRect`, no queda recortado por el `overflow-y: auto` del diálogo) y se cierra con Esc o clic afuera. El valor confirmado queda en un `<input type="hidden">`; solo al confirmar dispara el evento `color-aplicado` (para saber si el usuario ya eligió un color a mano). Devuelve `{ obtenerValor, setValor }`; `setValor` es silencioso, para precargar el color heredado de una categoría padre sin pisar una elección manual futura.

## `assets/js/checklist-tarjeta.js`

- **`htmlChecklistTarjeta(tarea)` / `conectarChecklistTarjeta(li, tarea)`**: la lista de casillas del checklist de una tarea de mantenimiento dentro de su tarjeta y el guardado al tildar (`persistirYNotificar`). La comparten Hoy y Tareas.

## `assets/js/ubicacion-actual.js`

- **`obtenerUbicacionActual()` / `establecerUbicacionActual(idUbicacion)`**: preferencia de "¿dónde estás?" compartida entre Hoy, Tareas y 3/8 días, en una clave propia de `localStorage` (preferencia de sesión, no dato de la app).

---

## `views/hoy.view.js`

Vista "Hoy": separa tareas urgentes del resto (ver `REGLAS_DE_PRIORIDAD.md`), con un asistente de cierre por tarjeta.

- **`renderVistaHoy(contenedor)`**: arma las secciones Urgentes / Próximos por categoría (`mejorTareaPorCategoria`, con el camino de la categoría) / Resto (sin repetir los próximos; no aparece si no queda nada) / Todavía no pueden empezar / Bloqueadas / Completadas hoy, filtradas por la ubicación actual. El botón "🎯 Enfoque" (preferencia `super-todo-list:hoy-enfoque` en `localStorage`, apagado por defecto) oculta las completadas. "Completadas hoy" son las de `tarea_fecha_fin` en el día local de hoy (`seCompletoHoy`).
- **`htmlMejorasPendientes(tarea)`** (privada): las notas de mejora sin aplicar de una tarea de mantenimiento (hasta 2, las más recientes) como líneas "💡 Mejora pendiente".
- **`renderItem(tarea, opciones)`**: tarjeta de una tarea con sus badges (importancia, categoría, fechas, holgura, estado, ubicación, costo, clima ☀️/🌧️), el checklist tildable y el aviso de superposición con Calendar con sus botones "Posponer" y "Al próximo hueco libre" (este usa `obtenerEventosDelHorizonte`, `buscarHuecoLibre`, `obtenerFranjaHoraria` y `reprogramarTareaConCascada`). Si es accionable, agrega los botones "Cumplida"/"No cumplida"; si además está vencida, agrega "📅 Revalorizar fecha límite" (escribe directo `tarea.tarea_fecha_limite` sin cascada a dependientes — ver `REGLAS_DE_PRIORIDAD.md`).
- **`renderCompletada(tarea)`**: tarjeta apagada de una tarea completada hoy, con la hora y "📅 Exportar a Calendar" (`ofrecerExportarACalendar`).
- **`abrirPanelReprogramar(contenedorPanel, tarea, alConfirmar)`** (privada): muestra `crearPanelReprogramar` en la tarjeta; la usan "No cumplida → Reprogramar", "Revalorizar fecha límite" y "Posponer".

## `views/agenda.view.js`

Vista "Agenda" (unifica las antiguas "3 días" y "8 días"): **`renderVistaAgendaConSelector(contenedor)`** llama a `renderVistaAgenda` con la cantidad de días guardada (3, 8 o 15; por defecto 8) en `localStorage` (`super-todo-list:agenda-dias`, una preferencia de UI).

## `views/semana.view.js`

Vista "Semana": grilla horaria (07:00-23:00) con tareas fijas y proyectadas, con la cantidad de días a elección.

- **`renderVistaSemana(contenedor)`**: arma la grilla con la cantidad de días de `leerDiasSemana()` (`assets/js/vista-semana-preferencias.js`: preferencia en `localStorage`, opciones 1 · 3 · 7 · 8 · 15, por defecto 8, mismo patrón que Agenda) desde `offsetDias` (módulo, sesión); columnas `minmax(0, 1fr)`, siempre se estiran para llenar el ancho disponible (v0.65.0: se quitó el ajuste automático por tamaño de pantalla). Flechas ‹ › avanzan/retroceden de a `cantidadDias`, sin techo hacia adelante.
- **`actualizarLineaAhora()`** (v0.65.0): reposiciona (o esconde) la línea de "ahora" en la columna de hoy, si está en el rango visible y la hora cae en `[HORA_INICIO, HORA_FIN)`. Corre una vez al dibujar y cada 60 s desde un `setInterval` de módulo (no hace nada si la grilla no está montada).
- **Eventos y carga** (Ronda 9b): tras dibujar, `pintarCargas` muestra en cada día la barra "planificado/disponible" (con `crearCalculadoraCapacidad`; primero sin eventos y luego con los de Calendar) y `pintarEventos` agrega los eventos de `obtenerEventosParaMostrar` como bloques de solo lectura (enlaces a Calendar, carriles si se pisan) y la franja de los de todo el día. Tocar la barra abre `abrirCapacidadDelDia` (fija `pref_capacidad_por_fecha`).
- **Tareas bloqueadas** (v0.65.0): las "proyectadas" (sin hora) ya no se filtran solo por `esTareaAccionable`, también entran las `bloqueada` (`esProyectable`); se marcan con la clase `bloqueada` y 🔒 en `renderBloqueTarea`. Antes de dibujarlas se ordenan con `compararPorPrioridad` + `ordenarConCadenas` (`tareas-logica.js`), para que una cadena quede junta.
- **`renderColumnaDia(fechaDia, hoy)`**: separa tareas "fijas" (`tarea_fecha_sugerida` con hora ese día) de "proyectadas" (accionables sin hora en `tarea_fecha_sugerida`, cuya fecha de referencia cae ese día, apiladas por prioridad).
- **`renderBloqueTarea(...)` / `agregarAsasArrastre(...)`**: cada bloque tiene asas arrastrables (Pointer Events) para modificar `tarea_fecha_sugerida` (agregándole/cambiándole la hora)/`tarea_duracion_min` directamente desde la grilla, en pasos de 15 minutos.

## `views/tareas.view.js`

La vista más grande: alta de tareas, filtros, lista y el panel de IA.

- **`renderVistaTareas(contenedor)`**: botón "＋ Nueva tarea" (abre `abrirAltaTarea`), los filtros y la lista. Orden: pendientes → bloqueadas (por prioridad dentro de cada grupo) y, al final, las completadas plegadas en un `<details class="completadas-plegadas">` "Completadas (N)" que recuerda si estaba abierto (y se muestra abierto con el filtro Estado = Completada).
- **`renderTarea(tarea)`**: tarjeta con el borde izquierdo del color de la categoría (`--color-categoria`), etiqueta "⚠️ Vencida" y fondo rojizo si está vencida, los badges (incluida la persona asociada, 👤, desde la v0.66.0), el checklist con casillas que se tildan ahí mismo (`checklist-tarjeta.js`, persiste al tildar) y las acciones (cambiar estado — solo `pendiente`/`completada` —, posponer, editar, duplicar, crearle previa/posterior, eliminar). "Editar" abre `abrirEdicionTarea`; completar usa `cumplirTarea`, volver a pendiente `reabrirTarea` y eliminar `eliminarTarea`.
- **`crearPanelIAPrioridades()`**: UI del flujo de copiar/pegar con IA para reestructurar `tarea_importancia` de las tareas accionables.

## `assets/js/formulario-tarea.js`

Formulario de tarea compartido por el alta, la ventana de edición y "Completar carga de tareas" (antes había tres copias).

- **`htmlFormularioTarea(tarea | null, { modo, botonesNombre, botonesPie })`**: nombre arriba (con autocompletado por nombre solo en el alta) y debajo todos los campos: categoría, importancia, disfrute, los 3 pares fecha+hora, duración, costo, descripción, ubicación, meta, "depende de (tarea previa)" y "bloquea a (tarea próxima)" (`opcionesPrevia`/`opcionesProxima`), clima, mantenimiento con intervalo, desencadenante y checklist editable, y días hábiles. También exporta los helpers de opciones (`htmlOpcionesCategoria`, etc.) y `tareasUnicasPorNombre`.
- **`regenerarOpcionesEnlace(formulario, referencia)`** (v0.64.0): reconstruye las opciones de "Depende de" y "Bloquea a" (por ejemplo tras "Agregar y cargar otra"). `nombreConCategoria(tarea)` muestra "Categoría · Tarea" (antes, al revés).
- **`htmlOpcionesPersona(seleccionada)`** (v0.66.0): mismo patrón que `htmlOpcionesMeta`, con "＋ Crear nueva persona…"; el campo "👤 Persona" vive en 📝 Qué, junto a 🏁 Meta.
- Los desplegables de categoría, ubicación, meta y persona terminan con "＋ Crear nueva…" (`htmlOpcionesCategoria`/`htmlOpcionesUbicacion`/`htmlOpcionesMeta`/`htmlOpcionesPersona`): al elegirla se vuelve al valor anterior, se abre el diálogo de esa entidad y, al guardarla, el desplegable se reconstruye con la nueva seleccionada por propiedad (así el borrador del alta la conserva).
- **`ofrecerMarcarCadenaMantenimiento(tarea, lista)`**: si la tarea tiene desencadenante y su cadena tiene tareas que no son de mantenimiento (`tareasDeLaCadenaNoRepetibles`), avisa cuáles y ofrece marcarlas con el mismo intervalo; nada cambia sin confirmar.
- **`nombreConCategoria(tarea)`**: nombre de la tarea con su categoría ("Revisar · Casa"), para los desplegables y las tarjetas, porque dos tareas distintas pueden llamarse igual.
- **`conectarFormularioTarea(formulario, { modo })`**: pone en mayúscula la primera letra del nombre mientras se escribe, muestra u oculta lo de mantenimiento, agrega/quita pasos del checklist (Enter en un paso agrega otro en vez de enviar) y, en el alta, precarga los demás campos cuando el nombre coincide exacto con una tarea existente, **sin pisar lo que el usuario ya cargó** (solo completa campos que siguen como estaban o que la propia precarga había completado).
- **Formulario en secciones** (v0.59.0): el nombre arriba y cinco `<fieldset class="seccion-form">` (📝 Qué, 📅 Cuándo, 📍 Dónde y costo, 🔗 Enlaces, 🔁 Repetición) con cada campo dentro de `<label class="campo">` y su título con emoji. **`htmlInterruptor(nombre, marcado, texto, atributos)`** arma un interruptor Sí/No que sigue siendo un `<input type="checkbox">` con el mismo `name` (por eso lectura, borradores y precarga no cambian); **`htmlDiasHabiles`** dibuja los días hábiles como fichas L M X J V S D (semana desde el lunes, mismo `name`/`value`). En la edición suma el interruptor `estado_completada` (con la nota de mejora para tareas de mantenimiento; deshabilitado si la tarea está bloqueada).
- **`vaciarFormularioTarea(formulario)`**: vacía todos los campos (incluidos mantenimiento y checklist) y deja el cursor en el nombre; la usan "Agregar y cargar otra" y "Limpiar campos".
- **`leerFormularioTarea(formulario)`**: devuelve `{ campos, previaId, proximaId, completada, notaMejora }` (`completada` es `null` si el formulario no trae el interruptor o está deshabilitado); **`aplicarCamposATarea(tarea, campos)`** los aplica a una tarea existente.
- **`validarFormularioTarea(leido, tareaId)`**: antes de cambiar nada, rechaza un desencadenante combinado con una tarea previa y, si la tarea ya existe, valida los enlaces con `evaluarEnlace`. **`firmaFormulario(formulario)`**: texto que identifica el contenido, para detectar cambios sin guardar.

## `assets/js/atajos.js`

Atajos de teclado y su ayuda. Teclas solas (sin Ctrl/Alt/Meta) que solo actúan con el foco fuera de un campo y sin un `<dialog>` abierto.

- **`ATAJOS_FIJOS`**: tabla de los atajos que no dependen del orden de las pestañas (N, Enter, Ctrl+Enter, F, Esc, ?), única fuente de la ayuda.
- **`teclaDeVista(clave, vistas)` / `tituloConTecla(etiqueta, tecla)`**: la tecla de una pestaña (`1`…`9`, `0` para la décima, `null` para el resto) y el texto "Hoy (tecla 1)".
- **`configurarAtajos({ vistas, etiquetas, irAVista, abrirNuevaTarea, puedeUsarse })`**: números → `irAVista`; **N** → nueva tarea; **F** → foco en el primer `input[type="search"]` o `select` de filtro de la vista; **?** → ayuda (funciona aun sin datos, el resto no).
- **`abrirAyudaAtajos()`**: `<dialog>` con la lista (pestañas con su tecla, las que no tienen y los atajos fijos agrupados); se cierra con Esc, con "Cerrar" o con un clic afuera.

## `assets/js/dialogo-formulario.js`

Ventana modal genérica para un formulario (tareas, categorías, ubicaciones, metas, personas).

- **`activarMayusculaInicial(campo)`**: la primera letra de un campo de texto se escribe siempre en mayúscula, sin mover el cursor (nombres de tareas, categorías, ubicaciones, metas y personas; también se aplica en las funciones `crearXxx` de `modelos.js`).
- **Ctrl+Enter** (o Cmd+Enter) en cualquier campo del formulario lo envía con el botón principal (`button.boton-primario[type="submit"]`); los botones tienen `title` con la tecla.
- **`abrirDialogoFormulario({ titulo, cuerpoHtml, textoGuardar, botonesGuardar, conectar, alGuardar, alCerrar })`** (con `botonesGuardar` hay varios botones de guardado; `alGuardar` recibe cuál se apretó y una función `reiniciarFirma`): cada llamada crea su propio `<dialog>` en `document.body` (se pueden apilar) y lo quita al cerrar, sin depender del evento `close`. `alGuardar(formulario)` devuelve `true` para cerrar o `false` para dejarla abierta. Esc, el clic afuera (solo si empezó y terminó afuera) y "Cancelar" preguntan "¿Descartarlos?" solo si el formulario cambió (`firmaFormulario`).

## `assets/js/formularios-entidades.js`

Crear y editar categorías, ubicaciones, metas y personas: **`abrirDialogoCategoria` / `abrirDialogoUbicacion` / `abrirDialogoMeta` / `abrirDialogoPersona`** (`{ id, alCrear }`). Con `id` editan; sin `id` crean y llaman `alCrear(nueva)` antes de guardar, para que quien la pidió (el desplegable de una tarea) la seleccione. La categoría excluye de su desplegable de padre a sí misma y sus descendientes (`descendientesDeCategoria`) y, al cambiar de padre, queda al final de sus nuevas hermanas. La ubicación valida los rangos de las coordenadas y reparte el par "lat, lon" pegado en Latitud.
- **`abrirDialogoPersona`, ampliado (v0.66.0)**: suma "📅 Próximo contacto" y, solo al editar una persona existente, la lista de sus tareas **pendientes** asociadas (`tareasPendientesDe`, `persona_id` + no completada, ordenadas con `compararPorPrioridad`), cada una con un ✏️ que abre `abrirEdicionTarea` (de `modal-tarea.js`) encima. Si "Próximo contacto" cambió y no quedó vacío, al guardar reprograma con `reprogramarTareaConCascada` la `tarea_fecha_sugerida` de cada una de esas tareas a esa fecha y avisa cuántas se movieron.

## `views/configuraciones.view.js`

- **`renderVistaConfiguraciones(contenedor)`**: sección "Agenda y Calendar" (franja horaria para buscar horarios libres, desde/hasta; se guarda al cambiar y no acepta un inicio posterior al fin), "🎨 Apariencia" (interruptor de tema, ver `obtenerTema`/`establecerTema` de `app.js`), "Tiempo disponible" (`conectarSeccionTiempo`: tope por día de hasta 1440 minutos, horizonte, interruptores de eventos que se ignoran y lista de calendarios; guarda cada cambio con `guardarPreferencias(..., { sinNotificar: true })`), Exportar JSON, Importar JSON (con confirmación) y "Borrar todos los datos" (`borrarTodosLosDatos` de `almacenamiento.js`), que pide una confirmación y luego escribir BORRAR.

## `assets/js/modal-tarea.js`


- **`copiaDeTarea(origen, { vaciarNombre })`** (v0.64.0): copia los campos "de contenido" de una tarea (para Duplicar y Crearle previa/posterior de `views/tareas.view.js`) sin metadatos de sistema ni enlaces (`tarea_dependiente`, `tarea_desencadenante`); con `vaciarNombre` deja nombre y descripción vacíos.
- **`abrirAltaTarea(origen, { previaId, proximaId })`**: ventana "Nueva tarea" con el formulario compartido. "Agregar y cargar otra" va primero en el DOM (lo dispara Enter): agrega, regenera las opciones de "Depende de"/"Bloquea a" (para poder elegir la tarea recién creada) y deja la ventana vacía con el cursor en el nombre; "Agregar" agrega y cierra. Con `origen` (v0.64.0) precarga el formulario con esos datos; `previaId`/`proximaId` fuerzan la selección inicial de esos desplegables. Valida, crea la tarea, aplica los enlaces (un pedido contradictorio no crea la tarea ni limpia el formulario) y ofrece marcar la cadena de un anillo de mantenimiento. La abren el "＋" de la cabecera, la tecla N y el botón flotante de la vista Tareas.
Ventana modal de edición (`<dialog>` en `document.body`, sobrevive a los redibujados).

- **Interruptor "Completada" y "Limpiar campos"** (v0.59.0): al guardar la edición, si el interruptor cambió se aplica después de los campos con `cumplirTarea` (y luego `ofrecerExportarACalendar`) o `reabrirTarea` (avisando si conservó la copia), igual que el desplegable de estado de Tareas. En el alta, "🧹 Limpiar campos" (junto a los botones de guardado) pide confirmación y usa `vaciarFormularioTarea`; como el formulario vacío coincide con el estado inicial, después no se pregunta si descartar.
- **`abrirEdicionTarea(id)`** (sobre `abrirDialogoFormulario`): la abre encima de la vista actual (Tareas, Tabla, Gantt o Semana) con el formulario compartido. Esc y el clic afuera pasan por la confirmación "Hay cambios sin guardar. ¿Descartarlos?" solo si el formulario cambió. Al guardar: si la tarea se eliminó mientras se editaba, avisa y cierra; si su `tarea_modificado_en` cambió desde que se abrió (cambio de otro dispositivo), pide confirmar que se pisan esos cambios; valida el nombre y los enlaces; aplica los campos y `aplicarEnlace`, y persiste.

## `assets/js/carga-tareas.js`

"Completar carga de tareas": ventana con las tareas que quedaron solo con nombre.

- **`abrirCargaTareas()`**: lista, cada una con el formulario compartido, las tareas de `tareasSoloConNombre`, con "Actualizar" (mismas validaciones que la edición) y "Dejar así" (`tarea_carga_completa = true`). Tras cada acción redibuja la lista conservando lo escrito en las demás tarjetas (`borradores.js`, con un `id` por formulario).

## `views/tabla.view.js`

(Antes "Todas", `views/todas.view.js`; renombrada en v0.53.2. La ruta vieja `#/todas` sigue llevando a esta vista.)

Vista de referencia y auditoría: todas las tareas (de cualquier estado), con filtros y orden por columna.

- **`renderVistaTabla(contenedor)`**: por defecto ordena por `compararPorPrioridad` (el orden real de la app), para detectar de un vistazo si algo quedó mal priorizado. Filtros de categoría (inclusivo de descendientes, vía `idsCategoriaYDescendientes`), estado, importancia, **persona** (v0.66.0) y buscador por nombre. Clic en un header de columna cambia el orden a esa columna sola (`COMPARADORES`), con toggle asc/desc y un botón "↺ Prioridad" para volver al orden por defecto. Clic en una fila abre esa tarea en edición en Tareas.
- **`COLUMNAS` / `columnasVisibles()` / `abrirSelectorColumnas()`**: las 21 columnas posibles (cada una con su `valor` y su `comparar`, incluida `persona` desde la v0.66.0), las visibles según la preferencia `super-todo-list:tabla-columnas` (por defecto nombre, categoría con su cadena completa, importancia, estado, fecha y holgura) y el diálogo "Columnas" con una casilla por columna.
- **`idsCategoriaYDescendientes(categoriaId, categorias)`**: IDs de una categoría y todas sus descendientes, recorriendo `categoria_padre_id` hacia abajo — a diferencia del filtro de categoría de Tareas (que compara `categoria_id` exacto), este es inclusivo de descendientes.
- **`crearPanelVersus(contenedorVista)`**: panel toggleable (botón "⚔️ Versus") que ofrece de a un par de tareas empatadas (`construirClusteres`/`proximoParVersus`, sobre `esTareaAccionable`) para que el usuario elija cuál prefiere, o las omita. Ver `REGLAS_DE_PRIORIDAD.md` para el mecanismo completo (asignación de `tarea_prioridad_manual`, por qué "omitir" no asigna nada).

## `views/categorias.view.js`

ABM de categorías, un árbol (Subcategoria ya no existe como entidad separada).

- **`renderVistaCategorias(contenedor)`**: botón flotante "＋" (abre `abrirDialogoCategoria`) y la lista renderizada como árbol recursivo (`arbolCategorias`), saltando las ramas colapsadas (`colapsados`, un `Set` de la sesión, expandido por defecto).
- **`renderCategoria(categoria, profundidad, tieneHijas, colapsada, redibujar)`**: tarjeta indentada según su profundidad, con ▸/▾ para colapsar (solo si tiene hijas), ▲/▼ para reordenar entre **hermanos** (mismo `categoria_padre_id`; `intercambiarPrioridad` intercambia `categoria_prioridad`), "➕ Agregar categoría hija" (`abrirDialogoCategoria({ padreIdInicial })`), "Editar" (`abrirDialogoCategoria({ id })`) y eliminar (las hijas se promueven a raíz y las tareas asociadas quedan sin categoría).

## `views/ubicaciones.view.js`

- **`renderVistaUbicaciones(contenedor)` / `renderUbicacion(ubicacion)`**: botón "＋ Nueva ubicación" y tarjetas con "Editar" (nombre + latitud + longitud). Al eliminar, las tareas que la referenciaban quedan con `ubicacion_id: null`.

## `views/metas.view.js`

ABM de metas, con progreso calculado al vuelo y los flujos de IA conectable.

- **`renderVistaMetas(contenedor)` / `renderMeta(meta)`**: botón "＋ Nueva meta" y tarjeta (con "Editar") con progreso (tareas con `meta_id` igual a esta meta, completadas vs. total).
- **`crearPanelIA(meta)`**: flujo de copiar/pegar para sugerir subtareas, con preview antes de confirmarlas.
- **`crearPanelChatMeta(contenedorPanel)`**: flujo conversacional para definir una meta desde cero.

## `assets/js/gantt-modelo.js`

Lógica pura (sin DOM) del Gantt, en días locales.

- **`habilitadaReal(tarea)`**: el día de `tarea_fecha_inicio_habilitada` solo si difiere de `tarea_creada_en` (por defecto vale la creación, que no cuenta como fecha real); vacío si no.
- **`calcularPosiciones(estado, { hoy, agruparPor })`**: `Map(tarea_id → { dia, virtual, completada })`. Con `tarea_fecha_sugerida`: ese día. Sin sugerida y sin previa: cola del carril (`carrilDe`) ordenada con `compararPorPrioridad`, una por día desde hoy y no antes de `habilitadaReal`; sin sugerida y con previa: el día siguiente al de su previa (real o estimado, mínimo hoy; con protección ante ciclos). Las completadas, en el día de `tarea_fecha_fin`. Se calcula sobre todas las tareas, antes de filtrar.
- **`calcularVentana(tarea, hoy)`**: `{ inicio, fin, vencida }` desde hoy (o la habilitada real) hasta el límite; si el límite pasó, del límite a hoy y `vencida`; sin límite, `null`.
- **`aplicarFiltros(tareas, filtros, estado)`**: categoría (con `descendientesDeCategoria`), meta, estado (`activas`, `pendientes`, `bloqueadas`, `completadas`, `todas`) y texto sin distinguir mayúsculas ni acentos.
- **`construirFilas(estado, { filtros, agruparPor, hoy })`**: separadores `{ carril }` (categoría raíz, meta o ninguno) y filas `{ tarea, plan, ventana, limite, noLlega }` ordenadas por día y prioridad.
- **`calcularConexiones(filas, estado)`**: flechas `cadena` (previa → próxima; `invertida` si la próxima cae antes) y `anillo` (desde la instancia vigente del desencadenante).

## `views/gantt.view.js`

Vista Gantt.

- **`renderVistaGantt(contenedor)`**: controles (interruptor Plan | Ventana, escala 2 · 4 · 12 semanas, "Hoy", "Agrupar por" y filtros) y la leyenda. Modo, escala y agrupación se guardan en `localStorage` (`super-todo-list:gantt-*`); los filtros viven en variables del módulo, igual que el desplazamiento (que se conserva al redibujar).
- **`dibujarGrilla(...)`**: calcula la geometría numéricamente (`anchoDia` = ancho visible ÷ semanas × 7, mínimo 6 px; rango desde 7 días antes de hoy hasta la fecha más lejana, mínimo 12 semanas, tope un año) y dibuja cabecera fija, carriles, filas, barras, marcas (⚑ límite, ◆ día plan), línea de hoy y flechas (`dibujarFlechas`, SVG).
- **`conectarInteracciones(...)`**: arrastre con umbral de 4 px. Sin mover, abre `abrirEdicionTarea`; en Plan mover la barra llama a `reprogramarTareaConCascada` (conserva la hora) y avisa si queda antes de su previa; en Ventana los bordes cambian habilitada y límite; "📌" guarda el día estimado como fecha sugerida.

## `views/personas.view.js`

- **`renderVistaPersonas(contenedor)`**: botón flotante "＋" y la lista, ordenada de mayor a menor tiempo sin contacto.
- **`renderPersona(persona)`**: tarjeta con "Editar" (ver `abrirDialogoPersona`, ampliado en la v0.66.0), "Marcar contacto hoy" y, si tiene `persona_proximo_contacto`, su etiqueta. Al eliminar, las tareas que la referenciaban quedan con `persona_id: null` (mismo patrón que categorías/ubicaciones/metas).

## `views/estadisticas.view.js`

(Antes "Informes", `views/informes.view.js`; renombrada en v0.55.0. `#/informes` sigue llevando a esta vista.)

Tiene tres solapas internas (`SOLAPAS`; la activa se recuerda mientras la página está abierta): **Resumen**, **Progreso por categoría** (`views/progreso.view.js`) y **Hábitos** (`views/habitos.view.js`). Todo se calcula al vuelo, sin histórico propio.

- **`calcularPorCategoria(desde)`**: completadas en la ventana vs. pendientes actuales (`ESTADOS_ACTIVOS = ['bloqueada', 'pendiente']`), por categoría.
- **`calcularProyeccionCostos()`**: suma de `tarea_costo_estimado` de las tareas pendientes activas.
- **`calcularThroughputSemanal()`**: 8 barras semanales: las 2 últimas semanas (bloques de 7 días que terminan hoy) con las tareas completadas según `tarea_fecha_fin`, y las 6 próximas (bloques de 7 días desde mañana) con las tareas sin completar cuya `fechaDeReferencia` (sugerida > límite) cae en cada bloque.
- **`renderResumen(contenedor)`** (privada): Completadas vs. pendientes / Costos / Throughput semanal. **`renderVistaEstadisticas(contenedor)`**: dibuja el título, la barra de solapas y delega en la activa.

## `assets/js/habitos.js`

Lógica pura (sin DOM) del mapa de hábitos. Un hábito es una tarea de mantenimiento identificada por su nombre; su historial son los `Cumplimiento`.

- **`calcularHabito(nombre, estado, { dias, hasta })`**: la fila de un hábito: `celdas` (`{ dia, estado, titulo }` con `ESTADOS_CELDA`: cumplido, incumplido, vence, no-aplica), `racha` y `porcentaje` (`null` si nada tocaba). Cada día toma el intervalo y los días hábiles del último cumplimiento hasta entonces (después del último, los de la repetición abierta). Diario: ✗ en los días hábiles posteriores al primer registro y anteriores a hoy sin cumplimiento. No diario: ✗ en el vencimiento esperado que se cumplió tarde o sigue vencido. `hasta` (hoy por defecto) es el último día y todavía está en curso.
- Un hábito **terminado** (`terminado: true`) es el que tiene cumplimientos y ninguna repetición abierta (la última copia no se creó porque llegó su fin: ver `fechaFinDeRepeticion`): los días posteriores a su último cumplimiento quedan "no aplica" y la racha y el porcentaje se calculan hasta ese día. `views/habitos.view.js` lo marca con "✔ terminado".
- **`calcularMapaHabitos(estado, opciones)`**: una fila por cada nombre de tarea de mantenimiento con cumplimientos, más las que solo tienen la repetición abierta.
- **`calcularMapaCategorias(estado, opciones)`**: por categoría raíz con cumplimientos, la cantidad de cumplimientos de cada día (de la categoría o de sus descendientes) y `diasActivos`.

## `assets/js/progreso-categorias.js`

- **`calcularMetricas(tareas, hoy)`**: restantes vs. completadas, vencidas y, entre las sin completar con fecha vigente, la próxima fecha límite, la próxima fecha sugerida y la última fecha límite (`{ tarea, dias }`).
- **`calcularProgresoPorCategoria(estado, hoy)`**: una tarjeta por categoría raíz (suma toda su rama con `descendientesDeCategoria`) con sus subcategorías, y una tarjeta "sin categoría" al final.

## `views/habitos.view.js`, `views/progreso.view.js`, `views/mejoras.view.js`

- **`renderVistaHabitos`**: selector 7 · 30 · 90 días (`super-todo-list:habitos-dias` en `localStorage`), matriz de hábitos y matriz de actividad por categoría, con la leyenda; la matriz se desplaza hacia el costado y arranca en el final (hoy).
- **`renderVistaProgreso`**: tarjetas con las métricas de `progreso-categorias.js` y el desplegable de subcategorías.
- **`renderVistaMejoras`**: filtro Pendientes / Aplicadas / Todas (variable del módulo), notas agrupadas por nombre de tarea; "Marcar aplicada" / "Volver a pendiente" (`mejora_aplicada`), "Editar" (diálogo con un `textarea`; busca la nota por id al guardar) y "Eliminar" (saca la nota de `estado.mejoras`).

## `sw.js`

Service worker de la PWA — estrategia network-first.

- **`install`**: precachea el app shell completo (`ARCHIVOS_PRECACHE`) con `{ cache: 'reload' }` para evitar que el CDN sirva una copia vieja.
- **`activate`**: borra cualquier caché con un nombre distinto al `CACHE_NAME` actual (se bumpea en cada entrega que cambie archivos del shell).
- **`fetch`**: red primero, cae a caché si falla (sin conexión).
