// Ventana modal para editar una tarea, con el mismo formulario que el alta.
// El <dialog> vive en document.body (no en la vista) para sobrevivir a los
// redibujados que dispara persistirYNotificar() y abrirse encima de cualquier vista.

import { estado, persistirYNotificar } from './almacenamiento.js';
import {
  htmlFormularioTarea,
  conectarFormularioTarea,
  leerFormularioTarea,
  aplicarCamposATarea,
  validarFormularioTarea,
  firmaFormulario,
} from './formulario-tarea.js';
import { aplicarEnlace } from './dependencias.js';

let dialogo = null;
// Qué se está editando: la tarea, su sello de modificación al abrir (para detectar cambios
// ajenos mientras estaba abierta) y cómo estaba el formulario (para detectar cambios propios).
let edicion = null;

function fueraDelDialogo(evento) {
  const r = dialogo.getBoundingClientRect();
  return evento.clientX < r.left || evento.clientX > r.right || evento.clientY < r.top || evento.clientY > r.bottom;
}

function asegurarDialogo() {
  if (dialogo) return dialogo;
  dialogo = document.createElement('dialog');
  dialogo.className = 'dialogo-tarea';
  document.body.appendChild(dialogo);

  // Esc y clic afuera pasan por la confirmación de descarte si hay cambios sin guardar.
  dialogo.addEventListener('cancel', (evento) => {
    evento.preventDefault();
    intentarCerrar();
  });
  let empezoAfuera = false;
  dialogo.addEventListener('mousedown', (evento) => {
    empezoAfuera = fueraDelDialogo(evento);
  });
  dialogo.addEventListener('click', (evento) => {
    if (empezoAfuera && fueraDelDialogo(evento)) intentarCerrar();
    empezoAfuera = false;
  });
  dialogo.addEventListener('close', () => {
    edicion = null;
    dialogo.innerHTML = '';
  });
  return dialogo;
}

function hayCambiosSinGuardar() {
  const formulario = dialogo && dialogo.querySelector('form');
  return !!(formulario && edicion && firmaFormulario(formulario) !== edicion.firma);
}

function intentarCerrar() {
  if (hayCambiosSinGuardar() && !confirm('Hay cambios sin guardar. ¿Descartarlos?')) return;
  dialogo.close();
}

async function guardar(evento) {
  evento.preventDefault();
  const formulario = evento.currentTarget;
  const leido = leerFormularioTarea(formulario);
  if (!leido.campos.tarea_nombre) {
    alert('La tarea necesita un nombre.');
    return;
  }

  // Se busca por id al guardar: si llegaron cambios de otro dispositivo, el objeto pudo haberse reemplazado.
  const tarea = estado.tareas.find((t) => t.tarea_id === edicion.tareaId);
  if (!tarea) {
    alert('Esta tarea ya no existe (se eliminó mientras la editabas).');
    dialogo.close();
    return;
  }
  if ((tarea.tarea_modificado_en || '') !== edicion.sello) {
    const seguir = confirm('Esta tarea cambió (por ejemplo desde otro dispositivo) mientras la editabas. Si guardás ahora se pisan esos cambios. ¿Guardar igual?');
    if (!seguir) return;
  }

  const validacion = validarFormularioTarea(leido, tarea.tarea_id);
  if (!validacion.ok) {
    alert(validacion.motivo);
    return;
  }

  aplicarCamposATarea(tarea, leido.campos);
  aplicarEnlace(tarea.tarea_id, { previaId: leido.previaId, proximaId: leido.proximaId }, estado.tareas);
  edicion = null; // ya se guardó: cerrar no debe preguntar por cambios
  dialogo.close();
  await persistirYNotificar();
}

/** Abre la ventana de edición de la tarea `id` encima de la vista actual. */
export function abrirEdicionTarea(id) {
  const tarea = estado.tareas.find((t) => t.tarea_id === id);
  if (!tarea) return;
  const dlg = asegurarDialogo();
  if (dlg.open) return;

  dlg.innerHTML = `
    <h3>Editar tarea</h3>
    <form class="formulario-tarea formulario-modal">
      ${htmlFormularioTarea(tarea, {
        modo: 'edicion',
        botonesPie: `<div class="acciones-modal">
          <button type="submit" class="boton-primario">Guardar cambios</button>
          <button type="button" data-accion="cancelar-edicion">Cancelar</button>
        </div>`,
      })}
    </form>
  `;
  const formulario = dlg.querySelector('form');
  conectarFormularioTarea(formulario, { modo: 'edicion' });
  formulario.addEventListener('submit', guardar);
  formulario.querySelector('[data-accion="cancelar-edicion"]').addEventListener('click', intentarCerrar);

  dlg.showModal();
  edicion = { tareaId: id, sello: tarea.tarea_modificado_en || '', firma: firmaFormulario(formulario) };
  formulario.tarea_nombre.focus();
}
