// Panel "Reestructurar prioridades con IA" (antes en la vista Tareas, desde la v0.102.0 en la Tabla): arma el prompt para
// copiar a un asistente externo, lee la respuesta pegada y deja elegir qué cambios de urgencia aplicar.

import { estado, persistirYNotificar } from './almacenamiento.js';
import { escaparHtml } from './utilidades.js';
import { esTareaAccionable, avisoInconsistentes } from './tareas-logica.js';
import { programarParaHoy } from './programador.js';
import { construirPromptPrioridades, parsearRespuestaPrioridades } from './ia-conectable.js';
import { avisar } from './avisos.js';

export function crearPanelIAPrioridades() {
  const panel = document.createElement('div');
  panel.className = 'panel-dependencias';

  const tareasAccionables = estado.tareas.filter((t) => esTareaAccionable(t));
  if (tareasAccionables.length === 0) {
    panel.innerHTML = '<p class="mensaje-vacio">No hay tareas accionables ahora mismo para reestructurar.</p>';
    return panel;
  }

  const prompt = construirPromptPrioridades(tareasAccionables, estado.categorias);

  panel.innerHTML = `
    <p class="panel-reprogramar-etiqueta">1. Copiá este prompt y pegalo en tu asistente de IA (ChatGPT, Claude, etc.):</p>
    <textarea class="textarea-ia" readonly rows="6">${escaparHtml(prompt)}</textarea>
    <button title="Copiar el texto para pegarlo en tu IA" type="button" data-accion="copiar-prompt">📋 Copiar prompt</button>
    <p class="panel-reprogramar-etiqueta">2. Pegá acá la respuesta (el JSON) que te devolvió:</p>
    <textarea class="textarea-ia" data-campo="respuesta" rows="6" placeholder='[{ "tarea_id": "...", "tarea_urgente": true }]'></textarea>
    <button title="Ver lo que respondió la IA antes de aplicarlo" type="button" data-accion="previsualizar" class="boton-primario">👁️ Previsualizar</button>
    <div class="contenedor-preview-ia"></div>
  `;

  panel.querySelector('[data-accion="copiar-prompt"]').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(prompt);
    } catch {
      await avisar('No se pudo copiar automáticamente. Seleccioná el texto del prompt manualmente.');
    }
  });

  const contenedorPreview = panel.querySelector('.contenedor-preview-ia');
  panel.querySelector('[data-accion="previsualizar"]').addEventListener('click', () => {
    const textoRespuesta = panel.querySelector('[data-campo="respuesta"]').value;
    let cambios;
    try {
      cambios = parsearRespuestaPrioridades(textoRespuesta, tareasAccionables);
    } catch (error) {
      contenedorPreview.innerHTML = `<p class="aviso-bloqueada">${escaparHtml(error.message)}</p>`;
      return;
    }

    contenedorPreview.innerHTML = `
      <p class="panel-reprogramar-etiqueta">3. Elegí qué cambios aplicar:</p>
      <ul class="checklist-dependencias">
        ${cambios
          .map(
            (c, i) => `
              <li>
                <label>
                  <input type="checkbox" data-indice="${i}" checked />
                  ${escaparHtml(c.tarea.tarea_nombre)}: ${c.tarea.tarea_urgente ? '🔴 Urgente' : 'No urgente'}
                  → ${c.urgenteSugerido ? '🔴 Urgente' : 'No urgente'}
                </label>
              </li>`
          )
          .join('')}
      </ul>
      <button title="Aplicar los cambios tildados" type="button" data-accion="aplicar-cambios" class="boton-primario">✔️ Aplicar cambios seleccionados</button>
    `;

    contenedorPreview.querySelector('[data-accion="aplicar-cambios"]').addEventListener('click', async () => {
      const seleccionados = [...contenedorPreview.querySelectorAll('input[type="checkbox"]:checked')].map(
        (cb) => cambios[Number(cb.dataset.indice)]
      );
      let inconsistentes = [];
      for (const c of seleccionados) {
        const eraUrgente = !!c.tarea.tarea_urgente;
        c.tarea.tarea_urgente = c.urgenteSugerido;
        // Pasó a urgente ahora: se le asigna hoy (mismo criterio que el formulario y la edición masiva).
        if (c.tarea.tarea_urgente && !eraUrgente) {
          const resultado = await programarParaHoy(c.tarea, estado);
          inconsistentes = inconsistentes.concat(resultado.inconsistentes);
        }
      }
      await persistirYNotificar();
      const aviso = avisoInconsistentes(inconsistentes);
      if (aviso) await avisar(aviso);
    });
  });

  return panel;
}
