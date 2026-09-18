import {
  soportaGoogleDrive,
  hayConexionDrive,
  conectarDriveOAuth,
  buscarArchivoRemoto,
  leerArchivoRemoto,
  guardarArchivoRemoto,
} from './google-drive-sync.js';
import { recalcularBloqueo } from './tareas-logica.js';

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
  ubicaciones: [],
  metas: [],
  personas: [],
  tareas: [],
};

let carpetaDatosHandle = null;
const listeners = [];

/**
 * Migración retrocompatible del modelo de datos. Tolera 3 generaciones de
 * datos guardados: el formato original (clave `id` a secas), el patrón
 * `entidad_atributo` de la ronda anterior (con `Subcategoria` como entidad
 * separada), y el formato actual. Se aplica a datos leídos de localStorage,
 * carpeta local, Google Drive o un JSON importado.
 */

/**
 * Subcategoria desapareció como entidad — se fusiona dentro de Categoria
 * vía `categoria_padre_id`. Reusa el mismo id (`subcategoria_id` pasa a ser
 * el `categoria_id` de la categoría hija) para no tener que remapear
 * referencias. Cualquier `tarea.subcategoria_id` truthy pisa a
 * `tarea.categoria_id` (la subcategoría era más específica) y se descarta.
 */
function fusionarSubcategoriasEnCategorias(datosCrudos) {
  const subcategorias = datosCrudos.subcategorias;
  if (!subcategorias || subcategorias.length === 0) return datosCrudos;

  const categoriasFusionadas = subcategorias.map((s) => ({
    categoria_id: s.subcategoria_id,
    categoria_nombre: s.subcategoria_nombre,
    categoria_color: s.subcategoria_color,
    categoria_padre_id: s.categoria_id || null,
  }));

  const tareas = (datosCrudos.tareas || []).map((t) => {
    if (!t.subcategoria_id) return t;
    const { subcategoria_id, ...resto } = t;
    return { ...resto, categoria_id: subcategoria_id };
  });

  return {
    ...datosCrudos,
    categorias: [...(datosCrudos.categorias || []), ...categoriasFusionadas],
    tareas,
    subcategorias: undefined,
  };
}

function migrarCategoria(c) {
  if ('categoria_prioridad' in c) return c;
  if ('id' in c) {
    const { id, nombre, color, orden, disfrute } = c;
    return {
      categoria_id: id,
      categoria_nombre: nombre,
      categoria_descripcion: '',
      categoria_color: color,
      categoria_prioridad: orden ?? 0,
      categoria_disfrute: disfrute ?? 3,
      categoria_padre_id: null,
    };
  }
  return {
    categoria_id: c.categoria_id,
    categoria_nombre: c.categoria_nombre,
    categoria_descripcion: c.categoria_descripcion ?? '',
    categoria_color: c.categoria_color,
    categoria_prioridad: c.categoria_orden ?? 0,
    categoria_disfrute: c.categoria_disfrute ?? 3,
    categoria_padre_id: c.categoria_padre_id ?? null,
  };
}

function migrarUbicacion(u) {
  if (!('id' in u)) return u;
  const { id, nombre, latitud, longitud } = u;
  return { ubicacion_id: id, ubicacion_nombre: nombre, ubicacion_latitud: latitud, ubicacion_longitud: longitud };
}

function migrarMeta(m) {
  if ('meta_fecha_estimada' in m) return m;
  if ('id' in m) {
    const { id, nombre, plazo, descripcion, fecha_objetivo, creada_en } = m;
    return {
      meta_id: id,
      meta_nombre: nombre,
      meta_plazo: plazo,
      meta_descripcion: descripcion,
      meta_fecha_estimada: fecha_objetivo,
      meta_creada_en: creada_en,
    };
  }
  const { meta_fecha_objetivo, ...resto } = m;
  return { ...resto, meta_fecha_estimada: meta_fecha_objetivo };
}

function migrarPersona(p) {
  if ('id' in p) {
    const { id, nombre, ultimo_contacto, creada_en } = p;
    return { persona_id: id, persona_nombre: nombre, persona_ultimo_contacto: ultimo_contacto, persona_creada_en: creada_en };
  }
  // `persona_notas` se eliminó del modelo: si el objeto la trae de una
  // versión anterior, se descarta acá (destructuring sin volver a usarla).
  const { persona_notas, ...resto } = p;
  return resto;
}

