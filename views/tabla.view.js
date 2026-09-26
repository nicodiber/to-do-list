import { estado, persistirYNotificar } from '../assets/js/almacenamiento.js';
import { ETIQUETAS_ESTADO, ESTADOS_TAREA, ETIQUETAS_UNIDAD_MANTENIMIENTO } from '../assets/js/modelos.js';
import { arbolCategorias, caminoCategoria, formatearFechaOFechaHora, textoHolgura, escaparHtml, conservarFoco } from '../assets/js/utilidades.js';
import { fechaDeReferencia } from '../assets/js/vista-agenda.js';
import { compararPorPrioridad, calcularHolguraDias, tareasEmpatadas, esTareaAccionable, ordenarConCadenas, asignarOrdenManual, intercambiarAdyacentes, intercambiarCadena, motivoBloqueoOrdenManual } from '../assets/js/tareas-logica.js';
import { abrirEdicionTarea } from '../assets/js/modal-tarea.js';
import { abrirEdicionMasiva } from '../assets/js/edicion-masiva.js';
import { DIAS_SEMANA } from '../assets/js/reprogramar.js';
import { abrirDialogoFormulario } from '../assets/js/dialogo-formulario.js';

let filtroCategoria = '';
// 'activas' (Pendientes y bloqueadas, por defecto) | '' (Todas) | un estado puntual.
let filtroEstado = 'activas';
let filtroImportancia = '';
let filtroPersona = '';
let textoBusqueda = '';
let columnaOrden = null; // null = orden de prioridad real de la app; o 'nombre'|'categoria'|'importancia'|'estado'|'fecha'|'holgura'
let direccionOrden = 'asc';
let paresOmitidos = new Set(); // claves "idA|idB" (ordenados) omitidas en esta sesión de Versus, para no re-ofrecer el mismo par
let panelVersusAbierto = false;
// Selección múltiple (edición masiva, v0.74.0 — mismo patrón que Tareas v0.70.0): estado de la sesión, no un dato de la app.
let modoSeleccionTabla = false;
let seleccionadasTabla = new Set();

/**
 * IDs de una categoría y todas sus descendientes (recorriendo
 * `categoria_padre_id` hacia abajo). Usado por el filtro de categoría de
 * esta vista, que a diferencia del de Tareas es inclusivo de descendientes.
 */
function idsCategoriaYDescendientes(categoriaId, categorias) {
  const resultado = new Set([categoriaId]);
  let agregado = true;
  while (agregado) {
    agregado = false;
    categorias.forEach((c) => {
      if (c.categoria_padre_id && resultado.has(c.categoria_padre_id) && !resultado.has(c.categoria_id)) {
        resultado.add(c.categoria_id);
        agregado = true;
      }
    });
  }
  return resultado;
}

function categoriaDe(tarea) {
  return estado.categorias.find((c) => c.categoria_id === tarea.categoria_id) || null;
}

function compararHolguraAsc(a, b) {
  const diasA = calcularHolguraDias(a);
  const diasB = calcularHolguraDias(b);
  if (diasA === diasB) return 0;
  if (diasA === Infinity) return 1;
  if (diasB === Infinity) return -1;
  return diasA - diasB;
}

const texto = (valor) => escaparHtml(valor == null ? '' : String(valor));
const porTexto = (a, b) => String(a || '').localeCompare(String(b || ''));
const porNumero = (a, b) => (a ?? 0) - (b ?? 0);
const porFecha = (a, b) => (a || '9999-99-99').localeCompare(b || '9999-99-99');
const nombreDe = (lista, idClave, idValor, campoNombre) => {
  const encontrado = lista.find((x) => x[idClave] === idValor);
  return encontrado ? encontrado[campoNombre] : '';
};
const nombrePrevia = (t) => {
  const previa = t.tarea_dependiente ? estado.tareas.find((x) => x.tarea_id === t.tarea_dependiente) : null;
  return previa ? previa.tarea_nombre : '';
};
const nombreProxima = (t) => {
  const proxima = estado.tareas.find((x) => x.tarea_dependiente === t.tarea_id && x.tarea_estado !== 'completada');
  return proxima ? proxima.tarea_nombre : '';
};
const fechaOVacia = (valor) => (valor ? formatearFechaOFechaHora(valor) : '');

/**
 * Todas las columnas posibles de la tabla. `defecto` marca las que se ven al empezar; el botón
 * "Columnas" deja elegir cuáles mostrar. `valor` devuelve el HTML de la celda y `comparar` el orden.
 */
