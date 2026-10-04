// Tiempo real de las tareas (v0.104.0): al cumplir una tarea se puede contar cuánto tardó de verdad (opcional y apagado por
// defecto: Configuraciones → «Preguntar cuánto tardé al completar una tarea»). Con esos datos, Estadísticas compara lo
// estimado con lo real por categoría y propone un ajuste de las duraciones pendientes, que **siempre** se confirma antes.

import { estado, persistirYNotificar } from './almacenamiento.js';
import { obtenerPreferencias } from './preferencias.js';
import { pedirTexto } from './avisos.js';

/** Pregunta cuántos minutos tardó la tarea recién cumplida (si la preferencia está activada) y lo guarda en su cumplimiento. */
export async function preguntarTiempoReal(tarea) {
  if (!obtenerPreferencias().pref_preguntar_tiempo_real) return;
  const texto = await pedirTexto(`¿Cuántos minutos te llevó «${tarea.tarea_nombre}»?\n(Opcional. Estimabas ${tarea.tarea_duracion_min || '?'} min. Dejalo vacío para no anotarlo.)`, {
    titulo: '⏱️ Tiempo real',
    placeholder: 'Ej. 25',
    textoAceptar: 'Anotar',
    textoCancelar: 'Omitir',
  });
  const minutos = texto === null ? NaN : Math.round(Number(String(texto).replace(',', '.')));
  if (!Number.isFinite(minutos) || minutos <= 0 || minutos > 24 * 60) return;
  const cumplimiento = [...(estado.cumplimientos || [])].reverse().find((c) => c.cumplimiento_tarea_id === tarea.tarea_id);
  if (!cumplimiento) return;
  cumplimiento.cumplimiento_duracion_real = minutos;
  await persistirYNotificar({ deshacer: false });
}

/**
 * Por categoría (`categoria_id` o `''`): cuántos cumplimientos tienen tiempo real, el total estimado y el real, y el factor
 * real/estimado (`factor > 1` = tardás más de lo que estimás).
 */
export function compararEstimadoVsReal(cumplimientos) {
  const grupos = new Map();
  (cumplimientos || [])
    .filter((c) => c.cumplimiento_duracion_real && c.cumplimiento_duracion_estimada)
    .forEach((c) => {
      const clave = c.categoria_id || '';
      const g = grupos.get(clave) || { categoriaId: clave, cantidad: 0, estimado: 0, real: 0 };
      g.cantidad += 1;
      g.estimado += c.cumplimiento_duracion_estimada;
      g.real += c.cumplimiento_duracion_real;
      grupos.set(clave, g);
    });
  return [...grupos.values()].map((g) => ({ ...g, factor: g.real / g.estimado }));
}

/** Multiplica por `factor` la duración de las tareas activas de la categoría (redondeada a 5 min, mínimo 5). Devuelve cuántas cambió. */
export function aplicarFactorADuraciones(listaTareas, categoriaId, factor) {
  let cambiadas = 0;
  listaTareas
    .filter((t) => t.tarea_estado !== 'completada' && (t.categoria_id || '') === categoriaId)
    .forEach((t) => {
      const nueva = Math.max(5, Math.round(((t.tarea_duracion_min || 15) * factor) / 5) * 5);
      if (nueva !== t.tarea_duracion_min) {
        t.tarea_duracion_min = nueva;
        cambiadas += 1;
      }
    });
  return cambiadas;
}
