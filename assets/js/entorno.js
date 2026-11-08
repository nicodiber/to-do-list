// Entorno en el que corre la app (v0.107.3, H16): la **app real** (GitHub Pages, rama `main`) o un **entorno de
// pruebas** (la URL de pruebas de `develop`, o cualquier copia local como `localhost`).
//
// Todas las copias de STDL publicadas en `nicodiber.github.io` comparten el mismo origen del navegador, así que sin
// esto la de pruebas usaría la misma base local (IndexedDB, con los cambios pendientes de la app real), el mismo
// archivo de Google Drive y las mismas preferencias. En pruebas todo lleva otro nombre (`PREFIJO_APP`), así nunca
// lee ni escribe los datos reales: para probar con datos reales se importa una copia de seguridad exportada.

const ubicacion = typeof location !== 'undefined' ? location : { hostname: '', pathname: '' }; // fuera del navegador (pruebas en Node) cuenta como pruebas
const ES_APP_REAL = ubicacion.hostname === 'nicodiber.github.io' && ubicacion.pathname.startsWith('/to-do-list/');

export const ES_PRUEBAS = !ES_APP_REAL;

/** Prefijo de todo lo que la app guarda: base local, claves de `localStorage` y archivo de Drive. */
export const PREFIJO_APP = ES_PRUEBAS ? 'super-todo-list-pruebas' : 'super-todo-list';
