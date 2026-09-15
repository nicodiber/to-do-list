import { estado, persistirYNotificar } from '../assets/js/almacenamiento.js';
import { escaparHtml, formatearFecha, fechaISOMasDias, diasEntreFechas } from '../assets/js/utilidades.js';
import { tareaEstaBloqueada, compararPorPrioridad } from '../assets/js/tareas-logica.js';
import { abrirEdicionAlEntrar } from './tareas.view.js';

let metaSeleccionada = '';

function fechaInicioTarea(tarea) {
  return tarea.fecha_inicio_posible || tarea.fecha_sugerida || tarea.fecha_limite || tarea.creada_en.slice(0, 10);
}

function fechaFinTarea(tarea) {
  const inicio = fechaInicioTarea(tarea);
  const fin = tarea.fecha_limite || (tarea.fecha_hora_agendada ? tarea.fecha_hora_agendada.slice(0, 10) : '') || tarea.fecha_sugerida || inicio;
  return fin < inicio ? inicio : fin;
}

function tareasConMeta() {
  return estado.tareas.filter((t) => (t.metas_ids || []).length > 0);
}

function tareasDeMeta(metaId) {
  return estado.tareas.filter((t) => (t.metas_ids || []).includes(metaId));
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
        ${estado.metas.map((m) => `<option value="${m.id}" ${metaSeleccionada === m.id ? 'selected' : ''}>${escaparHtml(m.nombre)}</option>`).join('')}
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
    contenido.appendChild(renderGrillaGantt(tareas.map((tarea) => ({ tarea }))));
    return;
  }

  const filas = [];
  estado.metas.forEach((meta) => {
    const tareas = ordenarTareas(tareasDeMeta(meta.id));
    if (tareas.length === 0) return;
    filas.push({ separador: meta.nombre });
    tareas.forEach((tarea) => filas.push({ tarea }));
  });

  if (filas.length === 0) {
    contenido.innerHTML =
      '<p class="mensaje-vacio">Ninguna meta tiene tareas asociadas todavía. Sumale tareas desde el panel "Metas" en la vista Tareas.</p>';
    return;
  }

  contenido.appendChild(renderGrillaGantt(filas));
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
      const bloque = grilla.querySelector(`[data-tarea-id="${f.tarea.id}"]`);
      if (!bloque) return;
      bloque.addEventListener('click', () => {
        abrirEdicionAlEntrar(f.tarea.id);
        location.hash = '#/tareas';
      });

      const inicio = fechaInicioTarea(f.tarea);
      const fin = fechaFinTarea(f.tarea);
      const offsetDias = diasEntreFechas(minFecha, inicio);
      const spanDias = diasEntreFechas(inicio, fin) + 1;
      agregarAsasGantt(bloque, f.tarea, minFecha, totalDias, offsetDias, spanDias, bloque.parentElement);
    });

  return grilla;
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
          tarea.fecha_inicio_posible = fechaISOMasDias(nuevoOffset, minFecha);
        } else {
          tarea.fecha_limite = fechaISOMasDias(nuevoOffset + nuevoSpan - 1, minFecha);
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
  const categoria = estado.categorias.find((c) => c.id === tarea.categoria_id);
  const subcategoria = estado.subcategorias.find((s) => s.id === tarea.subcategoria_id);
  const color = subcategoria?.color ?? categoria?.color ?? '#9ca3af';

  const inicio = fechaInicioTarea(tarea);
  const fin = fechaFinTarea(tarea);
  const offsetDias = diasEntreFechas(minFecha, inicio);
  const spanDias = diasEntreFechas(inicio, fin) + 1;

  const { bloqueada, bloqueantes } = tareaEstaBloqueada(tarea, estado.tareas);

  return `
    <div class="fila-gantt">
      <div class="fila-gantt-info">
        <strong>${escaparHtml(tarea.nombre)}</strong>
        ${bloqueada ? `<p class="aviso-bloqueada">Bloqueada por: ${bloqueantes.map((b) => escaparHtml(b.nombre)).join(', ')}</p>` : ''}
      </div>
      <div class="fila-gantt-pista">
        <div class="barra-gantt" data-tarea-id="${tarea.id}"
          style="left:${(offsetDias / totalDias) * 100}%; width:${(spanDias / totalDias) * 100}%; background:${color};"
          title="${escaparHtml(tarea.nombre)} (${formatearFecha(inicio)} - ${formatearFecha(fin)})">
          <span class="barra-gantt-nombre">${escaparHtml(tarea.nombre)}</span>
        </div>
      </div>
    </div>
  `;
}
