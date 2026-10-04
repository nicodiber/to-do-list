import { htmlConfigAsistente, conectarConfigAsistente } from './asistente.view.js';
import { csvDeTareas, csvDeCumplimientos, descargarCSV } from '../assets/js/exportar-csv.js';
import { estado, exportarJSON, importarJSON, borrarTodosLosDatos, persistirYNotificar, ultimaExportacion, leerDiasRecordatorioCopia, guardarDiasRecordatorioCopia, DIAS_RECORDATORIO_COPIA } from '../assets/js/almacenamiento.js';
import { tareasCompletadasLimpiables, eliminarTarea } from '../assets/js/tareas-logica.js';
import { bloquesDeSemana, validarBloquesDia, ordenarBloques, minutosDeBloques, HORAS_BLOQUE } from '../assets/js/bloques-horarios.js';
import { obtenerPreferencias, guardarPreferencias } from '../assets/js/preferencias.js';
import { htmlOpcionesUbicacion } from '../assets/js/formulario-tarea.js';
import { conectarCrearNueva } from '../assets/js/dialogo-formulario.js';
import { abrirDialogoUbicacion } from '../assets/js/formularios-entidades.js';
import { hayConexionGoogleCalendar, listarCalendarios, invalidarCacheEventos } from '../assets/js/google-calendar.js';
import { escaparHtml, htmlInterruptor } from '../assets/js/utilidades.js';
import { registroSesionGoogle } from '../assets/js/google-auth.js';
import { htmlAtajos } from '../assets/js/atajos.js';
import { leerPreferenciaSonidos, guardarPreferenciaSonidos, sonar } from '../assets/js/sonidos.js';
import { climaAutomaticoActivado, guardarClimaAutomatico, detectarCoordenadasDelDispositivo, ultimasCoordenadasDetectadas } from '../assets/js/clima.js';
import { obtenerTema, establecerTema } from '../assets/js/app.js';
import { avisar, confirmar, pedirTexto } from '../assets/js/avisos.js';

const TOPE_MAXIMO_MIN = 1440; // minutos que tiene un día (24 h)

const NOMBRES_DIA_CORTO = { 1: 'Lunes', 2: 'Martes', 3: 'Miércoles', 4: 'Jueves', 5: 'Viernes', 6: 'Sábado', 0: 'Domingo' };
const HORIZONTES = [30, 60, 90, 180];

const PALABRA_CONFIRMACION = 'BORRAR';

