// Preferencias del usuario (tiempo disponible por día y cómo se lee Calendar). Son un dato más de la app: un único
// registro en `estado.preferencias` que se sincroniza con Drive, para que valgan en todos los dispositivos. Sin
// registro se usan los valores por defecto.

import { estado, persistirYNotificar } from './almacenamiento.js';
import { crearPreferencias, PREFERENCIAS_POR_DEFECTO } from './modelos.js';
import { hoyISO } from './utilidades.js';

// Antes de la Ronda 9b la franja horaria vivía solo en este dispositivo.
const CLAVE_FRANJA_VIEJA = 'super-todo-list:franja-horaria';

function franjaVieja() {
  try {
    const guardada = JSON.parse(localStorage.getItem(CLAVE_FRANJA_VIEJA));
    if (guardada && /^\d\d:\d\d$/.test(guardada.inicio) && /^\d\d:\d\d$/.test(guardada.fin)) return { inicio: guardada.inicio, fin: guardada.fin };
  } catch {
    // Sin franja guardada o ilegible: se usa la de por defecto.
  }
  return null;
}

/** Las preferencias vigentes (con los valores por defecto donde falte algo). Es una copia: para cambiarlas, `guardarPreferencias`. */
export function obtenerPreferencias() {
  const registro = estado.preferencias && estado.preferencias[0];
  if (registro) return structuredClone(registro);
  const propias = crearPreferencias();
  const vieja = franjaVieja();
  if (vieja) propias.pref_franja = vieja;
  return propias;
}

/** Cambia las preferencias indicadas (crea el registro la primera vez) y guarda. `opciones.sinNotificar`: no redibuja la vista actual. */
export async function guardarPreferencias(parcial, opciones = {}) {
  if (!estado.preferencias) estado.preferencias = [];
  let registro = estado.preferencias[0];
  if (!registro) {
    registro = { ...obtenerPreferencias() };
    estado.preferencias.push(registro);
    try {
      localStorage.removeItem(CLAVE_FRANJA_VIEJA);
    } catch {
      // Solo era una preferencia de este dispositivo.
    }
  }
  Object.assign(registro, parcial);
  // Las capacidades de fechas pasadas ya no sirven.
  const hoy = hoyISO();
  registro.pref_capacidad_por_fecha = Object.fromEntries(Object.entries(registro.pref_capacidad_por_fecha || {}).filter(([dia]) => dia >= hoy));
  await persistirYNotificar(opciones);
}

/** Fija (o, con `null`, quita) la capacidad de un día concreto, en minutos. */
export async function guardarCapacidadDeFecha(dia, minutos) {
  const actuales = { ...obtenerPreferencias().pref_capacidad_por_fecha };
  if (minutos === null || minutos === undefined) delete actuales[dia];
  else actuales[dia] = Math.max(0, Math.round(minutos));
  await guardarPreferencias({ pref_capacidad_por_fecha: actuales });
}

export { PREFERENCIAS_POR_DEFECTO };
