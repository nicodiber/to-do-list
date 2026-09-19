// Almacenamiento local en IndexedDB, SOLO como apoyo de la sincronización con
// Google Drive (nunca como destino final de los datos):
// - `cache`: la última copia confirmada en Drive. Sirve de base para mezclar
//   con otros dispositivos y de copia de solo lectura cuando no hay conexión.
// - `pendiente`: el estado de trabajo con cambios que Drive todavía NO
//   confirmó. Se escribe en cada cambio (para que un cierre inesperado no
//   pierda nada) y se borra únicamente cuando Drive confirma el guardado.
// - `avisos`: avisos de sincronización (ej. conflictos) que el usuario todavía
//   no descartó.
// Cada función falla en silencio devolviendo `null`/`false`: si IndexedDB no
// está disponible (ej. ventana privada), la app sigue funcionando en memoria
// y `hayAlmacenamientoLocal()` permite avisarle al usuario.

const NOMBRE_BD = 'super-todo-list';
const VERSION_BD = 2;
const ALMACENES = ['cache', 'pendiente', 'avisos'];
const CLAVE = 'principal';

let disponible = true;
let promesaBD = null;

export function hayAlmacenamientoLocal() {
  return disponible;
}

function abrirBD() {
  if (promesaBD) return promesaBD;
  promesaBD = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB no disponible'));
      return;
    }
    const peticion = indexedDB.open(NOMBRE_BD, VERSION_BD);
    peticion.onupgradeneeded = () => {
      const bd = peticion.result;
      // La versión 1 guardaba el handle de la carpeta local (modo carpeta,
      // eliminado): se descarta.
      if (bd.objectStoreNames.contains('handles')) bd.deleteObjectStore('handles');
      for (const almacen of ALMACENES) {
        if (!bd.objectStoreNames.contains(almacen)) bd.createObjectStore(almacen);
      }
    };
    peticion.onsuccess = () => resolve(peticion.result);
    peticion.onerror = () => reject(peticion.error);
  }).catch((error) => {
    disponible = false;
    console.warn('No se pudo abrir el almacenamiento local:', error);
    throw error;
  });
  return promesaBD;
}

async function operar(almacen, modo, accion) {
  try {
    const bd = await abrirBD();
    return await new Promise((resolve, reject) => {
      const tx = bd.transaction(almacen, modo);
      const peticion = accion(tx.objectStore(almacen));
      tx.oncomplete = () => resolve(peticion ? peticion.result : true);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch (error) {
    disponible = false;
    console.warn(`No se pudo usar el almacenamiento local (${almacen}):`, error);
    return null;
  }
}

export async function leerCache() {
  return (await operar('cache', 'readonly', (a) => a.get(CLAVE))) || null;
}

export async function guardarCache(cache) {
  return operar('cache', 'readwrite', (a) => a.put(cache, CLAVE));
}

export async function leerPendiente() {
  return (await operar('pendiente', 'readonly', (a) => a.get(CLAVE))) || null;
}

export async function guardarPendiente(pendiente) {
  return operar('pendiente', 'readwrite', (a) => a.put(pendiente, CLAVE));
}

export async function borrarPendiente() {
  return operar('pendiente', 'readwrite', (a) => a.delete(CLAVE));
}

export async function leerAvisos() {
  return (await operar('avisos', 'readonly', (a) => a.get(CLAVE))) || [];
}

export async function guardarAvisos(avisos) {
  return operar('avisos', 'readwrite', (a) => a.put(avisos, CLAVE));
}
