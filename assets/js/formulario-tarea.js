// Formulario de tarea compartido por el alta (vista Tareas), la ventana modal de
// edición y "Completar carga de tareas": un solo lugar para armar los campos,
// leerlos y validarlos, en lugar de tres copias.

import { estado } from './almacenamiento.js';
import { UNIDADES_MANTENIMIENTO, ETIQUETAS_UNIDAD_MANTENIMIENTO } from './modelos.js';
import { escaparHtml, arbolCategorias, caminoCategoria, tieneHora, combinarFechaYHora, capitalizarPrimera, fechaLocalISO, formatearHora, htmlInterruptor } from './utilidades.js';
import { DIAS_SEMANA } from './reprogramar.js';
import { opcionesPrevia, opcionesProxima, evaluarEnlace, tareasDeLaCadenaNoRepetibles } from './dependencias.js';
import { limitarFechaSugeridaALimite, textoRepeticion } from './tareas-logica.js';
import { abrirDialogoCategoria, abrirDialogoUbicacion, abrirDialogoMeta, abrirDialogoPersona } from './formularios-entidades.js';

import { activarMayusculaInicial, conectarCrearNueva, CREAR_NUEVA } from './dialogo-formulario.js';
import { confirmar } from './avisos.js';

export { firmaFormulario } from './dialogo-formulario.js';

export function htmlOpcionesDisfrute(seleccionado = null) {
  const opciones = [`<option value="" ${seleccionado == null ? 'selected' : ''}>Sin definir (usa el de la categoría)</option>`];
  for (let nivel = 1; nivel <= 5; nivel += 1) {
    opciones.push(`<option value="${nivel}" ${nivel === seleccionado ? 'selected' : ''}>${'⭐'.repeat(nivel)} (${nivel})</option>`);
  }
  return opciones.join('');
}

export function htmlOpcionesCategoria(seleccionada = '') {
  const opciones = ['<option value="">Sin categoría</option>'];
  arbolCategorias(estado.categorias).forEach(({ categoria, profundidad }) => {
    opciones.push(
      `<option value="${categoria.categoria_id}" ${categoria.categoria_id === seleccionada ? 'selected' : ''}>${'　'.repeat(profundidad)}${escaparHtml(categoria.categoria_nombre)}</option>`
    );
  });
  opciones.push(`<option value="${CREAR_NUEVA}">＋ Crear nueva categoría…</option>`);
  return opciones.join('');
}

export function htmlOpcionesUbicacion(seleccionada = '') {
  return [
    '<option value="">Sin ubicación</option>',
    ...estado.ubicaciones.map((u) => `<option value="${u.ubicacion_id}" ${u.ubicacion_id === seleccionada ? 'selected' : ''}>${escaparHtml(u.ubicacion_nombre)}</option>`),
    `<option value="${CREAR_NUEVA}">＋ Crear nueva ubicación…</option>`,
  ].join('');
}

export function htmlOpcionesMeta(seleccionada = '') {
  return [
    '<option value="">Sin meta</option>',
    ...estado.metas.map((m) => `<option value="${m.meta_id}" ${m.meta_id === seleccionada ? 'selected' : ''}>${escaparHtml(m.meta_nombre)}</option>`),
    `<option value="${CREAR_NUEVA}">＋ Crear nueva meta…</option>`,
  ].join('');
}

export function htmlOpcionesPersona(seleccionada = '') {
  return [
    '<option value="">Sin persona</option>',
    ...estado.personas.map((p) => `<option value="${p.persona_id}" ${p.persona_id === seleccionada ? 'selected' : ''}>${escaparHtml(p.persona_nombre)}</option>`),
    `<option value="${CREAR_NUEVA}">＋ Crear nueva persona…</option>`,
  ].join('');
}

/**
 * Días hábiles como fichas redondas (L M X J V S D, la semana empieza el lunes). Siguen siendo casillas
 * con el mismo `name` y `value` (índice del día: 0 = domingo), pero se ven y se tocan como botones.
 */
export function htmlDiasHabiles(seleccionados = [], nombre = 'tarea_dias_habiles') {
  const letras = { 1: 'L', 2: 'M', 3: 'X', 4: 'J', 5: 'V', 6: 'S', 0: 'D' };
  return `<span class="chips-dias">${[1, 2, 3, 4, 5, 6, 0]
    .map(
      (indice) => `
      <label class="chip-dia" title="${DIAS_SEMANA[indice]}">
        <input type="checkbox" name="${nombre}" value="${indice}" ${seleccionados.includes(indice) ? 'checked' : ''} aria-label="${DIAS_SEMANA[indice]}" />
        <span aria-hidden="true">${letras[indice]}</span>
      </label>`
    )
    .join('')}</span>`;
}

export function partesFechaHora(valorISO) {
  if (!valorISO) return { fecha: '', hora: '' };
  if (!tieneHora(valorISO)) return { fecha: valorISO, hora: '' };
  return { fecha: fechaLocalISO(new Date(valorISO)), hora: formatearHora(valorISO) };
}

function htmlParFechaHora(nombreCampo, valorISO, etiqueta, ayuda = '') {
  const { fecha, hora } = partesFechaHora(valorISO);
  return `
    <label class="campo" title="${ayuda}"><span class="campo-titulo">${etiqueta}</span>
      <span class="par-fecha-hora">
        <input type="date" name="${nombreCampo}_fecha" value="${fecha}" />
        <input type="time" name="${nombreCampo}_hora" value="${hora}" title="Hora (opcional)" />
      </span>
    </label>
  `;
}

