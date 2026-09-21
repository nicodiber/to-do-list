// Cuánto tiempo hay disponible cada día y cuánto lleva ya comprometido. Es la consulta común (lógica pura, sin DOM ni
// red) de las piezas que reparten tareas en el tiempo: el asistente de examen y la vista Semana la usan desde la
// Ronda 9b; el Gantt y la reprogramación de fechas vencidas se suman en la 9c. Cada una sigue repartiendo a su manera.

import { diaLocal, fechaISOMasDias, hoyISO } from './utilidades.js';

function aMinutos(hhmm) {
  const [horas, minutos] = String(hhmm).split(':').map(Number);
  return horas * 60 + minutos;
}

/** Une intervalos `[inicio, fin]` (en ms) que se pisan o se tocan. */
export function unirIntervalos(intervalos) {
  const ordenados = intervalos.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  const unidos = [];
  ordenados.forEach(([a, b]) => {
    const ultimo = unidos[unidos.length - 1];
    if (ultimo && a <= ultimo[1]) ultimo[1] = Math.max(ultimo[1], b);
    else unidos.push([a, b]);
  });
  return unidos;
}

function limitesDeFranja(dia, franja) {
  const [anio, mes, d] = dia.split('-').map(Number);
  return [new Date(anio, mes - 1, d, 0, aMinutos(franja.inicio)).getTime(), new Date(anio, mes - 1, d, 0, aMinutos(franja.fin)).getTime()];
}

/**
 * Minutos de la franja de `dia` (`YYYY-MM-DD`) ocupados por `eventos` (`{ inicio, fin }` ISO) y, si se pasa
 * `hastaMs`, por lo que ya transcurrió de la franja (para hoy).
 */
export function minutosOcupados(eventos, dia, franja, hastaMs = null) {
  const [desde, hasta] = limitesDeFranja(dia, franja);
  const intervalos = eventos
    .map((e) => [Math.max(desde, new Date(e.inicio).getTime()), Math.min(hasta, new Date(e.fin).getTime())])
    .filter(([a, b]) => b > a);
  if (hastaMs !== null && hastaMs > desde) intervalos.push([desde, Math.min(hasta, hastaMs)]);
  return Math.round(unirIntervalos(intervalos).reduce((suma, [a, b]) => suma + (b - a), 0) / 60000);
}

/**
 * Devuelve `(dia) => { dia, tope, fija, previoAExamen, libreCalendar, capacidad, carga, restante, sobrecarga }`:
 * - `tope`: los minutos que el usuario quiere dedicar ese día: el valor fijado para esa fecha o el de su día de la
 *   semana, reducido (`pref_dia_previo_factor`) si el día siguiente es un examen y no hay valor fijado.
 * - `libreCalendar`: minutos de la franja horaria sin eventos que ocupen (`eventos` ya viene filtrado) y, hoy, sin lo
 *   que ya pasó.
 * - `capacidad = min(tope, libreCalendar)` (o `tope`, si el usuario fijó ese día); `carga`: minutos de las tareas sin completar con fecha sugerida ese día
 *   (salvo `excluirIds`); `restante = max(0, capacidad − carga)`.
 * `fechasExamen` suma fechas de examen que todavía no son tareas (las de un examen que se está armando).
 */
export function crearCalculadoraCapacidad({ preferencias, eventos = [], tareas = [], hoy = hoyISO(), ahora = new Date(), fechasExamen = [], excluirIds = [] }) {
  const excluidas = new Set(excluirIds);
  const cargaPorDia = new Map();
  tareas
    .filter((t) => t.tarea_estado !== 'completada' && t.tarea_fecha_sugerida && !excluidas.has(t.tarea_id))
    .forEach((t) => {
      const dia = diaLocal(t.tarea_fecha_sugerida);
      cargaPorDia.set(dia, (cargaPorDia.get(dia) || 0) + (t.tarea_duracion_min || 30));
    });

  const previos = new Set();
  const marcarExamen = (fecha) => {
    if (fecha) previos.add(fechaISOMasDias(-1, diaLocal(fecha)));
  };
  tareas.filter((t) => t.tarea_tipo === 'examen' && t.tarea_estado !== 'completada').forEach((t) => marcarExamen(t.tarea_fecha_limite || t.tarea_fecha_sugerida));
  fechasExamen.forEach(marcarExamen);

  const franja = preferencias.pref_franja;
  const memo = new Map();
  return (dia) => {
    if (memo.has(dia)) return memo.get(dia);
    const fijada = (preferencias.pref_capacidad_por_fecha || {})[dia];
    const fija = fijada !== undefined && fijada !== null;
    const previoAExamen = previos.has(dia);
    const delDia = preferencias.pref_tope_dias[new Date(`${dia}T00:00:00`).getDay()];
    const tope = fija ? fijada : Math.round(delDia * (previoAExamen ? preferencias.pref_dia_previo_factor : 1));
    const [desde, hasta] = limitesDeFranja(dia, franja);
    const ocupados = dia < hoy ? Math.round((hasta - desde) / 60000) : minutosOcupados(eventos, dia, franja, dia === hoy ? ahora.getTime() : null);
    const libreCalendar = Math.max(0, Math.round((hasta - desde) / 60000) - ocupados);
    // Un valor fijado por el usuario para esa fecha manda: no se le resta lo que diga Calendar.
    const capacidad = fija ? tope : Math.min(tope, libreCalendar);
    const carga = cargaPorDia.get(dia) || 0;
    const resultado = { dia, tope, fija, previoAExamen, libreCalendar, capacidad, carga, restante: Math.max(0, capacidad - carga), sobrecarga: carga > capacidad };
    memo.set(dia, resultado);
    return resultado;
  };
}
