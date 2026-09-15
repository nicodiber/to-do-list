# Diccionario de datos

Referencia 1:1 con [datos/esquema.json](datos/esquema.json) y con las factories de [assets/js/modelos.js](assets/js/modelos.js). Las fechas se guardan internamente en formato ISO (`YYYY-MM-DD`) y se muestran en pantalla como `DD/MM/YYYY`.

## Categoria

| Campo | Tipo | Fase | Descripción |
|---|---|---|---|
| `id` | string (UUID) | MVP | Identificador único |
| `nombre` | string | MVP | Nombre del área de vida (ej. "Personal", "Facultad", "Trabajo") |
| `color` | string (hex) | MVP | Color identificatorio en la UI |
| `orden` | number | MVP | Orden de presentación / prioridad relativa entre categorías |
| `disfrute` | number (1-5, default `3`) | MVP | Cuánto disfrutás las tareas de esta categoría. Se define al crearla (sin edición posterior, igual que `color`). Al completar una tarea de una categoría con `disfrute` bajo (1-2), se sugiere continuar con una tarea accionable de una categoría con `disfrute` alto (4-5) — principio de Premack a nivel categoría |

## Subcategoria

| Campo | Tipo | Fase | Descripción |
|---|---|---|---|
| `id` | string (UUID) | MVP | Identificador único |
| `categoria_id` | string (UUID) | MVP | Referencia a `Categoria.id` |
| `nombre` | string | MVP | Nombre de la subcategoría (ej. "Hobbies", "Exámenes") |
| `color` | string (hex), default = color de la categoría padre al crearla | MVP | Se puede elegir distinto al de la categoría; si la tarea tiene subcategoría, su badge usa este color en vez del de la categoría |

## Tarea

| Campo | Tipo | Fase | Descripción |
|---|---|---|---|
| `id` | string (UUID) | MVP | Identificador único |
| `nombre` | string | MVP | Título de la tarea |
| `categoria_id` | string (UUID) \| null | MVP | Referencia a `Categoria.id` |
| `subcategoria_id` | string (UUID) \| null | MVP | Referencia a `Subcategoria.id` |
| `estado` | enum: `a_confirmar` \| `pendiente` \| `en_progreso` \| `completada` | MVP | Estado actual de la tarea |
| `fecha_limite` | string (`YYYY-MM-DD`) \| "" | MVP | Fecha en la que la tarea debe estar completada sí o sí (deadline) |
| `fecha_sugerida` | string (`YYYY-MM-DD`) \| "" | MVP | Fecha recomendada, no obligatoria |
| `duracion_estimada_min` | number (múltiplo de 15) | MVP | Duración estimada en minutos |
| `notas` | string | MVP | Texto libre: recursos, procedimiento, referencias |
| `creada_en` | string (ISO datetime) | MVP | Timestamp de creación |
| `completada_en` | string (ISO datetime) \| null | MVP | Timestamp de finalización |
| `fecha_inicio_posible` | string (`YYYY-MM-DD`) \| "" | MVP | A partir de cuándo se puede empezar (earliest start date). En la vista "Hoy" las tareas con esta fecha en el futuro se muestran aparte, en "Todavía no pueden empezar" |
| `fecha_hora_agendada` | string (ISO datetime) \| "" | MVP | Cuándo se planea concretamente hacer la tarea. Se define con el botón "Posponer" (atajos de día + horario: mañana 07:00, tarde 12:00, tardecita 17:00, noche 20:00) |
| `duracion_real_min` | number \| null | MVP | Duración real registrada al marcar la tarea como cumplida desde el asistente de cierre de la vista "Hoy" |
| `motivo_incumplimiento` | string | MVP | Motivo indicado la última vez que se marcó la tarea como "no cumplida" desde el asistente de cierre |
| `dependencias` | array de `Tarea.id` | MVP | Tareas que deben estar `completada` para que esta se considere accionable. Se edita desde el panel "Dependencias" en la vista Tareas |
| `mantenimiento` | `{ cantidad: number, unidad: 'dias' \| 'semanas' \| 'meses' }` \| null | MVP | Si está seteado, al completar la tarea se clona una nueva instancia pendiente con `fecha_limite` = fecha real de finalización + este intervalo |
| `divisible` | boolean (default `false`) | MVP | Si se puede pausar y retomar, o debe hacerse de punta a punta. Informativo, no gatea lógica todavía |
| `dias_habiles` | array de números 0-6 (0=domingo), default `[]` | MVP | Días de la semana en que se puede realizar. Vacío = sin restricción. Al posponer la tarea, el panel de reprogramar salta automáticamente al próximo día hábil si la fecha elegida cae en un día no permitido |
| `ubicacion_id` | string \| null | MVP | Referencia a `Ubicacion.id` (ver más abajo). Sin GPS: se elige a mano del ABM de Ubicaciones. Se usa para el badge, el filtro manual en Tareas/Hoy, y para resolver lat/lon al chequear `requiere_clima_bueno` |
| `requiere_clima_bueno` | boolean (default `false`) | MVP | Si está en `true` y la tarea tiene `ubicacion_id` con coordenadas y una fecha resoluble dentro de los próximos 16 días, en Hoy y en las vistas de 3/8 días se consulta el pronóstico real (Open-Meteo) y se avisa si la probabilidad de lluvia es alta |
| `multitasking` | boolean (default `false`) | MVP | Si se puede hacer en simultáneo con otra actividad de baja atención (ej. escuchar un podcast mientras se plancha). Checkbox en el alta y en editar, badge "🎧 Multitasking" y filtro "Solo multitasking" en la vista Tareas |
| `metas_ids` | array de `Meta.id`, default `[]` | MVP | Metas/propósitos de vida a los que aporta esta tarea. Se edita desde el panel "Metas" en la vista Tareas |
| `recompensa` | string, default `""` | MVP | Texto libre y opcional (ej. "10 min de redes"). Badge "🎁" en los listados; al completar la tarea desde cualquiera de los 3 caminos se muestra un aviso con la recompensa. Se copia a la instancia clonada si la tarea es de mantenimiento |
| `importancia` | enum: `baja` \| `media` \| `alta`, default `media` | MVP | Nivel de importancia de la tarea, más allá de fechas y estado (ej. un examen es más importante que un trámite menor aunque venzan el mismo día). Se usa como primer criterio de `compararPorPrioridad` (antes que la prioridad de categoría) para ordenar Tareas, Hoy y las vistas de 3/8 días; badge con ícono (🔴/🟡/🟢) en las 3 vistas, y filtro en Tareas |
| `costo_estimado` | number, default `0` | MVP | Costo monetario estimado, opcional. Badge "💰" en Tareas/Hoy/3-8 días; se suma en Informes para proyectar el costo de las tareas pendientes. Se copia a la instancia clonada si la tarea es de mantenimiento |
| `costo_real` | number \| null, default `null` | MVP | Costo real, cargado opcionalmente al completar la tarea desde Hoy o "Revisar mi día" (mismo momento que `duracion_real_min`). Se usa en Informes para comparar contra `costo_estimado` |

