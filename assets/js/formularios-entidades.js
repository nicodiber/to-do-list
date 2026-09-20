// Ventanas para crear y editar categorías, ubicaciones, metas y personas.
// Con `id` editan la entidad; sin `id` crean una nueva y, antes de guardar, llaman
// `alCrear(nueva)` para que quien la pidió (por ejemplo el desplegable de una tarea)
// pueda seleccionarla.

import { estado, persistirYNotificar } from './almacenamiento.js';
import { crearCategoria, crearUbicacion, crearMeta, crearPersona, PLAZOS_META, ETIQUETAS_PLAZO } from './modelos.js';
import { escaparHtml, arbolCategorias, descendientesDeCategoria, capitalizarPrimera } from './utilidades.js';
import { abrirDialogoFormulario, activarMayusculaInicial } from './dialogo-formulario.js';

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

export function abrirDialogoCategoria({ id = null, alCrear = null } = {}) {
  const categoria = id ? estado.categorias.find((c) => c.categoria_id === id) : null;
  if (id && !categoria) return;

  // El padre no puede ser la propia categoría ni ninguna de sus descendientes (crearía un ciclo).
  const excluidas = categoria ? new Set([categoria.categoria_id, ...descendientesDeCategoria(categoria.categoria_id, estado.categorias)]) : new Set();
  const opcionesPadre = arbolCategorias(estado.categorias)
    .filter(({ categoria: c }) => !excluidas.has(c.categoria_id))
    .map(
      ({ categoria: c, profundidad }) =>
        `<option value="${c.categoria_id}" ${categoria && c.categoria_id === categoria.categoria_padre_id ? 'selected' : ''}>${'　'.repeat(profundidad)}${escaparHtml(c.categoria_nombre)}</option>`
    )
    .join('');
  const disfrute = categoria ? categoria.categoria_disfrute || 3 : 3;

  abrirDialogoFormulario({
    titulo: categoria ? 'Editar categoría' : 'Nueva categoría',
    textoGuardar: categoria ? 'Guardar cambios' : 'Agregar categoría',
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
      <label>Color <input type="color" name="categoria_color" value="${categoria ? categoria.categoria_color : '#4f7cff'}" /></label>
      <label>Disfrute
        <select name="categoria_disfrute">
          ${[1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${n === disfrute ? 'selected' : ''}>${'⭐'.repeat(n)} (${n})</option>`).join('')}
        </select>
      </label>
      <input type="text" name="categoria_descripcion" value="${escaparHtml(categoria ? categoria.categoria_descripcion || '' : '')}" placeholder="Descripción (opcional)" />
    `,
    conectar: (formulario) => activarMayusculaInicial(formulario.categoria_nombre),
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
    titulo: ubicacion ? 'Editar ubicación' : 'Nueva ubicación',
    textoGuardar: ubicacion ? 'Guardar cambios' : 'Agregar ubicación',
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
    titulo: meta ? 'Editar meta' : 'Nueva meta',
    textoGuardar: meta ? 'Guardar cambios' : 'Agregar meta',
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

export function abrirDialogoPersona({ id = null, alCrear = null } = {}) {
  const persona = id ? estado.personas.find((p) => p.persona_id === id) : null;
  if (id && !persona) return;

  abrirDialogoFormulario({
    titulo: persona ? 'Editar persona' : 'Nueva persona',
    textoGuardar: persona ? 'Guardar cambios' : 'Agregar persona',
    conectar: (formulario) => activarMayusculaInicial(formulario.persona_nombre),
    cuerpoHtml: `
      <div class="fila-nombre-tarea">
        <input type="text" name="persona_nombre" value="${escaparHtml(persona ? persona.persona_nombre : '')}" placeholder="Nombre" required />
      </div>
      <label>Último contacto <input type="date" name="persona_ultimo_contacto" value="${persona ? persona.persona_ultimo_contacto || '' : ''}" /></label>
    `,
    alGuardar: async (formulario) => {
      const nombre = capitalizarPrimera(formulario.persona_nombre.value.trim());
      if (!nombre) {
        alert('La persona necesita un nombre.');
        return false;
      }
      const ultimoContacto = formulario.persona_ultimo_contacto.value;
      if (id) {
        const actual = estado.personas.find((p) => p.persona_id === id);
        if (!actual) {
          noExiste('Esta persona');
          return true;
        }
        Object.assign(actual, { persona_nombre: nombre, persona_ultimo_contacto: ultimoContacto });
      } else {
        const nueva = crearPersona({ persona_nombre: nombre, persona_ultimo_contacto: ultimoContacto });
        estado.personas.push(nueva);
        if (alCrear) alCrear(nueva);
      }
      await persistirYNotificar();
      return true;
    },
  });
}
