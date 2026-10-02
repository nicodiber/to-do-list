// Aviso de un conflicto al enlazar tareas (v0.101.0): en vez de un texto suelto, explica el motivo y lista las tareas
// involucradas, cada una con un botón para editarla ahí mismo y ajustar el enlace.

import { estado } from './almacenamiento.js';
import { avisar, avisarConAcciones } from './avisos.js';
import { nombreConCategoria } from './formulario-tarea.js';

/** `resultado` es lo que devuelve `evaluarEnlace`/`aplicarEnlace` cuando `ok` es `false` (`motivo` y `tareas`). */
export async function avisarConflictoEnlace(resultado) {
  const ids = [...new Set(resultado.tareas || [])];
  const tareas = ids.map((id) => estado.tareas.find((t) => t.tarea_id === id)).filter(Boolean);
  if (tareas.length === 0) {
    await avisar(resultado.motivo, { titulo: 'No se puede enlazar' });
    return;
  }
  await avisarConAcciones(`${resultado.motivo}\n\nTareas involucradas (podés editarlas ahora para ajustar sus enlaces y después volver a intentarlo):`, {
    titulo: 'No se puede enlazar',
    acciones: tareas.map((t) => ({
      texto: `✏️ ${nombreConCategoria(t)}${t.tarea_estado === 'completada' ? ' (completada)' : ''}`,
      // Import dinámico: modal-tarea.js importa este módulo.
      alClic: async () => (await import('./modal-tarea.js')).abrirEdicionTarea(t.tarea_id, { apilar: true }),
    })),
  });
}
