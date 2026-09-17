# Reglas de prioridad

Documento de referencia sobre qué determina el orden/prioridad de las tareas en la app. Complementa a [DICCIONARIO_DE_DATOS.md](DICCIONARIO_DE_DATOS.md) (nombres de campo) y a [LOGICA_FUNCIONES.md](LOGICA_FUNCIONES.md) (qué hace cada función). La lógica vive en `assets/js/tareas-logica.js`.

## Estado actual: versión provisoria (Ronda 1 del rediseño de datos)

`compararPorPrioridad(a, b, categorias)` ordena **solo por `categoria_prioridad`** de la categoría directa de cada tarea (menor número = más prioritaria). Una tarea sin categoría, o cuya categoría ya no existe, queda siempre al final.

Esto es deliberadamente simple: el rediseño del modelo de datos (Categoria con jerarquía, `tarea_importancia` como `urgente`/`importante`, `tarea_genera_dinero`) se hizo en una ronda separada de definir el algoritmo real de prioridad. Mientras tanto, para que la app no quede sin ningún criterio de orden, alcanza con reordenar las categorías manualmente (▲/▼ en la vista Categorías) para reflejar lo que más importa — por ejemplo, poniendo arriba de todo la categoría "Facultad".

**El algoritmo real queda pendiente de definir en una Ronda 2**, con la idea de fondo del usuario como punto de partida: primero las tareas de la categoría que representa "aprobar los exámenes de la universidad" (obligatorias y no obligatorias por igual), segundo las que generan dinero (`tarea_genera_dinero`, sin importar la categoría), y el resto intercalado entre categorías para avanzar parejo en todas en vez de vaciar una por vez. Ahí también hay que resolver: qué rol cumple `tarea_importancia` (`urgente`/`importante`) en esa jerarquía, y cómo se relaciona con las fechas (`tarea_fecha_limite`) que hoy siguen siendo el criterio principal de orden en la mayoría de las vistas.

## Tareas bloqueadas y accionables

- **Bloqueada**: `tarea_estado === 'bloqueada'` — es un valor persistido, no calculado (ver `DICCIONARIO_DE_DATOS.md`, campo `tarea_dependiente`).
- **Accionable** (`esTareaAccionable`): una tarea es accionable si está `pendiente` (ni bloqueada ni completada) y su `tarea_fecha_inicio_habilitada` ya llegó. Es el filtro base que usan el Enfoque 80/20, el panel "Reestructurar prioridades con IA" y la proyección de tareas en la vista Semana.

## Cómo se usa el criterio actual en cada vista

- **Hoy — "Urgentes"**: tareas accionables cuya `tarea_fecha_limite` está vencida o es hoy, ordenadas por `compararPorPrioridad`.
- **Hoy — "Resto de tus pendientes"** y **Tareas — listado general**: ordenadas primero por `tarea_fecha_limite` (las sin fecha van al final) y como desempate por `compararPorPrioridad`.
- **3 días / 8 días** (`assets/js/vista-agenda.js`): agrupadas por día según `fechaDeReferencia` (`tarea_fecha_sugerida` > `tarea_fecha_limite`, la primera con valor). Dentro de cada día, por `tarea_fecha_sugerida` y luego `compararPorPrioridad`.
- **Semana**: las tareas con horario puntual (`tarea_fecha_sugerida` con hora) se ubican en su horario exacto. Las proyectadas (sin hora, cuya fecha de referencia cae ese día) se ordenan por `compararPorPrioridad` y se apilan una detrás de otra según su `tarea_duracion_min`.
- **Tabla**: ordenada solo por `fechaDeReferencia`, sin `compararPorPrioridad` — es una vista de referencia tipo planilla, no de triage.
- **Gantt**: ordenada por fecha de inicio de la tarea y luego por `compararPorPrioridad`, dentro de cada meta.

## Regla 80/20 (Pareto)

`calcularEnfoque8020(tareas, categorias)`: de todas las tareas accionables, ordena por `compararPorPrioridad` con `tarea_fecha_limite` como desempate final, y devuelve el 20% superior (redondeado hacia arriba). Se muestra como badge "🎯 Foco 80/20" en Tareas y Hoy, y como lista en Informes.
