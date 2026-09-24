// Edición masiva (v0.70.0 en Tareas; extraída a módulo compartido en v0.74.0 para reusarla también en
// Tabla): aplicar el mismo cambio a varias tareas elegidas de una vez.

import { estado, persistirYNotificar } from './almacenamiento.js';
import { combinarFechaYHora } from './utilidades.js';
import { limitarFechaSugeridaALimite } from './tareas-logica.js';
import { programarParaHoy } from './programador.js';
import {
  htmlOpcionesCategoria,
  htmlOpcionesDisfrute,
  htmlOpcionesMeta,
  htmlOpcionesPersona,
  htmlOpcionesUbicacion,
  htmlDiasHabiles,
  htmlInterruptor,
  aplicarCamposATarea,
} from './formulario-tarea.js';
import { abrirDialogoFormulario } from './dialogo-formulario.js';

/** Saca la opción "＋ Crear nueva…" de un HTML de `<option>`: acá no se dan de alta entidades nuevas. */
function sinOpcionNueva(html) {
  return html.replace(/<option value="__nueva__">[^<]*<\/option>/, '');
}

/** Una fila de campo con una casilla "Cambiar" que habilita el control real; sin tildar, ese campo no se toca. */
function filaCampoMasivo(nombreCampo, etiqueta, controlHtml) {
  return `
    <div class="campo campo-masivo" data-fila="${nombreCampo}">
      <label class="campo-masivo-activar">
        <input type="checkbox" data-activar="${nombreCampo}" />
        <span class="campo-titulo">${etiqueta}</span>
      </label>
      ${controlHtml}
    </div>`;
}

/** Fila de campo±hora (fecha desde, sugerida, límite): mismo par `<input date>`+`<input time>` que el alta. */
function filaFechaHoraMasiva(nombreCampo, etiqueta, ayuda = '') {
  return filaCampoMasivo(
    nombreCampo,
    etiqueta,
    `<span class="par-fecha-hora" title="${ayuda}">
      <input type="date" name="${nombreCampo}_fecha" disabled />
      <input type="time" name="${nombreCampo}_hora" disabled title="Hora (opcional)" />
    </span>`
  );
}

function leerFechaHoraMasiva(datos, nombreCampo) {
  const fecha = datos.get(`${nombreCampo}_fecha`);
  const hora = datos.get(`${nombreCampo}_hora`);
  if (!fecha) return '';
  return hora ? combinarFechaYHora(fecha, hora) : fecha;
}

function htmlFormularioEdicionMasiva() {
  return `
    <p class="ayuda">Tildá "Cambiar" en los campos que quieras aplicar a todas las tareas elegidas; los que dejes sin tildar quedan como estaban en cada una.</p>
    ${filaCampoMasivo('categoria_id', '🗂️ Categoría', `<select name="categoria_id" disabled>${sinOpcionNueva(htmlOpcionesCategoria(''))}</select>`)}
    ${filaCampoMasivo('tarea_urgente', '❗ Urgente', htmlInterruptor('tarea_urgente', false, 'Urgente (asigna hoy)', 'disabled'))}
    ${filaCampoMasivo('tarea_disfrute', '⭐ Disfrute', `<select name="tarea_disfrute" disabled>${htmlOpcionesDisfrute(null)}</select>`)}
    ${filaCampoMasivo('meta_id', '🏁 Meta', `<select name="meta_id" disabled>${sinOpcionNueva(htmlOpcionesMeta(''))}</select>`)}
    ${filaCampoMasivo('persona_id', '👤 Persona', `<select name="persona_id" disabled>${sinOpcionNueva(htmlOpcionesPersona(''))}</select>`)}
    ${filaCampoMasivo('ubicacion_id', '📍 Ubicación', `<select name="ubicacion_id" disabled>${sinOpcionNueva(htmlOpcionesUbicacion(''))}</select>`)}
    ${filaFechaHoraMasiva('tarea_fecha_inicio_habilitada', '🚦 Habilitada desde', 'Desde cuándo se puede empezar')}
    ${filaFechaHoraMasiva('tarea_fecha_sugerida', '📅 Fecha sugerida', 'Se recorta sola si supera la fecha límite de alguna tarea')}
    ${filaFechaHoraMasiva('tarea_fecha_limite', '⏳ Fecha límite', 'Fecha en la que tiene que estar hecha sí o sí')}
    ${filaCampoMasivo('tarea_duracion_min', '⏱️ Duración (minutos)', '<input type="number" name="tarea_duracion_min" min="0" step="15" value="30" disabled />')}
    ${filaCampoMasivo('tarea_costo_estimado', '💰 Costo estimado ($)', '<input type="number" name="tarea_costo_estimado" min="0" disabled />')}
    ${filaCampoMasivo('tarea_dias_habiles', '🗓️ Días hábiles (sin marcar = cualquier día)', htmlDiasHabiles([]))}
  `;
}

