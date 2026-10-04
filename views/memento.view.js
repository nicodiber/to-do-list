// Memento mori (v0.105.0): el calendario de la vida. Una cuadrícula con una casilla por semana (o por mes o por año) de una
// vida esperada, con lo vivido marcado y lo que queda, para tener presente cuánto tiempo hay. La fecha de nacimiento se
// pide una sola vez y se guarda en las preferencias (en tu Drive); se puede cambiar cuando quieras.

import { obtenerPreferencias, guardarPreferencias } from '../assets/js/preferencias.js';
import { hoyISO, formatearFecha } from '../assets/js/utilidades.js';
import { avisar } from '../assets/js/avisos.js';

const UNIDADES = [
  { clave: 'semanas', etiqueta: 'Semanas', porFila: 52, porAnio: 52 },
  { clave: 'meses', etiqueta: 'Meses', porFila: 12, porAnio: 12 },
  { clave: 'anios', etiqueta: 'Años', porFila: 10, porAnio: 1 },
];
const CLAVE_UNIDAD = 'super-todo-list:memento-unidad';

function leerUnidad() {
  try {
    return UNIDADES.find((u) => u.clave === localStorage.getItem(CLAVE_UNIDAD)) || UNIDADES[0];
  } catch {
    return UNIDADES[0];
  }
}

function guardarUnidad(clave) {
  try {
    localStorage.setItem(CLAVE_UNIDAD, clave);
  } catch {
    // Es solo una preferencia de pantalla.
  }
}

/** Fecha local (medianoche) de un `YYYY-MM-DD`. */
const aFecha = (iso) => new Date(`${iso}T00:00:00`);

/** Meses completos entre dos fechas (a ≤ b). */
function mesesEntre(a, b) {
  let meses = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) meses -= 1;
  return Math.max(0, meses);
}

