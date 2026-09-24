# Diccionario de datos

Referencia 1:1 con [datos/esquema.json](datos/esquema.json) y con las factories de [assets/js/modelos.js](assets/js/modelos.js).

Convención de nombres: cada campo propio de una entidad se prefija con el nombre de la entidad (patrón `entidad_atributo`, ej. `Tarea.nombre` → `tarea_nombre`), para evitar ambigüedad cuando una entidad referencia atributos de otra. Los campos que ya son una referencia a otra entidad (`categoria_id`, `ubicacion_id`, `tarea_dependiente`, `meta_id`) quedan sin ese prefijo, porque ya son inequívocos.

Convención de fecha±hora: los campos de fecha de Tarea (`tarea_fecha_inicio_habilitada`, `tarea_fecha_sugerida`, `tarea_fecha_limite`) admiten dos formatos en el mismo campo — un string de 10 caracteres (`YYYY-MM-DD`) significa "sin hora específica" (día nomás); un datetime ISO completo (más de 10 caracteres) significa que además hay una hora puntual. Se distingue por longitud del string. `null` significa "sin valor". **Zona horaria**: un valor con hora es un instante en UTC (`toISOString()`) que la app muestra y agrupa por día en la **hora local del dispositivo** (en Argentina, UTC-3 todo el año); un valor de solo fecha es un día del calendario, sin zona. El día de un instante se obtiene con `diaLocal` (`assets/js/utilidades.js`), nunca cortando el texto, porque el día UTC de las 21:00 a las 24:00 locales ya es el siguiente. Las horas se muestran en 24 h.

## Categoria

| Campo | Tipo | Fase | Descripción |
|---|---|---|---|
| `categoria_id` | string (UUID) | MVP | Identificador único |
| `categoria_nombre` | string | MVP | Nombre de la categoría (ej. "Personal", "Facultad", "IR") |
| `categoria_descripcion` | string, default `""` | MVP | Texto libre opcional |
| `categoria_color` | string (hex) | MVP | Color identificatorio en la UI de esta categoría (no de sus ancestros) |
| `categoria_prioridad` | number | MVP | Prioridad relativa entre categorías **hermanas** (mismo `categoria_padre_id`). Se reordena con los botones ▲/▼ en la vista Categorías |
| `categoria_disfrute` | number (1-5, default `3`) | MVP | Cuánto disfrutás las tareas de esta categoría. Por ahora solo se recolecta, sin ningún efecto en la app: la sugerencia automática basada en el principio de Premack se eliminó y se retoma post-v1.0, cuando haya datos reales cargados para analizar (ver `BACKLOG.md`) |
| `categoria_padre_id` | string (UUID) \| null | MVP | Categoría padre, si esta es una categoría anidada (reemplaza al viejo concepto de Subcategoria — ahora Categoria se auto-referencia, sin límite de profundidad). `null` = categoría raíz |
| `categoria_modificado_en` | string (ISO datetime) | MVP | Cuándo se modificó por última vez (lo sella el sistema al guardar, ver "Sincronización" abajo). No se edita a mano |

El "camino" completo de una categoría hasta su raíz (ej. "Facultad / IR") se arma recorriendo `categoria_padre_id` en tiempo de renderizado (`caminoCategoria` en `assets/js/utilidades.js`), no se guarda como campo. Al eliminar una categoría, sus categorías hijas quedan promovidas (`categoria_padre_id: null`) y las tareas asociadas quedan sin categoría.

## Tarea

