import { estado } from '../assets/js/almacenamiento.js';
import { ETIQUETAS_ESTADO, ETIQUETAS_IMPORTANCIA, ICONOS_IMPORTANCIA } from '../assets/js/modelos.js';
import { hoyISO, diasEntreFechas, formatearFecha, escaparHtml } from '../assets/js/utilidades.js';
import { fechaDeReferencia } from '../assets/js/vista-agenda.js';
import { abrirEdicionAlEntrar } from './tareas.view.js';

function formatearDias(dias) {
  if (dias === 0) return 'Hoy';
  if (dias > 0) return `En ${dias} día${dias === 1 ? '' : 's'}`;
  const atraso = Math.abs(dias);
  return `Vencida hace ${atraso} día${atraso === 1 ? '' : 's'}`;
}

/**
 * Vista de referencia: todas las tareas pendientes en formato tabla,
 * ordenadas por la fecha más próxima (agendada > límite > sugerida, mismo
 * criterio que assets/js/vista-agenda.js). Inspirada directamente en la
 * tabla "Completo" que el usuario ya usaba en Notion para organizarse.
 */
export function renderVistaTabla(contenedor) {
  const hoy = hoyISO();
  const filas = estado.tareas
    .filter((t) => t.tarea_estado !== 'completada')
    .map((tarea) => ({ tarea, fechaRef: fechaDeReferencia(tarea) }))
    .sort((a, b) => (a.fechaRef || '9999-99-99').localeCompare(b.fechaRef || '9999-99-99'));

  contenedor.innerHTML = `
    <h2>Tabla</h2>
    <p class="ayuda">Todas tus tareas pendientes, ordenadas por lo más próximo a vencer. Hacé clic en una fila para editarla.</p>
    <div class="tabla-tareas-contenedor">
      <table class="tabla-informe">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Categoría</th>
            <th>Importancia</th>
            <th>Estado</th>
            <th>Fecha</th>
            <th>Días</th>
          </tr>
        </thead>
        <tbody id="cuerpo-tabla-tareas"></tbody>
      </table>
    </div>
  `;

  const cuerpo = contenedor.querySelector('#cuerpo-tabla-tareas');

  if (filas.length === 0) {
    cuerpo.innerHTML = '<tr><td colspan="6" class="mensaje-vacio">No tenés tareas pendientes.</td></tr>';
    return;
  }

  filas.forEach(({ tarea, fechaRef }) => {
    const categoria = estado.categorias.find((c) => c.categoria_id === tarea.categoria_id);
    const subcategoria = estado.subcategorias.find((s) => s.subcategoria_id === tarea.subcategoria_id);
    const dias = fechaRef ? diasEntreFechas(hoy, fechaRef) : null;

    const fila = document.createElement('tr');
    fila.className = 'fila-tabla-tarea';
    fila.innerHTML = `
      <td>${escaparHtml(tarea.tarea_nombre)}</td>
      <td>${
        categoria
          ? escaparHtml(categoria.categoria_nombre) + (subcategoria ? ` / ${escaparHtml(subcategoria.subcategoria_nombre)}` : '')
          : ''
      }</td>
      <td>${ICONOS_IMPORTANCIA[tarea.tarea_importancia] || ICONOS_IMPORTANCIA.media} ${
        ETIQUETAS_IMPORTANCIA[tarea.tarea_importancia] || ETIQUETAS_IMPORTANCIA.media
      }</td>
      <td>${ETIQUETAS_ESTADO[tarea.tarea_estado]}</td>
      <td>${fechaRef ? formatearFecha(fechaRef) : 'Sin fecha'}</td>
      <td>${dias === null ? '—' : formatearDias(dias)}</td>
    `;
    fila.addEventListener('click', () => {
      abrirEdicionAlEntrar(tarea.tarea_id);
      location.hash = '#/tareas';
    });
    cuerpo.appendChild(fila);
  });
}
