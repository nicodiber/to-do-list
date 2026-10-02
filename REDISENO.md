# Rediseño: cómo debería ser

Decisiones de diseño acordadas con el usuario (el «cómo debería ser»). Estado: ✅ definido · ❓ abierto · 🔮 post-v1.0. `CASOS_DE_USO.md` describe solo la realidad de hoy; lo que se pidió y todavía no existe se marca allí con ⏳.

## Tareas de mantenimiento (ronda de diseño de la v0.100.0)

Todavía **no implementado**: las cuatro decisiones salieron de una conversación con el usuario y esperan su ronda de implementación.

- ✅ **La copia nace solo con fecha sugerida, sin límite duro.** Hoy la copia recibe `tarea_fecha_limite` = cumplimiento + intervalo. Pasa a nacer con `tarea_fecha_sugerida` = cumplimiento + intervalo y sin límite, para que un hábito flexible no figure como «vencido». El agendado la ubica cerca de esa fecha.
- ✅ **Repetición en día fijo, además de «desde que se cumple».** Cada tarea de mantenimiento elige entre «cada N días/semanas/meses desde que la cumplo» (como hoy) y «día fijo» (un día del mes, ej. el 1, o días de la semana, ej. todos los lunes).
- ✅ **Interruptor «día obligatorio» por tarea.** Con el interruptor activo, el agendado prioriza esa tarea por sobre las no repetitivas y no la mueve de su día; las demás se reubican alrededor.
- ✅ **Los días hábiles mandan sobre el intervalo.** Con días hábiles acotados (ej. martes y jueves), la próxima repetición cae en el próximo día hábil posible después del intervalo: «cada 1 día» con martes y jueves significa «cada día hábil».

Casos borde que hay que confirmar antes de implementar (propuesta entre paréntesis):

- ❓ Sin fecha límite, una tarea de mantenimiento tiene holgura infinita y el agendado (`compararParaAgendar`) la dejaría al final de la cola, detrás de todo. (Propuesta: para ordenar, usar su fecha sugerida objetivo como «límite blando», o la fecha del día obligatorio como límite efectivo.)
- ❓ Si un «día obligatorio» no tiene hueco ese día. (Propuesta: queda con su hora lo más cerca posible ese mismo día o, si no hay, aparece en la sección «Sin hueco antes del límite» de Resumen en vez de moverse a otro día en silencio.)
- ❓ El mapa de hábitos usa `cumplimiento_fecha_limite` para saber si hubo incumplimiento. Sin límite, ¿contra qué fecha se mide? (Propuesta: contra la fecha sugerida objetivo; con «día obligatorio», contra ese día.)
- ❓ Qué pasa con las tareas de mantenimiento y las copias ya cargadas con límite. (Propuesta: no se tocan; el cambio vale para las copias que se creen de ahí en más.)
- ❓ Interacción con «repetir hasta» (`tarea_repetir_hasta`, `tarea_repetir_hasta_tarea`) y con las cadenas de mantenimiento (anillo): el día fijo debe respetarlas. (Propuesta: sin cambios; la repetición se corta igual al llegar al «hasta».)
