// Ventana modal para editar una tarea, con el mismo formulario que el alta.
// Usa el diálogo genérico (`dialogo-formulario.js`), que vive en document.body
// para sobrevivir a los redibujados que dispara persistirYNotificar() y abrirse
// encima de cualquier vista.

import { estado, persistirYNotificar } from './almacenamiento.js';
import {
  htmlFormularioTarea,
  conectarFormularioTarea,
  leerFormularioTarea,
  aplicarCamposATarea,
  validarFormularioTarea,
  ofrecerMarcarCadenaMantenimiento,
} from './formulario-tarea.js';
import { abrirDialogoFormulario } from './dialogo-formulario.js';
import { aplicarEnlace } from './dependencias.js';

let edicionAbierta = false;

/** Abre la ventana de edición de la tarea `id` encima de la vista actual. */
export function abrirEdicionTarea(id) {
  const tarea = estado.tareas.find((t) => t.tarea_id === id);
  if (!tarea || edicionAbierta) return;
  edicionAbierta = true;
  // Sello de la tarea al abrir: si cambia mientras se edita (otro dispositivo), se avisa antes de pisarla.
  const sello = tarea.tarea_modificado_en || '';

  abrirDialogoFormulario({
    titulo: 'Editar tarea',
    cuerpoHtml: htmlFormularioTarea(tarea, { modo: 'edicion' }),
    textoGuardar: 'Guardar cambios',
    conectar: (formulario) => conectarFormularioTarea(formulario, { modo: 'edicion' }),
    alCerrar: () => {
      edicionAbierta = false;
    },
    alGuardar: async (formulario) => {
      const leido = leerFormularioTarea(formulario);
      if (!leido.campos.tarea_nombre) {
        alert('La tarea necesita un nombre.');
        return false;
      }

      // Se busca por id al guardar: si llegaron cambios de otro dispositivo, el objeto pudo haberse reemplazado.
      const actual = estado.tareas.find((t) => t.tarea_id === id);
      if (!actual) {
        alert('Esta tarea ya no existe (se eliminó mientras la editabas).');
        return true;
      }
      if ((actual.tarea_modificado_en || '') !== sello) {
        const seguir = confirm('Esta tarea cambió (por ejemplo desde otro dispositivo) mientras la editabas. Si guardás ahora se pisan esos cambios. ¿Guardar igual?');
        if (!seguir) return false;
      }

      const validacion = validarFormularioTarea(leido, actual.tarea_id);
      if (!validacion.ok) {
        alert(validacion.motivo);
        return false;
      }

      aplicarCamposATarea(actual, leido.campos);
      aplicarEnlace(actual.tarea_id, { previaId: leido.previaId, proximaId: leido.proximaId }, estado.tareas);
      ofrecerMarcarCadenaMantenimiento(actual, estado.tareas);
      await persistirYNotificar();
      return true;
    },
  });
}
