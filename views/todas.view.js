import { estado, persistirYNotificar } from '../assets/js/almacenamiento.js';
import { ETIQUETAS_ESTADO, ETIQUETAS_IMPORTANCIA, ICONOS_IMPORTANCIA, NIVELES_IMPORTANCIA, ORDEN_IMPORTANCIA, ESTADOS_TAREA } from '../assets/js/modelos.js';
import { arbolCategorias, caminoCategoria, formatearFechaOFechaHora, textoHolgura, escaparHtml } from '../assets/js/utilidades.js';
import { fechaDeReferencia } from '../assets/js/vista-agenda.js';
import { compararPorPrioridad, calcularHolguraDias, tareasEmpatadas, esTareaAccionable } from '../assets/js/tareas-logica.js';
import { abrirEdicionAlEntrar } from './tareas.view.js';

let filtroCategoria = '';
let filtroEstado = '';
let filtroImportancia = '';
let textoBusqueda = '';
let columnaOrden = null; // null = orden de prioridad real de la app; o 'nombre'|'categoria'|'importancia'|'estado'|'fecha'|'holgura'
let direccionOrden = 'asc';
let paresOmitidos = new Set(); // claves "idA|idB" (ordenados) omitidas en esta sesión de Versus, para no re-ofrecer el mismo par
let panelVersusAbierto = false;

const COLUMNAS = [
  { clave: 'nombre', etiqueta: 'Nombre' },
  { clave: 'categoria', etiqueta: 'Categoría' },
  { clave: 'importancia', etiqueta: 'Importancia' },
  { clave: 'estado', etiqueta: 'Estado' },
  { clave: 'fecha', etiqueta: 'Fecha' },
  { clave: 'holgura', etiqueta: 'Holgura' },
];

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

const COMPARADORES = {
  nombre: (a, b) => a.tarea_nombre.localeCompare(b.tarea_nombre),
  categoria: (a, b) => caminoCategoria(categoriaDe(a), estado.categorias).localeCompare(caminoCategoria(categoriaDe(b), estado.categorias)),
  importancia: (a, b) => (ORDEN_IMPORTANCIA[a.tarea_importancia] ?? 2) - (ORDEN_IMPORTANCIA[b.tarea_importancia] ?? 2),
  estado: (a, b) => ESTADOS_TAREA.indexOf(a.tarea_estado) - ESTADOS_TAREA.indexOf(b.tarea_estado),
  fecha: (a, b) => (fechaDeReferencia(a) || '9999-99-99').localeCompare(fechaDeReferencia(b) || '9999-99-99'),
  holgura: compararHolguraAsc,
};

/**
 * Vista de referencia y auditoría: todas las tareas (de cualquier estado),
 * con filtros y orden por columna. Por defecto ordena por el criterio real
 * de prioridad de la app (`compararPorPrioridad`), para poder detectar de
 * un vistazo si algo quedó mal priorizado. Hacé clic en una fila para
 * editarla.
 */
