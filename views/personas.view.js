import { estado, persistirYNotificar } from '../assets/js/almacenamiento.js';
import { abrirDialogoPersona } from '../assets/js/formularios-entidades.js';
import { agregarBotonFlotante } from '../assets/js/boton-flotante.js';
import { escaparHtml, formatearFecha, hoyISO, diasEntreFechas, fechaISOMasDias } from '../assets/js/utilidades.js';
import { confirmar } from '../assets/js/avisos.js';

let modoSeleccion = false;
let seleccionadas = new Set();

function diasDesdeContacto(persona) {
  if (!persona.persona_ultimo_contacto) return Infinity;
  return diasEntreFechas(persona.persona_ultimo_contacto, hoyISO());
}

/** Meses de calendario reales entre `fechaISO` y hoy, más los días sueltos que quedan tras esos meses
 * completos (ej. de "31/01" a "01/03" son "1 mes y 1 día" — el mes de enero no llega a completarse dos veces). */
function mesesYDiasDesde(fechaISO) {
  const desde = new Date(`${fechaISO}T00:00:00`);
  const hoy = new Date(`${hoyISO()}T00:00:00`);
  let meses = (hoy.getFullYear() - desde.getFullYear()) * 12 + (hoy.getMonth() - desde.getMonth());
  if (hoy.getDate() < desde.getDate()) meses -= 1;
  if (meses < 0) meses = 0;
  const marcaMeses = new Date(desde.getFullYear(), desde.getMonth() + meses, desde.getDate());
  const dias = Math.round((hoy.getTime() - marcaMeses.getTime()) / 86400000);
  return { meses, dias };
}

/** Texto "Hace..." de cuánto pasó desde `fechaISO`, en meses de calendario reales cuando corresponde
 * (v0.91.0 — antes siempre en días: "Hace 45 días" pasa a "Hace 1 mes y 15 días"). */
function textoTiempoDesde(fechaISO) {
  const { meses, dias } = mesesYDiasDesde(fechaISO);
  if (meses === 0) return `Hace ${dias} día${dias === 1 ? '' : 's'}`;
  const partes = [`${meses} mes${meses === 1 ? '' : 'es'}`];
  if (dias > 0) partes.push(`${dias} día${dias === 1 ? '' : 's'}`);
  return `Hace ${partes.join(' y ')}`;
}

export function renderVistaPersonas(contenedor) {
  // Por si alguna seleccionada se eliminó mientras tanto.
  seleccionadas = new Set([...seleccionadas].filter((id) => estado.personas.some((p) => p.persona_id === id)));

  contenedor.innerHTML = `
    <h2 title="Hace cuánto no te reunís con cada persona, ordenado de mayor a menor tiempo — para no perder el contacto con quienes importan.">👥 Personas</h2>
    <div class="controles-personas">
      <button type="button" id="boton-modo-seleccion" class="${modoSeleccion ? 'activo' : ''}" aria-pressed="${modoSeleccion}">☑️ Seleccionar</button>
    </div>
    ${modoSeleccion ? htmlBarraSeleccion() : ''}
    <div id="lista-personas" class="lista-categorias"></div>
  `;

  agregarBotonFlotante(contenedor, { titulo: 'Agregar una persona', alClic: () => abrirDialogoPersona() });

  contenedor.querySelector('#boton-modo-seleccion').addEventListener('click', () => {
    modoSeleccion = !modoSeleccion;
    if (!modoSeleccion) seleccionadas.clear();
    renderVistaPersonas(contenedor);
  });

  if (modoSeleccion) conectarBarraSeleccion(contenedor);

  const listaPersonas = contenedor.querySelector('#lista-personas');
  if (estado.personas.length === 0) {
    listaPersonas.innerHTML = '<p class="mensaje-vacio">Todavía no agregaste ninguna persona.</p>';
    return;
  }

  // Agrupadas por etiqueta (v0.107.0): los grupos por nombre de etiqueta y «Sin etiqueta» al final; dentro de cada grupo,
  // de más tiempo sin contacto a menos (las fallecidas siempre al final del grupo).
  const porContacto = (a, b) => {
    if (!!a.persona_fallecida !== !!b.persona_fallecida) return a.persona_fallecida ? 1 : -1;
    return diasDesdeContacto(b) - diasDesdeContacto(a);
  };
  const etiquetas = [...(estado.etiquetas || [])].sort((a, b) => a.etiqueta_nombre.localeCompare(b.etiqueta_nombre, 'es'));
  const grupos = etiquetas.map((e) => ({ etiqueta: e, personas: estado.personas.filter((p) => p.persona_etiqueta_id === e.etiqueta_id) }));
  grupos.push({ etiqueta: null, personas: estado.personas.filter((p) => !p.persona_etiqueta_id || !etiquetas.some((e) => e.etiqueta_id === p.persona_etiqueta_id)) });
  grupos
    .filter((g) => g.personas.length > 0)
    .forEach((g) => {
      const titulo = document.createElement('h3');
      titulo.className = 'titulo-grupo-personas';
      titulo.innerHTML = g.etiqueta
        ? `<span class="punto-etiqueta" style="background:${escaparHtml(g.etiqueta.etiqueta_color)}"></span> ${escaparHtml(g.etiqueta.etiqueta_nombre)} (${g.personas.length})`
        : `Sin etiqueta (${g.personas.length})`;
      listaPersonas.appendChild(titulo);
      g.personas.sort(porContacto).forEach((persona) => listaPersonas.appendChild(renderPersona(persona, contenedor)));
    });
}

