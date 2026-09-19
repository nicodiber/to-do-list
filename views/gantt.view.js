import { estado, persistirYNotificar } from '../assets/js/almacenamiento.js';
import { escaparHtml, formatearFecha, fechaISOMasDias, diasEntreFechas } from '../assets/js/utilidades.js';
import { compararPorPrioridad } from '../assets/js/tareas-logica.js';
import { abrirEdicionTarea } from '../assets/js/modal-tarea.js';

let metaSeleccionada = '';

function fechaInicioTarea(tarea) {
  const fecha =
    tarea.tarea_fecha_inicio_habilitada || tarea.tarea_fecha_sugerida || tarea.tarea_fecha_limite || tarea.tarea_creada_en;
  return fecha.slice(0, 10);
}

function fechaFinTarea(tarea) {
  const inicio = fechaInicioTarea(tarea);
  const fin = tarea.tarea_fecha_limite || tarea.tarea_fecha_sugerida || inicio;
  const finDia = fin.slice(0, 10);
  return finDia < inicio ? inicio : finDia;
}

function tareasDeMeta(metaId) {
  return estado.tareas.filter((t) => t.meta_id === metaId);
}

function ordenarTareas(tareas) {
  return tareas.slice().sort(
    (a, b) =>
      fechaInicioTarea(a).localeCompare(fechaInicioTarea(b)) || compararPorPrioridad(a, b, estado.categorias)
  );
}

export function renderVistaGantt(contenedor) {
  contenedor.innerHTML = `
    <h2>Gantt</h2>
    <p class="ayuda">Qué tareas llevan a una meta y en qué orden/tiempo. Solo se muestran tareas asociadas a alguna meta (panel "Metas" en Tareas). Hacé clic en una barra para editarla.</p>
    <label>Meta
      <select id="filtro-meta-gantt">
        <option value="">Todas las metas</option>
        ${estado.metas.map((m) => `<option value="${m.meta_id}" ${metaSeleccionada === m.meta_id ? 'selected' : ''}>${escaparHtml(m.meta_nombre)}</option>`).join('')}
      </select>
    </label>
    <div id="contenido-gantt"></div>
  `;

  contenedor.querySelector('#filtro-meta-gantt').addEventListener('change', (evento) => {
    metaSeleccionada = evento.target.value;
    renderVistaGantt(contenedor);
  });

  const contenido = contenedor.querySelector('#contenido-gantt');

  if (estado.metas.length === 0) {
    contenido.innerHTML = '<p class="mensaje-vacio">Todavía no creaste ninguna meta. Andá a la vista "Metas" para crear una.</p>';
    return;
  }

  if (metaSeleccionada) {
    const tareas = ordenarTareas(tareasDeMeta(metaSeleccionada));
    if (tareas.length === 0) {
      contenido.innerHTML =
        '<p class="mensaje-vacio">Esta meta todavía no tiene tareas asociadas. Sumale tareas desde el panel "Metas" en la vista Tareas.</p>';
      return;
    }
    const filasMeta = tareas.map((tarea) => ({ tarea }));
    const grillaMeta = renderGrillaGantt(filasMeta);
    contenido.appendChild(grillaMeta);
    renderFlechasDependencia(grillaMeta, filasMeta);
    return;
  }

  const filas = [];
  estado.metas.forEach((meta) => {
    const tareas = ordenarTareas(tareasDeMeta(meta.meta_id));
    if (tareas.length === 0) return;
    filas.push({ separador: meta.meta_nombre });
    tareas.forEach((tarea) => filas.push({ tarea }));
  });

  if (filas.length === 0) {
    contenido.innerHTML =
      '<p class="mensaje-vacio">Ninguna meta tiene tareas asociadas todavía. Sumale tareas desde el panel "Metas" en la vista Tareas.</p>';
    return;
  }

  const grilla = renderGrillaGantt(filas);
  contenido.appendChild(grilla);
  renderFlechasDependencia(grilla, filas);
}

