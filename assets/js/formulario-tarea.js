// Formulario de tarea compartido por el alta (vista Tareas), la ventana modal de
// edición y "Completar carga de tareas": un solo lugar para armar los campos,
// leerlos y validarlos, en lugar de tres copias.

import { estado } from './almacenamiento.js';
import {
  UNIDADES_MANTENIMIENTO,
  ETIQUETAS_UNIDAD_MANTENIMIENTO,
  NIVELES_IMPORTANCIA,
  ETIQUETAS_IMPORTANCIA,
  ICONOS_IMPORTANCIA,
} from './modelos.js';
import { escaparHtml, arbolCategorias, caminoCategoria, tieneHora, combinarFechaYHora, capitalizarPrimera, fechaLocalISO, formatearHora } from './utilidades.js';
import { DIAS_SEMANA } from './reprogramar.js';
import { opcionesPrevia, opcionesProxima, evaluarEnlace, tareasDeLaCadenaNoRepetibles } from './dependencias.js';
import { abrirDialogoCategoria, abrirDialogoUbicacion, abrirDialogoMeta } from './formularios-entidades.js';

import { activarMayusculaInicial } from './dialogo-formulario.js';

export { firmaFormulario } from './dialogo-formulario.js';

/** Valor de la opción "＋ Crear nueva…" de los desplegables de categoría, ubicación y meta. */
const CREAR_NUEVA = '__nueva__';

export function htmlOpcionesImportancia(seleccionada = '') {
  const opciones = [`<option value="" ${!seleccionada ? 'selected' : ''}>Sin definir</option>`];
  NIVELES_IMPORTANCIA.forEach((nivel) => {
    opciones.push(
      `<option value="${nivel}" ${nivel === seleccionada ? 'selected' : ''}>${ICONOS_IMPORTANCIA[nivel]} ${ETIQUETAS_IMPORTANCIA[nivel]}</option>`
    );
  });
  return opciones.join('');
}