| Campo | Tipo | Fase | Descripción |
|---|---|---|---|
| `tarea_id` | string (UUID) | MVP | Identificador único |
| `tarea_nombre` | string | MVP | Título de la tarea |
| `categoria_id` | string (UUID) \| null | MVP | Referencia a `Categoria.categoria_id` (puede ser cualquier nivel del árbol) |
| `tarea_estado` | enum: `bloqueada` \| `pendiente` \| `completada` | MVP | Estado actual. `bloqueada` es un valor persistido (no calculado): la tarea tiene `tarea_dependiente` apuntando a otra que todavía no está `completada`. Se recalcula automáticamente al crear la tarea, al editar/quitar su dependencia, y al completarse la tarea de la que depende |
| `tarea_fecha_inicio_habilitada` | fecha±hora \| null, default = `tarea_creada_en` | MVP | A partir de cuándo se puede empezar (earliest start). En Hoy, las tareas con esta fecha en el futuro se muestran aparte, en "Todavía no pueden empezar" |
| `tarea_fecha_sugerida` | fecha±hora \| null | MVP | Cuándo conviene/se planea hacer la tarea — sin hora es una sugerencia laxa; con hora es un horario concreto (reemplaza al viejo campo separado `fecha_hora_agendada`). Se define con el botón "Posponer". Idealmente entre `tarea_fecha_inicio_habilitada` y `tarea_fecha_limite` |
| `tarea_fecha_limite` | fecha±hora \| null | MVP | Fecha en la que la tarea debe estar completada sí o sí (deadline) |
| `tarea_fecha_fin` | string (ISO datetime) \| null | MVP | Timestamp real de finalización (se completa al marcar la tarea como `completada`) |
| `tarea_urgente` | boolean (default `false`) | MVP | Si es urgente. Se usa en `REGLAS_DE_PRIORIDAD.md`; al marcarla en `true` se le asigna `tarea_fecha_sugerida` = hoy (o el próximo hueco libre si no entra). Antes de la v0.75.0 era `tarea_importancia` (enum `urgente`/`importante`/`null`) |
| `tarea_mantenimiento` | boolean (default `false`) | MVP | Si está en `true`, habilita la carga de `tarea_mantenimiento_intervalo` y, al completar la tarea, se clona una nueva instancia pendiente con `tarea_fecha_limite` = fecha real de finalización + ese intervalo |
| `tarea_mantenimiento_intervalo` | `{ cantidad: number, unidad: 'dias'\|'semanas'\|'meses' }` \| null | MVP | Cada cuánto se repite. Solo tiene sentido cuando `tarea_mantenimiento = true` |
| `tarea_dias_habiles` | array de números 0-6 (0=domingo), default `[]` | MVP | Días de la semana en que se puede realizar. Vacío = sin restricción. Al posponer, el panel de reprogramar salta automáticamente al próximo día hábil |
| `tarea_duracion_min` | number (múltiplo de 15, default `30`) | MVP | Duración estimada en minutos. Hasta la v0.59 el valor por defecto era 15; las tareas ya cargadas no cambian |
| `tarea_descripcion` | string, default `""` | MVP | Texto libre: recursos, procedimiento, links, referencias |
| `tarea_creada_en` | string (ISO datetime) | MVP | Timestamp de creación |
| `tarea_dependiente` | string (UUID) \| null | MVP | Referencia a la `Tarea.tarea_id` de la que depende (una sola; es la tarea **previa**). **Regla 1 a 1**: cada tarea bloquea a como máximo una tarea activa y es bloqueada por como máximo una (se permite entre categorías distintas); al enlazar con una tarea ya enlazada, la nueva se inserta en medio (P→A→N). Mientras esa tarea no esté `completada`, esta queda `bloqueada`. Al completarse la tarea de la que depende, esta se desbloquea (`tarea_estado` pasa a `pendiente`) y su `tarea_fecha_inicio_habilitada` toma el `tarea_fecha_fin` de la completada |
| `ubicacion_id` | string \| null | MVP | Referencia a la única `Ubicacion.ubicacion_id` donde puede realizarse la tarea. Útil para validar `tarea_requiere_clima_bueno` |
| `tarea_requiere_clima_bueno` | boolean (default `false`) | MVP | Si está en `true` y la tarea tiene `ubicacion_id` con coordenadas y una fecha resoluble dentro de los próximos 16 días, se consulta el pronóstico real (Open-Meteo) y se avisa si la probabilidad de lluvia es alta |
| `tarea_costo_estimado` | number, default `0` | MVP | Costo monetario estimado, opcional. Se suma en Informes para proyectar el costo de las tareas pendientes. Se copia a la instancia clonada si la tarea es de mantenimiento |
| `meta_id` | string (UUID) \| null | MVP | Meta a la que aporta esta tarea (una sola). El progreso de la meta se calcula al vuelo filtrando por este campo |
| `tarea_disfrute` | number (1-5) \| null, default `null` | MVP | Cuánto disfrutás esta tarea puntual (principalmente útil en tareas de mantenimiento). Por ahora solo se recolecta, sin efecto en la app — mismo criterio que `categoria_disfrute` (ver `BACKLOG.md`, Premack post-v1.0). Se copia a la instancia clonada si la tarea es de mantenimiento |
| `tarea_modificado_en` | string (ISO datetime) | MVP | Cuándo se modificó por última vez (lo sella el sistema al guardar). No se edita a mano |
| `tarea_prioridad_manual` | number \| null, default `null` | MVP | Desempate manual de prioridad (menor = más prioritaria), asignado por la herramienta "Versus" (vista Tabla) al comparar 2 tareas empatadas. `null` = sin preferencia manual. Ver `REGLAS_DE_PRIORIDAD.md` |
| `tarea_exportada_calendar` | boolean (default `false`) | MVP | Se marca al aceptar abrir la tarea completada en Google Calendar (no se puede verificar que el usuario haya guardado el evento). Vuelve a `false` al reabrir la tarea; la copia de una tarea de mantenimiento nace en `false` |
| `tarea_checklist` | array de `{ texto: string, hecho: boolean }`, default `[]` | MVP | Lista de pasos para definir el proceso de una tarea de mantenimiento. La copia que se crea al completar hereda los textos con `hecho: false` (destildados). Todavía no tiene pantalla de edición (llega en la Ronda 3 del rediseño) |
| `tarea_desencadenante` | string (UUID) \| null, default `null` | MVP | Solo tareas de mantenimiento. Referencia a otra tarea que "activa" a esta: no bloquea nada por sí mismo, se aplica **al crear la copia** (al completar esta tarea, su copia nace bloqueada por la instancia vigente del desencadenante; la instancia vigente es la misma tarea si sigue sin completar o su copia de mantenimiento pendiente con el mismo nombre). Sirve para cerrar anillos (A→B→C→D y D vuelve a activar a A). Una tarea con desencadenante no admite otra tarea previa; la copia sí nace con `tarea_dependiente` apuntando a él. Si se elimina el desencadenante, pasa a la previa de la eliminada |
| `tarea_carga_completa` | boolean (default `false`) | MVP | Se pone en `true` con el botón "Dejar así" de "Completar carga de tareas": la tarea queda con pocos datos a propósito y deja de figurar en esa lista. No afecta nada más |
| `tarea_tipo` | string, default `""` | Ronda 9a | **Reservado, sin uso desde la v0.63.0** (antes marcaba un examen). Se conserva en los datos y no se muestra ni se edita |
| `tarea_repetir_hasta` | fecha `YYYY-MM-DD` \| `""`, default `""` | Ronda 9a | Solo tareas de mantenimiento: **hábito temporal**. Último día en que se repite; si el próximo vencimiento cae después, no se crea la copia. La copia hereda el valor |
| `tarea_repetir_hasta_tarea` | string (UUID) \| `null`, default `null` | Ronda 9a | Solo tareas de mantenimiento: deja de repetirse cuando esa otra tarea se cumple o llega su fecha límite (o sugerida). Si esa tarea ya se completó, vale el día de su cumplimiento; si se eliminó, se ignora. Si hay también `tarea_repetir_hasta`, vale lo más temprano. La copia hereda el valor |
| `tarea_origen` | objeto \| `null`, default `null` | Ronda 9a | **Reservado, sin uso desde la v0.63.0** (antes marcaba lo que generó el asistente de examen). Se conserva en los datos; una tarea que lo tiene no cuenta como "cargada rápido" |
| `persona_id` | string (UUID) \| `null`, default `null` | v0.66.0 | Referencia a `Persona.persona_id`: con quién se hace la tarea (una sola). Al eliminar la persona, queda en `null` |