function combinarCampoFechaHora(datos, nombreCampo) {
  const fecha = datos.get(`${nombreCampo}_fecha`);
  const hora = datos.get(`${nombreCampo}_hora`);
  if (!fecha) return '';
  return hora ? combinarFechaYHora(fecha, hora) : fecha;
}

/** Opciones de "hasta que se cumpla o venza esta tarea": las tareas sin completar. */
function htmlOpcionesRepetirHastaTarea(tarea, seleccionada = '') {
  const candidatas = estado.tareas
    .filter((x) => x.tarea_estado !== 'completada' && (!tarea || x.tarea_id !== tarea.tarea_id))
    .sort((a, b) => a.tarea_nombre.localeCompare(b.tarea_nombre, 'es'));
  return [
    '<option value="">Sin tarea de referencia</option>',
    ...candidatas.map((x) => `<option value="${x.tarea_id}" ${x.tarea_id === seleccionada ? 'selected' : ''}>${escaparHtml(nombreConCategoria(x))}</option>`),
  ].join('');
}

/** Tareas con nombre distinto (la más reciente de cada nombre): base del autocompletado del alta. */
export function tareasUnicasPorNombre() {
  const mapa = new Map();
  estado.tareas
    .slice()
    .sort((a, b) => b.tarea_creada_en.localeCompare(a.tarea_creada_en))
    .forEach((t) => {
      const clave = t.tarea_nombre.trim().toLowerCase();
      if (!mapa.has(clave)) mapa.set(clave, t);
    });
  return [...mapa.values()];
}

/**
 * Nombre de una tarea para mostrarlo en un desplegable: dos tareas distintas pueden
 * llamarse igual en categorías distintas, así que se agrega la categoría.
 */
export function nombreConCategoria(tarea) {
  const categoria = estado.categorias.find((c) => c.categoria_id === tarea.categoria_id);
  return categoria ? `${caminoCategoria(categoria, estado.categorias)} · ${tarea.tarea_nombre}` : tarea.tarea_nombre;
}

function htmlItemChecklist(item = { texto: '', hecho: false }) {
  return `
    <li class="item-checklist-editor">
      <input type="checkbox" name="checklist_hecho" ${item.hecho ? 'checked' : ''} title="Hecho" />
      <input type="text" name="checklist_texto" value="${escaparHtml(item.texto)}" placeholder="Paso..." />
      <button type="button" data-accion="quitar-item-checklist" title="Quitar este paso" aria-label="Quitar este paso">✕</button>
    </li>`;
}

function htmlOpcionEnlace(o, actual, textoOcupada) {
  const completada = o.tarea.tarea_estado === 'completada' ? ' (completada)' : '';
  const ocupada = o.ocupadaPor ? ` (${textoOcupada} «${escaparHtml(nombreConCategoria(o.ocupadaPor))}»: se inserta en medio)` : '';
  const motivo = o.deshabilitada ? ` — no disponible: ${escaparHtml(o.deshabilitada)}` : '';
  return `<option value="${o.tarea.tarea_id}" ${actual && o.tarea.tarea_id === actual.tarea_id ? 'selected' : ''} ${o.deshabilitada ? 'disabled' : ''}>${escaparHtml(nombreConCategoria(o.tarea))}${ocupada}${completada}${motivo}</option>`;
}

/**
 * Opciones de "Depende de" / "Bloquea a" (v0.101.0): agrupadas por categoría (`<optgroup>`, ordenadas por su camino) y,
 * dentro de cada una, por nombre. Las que crearían un ciclo van deshabilitadas con el motivo en vez de ocultarse.
 */
function htmlOpcionesEnlace(opciones, actual, textoOcupada, sinValor) {
  // La tarea actualmente enlazada siempre debe figurar, aunque ya esté completada.
  const lista = actual && !opciones.some((o) => o.tarea.tarea_id === actual.tarea_id) ? [{ tarea: actual, ocupadaPor: null }, ...opciones] : opciones;
  const grupos = new Map();
  lista.forEach((o) => {
    const categoria = estado.categorias.find((c) => c.categoria_id === o.tarea.categoria_id);
    const clave = categoria ? caminoCategoria(categoria, estado.categorias) : 'Sin categoría';
    grupos.set(clave, [...(grupos.get(clave) || []), o]);
  });
  const html = [...grupos.entries()]
    .sort(([a], [b]) => (a === 'Sin categoría') - (b === 'Sin categoría') || a.localeCompare(b, 'es'))
    .map(([clave, opcionesGrupo]) => {
      const ordenadas = opcionesGrupo.slice().sort((x, y) => x.tarea.tarea_nombre.localeCompare(y.tarea.tarea_nombre, 'es'));
      return `<optgroup label="${escaparHtml(clave)}">${ordenadas.map((o) => htmlOpcionEnlace(o, actual, textoOcupada)).join('')}</optgroup>`;
    })
    .join('');
  return `<option value="">${sinValor}</option>${html}`;
}

