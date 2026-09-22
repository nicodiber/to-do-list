// Ventanas para crear y editar categorías, ubicaciones, metas y personas.
// Con `id` editan la entidad; sin `id` crean una nueva y, antes de guardar, llaman
// `alCrear(nueva)` para que quien la pidió (por ejemplo el desplegable de una tarea)
// pueda seleccionarla.

import { estado, persistirYNotificar } from './almacenamiento.js';
import { crearCategoria, crearUbicacion, crearMeta, crearPersona, PLAZOS_META, ETIQUETAS_PLAZO } from './modelos.js';
import { escaparHtml, arbolCategorias, descendientesDeCategoria, capitalizarPrimera, caminoCategoria, formatearFechaOFechaHora } from './utilidades.js';
import { abrirDialogoFormulario, activarMayusculaInicial } from './dialogo-formulario.js';
import { crearSelectorColor } from './selector-color.js';
import { compararPorPrioridad, reprogramarTareaConCascada } from './tareas-logica.js';
import { abrirEdicionTarea } from './modal-tarea.js';

const COLOR_POR_DEFECTO = '#4f7cff';

function noExiste(nombre) {
  alert(`${nombre} ya no existe (se eliminó mientras la editabas).`);
}

// ---------------------------------------------------------------------------
// Categoría
// ---------------------------------------------------------------------------

/** Prioridad para que una categoría quede al final de las hermanas de un padre. */
function prioridadAlFinal(padreId, excluirId = null) {
  const hermanas = estado.categorias.filter((c) => (c.categoria_padre_id || null) === (padreId || null) && c.categoria_id !== excluirId);
  return hermanas.length === 0 ? 0 : Math.max(...hermanas.map((c) => c.categoria_prioridad || 0)) + 1;
}

