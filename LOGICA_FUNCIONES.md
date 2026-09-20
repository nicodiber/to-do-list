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
- **Atajo de teclado "N"**: un listener global de `keydown` que, si no hay modificadores (`Ctrl`/`Alt`/`Meta`) y el foco no está en un campo editable (`INPUT`/`TEXTAREA`/`SELECT`/`contentEditable`), navega a la vista Tareas (si no se está ya ahí) y enfoca el nombre del formulario de alta (`#form-alta input[name="tarea_nombre"]`); no hace nada si no hay datos listos o es una pestaña de solo lectura. Usa un flag módulo (`enfocarAltaRapidaAlEntrar`) para enfocar recién después de que el cambio de hash haya disparado el re-render de la vista.
- **Tema claro/oscuro**: `temaEfectivo()`/`aplicarTema()` leen/aplican la preferencia guardada en `localStorage` (una preferencia, nunca datos de tareas), con fallback a `prefers-color-scheme` del sistema.
- **Reprogramado automático al iniciar** (`reprogramarSiCorresponde()`): una sola vez, cuando los datos ya están listos (después de `inicializarAlmacenamiento()` o de conectar), se llama `reprogramarFechasSugeridasVencidas(estado.tareas)` (`tareas-logica.js`) y, si afectó alguna tarea, se persiste y se avisa con un `alert()`. Ver `REGLAS_DE_PRIORIDAD.md`.
- Wiring de los botones de la cabecera (sincronizar ahora, exportar/importar JSON, tema) hacia `almacenamiento.js`.
- Al final, llama `inicializarAlmacenamiento()` y registra el service worker (`sw.js`).

## `assets/js/almacenamiento.js`

Estado en memoria, sincronización con Google Drive y migración de datos.

- **`estado`**: objeto exportado con las 7 colecciones de la app (`categorias`, `ubicaciones`, `metas`, `personas`, `tareas`, `mejoras`, `cumplimientos`). Es la única fuente de verdad en memoria; todas las vistas lo mutan directamente y después llaman `persistirYNotificar()`.
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

- **`COLECCIONES`**: configuración de las 7 colecciones (clave de id, campo de sello `*_modificado_en`, campo de nombre para los avisos, etiqueta).
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

- **`crearCategoria`, `crearUbicacion`, `crearPersona`, `crearMeta`, `crearTarea`, `crearMejora`, `crearCumplimiento`**: una factory por entidad (`crearCumplimiento` recibe la tarea cumplida y la fecha). Reciben los campos propios de la entidad (con sus defaults) y devuelven el objeto completo, generando `entidad_id` con `generarId()`. `crearTarea` calcula `tarea_creada_en` una sola vez y la usa también como default de `tarea_fecha_inicio_habilitada` si no se pasó una.
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
- **`textoHolgura(dias)`**: texto legible de una holgura ya calculada (ver `calcularHolguraDias` en `tareas-logica.js`) — "Vencida hace N días" / "Vence hoy" / "Quedan N días". Compartido entre `views/hoy.view.js` y `views/tabla.view.js`.
- **`escaparHtml(texto)`**: sanitiza texto libre antes de insertarlo en `innerHTML`.

## `assets/js/tareas-logica.js`

Lógica de negocio central sobre tareas: mantenimiento cíclico, bloqueo por dependencia, prioridad (ver `REGLAS_DE_PRIORIDAD.md` para el detalle de orden, no repetido acá).

- **`calcularProximaFechaMantenimiento(desdeISODatetime, intervalo)`**: dado un `tarea_mantenimiento_intervalo` (`{ cantidad, unidad }`) y una fecha de referencia, calcula la próxima `tarea_fecha_limite`.
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

- **`soportaGoogleCalendar()` / `hayConexionGoogleCalendar()`**: `hayConexionGoogleCalendar` es verdadero si hay token y el usuario concedió el scope de Calendar.
- **`obtenerEventosDeHoy()`**: trae los eventos del día actual, con caché en memoria por día.
- **`calcularSolapamiento(tarea, eventos)`**: compara la ventana `[tarea_fecha_sugerida (con hora), +tarea_duracion_min]` contra cada evento y devuelve el primero que se superpone (usado en Hoy).

## `assets/js/ubicacion-actual.js`

