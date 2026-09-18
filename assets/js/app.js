import {
  estado,
  suscribir,
  inicializarAlmacenamiento,
  persistirYNotificar,
  elegirCarpetaDatos,
  exportarJSON,
  importarJSON,
  soportaFileSystemAccess,
  hayCarpetaDatosElegida,
  soportaGoogleDrive,
  hayConexionDrive,
  conectarDrive,
} from './almacenamiento.js';
import { reprogramarFechasSugeridasVencidas } from './tareas-logica.js';
import { renderVistaHoy } from '../../views/hoy.view.js';
import { renderVistaTresDias } from '../../views/tres-dias.view.js';
import { renderVistaOchoDias } from '../../views/ocho-dias.view.js';
import { renderVistaSemana } from '../../views/semana.view.js';
import { renderVistaTareas } from '../../views/tareas.view.js';
import { renderVistaTodas } from '../../views/todas.view.js';
import { renderVistaCategorias } from '../../views/categorias.view.js';
import { renderVistaUbicaciones } from '../../views/ubicaciones.view.js';
import { renderVistaMetas } from '../../views/metas.view.js';
import { renderVistaGantt } from '../../views/gantt.view.js';
import { renderVistaPersonas } from '../../views/personas.view.js';
import { renderVistaInformes } from '../../views/informes.view.js';

// Mantener sincronizada con la última entrada de CHANGELOG.md (ver AGENTS.md).
const VERSION = 'v0.49.0';

const CONTENEDOR = document.getElementById('vista');
const NAV = document.getElementById('nav-vistas');
const ESTADO_CONEXION = document.getElementById('estado-conexion');
const BOTON_TEMA = document.getElementById('boton-tema');
const BOTON_DRIVE = document.getElementById('boton-drive');
const CLAVE_LOCALSTORAGE_TEMA = 'super-todo-list:tema';

const VISTAS = {
  hoy: { etiqueta: 'Hoy', render: renderVistaHoy },
  'tres-dias': { etiqueta: '3 días', render: renderVistaTresDias },
  'ocho-dias': { etiqueta: '8 días', render: renderVistaOchoDias },
  semana: { etiqueta: 'Semana', render: renderVistaSemana },
  tareas: { etiqueta: 'Tareas', render: renderVistaTareas },
  todas: { etiqueta: 'Todas', render: renderVistaTodas },
  categorias: { etiqueta: 'Categorías', render: renderVistaCategorias },
  ubicaciones: { etiqueta: 'Ubicaciones', render: renderVistaUbicaciones },
  metas: { etiqueta: 'Metas', render: renderVistaMetas },
  gantt: { etiqueta: 'Gantt', render: renderVistaGantt },
  personas: { etiqueta: 'Personas', render: renderVistaPersonas },
  informes: { etiqueta: 'Informes', render: renderVistaInformes },
};

function vistaActual() {
  const clave = location.hash.replace('#/', '');
  return VISTAS[clave] ? clave : 'hoy';
}

function renderNav() {
  const actual = vistaActual();
  NAV.innerHTML = '';
  Object.entries(VISTAS).forEach(([clave, vista]) => {
    const enlace = document.createElement('a');
    enlace.href = `#/${clave}`;
    enlace.textContent = vista.etiqueta;
    enlace.className = clave === actual ? 'enlace-nav activo' : 'enlace-nav';
    NAV.appendChild(enlace);
  });
}

function actualizarEstadoConexion() {
  if (!soportaFileSystemAccess) {
    ESTADO_CONEXION.textContent = 'Tu navegador no soporta elegir carpeta de datos. Usá exportar/importar JSON.';
  } else if (hayCarpetaDatosElegida()) {
    ESTADO_CONEXION.textContent = 'Guardando en tu carpeta de datos elegida.';
  } else {
    ESTADO_CONEXION.textContent = 'Sin carpeta de datos elegida (por ahora se guarda solo en este navegador).';
  }
}

function actualizarBotonDrive() {
  if (!soportaGoogleDrive()) {
    BOTON_DRIVE.hidden = true;
    return;
  }
  BOTON_DRIVE.textContent = hayConexionDrive() ? 'Drive: sincronizado ✓' : 'Sincronizar con Google Drive';
}

