# Changelog

Formato de versión: `vMayor.Menor.Parche` (semver).

## [v0.3.0] - 2026-09-08

### Agregado

- Dependencias entre tareas (`dependencias`): panel "Dependencias" en la vista Tareas para marcar de qué otras tareas depende una. Una tarea con dependencias sin completar queda "bloqueada": no aparece como accionable en la vista Hoy (nueva sección "Bloqueadas por otras tareas") y se marca con un aviso en la vista Tareas.
- Reprogramación en cascada: al posponer una tarea que ya tenía una fecha agendada, las tareas que dependen de ella se corren automáticamente el mismo delta de tiempo.
- Tareas de mantenimiento cíclicas (`mantenimiento`): al completar una tarea marcada como mantenimiento (desde el selector de estado o desde el asistente de cierre de Hoy), la instancia queda `completada` como historial y se crea automáticamente una nueva tarea `pendiente` con la fecha límite recalculada desde la fecha real de finalización.
- Nuevo módulo `assets/js/tareas-logica.js` con la lógica compartida entre vistas (completar tarea, reprogramar con cascada, chequeo de bloqueo, validación de dependencias).

## [v0.2.0] - 2026-09-08

### Agregado

- Campo `fecha_inicio_posible` en las tareas: la vista "Hoy" separa en una sección aparte ("Todavía no pueden empezar") las tareas cuya fecha de inicio todavía no llegó.
- Botón "Posponer" (vista Tareas y vista Hoy) con panel de atajos de reprogramación: día (Hoy, Mañana, +7/+15/+30 días o fecha manual) + horario (Mañana 07:00, Tarde 12:00, Tardecita 17:00, Noche 20:00 o manual). Guarda el resultado en el nuevo campo `fecha_hora_agendada`.
- Asistente de cierre en la vista "Hoy": botones "Cumplida ✓" (pide duración real y la guarda en `duracion_real_min`) y "No cumplida ✗" (pide motivo, lo guarda en `motivo_incumplimiento`, y abre el panel de reprogramación).

## [v0.1.0] - 2026-09-08

### Agregado

- Estructura inicial del proyecto: carpetas `assets/`, `views/`, `datos/` y documentación base (`README.md`, `AGENTS.md`, `SPEC.md`, `BACKLOG.md`, `DICCIONARIO_DE_DATOS.md`, `NOTAS_ORIGINALES.md`).
- MVP funcional 100% cliente (HTML/CSS/JS vanilla, sin backend):
  - ABM de categorías y subcategorías.
  - ABM de tareas (nombre, categoría/subcategoría, estado, fecha límite, fecha sugerida, duración estimada, notas).
  - Vista "Hoy" con separación entre tareas urgentes (vencidas o de hoy) y el resto de pendientes.
  - Vista "Tareas" con filtros por categoría/estado y orden por fecha límite.
  - Vista "Categorías" para administrar la jerarquía.
  - Persistencia en JSON local vía File System Access API (carpeta elegida por el usuario, pensada para vivir dentro de Google Drive), con `localStorage` de respaldo y exportar/importar JSON manual como fallback.
- Datos y esquema de ejemplo versionados en `datos/`.