- **`obtenerUbicacionActual()` / `establecerUbicacionActual(idUbicacion)`**: preferencia de "¿dónde estás?" compartida entre Hoy, Tareas y 3/8 días, en una clave propia de `localStorage` (preferencia de sesión, no dato de la app).

---

## `views/hoy.view.js`

Vista "Hoy": separa tareas urgentes del resto (ver `REGLAS_DE_PRIORIDAD.md`), con un asistente de cierre por tarjeta.

- **`renderVistaHoy(contenedor)`**: arma las secciones Urgentes / Resto (con el apartado "Elegí por categoría" vía `mejorTareaPorCategoria`) / Todavía no pueden empezar / Bloqueadas, filtradas por la ubicación actual. `bloqueadas` y `accionables` se separan directamente por `tarea_estado`.
- **`renderItem(tarea, opciones)`**: tarjeta de una tarea con sus badges (importancia, categoría, fechas, holgura, estado, ubicación, costo, clima, solapamiento con Calendar). Si es accionable, agrega los botones "Cumplida"/"No cumplida" (sin pedir duración/costo real — se eliminaron de la app); si además está vencida, agrega "📅 Revalorizar fecha límite" (reusa `crearPanelReprogramar`, pero escribe directo `tarea.tarea_fecha_limite` sin cascada a dependientes — ver `REGLAS_DE_PRIORIDAD.md`).

## `views/agenda.view.js`

Vista "Agenda" (unifica las antiguas "3 días" y "8 días"): **`renderVistaAgendaConSelector(contenedor)`** llama a `renderVistaAgenda` con la cantidad de días guardada (3, 8 o 15; por defecto 8) en `localStorage` (`super-todo-list:agenda-dias`, una preferencia de UI).

## `views/semana.view.js`

Vista "Semana": grilla horaria de 7 días (07:00-23:00) con tareas fijas y proyectadas.

- **`renderVistaSemana(contenedor)`**: arma la grilla, ajustada al ancho de la pantalla (columnas `minmax(0, 1fr)`, sin desplazamiento lateral). En pantallas angostas (`matchMedia` ≤ 640 px) muestra 3 días (4 desde 480 px) con flechas ‹ › (`primerDiaVisible`) y se redibuja al cambiar el ancho.
- **`renderColumnaDia(fechaDia, hoy)`**: separa tareas "fijas" (`tarea_fecha_sugerida` con hora ese día) de "proyectadas" (accionables sin hora en `tarea_fecha_sugerida`, cuya fecha de referencia cae ese día, apiladas por prioridad).
- **`renderBloqueTarea(...)` / `agregarAsasArrastre(...)`**: cada bloque tiene asas arrastrables (Pointer Events) para modificar `tarea_fecha_sugerida` (agregándole/cambiándole la hora)/`tarea_duracion_min` directamente desde la grilla, en pasos de 15 minutos.

## `views/tareas.view.js`

La vista más grande: alta de tareas, filtros, lista y el panel de IA.

- **`renderVistaTareas(contenedor)`**: botón "＋ Nueva tarea" (abre `abrirAltaTarea`), los filtros y la lista. Orden: pendientes → bloqueadas (por prioridad dentro de cada grupo) y, al final, las completadas plegadas en un `<details class="completadas-plegadas">` "Completadas (N)" que recuerda si estaba abierto (y se muestra abierto con el filtro Estado = Completada).
- **`renderTarea(tarea)`**: tarjeta con el borde izquierdo del color de la categoría (`--color-categoria`), etiqueta "⚠️ Vencida" y fondo rojizo si está vencida, los badges, el checklist con casillas que se tildan ahí mismo (persiste al tildar) y las acciones (cambiar estado — solo `pendiente`/`completada` —, posponer, editar, eliminar). "Editar" abre `abrirEdicionTarea`; completar usa `cumplirTarea`, volver a pendiente `reabrirTarea` y eliminar `eliminarTarea`.
- **`crearPanelIAPrioridades()`**: UI del flujo de copiar/pegar con IA para reestructurar `tarea_importancia` de las tareas accionables.

## `assets/js/formulario-tarea.js`

Formulario de tarea compartido por el alta, la ventana de edición y "Completar carga de tareas" (antes había tres copias).

