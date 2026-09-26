import { estado, persistirYNotificar } from './almacenamiento.js';
import { formatearFechaOFechaHora, formatearFecha, escaparHtml, formatearHora, hoyISO } from './utilidades.js';
import { crearPanelReprogramar } from './reprogramar.js';
import { cumplirTarea, reprogramarTareaConCascada, avisoInconsistentes } from './tareas-logica.js';
import { ofrecerExportarACalendar } from './exportar-calendar.js';
import { ofrecerCrearTareaSeguimiento } from './modal-tarea.js';
import { crearTarea } from './modelos.js';
import { soportaGoogleCalendar, hayConexionGoogleCalendar, obtenerEventos } from './google-calendar.js';
import { conectar } from './google-auth.js';

// El <dialog> vive en document.body (no en el contenedor de la vista) para
// sobrevivir a los re-renders que dispara persistirYNotificar() en cada paso.
let dialogo = null;
let cola = [];
let indice = 0;
let diaCalendario = hoyISO();

function asegurarDialogo() {
  if (dialogo) return dialogo;
  dialogo = document.createElement('dialog');
  dialogo.className = 'dialogo-revision';
  document.body.appendChild(dialogo);
  dialogo.addEventListener('close', () => {
    cola = [];
    indice = 0;
    diaCalendario = hoyISO();
  });
  return dialogo;
}

/**
 * `diaCalendario` (v0.78.0, `YYYY-MM-DD`, por defecto hoy) es solo el día de Google Calendar que se lee en el
 * paso final del asistente — el repaso de tareas paso a paso siempre es sobre las mismas `tareas` recibidas,
 * sin importar qué día se haya elegido ahí.
 */
export function iniciarRevisionDia(tareas, { diaCalendario: diaElegido = hoyISO() } = {}) {
  cola = tareas.filter((t) => t.tarea_estado !== 'completada');
  indice = 0;
  diaCalendario = diaElegido;
  const dlg = asegurarDialogo();
  renderPaso();
  if (!dlg.open) dlg.showModal();
}

function avanzar() {
  indice += 1;
  renderPaso();
}

function renderPaso() {
  const dlg = asegurarDialogo();

  if (indice >= cola.length) {
    renderPasoFinal(dlg);
    return;
  }

  const tarea = cola[indice];
  const categoria = estado.categorias.find((c) => c.categoria_id === tarea.categoria_id);

  dlg.innerHTML = `
    <p class="progreso-revision">Tarea ${indice + 1} de ${cola.length}</p>
    <h3>${escaparHtml(tarea.tarea_nombre)}</h3>
    <span class="etiquetas">
      ${categoria ? `<span class="etiqueta" style="background:${categoria.categoria_color}">${escaparHtml(categoria.categoria_nombre)}</span>` : ''}
      ${tarea.tarea_fecha_limite ? `<span class="etiqueta-fecha">Límite: ${formatearFechaOFechaHora(tarea.tarea_fecha_limite)}</span>` : ''}
    </span>
    <div class="acciones-revision">
      <button title="Marcar la tarea como cumplida" type="button" data-accion="cumplida" class="boton-primario">✅ Cumplida</button>
      <button title="No se hizo: elegir una nueva fecha para la tarea" type="button" data-accion="no-cumplida">❌ No cumplida</button>
      <button title="Pasar a la siguiente tarea sin cambiar esta" type="button" data-accion="saltar">⏭️ Saltar</button>
    </div>
    <div class="contenedor-paso-revision"></div>
    <button title="Cerrar el repaso del día" type="button" data-accion="cerrar-repaso" class="boton-cerrar-repaso">✖️ Cerrar repaso</button>
  `;

  dlg.querySelector('[data-accion="saltar"]').addEventListener('click', avanzar);
  dlg.querySelector('[data-accion="cerrar-repaso"]').addEventListener('click', () => dlg.close());

  const contenedorPaso = dlg.querySelector('.contenedor-paso-revision');

  dlg.querySelector('[data-accion="cumplida"]').addEventListener('click', () => {
    contenedorPaso.innerHTML = `
      ${
        tarea.tarea_mantenimiento
          ? `<label>¿Qué podrías mejorar la próxima vez? (opcional)
              <input type="text" data-campo="mejora" />
            </label>`
          : ''
      }
      <button title="Confirmar que la tarea se cumplió" type="button" data-accion="confirmar-cumplida" class="boton-primario">✔️ Confirmar</button>
    `;
    contenedorPaso.querySelector('[data-accion="confirmar-cumplida"]').addEventListener('click', async () => {
      const campoMejora = contenedorPaso.querySelector('[data-campo="mejora"]');
      const notaMejora = campoMejora ? campoMejora.value.trim() : '';
      cumplirTarea(tarea, estado, { notaMejora });
      await persistirYNotificar();
      ofrecerExportarACalendar(tarea);
      ofrecerCrearTareaSeguimiento(tarea);
      avanzar();
    });
  });

  dlg.querySelector('[data-accion="no-cumplida"]').addEventListener('click', () => {
    contenedorPaso.innerHTML = `
      <button title="Seguir y elegir la nueva fecha" type="button" data-accion="continuar-reprogramar" class="boton-primario">📅 Reprogramar</button>
    `;
    contenedorPaso.querySelector('[data-accion="continuar-reprogramar"]').addEventListener('click', () => {
      contenedorPaso.innerHTML = '';

      const panel = crearPanelReprogramar({
        diasHabiles: tarea.tarea_dias_habiles,
        onConfirmar: async (fechaSugeridaISO) => {
          const inconsistentes = reprogramarTareaConCascada(tarea, fechaSugeridaISO, estado.tareas);
          await persistirYNotificar();
          const aviso = avisoInconsistentes(inconsistentes);
          if (aviso) alert(aviso);
          avanzar();
        },
        onCancelar: () => {
          contenedorPaso.innerHTML = '';
        },
      });
      contenedorPaso.appendChild(panel);
    });
  });
}

