import { crearTarea, crearMejora, crearCumplimiento } from './modelos.js';
import { ahoraISO, hoyISO, fechaLocalISO, diaLocal, noPuedeEmpezarTodavia, desplazarFecha, tieneHora, categoriaRaiz, combinarFechaYHora } from './utilidades.js';
import { siguienteDiaHabil } from './reprogramar.js';
import { recalcularBloqueo, puedeAgregarDependencia, proximasActivas, reconectarAlEliminar } from './dependencias.js';

// Las dependencias viven en `dependencias.js`; se reexportan para no cambiar los imports de las vistas.
export { recalcularBloqueo, puedeAgregarDependencia };

/**
 * Calcula la próxima fecha límite (YYYY-MM-DD) de una tarea de mantenimiento,
 * a partir de la fecha real en que se completó (no de una fecha teórica).
 */
export function calcularProximaFechaMantenimiento(desdeISODatetime, intervalo) {
  const fecha = new Date(desdeISODatetime);
  const cantidad = intervalo.cantidad || 1;
  if (intervalo.unidad === 'meses') {
    fecha.setMonth(fecha.getMonth() + cantidad);
  } else if (intervalo.unidad === 'semanas') {
    fecha.setDate(fecha.getDate() + cantidad * 7);
  } else {
    fecha.setDate(fecha.getDate() + cantidad);
  }
  return fechaLocalISO(fecha);
}

/**
 * Hasta qué día se repite una tarea de mantenimiento (hábito temporal), o `''` si se repite sin fin. Es lo más
 * temprano entre `tarea_repetir_hasta` (una fecha) y lo que marque `tarea_repetir_hasta_tarea`: el día en que se
 * cumplió esa otra tarea o, si sigue pendiente, su fecha límite (o sugerida). Si esa tarea ya no existe se ignora.
 */
export function fechaFinDeRepeticion(tarea, listaTareas) {
  const dias = [];
  if (tarea.tarea_repetir_hasta) dias.push(diaLocal(tarea.tarea_repetir_hasta));
  const otra = tarea.tarea_repetir_hasta_tarea ? listaTareas.find((t) => t.tarea_id === tarea.tarea_repetir_hasta_tarea) : null;
  if (otra) {
    const dia = otra.tarea_estado === 'completada' ? otra.tarea_fecha_fin : otra.tarea_fecha_limite || otra.tarea_fecha_sugerida;
    if (dia) dias.push(diaLocal(dia));
  }
  return dias.sort()[0] || '';
}

/**
 * Marca una tarea como completada (`tarea_fecha_fin` = ahora). Si es una
 * tarea de mantenimiento, además clona una nueva instancia pendiente con la
 * fecha límite recalculada desde la fecha real de finalización, dejando la
 * instancia actual como historial. Devuelve la nueva tarea clonada, o null
 * si no aplica mantenimiento. No desbloquea dependientes — eso lo hace
 * `desbloquearDependientes`, que hay que llamar aparte con la lista completa.
 */
export function completarTarea(tarea, listaTareas, { notaMejora = '' } = {}) {
  const ahora = ahoraISO();
  tarea.tarea_estado = 'completada';
  tarea.tarea_fecha_fin = ahora;

  if (!tarea.tarea_mantenimiento) return null;

  // Hábito temporal: si el próximo vencimiento cae después del día en que termina, no hay otra repetición.
  const proximoLimite = calcularProximaFechaMantenimiento(ahora, tarea.tarea_mantenimiento_intervalo);
  const finRepeticion = fechaFinDeRepeticion(tarea, listaTareas);
  if (finRepeticion && proximoLimite > finRepeticion) return null;

  const descripcion = notaMejora
    ? `${tarea.tarea_descripcion ? tarea.tarea_descripcion + '\n\n' : ''}Mejora sugerida la vez anterior: ${notaMejora}`
    : tarea.tarea_descripcion;

  const nueva = crearTarea({
    tarea_nombre: tarea.tarea_nombre,
    categoria_id: tarea.categoria_id,
    tarea_estado: 'pendiente',
    tarea_fecha_limite: proximoLimite,
    tarea_duracion_min: tarea.tarea_duracion_min,
    tarea_descripcion: descripcion,
    tarea_mantenimiento: tarea.tarea_mantenimiento,
    tarea_mantenimiento_intervalo: tarea.tarea_mantenimiento_intervalo,
    tarea_costo_estimado: tarea.tarea_costo_estimado,
    tarea_disfrute: tarea.tarea_disfrute,
    tarea_urgente: tarea.tarea_urgente,
    ubicacion_id: tarea.ubicacion_id,
    tarea_dias_habiles: [...(tarea.tarea_dias_habiles || [])],
    tarea_requiere_clima_bueno: tarea.tarea_requiere_clima_bueno,
    meta_id: tarea.meta_id,
    tarea_checklist: (tarea.tarea_checklist || []).map((item) => ({ texto: item.texto, hecho: false })),
    tarea_desencadenante: tarea.tarea_desencadenante || null,
    tarea_repetir_hasta: tarea.tarea_repetir_hasta || '',
    tarea_repetir_hasta_tarea: tarea.tarea_repetir_hasta_tarea || null,
    tarea_origen: tarea.tarea_origen || null,
  });
  listaTareas.push(nueva);
  return nueva;
}

