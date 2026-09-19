import { estado, persistirYNotificar } from '../assets/js/almacenamiento.js';
import { crearTarea, NIVELES_IMPORTANCIA, ETIQUETAS_IMPORTANCIA, ICONOS_IMPORTANCIA, ETIQUETAS_UNIDAD_MANTENIMIENTO } from '../assets/js/modelos.js';
import { formatearFechaOFechaHora, esVencida, noPuedeEmpezarTodavia, escaparHtml, arbolCategorias, caminoCategoria } from '../assets/js/utilidades.js';
import { crearPanelReprogramar, DIAS_SEMANA } from '../assets/js/reprogramar.js';
import {
  cumplirTarea,
  reabrirTarea,
  eliminarTarea,
  reprogramarTareaConCascada,
  compararPorPrioridad,
  calcularEnfoque8020,
  esTareaAccionable,
} from '../assets/js/tareas-logica.js';
import { aplicarEnlace } from '../assets/js/dependencias.js';
import { htmlFormularioTarea, conectarFormularioTarea, leerFormularioTarea, validarFormularioTarea } from '../assets/js/formulario-tarea.js';
import { abrirEdicionTarea } from '../assets/js/modal-tarea.js';
import { capturarBorradores, restaurarBorradores } from '../assets/js/borradores.js';
import { ofrecerExportarACalendar } from '../assets/js/exportar-calendar.js';
import { construirPromptPrioridades, parsearRespuestaPrioridades } from '../assets/js/ia-conectable.js';
import { obtenerUbicacionActual, establecerUbicacionActual } from '../assets/js/ubicacion-actual.js';

const ESTADOS_SELECCIONABLES = ['pendiente', 'completada'];
const ETIQUETAS_ESTADO_SELECCIONABLE = { pendiente: 'Pendiente', completada: 'Completada' };
const SELECTOR_BORRADOR = '[data-conservar-borrador]';

let filtroCategoria = '';
let filtroEstado = '';
let filtroImportancia = '';
let agruparPorCategoria = false;

/** Redibuja la vista (por ejemplo al cambiar un filtro) sin perder lo que hay escrito en el alta. */
function redibujar(contenedor) {
  const captura = capturarBorradores(contenedor, { soloEn: SELECTOR_BORRADOR });
  renderVistaTareas(contenedor);
  restaurarBorradores(contenedor, captura);
}

