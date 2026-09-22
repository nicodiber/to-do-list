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
import { reprogramarFechasSugeridasVencidas, tareasSoloConNombre } from './tareas-logica.js';
import { abrirCargaTareas } from './carga-tareas.js';
import { abrirAltaTarea } from './modal-tarea.js';
import { hayConexionGoogleCalendar, invalidarCacheEventos } from './google-calendar.js';
import { capturarBorradores, restaurarBorradores } from './borradores.js';
import { renderVistaHoy } from '../../views/hoy.view.js';
import { renderVistaAgendaConSelector } from '../../views/agenda.view.js';
import { renderVistaSemana } from '../../views/semana.view.js';
import { renderVistaTareas } from '../../views/tareas.view.js';
import { renderVistaTabla } from '../../views/tabla.view.js';
import { renderVistaCategorias } from '../../views/categorias.view.js';
import { renderVistaUbicaciones } from '../../views/ubicaciones.view.js';
import { renderVistaMetas } from '../../views/metas.view.js';
import { renderVistaGantt } from '../../views/gantt.view.js';
import { renderVistaPersonas } from '../../views/personas.view.js';
import { renderVistaEstadisticas } from '../../views/estadisticas.view.js';
import { renderVistaMejoras } from '../../views/mejoras.view.js';
import { configurarAtajos, abrirAyudaAtajos, teclaDeVista, tituloConTecla } from './atajos.js';
import { renderVistaConfiguraciones } from '../../views/configuraciones.view.js';

// Mantener sincronizada con la última entrada de CHANGELOG.md (ver AGENTS.md).
const VERSION = 'v0.64.0';

const CONTENEDOR = document.getElementById('vista');
const NAV = document.getElementById('nav-vistas');
const INDICADOR_SYNC = document.getElementById('indicador-sync');
const BOTON_SYNC = document.getElementById('boton-sync');
const BANNER_SYNC = document.getElementById('banner-sync');
const PANEL_AVISOS = document.getElementById('panel-avisos');
const BOTON_NUEVA_TAREA = document.getElementById('boton-nueva-tarea');
const BOTON_COMPLETAR_CARGA = document.getElementById('boton-completar-carga');
const CLAVE_LOCALSTORAGE_TEMA = 'super-todo-list:tema';

// El orden es el de las pestañas y el de sus atajos: las diez primeras se abren con las teclas 1…9 y 0 (ver atajos.js).
// Primero las de mirar el trabajo (por tiempo), después las de estructura y las de uso ocasional.
const VISTAS = {
  hoy: { etiqueta: '📌 Hoy', render: renderVistaHoy },
  agenda: { etiqueta: '🗓️ Agenda', render: renderVistaAgendaConSelector },
  semana: { etiqueta: '📆 Semana', render: renderVistaSemana },
  gantt: { etiqueta: '📊 Gantt', render: renderVistaGantt },
  tabla: { etiqueta: '🧾 Tabla', render: renderVistaTabla },
  categorias: { etiqueta: '🗂️ Categorías', render: renderVistaCategorias },
  ubicaciones: { etiqueta: '📍 Ubicaciones', render: renderVistaUbicaciones },
  metas: { etiqueta: '🏁 Metas', render: renderVistaMetas },
  tareas: { etiqueta: '✅ Tareas', render: renderVistaTareas },
  estadisticas: { etiqueta: '📈 Estadísticas', render: renderVistaEstadisticas },
  mejoras: { etiqueta: '💡 Mejoras', render: renderVistaMejoras },
  personas: { etiqueta: '👥 Personas', render: renderVistaPersonas },
  configuraciones: { etiqueta: '⚙️ Configuraciones', render: renderVistaConfiguraciones },
};

// Nombres viejos de vistas (por enlaces o marcadores guardados) que siguen llevando a la vista actual.
const ALIAS_VISTAS = { todas: 'tabla', informes: 'estadisticas', 'tres-dias': 'agenda', 'ocho-dias': 'agenda' };

function vistaActual() {
  const pedida = location.hash.replace('#/', '');
  const clave = ALIAS_VISTAS[pedida] || pedida;
  return VISTAS[clave] ? clave : 'hoy';
}

