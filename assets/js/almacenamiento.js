// Estado de la app en memoria y su sincronización con Google Drive, que es el
// único destino real de los datos. Ningún dato de tareas se guarda en
// `localStorage`: mientras Drive no confirma un cambio, ese cambio vive en un
// buffer "pendiente" (IndexedDB, ver almacenamiento-local.js) que la UI nunca
// presenta como guardado. Las vistas siguen usando solo `estado` y
// `persistirYNotificar()`.
import { conectar, hayToken, msHastaVencer, tieneScope, invalidarToken, esperarGoogle, conectadoAlgunaVez, alPerderSesion } from './google-auth.js';
import { buscarArchivoRemoto, leerArchivoRemoto, guardarArchivoRemoto, ErrorDrive } from './google-drive-sync.js';
import * as almacenamientoLocal from './almacenamiento-local.js';
import { COLECCIONES, FORMATO_ARCHIVO, sellarCambios, mezclar, datosParaArchivo, fotoColecciones, difierenDatos, copiarProfundo } from './sincronizacion.js';
import { crearPreferencias } from './modelos.js';
import { recalcularBloqueo } from './tareas-logica.js';
import { repararEnlaces } from './dependencias.js';
import { fechaLocalISO } from './utilidades.js';
import { registrarPasoDeshacer, invalidarHistorialDeshacer } from './deshacer.js';
import { confirmar } from './avisos.js';

const CLAVE_LOCALSTORAGE_VIEJA = 'super-todo-list:datos';
const CLAVE_LOCALSTORAGE_ULTIMA_MOD_VIEJA = 'super-todo-list:ultima-modificacion';
const DEBOUNCE_SUBIDA_MS = 2000;
const INTERVALO_VERIFICACION_MS = 5 * 60 * 1000;
const REINTENTO_ERROR_MS = 60 * 1000;
const ESPERA_RECONEXION_SILENCIOSA_MS = 60 * 1000;
const DESFASE_RELOJ_MAX_MS = 2 * 60 * 1000;

export const estado = {
  categorias: [],
  ubicaciones: [],
  metas: [],
  personas: [],
  etiquetas: [],
  plantillas: [],
  tareas: [],
  mejoras: [],
  cumplimientos: [],
  preferencias: [],
};

const listeners = [];
const listenersSync = [];

// Tombstones de lo eliminado (van en el archivo de Drive, no en `estado`).
let eliminados = [];
// Foto de las colecciones en el último sellado, para saber qué cambió.
let ultimoSellado = null;
// Última copia confirmada en Drive (ancestro común para mezclar) y su modifiedTime.
let base = null;
let baseModifiedTime = null;
// Sube con cada cambio local, para detectar cambios ocurridos durante una sincronización.
let versionLocal = 0;
let sincronizando = false;
let volverASincronizar = false;
let temporizadorSubida = null;
let ultimoIntentoSilencioso = 0;
let avisoDuplicadosMostrado = false;
// Datos que versiones anteriores guardaban en localStorage (se ofrecen, no se ignoran).
let datosViejos = null;

/**
 * Estado de sincronización que muestra la cabecera:
 * `estado` ∈ sin-destino | conectando | verificando | guardando | pendiente |
 * sincronizado | sin-conexion | sesion-vencida | error.
 */
const sync = {
  estado: 'conectando',
  datosListos: false,
  hayPendiente: false,
  modificadoEnDrive: null,
  verificadoEn: null,
  copiaDel: null,
  avisos: [],
  cambiosRemotosDisponibles: false,
  soloLectura: false,
  relojDesfasado: false,
  desfaseRelojMs: 0,
  datosViejosDisponibles: false,
  mensajeError: '',
  almacenamientoLocalDisponible: true,
  recienConectado: false,
  // Hay un reintento de reconexión armado para el próximo clic o tecla del usuario.
  reconectaConClic: false,
  // La reconexión silenciosa (sin ventana) ya se intentó con un clic y no alcanzó: hace falta el botón «Reconectar».
  reconexionManual: false,
};

export function suscribir(fn) {
  listeners.push(fn);
}

export function suscribirSync(fn) {
  listenersSync.push(fn);
}

/**
 * Avisa a las vistas que los datos cambiaron. Con `conservarBorradores` (cambios
 * que llegaron de otro dispositivo) quien redibuja debe conservar lo que el
 * usuario ya escribió en los formularios.
 */
function notificar(opciones = {}) {
  listeners.forEach((fn) => fn(estado, opciones));
}

export function obtenerEstadoSync() {
  return { ...sync, avisos: [...sync.avisos] };
}

function setSync(parcial) {
  Object.assign(sync, parcial);
  listenersSync.forEach((fn) => fn(obtenerEstadoSync()));
}