const COLUMNAS = [
  { clave: 'nombre', etiqueta: 'Nombre', defecto: true, valor: (t) => texto(t.tarea_nombre), comparar: (a, b) => a.tarea_nombre.localeCompare(b.tarea_nombre) },
  {
    clave: 'categoria',
    etiqueta: 'Categoría',
    defecto: true,
    // Con categorías anidadas se muestra la cadena completa (Facultad / IR / Prácticos).
    valor: (t) => {
      const categoria = categoriaDe(t);
      return categoria ? texto(caminoCategoria(categoria, estado.categorias)) : '';
    },
    comparar: (a, b) => caminoCategoria(categoriaDe(a), estado.categorias).localeCompare(caminoCategoria(categoriaDe(b), estado.categorias)),
  },
  {
    clave: 'importancia',
    etiqueta: 'Importancia',
    defecto: true,
    valor: (t) => (t.tarea_urgente ? '🔴 Urgente' : ''),
    comparar: (a, b) => Number(!!b.tarea_urgente) - Number(!!a.tarea_urgente),
  },
  { clave: 'estado', etiqueta: 'Estado', defecto: true, valor: (t) => ETIQUETAS_ESTADO[t.tarea_estado], comparar: (a, b) => ESTADOS_TAREA.indexOf(a.tarea_estado) - ESTADOS_TAREA.indexOf(b.tarea_estado) },
  {
    clave: 'fecha',
    etiqueta: 'Fecha',
    defecto: true,
    valor: (t) => {
      const fechaRef = fechaDeReferencia(t);
      const fechaCompleta = t.tarea_fecha_sugerida || t.tarea_fecha_limite || null;
      return fechaRef && fechaCompleta ? formatearFechaOFechaHora(fechaCompleta) : 'Sin fecha';
    },
    comparar: (a, b) => porFecha(fechaDeReferencia(a), fechaDeReferencia(b)),
  },
  { clave: 'holgura', etiqueta: 'Holgura', defecto: true, valor: (t) => (calcularHolguraDias(t) === Infinity ? '—' : textoHolgura(calcularHolguraDias(t))), comparar: compararHolguraAsc },
  { clave: 'disfrute', etiqueta: 'Disfrute', valor: (t) => (t.tarea_disfrute ? '⭐'.repeat(t.tarea_disfrute) : ''), comparar: (a, b) => porNumero(a.tarea_disfrute, b.tarea_disfrute) },
  { clave: 'inicio', etiqueta: 'Habilitada desde', valor: (t) => fechaOVacia(t.tarea_fecha_inicio_habilitada), comparar: (a, b) => porFecha(a.tarea_fecha_inicio_habilitada, b.tarea_fecha_inicio_habilitada) },
  { clave: 'sugerida', etiqueta: 'Sugerida', valor: (t) => fechaOVacia(t.tarea_fecha_sugerida), comparar: (a, b) => porFecha(a.tarea_fecha_sugerida, b.tarea_fecha_sugerida) },
  { clave: 'limite', etiqueta: 'Límite', valor: (t) => fechaOVacia(t.tarea_fecha_limite), comparar: (a, b) => porFecha(a.tarea_fecha_limite, b.tarea_fecha_limite) },
  { clave: 'duracion', etiqueta: 'Duración (min)', valor: (t) => texto(t.tarea_duracion_min), comparar: (a, b) => porNumero(a.tarea_duracion_min, b.tarea_duracion_min) },
  { clave: 'costo', etiqueta: 'Costo', valor: (t) => (t.tarea_costo_estimado ? `$${texto(t.tarea_costo_estimado)}` : ''), comparar: (a, b) => porNumero(a.tarea_costo_estimado, b.tarea_costo_estimado) },
  {
    clave: 'ubicacion',
    etiqueta: 'Ubicación',
    valor: (t) => texto(nombreDe(estado.ubicaciones, 'ubicacion_id', t.ubicacion_id, 'ubicacion_nombre')),
    comparar: (a, b) => porTexto(nombreDe(estado.ubicaciones, 'ubicacion_id', a.ubicacion_id, 'ubicacion_nombre'), nombreDe(estado.ubicaciones, 'ubicacion_id', b.ubicacion_id, 'ubicacion_nombre')),
  },
  {
    clave: 'meta',
    etiqueta: 'Meta',
    valor: (t) => texto(nombreDe(estado.metas, 'meta_id', t.meta_id, 'meta_nombre')),
    comparar: (a, b) => porTexto(nombreDe(estado.metas, 'meta_id', a.meta_id, 'meta_nombre'), nombreDe(estado.metas, 'meta_id', b.meta_id, 'meta_nombre')),
  },
  {
    clave: 'persona',
    etiqueta: 'Persona',
    valor: (t) => texto(nombreDe(estado.personas, 'persona_id', t.persona_id, 'persona_nombre')),
    comparar: (a, b) => porTexto(nombreDe(estado.personas, 'persona_id', a.persona_id, 'persona_nombre'), nombreDe(estado.personas, 'persona_id', b.persona_id, 'persona_nombre')),
  },
  {
    clave: 'mantenimiento',
    etiqueta: 'Repetición',
    valor: (t) => (t.tarea_mantenimiento && t.tarea_mantenimiento_intervalo ? `🔁 cada ${t.tarea_mantenimiento_intervalo.cantidad} ${ETIQUETAS_UNIDAD_MANTENIMIENTO[t.tarea_mantenimiento_intervalo.unidad]}` : ''),
    comparar: (a, b) => Number(!!b.tarea_mantenimiento) - Number(!!a.tarea_mantenimiento),
  },
  {
    clave: 'dias',
    etiqueta: 'Días hábiles',
    valor: (t) =>
      t.tarea_dias_habiles && t.tarea_dias_habiles.length > 0
        ? t.tarea_dias_habiles
            .slice()
            .sort()
            .map((i) => DIAS_SEMANA[i].slice(0, 3))
            .join(', ')
        : '',
    comparar: (a, b) => porNumero((a.tarea_dias_habiles || []).length, (b.tarea_dias_habiles || []).length),
  },
  { clave: 'previa', etiqueta: 'Depende de', valor: (t) => texto(nombrePrevia(t)), comparar: (a, b) => porTexto(nombrePrevia(a), nombrePrevia(b)) },
  { clave: 'proxima', etiqueta: 'Bloquea a', valor: (t) => texto(nombreProxima(t)), comparar: (a, b) => porTexto(nombreProxima(a), nombreProxima(b)) },
  { clave: 'creada', etiqueta: 'Creada', valor: (t) => fechaOVacia(t.tarea_creada_en), comparar: (a, b) => porFecha(a.tarea_creada_en, b.tarea_creada_en) },
  { clave: 'completada', etiqueta: 'Completada el', valor: (t) => fechaOVacia(t.tarea_fecha_fin), comparar: (a, b) => porFecha(a.tarea_fecha_fin, b.tarea_fecha_fin) },
];