function htmlSelectEnlace(nombre, etiqueta, opciones, actual, textoOcupada, sinValor) {
  return `
    <label class="campo ancho-completo" title="Una tarea puede tener una sola previa y una sola próxima"><span class="campo-titulo">${etiqueta}</span>
      <input type="search" class="filtro-enlace" data-filtro-de="${nombre}" placeholder="🔎 Filtrar por nombre o categoría" aria-label="Filtrar las tareas de la lista" autocomplete="off" />
      <select name="${nombre}">${htmlOpcionesEnlace(opciones, actual, textoOcupada, sinValor)}</select>
    </label>`;
}

/**
 * Reconstruye las opciones de "Depende de" y "Bloquea a" del alta (por ejemplo después de "Agregar y cargar otra",
 * cuando la tarea recién creada ya tiene que poder elegirse). `referencia` es la misma que arma el resto del
 * formulario (una tarea real en edición, o un objeto sin `tarea_id` en el alta).
 */
export function regenerarOpcionesEnlace(formulario, referencia = { tarea_id: '__nueva__' }) {
  const selectPrevia = formulario.querySelector('[name="tarea_previa"]');
  const selectProxima = formulario.querySelector('[name="tarea_proxima"]');
  if (selectPrevia) selectPrevia.innerHTML = htmlOpcionesEnlace(opcionesPrevia(referencia, estado.tareas), null, 'ya bloquea a', 'Sin tarea previa');
  if (selectProxima) selectProxima.innerHTML = htmlOpcionesEnlace(opcionesProxima(referencia, estado.tareas), null, 'ya depende de', 'Sin tarea próxima');
  [selectPrevia, selectProxima].forEach((select) => select && select.dispatchEvent(new Event('opciones-regeneradas')));
}

const sinAcentos = (texto) => String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Conecta el campo de búsqueda de un desplegable de tareas (v0.101.0): al escribir, deja solo las opciones que contienen
 * todas las palabras (sin importar acentos ni mayúsculas) en el nombre o la categoría. Siempre conserva la opción vacía
 * y la que está elegida. Guarda una copia de las opciones y la rehace si el desplegable se regenera.
 */
function conectarFiltroDeEnlaces(select, campo) {
  let original = [...select.children].map((n) => n.cloneNode(true));
  const aplicar = () => {
    const palabras = sinAcentos(campo.value).split(/\s+/).filter(Boolean);
    const elegida = select.value;
    const coincide = (opcion) => !opcion.value || opcion.value === elegida || palabras.every((p) => sinAcentos(opcion.textContent).includes(p));
    select.replaceChildren();
    original.forEach((nodo) => {
      if (nodo.tagName === 'OPTGROUP') {
        const grupo = nodo.cloneNode(false);
        [...nodo.children].filter(coincide).forEach((o) => grupo.appendChild(o.cloneNode(true)));
        if (grupo.children.length > 0) select.appendChild(grupo);
      } else if (coincide(nodo)) {
        select.appendChild(nodo.cloneNode(true));
      }
    });
    select.value = elegida;
  };
  campo.addEventListener('input', aplicar);
  select.addEventListener('opciones-regeneradas', () => {
    original = [...select.children].map((n) => n.cloneNode(true));
    campo.value = '';
  });
}

/**
 * Campos de una tarea: el nombre arriba y el resto en cinco secciones con título (Qué, Cuándo, Dónde y
 * costo, Enlaces, Repetición), todos opcionales. Con `tarea = null` arma el formulario vacío del alta.
 * `botonesNombre` se agrega a la fila del nombre (por ejemplo el botón "Agregar") y `botonesPie` al final.
 * Los botones los pone quien lo usa: acá solo están los campos. En la edición suma el interruptor de
 * estado "Completada".
 */
