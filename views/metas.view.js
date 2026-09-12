import { estado, persistirYNotificar } from '../assets/js/almacenamiento.js';
import { crearMeta, PLAZOS_META, ETIQUETAS_PLAZO, ETIQUETAS_ESTADO } from '../assets/js/modelos.js';
import { escaparHtml, formatearFecha } from '../assets/js/utilidades.js';

export function renderVistaMetas(contenedor) {
  contenedor.innerHTML = `
    <h2>Metas</h2>
    <p class="ayuda">Tus objetivos de corto/mediano/largo plazo. Asociá tareas a una meta desde el botón "Metas" en la vista Tareas.</p>
    <form id="form-nueva-meta" class="formulario-tarea">
      <input type="text" name="nombre" placeholder="Nueva meta" required />
      <select name="plazo">
        ${PLAZOS_META.map((p) => `<option value="${p}">${ETIQUETAS_PLAZO[p]}</option>`).join('')}
      </select>
      <label>Fecha objetivo <input type="date" name="fecha_objetivo" /></label>
      <input type="text" name="descripcion" placeholder="Descripción (opcional)" />
      <button type="submit">Agregar meta</button>
    </form>
    <div id="lista-metas" class="lista-categorias"></div>
  `;

  contenedor.querySelector('#form-nueva-meta').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const formulario = evento.target;
    const nombre = formulario.nombre.value.trim();
    if (!nombre) return;
    estado.metas.push(
      crearMeta({
        nombre,
        plazo: formulario.plazo.value,
        fecha_objetivo: formulario.fecha_objetivo.value,
        descripcion: formulario.descripcion.value.trim(),
      })
    );
    await persistirYNotificar();
  });

  const listaMetas = contenedor.querySelector('#lista-metas');
  if (estado.metas.length === 0) {
    listaMetas.innerHTML = '<p class="mensaje-vacio">Todavía no creaste ninguna meta.</p>';
    return;
  }

  estado.metas.forEach((meta) => listaMetas.appendChild(renderMeta(meta)));
}

function renderMeta(meta) {
  const tareasAsociadas = estado.tareas.filter((t) => (t.metas_ids || []).includes(meta.id));
  const completadas = tareasAsociadas.filter((t) => t.estado === 'completada');
  const porcentaje = tareasAsociadas.length === 0 ? 0 : Math.round((completadas.length / tareasAsociadas.length) * 100);

  const tarjeta = document.createElement('article');
  tarjeta.className = 'tarjeta-categoria';
  tarjeta.innerHTML = `
    <div class="encabezado-categoria">
      <strong>${escaparHtml(meta.nombre)}</strong>
      <span class="acciones-prioridad">
        <button type="button" data-accion="eliminar-meta" title="Eliminar meta">✕</button>
      </span>
    </div>
    <span class="etiquetas">
      <span class="etiqueta-fecha">${ETIQUETAS_PLAZO[meta.plazo]}</span>
      ${meta.fecha_objetivo ? `<span class="etiqueta-fecha">Objetivo: ${formatearFecha(meta.fecha_objetivo)}</span>` : ''}
    </span>
    ${meta.descripcion ? `<p class="notas-tarea">${escaparHtml(meta.descripcion)}</p>` : ''}
    <div class="barra-progreso"><div class="barra-progreso-relleno" style="width: ${porcentaje}%"></div></div>
    <p class="notas-tarea">${completadas.length}/${tareasAsociadas.length} tareas completadas</p>
    <ul class="lista-subcategorias">
      ${tareasAsociadas
        .map(
          (t) =>
            `<li>${escaparHtml(t.nombre)} <span class="etiqueta-fecha">${ETIQUETAS_ESTADO[t.estado]}</span></li>`
        )
        .join('')}
    </ul>
  `;

  tarjeta.querySelector('[data-accion="eliminar-meta"]').addEventListener('click', async () => {
    if (!confirm(`¿Eliminar la meta "${meta.nombre}"? Las tareas asociadas quedan sin esta meta.`)) return;
    estado.tareas.forEach((tarea) => {
      tarea.metas_ids = (tarea.metas_ids || []).filter((id) => id !== meta.id);
    });
    estado.metas = estado.metas.filter((m) => m.id !== meta.id);
    await persistirYNotificar();
  });

  return tarjeta;
}
