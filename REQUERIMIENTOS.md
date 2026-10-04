# Requerimientos de Super To-Do List (STDL)

Documento vivo (v0.105.0): lista los requerimientos funcionales (RF) y no funcionales (RNF) de la app, **de los más simples a los más complejos**, con su estado y dónde están implementados. Es la base para el futuro `SRS.md`. Estado: ✅ implementado · 🟡 parcial · ⏳ pendiente · 🚫 descartado a propósito. Los detalles viven en `LOGICA_FUNCIONES.md`, `PROCESOS_AUTOMATICOS.md`, `REGLAS_DE_PRIORIDAD.md`, `DICCIONARIO_DE_DATOS.md` y `CASOS_DE_USO.md`; lo pendiente en `BACKLOG.md`.

## 1. Requerimientos funcionales

### 1.1 Básicos: tareas, categorías y organización
| ID | Requerimiento | Estado | Dónde |
|---|---|---|---|
| RF-01 | Crear, editar, completar, reabrir y eliminar tareas, con deshacer/rehacer (Ctrl+Z) | ✅ | `modal-tarea.js`, `tareas-logica.js`, `deshacer.js` |
| RF-02 | Atributos de tarea: nombre, descripción, categoría, duración, costo, disfrute, urgencia, ubicación, meta, persona, fechas (habilitada, sugerida, límite) | ✅ | `modelos.js`, `formulario-tarea.js` |
| RF-03 | Categorías jerárquicas con color, prioridad y disfrute | ✅ | `categorias.view.js` |
| RF-04 | Ubicaciones con coordenadas, metas con plazo, personas con contacto y etiquetas | ✅ | `ubicaciones.view.js`, `metas.view.js`, `personas.view.js` |
| RF-05 | Checklist dentro de las tareas con repetición | ✅ | `checklist-tarjeta.js` |
| RF-06 | Edición y eliminación masiva (selección múltiple) | ✅ | `edicion-masiva.js` |
| RF-07 | Dictado del nombre por voz | ✅ | `formulario-tarea.js` |
| RF-08 | Ocultar hábitos, limpiar completadas viejas, exportar/importar JSON | ✅ | `habitos.view.js`, `configuraciones.view.js` |

### 1.2 Relaciones y repetición
| ID | Requerimiento | Estado | Dónde |
|---|---|---|---|
| RF-10 | Dependencias 1 a 1 entre tareas (cadenas) con bloqueo/desbloqueo automático y reparación de ciclos | ✅ | `dependencias.js` |
| RF-11 | Tareas con repetición: cada N días/semanas/meses, en día fijo, día obligatorio, días hábiles, «repetir hasta» | ✅ | `tareas-logica.js` |
| RF-12 | Anillos de repetición (desencadenantes) | ✅ | `tareas-logica.js` |
| RF-13 | Plantillas de cadenas (procedimientos típicos) | ✅ | `plantillas.js` |
| RF-14 | Delegar una tarea a una persona con fecha de seguimiento | ✅ | `resumen.view.js`, `formulario-tarea.js` |
| RF-15 | Conectar una tarea a un evento de Google Calendar | ⏳ | — |

### 1.3 Priorización
| ID | Requerimiento | Estado | Dónde |
|---|---|---|---|
| RF-20 | Orden de prioridad por accionable, fecha efectiva, categoría y orden manual | ✅ | `tareas-logica.js` (`compararPorPrioridad`) |
| RF-21 | Holgura (margen hasta el límite) visible en horas | ✅ | `tabla.view.js` |
| RF-22 | Desempate manual (Versus, ▲▼) | ✅ | `tabla.view.js` |
| RF-23 | Orden de agendado por holgura | ✅ | `compararParaAgendar` |

### 1.4 Vistas
| ID | Requerimiento | Estado | Dónde |
|---|---|---|---|
| RF-30 | Resumen (vencidas, urgentes, hoy, mañana, sin hueco, seguimientos) | ✅ | `resumen.view.js` |
| RF-31 | Agenda (3, 8, 15 días) | ✅ | `vista-agenda.js` |
| RF-32 | Semana con eventos de Calendar, carga por día, clima y horarios disponibles | ✅ | `semana.view.js` |
| RF-33 | Gantt (plan, ventana, zoom, días no hábiles) | ✅ | `gantt.view.js` |
| RF-34 | Tabla con filtros, columnas, acciones por fila y agrupar por categoría | ✅ | `tabla.view.js` |
| RF-35 | Estadísticas: resumen, progreso por categoría, hábitos, Calendar pasado, estimado vs. real | ✅ | `estadisticas.view.js` |
| RF-36 | Memento mori (calendario de la vida) | ✅ | `memento.view.js` |
| RF-37 | Evolución de una meta en el tiempo / metas medibles | ⏳ | — |