function htmlBarraSeleccion() {
  return `
    <div class="barra-seleccion">
      <span class="contador-seleccion">${seleccionadas.size} seleccionada${seleccionadas.size === 1 ? '' : 's'}</span>
      <input type="date" id="fecha-contacto-masiva" value="${hoyISO()}" max="${hoyISO()}" />
      <button type="button" data-atajo-fecha="hoy">Hoy</button>
      <button type="button" data-atajo-fecha="ayer">Ayer</button>
      <button type="button" id="aplicar-contacto-masivo" class="boton-primario" ${seleccionadas.size === 0 ? 'disabled' : ''}>✅ Aplicar a ${seleccionadas.size}</button>
      <button type="button" id="cancelar-seleccion-personas">Cancelar</button>
    </div>
  `;
}

/** Actualiza el contador y el botón "Aplicar" de la barra de selección sin rehacer toda la lista de
 * tarjetas — así tildar varias personas seguidas no pierde el scroll (mismo criterio que Tareas/Tabla). */
function actualizarBarraSeleccion(contenedor) {
  const barra = contenedor.querySelector('.barra-seleccion');
  if (!barra) return;
  barra.querySelector('.contador-seleccion').textContent = `${seleccionadas.size} seleccionada${seleccionadas.size === 1 ? '' : 's'}`;
  const boton = barra.querySelector('#aplicar-contacto-masivo');
  boton.disabled = seleccionadas.size === 0;
  boton.textContent = `✅ Aplicar a ${seleccionadas.size}`;
}

function conectarBarraSeleccion(contenedor) {
  const campoFecha = contenedor.querySelector('#fecha-contacto-masiva');
  contenedor.querySelector('[data-atajo-fecha="hoy"]').addEventListener('click', () => {
    campoFecha.value = hoyISO();
  });
  contenedor.querySelector('[data-atajo-fecha="ayer"]').addEventListener('click', () => {
    campoFecha.value = fechaISOMasDias(-1, hoyISO());
  });
  contenedor.querySelector('#cancelar-seleccion-personas').addEventListener('click', () => {
    modoSeleccion = false;
    seleccionadas.clear();
    renderVistaPersonas(contenedor);
  });
  contenedor.querySelector('#aplicar-contacto-masivo').addEventListener('click', async () => {
    const fecha = campoFecha.value;
    if (!fecha) return;
    estado.personas.forEach((p) => {
      if (seleccionadas.has(p.persona_id)) p.persona_ultimo_contacto = fecha;
    });
    modoSeleccion = false;
    seleccionadas.clear();
    await persistirYNotificar();
  });
}

