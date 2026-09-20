import { persistirYNotificar } from './almacenamiento.js';
import { escaparHtml } from './utilidades.js';

/** Lista de casillas del checklist de una tarea de mantenimiento, para mostrar dentro de su tarjeta. */
export function htmlChecklistTarjeta(tarea) {
  if ((tarea.tarea_checklist || []).length === 0) return '';
  return `<ul class="checklist-tarjeta">${tarea.tarea_checklist
    .map(
      (item, indice) =>
        `<li><label><input type="checkbox" data-checklist-indice="${indice}" ${item.hecho ? 'checked' : ''} /> ${escaparHtml(item.texto)}</label></li>`
    )
    .join('')}</ul>`;
}

/** Hace que tildar una casilla del checklist (ver `htmlChecklistTarjeta`) se guarde en la tarea. */
export function conectarChecklistTarjeta(li, tarea) {
  li.querySelectorAll('[data-checklist-indice]').forEach((casilla) => {
    casilla.addEventListener('change', async () => {
      tarea.tarea_checklist[Number(casilla.dataset.checklistIndice)].hecho = casilla.checked;
      await persistirYNotificar();
    });
  });
}