- **`htmlFormularioTarea(tarea | null, { modo, botonesNombre, botonesPie })`**: nombre arriba (con autocompletado por nombre solo en el alta) y debajo todos los campos: categoría, importancia, disfrute, los 3 pares fecha+hora, duración, costo, descripción, ubicación, meta, "depende de (tarea previa)" y "bloquea a (tarea próxima)" (`opcionesPrevia`/`opcionesProxima`), clima, mantenimiento con intervalo, desencadenante y checklist editable, y días hábiles. También exporta los helpers de opciones (`htmlOpcionesCategoria`, etc.) y `tareasUnicasPorNombre`.
- Los desplegables de categoría, ubicación y meta terminan con "＋ Crear nueva…" (`htmlOpcionesCategoria`/`htmlOpcionesUbicacion`/`htmlOpcionesMeta`): al elegirla se vuelve al valor anterior, se abre el diálogo de esa entidad y, al guardarla, el desplegable se reconstruye con la nueva seleccionada por propiedad (así el borrador del alta la conserva).
- **`ofrecerMarcarCadenaMantenimiento(tarea, lista)`**: si la tarea tiene desencadenante y su cadena tiene tareas que no son de mantenimiento (`tareasDeLaCadenaNoRepetibles`), avisa cuáles y ofrece marcarlas con el mismo intervalo; nada cambia sin confirmar.
- **`nombreConCategoria(tarea)`**: nombre de la tarea con su categoría ("Revisar · Casa"), para los desplegables y las tarjetas, porque dos tareas distintas pueden llamarse igual.
- **`conectarFormularioTarea(formulario, { modo })`**: pone en mayúscula la primera letra del nombre mientras se escribe, muestra u oculta lo de mantenimiento, agrega/quita pasos del checklist (Enter en un paso agrega otro en vez de enviar) y, en el alta, precarga los demás campos cuando el nombre coincide exacto con una tarea existente, **sin pisar lo que el usuario ya cargó** (solo completa campos que siguen como estaban o que la propia precarga había completado).
- **`leerFormularioTarea(formulario)`**: devuelve `{ campos, previaId, proximaId }`; **`aplicarCamposATarea(tarea, campos)`** los aplica a una tarea existente.
- **`validarFormularioTarea(leido, tareaId)`**: antes de cambiar nada, rechaza un desencadenante combinado con una tarea previa y, si la tarea ya existe, valida los enlaces con `evaluarEnlace`. **`firmaFormulario(formulario)`**: texto que identifica el contenido, para detectar cambios sin guardar.

## `assets/js/dialogo-formulario.js`

Ventana modal genérica para un formulario (tareas, categorías, ubicaciones, metas, personas).

- **`activarMayusculaInicial(campo)`**: la primera letra de un campo de texto se escribe siempre en mayúscula, sin mover el cursor (nombres de tareas, categorías, ubicaciones, metas y personas; también se aplica en las funciones `crearXxx` de `modelos.js`).
- **`abrirDialogoFormulario({ titulo, cuerpoHtml, textoGuardar, botonesGuardar, conectar, alGuardar, alCerrar })`** (con `botonesGuardar` hay varios botones de guardado; `alGuardar` recibe cuál se apretó y una función `reiniciarFirma`): cada llamada crea su propio `<dialog>` en `document.body` (se pueden apilar) y lo quita al cerrar, sin depender del evento `close`. `alGuardar(formulario)` devuelve `true` para cerrar o `false` para dejarla abierta. Esc, el clic afuera (solo si empezó y terminó afuera) y "Cancelar" preguntan "¿Descartarlos?" solo si el formulario cambió (`firmaFormulario`).

## `assets/js/formularios-entidades.js`

Crear y editar categorías, ubicaciones, metas y personas: **`abrirDialogoCategoria` / `abrirDialogoUbicacion` / `abrirDialogoMeta` / `abrirDialogoPersona`** (`{ id, alCrear }`). Con `id` editan; sin `id` crean y llaman `alCrear(nueva)` antes de guardar, para que quien la pidió (el desplegable de una tarea) la seleccione. La categoría excluye de su desplegable de padre a sí misma y sus descendientes (`descendientesDeCategoria`) y, al cambiar de padre, queda al final de sus nuevas hermanas. La ubicación valida los rangos de las coordenadas y reparte el par "lat, lon" pegado en Latitud.

