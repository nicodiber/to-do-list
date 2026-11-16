// Lógica pura del tema (H27): la elección del usuario puede ser 'claro', 'oscuro' o 'sistema' (seguir el tema del
// dispositivo). Sin elección guardada la app sigue abriéndose en oscuro, como siempre. El aplicado al documento y el
// guardado en `localStorage` viven en `app.js`.

export const ELECCIONES_TEMA = ['claro', 'oscuro', 'sistema', 'sol'];

/** Cualquier valor guardado → 'claro' | 'oscuro' | 'sistema' | 'sol'. Lo desconocido o ausente es 'oscuro'. */
export function normalizarEleccionTema(valor) {
  return ELECCIONES_TEMA.includes(valor) ? valor : 'oscuro';
}

/**
 * La elección + si el sistema está en oscuro (+ el sol de hoy, para 'sol') → el tema que se aplica: 'claro' | 'oscuro'.
 * `sol` = `{ ahora: Date, salida: 'YYYY-MM-DDTHH:MM', puesta: 'YYYY-MM-DDTHH:MM' }` (la salida y la puesta pueden faltar).
 */
export function resolverTema(eleccion, sistemaOscuro, sol = null) {
  const normalizada = normalizarEleccionTema(eleccion);
  if (normalizada === 'sistema') return sistemaOscuro ? 'oscuro' : 'claro';
  if (normalizada === 'sol') return temaPorSol(sol?.ahora || new Date(), sol?.salida, sol?.puesta);
  return normalizada;
}

// Sin datos de salida/puesta del sol (sin conexión o sin ubicación), un horario aproximado: claro de 7 a 20 h.
const HORA_CLARO_APROX = 7;
const HORA_OSCURO_APROX = 20;

function franjaDeLuz(ahora, salidaISO, puestaISO) {
  const salida = salidaISO ? new Date(salidaISO) : null;
  const puesta = puestaISO ? new Date(puestaISO) : null;
  if (salida && puesta && !Number.isNaN(salida.getTime()) && !Number.isNaN(puesta.getTime()) && puesta > salida) {
    // La salida y la puesta son de un día puntual: se usan sus horas para el día de `ahora`.
    const enHoy = (d) => new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), d.getHours(), d.getMinutes());
    return { desde: enHoy(salida), hasta: enHoy(puesta) };
  }
  return {
    desde: new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), HORA_CLARO_APROX),
    hasta: new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), HORA_OSCURO_APROX),
  };
}

/** H11 (v0.111.0): claro entre la salida y la puesta del sol, oscuro el resto del día. */
export function temaPorSol(ahora, salidaISO, puestaISO) {
  const { desde, hasta } = franjaDeLuz(ahora, salidaISO, puestaISO);
  return ahora >= desde && ahora < hasta ? 'claro' : 'oscuro';
}

/** Cuándo vuelve a cambiar el tema con 'sol' (la próxima salida o puesta; si ya pasaron las dos, la salida de mañana). */
export function proximoCambioPorSol(ahora, salidaISO, puestaISO) {
  const { desde, hasta } = franjaDeLuz(ahora, salidaISO, puestaISO);
  if (ahora < desde) return desde;
  if (ahora < hasta) return hasta;
  const manana = new Date(desde);
  manana.setDate(manana.getDate() + 1);
  return manana;
}
