# Changelog

Formato de versión: `vMayor.Menor.Parche` (semver).

## [v0.53.1] - 2026-09-19

Ajustes surgidos de la validación manual de las Rondas 2 y 3.

### Agregado

- **Las tarjetas de la vista Tareas muestran los enlaces sin entrar a editar**: "⛓️ Bloqueada por: …", "⬅️ Depende de: …" y "➡️ Bloquea a: …" (los nombres llevan la categoría, porque dos tareas distintas pueden llamarse igual).
- **La categoría acompaña al nombre en los desplegables** de tarea previa, tarea próxima y desencadenante ("Revisar · Casa" / "Revisar · Trabajo").

### Cambiado

- **La primera letra del nombre de una tarea siempre queda en mayúscula**: se corrige mientras se escribe (sin mover el cursor) y también al crear o guardar (`capitalizarPrimera`, en `crearTarea` y en el formulario).
- **"Posponer" ya no aparece en las tareas completadas** (no tiene sentido posponer algo que ya se hizo).
- **Ventana de edición en celular**: ocupa toda la pantalla (`100dvh`), los campos se apilan a lo ancho y los botones Guardar/Cancelar quedan fijos abajo, porque en el celular quedaba cortada. Pendiente de validar en un celular real.

### Eliminado

- La etiqueta **"🎯 Foco 80/20"** de las tarjetas de Hoy y de Tareas (pedido del usuario; queda anotado en el backlog para analizar su uso, su automatización y una implementación futura). La función `calcularEnfoque8020` y la sección "Enfoque 80/20" de Informes se mantienen por ahora.

## [v0.53.0] - 2026-09-19

Ronda 3 del rediseño: **carga de tareas** (ver `REDISENO.md`, A2, A3 y "Cabecera y navegación").

### Agregado

- **Alta unificada**: un solo formulario con **un solo campo de nombre** (se acabó el cartel "Completa este campo" del segundo formulario). Con solo el nombre + Enter crea una tarea rápida; con más campos, la completa. Todos los campos son opcionales y visibles debajo, e incluyen ahora **meta**, **"depende de (tarea previa)" y "bloquea a (tarea próxima)"** (regla 1 a 1: si se elige una tarea ya enlazada se inserta en medio; si el pedido es contradictorio se rechaza explicando el conflicto y **no se crea la tarea ni se limpia el formulario**), **desencadenante** y **checklist** (para tareas de mantenimiento).
- **Botón "＋" fijo en la cabecera** (mismo efecto que el atajo "N": va a Tareas y enfoca el nombre); no aparece en la pantalla inicial ni en una pestaña de solo lectura.
- **"📝 Completar carga de tareas (X)"** en la cabecera, solo si X > 0: ventana con las tareas que quedaron solo con nombre, cada una con su formulario y los botones "Actualizar" y **"Dejar así"** (nuevo campo `tarea_carga_completa`, sincronizado con Drive).
- **Ventana modal de edición** (`assets/js/modal-tarea.js`): editar una tarea ya no mezcla el formulario de alta en la misma pantalla. Se abre desde Tareas, Todas, Gantt y Semana **sin cambiar de vista**. Esc o clic afuera preguntan "¿Descartar los cambios?" solo si hay cambios sin guardar; si la tarea se eliminó o cambió en otro dispositivo mientras estaba abierta, avisa (y pide confirmar antes de pisar los cambios ajenos).
- **Checklist**: se edita en el formulario (agregar y quitar pasos) y se tilda en la tarjeta de la vista Tareas.
- `assets/js/formulario-tarea.js`: formulario compartido (reemplaza las tres copias que había en `views/tareas.view.js`); `esTareaSoloConNombre`/`tareasSoloConNombre` en `assets/js/tareas-logica.js`.

### Cambiado

- La fila de cada tarea queda con **un solo "Editar"** (más Posponer y Eliminar): Dependencia y Meta pasan a ser campos del formulario y se eliminan sus paneles.
- El formulario de alta **conserva lo escrito** ante cualquier redibujado (acciones locales, filtros y cambios de otro dispositivo) y se limpia solo al agregar; `assets/js/borradores.js` gana el modo `soloEn` para no cambiar el comportamiento de los formularios de otras vistas.
- `sw.js`: `CACHE_NAME` a `v12` y precache de los módulos nuevos.

