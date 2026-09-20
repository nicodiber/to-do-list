# Rediseño acordado

Documentación viva del **"cómo debería ser"**: lo que se decidió cambiar respecto a la foto de hoy que describe [CASOS_DE_USO.md](CASOS_DE_USO.md). Es la especificación de la que salen las próximas rondas de implementación y el rediseño visual/funcional del frontend. Cuando algo se implementa, se marca ✅ y se actualiza `CASOS_DE_USO.md` (que vuelve a describir la realidad) y `BACKLOG.md`/`CHANGELOG.md`.

Estados: **✅ Definido** (decidido con el usuario, listo para implementar) · **❓ Abierto** (falta una decisión) · **🔮 Post-v1.0** (fuera de foco hasta después de la v1.0).

## Principios transversales

- ✅ **Atajos de teclado** en casi todo lo que se pueda, para que un usuario experto maneje STDL sin mouse (hoy solo existe "N").
- ✅ **Emojis representativos** complementando todos los textos de la interfaz, de forma consistente.
- ✅ **Los datos de tareas nunca dependen solo de `localStorage`.** `localStorage` queda solo para preferencias (tema, ubicación actual). *(Implementado en v0.51.0.)*
- ✅ **La UI nunca dice "guardado" hasta que sea cierto** (confirmado en el destino real). *(Implementado en v0.51.0.)*
- ✅ **Hora local y en 24 h**: la app toma como referencia la zona horaria del dispositivo (en Argentina, UTC-3 sin horario de verano) y muestra las horas en 24 h en todas las pantallas; el día de un instante nunca se saca cortando el texto UTC. *(Implementado en v0.56.1.)* Feriados nacionales y días no laborables: pendiente (ver `BACKLOG.md`).
- ✅ **Plantear casos borde**: al definir cada funcionalidad se anticipan los escenarios que el usuario no mencionó (ver `AGENTS.md`).

## Cabecera y navegación

- ✅ **Botón "+" fijo en la cabecera**, visible en todas las vistas: lleva a Tareas y enfoca el input de alta (mismo efecto que el atajo "N"). *(Implementado en v0.53.0.)*
- ✅ **Contador "Completar carga de tareas (X)"** visible en toda la app, **solo si X > 0** (ver A3 abajo). *(Implementado en v0.53.0.)*
- ✅ **Estado de guardado siempre visible** en la cabecera (ver "Almacenamiento"). *(Implementado en v0.51.0.)*
- ✅ **Vista "Configuraciones"** *(implementada en v0.54.0, con un "Borrar todos los datos" de doble confirmación además)*: por ahora solo "Importar JSON" y "Exportar JSON" (que dejan de estar en la cabecera). Drive queda en la cabecera. Importar debe **pedir confirmación** antes de reemplazar todo. *(La confirmación ya está desde v0.51.0; la vista y el traslado de los botones llegan en la Ronda 5.)*
- ✅ **Progreso por categoría y Hábitos, como solapas de Estadísticas** *(implementado en v0.57.0; en lugar de una vista "Tablero" aparte)*: Estadísticas tiene tres solapas internas: Resumen · Progreso por categoría · Hábitos (ver "Progreso por categoría y hábitos" más abajo).
- ✅ **Vista nueva "Mejoras"** *(implementada en v0.57.0)*: solapa propia, después de Tareas, para repasar las notas de mejora de las tareas de mantenimiento: agrupadas por tarea, con filtro Pendientes / Aplicadas / Todas y las acciones marcar como aplicada, editar y eliminar (ver A4).
- ✅ **Pestañas** *(v0.55.0)*: Hoy · Agenda (unifica 3 y 8 días, con selector 3 · 8 · 15) · Semana · Gantt · Tabla · Estadísticas (antes Informes) · Categorías · Ubicaciones · Metas · Tareas · Personas · Configuraciones. Semana se mantiene (grilla por horas).

## A1 · Hoy

*(Implementado en v0.56.0, Ronda 4.)*