/**
 * Al completar una tarea, desbloquea en cadena a las que dependían de ella:
 * cada dependiente pasa su `tarea_fecha_inicio_habilitada` a tomar el
 * `tarea_fecha_fin` de la recién completada, y se recalcula su bloqueo
 * (queda `pendiente`, ya que su única dependencia se acaba de completar).
 */
export function desbloquearDependientes(tareaCompletada, listaTareas) {
  listaTareas
    .filter((t) => t.tarea_dependiente === tareaCompletada.tarea_id)
    .forEach((dependiente) => {
      dependiente.tarea_fecha_inicio_habilitada = tareaCompletada.tarea_fecha_fin;
      recalcularBloqueo(dependiente, listaTareas);
    });
}

/**
 * La instancia "vigente" de una tarea: ella misma si todavía no se completó o,
 * si ya se completó, la copia de mantenimiento pendiente con el mismo
 * `tarea_nombre` (la identidad de una tarea que se repite es su nombre; si hay
 * más de una, la más antigua). `excluirIds` deja afuera instancias puntuales.
 */
export function instanciaPendiente(tarea, listaTareas, excluirIds = []) {
  if (tarea.tarea_estado !== 'completada') return tarea;
  return (
    listaTareas
      .filter(
        (t) =>
          t.tarea_id !== tarea.tarea_id &&
          !excluirIds.includes(t.tarea_id) &&
          t.tarea_mantenimiento &&
          t.tarea_estado !== 'completada' &&
          t.tarea_nombre === tarea.tarea_nombre
      )
      .sort((a, b) => (a.tarea_creada_en || '').localeCompare(b.tarea_creada_en || ''))[0] || null
  );
}

/**
 * Enlaza la copia de una tarea de mantenimiento recién completada: si la
 * original tenía tarea previa P, la copia depende de la instancia vigente de P
 * (así una cadena A→B→C se repite entera); si no tenía previa pero sí un
 * `tarea_desencadenante` D, la copia queda bloqueada por la instancia vigente
 * de D (así un anillo A→B→C→D→A se sostiene). Nunca crea un enlace que rompa
 * la regla 1 a 1 ni que forme un ciclo.
 */
function enlazarCopia(original, copia, listaTareas) {
  const referenciaId = original.tarea_dependiente || original.tarea_desencadenante;
  const referencia = referenciaId ? listaTareas.find((t) => t.tarea_id === referenciaId) : null;
  const objetivo = referencia ? instanciaPendiente(referencia, listaTareas, [original.tarea_id, copia.tarea_id]) : null;
  if (!objetivo) return;
  if (proximasActivas(objetivo.tarea_id, listaTareas).some((t) => t.tarea_id !== copia.tarea_id)) return;
  if (!puedeAgregarDependencia(copia.tarea_id, objetivo.tarea_id, listaTareas)) return;
  copia.tarea_dependiente = objetivo.tarea_id;
  recalcularBloqueo(copia, listaTareas);
}

/**
 * Cumple una tarea: la completa (y, si es de mantenimiento, crea su copia), la
 * enlaza (ver `enlazarCopia`), desbloquea a las que dependían de ella, registra
 * el cumplimiento (base del mapa de hábitos) y, si hay nota, crea la Mejora.
 * Reemplaza el par `completarTarea` + `desbloquearDependientes` que repetían
 * las vistas. `estado` es el objeto con las colecciones de la app. Devuelve la
 * copia creada, o `null`.
 */
export function cumplirTarea(tarea, estado, { notaMejora = '' } = {}) {
  const copia = completarTarea(tarea, estado.tareas, { notaMejora });
  if (!estado.cumplimientos) estado.cumplimientos = [];
  estado.cumplimientos.push(crearCumplimiento({ tarea, fecha: tarea.tarea_fecha_fin }));
  if (notaMejora) {
    if (!estado.mejoras) estado.mejoras = [];
    estado.mejoras.push(crearMejora({ mejora_tarea_nombre: tarea.tarea_nombre, mejora_texto: notaMejora }));
  }
  if (copia) enlazarCopia(tarea, copia, estado.tareas);
  desbloquearDependientes(tarea, estado.tareas);
  return copia;
}

/**
 * Pasa al nombre nuevo el historial de una tarea de mantenimiento (sus cumplimientos y sus notas de
 * mejora), porque la identidad de un hábito es el nombre de la tarea: sin esto, renombrarla lo
 * partiría en dos. Devuelve cuántos registros cambió.
 */
