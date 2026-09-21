import { exportarJSON, importarJSON, borrarTodosLosDatos } from '../assets/js/almacenamiento.js';
import { obtenerFranjaHoraria, establecerFranjaHoraria, HORAS_FRANJA } from '../assets/js/preferencias-horario.js';
import { obtenerPreferencias, guardarPreferencias } from '../assets/js/preferencias.js';
import { htmlInterruptor } from '../assets/js/formulario-tarea.js';
import { hayConexionGoogleCalendar, listarCalendarios, invalidarCacheEventos } from '../assets/js/google-calendar.js';
import { escaparHtml } from '../assets/js/utilidades.js';

const NOMBRES_DIA_CORTO = { 1: 'Lunes', 2: 'Martes', 3: 'Miércoles', 4: 'Jueves', 5: 'Viernes', 6: 'Sábado', 0: 'Domingo' };
const HORIZONTES = [30, 60, 90, 180];

const PALABRA_CONFIRMACION = 'BORRAR';

export function renderVistaConfiguraciones(contenedor) {
  const franja = obtenerFranjaHoraria();
  const preferencias = obtenerPreferencias();
  contenedor.innerHTML = `
    <h2>⚙️ Configuraciones</h2>

    <section class="seccion-config">
      <h3>🗓️ Agenda y Calendar</h3>
      <p class="ayuda">Es la parte del día en que se pueden proponer horarios (botón «Al próximo hueco libre», cuando una tarea se superpone con un evento de Calendar) y en que se cuenta tu tiempo libre. Se guarda en tu Drive, para todos tus dispositivos.</p>
      <div class="acciones-config franja-horaria">
        <label title="Primera hora del día en que se pueden proponer horarios">🌅 Desde
          <select id="franja-inicio">${HORAS_FRANJA.slice(0, -1).map((h) => `<option value="${h}" ${h === franja.inicio ? 'selected' : ''}>${h}</option>`).join('')}</select>
        </label>
        <label title="Última hora del día en que se pueden proponer horarios">🌇 Hasta
          <select id="franja-fin">${HORAS_FRANJA.slice(1).map((h) => `<option value="${h}" ${h === franja.fin ? 'selected' : ''}>${h}</option>`).join('')}</select>
        </label>
      </div>
      <p class="ayuda" id="mensaje-franja" hidden></p>
    </section>

    <section class="seccion-config" id="seccion-tiempo">
      <h3>⏱️ Tiempo disponible</h3>
      <p class="ayuda">Cuánto tiempo querés dedicar a tus tareas cada día. Se usa para la barra de carga de la vista Semana. También cuenta tu Calendar: cada evento le quita tiempo al día. Para un día puntual (un viaje, un día libre) tocá su barra en Semana. Se guarda en tu Drive.</p>
      <h4>⏳ Tope por día de la semana (minutos)</h4>
      <div class="topes-dias">
        ${[1, 2, 3, 4, 5, 6, 0]
          .map((d) => `<label title="Minutos que querés dedicar a tareas cada ${NOMBRES_DIA_CORTO[d].toLowerCase()}">${NOMBRES_DIA_CORTO[d]}<input type="number" data-tope-dia="${d}" min="0" step="15" value="${preferencias.pref_tope_dias[d]}" /></label>`)
          .join('')}
      </div>
      <div class="acciones-config">
        <label title="Cuántos días hacia adelante se leen tus eventos de Calendar (para calcular tu tiempo libre)">📆 Leer Calendar hasta
          <select id="horizonte-calendar">${HORIZONTES.map((h) => `<option value="${h}" ${h === preferencias.pref_horizonte_dias ? 'selected' : ''}>${h} días</option>`).join('')}</select>
        </label>
      </div>
      <h4>📅 Eventos de Calendar que cuentan como ocupados</h4>
      <div class="interruptores-config">
        ${htmlInterruptor('ignorar_todo_el_dia', preferencias.pref_ignorar_todo_el_dia, 'Ignorar los eventos de todo el día', 'title="Los eventos de todo el día (cumpleaños, recordatorios) no le quitan tiempo al día"')}
        ${htmlInterruptor('ignorar_rechazados', preferencias.pref_ignorar_rechazados, 'Ignorar los eventos que rechacé', 'title="Los eventos a los que respondiste que no vas no le quitan tiempo al día"')}
        ${htmlInterruptor('ignorar_disponible', preferencias.pref_ignorar_disponible, 'Ignorar los eventos marcados como «Disponible»', 'title="En Google Calendar cada evento se muestra como Ocupado o Disponible: si esto está activado, los Disponible no le quitan tiempo al día"')}
      </div>
      <h4>🗓️ Calendarios que se leen</h4>
      <div id="lista-calendarios" class="lista-calendarios"><p class="ayuda">${hayConexionGoogleCalendar() ? 'Cargando tus calendarios…' : 'Conectá Google para elegir los calendarios.'}</p></div>
      <p class="ayuda" id="mensaje-tiempo" hidden></p>
    </section>

    <section class="seccion-config">
      <h3>💾 Copia de seguridad</h3>
      <p class="ayuda">Tus datos viven en tu Google Drive. Exportar descarga una copia en un archivo JSON; importar reemplaza todo lo que hay por el contenido de un archivo (también en Drive).</p>
      <div class="acciones-config">
        <button title="Descargar una copia de tus datos en un archivo JSON" type="button" id="boton-exportar">⬇️ Exportar JSON</button>
        <label class="boton-archivo">
          ⬆️ Importar JSON
          <input type="file" id="input-importar" accept="application/json" hidden />
        </label>
      </div>
    </section>

    <section class="seccion-config seccion-peligro">
      <h3>🗑️ Borrar todos los datos</h3>
      <p class="ayuda">Elimina <strong>todas</strong> tus tareas, categorías, ubicaciones, metas, personas, notas de mejora y registros de cumplimiento. También se borran en Google Drive y en tus otros dispositivos. Conviene exportar antes una copia.</p>
      <div class="acciones-config">
        <button title="Borrar todos tus datos (pide doble confirmación)" type="button" id="boton-borrar-todo" class="boton-peligro">🗑️ Borrar todos los datos</button>
      </div>
    </section>
  `;

  const campoInicio = contenedor.querySelector('#franja-inicio');
  const campoFin = contenedor.querySelector('#franja-fin');
  const mensajeFranja = contenedor.querySelector('#mensaje-franja');
  const guardarFranja = () => {
    const guardada = establecerFranjaHoraria({ inicio: campoInicio.value, fin: campoFin.value });
    mensajeFranja.textContent = guardada ? '✓ Guardado en este dispositivo.' : 'El «Desde» tiene que ser anterior al «Hasta»: no se guardó.';
    mensajeFranja.hidden = false;
  };
  campoInicio.addEventListener('change', guardarFranja);
  campoFin.addEventListener('change', guardarFranja);

  conectarSeccionTiempo(contenedor);

  contenedor.querySelector('#boton-exportar').addEventListener('click', exportarJSON);

  contenedor.querySelector('#input-importar').addEventListener('change', async (evento) => {
    const archivo = evento.target.files[0];
    if (!archivo) return;
    try {
      await importarJSON(archivo);
    } catch (error) {
      alert('No se pudo importar el archivo: ' + error.message);
    } finally {
      evento.target.value = '';
    }
  });

  contenedor.querySelector('#boton-borrar-todo').addEventListener('click', async () => {
    const seguro = confirm(
      'Vas a borrar TODOS tus datos (tareas, categorías, ubicaciones, metas, personas, mejoras y cumplimientos), también en Google Drive y en tus otros dispositivos. Esto no se puede deshacer. ¿Querés continuar?'
    );
    if (!seguro) return;
    const escrito = prompt(`Para confirmar, escribí ${PALABRA_CONFIRMACION}:`);
    if (escrito === null) {
      alert('No se borró nada.');
      return;
    }
    if (escrito.trim().toUpperCase() !== PALABRA_CONFIRMACION) {
      alert('Palabra incorrecta. No se borró nada.');
      return;
    }
    await borrarTodosLosDatos();
    alert('Se borraron todos los datos.');
  });
}