/**
 * Migración retrocompatible del modelo de datos. Tolera 3 generaciones de
 * datos guardados: el formato original (clave `id` a secas), el patrón
 * `entidad_atributo` de la ronda anterior (con `Subcategoria` como entidad
 * separada), y el formato actual. Se aplica a datos leídos de Google Drive,
 * de la copia local (caché o pendiente), de un JSON importado o de los datos
 * que una versión anterior dejó en localStorage.
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
    return {
      persona_id: id,
      persona_nombre: nombre,
      persona_ultimo_contacto: ultimo_contacto,
      persona_proximo_contacto: '',
      persona_etiqueta_id: null,
      persona_fallecida: false,
      persona_creada_en: creada_en,
    };
  }
  // `persona_notas` se eliminó del modelo: si el objeto la trae de una
  // versión anterior, se descarta acá (destructuring sin volver a usarla).
  const { persona_notas, ...resto } = p;
  // Campos ausentes en datos anteriores: v0.66.0 (próximo contacto), v0.91.0 (etiqueta, fallecida).
  return {
    ...resto,
    persona_proximo_contacto: resto.persona_proximo_contacto || '',
    persona_etiqueta_id: resto.persona_etiqueta_id || null,
    persona_fallecida: resto.persona_fallecida || false,
  };
}

function migrarTarea(t) {
  if ('tarea_dependiente' in t) {
    // `tarea_genera_dinero` se eliminó del modelo: si el objeto lo trae de
    // una versión anterior, se descarta acá (destructuring sin volver a usarlo).
    // `tarea_importancia` (enum 'urgente'/'importante'/null) se reemplazó por `tarea_urgente` (booleano,
    // v0.75.0): se saca del resto y se recalcula — dato ya migrado conserva su `tarea_urgente`, dato viejo
    // con 'urgente' pasa a `true`, cualquier otro valor ('importante', null o ausente) pasa a `false`.
    const { tarea_genera_dinero, tarea_importancia, ...resto } = t;
    return {
      ...resto,
      tarea_urgente: resto.tarea_urgente ?? tarea_importancia === 'urgente',
      // Campos de la Ronda 2: ausentes en datos anteriores, se completan con su valor por defecto.
      tarea_exportada_calendar: !!resto.tarea_exportada_calendar,
      tarea_checklist: Array.isArray(resto.tarea_checklist) ? resto.tarea_checklist : [],
      tarea_desencadenante: resto.tarea_desencadenante || null,
      tarea_carga_completa: !!resto.tarea_carga_completa,
      // Campos de la Ronda 9: ausentes en datos anteriores.
      tarea_tipo: resto.tarea_tipo || '',
      tarea_repetir_hasta: resto.tarea_repetir_hasta || '',
      tarea_repetir_hasta_tarea: resto.tarea_repetir_hasta_tarea || null,
      tarea_origen: resto.tarea_origen || null,
      // Campo de la v0.66.0: ausente en datos anteriores.
      persona_id: resto.persona_id || null,
      // Campos de la v0.101.0 (rediseño de las tareas con repetición): ausentes en datos anteriores.
      tarea_mantenimiento_dia_fijo: resto.tarea_mantenimiento_dia_fijo || null,
      tarea_mantenimiento_objetivo: resto.tarea_mantenimiento_objetivo || '',
      tarea_dia_obligatorio: !!resto.tarea_dia_obligatorio,
      // Campos de la v0.105.0 (delegaciones): ausentes en datos anteriores.
      tarea_delegada_a: resto.tarea_delegada_a || null,
      tarea_fecha_fija: !!resto.tarea_fecha_fija,
      tarea_cronometro_inicio: resto.tarea_cronometro_inicio || null,
      tarea_tiempo_acumulado_min: Number(resto.tarea_tiempo_acumulado_min) > 0 ? Number(resto.tarea_tiempo_acumulado_min) : 0,
      tarea_seguimiento_fecha: resto.tarea_delegada_a ? resto.tarea_seguimiento_fecha || '' : '',
    };
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
    tarea_urgente: false,
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
    tarea_exportada_calendar: false,
    tarea_checklist: [],
    tarea_desencadenante: null,
    tarea_carga_completa: false,
    tarea_tipo: '',
    tarea_repetir_hasta: '',
    tarea_repetir_hasta_tarea: null,
    tarea_origen: null,
    persona_id: null,
    tarea_mantenimiento_dia_fijo: null,
    tarea_mantenimiento_objetivo: '',
    tarea_dia_obligatorio: false,
    tarea_delegada_a: null,
    tarea_seguimiento_fecha: '',
    tarea_fecha_fija: false,
    tarea_cronometro_inicio: null,
    tarea_tiempo_acumulado_min: 0,
  };
}

/** `mejoras` y `cumplimientos` nacieron en la Ronda 2: no hay formatos anteriores que migrar. */
function migrarMejora(m) {
  return { ...m, mejora_texto: m.mejora_texto || '', mejora_aplicada: !!m.mejora_aplicada };
}

/** `preferencias` nació en la Ronda 9b: solo se completan los campos que falten. */
function migrarPreferencias(p) {
  const base = crearPreferencias();
  const tope = Array.isArray(p.pref_tope_dias) && p.pref_tope_dias.length === 7 ? p.pref_tope_dias.map((n) => Math.max(0, Number(n) || 0)) : base.pref_tope_dias;
  return {
    ...base,
    ...p,
    pref_tope_dias: tope,
    pref_franja: p.pref_franja && p.pref_franja.inicio && p.pref_franja.fin ? { inicio: p.pref_franja.inicio, fin: p.pref_franja.fin } : base.pref_franja,
    pref_calendarios: Array.isArray(p.pref_calendarios) ? p.pref_calendarios : null,
    pref_capacidad_por_fecha: p.pref_capacidad_por_fecha && typeof p.pref_capacidad_por_fecha === 'object' ? p.pref_capacidad_por_fecha : {},
    pref_habitos_ocultos: Array.isArray(p.pref_habitos_ocultos) ? p.pref_habitos_ocultos : [],
    pref_preguntar_tiempo_real: !!p.pref_preguntar_tiempo_real,
    pref_bloques_dias: Array.isArray(p.pref_bloques_dias) && p.pref_bloques_dias.length === 7 ? p.pref_bloques_dias : null,
    pref_fecha_nacimiento: /^\d{4}-\d{2}-\d{2}$/.test(p.pref_fecha_nacimiento || '') ? p.pref_fecha_nacimiento : '',
    pref_esperanza_vida: Number.isFinite(p.pref_esperanza_vida) && p.pref_esperanza_vida >= 40 && p.pref_esperanza_vida <= 120 ? p.pref_esperanza_vida : 80,
  };
}

