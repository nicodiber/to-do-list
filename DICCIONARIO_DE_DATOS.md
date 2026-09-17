# Diccionario de datos

Referencia 1:1 con [datos/esquema.json](datos/esquema.json) y con las factories de [assets/js/modelos.js](assets/js/modelos.js).

Convención de nombres: cada campo propio de una entidad se prefija con el nombre de la entidad (patrón `entidad_atributo`, ej. `Tarea.nombre` → `tarea_nombre`), para evitar ambigüedad cuando una entidad referencia atributos de otra. Los campos que ya son una referencia a otra entidad (`categoria_id`, `ubicacion_id`, `tarea_dependiente`, `meta_id`) quedan sin ese prefijo, porque ya son inequívocos.

Convención de fecha±hora: los campos de fecha de Tarea (`tarea_fecha_inicio_habilitada`, `tarea_fecha_sugerida`, `tarea_fecha_limite`) admiten dos formatos en el mismo campo — un string de 10 caracteres (`YYYY-MM-DD`) significa "sin hora específica" (día nomás); un datetime ISO completo (más de 10 caracteres) significa que además hay una hora puntual. Se distingue por longitud del string. `null` significa "sin valor".

## Categoria

| Campo | Tipo | Fase | Descripción |
|---|---|---|---|
| `categoria_id` | string (UUID) | MVP | Identificador único |
| `categoria_nombre` | string | MVP | Nombre de la categoría (ej. "Personal", "Facultad", "IR") |
| `categoria_descripcion` | string, default `""` | MVP | Texto libre opcional |
| `categoria_color` | string (hex) | MVP | Color identificatorio en la UI de esta categoría (no de sus ancestros) |
| `categoria_prioridad` | number | MVP | Prioridad relativa entre categorías **hermanas** (mismo `categoria_padre_id`). Se reordena con los botones ▲/▼ en la vista Categorías |
| `categoria_disfrute` | number (1-5, default `3`) | MVP | Cuánto disfrutás las tareas de esta categoría. Al completar una tarea de una categoría con disfrute bajo (1-2), se sugiere continuar con una accionable de una categoría con disfrute alto (4-5) — principio de Premack |
| `categoria_padre_id` | string (UUID) \| null | MVP | Categoría padre, si esta es una categoría anidada (reemplaza al viejo concepto de Subcategoria — ahora Categoria se auto-referencia, sin límite de profundidad). `null` = categoría raíz |

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
| `tarea_importancia` | enum: `urgente` \| `importante` \| `null` | MVP | Nivel de importancia, opcional. Se usa en `REGLAS_DE_PRIORIDAD.md` |
| `tarea_mantenimiento` | boolean (default `false`) | MVP | Si está en `true`, habilita la carga de `tarea_mantenimiento_intervalo` y, al completar la tarea, se clona una nueva instancia pendiente con `tarea_fecha_limite` = fecha real de finalización + ese intervalo |
| `tarea_mantenimiento_intervalo` | `{ cantidad: number, unidad: 'dias'\|'semanas'\|'meses' }` \| null | MVP | Cada cuánto se repite. Solo tiene sentido cuando `tarea_mantenimiento = true` |
| `tarea_dias_habiles` | array de números 0-6 (0=domingo), default `[]` | MVP | Días de la semana en que se puede realizar. Vacío = sin restricción. Al posponer, el panel de reprogramar salta automáticamente al próximo día hábil |
| `tarea_duracion_min` | number (múltiplo de 15, default `15`) | MVP | Duración estimada en minutos |
| `tarea_descripcion` | string, default `""` | MVP | Texto libre: recursos, procedimiento, links, referencias |
| `tarea_creada_en` | string (ISO datetime) | MVP | Timestamp de creación |
| `tarea_dependiente` | string (UUID) \| null | MVP | Referencia a la `Tarea.tarea_id` de la que depende (una sola). Mientras esa tarea no esté `completada`, esta queda `bloqueada`. Al completarse la tarea de la que depende, esta se desbloquea (`tarea_estado` pasa a `pendiente`) y su `tarea_fecha_inicio_habilitada` toma el `tarea_fecha_fin` de la completada |
| `ubicacion_id` | string \| null | MVP | Referencia a la única `Ubicacion.ubicacion_id` donde puede realizarse la tarea. Útil para validar `tarea_requiere_clima_bueno` |
| `tarea_requiere_clima_bueno` | boolean (default `false`) | MVP | Si está en `true` y la tarea tiene `ubicacion_id` con coordenadas y una fecha resoluble dentro de los próximos 16 días, se consulta el pronóstico real (Open-Meteo) y se avisa si la probabilidad de lluvia es alta |
| `tarea_costo_estimado` | number, default `0` | MVP | Costo monetario estimado, opcional. Se suma en Informes para proyectar el costo de las tareas pendientes. Se copia a la instancia clonada si la tarea es de mantenimiento |
| `tarea_genera_dinero` | boolean (default `false`) | MVP | Si la tarea genera un ingreso (en vez de solo tener un costo). Por ahora es solo informativo: checkbox y badge "💵" en los listados |
| `meta_id` | string (UUID) \| null | MVP | Meta a la que aporta esta tarea (una sola). El progreso de la meta se calcula al vuelo filtrando por este campo |

## Ubicacion

| Campo | Tipo | Fase | Descripción |
|---|---|---|---|
| `ubicacion_id` | string (UUID) | MVP | Identificador único |
| `ubicacion_nombre` | string | MVP | Nombre de la ubicación (ej. "Casa", "Facultad") |
| `ubicacion_latitud` | number (-90 a 90) | MVP | Usada para consultar el pronóstico real en Open-Meteo |
| `ubicacion_longitud` | number (-180 a 180) | MVP | Idem |

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

Se administra desde el ABM en la vista "Metas". El progreso (tareas completadas / tareas asociadas) se calcula al vuelo filtrando `estado.tareas` por `meta_id`, no se guarda como campo. Al eliminar una meta, las tareas que la referenciaban quedan con `meta_id: null`.

## Persona

| Campo | Tipo | Fase | Descripción |
|---|---|---|---|
| `persona_id` | string (UUID) | MVP | Identificador único |
| `persona_nombre` | string | MVP | Nombre de la persona (ej. "Mamá", "Juan") |
| `persona_ultimo_contacto` | string (`YYYY-MM-DD`) \| "", opcional | MVP | Fecha del último encuentro/contacto registrado. Vacío = nunca registrado |
| `persona_creada_en` | string (ISO datetime) | MVP | Timestamp de creación |

Se administra desde el ABM en la vista "Personas", sin relación con Tareas por ahora. La lista se ordena de mayor a menor tiempo sin contacto; el botón "Marcar contacto hoy" actualiza `persona_ultimo_contacto` a la fecha actual.

## Estructura de los archivos de datos

- `datos/categorias.json` → `{ "categorias": Categoria[], "ubicaciones": Ubicacion[], "metas": Meta[], "personas": Persona[] }`
- `datos/tareas.json` → `{ "tareas": Tarea[] }`

Los archivos reales con datos personales **no se versionan** (ver `.gitignore`); solo se versionan `datos/categorias.ejemplo.json`, `datos/tareas.ejemplo.json` y `datos/esquema.json`.
