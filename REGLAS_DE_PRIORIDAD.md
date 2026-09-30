# Reglas de prioridad

Documento de referencia sobre qué determina el orden/prioridad de las tareas en la app. Complementa a [DICCIONARIO_DE_DATOS.md](DICCIONARIO_DE_DATOS.md) (nombres de campo) y a [LOGICA_FUNCIONES.md](LOGICA_FUNCIONES.md) (qué hace cada función). La lógica vive en `assets/js/tareas-logica.js`.

## Holgura: cuánto margen le queda a una tarea (solo informativa desde v0.90.0)

La holgura (`calcularHolguraDias`/`calcularHolguraHoras`) es cuánto margen le queda a una tarea antes de que sea imposible cumplir su `tarea_fecha_limite`, contado **desde hoy** (no desde que se creó la tarea):

```
holgura = tarea_fecha_limite − max(ahora, tarea_fecha_inicio_habilitada)
```

- Sin `tarea_fecha_limite` → holgura infinita (sin apuro por este criterio).
- Negativa → la tarea está vencida.
- Un `tarea_fecha_limite` sin hora se interpreta como el final de ese día (23:59:59), no la medianoche — para que una tarea que vence "hoy" no aparezca vencida a las 9am. `tarea_fecha_inicio_habilitada` sin hora se interpreta como el inicio del día.
- Como se calcula desde "ahora", una tarea que se va posponiendo sin tocarla va perdiendo holgura sola con el paso de los días.

**Desde v0.90.0 la holgura ya no ordena nada** (se sacaron las bandas anchas de holgura, que tapaban la fecha límite real detrás de la categoría) — queda solo como el texto informativo de cada tarjeta ("Quedan N días", "Vencida hace N días"). El criterio de orden real es la "fecha efectiva" de abajo.

## `compararPorPrioridad(a, b, categorias)` — orden de criterios (v0.90.0)

Repensado en conversación con el usuario: la fecha límite más próxima debe ganar siempre (no una banda ancha de días), la categoría solo desempata cuando no hay fecha límite (o hay un empate exacto), y una tarea que todavía no se puede empezar nunca le gana a una que sí.

```
compararEstructural(A, B)
│
▼
¿Es accionable A distinto de B?
(pendiente, no bloqueada, fecha_inicio_habilitada ≤ hoy o sin cargar — esTareaAccionable)
│
├── Sí, solo una de las dos ──────────► gana la accionable
│
└── No (empatan: las dos lo son, o ninguna)
    │
    ▼
    Para cada tarea, calcular su "fecha efectiva" (fechaEfectiva):
    │
    ├─ ¿Tiene tarea_fecha_limite?
    │   ├─ Sí ─► fecha_efectiva = tarea_fecha_limite                        (tipo 0: REAL)
    │   └─ No ─► ¿tarea_urgente = true?
    │             ├─ Sí ─► fecha_efectiva = día de tarea_fecha_sugerida     (tipo 1: PRESTADA)
    │             │        (el proceso automático "reasignarUrgentesAHoy",
    │             │        assets/js/programador.js, la mantiene siempre en "hoy")
    │             └─ No ─► fecha_efectiva = ∞ (sin apuro)                   (tipo 2: SIN FECHA)
    │
    ▼
    ¿fecha_efectiva(A) ≠ fecha_efectiva(B)?
    │
    ├── Sí ───────────────────────────► gana la más próxima (∞ siempre pierde)
    │
    └── No (empataron en fecha efectiva)
        │
        ▼
        ¿Distinto tipo (una REAL, otra PRESTADA)?
        │
        ├── Sí ───────────────────────► gana la REAL
        │                                (el límite de verdad pesa más que
        │                                 "la puse en hoy por ser urgente")
        │
        └── No (mismo tipo, o ambas ∞)
            │
            ▼
            categoría raíz distinta ────► gana la de categoría raíz más prioritaria
            │
            ▼
            categoría directa distinta ─► gana la de categoría directa más prioritaria
            │
            ▼
            empate estructural (0) ──► sigue en compararPorPrioridad, ver abajo
```

Después de `compararEstructural` (el flujo de arriba), `compararPorPrioridad` suma un último nivel: **`tarea_prioridad_manual`** (`?? Infinity`, menor = más prioritaria) — resultado de la herramienta "Versus" o de reordenar a mano con ▲▼ (ver más abajo, mismo campo para las dos), como desempate final **general** para cualquier empate que llegue hasta acá (v0.90.0 — antes solo tenía sentido para tareas sin fecha límite; ahora también cubre, por ejemplo, dos fechas límite reales idénticas). `null` = sin preferencia manual, no participa. Sin FIFO (v0.90.0, se sacó la comparación por `tarea_creada_en`): un empate genuino más allá de todo esto queda con el orden estable que ya traía el array (en la práctica, cercano al orden de creación).

