// Pruebas de la lógica pura de repeticiones en día fijo (v0.107.2).
// Correr con: node --test pruebas/   (Node 22 o más nuevo; sin npm ni dependencias)
import { test } from 'node:test';
// La app usa `window.crypto` (del navegador) para los IDs; en Node se le da el mismo objeto.
globalThis.window ??= globalThis;
import assert from 'node:assert/strict';
import { primerDiaRepeticionDiaFijo, anclarRepeticionesDiaFijo, cambioReglaDiaFijo } from '../assets/js/tareas-logica.js';
import { crearTarea } from '../assets/js/modelos.js';

const diaFijoMes1FinDeSemana = () =>
  crearTarea({
    tarea_nombre: 'Update AEP depto',
    tarea_mantenimiento: true,
    tarea_mantenimiento_dia_fijo: { tipo: 'mes', dia: 1 },
    tarea_dias_habiles: [6, 0],
    tarea_fecha_inicio_habilitada: '2026-10-30',
    tarea_fecha_sugerida: '2026-11-07T14:30:00.000Z',
  });

test('el caso real: «día 1 de cada mes» en fin de semana cae el domingo 1/11, no el sábado 7/11', () => {
  const tarea = diaFijoMes1FinDeSemana();
  const cambiadas = anclarRepeticionesDiaFijo([tarea], '2026-10-30');
  assert.equal(cambiadas.length, 1);
  assert.equal(tarea.tarea_mantenimiento_objetivo, '2026-11-01');
  // La sugerida del 7/11 vuelve al 1/11, sin hora, para que el agendado le busque un hueco ese día.
  assert.equal(tarea.tarea_fecha_sugerida, '2026-11-01');
});

test('si la sugerida quedó antes del día que le toca, también pasa a ese día sin hora para que el agendado le busque hueco', () => {
  const tarea = diaFijoMes1FinDeSemana();
  tarea.tarea_fecha_sugerida = '2026-10-31T10:00:00.000Z';
  anclarRepeticionesDiaFijo([tarea], '2026-10-30');
  assert.equal(tarea.tarea_fecha_sugerida, '2026-11-01');
});

test('si hoy es el día fijo, el objetivo es hoy (inclusive)', () => {
  const tarea = diaFijoMes1FinDeSemana();
  tarea.tarea_fecha_inicio_habilitada = '';
  assert.equal(primerDiaRepeticionDiaFijo(tarea, '2026-11-01'), '2026-11-01');
});

test('los días hábiles mandan: día 1 de diciembre (martes) pasa al sábado 5', () => {
  const tarea = diaFijoMes1FinDeSemana();
  assert.equal(primerDiaRepeticionDiaFijo(tarea, '2026-11-08'), '2026-12-05');
});

test('días de la semana: «todos los lunes» desde un viernes cae el lunes siguiente', () => {
  const tarea = crearTarea({ tarea_nombre: 'x', tarea_mantenimiento: true, tarea_mantenimiento_dia_fijo: { tipo: 'semana', dias: [1] } });
  assert.equal(primerDiaRepeticionDiaFijo(tarea, '2026-10-30'), '2026-11-02');
});

test('no toca tareas con objetivo, con fecha límite, completadas, por intervalo o con 📌', () => {
  const conObjetivo = Object.assign(diaFijoMes1FinDeSemana(), { tarea_mantenimiento_objetivo: '2026-11-01' });
  const conLimite = Object.assign(diaFijoMes1FinDeSemana(), { tarea_fecha_limite: '2026-11-20' });
  const completada = Object.assign(diaFijoMes1FinDeSemana(), { tarea_estado: 'completada' });
  const porIntervalo = crearTarea({ tarea_nombre: 'y', tarea_mantenimiento: true, tarea_mantenimiento_intervalo: { cantidad: 1, unidad: 'dias' } });
  const fijada = Object.assign(diaFijoMes1FinDeSemana(), { tarea_fecha_fija: true, tarea_fecha_sugerida: '2099-10-31T10:00:00.000Z' });
  const copias = [conObjetivo, conLimite, completada, porIntervalo].map((t) => JSON.stringify(t));
  anclarRepeticionesDiaFijo([conObjetivo, conLimite, completada, porIntervalo, fijada], '2026-10-30');
  assert.deepEqual([conObjetivo, conLimite, completada, porIntervalo].map((t) => JSON.stringify(t)), copias);
  // La fijada recibe objetivo pero conserva su fecha y hora elegidas por el usuario.
  assert.equal(fijada.tarea_fecha_sugerida, '2099-10-31T10:00:00.000Z');
});

test('con «día obligatorio» el día también pasa a ser su límite, como en las copias', () => {
  const tarea = Object.assign(diaFijoMes1FinDeSemana(), { tarea_dia_obligatorio: true });
  anclarRepeticionesDiaFijo([tarea], '2026-10-30');
  assert.equal(tarea.tarea_fecha_limite, '2026-11-01');
});

test('es idempotente: correrlo dos veces no cambia nada la segunda', () => {
  const tarea = diaFijoMes1FinDeSemana();
  anclarRepeticionesDiaFijo([tarea], '2026-10-30');
  assert.equal(anclarRepeticionesDiaFijo([tarea], '2026-10-30').length, 0);
});

test('detecta cambio de regla de día fijo o de días hábiles', () => {
  const a = { tarea_mantenimiento_dia_fijo: { tipo: 'mes', dia: 1 }, tarea_dias_habiles: [6, 0] };
  assert.equal(cambioReglaDiaFijo(a, { ...a }), false);
  assert.equal(cambioReglaDiaFijo(a, { ...a, tarea_dias_habiles: [0, 6] }), false);
  assert.equal(cambioReglaDiaFijo(a, { ...a, tarea_mantenimiento_dia_fijo: { tipo: 'mes', dia: 15 } }), true);
  assert.equal(cambioReglaDiaFijo(a, { ...a, tarea_dias_habiles: [] }), true);
  assert.equal(cambioReglaDiaFijo(a, { ...a, tarea_mantenimiento_dia_fijo: null }), false);
});