const COMPARADORES = Object.fromEntries(COLUMNAS.map((c) => [c.clave, c.comparar]));

// La elección y el orden de columnas son una preferencia de UI (no un dato de la app).
const CLAVE_COLUMNAS = 'super-todo-list:tabla-columnas';

/** Lo guardado en `localStorage`: `{ orden, visibles }`, o `null` sin preferencia (o si es ilegible). Acepta también
 * el formato viejo (array plano de claves visibles, de antes de poder reordenar), tomándolo como `visibles`. */
function preferenciaColumnas() {
  try {
    const guardado = JSON.parse(localStorage.getItem(CLAVE_COLUMNAS));
    if (Array.isArray(guardado)) return { orden: null, visibles: guardado };
    if (guardado && Array.isArray(guardado.orden) && Array.isArray(guardado.visibles)) return guardado;
  } catch {
    // Sin preferencia guardada o ilegible: se usan las de por defecto.
  }
  return null;
}

function guardarPreferenciaColumnas({ orden, visibles }) {
  try {
    localStorage.setItem(CLAVE_COLUMNAS, JSON.stringify({ orden, visibles }));
  } catch {
    // Es solo una preferencia.
  }
}

/** Todas las columnas (visibles u ocultas) en el orden elegido; una columna nueva que la preferencia no conozca
 * todavía (por ejemplo, sumada en una versión futura) aparece al final. */
function todasLasColumnasOrdenadas() {
  const orden = preferenciaColumnas()?.orden;
  if (!orden) return COLUMNAS;
  const porClave = new Map(COLUMNAS.map((c) => [c.clave, c]));
  const ordenadas = orden.map((clave) => porClave.get(clave)).filter(Boolean);
  COLUMNAS.forEach((c) => {
    if (!orden.includes(c.clave)) ordenadas.push(c);
  });
  return ordenadas;
}