- ✅ **"Elegí por categoría" pasa a llamarse "Próximos por categoría"**: la mejor tarea del subárbol de cada categoría **raíz** (ver `mejorTareaPorCategoria`), con el camino de la categoría en la etiqueta (por ejemplo "Facultad / IR").
- ✅ **Sin duplicados**: "Próximos por categoría" va primero (después de "Urgentes"), y "Resto" muestra el remanente **sin** las tareas ya mostradas arriba; si no queda nada, la sección "Resto" no aparece.
- ✅ **Botón "🎯 Enfoque" en Hoy**, **arranca apagado** (preferencia de este dispositivo): encendido = solo las tareas de Hoy sin completar; apagado = esas más las completadas **de hoy** (por `tarea_fecha_fin`, en el día local), en una **sección aparte al final, visible** ("Completadas hoy (N)"), con la tarjeta apagada y un botón **"📅 Exportar a Calendar"** por tarea (queda "📅 Exportada" y el botón pasa a "Exportar de nuevo"). Decidido con el usuario: sección aparte y visible, no tachadas en su lugar; se reevalúa con uso real.
- ✅ **Aviso "☀️" de clima favorable** ("Buen clima previsto (N% de lluvia)", con lluvia de hasta 50%) en la tarjeta de las tareas que piden buen clima; con más de 50% sigue el aviso de lluvia.
- ✅ **Botones "Posponer" y "Al próximo hueco libre" junto al aviso de solapamiento con Calendar.** "Posponer" abre el panel de fecha y hora de siempre. "Al próximo hueco libre" busca **desde la hora sugerida en adelante** (nunca antes de ahora) el primer momento en que la tarea, con su duración, no choque con ningún evento; **no se limita a hoy** (mira los próximos 15 días de Calendar, `DIAS_HORIZONTE_CALENDAR`), respeta los días hábiles de la tarea y una **franja horaria configurable** en Configuraciones (por defecto todo el día, 00:00 a 24:00). Si no hay hueco en todo el horizonte avisa y abre el panel de Posponer.
- ✅ **El aviso de solapamiento ahora también marca las tareas de los próximos días** (antes solo se comparaba contra los eventos de hoy), porque la lectura de Calendar pasó a ser por rango de fechas.
- ✅ **Los avisos de Calendar se actualizan solos**: "Sincronizar ahora" y volver a la pestaña olvidan los eventos guardados y, si se está mirando Hoy (sin ventanas ni paneles abiertos ni texto a medio escribir), redibujan.
- ✅ **Checklist de mantenimiento se tilda desde Hoy** (mismo componente que la vista Tareas).
- 🔮 **Pendiente**: horizonte de Calendar configurable (7 / 15 / 30 días), mostrar los eventos de varios días en Agenda y Semana, y "Reabrir" desde "Completadas hoy". "Revisar mi día" sigue igual (se redefine con uso real).

## A2 · Alta de tareas

- ✅ **Un solo formulario** (se elimina el segundo campo de nombre): el input de "agregar tarea rápida" queda arriba (Enter agrega), y el resto de los campos quedan siempre visibles debajo, todos opcionales. "Agregar" solo exige el nombre.
- ✅ **Atajo "N"** enfoca ese input (ya lo hace; sigue cubriendo alta rápida y completa porque están en la misma pantalla).
- ✅ **`tarea_disfrute`** (1-5 o `null`) en el formulario. *(Ya implementado en v0.50.0.)*
- ✅ **Dependencias en el alta** (ver "Dependencias 1 a 1").
- ✅ **Borradores de formulario**: el formulario de alta conserva lo escrito ante cualquier redibujado (cambios de otro dispositivo, acciones locales como tildar un paso de un checklist o cumplir otra tarea, y filtros); se limpia solo al agregar. Los demás formularios de la app se siguen vaciando al agregar. *(Implementado en v0.53.0.)*
- ✅ **Edición separada del alta, en una ventana modal** *(implementado en v0.53.0)*: al editar una tarea (desde Tareas, Tabla, Gantt o Semana) se abre una ventana modal con solo esa tarea, sin navegar. Esc o clic afuera preguntan "¿Descartar los cambios?" solo si hay cambios sin guardar; si la tarea se eliminó o cambió en otro dispositivo mientras estaba abierta, avisa. Sin ruta propia (`#/tareas/editar/<id>`, queda en el backlog). Dependencia y Meta dejan de ser botones de la fila: son campos del formulario, y en la fila queda un solo "Editar".

