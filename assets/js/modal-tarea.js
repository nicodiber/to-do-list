// Ventana modal para editar una tarea, con el mismo formulario que el alta.
// Usa el diálogo genérico (`dialogo-formulario.js`), que vive en document.body
// para sobrevivir a los redibujados que dispara persistirYNotificar() y abrirse
// encima de cualquier vista.

import { estado, persistirYNotificar } from './almacenamiento.js';
import { crearTarea } from './modelos.js';
import {
  htmlFormularioTarea,
  conectarFormularioTarea,
  leerFormularioTarea,
  aplicarCamposATarea,
  validarFormularioTarea,
  ofrecerMarcarCadenaMantenimiento,
  vaciarFormularioTarea,
} from './formulario-tarea.js';
import { abrirDialogoFormulario } from './dialogo-formulario.js';
import { aplicarEnlace } from './dependencias.js';
import { renombrarHistorial, cumplirTarea, reabrirTarea } from './tareas-logica.js';
import { despuesDeCumplir } from './post-cumplir.js';
import { abrirAsistenteExamen } from './asistente-examen.js';

let edicionAbierta = false;

/** Una tarea de tipo examen se acaba de guardar: ofrece abrir el asistente para generar su preparación. */
function ofrecerPreparacion(tarea) {
  setTimeout(() => {
    if (confirm(`«${tarea.tarea_nombre}» es un examen. ¿Querés armar ahora los pasos de preparación con una plantilla?`)) abrirAsistenteExamen({ tareaExamen: tarea });
  }, 0);
}

/** Abre la ventana de edición de la tarea `id` encima de la vista actual. */
export function abrirEdicionTarea(id) {
  const tarea = estado.tareas.find((t) => t.tarea_id === id);
  if (!tarea || edicionAbierta) return;
  edicionAbierta = true;
  // Sello de la tarea al abrir: si cambia mientras se edita (otro dispositivo), se avisa antes de pisarla.
  const sello = tarea.tarea_modificado_en || '';

  abrirDialogoFormulario({
    titulo: '✏️ Editar tarea',
    cuerpoHtml: htmlFormularioTarea(tarea, { modo: 'edicion' }),
    textoGuardar: '💾 Guardar cambios',
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

      const nombreAnterior = actual.tarea_nombre;
      const eraMantenimiento = actual.tarea_mantenimiento;
      const estabaCompletada = actual.tarea_estado === 'completada';
      const eraExamen = actual.tarea_tipo === 'examen';
      aplicarCamposATarea(actual, leido.campos);
      aplicarEnlace(actual.tarea_id, { previaId: leido.previaId, proximaId: leido.proximaId }, estado.tareas);
      ofrecerMarcarCadenaMantenimiento(actual, estado.tareas);
      // Interruptor "Completada": misma lógica que el desplegable de estado de la vista Tareas.
      let ofrecerExportar = false;
      let copiaConservada = null;
      if (leido.completada === true && !estabaCompletada) {
        cumplirTarea(actual, estado, { notaMejora: leido.notaMejora });
        ofrecerExportar = true;
      } else if (leido.completada === false && estabaCompletada) {
        ({ copiaConservada } = reabrirTarea(actual, estado));
      }
      // El hábito se identifica por el nombre: al renombrar una tarea de mantenimiento, su historial la sigue.
      const registrosActualizados = eraMantenimiento ? renombrarHistorial(estado, nombreAnterior, actual.tarea_nombre) : 0;
      await persistirYNotificar();
      if (registrosActualizados > 0) {
        alert(`Se actualizaron ${registrosActualizados} registro${registrosActualizados === 1 ? '' : 's'} del historial (cumplimientos y mejoras) al nuevo nombre.`);
      }
      if (copiaConservada) {
        alert(`Se reabrió «${actual.tarea_nombre}». La copia que se había generado al completarla no se borró porque ya se modificó o hay tareas que dependen de ella: revisá que no quede duplicada.`);
      }
      if (ofrecerExportar) despuesDeCumplir(actual);
      // Una tarea que pasó a ser un examen: se ofrece armar su preparación.
      if (!eraExamen && actual.tarea_tipo === 'examen') ofrecerPreparacion(actual);
      return true;
    },
  });
}

let altaAbierta = false;

/**
 * Ventana para cargar una tarea nueva, con el mismo formulario que la edición. Enter
 * (o "Agregar y cargar otra") agrega la tarea y deja la ventana abierta, vacía y con el
 * cursor en el nombre, para cargar varias seguidas; "Agregar" agrega y cierra. Si el
 * pedido de enlaces es contradictorio no se crea la tarea ni se limpia el formulario.
 */
export function abrirAltaTarea() {
  if (altaAbierta) return;
  altaAbierta = true;

  abrirDialogoFormulario({
    titulo: '➕ Nueva tarea',
    cuerpoHtml: htmlFormularioTarea(null, {
      modo: 'alta',
      botonesPie: '<button title="Vaciar todos los campos del formulario (pide confirmación)" type="button" data-accion="limpiar-campos" class="btn-limpiar">🧹 Limpiar campos</button>',
    }),
    botonesGuardar: [
      { texto: '➕ Agregar y cargar otra', valor: 'otra', orden: 1 },
      { texto: '✅ Agregar', valor: 'cerrar', orden: 0 },
    ],
    conectar: (formulario) => {
      conectarFormularioTarea(formulario, { modo: 'alta' });
      // El formulario vacío coincide con el estado inicial, así que después de limpiar no se pregunta si descartar.
      const limpiar = formulario.querySelector('[data-accion="limpiar-campos"]');
      limpiar.addEventListener('click', () => {
        if (confirm('¿Vaciar todos los campos del formulario?')) vaciarFormularioTarea(formulario);
      });
      // El botón va con los demás, en la fila de acciones (entre "Agregar" y "Cancelar").
      limpiar.style.order = '50';
      formulario.querySelector('.acciones-modal').insertBefore(limpiar, formulario.querySelector('[data-accion="cancelar-dialogo"]'));
    },
    alCerrar: () => {
      altaAbierta = false;
    },
    alGuardar: async (formulario, { valor, reiniciarFirma }) => {
      const leido = leerFormularioTarea(formulario);
      if (!leido.campos.tarea_nombre) {
        alert('La tarea necesita un nombre.');
        return false;
      }
      const validacion = validarFormularioTarea(leido);
      if (!validacion.ok) {
        alert(validacion.motivo);
        return false;
      }

      const nueva = crearTarea(leido.campos);
      estado.tareas.push(nueva);
      const enlace = aplicarEnlace(nueva.tarea_id, { previaId: leido.previaId, proximaId: leido.proximaId }, estado.tareas);
      if (!enlace.ok) {
        // Enlace contradictorio: no se crea la tarea ni se limpia el formulario, para que el usuario reajuste.
        estado.tareas = estado.tareas.filter((t) => t.tarea_id !== nueva.tarea_id);
        alert(enlace.motivo);
        return false;
      }
      ofrecerMarcarCadenaMantenimiento(nueva, estado.tareas);
      await persistirYNotificar();
      if (nueva.tarea_tipo === 'examen') ofrecerPreparacion(nueva);

      if (valor === 'cerrar') return true;
      // Cargar otra: se vacía el formulario y el cursor vuelve al nombre.
      vaciarFormularioTarea(formulario);
      reiniciarFirma();
      return false;
    },
  });
}