function migrarTarea(t) {
  if ('tarea_dependiente' in t) {
    // `tarea_genera_dinero` se eliminó del modelo: si el objeto lo trae de
    // una versión anterior, se descarta acá (destructuring sin volver a usarlo).
    const { tarea_genera_dinero, ...resto } = t;
    return resto;
  }

  const esFormatoMuyViejo = 'id' in t;
  const id = esFormatoMuyViejo ? t.id : t.tarea_id;
  const nombre = esFormatoMuyViejo ? t.nombre : t.tarea_nombre;
  const estadoViejo = esFormatoMuyViejo ? t.estado : t.tarea_estado;
  const fechaInicioVieja = esFormatoMuyViejo ? t.fecha_inicio_posible : t.tarea_fecha_inicio_posible;
  const fechaLimiteVieja = esFormatoMuyViejo ? t.fecha_limite : t.tarea_fecha_limite;
  const fechaSugeridaVieja = esFormatoMuyViejo ? t.fecha_sugerida : t.tarea_fecha_sugerida;
  const fechaHoraAgendadaVieja = esFormatoMuyViejo ? t.fecha_hora_agendada : t.tarea_fecha_hora_agendada;
  const duracionVieja = esFormatoMuyViejo ? t.duracion_estimada_min : t.tarea_duracion_estimada_min;
  const notasViejas = esFormatoMuyViejo ? t.notas : t.tarea_notas;
  const dependenciasViejas = esFormatoMuyViejo ? t.dependencias : t.dependencias;
  const mantenimientoViejo = esFormatoMuyViejo ? t.mantenimiento : t.tarea_mantenimiento;
  const diasHabilesViejos = esFormatoMuyViejo ? t.dias_habiles : t.tarea_dias_habiles;
  const requiereClimaViejo = esFormatoMuyViejo ? t.requiere_clima_bueno : t.tarea_requiere_clima_bueno;
  const metasIdsViejas = esFormatoMuyViejo ? t.metas_ids : t.metas_ids;
  const costoEstimadoViejo = esFormatoMuyViejo ? t.costo_estimado : t.tarea_costo_estimado;
  const creadaEnVieja = esFormatoMuyViejo ? t.creada_en : t.tarea_creada_en;
  const completadaEnVieja = esFormatoMuyViejo ? t.completada_en : t.tarea_completada_en;

  return {
    tarea_id: id,
    tarea_nombre: nombre,
    categoria_id: t.categoria_id || null,
    tarea_estado: estadoViejo === 'completada' ? 'completada' : 'pendiente',
    tarea_fecha_inicio_habilitada: fechaInicioVieja || creadaEnVieja,
    tarea_fecha_sugerida: fechaHoraAgendadaVieja || fechaSugeridaVieja || '',
    tarea_fecha_limite: fechaLimiteVieja || '',
    tarea_fecha_fin: completadaEnVieja || null,
    tarea_importancia: null,
    tarea_mantenimiento: !!mantenimientoViejo,
    tarea_mantenimiento_intervalo: mantenimientoViejo || null,
    tarea_dias_habiles: diasHabilesViejos || [],
    tarea_duracion_min: duracionVieja || 15,
    tarea_descripcion: notasViejas || '',
    tarea_creada_en: creadaEnVieja,
    tarea_dependiente: (dependenciasViejas && dependenciasViejas[0]) || null,
    ubicacion_id: t.ubicacion_id || null,
    tarea_requiere_clima_bueno: !!requiereClimaViejo,
    tarea_costo_estimado: costoEstimadoViejo || 0,
    meta_id: (metasIdsViejas && metasIdsViejas[0]) || null,
  };
}

function normalizarDatosCrudos(datosOriginal) {
  const datos = fusionarSubcategoriasEnCategorias(datosOriginal);
  const categorias = (datos.categorias || []).map(migrarCategoria);
  const ubicaciones = (datos.ubicaciones || []).map(migrarUbicacion);
  const metas = (datos.metas || []).map(migrarMeta);
  const personas = (datos.personas || []).map(migrarPersona);
  const tareas = (datos.tareas || []).map(migrarTarea);
  tareas.forEach((t) => recalcularBloqueo(t, tareas));
  return { categorias, ubicaciones, metas, personas, tareas };
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
    // Se combinan ambos archivos antes de normalizar: la fusión de
    // Subcategoria (vive en categorias.json) necesita ver las tareas (viven
    // en tareas.json) para reasignar `categoria_id` correctamente.
    const normalizados = normalizarDatosCrudos({ ...(datosCategorias || {}), ...(datosTareas || {}) });
    estado.categorias = normalizados.categorias;
    estado.ubicaciones = normalizados.ubicaciones;
    estado.metas = normalizados.metas;
    estado.personas = normalizados.personas;
    estado.tareas = normalizados.tareas;
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