function migrarCumplimiento(c) {
  return {
    ...c,
    categoria_id: c.categoria_id || null,
    cumplimiento_fecha_limite: c.cumplimiento_fecha_limite || '',
    cumplimiento_mantenimiento: !!c.cumplimiento_mantenimiento,
    // Campos de la Ronda 6: ausentes en registros anteriores.
    cumplimiento_intervalo: c.cumplimiento_intervalo || null,
    cumplimiento_dias_habiles: Array.isArray(c.cumplimiento_dias_habiles) ? c.cumplimiento_dias_habiles : [],
    // Campos de la v0.104.0: ausentes en registros anteriores.
    cumplimiento_duracion_estimada: c.cumplimiento_duracion_estimada || null,
    cumplimiento_duracion_real: c.cumplimiento_duracion_real || null,
  };
}

function normalizarDatosCrudos(datosOriginal) {
  const datos = fusionarSubcategoriasEnCategorias(datosOriginal);
  const categorias = (datos.categorias || []).map(migrarCategoria);
  const ubicaciones = (datos.ubicaciones || []).map(migrarUbicacion);
  const metas = (datos.metas || []).map(migrarMeta);
  const personas = (datos.personas || []).map(migrarPersona);
  // `etiquetas` nació en la v0.91.0: no hay formato anterior que migrar.
  const etiquetas = datos.etiquetas || [];
  // `plantillas` nació en la v0.99.0: tampoco hay formato anterior.
  const plantillas = datos.plantillas || [];
  const tareas = (datos.tareas || []).map(migrarTarea);
  tareas.forEach((t) => recalcularBloqueo(t, tareas));
  const mejoras = (datos.mejoras || []).map(migrarMejora);
  const cumplimientos = (datos.cumplimientos || []).map(migrarCumplimiento);
  const preferencias = (datos.preferencias || []).slice(0, 1).map(migrarPreferencias);
  return { categorias, ubicaciones, metas, personas, etiquetas, plantillas, tareas, mejoras, cumplimientos, preferencias };
}

// ---------------------------------------------------------------------------
// Utilidades internas
// ---------------------------------------------------------------------------

function normalizarArchivo(crudo) {
  const normalizados = normalizarDatosCrudos(crudo || {});
  return { ...normalizados, eliminados: Array.isArray(crudo?.eliminados) ? crudo.eliminados : [] };
}

function datosActuales(ahora) {
  return datosParaArchivo(estado, eliminados, ahora);
}

function tomarFotoSellado() {
  ultimoSellado = fotoColecciones(estado);
}

/**
 * Reemplaza el contenido de `estado` con `datos` (colecciones + eliminados) y
 * recalcula el bloqueo de las tareas; las que cambian de estado por eso se
 * sellan con `ahora`.
 */
function aplicarDatosAlEstado(datos, ahora) {
  for (const cfg of COLECCIONES) estado[cfg.clave] = datos[cfg.clave] || [];
  eliminados = datos.eliminados || [];
  const antes = new Map(estado.tareas.map((t) => [t.tarea_id, t.tarea_estado]));
  estado.tareas.forEach((t) => recalcularBloqueo(t, estado.tareas));
  if (ahora) {
    estado.tareas.forEach((t) => {
      if (antes.get(t.tarea_id) !== t.tarea_estado) t.tarea_modificado_en = ahora;
    });
  }
}

/**
 * ¿Hay texto a medio escribir en un campo? Las vistas se redibujan enteras al
 * aplicar cambios, lo que borraría lo tipeado: en ese caso se difiere.
 */