### Corregido

- Los campos de mantenimiento ("cada N días…", desencadenante, checklist) se mostraban siempre, aunque "Es tarea de mantenimiento" no estuviera marcado: el atributo `hidden` perdía contra el estilo `inline-flex`.

### Eliminado

- Los formularios `#form-alta-rapida` y `#form-nueva-tarea`, los paneles Dependencia, Meta y Editar de la fila, y `abrirEdicionAlEntrar` (Todas, Gantt y Semana abren la ventana de edición directamente).

## [v0.52.1] - 2026-09-19

### Corregido

- **La copia de una tarea de mantenimiento ahora hereda todos los atributos de la original** (pedido del usuario): además de nombre, categoría, duración, descripción, intervalo, costo, disfrute, desencadenante y checklist, la copia conserva `tarea_importancia`, `ubicacion_id`, `tarea_dias_habiles`, `tarea_requiere_clima_bueno` y `meta_id`, que antes se perdían al completar la tarea.

## [v0.52.0] - 2026-09-19

Ronda 2 del rediseño: **modelo de datos** (ver `REDISENO.md`). Fija la forma de lo que se guarda antes de cargar datos reales.

### Agregado

- **Tarea**: `tarea_exportada_calendar` (se marca al aceptar abrir la tarea en Calendar), `tarea_checklist` (`[{ texto, hecho }]`, solo tareas de mantenimiento; la copia nace destildada; todavía sin pantalla) y `tarea_desencadenante` (tarea que "activa" a una de mantenimiento: al completarla, su copia nace bloqueada por la instancia vigente del desencadenante, lo que permite sostener anillos A→B→C→D→A).
- **Entidades nuevas** `Mejora` (nota "¿cómo mejorar la próxima vez?" asociada al **nombre** de la tarea, independiente de las instancias) y `Cumplimiento` (registro liviano por cada tarea completada: nombre, categoría, fecha, vencimiento esperado y si era de mantenimiento; base del mapa de hábitos). Se sincronizan con Drive como el resto (`COLECCIONES`, sellos `*_modificado_en`, eliminados y mezcla). Van en el archivo de Drive y en Exportar JSON.
- **Dependencias 1 a 1** (`assets/js/dependencias.js`, nuevo): cada tarea bloquea a como máximo una tarea activa y es bloqueada por una (entre categorías distintas también). Elegir una tarea ya enlazada **inserta en medio** (P→A→N); pedidos contradictorios se rechazan explicando el conflicto. El panel "Dependencia" de Tareas ahora tiene "depende de (tarea previa)" y "bloquea a (tarea próxima)"; el panel "Editar" suma el desplegable "Se activa cuando se cumple (desencadenante)".
- `cumplirTarea`, `reabrirTarea` y `eliminarTarea` (`assets/js/tareas-logica.js`): la lógica de completar ya no está duplicada en Hoy, Tareas y "Revisar mi día". Al reabrir una tarea de mantenimiento se borra su copia si sigue sin tocar (si se modificó, se conserva y se avisa) y se deshace el cumplimiento. Al eliminar una tarea del medio de una cadena, se reconecta (P→N) y el desencadenante que la apuntaba pasa a su previa.
- **Reparación tras mezclar**: si dos dispositivos enlazan tareas de forma incompatible con la regla 1 a 1 (o forman un ciclo), se conserva el enlace de la tarea más antigua, se sueltan los demás y se deja un aviso.

### Cambiado

- `recalcularBloqueo` y `puedeAgregarDependencia` se movieron a `dependencias.js` (se reexportan desde `tareas-logica.js`).
- Al arrancar, la base de la mezcla con Drive se normaliza igual que la copia local y la remota, para no generar diferencias falsas por los campos nuevos.
- `sw.js`: `CACHE_NAME` a `v11` y precache de `dependencias.js`.

### Documentación

