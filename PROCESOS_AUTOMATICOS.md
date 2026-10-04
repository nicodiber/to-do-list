# Procesos automáticos

Documentación viva (se actualiza junto con el código) de todo lo que el sistema hace **solo**, sin una acción directa del usuario — a diferencia de `CASOS_DE_USO.md`, que documenta flujos que el usuario dispara a propósito. Cada entrada sigue el formato condición → proceso → resultado, y referencia la función real que lo implementa.

## 1. Clonado de una tarea de mantenimiento al completarla

- **Condición**: se marca como completada una tarea con `tarea_mantenimiento = true`.
- **Proceso**: `cumplirTarea` (`assets/js/tareas-logica.js`) calcula la próxima `tarea_fecha_limite` a partir de la fecha **real** de finalización, tomada como día local (una tarea completada a las 22:00 en Argentina suma desde ese día y no desde el siguiente), más `tarea_mantenimiento_intervalo` (`calcularProximaFechaMantenimiento`), y clona una nueva instancia pendiente con el mismo nombre, categoría, importancia, ubicación, días hábiles, clima, meta, duración, intervalo, costo estimado, disfrute y `tarea_desencadenante`, el checklist con todos los ítems destildados y `tarea_exportada_calendar` en `false` (más la nota de mejora, si se cargó, anexada a la descripción). Además **enlaza la copia**: si la original tenía tarea previa P, la copia depende de la instancia vigente de P (la misma P si sigue sin completar, o su copia pendiente con el mismo nombre); si no tenía previa pero sí desencadenante D, la copia queda bloqueada por la instancia vigente de D. Nunca crea un enlace que rompa la regla 1 a 1 ni que forme un ciclo.
- **Resultado**: la instancia completada queda como historial; nace una nueva tarea pendiente (o bloqueada, si se enlazó) con la fecha recalculada. Una cadena A→B→C→D con D como desencadenante de A se sostiene sola: al completar A, su copia A' queda bloqueada por D; B' depende de A', C' de B', D' de C', y al completar D se desbloquea A'.

- **Cambio de la v0.101.0**: la copia ya no nace con fecha límite sino con `tarea_fecha_sugerida` = el día que le toca (cada N desde el cumplimiento o en un día fijo, pasando al próximo día hábil si hace falta) y `tarea_mantenimiento_objetivo`; solo con «día obligatorio» ese día también es el límite. El agendado la ubica ese día o después, nunca antes.

## 2. Desbloqueo en cascada al completar una tarea

- **Condición**: se completa una tarea de la que otras dependen (`tarea_dependiente`).
- **Proceso**: `desbloquearDependientes` recorre las tareas con `tarea_dependiente` igual a la recién completada, les copia `tarea_fecha_inicio_habilitada = tarea_fecha_fin` de la completada, y recalcula su `tarea_estado` (`recalcularBloqueo`).
- **Resultado**: las tareas dependientes pasan de `bloqueada` a `pendiente` automáticamente, con su fecha de inicio habilitada actualizada.

## 3. Recálculo de bloqueo al crear/editar una dependencia

- **Condición**: se crea una tarea con `tarea_dependiente`, o se cambia/quita la dependencia de una tarea existente.
- **Proceso**: `aplicarEnlace` (`assets/js/dependencias.js`) valida la regla 1 a 1 (cada tarea bloquea a una y es bloqueada por una), sin ciclos ni tareas completadas; si se elige una tarea ya enlazada, inserta la nueva en medio (P→A→N), y si el pedido es contradictorio lo rechaza explicando el conflicto. Luego `recalcularBloqueo` consulta si la tarea previa ya está `completada`.
- **Resultado**: `tarea_estado` queda en `bloqueada` (si la previa no está completada) o `pendiente` (si sí, o si no hay dependencia); las tareas afectadas por la inserción se recalculan también.

## 4. Reprogramado en cascada al posponer

- **Condición**: cambia `tarea_fecha_sugerida` de una tarea que tiene otras dependiendo de ella.
- **Proceso**: `reprogramarTareaConCascada` calcula el delta entre la fecha vieja y la nueva, y lo aplica (`desplazarFecha`) a `tarea_fecha_sugerida` de cada dependiente, recursivamente, con protección contra ciclos. **Nunca toca `tarea_fecha_limite`** (v0.76.0 — antes la desplazaba también, para que la cadena no quedara con un límite "imposible"; se sacó porque solo el usuario puede cambiarla).
- **Resultado**: toda la cadena de tareas dependientes corre su fecha sugerida el mismo tiempo, sin tocarlas una por una. Si alguna dependiente queda con la sugerida después de su propia fecha límite (que no se tocó), se avisa por nombre (`avisoInconsistentes`) en vez de corregirla sola.

## 5. Reprogramado automático de fecha sugerida vencida