- ❓ **Ideas de la validación de la Ronda 3, a definir con el usuario** (detalle en `BACKLOG.md`): crear categoría/ubicación/meta desde el propio desplegable del formulario y volver a terminar la tarea; **reutilizar la ventana modal también para crear tareas** (hoy el alta es el formulario de la vista Tareas); desplegables con búsqueda por texto; interruptores Sí/No en lugar de casillas; emojis en los títulos de los campos; botones con colores y emojis; botón "Limpiar campos" con confirmación; interruptor pendiente/completada; atajo de teclado para Agregar (propuesta: Ctrl+Enter). Todo el aspecto visual se trabaja en la Ronda 8.
- ✅ **El nombre de la tarea siempre empieza con mayúscula** *(v0.53.1)*.
- ✅ **Las tarjetas muestran de qué depende una tarea y a cuál bloquea**, sin entrar a editar, y la categoría acompaña al nombre en los desplegables de enlaces *(v0.53.1)*.

- ✅ **Rediseño de pestañas y de la vista Tareas** *(implementado en v0.55.0)*: la vista Tareas con la plantilla de Categorías (botón "＋ Nueva tarea" y listado debajo; la alta se abre en la ventana modal, también desde el "＋" y la tecla N, con Enter = agregar y cargar otra); nuevo orden de pestañas y Estadísticas (ahí irá el tracking de hábitos); Semana ajustada al ancho (3-4 días con flechas en celular); Tabla con todas las columnas y selector de columnas (categoría con su cadena); tarjetas con borde del color de la categoría, vencidas con etiqueta y fondo, orden pendientes → bloqueadas → completadas con las completadas plegadas; throughput con 2 semanas hechas y 6 planificadas.

## A3 · Completar carga de tareas

- ✅ El sistema detecta las tareas "solo con nombre": `categoria_id`, `tarea_importancia` y `tarea_disfrute` en `null`; `tarea_fecha_inicio_habilitada` igual a `tarea_creada_en`; sin `tarea_fecha_sugerida` ni `tarea_fecha_limite`; `tarea_duracion_min` 15; sin descripción, ubicación, clima, costo, mantenimiento, días hábiles, dependencia ni meta.
- ✅ Si hay al menos una, muestra en la cabecera el botón **"Completar carga de tareas (X)"** (X = cantidad). Al hacer clic, lista esas tareas cada una con su formulario y un botón **"Actualizar"**, más un botón **"Dejar así"** que marca `tarea_carga_completa` y la saca de la lista (para tareas que deben quedar con solo el nombre). *(Implementado en v0.53.0.)*

## A4 · Cumplir tareas, mejora continua y exportación a Calendar

- ✅ **Notas de mejora** ("¿cómo se podría mejorar para la próxima vez?"): se asocian al **nombre de la tarea** y, por ahora, solo aplican a tareas de mantenimiento. Se guardan en una **entidad nueva `Mejora`** (`tarea_nombre`, texto, fecha), independiente de las instancias, para que sobrevivan al archivado. Vista dedicada "Mejoras" para repasarlas. Además se sigue anexando la última nota a la descripción de la instancia clonada. *(La vista "Mejoras", con marcar aplicada, editar y eliminar, y una línea "💡 Mejora pendiente" en la tarjeta de Hoy de la tarea, se implementó en v0.57.0.)*
- ✅ **Botón "Exportar a Calendar" dentro de cada tarea**, habilitado una vez completada. El usuario **conserva el control** de qué se escribe en Calendar: se mantiene el mecanismo actual (pestaña de Calendar con el evento precargado); se descartó escribir vía API.
- ✅ **Campo nuevo `tarea_exportada_calendar`** (booleano): se marca al usar el botón (no verifica que el usuario haya guardado el evento).
- ✅ **La pregunta al completar se mantiene** ("¿Abrir «tarea» en Google Calendar…?"): el usuario no la considera una interrupción. *(Desde v0.54.1 es una ventana de la página y no un `confirm()` del navegador, porque este último hacía que el navegador bloqueara la pestaña de Calendar.)* El botón "Exportar a Calendar" por tarea **se suma**, no lo reemplaza.
- ✅ **Checklist en tareas de mantenimiento** *(campo en v0.52.0; edición en la ventana modal y casillas en la tarjeta de la vista Tareas en v0.53.0; tildarlo en Hoy va con la Ronda 4)*: lista de pasos dentro de la tarea para definir el proceso. Ya estaba anotado en `BACKLOG.md`. ❓ Falta definir cuándo se resetea (al completar, o al final del día). Propuesta: la instancia clonada nace con el checklist destildado, sin lógica de reseteo aparte.
- ✅ **Se eliminó Premack** (sugerencia automática de tarea de alto disfrute). 🔮 Se retoma post-v1.0 con datos reales.