export function renderVistaTareas(contenedor) {
  const filtroUbicacion = obtenerUbicacionActual();
  contenedor.innerHTML = `
    <h2>Tareas</h2>
    <form id="form-alta" class="formulario-tarea formulario-alta" data-conservar-borrador>
      ${htmlFormularioTarea(null, { modo: 'alta', botonesNombre: '<button type="submit" class="boton-primario">Agregar</button>' })}
    </form>

    <div class="filtros">
      <label>Categoría
        <select id="filtro-categoria">
          <option value="">Todas</option>
          ${arbolCategorias(estado.categorias)
            .map(
              ({ categoria, profundidad }) =>
                `<option value="${categoria.categoria_id}" ${filtroCategoria === categoria.categoria_id ? 'selected' : ''}>${'　'.repeat(profundidad)}${escaparHtml(categoria.categoria_nombre)}</option>`
            )
            .join('')}
        </select>
      </label>
      <label>Estado
        <select id="filtro-estado">
          <option value="">Todos</option>
          <option value="bloqueada" ${filtroEstado === 'bloqueada' ? 'selected' : ''}>Bloqueada</option>
          <option value="pendiente" ${filtroEstado === 'pendiente' ? 'selected' : ''}>Pendiente</option>
          <option value="completada" ${filtroEstado === 'completada' ? 'selected' : ''}>Completada</option>
        </select>
      </label>
      <label>Ubicación
        <select id="filtro-ubicacion">
          <option value="">Todas</option>
          ${estado.ubicaciones
            .map((u) => `<option value="${u.ubicacion_id}" ${filtroUbicacion === u.ubicacion_id ? 'selected' : ''}>${escaparHtml(u.ubicacion_nombre)}</option>`)
            .join('')}
        </select>
      </label>
      <label>Importancia
        <select id="filtro-importancia">
          <option value="">Todas</option>
          ${NIVELES_IMPORTANCIA.map(
            (nivel) =>
              `<option value="${nivel}" ${filtroImportancia === nivel ? 'selected' : ''}>${ICONOS_IMPORTANCIA[nivel]} ${ETIQUETAS_IMPORTANCIA[nivel]}</option>`
          ).join('')}
        </select>
      </label>
      <label class="opcion-mantenimiento">
        <input type="checkbox" id="toggle-agrupar-categoria" ${agruparPorCategoria ? 'checked' : ''} />
        Agrupar por categoría
      </label>
      <button type="button" id="boton-ia-prioridades">Reestructurar prioridades con IA</button>
    </div>

    <div id="contenedor-panel-ia-prioridades" hidden></div>

    <ul id="lista-tareas" class="lista-tareas"></ul>
  `;

  // Un solo formulario: con solo el nombre crea una tarea rápida; con más campos, la completa.
  const formulario = contenedor.querySelector('#form-alta');
  conectarFormularioTarea(formulario, { modo: 'alta' });
  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const leido = leerFormularioTarea(formulario);
    if (!leido.campos.tarea_nombre) return;

    const validacion = validarFormularioTarea(leido);
    if (!validacion.ok) {
      alert(validacion.motivo);
      return;
    }
    const nueva = crearTarea(leido.campos);
    estado.tareas.push(nueva);
    const enlace = aplicarEnlace(nueva.tarea_id, { previaId: leido.previaId, proximaId: leido.proximaId }, estado.tareas);
    if (!enlace.ok) {
      // Enlace contradictorio: no se crea la tarea ni se limpia el formulario, para que el usuario reajuste.
      estado.tareas = estado.tareas.filter((t) => t.tarea_id !== nueva.tarea_id);
      alert(enlace.motivo);
      return;
    }
    await persistirYNotificar();

    // La vista se redibujó conservando lo escrito (borrador): ahora sí se limpia para la próxima tarea.
    const nuevoFormulario = document.querySelector('#form-alta');
    if (nuevoFormulario) {
      nuevoFormulario.reset();
      nuevoFormulario.tarea_mantenimiento.dispatchEvent(new Event('change'));
      nuevoFormulario.tarea_nombre.focus();
    }
  });

  contenedor.querySelector('#filtro-categoria').addEventListener('change', (evento) => {
    filtroCategoria = evento.target.value;
    redibujar(contenedor);
  });
  contenedor.querySelector('#filtro-estado').addEventListener('change', (evento) => {
    filtroEstado = evento.target.value;
    redibujar(contenedor);
  });
  contenedor.querySelector('#filtro-ubicacion').addEventListener('change', (evento) => {
    establecerUbicacionActual(evento.target.value);
    redibujar(contenedor);
  });
  contenedor.querySelector('#filtro-importancia').addEventListener('change', (evento) => {
    filtroImportancia = evento.target.value;
    redibujar(contenedor);
  });
  contenedor.querySelector('#toggle-agrupar-categoria').addEventListener('change', (evento) => {
    agruparPorCategoria = evento.target.checked;
    redibujar(contenedor);
  });

  const contenedorPanelIA = contenedor.querySelector('#contenedor-panel-ia-prioridades');
  contenedor.querySelector('#boton-ia-prioridades').addEventListener('click', () => {
    const yaAbierto = !contenedorPanelIA.hidden;
    contenedorPanelIA.innerHTML = '';
    contenedorPanelIA.hidden = true;
    if (yaAbierto) return;

    contenedorPanelIA.appendChild(crearPanelIAPrioridades());
    contenedorPanelIA.hidden = false;
  });

  const listaTareas = contenedor.querySelector('#lista-tareas');
  const enfoqueIds = new Set(calcularEnfoque8020(estado.tareas, estado.categorias).map((t) => t.tarea_id));
  const tareasFiltradas = estado.tareas
    .filter((t) => !filtroCategoria || t.categoria_id === filtroCategoria)
    .filter((t) => !filtroEstado || t.tarea_estado === filtroEstado)
    .filter((t) => !filtroUbicacion || t.ubicacion_id === filtroUbicacion)
    .filter((t) => !filtroImportancia || t.tarea_importancia === filtroImportancia)
    .slice()
    .sort((a, b) => compararPorPrioridad(a, b, estado.categorias));

  if (tareasFiltradas.length === 0) {
    listaTareas.innerHTML = '<p class="mensaje-vacio">No hay tareas que coincidan con el filtro.</p>';
  } else if (!agruparPorCategoria) {
    tareasFiltradas.forEach((tarea) => listaTareas.appendChild(renderTarea(tarea, enfoqueIds)));
  } else {
    arbolCategorias(estado.categorias).forEach(({ categoria }) => {
      const tareasDeCategoria = tareasFiltradas.filter((t) => t.categoria_id === categoria.categoria_id);
      if (tareasDeCategoria.length === 0) return;
      listaTareas.appendChild(crearSeparadorCategoria(caminoCategoria(categoria, estado.categorias), categoria.categoria_color));
      tareasDeCategoria.forEach((tarea) => listaTareas.appendChild(renderTarea(tarea, enfoqueIds)));
    });
    const tareasSinCategoria = tareasFiltradas.filter((t) => !t.categoria_id);
    if (tareasSinCategoria.length > 0) {
      listaTareas.appendChild(crearSeparadorCategoria('Sin categoría'));
      tareasSinCategoria.forEach((tarea) => listaTareas.appendChild(renderTarea(tarea, enfoqueIds)));
    }
  }
}