- **Condición**: al iniciar la app, existe una tarea activa (no `completada`) con `tarea_fecha_sugerida` en el pasado.
- **Proceso** (v0.92.0 — antes `reprogramarFechasSugeridasVencidas`, `tareas-logica.js`, saltaba al próximo día hábil conservando la misma hora sin mirar Calendar ni si ese día ya estaba lleno): `reprogramarVencidas` (`assets/js/programador.js`) busca, desde hoy, el primer día con capacidad real (`crearCalculadoraCapacidad`, respetando `tarea_dias_habiles` y sin superar `tarea_fecha_limite`) y, dentro de ese día, un hueco horario que no choque con Calendar ni con otra tarea de STDL ya asignada; aplica el resultado en cascada a sus dependientes (proceso 4) y los revalida (proceso 31).
- **Resultado**: `tarea_fecha_sugerida` actualizada a un hueco real; si hubo cambios, se avisa con un `alert()`. Si ningún día antes de su fecha límite tiene un hueco real, la tarea queda como estaba y aparece en la sección "⚠️ Sin hueco antes del límite" de Resumen (v0.89.0) en vez de forzarla a una fecha inválida. `tarea_fecha_limite` **nunca** se toca por este proceso — eso siempre requiere una acción explícita del usuario (ver `CASOS_DE_USO.md`, A5).

## 6. Promoción de categorías hijas al eliminar el padre

- **Condición**: se elimina una categoría que tiene categorías hijas.
- **Proceso**: cada hija pierde su `categoria_padre_id` (pasa a `null`).
- **Resultado**: las hijas se vuelven categorías raíz — no se eliminan ni se pierden.

## 7. Desvinculación al eliminar una referencia

- **Condición**: se elimina una Categoria, Ubicacion o Meta que tiene tareas asociadas.
- **Proceso**: cada tarea que la referenciaba (`categoria_id`, `ubicacion_id` o `meta_id`, respectivamente) pasa esa referencia a `null`.
- **Resultado**: las tareas no se eliminan — quedan sin esa referencia puntual.

## 8. Aviso de clima (desfavorable o favorable)

- **Condición**: una tarea tiene `tarea_requiere_clima_bueno = true`, con `ubicacion_id` de coordenadas conocidas y una fecha de referencia dentro de los próximos 16 días.
- **Proceso**: `evaluarClimaTarea` (`assets/js/clima.js`) consulta el pronóstico real (Open-Meteo, sin API key) para esa fecha/hora y ubicación.
- **Resultado**: si la probabilidad de lluvia es mayor a 50%, se muestra un aviso "🌧️" en la tarjeta de Hoy sugiriendo posponerla; si es de 50% o menos, un aviso "☀️ Buen clima previsto (N% de lluvia)". *(El aviso ☀️ llegó en v0.56.0.)*

## 9. Detección de solapamiento con Google Calendar

- **Condición**: hay conexión activa con Google Calendar (se concede junto con Drive, con el mismo permiso único; ver proceso 10) y una tarea tiene `tarea_fecha_sugerida` con hora.
- **Proceso**: `calcularSolapamiento` (`assets/js/google-calendar.js`) compara la ventana `[tarea_fecha_sugerida, tarea_fecha_sugerida + tarea_duracion_min]` contra los eventos reales de hoy y de los próximos 15 días (`obtenerEventosDelHorizonte`, una sola consulta por rango con caché de 5 minutos).
- **Resultado**: si se superpone con algún evento, la tarjeta de Hoy muestra "📅 Se superpone con..." con los botones "Posponer" y "Al próximo hueco libre" (proceso 19). *(Los botones y la lectura de varios días llegaron en v0.56.0.)*

## 10. Guardado en Google Drive con buffer local durable

- **Condición**: cualquier cambio de datos (crear/editar/eliminar/completar cualquier entidad) llama a `persistirYNotificar`.
- **Proceso**: `persistirYNotificar` (`assets/js/almacenamiento.js`) (1) sella con `*_modificado_en` lo que cambió y registra las bajas en `eliminados` (`sellarCambios`); (2) guarda el estado de trabajo completo en el buffer `pendiente` de IndexedDB, de inmediato; (3) programa la subida a Drive a los 2 s de la última edición (debounce). Cuando Drive confirma, recién ahí se actualiza la copia `cache` y se borra `pendiente`.
- **Resultado**: la cabecera muestra `pendiente` hasta que Drive confirma y **solo entonces** `sincronizado`, con la hora del guardado (la UI nunca dice "guardado" antes de que sea cierto). Si se recarga o se cierra la pestaña antes de la confirmación, los cambios sobreviven en `pendiente` y se suben al volver; `beforeunload` avisa si hay cambios sin confirmar. Sin conexión, la app sigue permitiendo editar sobre la copia local y sube al reconectar. **`localStorage` no guarda datos de tareas** (solo preferencias).

## 11. Verificación automática y mezcla con avisos

- **Condición**: la pestaña vuelve a estar visible (`visibilitychange`), vuelve la red (`online`), pasaron 5 minutos, o se conecta Drive.
- **Proceso**: `verificar` / `sincronizarUnaVez` consultan el `modifiedTime` del archivo en Drive. Si no cambió y no hay nada pendiente, solo se actualiza la hora de "verificado". Si otro dispositivo lo modificó, se descarga y se mezcla con `mezclar` (`assets/js/sincronizacion.js`) tomando como base la última copia confirmada: por cada entidad, si solo cambió un lado gana ese; si cambiaron los dos gana el sello `*_modificado_en` más nuevo; un borrado (`eliminados`) contra una edición conserva lo más reciente. Si el usuario está escribiendo en un campo, los cambios remotos se difieren ("Actualizar" en la cabecera; se aplican al salir del campo). Al aplicarlos, los campos de formulario que el usuario ya había tocado conservan su valor (`assets/js/borradores.js`). Después de mezclar, `repararEnlaces` (`assets/js/dependencias.js`) revisa las dependencias: si dos dispositivos pusieron más de una tarea detrás de la misma previa (regla 1 a 1) o formaron un ciclo, conserva el enlace de la tarea más antigua, suelta el resto y deja un **aviso** que lo explica.
- **Resultado**: los dispositivos convergen sin acción manual. Cada vez que la mezcla descarta algo (conflicto o borrado vs. edición) se genera un **aviso** con la entidad, el ganador y los campos/valores descartados; queda en la cabecera hasta que el usuario lo cierra ("nada se pierde en silencio"). También se avisa si Drive tiene archivos duplicados (se usa el más antiguo) o si el reloj del dispositivo está desfasado más de 2 minutos.

