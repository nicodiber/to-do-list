import { estado } from '../assets/js/almacenamiento.js';
import { calcularMapaHabitos, calcularMapaCategorias, ESTADOS_CELDA } from '../assets/js/habitos.js';
import { escaparHtml, formatearFecha } from '../assets/js/utilidades.js';

// Preferencia de UI (no un dato de la app): cuántos días muestra el mapa de hábitos.
const CLAVE_LOCALSTORAGE = 'super-todo-list:habitos-dias';
const OPCIONES = [7, 30, 90];
const POR_DEFECTO = 30;

const SIMBOLOS = {
  [ESTADOS_CELDA.cumplido]: '✓',
  [ESTADOS_CELDA.incumplido]: '✗',
  [ESTADOS_CELDA.vence]: '▫',
  [ESTADOS_CELDA.noAplica]: '·',
};

function leerDias() {
  try {
    const guardado = Number(localStorage.getItem(CLAVE_LOCALSTORAGE));
    return OPCIONES.includes(guardado) ? guardado : POR_DEFECTO;
  } catch {
    return POR_DEFECTO;
  }
}

function guardarDias(dias) {
  try {
    localStorage.setItem(CLAVE_LOCALSTORAGE, String(dias));
  } catch {
    // Solo es una preferencia: sin almacenamiento local se vuelve a la opción por defecto.
  }
}

/** Encabezado de las columnas: el número del día (y `dd/mm` el día 1 y el primero de la ventana). */
function encabezadosDias(celdas) {
  return celdas
    .map((celda, indice) => {
      const [, mes, dia] = celda.dia.split('-');
      const etiqueta = indice === 0 || dia === '01' ? `${dia}/${mes}` : dia;
      return `<th class="dia-habito" title="${formatearFecha(celda.dia)}">${etiqueta}</th>`;
    })
    .join('');
}

function htmlMatrizHabitos(habitos) {
  return `
    <div class="matriz-habitos-contenedor">
      <table class="matriz-habitos">
        <thead>
          <tr>
            <th class="nombre-habito">Hábito</th>
            <th title="Racha actual">🔥</th>
            <th title="Porcentaje de cumplimiento del período">%</th>
            ${encabezadosDias(habitos[0].celdas)}
          </tr>
        </thead>
        <tbody>
          ${habitos
            .map(
              (h) => `
            <tr>
              <th class="nombre-habito" scope="row">${escaparHtml(h.nombre)}</th>
              <td class="dato-habito">${h.racha}</td>
              <td class="dato-habito">${h.porcentaje == null ? '—' : `${h.porcentaje} %`}</td>
              ${h.celdas.map((c) => `<td class="celda-habito ${c.estado}" title="${formatearFecha(c.dia)} · ${c.titulo}">${SIMBOLOS[c.estado]}</td>`).join('')}
            </tr>`
            )
            .join('')}
        </tbody>
      </table>
    </div>`;
}

function htmlMatrizCategorias(filas) {
  return `
    <div class="matriz-habitos-contenedor">
      <table class="matriz-habitos">
        <thead>
          <tr>
            <th class="nombre-habito">Categoría</th>
            <th title="Días con al menos una tarea cumplida en el período">Días</th>
            ${encabezadosDias(filas[0].celdas)}
          </tr>
        </thead>
        <tbody>
          ${filas
            .map(
              (f) => `
            <tr>
              <th class="nombre-habito" scope="row"><span class="punto-color" style="background:${f.categoria.categoria_color}"></span>${escaparHtml(f.categoria.categoria_nombre)}</th>
              <td class="dato-habito">${f.diasActivos}</td>
              ${f.celdas
                .map(
                  (c) =>
                    `<td class="celda-habito ${c.cantidad > 0 ? ESTADOS_CELDA.cumplido : ESTADOS_CELDA.noAplica}" title="${formatearFecha(c.dia)} · ${c.cantidad > 0 ? `${c.cantidad} tarea${c.cantidad === 1 ? '' : 's'} cumplida${c.cantidad === 1 ? '' : 's'}` : 'Sin actividad'}">${c.cantidad > 0 ? '✓' : '·'}</td>`
                )
                .join('')}
            </tr>`
            )
            .join('')}
        </tbody>
      </table>
    </div>`;
}

/** Solapa "Hábitos" de Estadísticas: matriz de hábitos (tareas de mantenimiento) y actividad por categoría. */
export function renderVistaHabitos(contenedor) {
  const dias = leerDias();
  const habitos = calcularMapaHabitos(estado, { dias });
  const categorias = calcularMapaCategorias(estado, { dias });

  contenedor.innerHTML = `
    <blockquote class="cita-habitos">Lo que no se mide no se mejora.</blockquote>
    <p class="ayuda">Cada fila es una tarea de mantenimiento (un hábito) y cada columna un día; hoy es la última.</p>
    <div class="selector-rango" role="group" aria-label="Período">
      ${OPCIONES.map((n) => `<button type="button" data-dias="${n}" class="${n === dias ? 'activo' : ''}">${n} días</button>`).join('')}
    </div>

    <section>
      <h3>🔥 Hábitos</h3>
      ${
        habitos.length === 0
          ? '<p class="mensaje-vacio">Todavía no hay hábitos: aparecen cuando cumplís una tarea de mantenimiento (una tarea que se repite).</p>'
          : htmlMatrizHabitos(habitos)
      }
      <p class="ayuda leyenda-habitos"><strong>✓</strong> cumplido — <strong>✗</strong> incumplido (día hábil sin hacer, o vencimiento que se cumplió tarde o sigue vencido) — <strong>▫</strong> pendiente hoy — <strong>·</strong> no aplica (día no hábil o sin vencimiento). 🔥 racha: días hábiles seguidos cumplidos (en hábitos que no son diarios, veces seguidas a tiempo). % = cumplimientos a tiempo sobre los que tocaban en el período.</p>
    </section>

    <section>
      <h3>🗂️ Actividad por categoría</h3>
      ${
        categorias.length === 0
          ? '<p class="mensaje-vacio">Todavía no hay tareas cumplidas con categoría para mostrar.</p>'
          : `${htmlMatrizCategorias(categorias)}
             <p class="ayuda leyenda-habitos">✓ = ese día se cumplió al menos una tarea de la categoría o de sus subcategorías. Los días sin actividad quedan en blanco: no se consideran incumplidos.</p>`
      }
    </section>
  `;

  // Hoy es la última columna: la matriz arranca desplazada al final para que se vea lo más reciente.
  contenedor.querySelectorAll('.matriz-habitos-contenedor').forEach((matriz) => {
    matriz.scrollLeft = matriz.scrollWidth;
  });

  contenedor.querySelectorAll('.selector-rango button').forEach((boton) => {
    boton.addEventListener('click', () => {
      guardarDias(Number(boton.dataset.dias));
      renderVistaHabitos(contenedor);
    });
  });
}
