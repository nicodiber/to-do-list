import { crearTarea } from './modelos.js';
import { ahoraISO, noPuedeEmpezarTodavia, desplazarFecha } from './utilidades.js';

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
  return fecha.toISOString().slice(0, 10);
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

  const descripcion = notaMejora
    ? `${tarea.tarea_descripcion ? tarea.tarea_descripcion + '\n\n' : ''}Mejora sugerida la vez anterior: ${notaMejora}`
    : tarea.tarea_descripcion;

  const nueva = crearTarea({
    tarea_nombre: tarea.tarea_nombre,
    categoria_id: tarea.categoria_id,
    tarea_estado: 'pendiente',
    tarea_fecha_limite: calcularProximaFechaMantenimiento(ahora, tarea.tarea_mantenimiento_intervalo),
    tarea_duracion_min: tarea.tarea_duracion_min,
    tarea_descripcion: descripcion,
    tarea_mantenimiento: tarea.tarea_mantenimiento,
    tarea_mantenimiento_intervalo: tarea.tarea_mantenimiento_intervalo,
    tarea_costo_estimado: tarea.tarea_costo_estimado,
  });
  listaTareas.push(nueva);
  return nueva;
}

/**
 * Recalcula `tarea_estado` de una tarea según su `tarea_dependiente`: si
 * apunta a otra tarea que todavía no está `completada`, queda `bloqueada`;
 * si no, `pendiente`. No toca tareas ya `completada`. Se llama al crear una
 * tarea, al editar/quitar su dependencia, y (en cascada) al completar la
 * tarea de la que depende.
 */
export function recalcularBloqueo(tarea, listaTareas) {
  if (tarea.tarea_estado === 'completada') return;
  const previa = tarea.tarea_dependiente ? listaTareas.find((t) => t.tarea_id === tarea.tarea_dependiente) : null;
  tarea.tarea_estado = previa && previa.tarea_estado !== 'completada' ? 'bloqueada' : 'pendiente';
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
 * Reprograma `tarea_fecha_sugerida` y desplaza en cascada a las tareas que
 * dependen de ella (`tarea_dependiente === tarea.tarea_id`), por el mismo
 * delta de tiempo. Si la tarea no tenía una fecha sugerida previa, no hay
 * delta que propagar.
 */
export function reprogramarTareaConCascada(tarea, nuevaFechaSugeridaISO, listaTareas) {
  const anteriorISO = tarea.tarea_fecha_sugerida;
  tarea.tarea_fecha_sugerida = nuevaFechaSugeridaISO;

  if (!anteriorISO) return;

  const deltaMs = new Date(nuevaFechaSugeridaISO).getTime() - new Date(anteriorISO).getTime();
  if (!deltaMs) return;

  desplazarDependientes(tarea.tarea_id, deltaMs, listaTareas, new Set([tarea.tarea_id]));
}

function desplazarDependientes(idTarea, deltaMs, listaTareas, visitados) {
  listaTareas
    .filter((t) => t.tarea_dependiente === idTarea && !visitados.has(t.tarea_id))
    .forEach((dependiente) => {
      visitados.add(dependiente.tarea_id);

      if (dependiente.tarea_fecha_sugerida) {
        dependiente.tarea_fecha_sugerida = desplazarFecha(dependiente.tarea_fecha_sugerida, deltaMs);
      }
      if (dependiente.tarea_fecha_limite) {
        dependiente.tarea_fecha_limite = desplazarFecha(dependiente.tarea_fecha_limite, deltaMs);
      }

      desplazarDependientes(dependiente.tarea_id, deltaMs, listaTareas, visitados);
    });
}

/**
 * Compara dos tareas por prioridad. Versión provisoria de la Ronda 1 del
 * rediseño de datos: ordena solo por `categoria_prioridad` de la categoría
 * directa de la tarea (menor = más prioritaria); sin categoría, o categoría
 * inexistente, queda siempre al final. El algoritmo real (con
 * `tarea_importancia`, `tarea_genera_dinero` y la jerarquía de objetivos del
 * usuario) se define en una Ronda 2 aparte — ver REGLAS_DE_PRIORIDAD.md.
 */
export function compararPorPrioridad(a, b, categorias) {
  const prioridadA = categorias.find((c) => c.categoria_id === a.categoria_id)?.categoria_prioridad ?? Infinity;
  const prioridadB = categorias.find((c) => c.categoria_id === b.categoria_id)?.categoria_prioridad ?? Infinity;
  return prioridadA - prioridadB;
}

/**
 * Valida que se pueda agregar `candidatoId` como `tarea_dependiente` de
 * `tareaId`: ni auto-referencia, ni que agregar ese enlace cierre un ciclo
 * (A depende de B depende de C depende de A, etc.) recorriendo la cadena de
 * `tarea_dependiente` hacia atrás desde `candidatoId`.
 */
export function puedeAgregarDependencia(tareaId, candidatoId, listaTareas) {
  if (tareaId === candidatoId) return false;
  return !existeCaminoDeDependencias(candidatoId, tareaId, listaTareas);
}

function existeCaminoDeDependencias(desdeId, hastaId, listaTareas) {
  let actual = desdeId;
  const visitados = new Set();
  while (actual && !visitados.has(actual)) {
    if (actual === hastaId) return true;
    visitados.add(actual);
    const tarea = listaTareas.find((t) => t.tarea_id === actual);
    actual = tarea ? tarea.tarea_dependiente : null;
  }
  return false;
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
 * Regla 80/20 (Pareto): de las tareas accionables, devuelve el 20% superior
 * (redondeado hacia arriba) según el orden de prioridad ya usado en la app
 * (compararPorPrioridad, con la fecha límite como desempate final) — las
 * "pocas vitales" en las que más conviene enfocarse ahora.
 */
export function calcularEnfoque8020(tareas, categorias) {
  const accionables = tareas
    .filter((t) => esTareaAccionable(t))
    .sort(
      (a, b) =>
        compararPorPrioridad(a, b, categorias) ||
        (a.tarea_fecha_limite || '9999-99-99').localeCompare(b.tarea_fecha_limite || '9999-99-99')
    );
  const cantidad = Math.ceil(accionables.length * 0.2);
  return accionables.slice(0, cantidad);
}
