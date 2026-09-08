import { crearCategoria, crearSubcategoria, crearTarea } from './modelos.js';

const NOMBRE_BD = 'super-todo-list';
const VERSION_BD = 1;
const ALMACEN_HANDLES = 'handles';
const CLAVE_LOCALSTORAGE = 'super-todo-list:datos';
const ARCHIVO_CATEGORIAS = 'categorias.json';
const ARCHIVO_TAREAS = 'tareas.json';

export const soportaFileSystemAccess = typeof window !== 'undefined' && 'showDirectoryPicker' in window;

export const estado = {
  categorias: [],
  subcategorias: [],
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

export async function guardarTodo() {
  guardarEnLocalStorage();
  if (carpetaDatosHandle) {
    await escribirArchivo(ARCHIVO_CATEGORIAS, {
      categorias: estado.categorias,
      subcategorias: estado.subcategorias,
    });
    await escribirArchivo(ARCHIVO_TAREAS, { tareas: estado.tareas });
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
    estado.tareas = (datosTareas && datosTareas.tareas) || [];
    guardarEnLocalStorage();
  } else {
    // Carpeta nueva y vacía: la sembramos con lo que ya haya en memoria/localStorage.
    await guardarTodo();
  }

  notificar();
  return true;
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
  estado.tareas = datos.tareas || [];
  await persistirYNotificar();
}
