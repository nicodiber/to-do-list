import {
  estado,
  suscribir,
  suscribirSync,
  obtenerEstadoSync,
  inicializarAlmacenamiento,
  persistirYNotificar,
  conectarDrive,
  sincronizarAhora,
  limpiarRecienConectado,
  descartarAviso,
  descartarTodosLosAvisos,
  mezclarDatosViejos,
  descartarDatosViejos,
  hayTextoEnEdicion,
} from './almacenamiento.js';
import { pasarProximoContactoVencido, actualizarFechasInicioVencidas, tareasSoloConNombre } from './tareas-logica.js';
import {
  programarTareasSinFecha,
  reubicarTareasSolapadas,
  reprogramarTareaInmediataSiVencio,
  adelantarTareasSiHayHuecoMejor,
  reprogramarVencidas,
  reasignarUrgentesAHoy,
  reordenarSugeridasPorPrioridad,
} from './programador.js';
import { abrirCargaTareas } from './carga-tareas.js';
import { abrirAltaTarea } from './modal-tarea.js';
import { hayConexionGoogleCalendar, invalidarCacheEventos, leerEventosParaAgendar, errorLecturaCalendar, ultimaLecturaCalendar } from './google-calendar.js';
import { capturarBorradores, restaurarBorradores } from './borradores.js';
import { nombrarConCategoria, escaparHtml, tieneHora } from './utilidades.js';
import { hayToken, conectadoAlgunaVez } from './google-auth.js';
import { renderVistaResumen } from '../../views/resumen.view.js';
import { renderVistaAgendaConSelector } from '../../views/agenda.view.js';
import { renderVistaSemana } from '../../views/semana.view.js';
import { renderVistaTabla } from '../../views/tabla.view.js';
import { renderVistaCategorias } from '../../views/categorias.view.js';
import { renderVistaUbicaciones } from '../../views/ubicaciones.view.js';
import { renderVistaMetas } from '../../views/metas.view.js';
import { renderVistaGantt } from '../../views/gantt.view.js';
import { renderVistaPersonas } from '../../views/personas.view.js';
import { renderVistaEstadisticas } from '../../views/estadisticas.view.js';
import { renderVistaMejoras } from '../../views/mejoras.view.js';
import { renderVistaMemento } from '../../views/memento.view.js';
import { renderVistaAsistente } from '../../views/asistente.view.js';
import { configurarAtajos, teclaDeVista, tituloConTecla } from './atajos.js';
import { crearRevisorDeAvisos, abrirAvisosSync } from './avisos-sync.js';
import { filtrarSinHuecoVigente } from './aviso-sin-hueco.js';
import { copiaVencida, exportarJSON } from './almacenamiento.js';
import { activarSonidoDeClic } from './sonidos.js';
import { deshacer, rehacer, puedeDeshacer, puedeRehacer } from './deshacer.js';
import { renderVistaConfiguraciones } from '../../views/configuraciones.view.js';
import { avisar, confirmar } from './avisos.js';

// Mantener sincronizada con la última entrada de CHANGELOG.md (ver AGENTS.md).
const VERSION = 'v0.107.0';

const CONTENEDOR = document.getElementById('vista');
const NAV = document.getElementById('nav-vistas');
const INDICADOR_SYNC = document.getElementById('indicador-sync');
const BOTON_SYNC = document.getElementById('boton-sync');
const BOTON_DESHACER = document.getElementById('boton-deshacer');
const BOTON_REHACER = document.getElementById('boton-rehacer');
const BOTON_NUEVA_TAREA = document.getElementById('boton-nueva-tarea');
const BOTON_COMPLETAR_CARGA = document.getElementById('boton-completar-carga');
const CLAVE_LOCALSTORAGE_TEMA = 'super-todo-list:tema';