## 12. Permiso único de Google y reconexión

- **Condición**: se abre la app y el usuario ya se conectó alguna vez (flag de preferencia), o el token vence (~1 h), o Google responde 401.
- **Proceso**: `google-auth.js` pide **un solo token** con los permisos de Drive y Calendar (solo lectura) juntos. Al abrir intenta reconectar sin popup (`prompt: 'none'`); si el navegador lo bloquea, reintenta en el primer clic o tecla del usuario. Un 401 invalida el token y pasa a `sesion-vencida`.
- **Resultado**: la sesión se reanuda sin fricción cuando es posible; si no, la cabecera muestra "Reconectar Drive" y los cambios quedan en `pendiente`. Si el usuario desmarca el permiso de Calendar, solo se ocultan las funciones de Calendar; sin el de Drive no se puede trabajar.

## 13. Migración automática de formatos de datos viejos

- **Condición**: se cargan datos (Drive, la copia local o un JSON importado) en un formato de una versión anterior del modelo de datos, o quedan datos viejos en `localStorage` (`super-todo-list:datos`) de una versión anterior de la app.
- **Proceso**: `normalizarDatosCrudos` detecta el formato por las claves presentes en cada objeto y migra cada entidad a la forma actual (incluida la fusión histórica de Subcategoria dentro de Categoria), terminando con `recalcularBloqueo` sobre todas las tareas. Los datos viejos de `localStorage` no se ignoran: si Drive no tiene archivo se importan solos; si ya tiene, la cabecera ofrece "Mezclarlos con Drive" o "Descartarlos".
- **Resultado**: los datos quedan en el formato actual sin pérdida de información, de forma transparente, y sin que nada quede olvidado en silencio.

## 14. Progreso de una Meta siempre al día

- **Condición**: se muestra una Meta (no existe un campo de progreso persistido).
- **Proceso**: se cuentan al vuelo las tareas con ese `meta_id` y cuántas de ellas están `completada`.
- **Resultado**: la barra de progreso y el contador "X/Y completadas" siempre reflejan el estado real, sin necesidad de recalcular ni guardar nada aparte.

## 15. Registro de cumplimientos y de mejoras al completar una tarea

- **Condición**: se completa cualquier tarea (`cumplirTarea`).
- **Proceso**: se crea un **Cumplimiento** (nombre, categoría, fecha, vencimiento esperado, si era de mantenimiento) y, si la tarea era de mantenimiento y se escribió una nota, una **Mejora** asociada al nombre de la tarea.
- **Resultado**: queda un historial liviano que no depende de que la tarea siga existiendo. Al reabrir la tarea, su cumplimiento se borra (la mejora se conserva); al reabrir una tarea de mantenimiento, también se elimina su copia si sigue sin tocar (si se modificó, se conserva y se avisa).

## 16. Reconexión de la cadena al eliminar una tarea del medio

- **Condición**: se elimina una tarea que bloqueaba a otra y tenía a su vez una tarea previa (P→A→N).
- **Proceso**: `eliminarTarea` → `reconectarAlEliminar` (`assets/js/dependencias.js`): las tareas que dependían de la eliminada pasan a depender de su previa y se recalcula su bloqueo. Si otra tarea tenía a la eliminada como `tarea_desencadenante`, ese desencadenante pasa a la previa de la eliminada.
- **Resultado**: la cadena queda P→N; nada queda bloqueado por una tarea que ya no existe.

## 17. Detección de tareas cargadas solo con el nombre

- **Condición**: en cada redibujado de la app hay al menos una tarea sin completar con todos sus datos en el valor por defecto (sin categoría, importancia, disfrute, meta, fechas, descripción, ubicación, clima, costo, mantenimiento, días hábiles, checklist, desencadenante ni enlaces, duración 15) y sin la marca `tarea_carga_completa`.
- **Proceso**: `tareasSoloConNombre` (`assets/js/tareas-logica.js`) las cuenta y `actualizarBotonesTareas` (`assets/js/app.js`) muestra u oculta el botón "📝 Completar carga de tareas (X)".
- **Resultado**: el usuario ve cuántas tareas quedaron incompletas desde cualquier vista, sin buscarlas a mano. Una tarea sale de la cuenta cuando se le carga cualquier dato, se elimina o se marca "Dejar así".

## 18. Aviso de anillo de mantenimiento incompleto

- **Condición**: se guarda (alta, edición o "Completar carga") una tarea de mantenimiento con `tarea_desencadenante` y su cadena de tareas enlazadas llega hasta ese desencadenante, pero alguna tarea de la cadena no es de mantenimiento.
- **Proceso**: `ofrecerMarcarCadenaMantenimiento` (`assets/js/formulario-tarea.js`, con `tareasDeLaCadenaNoRepetibles` de `assets/js/dependencias.js`) lista esas tareas y pregunta si marcarlas como mantenimiento con el mismo intervalo.
- **Resultado**: si el usuario acepta, todas las tareas de la cadena se repiten y el anillo se sostiene; si rechaza, nada cambia (la tarea se guarda igual). No vuelve a preguntar una vez resuelto.

