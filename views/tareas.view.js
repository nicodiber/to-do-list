import { estado, persistirYNotificar } from '../assets/js/almacenamiento.js';
import {
  crearTarea,
  UNIDADES_MANTENIMIENTO,
  ETIQUETAS_UNIDAD_MANTENIMIENTO,
  NIVELES_IMPORTANCIA,
  ETIQUETAS_IMPORTANCIA,
  ICONOS_IMPORTANCIA,
} from '../assets/js/modelos.js';
import {
  formatearFechaOFechaHora,
  esVencida,
  noPuedeEmpezarTodavia,
  escaparHtml,
  arbolCategorias,
  caminoCategoria,
  tieneHora,
  combinarFechaYHora,
} from '../assets/js/utilidades.js';
import { crearPanelReprogramar, DIAS_SEMANA } from '../assets/js/reprogramar.js';
import {
  completarTarea,
  reprogramarTareaConCascada,
  recalcularBloqueo,
  desbloquearDependientes,
  puedeAgregarDependencia,
  compararPorPrioridad,
  calcularEnfoque8020,
  esTareaAccionable,
} from '../assets/js/tareas-logica.js';
import { ofrecerExportarACalendar } from '../assets/js/exportar-calendar.js';
import { construirPromptPrioridades, parsearRespuestaPrioridades } from '../assets/js/ia-conectable.js';
import { obtenerUbicacionActual, establecerUbicacionActual } from '../assets/js/ubicacion-actual.js';

const ESTADOS_SELECCIONABLES = ['pendiente', 'completada'];
const ETIQUETAS_ESTADO_SELECCIONABLE = { pendiente: 'Pendiente', completada: 'Completada' };

let filtroCategoria = '';
let filtroEstado = '';
let filtroImportancia = '';
let agruparPorCategoria = false;
let idAAbrirAlEntrar = null;

export function abrirEdicionAlEntrar(id) {
  idAAbrirAlEntrar = id;
}

function htmlOpcionesImportancia(seleccionada = '') {
  const opciones = [`<option value="" ${!seleccionada ? 'selected' : ''}>Sin definir</option>`];
  NIVELES_IMPORTANCIA.forEach((nivel) => {
    opciones.push(
      `<option value="${nivel}" ${nivel === seleccionada ? 'selected' : ''}>${ICONOS_IMPORTANCIA[nivel]} ${ETIQUETAS_IMPORTANCIA[nivel]}</option>`
    );
  });
  return opciones.join('');
}

function htmlOpcionesDisfrute(seleccionado = null) {
  const opciones = [`<option value="" ${seleccionado == null ? 'selected' : ''}>Disfrute: sin definir</option>`];
  for (let nivel = 1; nivel <= 5; nivel += 1) {
    opciones.push(`<option value="${nivel}" ${nivel === seleccionado ? 'selected' : ''}>${'⭐'.repeat(nivel)} (${nivel})</option>`);
  }
  return opciones.join('');
}

function htmlOpcionesCategoria(seleccionada = '') {
  const opciones = ['<option value="">Sin categoría</option>'];
  arbolCategorias(estado.categorias).forEach(({ categoria, profundidad }) => {
    opciones.push(
      `<option value="${categoria.categoria_id}" ${categoria.categoria_id === seleccionada ? 'selected' : ''}>${'　'.repeat(profundidad)}${escaparHtml(categoria.categoria_nombre)}</option>`
    );
  });
  return opciones.join('');
}

function htmlDiasHabiles(seleccionados = []) {
  return DIAS_SEMANA.map(
    (nombre, indice) => `
      <label class="dia-habil">
        <input type="checkbox" name="tarea_dias_habiles" value="${indice}" ${seleccionados.includes(indice) ? 'checked' : ''} />
        ${nombre.slice(0, 3)}
      </label>`
  ).join('');
}

function partesFechaHora(valorISO) {
  if (!valorISO) return { fecha: '', hora: '' };
  if (!tieneHora(valorISO)) return { fecha: valorISO, hora: '' };
  const d = new Date(valorISO);
  const fecha = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const hora = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return { fecha, hora };
}

