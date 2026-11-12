// Pruebas del buscador (H02-B, paleta rápida): normalización, orden, tope y resaltado.
// Correr con: node --test pruebas/   (Node 22 o más nuevo; sin npm ni dependencias)
globalThis.window ??= globalThis;
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarTexto, buscarTareas, buscarModulos, partirResaltado, fechaCorta, MAX_TAREAS_BUSCADOR } from '../assets/js/buscador.js';

const t = (nombre, extra = {}) => ({ tarea_id: nombre, tarea_nombre: nombre, tarea_estado: 'pendiente', ...extra });
const nombres = (r) => r.resultados.map((x) => x.tarea.tarea_nombre);

test('normalizarTexto quita acentos y mayúsculas', () => {
  assert.equal(normalizarTexto('Categoría'), 'categoria');
  assert.equal(normalizarTexto('ÑANDÚ Éxito'), 'nandu exito');
  assert.equal(normalizarTexto(null), '');
});

test('«aep» encuentra «Update AEP depto» y «categoria» encuentra «Categoría»', () => {
  assert.deepEqual(nombres(buscarTareas([t('Update AEP depto'), t('Otra')], 'aep')), ['Update AEP depto']);
  assert.deepEqual(nombres(buscarTareas([t('Revisar Categoría')], 'CATEGORIA')), ['Revisar Categoría']);
});

test('texto vacío o de espacios no devuelve tareas', () => {
  assert.equal(buscarTareas([t('a')], '').resultados.length, 0);
  assert.equal(buscarTareas([t('a')], '   ').total, 0);
});

test('las que empiezan con el texto van antes que las que lo contienen', () => {
  const r = buscarTareas([t('Llamar a Pedro'), t('Pedro llama'), t('A Pedro')], 'pedro');
  assert.deepEqual(nombres(r), ['Pedro llama', 'A Pedro', 'Llamar a Pedro']);
  assert.equal(r.resultados[0].empieza, true);
});

test('las completadas van al final aunque empiecen con el texto', () => {
  const r = buscarTareas([t('Pagar luz', { tarea_estado: 'completada' }), t('Ya pagar luz'), t('Pagar gas')], 'pagar');
  assert.deepEqual(nombres(r), ['Pagar gas', 'Ya pagar luz', 'Pagar luz']);
});

test('desempata por fecha sugerida más próxima, sin fecha al final', () => {
  const r = buscarTareas(
    [t('Tarea c'), t('Tarea b', { tarea_fecha_sugerida: '2026-12-05' }), t('Tarea a', { tarea_fecha_sugerida: '2026-12-01T15:00:00.000Z' })],
    'tarea'
  );
  assert.deepEqual(nombres(r), ['Tarea a', 'Tarea b', 'Tarea c']);
});

test('tope de 20 tareas con el resto contado', () => {
  const muchas = Array.from({ length: 27 }, (_, i) => t(`Tarea ${String(i).padStart(2, '0')}`));
  const r = buscarTareas(muchas, 'tarea');
  assert.equal(MAX_TAREAS_BUSCADOR, 20);
  assert.equal(r.resultados.length, 20);
  assert.equal(r.restantes, 7);
  assert.equal(r.total, 27);
});

test('adjunta la categoría de cada tarea', () => {
  const cat = { categoria_id: 'c1', categoria_nombre: 'Trabajo', categoria_color: '#ff0000' };
  const r = buscarTareas([t('Informe', { categoria_id: 'c1' }), t('Informe 2')], 'informe', [cat]);
  assert.equal(r.resultados[0].categoria, cat);
  assert.equal(r.resultados[1].categoria, null);
});

test('buscarModulos: por nombre sin acentos, todos con texto vacío', () => {
  const modulos = [
    { clave: 'resumen', etiqueta: '📌 Resumen' },
    { clave: 'estadisticas', etiqueta: '📈 Estadísticas' },
    { clave: 'categorias', etiqueta: '🗂️ Categorías' },
    { clave: 'memento', etiqueta: '⏳ Memento mori' },
  ];
  assert.equal(buscarModulos(modulos, '').length, 4);
  assert.deepEqual(buscarModulos(modulos, 'estadist').map((m) => m.clave), ['estadisticas']);
  assert.deepEqual(buscarModulos(modulos, 'CATEGORIA').map((m) => m.nombre), ['Categorías']);
  // «es» empieza «Estadísticas» y está dentro de «Resumen»: primero el que empieza.
  assert.deepEqual(buscarModulos(modulos, 'es').map((m) => m.clave), ['estadisticas', 'resumen']);
  assert.equal(buscarModulos(modulos, 'zzz').length, 0);
  assert.equal(buscarModulos(modulos, 'memento')[0].emoji, '⏳');
});

test('partirResaltado marca la coincidencia sobre el texto original (con acentos)', () => {
  assert.deepEqual(partirResaltado('Revisar Categoría hoy', 'categoria'), [
    { texto: 'Revisar ', coincide: false },
    { texto: 'Categoría', coincide: true },
    { texto: ' hoy', coincide: false },
  ]);
  assert.deepEqual(partirResaltado('Update AEP depto', 'aep')[1], { texto: 'AEP', coincide: true });
  assert.deepEqual(partirResaltado('Hola', 'zz'), [{ texto: 'Hola', coincide: false }]);
  assert.deepEqual(partirResaltado('Hola', ''), [{ texto: 'Hola', coincide: false }]);
  // Letra con tilde al principio y texto con HTML: el escape lo hace quien dibuja, acá solo se parte.
  assert.deepEqual(partirResaltado('Ñandú <b>', 'nandu'), [
    { texto: 'Ñandú', coincide: true },
    { texto: ' <b>', coincide: false },
  ]);
});

test('fechaCorta: día de la semana y día/mes', () => {
  assert.equal(fechaCorta('2026-12-05'), 'sáb 5/12');
  assert.equal(fechaCorta(''), '');
  assert.equal(fechaCorta(null), '');
});