## 19. Búsqueda del próximo hueco libre y refresco de los eventos de Calendar

- **Condición**: (a) una tarea con horario se superpone con un evento y el usuario aprieta "Al próximo hueco libre" en Hoy; (b) el usuario usa "Sincronizar ahora", vuelve a la pestaña o pasan 5 minutos con la conexión de Calendar activa.
- **Proceso**: (a) `buscarHuecoLibre` (`assets/js/google-calendar.js`) recorre día por día los eventos del horizonte, dentro de la franja horaria de Configuraciones (`obtenerFranjaHoraria`) y solo en días hábiles de la tarea, y devuelve el primer inicio (en pasos de 15 minutos, desde la hora sugerida y nunca antes de ahora) cuya ventana no choca con ningún evento. (b) `refrescarCalendar` (`assets/js/app.js`) llama a `invalidarCacheEventos`, corre los procesos 27, 28 y 30 (ver abajo) y, sin ventanas ni paneles abiertos ni texto en edición, redibuja **la vista que esté activa** (v0.80.0: antes solo si era Resumen).
- **Resultado**: (a) la tarea se reprograma con `reprogramarTareaConCascada` (las tareas que dependen de ella se corren en cascada) y se guarda; si no hay hueco en 15 días avisa y ofrece el panel de fecha. (b) cualquier vista que muestre eventos de Calendar (Resumen, Semana, Agenda, Gantt) refleja lo que hay ahora, sin esperar los 5 minutos de la caché ni tener que recargar la página.

## 20. El historial de un hábito sigue a la tarea cuando se la renombra

- **Condición**: se guarda la edición de una tarea que era de mantenimiento con un nombre distinto al anterior.
- **Proceso**: `renombrarHistorial` (`assets/js/tareas-logica.js`), llamado desde `abrirEdicionTarea` (`assets/js/modal-tarea.js`), pasa al nombre nuevo los `cumplimiento_tarea_nombre` y los `mejora_tarea_nombre` que tenían el viejo.
- **Resultado**: el hábito (identificado por el nombre) no se parte en dos y el mapa de hábitos y la vista Mejoras siguen agrupando todo junto; la ventana avisa cuántos registros se actualizaron. Editar una tarea que no era de mantenimiento no toca el historial.

## 21. Posición estimada de las tareas sin fecha en el Gantt

- **Condición**: al dibujar el Gantt, una tarea pendiente o bloqueada no tiene `tarea_fecha_sugerida`.
- **Proceso**: `calcularPosiciones` (`assets/js/gantt-modelo.js`) le asigna una posición **solo para dibujar** (no se guarda): si no tiene previa, va a la cola por prioridad (`compararPorPrioridad`) de su carril —una tarea por día desde hoy y no antes de su fecha habilitada real—; si tiene previa, va el día siguiente al de su previa.
- **Resultado**: la tarea se ve como barra punteada en ese día y, si supera su fecha límite, con la bandera en rojo. Ningún dato cambia hasta que el usuario la arrastra o toca "📌 Fijar" (entonces se guarda como `tarea_fecha_sugerida`).

## 22. Fin de un hábito temporal

- **Condición**: se completa una tarea de mantenimiento que tiene `tarea_repetir_hasta` o `tarea_repetir_hasta_tarea`.
- **Proceso**: `completarTarea` (`assets/js/tareas-logica.js`) calcula el próximo vencimiento y lo compara con `fechaFinDeRepeticion` (lo más temprano entre la fecha y el día en que se cumple o vence la otra tarea; si esa se borró, se ignora). Si el próximo vencimiento cae **después** de ese día, no crea la copia; si no, la crea heredando `tarea_repetir_hasta`, `tarea_repetir_hasta_tarea` y `tarea_origen`.
- **Resultado**: el hábito termina solo (la repetición del último día sí se crea). En Hábitos figura "✔ terminado" y los días posteriores quedan "no aplica". Si mientras hay una repetición abierta se mueve la fecha del examen de referencia, el hábito se acorta o se alarga solo en la próxima copia.

## 24. Cálculo de la capacidad de cada día

- **Condición**: se dibuja la vista Semana.
- **Proceso**: `crearCalculadoraCapacidad` (`assets/js/capacidad.js`) toma las preferencias, los eventos de Calendar que ocupan tiempo (`obtenerEventos`, con los interruptores de todo el día, rechazados y «Disponible») y las tareas con fecha sugerida. Por cada día: tope (fijado para esa fecha o el de su día de la semana), tiempo libre de la franja, capacidad, carga y lo que queda. Hoy no cuenta lo que ya pasó de la franja.
- **Resultado**: la barra de carga de Semana. Sin conexión con Calendar solo cuentan el tope y las tareas.

## 25. Guarda de versión del archivo de Drive

- **Condición**: al sincronizar, el archivo de Drive trae un `formato` mayor al que la app conoce (`FORMATO_ARCHIVO`).
- **Proceso**: `sincronizarUnaVez` (`assets/js/almacenamiento.js`) no lo mezcla ni lo sube: pone la app en solo lectura (`soloLectura`) con el aviso "recargá la app".
- **Resultado**: una versión vieja no puede pisar lo que no entiende (por ejemplo las preferencias). Al recargar, la app se actualiza sola (`sw.js` es network-first). Las versiones anteriores a la v0.62.0 no tienen esta guarda.

