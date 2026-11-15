import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarEleccionTema, resolverTema } from '../assets/js/tema.js';

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
