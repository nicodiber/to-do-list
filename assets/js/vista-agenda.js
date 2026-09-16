import { estado, persistirYNotificar } from './almacenamiento.js';
import { ETIQUETAS_ESTADO, ETIQUETAS_UNIDAD_MANTENIMIENTO, ETIQUETAS_IMPORTANCIA, ICONOS_IMPORTANCIA } from './modelos.js';
import { hoyISO, fechaISOMasDias, formatearFecha, formatearFechaHora, escaparHtml } from './utilidades.js';
import { crearPanelReprogramar } from './reprogramar.js';
import { reprogramarTareaConCascada, tareaEstaBloqueada, compararPorPrioridad } from './tareas-logica.js';
import { evaluarClimaTarea } from './clima.js';
import { obtenerUbicacionActual, establecerUbicacionActual } from './ubicacion-actual.js';

const NOMBRES_DIA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export function fechaDeReferencia(tarea) {
  if (tarea.tarea_fecha_hora_agendada) return tarea.tarea_fecha_hora_agendada.slice(0, 10);
  if (tarea.tarea_fecha_limite) return tarea.tarea_fecha_limite;
  if (tarea.tarea_fecha_sugerida) return tarea.tarea_fecha_sugerida;
  return null;
}

/**
 * Vista de agenda genérica: agrupa las tareas pendientes por día (según
 * fecha_hora_agendada > fecha_limite > fecha_sugerida, en ese orden) para
 * los próximos `cantidadDias`, empezando hoy. La usan las vistas de 3 y 8
 * días para no duplicar la lógica de agrupamiento.
 */
export function renderVistaAgenda(contenedor, cantidadDias) {
  const hoy = hoyISO();
  const dias = Array.from({ length: cantidadDias }, (_, i) => fechaISOMasDias(i, hoy));
  const filtroUbicacion = obtenerUbicacionActual();

  const pendientesActivas = estado.tareas
    .filter((t) => t.tarea_estado !== 'completada')
    .filter((t) => !filtroUbicacion || t.ubicacion_id === filtroUbicacion);
  const porDia = new Map(dias.map((d) => [d, []]));
  pendientesActivas.forEach((tarea) => {
    const fecha = fechaDeReferencia(tarea);
    if (fecha && porDia.has(fecha)) porDia.get(fecha).push(tarea);
  });

  contenedor.innerHTML = `
    <h2>Próximos ${cantidadDias} días</h2>
    <p class="ayuda">Tareas agendadas, con fecha límite o sugerida en este período — para anticipar cuellos de botella antes de que se conviertan en urgencias.</p>
    ${
      estado.ubicaciones.length > 0
        ? `<label class="filtro-ubicacion-hoy">¿Dónde estás?
            <select id="filtro-ubicacion-agenda">
              <option value="">Cualquier ubicación</option>
              ${estado.ubicaciones
                .map((u) => `<option value="${u.ubicacion_id}" ${filtroUbicacion === u.ubicacion_id ? 'selected' : ''}>${escaparHtml(u.ubicacion_nombre)}</option>`)
                .join('')}
            </select>
          </label>`
        : ''
    }
    <div class="agenda"></div>
  `;

  const selectFiltroUbicacion = contenedor.querySelector('#filtro-ubicacion-agenda');
  if (selectFiltroUbicacion) {
    selectFiltroUbicacion.addEventListener('change', (evento) => {
      establecerUbicacionActual(evento.target.value);
      renderVistaAgenda(contenedor, cantidadDias);
    });
  }

  const contenedorAgenda = contenedor.querySelector('.agenda');
  dias.forEach((fechaDia) => {
    contenedorAgenda.appendChild(renderColumnaDia(fechaDia, hoy, porDia.get(fechaDia)));
  });
}

function renderColumnaDia(fechaDia, hoy, tareasDelDia) {
  const seccion = document.createElement('section');
  seccion.className = 'columna-dia' + (fechaDia === hoy ? ' es-hoy' : '');
  const fechaObj = new Date(fechaDia + 'T00:00:00');
  const nombreDia = fechaDia === hoy ? 'Hoy' : NOMBRES_DIA[fechaObj.getDay()];

  seccion.innerHTML = `
    <h3>${nombreDia} <span class="fecha-columna">${formatearFecha(fechaDia)}</span></h3>
    <ul class="lista-tareas"></ul>
  `;

  const lista = seccion.querySelector('ul');
  if (tareasDelDia.length === 0) {
    lista.innerHTML = '<p class="mensaje-vacio">Sin tareas para este día.</p>';
  } else {
    tareasDelDia
      .sort(
        (a, b) =>
          (a.tarea_fecha_hora_agendada || '').localeCompare(b.tarea_fecha_hora_agendada || '') ||
          compararPorPrioridad(a, b, estado.categorias)
      )
      .forEach((tarea) => lista.appendChild(renderTarjetaTarea(tarea)));
  }

  return seccion;
}

