import { fechaISOMasDias, combinarFechaYHora, hoyISO } from './utilidades.js';

export const ATAJOS_HORARIO = [
  { etiqueta: 'Mañana', hora: '07:00' },
  { etiqueta: 'Tarde', hora: '12:00' },
  { etiqueta: 'Tardecita', hora: '17:00' },
  { etiqueta: 'Noche', hora: '20:00' },
];

const ATAJOS_DIA = [
  { etiqueta: 'Hoy', dias: 0 },
  { etiqueta: 'Mañana', dias: 1 },
  { etiqueta: '+7 días', dias: 7 },
  { etiqueta: '+15 días', dias: 15 },
  { etiqueta: '+30 días', dias: 30 },
];

/**
 * Panel inline con atajos de día + horario para reprogramar una tarea.
 * onConfirmar recibe la fecha/hora elegida en formato ISO datetime.
 */
export function crearPanelReprogramar({ onConfirmar, onCancelar }) {
  const panel = document.createElement('div');
  panel.className = 'panel-reprogramar';
  panel.innerHTML = `
    <div class="panel-reprogramar-fila">
      <span class="panel-reprogramar-etiqueta">Día:</span>
      ${ATAJOS_DIA.map((a) => `<button type="button" data-dias="${a.dias}">${a.etiqueta}</button>`).join('')}
      <input type="date" data-campo="fecha" value="${hoyISO()}" />
    </div>
    <div class="panel-reprogramar-fila">
      <span class="panel-reprogramar-etiqueta">Horario:</span>
      ${ATAJOS_HORARIO.map((a) => `<button type="button" data-hora="${a.hora}">${a.etiqueta} (${a.hora})</button>`).join('')}
      <input type="time" data-campo="hora" />
    </div>
    <div class="panel-reprogramar-acciones">
      <button type="button" data-accion="confirmar" class="boton-primario">Reprogramar</button>
      <button type="button" data-accion="cancelar">Cancelar</button>
    </div>
  `;

  const campoFecha = panel.querySelector('[data-campo="fecha"]');
  const campoHora = panel.querySelector('[data-campo="hora"]');

  panel.querySelectorAll('[data-dias]').forEach((boton) => {
    boton.addEventListener('click', () => {
      campoFecha.value = fechaISOMasDias(Number(boton.dataset.dias));
    });
  });
  panel.querySelectorAll('[data-hora]').forEach((boton) => {
    boton.addEventListener('click', () => {
      campoHora.value = boton.dataset.hora;
    });
  });

  panel.querySelector('[data-accion="confirmar"]').addEventListener('click', () => {
    if (!campoFecha.value || !campoHora.value) {
      alert('Elegí un día y un horario (con los atajos o a mano).');
      return;
    }
    onConfirmar(combinarFechaYHora(campoFecha.value, campoHora.value));
  });
  panel.querySelector('[data-accion="cancelar"]').addEventListener('click', () => onCancelar());

  return panel;
}
