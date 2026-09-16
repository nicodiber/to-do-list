# Diccionario de datos

Referencia 1:1 con [datos/esquema.json](datos/esquema.json) y con las factories de [assets/js/modelos.js](assets/js/modelos.js). Las fechas se guardan internamente en formato ISO (`YYYY-MM-DD`) y se muestran en pantalla como `DD/MM/YYYY`.

Convención de nombres: cada campo propio de una entidad se prefija con el nombre de la entidad (patrón `entidad_atributo`, ej. `Tarea.nombre` → `tarea_nombre`), para evitar ambigüedad cuando una entidad referencia atributos de otra. Los campos que ya son una referencia a otra entidad (`categoria_id`, `subcategoria_id`, `ubicacion_id`, `dependencias`, `metas_ids`) quedan sin ese prefijo, porque ya son inequívocos.

## Categoria

| Campo | Tipo | Fase | Descripción |
|---|---|---|---|
| `categoria_id` | string (UUID) | MVP | Identificador único |
| `categoria_nombre` | string | MVP | Nombre del área de vida (ej. "Personal", "Facultad", "Trabajo") |
| `categoria_color` | string (hex) | MVP | Color identificatorio en la UI |
| `categoria_orden` | number | MVP | Orden de presentación / prioridad relativa entre categorías |
| `categoria_disfrute` | number (1-5, default `3`) | MVP | Cuánto disfrutás las tareas de esta categoría. Se define al crearla (sin edición posterior, igual que `categoria_color`). Al completar una tarea de una categoría con `categoria_disfrute` bajo (1-2), se sugiere continuar con una tarea accionable de una categoría con `categoria_disfrute` alto (4-5) — principio de Premack a nivel categoría |

## Subcategoria

| Campo | Tipo | Fase | Descripción |
|---|---|---|---|
| `subcategoria_id` | string (UUID) | MVP | Identificador único |
| `categoria_id` | string (UUID) | MVP | Referencia a `Categoria.categoria_id` |
| `subcategoria_nombre` | string | MVP | Nombre de la subcategoría (ej. "Hobbies", "Exámenes") |
| `subcategoria_color` | string (hex), default = color de la categoría padre al crearla | MVP | Se puede elegir distinto al de la categoría; si la tarea tiene subcategoría, su badge usa este color en vez del de la categoría |

## Tarea

| Campo | Tipo | Fase | Descripción |
|---|---|---|---|
| `tarea_id` | string (UUID) | MVP | Identificador único |
| `tarea_nombre` | string | MVP | Título de la tarea |
| `categoria_id` | string (UUID) \| null | MVP | Referencia a `Categoria.categoria_id` |
| `subcategoria_id` | string (UUID) \| null | MVP | Referencia a `Subcategoria.subcategoria_id` |
| `tarea_estado` | enum: `a_confirmar` \| `pendiente` \| `en_progreso` \| `completada` | MVP | Estado actual de la tarea |
| `tarea_fecha_limite` | string (`YYYY-MM-DD`) \| "" | MVP | Fecha en la que la tarea debe estar completada sí o sí (deadline) |
| `tarea_fecha_sugerida` | string (`YYYY-MM-DD`) \| "" | MVP | Fecha recomendada, no obligatoria |
| `tarea_duracion_estimada_min` | number (múltiplo de 15) | MVP | Duración estimada en minutos |
| `tarea_notas` | string | MVP | Texto libre: recursos, procedimiento, referencias |
| `tarea_creada_en` | string (ISO datetime) | MVP | Timestamp de creación |
| `tarea_completada_en` | string (ISO datetime) \| null | MVP | Timestamp de finalización |
| `tarea_fecha_inicio_posible` | string (`YYYY-MM-DD`) \| "" | MVP | A partir de cuándo se puede empezar (earliest start date). En la vista "Hoy" las tareas con esta fecha en el futuro se muestran aparte, en "Todavía no pueden empezar" |
| `tarea_fecha_hora_agendada` | string (ISO datetime) \| "" | MVP | Cuándo se planea concretamente hacer la tarea. Se define con el botón "Posponer" (atajos de día + horario: mañana 07:00, tarde 12:00, tardecita 17:00, noche 20:00) |
| `tarea_duracion_real_min` | number \| null | MVP | Duración real registrada al marcar la tarea como cumplida desde el asistente de cierre de la vista "Hoy" |
| `tarea_notificada_en_para` | string (ISO datetime) \| "" | MVP | Valor de `tarea_fecha_hora_agendada` para el cual ya se disparó la notificación local. Si se reprograma la tarea (cambia `tarea_fecha_hora_agendada`), deja de coincidir y vuelve a ser candidata a notificarse |
| `dependencias` | array de `Tarea.tarea_id` | MVP | Tareas que deben estar `completada` para que esta se considere accionable. Se edita desde el panel "Dependencias" en la vista Tareas |
| `tarea_mantenimiento` | `{ cantidad: number, unidad: 'dias' \| 'semanas' \| 'meses' }` \| null | MVP | Si está seteado, al completar la tarea se clona una nueva instancia pendiente con `tarea_fecha_limite` = fecha real de finalización + este intervalo |
| `tarea_divisible` | boolean (default `false`) | MVP | Si se puede pausar y retomar, o debe hacerse de punta a punta. Informativo, no gatea lógica todavía |
| `tarea_dias_habiles` | array de números 0-6 (0=domingo), default `[]` | MVP | Días de la semana en que se puede realizar. Vacío = sin restricción. Al posponer la tarea, el panel de reprogramar salta automáticamente al próximo día hábil si la fecha elegida cae en un día no permitido |
| `ubicacion_id` | string \| null | MVP | Referencia a `Ubicacion.ubicacion_id` (ver más abajo). Sin GPS: se elige a mano del ABM de Ubicaciones. Se usa para el badge, el filtro manual en Tareas/Hoy, y para resolver lat/lon al chequear `tarea_requiere_clima_bueno` |
| `tarea_requiere_clima_bueno` | boolean (default `false`) | MVP | Si está en `true` y la tarea tiene `ubicacion_id` con coordenadas y una fecha resoluble dentro de los próximos 16 días, en Hoy y en las vistas de 3/8 días se consulta el pronóstico real (Open-Meteo) y se avisa si la probabilidad de lluvia es alta |
| `tarea_multitasking` | boolean (default `false`) | MVP | Si se puede hacer en simultáneo con otra actividad de baja atención (ej. escuchar un podcast mientras se plancha). Checkbox en el alta y en editar, badge "🎧 Multitasking" y filtro "Solo multitasking" en la vista Tareas |
| `metas_ids` | array de `Meta.meta_id`, default `[]` | MVP | Metas/propósitos de vida a los que aporta esta tarea. Se edita desde el panel "Metas" en la vista Tareas |
| `tarea_recompensa` | string, default `""` | MVP | Texto libre y opcional (ej. "10 min de redes"). Badge "🎁" en los listados; al completar la tarea desde cualquiera de los 3 caminos se muestra un aviso con la recompensa. Se copia a la instancia clonada si la tarea es de mantenimiento |
| `tarea_importancia` | enum: `baja` \| `media` \| `alta`, default `media` | MVP | Nivel de importancia de la tarea, más allá de fechas y estado (ej. un examen es más importante que un trámite menor aunque venzan el mismo día). Se usa como primer criterio de `compararPorPrioridad` (antes que la prioridad de categoría) para ordenar Tareas, Hoy y las vistas de 3/8 días; badge con ícono (🔴/🟡/🟢) en las 3 vistas, y filtro en Tareas |
| `tarea_costo_estimado` | number, default `0` | MVP | Costo monetario estimado, opcional. Badge "💰" en Tareas/Hoy/3-8 días; se suma en Informes para proyectar el costo de las tareas pendientes. Se copia a la instancia clonada si la tarea es de mantenimiento |
| `tarea_costo_real` | number \| null, default `null` | MVP | Costo real, cargado opcionalmente al completar la tarea desde Hoy o "Revisar mi día" (mismo momento que `tarea_duracion_real_min`). Se usa en Informes para comparar contra `tarea_costo_estimado` |

