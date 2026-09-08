import { estado, persistirYNotificar } from '../assets/js/almacenamiento.js';
import { ETIQUETAS_ESTADO } from '../assets/js/modelos.js';
import { formatearFecha, esVencida, esHoy, escaparHtml } from '../assets/js/utilidades.js';

export function renderVistaHoy(contenedor) {
  const pendientesActivas = estado.tareas.filter((t) => t.estado !== 'completada');
  const urgentes = pendientesActivas.filter((t) => esVencida(t.fecha_limite) || esHoy(t.fecha_limite));
  const idsUrgentes = new Set(urgentes.map((t) => t.id));
  const resto = pendientesActivas
    .filter((t) => !idsUrgentes.has(t.id))
    .sort((a, b) => (a.fecha_limite || '9999-99-99').localeCompare(b.fecha_limite || '9999-99-99'));

  contenedor.innerHTML = `
    <h2>Hoy</h2>
    <p class="ayuda">Lo urgente primero: tareas vencidas o con fecha límite hoy. Así no hace falta reprogramar nada para saber por dónde arrancar.</p>
    <section>
      <h3>Urgentes</h3>
      <ul id="lista-urgentes" class="lista-tareas"></ul>
    </section>
    <section>
      <h3>Resto de tus pendientes</h3>
      <ul id="lista-resto" class="lista-tareas"></ul>
    </section>
  `;

  const listaUrgentes = contenedor.querySelector('#lista-urgentes');
  if (urgentes.length === 0) {
    listaUrgentes.innerHTML = '<p class="mensaje-vacio">No tenés tareas vencidas ni con fecha límite hoy.</p>';
  } else {
    urgentes.forEach((tarea) => listaUrgentes.appendChild(renderItem(tarea)));
  }

  const listaResto = contenedor.querySelector('#lista-resto');
  if (resto.length === 0) {
    listaResto.innerHTML = '<p class="mensaje-vacio">No hay más tareas pendientes.</p>';
  } else {
    resto.forEach((tarea) => listaResto.appendChild(renderItem(tarea)));
  }
}

function renderItem(tarea) {
  const categoria = estado.categorias.find((c) => c.id === tarea.categoria_id);
  const li = document.createElement('li');
  li.className = 'item-tarea' + (esVencida(tarea.fecha_limite) ? ' vencida' : '');
  li.innerHTML = `
    <div class="item-tarea-info">
      <strong>${escaparHtml(tarea.nombre)}</strong>
      <span class="etiquetas">
        ${categoria ? `<span class="etiqueta" style="background:${categoria.color}">${escaparHtml(categoria.nombre)}</span>` : ''}
        ${tarea.fecha_limite ? `<span class="etiqueta-fecha">Límite: ${formatearFecha(tarea.fecha_limite)}</span>` : ''}
        <span class="etiqueta-fecha">${ETIQUETAS_ESTADO[tarea.estado]}</span>
      </span>
    </div>
    <div class="item-tarea-acciones">
      <button type="button" data-accion="completar">Marcar completada</button>
    </div>
  `;

  li.querySelector('[data-accion="completar"]').addEventListener('click', async () => {
    tarea.estado = 'completada';
    tarea.completada_en = new Date().toISOString();
    await persistirYNotificar();
  });

  return li;
}