/** Conecta la sección "Tiempo disponible": cada cambio se guarda en las preferencias (Drive) sin redibujar la vista. */
function conectarSeccionTiempo(contenedor) {
  const seccion = contenedor.querySelector('#seccion-tiempo');
  const mensaje = seccion.querySelector('#mensaje-tiempo');
  const guardar = async (parcial, { recalendar = false } = {}) => {
    await guardarPreferencias(parcial, { sinNotificar: true });
    if (recalendar) invalidarCacheEventos();
    mensaje.textContent = '✓ Guardado en tu Drive.';
    mensaje.hidden = false;
  };

  seccion.querySelectorAll('[data-tope-dia]').forEach((campo) => {
    campo.addEventListener('change', () => {
      const topes = [...obtenerPreferencias().pref_tope_dias];
      const minutos = Math.max(0, Math.round(Number(campo.value) || 0));
      topes[Number(campo.dataset.topeDia)] = minutos;
      campo.value = String(minutos);
      guardar({ pref_tope_dias: topes });
    });
  });
  seccion.querySelector('#horizonte-calendar').addEventListener('change', (evento) => guardar({ pref_horizonte_dias: Number(evento.target.value) }, { recalendar: true }));
  [['ignorar_todo_el_dia', 'pref_ignorar_todo_el_dia'], ['ignorar_rechazados', 'pref_ignorar_rechazados'], ['ignorar_disponible', 'pref_ignorar_disponible']].forEach(([nombre, clave]) => {
    seccion.querySelector(`[name="${nombre}"]`).addEventListener('change', (evento) => guardar({ [clave]: evento.target.checked }));
  });

  if (!hayConexionGoogleCalendar()) return;
  const lista = seccion.querySelector('#lista-calendarios');
  listarCalendarios().then((calendarios) => {
    if (!lista.isConnected) return;
    if (calendarios.length === 0) {
      lista.innerHTML = '<p class="ayuda">No se pudieron cargar tus calendarios. Se lee el principal.</p>';
      return;
    }
    const elegidos = obtenerPreferencias().pref_calendarios;
    lista.innerHTML = calendarios
      .map(
        (c) => `<label class="calendario-config" title="Leer los eventos de este calendario"><input type="checkbox" value="${escaparHtml(c.id)}" ${!elegidos || elegidos.includes(c.id) ? 'checked' : ''} /><span class="punto-calendario" style="background:${escaparHtml(c.color)}"></span>${escaparHtml(c.nombre)}${c.principal ? ' <small>(principal)</small>' : ''}</label>`
      )
      .join('');
    lista.addEventListener('change', () => {
      const marcados = [...lista.querySelectorAll('input:checked')].map((i) => i.value);
      guardar({ pref_calendarios: marcados.length === calendarios.length ? null : marcados }, { recalendar: true });
    });
  });
}
