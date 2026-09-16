# Reglas de prioridad

Documento de referencia sobre qué determina el orden/prioridad de las tareas en la app, y cómo se usa ese criterio en cada vista. Complementa a [DICCIONARIO_DE_DATOS.md](DICCIONARIO_DE_DATOS.md) (nombres de campo) y a [LOGICA_FUNCIONES.md](LOGICA_FUNCIONES.md) (qué hace cada función). La lógica central vive en `assets/js/tareas-logica.js`; este archivo la explica en lenguaje natural, sin repetir el código.

## Qué determina la prioridad de una tarea

`compararPorPrioridad(a, b, categorias)` es el criterio base que usa el resto de la app para decidir "cuál tarea va primero". Compara dos tareas en dos pasos, en este orden:

1. **`tarea_importancia`** (`alta` > `media` > `baja`): si difiere entre las dos tareas, gana la de mayor importancia. Es el primer criterio a propósito — una tarea marcada `alta` siempre se antepone a una `media`/`baja`, sin importar fechas.
2. **`categoria_orden`** de la categoría de cada tarea (vía `categoria_id`): si la importancia es igual, gana la de menor `categoria_orden` (menor número = más prioritaria). Se reordena manualmente con los botones ▲/▼ en la vista Categorías. Una tarea sin categoría, o cuya categoría ya no existe, queda siempre al final (`categoria_orden` efectivo = infinito).

Este criterio por sí solo **no mira fechas** — las fechas se suman como desempate adicional en cada vista (ver más abajo), no dentro de `compararPorPrioridad`.

## Tareas bloqueadas y accionables

- **Bloqueada** (`tareaEstaBloqueada`): una tarea está bloqueada si tiene al menos una entrada en `dependencias` que apunta a otra tarea que todavía no está `tarea_estado: 'completada'`. Se recalcula al vuelo, no se guarda como campo.
- **Accionable** (`esTareaAccionable`): una tarea es accionable si no está completada, si su `tarea_fecha_inicio_posible` ya llegó (o no tiene una), y si no está bloqueada. Es el filtro base que usan el Enfoque 80/20, el panel "Reestructurar prioridades con IA" y la proyección de tareas en la vista Semana.

## Cómo se usa este criterio en cada vista

- **Hoy — "Urgentes"**: tareas accionables y ya disponibles (`tarea_fecha_inicio_posible` alcanzada) cuya `tarea_fecha_limite` está vencida o es hoy, ordenadas solo por `compararPorPrioridad` (sin desempate de fecha adicional, porque todas comparten la urgencia de "hoy o antes").
- **Hoy — "Resto de tus pendientes"** y **Tareas — listado general**: el resto de las tareas disponibles, ordenadas primero por `tarea_fecha_limite` (las sin fecha van al final) y recién como desempate por `compararPorPrioridad`. Acá la fecha manda porque no todas comparten la misma urgencia.
- **3 días / 8 días** (`assets/js/vista-agenda.js`): las tareas se agrupan por día según `fechaDeReferencia` (`tarea_fecha_hora_agendada` > `tarea_fecha_limite` > `tarea_fecha_sugerida`, la primera que tenga valor). Dentro de cada día, se ordenan por `tarea_fecha_hora_agendada` y luego por `compararPorPrioridad`.
- **Semana**: las tareas "fijas" (con `tarea_fecha_hora_agendada` dentro del día) se ubican en su horario exacto sin competir por orden. Las tareas "proyectadas" (sin horario agendado, cuya `tarea_fecha_sugerida` o `tarea_fecha_limite` cae ese día) se ordenan por `compararPorPrioridad` y se apilan una detrás de otra, cada una ocupando su `tarea_duracion_estimada_min` a partir de donde terminó la anterior — así la tarea más prioritaria del día siempre queda primera en la grilla.
- **Tabla**: ordenada solo por `fechaDeReferencia` (la misma función que agenda/3-8 días), sin usar `compararPorPrioridad` — es una vista de referencia tipo planilla, no de triage.
- **Gantt**: ordenada por fecha de inicio de la tarea (`tarea_fecha_inicio_posible` > `tarea_fecha_sugerida` > `tarea_fecha_limite` > `tarea_creada_en`) y luego por `compararPorPrioridad`, dentro de cada meta.

## Regla 80/20 (Pareto)

`calcularEnfoque8020(tareas, categorias)`: de todas las tareas **accionables**, ordena por `compararPorPrioridad` con `tarea_fecha_limite` como desempate final, y devuelve el 20% superior (redondeado hacia arriba). Es "el puñado de tareas en las que más conviene enfocarse ahora". Se muestra como badge "🎯 Foco 80/20" en Tareas y Hoy, y como lista en la sección "Enfoque 80/20 (Pareto)" de Informes.