function renderPasoFinal(dlg) {
  dlg.innerHTML = `
    <p>${cola.length === 0 ? 'No tenés tareas para repasar hoy.' : '¡Repasaste todas tus tareas de hoy! 🎉'}</p>
    <div class="contenedor-calendario-revision"></div>
    <button title="Cerrar" type="button" data-accion="cerrar" class="boton-primario">✖️ Cerrar</button>
  `;
  dlg.querySelector('[data-accion="cerrar"]').addEventListener('click', () => dlg.close());

  renderSeccionCalendario(dlg.querySelector('.contenedor-calendario-revision'));
}

function renderHtmlPreguntaContinuidad() {
  return `
    <p class="panel-reprogramar-etiqueta">¿Alguno de estos generó una tarea nueva para vos?</p>
    <form class="formulario-en-linea" data-form="tarea-continuidad">
      <input type="text" name="tarea_nombre" placeholder="Nombre de la tarea nueva" />
      <button type="submit" title="Agregar la tarea de continuidad">➕ Agregar</button>
    </form>
    <ul class="lista-tareas-agregadas"></ul>
  `;
}

function wirePreguntaContinuidad(contenedor) {
  const formulario = contenedor.querySelector('[data-form="tarea-continuidad"]');
  const lista = contenedor.querySelector('.lista-tareas-agregadas');

  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const nombre = String(new FormData(formulario).get('tarea_nombre') || '').trim();
    if (!nombre) return;
    estado.tareas.push(crearTarea({ tarea_nombre: nombre }));
    await persistirYNotificar();
    const item = document.createElement('li');
    item.textContent = `✓ ${nombre}`;
    lista.appendChild(item);
    formulario.reset();
  });
}

async function renderSeccionCalendario(contenedor) {
  const esHoy = diaCalendario === hoyISO();
  // "de hoy" / "del 25/09/2026" (nunca "de el…", agramatical) para "eventos ___"; "hoy" / "el 25/09/2026" para "agendados ___".
  const deDia = esHoy ? 'de hoy' : `del ${formatearFecha(diaCalendario)}`;
  const elDia = esHoy ? 'hoy' : `el ${formatearFecha(diaCalendario)}`;

  if (!soportaGoogleCalendar()) {
    contenedor.innerHTML = renderHtmlPreguntaContinuidad();
    wirePreguntaContinuidad(contenedor);
    return;
  }

  if (!hayConexionGoogleCalendar()) {
    contenedor.innerHTML = `
      <p class="panel-reprogramar-etiqueta">Conectá tu Google Calendar para ver los eventos ${deDia}:</p>
      <button title="Conectar Google Calendar para ver los eventos ${deDia}" type="button" data-accion="conectar-calendar-revision">📅 Conectar con Google Calendar</button>
      ${renderHtmlPreguntaContinuidad()}
    `;
    contenedor.querySelector('[data-accion="conectar-calendar-revision"]').addEventListener('click', async () => {
      try {
        await conectar();
        renderSeccionCalendario(contenedor);
      } catch (error) {
        alert(error.message);
      }
    });
    wirePreguntaContinuidad(contenedor);
    return;
  }

  contenedor.innerHTML = `<p class="mensaje-vacio">Cargando eventos ${deDia}...</p>`;

  let eventos;
  try {
    eventos = await obtenerEventos(diaCalendario, diaCalendario);
  } catch {
    contenedor.innerHTML = renderHtmlPreguntaContinuidad();
    wirePreguntaContinuidad(contenedor);
    return;
  }

  contenedor.innerHTML = `
    ${
      eventos.length === 0
        ? `<p class="mensaje-vacio">No tuviste eventos agendados ${elDia}.</p>`
        : `<ul class="lista-eventos-revision">
            ${eventos
              .map((evento, indiceEvento) => {
                const inicio = formatearHora(evento.inicio);
                const fin = formatearHora(evento.fin);
                return `<li data-indice-evento="${indiceEvento}">
                  <span>${escaparHtml(evento.resumen)} (${inicio}–${fin})</span>
                  <button title="Crear una tarea nueva con este nombre" type="button" data-accion="crear-tarea-evento">➕ Crear tarea</button>
                </li>`;
              })
              .join('')}
          </ul>`
    }
    ${renderHtmlPreguntaContinuidad()}
  `;
  wirePreguntaContinuidad(contenedor);

  contenedor.querySelectorAll('[data-accion="crear-tarea-evento"]').forEach((boton) => {
    boton.addEventListener('click', async () => {
      const li = boton.closest('[data-indice-evento]');
      const evento = eventos[Number(li.dataset.indiceEvento)];
      boton.disabled = true;
      estado.tareas.push(crearTarea({ tarea_nombre: evento.resumen }));
      await persistirYNotificar();
      boton.replaceWith(Object.assign(document.createElement('span'), { className: 'etiqueta-fecha etiqueta-exportada', textContent: '✓ Tarea creada' }));
    });
  });
}
