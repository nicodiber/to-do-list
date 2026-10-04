// Cronómetro por tarea (v0.106.0): ▶ al empezar a hacerla, ⏹ al parar. Mide el tiempo real sin tener que acordarse: al
// completar la tarea, el tiempo medido se anota solo como «tiempo real» del cumplimiento (alimenta Estadísticas → estimado
// vs. real). El tiempo se guarda en la tarea (`tarea_cronometro_inicio` mientras corre, `tarea_tiempo_acumulado_min` lo ya
// parado), así que sobrevive a cerrar la pestaña o cambiar de dispositivo. Lógica pura: persistir es cosa de quien llama.

/** ¿El cronómetro de la tarea está corriendo? */
export function cronometroCorriendo(tarea) {
  return !!tarea.tarea_cronometro_inicio;
}

/** Minutos medidos hasta ahora (lo acumulado más el tramo en curso), con decimales. */
export function tiempoMedidoMinutos(tarea, ahoraMs = Date.now()) {
  const acumulado = tarea.tarea_tiempo_acumulado_min || 0;
  if (!tarea.tarea_cronometro_inicio) return acumulado;
  const tramo = (ahoraMs - new Date(tarea.tarea_cronometro_inicio).getTime()) / 60000;
  return acumulado + (Number.isFinite(tramo) && tramo > 0 ? tramo : 0);
}

/** Pone en marcha el cronómetro de la tarea (si no corría). */
export function iniciarCronometro(tarea) {
  if (!tarea.tarea_cronometro_inicio) tarea.tarea_cronometro_inicio = new Date().toISOString();
}

/** Para el cronómetro y suma el tramo a lo acumulado. */
export function detenerCronometro(tarea) {
  if (!tarea.tarea_cronometro_inicio) return;
  tarea.tarea_tiempo_acumulado_min = tiempoMedidoMinutos(tarea);
  tarea.tarea_cronometro_inicio = null;
}

/** «1 h 05 min», «12 min» o «<1 min». */
export function formatearMinutosMedidos(minutos) {
  const total = Math.floor(minutos);
  if (total < 1) return '<1 min';
  const horas = Math.floor(total / 60);
  const resto = total % 60;
  return horas > 0 ? `${horas} h ${String(resto).padStart(2, '0')} min` : `${resto} min`;
}
