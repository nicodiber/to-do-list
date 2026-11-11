// Estado de la agenda (v0.108.0, H15-B): si el sistema está reorganizando horarios en este momento (agendado inicial,
// refresco de Calendar cada 5 minutos, agendado en segundo plano), cuántos pasos lleva y cuántos son. La cabecera lo
// muestra en su propio renglón («Agenda: reorganizando 3/6» / «Agenda: al día»), separado del estado de Drive, para que
// «guardado en Drive» no se lea como «ya no se va a mover nada».
//
// Para no parpadear cada 5 minutos con reorganizaciones que terminan enseguida, el aviso recién aparece si la
// reorganización dura más de `DEMORA_AVISO_MS`; al terminar se avisa al instante.

const DEMORA_AVISO_MS = 400;

let activas = 0;
let pasos = { hechos: 0, total: 0 };
let visible = false;
let temporizador = null;
const oyentes = new Set();

function notificar() {
  oyentes.forEach((fn) => {
    try {
      fn(estadoAgenda());
    } catch {
      // Un oyente roto no frena a los demás.
    }
  });
}

/** `{ reorganizando, hechos, total }`. `reorganizando` es `true` solo cuando ya se muestra (pasó la demora). */
export function estadoAgenda() {
  return { reorganizando: visible && activas > 0, hechos: pasos.hechos, total: pasos.total };
}

export function suscribirAgenda(fn) {
  oyentes.add(fn);
  return () => oyentes.delete(fn);
}

function empezar(total) {
  activas += 1;
  if (total > 0 && activas === 1) pasos = { hechos: 0, total };
  if (!visible && !temporizador) {
    temporizador = setTimeout(() => {
      temporizador = null;
      if (activas > 0) {
        visible = true;
        notificar();
      }
    }, DEMORA_AVISO_MS);
  }
}

function terminar() {
  activas = Math.max(0, activas - 1);
  if (activas > 0) return;
  pasos = { hechos: 0, total: 0 };
  if (temporizador) {
    clearTimeout(temporizador);
    temporizador = null;
  }
  if (visible) {
    visible = false;
    notificar();
  }
}

/** Suma un paso hecho a la reorganización en curso (para el «3/6»). */
export function pasoAgendaHecho() {
  if (activas === 0 || pasos.total === 0) return;
  pasos.hechos = Math.min(pasos.total, pasos.hechos + 1);
  if (visible) notificar();
}

/**
 * Corre `fn` marcando la agenda como «reorganizando» hasta que termine (incluido el guardado que haga `fn`).
 * `totalPasos` (opcional) habilita el contador «N/total» con `pasoAgendaHecho()`. Se pueden anidar.
 */
export async function conReorganizacion(fn, totalPasos = 0) {
  empezar(totalPasos);
  try {
    return await fn();
  } finally {
    terminar();
  }
}

/**
 * Versión manual de `conReorganizacion`, para flujos que tienen que soltar la marca antes de terminar (por ejemplo,
 * antes de mostrar un aviso que espera al usuario). Devuelve la función que la termina; llamarla de más no hace nada.
 */
export function iniciarReorganizacion(totalPasos = 0) {
  empezar(totalPasos);
  let terminada = false;
  return () => {
    if (terminada) return;
    terminada = true;
    terminar();
  };
}