## Ubicacion

| Campo | Tipo | Fase | Descripción |
|---|---|---|---|
| `ubicacion_id` | string (UUID) | MVP | Identificador único |
| `ubicacion_nombre` | string | MVP | Nombre de la ubicación (ej. "Casa", "Facultad") |
| `ubicacion_latitud` | number (-90 a 90) | MVP | Usada para consultar el pronóstico real en Open-Meteo |
| `ubicacion_longitud` | number (-180 a 180) | MVP | Idem |
| `ubicacion_modificado_en` | string (ISO datetime) | MVP | Cuándo se modificó por última vez (lo sella el sistema al guardar). No se edita a mano |

Se administra desde el ABM en la vista "Ubicaciones". Al eliminar una ubicación, las tareas que la referenciaban quedan con `ubicacion_id: null`.

## Meta

| Campo | Tipo | Fase | Descripción |
|---|---|---|---|
| `meta_id` | string (UUID) | MVP | Identificador único |
| `meta_nombre` | string | MVP | Nombre del objetivo/propósito |
| `meta_plazo` | enum: `corto` \| `mediano` \| `largo` | MVP | Horizonte temporal de la meta |
| `meta_descripcion` | string, default `""` | MVP | Texto libre opcional |
| `meta_fecha_estimada` | string (`YYYY-MM-DD`) \| "", opcional | MVP | Fecha en la que se aspira a cumplir la meta |
| `meta_creada_en` | string (ISO datetime) | MVP | Timestamp de creación |
| `meta_modificado_en` | string (ISO datetime) | MVP | Cuándo se modificó por última vez (lo sella el sistema al guardar). No se edita a mano |

