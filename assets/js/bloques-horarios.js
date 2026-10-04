// Horarios disponibles por día de la semana (v0.105.0): uno o varios bloques «de qué hora a qué hora» en cada día. Reemplazan
// a la franja horaria global y al tope de minutos por día: el tiempo disponible de un día es la suma de sus bloques (menos lo
// que ocupen los eventos de Calendar) y el agendado solo propone horarios dentro de ellos. Lógica pura, sin DOM.
//
// `pref_bloques_dias` es un arreglo de 7 listas (índice = día de la semana, 0 = domingo) de `{ inicio, fin }` en «HH:MM»
// (el fin puede ser «24:00»). Por defecto cada día tiene un solo bloque de 00:00 a 24:00. Una lista vacía = día sin
// tiempo disponible. Sin `pref_bloques_dias` (datos de antes de la v0.105.0) se derivan de la franja y los topes viejos.

import { minutosDeHHMM } from './utilidades.js';

export const BLOQUE_DIA_COMPLETO = { inicio: '00:00', fin: '24:00' };

/** Horas que se pueden elegir, cada 30 minutos: de 00:00 a 24:00. */
export const HORAS_BLOQUE = Array.from({ length: 49 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 === 0 ? '00' : '30'}`);

const aMinutos = (hhmm) => minutosDeHHMM(hhmm);

function esBloqueValido(bloque) {
  return !!bloque && HORAS_BLOQUE.includes(bloque.inicio) && HORAS_BLOQUE.includes(bloque.fin) && aMinutos(bloque.inicio) < aMinutos(bloque.fin);
}

/** Ordena por hora de inicio y devuelve copias. */
export function ordenarBloques(bloques) {
  return (bloques || []).map((b) => ({ inicio: b.inicio, fin: b.fin })).sort((a, b) => aMinutos(a.inicio) - aMinutos(b.inicio));
}

/**
 * Valida los bloques de un día: cada uno con inicio anterior al fin (en pasos de 30 min), sin que se pisen ni se
 * concatenen (si uno termina justo cuando empieza otro, tienen que ser un solo bloque) y sin pasar de las 24 h.
 * Devuelve `{ ok: true }` o `{ ok: false, motivo }`.
 */
export function validarBloquesDia(bloques) {
  const lista = ordenarBloques(bloques);
  for (const b of lista) {
    if (!esBloqueValido(b)) return { ok: false, motivo: `El bloque ${b.inicio}–${b.fin} no es válido: «desde» tiene que ser anterior a «hasta».` };
  }
  for (let i = 1; i < lista.length; i += 1) {
    const anterior = lista[i - 1];
    const actual = lista[i];
    if (aMinutos(actual.inicio) < aMinutos(anterior.fin)) {
      return { ok: false, motivo: `Los bloques ${anterior.inicio}–${anterior.fin} y ${actual.inicio}–${actual.fin} se pisan.` };
    }
    if (aMinutos(actual.inicio) === aMinutos(anterior.fin)) {
      return { ok: false, motivo: `Los bloques ${anterior.inicio}–${anterior.fin} y ${actual.inicio}–${actual.fin} están pegados: unilos en un solo bloque (${anterior.inicio}–${actual.fin}).` };
    }
  }
  const total = lista.reduce((suma, b) => suma + aMinutos(b.fin) - aMinutos(b.inicio), 0);
  if (total > 24 * 60) return { ok: false, motivo: 'Los bloques de un día no pueden sumar más de 24 horas.' };
  return { ok: true };
}

/**
 * Los bloques de cada día de la semana (índice 0 = domingo). Con `pref_bloques_dias` guardados se usan (si alguno es
 * inválido, ese día vuelve al día completo); si no, se derivan de la franja y los topes de antes: el bloque arranca al
 * inicio de la franja y dura el tope del día (sin pasar del fin de la franja); un tope de 0 deja el día sin bloques.
 */
export function bloquesDeSemana(preferencias) {
  const guardados = preferencias && preferencias.pref_bloques_dias;
  if (Array.isArray(guardados) && guardados.length === 7) {
    return guardados.map((bloques) => (Array.isArray(bloques) && validarBloquesDia(bloques).ok ? ordenarBloques(bloques) : [{ ...BLOQUE_DIA_COMPLETO }]));
  }
  const franja = preferencias && preferencias.pref_franja && esBloqueValido(preferencias.pref_franja) ? preferencias.pref_franja : BLOQUE_DIA_COMPLETO;
  const topes = (preferencias && preferencias.pref_tope_dias) || [];
  const inicio = aMinutos(franja.inicio);
  const fin = aMinutos(franja.fin);
  return Array.from({ length: 7 }, (_, d) => {
    const tope = Number.isFinite(topes[d]) ? topes[d] : 24 * 60;
    if (tope <= 0) return [];
    const duracion = Math.min(tope, fin - inicio);
    const aHHMM = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    // Los topes viejos no eran múltiplos de 30: se redondea hacia arriba para caer en una hora elegible.
    const finBloque = Math.min(fin, inicio + Math.ceil(duracion / 30) * 30);
    return [{ inicio: franja.inicio, fin: aHHMM(finBloque) }];
  });
}

/** Los bloques del día `YYYY-MM-DD` (según su día de la semana). */
export function bloquesDelDia(preferencias, diaISO) {
  return bloquesDeSemana(preferencias)[new Date(`${diaISO}T00:00:00`).getDay()];
}

/** Minutos que suman unos bloques. */
export function minutosDeBloques(bloques) {
  return bloques.reduce((suma, b) => suma + aMinutos(b.fin) - aMinutos(b.inicio), 0);
}

/**
 * El rango de horas que conviene mostrar en la grilla de Semana: desde el inicio más temprano hasta el fin más tarde de
 * todos los bloques de la semana (`{ inicio, fin }`), o el día completo si no hay ninguno.
 */
export function rangoVisible(preferencias) {
  const todos = bloquesDeSemana(preferencias).flat();
  if (todos.length === 0) return { ...BLOQUE_DIA_COMPLETO };
  const inicio = Math.min(...todos.map((b) => aMinutos(b.inicio)));
  const fin = Math.max(...todos.map((b) => aMinutos(b.fin)));
  const aHHMM = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  return { inicio: aHHMM(inicio), fin: aHHMM(fin) };
}

/** Los tramos NO disponibles de un día dentro de `[desdeMin, hastaMin]` (para sombrearlos en la grilla), en minutos del día. */
export function tramosFueraDeBloques(bloques, desdeMin, hastaMin) {
  const lista = ordenarBloques(bloques);
  const tramos = [];
  let cursor = desdeMin;
  lista.forEach((b) => {
    const i = Math.max(desdeMin, aMinutos(b.inicio));
    const f = Math.min(hastaMin, aMinutos(b.fin));
    if (f <= desdeMin || i >= hastaMin) return;
    if (i > cursor) tramos.push([cursor, i]);
    cursor = Math.max(cursor, f);
  });
  if (cursor < hastaMin) tramos.push([cursor, hastaMin]);
  return tramos;
}