export function htmlFormularioTarea(tarea, { modo = 'edicion', botonesNombre = '', botonesPie = '' } = {}) {
  const t = tarea || {};
  const enAlta = modo === 'alta';
  const referencia = tarea || { tarea_id: '__nueva__' };
  const previaActual = t.tarea_dependiente ? estado.tareas.find((x) => x.tarea_id === t.tarea_dependiente) : null;
  const proximaActual = tarea ? estado.tareas.find((x) => x.tarea_dependiente === tarea.tarea_id && x.tarea_estado !== 'completada') : null;
  const puedeTenerDesencadenante = !t.tarea_dependiente || t.tarea_dependiente === t.tarea_desencadenante;
  const checklist = t.tarea_checklist || [];
  const intervalo = t.tarea_mantenimiento_intervalo;
  const diaFijo = t.tarea_mantenimiento_dia_fijo;
  const modoRepeticion = diaFijo ? diaFijo.tipo : 'intervalo';

  return `
    <div class="fila-nombre-tarea">
      <input type="text" name="tarea_nombre" value="${escaparHtml(t.tarea_nombre || '')}" placeholder="${enAlta ? '📝 Nueva tarea (Enter para agregar)' : '📝 Nombre de la tarea'}" aria-label="Nombre de la tarea" required ${enAlta ? 'list="lista-sugerencias-tareas" autocomplete="off"' : ''} />
      ${enAlta ? `<datalist id="lista-sugerencias-tareas">${tareasUnicasPorNombre().map((x) => `<option value="${escaparHtml(x.tarea_nombre)}"></option>`).join('')}</datalist>` : ''}
      ${botonesNombre}
    </div>
    ${modo === 'edicion' && tarea ? htmlEstadoCompletada(tarea) : ''}

    <fieldset class="seccion-form">
      <legend>📝 Qué</legend>
      <label class="campo ancho-completo" title="Notas, enlaces o lo que quieras recordar de la tarea"><span class="campo-titulo">🗒️ Descripción, notas o links</span>
        <input type="text" name="tarea_descripcion" placeholder="Opcional" value="${escaparHtml(t.tarea_descripcion || '')}" />
      </label>
      <label class="campo" title="El área de tu vida a la que pertenece; define su prioridad"><span class="campo-titulo">🗂️ Categoría</span><select name="categoria_id">${htmlOpcionesCategoria(t.categoria_id || '')}</select></label>
      <label class="campo" title="Cuánto disfrutás hacerla (1 a 5)"><span class="campo-titulo">⭐ Disfrute</span><select name="tarea_disfrute">${htmlOpcionesDisfrute(t.tarea_disfrute ?? null)}</select></label>
      <label class="campo" title="La meta a la que aporta esta tarea"><span class="campo-titulo">🏁 Meta</span><select name="meta_id">${htmlOpcionesMeta(t.meta_id || '')}</select></label>
      <label class="campo" title="Con quién la hacés, si depende de otra persona"><span class="campo-titulo">👤 Persona</span><select name="persona_id">${htmlOpcionesPersona(t.persona_id || '')}</select></label>
      <div class="ancho-completo">${htmlInterruptor('tarea_urgente', t.tarea_urgente, '❗ Urgente', 'title="Cuenta para ordenar la lista; al marcarla se le asigna la fecha sugerida de hoy (o el próximo hueco libre si no entra)"')}</div>
    </fieldset>

    <fieldset class="seccion-form">
      <legend>📅 Cuándo</legend>
      ${htmlParFechaHora('tarea_fecha_inicio_habilitada', enAlta ? '' : t.tarea_fecha_inicio_habilitada, '🚦 Habilitada desde', 'Desde cuándo se puede empezar: antes de esa fecha la tarea figura como todavía no disponible')}
      ${htmlParFechaHora('tarea_fecha_sugerida', t.tarea_fecha_sugerida, '📅 Sugerida', 'Cuándo conviene hacerla; con hora es un horario concreto')}
      ${htmlParFechaHora('tarea_fecha_limite', t.tarea_fecha_limite, '⏳ Límite', 'Fecha en la que tiene que estar hecha sí o sí')}
      <label class="campo" title="Cuánto tarda, en minutos (por defecto 15)"><span class="campo-titulo">⏱️ Duración (minutos)</span><input type="number" name="tarea_duracion_min" value="${t.tarea_duracion_min || 15}" min="0" step="15" /></label>
      <div class="campo ancho-completo" title="Los días de la semana en que se puede hacer; sin marcar, cualquier día"><span class="campo-titulo">🗓️ Días hábiles (sin marcar = cualquier día)</span>${htmlDiasHabiles(t.tarea_dias_habiles || [])}</div>
    </fieldset>

    <fieldset class="seccion-form">
      <legend>📍 Dónde y costo</legend>
      <label class="campo" title="Dónde se hace: permite filtrar por lugar y consultar el pronóstico"><span class="campo-titulo">📍 Ubicación</span><select name="ubicacion_id">${htmlOpcionesUbicacion(t.ubicacion_id || '')}</select></label>
      <label class="campo" title="Cuánto dinero implica, para proyectar gastos"><span class="campo-titulo">💰 Costo estimado ($)</span><input type="number" name="tarea_costo_estimado" min="0" placeholder="Opcional" value="${t.tarea_costo_estimado || ''}" /></label>
      <div class="ancho-completo">${htmlInterruptor('tarea_requiere_clima_bueno', t.tarea_requiere_clima_bueno, '🌦️ Requiere buen tiempo (sin lluvia)', 'title="Si el pronóstico marca lluvia, la app te avisa para que la pospongas"')}</div>
    </fieldset>

    <fieldset class="seccion-form">
      <legend>🔗 Enlaces</legend>
      ${htmlSelectEnlace('tarea_previa', '⬅️ Depende de (tarea previa)', opcionesPrevia(referencia, estado.tareas), previaActual, 'ya bloquea a', 'Sin tarea previa')}
      ${htmlSelectEnlace('tarea_proxima', '➡️ Bloquea a (tarea próxima)', opcionesProxima(referencia, estado.tareas), proximaActual, 'ya depende de', 'Sin tarea próxima')}
    </fieldset>

    <fieldset class="seccion-form">
      <legend>🔁 Repetición</legend>
      <div class="ancho-completo">${htmlInterruptor('tarea_mantenimiento', t.tarea_mantenimiento, '🔁 Es tarea con repetición (se renueva sola)', 'title="Al cumplirla se crea sola la próxima repetición"')}</div>
      <span class="campos-mantenimiento ancho-completo modo-repeticion" ${t.tarea_mantenimiento ? '' : 'hidden'}>
        <label class="opcion-repeticion" title="La próxima repetición cuenta desde el día en que cumplís esta"><input type="radio" name="mantenimiento_modo" value="intervalo" ${modoRepeticion === 'intervalo' ? 'checked' : ''} />
          cada
          <input type="number" name="mantenimiento_cantidad" value="${intervalo ? intervalo.cantidad : 1}" min="1" style="width: 4.5rem" aria-label="Cantidad" />
          <select name="mantenimiento_unidad" aria-label="Unidad">
            ${UNIDADES_MANTENIMIENTO.map((u) => `<option value="${u}" ${intervalo && intervalo.unidad === u ? 'selected' : ''}>${ETIQUETAS_UNIDAD_MANTENIMIENTO[u]}</option>`).join('')}
          </select>
          desde que la cumplo
        </label>
        <label class="opcion-repeticion" title="Cae siempre el mismo día del mes (si el mes es más corto, el último día)"><input type="radio" name="mantenimiento_modo" value="mes" ${modoRepeticion === 'mes' ? 'checked' : ''} />
          el día
          <input type="number" name="mantenimiento_dia_mes" value="${diaFijo && diaFijo.tipo === 'mes' ? diaFijo.dia : 1}" min="1" max="31" style="width: 4rem" aria-label="Día del mes" />
          de cada mes
        </label>
        <label class="opcion-repeticion" title="Cae siempre en esos días de la semana"><input type="radio" name="mantenimiento_modo" value="semana" ${modoRepeticion === 'semana' ? 'checked' : ''} />
          todos los ${htmlDiasHabiles(diaFijo && diaFijo.tipo === 'semana' ? diaFijo.dias || [] : [], 'mantenimiento_dias_semana')}
        </label>
        <span class="ayuda">Si el día que sale no es uno de los «días hábiles» de arriba, pasa al próximo día hábil.</span>
      </span>
      <div class="campos-mantenimiento ancho-completo" ${t.tarea_mantenimiento ? '' : 'hidden'}>${htmlInterruptor('tarea_dia_obligatorio', t.tarea_dia_obligatorio, '📌 Día obligatorio', 'title="Esa repetición tiene que ser ese día: es también su fecha límite, no se pasa a otro día y se prioriza sobre las tareas sin fecha"')}</div>
      <span class="campos-mantenimiento ancho-completo" ${t.tarea_mantenimiento ? '' : 'hidden'}>
        <label class="campo" title="Después de esa fecha la tarea deja de repetirse (un hábito temporal)"><span class="campo-titulo">⏳ Repetir hasta (fecha)</span><input type="date" name="tarea_repetir_hasta" value="${escaparHtml(t.tarea_repetir_hasta || '')}" /></label>
        <label class="campo" title="Deja de repetirse cuando esa tarea se cumple o llega su fecha límite (por ejemplo una fecha de entrega)"><span class="campo-titulo">🎯 …o hasta que se cumpla o venza esta tarea</span><select name="tarea_repetir_hasta_tarea">${htmlOpcionesRepetirHastaTarea(tarea, t.tarea_repetir_hasta_tarea || '')}</select></label>
      </span>
      <span class="campos-mantenimiento ancho-completo" ${t.tarea_mantenimiento ? '' : 'hidden'}>
        <label class="campo" title="Cierra un anillo: al cumplir esta tarea, su copia queda bloqueada por esa otra tarea"><span class="campo-titulo">⚡ Se activa cuando se cumple (desencadenante)</span>
          <input type="search" class="filtro-enlace" data-filtro-de="tarea_desencadenante" placeholder="🔎 Filtrar por nombre o categoría" aria-label="Filtrar las tareas de la lista" autocomplete="off" />
          <select name="tarea_desencadenante" ${puedeTenerDesencadenante ? '' : 'disabled'}>
            <option value="">Ninguna</option>
            ${estado.tareas
              .filter((x) => x.tarea_id !== t.tarea_id && (x.tarea_estado !== 'completada' || x.tarea_id === t.tarea_desencadenante))
              .map((x) => `<option value="${x.tarea_id}" ${x.tarea_id === t.tarea_desencadenante ? 'selected' : ''}>${escaparHtml(nombreConCategoria(x))}</option>`)
              .join('')}
          </select>
        </label>
        ${puedeTenerDesencadenante ? '' : '<span class="ayuda">Esta tarea ya depende de otra: quitá la tarea previa para usar un desencadenante.</span>'}
      </span>
      <fieldset class="campos-mantenimiento checklist-editor ancho-completo" ${t.tarea_mantenimiento ? '' : 'hidden'}>
        <legend>☑️ Checklist (pasos de la tarea)</legend>
        <ul class="lista-checklist-editor">${checklist.map((item) => htmlItemChecklist(item)).join('')}</ul>
        <button title="Agregar un paso al checklist" type="button" data-accion="agregar-item-checklist">➕ Agregar paso</button>
      </fieldset>
    </fieldset>
    ${botonesPie}
  `;
}