## A6 · "Revisar mi día"

- ⚠️ **A redefinir** con el usuario (¿flujo modal separado, o basta iterar Hoy?).
- ✅ El paso **"eventos de Calendar → tarea nueva" se descarta por ahora**: una tarea de continuidad se crea con el botón "+". 🔮 Se evalúa post-v1.0. (Queda en suspenso el deseo de que ese paso pregunte en secuencia evento por evento, ya que el paso está descartado.)

## Dependencias 1 a 1

- ✅ **Regla**: cada tarea bloquea a **como máximo una** y es bloqueada por **como máximo una**. Se permite conectar tareas de **distintas categorías**.
- ✅ **En el alta**: dos desplegables, "depende de (tarea previa)" y "bloquea a (tarea próxima)", ambos con valor por defecto `null`, sin ofrecer tareas completadas.
- ✅ **Insertar en medio de una cadena**: si la previa (o la próxima) elegida ya está enlazada, igual aparece en el desplegable ("ocupada") y la tarea nueva se inserta entre ambas. Con la cadena P→N:
  - Se elige solo *previa = P* (P ya bloquea a N): A se inserta en medio, P→A→N.
  - Se elige solo *próxima = N* (N ya tiene previa P): mismo resultado, P→A→N.
  - Se eligen *previa = P* y *próxima = N*: si son consecutivas se inserta en medio; si **no** lo son (hay tareas entre ellas, o son de cadenas distintas) se **rechaza indicando el conflicto**, para que el usuario reajuste y termine la carga.
  - Al **eliminar** una tarea del medio (P→A→N), se **reconecta P→N**.
  - El panel "Dependencia" de la edición sigue las mismas reglas y filtros que el alta.
- ✅ **Ciclos de mantenimiento**: cuando una cadena de tareas de mantenimiento se repite en anillo (A→B→C→D y D desencadena de nuevo a A), el clon de A debe nacer enlazado a D, pero A no puede depender de D desde el inicio sin quedar bloqueada (y los ciclos se rechazan). Solución: campo `tarea_desencadenante` (solo mantenimiento), que **no bloquea nada por sí mismo** y se aplica **al crear el clon**: al completar A, su clon A' nace bloqueado por D; cada clon hereda el enlace apuntando a la instancia pendiente vigente de su previa (B' depende de A', C' de B', D' de C'); al completar D se desbloquea A' con el mecanismo habitual. Si se elimina D, el desencadenante de A pasa a C (misma lógica que al eliminar una tarea del medio de una cadena).

## C1 / C2 / C3 · ABMs

- ✅ **Editar categorías** ya creadas (todos sus campos), **incluyendo cambiar su categoría padre**. *(Implementado en v0.54.0: el padre no puede ser la propia categoría ni una descendiente.)*
- ✅ **Editar ubicaciones** ya creadas. *(v0.54.0)* Las coordenadas se siguen cargando a mano (grados decimales); GPS y buscador de direcciones quedan descartados por ahora.
- ✅ **Personas**: "Editar" permite cambiar el nombre y la fecha del último contacto; "Marcar contacto hoy" se mantiene. *(v0.54.0)*
- ✅ **Metas**: también se pueden editar. *(v0.54.0)*
- ✅ **Crear con botón "＋ Nueva …" y ventana modal**, la misma que se usa para editar y para **crear categoría, ubicación o meta desde el desplegable de la tarea**. *(v0.54.0)* Para tarea previa/próxima no se ofrece "crear nueva tarea" por ahora (ver la idea de usar el modal también para el alta de tareas, en `BACKLOG.md`).

## Progreso por categoría y hábitos — solapas de Estadísticas

*(Implementado en v0.57.0, Ronda 6.)* Decisiones tomadas con el usuario al implementarlo, que ajustan lo de abajo:

