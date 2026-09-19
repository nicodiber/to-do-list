# Rediseño acordado

Documentación viva del **"cómo debería ser"**: lo que se decidió cambiar respecto a la foto de hoy que describe [CASOS_DE_USO.md](CASOS_DE_USO.md). Es la especificación de la que salen las próximas rondas de implementación y el rediseño visual/funcional del frontend. Cuando algo se implementa, se marca ✅ y se actualiza `CASOS_DE_USO.md` (que vuelve a describir la realidad) y `BACKLOG.md`/`CHANGELOG.md`.

Estados: **✅ Definido** (decidido con el usuario, listo para implementar) · **❓ Abierto** (falta una decisión) · **🔮 Post-v1.0** (fuera de foco hasta después de la v1.0).

## Principios transversales

- ✅ **Atajos de teclado** en casi todo lo que se pueda, para que un usuario experto maneje STDL sin mouse (hoy solo existe "N").
- ✅ **Emojis representativos** complementando todos los textos de la interfaz, de forma consistente.
- ✅ **Los datos de tareas nunca dependen solo de `localStorage`.** `localStorage` queda solo para preferencias (tema, ubicación actual).
- ✅ **La UI nunca dice "guardado" hasta que sea cierto** (confirmado en el destino real).
- ✅ **Plantear casos borde**: al definir cada funcionalidad se anticipan los escenarios que el usuario no mencionó (ver `AGENTS.md`).

## Cabecera y navegación

- ✅ **Botón "+" fijo en la cabecera**, visible en todas las vistas: lleva a Tareas y enfoca el input de alta (mismo efecto que el atajo "N").
- ✅ **Contador "Completar carga de tareas (X)"** visible en toda la app, **solo si X > 0** (ver A3 abajo).
- ✅ **Estado de guardado siempre visible** en la cabecera (ver "Almacenamiento").
- ✅ **Vista "Configuraciones"**: por ahora solo "Importar JSON" y "Exportar JSON" (que dejan de estar en la cabecera). Drive queda en la cabecera. Importar debe **pedir confirmación** antes de reemplazar todo.
- ✅ **Vista nueva "Tablero"** con pestañas: *Progreso por categoría* y *Hábitos* (ver más abajo).
- ✅ **Vista nueva "Mejoras"** para repasar las notas de mejora de las tareas de mantenimiento (ver A4).
- ❓ **Semana**: candidata a eliminarse o fusionarse con "8 días" (el usuario considera que 8 días la reemplaza).

## A1 · Hoy

- ✅ **"Elegí por categoría" pasa a llamarse "Próximos por categoría"**: la mejor tarea del subárbol de cada categoría **raíz** (ver `mejorTareaPorCategoria`), con el camino de la categoría en la etiqueta.
- ✅ **Sin duplicados**: "Próximos por categoría" va primero, y "Resto" muestra el remanente **sin** las tareas ya mostradas arriba.
- ✅ **Filtro "focus" en Hoy** (botón), **arranca en `false`**: `true` = solo las tareas de Hoy sin completar; `false` = esas más las completadas **de hoy** (por `tarea_fecha_fin`), que además muestran su botón de exportar a Calendar. ❓ Pendiente de evaluar con uso real: si las completadas van en una sección aparte abajo o tachadas en su lugar.
- ✅ **Aviso "☀️" de clima favorable** (probabilidad de lluvia menor a 50%) en la tarjeta de la tarea. Hoy solo existe el aviso desfavorable.
- ✅ **Botón "Posponer" junto al aviso de solapamiento con Calendar.**

## A2 · Alta de tareas

- ✅ **Un solo formulario** (se elimina el segundo campo de nombre): el input de "agregar tarea rápida" queda arriba (Enter agrega), y el resto de los campos quedan siempre visibles debajo, todos opcionales. "Agregar" solo exige el nombre.
- ✅ **Atajo "N"** enfoca ese input (ya lo hace; sigue cubriendo alta rápida y completa porque están en la misma pantalla).
- ✅ **`tarea_disfrute`** (1-5 o `null`) en el formulario. *(Ya implementado en v0.50.0.)*
- ✅ **Dependencias en el alta** (ver "Dependencias 1 a 1").

