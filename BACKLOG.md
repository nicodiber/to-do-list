# Backlog

Todas las ideas del brainstorm original ([NOTAS_ORIGINALES.md](NOTAS_ORIGINALES.md)), organizadas por fase según [SPEC.md](SPEC.md). Marcar con `[x]` cuando se implemente y mover la entrada correspondiente a [CHANGELOG.md](CHANGELOG.md).

## Fase 1 — MVP (v0.1.x)

- [x] ABM de categorías y subcategorías
- [x] ABM de tareas con atributos básicos (nombre, categoría/subcategoría, estado, fecha límite, fecha sugerida, duración estimada, notas)
- [x] Vista "Hoy" (urgentes vs. resto de pendientes)
- [x] Vista "Tareas" con filtros por categoría/estado y orden por fecha límite
- [x] Marcar tarea como completada / cambiar estado
- [x] Persistencia en JSON local vía File System Access API + `localStorage` de respaldo
- [x] Exportar/importar JSON manual (fallback para navegadores sin soporte de la API)

## Fase 2 — Lógica de tiempo y estados

- [x] Fecha de inicio posible (`fecha_inicio_posible`) además de la fecha límite — las tareas que todavía no pueden empezar se separan en la vista "Hoy"
- [x] Atajos de reprogramación al posponer: "mañana" (07:00), "tarde" (12:00), "tardecita" (17:00), "noche" (20:00), atajos de día (+1, +7, +15, +30 días) — pendiente el atajo "primer [día] del próximo mes" (ver más abajo)
- [x] Asistente de cierre de tarea (vista "Hoy"): botones "Cumplida" (pide duración real) y "No cumplida" (pide motivo y abre el panel de reprogramación)
- [x] Subtareas y dependencias entre tareas (una tarea "desbloquea" a otra; si se pospone la primera, se corren automáticamente las dependientes con la misma cantidad de tiempo)
- [x] Tareas de mantenimiento cíclicas: al completarse se clona una nueva instancia pendiente sumando el intervalo a la **fecha real de finalización** (no a la fecha teórica) — ej. corte de cabello cada 1 mes, limpiar pileta cada fin de semana, backup de celular cada 1 mes. La instancia completada queda como historial
- [ ] Asistente de cierre a nivel *día completo* (repasar todas las tareas de hoy en una sola pasada, no tarea por tarea)
- [ ] Atajo de día "primer [día de la semana] del próximo mes" en el panel de reprogramar
- [ ] Detección de dependencias cíclicas más allá de un ciclo directo A↔B (por ahora solo se valida auto-referencia y ciclo directo entre dos tareas; un ciclo A→B→C→A no se detecta)
- [ ] Atributo `divisible` (booleano): si la tarea puede pausarse y retomarse o debe hacerse de punta a punta (default: no divisible)
- [ ] Atributo `dias_habiles`: días de la semana en que una tarea puede realizarse (si se pospone, salta al próximo día hábil de esa tarea)
- [ ] Para tareas repetibles: preguntar qué mejorar de cara a la próxima vez
- [ ] Vistas de 3 días y de 8 días (además de la vista "Hoy")
- [ ] Agrupar tareas por similitud, familia/jerarquía o por poder hacerse en simultáneo (multitasking vs. foco)
- [ ] Autocompletado predictivo al crear una tarea, basado en tareas similares ya creadas (trae atributos por defecto)
- [ ] Prioridad/jerarquía configurable entre categorías
- [ ] Crear tareas rápido desde el celular con datos mínimos, completar el resto después desde la PC
- [ ] Aplicar principios de SCRUM (sprints, planificaciones y revisiones periódicas) a nivel personal

## Fase 3 — Integraciones externas

