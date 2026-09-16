import { crearTarea, ORDEN_IMPORTANCIA } from './modelos.js';
import { ahoraISO, noPuedeEmpezarTodavia } from './utilidades.js';

/**
 * Calcula la próxima fecha límite (YYYY-MM-DD) de una tarea de mantenimiento,
 * a partir de la fecha real en que se completó (no de una fecha teórica).
 */
export function calcularProximaFechaMantenimiento(desdeISODatetime, mantenimiento) {
  const fecha = new Date(desdeISODatetime);
  const cantidad = mantenimiento.cantidad || 1;
  if (mantenimiento.unidad === 'meses') {
    fecha.setMonth(fecha.getMonth() + cantidad);
  } else if (mantenimiento.unidad === 'semanas') {
    fecha.setDate(fecha.getDate() + cantidad * 7);
  } else {
    fecha.setDate(fecha.getDate() + cantidad);
  }
  return fecha.toISOString().slice(0, 10);
}

/**
 * Marca una tarea como completada. Si es una tarea de mantenimiento, además
 * clona una nueva instancia pendiente con la fecha límite recalculada desde
 * la fecha real de finalización, dejando la instancia actual como historial.
 * Devuelve la nueva tarea clonada, o null si no aplica mantenimiento.
 */
export function completarTarea(tarea, listaTareas, { duracionReal = null, notaMejora = '', costoReal = null } = {}) {
  const ahora = ahoraISO();
  tarea.tarea_estado = 'completada';
  tarea.tarea_completada_en = ahora;
  if (duracionReal != null) tarea.tarea_duracion_real_min = duracionReal;
  if (costoReal != null) tarea.tarea_costo_real = costoReal;

  if (!tarea.tarea_mantenimiento) return null;

  const notas = notaMejora
    ? `${tarea.tarea_notas ? tarea.tarea_notas + '\n\n' : ''}Mejora sugerida la vez anterior: ${notaMejora}`
    : tarea.tarea_notas;

  const nueva = crearTarea({
    tarea_nombre: tarea.tarea_nombre,
    categoria_id: tarea.categoria_id,
    subcategoria_id: tarea.subcategoria_id,
    tarea_estado: 'pendiente',
    tarea_fecha_limite: calcularProximaFechaMantenimiento(ahora, tarea.tarea_mantenimiento),
    tarea_duracion_estimada_min: tarea.tarea_duracion_estimada_min,
    tarea_notas: notas,
    tarea_mantenimiento: tarea.tarea_mantenimiento,
    tarea_recompensa: tarea.tarea_recompensa,
    tarea_costo_estimado: tarea.tarea_costo_estimado,
  });
  listaTareas.push(nueva);
  return nueva;
}

/**
 * Reprograma una tarea (fecha_hora_agendada) y desplaza en cascada a las
 * tareas que dependen de ella, por el mismo delta de tiempo. Si la tarea no
 * tenía una fecha previa agendada, no hay delta que propagar.
 */
export function reprogramarTareaConCascada(tarea, nuevaFechaHoraISO, listaTareas) {
  const anteriorISO = tarea.tarea_fecha_hora_agendada;
  tarea.tarea_fecha_hora_agendada = nuevaFechaHoraISO;

  if (!anteriorISO) return;

  const deltaMs = new Date(nuevaFechaHoraISO).getTime() - new Date(anteriorISO).getTime();
  if (!deltaMs) return;

  desplazarDependientes(tarea.tarea_id, deltaMs, listaTareas, new Set([tarea.tarea_id]));
}

function desplazarDependientes(idTarea, deltaMs, listaTareas, visitados) {
  const deltaDias = Math.round(deltaMs / (24 * 60 * 60 * 1000));

  listaTareas
    .filter((t) => (t.dependencias || []).includes(idTarea) && !visitados.has(t.tarea_id))
    .forEach((dependiente) => {
      visitados.add(dependiente.tarea_id);

      if (dependiente.tarea_fecha_hora_agendada) {
        dependiente.tarea_fecha_hora_agendada = new Date(
          new Date(dependiente.tarea_fecha_hora_agendada).getTime() + deltaMs
        ).toISOString();
      }
      if (dependiente.tarea_fecha_limite) {
        dependiente.tarea_fecha_limite = sumarDiasAFecha(dependiente.tarea_fecha_limite, deltaDias);
      }
      if (dependiente.tarea_fecha_sugerida) {
        dependiente.tarea_fecha_sugerida = sumarDiasAFecha(dependiente.tarea_fecha_sugerida, deltaDias);
      }

      desplazarDependientes(dependiente.tarea_id, deltaMs, listaTareas, visitados);
    });
}