function renderNav() {
  const actual = vistaActual();
  NAV.innerHTML = '';
  Object.entries(VISTAS).forEach(([clave, vista]) => {
    const enlace = document.createElement('a');
    enlace.href = `#/${clave}`;
    enlace.textContent = vista.etiqueta;
    enlace.title = tituloConTecla(vista.etiqueta.replace(/^\S+\s/, ''), teclaDeVista(clave, Object.keys(VISTAS)));
    enlace.className = clave === actual ? 'enlace-nav activo' : 'enlace-nav';
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
    alert(error.message);
  }
}

let temporizadorRecienConectado = null;

/** Cabecera: estado de guardado siempre visible, más banners y panel de avisos. Sin redibujar la vista. */
function actualizarCabeceraSync() {
  const s = obtenerEstadoSync();

  INDICADOR_SYNC.innerHTML = `
    <strong>${ETIQUETAS_ESTADO_SYNC[s.estado] || s.estado}</strong>
    <span class="indicador-sync-detalle">Último guardado en Drive: ${formatoCorto(s.modificadoEnDrive)} · Verificado: ${formatoCorto(s.verificadoEn)}</span>
    ${s.hayPendiente ? '<span class="indicador-sync-detalle">Hay cambios que Drive todavía no confirmó.</span>' : ''}
  `;
  BOTON_SYNC.hidden = s.estado === 'sin-destino' || s.soloLectura;
  BOTON_SYNC.disabled = ['conectando', 'verificando', 'guardando'].includes(s.estado);

  const banners = [];
  if (s.estado === 'sin-conexion' || s.estado === 'sesion-vencida') {
    const copia = s.copiaDel ? ` Estás viendo tu copia local de la última sincronización (${formatoCorto(s.copiaDel)}).` : '';
    banners.push(
      s.estado === 'sin-conexion'
        ? `<p>📴 Sin conexión con Drive.${copia} Podés seguir usando la app: los cambios quedan pendientes y se suben al reconectar.</p>`
        : s.reconectaConClic
          ? `<p>🔑 Falta reconectar con Google: hacé clic en cualquier parte de la página (o en el botón) y se sincroniza solo.${copia} Mientras tanto podés seguir usando la app: los cambios quedan pendientes.
             <button type="button" data-accion-sync="reconectar" title="Abrir la ventana de Google para volver a conectar">Reconectar Drive</button></p>`
          : `<p>🔑 La sesión de Google venció o todavía no se abrió.${copia} Podés seguir usando la app: los cambios quedan pendientes y se suben al reconectar.
             <button type="button" data-accion-sync="reconectar" title="Abrir la ventana de Google para volver a conectar">Reconectar Drive</button></p>`
    );
  }
  if (s.recienConectado && s.estado === 'sincronizado') {
    banners.push('<p>✅ Conectado y sincronizado con Drive.</p>');
    clearTimeout(temporizadorRecienConectado);
    temporizadorRecienConectado = setTimeout(limpiarRecienConectado, 6000);
  }
  if (s.cambiosRemotosDisponibles) {
    banners.push('<p>🔄 Hay cambios de otro dispositivo. <button type="button" data-accion-sync="actualizar" title="Traer los cambios del otro dispositivo (puede reemplazar lo que estás viendo)">🔄 Actualizar</button></p>');
  }
  if (s.datosViejosDisponibles && s.datosListos) {
    banners.push(
      `<p>📦 Encontré datos de una versión anterior guardados en este navegador. Antes se guardaban acá; ahora todo vive en Drive.
      <button type="button" data-accion-sync="mezclar-viejos" title="Sumar esos datos viejos a los que ya hay en Drive">🔀 Mezclarlos con Drive</button>
      <button type="button" data-accion-sync="descartar-viejos" title="Borrar esos datos viejos de este navegador (pide confirmación)">🗑️ Descartarlos</button></p>`
    );
  }
  if (s.relojDesfasado) {
    const minutos = Math.round(Math.abs(s.desfaseRelojMs) / 60000);
    banners.push(
      `<p>⏰ El reloj de este dispositivo está ${s.desfaseRelojMs > 0 ? 'adelantado' : 'atrasado'} unos ${minutos} min respecto de Google: puede afectar qué versión gana al mezclar cambios entre dispositivos.</p>`
    );
  }
  if (s.mensajeError) banners.push(`<p>⚠️ ${escaparTexto(s.mensajeError)}</p>`);
  if (!s.almacenamientoLocalDisponible) {
    banners.push('<p>⚠️ Este navegador no permite guardar una copia temporal: si perdés la conexión, los cambios sin subir se perderían al cerrar la pestaña.</p>');
  }
  if (s.avisos.length > 0) {
    banners.push(
      `<p>⚠️ Tenés ${s.avisos.length} aviso${s.avisos.length === 1 ? '' : 's'} de sincronización. <button type="button" data-accion-sync="ver-avisos" title="Ver los avisos de sincronización">👁️ Ver</button></p>`
    );
  }
  BANNER_SYNC.innerHTML = banners.join('');
  BANNER_SYNC.hidden = banners.length === 0;

  if (s.avisos.length === 0) {
    PANEL_AVISOS.hidden = true;
    PANEL_AVISOS.innerHTML = '';
  } else if (!PANEL_AVISOS.hidden) {
    renderPanelAvisos(s.avisos);
  }
}

function renderPanelAvisos(avisos) {
  PANEL_AVISOS.innerHTML = `
    <h3>Avisos de sincronización</h3>
    <p class="ayuda">Nada se pierde en silencio: acá queda registrado lo que se resolvió al mezclar cambios de distintos dispositivos. Descartá cada aviso cuando lo hayas revisado.</p>
    <ul>
      ${avisos
        .map(
          (aviso) => `
        <li>
          <p>${escaparTexto(aviso.mensaje)} <small>(${formatoCorto(aviso.creado_en)})</small></p>
          ${
            aviso.camposDescartados && aviso.camposDescartados.length > 0
              ? `<ul>${aviso.camposDescartados.map((c) => `<li>Se descartó <code>${escaparTexto(c.campo)}</code>: ${escaparTexto(c.valorDescartado)}</li>`).join('')}</ul>`
              : ''
          }
          <button type="button" data-descartar-aviso="${escaparTexto(aviso.id)}" title="Marcar este aviso como revisado">🗑️ Descartar</button>
        </li>`
        )
        .join('')}
    </ul>
    <button type="button" data-accion-sync="descartar-todos" title="Marcar todos los avisos como revisados">🗑️ Descartar todos</button>
    <button type="button" data-accion-sync="cerrar-avisos" title="Cerrar el panel de avisos">✖️ Cerrar</button>
  `;
}

document.addEventListener('click', async (evento) => {
  const boton = evento.target.closest('[data-accion-sync], [data-descartar-aviso]');
  if (!boton) return;
  const accion = boton.dataset.accionSync;
  try {
    if (boton.dataset.descartarAviso) {
      await descartarAviso(boton.dataset.descartarAviso);
    } else if (accion === 'reconectar') {
      await conectarConAviso();
    } else if (accion === 'actualizar') {
      await sincronizarAhora({ forzar: true });
    } else if (accion === 'mezclar-viejos') {
      await mezclarDatosViejos();
    } else if (accion === 'descartar-viejos') {
      if (confirm('¿Descartar los datos antiguos de este navegador? No se pueden recuperar después.')) descartarDatosViejos();
    } else if (accion === 'ver-avisos') {
      renderPanelAvisos(obtenerEstadoSync().avisos);
      PANEL_AVISOS.hidden = false;
    } else if (accion === 'cerrar-avisos') {
      PANEL_AVISOS.hidden = true;
    } else if (accion === 'descartar-todos') {
      await descartarTodosLosAvisos();
    }
  } catch (error) {
    alert(error.message);
  }
});

BOTON_SYNC.addEventListener('click', () => {
  refrescarCalendar();
  sincronizarAhora({ forzar: true });
});

/**
 * Los eventos de Calendar se guardan unos minutos en memoria. Al sincronizar o volver a la pestaña se
 * olvidan y, si se está mirando Hoy (donde aparecen los avisos de superposición), se redibuja para
 * que reflejen lo que hay ahora en Calendar. No se redibuja con un diálogo abierto ni con texto a medio escribir.
 */
function refrescarCalendar() {
  if (!hayConexionGoogleCalendar()) return;
  invalidarCacheEventos();
  const s = obtenerEstadoSync();
  if (vistaActual() !== 'hoy' || !s.datosListos || s.soloLectura) return;
  if (document.querySelector('dialog[open]') || hayTextoEnEdicion()) return;
  // Tampoco si hay un panel a medio usar en la tarjeta (cerrar la tarea o elegir otra fecha).
  if (CONTENEDOR.querySelector('.panel-cierre, .panel-reprogramar')) return;
  render();
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') refrescarCalendar();
});

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
  BOTON_COMPLETAR_CARGA.textContent = `📝 Completar carga de tareas (${pendientes})`;
}

