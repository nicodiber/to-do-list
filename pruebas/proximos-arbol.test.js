// H05 (v0.109.0): «Próximos por categoría» en árbol, con la mejor tarea de cada rama.
globalThis.window ??= globalThis;
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arbolProximosPorCategoria } from '../assets/js/tareas-logica.js';
import { crearTarea, crearCategoria } from '../assets/js/modelos.js';

const cat = (id, nombre, padre = null, prioridad = 0) => ({ ...crearCategoria({ categoria_nombre: nombre, categoria_padre_id: padre, categoria_prioridad: prioridad }), categoria_id: id });
const categorias = [cat('t', 'Trabajo', null, 1), cat('s', 'SINET', 't', 0), cat('tdc', 'TdC', 's', 0), cat('isi', 'ISI', null, 0), cat('bd2', 'BD2', 'isi', 0), cat('mw', 'MW', 'isi', 1), cat('vacia', 'Sin tareas', 'isi', 2)];
const tarea = (nombre, categoria_id, limite = '') => crearTarea({ tarea_nombre: nombre, categoria_id, tarea_fecha_limite: limite });

test('una fila por raíz, en orden de jerarquía, con la mejor de toda su rama', () => {
  const t = [tarea('Entrega 3', 'bd2', '2026-11-20'), tarea('Entregables', 'mw', '2026-12-01'), tarea('Cursograma', 'tdc', '2026-11-15')];
  const arbol = arbolProximosPorCategoria(t, categorias);
  assert.deepEqual(arbol.map((r) => r.categoria.categoria_nombre), ['ISI', 'Trabajo']);
  assert.equal(arbol[0].tarea.tarea_nombre, 'Entrega 3');
  assert.equal(arbol[1].tarea.tarea_nombre, 'Cursograma'); // viene de un nieto (TdC)
});

test('subcategorías de cualquier nivel, en profundidad, solo las que tienen tareas; la tarea se puede repetir (P38-A)', () => {
  const t = [tarea('Entrega 3', 'bd2'), tarea('Entregables', 'mw'), tarea('Cursograma', 'tdc')];
  const arbol = arbolProximosPorCategoria(t, categorias);
  assert.deepEqual(arbol[0].hijos.map((h) => [h.categoria.categoria_nombre, h.nivel]), [['BD2', 1], ['MW', 1]]);
  assert.deepEqual(arbol[1].hijos.map((h) => [h.categoria.categoria_nombre, h.nivel, h.tarea.tarea_nombre]), [['SINET', 1, 'Cursograma'], ['TdC', 2, 'Cursograma']]);
});

test('ignora completadas, bloqueadas y raíces sin tareas', () => {
  const hecha = Object.assign(tarea('Hecha', 'bd2'), { tarea_estado: 'completada' });
  assert.deepEqual(arbolProximosPorCategoria([hecha], categorias), []);
});