/** Columnas visibles, en el orden elegido (o las de por defecto, en el orden de `COLUMNAS`). */
function columnasVisibles() {
  const visibles = preferenciaColumnas()?.visibles;
  if (!visibles) return COLUMNAS.filter((c) => c.defecto);
  const visible = todasLasColumnasOrdenadas().filter((c) => visibles.includes(c.clave));
  return visible.length > 0 ? visible : COLUMNAS.filter((c) => c.defecto);
}

/** Diálogo con una fila por columna (casilla de visibilidad + ▲▼ para reordenar) para elegir cuáles se ven y en qué orden. */
function abrirSelectorColumnas(alCambiar) {
  const visibles = new Set(columnasVisibles().map((c) => c.clave));

  function actualizarLimites(lista) {
    const filas = [...lista.children];
    filas.forEach((fila, i) => {
      fila.querySelector('[data-accion="subir"]').disabled = i === 0;
      fila.querySelector('[data-accion="bajar"]').disabled = i === filas.length - 1;
    });
  }

  abrirDialogoFormulario({
    titulo: 'Columnas de la tabla',
    textoGuardar: 'Guardar',
    cuerpoHtml: `
      <p class="ayuda ayuda-formulario">Elegí qué columnas mostrar y en qué orden. Se recuerda tu elección en este dispositivo.</p>
      <div class="lista-columnas-tabla">
        ${todasLasColumnasOrdenadas()
          .map(
            (c) => `
          <div class="fila-columna-tabla" data-clave="${c.clave}">
            <label class="dia-habil"><input type="checkbox" name="columna" value="${c.clave}" ${visibles.has(c.clave) ? 'checked' : ''} /> ${c.etiqueta}</label>
            <span class="acciones-prioridad">
              <button type="button" data-accion="subir" title="Subir">▲</button>
              <button type="button" data-accion="bajar" title="Bajar">▼</button>
            </span>
          </div>`
          )
          .join('')}
      </div>
    `,
    conectar: (formulario) => {
      const lista = formulario.querySelector('.lista-columnas-tabla');
      lista.querySelectorAll('.fila-columna-tabla').forEach((fila) => {
        fila.querySelector('[data-accion="subir"]').addEventListener('click', () => {
          const anterior = fila.previousElementSibling;
          if (anterior) lista.insertBefore(fila, anterior);
          actualizarLimites(lista);
        });
        fila.querySelector('[data-accion="bajar"]').addEventListener('click', () => {
          const siguiente = fila.nextElementSibling;
          if (siguiente) lista.insertBefore(siguiente, fila);
          actualizarLimites(lista);
        });
      });
      actualizarLimites(lista);
    },
    alGuardar: (formulario) => {
      const filas = [...formulario.querySelectorAll('.fila-columna-tabla')];
      const orden = filas.map((f) => f.dataset.clave);
      const elegidas = filas.filter((f) => f.querySelector('input[name="columna"]').checked).map((f) => f.dataset.clave);
      if (elegidas.length === 0) {
        alert('Elegí al menos una columna.');
        return false;
      }
      guardarPreferenciaColumnas({ orden, visibles: elegidas });
      alCambiar();
      return true;
    },
  });
}

/**
 * Vista de referencia y auditoría: todas las tareas (de cualquier estado),
 * con filtros y orden por columna. Por defecto ordena por el criterio real
 * de prioridad de la app (`compararPorPrioridad`), para poder detectar de
 * un vistazo si algo quedó mal priorizado. Hacé clic en una fila para
 * editarla.
 */
