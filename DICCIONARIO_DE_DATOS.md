# Diccionario de datos

Referencia 1:1 con [datos/esquema.json](datos/esquema.json) y con las factories de [assets/js/modelos.js](assets/js/modelos.js). Las fechas se guardan internamente en formato ISO (`YYYY-MM-DD`) y se muestran en pantalla como `DD/MM/YYYY`.

## Categoria

| Campo | Tipo | Fase | Descripción |
|---|---|---|---|
| `id` | string (UUID) | MVP | Identificador único |
| `nombre` | string | MVP | Nombre del área de vida (ej. "Personal", "Facultad", "Trabajo") |
| `color` | string (hex) | MVP | Color identificatorio en la UI |
| `orden` | number | MVP | Orden de presentación / prioridad relativa entre categorías |

## Subcategoria

| Campo | Tipo | Fase | Descripción |
|---|---|---|---|
| `id` | string (UUID) | MVP | Identificador único |
| `categoria_id` | string (UUID) | MVP | Referencia a `Categoria.id` |
| `nombre` | string | MVP | Nombre de la subcategoría (ej. "Hobbies", "Exámenes") |

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
| `ubicacion` | string, default `""` | MVP | Texto libre y opcional. Sin GPS ni geolocalización: solo sirve para mostrar un badge y para filtrar manualmente en Tareas/Hoy ("¿dónde estás?") |
| `multitasking` | boolean | Fase 2 | Si se puede hacer en simultáneo con otra tarea de baja atención |
| `costo` | number | Fase 3 | Costo monetario estimado o real asociado |
| `ubicacion` | string / coordenadas | Fase 3 | Lugar del que depende la tarea |
| `condicion_climatica` | string | Fase 3 | Requisito de clima para poder realizarla |
| `recompensa` | string | Fase 4 | Recompensa asociada según dificultad/importancia |
| `metas_ids` | array de `Meta.id` | Fase 4 | Metas/propósitos de vida a los que aporta esta tarea |

## Estructura de los archivos de datos

- `datos/categorias.json` → `{ "categorias": Categoria[], "subcategorias": Subcategoria[] }`
- `datos/tareas.json` → `{ "tareas": Tarea[] }`

Los archivos reales con datos personales **no se versionan** (ver `.gitignore`); solo se versionan `datos/categorias.ejemplo.json`, `datos/tareas.ejemplo.json` y `datos/esquema.json`.
