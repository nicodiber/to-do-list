import { estado, persistirYNotificar } from '../assets/js/almacenamiento.js';
import {
  crearTarea,
  ESTADOS_TAREA,
  ETIQUETAS_ESTADO,
  UNIDADES_MANTENIMIENTO,
  ETIQUETAS_UNIDAD_MANTENIMIENTO,
  NIVELES_IMPORTANCIA,
  ETIQUETAS_IMPORTANCIA,
  ICONOS_IMPORTANCIA,
} from '../assets/js/modelos.js';
import { formatearFecha, formatearFechaHora, esVencida, noPuedeEmpezarTodavia, escaparHtml } from '../assets/js/utilidades.js';
import { crearPanelReprogramar, DIAS_SEMANA } from '../assets/js/reprogramar.js';
import {
  completarTarea,
  reprogramarTareaConCascada,
  tareaEstaBloqueada,
  puedeAgregarDependencia,
  compararPorPrioridad,
  calcularEnfoque8020,
  esTareaAccionable,
} from '../assets/js/tareas-logica.js';
import { ofrecerExportarACalendar } from '../assets/js/exportar-calendar.js';
import { mostrarRecompensaSiCorresponde } from '../assets/js/recompensa.js';
import { sugerirTareaDeAltoDisfrute } from '../assets/js/disfrute.js';
import { construirPromptPrioridades, parsearRespuestaPrioridades } from '../assets/js/ia-conectable.js';
import { obtenerUbicacionActual, establecerUbicacionActual } from '../assets/js/ubicacion-actual.js';

let filtroCategoria = '';
let filtroEstado = '';
let filtroSoloMultitasking = false;
let filtroImportancia = '';
let agruparPorCategoria = false;
let idAAbrirAlEntrar = null;

export function abrirEdicionAlEntrar(id) {
  idAAbrirAlEntrar = id;
}

