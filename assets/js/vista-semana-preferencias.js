// Preferencia de UI (no un dato de la app): cuántos días muestra la vista Semana. Mismo patrón que Agenda
// (`vista-agenda.js`): `localStorage`, con try/catch porque puede no estar disponible.
const CLAVE_LOCALSTORAGE = 'super-todo-list:semana-dias';
export const OPCIONES_DIAS_SEMANA = [1, 3, 7, 8, 15];
const POR_DEFECTO = 8;

export function leerDiasSemana() {
  try {
    const guardado = Number(localStorage.getItem(CLAVE_LOCALSTORAGE));
    return OPCIONES_DIAS_SEMANA.includes(guardado) ? guardado : POR_DEFECTO;
  } catch {
    return POR_DEFECTO;
  }
}

export function guardarDiasSemana(dias) {
  try {
    localStorage.setItem(CLAVE_LOCALSTORAGE, String(dias));
  } catch {
    // Solo es una preferencia: sin almacenamiento local se vuelve a la opción por defecto.
  }
}