- ✅ **Ubicación**: no hay una vista "Tablero" aparte. Estadísticas tiene solapas internas (Resumen · Progreso por categoría · Hábitos) y Mejoras es una solapa propia de la barra.
- ✅ **Modelo**: cada `Cumplimiento` guarda además el intervalo (`cumplimiento_intervalo`) y los días hábiles (`cumplimiento_dias_habiles`) de la tarea al cumplirla; sin eso no se puede saber si un día sin registro fue un incumplimiento (hábito diario) o simplemente no tocaba. Se hizo antes de cargar datos reales para que el historial nazca completo.
- ✅ **Mapa de hábitos en matriz**: un hábito por fila y un día por columna (7 · 30 · 90 días, por defecto 30, preferencia del dispositivo), con color **y** símbolo (✓ cumplido, ✗ incumplido, ▫ pendiente hoy, · no aplica). Como las columnas son fechas compartidas por todos los hábitos, "compactar a días hábiles" se resuelve marcando los días no hábiles de cada hábito como "no aplica" y calculando racha y porcentaje solo sobre los días que aplican. Junto a cada hábito: **racha actual y porcentaje de cumplimiento** del período. El calendario por hábito (estilo GitHub) queda en el backlog.
- ✅ **Mapa por categoría**: por categoría raíz, un día cuenta si se cumplió cualquier tarea (de mantenimiento o no) de la categoría o de sus descendientes; los días sin actividad quedan en blanco, nunca "incumplidos".
- ✅ **Progreso por categoría**: una tarjeta por categoría raíz que suma toda su rama, con un desplegable de subcategorías y las 4 métricas de abajo; las tareas sin categoría van en una tarjeta aparte.
- ✅ **Renombrar** una tarea de mantenimiento actualiza solo su historial (cumplimientos y mejoras) al nuevo nombre, con un aviso; el hábito no se parte.

- ✅ **Solapa "Progreso por categoría"**, con todas las métricas, en este orden: (1) tareas restantes vs. completadas, (2) tiempo a la próxima `tarea_fecha_limite`, (3) tiempo a la próxima `tarea_fecha_sugerida`, (4) tiempo a la última `tarea_fecha_limite`.
- ✅ **Solapa "Hábitos"**: mapa de calor (una celda por día, coloreada según se cumplió o no), principalmente para tareas de mantenimiento, con el lema **"lo que no se mide no se mejora"**.
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

## E1 · Estadísticas (antes Informes)

- ❓ Evaluar usar Google Calendar como fuente del historial real (STDL = pendientes, Calendar = agenda fija y registro de lo ocurrido). Requiere leer un rango histórico de eventos (hoy solo se lee el día de hoy).

## Almacenamiento y sincronización

> ✅ **Implementado en v0.51.0 (Ronda 1)** — todo lo de esta sección; `CASOS_DE_USO.md` (D1-D3) y `PROCESOS_AUTOMATICOS.md` (10-13) vuelven a describir la realidad. Detalles de lo construido: el estado "conflicto" se resolvió como **avisos** persistentes (no un estado de la cabecera); las ediciones de un campo con foco difieren la actualización remota ("Actualizar"); una segunda pestaña abierta queda en solo lectura; los datos viejos de `localStorage` se ofrecen para mezclar con Drive o descartar. "Importar JSON" ya pide confirmación (aunque sigue en la cabecera hasta la vista Configuraciones, Ronda 5). ⏳ Falta validar en el navegador real la reconexión silenciosa de Google y publicar la app OAuth "En producción" (ver `README.md`).

