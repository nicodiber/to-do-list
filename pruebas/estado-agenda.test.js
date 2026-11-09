// H15-B: la agenda se marca «reorganizando» solo si tarda más que la demora, cuenta pasos y siempre termina.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conReorganizacion, estadoAgenda, pasoAgendaHecho, suscribirAgenda } from '../assets/js/estado-agenda.js';

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

test('una reorganización corta no llega a mostrarse (sin parpadeo)', async () => {
  const vistos = [];
  const quitar = suscribirAgenda((e) => vistos.push(e.reorganizando));
  await conReorganizacion(async () => esperar(50));
  await esperar(500);
  quitar();
  assert.deepEqual(vistos, []);
  assert.equal(estadoAgenda().reorganizando, false);
});

test('una larga se muestra con su progreso y al terminar vuelve a «al día»', async () => {
  const vistos = [];
  const quitar = suscribirAgenda((e) => vistos.push(`${e.reorganizando}:${e.hechos}/${e.total}`));
  await conReorganizacion(async () => {
    await esperar(450);
    pasoAgendaHecho();
    pasoAgendaHecho();
    assert.deepEqual(estadoAgenda(), { reorganizando: true, hechos: 2, total: 6 });
  }, 6);
  quitar();
  assert.deepEqual(vistos, ['true:0/6', 'true:1/6', 'true:2/6', 'false:0/0']);
});

test('si la reorganización falla, igual se termina', async () => {
  await assert.rejects(conReorganizacion(async () => { await esperar(450); throw new Error('sin red'); }, 3));
  assert.equal(estadoAgenda().reorganizando, false);
});

test('anidadas: sigue «reorganizando» hasta que terminan todas', async () => {
  let interna;
  await conReorganizacion(async () => {
    await esperar(450);
    await conReorganizacion(async () => esperar(10));
    interna = estadoAgenda().reorganizando;
  });
  assert.equal(interna, true);
  assert.equal(estadoAgenda().reorganizando, false);
});