- Actualizados `DICCIONARIO_DE_DATOS.md`, `datos/esquema.json`, `LOGICA_FUNCIONES.md`, `PROCESOS_AUTOMATICOS.md` (1, 3, 15, 16), `CASOS_DE_USO.md` (A4), `REDISENO.md`, `BACKLOG.md` y `README.md`. Los datos existentes no se migran ni se reparan: los campos nuevos toman su valor por defecto, y las dependencias viejas que rompan la regla 1 a 1 quedan como están (el usuario recrea sus datos).

## [v0.51.4] - 2026-09-19

### Corregido

- **Se perdía lo que estabas escribiendo cuando llegaban cambios de otro dispositivo** (hallado al validar: el campo "Agregar tarea rápido" quedaba vacío tras aplicar los cambios, tanto al hacer clic fuera como con el botón "Actualizar"). Al aplicar cambios remotos la vista se redibuja entera y vaciaba los formularios a medio completar. Nuevo módulo `assets/js/borradores.js`: antes de redibujar guarda los campos que el usuario ya tocó (y cuál tenía el foco) y los vuelve a poner después. Solo se usa para cambios que vienen de otro dispositivo (`notificar({ conservarBorradores: true })`); los redibujados locales siguen limpiando el formulario, por ejemplo después de agregar una tarea.
- `sw.js`: `CACHE_NAME` a `v10` y precache de `borradores.js`.

## [v0.51.3] - 2026-09-19

### Cambiado

- **Aviso de reconexión con Google más claro** (pedido del usuario al validar): al abrir la app sin sesión de Google, el navegador bloquea el popup silencioso (no hay ningún clic todavía), pero el primer clic o tecla en cualquier parte de la página reconecta y sincroniza solo. El aviso de la cabecera ahora lo dice: "Falta reconectar con Google: hacé clic en cualquier parte de la página (o en el botón) y se sincroniza solo". Si el reintento por clic ya se usó (o falló), vuelve el texto anterior. Además, el reintento por clic se vuelve a armar cada vez que se pierde la sesión (por ejemplo cuando vence el token a la hora), no solo al abrir la app. Estado nuevo `reconectaConClic` en `obtenerEstadoSync()`.

## [v0.51.2] - 2026-09-19

### Corregido

- **"No se pudo cargar Google Identity Services" al volver la conexión** (hallado al validar v0.51.0): si la página se abría sin internet, el script de Google (`index.html`) fallaba de forma definitiva y "Reconectar Drive" seguía fallando aunque internet volviera, hasta recargar con F5. Ahora `google-auth.js` vuelve a cargar el script por su cuenta (`esperarGoogle` la primera vez espera al original y después lo reintenta; `conectar` lo recarga si falta), así que la reconexión funciona sin recargar.

## [v0.51.1] - 2026-09-19

### Cambiado

- **Botón de tema** de la cabecera: muestra solo el emoji de la acción (☀️ para pasar a modo claro, 🌙 para pasar a modo oscuro) en lugar del texto "Modo claro"/"Modo oscuro", que se leía como el estado actual y no como la acción. La lógica no cambia; se suman `title` y `aria-label` ("Cambiar a modo claro/oscuro") para que el botón siga siendo comprensible.

## [v0.51.0] - 2026-09-19

Ronda 1 del rediseño: **Google Drive como único destino de los datos** (ver `REDISENO.md`, sección Almacenamiento).

### Agregado