- ✅ **Google Drive por API en todos los dispositivos**. Se **elimina el modo carpeta local** (`categorias.json`/`tareas.json`) y el uso de `localStorage` como copia de las tareas.
- ✅ **Pantalla inicial obligatoria** si no hay un destino real conectado: "elegí dónde guardar", sin dejar cargar tareas hasta entonces.
- ✅ **Estado siempre visible en la cabecera**: estado (sincronizado / guardando / pendiente / conflicto), **fecha y hora del último guardado**, y un botón **"Sincronizar ahora"** que verifica contra Drive y muestra la fecha de la **última verificación** (para poder mostrar que está al día aunque el último cambio sea viejo).
- ✅ **Si un guardado falla** (sin internet, sesión vencida): los cambios quedan en un **buffer temporal marcado "pendiente"** que se borra apenas se confirma el guardado; la UI nunca lo presenta como guardado.
- ✅ **Copia de solo lectura sin conexión**: si al abrir no hay conexión, se muestra la última copia sincronizada, con un aviso visible mientras no haya conexión ("sin conexión — datos al 19/09 14:32") y otro aviso cuando la conexión se establece y se sincroniza ("conectado y sincronizado ✓").
- ✅ **Verificación automática**: al volver a la pestaña y cada pocos minutos se chequea Drive; si hubo cambios de otro dispositivo y no hay nada pendiente propio, se actualiza solo con un aviso.
- ✅ **Mezcla por tarea** cuando hay cambios en ambos lados: cada entidad lleva un `modificado_en` y gana la más reciente; las eliminaciones se registran para que lo borrado no reviva.
- ✅ **Edición sin conexión permitida**: se puede editar todo; los cambios quedan como pendientes y se mezclan al reconectar. Si un cambio propio pierde contra uno más reciente de otro dispositivo, **se avisa cuál** (nada se pierde en silencio).
- ✅ **Un solo inicio de sesión de Google**: los permisos de Drive y de Calendar (solo lectura) se piden juntos en un único popup por sesión.
- ✅ **Formato**: un solo archivo `super-todo-list-datos.json`, con un `modificado_en` por entidad, las eliminaciones registradas por 90 días, gana la versión más reciente de cada entidad completa (no campo por campo), y verificación automática cada 5 minutos y al volver a la pestaña.

## Rondas de implementación acordadas

Orden aprobado, pensado para tener listo **antes de cargar datos reales** lo que define cómo y dónde se guardan (rondas 1 y 2; el resto solo agrega campos, sin cambiar la forma de lo guardado):

1. ✅ **Almacenamiento** (v0.51.0): Drive único, pantalla inicial obligatoria, cabecera con estado, buffer pendiente, sincronización manual, verificación automática y mezcla por tarea.
2. ✅ **Modelo de datos** (v0.52.0): entidad `Mejora`, `tarea_exportada_calendar`, registro de cumplimientos, restricción 1 a 1 de dependencias, campo de checklist, `tarea_desencadenante`. Detalle: el checklist es solo para tareas de mantenimiento y aún sin pantalla (llega con la ventana modal de edición de la Ronda 3); los cumplimientos guardan además el vencimiento esperado y si era de mantenimiento; el panel "Dependencia" de Tareas ya tiene "depende de" y "bloquea a" con inserción en medio y rechazo de conflictos (las dependencias **en el alta** siguen en la Ronda 3); reabrir una tarea de mantenimiento borra su copia si sigue sin tocar; tras mezclar cambios de dos dispositivos los enlaces que rompan la regla 1 a 1 se reparan con aviso.
3. ✅ **Alta unificada** + botón "+" + dependencias en el alta + "Completar carga de tareas (X)" (v0.53.0), más la ventana modal de edición, la pantalla del checklist y el botón "Dejar así".
4. ✅ **Hoy** (v0.56.0): Próximos por categoría sin duplicados, Enfoque, completadas de hoy con exportar a Calendar por tarea, ☀️, Posponer y "Al próximo hueco libre" en el solapamiento (lectura de Calendar por rango, franja horaria configurable) y refresco de los avisos de Calendar.
5. ✅ **ABMs** (v0.54.0, **hecha antes que la 4** a pedido del usuario, para pulir la creación de categorías, ubicaciones y metas antes de cargar datos reales): editar categorías, ubicaciones, metas y personas, crear con ventana modal (también desde el desplegable de la tarea), vista Configuraciones.
6. ✅ **Hábitos, Progreso por categoría y Mejoras** (v0.57.0): solapas de Estadísticas (Resumen · Progreso por categoría · Hábitos con mapa de calor en matriz) y la vista Mejoras; el modelo suma el intervalo y los días hábiles a cada cumplimiento y `mejora_aplicada`.
7. **Gantt**: todas las tareas + filtros.
8. **Rediseño visual, emojis y atajos** (transversal).

## Post-v1.0

- 🔮 **Eventos de Calendar → tarea nueva** (paso descartado por ahora del flujo de cierre del día).
- 🔮 **IA conectable** (suspendida por completo).
- 🔮 **Premack / disfrute**: retomar con datos reales de `categoria_disfrute` y `tarea_disfrute`.
