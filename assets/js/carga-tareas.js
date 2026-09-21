// "Completar carga de tareas": lista, en una ventana modal, las tareas que
// quedaron con solo el nombre (cargadas rápido) para completarles los datos.

import { estado, persistirYNotificar } from './almacenamiento.js';
import { tareasSoloConNombre } from './tareas-logica.js';
import { htmlFormularioTarea, conectarFormularioTarea, leerFormularioTarea, aplicarCamposATarea, validarFormularioTarea, ofrecerMarcarCadenaMantenimiento } from './formulario-tarea.js';
import { aplicarEnlace } from './dependencias.js';
import { capturarBorradores, restaurarBorradores } from './borradores.js';

let dialogo = null;

function asegurarDialogo() {
  if (dialogo) return dialogo;
  dialogo = document.createElement('dialog');
  dialogo.className = 'dialogo-tarea dialogo-carga';
  document.body.appendChild(dialogo);
  dialogo.addEventListener('close', () => {
    dialogo.innerHTML = '';
  });
  dialogo.addEventListener('click', (evento) => {
    if (evento.target.closest('[data-accion="cerrar-carga"]')) dialogo.close();
  });
  return dialogo;
}

/** Vuelve a dibujar la lista conservando lo que ya se escribió en las tarjetas que siguen ahí. */
function renderLista() {
  const captura = dialogo.open ? capturarBorradores(dialogo) : null;
  const tareas = tareasSoloConNombre(estado.tareas);

  if (tareas.length === 0) {
    dialogo.innerHTML = `
      <h3>📝 Completar carga de tareas</h3>
      <p class="mensaje-vacio">No quedan tareas con solo el nombre. ¡Todo cargado!</p>
      <div class="acciones-modal"><button type="button" data-accion="cerrar-carga" class="boton-primario">✖️ Cerrar</button></div>
    `;
    return;
  }

  dialogo.innerHTML = `
    <h3>📝 Completar carga de tareas (${tareas.length})</h3>
    <p class="ayuda">Tareas que tienen solo el nombre. Cargales lo que quieras y tocá <strong>Actualizar</strong>; si querés que queden así, <strong>Dejar así</strong> las saca de esta lista.</p>
    ${tareas
      .map(
        (t) => `
      <form class="formulario-tarea tarjeta-carga" id="carga-${t.tarea_id}" data-id="${t.tarea_id}">
        ${htmlFormularioTarea(t, {
          modo: 'carga',
          botonesPie: `<div class="acciones-modal">
            <button type="submit" class="boton-primario">💾 Actualizar</button>
            <button type="button" data-accion="dejar-asi" title="No volver a mostrar esta tarea en esta lista">👌 Dejar así</button>
          </div>`,
        })}
      </form>`
      )
      .join('')}
    <div class="acciones-modal"><button type="button" data-accion="cerrar-carga">✖️ Cerrar</button></div>
  `;

  dialogo.querySelectorAll('form.tarjeta-carga').forEach((formulario) => {
    conectarFormularioTarea(formulario, { modo: 'carga' });
    formulario.addEventListener('submit', (evento) => actualizar(evento, formulario.dataset.id));
    formulario.querySelector('[data-accion="dejar-asi"]').addEventListener('click', () => dejarAsi(formulario.dataset.id));
  });
  restaurarBorradores(dialogo, captura);
}

async function actualizar(evento, id) {
  evento.preventDefault();
  const leido = leerFormularioTarea(evento.currentTarget);
  if (!leido.campos.tarea_nombre) {
    alert('La tarea necesita un nombre.');
    return;
  }
  const tarea = estado.tareas.find((t) => t.tarea_id === id);
  if (!tarea) {
    alert('Esta tarea ya no existe (se eliminó mientras la completabas).');
    renderLista();
    return;
  }
  const validacion = validarFormularioTarea(leido, tarea.tarea_id);
  if (!validacion.ok) {
    alert(validacion.motivo);
    return;
  }
  aplicarCamposATarea(tarea, leido.campos);
  aplicarEnlace(tarea.tarea_id, { previaId: leido.previaId, proximaId: leido.proximaId }, estado.tareas);
  ofrecerMarcarCadenaMantenimiento(tarea, estado.tareas);
  await persistirYNotificar();
  renderLista();
}

async function dejarAsi(id) {
  const tarea = estado.tareas.find((t) => t.tarea_id === id);
  if (tarea) {
    tarea.tarea_carga_completa = true;
    await persistirYNotificar();
  }
  renderLista();
}

/** Abre la ventana con las tareas que quedaron con solo el nombre. */
export function abrirCargaTareas() {
  asegurarDialogo();
  renderLista();
  if (!dialogo.open) dialogo.showModal();
}