**Reordenar tareas encadenadas con ▲▼** (v0.75.0): si `actual`/`vecina` están en relación previa/próxima directa, el ▲▼ ya no se bloquea — la app reordena la cadena sola (`intercambiarCadena`, `assets/js/tareas-logica.js`), ajustando `tarea_dependiente` de las tareas involucradas para reflejar el nuevo orden. No pasa por el flujo de arriba: la relación de cadena manda, y de hecho es lo primero que chequea `motivoBloqueoOrdenManual` antes de mirar accionable/fecha efectiva/categoría.

El flujo de `compararEstructural` es lo que determina si 2 tareas están "empatadas" para la herramienta Versus (ver abajo), independientemente de si ya tienen o no un `tarea_prioridad_manual` asignado.

Ejemplos: (1) con "Facultad" arriba de "Trabajo" entre las categorías raíz, una tarea de Facultad que vence en 30 días ahora **pierde** contra una de Trabajo que vence en 2 días (antes ganaba, por caer ambas en una banda ancha) — la fecha más próxima manda siempre que sea distinta. (2) Una tarea `tarea_urgente` sin fecha límite (fecha efectiva = hoy, prestada) le gana a una con límite en 60 días, pero pierde contra una con límite real hoy mismo. (3) Dos tareas urgentes sin límite, ambas con fecha efectiva "hoy": desempata la categoría, aunque cada una haya conseguido una hora de hueco distinta ese mismo día.

## Herramienta "Versus" (desempate manual)

Dentro de un mismo grupo empatado (`compararEstructural`), el desempate por defecto sería el orden que ya trae el array (arbitrario). "Versus" (botón en la vista Tabla) deja resolverlo a mano: agrupa las tareas accionables en clusters mutuamente empatados (`tareasEmpatadas`, transitiva), ofrece pares adyacentes de a uno, y el usuario elige cuál prefiere (o "Da igual / Omitir"). Desde v0.90.0 esto puede darse tanto entre tareas sin fecha límite (el caso más común) como entre dos tareas con la **misma** `tarea_fecha_limite` exacta — antes las bandas anchas de holgura solo agrupaban, en la práctica, a las tareas sin límite.

- **Elegir una**: se le asigna `tarea_prioridad_manual` a las 2 tareas del par, usando un contador global creciente (`1 + máximo tarea_prioridad_manual existente`) — la elegida recibe el valor más bajo (más prioritaria), la otra el siguiente. A partir de ahí, esa tarea ya no vuelve a estar "empatada" con nadie (`tareasEmpatadas` descarta cualquier tarea con `tarea_prioridad_manual` ya asignado), así que no se vuelve a ofrecer.
- **Omitir**: no asigna nada — ambas tareas siguen en `null`, genuinamente empatadas. Solo se recuerda (en memoria, mientras se navega la vista) para no volver a ofrecer el mismo par en la misma sesión.
- No es un torneo todos-contra-todos: se ofrecen pares adyacentes dentro de cada cluster, una sola pasada — suficiente para reducir la mayoría de los empates sin pedir demasiadas comparaciones.
- El alcance es global (todas las tareas accionables de la app), no se acota a los filtros activos de la vista Tabla.

## Reordenar a mano con ▲▼ (Tareas, Tabla y Gantt)

Además de "Versus", las flechas ▲/▼ (en Tareas, en la columna "Orden" de Tabla cuando el orden es el de prioridad, y en el Gantt en modo Plan) dejan mover una tarea un lugar hacia arriba o hacia abajo contra su vecina inmediata. `motivoBloqueoOrdenManual` (`assets/js/tareas-logica.js`) decide si el botón se puede usar; si no, queda deshabilitado con el motivo puntual (qué tarea vecina y por qué) en el `title`.

