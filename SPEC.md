# Spec — Super To-Do List

Versión organizada de la visión del proyecto. El material crudo del que sale este documento está en [NOTAS_ORIGINALES.md](NOTAS_ORIGINALES.md). El detalle de campos de datos está en [DICCIONARIO_DE_DATOS.md](DICCIONARIO_DE_DATOS.md) y las funcionalidades pendientes en [BACKLOG.md](BACKLOG.md).

## 1. Visión

Plataforma personal de autogestión de tareas y objetivos que reemplace la combinación actual de Notion + Google Calendar + Google Tasks, resolviendo su punto más débil: la persona pierde tiempo **replanificando** tareas ante imprevistos en vez de ver claramente cuáles son sus pendientes más urgentes y por dónde arrancar.

**Problema:** sobrecarga de tareas en múltiples áreas de la vida (personal, académica, laboral, emprendimiento, mantenimiento del hogar, hobbies, vínculos sociales), sin una herramienta que jerarquice, relacione y reprograme automáticamente.

**Público objetivo:** el propio usuario. Si a futuro resulta útil para otras personas, se evalúa adaptar para compartir.

## 2. Principios de diseño

- **El tiempo es irrecuperable** → priorizar acción inmediata y automatizar la replanificación en vez de que el usuario la haga a mano.
- **Hábitos Atómicos** → desglosar objetivos grandes en hitos y tareas/subtareas pequeñas.
- **Principio de Premack** ("tarea fea por tarea linda") → las recompensas/entretenimiento se habilitan después de cumplir tareas de mayor fricción.
- **Regla 80/20 (Pareto)** → ayudar a identificar el subconjunto de tareas de mayor impacto.
- **Fail fast / corregir rápido** → ante una tarea incumplida, preguntar por qué y replanificar ya, sin fricción ni culpa.
- **Métricas ágiles (Scrum/Kanban)** → throughput, sprints, revisiones periódicas, aplicados a la vida personal.

## 3. Alcance por fases

| Fase | Contenido | Estado |
|---|---|---|
| **Fase 1 — MVP (este repo, v0.1.x)** | ABM de categorías/subcategorías/tareas, atributos básicos, vista lista filtrable, marcar completada, persistencia en JSON local + sync manual vía Google Drive | **En curso** |
| Fase 2 — Lógica de tiempo y estados | Dependencias entre tareas, tareas de mantenimiento cíclicas, atajos de reprogramación, vistas 1/3/8 días, agrupación por similitud/multitasking | Backlog |
| Fase 3 — Integraciones | Google Calendar (lectura de disponibilidad + exportación puntual de completadas), clima, ubicación/GPS | Backlog |
| Fase 4 — Inteligencia e informes | Capa opcional de LLM externo (offline-first), informes de throughput/procrastinación, roadmap de objetivos con hitos, gamificación, comparación social | Backlog |
| Fase 5 — Móvil y UX avanzada | PWA, notificaciones por proximidad geográfica | Backlog |

El detalle línea por línea de cada fase está en [BACKLOG.md](BACKLOG.md).

## 4. Requisitos funcionales — Fase 1 (MVP actual)

1. **Jerarquía de datos:** Categoría → Subcategoría → Tarea. (Subtareas/dependencias quedan para Fase 2.)
2. **ABM completo** de categorías, subcategorías y tareas.
3. **Atributos de tarea del MVP:** nombre, categoría/subcategoría, estado, fecha límite, fecha sugerida, duración estimada (bloques de 15 min), notas/recursos. Ver diccionario de datos para el detalle completo, incluyendo qué campos quedan para fases futuras (dependencias, divisible, días hábiles, mantenimiento cíclico, costo, ubicación, clima, recompensa).
4. **Estados de tarea:** `a_confirmar`, `pendiente`, `en_progreso`, `completada`.
5. **Vistas:**
   - **Hoy:** separa tareas urgentes (vencidas o con fecha límite hoy) del resto de pendientes, para poder actuar sin tener que reprogramar primero.
   - **Tareas:** listado completo, filtrable por categoría/estado, ordenado por fecha límite.
   - **Categorías:** administración de categorías y subcategorías.
6. **Persistencia:** JSON local (`datos/categorias.json`, `datos/tareas.json`) leído/escrito por el navegador vía File System Access API, con `localStorage` como caché/respaldo, y exportar/importar JSON manual como fallback para navegadores sin soporte de esa API.

## 5. Requisitos no funcionales

- **Arquitectura:** 100% cliente (HTML/CSS/JS vanilla), sin backend, sin build tools ni frameworks — la app se abre en el navegador o se sirve con un servidor estático simple.
- **Rendimiento:** liviana, sin dependencias externas pesadas — a diferencia de Google Calendar, que hoy es lento en la PC de 16GB RAM del usuario.
- **Formato de fechas en UI:** DD/MM/YYYY. **Horarios:** 24 horas, zona horaria UTC−3. Internamente las fechas se guardan en formato ISO (`YYYY-MM-DD`) por compatibilidad con `<input type="date">` y para poder ordenarlas como texto.
- **Sincronización:** manual, vía carpeta de Google Drive local — sin integración de API de Drive por ahora (documentado como decisión técnica en el plan de arranque; ver `BACKLOG.md` para la evaluación de opciones a futuro).
- **IA:** el núcleo del sistema **no depende de tokens de ningún LLM**. El diseño del JSON queda limpio y estandarizado para que, a futuro, un LLM externo pueda leerlo/proponer cambios y el usuario reimporte el resultado.
- **Idioma:** documentación, UI y nombres de campos/funciones en español (ver [AGENTS.md](AGENTS.md)).
- **Versionado:** `vMayor.Menor.Parche` (semver), registrado en [CHANGELOG.md](CHANGELOG.md).

## 6. Fuera de alcance del MVP (ver backlog)

Dependencias/desbloqueo entre tareas, tareas de mantenimiento cíclicas, atajos de reprogramación (mañana/tarde/tardecita/noche), vistas de 1/3/8 días tipo calendario, autocompletado predictivo, integración con Google Calendar/clima/GPS, capa de IA conectable, roadmap de objetivos/metas con hitos, informes de throughput/procrastinación, gamificación y comparación social, módulo de administración económica.
