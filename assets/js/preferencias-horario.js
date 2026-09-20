// Preferencia de UI: en qué franja del día se buscan horarios libres (botón "Al próximo hueco libre"
// de Hoy). Vive en localStorage (no en `estado`) porque es una preferencia de este dispositivo, no un
// dato de la app: mismo patrón que la ubicación actual y el tema.
const CLAVE_LOCALSTORAGE = 'super-todo-list:franja-horaria';

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
  try {
    const guardada = JSON.parse(localStorage.getItem(CLAVE_LOCALSTORAGE));
    if (esFranjaValida(guardada)) return { inicio: guardada.inicio, fin: guardada.fin };
  } catch {
    // Sin preferencia guardada o ilegible: se usa la de por defecto.
  }
  return { ...FRANJA_POR_DEFECTO };
}

/** Guarda la franja. Devuelve `false` (sin guardar) si el inicio no es anterior al fin. */
export function establecerFranjaHoraria(franja) {
  if (!esFranjaValida(franja)) return false;
  try {
    localStorage.setItem(CLAVE_LOCALSTORAGE, JSON.stringify({ inicio: franja.inicio, fin: franja.fin }));
  } catch (error) {
    console.warn('No se pudo guardar la franja horaria:', error);
  }
  return true;
}