- [ ] Evaluar opciones técnicas de sincronización multi-dispositivo (ver sección "Sync — opciones a evaluar" abajo)
- [ ] Integración con Google Calendar: lectura de eventos existentes para detectar solapamientos
- [ ] Integración con Google Calendar: exportación puntual de tareas completadas/agendadas como registro histórico (con hora de inicio y duración real)
- [ ] Al completar una tarea, preguntar si se quiere abrir en Google Calendar con los datos precargados
- [ ] Al completar una tarea repetible, sugerir la próxima fecha (con atajos) y crear la siguiente instancia
- [ ] Validación de condiciones climáticas para tareas que dependan del clima (pronóstico del tiempo)
- [ ] Atributo de ubicación geográfica asociado a una tarea
- [ ] Notificación por proximidad geográfica (GPS del celular) para tareas ligadas a un lugar
- [ ] Lectura de eventos pasados de Google Calendar para estimar tiempos/recursos de tareas similares futuras
- [ ] Exportar/importar una categoría completa (ej. compartir el cronograma de una materia con otro estudiante)

## Fase 4 — Inteligencia e informes

- [ ] Capa opcional de IA conectable (offline-first, el core nunca depende de tokens de LLM): exportar el JSON, pedirle a un LLM externo que reestructure prioridades o proponga subtareas, reimportar el resultado
- [ ] Chatbot para dialogar y definir metas/objetivos de vida
- [ ] Roadmap de objetivos a largo plazo: usuario define metas (corto/mediano/largo plazo), el sistema arma hitos y tareas, usuario confirma/ajusta
- [ ] Asociar cada tarea a una o varias metas/propósitos de vida
- [ ] Informes semanales: propuesto vs. hecho
- [ ] Índice de procrastinación
- [ ] Métrica de throughput (capacidad de trabajo, estilo Kanban)
- [ ] KPIs y OKRs personales
- [ ] Comparación de throughput con amigos (diaria/semanal/mensual)
- [ ] Recordatorio de sociabilización: hace cuánto no te reunís con determinada persona (familiares, amigos), ordenado de mayor a menor tiempo
- [ ] Recompensa asociada a cada tarea según dificultad/importancia
- [ ] Colores por categoría/subcategoría (evaluar si conviene otro criterio de color)

## Fase 5 — Móvil y UX avanzada

- [ ] Versión PWA para uso desde el celular
- [ ] Notificaciones push
- [ ] Evaluar si conviene convertir el sistema en un integrador más amplio: calendario propio (+ conexión opcional a Google Calendar) y administración económica personal (gastos, movimientos, inversiones, saldos, metas de ahorro, cheques) — solo si tiene sentido una vez validado el core de tareas

## Ideas sin fase asignada todavía (evaluar al planificar)

- [ ] Costo monetario estimado/real por tarea, para proyectar cuánto dinero se va a necesitar en un período futuro
- [ ] Rutina diaria configurable (higiene del sueño, horarios, hábitos) como conjunto de tareas recurrentes
- [ ] Al finalizar el día, revisar eventos del calendario y preguntar si generaron alguna tarea de continuidad
- [ ] Tras el cursado de una materia, preguntar si surgieron tareas nuevas a agregar
- [ ] Diferenciar niveles de importancia más allá del estado (ej. súper importante como un examen vs. importante como una entrega vs. menor impacto)
- [ ] Aplicar la regla 80/20 para resaltar qué tareas conviene priorizar

## Sync — opciones a evaluar (Fase 3+)

Registro de la inquietud original del usuario sobre cómo sincronizar datos entre 2 PCs y 1 celular sin depender de un servidor de pago. Para la Fase 1 se resolvió con **carpeta de Google Drive local + File System Access API** (ver [SPEC.md](SPEC.md)). Opciones a evaluar más adelante si esto no alcanza:

1. **Carpeta sincronizada por el cliente de escritorio de Drive** (actual): simple, sin OAuth, pero requiere que el navegador soporte File System Access API (Chrome/Edge) y que la carpeta esté físicamente sincronizada en cada dispositivo.
2. **Google Drive API (OAuth)**: sync real sin depender de que la carpeta esté sincronizada localmente; permite uso desde el celular vía navegador. Suma complejidad de autenticación y manejo de conflictos (ETag / última modificación).
3. **Backend propio liviano** (ej. FastAPI/Node) con base de datos simple (SQLite) expuesto solo en red local o con túnel — da concurrencia real pero contradice el requisito de "sin servidor de pago" y suma una pieza más para mantener.
4. **Formato de archivo**: evaluar si conviene mantener un único JSON o fragmentarlo (por año, por categoría) a medida que crezca el volumen de datos.
