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
- [x] Vistas de 3 días y de 8 días (además de la vista "Hoy"): agrupan las tareas pendientes por día (según fecha agendada, límite o sugerida, en ese orden de prioridad) para anticipar cuellos de botella. Incluyen "Posponer" directo desde cada tarjeta
- [x] Asistente de cierre a nivel *día completo*: botón "Revisar mi día" en Hoy, repasa una por una las tareas accionables del día (Cumplida/No cumplida/Saltar) en un diálogo, sin tener que abrir cada tarjeta
- [x] Atajo de día "primer [día de la semana] del próximo mes" en el panel de reprogramar
- [x] Detección de dependencias cíclicas más allá de un ciclo directo A↔B: ahora se valida el grafo completo (A→B→C→A también se rechaza)
- [x] Para tareas repetibles (mantenimiento): al completarlas se pregunta opcionalmente qué mejorar de cara a la próxima vez, y queda anotado en la instancia clonada
- [x] Autocompletado predictivo al crear una tarea: `<datalist>` con tareas ya creadas; al coincidir el nombre exacto, precarga categoría/subcategoría/duración/notas/mantenimiento
- [x] Crear tareas rápido desde el celular con datos mínimos (barra de alta rápida, solo nombre), completar el resto después desde la PC — para que esto tuviera sentido se agregó también **edición de tarea** (botón "Editar" en Tareas, no estaba en el backlog original pero es un requisito de este ítem)
- [x] Atributo `divisible` (booleano): si la tarea puede pausarse y retomarse o debe hacerse de punta a punta (default: no divisible). Informativo por ahora, con badge "⏸ Divisible"
- [x] Atributo `dias_habiles`: días de la semana en que una tarea puede realizarse; al posponerla, el panel de reprogramar salta automáticamente al próximo día hábil (aplica en los 4 puntos donde se abre ese panel: Tareas, Hoy, 3/8 días, Revisar mi día)
- [x] Agrupar tareas por similitud, familia/jerarquía o por poder hacerse en simultáneo (multitasking vs. foco): atributo `multitasking` por tarea (checkbox, badge "🎧", filtro "Solo multitasking") + toggle "Agrupar por categoría" en la vista Tareas (agrupa el listado filtrado por categoría, en vez de similitud automática por contenido)
- [x] Prioridad/jerarquía configurable entre categorías: botones ▲/▼ en la vista Categorías para reordenar `orden`; se usa como desempate al listar tareas en Tareas, Hoy (urgentes y resto) y las vistas de 3/8 días
- [ ] Aplicar principios de SCRUM (sprints, planificaciones y revisiones periódicas) a nivel personal

## Fase 3 — Integraciones externas

- [x] Integración con Google Calendar: exportación puntual de tareas completadas como registro histórico (con hora de inicio real y duración real) — vía URL de `calendar.google.com/render`, sin OAuth ni API key
- [x] Al completar una tarea, preguntar si se quiere abrir en Google Calendar con los datos precargados
- [x] Al completar una tarea repetible, sugerir la próxima fecha y crear la siguiente instancia — resuelto desde la ronda de mantenimiento cíclico (v0.3.0), había quedado listado acá también por error
- [x] Atributo de ubicación geográfica asociado a una tarea — **rediseñado**: en vez de texto libre (como había quedado en v0.9.0), ahora es una entidad propia con ABM (vista "Ubicaciones", nombre + latitud + longitud), y las tareas referencian `ubicacion_id`. Badge y filtro manual en Tareas/Hoy siguen igual que antes pero sobre esta entidad. Sigue **sin GPS** — las coordenadas se cargan a mano una vez por ubicación
- [x] Validación de condiciones climáticas: checkbox `requiere_clima_bueno` por tarea; en Hoy y en las vistas de 3/8 días se consulta el pronóstico real (Open-Meteo, gratis, sin API key) usando las coordenadas de la ubicación de la tarea, y si la probabilidad de lluvia es alta se muestra un aviso para posponerla
- [ ] Evaluar opciones técnicas de sincronización multi-dispositivo (ver sección "Sync — opciones a evaluar" abajo)
- [ ] Integración con Google Calendar: lectura de eventos existentes para detectar solapamientos. **Pausado a pedido del usuario** — requiere crear antes un proyecto OAuth en Google Cloud Console (Client ID); retomar cuando el usuario pida específicamente que lo guiemos paso a paso por ese setup
- [ ] Notificación por proximidad geográfica (GPS del celular) para tareas ligadas a un lugar — fuera de alcance por ahora (el usuario prefiere el filtro manual de arriba)
- [ ] Lectura de eventos pasados de Google Calendar para estimar tiempos/recursos de tareas similares futuras
- [ ] Exportar/importar una categoría completa (ej. compartir el cronograma de una materia con otro estudiante). **Pospuesto a pedido del usuario** para la etapa final del proyecto

## Fase 4 — Inteligencia e informes