- **Vecina encadenada** (previa/próxima directa): siempre se puede (v0.75.0 — antes se bloqueaba). En Tareas y Tabla usa `intercambiarCadena` (`assets/js/tareas-logica.js`): invierte el tramo de la cadena (P→A→B→N pasa a P→B→A→N), ajustando `tarea_dependiente` de las tareas involucradas — no toca `tarea_prioridad_manual` ni el flujo de `compararEstructural`, la relación de cadena manda sola. En el Gantt (ver más abajo) sigue con el criterio anterior.
- **Vecina no encadenada, empatada en `compararEstructural`** (accionable, fecha efectiva, categoría raíz y directa, todo igual): en Tareas y Tabla usa `intercambiarAdyacentes` (`assets/js/tareas-logica.js`, v0.74.0) — le da un valor fresco de `tarea_prioridad_manual` a todo el tramo contiguo que sigue empatado y sin cadena (no solo al par tocado), para no saltar por delante de otras tareas del mismo grupo todavía sin decidir. En el Gantt sigue usando `asignarOrdenManual` (la misma de "Versus": valores frescos y crecientes, la que sube se queda con el más bajo) — su adyacencia ya está acotada por carril y día, un caso más chico.
- **Vecina no encadenada y no empatada**: no se puede — cambiar `tarea_prioridad_manual` no movería nada en la lista (accionable/fecha efectiva/categoría ganan primero). *(Idea a futuro, sin implementar: que confirmar el reordenamiento bloqueado ajuste esos campos solo.)*
- En el Gantt (modo Plan), además hace falta que las dos tareas caigan en el **mismo día planificado** dentro del mismo carril — es lo único que cambia el orden visual ahí; si el día difiere, el motivo lo aclara antes de mirar cadena o `compararEstructural`.
- En Tabla, las flechas solo se muestran con el orden por prioridad activo (`↺ Prioridad`); al ordenar por una columna (clic en su header) desaparecen, porque ese orden ya no es el de prioridad.

## `mejorTareaPorCategoria(tareas, categorias)`

Para cada categoría **raíz**, devuelve su tarea accionable de mayor prioridad (mismo criterio de arriba) — la tarea "que bloquea al resto" de esa categoría. Categorías sin ninguna tarea accionable no aparecen en el resultado. Existe porque el orden total de `compararPorPrioridad` tiende a mostrar siempre primero las tareas de la categoría raíz de mayor prioridad (ej. Facultad): cuando no hay nada urgente y el usuario tiene un rato libre, esta función da una opción por categoría para elegir, en vez de empujar siempre hacia la misma. Se usa en la vista Resumen, como la sección "🧭 Próximos por categoría".

## Tareas bloqueadas y accionables

- **Bloqueada**: `tarea_estado === 'bloqueada'` — es un valor persistido, no calculado (ver `DICCIONARIO_DE_DATOS.md`, campo `tarea_dependiente`).
- **Accionable** (`esTareaAccionable`): una tarea es accionable si está `pendiente` (ni bloqueada ni completada) y su `tarea_fecha_inicio_habilitada` ya llegó. Es el filtro base que usan `mejorTareaPorCategoria`, el panel "Reestructurar prioridades con IA" y la proyección de tareas en la vista Semana — y, desde v0.90.0, también el **primer nivel** de `compararEstructural`: una tarea no accionable nunca le gana a una accionable en el orden general, sea cual sea su fecha o categoría.

## Cómo se usa el criterio en cada vista

- **Resumen (antes "Hoy") — "⚠️ Sin hueco antes del límite"** (v0.89.0): tareas activas con `tarea_fecha_sugerida` puesta pero posterior a su propia `tarea_fecha_limite` — se calcula en vivo a partir de los datos, no depende de `compararPorPrioridad`; excluidas de todas las secciones de abajo. **"Vencidas"**: tareas accionables cuya `tarea_fecha_limite` ya venció, ordenadas por `compararPorPrioridad`; se ve siempre (v0.78.0), plegada, con un mensaje si está vacía. **"Urgentes"**: tareas accionables cuya `tarea_fecha_limite` es hoy (v0.78.0: ya no incluye `tarea_fecha_sugerida` = hoy, que tiene su propia sección "Hoy"), más las bloqueadas con límite vencido/hoy (de solo lectura) — desde v0.90.0, al tener todas `tarea_fecha_limite` real, quedan ordenadas por su hora exacta (la más próxima primero) en vez de por categoría. **"Hoy"** (v0.78.0): tareas accionables (y bloqueadas) con `tarea_fecha_sugerida` = hoy, sin repetir las de "Urgentes". **"Mañana"** (v0.78.0): ídem con `tarea_fecha_limite` **o** `tarea_fecha_sugerida` = mañana. Cada ítem muestra además su holgura en texto (ej. "Vencida hace 2 días", "Quedan 3 días") y, si tiene hora y vence hoy sin haber vencido todavía, una cuenta regresiva.
- **Resumen — "Resto de tus pendientes"** y **Tareas — listado general**: ordenadas directamente por `compararPorPrioridad`.
- **Resumen — "Próximos por categoría"**: `mejorTareaPorCategoria` sobre las tareas de "Resto"; se oculta mientras "Vencidas", "Urgentes" u "Hoy" tengan algo.
- **Agenda** (3, 8 o 15 días; `assets/js/vista-agenda.js`): agrupadas por día según `fechaDeReferencia` (`tarea_fecha_sugerida` > `tarea_fecha_limite`, la primera con valor). Dentro de cada día, por `tarea_fecha_sugerida` (hora concreta del día) y luego `compararPorPrioridad` como desempate — esto no cambia, porque ahí se ordena por horario del día, no por urgencia de vencimiento.
- **Semana**: las tareas con horario puntual (`tarea_fecha_sugerida` con hora) se ubican en su horario exacto. Las proyectadas se ordenan por `compararPorPrioridad` y se apilan una detrás de otra según su `tarea_duracion_min`.
- **Tabla**: por defecto ordenada por `compararPorPrioridad` — es la vista pensada para auditar el orden real de la app y detectar rápido si algo quedó mal priorizado. Clickear el header de una columna cambia a un orden simple por esa columna sola (asc/desc); un botón "↺ Prioridad" vuelve al orden por defecto. Filtros de categoría (inclusivo de descendientes), estado, importancia y buscador por nombre.
- **Gantt**: ordenada por fecha de inicio de la tarea y luego por `compararPorPrioridad`, dentro de cada meta — tampoco cambia, ahí se ordena por posición cronológica en el diagrama.