Se administra desde el ABM en la vista "Metas". El progreso (tareas completadas / tareas asociadas) se calcula al vuelo filtrando `estado.tareas` por `meta_id`, no se guarda como campo. Al eliminar una meta, las tareas que la referenciaban quedan con `meta_id: null`.

## Persona

| Campo | Tipo | Fase | Descripción |
|---|---|---|---|
| `persona_id` | string (UUID) | MVP | Identificador único |
| `persona_nombre` | string | MVP | Nombre de la persona (ej. "Mamá", "Juan") |
| `persona_ultimo_contacto` | string (`YYYY-MM-DD`) \| "", opcional | MVP | Fecha del último encuentro/contacto registrado. Vacío = nunca registrado |
| `persona_proximo_contacto` | string (`YYYY-MM-DD`) \| "", opcional | v0.66.0 | Próximo encuentro planeado. Al guardarla con un valor nuevo, reprograma la `tarea_fecha_sugerida` de todas las tareas pendientes asociadas (`persona_id`) a esa fecha |
| `persona_creada_en` | string (ISO datetime) | MVP | Timestamp de creación |
| `persona_modificado_en` | string (ISO datetime) | MVP | Cuándo se modificó por última vez (lo sella el sistema al guardar). No se edita a mano |

Se administra desde el ABM en la vista "Personas". La lista se ordena de mayor a menor tiempo sin contacto; el botón "Marcar contacto hoy" actualiza `persona_ultimo_contacto` a la fecha actual. Desde la v0.66.0, editar una persona (`abrirDialogoPersona`) muestra sus tareas pendientes (`Tarea.persona_id`) y permite reprogramarlas de una vez con "Próximo contacto".