function htmlOpcionesImportancia(seleccionada = 'media') {
  return NIVELES_IMPORTANCIA.map(
    (nivel) =>
      `<option value="${nivel}" ${nivel === seleccionada ? 'selected' : ''}>${ICONOS_IMPORTANCIA[nivel]} ${ETIQUETAS_IMPORTANCIA[nivel]}</option>`
  ).join('');
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
        <option value="">Sin categoría</option>
        ${estado.categorias.map((c) => `<option value="${c.categoria_id}">${escaparHtml(c.categoria_nombre)}</option>`).join('')}
      </select>
      <select name="subcategoria_id">
        <option value="">Sin subcategoría</option>
      </select>
      <select name="tarea_estado">
        ${ESTADOS_TAREA.map((e) => `<option value="${e}">${ETIQUETAS_ESTADO[e]}</option>`).join('')}
      </select>
      <select name="tarea_importancia">
        ${htmlOpcionesImportancia()}
      </select>
      <label>Desde <input type="date" name="tarea_fecha_inicio_posible" /></label>
      <label>Límite <input type="date" name="tarea_fecha_limite" /></label>
      <label>Sugerida <input type="date" name="tarea_fecha_sugerida" /></label>
      <label>Duración (min) <input type="number" name="tarea_duracion_estimada_min" value="30" min="0" step="15" /></label>
      <input type="number" name="tarea_costo_estimado" min="0" placeholder="Costo estimado ($)" />
      <input type="text" name="tarea_notas" placeholder="Notas / recursos" />
      <select name="ubicacion_id">
        <option value="">Sin ubicación</option>
        ${estado.ubicaciones.map((u) => `<option value="${u.ubicacion_id}">${escaparHtml(u.ubicacion_nombre)}</option>`).join('')}
      </select>
      <input type="text" name="tarea_recompensa" placeholder="Recompensa (opcional)" />
      <label class="opcion-mantenimiento">
        <input type="checkbox" name="tarea_requiere_clima_bueno" />
        Requiere buen tiempo (sin lluvia)
      </label>
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
      <label class="opcion-mantenimiento">
        <input type="checkbox" name="tarea_divisible" />
        Se puede pausar y retomar (divisible)
      </label>
      <label class="opcion-mantenimiento">
        <input type="checkbox" name="tarea_multitasking" />
        🎧 Se puede hacer mientras hacés otra cosa (multitasking)
      </label>
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
          ${estado.categorias
            .map((c) => `<option value="${c.categoria_id}" ${filtroCategoria === c.categoria_id ? 'selected' : ''}>${escaparHtml(c.categoria_nombre)}</option>`)
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
        <input type="checkbox" id="filtro-multitasking" ${filtroSoloMultitasking ? 'checked' : ''} />
        🎧 Solo multitasking
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
  const selectCategoria = formulario.categoria_id;
  const selectSubcategoria = formulario.subcategoria_id;

  function actualizarSubcategoriasFormulario() {
    const subs = estado.subcategorias.filter((s) => s.categoria_id === selectCategoria.value);
    selectSubcategoria.innerHTML =
      '<option value="">Sin subcategoría</option>' +
      subs.map((s) => `<option value="${s.subcategoria_id}">${escaparHtml(s.subcategoria_nombre)}</option>`).join('');
  }
  selectCategoria.addEventListener('change', actualizarSubcategoriasFormulario);
  actualizarSubcategoriasFormulario();

  const checkboxMantenimiento = formulario.es_mantenimiento;
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
    actualizarSubcategoriasFormulario();
    formulario.subcategoria_id.value = coincidencia.subcategoria_id || '';
    formulario.tarea_duracion_estimada_min.value = coincidencia.tarea_duracion_estimada_min || 30;
    formulario.tarea_costo_estimado.value = coincidencia.tarea_costo_estimado || '';
    formulario.tarea_notas.value = coincidencia.tarea_notas || '';
    checkboxMantenimiento.checked = !!coincidencia.tarea_mantenimiento;
    camposMantenimiento.hidden = !coincidencia.tarea_mantenimiento;
    if (coincidencia.tarea_mantenimiento) {
      formulario.mantenimiento_cantidad.value = coincidencia.tarea_mantenimiento.cantidad;
      formulario.mantenimiento_unidad.value = coincidencia.tarea_mantenimiento.unidad;
    }
    formulario.tarea_divisible.checked = !!coincidencia.tarea_divisible;
    formulario.tarea_multitasking.checked = !!coincidencia.tarea_multitasking;
    formulario.tarea_importancia.value = coincidencia.tarea_importancia || 'media';
    const diasSeleccionados = coincidencia.tarea_dias_habiles || [];
    formulario.querySelectorAll('input[name="tarea_dias_habiles"]').forEach((checkbox) => {
      checkbox.checked = diasSeleccionados.includes(Number(checkbox.value));
    });
    formulario.ubicacion_id.value = coincidencia.ubicacion_id || '';
    formulario.tarea_requiere_clima_bueno.checked = !!coincidencia.tarea_requiere_clima_bueno;
    formulario.tarea_recompensa.value = coincidencia.tarea_recompensa || '';
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
    const esMantenimiento = datos.get('es_mantenimiento') === 'on';
    estado.tareas.push(
      crearTarea({
        tarea_nombre: nombre,
        categoria_id: datos.get('categoria_id') || null,
        subcategoria_id: datos.get('subcategoria_id') || null,
        tarea_estado: datos.get('tarea_estado'),
        tarea_importancia: datos.get('tarea_importancia') || 'media',
        tarea_fecha_inicio_posible: datos.get('tarea_fecha_inicio_posible'),
        tarea_fecha_limite: datos.get('tarea_fecha_limite'),
        tarea_fecha_sugerida: datos.get('tarea_fecha_sugerida'),
        tarea_duracion_estimada_min: Number(datos.get('tarea_duracion_estimada_min')) || 0,
        tarea_costo_estimado: Number(datos.get('tarea_costo_estimado')) || 0,
        tarea_notas: String(datos.get('tarea_notas') || '').trim(),
        tarea_mantenimiento: esMantenimiento
          ? {
              cantidad: Number(datos.get('mantenimiento_cantidad')) || 1,
              unidad: datos.get('mantenimiento_unidad'),
            }
          : null,
        tarea_divisible: datos.get('tarea_divisible') === 'on',
        tarea_multitasking: datos.get('tarea_multitasking') === 'on',
        tarea_dias_habiles: datos.getAll('tarea_dias_habiles').map(Number),
        ubicacion_id: datos.get('ubicacion_id') || null,
        tarea_requiere_clima_bueno: datos.get('tarea_requiere_clima_bueno') === 'on',
        tarea_recompensa: String(datos.get('tarea_recompensa') || '').trim(),
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
  contenedor.querySelector('#filtro-multitasking').addEventListener('change', (evento) => {
    filtroSoloMultitasking = evento.target.checked;
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
    .filter((t) => !filtroSoloMultitasking || t.tarea_multitasking)
    .filter((t) => !filtroImportancia || (t.tarea_importancia || 'media') === filtroImportancia)
    .slice()
    .sort(
      (a, b) =>
        (a.tarea_fecha_limite || '9999-99-99').localeCompare(b.tarea_fecha_limite || '9999-99-99') ||
        compararPorPrioridad(a, b, estado.categorias)
    );

  if (tareasFiltradas.length === 0) {
    listaTareas.innerHTML = '<p class="mensaje-vacio">No hay tareas que coincidan con el filtro.</p>';
  } else if (!agruparPorCategoria) {
    tareasFiltradas.forEach((tarea) => listaTareas.appendChild(renderTarea(tarea, enfoqueIds)));
  } else {
    const categoriasOrdenadas = estado.categorias.slice().sort((a, b) => a.categoria_orden - b.categoria_orden);
    categoriasOrdenadas.forEach((categoria) => {
      const tareasDeCategoria = tareasFiltradas.filter((t) => t.categoria_id === categoria.categoria_id);
      if (tareasDeCategoria.length === 0) return;
      listaTareas.appendChild(crearSeparadorCategoria(categoria.categoria_nombre, categoria.categoria_color));
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
  const subcategoria = estado.subcategorias.find((s) => s.subcategoria_id === tarea.subcategoria_id);
  const ubicacion = estado.ubicaciones.find((u) => u.ubicacion_id === tarea.ubicacion_id);
  const { bloqueada, bloqueantes } = tareaEstaBloqueada(tarea, estado.tareas);

  const li = document.createElement('li');
  const clases = ['item-tarea'];
  if (esVencida(tarea.tarea_fecha_limite) && tarea.tarea_estado !== 'completada') clases.push('vencida');
  if (noPuedeEmpezarTodavia(tarea.tarea_fecha_inicio_posible)) clases.push('aun-no-disponible');
  if (bloqueada) clases.push('bloqueada');
  li.className = clases.join(' ');
  li.dataset.id = tarea.tarea_id;
  li.innerHTML = `
    <div class="item-tarea-info">
      <strong>${escaparHtml(tarea.tarea_nombre)}</strong>
      <span class="etiquetas">
        <span class="etiqueta-fecha">${ICONOS_IMPORTANCIA[tarea.tarea_importancia] || ICONOS_IMPORTANCIA.media} ${
          ETIQUETAS_IMPORTANCIA[tarea.tarea_importancia] || ETIQUETAS_IMPORTANCIA.media
        }</span>
        ${enfoqueIds && enfoqueIds.has(tarea.tarea_id) ? `<span class="etiqueta-fecha etiqueta-enfoque">🎯 Foco 80/20</span>` : ''}
        ${
          categoria
            ? `<span class="etiqueta" style="background:${subcategoria?.subcategoria_color ?? categoria.categoria_color}">${escaparHtml(categoria.categoria_nombre)}${
                subcategoria ? ' / ' + escaparHtml(subcategoria.subcategoria_nombre) : ''
              }</span>`
            : ''
        }
        ${tarea.tarea_fecha_inicio_posible ? `<span class="etiqueta-fecha">Desde: ${formatearFecha(tarea.tarea_fecha_inicio_posible)}</span>` : ''}
        ${tarea.tarea_fecha_limite ? `<span class="etiqueta-fecha">Límite: ${formatearFecha(tarea.tarea_fecha_limite)}</span>` : ''}
        ${tarea.tarea_fecha_sugerida ? `<span class="etiqueta-fecha">Sugerida: ${formatearFecha(tarea.tarea_fecha_sugerida)}</span>` : ''}
        ${tarea.tarea_fecha_hora_agendada ? `<span class="etiqueta-fecha etiqueta-agendada">Agendada: ${formatearFechaHora(tarea.tarea_fecha_hora_agendada)}</span>` : ''}
        ${tarea.tarea_duracion_estimada_min ? `<span class="etiqueta-fecha">${tarea.tarea_duracion_estimada_min} min</span>` : ''}
        ${tarea.tarea_costo_estimado ? `<span class="etiqueta-fecha">💰 $${tarea.tarea_costo_estimado}</span>` : ''}
        ${
          tarea.tarea_mantenimiento
            ? `<span class="etiqueta-fecha etiqueta-mantenimiento">🔁 cada ${tarea.tarea_mantenimiento.cantidad} ${ETIQUETAS_UNIDAD_MANTENIMIENTO[tarea.tarea_mantenimiento.unidad]}</span>`
            : ''
        }
        ${tarea.tarea_divisible ? `<span class="etiqueta-fecha">⏸ Divisible</span>` : ''}
        ${tarea.tarea_multitasking ? `<span class="etiqueta-fecha">🎧 Multitasking</span>` : ''}
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
        ${tarea.tarea_recompensa ? `<span class="etiqueta-fecha">🎁 ${escaparHtml(tarea.tarea_recompensa)}</span>` : ''}
      </span>
      ${
        bloqueada
          ? `<p class="aviso-bloqueada">Bloqueada por: ${bloqueantes.map((b) => escaparHtml(b.tarea_nombre)).join(', ')}</p>`
          : ''
      }
      ${tarea.tarea_notas ? `<p class="notas-tarea">${escaparHtml(tarea.tarea_notas)}</p>` : ''}
      <div class="contenedor-panel-reprogramar" hidden></div>
      <div class="contenedor-panel-dependencias" hidden></div>
      <div class="contenedor-panel-mejora" hidden></div>
      <div class="contenedor-panel-editar" hidden></div>
      <div class="contenedor-panel-metas" hidden></div>
    </div>
    <div class="item-tarea-acciones">
      <select data-accion="cambiar-estado">
        ${ESTADOS_TAREA.map((e) => `<option value="${e}" ${e === tarea.tarea_estado ? 'selected' : ''}>${ETIQUETAS_ESTADO[e]}</option>`).join('')}
      </select>
      <button type="button" data-accion="posponer">Posponer</button>
      <button type="button" data-accion="dependencias">Dependencias</button>
      <button type="button" data-accion="metas">Metas</button>
      <button type="button" data-accion="editar">Editar</button>
      <button type="button" data-accion="eliminar">Eliminar</button>
    </div>
  `;

  const contenedorMejora = li.querySelector('.contenedor-panel-mejora');
  li.querySelector('[data-accion="cambiar-estado"]').addEventListener('change', async (evento) => {
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
        contenedorMejora.hidden = true;
        contenedorMejora.innerHTML = '';
        await persistirYNotificar();
        mostrarRecompensaSiCorresponde(tarea);
        sugerirTareaDeAltoDisfrute(tarea);
        ofrecerExportarACalendar(tarea);
      });
      return;
    }
    if (nuevoEstado === 'completada') {
      completarTarea(tarea, estado.tareas);
      await persistirYNotificar();
      mostrarRecompensaSiCorresponde(tarea);
      sugerirTareaDeAltoDisfrute(tarea);
      ofrecerExportarACalendar(tarea);
      return;
    }
    tarea.tarea_estado = nuevoEstado;
    tarea.tarea_completada_en = null;
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

  const contenedorMetas = li.querySelector('.contenedor-panel-metas');
  li.querySelector('[data-accion="metas"]').addEventListener('click', () => {
    const yaAbierto = !contenedorMetas.hidden;
    contenedorMetas.innerHTML = '';
    contenedorMetas.hidden = true;
    if (yaAbierto) return;

    contenedorMetas.appendChild(crearPanelMetas(tarea));
    contenedorMetas.hidden = false;
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
      t.dependencias = (t.dependencias || []).filter((id) => id !== tarea.tarea_id);
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
      <option value="">Sin categoría</option>
      ${estado.categorias
        .map((c) => `<option value="${c.categoria_id}" ${c.categoria_id === tarea.categoria_id ? 'selected' : ''}>${escaparHtml(c.categoria_nombre)}</option>`)
        .join('')}
    </select>
    <select name="subcategoria_id">
      <option value="">Sin subcategoría</option>
    </select>
    <select name="tarea_importancia">
      ${htmlOpcionesImportancia(tarea.tarea_importancia || 'media')}
    </select>
    <label>Desde <input type="date" name="tarea_fecha_inicio_posible" value="${tarea.tarea_fecha_inicio_posible || ''}" /></label>
    <label>Límite <input type="date" name="tarea_fecha_limite" value="${tarea.tarea_fecha_limite || ''}" /></label>
    <label>Sugerida <input type="date" name="tarea_fecha_sugerida" value="${tarea.tarea_fecha_sugerida || ''}" /></label>
    <label>Duración (min) <input type="number" name="tarea_duracion_estimada_min" value="${tarea.tarea_duracion_estimada_min || 0}" min="0" step="15" /></label>
    <input type="number" name="tarea_costo_estimado" min="0" placeholder="Costo estimado ($)" value="${tarea.tarea_costo_estimado || ''}" />
    <input type="text" name="tarea_notas" placeholder="Notas / recursos" value="${escaparHtml(tarea.tarea_notas || '')}" />
    <select name="ubicacion_id">
      <option value="">Sin ubicación</option>
      ${estado.ubicaciones
        .map((u) => `<option value="${u.ubicacion_id}" ${u.ubicacion_id === tarea.ubicacion_id ? 'selected' : ''}>${escaparHtml(u.ubicacion_nombre)}</option>`)
        .join('')}
    </select>
    <input type="text" name="tarea_recompensa" placeholder="Recompensa (opcional)" value="${escaparHtml(tarea.tarea_recompensa || '')}" />
    <label class="opcion-mantenimiento">
      <input type="checkbox" name="tarea_requiere_clima_bueno" ${tarea.tarea_requiere_clima_bueno ? 'checked' : ''} />
      Requiere buen tiempo (sin lluvia)
    </label>
    <label class="opcion-mantenimiento">
      <input type="checkbox" name="es_mantenimiento" ${tarea.tarea_mantenimiento ? 'checked' : ''} />
      Es tarea de mantenimiento (se renueva sola)
    </label>
    <span class="campos-mantenimiento" ${tarea.tarea_mantenimiento ? '' : 'hidden'}>
      cada
      <input type="number" name="mantenimiento_cantidad" value="${tarea.tarea_mantenimiento ? tarea.tarea_mantenimiento.cantidad : 1}" min="1" style="width: 3.5rem" />
      <select name="mantenimiento_unidad">
        ${UNIDADES_MANTENIMIENTO.map(
          (u) => `<option value="${u}" ${tarea.tarea_mantenimiento && tarea.tarea_mantenimiento.unidad === u ? 'selected' : ''}>${ETIQUETAS_UNIDAD_MANTENIMIENTO[u]}</option>`
        ).join('')}
      </select>
    </span>
    <label class="opcion-mantenimiento">
      <input type="checkbox" name="tarea_divisible" ${tarea.tarea_divisible ? 'checked' : ''} />
      Se puede pausar y retomar (divisible)
    </label>
    <label class="opcion-mantenimiento">
      <input type="checkbox" name="tarea_multitasking" ${tarea.tarea_multitasking ? 'checked' : ''} />
      🎧 Se puede hacer mientras hacés otra cosa (multitasking)
    </label>
    <fieldset class="dias-habiles">
      <legend>Días hábiles (vacío = cualquier día)</legend>
      ${htmlDiasHabiles(tarea.tarea_dias_habiles || [])}
    </fieldset>
    <button type="submit" class="boton-primario">Guardar cambios</button>
  `;

  const selectCategoria = panel.categoria_id;
  const selectSubcategoria = panel.subcategoria_id;
  function actualizarSubcategoriasPanel(valorSeleccionado) {
    const subs = estado.subcategorias.filter((s) => s.categoria_id === selectCategoria.value);
    selectSubcategoria.innerHTML =
      '<option value="">Sin subcategoría</option>' +
      subs.map((s) => `<option value="${s.subcategoria_id}" ${s.subcategoria_id === valorSeleccionado ? 'selected' : ''}>${escaparHtml(s.subcategoria_nombre)}</option>`).join('');
  }
  actualizarSubcategoriasPanel(tarea.subcategoria_id);
  selectCategoria.addEventListener('change', () => actualizarSubcategoriasPanel(null));

  const checkboxMantenimiento = panel.es_mantenimiento;
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
    tarea.subcategoria_id = datos.get('subcategoria_id') || null;
    tarea.tarea_importancia = datos.get('tarea_importancia') || 'media';
    tarea.tarea_fecha_inicio_posible = datos.get('tarea_fecha_inicio_posible');
    tarea.tarea_fecha_limite = datos.get('tarea_fecha_limite');
    tarea.tarea_fecha_sugerida = datos.get('tarea_fecha_sugerida');
    tarea.tarea_duracion_estimada_min = Number(datos.get('tarea_duracion_estimada_min')) || 0;
    tarea.tarea_costo_estimado = Number(datos.get('tarea_costo_estimado')) || 0;
    tarea.tarea_notas = String(datos.get('tarea_notas') || '').trim();
    tarea.tarea_mantenimiento =
      datos.get('es_mantenimiento') === 'on'
        ? { cantidad: Number(datos.get('mantenimiento_cantidad')) || 1, unidad: datos.get('mantenimiento_unidad') }
        : null;
    tarea.tarea_divisible = datos.get('tarea_divisible') === 'on';
    tarea.tarea_multitasking = datos.get('tarea_multitasking') === 'on';
    tarea.tarea_dias_habiles = datos.getAll('tarea_dias_habiles').map(Number);
    tarea.ubicacion_id = datos.get('ubicacion_id') || null;
    tarea.tarea_requiere_clima_bueno = datos.get('tarea_requiere_clima_bueno') === 'on';
    tarea.tarea_recompensa = String(datos.get('tarea_recompensa') || '').trim();
    await persistirYNotificar();
  });

  return panel;
}

function crearPanelDependencias(tarea) {
  const panel = document.createElement('div');
  panel.className = 'panel-dependencias';

  const candidatas = estado.tareas.filter((t) => t.tarea_id !== tarea.tarea_id);
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
                <input type="checkbox" value="${candidata.tarea_id}" ${
                  (tarea.dependencias || []).includes(candidata.tarea_id) ? 'checked' : ''
                } />
                ${escaparHtml(candidata.tarea_nombre)} ${candidata.tarea_estado === 'completada' ? '(completada)' : ''}
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
        if (!puedeAgregarDependencia(tarea.tarea_id, candidatoId, estado.tareas)) {
          checkbox.checked = false;
          alert('No se puede agregar esa dependencia: crearía un ciclo (directo o indirecto) entre tareas.');
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

function crearPanelMetas(tarea) {
  const panel = document.createElement('div');
  panel.className = 'panel-dependencias';

  if (estado.metas.length === 0) {
    panel.innerHTML = '<p class="mensaje-vacio">Todavía no creaste ninguna meta. Andá a la vista "Metas" para crear una.</p>';
    return panel;
  }

  panel.innerHTML = `
    <p class="panel-reprogramar-etiqueta">Esta tarea aporta a:</p>
    <ul class="checklist-dependencias">
      ${estado.metas
        .map(
          (meta) => `
            <li>
              <label>
                <input type="checkbox" value="${meta.meta_id}" ${(tarea.metas_ids || []).includes(meta.meta_id) ? 'checked' : ''} />
                ${escaparHtml(meta.meta_nombre)}
              </label>
            </li>`
        )
        .join('')}
    </ul>
  `;

  panel.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
    checkbox.addEventListener('change', async () => {
      const metaId = checkbox.value;
      if (checkbox.checked) {
        tarea.metas_ids = [...(tarea.metas_ids || []), metaId];
      } else {
        tarea.metas_ids = (tarea.metas_ids || []).filter((id) => id !== metaId);
      }
      await persistirYNotificar();
    });
  });

  return panel;
}

function crearPanelIAPrioridades() {
  const panel = document.createElement('div');
  panel.className = 'panel-dependencias';

  const tareasAccionables = estado.tareas.filter((t) => esTareaAccionable(t, estado.tareas));
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
    <textarea class="textarea-ia" data-campo="respuesta" rows="6" placeholder='[{ "tarea_id": "...", "tarea_importancia": "alta" }]'></textarea>
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
                  ${escaparHtml(c.tarea.tarea_nombre)}: ${ICONOS_IMPORTANCIA[c.tarea.tarea_importancia] || ''} ${ETIQUETAS_IMPORTANCIA[c.tarea.tarea_importancia] || ''}
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