## Ubicacion

| Campo | Tipo | Fase | Descripción |
|---|---|---|---|
| `id` | string (UUID) | MVP | Identificador único |
| `nombre` | string | MVP | Nombre de la ubicación (ej. "Casa", "Facultad") |
| `latitud` | number (-90 a 90) | MVP | Usada para consultar el pronóstico real en Open-Meteo |
| `longitud` | number (-180 a 180) | MVP | Idem |

Se administra desde el ABM en la vista "Ubicaciones" (igual que Categorías, pero sin subcategorías). Al eliminar una ubicación, las tareas que la referenciaban quedan con `ubicacion_id: null`.

## Meta

| Campo | Tipo | Fase | Descripción |
|---|---|---|---|
| `id` | string (UUID) | MVP | Identificador único |
| `nombre` | string | MVP | Nombre del objetivo/propósito |
| `plazo` | enum: `corto` \| `mediano` \| `largo` | MVP | Horizonte temporal de la meta |
| `descripcion` | string, default `""` | MVP | Texto libre opcional |
| `fecha_objetivo` | string (`YYYY-MM-DD`) \| "", opcional | MVP | Fecha en la que se aspira a cumplir la meta |
| `creada_en` | string (ISO datetime) | MVP | Timestamp de creación |

Se administra desde el ABM en la vista "Metas". El progreso (tareas completadas / tareas asociadas) se calcula al vuelo filtrando `estado.tareas` por `metas_ids`, no se guarda como campo. Al eliminar una meta, las tareas que la referenciaban quedan sin esa entrada en `metas_ids`.

## Persona

| Campo | Tipo | Fase | Descripción |
|---|---|---|---|
| `id` | string (UUID) | MVP | Identificador único |
| `nombre` | string | MVP | Nombre de la persona (ej. "Mamá", "Juan") |
| `ultimo_contacto` | string (`YYYY-MM-DD`) \| "", opcional | MVP | Fecha del último encuentro/contacto registrado. Vacío = nunca registrado |
| `notas` | string, default `""` | MVP | Texto libre opcional (ej. "hermana", "amigo de la facu") |
| `creada_en` | string (ISO datetime) | MVP | Timestamp de creación |

Se administra desde el ABM en la vista "Personas", sin relación con Tareas por ahora. La lista se ordena de mayor a menor tiempo sin contacto (las sin `ultimo_contacto` registrado quedan primero); el botón "Marcar contacto hoy" actualiza `ultimo_contacto` a la fecha actual.

## Estructura de los archivos de datos

- `datos/categorias.json` → `{ "categorias": Categoria[], "subcategorias": Subcategoria[], "ubicaciones": Ubicacion[], "metas": Meta[], "personas": Persona[] }`
- `datos/tareas.json` → `{ "tareas": Tarea[] }`

Los archivos reales con datos personales **no se versionan** (ver `.gitignore`); solo se versionan `datos/categorias.ejemplo.json`, `datos/tareas.ejemplo.json` y `datos/esquema.json`.
