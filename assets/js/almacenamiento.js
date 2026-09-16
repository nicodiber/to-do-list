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

/**
 * Migración retrocompatible del formato viejo de campos (ej. `Tarea.nombre`)
 * al patrón `entidad_atributo` (ej. `tarea_nombre`), aplicada a datos leídos
 * de localStorage, carpeta local, Google Drive o un JSON importado que
 * todavía puedan tener el formato anterior. Se detecta el formato viejo por
 * la presencia de la clave `id` a secas (ninguna entidad en el formato nuevo
 * ya usa esa clave). `motivo_incumplimiento` se descarta durante la
 * migración porque el campo se eliminó del modelo.
 */
function migrarCategoria(c) {
  if (!('id' in c)) return c;
  const { id, nombre, color, orden, disfrute } = c;
  return { categoria_id: id, categoria_nombre: nombre, categoria_color: color, categoria_orden: orden, categoria_disfrute: disfrute };
}

function migrarSubcategoria(s) {
  if (!('id' in s)) return s;
  const { id, nombre, categoria_id, color } = s;
  return { subcategoria_id: id, subcategoria_nombre: nombre, categoria_id, subcategoria_color: color };
}

function migrarUbicacion(u) {
  if (!('id' in u)) return u;
  const { id, nombre, latitud, longitud } = u;
  return { ubicacion_id: id, ubicacion_nombre: nombre, ubicacion_latitud: latitud, ubicacion_longitud: longitud };
}

function migrarMeta(m) {
  if (!('id' in m)) return m;
  const { id, nombre, plazo, descripcion, fecha_objetivo, creada_en } = m;
  return { meta_id: id, meta_nombre: nombre, meta_plazo: plazo, meta_descripcion: descripcion, meta_fecha_objetivo: fecha_objetivo, meta_creada_en: creada_en };
}

function migrarPersona(p) {
  if (!('id' in p)) return p;
  const { id, nombre, ultimo_contacto, notas, creada_en } = p;
  return { persona_id: id, persona_nombre: nombre, persona_ultimo_contacto: ultimo_contacto, persona_notas: notas, persona_creada_en: creada_en };
}

function migrarTarea(t) {
  if (!('id' in t)) return t;
  const {
    id,
    nombre,
    categoria_id,
    subcategoria_id,
    estado,
    fecha_inicio_posible,
    fecha_limite,
    fecha_sugerida,
    fecha_hora_agendada,
    duracion_estimada_min,
    duracion_real_min,
    notas,
    notificada_en_para,
    dependencias,
    mantenimiento,
    divisible,
    multitasking,
    importancia,
    dias_habiles,
    ubicacion_id,
    requiere_clima_bueno,
    metas_ids,
    recompensa,
    costo_estimado,
    costo_real,
    creada_en,
    completada_en,
  } = t;
  return {
    tarea_id: id,
    tarea_nombre: nombre,
    categoria_id,
    subcategoria_id,
    tarea_estado: estado,
    tarea_fecha_inicio_posible: fecha_inicio_posible,
    tarea_fecha_limite: fecha_limite,
    tarea_fecha_sugerida: fecha_sugerida,
    tarea_fecha_hora_agendada: fecha_hora_agendada,
    tarea_duracion_estimada_min: duracion_estimada_min,
    tarea_duracion_real_min: duracion_real_min,
    tarea_notas: notas,
    tarea_notificada_en_para: notificada_en_para,
    dependencias,
    tarea_mantenimiento: mantenimiento,
    tarea_divisible: divisible,
    tarea_multitasking: multitasking,
    tarea_importancia: importancia,
    tarea_dias_habiles: dias_habiles,
    ubicacion_id,
    tarea_requiere_clima_bueno: requiere_clima_bueno,
    metas_ids,
    tarea_recompensa: recompensa,
    tarea_costo_estimado: costo_estimado,
    tarea_costo_real: costo_real,
    tarea_creada_en: creada_en,
    tarea_completada_en: completada_en,
  };
}

function normalizarDatosCrudos(datos) {
  return {
    categorias: (datos.categorias || []).map(migrarCategoria),
    subcategorias: (datos.subcategorias || []).map(migrarSubcategoria),
    ubicaciones: (datos.ubicaciones || []).map(migrarUbicacion),
    metas: (datos.metas || []).map(migrarMeta),
    personas: (datos.personas || []).map(migrarPersona),
    tareas: (datos.tareas || []).map(migrarTarea),
  };
}

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
    Object.assign(estado, normalizarDatosCrudos(datos));
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
    const normalizadosCategorias = normalizarDatosCrudos(datosCategorias || {});
    const normalizadosTareas = normalizarDatosCrudos(datosTareas || {});
    estado.categorias = normalizadosCategorias.categorias;
    estado.subcategorias = normalizadosCategorias.subcategorias;
    estado.ubicaciones = normalizadosCategorias.ubicaciones;
    estado.metas = normalizadosCategorias.metas;
    estado.personas = normalizadosCategorias.personas;
    estado.tareas = normalizadosTareas.tareas;
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
      Object.assign(estado, normalizarDatosCrudos(datosRemotos));
      guardarEnLocalStorage();
      recordarUltimoModifiedTimeDrive(archivoRemoto.modifiedTime);
    } else {
      const resultado = await guardarArchivoRemoto(estado);
      recordarUltimoModifiedTimeDrive(resultado.modifiedTime);
    }
  }

  notificar();
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
  Object.assign(estado, normalizarDatosCrudos(datos));
  await persistirYNotificar();
}