export function renderVistaTabla(contenedor) {
  const columnas = columnasVisibles();
  // Si la columna elegida para ordenar se ocultó, vuelve el orden de prioridad.
  if (columnaOrden !== null && !columnas.some((c) => c.clave === columnaOrden)) columnaOrden = null;
  // Si alguna tarea seleccionada se eliminó mientras tanto, se descarta sola.
  seleccionadasTabla = new Set([...seleccionadasTabla].filter((id) => estado.tareas.some((t) => t.tarea_id === id)));
  let filas = estado.tareas
    .filter((t) => !filtroCategoria || idsCategoriaYDescendientes(filtroCategoria, estado.categorias).has(t.categoria_id))
    .filter((t) => (filtroEstado === 'activas' ? t.tarea_estado !== 'completada' : !filtroEstado || t.tarea_estado === filtroEstado))
    .filter((t) => !filtroImportancia || t.tarea_urgente)
    .filter((t) => !filtroPersona || t.persona_id === filtroPersona)
    .filter((t) => !textoBusqueda || t.tarea_nombre.toLowerCase().includes(textoBusqueda.toLowerCase()))
    .slice();

  if (columnaOrden === null) {
    // Cada bloqueada queda justo detrás de su previa: cadena junta, en el orden en que se va a poder hacer.
    filas.sort((a, b) => compararPorPrioridad(a, b, estado.categorias));
    filas = ordenarConCadenas(filas);
  } else {
    const direccion = direccionOrden === 'asc' ? 1 : -1;
    filas.sort((a, b) => direccion * COMPARADORES[columnaOrden](a, b));
  }

  contenedor.innerHTML = `
    <h2>🧾 Tabla</h2>
    <p class="ayuda">Todas tus tareas, en el orden real de prioridad de la app. Filtrá, buscá u ordená por columna para auditar o encontrar algo puntual. Hacé clic en una fila para editarla.</p>
    <div class="filtros">
      <label title="Mostrar solo las tareas de esta categoría (y sus subcategorías)">🗂️ Categoría
        <select id="filtro-categoria-todas">
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
        <select id="filtro-estado-todas">
          <option value="">Todos</option>
          <option value="activas" ${filtroEstado === 'activas' ? 'selected' : ''}>🚦 Pendientes y bloqueadas</option>
          <option value="bloqueada" ${filtroEstado === 'bloqueada' ? 'selected' : ''}>Bloqueada</option>
          <option value="pendiente" ${filtroEstado === 'pendiente' ? 'selected' : ''}>Pendiente</option>
          <option value="completada" ${filtroEstado === 'completada' ? 'selected' : ''}>Completada</option>
        </select>
      </label>
      <label title="Mostrar solo las tareas urgentes">❗ Importancia
        <select id="filtro-importancia-todas">
          <option value="">Todas</option>
          <option value="urgente" ${filtroImportancia === 'urgente' ? 'selected' : ''}>🔴 Solo urgentes</option>
        </select>
      </label>
      <label title="Mostrar solo las tareas asociadas a esta persona">👤 Persona
        <select id="filtro-persona-todas">
          <option value="">Todas</option>
          ${estado.personas.map((p) => `<option value="${p.persona_id}" ${filtroPersona === p.persona_id ? 'selected' : ''}>${escaparHtml(p.persona_nombre)}</option>`).join('')}
        </select>
      </label>
      <label>🔎 Buscar
        <input type="search" id="buscador-nombre-todas" title="Buscar por nombre (tecla F)" placeholder="Nombre de la tarea..." value="${escaparHtml(textoBusqueda)}" />
      </label>
      <button title="Elegir qué columnas mostrar" type="button" id="boton-columnas-tabla">🧱 Columnas</button>
      <button title="Volver al orden por prioridad" type="button" id="boton-reset-orden-todas">↺ Prioridad</button>
      <button title="Desempatar a mano tareas igual de prioritarias" type="button" id="boton-versus-todas">⚔️ Versus</button>
      <button title="Elegir varias tareas para editarlas juntas" type="button" id="boton-modo-seleccion-tabla" class="${modoSeleccionTabla ? 'activo' : ''}">☑️ Seleccionar</button>
    </div>
    <div id="contenedor-panel-versus" hidden></div>
    <div id="barra-seleccion-tabla" class="barra-seleccion" ${modoSeleccionTabla ? '' : 'hidden'}>
      <span id="conteo-seleccion-tabla">0 seleccionadas</span>
      <button title="Elegir todas las tareas visibles" type="button" id="boton-seleccionar-todas-tabla">☑️ Seleccionar todas</button>
      <button title="Editar los campos en común de las tareas elegidas" type="button" id="boton-editar-seleccion-tabla" class="boton-primario" disabled>✏️ Editar tareas seleccionadas</button>
      <button title="Salir del modo selección" type="button" id="boton-cancelar-seleccion-tabla">Cancelar</button>
    </div>
    <div class="tabla-tareas-contenedor">
      <table class="tabla-informe">
        <thead>
          <tr>
            ${modoSeleccionTabla ? '<th class="th-seleccion-tabla"></th>' : ''}
            ${columnaOrden === null ? '<th class="th-orden-manual" title="Reordenar a mano (solo entre tareas empatadas en prioridad y sin relación de cadena)">Orden</th>' : ''}
            ${columnas.map(({ clave, etiqueta }) => {
              const activa = columnaOrden === clave;
              const flecha = activa ? (direccionOrden === 'asc' ? ' ▲' : ' ▼') : '';
              return `<th data-columna="${clave}" class="th-ordenable${activa ? ' activa' : ''}">${etiqueta}${flecha}</th>`;
            }).join('')}
          </tr>
        </thead>
        <tbody id="cuerpo-tabla-todas"></tbody>
      </table>
    </div>
  `;

  contenedor.querySelector('#filtro-categoria-todas').addEventListener('change', (evento) => {
    filtroCategoria = evento.target.value;
    renderVistaTabla(contenedor);
  });
  contenedor.querySelector('#filtro-estado-todas').addEventListener('change', (evento) => {
    filtroEstado = evento.target.value;
    renderVistaTabla(contenedor);
  });
  contenedor.querySelector('#filtro-importancia-todas').addEventListener('change', (evento) => {
    filtroImportancia = evento.target.value;
    renderVistaTabla(contenedor);
  });
  contenedor.querySelector('#filtro-persona-todas').addEventListener('change', (evento) => {
    filtroPersona = evento.target.value;
    renderVistaTabla(contenedor);
  });
  contenedor.querySelector('#buscador-nombre-todas').addEventListener('input', (evento) => {
    textoBusqueda = evento.target.value;
    conservarFoco(contenedor, () => renderVistaTabla(contenedor));
  });
  contenedor.querySelector('#boton-reset-orden-todas').addEventListener('click', () => {
    columnaOrden = null;
    renderVistaTabla(contenedor);
  });
  const contenedorPanelVersus = contenedor.querySelector('#contenedor-panel-versus');
  contenedor.querySelector('#boton-versus-todas').addEventListener('click', () => {
    panelVersusAbierto = !panelVersusAbierto;
    contenedorPanelVersus.innerHTML = '';
    contenedorPanelVersus.hidden = !panelVersusAbierto;
    if (panelVersusAbierto) contenedorPanelVersus.appendChild(crearPanelVersus(contenedor));
  });
  if (panelVersusAbierto) {
    contenedorPanelVersus.appendChild(crearPanelVersus(contenedor));
    contenedorPanelVersus.hidden = false;
  }
  contenedor.querySelectorAll('.th-ordenable').forEach((th) => {
    th.addEventListener('click', () => {
      const clave = th.dataset.columna;
      if (columnaOrden === clave) {
        direccionOrden = direccionOrden === 'asc' ? 'desc' : 'asc';
      } else {
        columnaOrden = clave;
        direccionOrden = 'asc';
      }
      renderVistaTabla(contenedor);
    });
  });

  contenedor.querySelector('#boton-columnas-tabla').addEventListener('click', () => abrirSelectorColumnas(() => renderVistaTabla(contenedor)));

  contenedor.querySelector('#boton-modo-seleccion-tabla').addEventListener('click', () => {
    modoSeleccionTabla = !modoSeleccionTabla;
    if (!modoSeleccionTabla) seleccionadasTabla.clear();
    renderVistaTabla(contenedor);
  });
  const conteoSeleccionTabla = contenedor.querySelector('#conteo-seleccion-tabla');
  const botonEditarSeleccionTabla = contenedor.querySelector('#boton-editar-seleccion-tabla');
  const actualizarBarraSeleccionTabla = () => {
    conteoSeleccionTabla.textContent = `${seleccionadasTabla.size} seleccionada${seleccionadasTabla.size === 1 ? '' : 's'}`;
    botonEditarSeleccionTabla.disabled = seleccionadasTabla.size === 0;
  };
  contenedor.querySelector('#boton-cancelar-seleccion-tabla').addEventListener('click', () => {
    modoSeleccionTabla = false;
    seleccionadasTabla.clear();
    renderVistaTabla(contenedor);
  });
  contenedor.querySelector('#boton-seleccionar-todas-tabla').addEventListener('click', () => {
    filas.filter((t) => t.tarea_estado !== 'completada').forEach((t) => seleccionadasTabla.add(t.tarea_id));
    renderVistaTabla(contenedor);
  });
  botonEditarSeleccionTabla.addEventListener('click', () => {
    const tareasElegidas = estado.tareas.filter((t) => seleccionadasTabla.has(t.tarea_id));
    abrirEdicionMasiva(tareasElegidas, () => {
      modoSeleccionTabla = false;
      seleccionadasTabla.clear();
      renderVistaTabla(contenedor);
    });
  });
  actualizarBarraSeleccionTabla();

  const cuerpo = contenedor.querySelector('#cuerpo-tabla-todas');
  if (filas.length === 0) {
    cuerpo.innerHTML = '<tr><td colspan="${columnas.length}" class="mensaje-vacio">No hay tareas que coincidan con el filtro.</td></tr>';
    return;
  }

  const conOrdenManual = columnaOrden === null;
  filas.forEach((tarea, indice) => cuerpo.appendChild(renderFila(tarea, columnas, conOrdenManual ? { indice, filas } : null, actualizarBarraSeleccionTabla)));
}

