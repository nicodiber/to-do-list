import {
  estado,
  suscribir,
  inicializarAlmacenamiento,
  elegirCarpetaDatos,
  exportarJSON,
  importarJSON,
  soportaFileSystemAccess,
  hayCarpetaDatosElegida,
} from './almacenamiento.js';
import { renderVistaHoy } from '../../views/hoy.view.js';
import { renderVistaTresDias } from '../../views/tres-dias.view.js';
import { renderVistaOchoDias } from '../../views/ocho-dias.view.js';
import { renderVistaSemana } from '../../views/semana.view.js';
import { renderVistaTareas } from '../../views/tareas.view.js';
import { renderVistaCategorias } from '../../views/categorias.view.js';
import { renderVistaUbicaciones } from '../../views/ubicaciones.view.js';
import { renderVistaMetas } from '../../views/metas.view.js';
import { renderVistaPersonas } from '../../views/personas.view.js';
import { renderVistaInformes } from '../../views/informes.view.js';

const CONTENEDOR = document.getElementById('vista');
const NAV = document.getElementById('nav-vistas');
const ESTADO_CONEXION = document.getElementById('estado-conexion');

const VISTAS = {
  hoy: { etiqueta: 'Hoy', render: renderVistaHoy },
  'tres-dias': { etiqueta: '3 días', render: renderVistaTresDias },
  'ocho-dias': { etiqueta: '8 días', render: renderVistaOchoDias },
  semana: { etiqueta: 'Semana', render: renderVistaSemana },
  tareas: { etiqueta: 'Tareas', render: renderVistaTareas },
  categorias: { etiqueta: 'Categorías', render: renderVistaCategorias },
  ubicaciones: { etiqueta: 'Ubicaciones', render: renderVistaUbicaciones },
  metas: { etiqueta: 'Metas', render: renderVistaMetas },
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

function render() {
  renderNav();
  actualizarEstadoConexion();
  VISTAS[vistaActual()].render(CONTENEDOR, estado);
}

window.addEventListener('hashchange', render);
suscribir(render);

document.getElementById('boton-elegir-carpeta').addEventListener('click', async () => {
  try {
    await elegirCarpetaDatos();
  } catch (error) {
    alert(error.message);
  }
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

inicializarAlmacenamiento();