export function hayTextoEnEdicion() {
  const elemento = typeof document !== 'undefined' ? document.activeElement : null;
  if (!elemento) return false;
  if (elemento.tagName === 'TEXTAREA') return elemento.value !== '';
  if (elemento.tagName === 'INPUT') {
    const tipo = (elemento.type || 'text').toLowerCase();
    if (['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'color', 'range'].includes(tipo)) return false;
    return elemento.value !== '';
  }
  return !!elemento.isContentEditable;
}

function estadoSinSesion() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'sin-conexion';
  // Sin sesión, el próximo clic del usuario puede reconectar (Google exige un gesto para abrir su popup).
  reconectarEnPrimerGesto();
  return 'sesion-vencida';
}

/** Solo una pestaña puede editar a la vez: dos pestañas se pisarían el buffer pendiente. */
function adquirirBloqueoEdicion() {
  if (typeof navigator === 'undefined' || !navigator.locks) return Promise.resolve(true);
  return new Promise((resolve) => {
    navigator.locks.request('stdl-editor', { ifAvailable: true }, (bloqueo) => {
      if (!bloqueo) {
        resolve(false);
        return undefined;
      }
      resolve(true);
      return new Promise(() => {});
    });
  });
}

function leerDatosViejos() {
  try {
    const crudo = localStorage.getItem(CLAVE_LOCALSTORAGE_VIEJA);
    if (!crudo) return null;
    const normalizados = normalizarDatosCrudos(JSON.parse(crudo));
    const total = COLECCIONES.reduce((suma, cfg) => suma + normalizados[cfg.clave].length, 0);
    return total > 0 ? { ...normalizados, eliminados: [] } : null;
  } catch {
    return null;
  }
}

function limpiarDatosViejos() {
  datosViejos = null;
  try {
    localStorage.removeItem(CLAVE_LOCALSTORAGE_VIEJA);
  } catch {
    // Nada más que hacer: solo es limpieza de datos que ya no se usan.
  }
  setSync({ datosViejosDisponibles: false });
}

function avisoInformativo(ahora, mensaje) {
  return { id: `${ahora}-info-${Math.random().toString(36).slice(2, 8)}`, creado_en: ahora, tipo: 'info', coleccion: '', nombre: '', mensaje, camposDescartados: [] };
}

// ---------------------------------------------------------------------------
// Avisos de sincronización (nada se pierde en silencio)
// ---------------------------------------------------------------------------

async function agregarAvisos(nuevos) {
  if (nuevos.length === 0) return;
  const avisos = [...sync.avisos, ...nuevos];
  setSync({ avisos });
  await almacenamientoLocal.guardarAvisos(avisos);
}

export async function descartarAviso(id) {
  const avisos = sync.avisos.filter((aviso) => aviso.id !== id);
  setSync({ avisos });
  await almacenamientoLocal.guardarAvisos(avisos);
}

export async function descartarTodosLosAvisos() {
  setSync({ avisos: [] });
  await almacenamientoLocal.guardarAvisos([]);
}

// ---------------------------------------------------------------------------
// Guardado: cada cambio va primero al buffer pendiente y después a Drive
// ---------------------------------------------------------------------------

/**
 * Único punto de guardado de las vistas: sella qué cambió, guarda una copia
 * temporal durable ("pendiente") y programa la subida a Drive. El estado
 * queda "pendiente" hasta que Drive confirme. Con `{ sinNotificar: true }` no redibuja las vistas.
 */
export async function persistirYNotificar({ sinNotificar = false, deshacer = true } = {}) {
  if (sync.soloLectura) return;
  const ahora = new Date().toISOString();
  // `ultimoSellado` todavía es la foto de antes de este cambio: es el paso al que volvería un "deshacer" ahora.
  if (deshacer && ultimoSellado) registrarPasoDeshacer(ultimoSellado);
  eliminados = sellarCambios(estado, ultimoSellado, base, eliminados, ahora);
  tomarFotoSellado();
  versionLocal += 1;

  const guardado = await almacenamientoLocal.guardarPendiente({ datos: datosActuales(ahora), desde: ahora });
  const conservaEstado = ['sin-conexion', 'sesion-vencida', 'error', 'sin-destino'].includes(sync.estado);
  setSync({
    hayPendiente: true,
    estado: conservaEstado ? sync.estado : 'pendiente',
    almacenamientoLocalDisponible: almacenamientoLocal.hayAlmacenamientoLocal(),
    mensajeError: guardado ? sync.mensajeError : 'No se pudo guardar una copia temporal en este navegador: si cerrás la pestaña antes de que Drive confirme, se pierde el último cambio.',
  });
  // La subida se programa antes de notificar: si una vista falla al redibujar,
  // el cambio igual llega a Drive.
  programarSubida();
  // `sinNotificar`: quien guarda (por ejemplo Configuraciones, campo por campo) no quiere que se redibuje la vista.
  if (!sinNotificar) notificar();
}

function programarSubida(retraso = DEBOUNCE_SUBIDA_MS) {
  if (sync.soloLectura) return;
  clearTimeout(temporizadorSubida);
  temporizadorSubida = setTimeout(async () => {
    if (!hayToken() && !(await reconexionSilenciosa())) {
      setSync({ estado: estadoSinSesion() });
      return;
    }
    sincronizarAhora();
  }, retraso);
}

let reconectando = false;

/**
 * Intenta recuperar el permiso de Google sin pedirle nada al usuario
 * (`prompt: 'none'`). Sin un gesto del usuario los navegadores suelen bloquear
 * el popup que usa Google, por eso también se reintenta en el primer clic o
 * tecla (`reconectarEnPrimerGesto`), donde el popup sí está permitido.
 */
async function reconexionSilenciosa({ ignorarEspera = false } = {}) {
  if (hayToken()) return true;
  if (!conectadoAlgunaVez() || reconectando) return false;
  if (!ignorarEspera && Date.now() - ultimoIntentoSilencioso < ESPERA_RECONEXION_SILENCIOSA_MS) return false;
  ultimoIntentoSilencioso = Date.now();
  reconectando = true;
  try {
    if (!(await esperarGoogle())) return false;
    await conectar({ silencioso: true });
    return tieneScope('drive');
  } catch {
    return false;
  } finally {
    reconectando = false;
  }
}

/** Renovar el token cuando le quedan menos de 15 minutos (v0.100.0), para que no venza mientras se usa la app. */
const MARGEN_RENOVACION_MS = 15 * 60 * 1000;
const ESPERA_RENOVACION_MS = 30 * 1000;
const ESPERA_RENOVACION_TRAS_FALLO_MS = 5 * 60 * 1000;
let esperaRenovacion = ESPERA_RENOVACION_MS;
let ultimaRenovacion = 0;

/**
 * Renueva en silencio la sesión de Google antes de que venza (o la recupera si ya venció). Google solo deja abrir su
 * popup silencioso con un gesto del usuario (clic o tecla), así que se llama en cada gesto (`configurarEventos`) y,
 * sin gesto, al volver a la pestaña: si el navegador lo bloquea no pasa nada, el token actual sigue sirviendo hasta que
 * venza. Así, mientras el usuario usa la app la sesión se mantiene sola y el aviso de "sesión vencida" casi no aparece.
 */
async function renovarSiHaceFalta() {
  // Solo renueva un token que todavía sirve. Si ya no hay sesión, la recuperación es la de `reconectarEnPrimerGesto`
  // (un intento silencioso) y, si no alcanza, el botón «Reconectar»: reintentar una ventana silenciosa en cada clic
  // no conecta nunca si Google necesita interacción, y se pisaría con el botón.
  if (sync.soloLectura || !sync.datosListos || reconectando || !hayToken()) return;
  if (msHastaVencer() > MARGEN_RENOVACION_MS) return;
  if (navigator.onLine === false || Date.now() - ultimaRenovacion < esperaRenovacion) return;
  ultimaRenovacion = Date.now();
  reconectando = true;
  try {
    if (await esperarGoogle()) {
      await conectar({ silencioso: true });
      esperaRenovacion = ESPERA_RENOVACION_MS;
    }
  } catch {
    // El token actual sigue valiendo hasta que venza; si Google pide interacción, no se insiste en cada clic.
    esperaRenovacion = ESPERA_RENOVACION_TRAS_FALLO_MS;
  } finally {
    reconectando = false;
  }
}

// ---------------------------------------------------------------------------
// Sincronización con Drive
// ---------------------------------------------------------------------------

/**
 * Sincroniza con Drive: sube lo pendiente, trae y mezcla lo que otro
 * dispositivo haya cambiado, y recién cuando Drive confirma actualiza la copia
 * local y borra el buffer pendiente. La usan el arranque, el botón "Sincronizar
 * ahora", la verificación automática, la reconexión y la subida tras un cambio.
 * Con `forzar: true` aplica los cambios de otros dispositivos aunque haya texto
 * a medio escribir.
 */
export async function sincronizarAhora({ forzar = false } = {}) {
  if (sync.soloLectura) return;
  if (sincronizando) {
    volverASincronizar = true;
    return;
  }
  sincronizando = true;
  clearTimeout(temporizadorSubida);
  try {
    for (let intento = 0; intento < 3; intento += 1) {
      const resultado = await sincronizarUnaVez(forzar);
      if (resultado !== 'reintentar') break;
    }
  } catch (error) {
    manejarErrorSync(error);
  } finally {
    sincronizando = false;
    if (volverASincronizar) {
      volverASincronizar = false;
      programarSubida(0);
    }
  }
}

async function sincronizarUnaVez(forzar) {
  if (!hayToken()) throw new ErrorDrive('sin-sesion', 'No hay una sesión de Google activa.');
  const estadoAntes = sync.estado;
  if (sync.reconexionManual) setSync({ reconexionManual: false });
  setSync({ estado: sync.hayPendiente ? 'guardando' : sync.datosListos ? 'verificando' : 'conectando' });

  const versionInicial = versionLocal;
  const ahora = new Date().toISOString();
  const meta = await buscarArchivoRemoto();
  const avisosNuevos = [];
  if (meta && meta.duplicados > 0 && !avisoDuplicadosMostrado) {
    avisoDuplicadosMostrado = true;
    avisosNuevos.push(avisoInformativo(ahora, `Se encontraron ${meta.duplicados + 1} archivos de datos en Drive con el mismo nombre (probablemente creados a la vez desde dos dispositivos): se usa el más antiguo. Podés borrar los otros desde Drive.`));
  }

  let remoto = null;
  if (meta && (!base || meta.modifiedTime !== baseModifiedTime)) {
    const crudo = await leerArchivoRemoto(meta.id);
    // Otra versión de la app, más nueva, guardó este archivo: guardar desde acá podría descartar lo que esta no conoce.
    if (crudo && Number(crudo.formato) > FORMATO_ARCHIVO) {
      setSync({
        soloLectura: true,
        estado: 'error',
        mensajeError: 'Tus datos en Drive los guardó una versión más nueva de la app. Para no pisarlos, esta versión quedó en solo lectura: recargá la app (Ctrl+F5) para actualizarla.',
      });
      return 'ok';
    }
    remoto = normalizarArchivo(crudo);
  }
  // El usuario cambió algo mientras esperábamos a la red: se rehace con lo último.
  if (versionLocal !== versionInicial) return 'reintentar';

  const local = datosActuales(ahora);
  let resultado = local;
  let aplicar = false;
  let subir = false;
  let importoDatosViejos = false;

  if (!meta) {
    subir = true;
    if (datosViejos) {
      const fusion = mezclar(local, datosViejos, null, ahora);
      resultado = fusion.datos;
      aplicar = difierenDatos(resultado, local);
      importoDatosViejos = true;
    }
  } else if (remoto) {
    const mezcla = mezclar(local, remoto, base, ahora);
    resultado = copiarProfundo(mezcla.datos);
    avisosNuevos.push(...mezcla.avisos);
    // Dos dispositivos pudieron enlazar tareas de forma incompatible (regla 1 a 1): se repara y se avisa.
    for (const { tarea, previa, tipo } of repararEnlaces(resultado.tareas)) {
      tarea.tarea_modificado_en = ahora;
      avisosNuevos.push(
        avisoInformativo(
          ahora,
          tipo === 'ciclo'
            ? `Los cambios de dos dispositivos formaron un ciclo de dependencias: se soltó la tarea previa de «${tarea.tarea_nombre}».`
            : `La tarea «${tarea.tarea_nombre}» quedó sin tarea previa: dos dispositivos pusieron tareas detrás de «${previa ? previa.tarea_nombre : 'la misma tarea'}» y cada tarea bloquea a una sola. Volvé a enlazarla si hace falta.`
        )
      );
    }
    aplicar = difierenDatos(resultado, local);
    subir = difierenDatos(resultado, remoto);
  } else {
    subir = sync.hayPendiente && difierenDatos(local, base || {});
  }

  if (aplicar && !forzar && hayTextoEnEdicion()) {
    setSync({ cambiosRemotosDisponibles: true, estado: sync.hayPendiente ? 'pendiente' : 'sincronizado' });
    return 'diferido';
  }

  if (aplicar) {
    aplicarDatosAlEstado(resultado, ahora);
    tomarFotoSellado();
    // Llegó un cambio real (de otro dispositivo, o de datos viejos importados): deshacer no puede "cruzarlo" sin
    // riesgo de pisarlo, así que el historial se vacía acá; las acciones locales nuevas vuelven a ser deshacibles.
    invalidarHistorialDeshacer();
    notificar({ conservarBorradores: true });
  }

  let guardado = null;
  if (subir) {
    resultado.guardado_en = ahora;
    guardado = await guardarArchivoRemoto(resultado);
  }

  // Drive confirmó (o no había nada que subir): recién ahora se actualiza la copia local.
  base = copiarProfundo(subir ? resultado : remoto || base || resultado);
  baseModifiedTime = subir ? guardado.modifiedTime : meta.modifiedTime;
  if (subir || remoto) {
    await almacenamientoLocal.guardarCache({ datos: base, modifiedTime: baseModifiedTime, sincronizado_en: ahora });
  }
  const hayCambiosNuevos = versionLocal !== versionInicial;
  if (!hayCambiosNuevos) await almacenamientoLocal.borrarPendiente();

  if (importoDatosViejos) {
    limpiarDatosViejos();
    avisosNuevos.push(avisoInformativo(ahora, 'Se importaron a Drive los datos que había guardados en este navegador (de una versión anterior).'));
  }
  await agregarAvisos(avisosNuevos);

  const desfase = guardado ? guardado.desfaseRelojMs : sync.desfaseRelojMs;
  setSync({
    estado: hayCambiosNuevos ? 'pendiente' : 'sincronizado',
    datosListos: true,
    hayPendiente: hayCambiosNuevos,
    modificadoEnDrive: baseModifiedTime,
    verificadoEn: ahora,
    copiaDel: ahora,
    cambiosRemotosDisponibles: false,
    mensajeError: '',
    desfaseRelojMs: desfase,
    relojDesfasado: Math.abs(desfase) > DESFASE_RELOJ_MAX_MS,
    recienConectado: ['sin-conexion', 'sesion-vencida', 'conectando', 'error'].includes(estadoAntes),
  });
  if (hayCambiosNuevos) programarSubida();
  return 'ok';
}

function manejarErrorSync(error) {
  if (error instanceof ErrorDrive) {
    if (error.codigo === 'sin-conexion') {
      setSync({ estado: 'sin-conexion' });
      return;
    }
    if (error.codigo === 'sin-sesion' || error.codigo === 'sesion-vencida') {
      setSync({ estado: estadoSinSesion() });
      return;
    }
  }
  console.error('Error al sincronizar con Drive:', error);
  setSync({ estado: 'error', mensajeError: error && error.message ? error.message : 'No se pudo sincronizar con Drive.' });
  programarSubida(REINTENTO_ERROR_MS);
}

/**
 * Conecta con Google (un solo popup, Drive + Calendar) y sincroniza. Es lo que
 * hacen la pantalla inicial y el botón "Reconectar Drive".
 */
export async function conectarDrive() {
  await conectar();
  if (!tieneScope('drive')) {
    invalidarToken('sin permiso de Drive');
    throw new Error('Para guardar tus datos tenés que permitir el acceso a Google Drive en la ventana de autorización.');
  }
  setSync({ estado: 'conectando' });
  await sincronizarAhora({ forzar: true });
}

export function limpiarRecienConectado() {
  setSync({ recienConectado: false });
}

// ---------------------------------------------------------------------------
// Verificación automática
// ---------------------------------------------------------------------------

async function verificar() {
  if (sync.soloLectura || sincronizando || !sync.datosListos) return;
  // El refresco de Calendar (invalidar caché + reubicar/adelantar tareas) lo cubre `refrescarCalendar()`
  // (`app.js`, v0.80.0), que corre con su propio intervalo de 5 minutos — no hace falta duplicarlo acá.
  if (navigator.onLine === false) {
    setSync({ estado: 'sin-conexion' });
    return;
  }
  if (!hayToken() && !(await reconexionSilenciosa())) {
    setSync({ estado: estadoSinSesion() });
    return;
  }
  if (sync.hayPendiente) {
    await sincronizarAhora();
    return;
  }
  try {
    const meta = await buscarArchivoRemoto();
    if (meta && meta.modifiedTime === baseModifiedTime) {
      setSync({ estado: 'sincronizado', verificadoEn: new Date().toISOString(), mensajeError: '' });
    } else if (hayTextoEnEdicion()) {
      setSync({ cambiosRemotosDisponibles: true });
    } else {
      await sincronizarAhora();
    }
  } catch (error) {
    manejarErrorSync(error);
  }
}

let reconexionPorClicArmada = false;

/**
 * Google exige un gesto del usuario para abrir su popup: si al abrir la app
 * no hay sesión, se reintenta la reconexión silenciosa en el primer clic o
 * tecla (salvo en los botones que ya conectan por su cuenta).
 */
function reconectarEnPrimerGesto() {
  if (!conectadoAlgunaVez() || reconexionPorClicArmada) return;
  reconexionPorClicArmada = true;
  setSync({ reconectaConClic: true });
  const intentar = async (evento) => {
    if (evento.target && evento.target.closest && evento.target.closest('[data-accion-sync="reconectar"], [data-reconectar], #boton-conectar-inicial, #boton-sync')) return;
    document.removeEventListener('pointerdown', intentar, true);
    document.removeEventListener('keydown', intentar, true);
    reconexionPorClicArmada = false;
    setSync({ reconectaConClic: false });
    if (hayToken() || sync.soloLectura) return;
    if (!(await reconexionSilenciosa({ ignorarEspera: true }))) {
      // La reconexión sin ventana no alcanzó (Google pide interacción): se muestra el botón «Reconectar».
      setSync({ reconexionManual: true });
      return;
    }
    await sincronizarAhora();
  };
  document.addEventListener('pointerdown', intentar, true);
  document.addEventListener('keydown', intentar, true);
}

let eventosConfigurados = false;

function configurarEventos() {
  if (eventosConfigurados) return;
  eventosConfigurados = true;
  reconectarEnPrimerGesto();
  // Cada clic o tecla es una oportunidad para renovar la sesión (ver `renovarSiHaceFalta`).
  const alGesto = (evento) => {
    if (evento.target && evento.target.closest && evento.target.closest('[data-accion-sync="reconectar"], [data-reconectar], #boton-conectar-inicial, #boton-sync')) return;
    renovarSiHaceFalta();
  };
  document.addEventListener('pointerdown', alGesto, true);
  document.addEventListener('keydown', alGesto, true);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      renovarSiHaceFalta();
      verificar();
    } else if (sync.hayPendiente && hayToken()) {
      sincronizarAhora();
    }
  });
  window.addEventListener('pagehide', () => {
    if (sync.hayPendiente && hayToken()) sincronizarAhora();
  });
  window.addEventListener('beforeunload', (evento) => {
    if (!sync.hayPendiente) return;
    evento.preventDefault();
    evento.returnValue = '';
  });
  window.addEventListener('online', verificar);
  window.addEventListener('offline', () => setSync({ estado: 'sin-conexion' }));
  document.addEventListener('focusout', () => {
    if (!sync.cambiosRemotosDisponibles) return;
    setTimeout(() => {
      if (sync.cambiosRemotosDisponibles && !hayTextoEnEdicion()) sincronizarAhora();
    }, 300);
  });
  setInterval(verificar, INTERVALO_VERIFICACION_MS);
}