// El orden es el de las pestañas y el de sus atajos: las diez primeras se abren con las teclas 1…9 y 0 (ver atajos.js).
// Primero las de mirar el trabajo (por tiempo), después las de estructura y las de uso ocasional.
const VISTAS = {
  resumen: { etiqueta: '📌 Resumen', render: renderVistaResumen },
  agenda: { etiqueta: '📖 Agenda', render: renderVistaAgendaConSelector },
  semana: { etiqueta: '📆 Semana', render: renderVistaSemana },
  gantt: { etiqueta: '📊 Gantt', render: renderVistaGantt },
  tabla: { etiqueta: '🧾 Tabla', render: renderVistaTabla },
  metas: { etiqueta: '🏁 Metas', render: renderVistaMetas },
  estadisticas: { etiqueta: '📈 Estadísticas', render: renderVistaEstadisticas },
  mejoras: { etiqueta: '💡 Mejoras', render: renderVistaMejoras },
  personas: { etiqueta: '👥 Personas', render: renderVistaPersonas },
  ubicaciones: { etiqueta: '📍 Ubicaciones', render: renderVistaUbicaciones },
  categorias: { etiqueta: '🗂️ Categorías', render: renderVistaCategorias },
  memento: { etiqueta: '⏳ Memento mori', render: renderVistaMemento },
  asistente: { etiqueta: '🤖 Asistente', render: renderVistaAsistente },
  configuraciones: { etiqueta: '⚙️ Configuraciones', render: renderVistaConfiguraciones },
};

// Nombres viejos de vistas (por enlaces o marcadores guardados) que siguen llevando a la vista actual.
const ALIAS_VISTAS = { tareas: 'tabla', todas: 'tabla', informes: 'estadisticas', 'tres-dias': 'agenda', 'ocho-dias': 'agenda', hoy: 'resumen' };

// Vistas cuyo contenido ya es fluido (grilla, tabla) y aprovecha no tener el tope de ancho de `.vista` (v0.86.0).
const VISTAS_ANCHAS = ['semana', 'gantt', 'tabla'];

function vistaActual() {
  const pedida = location.hash.replace('#/', '');
  const clave = ALIAS_VISTAS[pedida] || pedida;
  return VISTAS[clave] ? clave : 'resumen';
}

function renderNav() {
  const actual = vistaActual();
  NAV.innerHTML = '';
  Object.entries(VISTAS).forEach(([clave, vista]) => {
    const enlace = document.createElement('a');
    enlace.href = `#/${clave}`;
    const [emoji, ...resto] = vista.etiqueta.split(' ');
    const nombre = resto.join(' ');
    // Mejoras (v0.100.0): sin pendientes no muestra "(0)"; con pendientes muestra la cantidad y se resalta.
    const mejorasPendientes = clave === 'mejoras' ? estado.mejoras.filter((m) => !m.mejora_aplicada).length : 0;
    const textoPendientes = mejorasPendientes > 0 ? ` (${mejorasPendientes})` : '';
    // Menú lateral (v0.102.0): el emoji siempre se ve; el nombre solo con el menú expandido.
    enlace.innerHTML = `<span class="nav-emoji" aria-hidden="true">${emoji}</span><span class="texto-sidebar"> ${escaparHtml(nombre)}${textoPendientes}</span>`;
    enlace.setAttribute('aria-label', `${nombre}${textoPendientes}`);
    enlace.title = tituloConTecla(`${nombre}${textoPendientes}`, teclaDeVista(clave, Object.keys(VISTAS)));
    enlace.className = `enlace-nav${clave === actual ? ' activo' : ''}${mejorasPendientes > 0 ? ' con-pendientes' : ''}`;
    if (clave === actual) enlace.setAttribute('aria-current', 'page');
    NAV.appendChild(enlace);
  });
}

const ETIQUETAS_ESTADO_SYNC = {
  'sin-destino': '⚪ Sin conectar',
  conectando: '⏳ Conectando…',
  verificando: '⏳ Verificando…',
  guardando: '⏳ Guardando…',
  pendiente: '🟡 Cambios sin subir a Drive',
  sincronizado: '✅ Sincronizado con Drive',
  'sin-conexion': '📴 Sin conexión',
  'sesion-vencida': '⚠️ Sesión de Google vencida',
  error: '⚠️ Error al sincronizar',
};

function escaparTexto(texto) {
  const div = document.createElement('div');
  div.textContent = texto == null ? '' : String(texto);
  return div.innerHTML;
}

function formatoCorto(iso) {
  if (!iso) return '—';
  const fecha = new Date(iso);
  const hora = `${String(fecha.getHours()).padStart(2, '0')}:${String(fecha.getMinutes()).padStart(2, '0')}`;
  if (fecha.toDateString() === new Date().toDateString()) return `hoy ${hora}`;
  return `${String(fecha.getDate()).padStart(2, '0')}/${String(fecha.getMonth() + 1).padStart(2, '0')} ${hora}`;
}