## Regla 80/20 (Pareto)

**Eliminada en v0.53.2** (a pedido del usuario): la etiqueta "🎯 Foco 80/20" de Hoy y de Tareas y la sección "Enfoque 80/20" de Informes se sacaron, junto con la función `calcularEnfoque8020` (que devolvía el 20% superior, redondeado hacia arriba, de las tareas accionables ordenadas por `compararPorPrioridad`). Queda en `BACKLOG.md` para analizar si conviene incorporarla en una versión futura.

## Reprogramado de fechas vencidas

`tarea_fecha_sugerida` es una sugerencia sin compromiso real, así que se reprograma **sola**: al iniciar la app, `reprogramarVencidas` (`assets/js/programador.js`, v0.92.0 — antes `reprogramarFechasSugeridasVencidas` en `tareas-logica.js`) busca tareas activas (no completadas) con `tarea_fecha_sugerida` vencida y la mueve al primer hueco real desde hoy (respetando la capacidad diaria, `tarea_dias_habiles`, Calendar y otras tareas ya asignadas, sin superar `tarea_fecha_limite` si existe — antes solo saltaba al próximo día hábil sin mirar si ese día ya estaba lleno), en cascada a sus dependientes (`reprogramarTareaConCascada`). Si hubo cambios, se avisa con un `alert()` que nombra las tareas.

`tarea_fecha_limite` es un compromiso real y **STDL nunca la modifica bajo ningún concepto — solo el usuario puede cambiarla**: en Resumen, cada tarea vencida (sección "Vencidas") muestra un botón "📅 Revalorizar fecha límite" que reusa el panel de reprogramar (`crearPanelReprogramar`) para esa tarea puntual. `reprogramarTareaConCascada` (v0.76.0 — antes desplazaba también la fecha límite de las dependientes, junto con la sugerida, para que la cadena no quedara con un límite "imposible") ya no la toca ni siquiera en cascada: si al desplazar la sugerida de una dependiente esta queda después de su propia fecha límite, `resolverColisionesEnCadena` (`assets/js/programador.js`, v0.84.0, ampliada en v0.89.0) le busca un hueco real antes del límite en vez de dejarla así; si de verdad no hay ninguno, queda visible de forma persistente en la sección "⚠️ Sin hueco antes del límite" de Resumen (ver `PROCESOS_AUTOMATICOS.md`, procesos 31-32).

## Otros dos procesos automáticos ligados a la prioridad (v0.90.0)

- **`tarea_fecha_inicio_habilitada` vencida → hoy** (`actualizarFechasInicioVencidas`, `assets/js/tareas-logica.js`): si quedó en el pasado, se actualiza sola al día de hoy — así el dato en sí (no solo la "accionabilidad" calculada) queda coherente en el formulario de edición y en el Gantt.
- **`tarea_urgente` reasigna `tarea_fecha_sugerida = hoy` todos los días** (`reasignarUrgentesAHoy`, `assets/js/programador.js`): mientras una tarea siga marcada urgente y sin completar, cada sesión nueva la vuelve a agendar para hoy (antes solo pasaba una vez, al marcarla) — es lo que mantiene su "fecha efectiva" (ver más arriba) siempre al día para el comparador.

Ver `PROCESOS_AUTOMATICOS.md` (procesos 33 y 34) para el detalle de ambos.