- **Sincronización con Google Drive** (`assets/js/almacenamiento.js`, reescrito): buffer local durable en IndexedDB (`pendiente`, se borra solo cuando Drive confirma), copia `cache` de la última versión confirmada (base de la mezcla y copia de solo lectura sin conexión), subida con debounce de 2 s, reintentos si se edita durante la sincronización, verificación automática (al volver a la pestaña, al recuperar red y cada 5 min) y aviso `beforeunload` si hay cambios sin confirmar. La UI nunca muestra "sincronizado" hasta que Drive confirma.
- **Mezcla entre dispositivos** (`assets/js/sincronizacion.js`, lógica pura): sello `*_modificado_en` por entidad (calculado por diferencia al guardar, sin tocar las vistas), registro de eliminados con retención de 90 días, gana el cambio más reciente de cada entidad y **avisos persistentes** de todo lo descartado (campo y valor), que el usuario cierra a mano. Aviso si Drive tiene archivos duplicados (se usa el más antiguo) y si el reloj del dispositivo está desfasado más de 2 minutos.
- **Permiso único de Google** (`assets/js/google-auth.js`): Drive (`drive.file`) y Calendar (`calendar.readonly`) se piden juntos en un solo popup; reconexión silenciosa al abrir, con reintento en el primer clic si el navegador bloquea el popup.
- **Cabecera de sincronización**: estado siempre visible (sincronizado / guardando / pendiente / sin conexión / sesión vencida), hora del último guardado y de la última verificación, botón "Sincronizar ahora", banners de estado y panel de avisos. **Pantalla inicial obligatoria** hasta conectar con Drive. Segunda pestaña abierta en **solo lectura** (Web Locks).
- Campos `categoria_/ubicacion_/meta_/persona_/tarea_modificado_en` y estructura `formato 2` del archivo de Drive (`colecciones` + `eliminados` + `guardado_en`); los archivos anteriores se migran solos al leerse.
- Datos viejos de `localStorage` (`super-todo-list:datos`): se importan solos si Drive no tiene archivo; si tiene, se ofrece mezclarlos o descartarlos.
- `assets/js/almacenamiento-local.js` (IndexedDB v2: `cache`, `pendiente`, `avisos`).

### Cambiado

- "Importar JSON" ahora **pide confirmación** (reemplaza todo, también en Drive).
- Google Calendar se concede junto con Drive: ya no hay un botón "Conectar con Google Calendar" en Hoy (en "Revisar mi día" queda un botón para reconectar si la sesión venció).
- `sw.js`: `CACHE_NAME` a `v9` y precache de los módulos nuevos.

### Eliminado

- **Modo carpeta local** (File System Access API, `categorias.json`/`tareas.json`) y **`localStorage` como copia de los datos** (queda solo para preferencias). El store `handles` de IndexedDB se elimina.
- Botones "Elegir carpeta de datos" y "Sincronizar con Google Drive" de la cabecera y el conflicto por `confirm()` todo-o-nada.

### Documentación

- Actualizados `CASOS_DE_USO.md` (D1-D3), `PROCESOS_AUTOMATICOS.md` (10-13), `LOGICA_FUNCIONES.md`, `DICCIONARIO_DE_DATOS.md`, `datos/esquema.json`, `REDISENO.md`, `SPEC.md`, `README.md`, `AGENTS.md` y `BACKLOG.md`.

### Pendiente de validar en el navegador real

- La reconexión silenciosa de Google al abrir la app (en las pruebas el popup con `prompt: 'none'` fue bloqueado) y publicar la app OAuth "En producción" en Google Cloud Console para evitar la caducidad del consentimiento a los ~7 días.

## [v0.50.0] - 2026-09-19

### Eliminado

- **Sugerencia automática de tarea de alto disfrute (principio de Premack)**: se borró `assets/js/disfrute.js` y sus llamadas en Hoy, Tareas y "Revisar mi día". Se retoma post-v1.0 con datos reales (ver `BACKLOG.md`). `categoria_disfrute` se conserva, solo recolecta datos.

### Agregado

- `tarea_disfrute` (1-5 o `null`, default `null`) en todas las tareas: select "Disfrute" en el alta y la edición, y se copia a la instancia clonada de una tarea de mantenimiento. Por ahora solo recolecta datos, sin efecto en la app.

### Documentación

- Nuevos documentos vivos `CASOS_DE_USO.md` (flujos por objetivo, baseline de cómo funciona hoy) y `PROCESOS_AUTOMATICOS.md` (condición → proceso → resultado de todo lo que el sistema hace solo), registrados en `AGENTS.md`. En `PROCESOS_AUTOMATICOS.md` se marcaron como pendientes de implementar dos pedidos nuevos (aviso ☀️ de clima favorable, botón "Posponer" junto al aviso de solapamiento con Calendar).

