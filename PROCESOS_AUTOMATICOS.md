# Procesos automáticos

Documentación viva (se actualiza junto con el código) de todo lo que el sistema hace **solo**, sin una acción directa del usuario — a diferencia de `CASOS_DE_USO.md`, que documenta flujos que el usuario dispara a propósito. Cada entrada sigue el formato condición → proceso → resultado, y referencia la función real que lo implementa.

## 1. Clonado de una tarea de mantenimiento al completarla

- **Condición**: se marca como completada una tarea con `tarea_mantenimiento = true`.
- **Proceso**: `cumplirTarea` (`assets/js/tareas-logica.js`) calcula la próxima `tarea_fecha_limite` a partir de la fecha **real** de finalización, tomada como día local (una tarea completada a las 22:00 en Argentina suma desde ese día y no desde el siguiente), más `tarea_mantenimiento_intervalo` (`calcularProximaFechaMantenimiento`), y clona una nueva instancia pendiente con el mismo nombre, categoría, importancia, ubicación, días hábiles, clima, meta, duración, intervalo, costo estimado, disfrute y `tarea_desencadenante`, el checklist con todos los ítems destildados y `tarea_exportada_calendar` en `false` (más la nota de mejora, si se cargó, anexada a la descripción). Además **enlaza la copia**: si la original tenía tarea previa P, la copia depende de la instancia vigente de P (la misma P si sigue sin completar, o su copia pendiente con el mismo nombre); si no tenía previa pero sí desencadenante D, la copia queda bloqueada por la instancia vigente de D. Nunca crea un enlace que rompa la regla 1 a 1 ni que forme un ciclo.
- **Resultado**: la instancia completada queda como historial; nace una nueva tarea pendiente (o bloqueada, si se enlazó) con la fecha recalculada. Una cadena A→B→C→D con D como desencadenante de A se sostiene sola: al completar A, su copia A' queda bloqueada por D; B' depende de A', C' de B', D' de C', y al completar D se desbloquea A'.

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
- **Proceso**: `reprogramarFechasSugeridasVencidas` la mueve a la próxima fecha disponible (hoy, o el próximo día hábil según `tarea_dias_habiles`, sin superar `tarea_fecha_limite` si existe), en cascada a sus dependientes (proceso 4).
- **Resultado**: `tarea_fecha_sugerida` actualizada; si hubo cambios, se avisa con un `alert()`. `tarea_fecha_limite` **nunca** se toca por este proceso — eso siempre requiere una acción explícita del usuario (ver `CASOS_DE_USO.md`, A5).

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

- **Condición**: (a) una tarea con horario se superpone con un evento y el usuario aprieta "Al próximo hueco libre" en Hoy; (b) el usuario usa "Sincronizar ahora" o vuelve a la pestaña con la conexión de Calendar activa.
- **Proceso**: (a) `buscarHuecoLibre` (`assets/js/google-calendar.js`) recorre día por día los eventos del horizonte, dentro de la franja horaria de Configuraciones (`obtenerFranjaHoraria`) y solo en días hábiles de la tarea, y devuelve el primer inicio (en pasos de 15 minutos, desde la hora sugerida y nunca antes de ahora) cuya ventana no choca con ningún evento. (b) `refrescarCalendar` (`assets/js/app.js`) llama a `invalidarCacheEventos` y, si se está mirando Hoy sin ventanas ni paneles abiertos ni texto en edición, redibuja.
- **Resultado**: (a) la tarea se reprograma con `reprogramarTareaConCascada` (las tareas que dependen de ella se corren en cascada) y se guarda; si no hay hueco en 15 días avisa y ofrece el panel de fecha. (b) los avisos de superposición reflejan lo que hay ahora en Calendar sin esperar los 5 minutos de la caché.

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

## 27. Programación automática de tareas sin fecha

