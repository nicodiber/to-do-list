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
  regenerarOpcionesEnlace,
} from './formulario-tarea.js';
import { abrirDialogoFormulario } from './dialogo-formulario.js';
import { aplicarEnlace } from './dependencias.js';
import { renombrarHistorial, cumplirTarea, reabrirTarea } from './tareas-logica.js';
import { ofrecerExportarACalendar } from './exportar-calendar.js';

let edicionAbierta = false;

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
      if (ofrecerExportar) ofrecerExportarACalendar(actual);
      return true;
    },
  });
}

let altaAbierta = false;

/**
 * Copia los datos "de contenido" de una tarea (para Duplicar, Crearle previa/posterior): todo lo que sirve de
 * autocompletado, sin metadatos de sistema (id, fechas de creación/modificación) ni enlaces (`tarea_dependiente`,
 * `tarea_desencadenante`) — eso lo decide quien la use. Con `vaciarNombre` deja el nombre y la descripción vacíos.
 */
export function copiaDeTarea(origen, { vaciarNombre = false } = {}) {
  const {
    tarea_id,
    tarea_estado,
    tarea_dependiente,
    tarea_desencadenante,
    tarea_fecha_fin,
    tarea_creada_en,
    tarea_modificado_en,
    tarea_exportada_calendar,
    tarea_carga_completa,
    tarea_prioridad_manual,
    tarea_tipo,
    tarea_origen,
    ...resto
  } = origen;
  return {
    ...resto,
    tarea_nombre: vaciarNombre ? '' : resto.tarea_nombre,
    tarea_descripcion: vaciarNombre ? '' : resto.tarea_descripcion,
    tarea_checklist: (resto.tarea_checklist || []).map((item) => ({ texto: item.texto, hecho: false })),
  };
}

/**
 * Ventana para cargar una tarea nueva, con el mismo formulario que la edición. Enter
 * (o "Agregar y cargar otra") agrega la tarea y deja la ventana abierta, vacía y con el
 * cursor en el nombre, para cargar varias seguidas; "Agregar" agrega y cierra. Si el
 * pedido de enlaces es contradictorio no se crea la tarea ni se limpia el formulario.
 *
 * `origen` (opcional) precarga el formulario con esos datos (ver `copiaDeTarea`, usado por "Duplicar" y "Crearle
 * tarea previa/posterior" de la vista Tareas); `enlace` fuerza la selección inicial de "Depende de"/"Bloquea a".
 */
export function abrirAltaTarea(origen = null, { previaId = null, proximaId = null } = {}) {
  if (altaAbierta) return;
  altaAbierta = true;

  abrirDialogoFormulario({
    titulo: '➕ Nueva tarea',
    cuerpoHtml: htmlFormularioTarea(origen, {
      modo: 'alta',
      botonesPie: '<button title="Vaciar todos los campos del formulario (pide confirmación)" type="button" data-accion="limpiar-campos" class="btn-limpiar">🧹 Limpiar campos</button>',
    }),
    botonesGuardar: [
      { texto: '➕ Agregar y cargar otra', valor: 'otra', orden: 0 },
      { texto: '➡️ Agregar y crearle siguiente', valor: 'siguiente', orden: 1 },
      { texto: '✅ Agregar', valor: 'cerrar', orden: 2 },
    ],
    conectar: (formulario) => {
      // Si el formulario ya viene precargado (Duplicar, Crearle previa/posterior), no se activa "escribir un
      // nombre que coincide autocompleta": pisaría a propósito lo que ya se trajo de la tarea de origen.
      conectarFormularioTarea(formulario, { modo: 'alta', precargaPorNombre: !origen });
      if (previaId) formulario.tarea_previa.value = previaId;
      if (proximaId) formulario.tarea_proxima.value = proximaId;
      // El formulario vacío coincide con el estado inicial, así que después de limpiar no se pregunta si descartar.
      const limpiar = formulario.querySelector('[data-accion="limpiar-campos"]');
      limpiar.addEventListener('click', () => {
        if (confirm('¿Vaciar todos los campos del formulario?')) vaciarFormularioTarea(formulario);
      });
      // El botón va con los demás, en la fila de acciones (entre "Agregar" y "Cancelar").
      limpiar.style.order = '-50';
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

      const teniaFechaDesdePropia = !!leido.campos.tarea_fecha_inicio_habilitada;
      const nueva = crearTarea(leido.campos);
      estado.tareas.push(nueva);
      const enlace = aplicarEnlace(nueva.tarea_id, { previaId: leido.previaId, proximaId: leido.proximaId }, estado.tareas);
      if (!enlace.ok) {
        // Enlace contradictorio: no se crea la tarea ni se limpia el formulario, para que el usuario reajuste.
        estado.tareas = estado.tareas.filter((t) => t.tarea_id !== nueva.tarea_id);
        alert(enlace.motivo);
        return false;
      }
      // Si queda bloqueada y no se cargó una "fecha desde" propia, hereda la de su tarea previa (por lo menos no
      // puede empezar antes que ella): se actualiza de nuevo cuando la previa se cumpla (`desbloquearDependientes`).
      if (nueva.tarea_estado === 'bloqueada' && !teniaFechaDesdePropia) {
        const previa = estado.tareas.find((t) => t.tarea_id === nueva.tarea_dependiente);
        if (previa && previa.tarea_fecha_inicio_habilitada) nueva.tarea_fecha_inicio_habilitada = previa.tarea_fecha_inicio_habilitada;
      }
      ofrecerMarcarCadenaMantenimiento(nueva, estado.tareas);
      await persistirYNotificar();

      if (valor === 'siguiente') {
        // Cierra esta ventana y abre una en blanco para la tarea siguiente, ya enlazada como dependiente de esta.
        altaAbierta = false;
        setTimeout(() => abrirAltaTarea(null, { previaId: nueva.tarea_id }), 0);
        return true;
      }
      if (valor === 'cerrar') return true;
      // Cargar otra: se vacía el formulario, se rearman los desplegables de enlace (para poder elegir la que se
      // acaba de crear) y el cursor vuelve al nombre.
      vaciarFormularioTarea(formulario);
      regenerarOpcionesEnlace(formulario);
      reiniciarFirma();
      return false;
    },
  });
}

