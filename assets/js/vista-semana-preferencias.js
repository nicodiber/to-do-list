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

// Interruptor "🌅 Sol" (amanecer/atardecer) y filtro de degradé (ninguno/temperatura/lluvia) — v0.79.0, mismo
// patrón de preferencia de UI en `localStorage` que la cantidad de días.
// v0.103.0: por defecto «Sol» y «Lluvia» vienen activados. Las claves son nuevas (`-v2`) para que el cambio de valores por
// defecto también le llegue a quien ya había guardado «apagado»/«ninguno» con la versión anterior.
const CLAVE_MOSTRAR_SOL = 'super-todo-list:semana-mostrar-sol-v2';
const CLAVE_FILTRO_CLIMA = 'super-todo-list:semana-filtro-clima-v2';
export const FILTROS_CLIMA = ['ninguno', 'temperatura', 'lluvia'];

export function leerMostrarSol() {
  try {
    const guardado = localStorage.getItem(CLAVE_MOSTRAR_SOL);
    return guardado === null ? true : guardado === '1';
  } catch {
    return true;
  }
}

export function guardarMostrarSol(activo) {
  try {
    localStorage.setItem(CLAVE_MOSTRAR_SOL, activo ? '1' : '0');
  } catch {
    // Solo es una preferencia: sin almacenamiento local vuelve a estar activado.
  }
}

export function leerFiltroClima() {
  try {
    const guardado = localStorage.getItem(CLAVE_FILTRO_CLIMA);
    return FILTROS_CLIMA.includes(guardado) ? guardado : 'lluvia';
  } catch {
    return 'lluvia';
  }
}

export function guardarFiltroClima(filtro) {
  try {
    localStorage.setItem(CLAVE_FILTRO_CLIMA, filtro);
  } catch {
    // Solo es una preferencia: sin almacenamiento local vuelve a «lluvia».
  }
}
