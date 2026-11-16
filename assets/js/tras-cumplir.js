// Lo que pasa justo después de cumplir una tarea (H25/H26), en un solo lugar para que Resumen, Tabla, el modal de la
// tarea y el asistente se comporten igual:
//   1. avisa que se cumplió una tarea (`stdl:tarea-cumplida`): `app.js` reorganiza la agenda para aprovechar el hueco;
//   2. el tiempo real: solo se pregunta si está activa la preferencia (lo medido con el cronómetro se anota solo);
//   3. ofrece guardarla en Google Calendar solo si está activa la preferencia.
// «Crear tarea de seguimiento» no está acá: sigue en cada lugar, como antes.

import { obtenerPreferencias } from './preferencias.js';
import { preguntarTiempoReal } from './tiempo-real.js';
import { ofrecerExportarACalendar } from './exportar-calendar.js';
import { confirmarConCampo } from './avisos.js';

/** Llamar después de `cumplirTarea` y `persistirYNotificar()`. */
export async function trasCumplirTarea(tarea) {
  window.dispatchEvent(new CustomEvent('stdl:tarea-cumplida', { detail: { tareaId: tarea.tarea_id } }));
  await preguntarTiempoReal(tarea); // respeta `pref_tiempo_real_al_cumplir`; con cronómetro anota el tiempo medido sin preguntar
  if (obtenerPreferencias().pref_ofrecer_calendar_al_cumplir) ofrecerExportarACalendar(tarea);
}

/**
 * Confirmación única de «✅ Cumplida» (H25, P53-A), la misma en Resumen, Tabla, el detalle/edición de la tarea y Agenda: modal
 * «✔️ ¿Se cumplió «…»?» (Enter confirma, Esc cancela) con el campo de mejora solo para tareas que se repiten.
 * Devuelve `null` si se canceló (no hay que cambiar nada) o el texto de mejora ('' si no escribió nada) si se confirmó.
 */
export function confirmarCumplida(tarea) {
  return confirmarConCampo(`✔️ ¿Se cumplió «${tarea.tarea_nombre}»?`, {
    etiquetaCampo: tarea.tarea_mantenimiento ? '💡 ¿Qué podrías mejorar la próxima vez? (opcional)' : '',
    textoAceptar: '✔️ Confirmar',
    textoCancelar: '↩️ Cancelar',
  });
}