/** Lee los campos con su casilla "Cambiar" tildada: `{ clave: valor }`, sin las que quedaron sin tocar. */
function leerEdicionMasiva(formulario) {
  const datos = new FormData(formulario);
  const activo = (campo) => formulario.querySelector(`[data-activar="${campo}"]`).checked;
  const cambios = {};
  if (activo('categoria_id')) cambios.categoria_id = datos.get('categoria_id') || null;
  if (activo('tarea_urgente')) cambios.tarea_urgente = datos.get('tarea_urgente') === 'on';
  if (activo('tarea_disfrute')) cambios.tarea_disfrute = datos.get('tarea_disfrute') ? Number(datos.get('tarea_disfrute')) : null;
  if (activo('meta_id')) cambios.meta_id = datos.get('meta_id') || null;
  if (activo('persona_id')) cambios.persona_id = datos.get('persona_id') || null;
  if (activo('ubicacion_id')) cambios.ubicacion_id = datos.get('ubicacion_id') || null;
  if (activo('tarea_fecha_inicio_habilitada')) cambios.tarea_fecha_inicio_habilitada = leerFechaHoraMasiva(datos, 'tarea_fecha_inicio_habilitada');
  if (activo('tarea_fecha_sugerida')) cambios.tarea_fecha_sugerida = leerFechaHoraMasiva(datos, 'tarea_fecha_sugerida');
  if (activo('tarea_fecha_limite')) cambios.tarea_fecha_limite = leerFechaHoraMasiva(datos, 'tarea_fecha_limite');
  if (activo('tarea_duracion_min')) cambios.tarea_duracion_min = Number(datos.get('tarea_duracion_min')) || 30;
  if (activo('tarea_costo_estimado')) cambios.tarea_costo_estimado = Number(datos.get('tarea_costo_estimado')) || 0;
  if (activo('tarea_dias_habiles')) cambios.tarea_dias_habiles = datos.getAll('tarea_dias_habiles').map(Number);
  return cambios;
}

/** Ventana de edición masiva sobre `tareas` (ya elegidas); `alTerminar()` se llama al aplicar los cambios. */
export function abrirEdicionMasiva(tareas, alTerminar) {
  abrirDialogoFormulario({
    titulo: `✏️ Editar ${tareas.length} tarea${tareas.length === 1 ? '' : 's'}`,
    textoGuardar: 'Aplicar cambios',
    cuerpoHtml: htmlFormularioEdicionMasiva(),
    conectar: (formulario) => {
      formulario.querySelectorAll('[data-activar]').forEach((casilla) => {
        casilla.addEventListener('change', () => {
          const fila = casilla.closest('.campo-masivo');
          fila.classList.toggle('activo', casilla.checked);
          fila.querySelectorAll('select, input:not([data-activar])').forEach((control) => {
            control.disabled = !casilla.checked;
          });
        });
      });
    },
    alGuardar: async (formulario) => {
      const cambios = leerEdicionMasiva(formulario);
      if (Object.keys(cambios).length === 0) {
        alert('Tildá "Cambiar" en al menos un campo para aplicar algo.');
        return false;
      }
      // La sugerida nunca supera la fecha límite: se recorta por tarea, contra su propia fecha límite (puede
      // haber cambiado recién arriba, en el mismo `aplicarCamposATarea`, si también se tildó "Fecha límite").
      let recortadas = 0;
      for (const tarea of tareas) {
        aplicarCamposATarea(tarea, cambios);
        if (cambios.tarea_fecha_sugerida) {
          const limitada = limitarFechaSugeridaALimite(tarea.tarea_fecha_sugerida, tarea.tarea_fecha_limite);
          if (limitada !== tarea.tarea_fecha_sugerida) {
            tarea.tarea_fecha_sugerida = limitada;
            recortadas += 1;
          }
        }
        // Se tildó "Urgente" en Sí para el lote: cada tarea se agenda para hoy (o el próximo hueco si no
        // entra). No evita chocar entre tareas del mismo lote — `reubicarTareasSolapadas` las reacomoda solas.
        if (cambios.tarea_urgente) await programarParaHoy(tarea, estado);
      }
      await persistirYNotificar();
      if (recortadas > 0) {
        alert(`${recortadas} tarea${recortadas === 1 ? '' : 's'} no recibió la fecha sugerida por superar su fecha límite.`);
      }
      alTerminar();
      return true;
    },
  });
}
