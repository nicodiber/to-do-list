// La franja del día en que se pueden proponer horarios y en que cuenta el tiempo libre. Desde la Ronda 9b vive en las
// preferencias (`preferencias.js`, sincronizadas con Drive); este módulo conserva la API de antes.

import { obtenerPreferencias, guardarPreferencias } from './preferencias.js';

/** Por defecto se puede agendar a cualquier hora del día. */
export const FRANJA_POR_DEFECTO = { inicio: '00:00', fin: '24:00' };

/** Horas ofrecidas en Configuraciones, cada 30 minutos: de 00:00 a 24:00. */
export const HORAS_FRANJA = Array.from({ length: 49 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 === 0 ? '00' : '30'}`);

function aMinutos(hhmm) {
  const [horas, minutos] = String(hhmm).split(':').map(Number);
  return horas * 60 + minutos;
}

function esFranjaValida(franja) {
  return (
    !!franja &&
    HORAS_FRANJA.includes(franja.inicio) &&
    HORAS_FRANJA.includes(franja.fin) &&
    aMinutos(franja.inicio) < aMinutos(franja.fin)
  );
}

export function obtenerFranjaHoraria() {
  const franja = obtenerPreferencias().pref_franja;
  return esFranjaValida(franja) ? { inicio: franja.inicio, fin: franja.fin } : { ...FRANJA_POR_DEFECTO };
}

/** Guarda la franja. Devuelve `false` (sin guardar) si el inicio no es anterior al fin. */
export function establecerFranjaHoraria(franja) {
  if (!esFranjaValida(franja)) return false;
  guardarPreferencias({ pref_franja: { inicio: franja.inicio, fin: franja.fin } }, { sinNotificar: true });
  return true;
}
