// Pruebas de la detección de links en la descripción (H03-A).
// Correr con: node --test pruebas/   (Node 22 o más nuevo; sin npm ni dependencias)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extraerLinks, etiquetaLink } from '../assets/js/links.js';

const hrefs = (texto) => extraerLinks(texto).map((l) => l.href);

test('detecta http y https', () => {
  assert.deepEqual(hrefs('mirar http://ejemplo.com/a y https://ejemplo.org/b'), ['http://ejemplo.com/a', 'https://ejemplo.org/b']);
});

test('detecta www. y le agrega https://', () => {
  assert.deepEqual(hrefs('entrar a www.ejemplo.com/ruta'), ['https://www.ejemplo.com/ruta']);
});

test('varios links en varias líneas, en orden', () => {
  assert.deepEqual(hrefs('uno https://a.com\ndos www.b.com\ntres http://c.com/x?y=1'), ['https://a.com', 'https://www.b.com', 'http://c.com/x?y=1']);
});

test('no incluye la puntuación final del texto', () => {
  assert.deepEqual(hrefs('ver https://a.com.'), ['https://a.com']);
  assert.deepEqual(hrefs('ver https://a.com/x, y www.b.com; o https://c.com!'), ['https://a.com/x', 'https://www.b.com', 'https://c.com']);
  assert.deepEqual(hrefs('(ver https://a.com/x)'), ['https://a.com/x']);
  assert.deepEqual(hrefs('(ver https://a.com/x).'), ['https://a.com/x']);
});

test('conserva el paréntesis si el link lo abre y lo cierra', () => {
  assert.deepEqual(hrefs('https://es.wikipedia.org/wiki/Foo_(bar)'), ['https://es.wikipedia.org/wiki/Foo_(bar)']);
});

test('texto sin links devuelve lista vacía', () => {
  assert.deepEqual(extraerLinks('comprar leche, pan.'), []);
  assert.deepEqual(extraerLinks(''), []);
  assert.deepEqual(extraerLinks(null), []);
  assert.deepEqual(extraerLinks('http://'), []);
});

test('no repite links duplicados', () => {
  assert.deepEqual(hrefs('https://a.com y de nuevo https://a.com, otra vez https://a.com.'), ['https://a.com']);
});

test('la etiqueta muestra dominio sin www. más la ruta, recortada si es larga', () => {
  assert.equal(etiquetaLink('https://www.ejemplo.com/'), 'ejemplo.com');
  assert.equal(etiquetaLink('https://ejemplo.com/a/b'), 'ejemplo.com/a/b');
  const larga = etiquetaLink('https://ejemplo.com/' + 'x'.repeat(100));
  assert.equal(larga.length, 40);
  assert.ok(larga.endsWith('…'));
});

test('el texto con HTML no se interpreta: el link se corta en < y >', () => {
  assert.deepEqual(hrefs('<a href=https://a.com>x</a>'), ['https://a.com']);
});