function sumarDiasAFecha(fechaISODate, dias) {
  const fecha = new Date(fechaISODate + 'T00:00:00');
  fecha.setDate(fecha.getDate() + dias);
  return fecha.toISOString().slice(0, 10);
}

/**
 * Indica si una tarea está bloqueada por dependencias todavía no completadas.
 */
export function tareaEstaBloqueada(tarea, listaTareas) {
  const bloqueantes = (tarea.dependencias || [])
    .map((id) => listaTareas.find((t) => t.tarea_id === id))
    .filter((dependencia) => dependencia && dependencia.tarea_estado !== 'completada');
  return { bloqueada: bloqueantes.length > 0, bloqueantes };
}

/**
 * Compara dos tareas por prioridad: primero por `tarea_importancia` (alta antes
 * que media antes que baja), y como desempate por prioridad de categoría
 * (`Categoria.categoria_orden`, menor = más prioritaria). Tareas sin categoría, o cuya
 * categoría ya no existe, quedan siempre al final.
 */
export function compararPorPrioridad(a, b, categorias) {
  const importanciaA = ORDEN_IMPORTANCIA[a.tarea_importancia] ?? ORDEN_IMPORTANCIA.media;
  const importanciaB = ORDEN_IMPORTANCIA[b.tarea_importancia] ?? ORDEN_IMPORTANCIA.media;
  if (importanciaA !== importanciaB) return importanciaA - importanciaB;

  const ordenA = categorias.find((c) => c.categoria_id === a.categoria_id)?.categoria_orden ?? Infinity;
  const ordenB = categorias.find((c) => c.categoria_id === b.categoria_id)?.categoria_orden ?? Infinity;
  return ordenA - ordenB;
}

/**
 * Valida que se pueda agregar `candidatoId` como dependencia de `tareaId`:
 * ni auto-referencia, ni que ya exista un camino (directo o indirecto) desde
 * `candidatoId` de vuelta hasta `tareaId` en el grafo de dependencias, lo que
 * cerraría un ciclo (A depende de B depende de C depende de A, etc.).
 */
export function puedeAgregarDependencia(tareaId, candidatoId, listaTareas) {
  if (tareaId === candidatoId) return false;
  return !existeCaminoDeDependencias(candidatoId, tareaId, listaTareas, new Set());
}

function existeCaminoDeDependencias(desdeId, hastaId, listaTareas, visitados) {
  if (desdeId === hastaId) return true;
  if (visitados.has(desdeId)) return false;
  visitados.add(desdeId);
  const tarea = listaTareas.find((t) => t.tarea_id === desdeId);
  if (!tarea) return false;
  return (tarea.dependencias || []).some((depId) =>
    existeCaminoDeDependencias(depId, hastaId, listaTareas, visitados)
  );
}

/**
 * Indica si una tarea está en condiciones de actuarse ahora: no completada,
 * con fecha de inicio ya alcanzada (si tiene una), y sin dependencias
 * pendientes que la bloqueen.
 */
export function esTareaAccionable(tarea, listaTareas) {
  if (tarea.tarea_estado === 'completada') return false;
  if (noPuedeEmpezarTodavia(tarea.tarea_fecha_inicio_posible)) return false;
  return !tareaEstaBloqueada(tarea, listaTareas).bloqueada;
}

/**
 * Regla 80/20 (Pareto): de las tareas accionables, devuelve el 20% superior
 * (redondeado hacia arriba) según el orden de prioridad ya usado en la app
 * (compararPorPrioridad, con la fecha límite como desempate final) — las
 * "pocas vitales" en las que más conviene enfocarse ahora.
 */
export function calcularEnfoque8020(tareas, categorias) {
  const accionables = tareas
    .filter((t) => esTareaAccionable(t, tareas))
    .sort(
      (a, b) =>
        compararPorPrioridad(a, b, categorias) ||
        (a.tarea_fecha_limite || '9999-99-99').localeCompare(b.tarea_fecha_limite || '9999-99-99')
    );
  const cantidad = Math.ceil(accionables.length * 0.2);
  return accionables.slice(0, cantidad);
}