export function renombrarHistorial(estado, nombreViejo, nombreNuevo) {
  if (!nombreViejo || nombreViejo === nombreNuevo) return 0;
  let cambiados = 0;
  (estado.cumplimientos || []).forEach((c) => {
    if (c.cumplimiento_tarea_nombre === nombreViejo) {
      c.cumplimiento_tarea_nombre = nombreNuevo;
      cambiados += 1;
    }
  });
  (estado.mejoras || []).forEach((m) => {
    if (m.mejora_tarea_nombre === nombreViejo) {
      m.mejora_tarea_nombre = nombreNuevo;
      cambiados += 1;
    }
  });
  return cambiados;
}

const MS_COPIA_SIN_TOCAR = 10 * 1000;

/** ¿La copia se creó y no se volvió a modificar (su sello es de la misma guardada que la creó)? */
function copiaSinTocar(copia, estado) {
  if (!copia.tarea_modificado_en || !copia.tarea_creada_en) return false;
  const editadaDespues = Date.parse(copia.tarea_modificado_en) - Date.parse(copia.tarea_creada_en) > MS_COPIA_SIN_TOCAR;
  return !editadaDespues && !estado.tareas.some((t) => t.tarea_dependiente === copia.tarea_id);
}

/**
 * Reabre una tarea completada: vuelve a estar pendiente (o bloqueada, si su
 * previa no está completa), se deshace su cumplimiento y su marca de exportada
 * a Calendar, y las tareas que dependían de ella se recalculan. Si era de
 * mantenimiento y ya había generado su copia, la borra solo si sigue sin tocar
 * (sin completar, sin nadie que dependa de ella y sin ediciones); si se tocó
 * la conserva. La Mejora, si hubo, se conserva. Devuelve
 * `{ copiaEliminada, copiaConservada }` para que la vista pueda avisar.
 */
export function reabrirTarea(tarea, estado) {
  const finAnterior = tarea.tarea_fecha_fin;
  tarea.tarea_estado = 'pendiente';
  tarea.tarea_fecha_fin = null;
  tarea.tarea_exportada_calendar = false;
  recalcularBloqueo(tarea, estado.tareas);
  estado.cumplimientos = (estado.cumplimientos || []).filter((c) => c.cumplimiento_tarea_id !== tarea.tarea_id);
  estado.tareas.filter((t) => t.tarea_dependiente === tarea.tarea_id).forEach((dependiente) => recalcularBloqueo(dependiente, estado.tareas));

  const resultado = { copiaEliminada: null, copiaConservada: null };
  if (!tarea.tarea_mantenimiento || !finAnterior) return resultado;

  const copia = estado.tareas
    .filter(
      (t) =>
        t.tarea_id !== tarea.tarea_id &&
        t.tarea_mantenimiento &&
        t.tarea_estado !== 'completada' &&
        t.tarea_nombre === tarea.tarea_nombre &&
        (t.tarea_creada_en || '') >= finAnterior
    )
    .sort((a, b) => (a.tarea_creada_en || '').localeCompare(b.tarea_creada_en || ''))[0];
  if (!copia) return resultado;

  if (copiaSinTocar(copia, estado)) {
    eliminarTarea(copia, estado);
    resultado.copiaEliminada = copia;
  } else {
    resultado.copiaConservada = copia;
  }
  return resultado;
}

/**
 * Elimina una tarea. Si estaba en el medio de una cadena, la reconecta
 * (P→A→N queda P→N) y el desencadenante que la apuntaba pasa a su previa.
 * No toca cumplimientos ni mejoras: son historial.
 */
export function eliminarTarea(tarea, estado) {
  estado.tareas = estado.tareas.filter((t) => t.tarea_id !== tarea.tarea_id);
  reconectarAlEliminar(tarea, estado.tareas);
}

/**
 * Reprograma `tarea_fecha_sugerida` y desplaza en cascada la de las tareas que dependen de ella
 * (`tarea_dependiente === tarea.tarea_id`), por el mismo delta de tiempo. Si la tarea no tenía una fecha
 * sugerida previa, no hay delta que propagar. **No toca `tarea_fecha_limite` de nadie** (v0.76.0 — antes
 * la desplazaba también, para que la cadena no quedara con un límite imposible; se sacó porque solo el
 * usuario puede cambiar la fecha límite). Devuelve las tareas dependientes que, tras desplazar su sugerida,
 * quedaron con `tarea_fecha_sugerida` después de su propia `tarea_fecha_limite` (sin tocar) — para avisar
 * en vez de corregirlas solo; usar con `avisoInconsistentes`.
 */
export function reprogramarTareaConCascada(tarea, nuevaFechaSugeridaISO, listaTareas) {
  const anteriorISO = tarea.tarea_fecha_sugerida;
  tarea.tarea_fecha_sugerida = nuevaFechaSugeridaISO;

  if (!anteriorISO) return [];

  const deltaMs = new Date(nuevaFechaSugeridaISO).getTime() - new Date(anteriorISO).getTime();
  if (!deltaMs) return [];

  const inconsistentes = [];
  desplazarDependientes(tarea.tarea_id, deltaMs, listaTareas, new Set([tarea.tarea_id]), inconsistentes);
  return inconsistentes;
}

