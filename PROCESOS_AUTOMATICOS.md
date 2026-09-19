# Procesos automáticos

Documentación viva (se actualiza junto con el código) de todo lo que el sistema hace **solo**, sin una acción directa del usuario — a diferencia de `CASOS_DE_USO.md`, que documenta flujos que el usuario dispara a propósito. Cada entrada sigue el formato condición → proceso → resultado, y referencia la función real que lo implementa.

## 1. Clonado de una tarea de mantenimiento al completarla

- **Condición**: se marca como completada una tarea con `tarea_mantenimiento = true`.
- **Proceso**: `completarTarea` (`assets/js/tareas-logica.js`) calcula la próxima `tarea_fecha_limite` a partir de la fecha **real** de finalización (no de una fecha teórica) más `tarea_mantenimiento_intervalo` (`calcularProximaFechaMantenimiento`), y clona una nueva instancia pendiente con el mismo nombre, categoría, duración, intervalo, costo estimado y disfrute (más la nota de mejora, si se cargó, anexada a la descripción).
- **Resultado**: la instancia completada queda como historial; nace una nueva tarea pendiente con la fecha recalculada.

## 2. Desbloqueo en cascada al completar una tarea

- **Condición**: se completa una tarea de la que otras dependen (`tarea_dependiente`).
- **Proceso**: `desbloquearDependientes` recorre las tareas con `tarea_dependiente` igual a la recién completada, les copia `tarea_fecha_inicio_habilitada = tarea_fecha_fin` de la completada, y recalcula su `tarea_estado` (`recalcularBloqueo`).
- **Resultado**: las tareas dependientes pasan de `bloqueada` a `pendiente` automáticamente, con su fecha de inicio habilitada actualizada.

## 3. Recálculo de bloqueo al crear/editar una dependencia

- **Condición**: se crea una tarea con `tarea_dependiente`, o se cambia/quita la dependencia de una tarea existente.
- **Proceso**: `recalcularBloqueo` consulta si la tarea de la que depende ya está `completada`.
- **Resultado**: `tarea_estado` queda en `bloqueada` (si la dependencia no está completada) o `pendiente` (si sí, o si no hay dependencia).

## 4. Reprogramado en cascada al posponer

- **Condición**: cambia `tarea_fecha_sugerida` de una tarea que tiene otras dependiendo de ella.
- **Proceso**: `reprogramarTareaConCascada` calcula el delta entre la fecha vieja y la nueva, y lo aplica (`desplazarFecha`) a `tarea_fecha_sugerida` y `tarea_fecha_limite` de cada dependiente, recursivamente, con protección contra ciclos.
- **Resultado**: toda la cadena de tareas dependientes se corre el mismo tiempo, sin tocarlas una por una.

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

## 8. Aviso de clima desfavorable

- **Condición**: una tarea tiene `tarea_requiere_clima_bueno = true`, con `ubicacion_id` de coordenadas conocidas y una fecha de referencia dentro de los próximos 16 días.
- **Proceso**: `evaluarClimaTarea` (`assets/js/clima.js`) consulta el pronóstico real (Open-Meteo, sin API key) para esa fecha/hora y ubicación.
- **Resultado (hoy)**: si la probabilidad de lluvia es mayor a 50%, se muestra un aviso "🌧️" en la tarjeta de la tarea sugiriendo posponerla. Si el clima es favorable, no se muestra nada.
- **⏳ Pendiente de implementar (pedido del usuario)**: si la probabilidad de lluvia es menor al 50%, mostrar un aviso "☀️" (clima favorable) en la tarjeta de la tarea.

## 9. Detección de solapamiento con Google Calendar

- **Condición**: hay conexión activa con Google Calendar (se concede junto con Drive, con el mismo permiso único; ver proceso 10) y una tarea tiene `tarea_fecha_sugerida` con hora.
- **Proceso**: `calcularSolapamiento` (`assets/js/google-calendar.js`) compara la ventana `[tarea_fecha_sugerida, tarea_fecha_sugerida + tarea_duracion_min]` contra los eventos reales de hoy.
- **Resultado (hoy)**: si se superpone con algún evento, se muestra un aviso "📅 Se superpone con...".
- **⏳ Pendiente de implementar (pedido del usuario)**: sumar junto a ese aviso un botón "Posponer" para reprogramar la tarea directamente desde ahí.

## 10. Guardado en Google Drive con buffer local durable

- **Condición**: cualquier cambio de datos (crear/editar/eliminar/completar cualquier entidad) llama a `persistirYNotificar`.
- **Proceso**: `persistirYNotificar` (`assets/js/almacenamiento.js`) (1) sella con `*_modificado_en` lo que cambió y registra las bajas en `eliminados` (`sellarCambios`); (2) guarda el estado de trabajo completo en el buffer `pendiente` de IndexedDB, de inmediato; (3) programa la subida a Drive a los 2 s de la última edición (debounce). Cuando Drive confirma, recién ahí se actualiza la copia `cache` y se borra `pendiente`.
- **Resultado**: la cabecera muestra `pendiente` hasta que Drive confirma y **solo entonces** `sincronizado`, con la hora del guardado (la UI nunca dice "guardado" antes de que sea cierto). Si se recarga o se cierra la pestaña antes de la confirmación, los cambios sobreviven en `pendiente` y se suben al volver; `beforeunload` avisa si hay cambios sin confirmar. Sin conexión, la app sigue permitiendo editar sobre la copia local y sube al reconectar. **`localStorage` no guarda datos de tareas** (solo preferencias).

## 11. Verificación automática y mezcla con avisos

- **Condición**: la pestaña vuelve a estar visible (`visibilitychange`), vuelve la red (`online`), pasaron 5 minutos, o se conecta Drive.
- **Proceso**: `verificar` / `sincronizarUnaVez` consultan el `modifiedTime` del archivo en Drive. Si no cambió y no hay nada pendiente, solo se actualiza la hora de "verificado". Si otro dispositivo lo modificó, se descarga y se mezcla con `mezclar` (`assets/js/sincronizacion.js`) tomando como base la última copia confirmada: por cada entidad, si solo cambió un lado gana ese; si cambiaron los dos gana el sello `*_modificado_en` más nuevo; un borrado (`eliminados`) contra una edición conserva lo más reciente. Si el usuario está escribiendo en un campo, los cambios remotos se difieren ("Actualizar" en la cabecera; se aplican al salir del campo).
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
