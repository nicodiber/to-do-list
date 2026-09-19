# Reglas de prioridad

Documento de referencia sobre qué determina el orden/prioridad de las tareas en la app. Complementa a [DICCIONARIO_DE_DATOS.md](DICCIONARIO_DE_DATOS.md) (nombres de campo) y a [LOGICA_FUNCIONES.md](LOGICA_FUNCIONES.md) (qué hace cada función). La lógica vive en `assets/js/tareas-logica.js`.

## Holgura: cuánto margen le queda a una tarea

La holgura (`calcularHolguraDias`) es cuántos días de margen le quedan a una tarea antes de que sea imposible cumplir su `tarea_fecha_limite`, contados **desde hoy** (no desde que se creó la tarea):

```
holgura = tarea_fecha_limite − max(ahora, tarea_fecha_inicio_habilitada)
```

- Sin `tarea_fecha_limite` → holgura infinita (sin apuro por este criterio).
- Negativa → la tarea está vencida.
- Un `tarea_fecha_limite` sin hora se interpreta como el final de ese día (23:59:59), no la medianoche — para que una tarea que vence "hoy" no aparezca vencida a las 9am. `tarea_fecha_inicio_habilitada` sin hora se interpreta como el inicio del día.
- Como se calcula desde "ahora", una tarea que se va posponiendo sin tocarla va perdiendo holgura sola con el paso de los días — sube de prioridad automáticamente sin que el usuario haga nada.

La holgura se agrupa en bandas, para que una diferencia de pocos días no tape la prioridad real de las categorías:

| Banda | Rango |
|---|---|
| 0 | Vencida (`< 0` días) |
| 1 | `0-3` días |
| 2 | `4-7` días |
| 3 | `8-15` días |
| 4 | `16-30` días |
| 5 | `> 31` días, o sin fecha límite |

## `compararPorPrioridad(a, b, categorias)` — orden de criterios

1. **Banda de holgura** — el criterio dominante. Una tarea vencida o por vencer siempre le gana a una que tiene mucho margen, sin importar su categoría.
2. **Categoría raíz**: dentro de la misma banda, se compara la `categoria_prioridad` de la categoría **raíz** de cada tarea (recorriendo `categoria_padre_id` hasta el final con `categoriaRaiz`, en `utilidades.js`). Así, una tarea de una materia de Facultad compite con la prioridad de "Facultad" entre las categorías raíz, no con la de la materia en sí. Sin categoría, o categoría inexistente, queda al final.
3. **Categoría directa**: desempate entre tareas de distinta categoría pero la misma raíz (ej. dos materias de Facultad) — se usa la `categoria_prioridad` de la categoría propia de cada tarea, entre sus hermanas.
4. **`tarea_importancia`**: urgente > importante > sin definir.
5. **`tarea_prioridad_manual`** (`?? Infinity`, menor = más prioritaria) — resultado de la herramienta "Versus" (ver más abajo). `null` = sin preferencia manual, no participa.
6. **`tarea_creada_en`** ascendente (FIFO) — último recurso, para que el orden sea siempre determinístico (no queden empates verdaderos).

Los niveles 1-4 se conocen internamente como `compararEstructural` — es lo que determina si 2 tareas están "empatadas" para la herramienta Versus (ver abajo), independientemente de si ya tienen o no un `tarea_prioridad_manual` asignado.

Ejemplo: con "Facultad" arriba de "Trabajo" entre las categorías raíz (reordenables con ▲/▼ en Categorías), una tarea de Facultad sin apuro (banda 5) sigue perdiendo contra una tarea de Trabajo que vence en 2 días (banda 1) — la banda de holgura pesa más que la categoría. Pero entre dos tareas que vencen ambas "esta semana" (banda 1 o 2), gana la de Facultad.

## Herramienta "Versus" (desempate manual)

Dentro de un mismo grupo empatado en los niveles 1-4, el desempate hoy sería FIFO (arbitrario). "Versus" (botón en la vista Todas) deja resolverlo a mano: agrupa las tareas accionables en clusters mutuamente empatados (`tareasEmpatadas`, transitiva), ofrece pares adyacentes de a uno, y el usuario elige cuál prefiere (o "Da igual / Omitir").

- **Elegir una**: se le asigna `tarea_prioridad_manual` a las 2 tareas del par, usando un contador global creciente (`1 + máximo tarea_prioridad_manual existente`) — la elegida recibe el valor más bajo (más prioritaria), la otra el siguiente. A partir de ahí, esa tarea ya no vuelve a estar "empatada" con nadie (`tareasEmpatadas` descarta cualquier tarea con `tarea_prioridad_manual` ya asignado), así que no se vuelve a ofrecer.
- **Omitir**: no asigna nada — ambas tareas siguen en `null`, genuinamente empatadas. Solo se recuerda (en memoria, mientras se navega la vista) para no volver a ofrecer el mismo par en la misma sesión.
- No es un torneo todos-contra-todos: se ofrecen pares adyacentes dentro de cada cluster, una sola pasada — suficiente para reducir la mayoría de los empates sin pedir demasiadas comparaciones.
- El alcance es global (todas las tareas accionables de la app), no se acota a los filtros activos de la vista Todas.

