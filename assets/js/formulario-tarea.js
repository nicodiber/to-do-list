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
import { escaparHtml, arbolCategorias, tieneHora, combinarFechaYHora } from './utilidades.js';
import { DIAS_SEMANA } from './reprogramar.js';
import { opcionesPrevia, opcionesProxima, evaluarEnlace } from './dependencias.js';

export function htmlOpcionesImportancia(seleccionada = '') {
  const opciones = [`<option value="" ${!seleccionada ? 'selected' : ''}>Importancia: sin definir</option>`];
  NIVELES_IMPORTANCIA.forEach((nivel) => {
    opciones.push(
      `<option value="${nivel}" ${nivel === seleccionada ? 'selected' : ''}>${ICONOS_IMPORTANCIA[nivel]} ${ETIQUETAS_IMPORTANCIA[nivel]}</option>`
    );
  });
  return opciones.join('');
}

export function htmlOpcionesDisfrute(seleccionado = null) {
  const opciones = [`<option value="" ${seleccionado == null ? 'selected' : ''}>Disfrute: sin definir</option>`];
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
  return opciones.join('');
}

export function htmlDiasHabiles(seleccionados = []) {
  return DIAS_SEMANA.map(
    (nombre, indice) => `
      <label class="dia-habil">
        <input type="checkbox" name="tarea_dias_habiles" value="${indice}" ${seleccionados.includes(indice) ? 'checked' : ''} />
        ${nombre.slice(0, 3)}
      </label>`
  ).join('');
}

export function partesFechaHora(valorISO) {
  if (!valorISO) return { fecha: '', hora: '' };
  if (!tieneHora(valorISO)) return { fecha: valorISO, hora: '' };
  const d = new Date(valorISO);
  const fecha = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const hora = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return { fecha, hora };
}

function htmlParFechaHora(nombreCampo, valorISO, etiqueta) {
  const { fecha, hora } = partesFechaHora(valorISO);
  return `
    <label>${etiqueta}
      <input type="date" name="${nombreCampo}_fecha" value="${fecha}" />
      <input type="time" name="${nombreCampo}_hora" value="${hora}" title="Hora (opcional)" />
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
    <label>${etiqueta}
      <select name="${nombre}">
        <option value="">${sinValor}</option>
        ${lista
          .map(
            (o) =>
              `<option value="${o.tarea.tarea_id}" ${actual && o.tarea.tarea_id === actual.tarea_id ? 'selected' : ''}>${escaparHtml(o.tarea.tarea_nombre)}${
                o.ocupadaPor ? ` (${textoOcupada} «${escaparHtml(o.ocupadaPor.tarea_nombre)}»: se inserta en medio)` : ''
              }${o.tarea.tarea_estado === 'completada' ? ' (completada)' : ''}</option>`
          )
          .join('')}
      </select>
    </label>`;
}