async function conectarConAviso() {
  try {
    await conectarDrive();
    await reprogramarSiCorresponde();
  } catch (error) {
    await avisar(error.message);
  }
}

let temporizadorRecienConectado = null;

const cantidadSinHorario = () => estado.tareas.filter((t) => t.tarea_estado !== 'completada' && !tieneHora(t.tarea_fecha_sugerida)).length;

/**
 * Estado de sincronización en el menú lateral (v0.102.0): siempre visible, sin redibujar la vista. Lo que antes eran
 * banners grandes (sesión vencida, Calendar sin leer, cambios de otro dispositivo, datos viejos, avisos…) ahora se
 * muestra una vez como ventana modal (ver `avisos-sync.js`); acá queda solo el estado permanente y los botones para actuar.
 */
function actualizarCabeceraSync() {
  const s = obtenerEstadoSync();
  const [icono, ...palabras] = (ETIQUETAS_ESTADO_SYNC[s.estado] || s.estado).split(' ');
  const sinHorario = cantidadSinHorario();
  const lecturaCalendar = ultimaLecturaCalendar();

  INDICADOR_SYNC.innerHTML = `
    <strong class="estado-sync" title="${escaparHtml(ETIQUETAS_ESTADO_SYNC[s.estado] || s.estado)}"><span aria-hidden="true">${icono}</span><span class="texto-sidebar"> ${escaparHtml(palabras.join(' '))}</span></strong>
    <span class="indicador-sync-detalle texto-sidebar">Último guardado en Drive: ${formatoCorto(s.modificadoEnDrive)} · Verificado: ${formatoCorto(s.verificadoEn)}</span>
    ${lecturaCalendar ? `<span class="indicador-sync-detalle texto-sidebar" title="Cuándo se leyeron por última vez tus eventos de Google Calendar (se refresca cada 5 minutos)">Calendar leído: ${formatoCorto(lecturaCalendar)}</span>` : ''}
    ${s.hayPendiente ? '<span class="indicador-sync-detalle texto-sidebar">Hay cambios que Drive todavía no confirmó.</span>' : ''}
    ${s.estado === 'sin-conexion' ? `<span class="indicador-sync-detalle texto-sidebar">Sin conexión: los cambios quedan pendientes y se suben al reconectar.${s.copiaDel ? ` Estás viendo tu copia local del ${formatoCorto(s.copiaDel)}.` : ''}</span>` : ''}
    ${sinHorario > 0 && s.estado !== 'sincronizado' ? `<span class="indicador-sync-detalle texto-sidebar">⏳ ${sinHorario === 1 ? '1 tarea espera' : `${sinHorario} tareas esperan`} su horario sugerido.</span>` : ''}
    ${s.recienConectado && s.estado === 'sincronizado' ? '<span class="indicador-sync-detalle texto-sidebar">✅ Conectado y sincronizado con Drive.</span>' : ''}
    ${
      s.estado === 'sesion-vencida'
        ? `<span class="indicador-sync-detalle texto-sidebar">${s.reconexionManual || !s.reconectaConClic ? 'Hace falta reconectar con Google.' : 'Se intenta reconectar con tu próximo clic.'}</span>
           <button type="button" class="boton-reconectar-cabecera" data-accion-sync="reconectar" title="Abrir la ventana de Google para volver a conectar"><span aria-hidden="true">🔑</span><span class="texto-sidebar"> Reconectar</span></button>`
        : ''
    }
    ${s.avisos.length > 0 ? `<button type="button" class="boton-avisos-sync" data-ver-avisos-sync title="Ver los avisos de sincronización"><span aria-hidden="true">⚠️</span><span class="texto-sidebar"> ${s.avisos.length} aviso${s.avisos.length === 1 ? '' : 's'} de sincronización</span></button>` : ''}
  `;
  if (s.recienConectado && s.estado === 'sincronizado') {
    clearTimeout(temporizadorRecienConectado);
    temporizadorRecienConectado = setTimeout(limpiarRecienConectado, 6000);
  }
  BOTON_SYNC.hidden = s.estado === 'sin-destino' || s.soloLectura;
  BOTON_SYNC.disabled = ['conectando', 'verificando', 'guardando'].includes(s.estado);
  BOTON_DESHACER.disabled = !puedeDeshacer();
  BOTON_REHACER.disabled = !puedeRehacer();

  revisarAvisos();
}

