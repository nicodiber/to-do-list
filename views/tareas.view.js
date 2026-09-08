import { estado, persistirYNotificar } from '../assets/js/almacenamiento.js';
import { crearTarea, ESTADOS_TAREA, ETIQUETAS_ESTADO, UNIDADES_MANTENIMIENTO, ETIQUETAS_UNIDAD_MANTENIMIENTO } from '../assets/js/modelos.js';
import { formatearFecha, formatearFechaHora, esVencida, noPuedeEmpezarTodavia, escaparHtml } from '../assets/js/utilidades.js';
import { crearPanelReprogramar } from '../assets/js/reprogramar.js';
import { completarTarea, reprogramarTareaConCascada, tareaEstaBloqueada, puedeAgregarDependencia } from '../assets/js/tareas-logica.js';

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
      <label>Desde <input type="date" name="fecha_inicio_posible" /></label>
      <label>Límite <input type="date" name="fecha_limite" /></label>
      <label>Sugerida <input type="date" name="fecha_sugerida" /></label>
      <label>Duración (min) <input type="number" name="duracion_estimada_min" value="30" min="0" step="15" /></label>
      <input type="text" name="notas" placeholder="Notas / recursos" />
      <label class="opcion-mantenimiento">
        <input type="checkbox" name="es_mantenimiento" />
        Es tarea de mantenimiento (se renueva sola)
      </label>
      <span class="campos-mantenimiento" hidden>
        cada
        <input type="number" name="mantenimiento_cantidad" value="1" min="1" style="width: 3.5rem" />
        <select name="mantenimiento_unidad">
          ${UNIDADES_MANTENIMIENTO.map((u) => `<option value="${u}">${ETIQUETAS_UNIDAD_MANTENIMIENTO[u]}</option>`).join('')}
        </select>
      </span>
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

  const checkboxMantenimiento = formulario.es_mantenimiento;
  const camposMantenimiento = contenedor.querySelector('.campos-mantenimiento');
  checkboxMantenimiento.addEventListener('change', () => {
    camposMantenimiento.hidden = !checkboxMantenimiento.checked;
  });

  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const datos = new FormData(formulario);
    const nombre = String(datos.get('nombre') || '').trim();
    if (!nombre) return;
    const esMantenimiento = datos.get('es_mantenimiento') === 'on';
    estado.tareas.push(
      crearTarea({
        nombre,
        categoria_id: datos.get('categoria_id') || null,
        subcategoria_id: datos.get('subcategoria_id') || null,
        estado: datos.get('estado'),
        fecha_inicio_posible: datos.get('fecha_inicio_posible'),
        fecha_limite: datos.get('fecha_limite'),
        fecha_sugerida: datos.get('fecha_sugerida'),
        duracion_estimada_min: Number(datos.get('duracion_estimada_min')) || 0,
        notas: String(datos.get('notas') || '').trim(),
        mantenimiento: esMantenimiento
          ? {
              cantidad: Number(datos.get('mantenimiento_cantidad')) || 1,
              unidad: datos.get('mantenimiento_unidad'),
            }
          : null,
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
  const { bloqueada, bloqueantes } = tareaEstaBloqueada(tarea, estado.tareas);

  const li = document.createElement('li');
  const clases = ['item-tarea'];
  if (esVencida(tarea.fecha_limite) && tarea.estado !== 'completada') clases.push('vencida');
  if (noPuedeEmpezarTodavia(tarea.fecha_inicio_posible)) clases.push('aun-no-disponible');
  if (bloqueada) clases.push('bloqueada');
  li.className = clases.join(' ');
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
        ${tarea.fecha_inicio_posible ? `<span class="etiqueta-fecha">Desde: ${formatearFecha(tarea.fecha_inicio_posible)}</span>` : ''}
        ${tarea.fecha_limite ? `<span class="etiqueta-fecha">Límite: ${formatearFecha(tarea.fecha_limite)}</span>` : ''}
        ${tarea.fecha_sugerida ? `<span class="etiqueta-fecha">Sugerida: ${formatearFecha(tarea.fecha_sugerida)}</span>` : ''}
        ${tarea.fecha_hora_agendada ? `<span class="etiqueta-fecha etiqueta-agendada">Agendada: ${formatearFechaHora(tarea.fecha_hora_agendada)}</span>` : ''}
        ${tarea.duracion_estimada_min ? `<span class="etiqueta-fecha">${tarea.duracion_estimada_min} min</span>` : ''}
        ${
          tarea.mantenimiento
            ? `<span class="etiqueta-fecha etiqueta-mantenimiento">🔁 cada ${tarea.mantenimiento.cantidad} ${ETIQUETAS_UNIDAD_MANTENIMIENTO[tarea.mantenimiento.unidad]}</span>`
            : ''
        }
      </span>
      ${
        bloqueada
          ? `<p class="aviso-bloqueada">Bloqueada por: ${bloqueantes.map((b) => escaparHtml(b.nombre)).join(', ')}</p>`
          : ''
      }
      ${tarea.notas ? `<p class="notas-tarea">${escaparHtml(tarea.notas)}</p>` : ''}
      ${tarea.motivo_incumplimiento ? `<p class="notas-tarea">Motivo del último replanteo: ${escaparHtml(tarea.motivo_incumplimiento)}</p>` : ''}
      <div class="contenedor-panel-reprogramar" hidden></div>
      <div class="contenedor-panel-dependencias" hidden></div>
    </div>
    <div class="item-tarea-acciones">
      <select data-accion="cambiar-estado">
        ${ESTADOS_TAREA.map((e) => `<option value="${e}" ${e === tarea.estado ? 'selected' : ''}>${ETIQUETAS_ESTADO[e]}</option>`).join('')}
      </select>
      <button type="button" data-accion="posponer">Posponer</button>
      <button type="button" data-accion="dependencias">Dependencias</button>
      <button type="button" data-accion="eliminar">Eliminar</button>
    </div>
  `;

  li.querySelector('[data-accion="cambiar-estado"]').addEventListener('change', async (evento) => {
    const nuevoEstado = evento.target.value;
    if (nuevoEstado === 'completada') {
      completarTarea(tarea, estado.tareas);
    } else {
      tarea.estado = nuevoEstado;
      tarea.completada_en = null;
    }
    await persistirYNotificar();
  });

  const contenedorPanel = li.querySelector('.contenedor-panel-reprogramar');
  li.querySelector('[data-accion="posponer"]').addEventListener('click', () => {
    const yaAbierto = !contenedorPanel.hidden;
    contenedorPanel.innerHTML = '';
    contenedorPanel.hidden = true;
    if (yaAbierto) return;

    const panel = crearPanelReprogramar({
      onConfirmar: async (fechaHoraISO) => {
        reprogramarTareaConCascada(tarea, fechaHoraISO, estado.tareas);
        contenedorPanel.hidden = true;
        contenedorPanel.innerHTML = '';
        await persistirYNotificar();
      },
      onCancelar: () => {
        contenedorPanel.hidden = true;
        contenedorPanel.innerHTML = '';
      },
    });
    contenedorPanel.appendChild(panel);
    contenedorPanel.hidden = false;
  });

  const contenedorDependencias = li.querySelector('.contenedor-panel-dependencias');
  li.querySelector('[data-accion="dependencias"]').addEventListener('click', () => {
    const yaAbierto = !contenedorDependencias.hidden;
    contenedorDependencias.innerHTML = '';
    contenedorDependencias.hidden = true;
    if (yaAbierto) return;

    contenedorDependencias.appendChild(crearPanelDependencias(tarea));
    contenedorDependencias.hidden = false;
  });

  li.querySelector('[data-accion="eliminar"]').addEventListener('click', async () => {
    if (!confirm(`¿Eliminar la tarea "${tarea.nombre}"?`)) return;
    estado.tareas = estado.tareas.filter((t) => t.id !== tarea.id);
    estado.tareas.forEach((t) => {
      t.dependencias = (t.dependencias || []).filter((id) => id !== tarea.id);
    });
    await persistirYNotificar();
  });

  return li;
}

function crearPanelDependencias(tarea) {
  const panel = document.createElement('div');
  panel.className = 'panel-dependencias';

  const candidatas = estado.tareas.filter((t) => t.id !== tarea.id);
  if (candidatas.length === 0) {
    panel.innerHTML = '<p class="mensaje-vacio">No hay otras tareas para elegir como dependencia.</p>';
    return panel;
  }

  panel.innerHTML = `
    <p class="panel-reprogramar-etiqueta">Esta tarea depende de:</p>
    <ul class="checklist-dependencias">
      ${candidatas
        .map(
          (candidata) => `
            <li>
              <label>
                <input type="checkbox" value="${candidata.id}" ${
                  (tarea.dependencias || []).includes(candidata.id) ? 'checked' : ''
                } />
                ${escaparHtml(candidata.nombre)} ${candidata.estado === 'completada' ? '(completada)' : ''}
              </label>
            </li>`
        )
        .join('')}
    </ul>
  `;

  panel.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
    checkbox.addEventListener('change', async () => {
      const candidatoId = checkbox.value;
      if (checkbox.checked) {
        if (!puedeAgregarDependencia(tarea.id, candidatoId, estado.tareas)) {
          checkbox.checked = false;
          alert('No se puede agregar esa dependencia (auto-referencia o ciclo directo entre ambas tareas).');
          return;
        }
        tarea.dependencias = [...(tarea.dependencias || []), candidatoId];
      } else {
        tarea.dependencias = (tarea.dependencias || []).filter((id) => id !== candidatoId);
      }
      await persistirYNotificar();
    });
  });

  return panel;
}