export function abrirDialogoCategoria({ id = null, alCrear = null, padreIdInicial = null } = {}) {
  const categoria = id ? estado.categorias.find((c) => c.categoria_id === id) : null;
  if (id && !categoria) return;

  // El padre no puede ser la propia categoría ni ninguna de sus descendientes (crearía un ciclo).
  const excluidas = categoria ? new Set([categoria.categoria_id, ...descendientesDeCategoria(categoria.categoria_id, estado.categorias)]) : new Set();
  const opcionesPadre = arbolCategorias(estado.categorias)
    .filter(({ categoria: c }) => !excluidas.has(c.categoria_id))
    .map(
      ({ categoria: c, profundidad }) =>
        `<option value="${c.categoria_id}" ${(categoria ? categoria.categoria_padre_id : padreIdInicial) === c.categoria_id ? 'selected' : ''}>${'　'.repeat(profundidad)}${escaparHtml(c.categoria_nombre)}</option>`
    )
    .join('');
  const disfrute = categoria ? categoria.categoria_disfrute || 3 : 3;
  const padreInicial = categoria ? categoria.categoria_padre_id : padreIdInicial;
  const colorInicial = categoria ? categoria.categoria_color : (padreInicial && estado.categorias.find((c) => c.categoria_id === padreInicial)?.categoria_color) || COLOR_POR_DEFECTO;

  abrirDialogoFormulario({
    titulo: categoria ? '✏️ Editar categoría' : '➕ Nueva categoría',
    textoGuardar: categoria ? '💾 Guardar cambios' : '➕ Agregar categoría',
    cuerpoHtml: `
      <div class="fila-nombre-tarea">
        <input type="text" name="categoria_nombre" value="${escaparHtml(categoria ? categoria.categoria_nombre : '')}" placeholder="Nombre de la categoría" required />
      </div>
      <label>Categoría padre
        <select name="categoria_padre_id">
          <option value="">Sin categoría padre</option>
          ${opcionesPadre}
        </select>
      </label>
      <div class="campo-color-fila"><span>Color</span><span id="selector-color-categoria"></span></div>
      <label>Disfrute
        <select name="categoria_disfrute">
          ${[1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${n === disfrute ? 'selected' : ''}>${'⭐'.repeat(n)} (${n})</option>`).join('')}
        </select>
      </label>
      <input type="text" name="categoria_descripcion" value="${escaparHtml(categoria ? categoria.categoria_descripcion || '' : '')}" placeholder="Descripción (opcional)" />
    `,
    conectar: (formulario) => {
      activarMayusculaInicial(formulario.categoria_nombre);
      const selectorColor = crearSelectorColor({
        contenedor: formulario.querySelector('#selector-color-categoria'),
        nombreCampo: 'categoria_color',
        valorInicial: colorInicial,
      });
      // Solo mientras se crea (no al editar) y solo si el usuario todavía no eligió un color a mano: el color
      // sigue al padre que se vaya seleccionando en el desplegable.
      let colorEditado = false;
      formulario.categoria_color.addEventListener('color-aplicado', () => {
        colorEditado = true;
      });
      if (!categoria) {
        formulario.categoria_padre_id.addEventListener('change', () => {
          if (colorEditado) return;
          const padre = estado.categorias.find((c) => c.categoria_id === formulario.categoria_padre_id.value);
          if (padre) selectorColor.setValor(padre.categoria_color);
        });
      }
    },
    alGuardar: async (formulario) => {
      const nombre = capitalizarPrimera(formulario.categoria_nombre.value.trim());
      if (!nombre) {
        alert('La categoría necesita un nombre.');
        return false;
      }
      const padreId = formulario.categoria_padre_id.value || null;
      const campos = {
        categoria_nombre: nombre,
        categoria_descripcion: formulario.categoria_descripcion.value.trim(),
        categoria_color: formulario.categoria_color.value,
        categoria_disfrute: Number(formulario.categoria_disfrute.value),
      };

      if (id) {
        const actual = estado.categorias.find((c) => c.categoria_id === id);
        if (!actual) {
          noExiste('Esta categoría');
          return true;
        }
        if (padreId && (padreId === actual.categoria_id || descendientesDeCategoria(actual.categoria_id, estado.categorias).has(padreId))) {
          alert('Esa categoría no puede ser padre de sí misma ni de una de sus descendientes: crearía un ciclo.');
          return false;
        }
        Object.assign(actual, campos);
        if ((actual.categoria_padre_id || null) !== padreId) {
          actual.categoria_padre_id = padreId;
          actual.categoria_prioridad = prioridadAlFinal(padreId, actual.categoria_id); // queda al final de sus nuevas hermanas
        }
      } else {
        const nueva = crearCategoria({ ...campos, categoria_padre_id: padreId, categoria_prioridad: prioridadAlFinal(padreId) });
        estado.categorias.push(nueva);
        if (alCrear) alCrear(nueva);
      }
      await persistirYNotificar();
      return true;
    },
  });
}

// ---------------------------------------------------------------------------
// Ubicación
// ---------------------------------------------------------------------------

/**
 * Google Maps copia las coordenadas como "-34.6037, -58.3816": si se pega ese par en
 * Latitud, se reparte solo entre Latitud y Longitud.
 */
function repartirCoordenadasPegadas(evento, formulario) {
  const texto = (evento.clipboardData || window.clipboardData).getData('text');
  const par = texto.match(/^\s*(-?\d+(?:\.\d+)?)\s*[,;]\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!par) return;
  evento.preventDefault();
  formulario.ubicacion_latitud.value = par[1];
  formulario.ubicacion_longitud.value = par[2];
}

export function abrirDialogoUbicacion({ id = null, alCrear = null } = {}) {
  const ubicacion = id ? estado.ubicaciones.find((u) => u.ubicacion_id === id) : null;
  if (id && !ubicacion) return;

  abrirDialogoFormulario({
    titulo: ubicacion ? '✏️ Editar ubicación' : '➕ Nueva ubicación',
    textoGuardar: ubicacion ? '💾 Guardar cambios' : '➕ Agregar ubicación',
    conectar: (formulario) => {
      activarMayusculaInicial(formulario.ubicacion_nombre);
      formulario.ubicacion_latitud.addEventListener('paste', (evento) => repartirCoordenadasPegadas(evento, formulario));
    },
    cuerpoHtml: `
      <div class="fila-nombre-tarea">
        <input type="text" name="ubicacion_nombre" value="${escaparHtml(ubicacion ? ubicacion.ubicacion_nombre : '')}" placeholder="Nombre (ej. Casa)" required />
      </div>
      <label>Latitud <input type="number" name="ubicacion_latitud" value="${ubicacion ? ubicacion.ubicacion_latitud : ''}" placeholder="-34.6037" step="any" min="-90" max="90" required /></label>
      <label>Longitud <input type="number" name="ubicacion_longitud" value="${ubicacion ? ubicacion.ubicacion_longitud : ''}" placeholder="-58.3816" step="any" min="-180" max="180" required /></label>
      <p class="ayuda ayuda-formulario">Las coordenadas van en <strong>grados decimales</strong> (es lo que usa el pronóstico del clima): latitud entre −90 y 90 y longitud entre −180 y 180, con signo negativo al sur y al oeste (Buenos Aires: −34.6037 y −58.3816). En Google Maps: clic derecho sobre el punto y tocá las coordenadas para copiarlas; si pegás el par en Latitud, se reparte solo.</p>
    `,
    alGuardar: async (formulario) => {
      const nombre = capitalizarPrimera(formulario.ubicacion_nombre.value.trim());
      const latitud = Number(formulario.ubicacion_latitud.value);
      const longitud = Number(formulario.ubicacion_longitud.value);
      if (!nombre) {
        alert('La ubicación necesita un nombre.');
        return false;
      }
      if (formulario.ubicacion_latitud.value === '' || formulario.ubicacion_longitud.value === '' || Number.isNaN(latitud) || Number.isNaN(longitud)) {
        alert('Completá la latitud y la longitud con números (por ejemplo −34.6037 y −58.3816).');
        return false;
      }
      if (latitud < -90 || latitud > 90 || longitud < -180 || longitud > 180) {
        alert('Las coordenadas están fuera de rango: la latitud va de −90 a 90 y la longitud de −180 a 180.');
        return false;
      }

      if (id) {
        const actual = estado.ubicaciones.find((u) => u.ubicacion_id === id);
        if (!actual) {
          noExiste('Esta ubicación');
          return true;
        }
        Object.assign(actual, { ubicacion_nombre: nombre, ubicacion_latitud: latitud, ubicacion_longitud: longitud });
      } else {
        const nueva = crearUbicacion({ ubicacion_nombre: nombre, ubicacion_latitud: latitud, ubicacion_longitud: longitud });
        estado.ubicaciones.push(nueva);
        if (alCrear) alCrear(nueva);
      }
      await persistirYNotificar();
      return true;
    },
  });
}

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

export function abrirDialogoMeta({ id = null, alCrear = null } = {}) {
  const meta = id ? estado.metas.find((m) => m.meta_id === id) : null;
  if (id && !meta) return;

  abrirDialogoFormulario({
    titulo: meta ? '✏️ Editar meta' : '➕ Nueva meta',
    textoGuardar: meta ? '💾 Guardar cambios' : '➕ Agregar meta',
    conectar: (formulario) => activarMayusculaInicial(formulario.meta_nombre),
    cuerpoHtml: `
      <div class="fila-nombre-tarea">
        <input type="text" name="meta_nombre" value="${escaparHtml(meta ? meta.meta_nombre : '')}" placeholder="Nombre de la meta" required />
      </div>
      <label>Plazo
        <select name="meta_plazo">
          ${PLAZOS_META.map((p) => `<option value="${p}" ${(meta ? meta.meta_plazo : 'mediano') === p ? 'selected' : ''}>${ETIQUETAS_PLAZO[p]}</option>`).join('')}
        </select>
      </label>
      <label>Fecha objetivo <input type="date" name="meta_fecha_estimada" value="${meta ? meta.meta_fecha_estimada || '' : ''}" /></label>
      <input type="text" name="meta_descripcion" value="${escaparHtml(meta ? meta.meta_descripcion || '' : '')}" placeholder="Descripción (opcional)" />
    `,
    alGuardar: async (formulario) => {
      const nombre = capitalizarPrimera(formulario.meta_nombre.value.trim());
      if (!nombre) {
        alert('La meta necesita un nombre.');
        return false;
      }
      const campos = {
        meta_nombre: nombre,
        meta_plazo: formulario.meta_plazo.value,
        meta_fecha_estimada: formulario.meta_fecha_estimada.value,
        meta_descripcion: formulario.meta_descripcion.value.trim(),
      };
      if (id) {
        const actual = estado.metas.find((m) => m.meta_id === id);
        if (!actual) {
          noExiste('Esta meta');
          return true;
        }
        Object.assign(actual, campos);
      } else {
        const nueva = crearMeta(campos);
        estado.metas.push(nueva);
        if (alCrear) alCrear(nueva);
      }
      await persistirYNotificar();
      return true;
    },
  });
}

// ---------------------------------------------------------------------------
// Persona
// ---------------------------------------------------------------------------

/** Las tareas pendientes asociadas a una persona, en el orden real de prioridad de la app. */
function tareasPendientesDe(personaId) {
  return estado.tareas.filter((t) => t.persona_id === personaId && t.tarea_estado !== 'completada').sort((a, b) => compararPorPrioridad(a, b, estado.categorias));
}

function htmlTareaAsociada(tarea) {
  const categoria = estado.categorias.find((c) => c.categoria_id === tarea.categoria_id);
  return `
    <li class="item-tarea-persona" data-tarea="${tarea.tarea_id}">
      <span>${tarea.tarea_estado === 'bloqueada' ? '⛓️' : '⏳'} ${escaparHtml(tarea.tarea_nombre)}${categoria ? ` · ${escaparHtml(caminoCategoria(categoria, estado.categorias))}` : ''}${tarea.tarea_fecha_sugerida ? ` · ${formatearFechaOFechaHora(tarea.tarea_fecha_sugerida)}` : ''}</span>
      <button type="button" data-accion="editar-tarea-persona" title="Editar esta tarea">✏️</button>
    </li>`;
}

export function abrirDialogoPersona({ id = null, alCrear = null } = {}) {
  const persona = id ? estado.personas.find((p) => p.persona_id === id) : null;
  if (id && !persona) return;
  const tareasAsociadas = persona ? tareasPendientesDe(persona.persona_id) : [];
  const proximoContactoAnterior = persona ? persona.persona_proximo_contacto || '' : '';

  abrirDialogoFormulario({
    titulo: persona ? '✏️ Editar persona' : '➕ Nueva persona',
    textoGuardar: persona ? '💾 Guardar cambios' : '➕ Agregar persona',
    conectar: (formulario) => {
      activarMayusculaInicial(formulario.persona_nombre);
      formulario.querySelectorAll('[data-accion="editar-tarea-persona"]').forEach((boton) => {
        boton.addEventListener('click', () => abrirEdicionTarea(boton.closest('[data-tarea]').dataset.tarea));
      });
    },
    cuerpoHtml: `
      <div class="fila-nombre-tarea">
        <input type="text" name="persona_nombre" value="${escaparHtml(persona ? persona.persona_nombre : '')}" placeholder="Nombre" required />
      </div>
      <label>Último contacto <input type="date" name="persona_ultimo_contacto" value="${persona ? persona.persona_ultimo_contacto || '' : ''}" /></label>
      <label title="Al guardar, reprograma la fecha sugerida de todas las tareas pendientes asociadas a esta fecha">📅 Próximo contacto <input type="date" name="persona_proximo_contacto" value="${proximoContactoAnterior}" /></label>
      ${
        persona
          ? `<div class="ancho-completo">
              <p class="campo-titulo">Tareas pendientes asociadas${tareasAsociadas.length ? ` (${tareasAsociadas.length})` : ''}</p>
              ${tareasAsociadas.length ? `<ul class="lista-tareas-persona">${tareasAsociadas.map(htmlTareaAsociada).join('')}</ul>` : '<p class="ayuda">Ninguna todavía. Se asocian desde el campo "👤 Persona" del formulario de tarea.</p>'}
            </div>`
          : ''
      }
    `,
    alGuardar: async (formulario) => {
      const nombre = capitalizarPrimera(formulario.persona_nombre.value.trim());
      if (!nombre) {
        alert('La persona necesita un nombre.');
        return false;
      }
      const ultimoContacto = formulario.persona_ultimo_contacto.value;
      const proximoContacto = formulario.persona_proximo_contacto.value;
      let actual;
      if (id) {
        actual = estado.personas.find((p) => p.persona_id === id);
        if (!actual) {
          noExiste('Esta persona');
          return true;
        }
        Object.assign(actual, { persona_nombre: nombre, persona_ultimo_contacto: ultimoContacto, persona_proximo_contacto: proximoContacto });
      } else {
        actual = crearPersona({ persona_nombre: nombre, persona_ultimo_contacto: ultimoContacto, persona_proximo_contacto: proximoContacto });
        estado.personas.push(actual);
        if (alCrear) alCrear(actual);
      }
      let reprogramadas = 0;
      if (proximoContacto && proximoContacto !== proximoContactoAnterior) {
        tareasPendientesDe(actual.persona_id).forEach((tarea) => {
          reprogramarTareaConCascada(tarea, proximoContacto, estado.tareas);
          reprogramadas += 1;
        });
      }
      await persistirYNotificar();
      if (reprogramadas > 0) {
        alert(`Se reprogramó la fecha sugerida de ${reprogramadas} tarea${reprogramadas === 1 ? '' : 's'} pendiente${reprogramadas === 1 ? '' : 's'} al ${formatearFechaOFechaHora(proximoContacto)}.`);
      }
      return true;
    },
  });
}