// ---------------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------------

async function intentarSesionInicial() {
  const sinSesion = () => setSync({ estado: sync.datosListos ? estadoSinSesion() : 'sin-destino' });

  if (!conectadoAlgunaVez()) {
    sinSesion();
    return;
  }
  if (navigator.onLine === false) {
    setSync({ estado: sync.datosListos ? 'sin-conexion' : 'sin-destino' });
    return;
  }
  ultimoIntentoSilencioso = Date.now();
  if (!(await esperarGoogle())) {
    setSync({ estado: sync.datosListos ? 'sin-conexion' : 'sin-destino' });
    return;
  }
  try {
    await conectar({ silencioso: true });
  } catch {
    sinSesion();
    return;
  }
  if (!tieneScope('drive')) {
    sinSesion();
    return;
  }
  await sincronizarAhora();
}

export async function inicializarAlmacenamiento() {
  try {
    localStorage.removeItem(CLAVE_LOCALSTORAGE_ULTIMA_MOD_VIEJA);
  } catch {
    // Solo es limpieza de una clave que ya no se usa.
  }
  datosViejos = leerDatosViejos();

  if (!(await adquirirBloqueoEdicion())) {
    setSync({ soloLectura: true, estado: 'sin-conexion' });
    notificar();
    return;
  }

  alPerderSesion(() => {
    if (!sync.soloLectura) setSync({ estado: estadoSinSesion() });
  });

  const [cache, pendiente, avisos] = await Promise.all([
    almacenamientoLocal.leerCache(),
    almacenamientoLocal.leerPendiente(),
    almacenamientoLocal.leerAvisos(),
  ]);

  base = cache ? copiarProfundo(normalizarArchivo(cache.datos)) : null;
  baseModifiedTime = cache ? cache.modifiedTime : null;
  const origen = pendiente ? pendiente.datos : cache ? cache.datos : null;
  if (origen) aplicarDatosAlEstado(normalizarArchivo(origen));
  tomarFotoSellado();

  setSync({
    estado: 'conectando',
    datosListos: !!origen,
    hayPendiente: !!pendiente,
    copiaDel: cache ? cache.sincronizado_en : null,
    modificadoEnDrive: cache ? cache.modifiedTime : null,
    avisos,
    datosViejosDisponibles: !!datosViejos,
    almacenamientoLocalDisponible: almacenamientoLocal.hayAlmacenamientoLocal(),
  });
  notificar();

  configurarEventos();
  await intentarSesionInicial();
}