function htmlParFechaHora(nombreCampo, valorISO, etiqueta) {
  const { fecha, hora } = partesFechaHora(valorISO);
  return `
    <label>${etiqueta}
      <input type="date" name="${nombreCampo}_fecha" value="${fecha}" />
      <input type="time" name="${nombreCampo}_hora" value="${hora}" title="Hora (opcional)" />
    </label>
  `;
}

function combinarCampoFechaHora(datos, nombreCampo) {
  const fecha = datos.get(`${nombreCampo}_fecha`);
  const hora = datos.get(`${nombreCampo}_hora`);
  if (!fecha) return '';
  return hora ? combinarFechaYHora(fecha, hora) : fecha;
}

function tareasUnicasPorNombre() {
  const mapa = new Map();
  estado.tareas
    .slice()
    .sort((a, b) => b.tarea_creada_en.localeCompare(a.tarea_creada_en))
    .forEach((t) => {
      const clave = t.tarea_nombre.trim().toLowerCase();
      if (!mapa.has(clave)) mapa.set(clave, t);
    });
  return [...mapa.values()];
}

export function renderVistaTareas(contenedor) {
  const filtroUbicacion = obtenerUbicacionActual();
  contenedor.innerHTML = `
    <h2>Tareas</h2>
    <form id="form-alta-rapida" class="formulario-en-linea">
      <input type="text" name="tarea_nombre" placeholder="Agregar tarea rápido (solo nombre)..." required />
      <button type="submit">Agregar</button>
    </form>
    <p class="ayuda">...o cargala con más detalle:</p>
    <form id="form-nueva-tarea" class="formulario-tarea">
      <input type="text" name="tarea_nombre" placeholder="Nueva tarea" required list="lista-sugerencias-tareas" />
      <datalist id="lista-sugerencias-tareas">
        ${tareasUnicasPorNombre().map((t) => `<option value="${escaparHtml(t.tarea_nombre)}"></option>`).join('')}
      </datalist>
      <select name="categoria_id">
        ${htmlOpcionesCategoria()}
      </select>
      <select name="tarea_importancia">
        ${htmlOpcionesImportancia()}
      </select>
      <select name="tarea_disfrute">
        ${htmlOpcionesDisfrute()}
      </select>
      ${htmlParFechaHora('tarea_fecha_inicio_habilitada', '', 'Habilitada desde')}
      ${htmlParFechaHora('tarea_fecha_sugerida', '', 'Sugerida')}
      ${htmlParFechaHora('tarea_fecha_limite', '', 'Límite')}
      <label>Duración (min) <input type="number" name="tarea_duracion_min" value="15" min="0" step="15" /></label>
      <input type="number" name="tarea_costo_estimado" min="0" placeholder="Costo estimado ($)" />
      <input type="text" name="tarea_descripcion" placeholder="Descripción / notas / links" />
      <select name="ubicacion_id">
        <option value="">Sin ubicación</option>
        ${estado.ubicaciones.map((u) => `<option value="${u.ubicacion_id}">${escaparHtml(u.ubicacion_nombre)}</option>`).join('')}
      </select>
      <label class="opcion-mantenimiento">
        <input type="checkbox" name="tarea_requiere_clima_bueno" />
        Requiere buen tiempo (sin lluvia)
      </label>
      <label class="opcion-mantenimiento">
        <input type="checkbox" name="tarea_mantenimiento" />
        Es tarea de mantenimiento (se renueva sola)
      </label>
      <span class="campos-mantenimiento" hidden>
        cada
        <input type="number" name="mantenimiento_cantidad" value="1" min="1" style="width: 3.5rem" />
        <select name="mantenimiento_unidad">
          ${UNIDADES_MANTENIMIENTO.map((u) => `<option value="${u}">${ETIQUETAS_UNIDAD_MANTENIMIENTO[u]}</option>`).join('')}
        </select>
      </span>
      <fieldset class="dias-habiles">
        <legend>Días hábiles (vacío = cualquier día)</legend>
        ${htmlDiasHabiles()}
      </fieldset>
      <button type="submit">Agregar tarea</button>
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

  const formulario = contenedor.querySelector('#form-nueva-tarea');

  const checkboxMantenimiento = formulario.tarea_mantenimiento;
  const camposMantenimiento = contenedor.querySelector('.campos-mantenimiento');
  checkboxMantenimiento.addEventListener('change', () => {
    camposMantenimiento.hidden = !checkboxMantenimiento.checked;
  });

  formulario.tarea_nombre.addEventListener('input', () => {
    const coincidencia = tareasUnicasPorNombre().find(
      (t) => t.tarea_nombre.trim().toLowerCase() === formulario.tarea_nombre.value.trim().toLowerCase()
    );
    if (!coincidencia) return;
    formulario.categoria_id.value = coincidencia.categoria_id || '';
    formulario.tarea_duracion_min.value = coincidencia.tarea_duracion_min || 15;
    formulario.tarea_costo_estimado.value = coincidencia.tarea_costo_estimado || '';
    formulario.tarea_descripcion.value = coincidencia.tarea_descripcion || '';
    checkboxMantenimiento.checked = !!coincidencia.tarea_mantenimiento;
    camposMantenimiento.hidden = !coincidencia.tarea_mantenimiento;
    if (coincidencia.tarea_mantenimiento_intervalo) {
      formulario.mantenimiento_cantidad.value = coincidencia.tarea_mantenimiento_intervalo.cantidad;
      formulario.mantenimiento_unidad.value = coincidencia.tarea_mantenimiento_intervalo.unidad;
    }
    formulario.tarea_importancia.value = coincidencia.tarea_importancia || '';
    formulario.tarea_disfrute.value = coincidencia.tarea_disfrute ?? '';
    const diasSeleccionados = coincidencia.tarea_dias_habiles || [];
    formulario.querySelectorAll('input[name="tarea_dias_habiles"]').forEach((checkbox) => {
      checkbox.checked = diasSeleccionados.includes(Number(checkbox.value));
    });
    formulario.ubicacion_id.value = coincidencia.ubicacion_id || '';
    formulario.tarea_requiere_clima_bueno.checked = !!coincidencia.tarea_requiere_clima_bueno;
  });

  const formularioRapido = contenedor.querySelector('#form-alta-rapida');
  formularioRapido.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const nombre = String(new FormData(formularioRapido).get('tarea_nombre') || '').trim();
    if (!nombre) return;
    estado.tareas.push(crearTarea({ tarea_nombre: nombre }));
    await persistirYNotificar();
  });

  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const datos = new FormData(formulario);
    const nombre = String(datos.get('tarea_nombre') || '').trim();
    if (!nombre) return;
    const esMantenimiento = datos.get('tarea_mantenimiento') === 'on';
    estado.tareas.push(
      crearTarea({
        tarea_nombre: nombre,
        categoria_id: datos.get('categoria_id') || null,
        tarea_importancia: datos.get('tarea_importancia') || null,
        tarea_disfrute: datos.get('tarea_disfrute') ? Number(datos.get('tarea_disfrute')) : null,
        tarea_fecha_inicio_habilitada: combinarCampoFechaHora(datos, 'tarea_fecha_inicio_habilitada'),
        tarea_fecha_sugerida: combinarCampoFechaHora(datos, 'tarea_fecha_sugerida'),
        tarea_fecha_limite: combinarCampoFechaHora(datos, 'tarea_fecha_limite'),
        tarea_duracion_min: Number(datos.get('tarea_duracion_min')) || 15,
        tarea_costo_estimado: Number(datos.get('tarea_costo_estimado')) || 0,
        tarea_descripcion: String(datos.get('tarea_descripcion') || '').trim(),
        tarea_mantenimiento: esMantenimiento,
        tarea_mantenimiento_intervalo: esMantenimiento
          ? {
              cantidad: Number(datos.get('mantenimiento_cantidad')) || 1,
              unidad: datos.get('mantenimiento_unidad'),
            }
          : null,
        tarea_dias_habiles: datos.getAll('tarea_dias_habiles').map(Number),
        ubicacion_id: datos.get('ubicacion_id') || null,
        tarea_requiere_clima_bueno: datos.get('tarea_requiere_clima_bueno') === 'on',
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

  if (idAAbrirAlEntrar) {
    const id = idAAbrirAlEntrar;
    idAAbrirAlEntrar = null;
    const li = listaTareas.querySelector(`[data-id="${id}"]`);
    if (li) {
      li.scrollIntoView({ block: 'center' });
      li.querySelector('[data-accion="editar"]')?.click();
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
      <div class="contenedor-panel-reprogramar" hidden></div>
      <div class="contenedor-panel-dependencia" hidden></div>
      <div class="contenedor-panel-mejora" hidden></div>
      <div class="contenedor-panel-editar" hidden></div>
      <div class="contenedor-panel-meta" hidden></div>
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
      <button type="button" data-accion="dependencia">Dependencia</button>
      <button type="button" data-accion="meta">Meta</button>
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
        completarTarea(tarea, estado.tareas, { notaMejora });
        desbloquearDependientes(tarea, estado.tareas);
        contenedorMejora.hidden = true;
        contenedorMejora.innerHTML = '';
        await persistirYNotificar();
        ofrecerExportarACalendar(tarea);
      });
      return;
    }
    if (nuevoEstado === 'completada') {
      completarTarea(tarea, estado.tareas);
      desbloquearDependientes(tarea, estado.tareas);
      await persistirYNotificar();
      ofrecerExportarACalendar(tarea);
      return;
    }
    tarea.tarea_estado = 'pendiente';
    tarea.tarea_fecha_fin = null;
    estado.tareas
      .filter((t) => t.tarea_dependiente === tarea.tarea_id)
      .forEach((dependiente) => recalcularBloqueo(dependiente, estado.tareas));
    await persistirYNotificar();
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

  const contenedorDependencia = li.querySelector('.contenedor-panel-dependencia');
  li.querySelector('[data-accion="dependencia"]').addEventListener('click', () => {
    const yaAbierto = !contenedorDependencia.hidden;
    contenedorDependencia.innerHTML = '';
    contenedorDependencia.hidden = true;
    if (yaAbierto) return;

    contenedorDependencia.appendChild(crearPanelDependencia(tarea));
    contenedorDependencia.hidden = false;
  });

  const contenedorMeta = li.querySelector('.contenedor-panel-meta');
  li.querySelector('[data-accion="meta"]').addEventListener('click', () => {
    const yaAbierto = !contenedorMeta.hidden;
    contenedorMeta.innerHTML = '';
    contenedorMeta.hidden = true;
    if (yaAbierto) return;

    contenedorMeta.appendChild(crearPanelMeta(tarea));
    contenedorMeta.hidden = false;
  });

  const contenedorEditar = li.querySelector('.contenedor-panel-editar');
  li.querySelector('[data-accion="editar"]').addEventListener('click', () => {
    const yaAbierto = !contenedorEditar.hidden;
    contenedorEditar.innerHTML = '';
    contenedorEditar.hidden = true;
    if (yaAbierto) return;

    contenedorEditar.appendChild(crearPanelEditar(tarea));
    contenedorEditar.hidden = false;
  });

  li.querySelector('[data-accion="eliminar"]').addEventListener('click', async () => {
    if (!confirm(`¿Eliminar la tarea "${tarea.tarea_nombre}"?`)) return;
    estado.tareas = estado.tareas.filter((t) => t.tarea_id !== tarea.tarea_id);
    estado.tareas.forEach((t) => {
      if (t.tarea_dependiente === tarea.tarea_id) {
        t.tarea_dependiente = null;
        recalcularBloqueo(t, estado.tareas);
      }
    });
    await persistirYNotificar();
  });

  return li;
}

function crearPanelEditar(tarea) {
  const panel = document.createElement('form');
  panel.className = 'formulario-tarea panel-editar';
  panel.innerHTML = `
    <input type="text" name="tarea_nombre" value="${escaparHtml(tarea.tarea_nombre)}" required />
    <select name="categoria_id">
      ${htmlOpcionesCategoria(tarea.categoria_id)}
    </select>
    <select name="tarea_importancia">
      ${htmlOpcionesImportancia(tarea.tarea_importancia || '')}
    </select>
    <select name="tarea_disfrute">
      ${htmlOpcionesDisfrute(tarea.tarea_disfrute ?? null)}
    </select>
    ${htmlParFechaHora('tarea_fecha_inicio_habilitada', tarea.tarea_fecha_inicio_habilitada, 'Habilitada desde')}
    ${htmlParFechaHora('tarea_fecha_sugerida', tarea.tarea_fecha_sugerida, 'Sugerida')}
    ${htmlParFechaHora('tarea_fecha_limite', tarea.tarea_fecha_limite, 'Límite')}
    <label>Duración (min) <input type="number" name="tarea_duracion_min" value="${tarea.tarea_duracion_min || 15}" min="0" step="15" /></label>
    <input type="number" name="tarea_costo_estimado" min="0" placeholder="Costo estimado ($)" value="${tarea.tarea_costo_estimado || ''}" />
    <input type="text" name="tarea_descripcion" placeholder="Descripción / notas / links" value="${escaparHtml(tarea.tarea_descripcion || '')}" />
    <select name="ubicacion_id">
      <option value="">Sin ubicación</option>
      ${estado.ubicaciones
        .map((u) => `<option value="${u.ubicacion_id}" ${u.ubicacion_id === tarea.ubicacion_id ? 'selected' : ''}>${escaparHtml(u.ubicacion_nombre)}</option>`)
        .join('')}
    </select>
    <label class="opcion-mantenimiento">
      <input type="checkbox" name="tarea_requiere_clima_bueno" ${tarea.tarea_requiere_clima_bueno ? 'checked' : ''} />
      Requiere buen tiempo (sin lluvia)
    </label>
    <label class="opcion-mantenimiento">
      <input type="checkbox" name="tarea_mantenimiento" ${tarea.tarea_mantenimiento ? 'checked' : ''} />
      Es tarea de mantenimiento (se renueva sola)
    </label>
    <span class="campos-mantenimiento" ${tarea.tarea_mantenimiento ? '' : 'hidden'}>
      cada
      <input type="number" name="mantenimiento_cantidad" value="${tarea.tarea_mantenimiento_intervalo ? tarea.tarea_mantenimiento_intervalo.cantidad : 1}" min="1" style="width: 3.5rem" />
      <select name="mantenimiento_unidad">
        ${UNIDADES_MANTENIMIENTO.map(
          (u) => `<option value="${u}" ${tarea.tarea_mantenimiento_intervalo && tarea.tarea_mantenimiento_intervalo.unidad === u ? 'selected' : ''}>${ETIQUETAS_UNIDAD_MANTENIMIENTO[u]}</option>`
        ).join('')}
      </select>
    </span>
    <fieldset class="dias-habiles">
      <legend>Días hábiles (vacío = cualquier día)</legend>
      ${htmlDiasHabiles(tarea.tarea_dias_habiles || [])}
    </fieldset>
    <button type="submit" class="boton-primario">Guardar cambios</button>
  `;

  const checkboxMantenimiento = panel.tarea_mantenimiento;
  const camposMantenimiento = panel.querySelector('.campos-mantenimiento');
  checkboxMantenimiento.addEventListener('change', () => {
    camposMantenimiento.hidden = !checkboxMantenimiento.checked;
  });

  panel.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const datos = new FormData(panel);
    const nombre = String(datos.get('tarea_nombre') || '').trim();
    if (!nombre) return;
    tarea.tarea_nombre = nombre;
    tarea.categoria_id = datos.get('categoria_id') || null;
    tarea.tarea_importancia = datos.get('tarea_importancia') || null;
    tarea.tarea_disfrute = datos.get('tarea_disfrute') ? Number(datos.get('tarea_disfrute')) : null;
    tarea.tarea_fecha_inicio_habilitada = combinarCampoFechaHora(datos, 'tarea_fecha_inicio_habilitada');
    tarea.tarea_fecha_sugerida = combinarCampoFechaHora(datos, 'tarea_fecha_sugerida');
    tarea.tarea_fecha_limite = combinarCampoFechaHora(datos, 'tarea_fecha_limite');
    tarea.tarea_duracion_min = Number(datos.get('tarea_duracion_min')) || 15;
    tarea.tarea_costo_estimado = Number(datos.get('tarea_costo_estimado')) || 0;
    tarea.tarea_descripcion = String(datos.get('tarea_descripcion') || '').trim();
    tarea.tarea_mantenimiento = datos.get('tarea_mantenimiento') === 'on';
    tarea.tarea_mantenimiento_intervalo = tarea.tarea_mantenimiento
      ? { cantidad: Number(datos.get('mantenimiento_cantidad')) || 1, unidad: datos.get('mantenimiento_unidad') }
      : null;
    tarea.tarea_dias_habiles = datos.getAll('tarea_dias_habiles').map(Number);
    tarea.ubicacion_id = datos.get('ubicacion_id') || null;
    tarea.tarea_requiere_clima_bueno = datos.get('tarea_requiere_clima_bueno') === 'on';
    await persistirYNotificar();
  });

  return panel;
}

function crearPanelDependencia(tarea) {
  const panel = document.createElement('div');
  panel.className = 'panel-dependencias';

  const candidatas = estado.tareas.filter((t) => t.tarea_id !== tarea.tarea_id);
  if (candidatas.length === 0) {
    panel.innerHTML = '<p class="mensaje-vacio">No hay otras tareas para elegir como dependencia.</p>';
    return panel;
  }

  panel.innerHTML = `
    <p class="panel-reprogramar-etiqueta">Esta tarea depende de:</p>
    <select data-campo="dependencia">
      <option value="">Sin dependencia</option>
      ${candidatas
        .map(
          (c) =>
            `<option value="${c.tarea_id}" ${c.tarea_id === tarea.tarea_dependiente ? 'selected' : ''}>${escaparHtml(c.tarea_nombre)}${c.tarea_estado === 'completada' ? ' (completada)' : ''}</option>`
        )
        .join('')}
    </select>
  `;

  const select = panel.querySelector('[data-campo="dependencia"]');
  const valorAnterior = tarea.tarea_dependiente || '';
  select.addEventListener('change', async () => {
    const nuevoValor = select.value;
    if (nuevoValor && !puedeAgregarDependencia(tarea.tarea_id, nuevoValor, estado.tareas)) {
      select.value = valorAnterior;
      alert('No se puede agregar esa dependencia: crearía un ciclo (directo o indirecto) entre tareas.');
      return;
    }
    tarea.tarea_dependiente = nuevoValor || null;
    recalcularBloqueo(tarea, estado.tareas);
    await persistirYNotificar();
  });

  return panel;
}

function crearPanelMeta(tarea) {
  const panel = document.createElement('div');
  panel.className = 'panel-dependencias';

  if (estado.metas.length === 0) {
    panel.innerHTML = '<p class="mensaje-vacio">Todavía no creaste ninguna meta. Andá a la vista "Metas" para crear una.</p>';
    return panel;
  }

  panel.innerHTML = `
    <p class="panel-reprogramar-etiqueta">Esta tarea aporta a:</p>
    <select data-campo="meta">
      <option value="">Sin meta</option>
      ${estado.metas.map((m) => `<option value="${m.meta_id}" ${m.meta_id === tarea.meta_id ? 'selected' : ''}>${escaparHtml(m.meta_nombre)}</option>`).join('')}
    </select>
  `;

  panel.querySelector('[data-campo="meta"]').addEventListener('change', async (evento) => {
    tarea.meta_id = evento.target.value || null;
    await persistirYNotificar();
  });

  return panel;
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