/**
 * Interruptor "Completada" de la ventana de edición. Deshabilitado si la tarea está bloqueada (primero hay
 * que completar su previa). Si es de mantenimiento, al activarlo se pide la nota de mejora (opcional).
 */
function htmlEstadoCompletada(tarea) {
  const bloqueada = tarea.tarea_estado === 'bloqueada';
  return `
    <div class="fila-estado-tarea">
      ${htmlInterruptor('estado_completada', tarea.tarea_estado === 'completada', '✅ Completada', bloqueada ? 'disabled' : '')}
      ${bloqueada ? '<span class="ayuda">Bloqueada por otra tarea: completá primero la previa.</span>' : ''}
      <label class="campo" data-nota-mejora hidden><span class="campo-titulo">💡 ¿Qué podrías mejorar la próxima vez? (opcional)</span>
        <input type="text" name="nota_mejora" />
      </label>
    </div>`;
}

/**
 * Conecta el comportamiento del formulario: mostrar/ocultar lo de mantenimiento,
 * agregar/quitar pasos del checklist y (solo en el alta) precargar los demás
 * campos cuando el nombre coincide exacto con una tarea ya cargada.
 */
/**
 * Alta de tarea (v0.100.0): resalta (clase `campo-completado`) cada campo que el usuario ya completó o cambió respecto de
 * como abrió el formulario — lo precargado (Duplicar, Crearle previa/posterior) o el valor por defecto no cuentan.
 */
