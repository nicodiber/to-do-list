// Ventana modal para editar una tarea, con el mismo formulario que el alta.
// Usa el diálogo genérico (`dialogo-formulario.js`), que vive en document.body
// para sobrevivir a los redibujados que dispara persistirYNotificar() y abrirse
// encima de cualquier vista.

import { estado, persistirYNotificar } from './almacenamiento.js';
import { escaparHtml, nombrarConCategoria } from './utilidades.js';
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
import { renombrarHistorial, cumplirTarea, reabrirTarea, avisoInconsistentes, eliminarTarea } from './tareas-logica.js';
import { programarParaHoy } from './programador.js';
import { ofrecerExportarACalendar } from './exportar-calendar.js';
import { preguntarTiempoReal } from './tiempo-real.js';
import { avisar, confirmar } from './avisos.js';
import { avisarConflictoEnlace } from './conflicto-enlace.js';
import { agendarEnSegundoPlano } from './agendado-segundo-plano.js';
import { sonar } from './sonidos.js';

let edicionesAbiertas = 0;

/** Abre la ventana de edición de la tarea `id` encima de la vista actual. */
/** Con `apilar: true` (v0.101.0, desde el aviso de un conflicto de enlaces) se abre aunque ya haya otra edición abierta. */
export function abrirEdicionTarea(id, { apilar = false } = {}) {
  const tarea = estado.tareas.find((t) => t.tarea_id === id);
  if (!tarea || (edicionesAbiertas > 0 && !apilar)) return;
  edicionesAbiertas += 1;
  // Sello de la tarea al abrir: si cambia mientras se edita (otro dispositivo), se avisa antes de pisarla.
  const sello = tarea.tarea_modificado_en || '';

  abrirDialogoFormulario({
    titulo: '✏️ Editar tarea',
    cuerpoHtml: htmlFormularioTarea(tarea, { modo: 'edicion' }),
    botonesGuardar: [
      { texto: '🗑️ Eliminar', valor: 'eliminar', orden: -60 },
      { texto: '💾 Guardar cambios', valor: 'guardar', orden: 0 },
    ],
    conectar: (formulario) => conectarFormularioTarea(formulario, { modo: 'edicion' }),
    alCerrar: () => {
      edicionesAbiertas = Math.max(0, edicionesAbiertas - 1);
    },
    alGuardar: async (formulario, { valor }) => {
      if (valor === 'eliminar') {
        const actual = estado.tareas.find((t) => t.tarea_id === id);
        if (!actual) {
          await avisar('Esta tarea ya no existe (se eliminó mientras la editabas).');
          return true;
        }
        if (!await confirmar(`¿Eliminar la tarea "${actual.tarea_nombre}"?`, { peligro: true, textoAceptar: 'Eliminar' })) return false;
        eliminarTarea(actual, estado);
        await persistirYNotificar();
        return true;
      }
      const leido = leerFormularioTarea(formulario);
      if (!leido.campos.tarea_nombre) {
        await avisar('La tarea necesita un nombre.');
        return false;
      }

      // Se busca por id al guardar: si llegaron cambios de otro dispositivo, el objeto pudo haberse reemplazado.
      const actual = estado.tareas.find((t) => t.tarea_id === id);
      if (!actual) {
        await avisar('Esta tarea ya no existe (se eliminó mientras la editabas).');
        return true;
      }
      if ((actual.tarea_modificado_en || '') !== sello) {
        const seguir = await confirmar('Esta tarea cambió (por ejemplo desde otro dispositivo) mientras la editabas. Si guardás ahora se pisan esos cambios. ¿Guardar igual?');
        if (!seguir) return false;
      }

      const validacion = validarFormularioTarea(leido, actual.tarea_id);
      if (!validacion.ok) {
        await avisarConflictoEnlace(validacion);
        return false;
      }

      const nombreAnterior = actual.tarea_nombre;
      const eraMantenimiento = actual.tarea_mantenimiento;
      const estabaCompletada = actual.tarea_estado === 'completada';
      const eraUrgente = !!actual.tarea_urgente;
      aplicarCamposATarea(actual, leido.campos);
      aplicarEnlace(actual.tarea_id, { previaId: leido.previaId, proximaId: leido.proximaId }, estado.tareas);
      await ofrecerMarcarCadenaMantenimiento(actual, estado.tareas);
      // Pasó a urgente ahora (no ya lo era): se le asigna hoy. Re-guardar una que ya era urgente sin tocar
      // ese campo no debe volver a moverla.
      let inconsistentesUrgente = [];
      if (actual.tarea_urgente && !eraUrgente) ({ inconsistentes: inconsistentesUrgente } = await programarParaHoy(actual, estado));
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
      // Cambiar la fecha límite, la urgencia o la categoría puede cambiar la prioridad: se reordenan los horarios
      // (y se agenda lo que siga sin hora) antes de guardar (v0.97.0).
      await persistirYNotificar();
      // El horario sugerido se calcula después, en segundo plano: guardar es inmediato (v0.102.0).
      agendarEnSegundoPlano();
      if (registrosActualizados > 0) {
        await avisar(`Se actualizaron ${registrosActualizados} registro${registrosActualizados === 1 ? '' : 's'} del historial (cumplimientos y mejoras) al nuevo nombre.`);
      }
      if (copiaConservada) {
        await avisar(`Se reabrió «${actual.tarea_nombre}». La copia que se había generado al completarla no se borró porque ya se modificó o hay tareas que dependen de ella: revisá que no quede duplicada.`);
      }
      const avisoUrgente = avisoInconsistentes(inconsistentesUrgente);
      if (avisoUrgente) await avisar(avisoUrgente);
      if (ofrecerExportar) {
        await preguntarTiempoReal(actual);
        ofrecerExportarACalendar(actual);
      }
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
 * Ofrece crear una tarea de seguimiento justo después de completar `tarea` (v0.76.0): mismos datos que
 * `copiaDeTarea` (categoría, meta, persona, etc.), nombre y descripción vacíos y **sin fechas** (a diferencia
 * de Duplicar/Crearle previa/posterior, acá no tendría sentido arrastrar la fecha límite ya vencida de la
 * que se acaba de completar). No enlaza la nueva con la recién completada (ya no bloquearía nada). Se llama
 * junto a `ofrecerExportarACalendar`, en los mismos puntos donde ya se llama esa.
 */
export function ofrecerCrearTareaSeguimiento(tarea) {
  abrirDialogoFormulario({
    titulo: '➕ Tarea de seguimiento',
    textoGuardar: '➕ Crear',
    cuerpoHtml: `<p class="ayuda ayuda-formulario">¿Crear una tarea de seguimiento a partir de ${escaparHtml(nombrarConCategoria(tarea, estado.categorias))}? Se abre el alta con los mismos datos (categoría, meta, persona, etc.), nombre y fechas vacíos.</p>`,
    alGuardar: () => {
      const copia = copiaDeTarea(tarea, { vaciarNombre: true });
      copia.tarea_fecha_sugerida = '';
      copia.tarea_fecha_limite = '';
      copia.tarea_fecha_inicio_habilitada = '';
      abrirAltaTarea(copia);
      return true;
    },
  });
}

/**
 * Modal de solo lectura al hacer doble clic en una tarjeta (Resumen, Agenda): muestra `contenidoElemento`
 * (la propia vista arma su tarjeta en modo solo-info — así este módulo no depende de ninguna vista), con
 * "✖️ Cerrar" y "✏️ Editar" siempre, y "✅ Cumplida" si `mostrarCumplida` es true y la tarea sigue `pendiente`
 * (nunca para bloqueadas). Confirmar "Cumplida" abre el mismo panel que ya usan las tarjetas con la acción
 * directa (mejora opcional si es de mantenimiento) y sigue el mismo flujo: `cumplirTarea`, cerrar, persistir
 * (dispara el `render()` global que redibuja la vista de atrás) y ofrecer exportar a Calendar / tarea de
 * seguimiento. Generalizada desde `views/resumen.view.js` (v0.93.0) para reusarla también en Agenda, que no
 * tenía ninguna forma de marcar una tarea cumplida.
 */
export function abrirDetalleTarea(tarea, contenidoElemento, { mostrarCumplida = false } = {}) {
  const puedeCumplir = mostrarCumplida && tarea.tarea_estado === 'pendiente';
  const dialogo = document.createElement('dialog');
  dialogo.className = 'dialogo-tarea dialogo-detalle-tarea';
  dialogo.innerHTML = `
    <h3>👁️ Detalle de la tarea</h3>
    <div class="contenedor-detalle-tarea"></div>
    <div class="contenedor-cierre-detalle" hidden></div>
    <div class="acciones-modal">
      <button title="Cerrar sin editar (Esc)" type="button" data-accion="cerrar">✖️ Cerrar</button>
      ${puedeCumplir ? '<button title="Marcar la tarea como cumplida" type="button" data-accion="cumplida" class="boton-primario">✅ Cumplida</button>' : ''}
      <button title="Abrir esta tarea para editarla" type="button" data-accion="editar" class="boton-primario">✏️ Editar</button>
    </div>
  `;
  dialogo.querySelector('.contenedor-detalle-tarea').appendChild(contenidoElemento);
  document.body.appendChild(dialogo);

  const cerrar = () => {
    if (dialogo.open) dialogo.close();
    dialogo.remove();
  };
  dialogo.addEventListener('close', cerrar);
  dialogo.querySelector('[data-accion="cerrar"]').addEventListener('click', cerrar);
  dialogo.querySelector('[data-accion="editar"]').addEventListener('click', () => {
    cerrar();
    abrirEdicionTarea(tarea.tarea_id);
  });

  const botonCumplida = dialogo.querySelector('[data-accion="cumplida"]');
  if (botonCumplida) {
    const contenedorCierre = dialogo.querySelector('.contenedor-cierre-detalle');
    botonCumplida.addEventListener('click', () => {
      botonCumplida.hidden = true;
      contenedorCierre.hidden = false;
      contenedorCierre.innerHTML = `
        <div class="panel-cierre">
          ${
            tarea.tarea_mantenimiento
              ? `<label>💡 ¿Qué podrías mejorar la próxima vez? (opcional)
                  <input type="text" data-campo="mejora" />
                </label>`
              : ''
          }
          <button title="Confirmar que la tarea se cumplió" type="button" data-accion="confirmar-cumplida" class="boton-primario">✔️ Confirmar</button>
          <button title="Cancelar y volver al detalle" type="button" data-accion="cancelar-cierre">↩️ Cancelar</button>
        </div>
      `;
      contenedorCierre.querySelector('[data-accion="confirmar-cumplida"]').addEventListener('click', async () => {
        const campoMejora = contenedorCierre.querySelector('[data-campo="mejora"]');
        const notaMejora = campoMejora ? campoMejora.value.trim() : '';
        cumplirTarea(tarea, estado, { notaMejora });
        cerrar();
        await persistirYNotificar();
        await preguntarTiempoReal(tarea);
        ofrecerExportarACalendar(tarea);
        ofrecerCrearTareaSeguimiento(tarea);
      });
      contenedorCierre.querySelector('[data-accion="cancelar-cierre"]').addEventListener('click', () => {
        contenedorCierre.hidden = true;
        contenedorCierre.innerHTML = '';
        botonCumplida.hidden = false;
      });
    });
  }

  dialogo.showModal();
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
      { texto: '➕ Agregar y cargar otra', valor: 'otra', orden: 0, textoEnCurso: '⏳ Agregando…' },
      { texto: '➡️ Agregar y crearle siguiente', valor: 'siguiente', orden: 1, textoEnCurso: '⏳ Agregando…' },
      { texto: '✅ Agregar', valor: 'cerrar', orden: 2, textoEnCurso: '⏳ Agregando…' },
    ],
    conectar: (formulario) => {
      // Si el formulario ya viene precargado (Duplicar, Crearle previa/posterior), no se activa "escribir un
      // nombre que coincide autocompleta": pisaría a propósito lo que ya se trajo de la tarea de origen.
      conectarFormularioTarea(formulario, { modo: 'alta', precargaPorNombre: !origen });
      if (previaId) formulario.tarea_previa.value = previaId;
      if (proximaId) formulario.tarea_proxima.value = proximaId;
      // El formulario vacío coincide con el estado inicial, así que después de limpiar no se pregunta si descartar.
      const limpiar = formulario.querySelector('[data-accion="limpiar-campos"]');
      limpiar.addEventListener('click', async () => {
        if (await confirmar('¿Vaciar todos los campos del formulario?')) vaciarFormularioTarea(formulario);
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
        await avisar('La tarea necesita un nombre.');
        return false;
      }
      const validacion = validarFormularioTarea(leido);
      if (!validacion.ok) {
        await avisarConflictoEnlace(validacion);
        return false;
      }

      const teniaFechaDesdePropia = !!leido.campos.tarea_fecha_inicio_habilitada;
      const nueva = crearTarea(leido.campos);
      estado.tareas.push(nueva);
      const enlace = aplicarEnlace(nueva.tarea_id, { previaId: leido.previaId, proximaId: leido.proximaId }, estado.tareas);
      if (!enlace.ok) {
        // Enlace contradictorio: no se crea la tarea ni se limpia el formulario, para que el usuario reajuste.
        estado.tareas = estado.tareas.filter((t) => t.tarea_id !== nueva.tarea_id);
        await avisarConflictoEnlace(enlace);
        return false;
      }
      // Si queda bloqueada y no se cargó una "fecha desde" propia, hereda la de su tarea previa (por lo menos no
      // puede empezar antes que ella): se actualiza de nuevo cuando la previa se cumpla (`desbloquearDependientes`).
      if (nueva.tarea_estado === 'bloqueada' && !teniaFechaDesdePropia) {
        const previa = estado.tareas.find((t) => t.tarea_id === nueva.tarea_dependiente);
        if (previa && previa.tarea_fecha_inicio_habilitada) nueva.tarea_fecha_inicio_habilitada = previa.tarea_fecha_inicio_habilitada;
      }
      await ofrecerMarcarCadenaMantenimiento(nueva, estado.tareas);
      if (nueva.tarea_urgente) await programarParaHoy(nueva, estado);
      // Sin esto, una tarea recién creada sin fecha (y no urgente) quedaba sin `tarea_fecha_sugerida` hasta el
      // próximo refresco de sesión/Calendar (v0.90.0) — no-op para cualquier tarea que ya tenga fecha con hora.
      await persistirYNotificar();
      // El horario sugerido se calcula después, en segundo plano: guardar es inmediato (v0.102.0).
      agendarEnSegundoPlano();
      sonar('agregar');

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