const revisarAvisos = crearRevisorDeAvisos({
  obtenerEstado: obtenerEstadoSync,
  contexto: {
    sinHorario: cantidadSinHorario,
    errorCalendar: () => (hayConexionGoogleCalendar() ? errorLecturaCalendar() : []),
    reconectar: () => conectarConAviso(),
    actualizar: () => sincronizarAhora({ forzar: true }),
    mezclarViejos: () => mezclarDatosViejos(),
    descartarViejos: async () => {
      if (await confirmar('¿Descartar los datos antiguos de este navegador? No se pueden recuperar después.', { peligro: true, textoAceptar: 'Descartar' })) descartarDatosViejos();
    },
    obtenerAvisos: () => obtenerEstadoSync().avisos,
    copiaVencida,
    exportar: exportarJSON,
  },
});

document.addEventListener('click', async (evento) => {
  const botonAvisos = evento.target.closest('[data-ver-avisos-sync]');
  if (botonAvisos) {
    abrirAvisosSync(() => obtenerEstadoSync().avisos);
    return;
  }
  const boton = evento.target.closest('[data-accion-sync="reconectar"]');
  if (!boton) return;
  try {
    await conectarConAviso();
  } catch (error) {
    await avisar(error.message);
  }
});

BOTON_SYNC.addEventListener('click', async () => {
  // Sin sesión de Google no hay nada que sincronizar: el clic abre la ventana de Google (un gesto del usuario, que sí
  // permite el popup) en vez de fallar en silencio.
  if (!hayToken() && conectadoAlgunaVez()) {
    await conectarConAviso();
    return;
  }
  refrescarCalendar();
  sincronizarAhora({ forzar: true });
});

BOTON_DESHACER.addEventListener('click', deshacer);
BOTON_REHACER.addEventListener('click', rehacer);

/**
 * Los eventos de Calendar se guardan unos minutos en memoria. Al sincronizar, volver a la pestaña o cada 5
 * minutos mientras la app sigue abierta, se olvidan y se reintenta reubicar/asignar/adelantar tareas activas
 * según lo que haya ahora en Calendar (`reubicarTareasSolapadas`/`programarTareasSinFecha`/
 * `adelantarTareasSiHayHuecoMejor` — antes de la v0.80.0/v0.81.0 corrían una sola vez al iniciar sesión, y
 * `programarTareasSinFecha` además no contemplaba las tareas "proyectadas" con fecha cargada sin hora). Sin
 * `alert()`: sería muy invasivo repetirlo cada tanto, mismo criterio que ya usa el intervalo de
 * `reprogramarTareaInmediataSiVencio`; el cambio se ve solo al redibujarse la vista activa. Si nada se movió
 * pero la caché sí se refrescó, se redibuja igual para que la vista (Semana, Agenda, Gantt, Resumen —
 * cualquiera, no solo Resumen como antes de la v0.80.0) muestre los eventos nuevos de Calendar. No se redibuja
 * con un diálogo abierto ni con texto a medio escribir.
 */
async function refrescarCalendar() {
  if (!hayConexionGoogleCalendar()) return;
  invalidarCacheEventos();
  const s = obtenerEstadoSync();
  if (!s.datosListos || s.soloLectura) return;
  if (document.querySelector('dialog[open]') || hayTextoEnEdicion()) return;
  // Tampoco si hay un panel a medio usar en la tarjeta (cerrar la tarea o elegir otra fecha).
  if (CONTENEDOR.querySelector('.panel-cierre, .panel-reprogramar')) return;

  await reprogramarSiCorresponde().catch(() => {}); // por si el agendado inicial quedó pendiente por falta de Calendar

  let cambio = false;
  try {
    const { movidas: reubicadas } = await reubicarTareasSolapadas(estado);
    const { asignadas, reordenadas } = await programarTareasSinFecha(estado);
    const { movidas: adelantadas } = await adelantarTareasSiHayHuecoMejor(estado);
    cambio = reubicadas.length > 0 || asignadas.length > 0 || reordenadas.length > 0 || adelantadas.length > 0;
  } catch {
    // Falla momentánea de red al pedir eventos: se reintenta en el próximo refresco.
  }

  if (cambio) await persistirYNotificar(); // ya redibuja
  else render(); // solo para reflejar los eventos nuevos de Calendar
  actualizarCabeceraSync(); // por si cambió el aviso de "no pude leer Calendar"
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') refrescarCalendar();
});