## A3 · Completar carga de tareas

- ✅ El sistema detecta las tareas "solo con nombre": `categoria_id`, `tarea_importancia` y `tarea_disfrute` en `null`; `tarea_fecha_inicio_habilitada` igual a `tarea_creada_en`; sin `tarea_fecha_sugerida` ni `tarea_fecha_limite`; `tarea_duracion_min` 15; sin descripción, ubicación, clima, costo, mantenimiento, días hábiles, dependencia ni meta.
- ✅ Si hay al menos una, muestra en la cabecera el botón **"Completar carga de tareas (X)"** (X = cantidad). Al hacer clic, lista esas tareas cada una con su formulario y un botón **"Actualizar"**.

## A4 · Cumplir tareas, mejora continua y exportación a Calendar

- ✅ **Notas de mejora** ("¿cómo se podría mejorar para la próxima vez?"): se asocian al **nombre de la tarea** y, por ahora, solo aplican a tareas de mantenimiento. Se guardan en una **entidad nueva `Mejora`** (`tarea_nombre`, texto, fecha), independiente de las instancias, para que sobrevivan al archivado. Vista dedicada "Mejoras" para repasarlas. Además se sigue anexando la última nota a la descripción de la instancia clonada.
- ✅ **Botón "Exportar a Calendar" dentro de cada tarea**, habilitado una vez completada. El usuario **conserva el control** de qué se escribe en Calendar: se mantiene el mecanismo actual (pestaña de Calendar con el evento precargado); se descartó escribir vía API.
- ✅ **Campo nuevo `tarea_exportada_calendar`** (booleano): se marca al usar el botón (no verifica que el usuario haya guardado el evento).
- ❓ **`confirm()` al completar** ("¿Abrir «tarea» en Google Calendar…?"): decidir si desaparece, ya que el botón por tarea lo reemplaza.
- ✅ **Checklist en tareas de mantenimiento**: lista de pasos dentro de la tarea para definir el proceso. Ya estaba anotado en `BACKLOG.md`. ❓ Falta definir cuándo se resetea (al completar, o al final del día). Propuesta: la instancia clonada nace con el checklist destildado, sin lógica de reseteo aparte.
- ✅ **Se eliminó Premack** (sugerencia automática de tarea de alto disfrute). 🔮 Se retoma post-v1.0 con datos reales.

## A6 · "Revisar mi día"

- ⚠️ **A redefinir** con el usuario (¿flujo modal separado, o basta iterar Hoy?).
- ✅ Deseo del usuario: que el paso de eventos de Calendar pregunte **en secuencia, evento por evento**, si generó una tarea nueva (hoy se listan todos juntos con un único alta rápida).
- ❓ Dónde vive el paso "eventos de Calendar → tarea nueva" (o si se descarta).

## Dependencias 1 a 1

- ✅ **Regla**: cada tarea bloquea a **como máximo una** y es bloqueada por **como máximo una**. Se permite conectar tareas de **distintas categorías**.
- ✅ **En el alta**: dos desplegables, "depende de (tarea previa)" y "bloquea a (tarea próxima)", ambos con valor por defecto `null`, sin ofrecer tareas completadas.
- ✅ **Insertar en medio de una cadena**: si la previa (o la próxima) elegida ya está enlazada, igual aparece en el desplegable ("ocupada") y la tarea nueva se inserta entre ambas.
- ❓ Reglas exactas de la inserción y qué pasa al eliminar una tarea del medio de una cadena (ver conversación).

## C1 / C2 / C3 · ABMs