function renderPersona(persona, contenedorVista) {
  const dias = diasDesdeContacto(persona);
  const etiqueta = persona.persona_etiqueta_id ? estado.etiquetas.find((e) => e.etiqueta_id === persona.persona_etiqueta_id) : null;

  const tarjeta = document.createElement('article');
  tarjeta.className = `tarjeta-categoria${persona.persona_fallecida ? ' fallecida' : ''}`;
  tarjeta.innerHTML = `
    <div class="encabezado-categoria">
      <strong>
        ${modoSeleccion ? `<input type="checkbox" data-seleccionar="${persona.persona_id}" ${seleccionadas.has(persona.persona_id) ? 'checked' : ''} />` : ''}
        ${persona.persona_fallecida ? '💀 ' : ''}${escaparHtml(persona.persona_nombre)}
      </strong>
      ${
        modoSeleccion
          ? ''
          : `<span class="acciones-prioridad">
              <button type="button" data-accion="editar-persona" title="Editar persona y último contacto">✏️ Editar</button>
              <button type="button" data-accion="eliminar-persona" title="Eliminar persona">🗑️</button>
            </span>`
      }
    </div>
    <span class="etiquetas">
      ${etiqueta ? `<span class="etiqueta" style="background:${etiqueta.etiqueta_color}">${escaparHtml(etiqueta.etiqueta_nombre)}</span>` : ''}
      <span class="etiqueta-fecha">
        ${dias === Infinity ? 'Todavía no registraste un contacto' : textoTiempoDesde(persona.persona_ultimo_contacto)}
      </span>
      ${persona.persona_ultimo_contacto ? `<span class="etiqueta-fecha">Último: ${formatearFecha(persona.persona_ultimo_contacto)}</span>` : ''}
      ${persona.persona_proximo_contacto ? `<span class="etiqueta-fecha">📅 Próximo: ${formatearFecha(persona.persona_proximo_contacto)}</span>` : ''}
    </span>
    ${modoSeleccion ? '' : '<button title="Anotar que hoy tuviste contacto con esta persona" type="button" data-accion="marcar-contacto" class="boton-primario">🤝 Marcar contacto hoy</button>'}
  `;

  if (modoSeleccion) {
    const casilla = tarjeta.querySelector('[data-seleccionar]');
    casilla.addEventListener('change', () => {
      if (casilla.checked) seleccionadas.add(persona.persona_id);
      else seleccionadas.delete(persona.persona_id);
      actualizarBarraSeleccion(contenedorVista);
    });
    tarjeta.addEventListener('click', (evento) => {
      if (evento.target.closest('button, a, input, select')) return;
      casilla.checked = !casilla.checked;
      casilla.dispatchEvent(new Event('change'));
    });
    return tarjeta;
  }

  tarjeta.querySelector('[data-accion="editar-persona"]').addEventListener('click', () => abrirDialogoPersona({ id: persona.persona_id }));

  tarjeta.addEventListener('dblclick', (evento) => {
    if (evento.target.closest('button, a, input, select')) return;
    abrirDialogoPersona({ id: persona.persona_id });
  });

  tarjeta.querySelector('[data-accion="marcar-contacto"]').addEventListener('click', async () => {
    persona.persona_ultimo_contacto = hoyISO();
    await persistirYNotificar();
  });

  tarjeta.querySelector('[data-accion="eliminar-persona"]').addEventListener('click', async () => {
    if (!await confirmar(`¿Eliminar a "${persona.persona_nombre}"? Las tareas asociadas quedan sin persona.`, { peligro: true, textoAceptar: 'Eliminar' })) return;
    estado.tareas.forEach((tarea) => {
      if (tarea.persona_id === persona.persona_id) tarea.persona_id = null;
      if (tarea.tarea_delegada_a === persona.persona_id) {
        tarea.tarea_delegada_a = null;
        tarea.tarea_seguimiento_fecha = '';
      }
    });
    estado.personas = estado.personas.filter((p) => p.persona_id !== persona.persona_id);
    await persistirYNotificar();
  });

  return tarjeta;
}