function render({ conservarBorradores = false } = {}) {
  const s = obtenerEstadoSync();
  // Cambios de otro dispositivo: se conserva todo lo escrito; acciones locales: solo los formularios
  // marcados (`data-conservar-borrador`, el alta de tareas), para que los demás se vacíen al agregar.
  const borradores = s.datosListos && !s.soloLectura ? capturarBorradores(CONTENEDOR, conservarBorradores ? {} : { soloEn: '[data-conservar-borrador]' }) : null;
  renderNav();
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
});

let reprogramado = false;

/** Reprograma fechas sugeridas vencidas una sola vez por sesión, apenas hay datos cargados. */
async function reprogramarSiCorresponde() {
  if (reprogramado || !obtenerEstadoSync().datosListos) return;
  reprogramado = true;
  const afectadas = reprogramarFechasSugeridasVencidas(estado.tareas);
  if (afectadas.length > 0) {
    await persistirYNotificar();
    alert(`Se reprogramó la fecha sugerida de ${afectadas.length} tarea${afectadas.length === 1 ? '' : 's'} que había vencido.`);
  }
}

document.getElementById('version-app').textContent = VERSION;

window.addEventListener('hashchange', () => render());
suscribir((_estado, opciones) => render(opciones));

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
});
document.getElementById('boton-atajos').addEventListener('click', abrirAyudaAtajos);

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
