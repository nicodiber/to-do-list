# Investigación de alternativas y competencia

Informe de la v0.105.0 (búsqueda en la web, octubre de 2026). Objetivo: ver qué hacen herramientas parecidas, qué ya tiene STDL y qué ideas valen la pena incorporar. No es un análisis exhaustivo: son los productos más citados en las comparativas.

## Qué hace cada una

### Reclaim.ai (calendario inteligente sobre Google Calendar)
Su idea central es **agendar por prioridad y volver a agendar solo cuando algo cambia**. Funciones: *AI Tasks* (acomoda tareas según prioridad, fecha límite y disponibilidad), *AI Habits* (rutinas recurrentes con horarios preferidos, diarias, semanales, mensuales o personalizadas), *Buffer Time* (descansos y tiempo de traslado automáticos entre eventos), *Focus Time* (defiende bloques de trabajo profundo), *Calendar Sync* (bloquea tiempo entre varios calendarios) y herramientas de reuniones (enlaces para agendar, mejores horarios entre asistentes). Fuentes: [reclaim.ai](https://reclaim.ai/), [desglose de funciones](https://pipeline.zoominfo.com/sales/reclaim-ai-features), [reseña](https://kripeshadwani.com/reclaim-ai-review/).

### Swift To-Do List (gestor de tareas de escritorio, Dextronet)
Más tradicional: listas y subtareas, tareas recurrentes, **seguimiento de tiempo**, planificación y seguimiento de proyectos, asignación de tareas, comentarios y notas, calendario con vistas de día/semana/mes/línea de tiempo, **exportación a HTML y Excel e impresión**, sincronización en la nube y apps móviles, listas compartidas para equipos y arrastrar y soltar entre listas. Fuentes: [funciones](https://www.dextronet.com/swift-to-do-list-software/features), [Capterra](https://www.capterra.com/p/78961/Swift-To-Do-list/).

### Otras (Motion, Sunsama, Morgen, Akiflow)
- **Motion**: agenda todo de forma agresiva y automática, con lenguaje natural para cargar tareas y proyectos.
- **Sunsama**: *rituales de planificación diaria guiados*; sugiere tiempos estimados pero no re-agenda solo.
- **Morgen**: sugiere dónde poner cada tarea con una fórmula de **prioridad + fecha + duración + nivel de energía** y deja aprobar o ajustar (un punto medio entre automático y manual).
- **Akiflow**: bandeja de entrada universal (junta tareas de varias herramientas) y mucho teclado.
Fuentes: [comparativa Morgen](https://www.morgen.so/blog-posts/sunsama-vs-akiflow), [Akiflow vs Motion](https://www.morgen.so/blog-posts/akiflow-vs-motion).

## STDL frente a ellas

| Tema | STDL hoy |
|---|---|
| Agendado automático según prioridad, fecha límite y Calendar | ✅ (`programador.js`; respeta eventos «Ocupado», horarios disponibles y capacidad del día) |
| Hábitos / tareas con repetición | ✅ (cada N, día fijo, día obligatorio, hábitos temporales, mapa y calendario anual) |
| Cadenas de dependencias y plantillas de procedimientos | ✅ (algo que casi ninguna de las anteriores hace así) |
| Re-agendar solo cuando algo cambia | ✅ (reubicar, adelantar, reordenar, vencidas) |
| Clima en la planificación | ✅ (único: pronóstico en Semana y «requiere buen tiempo») |
| Sincronización con Google Calendar | ✅ solo lectura (no crea eventos) |
| Datos en tu propio Drive, sin servidor | ✅ (diferencial de privacidad) |
| Tiempo estimado vs. real | ✅ opcional (sin cronómetro) |
| Delegación con seguimiento | ✅ simple (v0.105.0) |
| Tiempo de traslado y descansos automáticos | ❌ |
| Horario preferido por hábito o tarea | ❌ (hay horarios disponibles por día, pero no por tarea) |
| Bloques de «tiempo de foco» protegidos | ❌ |
| Carga con lenguaje natural («llamar a Ana mañana a las 10») | ❌ |
| Cronómetro / seguimiento de tiempo | ❌ |
| Nivel de energía como criterio de agendado | ❌ (existe «disfrute») |
| Planificación diaria guiada (ritual) | Parcial («Revisar mi día») |
| Exportar a planilla (CSV/Excel) / imprimir | ❌ (sí JSON) |
| Colaboración / equipos | ❌ a propósito (app personal) |

## Ideas recomendadas (de más a menos conveniente)

1. **Horario preferido por tarea o hábito** (Reclaim): por ejemplo «correr: mañana», «estudiar: 18 a 21». Encaja con los bloques horarios: se agrega un campo de franja preferida y el agendado la intenta antes de las demás horas.
2. **Carga con lenguaje natural** (Motion): escribir «Llamar al médico mañana 10hs 30 min» y que complete fecha, hora y duración, mostrando lo entendido para confirmar. Reduce pasos en el alta, que es el flujo más usado.
3. **Cronómetro por tarea** (Swift To-Do List): «▶️ Empezar» / «⏹️ Terminar» que llena solo el tiempo real. Se apoya en lo ya hecho de tiempo estimado vs. real.
4. **Tiempo de traslado y descansos** (Reclaim): un margen configurable entre tareas/eventos (y, con ubicación, tiempo de viaje). Mejora el realismo del agendado.
5. **Bloques de foco** (Reclaim): marcar algunos bloques horarios como «foco» para tareas largas o difíciles y dejar los otros para tareas cortas.
6. **Exportar a CSV** (Swift To-Do List): para planillas o impresión.
7. **Nivel de energía** (Morgen): bajo/medio/alto por tarea y por franja del día, para sugerir cuándo hacer qué.

Quedan descartadas por el enfoque de la app: colaboración en equipo, enlaces para agendar reuniones, bandeja universal de otras herramientas y re-agendado agresivo de todo sin confirmar.
