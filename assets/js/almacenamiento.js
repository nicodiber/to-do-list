import { crearCategoria, crearSubcategoria, crearTarea } from './modelos.js';
import {
  soportaGoogleDrive,
  hayConexionDrive,
  conectarDriveOAuth,
  buscarArchivoRemoto,
  leerArchivoRemoto,
  guardarArchivoRemoto,
} from './google-drive-sync.js';

const NOMBRE_BD = 'super-todo-list';
const VERSION_BD = 1;
const ALMACEN_HANDLES = 'handles';
const CLAVE_LOCALSTORAGE = 'super-todo-list:datos';
const CLAVE_LOCALSTORAGE_ULTIMA_MOD = 'super-todo-list:ultima-modificacion';
const ARCHIVO_CATEGORIAS = 'categorias.json';
const ARCHIVO_TAREAS = 'tareas.json';

export { soportaGoogleDrive, hayConexionDrive };

export const soportaFileSystemAccess = typeof window !== 'undefined' && 'showDirectoryPicker' in window;

export const estado = {
  categorias: [],
  subcategorias: [],
  ubicaciones: [],
  metas: [],
  personas: [],
  tareas: [],
};

let carpetaDatosHandle = null;
const listeners = [];

export function suscribir(fn) {
  listeners.push(fn);
}

function notificar() {
  listeners.forEach((fn) => fn(estado));
}

function abrirBD() {
  return new Promise((resolve, reject) => {
    const peticion = indexedDB.open(NOMBRE_BD, VERSION_BD);
    peticion.onupgradeneeded = () => {
      peticion.result.createObjectStore(ALMACEN_HANDLES);
    };
    peticion.onsuccess = () => resolve(peticion.result);
    peticion.onerror = () => reject(peticion.error);
  });
}

