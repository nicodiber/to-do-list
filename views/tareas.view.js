import { estado, persistirYNotificar } from '../assets/js/almacenamiento.js';
import { NIVELES_IMPORTANCIA, ETIQUETAS_IMPORTANCIA, ICONOS_IMPORTANCIA, ETIQUETAS_UNIDAD_MANTENIMIENTO } from '../assets/js/modelos.js';
import { formatearFechaOFechaHora, esVencida, noPuedeEmpezarTodavia, escaparHtml, arbolCategorias, caminoCategoria } from '../assets/js/utilidades.js';
import { crearPanelReprogramar, DIAS_SEMANA } from '../assets/js/reprogramar.js';
import { agregarBotonFlotante } from '../assets/js/boton-flotante.js';
import {
  cumplirTarea,
  reabrirTarea,
  eliminarTarea,
  reprogramarTareaConCascada,
  compararPorPrioridad,
  esTareaAccionable,
  ordenarConCadenas,
  asignarOrdenManual,
  motivoBloqueoOrdenManual,
} from '../assets/js/tareas-logica.js';
import {
  nombreConCategoria,
  htmlOpcionesCategoria,
  htmlOpcionesImportancia,
  htmlOpcionesDisfrute,
  htmlOpcionesMeta,
  htmlOpcionesPersona,
  htmlOpcionesUbicacion,
  htmlDiasHabiles,
  aplicarCamposATarea,
} from '../assets/js/formulario-tarea.js';
import { abrirDialogoFormulario } from '../assets/js/dialogo-formulario.js';
import { abrirEdicionTarea, abrirAltaTarea, copiaDeTarea } from '../assets/js/modal-tarea.js';
import { ofrecerExportarACalendar } from '../assets/js/exportar-calendar.js';
import { construirPromptPrioridades, parsearRespuestaPrioridades } from '../assets/js/ia-conectable.js';
import { obtenerUbicacionActual, establecerUbicacionActual } from '../assets/js/ubicacion-actual.js';
import { htmlChecklistTarjeta, conectarChecklistTarjeta } from '../assets/js/checklist-tarjeta.js';

const ESTADOS_SELECCIONABLES = ['pendiente', 'completada'];
const ETIQUETAS_ESTADO_SELECCIONABLE = { pendiente: 'Pendiente', completada: 'Completada' };
let filtroCategoria = '';
let filtroEstado = '';
let filtroImportancia = '';
let agruparPorCategoria = false;
// El desplegable "Completadas (N)" recuerda si estaba abierto entre redibujados.
let completadasAbiertas = false;
// Selección múltiple (edición masiva, v0.70.0): estado de la sesión, no un dato de la app.
let modoSeleccion = false;
let seleccionadas = new Set();