- ✅ **Editar categorías** ya creadas (todos sus campos), **incluyendo cambiar su categoría padre**.
- ✅ **Editar ubicaciones** ya creadas.
- ✅ **Personas**: botón "Editar último contacto" que permite indicar una fecha (hoy solo existe "Marcar contacto hoy").

## Progreso por categoría y hábitos — vista "Tablero"

- ✅ **Pestaña "Progreso por categoría"**, con todas las métricas, en este orden: (1) tareas restantes vs. completadas, (2) tiempo a la próxima `tarea_fecha_limite`, (3) tiempo a la próxima `tarea_fecha_sugerida`, (4) tiempo a la última `tarea_fecha_limite`.
- ✅ **Pestaña "Hábitos"**: mapa de calor (una celda por día, coloreada según se cumplió o no), principalmente para tareas de mantenimiento, con el lema **"lo que no se mide no se mejora"**.
  - **Semántica v1** (se ajustará después): 3 estados — cumplido, incumplido (había vencimiento y no se hizo) y "no aplica" (gris). En intervalos no diarios se muestran los cumplidos y el vencimiento esperado.
  - **Identidad del hábito** = `tarea_nombre` (renombrar corta el historial).
  - Se compacta a los **días hábiles** de la tarea (una tarea de fin de semana compara fines de semana, no semanas enteras).
  - También **un mapa por categoría**: un día cuenta si se cumplió al menos una tarea de esa categoría **o de cualquiera de sus descendientes**.
  - **Registro liviano de cumplimientos** (fecha, nombre, categoría) que sobrevive al archivado de tareas completadas.
- ✅ **Historial**: nada se borra por ahora. En algún momento las tareas completadas deberán poder **archivarse/limpiarse** una vez confirmado que ya se exportaron a Calendar.

## B2 · Gantt

- ✅ Mostrar **todas las tareas** (con o sin `tarea_fecha_sugerida`), con filtros según lo que el usuario quiera ver — hoy solo se ven las que tienen meta.
- ❓ Definir si usa `tarea_fecha_sugerida` en vez de/además de `tarea_fecha_inicio_habilitada`, y cómo marcar visualmente `tarea_fecha_limite`.
- 🔮 **Fecha implícita**: para las tareas sin `tarea_fecha_sugerida`, evaluar asignarles una posición posterior a la tarea siguiente de mayor prioridad. Se analiza en profundidad cuando se encare el rediseño del Gantt.

## E1 · Informes

- ❓ Evaluar usar Google Calendar como fuente del historial real (STDL = pendientes, Calendar = agenda fija y registro de lo ocurrido). Requiere leer un rango histórico de eventos (hoy solo se lee el día de hoy).

## Almacenamiento y sincronización

- ✅ **Google Drive por API en todos los dispositivos**. Se **elimina el modo carpeta local** (`categorias.json`/`tareas.json`) y el uso de `localStorage` como copia de las tareas.
- ✅ **Pantalla inicial obligatoria** si no hay un destino real conectado: "elegí dónde guardar", sin dejar cargar tareas hasta entonces.
- ✅ **Estado siempre visible en la cabecera**: estado (sincronizado / guardando / pendiente / conflicto), **fecha y hora del último guardado**, y un botón **"Sincronizar ahora"** que verifica contra Drive y muestra la fecha de la **última verificación** (para poder mostrar que está al día aunque el último cambio sea viejo).
- ✅ **Si un guardado falla** (sin internet, sesión vencida): los cambios quedan en un **buffer temporal marcado "pendiente"** que se borra apenas se confirma el guardado; la UI nunca lo presenta como guardado.
- ❓ Lectura sin conexión (copia de solo lectura), verificación automática al volver a la pestaña, y resolución de conflictos (elegir todo o mezclar por tarea): ver conversación.

## Post-v1.0

- 🔮 **IA conectable** (suspendida por completo).
- 🔮 **Premack / disfrute**: retomar con datos reales de `categoria_disfrute` y `tarea_disfrute`.
