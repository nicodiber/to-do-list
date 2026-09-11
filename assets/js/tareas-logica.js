import { crearTarea } from './modelos.js';
import { ahoraISO } from './utilidades.js';

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
export function completarTarea(tarea, listaTareas, { duracionReal = null, notaMejora = '' } = {}) {
  const ahora = ahoraISO();
  tarea.estado = 'completada';
  tarea.completada_en = ahora;
  if (duracionReal != null) tarea.duracion_real_min = duracionReal;

  if (!tarea.mantenimiento) return null;

  const notas = notaMejora
    ? `${tarea.notas ? tarea.notas + '\n\n' : ''}Mejora sugerida la vez anterior: ${notaMejora}`
    : tarea.notas;

  const nueva = crearTarea({
    nombre: tarea.nombre,
    categoria_id: tarea.categoria_id,
    subcategoria_id: tarea.subcategoria_id,
    estado: 'pendiente',
    fecha_limite: calcularProximaFechaMantenimiento(ahora, tarea.mantenimiento),
    duracion_estimada_min: tarea.duracion_estimada_min,
    notas,
    mantenimiento: tarea.mantenimiento,
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
  const anteriorISO = tarea.fecha_hora_agendada;
  tarea.fecha_hora_agendada = nuevaFechaHoraISO;

  if (!anteriorISO) return;

  const deltaMs = new Date(nuevaFechaHoraISO).getTime() - new Date(anteriorISO).getTime();
  if (!deltaMs) return;

  desplazarDependientes(tarea.id, deltaMs, listaTareas, new Set([tarea.id]));
}

function desplazarDependientes(idTarea, deltaMs, listaTareas, visitados) {
  const deltaDias = Math.round(deltaMs / (24 * 60 * 60 * 1000));

  listaTareas
    .filter((t) => (t.dependencias || []).includes(idTarea) && !visitados.has(t.id))
    .forEach((dependiente) => {
      visitados.add(dependiente.id);

      if (dependiente.fecha_hora_agendada) {
        dependiente.fecha_hora_agendada = new Date(
          new Date(dependiente.fecha_hora_agendada).getTime() + deltaMs
        ).toISOString();
      }
      if (dependiente.fecha_limite) {
        dependiente.fecha_limite = sumarDiasAFecha(dependiente.fecha_limite, deltaDias);
      }
      if (dependiente.fecha_sugerida) {
        dependiente.fecha_sugerida = sumarDiasAFecha(dependiente.fecha_sugerida, deltaDias);
      }

      desplazarDependientes(dependiente.id, deltaMs, listaTareas, visitados);
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
    .map((id) => listaTareas.find((t) => t.id === id))
    .filter((dependencia) => dependencia && dependencia.estado !== 'completada');
  return { bloqueada: bloqueantes.length > 0, bloqueantes };
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
  const tarea = listaTareas.find((t) => t.id === desdeId);
  if (!tarea) return false;
  return (tarea.dependencias || []).some((depId) =>
    existeCaminoDeDependencias(depId, hastaId, listaTareas, visitados)
  );
}