// ---------------------------------------------------------------------------
// Datos de versiones anteriores (localStorage)
// ---------------------------------------------------------------------------

/** Mezcla los datos viejos de este navegador con los que ya hay (los actuales ganan). */
export async function mezclarDatosViejos() {
  if (!datosViejos) return;
  const ahora = new Date().toISOString();
  const fusion = mezclar(datosActuales(ahora), datosViejos, null, ahora);
  aplicarDatosAlEstado(fusion.datos, ahora);
  limpiarDatosViejos();
  await persistirYNotificar();
  await agregarAvisos(fusion.avisos);
}

export function descartarDatosViejos() {
  limpiarDatosViejos();
}

// ---------------------------------------------------------------------------
// Exportar / importar (respaldo manual)
// ---------------------------------------------------------------------------

// Copia de seguridad (v0.105.0): cuándo se exportó por última vez en este dispositivo y cada cuántos días recordarlo.
const CLAVE_ULTIMA_EXPORTACION = 'super-todo-list:ultima-exportacion';
const CLAVE_RECORDATORIO_COPIA = 'super-todo-list:recordatorio-copia-dias';
const CLAVE_PRIMER_USO = 'super-todo-list:primer-uso-copia';
export const DIAS_RECORDATORIO_COPIA = [0, 7, 14, 30, 90]; // 0 = nunca