export function renderVistaMemento(contenedor) {
  const preferencias = obtenerPreferencias();
  const nacimiento = preferencias.pref_fecha_nacimiento;
  if (!nacimiento) {
    renderPedirNacimiento(contenedor);
    return;
  }
  const unidad = leerUnidad();
  const esperanza = preferencias.pref_esperanza_vida || 80;
  const hoy = aFecha(hoyISO());
  const fechaNacimiento = aFecha(nacimiento);
  const diasVividos = Math.max(0, Math.floor((hoy - fechaNacimiento) / 86400000));
  const totalAnios = esperanza;
  const vividasUnidad = unidad.clave === 'semanas' ? Math.floor(diasVividos / 7) : unidad.clave === 'meses' ? mesesEntre(fechaNacimiento, hoy) : Math.floor(mesesEntre(fechaNacimiento, hoy) / 12);
  const totalUnidades = totalAnios * unidad.porAnio;
  const edadAnios = Math.floor(mesesEntre(fechaNacimiento, hoy) / 12);
  const fechaFinEsperada = new Date(fechaNacimiento.getFullYear() + esperanza, fechaNacimiento.getMonth(), fechaNacimiento.getDate());
  const diasRestantes = Math.max(0, Math.round((fechaFinEsperada - hoy) / 86400000));
  const porcentaje = Math.min(100, (diasVividos / Math.max(1, Math.round((fechaFinEsperada - fechaNacimiento) / 86400000))) * 100);

  const casillas = [];
  for (let i = 0; i < totalUnidades; i += 1) {
    const clase = i < vividasUnidad ? 'vivida' : i === vividasUnidad ? 'actual' : 'futura';
    casillas.push(`<span class="casilla-vida ${clase}"></span>`);
  }
  const filas = [];
  for (let i = 0; i < casillas.length; i += unidad.porFila) {
    const numeroFila = unidad.clave === 'anios' ? `${i}` : `${i / unidad.porFila}`;
    filas.push(`<div class="fila-vida"><span class="edad-fila-vida">${numeroFila}</span>${casillas.slice(i, i + unidad.porFila).join('')}</div>`);
  }

  contenedor.innerHTML = `
    <h2 title="Un calendario de tu vida: cada casilla es una ${unidad.clave === 'semanas' ? 'semana' : unidad.clave === 'meses' ? 'mes' : 'año'}">⏳ Memento mori</h2>
    <blockquote class="cita-habitos">Recordá que vas a morir: no para entristecerte, sino para elegir en qué gastar el tiempo.</blockquote>
    <div class="selector-rango" role="group" aria-label="Unidad">
      ${UNIDADES.map((u) => `<button type="button" data-unidad="${u.clave}" class="${u.clave === unidad.clave ? 'activo' : ''}" title="Una casilla por ${u.etiqueta.toLowerCase().replace(/s$/, '')}">${u.etiqueta}</button>`).join('')}
    </div>
    <p>Naciste el <strong>${formatearFecha(nacimiento)}</strong>: tenés <strong>${edadAnios}</strong> años, viviste <strong>${diasVividos.toLocaleString('es-AR')}</strong> días (${porcentaje.toFixed(1).replace('.', ',')} % de una vida de ${esperanza} años) y, si llegás a los ${esperanza}, te quedan unos <strong>${diasRestantes.toLocaleString('es-AR')}</strong> días (≈ ${Math.round(diasRestantes / 7).toLocaleString('es-AR')} semanas).</p>
    <div class="acciones-config">
      <label title="Hasta qué edad pensás vivir, solo para dibujar la cuadrícula">Expectativa de vida
        <input type="number" id="memento-esperanza" min="40" max="120" step="1" value="${esperanza}" style="width: 4.5rem" /> años
      </label>
      <button type="button" id="memento-cambiar-fecha" title="Corregir tu fecha de nacimiento">✏️ Cambiar fecha de nacimiento</button>
    </div>
    <div class="vida-contenedor"><div class="vida-cuadricula">${filas.join('')}</div></div>
    <p class="ayuda leyenda-habitos"><span class="casilla-vida vivida"></span> vivido <span class="casilla-vida actual"></span> ahora <span class="casilla-vida futura"></span> por vivir. ${unidad.clave === 'semanas' ? 'Cada fila es un año de vida (52 semanas).' : unidad.clave === 'meses' ? 'Cada fila es un año de vida (12 meses).' : 'Cada fila son diez años.'} Tu fecha de nacimiento se guarda en las preferencias de tu Google Drive y no se vuelve a pedir.</p>
  `;

  contenedor.querySelectorAll('[data-unidad]').forEach((boton) =>
    boton.addEventListener('click', () => {
      guardarUnidad(boton.dataset.unidad);
      renderVistaMemento(contenedor);
    })
  );
  contenedor.querySelector('#memento-esperanza').addEventListener('change', async (evento) => {
    const valor = Math.round(Number(evento.target.value));
    if (!Number.isFinite(valor) || valor < 40 || valor > 120) {
      evento.target.value = String(esperanza);
      await avisar('La expectativa de vida tiene que estar entre 40 y 120 años.');
      return;
    }
    await guardarPreferencias({ pref_esperanza_vida: valor });
  });
  contenedor.querySelector('#memento-cambiar-fecha').addEventListener('click', () => renderPedirNacimiento(contenedor, nacimiento));
}

function renderPedirNacimiento(contenedor, actual = '') {
  contenedor.innerHTML = `
    <h2>⏳ Memento mori</h2>
    <section class="pantalla-inicial">
      <p>Para dibujar el calendario de tu vida necesito tu <strong>fecha de nacimiento</strong>. La pido una sola vez: se guarda en las preferencias de tu propio Google Drive (no se envía a ningún otro lado) y la podés cambiar cuando quieras.</p>
      <form id="form-nacimiento" class="acciones-config">
        <label>🎂 Fecha de nacimiento
          <input type="date" name="nacimiento" required max="${hoyISO()}" min="1900-01-01" value="${actual}" />
        </label>
        <button type="submit" class="boton-primario">💾 Guardar</button>
        ${actual ? '<button type="button" id="cancelar-nacimiento">Cancelar</button>' : ''}
      </form>
    </section>`;
  contenedor.querySelector('#form-nacimiento').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const fecha = evento.target.nacimiento.value;
    if (!fecha || fecha > hoyISO() || fecha < '1900-01-01') {
      await avisar('Elegí una fecha de nacimiento válida (no puede ser futura).');
      return;
    }
    await guardarPreferencias({ pref_fecha_nacimiento: fecha });
  });
  contenedor.querySelector('#cancelar-nacimiento')?.addEventListener('click', () => renderVistaMemento(contenedor));
}