export function renderVistaTodas(contenedor) {
  const filas = estado.tareas
    .filter((t) => !filtroCategoria || idsCategoriaYDescendientes(filtroCategoria, estado.categorias).has(t.categoria_id))
    .filter((t) => !filtroEstado || t.tarea_estado === filtroEstado)
    .filter((t) => !filtroImportancia || t.tarea_importancia === filtroImportancia)
    .filter((t) => !textoBusqueda || t.tarea_nombre.toLowerCase().includes(textoBusqueda.toLowerCase()))
    .slice();

  if (columnaOrden === null) {
    filas.sort((a, b) => compararPorPrioridad(a, b, estado.categorias));
  } else {
    const direccion = direccionOrden === 'asc' ? 1 : -1;
    filas.sort((a, b) => direccion * COMPARADORES[columnaOrden](a, b));
  }

  contenedor.innerHTML = `
    <h2>Todas</h2>
    <p class="ayuda">Todas tus tareas, en el orden real de prioridad de la app. Filtrá, buscá u ordená por columna para auditar o encontrar algo puntual. Hacé clic en una fila para editarla.</p>
    <div class="filtros">
      <label>Categoría
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
      <label>Estado
        <select id="filtro-estado-todas">
          <option value="">Todos</option>
          <option value="bloqueada" ${filtroEstado === 'bloqueada' ? 'selected' : ''}>Bloqueada</option>
          <option value="pendiente" ${filtroEstado === 'pendiente' ? 'selected' : ''}>Pendiente</option>
          <option value="completada" ${filtroEstado === 'completada' ? 'selected' : ''}>Completada</option>
        </select>
      </label>
      <label>Importancia
        <select id="filtro-importancia-todas">
          <option value="">Todas</option>
          ${NIVELES_IMPORTANCIA.map(
            (nivel) => `<option value="${nivel}" ${filtroImportancia === nivel ? 'selected' : ''}>${ICONOS_IMPORTANCIA[nivel]} ${ETIQUETAS_IMPORTANCIA[nivel]}</option>`
          ).join('')}
        </select>
      </label>
      <label>Buscar
        <input type="search" id="buscador-nombre-todas" placeholder="Nombre de la tarea..." value="${escaparHtml(textoBusqueda)}" />
      </label>
      <button type="button" id="boton-reset-orden-todas">↺ Prioridad</button>
      <button type="button" id="boton-versus-todas">⚔️ Versus</button>
    </div>
    <div id="contenedor-panel-versus" hidden></div>
    <div class="tabla-tareas-contenedor">
      <table class="tabla-informe">
        <thead>
          <tr>
            ${COLUMNAS.map(({ clave, etiqueta }) => {
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
    renderVistaTodas(contenedor);
  });
  contenedor.querySelector('#filtro-estado-todas').addEventListener('change', (evento) => {
    filtroEstado = evento.target.value;
    renderVistaTodas(contenedor);
  });
  contenedor.querySelector('#filtro-importancia-todas').addEventListener('change', (evento) => {
    filtroImportancia = evento.target.value;
    renderVistaTodas(contenedor);
  });
  contenedor.querySelector('#buscador-nombre-todas').addEventListener('input', (evento) => {
    textoBusqueda = evento.target.value;
    renderVistaTodas(contenedor);
  });
  contenedor.querySelector('#boton-reset-orden-todas').addEventListener('click', () => {
    columnaOrden = null;
    renderVistaTodas(contenedor);
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
      renderVistaTodas(contenedor);
    });
  });

  const cuerpo = contenedor.querySelector('#cuerpo-tabla-todas');
  if (filas.length === 0) {
    cuerpo.innerHTML = '<tr><td colspan="6" class="mensaje-vacio">No hay tareas que coincidan con el filtro.</td></tr>';
    return;
  }

  filas.forEach((tarea) => cuerpo.appendChild(renderFila(tarea)));
}

function renderFila(tarea) {
  const categoria = categoriaDe(tarea);
  const fechaRef = fechaDeReferencia(tarea);
  const fechaCompleta = tarea.tarea_fecha_sugerida || tarea.tarea_fecha_limite || null;
  const holgura = calcularHolguraDias(tarea);

  const fila = document.createElement('tr');
  fila.className = 'fila-tabla-tarea';
  fila.innerHTML = `
    <td>${escaparHtml(tarea.tarea_nombre)}</td>
    <td>${categoria ? escaparHtml(caminoCategoria(categoria, estado.categorias)) : ''}</td>
    <td>${tarea.tarea_importancia ? `${ICONOS_IMPORTANCIA[tarea.tarea_importancia]} ${ETIQUETAS_IMPORTANCIA[tarea.tarea_importancia]}` : ''}</td>
    <td>${ETIQUETAS_ESTADO[tarea.tarea_estado]}</td>
    <td>${fechaRef && fechaCompleta ? formatearFechaOFechaHora(fechaCompleta) : 'Sin fecha'}</td>
    <td>${holgura === Infinity ? '—' : textoHolgura(holgura)}</td>
  `;
  fila.addEventListener('click', () => {
    abrirEdicionAlEntrar(tarea.tarea_id);
    location.hash = '#/tareas';
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
        <button type="button" data-accion="elegir-a" class="boton-primario">Elegir esta ▸</button>
      </div>
      <div class="versus-tarjeta">
        ${infoBreveTarea(b)}
        <button type="button" data-accion="elegir-b" class="boton-primario">Elegir esta ▸</button>
      </div>
    </div>
    <div class="versus-acciones">
      <button type="button" data-accion="omitir">Da igual / Omitir</button>
    </div>
  `;

  async function elegir(preferida, otra) {
    const siguienteValor = 1 + Math.max(-1, ...estado.tareas.map((t) => t.tarea_prioridad_manual).filter((v) => v != null));
    preferida.tarea_prioridad_manual = siguienteValor;
    otra.tarea_prioridad_manual = siguienteValor + 1;
    await persistirYNotificar();
    renderVistaTodas(contenedorVista);
  }

  panel.querySelector('[data-accion="elegir-a"]').addEventListener('click', () => elegir(a, b));
  panel.querySelector('[data-accion="elegir-b"]').addEventListener('click', () => elegir(b, a));
  panel.querySelector('[data-accion="omitir"]').addEventListener('click', () => {
    paresOmitidos.add(claveDePar(a, b));
    renderVistaTodas(contenedorVista);
  });

  return panel;
}