- **Condición**: al iniciar la app (mismo momento que el proceso 5), existe una tarea activa (no `completada`, no de mantenimiento) sin `tarea_fecha_sugerida`.
- **Proceso**: `programarTareasSinFecha` (`assets/js/programador.js`) recorre las cadenas (`tarea_dependiente`) en orden — cada tarea espera a que su previa quede programada, un día después de ella como mínimo — y para cada una busca, desde el día más temprano posible (hoy, su fecha habilitada o el día siguiente a su previa), el primer día con minutos libres suficientes (`crearCalculadoraCapacidad`, `assets/js/capacidad.js`) y, dentro de ese día, el primer hueco horario real (`buscarHuecoLibre`, `assets/js/google-calendar.js`) que no choque con Calendar (si hay conexión) ni con otra tarea de STDL ya asignada ese día, en esta pasada o de antes. La búsqueda de día nunca pasa de `tarea_fecha_limite` si la tarea la tiene (v0.74.0). Sin conexión con Calendar, se programa igual usando solo el tope de minutos por día, sin buscar eventos.
- **Resultado**: `tarea_fecha_sugerida` queda asignada con día y hora reales (no una posición estimada); si hubo cambios se avisa junto con el aviso del proceso 5. Una tarea que no encuentra hueco dentro del horizonte configurado (`pref_horizonte_dias`) o antes de su fecha límite queda sin programar por ahora (se reintenta en la próxima sesión), sigue viéndose con la posición estimada del proceso 21 y **se avisa por nombre** (v0.76.0 — antes quedaba en silencio, y en Gantt podía parecer un bug que la app "no la programara").

## 28. Reubicación automática de una tarea que choca con Calendar

- **Condición**: al iniciar la app (mismo momento que los procesos 5 y 27), hay conexión con Google Calendar y una tarea activa tiene `tarea_fecha_sugerida` con hora que se superpone con un evento (por ejemplo, uno cargado después de asignarle esa hora).
- **Proceso**: `reubicarTareasSolapadas` (`assets/js/programador.js`) detecta el choque (`calcularSolapamiento`, mismo mecanismo que el proceso 9) y busca el próximo hueco libre (`buscarHuecoLibre`) desde la hora sugerida actual, sin pasar de `tarea_fecha_limite` si la tiene.
- **Resultado**: si encuentra hueco, `tarea_fecha_sugerida` se reubica sola y se avisa junto con los avisos de los procesos 5 y 27. Si no hay hueco libre antes de su fecha límite (o, sin límite, dentro del horizonte configurado), la tarea queda como estaba y se avisa por nombre para que el usuario la revise a mano.

## 29. Reprogramación de la tarea inmediata cuando su ventana venció sin completarse

- **Condición**: al iniciar la app (mismo momento que los procesos 5, 27 y 28) y, mientras sigue abierta, cada 1-2 minutos: la tarea activa con `tarea_fecha_sugerida` con hora más próxima (sin importar si ya pasó) tiene su ventana estimada (`[tarea_fecha_sugerida, tarea_fecha_sugerida + tarea_duracion_min]`) ya vencida — "ahora" la superó sin que la tarea se haya completado.
- **Proceso**: `reprogramarTareaInmediataSiVencio` (`assets/js/programador.js`) busca el próximo hueco real desde ahora (`buscarHuecoLibre`, sin pasar de `tarea_fecha_limite` si la tiene) y reprograma con `reprogramarTareaConCascada` (cascada a sus dependientes). Mientras "ahora" está **dentro** de esa ventana (todavía no le tocaba, o el usuario la está haciendo en este momento) no se toca — evita reprogramar en cascada una tarea que sigue en curso.
- **Resultado**: al iniciar, se avisa junto con los procesos 5/27/28 (o que no hay hueco libre antes del límite). El chequeo periódico posterior (cada 90 s, mientras la app sigue abierta) reprograma en silencio, sin `alert()`, para no interrumpir cada vez que corre — el cambio se ve en la próxima vista que se redibuje.

## 30. Refresco de Calendar en cada verificación periódica con Drive

- **Condición**: la verificación automática con Drive corre (al volver a la pestaña, al recuperar red o cada 5 minutos — ver `assets/js/almacenamiento.js`, `verificar()`).
- **Proceso** (v0.76.0): cada corrida invalida también la caché de eventos de Calendar (`invalidarCacheEventos()`, `assets/js/google-calendar.js`), antes de verificar Drive.
- **Resultado**: las vistas que muestran eventos de Calendar (Hoy, Semana, "Revisar mi día") los vuelven a pedir en su próximo render, sin esperar los 5 minutos propios de esa caché — no hace falta redibujar aparte, porque `verificar()` ya termina en `notificar()`.