## 26. Herencia del color al elegir una categoría padre

- **Condición**: al crear una categoría (no al editar una existente), se elige o se cambia su categoría padre en el desplegable — o se abre el alta desde "➕ Agregar categoría hija" de una tarjeta.
- **Proceso**: `assets/js/formularios-entidades.js` copia el `categoria_color` del padre elegido al selector de color (`setValor`, silencioso), siempre que el usuario **todavía no haya confirmado** un color a mano en esta misma ventana (evento `color-aplicado` de `selector-color.js`).
- **Resultado**: una categoría nueva arranca con el color de su padre y se puede cambiar libremente; en cuanto se aplica un color a mano, dejar de elegir o cambiar el padre no lo vuelve a pisar.

## 27. Programación automática de tareas sin hora

- **Condición**: al iniciar la app (mismo momento que el proceso 5) y, desde la v0.81.0, cada vez que se refresca la lectura de Calendar (proceso 19), existe una tarea activa (no `completada`, no de mantenimiento) sin hora real en `tarea_fecha_sugerida` — sin ninguna fecha, o con una fecha cargada a mano pero sin hora (v0.81.0: antes solo la primera; en Semana estas tareas se ven con línea punteada y fondo transparente, "proyectadas").
- **Proceso**: `programarTareasSinFecha` (`assets/js/programador.js`) recorre las cadenas (`tarea_dependiente`) en orden y para cada una busca, desde el instante más temprano posible, el primer día con minutos libres suficientes (`crearCalculadoraCapacidad`, `assets/js/capacidad.js`) y, dentro de ese día, el primer hueco horario real (`buscarHuecoLibre`, `assets/js/google-calendar.js`) que no choque con Calendar (si hay conexión) ni con otra tarea de STDL ya asignada ese día, en esta pasada o de antes. Ese instante más temprano (v0.81.0) es el máximo de: ahora, la fecha de habilitación, **la fecha que la tarea ya tenía cargada sin hora** (no se la adelanta) y **el fin real de su previa** (`inicio + tarea_duracion_min` — antes de la v0.81.0 era simplemente "el día siguiente calendario a la previa", sin mirar cuánto duraba: una cadena de tareas cortas sin hora ahora puede quedar agendada seguida el mismo día, no una por día). La búsqueda de día nunca pasa de `tarea_fecha_limite` si la tarea la tiene (v0.74.0). Sin conexión con Calendar, se programa igual usando solo el tope de minutos por día, sin buscar eventos.
- **Resultado**: `tarea_fecha_sugerida` queda asignada con día y hora reales (no una posición estimada). Al iniciar la app, si hubo cambios se avisa junto con el aviso del proceso 5; en los refrescos posteriores (v0.81.0) es silencioso, sin `alert()` (mismo criterio que los procesos 28-30) — el cambio se ve en la vista que se redibuje. Una tarea que no encuentra hueco dentro del horizonte configurado (`pref_horizonte_dias`), antes de su fecha límite, o cuyo día elegido por capacidad agregada no tenía en la práctica un hueco contiguo desde el piso (límite conocido, no corregido: no reintenta el día siguiente dentro de la misma pasada), queda sin programar por ahora (se reintenta en el próximo refresco), sigue viéndose con la posición estimada del proceso 21 y, al iniciar la app, **se avisa por nombre** (v0.76.0 — antes quedaba en silencio, y en Gantt podía parecer un bug que la app "no la programara").

## 28. Reubicación automática de una tarea que choca con Calendar

- **Condición**: al iniciar la app (mismo momento que los procesos 5 y 27) y, desde la v0.80.0, cada vez que se refresca la lectura de Calendar (proceso 19: al sincronizar, volver a la pestaña o cada 5 minutos), hay conexión con Google Calendar y una tarea activa tiene `tarea_fecha_sugerida` con hora que se superpone con un evento (por ejemplo, uno cargado después de asignarle esa hora).
- **Proceso**: `reubicarTareasSolapadas` (`assets/js/programador.js`) detecta el choque (`calcularSolapamiento`, mismo mecanismo que el proceso 9) y busca el próximo hueco libre (`buscarHuecoLibre`) desde la hora sugerida actual, sin pasar de `tarea_fecha_limite` si la tiene, y reprograma con `reprogramarTareaConCascada` (v0.82.0 — antes asignaba la fecha directo, sin correr a sus dependientes; era la única de las funciones de esta lista que no usaba la cascada).
- **Resultado**: si encuentra hueco, `tarea_fecha_sugerida` se reubica sola **y arrastra a sus dependientes** (v0.82.0). Al iniciar la app se avisa junto con los avisos de los procesos 5 y 27 (incluidos los dependientes que quedaron inconsistentes por el corrimiento, mismo mecanismo que el proceso 5); en los refrescos posteriores (v0.80.0) es silencioso, sin `alert()` (mismo criterio que el proceso 29 y el 30 de abajo) — el cambio se ve en la vista que se redibuje. Si no hay hueco libre antes de su fecha límite (o, sin límite, dentro del horizonte configurado), la tarea queda como estaba (solo se avisa por nombre al iniciar la app, no en los refrescos posteriores).

## 29. Reprogramación de la tarea inmediata cuando su ventana venció sin completarse

