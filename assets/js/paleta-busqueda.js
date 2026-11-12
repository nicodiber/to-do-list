// Paleta de búsqueda rápida (H02-B): Ctrl+K (o Cmd+K) o el botón «Buscar» del menú abren una ventana con un campo y,
// debajo, tareas (por nombre) y módulos. Flechas para moverse, Enter abre, Esc cierra. La lógica de búsqueda y orden
// está en buscador.js; acá solo la pantalla (patrón combobox/listbox accesible).
import { estado } from './almacenamiento.js';
import { escaparHtml } from './utilidades.js';
import { buscarTareas, buscarModulos, partirResaltado, fechaCorta } from './buscador.js';
import { abrirEdicionTarea, abrirAltaTarea } from './modal-tarea.js';

let contexto = null;
let dialogoAbierto = null;

function htmlResaltado(texto, consulta) {
  return partirResaltado(texto, consulta)
    .map((t) => (t.coincide ? `<mark>${escaparHtml(t.texto)}</mark>` : escaparHtml(t.texto)))
    .join('');
}

/** Arma las opciones visibles (en orden) para el texto escrito. Cada una lleva `html` y `abrir()`. */
function armarOpciones(texto) {
  const consulta = texto.trim();
  const puedeEditar = contexto.puedeUsarse();
  const opciones = [];
  let restantes = 0;
  if (consulta && contexto.hayDatos()) {
    const { resultados, restantes: resto } = buscarTareas(estado.tareas, consulta, estado.categorias);
    restantes = resto;
    resultados.forEach(({ tarea, categoria }) => {
      const completada = tarea.tarea_estado === 'completada';
      const fecha = fechaCorta(tarea.tarea_fecha_sugerida);
      const chip = categoria
        ? `<span class="buscador-chip" style="--color-chip:${escaparHtml(categoria.categoria_color || '#888888')}">${escaparHtml(categoria.categoria_nombre)}</span>`
        : '';
      const cola = completada ? '<span class="buscador-fecha">✅ Completada</span>' : fecha ? `<span class="buscador-fecha">${escaparHtml(fecha)}</span>` : '';
      opciones.push({
        grupo: 'Tareas',
        html: `<span class="buscador-nombre${completada ? ' completada' : ''}">${htmlResaltado(tarea.tarea_nombre, consulta)}</span>${chip}${cola}`,
        abrir: () => abrirEdicionTarea(tarea.tarea_id),
      });
    });
  }
  buscarModulos(contexto.modulos, consulta).forEach((m) => {
    opciones.push({
      grupo: 'Módulos',
      html: `<span class="buscador-emoji" aria-hidden="true">${escaparHtml(m.emoji)}</span><span class="buscador-nombre">${htmlResaltado(m.nombre, consulta)}</span>`,
      abrir: () => contexto.irAVista(m.clave),
    });
  });
  if (consulta && puedeEditar) {
    opciones.push({
      grupo: 'Acciones',
      html: `<span class="buscador-emoji" aria-hidden="true">➕</span><span class="buscador-nombre">Crear tarea «${escaparHtml(consulta)}»</span>`,
      abrir: () => abrirAltaTarea({ tarea_nombre: consulta }),
    });
  }
  return { opciones, restantes };
}

