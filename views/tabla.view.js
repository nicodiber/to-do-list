import { estado, persistirYNotificar } from '../assets/js/almacenamiento.js';
import { ETIQUETAS_ESTADO, ESTADOS_TAREA, ETIQUETAS_UNIDAD_MANTENIMIENTO } from '../assets/js/modelos.js';
import { arbolCategorias, caminoCategoria, formatearFechaOFechaHora, textoHolgura, textoHolguraConHoras, escaparHtml, conservarFoco, tieneHora, hoyISO } from '../assets/js/utilidades.js';
import { fechaDeReferencia } from '../assets/js/vista-agenda.js';
import { compararPorPrioridad, calcularHolguraDias, calcularHolguraHoras, tareasEmpatadas, esTareaAccionable, ordenarConCadenas, asignarOrdenManual, intercambiarAdyacentes, intercambiarCadena, motivoBloqueoOrdenManual, eliminarTarea, disfruteEfectivo, textoRepeticion, cumplirTarea, reabrirTarea, reprogramarTareaConCascada, avisoInconsistentes } from '../assets/js/tareas-logica.js';
import { abrirEdicionTarea, abrirAltaTarea, copiaDeTarea, ofrecerCrearTareaSeguimiento } from '../assets/js/modal-tarea.js';
import { abrirEdicionMasiva } from '../assets/js/edicion-masiva.js';
import { DIAS_SEMANA, crearPanelReprogramar } from '../assets/js/reprogramar.js';
import { abrirListaPlantillas, abrirGuardarCadenaComoPlantilla } from '../assets/js/plantillas.js';
import { preguntarTiempoReal } from '../assets/js/tiempo-real.js';
import { crearPanelIAPrioridades } from '../assets/js/panel-ia-prioridades.js';
import { obtenerUbicacionActual, establecerUbicacionActual } from '../assets/js/ubicacion-actual.js';
import { htmlChecklistTarjeta, conectarChecklistTarjeta } from '../assets/js/checklist-tarjeta.js';
import { ofrecerExportarACalendar } from '../assets/js/exportar-calendar.js';
import { abrirDialogoFormulario } from '../assets/js/dialogo-formulario.js';
import { avisar, confirmar } from '../assets/js/avisos.js';

let filtroCategoria = '';
// 'activas' (Pendientes y bloqueadas, por defecto) | '' (Todas) | un estado puntual.
let filtroEstado = 'activas';
let filtroImportancia = '';
let filtroPersona = '';
// Agrupar la lista por categoría (v0.102.0, viene de la vista Tareas, que se eliminó).
let agruparPorCategoria = false;
// Checklists desplegados en la fila (sobreviven a los redibujados que provoca tildar una casilla).
const checklistsAbiertos = new Set();

/** Fija el filtro de categoría (lo usa «📋 Ver tareas» de Categorías, antes de navegar a esta vista). */
export function establecerFiltroCategoria(categoriaId) {
  filtroCategoria = categoriaId;
  filtroEstado = '';
}

const ESTADOS_SELECCIONABLES = ['pendiente', 'completada'];
const ETIQUETAS_ESTADO_SELECCIONABLE = { pendiente: 'Pendiente', completada: 'Completada' };
let textoBusqueda = '';
let columnaOrden = 'holgura'; // null = orden de prioridad real de la app; o 'nombre'|'categoria'|'importancia'|'estado'|'sugerida'|'holgura' (v0.88.0: abre ordenada por holgura)
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