function renderGrillaGantt(filas) {
  const tareas = filas.filter((f) => f.tarea).map((f) => f.tarea);
  const inicios = tareas.map(fechaInicioTarea);
  const fines = tareas.map(fechaFinTarea);
  const minCrudo = inicios.slice().sort()[0];
  const maxCrudo = fines.slice().sort().reverse()[0];
  const minFecha = fechaISOMasDias(-1, minCrudo);
  const maxFecha = fechaISOMasDias(1, maxCrudo);
  const totalDias = diasEntreFechas(minFecha, maxFecha) + 1;

  const grilla = document.createElement('div');
  grilla.className = 'grilla-gantt-contenedor';

  const paso = totalDias <= 21 ? 1 : 7;
  let marcas = '';
  for (let i = 0; i <= totalDias; i += paso) {
    const fecha = fechaISOMasDias(i, minFecha);
    marcas += `<span class="marca-fecha-gantt" style="left:${(i / totalDias) * 100}%">${formatearFecha(fecha)}</span>`;
  }
  const encabezado = `
    <div class="encabezado-gantt">
      <div class="fila-gantt-info"></div>
      <div class="fila-gantt-pista">${marcas}</div>
    </div>
  `;

  const filasHtml = filas
    .map((fila) => {
      if (fila.separador) {
        return `<div class="separador-meta-gantt">${escaparHtml(fila.separador)}</div>`;
      }
      return renderFilaGanttHtml(fila.tarea, minFecha, totalDias);
    })
    .join('');

  grilla.innerHTML = `<div class="grilla-gantt">${encabezado}<div class="filas-gantt">${filasHtml}</div></div>`;

  filas
    .filter((f) => f.tarea)
    .forEach((f) => {
      const bloque = grilla.querySelector(`[data-tarea-id="${f.tarea.tarea_id}"]`);
      if (!bloque) return;
      bloque.addEventListener('click', () => {
        abrirEdicionTarea(f.tarea.tarea_id);
      });

      const inicio = fechaInicioTarea(f.tarea);
      const fin = fechaFinTarea(f.tarea);
      const offsetDias = diasEntreFechas(minFecha, inicio);
      const spanDias = diasEntreFechas(inicio, fin) + 1;
      agregarAsasGantt(bloque, f.tarea, minFecha, totalDias, offsetDias, spanDias, bloque.parentElement);
    });

  return grilla;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function renderFlechasDependencia(grilla, filas) {
  const tareasVisibles = filas.filter((f) => f.tarea).map((f) => f.tarea);
  const idsVisibles = new Set(tareasVisibles.map((t) => t.tarea_id));

  const conexiones = [];
  tareasVisibles.forEach((tarea) => {
    if (!tarea.tarea_dependiente || !idsVisibles.has(tarea.tarea_dependiente)) return;
    conexiones.push({ desde: tarea.tarea_dependiente, hasta: tarea.tarea_id });
  });

  if (conexiones.length === 0) return;

  const contenedorFilas = grilla.querySelector('.filas-gantt');
  const rectFilas = contenedorFilas.getBoundingClientRect();

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.classList.add('flechas-gantt');
  svg.setAttribute('width', rectFilas.width);
  svg.setAttribute('height', rectFilas.height);
  svg.innerHTML = `
    <defs>
      <marker id="flecha-gantt-punta" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
        <path class="flecha-gantt-punta" d="M0,0 L6,3 L0,6 Z" />
      </marker>
    </defs>
  `;

  conexiones.forEach(({ desde, hasta }) => {
    const origenEl = contenedorFilas.querySelector(`[data-tarea-id="${desde}"]`);
    const destinoEl = contenedorFilas.querySelector(`[data-tarea-id="${hasta}"]`);
    if (!origenEl || !destinoEl) return;

    const r1 = origenEl.getBoundingClientRect();
    const r2 = destinoEl.getBoundingClientRect();
    const x1 = r1.right - rectFilas.left;
    const y1 = r1.top + r1.height / 2 - rectFilas.top;
    const x2 = r2.left - rectFilas.left;
    const y2 = r2.top + r2.height / 2 - rectFilas.top;
    const curva = Math.max(20, Math.abs(x2 - x1) / 2);

    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', `M${x1},${y1} C${x1 + curva},${y1} ${x2 - curva},${y2} ${x2},${y2}`);
    path.setAttribute('class', 'flecha-gantt');
    path.setAttribute('marker-end', 'url(#flecha-gantt-punta)');
    svg.appendChild(path);
  });

  contenedorFilas.appendChild(svg);
}

function agregarAsaGantt(barraEl, posicion) {
  const asa = document.createElement('div');
  asa.className = `asa-gantt ${posicion}`;
  asa.addEventListener('click', (evento) => evento.stopPropagation());
  barraEl.appendChild(asa);
  return asa;
}

function agregarAsasGantt(barraEl, tarea, minFecha, totalDias, offsetDiasInicial, spanDiasInicial, pistaEl) {
  const asaIzquierda = agregarAsaGantt(barraEl, 'izquierda');
  const asaDerecha = agregarAsaGantt(barraEl, 'derecha');

  function iniciarArrastre(asa, esIzquierda) {
    asa.addEventListener('pointerdown', (evento) => {
      evento.stopPropagation();
      evento.preventDefault();
      asa.setPointerCapture(evento.pointerId);

      const xInicial = evento.clientX;
      const anchoPistaPx = pistaEl.getBoundingClientRect().width;
      const anchoDiaPx = anchoPistaPx / totalDias;
      const offsetInicial = offsetDiasInicial;
      const spanInicial = spanDiasInicial;
      const finFijo = offsetInicial + spanInicial;

      function onMove(eventoMove) {
        const deltaPx = eventoMove.clientX - xInicial;
        const deltaDias = Math.round(deltaPx / anchoDiaPx);

        let nuevoOffset = offsetInicial;
        let nuevoSpan = spanInicial;

        if (esIzquierda) {
          nuevoOffset = Math.max(0, Math.min(offsetInicial + deltaDias, finFijo - 1));
          nuevoSpan = finFijo - nuevoOffset;
        } else {
          nuevoSpan = Math.max(1, Math.min(spanInicial + deltaDias, totalDias - offsetInicial));
        }

        barraEl.style.left = `${(nuevoOffset / totalDias) * 100}%`;
        barraEl.style.width = `${(nuevoSpan / totalDias) * 100}%`;
        barraEl.dataset.offsetPendiente = String(nuevoOffset);
        barraEl.dataset.spanPendiente = String(nuevoSpan);
      }

      async function onUp(eventoUp) {
        asa.releasePointerCapture(eventoUp.pointerId);
        asa.removeEventListener('pointermove', onMove);
        asa.removeEventListener('pointerup', onUp);

        const nuevoOffset = barraEl.dataset.offsetPendiente != null ? Number(barraEl.dataset.offsetPendiente) : offsetInicial;
        const nuevoSpan = barraEl.dataset.spanPendiente != null ? Number(barraEl.dataset.spanPendiente) : spanInicial;
        delete barraEl.dataset.offsetPendiente;
        delete barraEl.dataset.spanPendiente;

        if (esIzquierda) {
          tarea.tarea_fecha_inicio_habilitada = fechaISOMasDias(nuevoOffset, minFecha);
        } else {
          tarea.tarea_fecha_limite = fechaISOMasDias(nuevoOffset + nuevoSpan - 1, minFecha);
        }
        await persistirYNotificar();
      }

      asa.addEventListener('pointermove', onMove);
      asa.addEventListener('pointerup', onUp);
    });
  }

  iniciarArrastre(asaIzquierda, true);
  iniciarArrastre(asaDerecha, false);
}

function renderFilaGanttHtml(tarea, minFecha, totalDias) {
  const categoria = estado.categorias.find((c) => c.categoria_id === tarea.categoria_id);
  const color = categoria?.categoria_color ?? '#9ca3af';

  const inicio = fechaInicioTarea(tarea);
  const fin = fechaFinTarea(tarea);
  const offsetDias = diasEntreFechas(minFecha, inicio);
  const spanDias = diasEntreFechas(inicio, fin) + 1;

  const dependeDe = tarea.tarea_dependiente ? estado.tareas.find((t) => t.tarea_id === tarea.tarea_dependiente) : null;

  return `
    <div class="fila-gantt">
      <div class="fila-gantt-info">
        <strong>${escaparHtml(tarea.tarea_nombre)}</strong>
        ${tarea.tarea_estado === 'bloqueada' && dependeDe ? `<p class="aviso-bloqueada">Bloqueada por: ${escaparHtml(dependeDe.tarea_nombre)}</p>` : ''}
      </div>
      <div class="fila-gantt-pista">
        <div class="barra-gantt" data-tarea-id="${tarea.tarea_id}"
          style="left:${(offsetDias / totalDias) * 100}%; width:${(spanDias / totalDias) * 100}%; background:${color};"
          title="${escaparHtml(tarea.tarea_nombre)} (${formatearFecha(inicio)} - ${formatearFecha(fin)})">
          <span class="barra-gantt-nombre">${escaparHtml(tarea.tarea_nombre)}</span>
        </div>
      </div>
    </div>
  `;
}