export function renderVistaConfiguraciones(contenedor) {
  const preferencias = obtenerPreferencias();
  contenedor.innerHTML = `
    <h2>⚙️ Configuraciones</h2>

    <section class="seccion-config">
      <h3>🎨 Apariencia</h3>
      ${htmlInterruptor('tema_oscuro', obtenerTema() === 'oscuro', '🌙 Tema oscuro', 'title="Se guarda en este dispositivo"')}
    </section>

    <section class="seccion-config">
      <h3>🌦️ Clima</h3>
      <p class="ayuda">La ubicación que se usa para el pronóstico de la vista Semana (ícono del día, amanecer/atardecer y el degradé de temperatura/lluvia). Si no tiene latitud/longitud cargadas, esas funciones no muestran nada. Se guarda en tu Drive.</p>
      <div class="acciones-config">
        ${htmlInterruptor('clima_automatico', climaAutomaticoActivado(), '📡 Usar la ubicación de este dispositivo', 'title="El clima sigue tu ubicación cuando viajás. El navegador te pide permiso; solo se usan las coordenadas, redondeadas a ~1 km, y únicamente para pedir el pronóstico. Es una opción de este dispositivo."')}
      </div>
      <p class="ayuda" id="mensaje-clima-automatico"></p>
      <div class="acciones-config">
        <label title="Ubicación de referencia para el pronóstico del tiempo (la que se usa si no está activada la del dispositivo, o si esta falla)">📍 Ubicación fija para el clima
          <select id="ubicacion-clima">${htmlOpcionesUbicacion(preferencias.pref_ubicacion_clima || '')}</select>
        </label>
      </div>
      <p class="ayuda" id="mensaje-clima" hidden></p>
    </section>

    <section class="seccion-config" id="seccion-tiempo">
      <h3>🕘 Tiempo disponible</h3>
      <p class="ayuda">Cuándo y cuánto tiempo querés dedicar a tus tareas. Se usa para el agendado y para la barra de carga de la vista Semana. También cuenta tu Calendar: cada evento le quita tiempo al día. Para un día puntual (un viaje, un día libre) tocá su barra en Semana. Se guarda en tu Drive.</p>
      <h4>🕘 Horarios disponibles por día de la semana</h4>
      <p class="ayuda">Los bloques «de qué hora a qué hora» en que querés hacer tareas. El agendado solo propone horarios dentro de ellos, el tiempo disponible de cada día es la suma de sus bloques (menos tus eventos de Calendar) y en Semana se sombrean las horas fuera de ellos. Por defecto cada día tiene un bloque de 00:00 a 24:00. Los bloques no pueden pisarse ni quedar pegados (se unen en uno) y suman como máximo 24 h por día. Un día sin bloques es un día libre.</p>
      <div class="bloques-semana" id="bloques-semana"></div>
      <p class="ayuda" id="mensaje-bloques" hidden></p>
      <div class="acciones-config">
        <label title="Cuántos días hacia adelante se leen tus eventos de Calendar (para calcular tu tiempo libre)">📆 Leer Calendar hasta
          <select id="horizonte-calendar">${HORIZONTES.map((h) => `<option value="${h}" ${h === preferencias.pref_horizonte_dias ? 'selected' : ''}>${h} días</option>`).join('')}</select>
        </label>
      </div>
      <h4>📅 Eventos de Calendar que cuentan como ocupados</h4>
      <div class="interruptores-config">
        ${htmlInterruptor('ignorar_todo_el_dia', !preferencias.pref_ignorar_todo_el_dia, '¿Un evento de todo el día cuenta como ocupado al buscar hueco libre?', 'title="Un evento de todo el día (cumpleaños, recordatorios) puede o no quitarle tiempo al día"')}
        ${htmlInterruptor('ignorar_rechazados', !preferencias.pref_ignorar_rechazados, '¿Un evento que rechazaste cuenta como ocupado al buscar hueco libre?', 'title="Un evento al que respondiste que no vas puede o no quitarle tiempo al día"')}
        ${htmlInterruptor('ignorar_disponible', !preferencias.pref_ignorar_disponible, '¿Un evento marcado como «Disponible» en Google Calendar cuenta como ocupado al buscar hueco libre?', 'title="En Google Calendar cada evento se muestra como Ocupado o Disponible: esto decide si un Disponible le quita tiempo al día"')}
      </div>
      <h4>🗓️ Calendarios que se leen</h4>
      <div id="lista-calendarios" class="lista-calendarios"><p class="ayuda">${hayConexionGoogleCalendar() ? 'Cargando tus calendarios…' : 'Conectá Google para elegir los calendarios.'}</p></div>
      <p class="ayuda" id="mensaje-tiempo" hidden></p>
    </section>

    <section class="seccion-config">
      <h3>⏱️ Tiempo real de las tareas</h3>
      <p class="ayuda">Si lo activás, al completar una tarea te pregunta (opcional) cuánto tardaste. Con eso, Estadísticas compara lo estimado con lo real por categoría y te propone ajustar las duraciones pendientes; nunca cambia nada sin que lo confirmes. Se guarda en tu Drive.</p>
      <div class="acciones-config">
        ${htmlInterruptor('pref_preguntar_tiempo_real', preferencias.pref_preguntar_tiempo_real, '⏱️ Preguntar cuánto tardé al completar una tarea')}
      </div>
    </section>

    <section class="seccion-config">
      <h3>🔊 Sonidos</h3>
      <p class="ayuda">Sonidos cortos al agregar, completar o eliminar una tarea, al deshacer, en los avisos y un toque suave al apretar botones. Los genera la propia app (no hay archivos de audio). Se guardan en este dispositivo.</p>
      <div class="acciones-config">
        ${htmlInterruptor('sonidos_activo', leerPreferenciaSonidos().activo, '🔊 Sonidos activados')}
        <label class="campo-volumen" title="Volumen de los sonidos">Volumen <input type="range" id="sonidos-volumen" min="0" max="100" step="5" value="${Math.round(leerPreferenciaSonidos().volumen * 100)}" /></label>
        <button type="button" id="sonidos-probar" title="Escuchar el sonido de tarea completada">▶️ Probar</button>
      </div>
    </section>

    <section class="seccion-config">
      <h3>⌨️ Atajos de teclado</h3>
      <details>
        <summary>Ver la lista de atajos (también con la tecla «?»)</summary>
        ${htmlAtajos()}
      </details>
    </section>

    <section class="seccion-config">
      <h3>🔑 Sesión de Google</h3>
      <p class="ayuda">La sesión de Google dura cerca de una hora y se renueva sola mientras usás la app (cada clic o tecla es una oportunidad). Si la perdés seguido, este registro (guardado solo en este navegador) muestra qué pasó y sirve para encontrar la causa.</p>
      <details>
        <summary>Ver las últimas conexiones y fallos</summary>
        <ul class="registro-sesion" id="registro-sesion"></ul>
      </details>
    </section>

    <section class="seccion-config">
      <h3>🤖 Asistente de IA</h3>
      ${htmlConfigAsistente()}
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
      <div class="acciones-config">
        <button title="Descargar tus tareas como planilla (CSV) para abrirla en Excel o Google Sheets" type="button" id="boton-csv-tareas">📊 Tareas (CSV)</button>
        <button title="Descargar el historial de tareas cumplidas, con tiempo estimado y real, como planilla (CSV)" type="button" id="boton-csv-cumplimientos">📊 Cumplimientos (CSV)</button>
        <small class="ayuda">Solo para analizar en una planilla: no sirven para restaurar (para eso, el JSON).</small>
      </div>
      <div class="acciones-config">
        <label title="Cada cuántos días la app te recuerda exportar una copia (en este dispositivo)">🔔 Recordarme exportar una copia
          <select id="recordatorio-copia">${DIAS_RECORDATORIO_COPIA.map((d) => `<option value="${d}" ${d === leerDiasRecordatorioCopia() ? 'selected' : ''}>${d === 0 ? 'nunca' : `cada ${d} días`}</option>`).join('')}</select>
        </label>
        <small class="ayuda">${ultimaExportacion() ? `Última exportación en este dispositivo: ${new Date(ultimaExportacion()).toLocaleDateString('es-AR')}.` : 'Todavía no exportaste una copia en este dispositivo.'} Qué hacer si algo se cae: <code>PLAN_B.md</code>.</small>
      </div>
    </section>

    <section class="seccion-config">
      <h3>🧹 Limpiar tareas completadas</h3>
      <p class="ayuda">Elimina las tareas completadas hace mucho para que la Tabla no se llene de historia. El mapa de hábitos y sus rachas <strong>no se tocan</strong> (se calculan con los registros de cumplimiento, que se conservan), y tampoco se eliminan las completadas que otra tarea todavía usa como referencia. Conviene exportar antes una copia.</p>
      <div class="acciones-config">
        <label>Completadas hace más de
          <select id="limpiar-dias">
            <option value="30">30 días</option>
            <option value="90" selected>90 días</option>
            <option value="180">6 meses</option>
            <option value="365">1 año</option>
          </select>
        </label>
        <button type="button" id="boton-limpiar-completadas" title="Ver cuántas se eliminarían y confirmar">🧹 Limpiar…</button>
      </div>
      <p class="ayuda" id="mensaje-limpiar" hidden></p>
    </section>

    <section class="seccion-config seccion-peligro">
      <h3>🗑️ Borrar todos los datos</h3>
      <p class="ayuda">Elimina <strong>todas</strong> tus tareas, categorías, ubicaciones, metas, personas, notas de mejora y registros de cumplimiento. También se borran en Google Drive y en tus otros dispositivos. Conviene exportar antes una copia.</p>
      <div class="acciones-config">
        <button title="Borrar todos tus datos (pide doble confirmación)" type="button" id="boton-borrar-todo" class="boton-peligro">🗑️ Borrar todos los datos</button>
      </div>
    </section>
  `;

  contenedor.querySelector('[name="pref_preguntar_tiempo_real"]').addEventListener('change', (evento) => {
    guardarPreferencias({ pref_preguntar_tiempo_real: evento.target.checked }, { sinNotificar: true });
  });
  const interruptorSonido = contenedor.querySelector('[name="sonidos_activo"]');
  const volumenSonido = contenedor.querySelector('#sonidos-volumen');
  const guardarSonidos = () => guardarPreferenciaSonidos({ activo: interruptorSonido.checked, volumen: Number(volumenSonido.value) / 100 });
  interruptorSonido.addEventListener('change', () => {
    guardarSonidos();
    if (interruptorSonido.checked) sonar('completar');
  });
  volumenSonido.addEventListener('change', () => {
    guardarSonidos();
    sonar('aviso', { forzar: true });
  });
  contenedor.querySelector('#sonidos-probar').addEventListener('click', () => sonar('completar', { forzar: true }));

  const registro = contenedor.querySelector('#registro-sesion');
  const etiquetasRegistro = { conexion: '✅ Conexión con ventana', renovacion: '🔄 Renovación silenciosa', fallo: '⚠️ Falló' };
  const entradas = registroSesionGoogle().slice().reverse();
  if (entradas.length === 0) registro.innerHTML = '<li>Todavía no hay registros.</li>';
  entradas.forEach((e) => {
    const li = document.createElement('li');
    li.textContent = `${new Date(e.cuando).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'medium' })} — ${etiquetasRegistro[e.tipo] || e.tipo}${e.detalle ? `: ${e.detalle}` : ''}${e.visible === 'hidden' ? ' (pestaña en segundo plano)' : ''}`;
    registro.appendChild(li);
  });


  contenedor.querySelector('#recordatorio-copia').addEventListener('change', (evento) => guardarDiasRecordatorioCopia(Number(evento.target.value)));

  const mensajeLimpiar = contenedor.querySelector('#mensaje-limpiar');
  contenedor.querySelector('#boton-limpiar-completadas').addEventListener('click', async () => {
    const dias = Number(contenedor.querySelector('#limpiar-dias').value);
    const candidatas = tareasCompletadasLimpiables(estado.tareas, dias);
    if (candidatas.length === 0) {
      mensajeLimpiar.textContent = `No hay tareas completadas hace más de ${dias} días para limpiar.`;
      mensajeLimpiar.hidden = false;
      return;
    }
    if (!(await confirmar(`Se van a eliminar ${candidatas.length} tarea${candidatas.length === 1 ? '' : 's'} completada${candidatas.length === 1 ? '' : 's'} hace más de ${dias} días. Tu historial de hábitos se conserva. Se puede deshacer con Ctrl+Z.`, { titulo: '🧹 Limpiar completadas', peligro: true, textoAceptar: 'Eliminar' }))) return;
    candidatas.forEach((tarea) => eliminarTarea(tarea, estado));
    await persistirYNotificar();
    await avisar(`Se eliminaron ${candidatas.length} tarea${candidatas.length === 1 ? '' : 's'} completada${candidatas.length === 1 ? '' : 's'}.`, { titulo: '🧹 Listo' });
  });

  const mensajeAutomatico = contenedor.querySelector('#mensaje-clima-automatico');
  const interruptorAutomatico = contenedor.querySelector('[name="clima_automatico"]');
  const textoCoordenadas = () => {
    const c = ultimasCoordenadasDetectadas();
    return c ? `Ubicación detectada: ${c.latitud}, ${c.longitud}.` : '';
  };
  mensajeAutomatico.textContent = climaAutomaticoActivado() ? textoCoordenadas() : '';
  interruptorAutomatico.addEventListener('change', async () => {
    if (!interruptorAutomatico.checked) {
      guardarClimaAutomatico(false);
      mensajeAutomatico.textContent = '';
      return;
    }
    mensajeAutomatico.textContent = 'Pidiendo tu ubicación al navegador…';
    try {
      await detectarCoordenadasDelDispositivo({ forzar: true });
      guardarClimaAutomatico(true);
      mensajeAutomatico.textContent = `✓ Activado. ${textoCoordenadas()}`;
    } catch (error) {
      guardarClimaAutomatico(false);
      interruptorAutomatico.checked = false;
      mensajeAutomatico.textContent = error.message;
    }
  });

  const mensajeClima = contenedor.querySelector('#mensaje-clima');
  conectarCrearNueva(contenedor.querySelector('#ubicacion-clima'), htmlOpcionesUbicacion, abrirDialogoUbicacion, (n) => n.ubicacion_id, async (id) => {
    await guardarPreferencias({ pref_ubicacion_clima: id || null }, { sinNotificar: true });
    mensajeClima.textContent = '✓ Guardado en tu Drive.';
    mensajeClima.hidden = false;
  });

  contenedor.querySelector('[name="tema_oscuro"]').addEventListener('change', (evento) => {
    establecerTema(evento.target.checked ? 'oscuro' : 'claro');
  });

  conectarSeccionTiempo(contenedor);

  conectarConfigAsistente(contenedor, () => renderVistaConfiguraciones(contenedor));
  contenedor.querySelector('#boton-exportar').addEventListener('click', exportarJSON);
  contenedor.querySelector('#boton-csv-tareas').addEventListener('click', () => descargarCSV(csvDeTareas(), 'tareas'));
  contenedor.querySelector('#boton-csv-cumplimientos').addEventListener('click', () => descargarCSV(csvDeCumplimientos(), 'cumplimientos'));

  contenedor.querySelector('#input-importar').addEventListener('change', async (evento) => {
    const archivo = evento.target.files[0];
    if (!archivo) return;
    try {
      await importarJSON(archivo);
    } catch (error) {
      await avisar('No se pudo importar el archivo: ' + error.message);
    } finally {
      evento.target.value = '';
    }
  });

  contenedor.querySelector('#boton-borrar-todo').addEventListener('click', async () => {
    const seguro = await confirmar(
      'Vas a borrar TODOS tus datos (tareas, categorías, ubicaciones, metas, personas, mejoras y cumplimientos), también en Google Drive y en tus otros dispositivos. Esto no se puede deshacer. ¿Querés continuar?'
    );
    if (!seguro) return;
    const escrito = await pedirTexto(`Para confirmar, escribí ${PALABRA_CONFIRMACION}:`);
    if (escrito === null) {
      await avisar('No se borró nada.');
      return;
    }
    if (escrito.trim().toUpperCase() !== PALABRA_CONFIRMACION) {
      await avisar('Palabra incorrecta. No se borró nada.');
      return;
    }
    await borrarTodosLosDatos();
    await avisar('Se borraron todos los datos.');
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

  // Horarios disponibles por día (v0.105.0): un editor de bloques por día; se guarda en cuanto todos los bloques son válidos.
  const contenedorBloques = seccion.querySelector('#bloques-semana');
  const mensajeBloques = seccion.querySelector('#mensaje-bloques');
  const horasSelect = (valor, desde, hasta) =>
    `<select>${HORAS_BLOQUE.slice(desde, hasta).map((h) => `<option value="${h}" ${h === valor ? 'selected' : ''}>${h}</option>`).join('')}</select>`;
  const filaBloque = (b) =>
    `<span class="bloque-horario"><label>Desde ${horasSelect(b.inicio, 0, 48)}</label><label>Hasta ${horasSelect(b.fin, 1, 49)}</label><button type="button" data-quitar-bloque title="Quitar este bloque">✕</button></span>`;
  const textoHoras = (minutos) => (minutos === 0 ? 'Día libre' : `${Math.floor(minutos / 60)} h${minutos % 60 ? ` ${minutos % 60} min` : ''}`);
  let semanaEditada = bloquesDeSemana(obtenerPreferencias()).map((bloques) => ordenarBloques(bloques));

  const leerDia = (fila) =>
    [...fila.querySelectorAll('.bloque-horario')].map((el) => {
      const [desde, hasta] = el.querySelectorAll('select');
      return { inicio: desde.value, fin: hasta.value };
    });
  const dibujarBloques = () => {
    contenedorBloques.innerHTML = [1, 2, 3, 4, 5, 6, 0]
      .map(
        (d) => `<div class="bloques-dia" data-dia-bloques="${d}">
          <strong class="nombre-dia-bloques">${NOMBRES_DIA_CORTO[d]}</strong>
          <span class="lista-bloques">${semanaEditada[d].map(filaBloque).join('')}</span>
          <span class="acciones-bloques-dia">
            <button type="button" data-agregar-bloque title="Agregar otro bloque a este día">＋ Bloque</button>
            <button type="button" data-copiar-dia title="Copiar los bloques de este día a todos los demás días">📋 Copiar a todos</button>
            <small class="total-bloques-dia">${textoHoras(minutosDeBloques(semanaEditada[d]))}</small>
          </span>
        </div>`
      )
      .join('');
  };
  const guardarBloques = async () => {
    await guardarPreferencias({ pref_bloques_dias: semanaEditada.map((b) => ordenarBloques(b)) }, { sinNotificar: true });
    invalidarCacheEventos();
    mensajeBloques.className = 'ayuda';
    mensajeBloques.textContent = '✓ Guardado en tu Drive.';
    mensajeBloques.hidden = false;
  };
  const mostrarError = (motivo) => {
    mensajeBloques.className = 'ayuda mensaje-error-bloques';
    mensajeBloques.textContent = `⚠️ ${motivo} No se guardó.`;
    mensajeBloques.hidden = false;
  };
  dibujarBloques();
  contenedorBloques.addEventListener('change', (evento) => {
    const fila = evento.target.closest('[data-dia-bloques]');
    if (!fila || evento.target.tagName !== 'SELECT') return;
    const dia = Number(fila.dataset.diaBloques);
    const bloques = leerDia(fila);
    const validacion = validarBloquesDia(bloques);
    if (!validacion.ok) {
      mostrarError(validacion.motivo);
      return;
    }
    semanaEditada[dia] = ordenarBloques(bloques);
    fila.querySelector('.total-bloques-dia').textContent = textoHoras(minutosDeBloques(semanaEditada[dia]));
    guardarBloques();
  });
  contenedorBloques.addEventListener('click', (evento) => {
    const fila = evento.target.closest('[data-dia-bloques]');
    if (!fila) return;
    const dia = Number(fila.dataset.diaBloques);
    if (evento.target.closest('[data-quitar-bloque]')) {
      const indice = [...fila.querySelectorAll('.bloque-horario')].indexOf(evento.target.closest('.bloque-horario'));
      const bloques = leerDia(fila);
      bloques.splice(indice, 1);
      semanaEditada[dia] = ordenarBloques(bloques);
      dibujarBloques();
      guardarBloques();
    } else if (evento.target.closest('[data-agregar-bloque]')) {
      const bloques = ordenarBloques(leerDia(fila));
      if (!validarBloquesDia(bloques).ok) {
        mostrarError(validarBloquesDia(bloques).motivo);
        return;
      }
      // El nuevo bloque va en el primer hueco de al menos una hora que deje un respiro de 30 min con los demás.
      const aMin = (h) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3));
      const aHHMM = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
      let candidato = null;
      if (bloques.length === 0) {
        candidato = [9 * 60, 17 * 60];
      } else {
        // Huecos: antes del primero, entre bloques y después del último (con 30 min de separación de cada bloque vecino).
        const huecos = [[0, aMin(bloques[0].inicio) - 30]];
        for (let i = 1; i < bloques.length; i += 1) huecos.push([aMin(bloques[i - 1].fin) + 30, aMin(bloques[i].inicio) - 30]);
        huecos.push([aMin(bloques[bloques.length - 1].fin) + 30, 24 * 60]);
        const hueco = huecos.find(([desde, hasta]) => hasta - desde >= 60);
        if (hueco) candidato = [hueco[0], Math.min(hueco[1], hueco[0] + 4 * 60)];
      }
      if (!candidato) {
        mostrarError('No hay lugar libre para otro bloque (tiene que haber al menos 1 hora y 30 minutos de separación entre bloques).');
        return;
      }
      semanaEditada[dia] = ordenarBloques([...bloques, { inicio: aHHMM(candidato[0]), fin: aHHMM(candidato[1]) }]);
      dibujarBloques();
      guardarBloques();
    } else if (evento.target.closest('[data-copiar-dia]')) {
      const bloques = ordenarBloques(leerDia(fila));
      const validacion = validarBloquesDia(bloques);
      if (!validacion.ok) {
        mostrarError(validacion.motivo);
        return;
      }
      semanaEditada = semanaEditada.map(() => bloques.map((b) => ({ ...b })));
      dibujarBloques();
      guardarBloques();
    }
  });

  seccion.querySelector('#horizonte-calendar').addEventListener('change', (evento) => guardar({ pref_horizonte_dias: Number(evento.target.value) }, { recalendar: true }));
  [['ignorar_todo_el_dia', 'pref_ignorar_todo_el_dia'], ['ignorar_rechazados', 'pref_ignorar_rechazados'], ['ignorar_disponible', 'pref_ignorar_disponible']].forEach(([nombre, clave]) => {
    seccion.querySelector(`[name="${nombre}"]`).addEventListener('change', (evento) => guardar({ [clave]: !evento.target.checked }));
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