## Mejora

| Campo | Tipo | Fase | Descripción |
|---|---|---|---|
| `mejora_id` | string (UUID) | MVP | Identificador único |
| `mejora_tarea_nombre` | string | MVP | Nombre de la tarea de mantenimiento a la que se refiere la nota. La identidad de una tarea que se repite es su nombre (renombrarla corta la relación) |
| `mejora_texto` | string | MVP | "¿Cómo se podría mejorar para la próxima vez?" |
| `mejora_fecha` | string (ISO datetime) | MVP | Cuándo se escribió la nota |
| `mejora_aplicada` | boolean (default `false`) | MVP | Si la nota ya se incorporó a la tarea. Se marca y desmarca desde la vista Mejoras |
| `mejora_modificado_en` | string (ISO datetime) | MVP | Cuándo se modificó por última vez (lo sella el sistema al guardar). No se edita a mano |

Se crea sola al cumplir una tarea de mantenimiento con nota. Es independiente de las instancias de la tarea (sobrevive cuando las completadas se archiven); además la última nota se sigue anexando a la descripción de la copia. Se repasan en la vista **Mejoras** (Ronda 6, v0.57.0): se pueden marcar como aplicadas, editar y eliminar; las pendientes de una tarea de mantenimiento también se muestran en su tarjeta de Hoy.

## Cumplimiento

| Campo | Tipo | Fase | Descripción |
|---|---|---|---|
| `cumplimiento_id` | string (UUID) | MVP | Identificador único |
| `cumplimiento_tarea_id` | string (UUID) | MVP | `Tarea.tarea_id` que se cumplió (permite deshacer el registro si la tarea se reabre; puede quedar sin tarea si esta se elimina o archiva) |
| `cumplimiento_tarea_nombre` | string | MVP | Nombre de la tarea al cumplirse (identidad del hábito) |
| `categoria_id` | string \| null | MVP | Categoría de la tarea al cumplirse |
| `cumplimiento_fecha` | string (ISO datetime) | MVP | Cuándo se cumplió (`tarea_fecha_fin`) |
| `cumplimiento_fecha_limite` | fecha±hora \| "" | MVP | Vencimiento esperado (`tarea_fecha_limite`) al cumplirse, para distinguir "a tiempo" de "tarde" |
| `cumplimiento_mantenimiento` | boolean | MVP | Si la tarea era de mantenimiento (para filtrar el mapa de hábitos) |
| `cumplimiento_intervalo` | `{ cantidad, unidad }` \| null | MVP | Cada cuánto se repetía la tarea (`tarea_mantenimiento_intervalo`) al cumplirla. Permite saber si un hábito era diario (y entonces un día sin registro es un incumplimiento) |
| `cumplimiento_dias_habiles` | number[] (0-6), vacío = todos | MVP | Días de la semana en que la tarea podía hacerse (`tarea_dias_habiles`) al cumplirla: los demás días no cuentan en el mapa de hábitos |
| `cumplimiento_modificado_en` | string (ISO datetime) | MVP | Cuándo se modificó por última vez (lo sella el sistema al guardar). No se edita a mano |

Registro liviano, una entrada por cada tarea que se completa. Reabrir la tarea borra su registro. Es la base del mapa de hábitos (solapa Hábitos de Estadísticas) y sobrevive al archivado de las tareas completadas. Un **hábito** es una tarea de mantenimiento, identificada por su nombre: los registros con `cumplimiento_mantenimiento = true` y el mismo `cumplimiento_tarea_nombre`. Al renombrar una tarea de mantenimiento, los registros con el nombre viejo pasan al nuevo.

## Preferencias

Un **único registro** (`preferencias_id: "unica"`) que se sincroniza con Drive, para que las preferencias valgan en todos los dispositivos. Si no existe, se usan los valores por defecto (no hace falta crearlo). Se administra en Configuraciones → Tiempo disponible y, para una fecha puntual, tocando la barra de carga de un día en Semana.

