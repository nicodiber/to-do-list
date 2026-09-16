import { estado, persistirYNotificar } from '../assets/js/almacenamiento.js';
import { crearMeta, crearTarea, PLAZOS_META, ETIQUETAS_PLAZO, ETIQUETAS_ESTADO } from '../assets/js/modelos.js';
import { escaparHtml, formatearFecha, hoyISO, fechaISOMasDias } from '../assets/js/utilidades.js';
import { construirPromptSubtareas, parsearRespuestaSubtareas } from '../assets/js/ia-conectable.js';

export function renderVistaMetas(contenedor) {
  contenedor.innerHTML = `
    <h2>Metas</h2>
    <p class="ayuda">Tus objetivos de corto/mediano/largo plazo. Asociá tareas a una meta desde el botón "Metas" en la vista Tareas.</p>
    <form id="form-nueva-meta" class="formulario-tarea">
      <input type="text" name="nombre" placeholder="Nueva meta" required />
      <select name="plazo">
        ${PLAZOS_META.map((p) => `<option value="${p}">${ETIQUETAS_PLAZO[p]}</option>`).join('')}
      </select>
      <label>Fecha objetivo <input type="date" name="fecha_objetivo" /></label>
      <input type="text" name="descripcion" placeholder="Descripción (opcional)" />
      <button type="submit">Agregar meta</button>
    </form>
    <div id="lista-metas" class="lista-categorias"></div>
  `;

  contenedor.querySelector('#form-nueva-meta').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const formulario = evento.target;
    const nombre = formulario.nombre.value.trim();
    if (!nombre) return;
    estado.metas.push(
      crearMeta({
        nombre,
        plazo: formulario.plazo.value,
        fecha_objetivo: formulario.fecha_objetivo.value,
        descripcion: formulario.descripcion.value.trim(),
      })
    );
    await persistirYNotificar();
  });

  const listaMetas = contenedor.querySelector('#lista-metas');
  if (estado.metas.length === 0) {
    listaMetas.innerHTML = '<p class="mensaje-vacio">Todavía no creaste ninguna meta.</p>';
    return;
  }

  estado.metas.forEach((meta) => listaMetas.appendChild(renderMeta(meta)));
}

function renderMeta(meta) {
  const tareasAsociadas = estado.tareas.filter((t) => (t.metas_ids || []).includes(meta.id));
  const completadas = tareasAsociadas.filter((t) => t.estado === 'completada');
  const porcentaje = tareasAsociadas.length === 0 ? 0 : Math.round((completadas.length / tareasAsociadas.length) * 100);

  const tarjeta = document.createElement('article');
  tarjeta.className = 'tarjeta-categoria';
  tarjeta.innerHTML = `
    <div class="encabezado-categoria">
      <strong>${escaparHtml(meta.nombre)}</strong>
      <span class="acciones-prioridad">
        <button type="button" data-accion="sugerir-ia">Sugerir tareas con IA</button>
        <button type="button" data-accion="eliminar-meta" title="Eliminar meta">✕</button>
      </span>
    </div>
    <span class="etiquetas">
      <span class="etiqueta-fecha">${ETIQUETAS_PLAZO[meta.plazo]}</span>
      ${meta.fecha_objetivo ? `<span class="etiqueta-fecha">Objetivo: ${formatearFecha(meta.fecha_objetivo)}</span>` : ''}
    </span>
    ${meta.descripcion ? `<p class="notas-tarea">${escaparHtml(meta.descripcion)}</p>` : ''}
    <div class="barra-progreso"><div class="barra-progreso-relleno" style="width: ${porcentaje}%"></div></div>
    <p class="notas-tarea">${completadas.length}/${tareasAsociadas.length} tareas completadas</p>
    <ul class="lista-subcategorias">
      ${tareasAsociadas
        .map(
          (t) =>
            `<li>${escaparHtml(t.nombre)} <span class="etiqueta-fecha">${ETIQUETAS_ESTADO[t.estado]}</span></li>`
        )
        .join('')}
    </ul>
    <div class="contenedor-panel-ia" hidden></div>
  `;

  const contenedorIA = tarjeta.querySelector('.contenedor-panel-ia');
  tarjeta.querySelector('[data-accion="sugerir-ia"]').addEventListener('click', () => {
    const yaAbierto = !contenedorIA.hidden;
    contenedorIA.innerHTML = '';
    contenedorIA.hidden = true;
    if (yaAbierto) return;

    contenedorIA.appendChild(crearPanelIA(meta));
    contenedorIA.hidden = false;
  });

  tarjeta.querySelector('[data-accion="eliminar-meta"]').addEventListener('click', async () => {
    if (!confirm(`¿Eliminar la meta "${meta.nombre}"? Las tareas asociadas quedan sin esta meta.`)) return;
    estado.tareas.forEach((tarea) => {
      tarea.metas_ids = (tarea.metas_ids || []).filter((id) => id !== meta.id);
    });
    estado.metas = estado.metas.filter((m) => m.id !== meta.id);
    await persistirYNotificar();
  });

  return tarjeta;
}