## [v0.49.0] - 2026-09-19

### Agregado

- **Reprogramado de fechas vencidas** (Ronda 5, cierra el algoritmo de prioridad): `tarea_fecha_sugerida` vencida de una tarea activa se reprograma sola al iniciar la app (`reprogramarFechasSugeridasVencidas`, `assets/js/tareas-logica.js`) — a la próxima fecha disponible respetando `tarea_dias_habiles` y sin superar `tarea_fecha_limite`, en cascada a dependientes — con un `alert()` de aviso si hubo cambios. `tarea_fecha_limite` nunca se toca sola: en Hoy, cada tarea vencida en "Urgentes" suma un botón "📅 Revalorizar fecha límite" (reusa `crearPanelReprogramar`, sin cascada).
- `siguienteDiaHabil` (`assets/js/reprogramar.js`) pasa a exportada, para reusarla desde `tareas-logica.js`.

## [v0.48.0] - 2026-09-19

### Agregado

- **Herramienta "Versus"** (Ronda 4 del algoritmo de prioridad), botón "⚔️ Versus" en la vista Todas: agrupa las tareas accionables en clusters mutuamente empatados en prioridad (nuevo `tareasEmpatadas`/`compararEstructural` en `assets/js/tareas-logica.js`, los niveles 1-4 ya existentes de `compararPorPrioridad`) y ofrece pares adyacentes de a uno para que el usuario elija cuál conviene antes, o "Da igual / Omitir". Elegir asigna el nuevo campo `tarea_prioridad_manual` (número \| `null`) a ambas tareas del par vía un contador global creciente; a partir de ahí ya no vuelven a ofrecerse (dejan de estar "empatadas"). Omitir no asigna nada — siguen genuinamente empatadas, solo se evita re-ofrecer el mismo par en la sesión actual.
- `tarea_prioridad_manual` se suma como **Nivel 5** de `compararPorPrioridad`, entre `tarea_importancia` y el FIFO final (`tarea_creada_en`, que pasa a Nivel 6).

## [v0.47.0] - 2026-09-18

### Cambiado

- **Vista "Todas"** (Ronda 3 del algoritmo de prioridad), rename de la vista "Tabla" (`views/tabla.view.js` → `views/todas.view.js`, ruta `#/todas`): ya no excluye tareas completadas por defecto — se acota con el nuevo filtro de Estado. Se suman filtros de categoría (árbol, inclusivo de descendientes), importancia y un buscador por nombre. El orden por defecto pasa a ser `compararPorPrioridad` (el orden real de prioridad de la app), pensado para auditar de un vistazo si algo quedó mal priorizado; clic en el header de una columna (Nombre/Categoría/Importancia/Estado/Fecha/Holgura) cambia a un orden simple por esa columna con toggle asc/desc, y un botón "↺ Prioridad" vuelve al orden por defecto. Nueva columna "Holgura".
- `textoHolgura(dias)` (antes lógica duplicada dentro de Hoy) se extrajo a `assets/js/utilidades.js`, compartida entre Hoy y Todas.

## [v0.46.0] - 2026-09-18

### Cambiado

