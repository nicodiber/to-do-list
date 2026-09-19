# Spec — Super To-Do List

Documentación viva de la visión y el alcance del proyecto (se actualiza cuando cambia lo que describe). El material crudo original está en [NOTAS_ORIGINALES.md](NOTAS_ORIGINALES.md). Los detalles viven en documentos específicos — ver el mapa al final.

## 1. Visión

Plataforma personal de autogestión de tareas y objetivos que reemplace la combinación de Notion + Google Calendar + Google Tasks, resolviendo su punto más débil: la persona pierde tiempo **replanificando** ante imprevistos en vez de ver claramente cuáles son sus pendientes más importantes y por dónde arrancar.

**División de roles con Google Calendar:** Super To-Do List (STDL) es para **ver y gestionar los pendientes**; Google Calendar es para **agendar los eventos fijos y dejar registrado lo que realmente pasó**. STDL no pretende ser la bitácora histórica.

**Problema:** sobrecarga de tareas en múltiples áreas de la vida (personal, académica, laboral, emprendimiento, mantenimiento del hogar, hobbies, vínculos sociales), sin una herramienta que jerarquice, relacione y reprograme automáticamente.

**Público objetivo:** el propio usuario. Si a futuro resulta útil para otras personas, se evalúa adaptar para compartir.

## 2. Principios de diseño

- **El tiempo es irrecuperable** → priorizar la acción inmediata y automatizar la replanificación en vez de que el usuario la haga a mano.
- **Hábitos Atómicos** → desglosar objetivos grandes en metas y tareas pequeñas; medir hábitos ("lo que no se mide no se mejora").
- **Regla 80/20 (Pareto)** → ayudar a identificar el subconjunto de tareas de mayor impacto.
- **Fail fast / corregir rápido** → ante una tarea incumplida, replanificar ya, sin fricción ni culpa.
- **Métricas ágiles (Scrum/Kanban)** → throughput, revisiones periódicas, aplicados a la vida personal.
- **Nunca perder datos, y no mentir sobre ello** → los datos no dependen solo del navegador, y la interfaz nunca dice "guardado" hasta que sea cierto.
- **Usuario experto rápido** → atajos de teclado en casi todo, y textos de interfaz acompañados de emojis representativos.
- **Principio de Premack** ("tarea fea por tarea linda") → fue implementado y se retiró; se retoma después de la v1.0 con datos reales (ver `BACKLOG.md`).

## 3. Alcance

### Construido (v0.51.0)

Categorías jerárquicas de profundidad libre; tareas con fechas (con o sin hora), importancia, dependencias, tareas de mantenimiento cíclicas, días hábiles, ubicación, clima y costo; metas; personas; algoritmo de prioridad por holgura + categoría + importancia con desempate manual ("Versus"); reprogramado automático de fechas sugeridas vencidas; vistas Hoy / 3 días / 8 días / Semana / Gantt / Todas / Informes; almacenamiento en Google Drive como único destino (buffer local durable, mezcla entre dispositivos con avisos de conflicto, estado de sincronización siempre visible) e integración con Google Calendar (exportar completadas, detectar solapamientos); PWA instalable.

### Camino a v1.0

Rediseño del frontend y cambio de almacenamiento, definido en [REDISENO.md](REDISENO.md) y organizado en 8 rondas (almacenamiento con Drive como único destino → modelo de datos → alta unificada → Hoy → ABMs → Tablero de progreso y hábitos → Gantt → rediseño visual). Las dos primeras rondas se hacen **antes de cargar datos reales**. La ronda 1 (almacenamiento) está hecha desde v0.51.0.

### Después de la v1.0

Capa de IA conectable (sugerir subtareas, definir metas charlando, reestructurar prioridades — hoy existe en forma manual y está suspendida), Premack / disfrute, eventos de Calendar como origen de tareas, informes basados en el historial de Google Calendar, gamificación y comparación social, notificaciones, y un eventual módulo de administración económica personal. Detalle en [BACKLOG.md](BACKLOG.md).

## 4. Modelo y comportamiento (resumen)

- **Entidades**: Categoría (auto-referenciada), Tarea, Meta, Persona, Ubicación. Detalle de campos en [DICCIONARIO_DE_DATOS.md](DICCIONARIO_DE_DATOS.md).
- **Estados de tarea**: `bloqueada` (valor persistido, sincronizado automáticamente con `tarea_dependiente`), `pendiente`, `completada`.
- **Prioridad**: ver [REGLAS_DE_PRIORIDAD.md](REGLAS_DE_PRIORIDAD.md). Es la base de las vistas Hoy, Todas y demás.
- **Flujos de usuario**: [CASOS_DE_USO.md](CASOS_DE_USO.md) (cómo funciona hoy) y [REDISENO.md](REDISENO.md) (cómo debería ser).
- **Lo que el sistema hace solo**: [PROCESOS_AUTOMATICOS.md](PROCESOS_AUTOMATICOS.md).
- **Tipos de vista**: visualizadores (Hoy, 3 días, 8 días, Gantt, Todas, Informes), ABMs (Tareas, Categorías, Ubicaciones, Metas, Personas), asistentes (Revisar mi día) y configuración/integraciones (Drive, Calendar, Configuraciones).

## 5. Requisitos no funcionales

- **Arquitectura:** 100% cliente (HTML/CSS/JS vanilla), sin backend, sin build tools ni frameworks.
- **Rendimiento:** liviana, sin dependencias externas pesadas — a diferencia de Google Calendar, que es lento en la PC de 16 GB de RAM del usuario.
- **Formato de fechas en UI:** DD/MM/YYYY; horarios de 24 horas, zona horaria UTC−3. Internamente se guardan en ISO (`YYYY-MM-DD`, o datetime ISO completo cuando la fecha lleva hora — ver la convención fecha±hora en el diccionario de datos).
- **Persistencia:** **Google Drive por API como único destino**, en todos los dispositivos, con un archivo JSON. `localStorage` queda solo para preferencias (tema, ubicación actual); sin modo carpeta local. Cambios que fallan al guardarse quedan en un buffer temporal marcado "pendiente"; con conexión caída se muestra una copia de solo lectura; hay verificación automática y mezcla por tarea entre dispositivos. *(Implementado en v0.51.0.)*
- **IA:** el núcleo del sistema **no depende de tokens de ningún LLM**.
- **Idioma:** documentación, UI y nombres de campos/funciones en español castellano (ver [AGENTS.md](AGENTS.md)).
- **Versionado:** `vMayor.Menor.Parche` (semver), registrado en [CHANGELOG.md](CHANGELOG.md); el `README.md` indica siempre la versión vigente.

## 6. Mapa de documentación

| Documento | Para qué sirve |
|---|---|
| `SPEC.md` | Visión, principios, alcance y requisitos (este archivo) |
| `REDISENO.md` | Lo acordado para cambiar y el orden de las rondas |
| `CASOS_DE_USO.md` | Flujos de usuario tal como funcionan hoy |
| `PROCESOS_AUTOMATICOS.md` | Lo que el sistema hace solo (condición → proceso → resultado) |
| `REGLAS_DE_PRIORIDAD.md` | Cómo se ordenan las tareas |
| `DICCIONARIO_DE_DATOS.md` | Campos de cada entidad |
| `LOGICA_FUNCIONES.md` | Qué hace cada módulo y función |
| `BACKLOG.md` | Ideas y pendientes, por fase |
| `CHANGELOG.md` | Historial de versiones |
| `AGENTS.md` | Convenciones para trabajar en el repositorio |