/** Abre la paleta (si ya está abierta, solo le devuelve el foco). Con otra ventana abierta no hace nada. */
export function abrirPaletaBusqueda() {
  if (!contexto) return;
  if (dialogoAbierto) {
    dialogoAbierto.querySelector('input').focus();
    return;
  }
  if (document.querySelector('dialog[open]')) return;
  const anterior = document.activeElement;
  const dialogo = document.createElement('dialog');
  dialogo.className = 'dialogo-tarea dialogo-buscador';
  dialogo.setAttribute('aria-label', 'Buscar');
  dialogo.innerHTML = `
    <input type="search" class="buscador-campo" placeholder="🔎 Buscar una tarea o un módulo…" autocomplete="off" spellcheck="false"
      role="combobox" aria-expanded="true" aria-controls="buscador-lista" aria-autocomplete="list" aria-label="Buscar una tarea o un módulo" />
    <div id="buscador-lista" class="buscador-lista" role="listbox" aria-label="Resultados"></div>
    <p class="buscador-ayuda" aria-hidden="true"><kbd>↑</kbd><kbd>↓</kbd> moverse · <kbd>Enter</kbd> abrir · <kbd>Esc</kbd> cerrar</p>
  `;
  document.body.appendChild(dialogo);
  dialogoAbierto = dialogo;
  const campo = dialogo.querySelector('input');
  const lista = dialogo.querySelector('#buscador-lista');
  let opciones = [];
  let activa = 0;

  const marcarActiva = (indice, desplazar = true) => {
    activa = indice;
    lista.querySelectorAll('[role="option"]').forEach((el, i) => {
      const es = i === indice;
      el.setAttribute('aria-selected', String(es));
      el.classList.toggle('activa', es);
      if (es) {
        campo.setAttribute('aria-activedescendant', el.id);
        if (desplazar) el.scrollIntoView({ block: 'nearest' });
      }
    });
    if (!opciones.length) campo.removeAttribute('aria-activedescendant');
  };

  const dibujar = () => {
    const armado = armarOpciones(campo.value);
    opciones = armado.opciones;
    let html = '';
    let grupoActual = '';
    opciones.forEach((o, i) => {
      if (o.grupo !== grupoActual) {
        grupoActual = o.grupo;
        html += `<div class="buscador-grupo" role="presentation">${escaparHtml(grupoActual)}</div>`;
      }
      html += `<div class="buscador-opcion" role="option" id="buscador-opcion-${i}" data-indice="${i}" aria-selected="false">${o.html}</div>`;
      // «y N más…» va al final del grupo de tareas.
      if (armado.restantes > 0 && o.grupo === 'Tareas' && opciones[i + 1] && opciones[i + 1].grupo !== 'Tareas') {
        html += `<div class="buscador-mas" role="presentation">y ${armado.restantes} más… (afiná la búsqueda)</div>`;
      }
    });
    if (!opciones.length) html = '<div class="buscador-vacio" role="presentation">Sin resultados</div>';
    lista.innerHTML = html;
    marcarActiva(0, false);
  };

  const cerrar = () => {
    if (dialogoAbierto !== dialogo) return;
    dialogoAbierto = null;
    if (dialogo.open) dialogo.close();
    dialogo.remove();
  };
  const elegir = (indice) => {
    const opcion = opciones[indice];
    if (!opcion) return;
    cerrar();
    opcion.abrir();
  };

  campo.addEventListener('input', dibujar);
  campo.addEventListener('keydown', (evento) => {
    if (evento.key === 'ArrowDown' || evento.key === 'ArrowUp') {
      evento.preventDefault();
      if (!opciones.length) return;
      const paso = evento.key === 'ArrowDown' ? 1 : -1;
      marcarActiva((activa + paso + opciones.length) % opciones.length);
    } else if (evento.key === 'Enter') {
      evento.preventDefault();
      evento.stopPropagation(); // que no lo tome el patrón de «Enter envía» de otros diálogos
      elegir(activa);
    }
  });
  lista.addEventListener('click', (evento) => {
    const el = evento.target.closest('[role="option"]');
    if (el) elegir(Number(el.dataset.indice));
  });
  lista.addEventListener('mousemove', (evento) => {
    const el = evento.target.closest('[role="option"]');
    if (el && Number(el.dataset.indice) !== activa) marcarActiva(Number(el.dataset.indice), false);
  });
  // Clic en el fondo oscuro (fuera del cuadro) cierra.
  dialogo.addEventListener('click', (evento) => {
    if (evento.target === dialogo) cerrar();
  });
  dialogo.addEventListener('close', () => {
    cerrar();
    // El foco vuelve adonde estaba, salvo que lo haya tomado otra ventana abierta por el resultado.
    if (!document.querySelector('dialog[open]') && anterior && typeof anterior.focus === 'function' && document.contains(anterior)) anterior.focus();
  });

  dibujar();
  dialogo.showModal();
  campo.focus();
}

/**
 * Conecta la paleta: `modulos` es `[{ clave, etiqueta }]`, `irAVista(clave)` navega, `puedeUsarse()` dice si se puede
 * editar/crear y `hayDatos()` si hay datos cargados (sin sesión solo se ofrecen módulos). También engancha el botón «Buscar».
 */
export function iniciarPaletaBusqueda({ modulos, irAVista, puedeUsarse, hayDatos }) {
  contexto = { modulos, irAVista, puedeUsarse, hayDatos };
  const boton = document.getElementById('boton-buscar');
  if (boton) boton.addEventListener('click', abrirPaletaBusqueda);
}