setInterval(refrescarCalendar, 5 * 60 * 1000);

function renderPantallaInicial(contenedor) {
  const s = obtenerEstadoSync();
  const conectando = s.estado === 'conectando';
  contenedor.innerHTML = `
    <section class="pantalla-inicial">
      <h2>☁️ Guardá tus datos en tu Google Drive</h2>
      <p>Super To-Do List guarda tus tareas en un archivo dentro de tu propio Google Drive, así las tenés al día en la PC y en el celular, y nunca dependen de un solo navegador.</p>
      <p class="ayuda">Vas a ver una ventana de Google que pide dos permisos: <strong>Drive</strong> (solo para el archivo que crea esta app) y <strong>Calendar</strong> (solo lectura, para avisarte de superposiciones con tus eventos).</p>
      ${s.datosViejosDisponibles ? '<p class="ayuda">📦 Encontré datos de una versión anterior en este navegador: se van a importar a tu Drive al conectar.</p>' : ''}
      ${s.mensajeError ? `<p class="aviso-bloqueada">${escaparTexto(s.mensajeError)}</p>` : ''}
      <button title="Conectar con tu cuenta de Google" type="button" id="boton-conectar-inicial" class="boton-primario" ${conectando ? 'disabled' : ''}>
        ${conectando ? '⏳ Conectando…' : '🔗 Conectar con Google Drive'}
      </button>
    </section>
  `;
  contenedor.querySelector('#boton-conectar-inicial').addEventListener('click', conectarConAviso);
}

let claveUltimoRender = '';

function claveDeRender(s) {
  return `${s.datosListos}|${s.soloLectura}|${!s.datosListos && s.estado === 'conectando'}`;
}

/** Botón "+" (siempre que haya datos) y "Completar carga de tareas (X)" (solo si X > 0). */
function actualizarBotonesTareas(s) {
  const disponible = s.datosListos && !s.soloLectura;
  BOTON_NUEVA_TAREA.hidden = !disponible;
  const pendientes = disponible ? tareasSoloConNombre(estado.tareas).length : 0;
  BOTON_COMPLETAR_CARGA.hidden = pendientes === 0;
  BOTON_COMPLETAR_CARGA.innerHTML = `<span aria-hidden="true">📝</span><span class="texto-sidebar"> Completar carga (${pendientes})</span>`;
  BOTON_COMPLETAR_CARGA.title = `Completar la carga de ${pendientes} tarea${pendientes === 1 ? '' : 's'} que quedaron con solo el nombre`;
}

let vistaDibujada = null;

function render({ conservarBorradores = false } = {}) {
  const s = obtenerEstadoSync();
  // Fundido de entrada solo al cambiar de módulo (v0.104.0).
  if (vistaDibujada !== null && vistaDibujada !== vistaActual()) {
    CONTENEDOR.classList.remove('vista-entrando');
    void CONTENEDOR.offsetWidth; // reinicia la animación
    CONTENEDOR.classList.add('vista-entrando');
  }
  vistaDibujada = vistaActual();
  // Cambios de otro dispositivo: se conserva todo lo escrito; acciones locales: solo los formularios
  // marcados (`data-conservar-borrador`, el alta de tareas), para que los demás se vacíen al agregar.
  const borradores = s.datosListos && !s.soloLectura ? capturarBorradores(CONTENEDOR, conservarBorradores ? {} : { soloEn: '[data-conservar-borrador]' }) : null;
  renderNav();
  CONTENEDOR.classList.toggle('vista-ancha', VISTAS_ANCHAS.includes(vistaActual()));
  actualizarBotonesTareas(s);
  actualizarCabeceraSync();
  claveUltimoRender = claveDeRender(s);
  if (s.soloLectura) {
    CONTENEDOR.innerHTML =
      '<section class="pantalla-inicial"><h2>🪟 Super To-Do List ya está abierta en otra pestaña</h2><p>Para que dos pestañas no se pisen los cambios, solo una puede editar a la vez. Cerrá la otra pestaña y recargá esta.</p></section>';
    return;
  }
  if (!s.datosListos) {
    renderPantallaInicial(CONTENEDOR);
    return;
  }
  VISTAS[vistaActual()].render(CONTENEDOR, estado);
  restaurarBorradores(CONTENEDOR, borradores);
}

