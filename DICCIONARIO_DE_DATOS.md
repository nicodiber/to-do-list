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
| `fecha_inicio_posible` | string (`YYYY-MM-DD`) | Fase 2 | A partir de cuándo se puede empezar (earliest start date) |
| `divisible` | boolean (default `false`) | Fase 2 | Si se puede pausar y retomar, o debe hacerse de punta a punta |
| `dias_habiles` | array de strings | Fase 2 | Días de la semana en que se puede realizar |
| `dependencias` | array de `Tarea.id` | Fase 2 | Tareas que deben completarse antes de habilitar esta |
| `mantenimiento` | objeto `{ intervalo, desde }` | Fase 2 | Regla de ciclicidad para tareas de mantenimiento recurrente |
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
