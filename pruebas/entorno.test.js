// La app real y la copia de pruebas nunca deben compartir base local, archivo de Drive ni caché (v0.107.3, H16).
import { test } from 'node:test';
import assert from 'node:assert/strict';

async function entornoEn(hostname, pathname) {
  globalThis.location = { hostname, pathname };
  return import(`../assets/js/entorno.js?${hostname}${pathname}`);
}

test('la app real (GitHub Pages /to-do-list/) conserva los nombres de siempre', async () => {
  const e = await entornoEn('nicodiber.github.io', '/to-do-list/index.html');
  assert.equal(e.ES_PRUEBAS, false);
  assert.equal(e.PREFIJO_APP, 'super-todo-list');
});

test('la URL de pruebas, localhost o cualquier otra copia usan otros nombres', async () => {
  for (const [h, p] of [['nicodiber.github.io', '/to-do-list-pruebas/'], ['localhost', '/'], ['127.0.0.1', '/to-do-list/']]) {
    const e = await entornoEn(h, p);
    assert.equal(e.ES_PRUEBAS, true, `${h}${p}`);
    assert.equal(e.PREFIJO_APP, 'super-todo-list-pruebas');
  }
});