async function guardarHandleCarpeta(handle) {
  const bd = await abrirBD();
  return new Promise((resolve, reject) => {
    const tx = bd.transaction(ALMACEN_HANDLES, 'readwrite');
    tx.objectStore(ALMACEN_HANDLES).put(handle, 'carpetaDatos');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function recuperarHandleCarpeta() {
  const bd = await abrirBD();
  return new Promise((resolve, reject) => {
    const tx = bd.transaction(ALMACEN_HANDLES, 'readonly');
    const peticion = tx.objectStore(ALMACEN_HANDLES).get('carpetaDatos');
    peticion.onsuccess = () => resolve(peticion.result || null);
    peticion.onerror = () => reject(peticion.error);
  });
}

function guardarEnLocalStorage() {
  try {
    localStorage.setItem(CLAVE_LOCALSTORAGE, JSON.stringify(estado));
  } catch (error) {
    console.warn('No se pudo guardar en localStorage:', error);
  }
}

function cargarDeLocalStorage() {
  const crudo = localStorage.getItem(CLAVE_LOCALSTORAGE);
  if (!crudo) return false;
  try {
    const datos = JSON.parse(crudo);
    estado.categorias = datos.categorias || [];
    estado.subcategorias = datos.subcategorias || [];
    estado.ubicaciones = datos.ubicaciones || [];
    estado.metas = datos.metas || [];
    estado.personas = datos.personas || [];
    estado.tareas = datos.tareas || [];
    return true;
  } catch (error) {
    console.warn('No se pudo leer localStorage:', error);
    return false;
  }
}

async function escribirArchivo(nombreArchivo, contenido) {
  if (!carpetaDatosHandle) return;
  const handleArchivo = await carpetaDatosHandle.getFileHandle(nombreArchivo, { create: true });
  const flujo = await handleArchivo.createWritable();
  await flujo.write(JSON.stringify(contenido, null, 2));
  await flujo.close();
}

async function leerArchivo(nombreArchivo) {
  try {
    const handleArchivo = await carpetaDatosHandle.getFileHandle(nombreArchivo, { create: false });
    const archivo = await handleArchivo.getFile();
    const texto = await archivo.text();
    return JSON.parse(texto);
  } catch {
    return null;
  }
}

function recordarUltimoModifiedTimeDrive(modifiedTime) {
  try {
    localStorage.setItem(CLAVE_LOCALSTORAGE_ULTIMA_MOD, modifiedTime);
  } catch (error) {
    console.warn('No se pudo guardar la fecha de sincronización con Drive:', error);
  }
}

export async function guardarTodo() {
  guardarEnLocalStorage();

  if (carpetaDatosHandle) {
    await escribirArchivo(ARCHIVO_CATEGORIAS, {
      categorias: estado.categorias,
      subcategorias: estado.subcategorias,
      ubicaciones: estado.ubicaciones,
      metas: estado.metas,
      personas: estado.personas,
    });
    await escribirArchivo(ARCHIVO_TAREAS, { tareas: estado.tareas });
  }

  if (hayConexionDrive()) {
    try {
      const resultado = await guardarArchivoRemoto(estado);
      recordarUltimoModifiedTimeDrive(resultado.modifiedTime);
    } catch (error) {
      console.warn('No se pudo sincronizar con Google Drive:', error.message);
    }
  }
}

export async function persistirYNotificar() {
  await guardarTodo();
  notificar();
}

export function hayCarpetaDatosElegida() {
  return !!carpetaDatosHandle;
}

export async function elegirCarpetaDatos() {
  if (!soportaFileSystemAccess) {
    throw new Error(
      'Este navegador no soporta elegir una carpeta de datos (File System Access API). Usá Chrome/Edge, o mientras tanto exportá/importá el JSON manualmente.'
    );
  }
  carpetaDatosHandle = await window.showDirectoryPicker();
  await guardarHandleCarpeta(carpetaDatosHandle);
  await cargarDesdeCarpeta();
}

export async function cargarDesdeCarpeta() {
  if (!carpetaDatosHandle) return false;

  const permisoActual = await carpetaDatosHandle.queryPermission({ mode: 'readwrite' });
  if (permisoActual !== 'granted') {
    const permisoSolicitado = await carpetaDatosHandle.requestPermission({ mode: 'readwrite' });
    if (permisoSolicitado !== 'granted') return false;
  }

  const datosCategorias = await leerArchivo(ARCHIVO_CATEGORIAS);
  const datosTareas = await leerArchivo(ARCHIVO_TAREAS);

  if (datosCategorias || datosTareas) {
    estado.categorias = (datosCategorias && datosCategorias.categorias) || [];
    estado.subcategorias = (datosCategorias && datosCategorias.subcategorias) || [];
    estado.ubicaciones = (datosCategorias && datosCategorias.ubicaciones) || [];
    estado.metas = (datosCategorias && datosCategorias.metas) || [];
    estado.personas = (datosCategorias && datosCategorias.personas) || [];
    estado.tareas = (datosTareas && datosTareas.tareas) || [];
    guardarEnLocalStorage();
  } else {
    // Carpeta nueva y vacía: la sembramos con lo que ya haya en memoria/localStorage.
    await guardarTodo();
  }

  notificar();
  return true;
}

/**
 * Conecta con Google Drive (OAuth) y sincroniza: si Drive todavía no tiene
 * un archivo de datos, sube el `estado` actual (primera vez). Si ya existe
 * uno y su fecha de modificación difiere de la última modificación local
 * registrada, le pregunta al usuario cuál versión conservar antes de
 * pisar nada — no hay merge automático, solo esta elección explícita.
 */
export async function conectarDrive() {
  await conectarDriveOAuth();

  const archivoRemoto = await buscarArchivoRemoto();

  if (!archivoRemoto) {
    const resultado = await guardarArchivoRemoto(estado);
    recordarUltimoModifiedTimeDrive(resultado.modifiedTime);
    notificar();
    return;
  }

  const ultimaSyncConocida = localStorage.getItem(CLAVE_LOCALSTORAGE_ULTIMA_MOD);
  const cambioPorFuera = archivoRemoto.modifiedTime !== ultimaSyncConocida;

  if (cambioPorFuera) {
    const usarDrive = confirm(
      `Encontré datos en Google Drive (última modificación: ${new Date(archivoRemoto.modifiedTime).toLocaleString('es-AR')}) ` +
        'que no coinciden con la última vez que este dispositivo sincronizó.\n\n' +
        'Aceptar = usar los datos de Drive (se reemplazan los de este dispositivo).\n' +
        'Cancelar = subir los datos de este dispositivo (se reemplazan los de Drive).'
    );

    if (usarDrive) {
      const datosRemotos = await leerArchivoRemoto(archivoRemoto.id);
      estado.categorias = datosRemotos.categorias || [];
      estado.subcategorias = datosRemotos.subcategorias || [];
      estado.ubicaciones = datosRemotos.ubicaciones || [];
      estado.metas = datosRemotos.metas || [];
      estado.personas = datosRemotos.personas || [];
      estado.tareas = datosRemotos.tareas || [];
      guardarEnLocalStorage();
      recordarUltimoModifiedTimeDrive(archivoRemoto.modifiedTime);
    } else {
      const resultado = await guardarArchivoRemoto(estado);
      recordarUltimoModifiedTimeDrive(resultado.modifiedTime);
    }
  }

  notificar();
}

function sembrarDatosDeEjemplo() {
  const personal = crearCategoria({ nombre: 'Personal', color: '#4f7cff', orden: 1 });
  const facultad = crearCategoria({ nombre: 'Facultad', color: '#22c55e', orden: 2 });
  const trabajo = crearCategoria({ nombre: 'Trabajo', color: '#f59e0b', orden: 3 });

  const hobbies = crearSubcategoria({ nombre: 'Hobbies', categoria_id: personal.id });
  const examenes = crearSubcategoria({ nombre: 'Exámenes', categoria_id: facultad.id });

  estado.categorias = [personal, facultad, trabajo];
  estado.subcategorias = [hobbies, examenes];
  estado.tareas = [
    crearTarea({
      nombre: 'Elegir carpeta de datos en Google Drive',
      categoria_id: personal.id,
      estado: 'pendiente',
      duracion_estimada_min: 15,
      notas: 'Usá el botón "Elegir carpeta de datos" para que esta lista se guarde y sincronice.',
    }),
    crearTarea({
      nombre: 'Estudiar para el próximo examen',
      categoria_id: facultad.id,
      subcategoria_id: examenes.id,
      estado: 'pendiente',
      duracion_estimada_min: 90,
    }),
    crearTarea({
      nombre: 'Salir a andar en moto',
      categoria_id: personal.id,
      subcategoria_id: hobbies.id,
      estado: 'a_confirmar',
      duracion_estimada_min: 120,
      notas: 'Solo posible los fines de semana.',
    }),
  ];
}

export async function inicializarAlmacenamiento() {
  cargarDeLocalStorage();

  if (soportaFileSystemAccess) {
    try {
      const handleGuardado = await recuperarHandleCarpeta();
      if (handleGuardado) {
        carpetaDatosHandle = handleGuardado;
        await cargarDesdeCarpeta();
      }
    } catch (error) {
      console.warn('No se pudo recuperar la carpeta de datos guardada:', error);
    }
  }

  if (estado.categorias.length === 0 && estado.tareas.length === 0) {
    sembrarDatosDeEjemplo();
    await guardarTodo();
  }

  notificar();
}

export function exportarJSON() {
  const blob = new Blob([JSON.stringify(estado, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = `super-todo-list-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  URL.revokeObjectURL(url);
}

export async function importarJSON(archivo) {
  const texto = await archivo.text();
  const datos = JSON.parse(texto);
  estado.categorias = datos.categorias || [];
  estado.subcategorias = datos.subcategorias || [];
  estado.ubicaciones = datos.ubicaciones || [];
  estado.metas = datos.metas || [];
  estado.personas = datos.personas || [];
  estado.tareas = datos.tareas || [];
  await persistirYNotificar();
}