- **Condición**: al iniciar la app (mismo momento que los procesos 5, 27 y 28) y, mientras sigue abierta, cada 1-2 minutos: la tarea activa con `tarea_fecha_sugerida` con hora más próxima (sin importar si ya pasó) tiene su ventana estimada (`[tarea_fecha_sugerida, tarea_fecha_sugerida + tarea_duracion_min]`) ya vencida — "ahora" la superó sin que la tarea se haya completado.
- **Proceso**: `reprogramarTareaInmediataSiVencio` (`assets/js/programador.js`) busca el próximo hueco real desde ahora (`buscarHuecoLibre`, sin pasar de `tarea_fecha_limite` si la tiene) y reprograma con `reprogramarTareaConCascada` (cascada a sus dependientes). Mientras "ahora" está **dentro** de esa ventana (todavía no le tocaba, o el usuario la está haciendo en este momento) no se toca — evita reprogramar en cascada una tarea que sigue en curso.
- **Resultado**: al iniciar, se avisa junto con los procesos 5/27/28 (o que no hay hueco libre antes del límite). El chequeo periódico posterior (cada 90 s, mientras la app sigue abierta) reprograma en silencio, sin `alert()`, para no interrumpir cada vez que corre — el cambio se ve en la próxima vista que se redibuje.

## 30. Adelanto automático de una tarea cuando se libera un hueco mejor en Calendar

- **Condición** (v0.80.0): se refresca la lectura de Calendar (proceso 19: al sincronizar, volver a la pestaña o cada 5 minutos) y una tarea activa con `tarea_fecha_sugerida` con hora podría empezar más temprano que su horario actual — por ejemplo, se movió o se borró un evento que antes le tapaba un hueco anterior.
- **Proceso**: `adelantarTareasSiHayHuecoMejor` (`assets/js/programador.js`) busca, para cada tarea con horario (en orden de prioridad, para que dos tareas no compitan por el mismo hueco liberado), el primer hueco real desde ahora — sin pasar de `tarea_fecha_limite`, sin adelantarla antes de su fecha de habilitación ni del fin de su tarea previa en la cadena — y, si es más temprano que el que ya tenía, la mueve con `reprogramarTareaConCascada` (cascada a sus dependientes). A diferencia del proceso 28, no espera un choque: es oportunista, no reactiva.
- **Resultado**: la tarea (y su cadena, si corresponde) se adelanta sola, en silencio y sin `alert()` (mismo criterio que el proceso 29) — el cambio se ve en la vista que se redibuje. (Nota: hasta la v0.79.0, la caché de eventos de Calendar se invalidaba también desde la verificación periódica con Drive, `assets/js/almacenamiento.js`; desde la v0.80.0 ese refresco quedó centralizado en el proceso 19, junto con este.)

## 31. Revalidación de la cadena tras un corrimiento automático

- **Condición** (v0.84.0, ampliada en v0.89.0 y v0.92.0): justo después de que cualquiera de los 5 caminos automáticos (`reprogramarVencidas`, `reubicarTareasSolapadas`, `programarTareasSinFecha` vía `reprogramarTareaConCascada` de sus dependientes, `reprogramarTareaInmediataSiVencio`, `programarParaHoy` o `adelantarTareasSiHayHuecoMejor`) corre `reprogramarTareaConCascada` sobre una tarea con dependientes — esa función solo les suma a todos el mismo corrimiento de tiempo que recibió la cabeza, sin chequear si el resultado choca con algo ni si supera la fecha límite de cada uno.
- **Proceso**: `resolverColisionesEnCadena` (`assets/js/programador.js`) recorre la cadena de dependientes en orden (por `tarea_dependiente`; la regla 1 a 1 del modelo garantiza que es lineal) y, para cada uno, revisa si tras el corrimiento quedó solapado con un evento de Calendar, con otra tarea ya ocupada, directamente antes de que su propia previa termine (puede pasar sin solaparse, si la previa tuvo que correrse más de lo que le tocaba a este eslabón), o **después de su propia `tarea_fecha_limite` sin colisionar con nada** (v0.89.0 — antes este último caso no disparaba nada, solo se marcaba "inconsistente" para un aviso). Si es así, le busca un hueco real más adelante (`buscarHuecoLibre`, sin pasar de su propia `tarea_fecha_limite`; si el único motivo es haber superado el límite, la búsqueda arranca desde ahora en vez de desde la posición actual, ya inválida por tardía) y sigue la cadena a partir de esa posición final, no del corrimiento original. Desde v0.92.0, `reprogramarVencidas` (`assets/js/programador.js`, reemplaza a `reprogramarFechasSugeridasVencidas` + `resolverColisionesDeVencidas`) la llama en el mismo lugar que los otros 4 caminos, ya que ahora vive en un archivo con acceso a Calendar (antes el reprogramado de vencidas estaba en `tareas-logica.js`, que no puede importar `google-calendar.js` sin crear un ciclo, así que quedaba afuera y necesitaba un paso aparte).
- **Resultado**: un dependiente nunca queda solapado con Calendar ni con otra tarea por culpa de un corrimiento automático, y ahora tampoco queda con la sugerida después de su propio límite si existe un hueco real para evitarlo — aunque eso signifique que pierda la separación exacta que tenía con la cabeza de la cadena, ya que el objetivo de encadenar tareas es marcar orden (también útil para verlo en Gantt), no una distancia fija (decisión del usuario). Sin un hueco disponible antes de su fecha límite (caso raro), el dependiente queda con el corrimiento tal cual — visible de forma persistente en la sección "⚠️ Sin hueco antes del límite" de Resumen (v0.89.0, ver `views/resumen.view.js`) en vez de en un aviso único que se podía perder. Los usos de `reprogramarTareaConCascada` que vienen de una acción directa del usuario (arrastrar en Gantt, "posponer", próximo contacto de una Persona — ya no "Revisar mi día", que desde la v0.94.0 solo lee Calendar, sin reprogramar nada) no pasan por esta revalidación, sin cambios — si dejan un dependiente inconsistente, también queda visible en esa misma sección de Resumen (que se calcula en vivo a partir de los datos, sin importar el origen).

