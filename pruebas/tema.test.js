import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarEleccionTema, resolverTema, temaPorSol, proximoCambioPorSol } from '../assets/js/tema.js';

test('normalizarEleccionTema: acepta las tres opciones y usa oscuro por defecto', () => {
  assert.equal(normalizarEleccionTema('claro'), 'claro');
  assert.equal(normalizarEleccionTema('oscuro'), 'oscuro');
  assert.equal(normalizarEleccionTema('sistema'), 'sistema');
  assert.equal(normalizarEleccionTema(null), 'oscuro');
  assert.equal(normalizarEleccionTema(undefined), 'oscuro');
  assert.equal(normalizarEleccionTema(''), 'oscuro');
  assert.equal(normalizarEleccionTema('violeta'), 'oscuro');
});

test('resolverTema: claro y oscuro ignoran al sistema', () => {
  assert.equal(resolverTema('claro', true), 'claro');
  assert.equal(resolverTema('claro', false), 'claro');
  assert.equal(resolverTema('oscuro', true), 'oscuro');
  assert.equal(resolverTema('oscuro', false), 'oscuro');
});

test('resolverTema: sistema sigue al dispositivo', () => {
  assert.equal(resolverTema('sistema', true), 'oscuro');
  assert.equal(resolverTema('sistema', false), 'claro');
});

test('resolverTema: sin elección es oscuro aunque el sistema esté en claro', () => {
  assert.equal(resolverTema(null, false), 'oscuro');
  assert.equal(resolverTema('raro', false), 'oscuro');
});

// H11 (v0.111.0): tema según el sol.
const enRosario = (h, m = 0) => new Date(2026, 10, 15, h, m);
test('sol: claro entre la salida y la puesta, oscuro fuera', () => {
  const salida = '2026-11-15T06:05';
  const puesta = '2026-11-15T19:58';
  assert.equal(temaPorSol(enRosario(6, 0), salida, puesta), 'oscuro');
  assert.equal(temaPorSol(enRosario(6, 5), salida, puesta), 'claro');
  assert.equal(temaPorSol(enRosario(13), salida, puesta), 'claro');
  assert.equal(temaPorSol(enRosario(19, 58), salida, puesta), 'oscuro');
  assert.equal(resolverTema('sol', true, { ahora: enRosario(13), salida, puesta }), 'claro');
  assert.equal(normalizarEleccionTema('sol'), 'sol');
});

test('sol: datos de otro día se aplican con sus horas al día de hoy', () => {
  assert.equal(temaPorSol(enRosario(6, 30), '2026-11-14T06:06', '2026-11-14T19:57'), 'claro');
});

test('sol: sin datos usa 7 a 20 h', () => {
  assert.equal(temaPorSol(enRosario(6, 59), '', ''), 'oscuro');
  assert.equal(temaPorSol(enRosario(7), null, undefined), 'claro');
  assert.equal(temaPorSol(enRosario(20), '', ''), 'oscuro');
});

test('sol: próximo cambio', () => {
  const salida = '2026-11-15T06:05';
  const puesta = '2026-11-15T19:58';
  assert.deepEqual(proximoCambioPorSol(enRosario(3), salida, puesta), enRosario(6, 5));
  assert.deepEqual(proximoCambioPorSol(enRosario(12), salida, puesta), enRosario(19, 58));
  assert.deepEqual(proximoCambioPorSol(enRosario(22), salida, puesta), new Date(2026, 10, 16, 6, 5));
});