function renderFila(tarea, columnas, ordenManual, actualizarBarraSeleccionTabla = () => {}) {
  const fila = document.createElement('tr');
  fila.className = 'fila-tabla-tarea';
  const categoria = categoriaDe(tarea);
  fila.style.setProperty('--color-categoria', categoria ? categoria.categoria_color : 'var(--color-borde)');
  const puedeSeleccionar = modoSeleccionTabla && tarea.tarea_estado !== 'completada';
  const celdaSeleccion = modoSeleccionTabla
    ? `<td class="td-seleccion-tabla">${puedeSeleccionar ? `<input type="checkbox" data-seleccionar="${tarea.tarea_id}" ${seleccionadasTabla.has(tarea.tarea_id) ? 'checked' : ''} />` : ''}</td>`
    : '';
  const celdaOrden = ordenManual ? `<td class="td-orden-manual"><span class="acciones-prioridad"><button type="button" data-accion="subir-orden" title="Subir">▲</button><button type="button" data-accion="bajar-orden" title="Bajar">▼</button></span></td>` : '';
  fila.innerHTML = celdaSeleccion + celdaOrden + columnas.map((c) => `<td>${c.valor(tarea)}</td>`).join('');
  fila.querySelector('[data-seleccionar]')?.addEventListener('click', (evento) => {
    evento.stopPropagation();
    if (evento.target.checked) seleccionadasTabla.add(tarea.tarea_id);
    else seleccionadasTabla.delete(tarea.tarea_id);
    actualizarBarraSeleccionTabla();
  });
  fila.addEventListener('click', () => {
    abrirEdicionTarea(tarea.tarea_id);
  });

  if (ordenManual) {
    const { indice, filas } = ordenManual;
    const anterior = indice > 0 ? filas[indice - 1] : null;
    const siguiente = indice < filas.length - 1 ? filas[indice + 1] : null;
    const esCadena = (a, b) => b.tarea_id === a.tarea_dependiente;
    const botonSubir = fila.querySelector('[data-accion="subir-orden"]');
    const botonBajar = fila.querySelector('[data-accion="bajar-orden"]');
    const motivoSubir = anterior ? motivoBloqueoOrdenManual(tarea, anterior, estado.categorias) : 'Ya es la primera.';
    const motivoBajar = siguiente ? motivoBloqueoOrdenManual(tarea, siguiente, estado.categorias) : 'Ya es la última.';
    botonSubir.disabled = !!motivoSubir;
    botonSubir.title = motivoSubir || (anterior && esCadena(tarea, anterior) ? 'Subir (reordena la cadena)' : 'Subir');
    botonBajar.disabled = !!motivoBajar;
    botonBajar.title = motivoBajar || (siguiente && esCadena(siguiente, tarea) ? 'Bajar (reordena la cadena)' : 'Bajar');
    botonSubir.addEventListener('click', async (evento) => {
      evento.stopPropagation();
      if (!anterior) return;
      if (esCadena(tarea, anterior)) intercambiarCadena(tarea, anterior, estado.tareas);
      else intercambiarAdyacentes(tarea, anterior, filas, estado.tareas, estado.categorias);
      await persistirYNotificar();
    });
    botonBajar.addEventListener('click', async (evento) => {
      evento.stopPropagation();
      if (!siguiente) return;
      if (esCadena(siguiente, tarea)) intercambiarCadena(siguiente, tarea, estado.tareas);
      else intercambiarAdyacentes(siguiente, tarea, filas, estado.tareas, estado.categorias);
      await persistirYNotificar();
    });
  }

  return fila;
}