/** "Habilitada desde" (v0.100.0): una tarea activa que ya se puede empezar muestra "Ahora" en vez de una fecha vieja. */
const habilitadaTexto = (t) => {
  const valor = t.tarea_fecha_inicio_habilitada;
  if (!valor || t.tarea_estado === 'completada') return fechaOVacia(valor);
  const yaHabilitada = tieneHora(valor) ? new Date(valor) <= new Date() : valor <= hoyISO();
  return yaHabilitada ? 'Ahora' : fechaOVacia(valor);
};

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
  { clave: 'holgura', etiqueta: 'Holgura', defecto: true, valor: (t) => (calcularHolguraDias(t) === Infinity ? '—' : textoHolguraConHoras(calcularHolguraHoras(t))), comparar: compararHolguraAsc },
  {
    clave: 'disfrute',
    etiqueta: 'Disfrute',
    // v0.100.0: sin disfrute propio cuenta el de la categoría (se marca como "heredado").
    valor: (t) => {
      const { nivel, heredado } = disfruteEfectivo(t, estado.categorias);
      return nivel ? `<span ${heredado ? 'title="Heredado de la categoría" style="opacity:.6"' : ''}>${'⭐'.repeat(nivel)}</span>` : '';
    },
    comparar: (a, b) => porNumero(disfruteEfectivo(a, estado.categorias).nivel, disfruteEfectivo(b, estado.categorias).nivel),
  },
  { clave: 'inicio', etiqueta: 'Habilitada desde', valor: habilitadaTexto, comparar: (a, b) => porFecha(a.tarea_fecha_inicio_habilitada, b.tarea_fecha_inicio_habilitada) },
  {
    clave: 'delegada',
    etiqueta: 'Delegada a',
    valor: (t) => {
      const persona = t.tarea_delegada_a ? estado.personas.find((x) => x.persona_id === t.tarea_delegada_a) : null;
      if (!persona) return '';
      return `🤝 ${escaparHtml(persona.persona_nombre)}${t.tarea_seguimiento_fecha ? ` · seguimiento ${fechaOVacia(t.tarea_seguimiento_fecha)}` : ''}`;
    },
    comparar: (a, b) => (a.tarea_seguimiento_fecha || '9999').localeCompare(b.tarea_seguimiento_fecha || '9999'),
  },
  {
    clave: 'sugerida',
    etiqueta: 'Sugerida',
    defecto: true,
    // v0.99.0: una tarea activa sin hora no debería existir; si pasa (sin sesión de Calendar o sin hueco en el horizonte) se ve el motivo.
    valor: (t) =>
      t.tarea_fecha_sugerida || t.tarea_estado === 'completada'
        ? fechaOVacia(t.tarea_fecha_sugerida)
        : '<span title="Todavía sin hora: se agenda sola apenas se pueda leer tu Google Calendar (sin sesión de Google, o sin ningún hueco libre en el horizonte configurado)">⏳ Sin agendar</span>',
    comparar: (a, b) => porFecha(a.tarea_fecha_sugerida, b.tarea_fecha_sugerida) },
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
    valor: (t) => (t.tarea_mantenimiento && textoRepeticion(t) ? `🔁 ${textoRepeticion(t)}${t.tarea_dia_obligatorio ? ' 📌' : ''}` : ''),
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
    // v0.102.0: la columna «Fecha» se eliminó (era la sugerida o, sin ella, el límite): en su lugar queda «Sugerida».
    const sinFecha = (lista) => [...new Set(lista.map((clave) => (clave === 'fecha' ? 'sugerida' : clave)))];
    if (Array.isArray(guardado)) return { orden: null, visibles: sinFecha(guardado) };
    if (guardado && Array.isArray(guardado.orden) && Array.isArray(guardado.visibles)) return { orden: sinFecha(guardado.orden), visibles: sinFecha(guardado.visibles) };
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
    alGuardar: async (formulario) => {
      const filas = [...formulario.querySelectorAll('.fila-columna-tabla')];
      const orden = filas.map((f) => f.dataset.clave);
      const elegidas = filas.filter((f) => f.querySelector('input[name="columna"]').checked).map((f) => f.dataset.clave);
      if (elegidas.length === 0) {
        await avisar('Elegí al menos una columna.');
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
  const filtroUbicacion = obtenerUbicacionActual();
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
    .filter((t) => !filtroUbicacion || t.ubicacion_id === filtroUbicacion)
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
    <h2 title="Todas tus tareas, en el orden real de prioridad de la app. Filtrá, buscá u ordená por columna para auditar o encontrar algo puntual. Hacé clic en una fila para editarla.">🧾 Tabla</h2>
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
      <label title="Mostrar solo las tareas de este lugar">📍 Ubicación
        <select id="filtro-ubicacion-todas">
          <option value="">Todas</option>
          ${estado.ubicaciones.map((u) => `<option value="${u.ubicacion_id}" ${filtroUbicacion === u.ubicacion_id ? 'selected' : ''}>${escaparHtml(u.ubicacion_nombre)}</option>`).join('')}
        </select>
      </label>
      <label class="interruptor" title="Separar la lista por categoría"><input type="checkbox" role="switch" id="toggle-agrupar-categoria-tabla" ${agruparPorCategoria ? 'checked' : ''} /><span class="interruptor-pista" aria-hidden="true"></span><span class="interruptor-texto">🧩 Agrupar por categoría</span><span class="interruptor-estado" aria-hidden="true"></span></label>
      <label>🔎 Buscar
        <input type="search" id="buscador-nombre-todas" title="Buscar por nombre (tecla F)" placeholder="Nombre de la tarea..." value="${escaparHtml(textoBusqueda)}" />
      </label>
      <button title="Elegir qué columnas mostrar" type="button" id="boton-columnas-tabla">🧱 Columnas</button>
      <button title="Volver al orden por prioridad" type="button" id="boton-reset-orden-todas">↺ Prioridad</button>
      <button title="Desempatar a mano tareas igual de prioritarias" type="button" id="boton-versus-todas">⚔️ Versus</button>
      <button title="Crear un grupo de tareas encadenadas a partir de un procedimiento típico guardado" type="button" id="boton-plantillas">📋 Plantillas</button>
      <button title="Reordenar las prioridades con ayuda de tu IA" type="button" id="boton-ia-prioridades">🤖 Reestructurar prioridades con IA</button>
      <button title="Elegir varias tareas para editarlas juntas" type="button" id="boton-modo-seleccion-tabla" class="${modoSeleccionTabla ? 'activo' : ''}">☑️ Seleccionar</button>
    </div>
    <div id="contenedor-panel-versus" hidden></div>
    <div id="contenedor-panel-ia-prioridades" hidden></div>
    <div id="barra-seleccion-tabla" class="barra-seleccion" ${modoSeleccionTabla ? '' : 'hidden'}>
      <span id="conteo-seleccion-tabla">0 seleccionadas</span>
      <button title="Elegir todas las tareas visibles" type="button" id="boton-seleccionar-todas-tabla">☑️ Seleccionar todas</button>
      <button title="Editar los campos en común de las tareas elegidas" type="button" id="boton-editar-seleccion-tabla" class="boton-primario" disabled>✏️ Editar tareas seleccionadas</button>
      <button title="Eliminar las tareas elegidas" type="button" id="boton-eliminar-seleccion-tabla" disabled>🗑️ Eliminar ${seleccionadasTabla.size}</button>
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
            <th class="th-acciones-tabla">Acciones</th>
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
  contenedor.querySelector('#filtro-ubicacion-todas').addEventListener('change', (evento) => {
    establecerUbicacionActual(evento.target.value);
    renderVistaTabla(contenedor);
  });
  contenedor.querySelector('#toggle-agrupar-categoria-tabla').addEventListener('change', (evento) => {
    agruparPorCategoria = evento.target.checked;
    renderVistaTabla(contenedor);
  });
  contenedor.querySelector('#boton-plantillas').addEventListener('click', abrirListaPlantillas);
  const contenedorPanelIA = contenedor.querySelector('#contenedor-panel-ia-prioridades');
  contenedor.querySelector('#boton-ia-prioridades').addEventListener('click', () => {
    const yaAbierto = !contenedorPanelIA.hidden;
    contenedorPanelIA.innerHTML = '';
    contenedorPanelIA.hidden = true;
    if (yaAbierto) return;
    contenedorPanelIA.appendChild(crearPanelIAPrioridades());
    contenedorPanelIA.hidden = false;
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
  const botonEliminarSeleccionTabla = contenedor.querySelector('#boton-eliminar-seleccion-tabla');
  const actualizarBarraSeleccionTabla = () => {
    conteoSeleccionTabla.textContent = `${seleccionadasTabla.size} seleccionada${seleccionadasTabla.size === 1 ? '' : 's'}`;
    botonEditarSeleccionTabla.disabled = seleccionadasTabla.size === 0;
    botonEliminarSeleccionTabla.disabled = seleccionadasTabla.size === 0;
    botonEliminarSeleccionTabla.textContent = `🗑️ Eliminar ${seleccionadasTabla.size}`;
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
  botonEliminarSeleccionTabla.addEventListener('click', async () => {
    if (!await confirmar(`¿Eliminar las ${seleccionadasTabla.size} tareas seleccionadas?`, { peligro: true, textoAceptar: 'Eliminar' })) return;
    estado.tareas.filter((t) => seleccionadasTabla.has(t.tarea_id)).forEach((tarea) => eliminarTarea(tarea, estado));
    modoSeleccionTabla = false;
    seleccionadasTabla.clear();
    await persistirYNotificar();
  });
  actualizarBarraSeleccionTabla();

  const cuerpo = contenedor.querySelector('#cuerpo-tabla-todas');
  if (filas.length === 0) {
    cuerpo.innerHTML = `<tr><td colspan="${columnas.length + 1}" class="mensaje-vacio">No hay tareas que coincidan con el filtro.</td></tr>`;
    return;
  }

  const conOrdenManual = columnaOrden === null;
  const anchoTotal = columnas.length + 1 + (modoSeleccionTabla ? 1 : 0) + (conOrdenManual ? 1 : 0);
  const dibujar = (tarea) => cuerpo.appendChild(renderFila(tarea, columnas, conOrdenManual ? { indice: filas.indexOf(tarea), filas } : null, actualizarBarraSeleccionTabla, anchoTotal));
  if (!agruparPorCategoria) {
    filas.forEach(dibujar);
    return;
  }
  // Agrupadas por categoría (el orden dentro de cada grupo es el de la lista; ▲▼ sigue siendo el orden global).
  const separador = (nombre, color) => {
    const tr = document.createElement('tr');
    tr.className = 'separador-categoria-tabla';
    tr.innerHTML = `<td colspan="${anchoTotal}" style="--color-separador:${color || '#888'}"></td>`;
    tr.firstElementChild.textContent = nombre;
    return tr;
  };
  arbolCategorias(estado.categorias).forEach(({ categoria }) => {
    const delGrupo = filas.filter((t) => t.categoria_id === categoria.categoria_id);
    if (delGrupo.length === 0) return;
    cuerpo.appendChild(separador(caminoCategoria(categoria, estado.categorias), categoria.categoria_color));
    delGrupo.forEach(dibujar);
  });
  const sinCategoria = filas.filter((t) => !t.categoria_id);
  if (sinCategoria.length > 0) {
    cuerpo.appendChild(separador('Sin categoría'));
    sinCategoria.forEach(dibujar);
  }
}

function renderFila(tarea, columnas, ordenManual, actualizarBarraSeleccionTabla = () => {}, anchoTotal = columnas.length + 1) {
  const fila = document.createElement('tr');
  fila.className = 'fila-tabla-tarea';
  const categoria = categoriaDe(tarea);
  fila.style.setProperty('--color-categoria', categoria ? categoria.categoria_color : 'var(--color-borde)');
  const puedeSeleccionar = modoSeleccionTabla && tarea.tarea_estado !== 'completada';
  const celdaSeleccion = modoSeleccionTabla
    ? `<td class="td-seleccion-tabla">${puedeSeleccionar ? `<input type="checkbox" data-seleccionar="${tarea.tarea_id}" ${seleccionadasTabla.has(tarea.tarea_id) ? 'checked' : ''} />` : ''}</td>`
    : '';
  const celdaOrden = ordenManual ? `<td class="td-orden-manual"><span class="acciones-prioridad"><button type="button" data-accion="subir-orden" title="Subir">▲</button><button type="button" data-accion="bajar-orden" title="Bajar">▼</button></span></td>` : '';
  const bloqueada = tarea.tarea_estado === 'bloqueada';
  const completada = tarea.tarea_estado === 'completada';
  const dependeDe = tarea.tarea_dependiente ? estado.tareas.find((t) => t.tarea_id === tarea.tarea_dependiente) : null;
  const proxima = estado.tareas.find((t) => t.tarea_dependiente === tarea.tarea_id && t.tarea_estado !== 'completada');
  const checklist = tarea.tarea_checklist || [];
  const celdaAcciones = `
    <td class="td-acciones-tabla">
      <div class="acciones-fila">
        ${
          bloqueada
            ? '<span class="etiqueta-fecha etiqueta-bloqueada">Bloqueada</span>'
            : `<select data-accion="cambiar-estado" title="Cambiar el estado de la tarea">${ESTADOS_SELECCIONABLES.map((e) => `<option value="${e}" ${e === tarea.tarea_estado ? 'selected' : ''}>${ETIQUETAS_ESTADO_SELECCIONABLE[e]}</option>`).join('')}</select>`
        }
        ${completada ? '' : '<button type="button" data-accion="posponer" title="Posponer: elegir otra fecha para la tarea">⏭️</button>'}
        ${checklist.length > 0 ? `<button type="button" data-accion="ver-checklist" title="Ver y tildar los pasos del checklist">☑️ ${checklist.filter((i) => i.hecho).length}/${checklist.length}</button>` : ''}
        <details class="menu-fila">
          <summary title="Más acciones" aria-label="Más acciones">⋯</summary>
          <div class="menu-fila-opciones">
            <button type="button" data-accion="editar">✏️ Editar</button>
            <button type="button" data-accion="duplicar" title="Crear una tarea nueva con los mismos datos (sin enlaces), para editar y guardar aparte">📄 Duplicar</button>
            <button type="button" data-accion="crear-previa" title="Crear una tarea que bloquea a esta (mismos datos, nombre y descripción vacíos)">⬅️ Crearle tarea previa</button>
            <button type="button" data-accion="crear-posterior" title="Crear una tarea que depende de esta (mismos datos, nombre y descripción vacíos)">➡️ Crearle tarea posterior</button>
            ${dependeDe || proxima ? '<button type="button" data-accion="guardar-plantilla" title="Guardar toda la cadena de esta tarea como plantilla">📋 Guardar cadena como plantilla</button>' : ''}
            <button type="button" data-accion="eliminar">🗑️ Eliminar</button>
          </div>
        </details>
      </div>
    </td>`;
  fila.innerHTML = celdaSeleccion + celdaOrden + columnas.map((c) => `<td>${c.valor(tarea)}</td>`).join('') + celdaAcciones;
  const detalle = document.createElement('tr');
  detalle.className = 'fila-detalle-tabla';
  detalle.hidden = true;
  detalle.innerHTML = `<td colspan="${anchoTotal}"><div class="contenedor-panel-reprogramar" hidden></div><div class="contenedor-panel-mejora" hidden></div><div class="contenedor-checklist-tabla" hidden>${htmlChecklistTarjeta(tarea)}</div></td>`;
  const panelReprogramar = detalle.querySelector('.contenedor-panel-reprogramar');
  const panelMejora = detalle.querySelector('.contenedor-panel-mejora');
  const panelChecklist = detalle.querySelector('.contenedor-checklist-tabla');
  const actualizarDetalle = () => {
    detalle.hidden = panelReprogramar.hidden && panelMejora.hidden && panelChecklist.hidden;
  };
  if (checklist.length > 0 && checklistsAbiertos.has(tarea.tarea_id)) panelChecklist.hidden = false;
  actualizarDetalle();
  conectarChecklistTarjeta(detalle, tarea);
  const celdaAccionesEl = fila.querySelector('.td-acciones-tabla');
  // Nada de lo que hay en la celda de acciones abre la edición de la fila.
  celdaAccionesEl.addEventListener('click', (evento) => evento.stopPropagation());
  const menu = fila.querySelector('.menu-fila');
  menu.addEventListener('toggle', () => posicionarMenuFila(menu));
  const cerrarMenu = () => {
    menu.open = false;
  };

  fila.querySelector('[data-accion="cambiar-estado"]')?.addEventListener('change', async (evento) => {
    const nuevoEstado = evento.target.value;
    if (nuevoEstado === 'completada' && tarea.tarea_mantenimiento) {
      panelMejora.innerHTML = `
        <div class="panel-cierre">
          <label>¿Qué podrías mejorar la próxima vez? (opcional)
            <input type="text" data-campo="mejora" />
          </label>
          <button title="Confirmar que se cumplió y guardar la nota" type="button" data-accion="confirmar-mejora" class="boton-primario">✔️ Confirmar</button>
          <button title="No completarla" type="button" data-accion="cancelar-mejora">Cancelar</button>
        </div>`;
      panelMejora.hidden = false;
      actualizarDetalle();
      panelMejora.querySelector('[data-campo="mejora"]').focus();
      panelMejora.querySelector('[data-accion="cancelar-mejora"]').addEventListener('click', () => {
        panelMejora.hidden = true;
        panelMejora.innerHTML = '';
        evento.target.value = tarea.tarea_estado;
        actualizarDetalle();
      });
      panelMejora.querySelector('[data-accion="confirmar-mejora"]').addEventListener('click', async () => {
        const notaMejora = panelMejora.querySelector('[data-campo="mejora"]').value.trim();
        cumplirTarea(tarea, estado, { notaMejora });
        panelMejora.hidden = true;
        panelMejora.innerHTML = '';
        await persistirYNotificar();
        await preguntarTiempoReal(tarea);
        ofrecerExportarACalendar(tarea);
        ofrecerCrearTareaSeguimiento(tarea);
      });
      return;
    }
    if (nuevoEstado === 'completada') {
      cumplirTarea(tarea, estado);
      await persistirYNotificar();
      await preguntarTiempoReal(tarea);
      ofrecerExportarACalendar(tarea);
      ofrecerCrearTareaSeguimiento(tarea);
      return;
    }
    const { copiaConservada } = reabrirTarea(tarea, estado);
    await persistirYNotificar();
    if (copiaConservada) {
      await avisar(`Se reabrió «${tarea.tarea_nombre}». La copia que se había generado al completarla no se borró porque ya se modificó o hay tareas que dependen de ella: revisá que no quede duplicada.`);
    }
  });

  fila.querySelector('[data-accion="posponer"]')?.addEventListener('click', () => {
    const yaAbierto = !panelReprogramar.hidden;
    panelReprogramar.innerHTML = '';
    panelReprogramar.hidden = true;
    if (!yaAbierto) {
      panelReprogramar.appendChild(
        crearPanelReprogramar({
          diasHabiles: tarea.tarea_dias_habiles,
          onConfirmar: async (fechaSugeridaISO) => {
            const inconsistentes = reprogramarTareaConCascada(tarea, fechaSugeridaISO, estado.tareas);
            panelReprogramar.hidden = true;
            panelReprogramar.innerHTML = '';
            await persistirYNotificar();
            const aviso = avisoInconsistentes(inconsistentes);
            if (aviso) await avisar(aviso);
          },
          onCancelar: () => {
            panelReprogramar.hidden = true;
            panelReprogramar.innerHTML = '';
            actualizarDetalle();
          },
        })
      );
      panelReprogramar.hidden = false;
    }
    actualizarDetalle();
  });

  fila.querySelector('[data-accion="ver-checklist"]')?.addEventListener('click', () => {
    panelChecklist.hidden = !panelChecklist.hidden;
    if (panelChecklist.hidden) checklistsAbiertos.delete(tarea.tarea_id);
    else checklistsAbiertos.add(tarea.tarea_id);
    actualizarDetalle();
  });

  fila.querySelector('[data-accion="editar"]').addEventListener('click', () => {
    cerrarMenu();
    abrirEdicionTarea(tarea.tarea_id);
  });
  fila.querySelector('[data-accion="duplicar"]').addEventListener('click', () => {
    cerrarMenu();
    abrirAltaTarea(copiaDeTarea(tarea));
  });
  fila.querySelector('[data-accion="crear-previa"]').addEventListener('click', () => {
    cerrarMenu();
    abrirAltaTarea(copiaDeTarea(tarea, { vaciarNombre: true }), { proximaId: tarea.tarea_id });
  });
  fila.querySelector('[data-accion="crear-posterior"]').addEventListener('click', () => {
    cerrarMenu();
    abrirAltaTarea(copiaDeTarea(tarea, { vaciarNombre: true }), { previaId: tarea.tarea_id });
  });
  fila.querySelector('[data-accion="guardar-plantilla"]')?.addEventListener('click', () => {
    cerrarMenu();
    abrirGuardarCadenaComoPlantilla(tarea);
  });
  fila.querySelector('[data-accion="eliminar"]').addEventListener('click', async () => {
    cerrarMenu();
    if (!await confirmar(`¿Eliminar la tarea "${tarea.tarea_nombre}"?`, { peligro: true, textoAceptar: 'Eliminar' })) return;
    eliminarTarea(tarea, estado);
    await persistirYNotificar();
  });
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

  const fragmento = document.createDocumentFragment();
  fragmento.append(fila, detalle);
  return fragmento;
}

/**
 * Menú «⋯» de una fila: se posiciona con `fixed` para que el contenedor con scroll de la tabla no lo recorte.
 */
function posicionarMenuFila(menu) {
  const opciones = menu.querySelector('.menu-fila-opciones');
  if (!menu.open) {
    opciones.style.cssText = '';
    return;
  }
  // Un solo menú abierto a la vez.
  document.querySelectorAll('.menu-fila[open]').forEach((otro) => {
    if (otro !== menu) otro.open = false;
  });
  const rect = menu.querySelector('summary').getBoundingClientRect();
  opciones.style.position = 'fixed';
  opciones.style.visibility = 'hidden';
  const alto = opciones.offsetHeight; // fuerza el cálculo de tamaño antes de mostrarlo
  const ancho = opciones.offsetWidth;
  const arriba = rect.bottom + alto > window.innerHeight - 8 ? Math.max(8, rect.top - alto) : rect.bottom;
  opciones.style.top = `${arriba}px`;
  opciones.style.left = `${Math.max(8, Math.min(window.innerWidth - ancho - 8, rect.right - ancho))}px`;
  opciones.style.visibility = '';
}

// Clic afuera (o Esc) cierra el menú «⋯» abierto.
document.addEventListener('click', (evento) => {
  document.querySelectorAll('.menu-fila[open]').forEach((menu) => {
    if (!menu.contains(evento.target)) menu.open = false;
  });
});

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