export function ultimaExportacion() {
  try {
    return localStorage.getItem(CLAVE_ULTIMA_EXPORTACION) || '';
  } catch {
    return '';
  }
}

export function leerDiasRecordatorioCopia() {
  try {
    const guardado = localStorage.getItem(CLAVE_RECORDATORIO_COPIA);
    const dias = guardado === null ? 30 : Number(guardado);
    return DIAS_RECORDATORIO_COPIA.includes(dias) ? dias : 30;
  } catch {
    return 30;
  }
}

export function guardarDiasRecordatorioCopia(dias) {
  try {
    localStorage.setItem(CLAVE_RECORDATORIO_COPIA, String(dias));
  } catch {
    // Es solo una preferencia de este dispositivo.
  }
}

/**
 * Si toca recordar la copia de seguridad: `{ dias, nunca }` (días desde la última exportación; `nunca` si en este
 * dispositivo todavía no se exportó nada, en cuyo caso se cuenta desde la primera vez que se abrió la app con datos) o
 * `null` si no toca (recordatorio apagado, sin datos o copia reciente).
 */
export function copiaVencida() {
  const limite = leerDiasRecordatorioCopia();
  if (limite === 0 || !estado.tareas || estado.tareas.length === 0) return null;
  const ultima = ultimaExportacion();
  let base = ultima;
  if (!base) {
    try {
      base = localStorage.getItem(CLAVE_PRIMER_USO);
      if (!base) {
        base = new Date().toISOString();
        localStorage.setItem(CLAVE_PRIMER_USO, base);
      }
    } catch {
      return null;
    }
  }
  const dias = Math.floor((Date.now() - new Date(base).getTime()) / 86400000);
  return dias >= limite ? { dias, nunca: !ultima } : null;
}