function render() {
  renderNav();
  actualizarEstadoConexion();
  actualizarBotonDrive();
  VISTAS[vistaActual()].render(CONTENEDOR, estado);
}

document.getElementById('version-app').textContent = VERSION;

window.addEventListener('hashchange', render);
suscribir(render);

// Atajo de teclado "N" (sin modificador) para crear una tarea rápido sin
// usar el mouse. Ctrl+N está reservado por el navegador (nueva ventana),
// por eso se usa la tecla sola — mismo patrón que Gmail/Linear/Notion.
// Se ignora si el foco está en un campo editable, para no interferir al
// escribir "n" dentro de cualquier input/textarea/select de la app.
let enfocarAltaRapidaAlEntrar = false;

function enfocarAltaRapida() {
  const input = document.querySelector('#form-alta-rapida input[name="tarea_nombre"]');
  if (input) input.focus();
}

window.addEventListener('hashchange', () => {
  if (enfocarAltaRapidaAlEntrar && vistaActual() === 'tareas') {
    enfocarAltaRapidaAlEntrar = false;
    enfocarAltaRapida();
  }
});

window.addEventListener('keydown', (evento) => {
  if (evento.ctrlKey || evento.altKey || evento.metaKey) return;
  if (evento.key !== 'n' && evento.key !== 'N') return;
  const objetivo = evento.target;
  const enCampo =
    objetivo instanceof HTMLElement &&
    (objetivo.tagName === 'INPUT' ||
      objetivo.tagName === 'TEXTAREA' ||
      objetivo.tagName === 'SELECT' ||
      objetivo.isContentEditable);
  if (enCampo) return;

  evento.preventDefault();
  if (vistaActual() === 'tareas') {
    enfocarAltaRapida();
  } else {
    enfocarAltaRapidaAlEntrar = true;
    location.hash = '#/tareas';
  }
});

document.getElementById('boton-elegir-carpeta').addEventListener('click', async () => {
  try {
    await elegirCarpetaDatos();
  } catch (error) {
    alert(error.message);
  }
});

BOTON_DRIVE.addEventListener('click', async () => {
  try {
    await conectarDrive();
  } catch (error) {
    alert(error.message);
  }
  actualizarBotonDrive();
});

document.getElementById('boton-exportar').addEventListener('click', exportarJSON);

document.getElementById('input-importar').addEventListener('change', async (evento) => {
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

function temaEfectivo() {
  const guardado = localStorage.getItem(CLAVE_LOCALSTORAGE_TEMA);
  if (guardado === 'claro' || guardado === 'oscuro') return guardado;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'oscuro' : 'claro';
}

function aplicarTema(tema) {
  document.documentElement.dataset.tema = tema;
  BOTON_TEMA.textContent = tema === 'oscuro' ? '☀️ Modo claro' : '🌙 Modo oscuro';
}

let temaActual = temaEfectivo();
aplicarTema(temaActual);

BOTON_TEMA.addEventListener('click', () => {
  temaActual = temaActual === 'oscuro' ? 'claro' : 'oscuro';
  localStorage.setItem(CLAVE_LOCALSTORAGE_TEMA, temaActual);
  aplicarTema(temaActual);
});

// El script de Google Identity Services (index.html) carga en paralelo
// (async/defer): si todavía no terminó cuando corre el primer render(),
// el botón de Drive queda oculto por soportaGoogleDrive() === false y
// nada lo vuelve a mostrar. Ese script es el único <script src> externo
// de la página, así que lo identificamos por su origen en vez de un id.
const scriptGoogleIdentity = document.querySelector('script[src^="https://accounts.google.com/gsi/client"]');
if (scriptGoogleIdentity) {
  scriptGoogleIdentity.addEventListener('load', () => {
    actualizarBotonDrive();
    render();
  });
}

inicializarAlmacenamiento().then(async () => {
  const afectadas = reprogramarFechasSugeridasVencidas(estado.tareas);
  if (afectadas.length > 0) {
    await persistirYNotificar();
    alert(`Se reprogramó la fecha sugerida de ${afectadas.length} tarea${afectadas.length === 1 ? '' : 's'} que había vencido.`);
  }
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch((error) => {
    console.warn('No se pudo registrar el service worker:', error);
  });
}
