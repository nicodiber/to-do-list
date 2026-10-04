// El rango de horas que se muestra en la grilla de Semana (y desde la v0.105.0 la «franja» global ya no existe: los
// horarios disponibles son bloques por día, ver `bloques-horarios.js`). Este módulo conserva `obtenerFranjaHoraria`, que
// ahora devuelve el rango visible: del inicio más temprano al fin más tarde de todos los bloques de la semana.

import { obtenerPreferencias } from './preferencias.js';
import { rangoVisible } from './bloques-horarios.js';

export function obtenerFranjaHoraria() {
  return rangoVisible(obtenerPreferencias());
}