// Los cambios de estado de sincronización solo actualizan la cabecera; la
// vista se redibuja únicamente cuando cambia lo que corresponde mostrar
// (pantalla inicial, aviso de otra pestaña o los datos ya listos).
suscribirSync((s) => {
  if (claveDeRender(s) !== claveUltimoRender) render();
  else actualizarCabeceraSync();
  // Al reconectar con Google (token nuevo) se puede leer Calendar: reintenta el agendado inicial si quedó pendiente.
  reprogramarSiCorresponde().catch(() => {});
});

let reprogramado = false;
let reprogramando = false;

function nombrarLista(tareas) {
  return tareas.map((t) => nombrarConCategoria(t, estado.categorias)).join(', ');
}

/**
 * Reprograma fechas vencidas y programa las tareas sin fecha, una sola vez por sesión, apenas hay datos cargados
 * **y una lectura confiable de Google Calendar** (v0.98.0): el permiso de Calendar vive solo en memoria, así que
 * al abrir la app suele no estar todavía — antes se agendaba igual, sin mirar ningún evento, y las tareas quedaban
 * encima de eventos "Ocupado". Ahora, si no se puede leer Calendar, no hace nada y se reintenta al reconectar (cambio
 * del estado de sincronización) o en el próximo refresco de Calendar.
 */
async function reprogramarSiCorresponde() {
  if (reprogramado || reprogramando || !obtenerEstadoSync().datosListos) return;
  reprogramando = true;
  try {
    const { listo } = await leerEventosParaAgendar();
    if (!listo) return;
    reprogramado = true;
    await ejecutarReprogramacionInicial();
  } finally {
    reprogramando = false;
  }
}

function textoFijasEnChoque(fijasEnChoque) {
  return `📌 Fijaste un horario que choca con un evento de Calendar y lo dejé donde está: ${nombrarLista(fijasEnChoque.map((f) => f.tarea))}. Si querés que lo mueva, soltá el 📌 desde su edición.`;
}

async function ejecutarReprogramacionInicial() {
  const inicioActualizadas = actualizarFechasInicioVencidas(estado.tareas);
  const { reprogramadas: vencidas, sinHueco: sinHuecoVencidas, inconsistentes: inconsistentesVencidas } = await reprogramarVencidas(estado);
  const { movidas: reubicadas, sinHueco: sinHuecoReubicadas, inconsistentes: inconsistentesReubicadas, fijasEnChoque } = await reubicarTareasSolapadas(estado);
  const { asignadas: nuevas, sinHueco: sinHuecoNuevas, reordenadas: reordenadasAntes } = await programarTareasSinFecha(estado);
  const inmediata = await reprogramarTareaInmediataSiVencio(estado);
  const urgentesReasignadas = await reasignarUrgentesAHoy(estado);
  // Las urgentes se agendan para hoy en el primer hueco libre: un último pase por si quedaron detrás de otra menos prioritaria.
  const reordenadasDespues = await reordenarSugeridasPorPrioridad(estado);
  const reordenadas = [...reordenadasAntes, ...reordenadasDespues];
  const personasAfectadas = pasarProximoContactoVencido(estado.personas);

  const sinHuecoBruto = [...sinHuecoVencidas, ...sinHuecoReubicadas, ...sinHuecoNuevas];
  const inconsistentes = [...inconsistentesVencidas, ...inconsistentesReubicadas];
  if (inmediata) {
    if (inmediata.sinHueco) sinHuecoBruto.push(inmediata.tarea);
    else vencidas.push(inmediata.tarea);
    inconsistentes.push(...inmediata.inconsistentes);
  }

  if (
    vencidas.length === 0 &&
    nuevas.length === 0 &&
    reubicadas.length === 0 &&
    sinHuecoBruto.length === 0 &&
    inconsistentes.length === 0 &&
    personasAfectadas.length === 0 &&
    inicioActualizadas.length === 0 &&
    urgentesReasignadas.length === 0 &&
    reordenadas.length === 0
  ) {
    if (fijasEnChoque.length > 0) await avisar(textoFijasEnChoque(fijasEnChoque));
    return;
  }
  await persistirYNotificar();

  // Solo se nombran las que siguen sin hueco tras TODOS los pasos (un paso posterior pudo acomodar lo que uno anterior no).
  const sinHueco = filtrarSinHuecoVigente(sinHuecoBruto);
  const partes = [];
  if (nuevas.length > 0) partes.push(`se programó la fecha sugerida de ${nombrarLista(nuevas)}`);
  if (vencidas.length > 0) partes.push(`se reprogramó la de ${nombrarLista(vencidas)} (había vencido)`);
  if (reubicadas.length > 0) partes.push(`se reubicó la de ${nombrarLista(reubicadas)} (chocaba con Calendar)`);
  let mensaje = partes.length > 0 ? `Al iniciar: ${partes.join('; ')}.` : '';
  if (sinHueco.length > 0) {
    mensaje += `${mensaje ? '\n\n' : ''}⚠️ No hay hueco libre antes de su fecha límite para: ${nombrarLista(sinHueco)}. Revisalas a mano.`;
  }
  // Las "inconsistentes" (sugerida después del límite tras un corrimiento en cascada) ya no se avisan acá
  // (v0.89.0): quedan siempre visibles en la sección "⚠️ Sin hueco antes del límite" de Resumen, en vez de un
  // aviso único que se puede perder. `inconsistentes.length` sigue contando para decidir si hay que persistir.
  if (fijasEnChoque.length > 0) mensaje += `${mensaje ? '\n\n' : ''}${textoFijasEnChoque(fijasEnChoque)}`;
  if (mensaje) await avisar(mensaje);
}