/**
 * Campos de una tarea (nombre arriba y el resto debajo, todos opcionales). Con
 * `tarea = null` arma el formulario vacío del alta. `botonesNombre` se agrega a
 * la fila del nombre (por ejemplo el botón "Agregar") y `botonesPie` al final.
 * Los botones los pone quien lo usa: acá solo están los campos.
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
      <input type="text" name="tarea_nombre" value="${escaparHtml(t.tarea_nombre || '')}" placeholder="${enAlta ? 'Nueva tarea (Enter para agregar)' : 'Nombre de la tarea'}" required ${enAlta ? 'list="lista-sugerencias-tareas" autocomplete="off"' : ''} />
      ${enAlta ? `<datalist id="lista-sugerencias-tareas">${tareasUnicasPorNombre().map((x) => `<option value="${escaparHtml(x.tarea_nombre)}"></option>`).join('')}</datalist>` : ''}
      ${botonesNombre}
    </div>
    <select name="categoria_id">${htmlOpcionesCategoria(t.categoria_id || '')}</select>
    <select name="tarea_importancia">${htmlOpcionesImportancia(t.tarea_importancia || '')}</select>
    <select name="tarea_disfrute">${htmlOpcionesDisfrute(t.tarea_disfrute ?? null)}</select>
    ${htmlParFechaHora('tarea_fecha_inicio_habilitada', enAlta ? '' : t.tarea_fecha_inicio_habilitada, 'Habilitada desde')}
    ${htmlParFechaHora('tarea_fecha_sugerida', t.tarea_fecha_sugerida, 'Sugerida')}
    ${htmlParFechaHora('tarea_fecha_limite', t.tarea_fecha_limite, 'Límite')}
    <label>Duración (min) <input type="number" name="tarea_duracion_min" value="${t.tarea_duracion_min || 15}" min="0" step="15" /></label>
    <input type="number" name="tarea_costo_estimado" min="0" placeholder="Costo estimado ($)" value="${t.tarea_costo_estimado || ''}" />
    <input type="text" name="tarea_descripcion" placeholder="Descripción / notas / links" value="${escaparHtml(t.tarea_descripcion || '')}" />
    <select name="ubicacion_id">
      <option value="">Sin ubicación</option>
      ${estado.ubicaciones.map((u) => `<option value="${u.ubicacion_id}" ${u.ubicacion_id === t.ubicacion_id ? 'selected' : ''}>${escaparHtml(u.ubicacion_nombre)}</option>`).join('')}
    </select>
    <select name="meta_id">
      <option value="">Sin meta</option>
      ${estado.metas.map((m) => `<option value="${m.meta_id}" ${m.meta_id === t.meta_id ? 'selected' : ''}>${escaparHtml(m.meta_nombre)}</option>`).join('')}
    </select>
    ${htmlSelectEnlace('tarea_previa', 'Depende de (tarea previa)', opcionesPrevia(referencia, estado.tareas), previaActual, 'ya bloquea a', 'Sin tarea previa')}
    ${htmlSelectEnlace('tarea_proxima', 'Bloquea a (tarea próxima)', opcionesProxima(referencia, estado.tareas), proximaActual, 'ya depende de', 'Sin tarea próxima')}
    <label class="opcion-mantenimiento">
      <input type="checkbox" name="tarea_requiere_clima_bueno" ${t.tarea_requiere_clima_bueno ? 'checked' : ''} />
      Requiere buen tiempo (sin lluvia)
    </label>
    <label class="opcion-mantenimiento">
      <input type="checkbox" name="tarea_mantenimiento" ${t.tarea_mantenimiento ? 'checked' : ''} />
      Es tarea de mantenimiento (se renueva sola)
    </label>
    <span class="campos-mantenimiento" ${t.tarea_mantenimiento ? '' : 'hidden'}>
      cada
      <input type="number" name="mantenimiento_cantidad" value="${intervalo ? intervalo.cantidad : 1}" min="1" style="width: 3.5rem" />
      <select name="mantenimiento_unidad">
        ${UNIDADES_MANTENIMIENTO.map((u) => `<option value="${u}" ${intervalo && intervalo.unidad === u ? 'selected' : ''}>${ETIQUETAS_UNIDAD_MANTENIMIENTO[u]}</option>`).join('')}
      </select>
    </span>
    <span class="campos-mantenimiento" ${t.tarea_mantenimiento ? '' : 'hidden'}>
      <label>Se activa cuando se cumple (desencadenante)
        <select name="tarea_desencadenante" ${puedeTenerDesencadenante ? '' : 'disabled'}>
          <option value="">Ninguna</option>
          ${estado.tareas
            .filter((x) => x.tarea_id !== t.tarea_id && (x.tarea_estado !== 'completada' || x.tarea_id === t.tarea_desencadenante))
            .map((x) => `<option value="${x.tarea_id}" ${x.tarea_id === t.tarea_desencadenante ? 'selected' : ''}>${escaparHtml(x.tarea_nombre)}</option>`)
            .join('')}
        </select>
      </label>
      ${puedeTenerDesencadenante ? '' : '<span class="ayuda">Esta tarea ya depende de otra: quitá la tarea previa para usar un desencadenante.</span>'}
    </span>
    <fieldset class="campos-mantenimiento checklist-editor" ${t.tarea_mantenimiento ? '' : 'hidden'}>
      <legend>Checklist (pasos de la tarea)</legend>
      <ul class="lista-checklist-editor">${checklist.map((item) => htmlItemChecklist(item)).join('')}</ul>
      <button type="button" data-accion="agregar-item-checklist">+ Agregar paso</button>
    </fieldset>
    <fieldset class="dias-habiles">
      <legend>Días hábiles (vacío = cualquier día)</legend>
      ${htmlDiasHabiles(t.tarea_dias_habiles || [])}
    </fieldset>
    ${botonesPie}
  `;
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
  formulario.tarea_nombre.addEventListener('input', () => {
    const coincidencia = tareasUnicasPorNombre().find(
      (t) => t.tarea_nombre.trim().toLowerCase() === formulario.tarea_nombre.value.trim().toLowerCase()
    );
    if (!coincidencia) return;
    formulario.categoria_id.value = coincidencia.categoria_id || '';
    formulario.tarea_duracion_min.value = coincidencia.tarea_duracion_min || 15;
    formulario.tarea_costo_estimado.value = coincidencia.tarea_costo_estimado || '';
    formulario.tarea_descripcion.value = coincidencia.tarea_descripcion || '';
    checkbox.checked = !!coincidencia.tarea_mantenimiento;
    campos.forEach((c) => (c.hidden = !coincidencia.tarea_mantenimiento));
    if (coincidencia.tarea_mantenimiento_intervalo) {
      formulario.mantenimiento_cantidad.value = coincidencia.tarea_mantenimiento_intervalo.cantidad;
      formulario.mantenimiento_unidad.value = coincidencia.tarea_mantenimiento_intervalo.unidad;
    }
    formulario.tarea_importancia.value = coincidencia.tarea_importancia || '';
    formulario.tarea_disfrute.value = coincidencia.tarea_disfrute ?? '';
    const diasSeleccionados = coincidencia.tarea_dias_habiles || [];
    formulario.querySelectorAll('input[name="tarea_dias_habiles"]').forEach((c) => {
      c.checked = diasSeleccionados.includes(Number(c.value));
    });
    formulario.ubicacion_id.value = coincidencia.ubicacion_id || '';
    formulario.tarea_requiere_clima_bueno.checked = !!coincidencia.tarea_requiere_clima_bueno;
  });
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
      tarea_nombre: String(datos.get('tarea_nombre') || '').trim(),
      categoria_id: datos.get('categoria_id') || null,
      tarea_importancia: datos.get('tarea_importancia') || null,
      tarea_disfrute: datos.get('tarea_disfrute') ? Number(datos.get('tarea_disfrute')) : null,
      tarea_fecha_inicio_habilitada: combinarCampoFechaHora(datos, 'tarea_fecha_inicio_habilitada'),
      tarea_fecha_sugerida: combinarCampoFechaHora(datos, 'tarea_fecha_sugerida'),
      tarea_fecha_limite: combinarCampoFechaHora(datos, 'tarea_fecha_limite'),
      tarea_duracion_min: Number(datos.get('tarea_duracion_min')) || 15,
      tarea_costo_estimado: Number(datos.get('tarea_costo_estimado')) || 0,
      tarea_descripcion: String(datos.get('tarea_descripcion') || '').trim(),
      ubicacion_id: datos.get('ubicacion_id') || null,
      meta_id: datos.get('meta_id') || null,
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
  };
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

/** Texto que identifica el contenido del formulario, para saber si el usuario cambió algo. */
export function firmaFormulario(formulario) {
  return JSON.stringify([...new FormData(formulario).entries()].map(([clave, valor]) => [clave, typeof valor === 'string' ? valor : '']));
}