## 32. Vencimiento de "próximo contacto" de una Persona

- **Condición** (v0.88.0): al iniciar sesión (junto al resto de las correcciones de `reprogramarSiCorresponde`, `assets/js/app.js`), una persona tiene `persona_proximo_contacto` en una fecha anterior a hoy — el día ya terminó sin que se haya actualizado a mano.
- **Proceso**: `pasarProximoContactoVencido` (`assets/js/tareas-logica.js`) copia ese valor a `persona_ultimo_contacto` y vacía `persona_proximo_contacto` — se asume que el contacto ya sucedió (o ya no aplica) y no tiene sentido seguir mostrándolo como pendiente.
- **Resultado**: la tarjeta de esa persona deja de mostrar "Próximo" y pasa a mostrar el "Último contacto" actualizado, sin ningún `alert()` (es un ajuste de bookkeeping silencioso, mismo criterio que el resto de las correcciones automáticas de bajo impacto) — el cambio se ve solo al redibujarse la vista.

## 33. Actualización de `tarea_fecha_inicio_habilitada` vencida

- **Condición** (v0.90.0): al iniciar sesión, una tarea no completada tiene `tarea_fecha_inicio_habilitada` cargada y en una fecha anterior a hoy — el día ya pasó.
- **Proceso**: `actualizarFechasInicioVencidas` (`assets/js/tareas-logica.js`) actualiza ese campo a `hoyISO()` directamente en el dato, no solo en algún cálculo derivado — para que el formulario de edición y el Gantt muestren algo coherente ("puede empezar hoy") en vez de una fecha vieja.
- **Resultado**: sin `alert()` — el cambio se nota si se abre la tarea a editar, y en que la tarea ya cuenta como accionable (`esTareaAccionable`) desde ese momento, si no lo era por otro motivo.

## 34. Reasignación diaria de `tarea_fecha_sugerida` para tareas urgentes

- **Condición** (v0.90.0): al iniciar sesión, una tarea `pendiente` con `tarea_urgente = true` tiene `tarea_fecha_sugerida` de un día distinto de hoy (o no tiene ninguna) — antes esto solo se agendaba una vez, al marcar la tarea como urgente por primera vez (ver `assets/js/modal-tarea.js`).
- **Proceso**: `reasignarUrgentesAHoy` (`assets/js/programador.js`) llama `programarParaHoy` (ya existente) para cada una — mismo respeto por Calendar, capacidad y `tarea_fecha_limite` si la tiene.
- **Resultado**: la tarea queda con un hueco real hoy, sin `alert()` — el cambio se ve en la tarjeta. Es lo que mantiene su "fecha efectiva de orden" (`REGLAS_DE_PRIORIDAD.md`) siempre en "hoy" mientras siga urgente y sin completar, para que el comparador de prioridad la trate como corresponde día a día.

## Regla común a todo el agendado automático (v0.98.0): sin lectura confiable de Calendar no se asigna ni se mueve nada

Ningún proceso de esta sección (5, 19–31, 34 y 35) asigna o mueve horarios si `leerEventosParaAgendar` (`assets/js/google-calendar.js`) no puede leer Calendar: no hay sesión de Google (el permiso vive solo en memoria y vence con cada recarga o a la hora), o falló la lectura de Calendar o de alguno de los calendarios elegidos. Antes se agendaba igual "solo con el tope de minutos" y las tareas quedaban encima de eventos "Ocupado". Mientras tanto la cabecera lo avisa (sesión vencida, o «No pude leer el calendario X»), la tarea nueva queda sin hora y se agenda sola al reconectar (`app.js`: `reprogramarSiCorresponde` se reintenta con cada cambio del estado de sincronización y en cada refresco de Calendar) o en el próximo refresco (cada 5 minutos, al volver a la pestaña, al sincronizar). Excepción: si hay sesión pero el usuario no concedió el permiso de Calendar, se agenda sin eventos. Además, un evento cuenta en **todos** los días que ocupa (cruza medianoche o dura varios días), no solo en el de inicio.

## 35. Reordenado de las fechas sugeridas según la prioridad