function resaltarCamposCompletados(formulario) {
  const controles = [...formulario.querySelectorAll('.campo input:not([type="hidden"]), .campo select, .campo textarea')];
  const inicial = new Map(controles.map((c) => [c, c.type === 'checkbox' ? c.checked : c.value]));
  const actualizar = () => {
    formulario.querySelectorAll('.campo').forEach((campo) => {
      const cambiado = controles.some((c) => campo.contains(c) && (c.type === 'checkbox' ? c.checked : c.value) !== inicial.get(c));
      campo.classList.toggle('campo-completado', cambiado);
    });
  };
  formulario.addEventListener('input', actualizar);
  formulario.addEventListener('change', actualizar);
  formulario.addEventListener('reset', () => setTimeout(actualizar, 0));
}

export function conectarFormularioTarea(formulario, { modo = 'edicion', precargaPorNombre = true } = {}) {
  if (modo === 'alta') resaltarCamposCompletados(formulario);
  formulario.querySelectorAll('.filtro-enlace').forEach((campo) => conectarFiltroDeEnlaces(formulario.querySelector(`[name="${campo.dataset.filtroDe}"]`), campo));
  const campos = formulario.querySelectorAll('.campos-mantenimiento');
  const checkbox = formulario.tarea_mantenimiento;
  checkbox.addEventListener('change', () => campos.forEach((c) => (c.hidden = !checkbox.checked)));

  // Interruptor "Completada" (solo en la edición): en una tarea de mantenimiento que todavía no estaba completa,
  // al activarlo aparece la nota de mejora.
  const interruptorEstado = formulario.estado_completada;
  if (interruptorEstado) {
    const notaMejora = formulario.querySelector('[data-nota-mejora]');
    const estabaCompletada = interruptorEstado.defaultChecked;
    const actualizarNota = () => {
      notaMejora.hidden = !(interruptorEstado.checked && !estabaCompletada && checkbox.checked);
    };
    interruptorEstado.addEventListener('change', actualizarNota);
    checkbox.addEventListener('change', actualizarNota);
  }

  // "＋ Crear nueva…" en categoría, ubicación, meta y persona: ver `conectarCrearNueva`.
  [
    ['categoria_id', htmlOpcionesCategoria, abrirDialogoCategoria, (n) => n.categoria_id],
    ['ubicacion_id', htmlOpcionesUbicacion, abrirDialogoUbicacion, (n) => n.ubicacion_id],
    ['meta_id', htmlOpcionesMeta, abrirDialogoMeta, (n) => n.meta_id],
    ['persona_id', htmlOpcionesPersona, abrirDialogoPersona, (n) => n.persona_id],
  ].forEach(([nombre, htmlOpciones, abrirDialogo, extraerId]) => {
    conectarCrearNueva(formulario[nombre], htmlOpciones, abrirDialogo, extraerId);
  });

  // La primera letra del nombre se escribe siempre en mayúscula (sin mover el cursor).
  activarMayusculaInicial(formulario.tarea_nombre);

  const lista = formulario.querySelector('.lista-checklist-editor');
  const agregarItem = () => {
    lista.insertAdjacentHTML('beforeend', htmlItemChecklist());
    const campo = lista.lastElementChild.querySelector('[name="checklist_texto"]');
    campo.focus();
  };
  formulario.querySelector('[data-accion="agregar-item-checklist"]').addEventListener('click', agregarItem);
  lista.addEventListener('click', (evento) => {
    const quitar = evento.target.closest('[data-accion="quitar-item-checklist"]');
    if (quitar) quitar.closest('li').remove();
  });
  lista.addEventListener('keydown', (evento) => {
    if (evento.key !== 'Enter' || evento.target.name !== 'checklist_texto') return;
    evento.preventDefault(); // Enter en un paso agrega otro, no envía el formulario
    agregarItem();
  });

  if (modo !== 'alta' || !precargaPorNombre) return;

  // Al escribir un nombre que ya existe se precargan sus datos como sugerencia, pero **nunca se pisa
  // lo que el usuario ya cargó**: solo se completan los campos que siguen como estaban (o que la
  // propia precarga había completado antes, por si cambia a otro nombre).
  const precargados = new WeakMap();
  const sinTocar = (campo) => {
    if (precargados.has(campo) && precargados.get(campo) === (campo.type === 'checkbox' || campo.type === 'radio' ? campo.checked : campo.value)) return true;
    if (campo.type === 'checkbox' || campo.type === 'radio') return campo.checked === campo.defaultChecked;
    if (campo.tagName === 'SELECT') {
      const porDefecto = Array.from(campo.options).findIndex((o) => o.defaultSelected);
      return campo.selectedIndex === (porDefecto === -1 ? 0 : porDefecto);
    }
    return campo.value === campo.defaultValue;
  };
  const precargar = (campo, valor) => {
    if (!campo || !sinTocar(campo)) return false;
    if (campo.type === 'checkbox' || campo.type === 'radio') campo.checked = !!valor;
    else campo.value = valor;
    precargados.set(campo, campo.type === 'checkbox' || campo.type === 'radio' ? campo.checked : campo.value);
    return true;
  };

  formulario.tarea_nombre.addEventListener('input', () => {
    const coincidencia = tareasUnicasPorNombre().find(
      (t) => t.tarea_nombre.trim().toLowerCase() === formulario.tarea_nombre.value.trim().toLowerCase()
    );
    if (!coincidencia) return;
    precargar(formulario.categoria_id, coincidencia.categoria_id || '');
    precargar(formulario.tarea_duracion_min, coincidencia.tarea_duracion_min || 15);
    precargar(formulario.tarea_costo_estimado, coincidencia.tarea_costo_estimado || '');
    precargar(formulario.tarea_descripcion, coincidencia.tarea_descripcion || '');
    if (precargar(checkbox, !!coincidencia.tarea_mantenimiento)) campos.forEach((c) => (c.hidden = !coincidencia.tarea_mantenimiento));
    if (coincidencia.tarea_mantenimiento_intervalo) {
      precargar(formulario.mantenimiento_cantidad, coincidencia.tarea_mantenimiento_intervalo.cantidad);
      precargar(formulario.mantenimiento_unidad, coincidencia.tarea_mantenimiento_intervalo.unidad);
    }
    const fijo = coincidencia.tarea_mantenimiento_dia_fijo;
    if (fijo) {
      formulario.querySelectorAll('input[name="mantenimiento_modo"]').forEach((r) => precargar(r, r.value === fijo.tipo));
      if (fijo.tipo === 'mes') precargar(formulario.mantenimiento_dia_mes, fijo.dia);
      formulario.querySelectorAll('input[name="mantenimiento_dias_semana"]').forEach((c) => precargar(c, (fijo.dias || []).includes(Number(c.value))));
    }
    precargar(formulario.tarea_dia_obligatorio, !!coincidencia.tarea_dia_obligatorio);
    precargar(formulario.tarea_urgente, !!coincidencia.tarea_urgente);
    precargar(formulario.tarea_disfrute, coincidencia.tarea_disfrute ?? '');
    const diasSeleccionados = coincidencia.tarea_dias_habiles || [];
    formulario.querySelectorAll('input[name="tarea_dias_habiles"]').forEach((c) => precargar(c, diasSeleccionados.includes(Number(c.value))));
    precargar(formulario.ubicacion_id, coincidencia.ubicacion_id || '');
    precargar(formulario.tarea_requiere_clima_bueno, !!coincidencia.tarea_requiere_clima_bueno);
  });
}