/**
 * Mientras la app sigue abierta, cada 1-2 minutos revisa si la tarea más inmediata ya superó su ventana
 * estimada sin completarse (`reprogramarTareaInmediataSiVencio`) y, si la reprogramó, persiste en silencio
 * (sin `alert()`: sería muy invasivo repetirlo cada tanto; el cambio se ve solo en la próxima vista que se
 * redibuje, y mientras tanto la tarea sigue visible como vencida en Hoy).
 */
setInterval(async () => {
  const s = obtenerEstadoSync();
  if (!s.datosListos || s.soloLectura) return;
  const resultado = await reprogramarTareaInmediataSiVencio(estado);
  if (resultado && !resultado.sinHueco) await persistirYNotificar();
}, 90 * 1000);

document.getElementById('version-app').textContent = VERSION;
activarSonidoDeClic();

// Menú lateral (v0.102.0): se compacta a solo emojis (se recuerda en este navegador) y, en pantallas angostas, se abre
// como un panel encima del contenido desde el botón ☰.
const CLAVE_SIDEBAR_COMPACTO = 'super-todo-list:sidebar-compacto';
const BOTON_COMPACTAR = document.getElementById('boton-compactar-sidebar');
function aplicarSidebarCompacto(compacto) {
  document.body.classList.toggle('sidebar-compacto', compacto);
  BOTON_COMPACTAR.textContent = compacto ? '»' : '«';
  BOTON_COMPACTAR.title = compacto ? 'Expandir el menú' : 'Compactar el menú';
  BOTON_COMPACTAR.setAttribute('aria-label', BOTON_COMPACTAR.title);
}
let sidebarCompacto = false;
try {
  sidebarCompacto = localStorage.getItem(CLAVE_SIDEBAR_COMPACTO) === '1';
} catch {
  // Es solo una preferencia de pantalla.
}
aplicarSidebarCompacto(sidebarCompacto);
BOTON_COMPACTAR.addEventListener('click', () => {
  sidebarCompacto = !sidebarCompacto;
  aplicarSidebarCompacto(sidebarCompacto);
  try {
    localStorage.setItem(CLAVE_SIDEBAR_COMPACTO, sidebarCompacto ? '1' : '0');
  } catch {
    // Sin almacenamiento local se vuelve a expandir al recargar.
  }
});
const VELO_SIDEBAR = document.getElementById('velo-sidebar');
function alternarMenuMovil(abierto) {
  document.body.classList.toggle('menu-abierto', abierto);
  VELO_SIDEBAR.hidden = !abierto;
  document.getElementById('boton-menu-movil').setAttribute('aria-expanded', String(abierto));
}
document.getElementById('boton-menu-movil').addEventListener('click', () => alternarMenuMovil(!document.body.classList.contains('menu-abierto')));
VELO_SIDEBAR.addEventListener('click', () => alternarMenuMovil(false));
window.addEventListener('hashchange', () => alternarMenuMovil(false));