- [x] Roadmap de objetivos — versión manual: nueva entidad Meta (corto/mediano/largo plazo) con ABM en la vista "Metas", que muestra progreso (tareas completadas/asociadas) con barra simple. Las tareas se asocian a una o varias metas desde el panel "Metas" en la vista Tareas. La versión con IA que arma hitos automáticamente queda en el ítem de abajo
- [ ] Capa opcional de IA conectable (offline-first, el core nunca depende de tokens de LLM): exportar el JSON, pedirle a un LLM externo que reestructure prioridades, arme hitos a partir de una meta, o proponga subtareas, reimportar el resultado
- [ ] Chatbot para dialogar y definir metas/objetivos de vida
- [x] Informes básicos: nueva vista "Informes" con tabla de completadas (últimos 7 días) vs. pendientes actuales por categoría, y promedio de duración estimada vs. real
- [x] Índice de procrastinación — versión proxy: tareas actualmente pospuestas al menos una vez (`motivo_incumplimiento` cargado y sin completar) contra completadas en los últimos 7 días. No es un histórico real de reprogramaciones (el modelo no guarda ese log todavía); si hace falta más precisión, una ronda futura puede sumar un registro de eventos
- [ ] Métrica de throughput (capacidad de trabajo, estilo Kanban)
- [ ] KPIs y OKRs personales
- [ ] Comparación de throughput con amigos (diaria/semanal/mensual)
- [ ] Recordatorio de sociabilización: hace cuánto no te reunís con determinada persona (familiares, amigos), ordenado de mayor a menor tiempo
- [x] Recompensa asociada a cada tarea: campo de texto libre opcional, badge "🎁" en los listados, y aviso al completar la tarea (en los 3 caminos existentes) reforzando el principio de Premack. Se conserva al clonarse una instancia de mantenimiento
- [x] Colores por categoría/subcategoría: las subcategorías ahora tienen su propio color (hereda el de la categoría por defecto, se puede cambiar al crearla); los badges de tareas usan el color de la subcategoría cuando la tarea tiene una asignada
- [x] Atributo de "disfrute" por categoría (escala 1-5, default 3, se define al crearla): al completar una tarea de una categoría de bajo disfrute (1-2), se sugiere automáticamente continuar con una tarea accionable de una categoría de alto disfrute (4-5) — Premack a nivel categoría, complementa la `recompensa` por tarea individual de v0.15.0

## Fase 5 — Móvil y UX avanzada

- [ ] Versión PWA para uso desde el celular
- [ ] Notificaciones push
- [ ] Evaluar si conviene convertir el sistema en un integrador más amplio: calendario propio (+ conexión opcional a Google Calendar) y administración económica personal (gastos, movimientos, inversiones, saldos, metas de ahorro, cheques) — solo si tiene sentido una vez validado el core de tareas

## Ideas sin fase asignada todavía (evaluar al planificar)

- [ ] Costo monetario estimado/real por tarea, para proyectar cuánto dinero se va a necesitar en un período futuro
- [ ] Rutina diaria configurable (higiene del sueño, horarios, hábitos) como conjunto de tareas recurrentes
- [ ] Al finalizar el día, revisar eventos del calendario y preguntar si generaron alguna tarea de continuidad
- [ ] Tras el cursado de una materia, preguntar si surgieron tareas nuevas a agregar
- [x] Diferenciar niveles de importancia más allá del estado (ej. súper importante como un examen vs. importante como una entrega vs. menor impacto): atributo `importancia` (baja/media/alta, default media) por tarea, usado como primer criterio de orden en Tareas/Hoy/3-8 días (antes que la prioridad de categoría), con badge e ícono en las 3 vistas y filtro en Tareas
- [ ] Aplicar la regla 80/20 para resaltar qué tareas conviene priorizar
- [ ] Vista de diagrama de Gantt: evaluar cómo aplicarla como herramienta para la definición de tareas/procesos, construyendo un "sistema a objetivos" (visualizar de punta a punta qué tareas llevan a una meta y en qué orden/tiempo)
- [ ] Vista semanal estilo Google Calendar: tareas pendientes en formato de 7 días para visualizar rápido las tareas fijas (eventos con duración fija que no se pueden posponer) de la semana, y proyectar en esa grilla las tareas pendientes con fecha de inicio/fin según su duración estimada y fecha sugerida. Debe permitir editar: clic en una tarea lleva a su edición, y arrastrar los extremos superior/inferior de una tarea permite modificar su horario de inicio/fin directamente desde la grilla

## Sync — opciones a evaluar (Fase 3+)

Registro de la inquietud original del usuario sobre cómo sincronizar datos entre 2 PCs y 1 celular sin depender de un servidor de pago. Para la Fase 1 se resolvió con **carpeta de Google Drive local + File System Access API** (ver [SPEC.md](SPEC.md)). Opciones a evaluar más adelante si esto no alcanza:

1. **Carpeta sincronizada por el cliente de escritorio de Drive** (actual): simple, sin OAuth, pero requiere que el navegador soporte File System Access API (Chrome/Edge) y que la carpeta esté físicamente sincronizada en cada dispositivo.
2. **Google Drive API (OAuth)**: sync real sin depender de que la carpeta esté sincronizada localmente; permite uso desde el celular vía navegador. Suma complejidad de autenticación y manejo de conflictos (ETag / última modificación).
3. **Backend propio liviano** (ej. FastAPI/Node) con base de datos simple (SQLite) expuesto solo en red local o con túnel — da concurrencia real pero contradice el requisito de "sin servidor de pago" y suma una pieza más para mantener.
4. **Formato de archivo**: evaluar si conviene mantener un único JSON o fragmentarlo (por año, por categoría) a medida que crezca el volumen de datos.
