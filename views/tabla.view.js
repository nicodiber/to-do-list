import { estado, persistirYNotificar } from '../assets/js/almacenamiento.js';
import { ETIQUETAS_ESTADO, ETIQUETAS_IMPORTANCIA, ICONOS_IMPORTANCIA, NIVELES_IMPORTANCIA, ORDEN_IMPORTANCIA, ESTADOS_TAREA, ETIQUETAS_UNIDAD_MANTENIMIENTO } from '../assets/js/modelos.js';
import { arbolCategorias, caminoCategoria, formatearFechaOFechaHora, textoHolgura, escaparHtml } from '../assets/js/utilidades.js';
import { fechaDeReferencia } from '../assets/js/vista-agenda.js';
import { compararPorPrioridad, calcularHolguraDias, tareasEmpatadas, esTareaAccionable, ordenarConCadenas } from '../assets/js/tareas-logica.js';
import { abrirEdicionTarea } from '../assets/js/modal-tarea.js';
import { DIAS_SEMANA } from '../assets/js/reprogramar.js';
import { abrirDialogoFormulario } from '../assets/js/dialogo-formulario.js';

let filtroCategoria = '';
let filtroEstado = '';
let filtroImportancia = '';
let filtroPersona = '';
let textoBusqueda = '';
let columnaOrden = null; // null = orden de prioridad real de la app; o 'nombre'|'categoria'|'importancia'|'estado'|'fecha'|'holgura'
let direccionOrden = 'asc';
let paresOmitidos = new Set(); // claves "idA|idB" (ordenados) omitidas en esta sesión de Versus, para no re-ofrecer el mismo par
let panelVersusAbierto = false;

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
    valor: (t) => (t.tarea_importancia ? `${ICONOS_IMPORTANCIA[t.tarea_importancia]} ${ETIQUETAS_IMPORTANCIA[t.tarea_importancia]}` : ''),
    comparar: (a, b) => (ORDEN_IMPORTANCIA[a.tarea_importancia] ?? 2) - (ORDEN_IMPORTANCIA[b.tarea_importancia] ?? 2),
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
    etiqueta: 'Mantenimiento',
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

// La elección de columnas es una preferencia de UI (no un dato de la app).
const CLAVE_COLUMNAS = 'super-todo-list:tabla-columnas';

/** Columnas visibles según la preferencia guardada (o las de por defecto). */
function columnasVisibles() {
  try {
    const guardadas = JSON.parse(localStorage.getItem(CLAVE_COLUMNAS));
    if (Array.isArray(guardadas)) {
      const validas = COLUMNAS.filter((c) => guardadas.includes(c.clave));
      if (validas.length > 0) return validas;
    }
  } catch {
    // Sin preferencia guardada o ilegible: se usan las de por defecto.
  }
  return COLUMNAS.filter((c) => c.defecto);
}

function guardarColumnasVisibles(claves) {
  try {
    localStorage.setItem(CLAVE_COLUMNAS, JSON.stringify(claves));
  } catch {
    // Es solo una preferencia.
  }
}

/** Diálogo con una casilla por columna para elegir cuáles se ven. */
function abrirSelectorColumnas(alCambiar) {
  const visibles = new Set(columnasVisibles().map((c) => c.clave));
  abrirDialogoFormulario({
    titulo: 'Columnas de la tabla',
    textoGuardar: 'Guardar',
    cuerpoHtml: `
      <p class="ayuda ayuda-formulario">Elegí qué columnas mostrar. Se recuerda tu elección en este dispositivo.</p>
      <fieldset class="dias-habiles selector-columnas">
        ${COLUMNAS.map((c) => `<label class="dia-habil"><input type="checkbox" name="columna" value="${c.clave}" ${visibles.has(c.clave) ? 'checked' : ''} /> ${c.etiqueta}</label>`).join('')}
      </fieldset>
    `,
    alGuardar: (formulario) => {
      const elegidas = [...formulario.querySelectorAll('input[name="columna"]:checked')].map((i) => i.value);
      if (elegidas.length === 0) {
        alert('Elegí al menos una columna.');
        return false;
      }
      guardarColumnasVisibles(elegidas);
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
  let filas = estado.tareas
    .filter((t) => !filtroCategoria || idsCategoriaYDescendientes(filtroCategoria, estado.categorias).has(t.categoria_id))
    .filter((t) => !filtroEstado || t.tarea_estado === filtroEstado)
    .filter((t) => !filtroImportancia || t.tarea_importancia === filtroImportancia)
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
          <option value="bloqueada" ${filtroEstado === 'bloqueada' ? 'selected' : ''}>Bloqueada</option>
          <option value="pendiente" ${filtroEstado === 'pendiente' ? 'selected' : ''}>Pendiente</option>
          <option value="completada" ${filtroEstado === 'completada' ? 'selected' : ''}>Completada</option>
        </select>
      </label>
      <label title="Mostrar solo las tareas con esta importancia">❗ Importancia
        <select id="filtro-importancia-todas">
          <option value="">Todas</option>
          ${NIVELES_IMPORTANCIA.map(
            (nivel) => `<option value="${nivel}" ${filtroImportancia === nivel ? 'selected' : ''}>${ICONOS_IMPORTANCIA[nivel]} ${ETIQUETAS_IMPORTANCIA[nivel]}</option>`
          ).join('')}
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
    </div>
    <div id="contenedor-panel-versus" hidden></div>
    <div class="tabla-tareas-contenedor">
      <table class="tabla-informe">
        <thead>
          <tr>
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
    renderVistaTabla(contenedor);
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

  const cuerpo = contenedor.querySelector('#cuerpo-tabla-todas');
  if (filas.length === 0) {
    cuerpo.innerHTML = '<tr><td colspan="${columnas.length}" class="mensaje-vacio">No hay tareas que coincidan con el filtro.</td></tr>';
    return;
  }

  filas.forEach((tarea) => cuerpo.appendChild(renderFila(tarea, columnas)));
}

function renderFila(tarea, columnas) {
  const fila = document.createElement('tr');
  fila.className = 'fila-tabla-tarea';
  fila.innerHTML = columnas.map((c) => `<td>${c.valor(tarea)}</td>`).join('');
  fila.addEventListener('click', () => {
    abrirEdicionTarea(tarea.tarea_id);
  });
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
      ${tarea.tarea_importancia ? `<span class="etiqueta-fecha">${ICONOS_IMPORTANCIA[tarea.tarea_importancia]} ${ETIQUETAS_IMPORTANCIA[tarea.tarea_importancia]}</span>` : ''}
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
    const siguienteValor = 1 + Math.max(-1, ...estado.tareas.map((t) => t.tarea_prioridad_manual).filter((v) => v != null));
    preferida.tarea_prioridad_manual = siguienteValor;
    otra.tarea_prioridad_manual = siguienteValor + 1;
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