/**
 * Agrupa las tareas accionables en clusters de tareas mutuamente empatadas
 * (`tareasEmpatadas`, transitiva porque compara claves numéricas), para la
 * herramienta "Versus". Clusters de una sola tarea se descartan.
 */
function construirClusteres(tareas, categorias) {
  const restantes = [...tareas];
  const clusters = [];
  while (restantes.length > 0) {
    const base = restantes.shift();
    const grupo = [base];
    for (let i = restantes.length - 1; i >= 0; i--) {
      if (tareasEmpatadas(base, restantes[i], categorias)) {
        grupo.push(restantes.splice(i, 1)[0]);
      }
    }
    if (grupo.length >= 2) clusters.push(grupo);
  }
  return clusters;
}

function claveDePar(a, b) {
  return [a.tarea_id, b.tarea_id].sort().join('|');
}

/**
 * Próximo par sin resolver a ofrecer en "Versus": primer par adyacente,
 * dentro del primer cluster con pares disponibles, que no haya sido
 * omitido ya en esta sesión.
 */
function proximoParVersus() {
  const accionables = estado.tareas.filter((t) => esTareaAccionable(t));
  const clusters = construirClusteres(accionables, estado.categorias);
  for (const grupo of clusters) {
    for (let i = 0; i < grupo.length - 1; i++) {
      const [a, b] = [grupo[i], grupo[i + 1]];
      if (!paresOmitidos.has(claveDePar(a, b))) return [a, b];
    }
  }
  return null;
}