| Campo | Tipo | Fase | Descripción |
|---|---|---|---|
| `preferencias_id` | `"unica"` | Ronda 9b | Identificador (siempre el mismo) |
| `preferencias_nombre` | string | Ronda 9b | `"Preferencias"` (para los avisos de sincronización) |
| `pref_tope_dias` | number[7] | Ronda 9b | Minutos que se quieren dedicar a tareas cada día de la semana, **domingo primero** (índice = `Date.getDay()`). Por defecto 180 cada día |
| `pref_franja` | `{ inicio, fin }` `"HH:MM"` | Ronda 9b | Parte del día en que se proponen horarios y en que cuenta el tiempo libre. Por defecto `00:00`–`24:00` (antes solo en `localStorage`; se migra sola) |
| `pref_calendarios` | string[] \| `null` | Ronda 9b | Ids de los calendarios de Google que se leen; `null` = todos |
| `pref_ignorar_todo_el_dia` | boolean | Ronda 9b | Los eventos de todo el día no ocupan tiempo. Por defecto `true` |
| `pref_ignorar_rechazados` | boolean | Ronda 9b | Los eventos que el usuario rechazó no ocupan tiempo. Por defecto `true` |
| `pref_ignorar_disponible` | boolean | Ronda 9b | Los eventos marcados como «Disponible» (en vez de «Ocupado») no ocupan tiempo. Por defecto `false` |
| `pref_horizonte_dias` | number | Ronda 9b | Cuántos días hacia adelante se leen los eventos de Calendar. Por defecto 90 (30 · 60 · 90 · 180) |
| `pref_capacidad_por_fecha` | `{ "YYYY-MM-DD": minutos }` | Ronda 9b | Capacidad fijada por el usuario para un día puntual (0 = ningún tiempo). Manda sobre el tope y sobre Calendar; se descartan las fechas pasadas al guardar |
| `preferencias_modificado_en` | string (ISO datetime) | Ronda 9b | Lo sella el sistema al guardar. No se edita a mano |

## Sincronización: sellos de modificación y archivo de Drive

Cada entidad lleva un campo `<entidad>_modificado_en` (ver tablas de arriba). No se edita a mano: el sistema lo sella al guardar, comparando contra el guardado anterior, y sirve para mezclar los cambios de distintos dispositivos (gana la versión más reciente de cada entidad; ver `LOGICA_FUNCIONES.md`, `sincronizacion.js`). Un sello vacío significa "más viejo que cualquier otro".

Los datos viven en **un único archivo en el Google Drive del usuario**, `super-todo-list-datos.json`, con esta estructura:

```
{
  "formato": 3,
  "guardado_en": "ISO datetime del guardado",
  "categorias": Categoria[], "ubicaciones": Ubicacion[], "metas": Meta[], "personas": Persona[], "tareas": Tarea[],
  "mejoras": Mejora[], "cumplimientos": Cumplimiento[], "preferencias": Preferencias[],
  "eliminados": [ { "coleccion": "tareas", "id": "...", "eliminado_en": "ISO datetime" } ]
}
```

`eliminados` registra qué se borró y cuándo (durante 90 días) para que una entidad eliminada en un dispositivo no reviva al mezclar con otro. El `formato` 3 (Ronda 9b) suma `preferencias`; una versión de la app que encuentra un archivo con un `formato` mayor al que conoce queda en **solo lectura** con un aviso, para no pisar lo que no entiende. Los archivos anteriores (sin `formato` ni sellos, o con los formatos viejos de campos) se migran solos al leerlos.

Los datos reales con información personal **no se versionan**; en el repositorio solo hay `datos/categorias.ejemplo.json`, `datos/tareas.ejemplo.json` y `datos/esquema.json` (el esquema describe la estructura del archivo de Drive).