## `mejorTareaPorCategoria(tareas, categorias)`

Para cada categoría **raíz**, devuelve su tarea accionable de mayor prioridad (mismo criterio de arriba) — la tarea "que bloquea al resto" de esa categoría. Categorías sin ninguna tarea accionable no aparecen en el resultado. Existe porque el orden total de `compararPorPrioridad` tiende a mostrar siempre primero las tareas de la categoría raíz de mayor prioridad (ej. Facultad): cuando no hay nada urgente y el usuario tiene un rato libre, esta función da una opción por categoría para elegir, en vez de empujar siempre hacia la misma. Se usa en la vista Hoy, dentro de "Resto de tus pendientes" → apartado "Elegí por categoría".

## Tareas bloqueadas y accionables

- **Bloqueada**: `tarea_estado === 'bloqueada'` — es un valor persistido, no calculado (ver `DICCIONARIO_DE_DATOS.md`, campo `tarea_dependiente`).
- **Accionable** (`esTareaAccionable`): una tarea es accionable si está `pendiente` (ni bloqueada ni completada) y su `tarea_fecha_inicio_habilitada` ya llegó. Es el filtro base que usan el Enfoque 80/20, `mejorTareaPorCategoria`, el panel "Reestructurar prioridades con IA" y la proyección de tareas en la vista Semana.

## Cómo se usa el criterio en cada vista

- **Hoy — "Urgentes"**: tareas accionables cuya `tarea_fecha_limite` está vencida o es hoy, ordenadas por `compararPorPrioridad`. Cada ítem muestra además su holgura en texto (ej. "Vencida hace 2 días", "Quedan 3 días").
- **Hoy — "Resto de tus pendientes"** y **Tareas — listado general**: ordenadas directamente por `compararPorPrioridad` (las bandas de holgura ya incorporan `tarea_fecha_limite`, no hace falta un pre-orden manual por fecha antes de aplicar el comparador).
- **Hoy — "Elegí por categoría"**: `mejorTareaPorCategoria` sobre las tareas de "Resto".
- **3 días / 8 días** (`assets/js/vista-agenda.js`): agrupadas por día según `fechaDeReferencia` (`tarea_fecha_sugerida` > `tarea_fecha_limite`, la primera con valor). Dentro de cada día, por `tarea_fecha_sugerida` (hora concreta del día) y luego `compararPorPrioridad` como desempate — esto no cambia, porque ahí se ordena por horario del día, no por urgencia de vencimiento.
- **Semana**: las tareas con horario puntual (`tarea_fecha_sugerida` con hora) se ubican en su horario exacto. Las proyectadas se ordenan por `compararPorPrioridad` y se apilan una detrás de otra según su `tarea_duracion_min`.
- **Todas**: por defecto ordenada por `compararPorPrioridad` — es la vista pensada para auditar el orden real de la app y detectar rápido si algo quedó mal priorizado. Clickear el header de una columna cambia a un orden simple por esa columna sola (asc/desc); un botón "↺ Prioridad" vuelve al orden por defecto. Filtros de categoría (inclusivo de descendientes), estado, importancia y buscador por nombre.
- **Gantt**: ordenada por fecha de inicio de la tarea y luego por `compararPorPrioridad`, dentro de cada meta — tampoco cambia, ahí se ordena por posición cronológica en el diagrama.

## Regla 80/20 (Pareto)

`calcularEnfoque8020(tareas, categorias)`: de todas las tareas accionables, ordena por `compararPorPrioridad` (que ya termina siempre en un orden determinístico) y devuelve el 20% superior (redondeado hacia arriba). Se muestra como badge "🎯 Foco 80/20" en Tareas y Hoy, y como lista en Informes.

## Reprogramado de fechas vencidas

`tarea_fecha_sugerida` es una sugerencia sin compromiso real, así que se reprograma **sola**: al iniciar la app, `reprogramarFechasSugeridasVencidas` (`assets/js/tareas-logica.js`) busca tareas activas (no completadas) con `tarea_fecha_sugerida` vencida y la mueve a la próxima fecha disponible (hoy o el próximo día hábil según `tarea_dias_habiles`, sin superar `tarea_fecha_limite` si existe), en cascada a sus dependientes (`reprogramarTareaConCascada`). Si hubo cambios, se avisa con un `alert()`.

`tarea_fecha_limite` es un compromiso real y **nunca se toca sola**: en Hoy, cada tarea vencida en "Urgentes" muestra un botón "📅 Revalorizar fecha límite" que reusa el panel de reprogramar (`crearPanelReprogramar`), pero solo actualiza esa tarea puntual (sin cascada a dependientes, a diferencia de "Posponer").

> Nota (v0.53.1): la etiqueta "🎯 Foco 80/20" de las tarjetas de Hoy y de Tareas se eliminó a pedido del usuario; `calcularEnfoque8020` y la sección "Enfoque 80/20" de Informes siguen por ahora. Ver `BACKLOG.md`.
