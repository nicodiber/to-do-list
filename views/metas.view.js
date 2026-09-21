import { estado, persistirYNotificar } from '../assets/js/almacenamiento.js';
import { crearMeta, crearTarea, ETIQUETAS_PLAZO, ETIQUETAS_ESTADO } from '../assets/js/modelos.js';
import { escaparHtml, formatearFecha, hoyISO, fechaISOMasDias } from '../assets/js/utilidades.js';
import { abrirDialogoMeta } from '../assets/js/formularios-entidades.js';
import {
  construirPromptSubtareas,
  parsearRespuestaSubtareas,
  construirPromptChatMeta,
  parsearRespuestaChatMeta,
  construirPromptFinalizarMeta,
  parsearRespuestaFinalizarMeta,
} from '../assets/js/ia-conectable.js';

export function renderVistaMetas(contenedor) {
  contenedor.innerHTML = `
    <h2>🏁 Metas</h2>
    <p class="ayuda">Tus objetivos de corto/mediano/largo plazo. Asociá tareas a una meta desde el campo "Meta" del formulario de la tarea.</p>
    <div class="barra-acciones-vista"><button type="button" id="boton-nueva-meta" class="boton-primario">＋ Nueva meta</button></div>
    <button type="button" id="boton-chat-meta">🤖 Definir meta charlando con IA</button>
    <div id="contenedor-panel-chat-meta" hidden></div>
    <div id="lista-metas" class="lista-categorias"></div>
  `;

  contenedor.querySelector('#boton-nueva-meta').addEventListener('click', () => abrirDialogoMeta());

  const contenedorPanelChat = contenedor.querySelector('#contenedor-panel-chat-meta');
  contenedor.querySelector('#boton-chat-meta').addEventListener('click', () => {
    const yaAbierto = !contenedorPanelChat.hidden;
    contenedorPanelChat.innerHTML = '';
    contenedorPanelChat.hidden = true;
    if (yaAbierto) return;

    contenedorPanelChat.appendChild(crearPanelChatMeta(contenedorPanelChat));
    contenedorPanelChat.hidden = false;
  });

  const listaMetas = contenedor.querySelector('#lista-metas');
  if (estado.metas.length === 0) {
    listaMetas.innerHTML = '<p class="mensaje-vacio">Todavía no creaste ninguna meta.</p>';
    return;
  }

  estado.metas.forEach((meta) => listaMetas.appendChild(renderMeta(meta)));
}