function renderTarjetaTarea(tarea) {
  const categoria = estado.categorias.find((c) => c.categoria_id === tarea.categoria_id);
  const subcategoria = estado.subcategorias.find((s) => s.subcategoria_id === tarea.subcategoria_id);
  const ubicacion = estado.ubicaciones.find((u) => u.ubicacion_id === tarea.ubicacion_id);
  const { bloqueada, bloqueantes } = tareaEstaBloqueada(tarea, estado.tareas);

  const li = document.createElement('li');
  li.className = 'item-tarea' + (bloqueada ? ' bloqueada' : '');
  li.innerHTML = `
    <div class="item-tarea-info">
      <strong>${escaparHtml(tarea.tarea_nombre)}</strong>
      <span class="etiquetas">
        <span class="etiqueta-fecha">${ICONOS_IMPORTANCIA[tarea.tarea_importancia] || ICONOS_IMPORTANCIA.media} ${
          ETIQUETAS_IMPORTANCIA[tarea.tarea_importancia] || ETIQUETAS_IMPORTANCIA.media
        }</span>
        ${categoria ? `<span class="etiqueta" style="background:${subcategoria?.subcategoria_color ?? categoria.categoria_color}">${escaparHtml(categoria.categoria_nombre)}</span>` : ''}
        ${tarea.tarea_fecha_hora_agendada ? `<span class="etiqueta-fecha etiqueta-agendada">${formatearFechaHora(tarea.tarea_fecha_hora_agendada)}</span>` : ''}
        ${tarea.tarea_fecha_limite ? `<span class="etiqueta-fecha">Límite: ${formatearFecha(tarea.tarea_fecha_limite)}</span>` : ''}
        ${tarea.tarea_fecha_sugerida ? `<span class="etiqueta-fecha">Sugerida: ${formatearFecha(tarea.tarea_fecha_sugerida)}</span>` : ''}
        <span class="etiqueta-fecha">${ETIQUETAS_ESTADO[tarea.tarea_estado]}</span>
        ${
          tarea.tarea_mantenimiento
            ? `<span class="etiqueta-fecha etiqueta-mantenimiento">🔁 cada ${tarea.tarea_mantenimiento.cantidad} ${ETIQUETAS_UNIDAD_MANTENIMIENTO[tarea.tarea_mantenimiento.unidad]}</span>`
            : ''
        }
        ${ubicacion ? `<span class="etiqueta-fecha">📍 ${escaparHtml(ubicacion.ubicacion_nombre)}</span>` : ''}
        ${tarea.tarea_recompensa ? `<span class="etiqueta-fecha">🎁 ${escaparHtml(tarea.tarea_recompensa)}</span>` : ''}
        ${tarea.tarea_costo_estimado ? `<span class="etiqueta-fecha">💰 $${tarea.tarea_costo_estimado}</span>` : ''}
        <span class="etiqueta-fecha etiqueta-clima" hidden></span>
      </span>
      ${
        bloqueada
          ? `<p class="aviso-bloqueada">Bloqueada por: ${bloqueantes.map((b) => escaparHtml(b.tarea_nombre)).join(', ')}</p>`
          : ''
      }
      <div class="contenedor-panel-reprogramar" hidden></div>
    </div>
    <div class="item-tarea-acciones">
      <button type="button" data-accion="posponer">Posponer</button>
    </div>
  `;

  const etiquetaClima = li.querySelector('.etiqueta-clima');
  evaluarClimaTarea(tarea).then((resultado) => {
    if (!resultado || resultado.favorable) return;
    etiquetaClima.textContent = `🌧️ Lluvia probable (${resultado.probabilidadLluvia}%) — considerá posponer`;
    etiquetaClima.hidden = false;
  });

  const contenedorPanel = li.querySelector('.contenedor-panel-reprogramar');
  li.querySelector('[data-accion="posponer"]').addEventListener('click', () => {
    const yaAbierto = !contenedorPanel.hidden;
    contenedorPanel.innerHTML = '';
    contenedorPanel.hidden = true;
    if (yaAbierto) return;

    const panel = crearPanelReprogramar({
      diasHabiles: tarea.tarea_dias_habiles,
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

  return li;
}