function desplazarDependientes(idTarea, deltaMs, listaTareas, visitados, inconsistentes) {
  listaTareas
    .filter((t) => t.tarea_dependiente === idTarea && !visitados.has(t.tarea_id))
    .forEach((dependiente) => {
      visitados.add(dependiente.tarea_id);

      if (dependiente.tarea_fecha_sugerida) {
        dependiente.tarea_fecha_sugerida = desplazarFecha(dependiente.tarea_fecha_sugerida, deltaMs);
        if (limitarFechaSugeridaALimite(dependiente.tarea_fecha_sugerida, dependiente.tarea_fecha_limite) === '') {
          inconsistentes.push(dependiente);
        }
      }

      desplazarDependientes(dependiente.tarea_id, deltaMs, listaTareas, visitados, inconsistentes);
    });
}

/** Texto del aviso para `inconsistentes` (ver `reprogramarTareaConCascada`), o `''` si no hay ninguna. */
export function avisoInconsistentes(inconsistentes) {
  if (!inconsistentes || inconsistentes.length === 0) return '';
  const nombres = inconsistentes.map((t) => `«${t.tarea_nombre}»`).join(', ');
  return `${nombres}: la fecha sugerida quedó después de la fecha límite (no se tocó). Revisala a mano.`;
}

/**
 * Próxima `tarea_fecha_sugerida` para una tarea cuya fecha sugerida venció
 * sin completarse: hoy (o el próximo día hábil según `tarea_dias_habiles`),
 * preservando la hora si tenía, y sin superar `tarea_fecha_limite` si existe.
 */
function calcularProximaFechaSugerida(tarea) {
  let dia = siguienteDiaHabil(hoyISO(), tarea.tarea_dias_habiles);
  if (tarea.tarea_fecha_limite && dia > diaLocal(tarea.tarea_fecha_limite)) {
    dia = diaLocal(tarea.tarea_fecha_limite);
  }
  if (!tieneHora(tarea.tarea_fecha_sugerida)) return dia;

  // La hora se extrae en horario local (igual que `partesFechaHora` en
  // tareas.view.js), no recortando el string ISO crudo (que está en UTC) —
  // `combinarFechaYHora` espera una hora local para volver a armar el ISO.
  const fechaVieja = new Date(tarea.tarea_fecha_sugerida);
  const hora = `${String(fechaVieja.getHours()).padStart(2, '0')}:${String(fechaVieja.getMinutes()).padStart(2, '0')}`;
  return combinarFechaYHora(dia, hora);
}

/**
 * `tarea_fecha_sugerida` nunca puede superar `tarea_fecha_limite` (la fecha límite la decide el usuario;
 * la sugerida la puede reprogramar la app sin preguntar). Si las dos están cargadas y la sugerida queda
 * después del día límite, se descarta en silencio (queda vacía) en vez de bloquear el guardado — la
 * tarea vuelve a ser candidata de `programarTareasSinFecha`, que le va a asignar una nueva ya respetando
 * el límite. No muta: devuelve el valor que debería tener `tarea_fecha_sugerida`.
 */
export function limitarFechaSugeridaALimite(fechaSugeridaISO, fechaLimiteISO) {
  if (!fechaSugeridaISO || !fechaLimiteISO) return fechaSugeridaISO;
  return diaLocal(fechaSugeridaISO) > diaLocal(fechaLimiteISO) ? '' : fechaSugeridaISO;
}

/**
 * Reprograma automáticamente (sin intervención del usuario, a diferencia de
 * `tarea_fecha_limite`) la `tarea_fecha_sugerida` de toda tarea activa (no
 * completada) que quedó vencida, a la próxima fecha disponible
 * (`calcularProximaFechaSugerida`), en cascada sobre sus dependientes vía
 * `reprogramarTareaConCascada`. Se llama una vez al iniciar la app. Devuelve
 * `{ afectadas, inconsistentes }`: las tareas afectadas (para avisarle al usuario) y las dependientes que,
 * tras desplazar en cascada, quedaron con la sugerida después de su propia fecha límite (ver `avisoInconsistentes`).
 */
export function reprogramarFechasSugeridasVencidas(listaTareas) {
  const afectadas = [];
  const inconsistentes = [];
  listaTareas
    .filter((t) => t.tarea_estado !== 'completada' && t.tarea_fecha_sugerida && diaLocal(t.tarea_fecha_sugerida) < hoyISO())
    .forEach((tarea) => {
      inconsistentes.push(...reprogramarTareaConCascada(tarea, calcularProximaFechaSugerida(tarea), listaTareas));
      afectadas.push(tarea);
    });
  return { afectadas, inconsistentes };
}

