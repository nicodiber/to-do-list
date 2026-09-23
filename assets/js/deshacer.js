// Deshacer/rehacer (Ctrl+Z / Ctrl+Shift+Z): una pila de fotos del estado completo, en memoria (se pierde al
// recargar), enganchada en el único punto de guardado de la app (`persistirYNotificar`). Deshacer simple, no por
// entidad: revierte toda la foto de las colecciones a como estaban antes de la última acción. Si mientras tanto
// llegó un cambio real de otro dispositivo, `invalidarHistorialDeshacer()` vacía las pilas para no pisarlo —
// deshacer nunca "cruza" un cambio remoto, pero las acciones locales nuevas de ahí en más vuelven a ser deshacibles.
//
// Import circular con `almacenamiento.js` (se usa solo dentro de funciones, nunca en la carga del módulo): mismo
// patrón ya aceptado en el proyecto entre `app.js` y `views/configuraciones.view.js`.
import { estado, persistirYNotificar } from './almacenamiento.js';
import { COLECCIONES, fotoColecciones } from './sincronizacion.js';

const MAX_PASOS = 20;

let pilaDeshacer = [];
let pilaRehacer = [];

/** Apila `foto` (una `fotoColecciones` ya clonada) como el paso al que volvería un "deshacer" ahora mismo. Una
 * acción nueva vacía cualquier "rehacer" pendiente (convención estándar de deshacer/rehacer). */
export function registrarPasoDeshacer(foto) {
  pilaDeshacer.push(foto);
  if (pilaDeshacer.length > MAX_PASOS) pilaDeshacer.shift();
  pilaRehacer = [];
}

/** Vacía las dos pilas: se llama cuando llega un cambio real de otro dispositivo, para no poder deshacer "a
 * través" de él. */
export function invalidarHistorialDeshacer() {
  pilaDeshacer = [];
  pilaRehacer = [];
}

export function puedeDeshacer() {
  return pilaDeshacer.length > 0;
}

export function puedeRehacer() {
  return pilaRehacer.length > 0;
}

function aplicarFoto(foto) {
  for (const cfg of COLECCIONES) estado[cfg.clave] = foto[cfg.clave] || [];
}

async function moverEntrePilas(origen, destino) {
  if (origen.length === 0) return;
  const foto = origen.pop();
  destino.push(fotoColecciones(estado));
  aplicarFoto(foto);
  await persistirYNotificar({ deshacer: false });
}

/** Vuelve al estado de antes de la última acción deshacible. No hace nada si no hay ninguna. */
export async function deshacer() {
  await moverEntrePilas(pilaDeshacer, pilaRehacer);
}

/** Vuelve a aplicar la última acción deshecha. No hace nada si no hay ninguna. */
export async function rehacer() {
  await moverEntrePilas(pilaRehacer, pilaDeshacer);
}