## `views/configuraciones.view.js`

- **`renderVistaConfiguraciones(contenedor)`**: Exportar JSON, Importar JSON (con confirmación) y "Borrar todos los datos" (`borrarTodosLosDatos` de `almacenamiento.js`), que pide una confirmación y luego escribir BORRAR.

## `assets/js/modal-tarea.js`


- **`abrirAltaTarea()`**: ventana "Nueva tarea" con el formulario compartido. "Agregar y cargar otra" va primero en el DOM (lo dispara Enter): agrega y deja la ventana vacía con el cursor en el nombre; "Agregar" agrega y cierra. Valida, crea la tarea, aplica los enlaces (un pedido contradictorio no crea la tarea ni limpia el formulario) y ofrece marcar la cadena de un anillo de mantenimiento. La abren el "＋" de la cabecera, la tecla N y el botón de la vista Tareas.
Ventana modal de edición (`<dialog>` en `document.body`, sobrevive a los redibujados).

- **`abrirEdicionTarea(id)`** (sobre `abrirDialogoFormulario`): la abre encima de la vista actual (Tareas, Tabla, Gantt o Semana) con el formulario compartido. Esc y el clic afuera pasan por la confirmación "Hay cambios sin guardar. ¿Descartarlos?" solo si el formulario cambió. Al guardar: si la tarea se eliminó mientras se editaba, avisa y cierra; si su `tarea_modificado_en` cambió desde que se abrió (cambio de otro dispositivo), pide confirmar que se pisan esos cambios; valida el nombre y los enlaces; aplica los campos y `aplicarEnlace`, y persiste.

## `assets/js/carga-tareas.js`

"Completar carga de tareas": ventana con las tareas que quedaron solo con nombre.

- **`abrirCargaTareas()`**: lista, cada una con el formulario compartido, las tareas de `tareasSoloConNombre`, con "Actualizar" (mismas validaciones que la edición) y "Dejar así" (`tarea_carga_completa = true`). Tras cada acción redibuja la lista conservando lo escrito en las demás tarjetas (`borradores.js`, con un `id` por formulario).

## `views/tabla.view.js`

(Antes "Todas", `views/todas.view.js`; renombrada en v0.53.2. La ruta vieja `#/todas` sigue llevando a esta vista.)

Vista de referencia y auditoría: todas las tareas (de cualquier estado), con filtros y orden por columna.

- **`renderVistaTabla(contenedor)`**: por defecto ordena por `compararPorPrioridad` (el orden real de la app), para detectar de un vistazo si algo quedó mal priorizado. Filtros de categoría (inclusivo de descendientes, vía `idsCategoriaYDescendientes`), estado, importancia y buscador por nombre. Clic en un header de columna cambia el orden a esa columna sola (`COMPARADORES`), con toggle asc/desc y un botón "↺ Prioridad" para volver al orden por defecto. Clic en una fila abre esa tarea en edición en Tareas.
- **`COLUMNAS` / `columnasVisibles()` / `abrirSelectorColumnas()`**: las 20 columnas posibles (cada una con su `valor` y su `comparar`), las visibles según la preferencia `super-todo-list:tabla-columnas` (por defecto nombre, categoría con su cadena completa, importancia, estado, fecha y holgura) y el diálogo "Columnas" con una casilla por columna.
- **`idsCategoriaYDescendientes(categoriaId, categorias)`**: IDs de una categoría y todas sus descendientes, recorriendo `categoria_padre_id` hacia abajo — a diferencia del filtro de categoría de Tareas (que compara `categoria_id` exacto), este es inclusivo de descendientes.
- **`crearPanelVersus(contenedorVista)`**: panel toggleable (botón "⚔️ Versus") que ofrece de a un par de tareas empatadas (`construirClusteres`/`proximoParVersus`, sobre `esTareaAccionable`) para que el usuario elija cuál prefiere, o las omita. Ver `REGLAS_DE_PRIORIDAD.md` para el mecanismo completo (asignación de `tarea_prioridad_manual`, por qué "omitir" no asigna nada).

## `views/categorias.view.js`

ABM de categorías, un árbol (Subcategoria ya no existe como entidad separada).