export function htmlOpcionesDisfrute(seleccionado = null) {
  const opciones = [`<option value="" ${seleccionado == null ? 'selected' : ''}>Sin definir</option>`];
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

/**
 * Días hábiles como fichas redondas (L M X J V S D, la semana empieza el lunes). Siguen siendo casillas
 * con el mismo `name` y `value` (índice del día: 0 = domingo), pero se ven y se tocan como botones.
 */
export function htmlDiasHabiles(seleccionados = []) {
  const letras = { 1: 'L', 2: 'M', 3: 'X', 4: 'J', 5: 'V', 6: 'S', 0: 'D' };
  return `<span class="chips-dias">${[1, 2, 3, 4, 5, 6, 0]
    .map(
      (indice) => `
      <label class="chip-dia" title="${DIAS_SEMANA[indice]}">
        <input type="checkbox" name="tarea_dias_habiles" value="${indice}" ${seleccionados.includes(indice) ? 'checked' : ''} aria-label="${DIAS_SEMANA[indice]}" />
        <span aria-hidden="true">${letras[indice]}</span>
      </label>`
    )
    .join('')}</span>`;
}

/**
 * Interruptor Sí/No para lo que activa algo (en lugar de una casilla). Sigue siendo un
 * `<input type="checkbox">` con el `name` dado, así que se lee y se restaura igual que antes.
 */
export function htmlInterruptor(nombre, marcado, texto, atributos = '') {
  return `<label class="interruptor"><input type="checkbox" role="switch" name="${nombre}" ${marcado ? 'checked' : ''} ${atributos} /><span class="interruptor-pista" aria-hidden="true"></span><span class="interruptor-texto">${texto}</span><span class="interruptor-estado" aria-hidden="true"></span></label>`;
}

export function partesFechaHora(valorISO) {
  if (!valorISO) return { fecha: '', hora: '' };
  if (!tieneHora(valorISO)) return { fecha: valorISO, hora: '' };
  return { fecha: fechaLocalISO(new Date(valorISO)), hora: formatearHora(valorISO) };
}

function htmlParFechaHora(nombreCampo, valorISO, etiqueta) {
  const { fecha, hora } = partesFechaHora(valorISO);
  return `
    <label class="campo"><span class="campo-titulo">${etiqueta}</span>
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
  return categoria ? `${tarea.tarea_nombre} · ${caminoCategoria(categoria, estado.categorias)}` : tarea.tarea_nombre;
}

function htmlItemChecklist(item = { texto: '', hecho: false }) {
  return `
    <li class="item-checklist-editor">
      <input type="checkbox" name="checklist_hecho" ${item.hecho ? 'checked' : ''} title="Hecho" />
      <input type="text" name="checklist_texto" value="${escaparHtml(item.texto)}" placeholder="Paso..." />
      <button type="button" data-accion="quitar-item-checklist" title="Quitar este paso" aria-label="Quitar este paso">✕</button>
    </li>`;
}

function htmlSelectEnlace(nombre, etiqueta, opciones, actual, textoOcupada, sinValor) {
  // La tarea actualmente enlazada siempre debe figurar, aunque ya esté completada.
  const lista = actual && !opciones.some((o) => o.tarea.tarea_id === actual.tarea_id) ? [{ tarea: actual, ocupadaPor: null }, ...opciones] : opciones;
  return `
    <label class="campo ancho-completo"><span class="campo-titulo">${etiqueta}</span>
      <select name="${nombre}">
        <option value="">${sinValor}</option>
        ${lista
          .map(
            (o) =>
              `<option value="${o.tarea.tarea_id}" ${actual && o.tarea.tarea_id === actual.tarea_id ? 'selected' : ''}>${escaparHtml(nombreConCategoria(o.tarea))}${
                o.ocupadaPor ? ` (${textoOcupada} «${escaparHtml(nombreConCategoria(o.ocupadaPor))}»: se inserta en medio)` : ''
              }${o.tarea.tarea_estado === 'completada' ? ' (completada)' : ''}</option>`
          )
          .join('')}
      </select>
    </label>`;
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

  return `
    <div class="fila-nombre-tarea">
      <input type="text" name="tarea_nombre" value="${escaparHtml(t.tarea_nombre || '')}" placeholder="${enAlta ? '📝 Nueva tarea (Enter para agregar)' : '📝 Nombre de la tarea'}" aria-label="Nombre de la tarea" required ${enAlta ? 'list="lista-sugerencias-tareas" autocomplete="off"' : ''} />
      ${enAlta ? `<datalist id="lista-sugerencias-tareas">${tareasUnicasPorNombre().map((x) => `<option value="${escaparHtml(x.tarea_nombre)}"></option>`).join('')}</datalist>` : ''}
      ${botonesNombre}
    </div>
    ${modo === 'edicion' && tarea ? htmlEstadoCompletada(tarea) : ''}

    <fieldset class="seccion-form">
      <legend>📝 Qué</legend>
      <label class="campo ancho-completo"><span class="campo-titulo">🗒️ Descripción, notas o links</span>
        <input type="text" name="tarea_descripcion" placeholder="Opcional" value="${escaparHtml(t.tarea_descripcion || '')}" />
      </label>
      <label class="campo"><span class="campo-titulo">🗂️ Categoría</span><select name="categoria_id">${htmlOpcionesCategoria(t.categoria_id || '')}</select></label>
      <label class="campo"><span class="campo-titulo">❗ Importancia</span><select name="tarea_importancia">${htmlOpcionesImportancia(t.tarea_importancia || '')}</select></label>
      <label class="campo"><span class="campo-titulo">⭐ Disfrute</span><select name="tarea_disfrute">${htmlOpcionesDisfrute(t.tarea_disfrute ?? null)}</select></label>
      <label class="campo"><span class="campo-titulo">🏁 Meta</span><select name="meta_id">${htmlOpcionesMeta(t.meta_id || '')}</select></label>
    </fieldset>

    <fieldset class="seccion-form">
      <legend>📅 Cuándo</legend>
      ${htmlParFechaHora('tarea_fecha_inicio_habilitada', enAlta ? '' : t.tarea_fecha_inicio_habilitada, '🚦 Habilitada desde')}
      ${htmlParFechaHora('tarea_fecha_sugerida', t.tarea_fecha_sugerida, '📅 Sugerida')}
      ${htmlParFechaHora('tarea_fecha_limite', t.tarea_fecha_limite, '⏳ Límite')}
      <label class="campo"><span class="campo-titulo">⏱️ Duración (minutos)</span><input type="number" name="tarea_duracion_min" value="${t.tarea_duracion_min || 15}" min="0" step="15" /></label>
      <div class="campo ancho-completo"><span class="campo-titulo">🗓️ Días hábiles (sin marcar = cualquier día)</span>${htmlDiasHabiles(t.tarea_dias_habiles || [])}</div>
    </fieldset>

    <fieldset class="seccion-form">
      <legend>📍 Dónde y costo</legend>
      <label class="campo"><span class="campo-titulo">📍 Ubicación</span><select name="ubicacion_id">${htmlOpcionesUbicacion(t.ubicacion_id || '')}</select></label>
      <label class="campo"><span class="campo-titulo">💰 Costo estimado ($)</span><input type="number" name="tarea_costo_estimado" min="0" placeholder="Opcional" value="${t.tarea_costo_estimado || ''}" /></label>
      <div class="ancho-completo">${htmlInterruptor('tarea_requiere_clima_bueno', t.tarea_requiere_clima_bueno, '🌦️ Requiere buen tiempo (sin lluvia)')}</div>
    </fieldset>

    <fieldset class="seccion-form">
      <legend>🔗 Enlaces</legend>
      ${htmlSelectEnlace('tarea_previa', '⬅️ Depende de (tarea previa)', opcionesPrevia(referencia, estado.tareas), previaActual, 'ya bloquea a', 'Sin tarea previa')}
      ${htmlSelectEnlace('tarea_proxima', '➡️ Bloquea a (tarea próxima)', opcionesProxima(referencia, estado.tareas), proximaActual, 'ya depende de', 'Sin tarea próxima')}
    </fieldset>

    <fieldset class="seccion-form">
      <legend>🔁 Repetición</legend>
      <div class="ancho-completo">${htmlInterruptor('tarea_mantenimiento', t.tarea_mantenimiento, '🔁 Es tarea de mantenimiento (se renueva sola)')}</div>
      <span class="campos-mantenimiento ancho-completo" ${t.tarea_mantenimiento ? '' : 'hidden'}>
        cada
        <input type="number" name="mantenimiento_cantidad" value="${intervalo ? intervalo.cantidad : 1}" min="1" style="width: 4.5rem" aria-label="Cantidad" />
        <select name="mantenimiento_unidad" aria-label="Unidad">
          ${UNIDADES_MANTENIMIENTO.map((u) => `<option value="${u}" ${intervalo && intervalo.unidad === u ? 'selected' : ''}>${ETIQUETAS_UNIDAD_MANTENIMIENTO[u]}</option>`).join('')}
        </select>
      </span>
      <span class="campos-mantenimiento ancho-completo" ${t.tarea_mantenimiento ? '' : 'hidden'}>
        <label class="campo"><span class="campo-titulo">⚡ Se activa cuando se cumple (desencadenante)</span>
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
        <button type="button" data-accion="agregar-item-checklist">➕ Agregar paso</button>
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
export function conectarFormularioTarea(formulario, { modo = 'edicion' } = {}) {
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

  // "＋ Crear nueva…" en categoría, ubicación y meta: abre el diálogo de esa entidad y, al guardarla,
  // reconstruye el desplegable con la nueva ya seleccionada.
  [
    ['categoria_id', htmlOpcionesCategoria, abrirDialogoCategoria],
    ['ubicacion_id', htmlOpcionesUbicacion, abrirDialogoUbicacion],
    ['meta_id', htmlOpcionesMeta, abrirDialogoMeta],
  ].forEach(([nombre, htmlOpciones, abrirDialogo]) => {
    const select = formulario[nombre];
    select.dataset.previo = select.value;
    select.addEventListener('focus', () => {
      if (select.value !== CREAR_NUEVA) select.dataset.previo = select.value;
    });
    select.addEventListener('change', () => {
      if (select.value !== CREAR_NUEVA) {
        select.dataset.previo = select.value;
        return;
      }
      // Se vuelve al valor anterior: así un borrador nunca guarda "Crear nueva…".
      select.value = select.dataset.previo || '';
      abrirDialogo({
        alCrear: (nueva) => {
          const id = nueva.categoria_id || nueva.ubicacion_id || nueva.meta_id;
          // Se selecciona por propiedad (no por el atributo `selected`): así cuenta como un cambio del usuario y el
          // borrador del alta lo conserva cuando la vista se redibuja al guardar la entidad.
          select.innerHTML = htmlOpciones('');
          select.value = id;
          select.dataset.previo = id;
        },
      });
    });
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

  if (modo !== 'alta') return;

  // Al escribir un nombre que ya existe se precargan sus datos como sugerencia, pero **nunca se pisa
  // lo que el usuario ya cargó**: solo se completan los campos que siguen como estaban (o que la
  // propia precarga había completado antes, por si cambia a otro nombre).
  const precargados = new WeakMap();
  const sinTocar = (campo) => {
    if (precargados.has(campo) && precargados.get(campo) === (campo.type === 'checkbox' ? campo.checked : campo.value)) return true;
    if (campo.type === 'checkbox') return campo.checked === campo.defaultChecked;
    if (campo.tagName === 'SELECT') {
      const porDefecto = Array.from(campo.options).findIndex((o) => o.defaultSelected);
      return campo.selectedIndex === (porDefecto === -1 ? 0 : porDefecto);
    }
    return campo.value === campo.defaultValue;
  };
  const precargar = (campo, valor) => {
    if (!campo || !sinTocar(campo)) return false;
    if (campo.type === 'checkbox') campo.checked = !!valor;
    else campo.value = valor;
    precargados.set(campo, campo.type === 'checkbox' ? campo.checked : campo.value);
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
    precargar(formulario.tarea_importancia, coincidencia.tarea_importancia || '');
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
      tarea_importancia: datos.get('tarea_importancia') || null,
      tarea_disfrute: datos.get('tarea_disfrute') ? Number(datos.get('tarea_disfrute')) : null,
      tarea_fecha_inicio_habilitada: combinarCampoFechaHora(datos, 'tarea_fecha_inicio_habilitada'),
      tarea_fecha_sugerida: combinarCampoFechaHora(datos, 'tarea_fecha_sugerida'),
      tarea_fecha_limite: combinarCampoFechaHora(datos, 'tarea_fecha_limite'),
      tarea_duracion_min: Number(datos.get('tarea_duracion_min')) || 15,
      tarea_costo_estimado: Number(datos.get('tarea_costo_estimado')) || 0,
      tarea_descripcion: String(datos.get('tarea_descripcion') || '').trim(),
      ubicacion_id: valorSeleccion(datos.get('ubicacion_id')),
      meta_id: valorSeleccion(datos.get('meta_id')),
      tarea_requiere_clima_bueno: datos.get('tarea_requiere_clima_bueno') === 'on',
      tarea_mantenimiento: esMantenimiento,
      tarea_mantenimiento_intervalo: esMantenimiento
        ? { cantidad: Number(datos.get('mantenimiento_cantidad')) || 1, unidad: datos.get('mantenimiento_unidad') }
        : null,
      tarea_dias_habiles: datos.getAll('tarea_dias_habiles').map(Number),
      tarea_checklist: esMantenimiento ? checklist : [],
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
export function ofrecerMarcarCadenaMantenimiento(tarea, listaTareas) {
  const faltantes = tareasDeLaCadenaNoRepetibles(tarea, listaTareas);
  if (faltantes.length === 0) return [];
  const intervalo = tarea.tarea_mantenimiento_intervalo || { cantidad: 1, unidad: 'dias' };
  const texto = `cada ${intervalo.cantidad} ${ETIQUETAS_UNIDAD_MANTENIMIENTO[intervalo.unidad] || intervalo.unidad}`;
  const quiere = confirm(
    `Para que la cadena de «${tarea.tarea_nombre}» se repita entera, estas tareas también deben ser de mantenimiento: ${faltantes.map((t) => `«${t.tarea_nombre}»`).join(', ')}.\n\n¿Marcarlas como tareas de mantenimiento (${texto})? Después podés ajustar el intervalo de cada una.`
  );
  if (!quiere) return [];
  faltantes.forEach((t) => {
    t.tarea_mantenimiento = true;
    t.tarea_mantenimiento_intervalo = { ...intervalo };
  });
  return faltantes;
}