/** Valor de un desplegable de referencia: vacío o "Crear nueva…" (sin resolver) significan "sin valor". */
function valorSeleccion(valor) {
  return !valor || valor === CREAR_NUEVA ? null : valor;
}

/**
 * Lee el formulario: `campos` (para `crearTarea` o `aplicarCamposATarea`) y los
 * enlaces pedidos (`previaId`/`proximaId`, `null` = sin enlace). Si el
 * desencadenante no se puede editar (deshabilitado), `tarea_desencadenante`
 * queda `undefined` = no tocar.
 */
export function leerFormularioTarea(formulario) {
  const datos = new FormData(formulario);
  const esMantenimiento = datos.get('tarea_mantenimiento') === 'on';
  const modoRepeticion = datos.get('mantenimiento_modo') || 'intervalo';
  const selectDesencadenante = formulario.tarea_desencadenante;

  const checklist = [];
  formulario.querySelectorAll('.item-checklist-editor').forEach((fila) => {
    const texto = fila.querySelector('[name="checklist_texto"]').value.trim();
    if (texto) checklist.push({ texto, hecho: fila.querySelector('[name="checklist_hecho"]').checked });
  });

  return {
    campos: {
      tarea_nombre: capitalizarPrimera(String(datos.get('tarea_nombre') || '').trim()),
      categoria_id: valorSeleccion(datos.get('categoria_id')),
      tarea_urgente: datos.get('tarea_urgente') === 'on',
      tarea_disfrute: datos.get('tarea_disfrute') ? Number(datos.get('tarea_disfrute')) : null,
      tarea_fecha_inicio_habilitada: combinarCampoFechaHora(datos, 'tarea_fecha_inicio_habilitada'),
      tarea_fecha_sugerida: limitarFechaSugeridaALimite(combinarCampoFechaHora(datos, 'tarea_fecha_sugerida'), combinarCampoFechaHora(datos, 'tarea_fecha_limite')),
      tarea_fecha_limite: combinarCampoFechaHora(datos, 'tarea_fecha_limite'),
      tarea_duracion_min: Number(datos.get('tarea_duracion_min')) || 15,
      tarea_costo_estimado: Number(datos.get('tarea_costo_estimado')) || 0,
      tarea_descripcion: String(datos.get('tarea_descripcion') || '').trim(),
      ubicacion_id: valorSeleccion(datos.get('ubicacion_id')),
      meta_id: valorSeleccion(datos.get('meta_id')),
      persona_id: valorSeleccion(datos.get('persona_id')),
      tarea_requiere_clima_bueno: datos.get('tarea_requiere_clima_bueno') === 'on',
      tarea_mantenimiento: esMantenimiento,
      tarea_mantenimiento_intervalo:
        esMantenimiento && modoRepeticion === 'intervalo'
          ? { cantidad: Number(datos.get('mantenimiento_cantidad')) || 1, unidad: datos.get('mantenimiento_unidad') }
          : null,
      tarea_mantenimiento_dia_fijo:
        esMantenimiento && modoRepeticion === 'mes'
          ? { tipo: 'mes', dia: Math.min(31, Math.max(1, Math.round(Number(datos.get('mantenimiento_dia_mes'))) || 1)) }
          : esMantenimiento && modoRepeticion === 'semana'
            ? { tipo: 'semana', dias: datos.getAll('mantenimiento_dias_semana').map(Number) }
            : null,
      tarea_dia_obligatorio: esMantenimiento && datos.get('tarea_dia_obligatorio') === 'on',
      tarea_dias_habiles: datos.getAll('tarea_dias_habiles').map(Number),
      tarea_checklist: esMantenimiento ? checklist : [],
      tarea_repetir_hasta: esMantenimiento ? String(datos.get('tarea_repetir_hasta') || '') : '',
      tarea_repetir_hasta_tarea: esMantenimiento ? datos.get('tarea_repetir_hasta_tarea') || null : null,
      tarea_desencadenante: !esMantenimiento ? null : selectDesencadenante && !selectDesencadenante.disabled ? datos.get('tarea_desencadenante') || null : undefined,
    },
    previaId: datos.get('tarea_previa') || null,
    proximaId: datos.get('tarea_proxima') || null,
    // Solo existen en la edición: `null` = el formulario no trae el interruptor de estado (o está deshabilitado).
    completada: formulario.estado_completada && !formulario.estado_completada.disabled ? datos.get('estado_completada') === 'on' : null,
    notaMejora: String(datos.get('nota_mejora') || '').trim(),
  };
}