const MS_POR_DIA = 24 * 60 * 60 * 1000;

/**
 * Calcula cuántos días de margen le quedan a una tarea antes de que sea
 * imposible cumplir su `tarea_fecha_limite`, contados desde hoy (no desde
 * que se creó): `tarea_fecha_limite − max(ahora, tarea_fecha_inicio_habilitada)`.
 * Sin fecha límite, devuelve `Infinity` (sin apuro). Negativo = vencida.
 * Una fecha sin hora se interpreta como el límite del día (fin de día para
 * `tarea_fecha_limite`, inicio de día para `tarea_fecha_inicio_habilitada`),
 * para que una tarea que vence "hoy" no aparezca vencida a la mañana.
 */
export function calcularHolguraDias(tarea) {
  if (!tarea.tarea_fecha_limite) return Infinity;

  const limite = new Date(tieneHora(tarea.tarea_fecha_limite) ? tarea.tarea_fecha_limite : tarea.tarea_fecha_limite + 'T23:59:59');

  const ahora = new Date();
  let desde = ahora;
  if (tarea.tarea_fecha_inicio_habilitada) {
    const inicio = new Date(
      tieneHora(tarea.tarea_fecha_inicio_habilitada) ? tarea.tarea_fecha_inicio_habilitada : tarea.tarea_fecha_inicio_habilitada + 'T00:00:00'
    );
    if (inicio > desde) desde = inicio;
  }

  return Math.floor((limite.getTime() - desde.getTime()) / MS_POR_DIA);
}

/**
 * Agrupa la holgura (ver `calcularHolguraDias`) en bandas, de más a menos
 * urgente. Definidas junto al usuario en la Ronda 2 para que una diferencia
 * de días chica no tape la prioridad real de categorías (ver
 * REGLAS_DE_PRIORIDAD.md).
 */
function bandaHolgura(dias) {
  if (dias < 0) return 0;
  if (dias <= 3) return 1;
  if (dias <= 7) return 2;
  if (dias <= 15) return 3;
  if (dias <= 30) return 4;
  return 5;
}

/**
 * Compara dos tareas por los niveles 1-4 de prioridad (ver
 * REGLAS_DE_PRIORIDAD.md para el detalle y los ejemplos): 1) banda de
 * holgura (`calcularHolguraDias`) — el criterio dominante; 2)
 * `categoria_prioridad` de la categoría raíz de cada tarea (`categoriaRaiz`);
 * 3) `categoria_prioridad` de la categoría directa, como desempate entre
 * categorías con la misma raíz; 4) `tarea_urgente` (booleano, v0.75.0: antes
 * `tarea_importancia` de 3 valores — `true` gana). Sin categoría, o categoría inexistente, queda siempre al
 * final en los niveles 2 y 3. Devuelve 0 si empatan en los 4 niveles —
 * usado tanto por `compararPorPrioridad` como por `tareasEmpatadas`.
 */
function compararEstructural(a, b, categorias) {
  const bandaA = bandaHolgura(calcularHolguraDias(a));
  const bandaB = bandaHolgura(calcularHolguraDias(b));
  if (bandaA !== bandaB) return bandaA - bandaB;

  const categoriaA = categorias.find((c) => c.categoria_id === a.categoria_id) ?? null;
  const categoriaB = categorias.find((c) => c.categoria_id === b.categoria_id) ?? null;

  const prioridadRaizA = categoriaA ? (categoriaRaiz(categoriaA, categorias)?.categoria_prioridad ?? Infinity) : Infinity;
  const prioridadRaizB = categoriaB ? (categoriaRaiz(categoriaB, categorias)?.categoria_prioridad ?? Infinity) : Infinity;
  if (prioridadRaizA !== prioridadRaizB) return prioridadRaizA - prioridadRaizB;

  const prioridadDirectaA = categoriaA?.categoria_prioridad ?? Infinity;
  const prioridadDirectaB = categoriaB?.categoria_prioridad ?? Infinity;
  if (prioridadDirectaA !== prioridadDirectaB) return prioridadDirectaA - prioridadDirectaB;

  return (a.tarea_urgente ? 0 : 1) - (b.tarea_urgente ? 0 : 1);
}

/**
 * Asigna `tarea_prioridad_manual` a un par de tareas: `preferida` queda con el valor más bajo (gana el desempate
 * de `compararPorPrioridad`), `otra` con el siguiente. Valores frescos y siempre crecientes (nunca se reusan), así
 * que no importa qué tuvieran antes. La usan tanto "Versus" (`views/tabla.view.js`) como reordenar a mano (▲▼).
 */
export function asignarOrdenManual(preferida, otra, listaTareas) {
  const siguienteValor = 1 + Math.max(-1, ...listaTareas.map((t) => t.tarea_prioridad_manual).filter((v) => v != null));
  preferida.tarea_prioridad_manual = siguienteValor;
  otra.tarea_prioridad_manual = siguienteValor + 1;
}

