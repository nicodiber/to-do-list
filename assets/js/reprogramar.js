import { fechaISOMasDias, combinarFechaYHora, hoyISO, fechaLocalISO } from './utilidades.js';

export const ATAJOS_HORARIO = [
  { etiqueta: 'Mañana', hora: '07:00' },
  { etiqueta: 'Tarde', hora: '12:00' },
  { etiqueta: 'Tardecita', hora: '17:00' },
  { etiqueta: 'Noche', hora: '20:00' },
];

export const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

/**
 * Atajos de día: Hoy/Mañana/Pasado mañana y, para los 7 días siguientes (uno de cada día de la
 * semana, siempre distintos entre sí), "Próximo <día>" — se recalculan en cada apertura del panel
 * porque dependen de qué día es hoy.
 */
function calcularAtajosDia() {
  const fijos = [
    { etiqueta: 'Hoy', dias: 0 },
    { etiqueta: 'Mañana', dias: 1 },
    { etiqueta: 'Pasado mañana', dias: 2 },
  ];
  const hoyDiaSemana = new Date().getDay();
  const proximos = Array.from({ length: 7 }, (_, i) => {
    const dias = i + 3;
    const nombreDia = DIAS_SEMANA[(hoyDiaSemana + dias) % 7];
    return { etiqueta: `Próximo ${nombreDia}`, dias };
  });
  return [...fijos, ...proximos];
}

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
  const atajosDia = calcularAtajosDia();
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
      ${atajosDia.map((a) => `<button type="button" data-dias="${a.dias}" title="Poner el día: ${a.etiqueta}">${a.etiqueta}</button>`).join('')}
      <input type="date" data-campo="fecha" value="${hoyISO()}" />
    </div>
    <div class="panel-reprogramar-fila">
      <span class="panel-reprogramar-etiqueta">o el 1er</span>
      <select data-campo="dia-semana-proximo-mes">
        ${DIAS_SEMANA.map((nombre, indice) => `<option value="${indice}">${nombre}</option>`).join('')}
      </select>
      <button title="Elegir el primer día de la semana indicada del próximo mes" type="button" data-accion="primer-dia-proximo-mes">del próximo mes</button>
    </div>
    <div class="panel-reprogramar-fila">
      <span class="panel-reprogramar-etiqueta">Horario (opcional):</span>
      ${ATAJOS_HORARIO.map((a) => `<button type="button" data-hora="${a.hora}" title="Poner el horario ${a.hora}">${a.etiqueta} (${a.hora})</button>`).join('')}
      <input type="time" data-campo="hora" />
    </div>
    <div class="panel-reprogramar-acciones">
      <button title="Confirmar la nueva fecha" type="button" data-accion="confirmar" class="boton-primario">📅 Reprogramar</button>
      <button title="Cancelar" type="button" data-accion="cancelar">↩️ Cancelar</button>
    </div>
  `;

  const campoFecha = panel.querySelector('[data-campo="fecha"]');
  const campoHora = panel.querySelector('[data-campo="hora"]');

  function fijarFecha(valor) {
    campoFecha.value = siguienteDiaHabil(valor, diasHabiles);
  }

  panel.querySelectorAll('[data-dias]').forEach((boton) => {
    boton.addEventListener('click', () => {
      panel.querySelectorAll('[data-dias].activo').forEach((b) => b.classList.remove('activo'));
      boton.classList.add('activo');
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
    // Cambio a mano (no seteado por un atajo, que no dispara 'change'): se apaga el resaltado.
    panel.querySelectorAll('[data-dias].activo').forEach((b) => b.classList.remove('activo'));
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