### 1.5 Agendado automático
| ID | Requerimiento | Estado | Dónde |
|---|---|---|---|
| RF-40 | Asignar día y hora a toda tarea activa, respetando Calendar, horarios disponibles, capacidad del día, días hábiles, fecha habilitada y cadenas | ✅ | `programador.js` |
| RF-41 | Nunca dejar una tarea activa sin hora; si no hay hueco antes del límite, agendar después y avisar | ✅ | `programador.js`, `aviso-sin-hueco.js` |
| RF-42 | Reubicar, adelantar y reordenar cuando Calendar cambia | ✅ | `programador.js` |
| RF-43 | No asignar ni mover horarios sin una lectura confiable de Calendar | ✅ | `google-calendar.js` |
| RF-44 | Horario preferido por tarea/hábito, tiempos de traslado, bloques de foco | ⏳ | ver `INVESTIGACION_COMPETENCIA.md` |

### 1.6 Datos y cuentas
| ID | Requerimiento | Estado | Dónde |
|---|---|---|---|
| RF-50 | Guardar los datos en el Google Drive del usuario (único destino), con copia local durable | ✅ | `almacenamiento.js`, `google-drive-sync.js` |
| RF-51 | Sincronizar entre dispositivos mezclando por campo, con tombstones y avisos | ✅ | `sincronizacion.js` |
| RF-52 | Mantener la sesión de Google sola y mostrar el motivo de los fallos | ✅ | `google-auth.js` |
| RF-53 | Leer Google Calendar (solo lectura) de varios calendarios | ✅ | `google-calendar.js` |
| RF-54 | Recordatorio de copia de seguridad y plan de contingencia | ✅ | `almacenamiento.js`, `PLAN_B.md` |
| RF-55 | Destino de datos alternativo a Drive | ⏳ | `PLAN_B.md` |
| RF-56 | Notificaciones del navegador | ⏳ | — |

### 1.7 Experiencia
| ID | Requerimiento | Estado | Dónde |
|---|---|---|---|
| RF-60 | Menú lateral compactable, atajos de teclado, avisos en ventanas propias | ✅ | `app.js`, `atajos.js`, `avisos.js` |
| RF-61 | Sonidos sintetizados y animaciones suaves, desactivables | ✅ | `sonidos.js` |
| RF-62 | Instalable como PWA y utilizable sin conexión | ✅ | `sw.js`, `manifest.json` |
| RF-63 | Diseño adaptado a celular | 🟡 | CSS responsive básico; rediseño pendiente |
| RF-64 | Mejor experiencia de la capa de IA conectable | ⏳ | — |

## 2. Requerimientos no funcionales

| ID | Requerimiento | Estado |
|---|---|---|
| RNF-01 | **Simplicidad técnica**: HTML/CSS/JS sin backend, sin build ni frameworks | ✅ |
| RNF-02 | **Privacidad**: los datos solo viven en el Drive del usuario y su navegador; permisos mínimos (`drive.file`, Calendar solo lectura) | ✅ (`privacidad.html`) |
| RNF-03 | **Confiabilidad**: nunca mostrar «guardado» antes de que Drive confirme; cambios pendientes sobreviven a cerrar la pestaña | ✅ |
| RNF-04 | **Disponibilidad sin red**: usar y editar sin conexión con subida diferida | ✅ |
| RNF-05 | **Integridad**: una sola pestaña edita a la vez; reparación de enlaces inconsistentes | ✅ |
| RNF-06 | **Idioma**: textos y código de dominio en español castellano | ✅ (`AGENTS.md`) |
| RNF-07 | **Accesibilidad**: etiquetas, foco de teclado y reducción de movimiento | 🟡 |
| RNF-08 | **Rendimiento**: guardar al instante; agendado en segundo plano | ✅ |
| RNF-09 | **Portabilidad**: servible desde cualquier hosting estático | ✅ (`PLAN_B.md`) |
| RNF-10 | **Mantenibilidad**: documentación viva por cada cambio | ✅ (`AGENTS.md`) |
| RNF-11 | **Seguridad**: el token de Google solo en memoria; el texto se muestra sin interpretarlo como HTML | ✅ |
| RNF-12 | **Pruebas automáticas** | ⏳ (hoy se verifica a mano en el navegador) |
| RNF-13 | **Verificación de la app OAuth de Google** para abrirla a cualquier usuario | ⏳ (`ACCESO_USUARIOS_PRUEBA.md`) |

## 3. Pendientes principales

Ver `BACKLOG.md`: rediseño mobile, conectar tareas a eventos de Calendar, metas medibles, notificaciones, mejora de la experiencia de IA, SRS, limpieza de datos personales antes de publicar el repositorio y las ideas de `INVESTIGACION_COMPETENCIA.md`.
