import { generarId, ahoraISO, capitalizarPrimera } from './utilidades.js';

export const ESTADOS_TAREA = ['bloqueada', 'pendiente', 'completada'];

export const ETIQUETAS_ESTADO = {
  bloqueada: 'Bloqueada',
  pendiente: 'Pendiente',
  completada: 'Completada',
};

export const NIVELES_IMPORTANCIA = ['urgente', 'importante'];

export const ETIQUETAS_IMPORTANCIA = {
  urgente: 'Urgente',
  importante: 'Importante',
};

export const ICONOS_IMPORTANCIA = {
  urgente: '🔴',
  importante: '🟡',
};

export const ORDEN_IMPORTANCIA = {
  urgente: 0,
  importante: 1,
};

export function crearCategoria({
  categoria_nombre,
  categoria_descripcion = '',
  categoria_color = '#4f7cff',
  categoria_prioridad = 0,
  categoria_disfrute = 3,
  categoria_padre_id = null,
}) {
  return {
    categoria_id: generarId(),
    categoria_nombre: capitalizarPrimera(categoria_nombre),
    categoria_descripcion,
    categoria_color,
    categoria_prioridad,
    categoria_disfrute,
    categoria_padre_id: categoria_padre_id || null,
  };
}

export function crearUbicacion({ ubicacion_nombre, ubicacion_latitud, ubicacion_longitud }) {
  return { ubicacion_id: generarId(), ubicacion_nombre: capitalizarPrimera(ubicacion_nombre), ubicacion_latitud, ubicacion_longitud };
}

export function crearPersona({ persona_nombre, persona_ultimo_contacto = '' }) {
  return {
    persona_id: generarId(),
    persona_nombre: capitalizarPrimera(persona_nombre),
    persona_ultimo_contacto,
    persona_creada_en: ahoraISO(),
  };
}

export const PLAZOS_META = ['corto', 'mediano', 'largo'];

export const ETIQUETAS_PLAZO = {
  corto: 'Corto plazo',
  mediano: 'Mediano plazo',
  largo: 'Largo plazo',
};

export function crearMeta({ meta_nombre, meta_plazo = 'mediano', meta_descripcion = '', meta_fecha_estimada = '' }) {
  return {
    meta_id: generarId(),
    meta_nombre: capitalizarPrimera(meta_nombre),
    meta_plazo,
    meta_descripcion,
    meta_fecha_estimada,
    meta_creada_en: ahoraISO(),
  };
}

export const UNIDADES_MANTENIMIENTO = ['dias', 'semanas', 'meses'];

export const ETIQUETAS_UNIDAD_MANTENIMIENTO = {
  dias: 'día(s)',
  semanas: 'semana(s)',
  meses: 'mes(es)',
};

export function crearTarea({
  tarea_nombre,
  categoria_id = null,
  tarea_estado = 'pendiente',
  tarea_fecha_inicio_habilitada = '',
  tarea_fecha_sugerida = '',
  tarea_fecha_limite = '',
  tarea_importancia = null,
  tarea_mantenimiento = false,
  tarea_mantenimiento_intervalo = null,
  tarea_dias_habiles = [],
  tarea_duracion_min = 15,
  tarea_descripcion = '',
  tarea_dependiente = null,
  ubicacion_id = null,
  tarea_requiere_clima_bueno = false,
  tarea_costo_estimado = 0,
  meta_id = null,
  tarea_prioridad_manual = null,
  tarea_disfrute = null,
  tarea_exportada_calendar = false,
  tarea_checklist = [],
  tarea_desencadenante = null,
  tarea_carga_completa = false,
}) {
  const creadaEn = ahoraISO();
  return {
    tarea_id: generarId(),
    tarea_nombre: capitalizarPrimera(tarea_nombre),
    categoria_id: categoria_id || null,
    tarea_estado,
    tarea_fecha_inicio_habilitada: tarea_fecha_inicio_habilitada || creadaEn,
    tarea_fecha_sugerida,
    tarea_fecha_limite,
    tarea_fecha_fin: null,
    tarea_importancia,
    tarea_mantenimiento,
    tarea_mantenimiento_intervalo,
    tarea_dias_habiles,
    tarea_duracion_min,
    tarea_descripcion,
    tarea_creada_en: creadaEn,
    tarea_dependiente: tarea_dependiente || null,
    ubicacion_id: ubicacion_id || null,
    tarea_requiere_clima_bueno,
    tarea_costo_estimado,
    meta_id: meta_id || null,
    tarea_prioridad_manual,
    tarea_disfrute,
    tarea_exportada_calendar,
    tarea_checklist,
    tarea_desencadenante: tarea_desencadenante || null,
    tarea_carga_completa,
  };
}

/**
 * Nota de mejora ("¿cómo se podría mejorar la próxima vez?") de una tarea de
 * mantenimiento. Se asocia al nombre de la tarea, no a una instancia, para
 * que sobreviva cuando las instancias completadas se archiven.
 */
export function crearMejora({ mejora_tarea_nombre, mejora_texto }) {
  return {
    mejora_id: generarId(),
    mejora_tarea_nombre,
    mejora_texto,
    mejora_fecha: ahoraISO(),
  };
}

/**
 * Registro liviano de que una tarea se cumplió (base del mapa de hábitos).
 * Guarda lo necesario para no depender de que la tarea siga existiendo.
 */
export function crearCumplimiento({ tarea, fecha }) {
  return {
    cumplimiento_id: generarId(),
    cumplimiento_tarea_id: tarea.tarea_id,
    cumplimiento_tarea_nombre: tarea.tarea_nombre,
    categoria_id: tarea.categoria_id || null,
    cumplimiento_fecha: fecha,
    cumplimiento_fecha_limite: tarea.tarea_fecha_limite || '',
    cumplimiento_mantenimiento: !!tarea.tarea_mantenimiento,
  };
}