- **Algoritmo real de prioridad** (Ronda 2 del rediseño de datos, `assets/js/tareas-logica.js`), definido en conjunto con el usuario para reflejar su jerarquía real (Facultad como prioridad de vida #1, pero sin que domine siempre el orden). `compararPorPrioridad` pasa de ordenar solo por `categoria_prioridad` a 5 niveles:
  1. **Banda de holgura**: días de margen hasta `tarea_fecha_limite`, contados desde hoy (`calcularHolguraDias`), agrupados en 6 bandas (vencida, 0-3, 4-7, 8-15, 16-30, 31+/sin fecha) para que una diferencia chica de días no tape la prioridad de categoría.
  2. `categoria_prioridad` de la categoría **raíz** de la tarea (nueva `categoriaRaiz` en `utilidades.js`, recorre `categoria_padre_id`).
  3. `categoria_prioridad` de la categoría directa, como desempate entre categorías con la misma raíz.
  4. `tarea_importancia`.
  5. `tarea_creada_en` (FIFO), para que el orden sea siempre determinístico.
- Nueva función `mejorTareaPorCategoria`: para cada categoría raíz, su tarea accionable de mayor prioridad — pensada para elegir qué hacer en un rato libre sin quedar siempre empujado hacia la categoría de mayor prioridad general. Nuevo apartado "Elegí por categoría" en Hoy, dentro de "Resto de tus pendientes". La sección "Urgentes" de Hoy ahora también muestra la holgura de cada tarea en texto.
- Se simplificaron 3 sorts (Hoy-Resto, Tareas-listado general, `calcularEnfoque8020`) que pre-ordenaban manualmente por `tarea_fecha_limite` antes de aplicar `compararPorPrioridad` — quedaban redundantes y hasta conflictivos con las bandas de holgura nuevas.

### Eliminado

- `tarea_genera_dinero` (campo, checkbox de alta/edición, badges en Tareas/Hoy/3-8 días): el usuario concluyó que ese criterio ya lo cubre el orden manual de las categorías raíz correspondientes (ej. "Trabajo"), y no lo quería si no participaba del algoritmo de prioridad.

### Nota

- Ver `REGLAS_DE_PRIORIDAD.md` para el detalle completo con ejemplos, y su sección final "Pendiente para próximas rondas" (vista "Todas" con filtros, herramienta "Versus" de desempate manual, reprogramado automático/manual de fechas vencidas).

## [v0.45.0] - 2026-09-17

### Cambiado

- **Rediseño grande del modelo de datos**, definido en conjunto con el usuario tras revisar a fondo `DICCIONARIO_DE_DATOS.md`:
  - **Subcategoria desaparece como entidad**: Categoria pasa a auto-referenciarse (`categoria_padre_id`), permitiendo jerarquías de profundidad libre. La vista Categorías pasa de lista con subcategorías anidadas a un árbol recursivo (reordenamiento ▲/▼ ahora acotado a categorías hermanas). Los badges de tareas muestran el camino completo hasta la raíz (ej. "Facultad / IR").
  - `tarea_estado` pasa a `bloqueada`/`pendiente`/`completada`, donde `bloqueada` es ahora un valor persistido (antes se calculaba al vuelo). Se sincroniza automáticamente al crear una tarea, al editar su dependencia, y en cascada al completarse la tarea de la que depende (que además le transfiere su fecha de finalización como nueva fecha de inicio habilitada).
  - `dependencias` (array) pasa a `tarea_dependiente` (una sola referencia) y `metas_ids` (array) pasa a `meta_id` (una sola referencia) — los paneles correspondientes en Tareas pasan de checklist a selección única.
  - Las fechas de Tarea (`tarea_fecha_inicio_habilitada`, `tarea_fecha_sugerida`, `tarea_fecha_limite`) admiten hora opcional en el mismo campo — se fusiona el viejo campo separado `fecha_hora_agendada` dentro de `tarea_fecha_sugerida`. El panel de "Posponer" deja de exigir horario.
  - `tarea_mantenimiento` pasa a booleano simple; el intervalo (`{cantidad, unidad}`) se guarda aparte en `tarea_mantenimiento_intervalo`.
  - `tarea_notas` se renombra a `tarea_descripcion`; se agrega `categoria_descripcion`.
  - Migración retrocompatible automática (incluida la fusión Subcategoria→Categoria) para los datos reales del usuario, guardados en el formato de la ronda anterior.

### Eliminado

- `tarea_divisible`, `tarea_multitasking`, `tarea_recompensa`, duración/costo real (`tarea_duracion_real_min`, `tarea_costo_real`), `persona_notas`, y toda la función de notificaciones locales (`assets/js/notificaciones.js`, botón, campo de control) — todo por decisión del usuario, algunos anotados en `BACKLOG.md` para reevaluar más adelante.

### Nota

- `REGLAS_DE_PRIORIDAD.md` queda con un criterio provisorio y simple (solo `categoria_prioridad`) — el algoritmo real de prioridad se define en una ronda aparte.

## [v0.44.0] - 2026-09-16

### Agregado

- Atributo `tarea_genera_dinero` (booleano, default `false`): checkbox en el alta y edición de tarea, badge "💵 Genera ingreso" en Tareas, Hoy y 3/8 días (mismos lugares donde ya aparecen recompensa/costo estimado). Por ahora es solo informativo, sin proyección en Informes.
- Atajo de teclado "N" (sin modificador) para crear una tarea rápido en PC: navega a Tareas y enfoca el input de alta rápida. Se ignora si el foco está en cualquier campo editable, para no interferir al escribir. `Ctrl+N` está reservado por el navegador (nueva ventana), por eso se usa la tecla sola.
- Documentación: `REGLAS_DE_PRIORIDAD.md` (qué determina el orden/prioridad de las tareas y cómo se usa en cada vista) y `LOGICA_FUNCIONES.md` (qué hace cada función/módulo del proyecto, referenciando `DICCIONARIO_DE_DATOS.md`). Documentación viva, a actualizar junto con cada cambio funcional — convención sumada a `AGENTS.md`.

## [v0.43.0] - 2026-09-16

### Cambiado

- Renombrado masivo de campos al patrón `entidad_atributo`: cada campo propio de una entidad se prefija con el nombre de la entidad (ej. `Tarea.nombre` → `tarea_nombre`, `Categoria.color` → `categoria_color`), para evitar ambigüedad cuando una entidad usa atributos de otra. Los campos que ya son una referencia a otra entidad (`categoria_id`, `subcategoria_id`, `ubicacion_id`, `dependencias`, `metas_ids`) quedan sin cambios. Afecta `assets/js/modelos.js`, todas las vistas, `datos/esquema.json`, `DICCIONARIO_DE_DATOS.md` y los archivos de ejemplo. Convención documentada en `AGENTS.md`.
- Migración retrocompatible: `assets/js/almacenamiento.js` detecta y convierte automáticamente datos guardados con los nombres de campo anteriores (localStorage, carpeta local, Google Drive o JSON importado), sin pérdida de información ni acción manual del usuario. Se aplica de forma transparente en los 4 puntos de carga de datos.

### Eliminado

- Campo `motivo_incumplimiento` de Tarea: no aportaba valor dentro del sistema actual. Se eliminó del modelo, de la captura en el flujo "No cumplida" (Hoy y "Revisar mi día") y de la métrica "Índice de procrastinación" en Informes, que dependía enteramente de este campo y también se eliminó.

## [v0.42.0] - 2026-09-16

### Agregado

- Vista "Tabla" de tareas pendientes: nueva vista `views/tabla.view.js` con todas las tareas no completadas ordenadas por la fecha más próxima (agendada > límite > sugerida, reutilizando `fechaDeReferencia` de `assets/js/vista-agenda.js`, ahora exportada). Columnas: Nombre, Categoría/Subcategoría, Importancia, Estado, Fecha y una columna nueva "Días" (usa `diasEntreFechas` de `assets/js/utilidades.js`) que muestra "En 3 días"/"Hoy"/"Vencida hace 2 días"/"Sin fecha". Clic en una fila abre esa tarea en edición en Tareas (mismo mecanismo ya usado por Gantt/Semana). Diseñada tras investigar en vivo (vía conectores de Notion y Google Calendar) cómo el usuario organiza hoy sus tareas reales — la vista replica directamente la tabla "Completo" que ya usaba en Notion.

## [v0.41.0] - 2026-09-16

### Agregado

- Filtro de "ubicación actual" unificado: nuevo módulo `assets/js/ubicacion-actual.js` (clave propia de `localStorage`, mismo patrón que el tema claro/oscuro) reemplaza las dos variables de filtro de ubicación que existían por separado en Hoy y Tareas. Ahora Hoy, Tareas y 3/8 días comparten la misma "ubicación actual": elegirla desde cualquiera de esas vistas se refleja en las otras sin recargar, y persiste entre recargas de página. Nuevo selector "¿Dónde estás?" agregado a `assets/js/vista-agenda.js` (3/8 días), que antes no tenía ningún filtro de ubicación.

## [v0.40.0] - 2026-09-16

### Agregado

- Versión visible en la cabecera: nueva constante `VERSION` en `assets/js/app.js`, mostrada junto al título "Super To-Do List". `AGENTS.md` documenta mantenerla sincronizada con esta lista en cada entrega.

### Cambiado

- Triage del backlog abierto de cara a v1.0.0: se reemplazó la idea de notificación por GPS por un ítem más simple (filtro de "ubicación actual"); se descartaron "comparación de throughput con amigos" y "tareas nuevas tras cursada"; se eliminó "exportar/importar categoría completa"; se priorizó "lectura de eventos pasados de Calendar" para una próxima ronda; se postergó explícitamente el "integrador más amplio" a después de v1.0.0.

## [v0.39.1] - 2026-09-16

### Corregido

- Caché agresiva en producción (GitHub Pages): la CDN de GitHub Pages manda `Cache-Control: max-age=600`, cabecera que también gobernaba los `fetch()` del propio Service Worker — el navegador podía resolverlos con una copia local sin llegar a la red, aunque la estrategia se llame "network-first". Detectado en vivo: tras mergear a `main`, el sitio seguía mostrando contenido viejo pese a que la CDN ya servía el archivo correcto (confirmado con `curl`). `sw.js` ahora pasa `{ cache: 'reload' }` en el `fetch` del handler (igual que ya hacía el precache de `install`), y se bumpeó `CACHE_NAME` a `v2` para forzar la actualización inmediata en los dispositivos que ya tenían el Service Worker instalado.

## [v0.39.0] - 2026-09-16

### Quitado

- Datos de ejemplo al primer arranque: `sembrarDatosDeEjemplo()` (categorías y tareas de prueba) ya no se ejecuta en `inicializarAlmacenamiento()`. Ahora que el usuario va a usar la app con datos reales sincronizados entre varios dispositivos vía Google Drive, un dispositivo nuevo arranca vacío en vez de con contenido de muestra que después hay que borrar a mano.

## [v0.38.0] - 2026-09-16

### Agregado

- Sincronización vía Google Drive API: evaluadas las 4 opciones registradas en `BACKLOG.md` ("Sync — opciones a evaluar"), se eligió Google Drive API vía OAuth por ser la única que resuelve el uso desde el celular (la carpeta local actual no funciona en navegadores móviles) sin sumar un backend. Nuevo módulo `assets/js/google-drive-sync.js`, mismo patrón que `google-calendar.js` (Google Identity Services, token en memoria) con su propio scope `drive.file` (acceso restringido, solo a archivos creados por la app). Un único archivo JSON remoto con el `estado` completo, que se actualiza automáticamente en cada guardado mientras la sesión sigue conectada. Nuevo botón "Sincronizar con Google Drive" en la cabecera. Si el archivo remoto cambió por fuera desde la última sincronización conocida de este dispositivo, se pregunta con `confirm()` cuál versión conservar antes de pisar nada (sin merge automático). El token no se persiste entre sesiones, igual que Calendar.

### Corregido

- Bug de reconexión colgada en `assets/js/google-calendar.js` y `assets/js/google-drive-sync.js`: el `callback` del `TokenClient` de Google (un singleton) quedaba atado al `resolve`/`reject` de la primera conexión; una reconexión posterior en la misma pestaña (token vencido) nunca resolvía su propia promesa porque el callback seguía resolviendo la de la primera llamada. Se resolvió con una indirección (`manejarRespuestaToken`) que cada conexión reasigna a su propio resolve/reject.
- Bug de condición de carrera en `assets/js/app.js`: el script de Google Identity Services carga en paralelo (`async`/`defer`); si el primer `render()` corría antes de que terminara de cargar, el botón "Sincronizar con Google Drive" quedaba oculto para siempre (detectado en pruebas reales del usuario: el botón no aparecía tras una recarga forzada). Ahora se vuelve a evaluar su visibilidad apenas ese script termina de cargar.

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