/**
 * Intercambia el orden entre dos tareas ADYACENTES en la lista mostrada (▲▼): a diferencia de
 * `asignarOrdenManual` (pensada para "Versus", donde la ganadora debe saltar al frente de todo el grupo
 * empatado), acá solo debe cambiar el orden relativo del par tocado — el resto del grupo todavía empatado
 * (sin `tarea_prioridad_manual`, que por eso ordena como si fuera "infinito") no tiene que moverse. Un
 * valor fresco a solo el par, con el enfoque de `asignarOrdenManual`, los haría saltar por delante de esas
 * otras tareas empatadas igual, no solo de la vecina tocada — el bug real que reportó el usuario ("suben y
 * bajan de manera no lógica") en tareas empatadas sin decidir todavía.
 *
 * En cambio, le da un valor fresco y creciente a **todo el tramo contiguo** de `listaOrdenada` (la lista tal
 * como se está mostrando) que sigue empatado en `compararEstructural` (mismos 4 niveles que ordenan la
 * lista) y sin relación de cadena con el par, respetando el orden actual de todas salvo el par que se
 * intercambia. A
 * partir de acá todo ese grupo queda con un valor real (ya no "infinito"), así que un próximo ▲▼ dentro del
 * mismo grupo vuelve a ser un intercambio simple y seguro. `listaTareas` (normalmente `estado.tareas`) es
 * solo para calcular un valor que no choque con ningún otro ya asignado en cualquier parte de la app.
 */
function empatadasSinCadena(a, b, categorias) {
  if (a.tarea_dependiente === b.tarea_id || b.tarea_dependiente === a.tarea_id) return false;
  return compararEstructural(a, b, categorias) === 0;
}

export function intercambiarAdyacentes(arriba, abajo, listaOrdenada, listaTareas, categorias) {
  const indiceArriba = listaOrdenada.indexOf(arriba);
  const indiceAbajo = listaOrdenada.indexOf(abajo);

  let inicio = indiceArriba;
  while (inicio > 0 && empatadasSinCadena(listaOrdenada[inicio - 1], listaOrdenada[inicio], categorias)) inicio -= 1;
  let fin = indiceAbajo;
  while (fin < listaOrdenada.length - 1 && empatadasSinCadena(listaOrdenada[fin], listaOrdenada[fin + 1], categorias)) fin += 1;

  const tramo = listaOrdenada.slice(inicio, fin + 1);
  const iArriba = tramo.indexOf(arriba);
  const iAbajo = tramo.indexOf(abajo);
  [tramo[iArriba], tramo[iAbajo]] = [tramo[iAbajo], tramo[iArriba]];

  let siguienteValor = 1 + Math.max(-1, ...listaTareas.map((t) => t.tarea_prioridad_manual).filter((v) => v != null));
  tramo.forEach((tarea) => {
    tarea.tarea_prioridad_manual = siguienteValor;
    siguienteValor += 1;
  });
}

/**
 * Intercambia dos tareas ADYACENTES en la cadena de dependencia (▲▼ entre encadenadas, v0.75.0): a
 * diferencia de antes (que bloqueaba el botón), la app reordena la cadena sola. El llamador garantiza que
 * `nuevoSegundo` es hoy la previa de `nuevoPrimero` (`nuevoSegundo.tarea_id === nuevoPrimero.tarea_dependiente`)
 * — es decir, `nuevoSegundo` bloquea a `nuevoPrimero`. Tras la llamada queda al revés: `nuevoPrimero` bloquea
 * a `nuevoSegundo`, conservando lo que hubiera antes y después del par (P→segundo→primero→N pasa a
 * P→primero→segundo→N). Solo toca `tarea_dependiente` (no fechas) y no usa `evaluarEnlace`/`aplicarEnlace`:
 * es una permutación local de un tramo ya válido, no puede crear ciclos ni romper la regla 1 a 1. No toca
 * `tarea_desencadenante` (los anillos de mantenimiento quedan fuera de este alcance).
 */
export function intercambiarCadena(nuevoPrimero, nuevoSegundo, listaTareas) {
  const previaDeAntes = nuevoSegundo.tarea_dependiente || null;
  const proximaDeDespues = listaTareas.find((t) => t.tarea_dependiente === nuevoPrimero.tarea_id && t.tarea_estado !== 'completada') || null;

  nuevoPrimero.tarea_dependiente = previaDeAntes;
  nuevoSegundo.tarea_dependiente = nuevoPrimero.tarea_id;
  if (proximaDeDespues) proximaDeDespues.tarea_dependiente = nuevoSegundo.tarea_id;

  recalcularBloqueo(nuevoPrimero, listaTareas);
  recalcularBloqueo(nuevoSegundo, listaTareas);
  if (proximaDeDespues) recalcularBloqueo(proximaDeDespues, listaTareas);
}