function crearSeparadorCategoria(nombre, color) {
  const li = document.createElement('li');
  li.className = 'separador-categoria';
  li.style.setProperty('--color-separador', color || '#888');
  li.textContent = nombre;
  return li;
}

function renderTarea(tarea, enfoqueIds) {
  const categoria = estado.categorias.find((c) => c.categoria_id === tarea.categoria_id);
  const ubicacion = estado.ubicaciones.find((u) => u.ubicacion_id === tarea.ubicacion_id);
  const dependeDe = tarea.tarea_dependiente ? estado.tareas.find((t) => t.tarea_id === tarea.tarea_dependiente) : null;
  const bloqueada = tarea.tarea_estado === 'bloqueada';

  const li = document.createElement('li');
  const clases = ['item-tarea'];
  if (esVencida(tarea.tarea_fecha_limite) && tarea.tarea_estado !== 'completada') clases.push('vencida');
  if (noPuedeEmpezarTodavia(tarea.tarea_fecha_inicio_habilitada)) clases.push('aun-no-disponible');
  if (bloqueada) clases.push('bloqueada');
  li.className = clases.join(' ');
  li.dataset.id = tarea.tarea_id;
  li.innerHTML = `
    <div class="item-tarea-info">
      <strong>${escaparHtml(tarea.tarea_nombre)}</strong>
      <span class="etiquetas">
        ${tarea.tarea_importancia ? `<span class="etiqueta-fecha">${ICONOS_IMPORTANCIA[tarea.tarea_importancia]} ${ETIQUETAS_IMPORTANCIA[tarea.tarea_importancia]}</span>` : ''}
        ${enfoqueIds && enfoqueIds.has(tarea.tarea_id) ? `<span class="etiqueta-fecha etiqueta-enfoque">🎯 Foco 80/20</span>` : ''}
        ${categoria ? `<span class="etiqueta" style="background:${categoria.categoria_color}">${escaparHtml(caminoCategoria(categoria, estado.categorias))}</span>` : ''}
        ${tarea.tarea_fecha_inicio_habilitada ? `<span class="etiqueta-fecha">Desde: ${formatearFechaOFechaHora(tarea.tarea_fecha_inicio_habilitada)}</span>` : ''}
        ${tarea.tarea_fecha_sugerida ? `<span class="etiqueta-fecha">Sugerida: ${formatearFechaOFechaHora(tarea.tarea_fecha_sugerida)}</span>` : ''}
        ${tarea.tarea_fecha_limite ? `<span class="etiqueta-fecha">Límite: ${formatearFechaOFechaHora(tarea.tarea_fecha_limite)}</span>` : ''}
        ${tarea.tarea_duracion_min ? `<span class="etiqueta-fecha">${tarea.tarea_duracion_min} min</span>` : ''}
        ${tarea.tarea_costo_estimado ? `<span class="etiqueta-fecha">💰 $${tarea.tarea_costo_estimado}</span>` : ''}
        ${
          tarea.tarea_mantenimiento && tarea.tarea_mantenimiento_intervalo
            ? `<span class="etiqueta-fecha etiqueta-mantenimiento">🔁 cada ${tarea.tarea_mantenimiento_intervalo.cantidad} ${ETIQUETAS_UNIDAD_MANTENIMIENTO[tarea.tarea_mantenimiento_intervalo.unidad]}</span>`
            : ''
        }
        ${
          tarea.tarea_dias_habiles && tarea.tarea_dias_habiles.length > 0
            ? `<span class="etiqueta-fecha">📅 ${tarea.tarea_dias_habiles
                .slice()
                .sort()
                .map((i) => DIAS_SEMANA[i].slice(0, 3))
                .join(', ')}</span>`
            : ''
        }
        ${ubicacion ? `<span class="etiqueta-fecha">📍 ${escaparHtml(ubicacion.ubicacion_nombre)}</span>` : ''}
      </span>
      ${bloqueada && dependeDe ? `<p class="aviso-bloqueada">Bloqueada por: ${escaparHtml(dependeDe.tarea_nombre)}</p>` : ''}
      ${tarea.tarea_descripcion ? `<p class="notas-tarea">${escaparHtml(tarea.tarea_descripcion)}</p>` : ''}
      ${
        (tarea.tarea_checklist || []).length > 0
          ? `<ul class="checklist-tarjeta">${tarea.tarea_checklist
              .map(
                (item, indice) =>
                  `<li><label><input type="checkbox" data-checklist-indice="${indice}" ${item.hecho ? 'checked' : ''} /> ${escaparHtml(item.texto)}</label></li>`
              )
              .join('')}</ul>`
          : ''
      }
      <div class="contenedor-panel-reprogramar" hidden></div>
      <div class="contenedor-panel-mejora" hidden></div>
    </div>
    <div class="item-tarea-acciones">
      ${
        bloqueada
          ? `<span class="etiqueta-fecha etiqueta-bloqueada">Bloqueada</span>`
          : `<select data-accion="cambiar-estado">
              ${ESTADOS_SELECCIONABLES.map((e) => `<option value="${e}" ${e === tarea.tarea_estado ? 'selected' : ''}>${ETIQUETAS_ESTADO_SELECCIONABLE[e]}</option>`).join('')}
            </select>`
      }
      <button type="button" data-accion="posponer">Posponer</button>
      <button type="button" data-accion="editar">Editar</button>
      <button type="button" data-accion="eliminar">Eliminar</button>
    </div>
  `;

  const contenedorMejora = li.querySelector('.contenedor-panel-mejora');
  li.querySelector('[data-accion="cambiar-estado"]')?.addEventListener('change', async (evento) => {
    const nuevoEstado = evento.target.value;
    if (nuevoEstado === 'completada' && tarea.tarea_mantenimiento) {
      contenedorMejora.innerHTML = `
        <div class="panel-cierre">
          <label>¿Qué podrías mejorar la próxima vez? (opcional)
            <input type="text" data-campo="mejora" />
          </label>
          <button type="button" data-accion="confirmar-mejora" class="boton-primario">Confirmar</button>
        </div>
      `;
      contenedorMejora.hidden = false;
      contenedorMejora.querySelector('[data-accion="confirmar-mejora"]').addEventListener('click', async () => {
        const notaMejora = contenedorMejora.querySelector('[data-campo="mejora"]').value.trim();
        cumplirTarea(tarea, estado, { notaMejora });
        contenedorMejora.hidden = true;
        contenedorMejora.innerHTML = '';
        await persistirYNotificar();
        ofrecerExportarACalendar(tarea);
      });
      return;
    }
    if (nuevoEstado === 'completada') {
      cumplirTarea(tarea, estado);
      await persistirYNotificar();
      ofrecerExportarACalendar(tarea);
      return;
    }
    const { copiaConservada } = reabrirTarea(tarea, estado);
    await persistirYNotificar();
    if (copiaConservada) {
      alert(
        `Se reabrió «${tarea.tarea_nombre}». La copia que se había generado al completarla no se borró porque ya se modificó o hay tareas que dependen de ella: revisá que no quede duplicada.`
      );
    }
  });

  const contenedorPanel = li.querySelector('.contenedor-panel-reprogramar');
  li.querySelector('[data-accion="posponer"]').addEventListener('click', () => {
    const yaAbierto = !contenedorPanel.hidden;
    contenedorPanel.innerHTML = '';
    contenedorPanel.hidden = true;
    if (yaAbierto) return;

    const panel = crearPanelReprogramar({
      diasHabiles: tarea.tarea_dias_habiles,
      onConfirmar: async (fechaSugeridaISO) => {
        reprogramarTareaConCascada(tarea, fechaSugeridaISO, estado.tareas);
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

  li.querySelector('[data-accion="editar"]').addEventListener('click', () => abrirEdicionTarea(tarea.tarea_id));

  li.querySelectorAll('[data-checklist-indice]').forEach((casilla) => {
    casilla.addEventListener('change', async () => {
      tarea.tarea_checklist[Number(casilla.dataset.checklistIndice)].hecho = casilla.checked;
      await persistirYNotificar();
    });
  });

  li.querySelector('[data-accion="eliminar"]').addEventListener('click', async () => {
    if (!confirm(`¿Eliminar la tarea "${tarea.tarea_nombre}"?`)) return;
    eliminarTarea(tarea, estado);
    await persistirYNotificar();
  });

  return li;
}

function crearPanelIAPrioridades() {
  const panel = document.createElement('div');
  panel.className = 'panel-dependencias';

  const tareasAccionables = estado.tareas.filter((t) => esTareaAccionable(t));
  if (tareasAccionables.length === 0) {
    panel.innerHTML = '<p class="mensaje-vacio">No hay tareas accionables ahora mismo para reestructurar.</p>';
    return panel;
  }

  const prompt = construirPromptPrioridades(tareasAccionables, estado.categorias);

  panel.innerHTML = `
    <p class="panel-reprogramar-etiqueta">1. Copiá este prompt y pegalo en tu asistente de IA (ChatGPT, Claude, etc.):</p>
    <textarea class="textarea-ia" readonly rows="6">${escaparHtml(prompt)}</textarea>
    <button type="button" data-accion="copiar-prompt">Copiar prompt</button>
    <p class="panel-reprogramar-etiqueta">2. Pegá acá la respuesta (el JSON) que te devolvió:</p>
    <textarea class="textarea-ia" data-campo="respuesta" rows="6" placeholder='[{ "tarea_id": "...", "tarea_importancia": "urgente" }]'></textarea>
    <button type="button" data-accion="previsualizar" class="boton-primario">Previsualizar</button>
    <div class="contenedor-preview-ia"></div>
  `;

  panel.querySelector('[data-accion="copiar-prompt"]').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(prompt);
    } catch {
      alert('No se pudo copiar automáticamente. Seleccioná el texto del prompt manualmente.');
    }
  });

  const contenedorPreview = panel.querySelector('.contenedor-preview-ia');
  panel.querySelector('[data-accion="previsualizar"]').addEventListener('click', () => {
    const textoRespuesta = panel.querySelector('[data-campo="respuesta"]').value;
    let cambios;
    try {
      cambios = parsearRespuestaPrioridades(textoRespuesta, tareasAccionables);
    } catch (error) {
      contenedorPreview.innerHTML = `<p class="aviso-bloqueada">${escaparHtml(error.message)}</p>`;
      return;
    }

    contenedorPreview.innerHTML = `
      <p class="panel-reprogramar-etiqueta">3. Elegí qué cambios aplicar:</p>
      <ul class="checklist-dependencias">
        ${cambios
          .map(
            (c, i) => `
              <li>
                <label>
                  <input type="checkbox" data-indice="${i}" checked />
                  ${escaparHtml(c.tarea.tarea_nombre)}: ${c.tarea.tarea_importancia ? `${ICONOS_IMPORTANCIA[c.tarea.tarea_importancia]} ${ETIQUETAS_IMPORTANCIA[c.tarea.tarea_importancia]}` : 'Sin definir'}
                  → ${ICONOS_IMPORTANCIA[c.importanciaSugerida]} ${ETIQUETAS_IMPORTANCIA[c.importanciaSugerida]}
                </label>
              </li>`
          )
          .join('')}
      </ul>
      <button type="button" data-accion="aplicar-cambios" class="boton-primario">Aplicar cambios seleccionados</button>
    `;

    contenedorPreview.querySelector('[data-accion="aplicar-cambios"]').addEventListener('click', async () => {
      const seleccionados = [...contenedorPreview.querySelectorAll('input[type="checkbox"]:checked')].map(
        (cb) => cambios[Number(cb.dataset.indice)]
      );
      seleccionados.forEach((c) => {
        c.tarea.tarea_importancia = c.importanciaSugerida;
      });
      await persistirYNotificar();
    });
  });

  return panel;
}