function infoBreveTarea(tarea) {
  const categoria = categoriaDe(tarea);
  const holgura = calcularHolguraDias(tarea);
  return `
    <strong>${escaparHtml(tarea.tarea_nombre)}</strong>
    <span class="etiquetas">
      ${categoria ? `<span class="etiqueta" style="background:${categoria.categoria_color}">${escaparHtml(caminoCategoria(categoria, estado.categorias))}</span>` : ''}
      ${tarea.tarea_urgente ? '<span class="etiqueta-fecha">🔴 Urgente</span>' : ''}
      ${tarea.tarea_fecha_limite ? `<span class="etiqueta-fecha">Límite: ${formatearFechaOFechaHora(tarea.tarea_fecha_limite)}${holgura !== Infinity ? ` · ${textoHolgura(holgura)}` : ''}</span>` : ''}
    </span>
  `;
}

/**
 * Panel "Versus": compara de a 2 tareas accionables empatadas en prioridad
 * (ver `construirClusteres`/`proximoParVersus`) y deja elegir cuál conviene
 * antes, o "Da igual / Omitir". Elegir asigna `tarea_prioridad_manual` a
 * ambas (un valor global creciente, ganadora < perdedora) — a partir de ahí
 * dejan de estar empatadas y no se vuelven a ofrecer. Omitir no asigna nada
 * (siguen empatadas), solo evita re-ofrecer el mismo par en esta sesión.
 */
function crearPanelVersus(contenedorVista) {
  const panel = document.createElement('div');
  panel.className = 'panel-versus';

  const par = proximoParVersus();
  if (!par) {
    panel.innerHTML = '<p class="mensaje-vacio">No hay tareas empatadas en prioridad para comparar ahora mismo.</p>';
    return panel;
  }

  const [a, b] = par;
  panel.innerHTML = `
    <p class="ayuda">¿Cuál de estas dos conviene hacer antes?</p>
    <div class="versus-tarjetas">
      <div class="versus-tarjeta">
        ${infoBreveTarea(a)}
        <button title="Esta tarea es más prioritaria" type="button" data-accion="elegir-a" class="boton-primario">Elegir esta ▸</button>
      </div>
      <div class="versus-tarjeta">
        ${infoBreveTarea(b)}
        <button title="Esta tarea es más prioritaria" type="button" data-accion="elegir-b" class="boton-primario">Elegir esta ▸</button>
      </div>
    </div>
    <div class="versus-acciones">
      <button title="No elegir: quedan igual de prioritarias" type="button" data-accion="omitir">🤷 Da igual / Omitir</button>
    </div>
  `;

  async function elegir(preferida, otra) {
    asignarOrdenManual(preferida, otra, estado.tareas);
    await persistirYNotificar();
    renderVistaTabla(contenedorVista);
  }

  panel.querySelector('[data-accion="elegir-a"]').addEventListener('click', () => elegir(a, b));
  panel.querySelector('[data-accion="elegir-b"]').addEventListener('click', () => elegir(b, a));
  panel.querySelector('[data-accion="omitir"]').addEventListener('click', () => {
    paresOmitidos.add(claveDePar(a, b));
    renderVistaTabla(contenedorVista);
  });

  return panel;
}