/**
 * Por qué `actual` no puede cambiar de orden con `vecina` (▲▼ a mano): `''` si sí puede (están empatadas en los 4
 * niveles estructurales de `compararEstructural` y no son cadena previa/próxima — mover `tarea_prioridad_manual`
 * entre ellas sí va a cambiar el orden mostrado); si no, un texto que nombra a `vecina` y qué la hace ganar, para
 * que el usuario sepa qué campo tocar si de verdad quiere reordenarlas. Mismo orden de niveles que
 * `compararEstructural` (que queda sin tocar).
 */
export function motivoBloqueoOrdenManual(actual, vecina, categorias) {
  // Encadenadas (previa/próxima directa): siempre se puede — ver `intercambiarCadena`, que reordena la
  // cadena sola. No se comparan los demás niveles: la relación de cadena manda, igual que ya hace
  // `ordenarConCadenas` al mostrarlas juntas.
  if (actual.tarea_dependiente === vecina.tarea_id || vecina.tarea_dependiente === actual.tarea_id) {
    return '';
  }

  const bandaActual = bandaHolgura(calcularHolguraDias(actual));
  const bandaVecina = bandaHolgura(calcularHolguraDias(vecina));
  if (bandaActual !== bandaVecina) {
    return `«${vecina.tarea_nombre}» ${bandaVecina < bandaActual ? 'tiene menos margen hasta su fecha límite (vence antes)' : 'tiene más margen hasta su fecha límite (vence después)'}.`;
  }

  const categoriaActual = categorias.find((c) => c.categoria_id === actual.categoria_id) ?? null;
  const categoriaVecina = categorias.find((c) => c.categoria_id === vecina.categoria_id) ?? null;

  const raizActual = categoriaActual ? (categoriaRaiz(categoriaActual, categorias)?.categoria_prioridad ?? Infinity) : Infinity;
  const raizVecina = categoriaVecina ? (categoriaRaiz(categoriaVecina, categorias)?.categoria_prioridad ?? Infinity) : Infinity;
  if (raizActual !== raizVecina) {
    const nombreRaiz = categoriaRaiz(categoriaVecina, categorias)?.categoria_nombre || 'sin categoría';
    return `«${vecina.tarea_nombre}» está en la categoría «${nombreRaiz}», con ${raizVecina < raizActual ? 'mayor' : 'menor'} prioridad.`;
  }

  const directaActual = categoriaActual?.categoria_prioridad ?? Infinity;
  const directaVecina = categoriaVecina?.categoria_prioridad ?? Infinity;
  if (directaActual !== directaVecina) {
    return `«${vecina.tarea_nombre}» está en la subcategoría «${categoriaVecina?.categoria_nombre || 'sin categoría'}», con ${directaVecina < directaActual ? 'mayor' : 'menor'} prioridad.`;
  }

  if (!!actual.tarea_urgente !== !!vecina.tarea_urgente) {
    return `«${vecina.tarea_nombre}» ${vecina.tarea_urgente ? 'es urgente' : 'no es urgente'}.`;
  }

  return '';
}

/**
 * Compara dos tareas por prioridad, en 6 niveles (ver REGLAS_DE_PRIORIDAD.md):
 * los 4 de `compararEstructural`, después 5) `tarea_prioridad_manual`
 * (`?? Infinity`, menor = más prioritaria — resultado de la herramienta
 * "Versus" o de reordenar a mano con ▲▼), y por último 6) `tarea_creada_en`
 * ascendente (FIFO), para que el orden sea siempre determinístico.
 */
export function compararPorPrioridad(a, b, categorias) {
  const estructural = compararEstructural(a, b, categorias);
  if (estructural !== 0) return estructural;

  const manualA = a.tarea_prioridad_manual ?? Infinity;
  const manualB = b.tarea_prioridad_manual ?? Infinity;
  if (manualA !== manualB) return manualA - manualB;

  return (a.tarea_creada_en || '').localeCompare(b.tarea_creada_en || '');
}

/**
 * `true` si dos tareas están empatadas en los 4 niveles estructurales de
 * prioridad (`compararEstructural`) y **ninguna** tiene todavía
 * `tarea_prioridad_manual` asignado — es decir, siguen siendo una
 * ambigüedad real que la herramienta "Versus" puede ofrecer para resolver.
 * Si alguna ya fue resuelta en una ronda anterior, no se vuelve a ofrecer.
 */
export function tareasEmpatadas(a, b, categorias) {
  if (a.tarea_prioridad_manual != null || b.tarea_prioridad_manual != null) return false;
  return compararEstructural(a, b, categorias) === 0;
}

/**
 * Para cada categoría raíz (sin `categoria_padre_id`), devuelve su tarea
 * accionable de mayor prioridad (misma lógica que `compararPorPrioridad`) —
 * "la tarea que bloquea al resto de esa categoría". Categorías raíz sin
 * ninguna tarea accionable se omiten. Pensada para elegir qué hacer en un
 * rato libre sin que la categoría de mayor prioridad general (ej. Facultad)
 * tape siempre a las demás.
 */
