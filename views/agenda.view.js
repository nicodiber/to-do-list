import { renderVistaAgenda } from '../assets/js/vista-agenda.js';

const CLAVE_LOCALSTORAGE = 'super-todo-list:agenda-dias';
const OPCIONES = [3, 8, 15];
const POR_DEFECTO = 8;

// Preferencia de UI (no un dato de la app): cuántos días muestra la Agenda. Mismo patrón que
// la ubicación actual y el tema: `localStorage`, con try/catch porque puede no estar disponible.
function leerDias() {
  try {
    const guardado = Number(localStorage.getItem(CLAVE_LOCALSTORAGE));
    return OPCIONES.includes(guardado) ? guardado : POR_DEFECTO;
  } catch {
    return POR_DEFECTO;
  }
}

function guardarDias(dias) {
  try {
    localStorage.setItem(CLAVE_LOCALSTORAGE, String(dias));
  } catch {
    // Solo es una preferencia: sin almacenamiento local se vuelve a la opción por defecto.
  }
}

/** Agenda: las tareas de los próximos 3, 8 o 15 días agrupadas por día (unifica las vistas "3 días" y "8 días"). */
export function renderVistaAgendaConSelector(contenedor) {
  renderVistaAgenda(contenedor, leerDias(), guardarDias);
}
