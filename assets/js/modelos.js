import { generarId, ahoraISO } from './utilidades.js';

export const ESTADOS_TAREA = ['a_confirmar', 'pendiente', 'en_progreso', 'completada'];

export const ETIQUETAS_ESTADO = {
  a_confirmar: 'A confirmar',
  pendiente: 'Pendiente',
  en_progreso: 'En progreso',
  completada: 'Completada',
};

export const NIVELES_IMPORTANCIA = ['baja', 'media', 'alta'];

export const ETIQUETAS_IMPORTANCIA = {
  baja: 'Baja',
  media: 'Media',
  alta: 'Alta',
};

export const ICONOS_IMPORTANCIA = {
  baja: '🟢',
  media: '🟡',
  alta: '🔴',
};

export const ORDEN_IMPORTANCIA = { alta: 0, media: 1, baja: 2 };

export function crearCategoria({ categoria_nombre, categoria_color = '#4f7cff', categoria_orden = 0, categoria_disfrute = 3 }) {
  return {
    categoria_id: generarId(),
    categoria_nombre,
    categoria_color,
    categoria_orden,
    categoria_disfrute,
  };
}

export function crearSubcategoria({ subcategoria_nombre, categoria_id, subcategoria_color = '#4f7cff' }) {
  return { subcategoria_id: generarId(), subcategoria_nombre, categoria_id, subcategoria_color };
}

export function crearUbicacion({ ubicacion_nombre, ubicacion_latitud, ubicacion_longitud }) {
  return { ubicacion_id: generarId(), ubicacion_nombre, ubicacion_latitud, ubicacion_longitud };
}

export function crearPersona({ persona_nombre, persona_ultimo_contacto = '', persona_notas = '' }) {
  return {
    persona_id: generarId(),
    persona_nombre,
    persona_ultimo_contacto,
    persona_notas,
    persona_creada_en: ahoraISO(),
  };
}

export const PLAZOS_META = ['corto', 'mediano', 'largo'];

export const ETIQUETAS_PLAZO = {
  corto: 'Corto plazo',
  mediano: 'Mediano plazo',
  largo: 'Largo plazo',
};

export function crearMeta({ meta_nombre, meta_plazo = 'mediano', meta_descripcion = '', meta_fecha_objetivo = '' }) {
  return {
    meta_id: generarId(),
    meta_nombre,
    meta_plazo,
    meta_descripcion,
    meta_fecha_objetivo,
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
  subcategoria_id = null,
  tarea_estado = 'pendiente',
  tarea_fecha_inicio_posible = '',
  tarea_fecha_limite = '',
  tarea_fecha_sugerida = '',
  tarea_fecha_hora_agendada = '',
  tarea_duracion_estimada_min = 30,
  tarea_notas = '',
  dependencias = [],
  tarea_mantenimiento = null,
  tarea_divisible = false,
  tarea_multitasking = false,
  tarea_importancia = 'media',
  tarea_dias_habiles = [],
  ubicacion_id = null,
  tarea_requiere_clima_bueno = false,
  metas_ids = [],
  tarea_recompensa = '',
  tarea_costo_estimado = 0,
  tarea_costo_real = null,
  tarea_genera_dinero = false,
}) {
  return {
    tarea_id: generarId(),
    tarea_nombre,
    categoria_id: categoria_id || null,
    subcategoria_id: subcategoria_id || null,
    tarea_estado,
    tarea_fecha_inicio_posible,
    tarea_fecha_limite,
    tarea_fecha_sugerida,
    tarea_fecha_hora_agendada,
    tarea_duracion_estimada_min,
    tarea_duracion_real_min: null,
    tarea_notas,
    tarea_notificada_en_para: '',
    dependencias,
    tarea_mantenimiento,
    tarea_divisible,
    tarea_multitasking,
    tarea_importancia,
    tarea_dias_habiles,
    ubicacion_id: ubicacion_id || null,
    tarea_requiere_clima_bueno,
    metas_ids,
    tarea_recompensa,
    tarea_costo_estimado,
    tarea_costo_real,
    tarea_genera_dinero,
    tarea_creada_en: ahoraISO(),
    tarea_completada_en: null,
  };
}
