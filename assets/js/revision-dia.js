import { estado, persistirYNotificar } from './almacenamiento.js';
import { formatearFecha, escaparHtml, formatearHora, hoyISO } from './utilidades.js';
import { crearTarea } from './modelos.js';
import { soportaGoogleCalendar, hayConexionGoogleCalendar, obtenerEventos } from './google-calendar.js';
import { conectar } from './google-auth.js';
import { programarTareasSinFecha } from './programador.js';
import { avisar } from './avisos.js';

// El <dialog> vive en document.body (no en el contenedor de la vista) para
// sobrevivir a los re-renders que dispara persistirYNotificar() al agregar una tarea de continuidad.
let dialogo = null;
let diaCalendario = hoyISO();

function asegurarDialogo() {
  if (dialogo) return dialogo;
  dialogo = document.createElement('dialog');
  dialogo.className = 'dialogo-revision';
  document.body.appendChild(dialogo);
  dialogo.addEventListener('close', () => {
    diaCalendario = hoyISO();
  });
  return dialogo;
}

/**
 * Lee los eventos reales de `diaCalendario` (`YYYY-MM-DD`, por defecto hoy) y ofrece crear una tarea de
 * continuidad por cada uno, o a mano si no hay conexión/soporte (v0.94.0 — antes repasaba antes, una por
 * una con Cumplida/No cumplida/Saltar, las tareas accionables del día; decisión del usuario: ese repaso ya
 * lo cubren Resumen y Agenda directo sobre cada tarjeta, y acá generaba confusión con lo que de verdad hace
 * falta mirar al cerrar el día — el calendario real). Lo llama `views/resumen.view.js` tras elegir el día
 * en `crearSelectorDiaRevision`.
 */
export function iniciarRevisionDia({ diaCalendario: diaElegido = hoyISO() } = {}) {
  diaCalendario = diaElegido;
  const dlg = asegurarDialogo();
  renderRevision(dlg);
  if (!dlg.open) dlg.showModal();
}

function renderRevision(dlg) {
  dlg.innerHTML = `
    <h3>📅 Revisión del día</h3>
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
    await programarTareasSinFecha(estado);
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
        await avisar(error.message);
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
      await programarTareasSinFecha(estado);
      await persistirYNotificar();
      boton.replaceWith(Object.assign(document.createElement('span'), { className: 'etiqueta-fecha etiqueta-exportada', textContent: '✓ Tarea creada' }));
    });
  });
}