function renderMeta(meta) {
  const tareasAsociadas = estado.tareas.filter((t) => t.meta_id === meta.meta_id);
  const completadas = tareasAsociadas.filter((t) => t.tarea_estado === 'completada');
  const porcentaje = tareasAsociadas.length === 0 ? 0 : Math.round((completadas.length / tareasAsociadas.length) * 100);

  const tarjeta = document.createElement('article');
  tarjeta.className = 'tarjeta-categoria';
  tarjeta.innerHTML = `
    <div class="encabezado-categoria">
      <strong>${escaparHtml(meta.meta_nombre)}</strong>
      <span class="acciones-prioridad">
        <button type="button" data-accion="sugerir-ia">🤖 Sugerir tareas con IA</button>
        <button type="button" data-accion="editar-meta" title="Editar meta">✏️ Editar</button>
        <button type="button" data-accion="eliminar-meta" title="Eliminar meta">🗑️</button>
      </span>
    </div>
    <span class="etiquetas">
      <span class="etiqueta-fecha">${ETIQUETAS_PLAZO[meta.meta_plazo]}</span>
      ${meta.meta_fecha_estimada ? `<span class="etiqueta-fecha">Objetivo: ${formatearFecha(meta.meta_fecha_estimada)}</span>` : ''}
    </span>
    ${meta.meta_descripcion ? `<p class="notas-tarea">${escaparHtml(meta.meta_descripcion)}</p>` : ''}
    <div class="barra-progreso"><div class="barra-progreso-relleno" style="width: ${porcentaje}%"></div></div>
    <p class="notas-tarea">${completadas.length}/${tareasAsociadas.length} tareas completadas</p>
    <ul class="lista-subcategorias">
      ${tareasAsociadas
        .map(
          (t) =>
            `<li>${escaparHtml(t.tarea_nombre)} <span class="etiqueta-fecha">${ETIQUETAS_ESTADO[t.tarea_estado]}</span></li>`
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

  tarjeta.querySelector('[data-accion="editar-meta"]').addEventListener('click', () => abrirDialogoMeta({ id: meta.meta_id }));

  tarjeta.querySelector('[data-accion="eliminar-meta"]').addEventListener('click', async () => {
    if (!confirm(`¿Eliminar la meta "${meta.meta_nombre}"? Las tareas asociadas quedan sin esta meta.`)) return;
    estado.tareas.forEach((tarea) => {
      if (tarea.meta_id === meta.meta_id) tarea.meta_id = null;
    });
    estado.metas = estado.metas.filter((m) => m.meta_id !== meta.meta_id);
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
    <button type="button" data-accion="copiar-prompt">📋 Copiar prompt</button>
    <p class="panel-reprogramar-etiqueta">2. Pegá acá la respuesta (el JSON) que te devolvió:</p>
    <textarea class="textarea-ia" data-campo="respuesta" rows="6" placeholder='[{ "tarea_nombre": "...", "tarea_duracion_min": 30, "dias_desde_hoy": 0 }]'></textarea>
    <button type="button" data-accion="previsualizar" class="boton-primario">👁️ Previsualizar</button>
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
                  ${escaparHtml(p.tarea_nombre)} — ${p.tarea_duracion_min} min, sugerida en ${p.dias_desde_hoy} día(s)
                  ${p.tarea_descripcion ? `<br /><span class="notas-tarea">${escaparHtml(p.tarea_descripcion)}</span>` : ''}
                </label>
              </li>`
          )
          .join('')}
      </ul>
      <button type="button" data-accion="agregar-seleccionadas" class="boton-primario">➕ Agregar seleccionadas</button>
    `;

    contenedorPreview.querySelector('[data-accion="agregar-seleccionadas"]').addEventListener('click', async () => {
      const seleccionadas = [...contenedorPreview.querySelectorAll('input[type="checkbox"]:checked')].map(
        (cb) => propuestas[Number(cb.dataset.indice)]
      );
      seleccionadas.forEach((p) => {
        estado.tareas.push(
          crearTarea({
            tarea_nombre: p.tarea_nombre,
            tarea_duracion_min: p.tarea_duracion_min,
            tarea_fecha_sugerida: fechaISOMasDias(p.dias_desde_hoy, hoyISO()),
            tarea_descripcion: p.tarea_descripcion,
            meta_id: meta.meta_id,
          })
        );
      });
      await persistirYNotificar();
    });
  });

  return panel;
}

function crearPanelChatMeta(contenedorPanel) {
  const panel = document.createElement('div');
  panel.className = 'panel-dependencias';

  const historial = [];
  let mostrarFinal = false;

  function renderTranscripcion() {
    if (historial.length === 0) return '<p class="mensaje-vacio">Todavía no escribiste nada.</p>';
    return `
      <div class="chat-historial">
        ${historial
          .map(
            (turno) =>
              `<div class="chat-mensaje ${turno.rol === 'usuario' ? 'chat-mensaje-usuario' : 'chat-mensaje-asistente'}">${escaparHtml(turno.texto)}</div>`
          )
          .join('')}
      </div>
    `;
  }

  function render() {
    const prompt = construirPromptChatMeta(historial);
    const promptFinal = mostrarFinal ? construirPromptFinalizarMeta(historial) : '';

    panel.innerHTML = `
      <p class="panel-reprogramar-etiqueta">Conversación:</p>
      ${renderTranscripcion()}
      <textarea class="textarea-ia" data-campo="mensaje" rows="3" placeholder="Contale a la IA qué querés lograr..."></textarea>
      <button type="button" data-accion="agregar-mensaje" class="boton-primario">➕ Agregar mensaje y armar prompt</button>
      <p class="panel-reprogramar-etiqueta">1. Copiá este prompt y pegalo en tu asistente de IA (ChatGPT, Claude, etc.):</p>
      <textarea class="textarea-ia" readonly rows="6">${escaparHtml(prompt)}</textarea>
      <button type="button" data-accion="copiar-prompt">📋 Copiar prompt</button>
      <p class="panel-reprogramar-etiqueta">2. Pegá acá la respuesta que te devolvió:</p>
      <textarea class="textarea-ia" data-campo="respuesta" rows="6" placeholder="Pegá acá lo que te respondió la IA..."></textarea>
      <button type="button" data-accion="agregar-respuesta">💬 Agregar respuesta a la conversación</button>
      <div class="aviso-chat-meta"></div>
      <button type="button" data-accion="finalizar" ${historial.length === 0 ? 'disabled' : ''}>🏁 Finalizar: generar meta con estos datos</button>
      ${
        mostrarFinal
          ? `
        <hr />
        <p class="panel-reprogramar-etiqueta">Paso final. Copiá este prompt y pegalo en tu asistente de IA:</p>
        <textarea class="textarea-ia" readonly rows="6">${escaparHtml(promptFinal)}</textarea>
        <button type="button" data-accion="copiar-prompt-final">📋 Copiar prompt</button>
        <p class="panel-reprogramar-etiqueta">Pegá acá la respuesta (el JSON) que te devolvió:</p>
        <textarea class="textarea-ia" data-campo="respuesta-final" rows="6" placeholder='{ "meta_nombre": "...", "meta_plazo": "corto", "meta_fecha_estimada": "", "meta_descripcion": "..." }'></textarea>
        <button type="button" data-accion="previsualizar-meta" class="boton-primario">👁️ Previsualizar meta</button>
        <div class="contenedor-preview-meta"></div>
      `
          : ''
      }
    `;

    const aviso = panel.querySelector('.aviso-chat-meta');

    panel.querySelector('[data-accion="agregar-mensaje"]').addEventListener('click', () => {
      const texto = panel.querySelector('[data-campo="mensaje"]').value.trim();
      if (!texto) return;
      historial.push({ rol: 'usuario', texto });
      render();
    });

    panel.querySelector('[data-accion="copiar-prompt"]').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(prompt);
      } catch {
        alert('No se pudo copiar automáticamente. Seleccioná el texto del prompt manualmente.');
      }
    });

    panel.querySelector('[data-accion="agregar-respuesta"]').addEventListener('click', () => {
      const textoRespuesta = panel.querySelector('[data-campo="respuesta"]').value;
      let texto;
      try {
        texto = parsearRespuestaChatMeta(textoRespuesta);
      } catch (error) {
        aviso.innerHTML = `<p class="aviso-bloqueada">${escaparHtml(error.message)}</p>`;
        return;
      }
      historial.push({ rol: 'asistente', texto });
      render();
    });

    panel.querySelector('[data-accion="finalizar"]').addEventListener('click', () => {
      mostrarFinal = true;
      render();
    });

    if (mostrarFinal) {
      panel.querySelector('[data-accion="copiar-prompt-final"]').addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(promptFinal);
        } catch {
          alert('No se pudo copiar automáticamente. Seleccioná el texto del prompt manualmente.');
        }
      });

      const contenedorPreviewMeta = panel.querySelector('.contenedor-preview-meta');
      panel.querySelector('[data-accion="previsualizar-meta"]').addEventListener('click', () => {
        const textoRespuestaFinal = panel.querySelector('[data-campo="respuesta-final"]').value;
        let datosMeta;
        try {
          datosMeta = parsearRespuestaFinalizarMeta(textoRespuestaFinal);
        } catch (error) {
          contenedorPreviewMeta.innerHTML = `<p class="aviso-bloqueada">${escaparHtml(error.message)}</p>`;
          return;
        }

        contenedorPreviewMeta.innerHTML = `
          <p class="panel-reprogramar-etiqueta">Meta propuesta:</p>
          <p><strong>${escaparHtml(datosMeta.meta_nombre)}</strong></p>
          <p class="notas-tarea">${ETIQUETAS_PLAZO[datosMeta.meta_plazo]}${datosMeta.meta_fecha_estimada ? ` — Objetivo: ${formatearFecha(datosMeta.meta_fecha_estimada)}` : ''}</p>
          ${datosMeta.meta_descripcion ? `<p class="notas-tarea">${escaparHtml(datosMeta.meta_descripcion)}</p>` : ''}
          <button type="button" data-accion="crear-meta" class="boton-primario">🏁 Crear meta</button>
        `;

        contenedorPreviewMeta.querySelector('[data-accion="crear-meta"]').addEventListener('click', async () => {
          estado.metas.push(crearMeta(datosMeta));
          await persistirYNotificar();
          contenedorPanel.hidden = true;
          contenedorPanel.innerHTML = '';
        });
      });
    }
  }

  render();
  return panel;
}