export function mejorTareaPorCategoria(tareas, categorias) {
  const raices = categorias.filter((c) => !c.categoria_padre_id);
  return raices
    .map((raiz) => {
      const candidatas = tareas.filter((t) => {
        if (!esTareaAccionable(t)) return false;
        const categoria = categorias.find((c) => c.categoria_id === t.categoria_id);
        return categoria && categoriaRaiz(categoria, categorias)?.categoria_id === raiz.categoria_id;
      });
      if (candidatas.length === 0) return null;
      candidatas.sort((a, b) => compararPorPrioridad(a, b, categorias));
      return { categoria: raiz, tarea: candidatas[0] };
    })
    .filter(Boolean);
}

/**
 * ¿La tarea quedó "solo con nombre"? Sin completar, sin ningún dato cargado más
 * allá del nombre (todo en su valor por defecto) y sin enlaces con otras
 * tareas. Sirve para "Completar carga de tareas": encontrar lo que se cargó
 * rápido y quedó incompleto. Una tarea marcada con `tarea_carga_completa`
 * (botón "Dejar así") queda afuera.
 */
export function esTareaSoloConNombre(tarea, listaTareas = []) {
  if (tarea.tarea_estado === 'completada' || tarea.tarea_carga_completa) return false;
  if (tarea.categoria_id || tarea.tarea_urgente || tarea.tarea_disfrute != null || tarea.meta_id) return false;
  if (tarea.tarea_fecha_sugerida || tarea.tarea_fecha_limite) return false;
  if (tarea.tarea_fecha_inicio_habilitada && tarea.tarea_fecha_inicio_habilitada !== tarea.tarea_creada_en) return false;
  // Cuentan como "sin datos" tanto la duración por defecto de ahora (30) como la de antes (15).
  if (![15, 30].includes(tarea.tarea_duracion_min || 30)) return false;
  if (tarea.tarea_descripcion || tarea.ubicacion_id || tarea.tarea_requiere_clima_bueno || tarea.tarea_costo_estimado) return false;
  if (tarea.tarea_mantenimiento || (tarea.tarea_dias_habiles || []).length > 0) return false;
  if ((tarea.tarea_checklist || []).length > 0 || tarea.tarea_desencadenante) return false;
  if (tarea.tarea_tipo || tarea.tarea_origen) return false;
  if (tarea.tarea_dependiente || proximasActivas(tarea.tarea_id, listaTareas).length > 0) return false;
  return true;
}

/** Las tareas que quedaron "solo con nombre" (ver `esTareaSoloConNombre`), en orden de creación. */
export function tareasSoloConNombre(listaTareas) {
  return listaTareas
    .filter((t) => esTareaSoloConNombre(t, listaTareas))
    .sort((a, b) => (a.tarea_creada_en || '').localeCompare(b.tarea_creada_en || ''));
}

/**
 * Indica si una tarea está en condiciones de actuarse ahora: `pendiente`
 * (ni `bloqueada` ni `completada`) y con `tarea_fecha_inicio_habilitada` ya
 * alcanzada.
 */
export function esTareaAccionable(tarea) {
  return tarea.tarea_estado === 'pendiente' && !noPuedeEmpezarTodavia(tarea.tarea_fecha_inicio_habilitada);
}

/**
 * Reordena una lista ya priorizada (`compararPorPrioridad`) para que cada tarea bloqueada quede justo detrás de su
 * tarea previa: una cadena queda junta, en el orden en que se va a poder hacer, en lugar de separada entre
 * "pendientes" y "bloqueadas" o dispersa por prioridad individual. Una bloqueada cuya previa no está en la lista
 * (por ejemplo, un filtro la dejó afuera) cae al final, en su orden original. Pura: no muta la lista de entrada.
 */
export function ordenarConCadenas(tareasOrdenadas) {
  const siguientePorPrevia = new Map();
  tareasOrdenadas.forEach((t) => {
    if (t.tarea_estado === 'bloqueada' && t.tarea_dependiente) siguientePorPrevia.set(t.tarea_dependiente, t);
  });
  const colocadas = new Set();
  const resultado = [];
  const colocar = (tarea) => {
    if (colocadas.has(tarea.tarea_id)) return;
    resultado.push(tarea);
    colocadas.add(tarea.tarea_id);
    const siguiente = siguientePorPrevia.get(tarea.tarea_id);
    if (siguiente) colocar(siguiente);
  };
  tareasOrdenadas.forEach((t) => {
    if (t.tarea_estado !== 'bloqueada') colocar(t);
  });
  tareasOrdenadas.forEach((t) => {
    if (t.tarea_estado === 'bloqueada' && !colocadas.has(t.tarea_id)) colocar(t);
  });
  return resultado;
}