- **`renderVistaCategorias(contenedor)`**: botón "＋ Nueva categoría" (abre `abrirDialogoCategoria`) y la lista renderizada como árbol recursivo (`arbolCategorias`).
- **`renderCategoria(categoria, profundidad)`**: tarjeta indentada según su profundidad, con ▲/▼ para reordenar entre **hermanos** (mismo `categoria_padre_id`; `intercambiarPrioridad` intercambia `categoria_prioridad`), "Editar" (`abrirDialogoCategoria({ id })`) y eliminar (las hijas se promueven a raíz y las tareas asociadas quedan sin categoría).

## `views/ubicaciones.view.js`

- **`renderVistaUbicaciones(contenedor)` / `renderUbicacion(ubicacion)`**: botón "＋ Nueva ubicación" y tarjetas con "Editar" (nombre + latitud + longitud). Al eliminar, las tareas que la referenciaban quedan con `ubicacion_id: null`.

## `views/metas.view.js`

ABM de metas, con progreso calculado al vuelo y los flujos de IA conectable.

- **`renderVistaMetas(contenedor)` / `renderMeta(meta)`**: botón "＋ Nueva meta" y tarjeta (con "Editar") con progreso (tareas con `meta_id` igual a esta meta, completadas vs. total).
- **`crearPanelIA(meta)`**: flujo de copiar/pegar para sugerir subtareas, con preview antes de confirmarlas.
- **`crearPanelChatMeta(contenedorPanel)`**: flujo conversacional para definir una meta desde cero.

## `views/gantt.view.js`

Diagrama de Gantt por Meta.

- **`renderVistaGantt(contenedor)`**: filtro por meta (o todas, vía `tareasDeMeta` que compara `t.meta_id === metaId`), arma las filas y llama `renderGrillaGantt` + `renderFlechasDependencia`.
- **`renderGrillaGantt(filas)`**: calcula el rango de fechas visible y dibuja una fila por tarea, con asas de arrastre (`agregarAsasGantt`) para modificar `tarea_fecha_inicio_habilitada`/`tarea_fecha_limite`.
- **`renderFlechasDependencia(grilla, filas)`**: dibuja una flecha SVG por cada tarea con `tarea_dependiente` visible en el filtro actual (relación uno-a-uno, ya no hay múltiples bloqueantes por tarea).

## `views/personas.view.js`

- **`renderVistaPersonas(contenedor)`**: botón "＋ Nueva persona" y la lista, ordenada de mayor a menor tiempo sin contacto.
- **`renderPersona(persona)`**: tarjeta con "Editar" (nombre y último contacto) y "Marcar contacto hoy".

## `views/estadisticas.view.js`

(Antes "Informes", `views/informes.view.js`; renombrada en v0.55.0. `#/informes` sigue llevando a esta vista.)

Métricas calculadas al vuelo sobre `estado.tareas`, sin histórico propio guardado.

- **`calcularPorCategoria(desde)`**: completadas en la ventana vs. pendientes actuales (`ESTADOS_ACTIVOS = ['bloqueada', 'pendiente']`), por categoría.
- **`calcularProyeccionCostos()`**: suma de `tarea_costo_estimado` de las tareas pendientes activas.
- **`calcularThroughputSemanal()`**: 8 barras semanales: las 2 últimas semanas (bloques de 7 días que terminan hoy) con las tareas completadas según `tarea_fecha_fin`, y las 6 próximas (bloques de 7 días desde mañana) con las tareas sin completar cuya `fechaDeReferencia` (sugerida > límite) cae en cada bloque.
- **`renderVistaEstadisticas(contenedor)`**: arma las secciones Completadas vs. pendientes / Costos (proyección de pendientes) / Throughput semanal. Ya no incluye comparación de duración/costo real vs. estimado (esos campos se eliminaron del modelo).

## `sw.js`

Service worker de la PWA — estrategia network-first.

- **`install`**: precachea el app shell completo (`ARCHIVOS_PRECACHE`) con `{ cache: 'reload' }` para evitar que el CDN sirva una copia vieja.
- **`activate`**: borra cualquier caché con un nombre distinto al `CACHE_NAME` actual (se bumpea en cada entrega que cambie archivos del shell).
- **`fetch`**: red primero, cae a caché si falla (sin conexión).
