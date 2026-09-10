import { estado, persistirYNotificar } from './almacenamiento.js';
import { formatearFecha, escaparHtml } from './utilidades.js';
import { crearPanelReprogramar } from './reprogramar.js';
import { completarTarea, reprogramarTareaConCascada } from './tareas-logica.js';

// El <dialog> vive en document.body (no en el contenedor de la vista) para
// sobrevivir a los re-renders que dispara persistirYNotificar() en cada paso.
let dialogo = null;
let cola = [];
let indice = 0;

function asegurarDialogo() {
  if (dialogo) return dialogo;
  dialogo = document.createElement('dialog');
  dialogo.className = 'dialogo-revision';
  document.body.appendChild(dialogo);
  dialogo.addEventListener('close', () => {
    cola = [];
    indice = 0;
  });
  return dialogo;
}

export function iniciarRevisionDia(tareas) {
  cola = tareas.filter((t) => t.estado !== 'completada');
  indice = 0;
  const dlg = asegurarDialogo();
  renderPaso();
  if (!dlg.open) dlg.showModal();
}

function avanzar() {
  indice += 1;
  renderPaso();
}

function renderPaso() {
  const dlg = asegurarDialogo();

  if (indice >= cola.length) {
    dlg.innerHTML = `
      <p>${cola.length === 0 ? 'No tenés tareas para repasar hoy.' : '¡Repasaste todas tus tareas de hoy! 🎉'}</p>
      <button type="button" data-accion="cerrar" class="boton-primario">Cerrar</button>
    `;
    dlg.querySelector('[data-accion="cerrar"]').addEventListener('click', () => dlg.close());
    return;
  }

  const tarea = cola[indice];
  const categoria = estado.categorias.find((c) => c.id === tarea.categoria_id);

  dlg.innerHTML = `
    <p class="progreso-revision">Tarea ${indice + 1} de ${cola.length}</p>
    <h3>${escaparHtml(tarea.nombre)}</h3>
    <span class="etiquetas">
      ${categoria ? `<span class="etiqueta" style="background:${categoria.color}">${escaparHtml(categoria.nombre)}</span>` : ''}
      ${tarea.fecha_limite ? `<span class="etiqueta-fecha">Límite: ${formatearFecha(tarea.fecha_limite)}</span>` : ''}
    </span>
    <div class="acciones-revision">
      <button type="button" data-accion="cumplida" class="boton-primario">Cumplida ✓</button>
      <button type="button" data-accion="no-cumplida">No cumplida ✗</button>
      <button type="button" data-accion="saltar">Saltar</button>
    </div>
    <div class="contenedor-paso-revision"></div>
    <button type="button" data-accion="cerrar-repaso" class="boton-cerrar-repaso">Cerrar repaso</button>
  `;

  dlg.querySelector('[data-accion="saltar"]').addEventListener('click', avanzar);
  dlg.querySelector('[data-accion="cerrar-repaso"]').addEventListener('click', () => dlg.close());

  const contenedorPaso = dlg.querySelector('.contenedor-paso-revision');

  dlg.querySelector('[data-accion="cumplida"]').addEventListener('click', () => {
    contenedorPaso.innerHTML = `
      <label>Duración real (min)
        <input type="number" min="0" step="5" value="${tarea.duracion_estimada_min || 30}" data-campo="duracion-real" />
      </label>
      ${
        tarea.mantenimiento
          ? `<label>¿Qué podrías mejorar la próxima vez? (opcional)
              <input type="text" data-campo="mejora" />
            </label>`
          : ''
      }
      <button type="button" data-accion="confirmar-cumplida" class="boton-primario">Confirmar</button>
    `;
    contenedorPaso.querySelector('[data-accion="confirmar-cumplida"]').addEventListener('click', async () => {
      const duracionReal = Number(contenedorPaso.querySelector('[data-campo="duracion-real"]').value) || 0;
      const campoMejora = contenedorPaso.querySelector('[data-campo="mejora"]');
      const notaMejora = campoMejora ? campoMejora.value.trim() : '';
      completarTarea(tarea, estado.tareas, { duracionReal, notaMejora });
      await persistirYNotificar();
      avanzar();
    });
  });

  dlg.querySelector('[data-accion="no-cumplida"]').addEventListener('click', () => {
    contenedorPaso.innerHTML = `
      <label>¿Por qué no se cumplió?
        <input type="text" placeholder="Motivo (opcional)" data-campo="motivo" />
      </label>
      <button type="button" data-accion="continuar-reprogramar" class="boton-primario">Reprogramar</button>
    `;
    contenedorPaso.querySelector('[data-accion="continuar-reprogramar"]').addEventListener('click', () => {
      const motivo = contenedorPaso.querySelector('[data-campo="motivo"]').value.trim();
      contenedorPaso.innerHTML = '';

      const panel = crearPanelReprogramar({
        onConfirmar: async (fechaHoraISO) => {
          tarea.motivo_incumplimiento = motivo;
          reprogramarTareaConCascada(tarea, fechaHoraISO, estado.tareas);
          if (tarea.estado === 'a_confirmar' || tarea.estado === 'en_progreso') tarea.estado = 'pendiente';
          await persistirYNotificar();
          avanzar();
        },
        onCancelar: () => {
          contenedorPaso.innerHTML = '';
        },
      });
      contenedorPaso.appendChild(panel);
    });
  });
}