## Ubicacion

| Campo | Tipo | Fase | Descripción |
|---|---|---|---|
| `ubicacion_id` | string (UUID) | MVP | Identificador único |
| `ubicacion_nombre` | string | MVP | Nombre de la ubicación (ej. "Casa", "Facultad") |
| `ubicacion_latitud` | number (-90 a 90) | MVP | Usada para consultar el pronóstico real en Open-Meteo |
| `ubicacion_longitud` | number (-180 a 180) | MVP | Idem |

Se administra desde el ABM en la vista "Ubicaciones" (igual que Categorías, pero sin subcategorías). Al eliminar una ubicación, las tareas que la referenciaban quedan con `ubicacion_id: null`.

## Meta

| Campo | Tipo | Fase | Descripción |
|---|---|---|---|
| `meta_id` | string (UUID) | MVP | Identificador único |
| `meta_nombre` | string | MVP | Nombre del objetivo/propósito |
| `meta_plazo` | enum: `corto` \| `mediano` \| `largo` | MVP | Horizonte temporal de la meta |
| `meta_descripcion` | string, default `""` | MVP | Texto libre opcional |
| `meta_fecha_objetivo` | string (`YYYY-MM-DD`) \| "", opcional | MVP | Fecha en la que se aspira a cumplir la meta |
| `meta_creada_en` | string (ISO datetime) | MVP | Timestamp de creación |

Se administra desde el ABM en la vista "Metas". El progreso (tareas completadas / tareas asociadas) se calcula al vuelo filtrando `estado.tareas` por `metas_ids`, no se guarda como campo. Al eliminar una meta, las tareas que la referenciaban quedan sin esa entrada en `metas_ids`.

## Persona

| Campo | Tipo | Fase | Descripción |
|---|---|---|---|
| `persona_id` | string (UUID) | MVP | Identificador único |
| `persona_nombre` | string | MVP | Nombre de la persona (ej. "Mamá", "Juan") |
| `persona_ultimo_contacto` | string (`YYYY-MM-DD`) \| "", opcional | MVP | Fecha del último encuentro/contacto registrado. Vacío = nunca registrado |
| `persona_notas` | string, default `""` | MVP | Texto libre opcional (ej. "hermana", "amigo de la facu") |
| `persona_creada_en` | string (ISO datetime) | MVP | Timestamp de creación |

Se administra desde el ABM en la vista "Personas", sin relación con Tareas por ahora. La lista se ordena de mayor a menor tiempo sin contacto (las sin `persona_ultimo_contacto` registrado quedan primero); el botón "Marcar contacto hoy" actualiza `persona_ultimo_contacto` a la fecha actual.

## Estructura de los archivos de datos

- `datos/categorias.json` → `{ "categorias": Categoria[], "subcategorias": Subcategoria[], "ubicaciones": Ubicacion[], "metas": Meta[], "personas": Persona[] }`
- `datos/tareas.json` → `{ "tareas": Tarea[] }`

Los archivos reales con datos personales **no se versionan** (ver `.gitignore`); solo se versionan `datos/categorias.ejemplo.json`, `datos/tareas.ejemplo.json` y `datos/esquema.json`.