- **Condición** (v0.97.0): entre tareas ya agendadas (con hora real en `tarea_fecha_sugerida`, todavía no empezadas; desde la v0.99.0 también las de mantenimiento), alguna de mayor prioridad (`compararParaAgendar` desde la v0.99.0: holgura en horas —la de la Tabla—, y ante empate `compararPorPrioridad`: fecha límite más cercana, urgente, categoría…; los pares de una misma cadena no cuentan como inversión) tiene un horario **posterior** al de otra de menor prioridad. Sucedía porque el agendado decide solo al asignar el hueco: una tarea nueva (o una que cambió de prioridad al editarla) entraba después de las ya agendadas, y los datos guardados antes de la v0.96.0 ni siquiera se ordenaban por lote.
- **Proceso**: `reordenarSugeridasPorPrioridad` (`assets/js/programador.js`) vacía el horario de esas tareas y las vuelve a asignar con el mismo algoritmo de siempre (`asignarTareasSinFecha`: prioridad, Calendar, tope diario, días hábiles, fecha límite, fecha habilitada, cadenas). Corre al final de `programarTareasSinFecha` — o sea al iniciar sesión, al refrescar Calendar, al crear/completar/editar tareas (alta, edición individual y masiva, "Revisar mi día", "Completar carga", Metas con IA) — y una vez más al iniciar sesión, después de reasignar las urgentes. Si no hay ninguna inversión, no toca nada; si alguna tarea no encuentra hueco, **restaura todos los horarios** como estaban. Idempotente.
- **Resultado**: el orden de `tarea_fecha_sugerida` coincide con el de prioridad (salvo restricciones legítimas: fecha habilitada futura, cadena, días hábiles, tope diario), en silencio y sin `alert()`. También mueve horarios que el usuario puso a mano (Semana, "Posponer"): la app ya trata esa fecha como sugerencia sin compromiso, igual que `adelantarTareasSiHayHuecoMejor`. Reordenar a mano con ▲▼ (`tarea_prioridad_manual`) se aplica en el próximo pase, no al instante.

## 36. Red de seguridad: ninguna tarea activa sin fecha y hora sugerida

- **Condición** (v0.99.0): hay tareas no completadas sin hora real en `tarea_fecha_sugerida` (por ejemplo, el clon de una tarea de mantenimiento recién creado al completarla, una tarea que llegó de otro dispositivo, o una creada por un camino sin disparador de agendado) y Calendar se puede leer (ver la regla común de arriba).
- **Proceso**: tras cada cambio de datos y con un debounce corto, `agendarPendientes` (`assets/js/app.js`) llama a `programarTareasSinFecha(estado, { reordenar: false })`: solo rellena huecos, sin reordenar horarios ya asignados (que el usuario puede haber movido hace un instante). Las tareas de mantenimiento se agendan como cualquier otra. Si no hay hueco antes de la fecha límite, la tarea se agenda igual **después** del límite (queda en Resumen "⚠️ Sin hueco antes del límite"); solo queda sin hora si no hay ningún hueco en todo el horizonte configurado (90 días por defecto). No corre con un diálogo abierto o texto en edición, y no agrega un paso de deshacer.
- **Resultado**: en la Tabla (columna Sugerida) ninguna tarea activa queda vacía salvo mientras no haya sesión de Google ("⏳ Sin agendar"), y se asigna sola al reconectar.

## 37. Renovación silenciosa de la sesión de Google

- **Condición** (v0.100.0, ajustada en la v0.101.1): la app está abierta y hay un token de Google que todavía sirve pero le quedan menos de 15 minutos (el token dura ~1 hora y vive solo en memoria).
- **Proceso**: `renovarSiHaceFalta` (`assets/js/almacenamiento.js`) pide un token nuevo con `prompt: 'none'`. Corre en cada clic o tecla (el navegador solo deja abrir el popup silencioso con un gesto del usuario) y al volver a la pestaña, como máximo cada 30 segundos; si falla, espera 5 minutos antes de insistir y el token actual sigue valiendo. Un intento sin respuesta se da por fallido a los 20 segundos.
- **Sin sesión**: no se reintenta una ventana silenciosa en cada clic. Al abrir la app se intenta una vez en silencio y otra con el primer clic (`reconectarEnPrimerGesto`); si no alcanza, la cabecera dice «Hace falta reconectar con Google» y el botón «🔑 Reconectar» (siempre visible con la sesión vencida; «Sincronizar ahora» hace lo mismo) abre la ventana de Google.
- **Resultado**: mientras se usa la app la sesión casi nunca vence, así que el agendado (que no corre sin una lectura confiable de Calendar) casi nunca queda en pausa. Cada intento queda en el registro de Configuraciones → «Sesión de Google».

## 38. Agendado en segundo plano tras crear o editar una tarea

- **Condición** (v0.102.0): se acaba de guardar una tarea nueva, una edición o el uso de una plantilla.
- **Proceso**: primero se guarda (inmediato, con su paso de deshacer) y después `agendarEnSegundoPlano` (`assets/js/agendado-segundo-plano.js`) corre `programarTareasSinFecha` (leer Calendar, asignar huecos, reordenar). Si asignó o reordenó algo, guarda otra vez sin sumar un paso de deshacer. Las corridas se encolan; el aviso «sin hueco antes del límite» solo nombra lo que sigue sin lugar según el estado final y espera a que no haya otra ventana abierta.
- **Resultado**: «Agregar» ya no espera al agendado; el horario sugerido aparece unos segundos después.

## 39. Recordatorio de copia de seguridad

- **Condición** (v0.105.0): hay tareas cargadas, el recordatorio no está en «nunca» y pasaron al menos N días (30 por defecto) desde la última exportación en este dispositivo; si nunca se exportó, desde la primera vez que se abrió la app con datos.
- **Proceso**: el revisor de avisos (`avisos-sync.js`) muestra una vez por sesión una ventana «💾 Copia de seguridad» con «⬇️ Exportar ahora» o «Más tarde». Exportar registra la fecha y el recordatorio se apaga hasta que pasen otros N días.
- **Resultado**: siempre hay una copia propia reciente fuera de Drive (ver `PLAN_B.md`).