window.addEventListener('hashchange', () => render());
/**
 * Red de seguridad (v0.99.0): ninguna tarea activa debe quedar sin hora sugerida. Tras cada cambio de datos, con un
 * pequeño debounce, si hay tareas sin hora y se puede leer Calendar, las agenda (sin reordenar las ya agendadas, para
 * no deshacerle al usuario lo que acaba de mover) y guarda. Cubre los caminos que no llaman al agendado (el clon de
 * una tarea de mantenimiento al completarla, datos de otro dispositivo, etc.). Sin Calendar no hace nada (queda
 * pendiente, ver `leerEventosParaAgendar`); sin tareas por agendar no guarda, así que no hay bucle.
 */
let temporizadorAgendado = null;
let agendandoPendientes = false;

function agendarPendientesPronto() {
  clearTimeout(temporizadorAgendado);
  temporizadorAgendado = setTimeout(agendarPendientes, 600);
}

async function agendarPendientes() {
  const s = obtenerEstadoSync();
  if (agendandoPendientes || reprogramando || !s.datosListos || s.soloLectura) return;
  if (!estado.tareas.some((t) => t.tarea_estado !== 'completada' && !tieneHora(t.tarea_fecha_sugerida))) return;
  if (document.querySelector('dialog[open]') || hayTextoEnEdicion()) return;
  agendandoPendientes = true;
  try {
    const { asignadas } = await programarTareasSinFecha(estado, { reordenar: false });
    if (asignadas.length > 0) await persistirYNotificar({ deshacer: false });
  } catch {
    // Falla momentánea: se reintenta en el próximo cambio o refresco.
  } finally {
    agendandoPendientes = false;
  }
}

suscribir((_estado, opciones) => {
  render(opciones);
  agendarPendientesPronto();
});

/** Abre la ventana de nueva tarea encima de la vista actual: la usan el botón "＋" y el atajo "N". */
function abrirNuevaTarea() {
  if (BOTON_NUEVA_TAREA.hidden) return; // sin datos listos o en solo lectura no hay alta
  if (document.querySelector('dialog[open]')) return; // ya hay una ventana abierta
  abrirAltaTarea();
}

BOTON_NUEVA_TAREA.addEventListener('click', abrirNuevaTarea);
BOTON_COMPLETAR_CARGA.addEventListener('click', abrirCargaTareas);

// Atajos de teclado (teclas solas, con el foco fuera de un campo): ver atajos.js, que también arma la ventana de ayuda.
configurarAtajos({
  vistas: Object.keys(VISTAS),
  etiquetas: Object.fromEntries(Object.entries(VISTAS).map(([clave, vista]) => [clave, vista.etiqueta])),
  irAVista: (clave) => {
    location.hash = `#/${clave}`;
  },
  abrirNuevaTarea,
  puedeUsarse: () => {
    const s = obtenerEstadoSync();
    return s.datosListos && !s.soloLectura;
  },
  deshacer,
  rehacer,
  puedeDeshacer,
  puedeRehacer,
});

function temaEfectivo() {
  const guardado = localStorage.getItem(CLAVE_LOCALSTORAGE_TEMA);
  if (guardado === 'claro' || guardado === 'oscuro') return guardado;
  // Sin elección guardada la app se abre en oscuro (es como se usa casi siempre), aunque el sistema esté en claro.
  return 'oscuro';
}

function aplicarTema(tema) {
  document.documentElement.dataset.tema = tema;
  const colorTema = document.querySelector('meta[name="theme-color"]');
  if (colorTema) colorTema.content = tema === 'oscuro' ? '#1c1f27' : '#ffffff';
}

let temaActual = temaEfectivo();
aplicarTema(temaActual);

/** Tema actual ('oscuro' | 'claro'). Lo usa Configuraciones para el interruptor. */
export function obtenerTema() {
  return temaActual;
}

/** Cambia el tema, lo guarda en este dispositivo y lo aplica. */
export function establecerTema(tema) {
  temaActual = tema === 'claro' ? 'claro' : 'oscuro';
  localStorage.setItem(CLAVE_LOCALSTORAGE_TEMA, temaActual);
  aplicarTema(temaActual);
}

inicializarAlmacenamiento().then(reprogramarSiCorresponde);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch((error) => {
    console.warn('No se pudo registrar el service worker:', error);
  });
}