export function exportarJSON() {
  try {
    localStorage.setItem(CLAVE_ULTIMA_EXPORTACION, new Date().toISOString());
  } catch {
    // Solo es el registro de cuándo se exportó.
  }
  const blob = new Blob([JSON.stringify(estado, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = `super-todo-list-${fechaLocalISO()}.json`;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  URL.revokeObjectURL(url);
}

export async function importarJSON(archivo) {
  const confirmado = await confirmar(
    'Importar reemplaza TODOS tus datos actuales (también en Google Drive) por el contenido del archivo. ¿Querés continuar?'
  );
  if (!confirmado) return;

  const texto = await archivo.text();
  const normalizados = normalizarDatosCrudos(JSON.parse(texto));
  for (const cfg of COLECCIONES) estado[cfg.clave] = normalizados[cfg.clave];
  await persistirYNotificar();
}

/**
 * Vacía las colecciones (tareas, categorías, ubicaciones, metas, personas, mejoras
 * y cumplimientos) y lo guarda como cualquier otro cambio: el estado y el archivo de
 * Drive quedan vacíos y los otros dispositivos también borran (las bajas quedan
 * registradas como eliminadas). Quien la llama debe pedir la confirmación.
 */
export async function borrarTodosLosDatos() {
  for (const cfg of COLECCIONES) estado[cfg.clave] = [];
  await persistirYNotificar();
}