/** Vacía el formulario de tarea (campos, mantenimiento y checklist) y deja el cursor en el nombre. */
export function vaciarFormularioTarea(formulario) {
  formulario.reset();
  formulario.querySelectorAll('.item-checklist-editor').forEach((fila) => fila.remove());
  formulario.tarea_mantenimiento.dispatchEvent(new Event('change'));
  formulario.tarea_nombre.focus();
}

/** Aplica los `campos` leídos del formulario a una tarea existente (sin tocar sus enlaces). */
export function aplicarCamposATarea(tarea, campos) {
  Object.entries(campos).forEach(([clave, valor]) => {
    if (valor !== undefined) tarea[clave] = valor;
  });
}

/**
 * Valida lo que el formulario pide antes de cambiar nada: que un desencadenante
 * no se combine con una tarea previa y, si la tarea ya existe, que los enlaces
 * sean posibles (regla 1 a 1). Devuelve `{ ok: true }` o `{ ok: false, motivo }`.
 */
export function validarFormularioTarea(leido, tareaId = null) {
  const { campos, previaId, proximaId } = leido;
  const desencadenante = campos.tarea_desencadenante;
  if (desencadenante && previaId && (!tareaId || previaId !== estado.tareas.find((t) => t.tarea_id === tareaId)?.tarea_dependiente)) {
    return { ok: false, motivo: 'Una tarea con desencadenante no puede tener también una tarea previa. Elegí una de las dos.' };
  }
  const fijo = campos.tarea_mantenimiento_dia_fijo;
  if (fijo && fijo.tipo === 'semana' && fijo.dias.length === 0) {
    return { ok: false, motivo: 'Elegí al menos un día de la semana para la repetición (o cambiá a «cada N días»).' };
  }
  if (tareaId) return evaluarEnlace(tareaId, { previaId, proximaId }, estado.tareas);
  return { ok: true };
}

/**
 * Para que un anillo de mantenimiento se sostenga, todas las tareas de su cadena
 * deben ser de mantenimiento. Si la tarea tiene desencadenante y la cadena tiene
 * tareas que no lo son, avisa cuáles y ofrece marcarlas con el mismo intervalo.
 * Nada cambia sin confirmar; si se rechaza, la tarea se guarda igual. Muta las
 * tareas (quien llama persiste). Devuelve las tareas marcadas.
 */
export async function ofrecerMarcarCadenaMantenimiento(tarea, listaTareas) {
  const faltantes = tareasDeLaCadenaNoRepetibles(tarea, listaTareas);
  if (faltantes.length === 0) return [];
  const intervalo = tarea.tarea_mantenimiento_dia_fijo ? null : tarea.tarea_mantenimiento_intervalo || { cantidad: 1, unidad: 'dias' };
  const diaFijo = tarea.tarea_mantenimiento_dia_fijo ? structuredClone(tarea.tarea_mantenimiento_dia_fijo) : null;
  const texto = textoRepeticion({ tarea_mantenimiento_intervalo: intervalo, tarea_mantenimiento_dia_fijo: diaFijo });
  const quiere = await confirmar(
    `Para que la cadena de «${tarea.tarea_nombre}» se repita entera, estas tareas también deben ser con repetición: ${faltantes.map((t) => `«${t.tarea_nombre}»`).join(', ')}.\n\n¿Marcarlas como tareas con repetición (${texto})? Después podés ajustar el intervalo de cada una.`
  );
  if (!quiere) return [];
  faltantes.forEach((t) => {
    t.tarea_mantenimiento = true;
    t.tarea_mantenimiento_intervalo = intervalo ? { ...intervalo } : null;
    t.tarea_mantenimiento_dia_fijo = diaFijo ? structuredClone(diaFijo) : null;
  });
  return faltantes;
}