export function renderVistaTareas(contenedor) {
  const filtroUbicacion = obtenerUbicacionActual();
  // Si alguna tarea seleccionada se eliminó mientras tanto, se descarta sola.
  seleccionadas = new Set([...seleccionadas].filter((id) => estado.tareas.some((t) => t.tarea_id === id)));
  contenedor.innerHTML = `
    <h2>✅ Tareas</h2>
    <div class="filtros">
      <label title="Mostrar solo las tareas de esta categoría (y sus subcategorías)">🗂️ Categoría
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
      <label title="Mostrar solo las tareas en este estado">🚦 Estado
        <select id="filtro-estado">
          <option value="">Todos</option>
          <option value="bloqueada" ${filtroEstado === 'bloqueada' ? 'selected' : ''}>Bloqueada</option>
          <option value="pendiente" ${filtroEstado === 'pendiente' ? 'selected' : ''}>Pendiente</option>
          <option value="completada" ${filtroEstado === 'completada' ? 'selected' : ''}>Completada</option>
        </select>
      </label>
      <label title="Mostrar solo las tareas de este lugar">📍 Ubicación
        <select id="filtro-ubicacion">
          <option value="">Todas</option>
          ${estado.ubicaciones
            .map((u) => `<option value="${u.ubicacion_id}" ${filtroUbicacion === u.ubicacion_id ? 'selected' : ''}>${escaparHtml(u.ubicacion_nombre)}</option>`)
            .join('')}
        </select>
      </label>
      <label title="Mostrar solo las tareas con esta importancia">❗ Importancia
        <select id="filtro-importancia">
          <option value="">Todas</option>
          ${NIVELES_IMPORTANCIA.map(
            (nivel) =>
              `<option value="${nivel}" ${filtroImportancia === nivel ? 'selected' : ''}>${ICONOS_IMPORTANCIA[nivel]} ${ETIQUETAS_IMPORTANCIA[nivel]}</option>`
          ).join('')}
        </select>
      </label>
      <label class="interruptor" title="Separar la lista por categoría"><input type="checkbox" role="switch" id="toggle-agrupar-categoria" ${agruparPorCategoria ? 'checked' : ''} /><span class="interruptor-pista" aria-hidden="true"></span><span class="interruptor-texto">🧩 Agrupar por categoría</span><span class="interruptor-estado" aria-hidden="true"></span></label>
      <button title="Reordenar las prioridades con ayuda de tu IA" type="button" id="boton-ia-prioridades">🤖 Reestructurar prioridades con IA</button>
      <button title="Elegir varias tareas para editarlas juntas" type="button" id="boton-modo-seleccion" class="${modoSeleccion ? 'activo' : ''}">☑️ Seleccionar</button>
    </div>

    <div id="contenedor-panel-ia-prioridades" hidden></div>

    <div id="barra-seleccion" class="barra-seleccion" ${modoSeleccion ? '' : 'hidden'}>
      <span id="conteo-seleccion">0 seleccionadas</span>
      <button title="Editar los campos en común de las tareas elegidas" type="button" id="boton-editar-seleccion" class="boton-primario" disabled>✏️ Editar tareas seleccionadas</button>
      <button title="Salir del modo selección" type="button" id="boton-cancelar-seleccion">Cancelar</button>
    </div>

    <ul id="lista-tareas" class="lista-tareas"></ul>
  `;

  agregarBotonFlotante(contenedor, { titulo: 'Crear una tarea nueva (tecla N)', alClic: () => abrirAltaTarea() });

  contenedor.querySelector('#filtro-categoria').addEventListener('change', (evento) => {
    filtroCategoria = evento.target.value;
    renderVistaTareas(contenedor);
  });
  contenedor.querySelector('#filtro-estado').addEventListener('change', (evento) => {
    filtroEstado = evento.target.value;
    renderVistaTareas(contenedor);
  });
  contenedor.querySelector('#filtro-ubicacion').addEventListener('change', (evento) => {
    establecerUbicacionActual(evento.target.value);
    renderVistaTareas(contenedor);
  });
  contenedor.querySelector('#filtro-importancia').addEventListener('change', (evento) => {
    filtroImportancia = evento.target.value;
    renderVistaTareas(contenedor);
  });
  contenedor.querySelector('#toggle-agrupar-categoria').addEventListener('change', (evento) => {
    agruparPorCategoria = evento.target.checked;
    renderVistaTareas(contenedor);
  });

  contenedor.querySelector('#boton-modo-seleccion').addEventListener('click', () => {
    modoSeleccion = !modoSeleccion;
    if (!modoSeleccion) seleccionadas.clear();
    renderVistaTareas(contenedor);
  });
  const barraSeleccion = contenedor.querySelector('#barra-seleccion');
  const conteoSeleccion = contenedor.querySelector('#conteo-seleccion');
  const botonEditarSeleccion = contenedor.querySelector('#boton-editar-seleccion');
  contenedor.querySelector('#boton-cancelar-seleccion').addEventListener('click', () => {
    modoSeleccion = false;
    seleccionadas.clear();
    renderVistaTareas(contenedor);
  });
  const actualizarBarraSeleccion = () => {
    conteoSeleccion.textContent = `${seleccionadas.size} seleccionada${seleccionadas.size === 1 ? '' : 's'}`;
    botonEditarSeleccion.disabled = seleccionadas.size === 0;
  };
  botonEditarSeleccion.addEventListener('click', () => {
    const tareasElegidas = estado.tareas.filter((t) => seleccionadas.has(t.tarea_id));
    abrirEdicionMasiva(tareasElegidas, () => {
      modoSeleccion = false;
      seleccionadas.clear();
      renderVistaTareas(contenedor);
    });
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
  actualizarBarraSeleccion();

  const listaTareas = contenedor.querySelector('#lista-tareas');
  const tareasFiltradas = estado.tareas
    .filter((t) => !filtroCategoria || t.categoria_id === filtroCategoria)
    .filter((t) => !filtroEstado || t.tarea_estado === filtroEstado)
    .filter((t) => !filtroUbicacion || t.ubicacion_id === filtroUbicacion)
    .filter((t) => !filtroImportancia || t.tarea_importancia === filtroImportancia)
    .slice()
    .sort((a, b) => compararPorPrioridad(a, b, estado.categorias));

  // Cada bloqueada queda justo detrás de su previa (cadena junta, en el orden en que se va a poder hacer),
  // en vez de separada de las pendientes por prioridad individual.
  const activas = ordenarConCadenas(tareasFiltradas.filter((t) => t.tarea_estado !== 'completada'));
  const completadas = tareasFiltradas.filter((t) => t.tarea_estado === 'completada');

  if (tareasFiltradas.length === 0) {
    listaTareas.innerHTML = '<p class="mensaje-vacio">No hay tareas que coincidan con el filtro.</p>';
    return;
  }

  // El índice de ▲▼ siempre es el de este orden global (`activas`), aunque la pantalla las agrupe por categoría:
  // la prioridad manual es un concepto global, no por grupo visual.
  const indiceEn = (tarea) => activas.indexOf(tarea);

  if (!agruparPorCategoria) {
    activas.forEach((tarea) => listaTareas.appendChild(renderTarea(tarea, indiceEn(tarea), activas, actualizarBarraSeleccion)));
  } else {
    arbolCategorias(estado.categorias).forEach(({ categoria }) => {
      const tareasDeCategoria = activas.filter((t) => t.categoria_id === categoria.categoria_id);
      if (tareasDeCategoria.length === 0) return;
      listaTareas.appendChild(crearSeparadorCategoria(caminoCategoria(categoria, estado.categorias), categoria.categoria_color));
      tareasDeCategoria.forEach((tarea) => listaTareas.appendChild(renderTarea(tarea, indiceEn(tarea), activas, actualizarBarraSeleccion)));
    });
    const tareasSinCategoria = activas.filter((t) => !t.categoria_id);
    if (tareasSinCategoria.length > 0) {
      listaTareas.appendChild(crearSeparadorCategoria('Sin categoría'));
      tareasSinCategoria.forEach((tarea) => listaTareas.appendChild(renderTarea(tarea, indiceEn(tarea), activas, actualizarBarraSeleccion)));
    }
  }

  // Las completadas quedan plegadas al final para que la lista de trabajo no se llene con lo ya hecho.
  // Con el filtro Estado = Completada son lo único que hay, así que se muestran abiertas.
  if (completadas.length > 0) {
    const desplegable = document.createElement('details');
    desplegable.className = 'completadas-plegadas';
    desplegable.open = completadasAbiertas || filtroEstado === 'completada';
    desplegable.innerHTML = `<summary>Completadas (${completadas.length})</summary><ul class="lista-tareas"></ul>`;
    const listaCompletadas = desplegable.querySelector('ul');
    completadas.forEach((tarea) => listaCompletadas.appendChild(renderTarea(tarea)));
    desplegable.addEventListener('toggle', () => {
      if (filtroEstado !== 'completada') completadasAbiertas = desplegable.open;
    });
    listaTareas.appendChild(desplegable);
  }
}

function crearSeparadorCategoria(nombre, color) {
  const li = document.createElement('li');
  li.className = 'separador-categoria';
  li.style.setProperty('--color-separador', color || '#888');
  li.textContent = nombre;
  return li;
}

function renderTarea(tarea, indice = -1, activas = null, actualizarBarraSeleccion = () => {}) {
  const categoria = estado.categorias.find((c) => c.categoria_id === tarea.categoria_id);
  const ubicacion = estado.ubicaciones.find((u) => u.ubicacion_id === tarea.ubicacion_id);
  const meta = estado.metas.find((m) => m.meta_id === tarea.meta_id);
  const persona = estado.personas.find((per) => per.persona_id === tarea.persona_id);
  const dependeDe = tarea.tarea_dependiente ? estado.tareas.find((t) => t.tarea_id === tarea.tarea_dependiente) : null;
  const bloqueada = tarea.tarea_estado === 'bloqueada';
  const proxima = estado.tareas.find((t) => t.tarea_dependiente === tarea.tarea_id && t.tarea_estado !== 'completada');

  const li = document.createElement('li');
  const clases = ['item-tarea', 'item-tarea-tareas'];
  const vencida = esVencida(tarea.tarea_fecha_limite) && tarea.tarea_estado !== 'completada';
  if (vencida) clases.push('vencida');
  if (tarea.tarea_estado === 'completada') clases.push('completada');
  if (noPuedeEmpezarTodavia(tarea.tarea_fecha_inicio_habilitada)) clases.push('aun-no-disponible');
  if (bloqueada) clases.push('bloqueada');
  li.className = clases.join(' ');
  li.dataset.id = tarea.tarea_id;
  li.style.setProperty('--color-categoria', categoria ? categoria.categoria_color : 'var(--color-borde)');
  li.innerHTML = `
    ${modoSeleccion ? `<label class="item-tarea-check" title="Elegir para editar en bloque"><input type="checkbox" data-seleccionar="${tarea.tarea_id}" ${seleccionadas.has(tarea.tarea_id) ? 'checked' : ''} /></label>` : ''}
    <div class="item-tarea-info">
      <strong>${escaparHtml(tarea.tarea_nombre)}</strong>
      <span class="etiquetas">
        ${vencida ? '<span class="etiqueta-vencida">⚠️ Vencida</span>' : ''}
        ${tarea.tarea_importancia ? `<span class="etiqueta-fecha">${ICONOS_IMPORTANCIA[tarea.tarea_importancia]} ${ETIQUETAS_IMPORTANCIA[tarea.tarea_importancia]}</span>` : ''}
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
        ${meta ? `<span class="etiqueta-fecha">🏁 ${escaparHtml(meta.meta_nombre)}</span>` : ''}
        ${persona ? `<span class="etiqueta-fecha">👤 ${escaparHtml(persona.persona_nombre)}</span>` : ''}
      </span>
      ${bloqueada && dependeDe ? `<p class="aviso-bloqueada">⛓️ Bloqueada por: ${escaparHtml(nombreConCategoria(dependeDe))}</p>` : ''}
      ${!bloqueada && dependeDe ? `<p class="enlace-tarea">⬅️ Depende de: ${escaparHtml(nombreConCategoria(dependeDe))}${dependeDe.tarea_estado === 'completada' ? ' (completada)' : ''}</p>` : ''}
      ${proxima ? `<p class="enlace-tarea">➡️ Bloquea a: ${escaparHtml(nombreConCategoria(proxima))}</p>` : ''}
      ${tarea.tarea_descripcion ? `<p class="notas-tarea">${escaparHtml(tarea.tarea_descripcion)}</p>` : ''}
      ${htmlChecklistTarjeta(tarea)}
      <div class="contenedor-panel-reprogramar" hidden></div>
      <div class="contenedor-panel-mejora" hidden></div>
    </div>
    <div class="item-tarea-acciones">
      ${activas ? '<span class="acciones-prioridad"><button type="button" data-accion="subir-orden" title="Subir">▲</button><button type="button" data-accion="bajar-orden" title="Bajar">▼</button></span>' : ''}
      ${
        bloqueada
          ? `<span class="etiqueta-fecha etiqueta-bloqueada">Bloqueada</span>`
          : `<select data-accion="cambiar-estado">
              ${ESTADOS_SELECCIONABLES.map((e) => `<option value="${e}" ${e === tarea.tarea_estado ? 'selected' : ''}>${ETIQUETAS_ESTADO_SELECCIONABLE[e]}</option>`).join('')}
            </select>`
      }
      ${tarea.tarea_estado === 'completada' ? '' : '<button title="Posponer: elegir otra fecha para la tarea" type="button" data-accion="posponer">⏭️ Posponer</button>'}
      <button title="Editar la tarea" type="button" data-accion="editar">✏️ Editar</button>
      <button title="Crear una tarea nueva con los mismos datos (sin enlaces), para editar y guardar aparte" type="button" data-accion="duplicar">📄 Duplicar</button>
      <button title="Crear una tarea que bloquea a esta (mismos datos, nombre y descripción vacíos)" type="button" data-accion="crear-previa">⬅️ Crearle tarea previa</button>
      <button title="Crear una tarea que depende de esta (mismos datos, nombre y descripción vacíos)" type="button" data-accion="crear-posterior">➡️ Crearle tarea posterior</button>
      <button title="Eliminar (pide confirmación)" type="button" data-accion="eliminar">🗑️ Eliminar</button>
    </div>
  `;

  li.querySelector('[data-seleccionar]')?.addEventListener('change', (evento) => {
    if (evento.target.checked) seleccionadas.add(tarea.tarea_id);
    else seleccionadas.delete(tarea.tarea_id);
    actualizarBarraSeleccion();
  });

  if (activas) {
    const anterior = indice > 0 ? activas[indice - 1] : null;
    const siguiente = indice < activas.length - 1 ? activas[indice + 1] : null;
    const botonSubir = li.querySelector('[data-accion="subir-orden"]');
    const botonBajar = li.querySelector('[data-accion="bajar-orden"]');
    const motivoSubir = anterior ? motivoBloqueoOrdenManual(tarea, anterior, estado.categorias) : 'Ya es la primera.';
    const motivoBajar = siguiente ? motivoBloqueoOrdenManual(tarea, siguiente, estado.categorias) : 'Ya es la última.';
    botonSubir.disabled = !!motivoSubir;
    if (motivoSubir) botonSubir.title = motivoSubir;
    botonBajar.disabled = !!motivoBajar;
    if (motivoBajar) botonBajar.title = motivoBajar;
    botonSubir.addEventListener('click', async () => {
      if (!anterior) return;
      asignarOrdenManual(tarea, anterior, estado.tareas);
      await persistirYNotificar();
    });
    botonBajar.addEventListener('click', async () => {
      if (!siguiente) return;
      asignarOrdenManual(siguiente, tarea, estado.tareas);
      await persistirYNotificar();
    });
  }

  const contenedorMejora = li.querySelector('.contenedor-panel-mejora');
  li.querySelector('[data-accion="cambiar-estado"]')?.addEventListener('change', async (evento) => {
    const nuevoEstado = evento.target.value;
    if (nuevoEstado === 'completada' && tarea.tarea_mantenimiento) {
      contenedorMejora.innerHTML = `
        <div class="panel-cierre">
          <label>¿Qué podrías mejorar la próxima vez? (opcional)
            <input type="text" data-campo="mejora" />
          </label>
          <button title="Confirmar que se cumplió y guardar la nota" type="button" data-accion="confirmar-mejora" class="boton-primario">✔️ Confirmar</button>
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
  li.querySelector('[data-accion="posponer"]')?.addEventListener('click', () => {
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

  li.querySelector('[data-accion="duplicar"]').addEventListener('click', () => abrirAltaTarea(copiaDeTarea(tarea)));
  li.querySelector('[data-accion="crear-previa"]').addEventListener('click', () =>
    abrirAltaTarea(copiaDeTarea(tarea, { vaciarNombre: true }), { proximaId: tarea.tarea_id })
  );
  li.querySelector('[data-accion="crear-posterior"]').addEventListener('click', () =>
    abrirAltaTarea(copiaDeTarea(tarea, { vaciarNombre: true }), { previaId: tarea.tarea_id })
  );

  conectarChecklistTarjeta(li, tarea);

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
    <button title="Copiar el texto para pegarlo en tu IA" type="button" data-accion="copiar-prompt">📋 Copiar prompt</button>
    <p class="panel-reprogramar-etiqueta">2. Pegá acá la respuesta (el JSON) que te devolvió:</p>
    <textarea class="textarea-ia" data-campo="respuesta" rows="6" placeholder='[{ "tarea_id": "...", "tarea_importancia": "urgente" }]'></textarea>
    <button title="Ver lo que respondió la IA antes de aplicarlo" type="button" data-accion="previsualizar" class="boton-primario">👁️ Previsualizar</button>
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
      <button title="Aplicar los cambios tildados" type="button" data-accion="aplicar-cambios" class="boton-primario">✔️ Aplicar cambios seleccionados</button>
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

// ---------------------------------------------------------------------------
// Edición masiva (v0.70.0): aplicar el mismo cambio a varias tareas elegidas.
// ---------------------------------------------------------------------------

/** Saca la opción "＋ Crear nueva…" de un HTML de `<option>`: acá no se dan de alta entidades nuevas. */
function sinOpcionNueva(html) {
  return html.replace(/<option value="__nueva__">[^<]*<\/option>/, '');
}

/** Una fila de campo con una casilla "Cambiar" que habilita el control real; sin tildar, ese campo no se toca. */
function filaCampoMasivo(nombreCampo, etiqueta, controlHtml) {
  return `
    <div class="campo campo-masivo" data-fila="${nombreCampo}">
      <label class="campo-masivo-activar">
        <input type="checkbox" data-activar="${nombreCampo}" />
        <span class="campo-titulo">${etiqueta}</span>
      </label>
      ${controlHtml}
    </div>`;
}

function htmlFormularioEdicionMasiva() {
  return `
    <p class="ayuda">Tildá "Cambiar" en los campos que quieras aplicar a todas las tareas elegidas; los que dejes sin tildar quedan como estaban en cada una.</p>
    ${filaCampoMasivo('categoria_id', '🗂️ Categoría', `<select name="categoria_id" disabled>${sinOpcionNueva(htmlOpcionesCategoria(''))}</select>`)}
    ${filaCampoMasivo('tarea_importancia', '❗ Importancia', `<select name="tarea_importancia" disabled>${htmlOpcionesImportancia('')}</select>`)}
    ${filaCampoMasivo('tarea_disfrute', '⭐ Disfrute', `<select name="tarea_disfrute" disabled>${htmlOpcionesDisfrute(null)}</select>`)}
    ${filaCampoMasivo('meta_id', '🏁 Meta', `<select name="meta_id" disabled>${sinOpcionNueva(htmlOpcionesMeta(''))}</select>`)}
    ${filaCampoMasivo('persona_id', '👤 Persona', `<select name="persona_id" disabled>${sinOpcionNueva(htmlOpcionesPersona(''))}</select>`)}
    ${filaCampoMasivo('ubicacion_id', '📍 Ubicación', `<select name="ubicacion_id" disabled>${sinOpcionNueva(htmlOpcionesUbicacion(''))}</select>`)}
    ${filaCampoMasivo('tarea_fecha_limite', '⏳ Fecha límite', '<input type="date" name="tarea_fecha_limite" disabled />')}
    ${filaCampoMasivo('tarea_duracion_min', '⏱️ Duración (minutos)', '<input type="number" name="tarea_duracion_min" min="0" step="15" value="30" disabled />')}
    ${filaCampoMasivo('tarea_costo_estimado', '💰 Costo estimado ($)', '<input type="number" name="tarea_costo_estimado" min="0" disabled />')}
    ${filaCampoMasivo('tarea_dias_habiles', '🗓️ Días hábiles (sin marcar = cualquier día)', htmlDiasHabiles([]))}
  `;
}

/** Lee los campos con su casilla "Cambiar" tildada: `{ clave: valor }`, sin las que quedaron sin tocar. */
function leerEdicionMasiva(formulario) {
  const datos = new FormData(formulario);
  const activo = (campo) => formulario.querySelector(`[data-activar="${campo}"]`).checked;
  const cambios = {};
  if (activo('categoria_id')) cambios.categoria_id = datos.get('categoria_id') || null;
  if (activo('tarea_importancia')) cambios.tarea_importancia = datos.get('tarea_importancia') || null;
  if (activo('tarea_disfrute')) cambios.tarea_disfrute = datos.get('tarea_disfrute') ? Number(datos.get('tarea_disfrute')) : null;
  if (activo('meta_id')) cambios.meta_id = datos.get('meta_id') || null;
  if (activo('persona_id')) cambios.persona_id = datos.get('persona_id') || null;
  if (activo('ubicacion_id')) cambios.ubicacion_id = datos.get('ubicacion_id') || null;
  if (activo('tarea_fecha_limite')) cambios.tarea_fecha_limite = datos.get('tarea_fecha_limite') || '';
  if (activo('tarea_duracion_min')) cambios.tarea_duracion_min = Number(datos.get('tarea_duracion_min')) || 30;
  if (activo('tarea_costo_estimado')) cambios.tarea_costo_estimado = Number(datos.get('tarea_costo_estimado')) || 0;
  if (activo('tarea_dias_habiles')) cambios.tarea_dias_habiles = datos.getAll('tarea_dias_habiles').map(Number);
  return cambios;
}

/** Ventana de edición masiva sobre `tareas` (ya elegidas); `alTerminar()` se llama al aplicar los cambios. */
function abrirEdicionMasiva(tareas, alTerminar) {
  abrirDialogoFormulario({
    titulo: `✏️ Editar ${tareas.length} tarea${tareas.length === 1 ? '' : 's'}`,
    textoGuardar: 'Aplicar cambios',
    cuerpoHtml: htmlFormularioEdicionMasiva(),
    conectar: (formulario) => {
      formulario.querySelectorAll('[data-activar]').forEach((casilla) => {
        casilla.addEventListener('change', () => {
          const fila = casilla.closest('.campo-masivo');
          fila.classList.toggle('activo', casilla.checked);
          fila.querySelectorAll('select, input:not([data-activar])').forEach((control) => {
            control.disabled = !casilla.checked;
          });
        });
      });
    },
    alGuardar: async (formulario) => {
      const cambios = leerEdicionMasiva(formulario);
      if (Object.keys(cambios).length === 0) {
        alert('Tildá "Cambiar" en al menos un campo para aplicar algo.');
        return false;
      }
      tareas.forEach((tarea) => aplicarCamposATarea(tarea, cambios));
      await persistirYNotificar();
      alTerminar();
      return true;
    },
  });
}
