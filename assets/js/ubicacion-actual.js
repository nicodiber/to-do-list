// Preferencia de UI compartida entre vistas (Hoy, Tareas, 3/8 días): qué
// ubicación está "activa" para filtrar tareas. Vive en localStorage bajo
// una clave propia (no en `estado`) porque es una preferencia de sesión,
// no un dato de la app — no debe sincronizarse vía Drive/carpeta local.
// Mismo patrón ya usado para el tema claro/oscuro (assets/js/app.js).
const CLAVE_LOCALSTORAGE = 'super-todo-list:ubicacion-actual';

export function obtenerUbicacionActual() {
  try {
    return localStorage.getItem(CLAVE_LOCALSTORAGE) || '';
  } catch {
    return '';
  }
}

export function establecerUbicacionActual(idUbicacion) {
  try {
    localStorage.setItem(CLAVE_LOCALSTORAGE, idUbicacion);
  } catch (error) {
    console.warn('No se pudo guardar la ubicación actual:', error);
  }
}
