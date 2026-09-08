import { estado, persistirYNotificar } from '../assets/js/almacenamiento.js';
import { crearTarea, ESTADOS_TAREA, ETIQUETAS_ESTADO } from '../assets/js/modelos.js';
import { formatearFecha, esVencida, escaparHtml } from '../assets/js/utilidades.js';

let filtroCategoria = '';
let filtroEstado = '';

export function renderVistaTareas(contenedor) {
  contenedor.innerHTML = `
    <h2>Tareas</h2>
    <form id="form-nueva-tarea" class="formulario-tarea">
      <input type="text" name="nombre" placeholder="Nueva tarea" required />
      <select name="categoria_id">
        <option value="">Sin categoría</option>
        ${estado.categorias.map((c) => `<option value="${c.id}">${escaparHtml(c.nombre)}</option>`).join('')}
      </select>
      <select name="subcategoria_id">
        <option value="">Sin subcategoría</option>
      </select>
      <select name="estado">
        ${ESTADOS_TAREA.map((e) => `<option value="${e}">${ETIQUETAS_ESTADO[e]}</option>`).join('')}
      </select>
      <label>Límite <input type="date" name="fecha_limite" /></label>
      <label>Sugerida <input type="date" name="fecha_sugerida" /></label>
      <label>Duración (min) <input type="number" name="duracion_estimada_min" value="30" min="0" step="15" /></label>
      <input type="text" name="notas" placeholder="Notas / recursos" />
      <button type="submit">Agregar tarea</button>
    </form>

    <div class="filtros">
      <label>Categoría
        <select id="filtro-categoria">
          <option value="">Todas</option>
          ${estado.categorias
            .map((c) => `<option value="${c.id}" ${filtroCategoria === c.id ? 'selected' : ''}>${escaparHtml(c.nombre)}</option>`)
            .join('')}
        </select>
      </label>
      <label>Estado
        <select id="filtro-estado">
          <option value="">Todos</option>
          ${ESTADOS_TAREA.map(
            (e) => `<option value="${e}" ${filtroEstado === e ? 'selected' : ''}>${ETIQUETAS_ESTADO[e]}</option>`
          ).join('')}
        </select>
      </label>
    </div>

    <ul id="lista-tareas" class="lista-tareas"></ul>
  `;

  const formulario = contenedor.querySelector('#form-nueva-tarea');
  const selectCategoria = formulario.categoria_id;
  const selectSubcategoria = formulario.subcategoria_id;

  function actualizarSubcategoriasFormulario() {
    const subs = estado.subcategorias.filter((s) => s.categoria_id === selectCategoria.value);
    selectSubcategoria.innerHTML =
      '<option value="">Sin subcategoría</option>' +
      subs.map((s) => `<option value="${s.id}">${escaparHtml(s.nombre)}</option>`).join('');
  }
  selectCategoria.addEventListener('change', actualizarSubcategoriasFormulario);
  actualizarSubcategoriasFormulario();

  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const datos = new FormData(formulario);
    const nombre = String(datos.get('nombre') || '').trim();
    if (!nombre) return;
    estado.tareas.push(
      crearTarea({
        nombre,
        categoria_id: datos.get('categoria_id') || null,
        subcategoria_id: datos.get('subcategoria_id') || null,
        estado: datos.get('estado'),
        fecha_limite: datos.get('fecha_limite'),
        fecha_sugerida: datos.get('fecha_sugerida'),
        duracion_estimada_min: Number(datos.get('duracion_estimada_min')) || 0,
        notas: String(datos.get('notas') || '').trim(),
      })
    );
    await persistirYNotificar();
  });

  contenedor.querySelector('#filtro-categoria').addEventListener('change', (evento) => {
    filtroCategoria = evento.target.value;
    renderVistaTareas(contenedor);
  });
  contenedor.querySelector('#filtro-estado').addEventListener('change', (evento) => {
    filtroEstado = evento.target.value;
    renderVistaTareas(contenedor);
  });

  const listaTareas = contenedor.querySelector('#lista-tareas');
  const tareasFiltradas = estado.tareas
    .filter((t) => !filtroCategoria || t.categoria_id === filtroCategoria)
    .filter((t) => !filtroEstado || t.estado === filtroEstado)
    .slice()
    .sort((a, b) => (a.fecha_limite || '9999-99-99').localeCompare(b.fecha_limite || '9999-99-99'));

  if (tareasFiltradas.length === 0) {
    listaTareas.innerHTML = '<p class="mensaje-vacio">No hay tareas que coincidan con el filtro.</p>';
    return;
  }

  tareasFiltradas.forEach((tarea) => listaTareas.appendChild(renderTarea(tarea)));
}

function renderTarea(tarea) {
  const categoria = estado.categorias.find((c) => c.id === tarea.categoria_id);
  const subcategoria = estado.subcategorias.find((s) => s.id === tarea.subcategoria_id);

  const li = document.createElement('li');
  li.className = 'item-tarea' + (esVencida(tarea.fecha_limite) && tarea.estado !== 'completada' ? ' vencida' : '');
  li.innerHTML = `
    <div class="item-tarea-info">
      <strong>${escaparHtml(tarea.nombre)}</strong>
      <span class="etiquetas">
        ${
          categoria
            ? `<span class="etiqueta" style="background:${categoria.color}">${escaparHtml(categoria.nombre)}${
                subcategoria ? ' / ' + escaparHtml(subcategoria.nombre) : ''
              }</span>`
            : ''
        }
        ${tarea.fecha_limite ? `<span class="etiqueta-fecha">Límite: ${formatearFecha(tarea.fecha_limite)}</span>` : ''}
        ${tarea.fecha_sugerida ? `<span class="etiqueta-fecha">Sugerida: ${formatearFecha(tarea.fecha_sugerida)}</span>` : ''}
        ${tarea.duracion_estimada_min ? `<span class="etiqueta-fecha">${tarea.duracion_estimada_min} min</span>` : ''}
      </span>
      ${tarea.notas ? `<p class="notas-tarea">${escaparHtml(tarea.notas)}</p>` : ''}
    </div>
    <div class="item-tarea-acciones">
      <select data-accion="cambiar-estado">
        ${ESTADOS_TAREA.map((e) => `<option value="${e}" ${e === tarea.estado ? 'selected' : ''}>${ETIQUETAS_ESTADO[e]}</option>`).join('')}
      </select>
      <button type="button" data-accion="eliminar">Eliminar</button>
    </div>
  `;

  li.querySelector('[data-accion="cambiar-estado"]').addEventListener('change', async (evento) => {
    tarea.estado = evento.target.value;
    tarea.completada_en = tarea.estado === 'completada' ? new Date().toISOString() : null;
    await persistirYNotificar();
  });

  li.querySelector('[data-accion="eliminar"]').addEventListener('click', async () => {
    if (!confirm(`¿Eliminar la tarea "${tarea.nombre}"?`)) return;
    estado.tareas = estado.tareas.filter((t) => t.id !== tarea.id);
    await persistirYNotificar();
  });

  return li;
}
