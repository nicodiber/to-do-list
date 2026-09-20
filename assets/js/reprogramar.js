import { fechaISOMasDias, combinarFechaYHora, hoyISO, fechaLocalISO } from './utilidades.js';

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

export const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

function primerDiaSemanaProximoMes(indiceDiaSemana, desde = new Date()) {
  const fecha = new Date(desde.getFullYear(), desde.getMonth() + 1, 1);
  while (fecha.getDay() !== indiceDiaSemana) {
    fecha.setDate(fecha.getDate() + 1);
  }
  return fechaLocalISO(fecha);
}

function esDiaHabil(fechaISODate, diasHabiles) {
  if (!diasHabiles || diasHabiles.length === 0) return true;
  return diasHabiles.includes(new Date(fechaISODate + 'T00:00:00').getDay());
}

export function siguienteDiaHabil(fechaISODate, diasHabiles) {
  if (!diasHabiles || diasHabiles.length === 0) return fechaISODate;
  let fecha = fechaISODate;
  let intentos = 0;
  while (!esDiaHabil(fecha, diasHabiles) && intentos < 14) {
    fecha = fechaISOMasDias(1, fecha);
    intentos++;
  }
  return fecha;
}

/**
 * Panel inline con atajos de día + horario (opcional) para reprogramar una
 * tarea. onConfirmar recibe la fecha elegida — sola (`YYYY-MM-DD`) si no se
 * eligió horario, o datetime ISO completo si sí.
 */
export function crearPanelReprogramar({ onConfirmar, onCancelar, diasHabiles = [] }) {
  const panel = document.createElement('div');
  panel.className = 'panel-reprogramar';
  panel.innerHTML = `
    ${
      diasHabiles && diasHabiles.length > 0
        ? `<p class="panel-reprogramar-leyenda">Solo: ${diasHabiles
            .slice()
            .sort()
            .map((i) => DIAS_SEMANA[i].slice(0, 3))
            .join(', ')}</p>`
        : ''
    }
    <div class="panel-reprogramar-fila">
      <span class="panel-reprogramar-etiqueta">Día:</span>
      ${ATAJOS_DIA.map((a) => `<button type="button" data-dias="${a.dias}">${a.etiqueta}</button>`).join('')}
      <input type="date" data-campo="fecha" value="${hoyISO()}" />
    </div>
    <div class="panel-reprogramar-fila">
      <span class="panel-reprogramar-etiqueta">o el 1er</span>
      <select data-campo="dia-semana-proximo-mes">
        ${DIAS_SEMANA.map((nombre, indice) => `<option value="${indice}">${nombre}</option>`).join('')}
      </select>
      <button type="button" data-accion="primer-dia-proximo-mes">del próximo mes</button>
    </div>
    <div class="panel-reprogramar-fila">
      <span class="panel-reprogramar-etiqueta">Horario (opcional):</span>
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

  function fijarFecha(valor) {
    campoFecha.value = siguienteDiaHabil(valor, diasHabiles);
  }

  panel.querySelectorAll('[data-dias]').forEach((boton) => {
    boton.addEventListener('click', () => {
      fijarFecha(fechaISOMasDias(Number(boton.dataset.dias)));
    });
  });
  panel.querySelectorAll('[data-hora]').forEach((boton) => {
    boton.addEventListener('click', () => {
      campoHora.value = boton.dataset.hora;
    });
  });

  panel.querySelector('[data-accion="primer-dia-proximo-mes"]').addEventListener('click', () => {
    const indice = Number(panel.querySelector('[data-campo="dia-semana-proximo-mes"]').value);
    fijarFecha(primerDiaSemanaProximoMes(indice));
  });

  campoFecha.addEventListener('change', () => {
    if (campoFecha.value) fijarFecha(campoFecha.value);
  });

  panel.querySelector('[data-accion="confirmar"]').addEventListener('click', () => {
    if (!campoFecha.value) {
      alert('Elegí un día (con los atajos o a mano).');
      return;
    }
    onConfirmar(campoHora.value ? combinarFechaYHora(campoFecha.value, campoHora.value) : campoFecha.value);
  });
  panel.querySelector('[data-accion="cancelar"]').addEventListener('click', () => onCancelar());

  return panel;
}