function crearPanelIA(meta) {
  const panel = document.createElement('div');
  panel.className = 'panel-dependencias';
  const prompt = construirPromptSubtareas(meta);

  panel.innerHTML = `
    <p class="panel-reprogramar-etiqueta">1. Copiá este prompt y pegalo en tu asistente de IA (ChatGPT, Claude, etc.):</p>
    <textarea class="textarea-ia" readonly rows="6">${escaparHtml(prompt)}</textarea>
    <button type="button" data-accion="copiar-prompt">Copiar prompt</button>
    <p class="panel-reprogramar-etiqueta">2. Pegá acá la respuesta (el JSON) que te devolvió:</p>
    <textarea class="textarea-ia" data-campo="respuesta" rows="6" placeholder='[{ "nombre": "...", "duracion_estimada_min": 30, "dias_desde_hoy": 0 }]'></textarea>
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
    let propuestas;
    try {
      propuestas = parsearRespuestaSubtareas(textoRespuesta);
    } catch (error) {
      contenedorPreview.innerHTML = `<p class="aviso-bloqueada">${escaparHtml(error.message)}</p>`;
      return;
    }

    contenedorPreview.innerHTML = `
      <p class="panel-reprogramar-etiqueta">3. Elegí cuáles agregar:</p>
      <ul class="checklist-dependencias">
        ${propuestas
          .map(
            (p, i) => `
              <li>
                <label>
                  <input type="checkbox" data-indice="${i}" checked />
                  ${escaparHtml(p.nombre)} — ${p.duracion_estimada_min} min, sugerida en ${p.dias_desde_hoy} día(s)
                  ${p.notas ? `<br /><span class="notas-tarea">${escaparHtml(p.notas)}</span>` : ''}
                </label>
              </li>`
          )
          .join('')}
      </ul>
      <button type="button" data-accion="agregar-seleccionadas" class="boton-primario">Agregar seleccionadas</button>
    `;

    contenedorPreview.querySelector('[data-accion="agregar-seleccionadas"]').addEventListener('click', async () => {
      const seleccionadas = [...contenedorPreview.querySelectorAll('input[type="checkbox"]:checked')].map(
        (cb) => propuestas[Number(cb.dataset.indice)]
      );
      seleccionadas.forEach((p) => {
        estado.tareas.push(
          crearTarea({
            nombre: p.nombre,
            duracion_estimada_min: p.duracion_estimada_min,
            fecha_sugerida: fechaISOMasDias(p.dias_desde_hoy, hoyISO()),
            notas: p.notas,
            metas_ids: [meta.id],
          })
        );
      });
      await persistirYNotificar();
    });
  });

  return panel;
}
