import { generarId, ahoraISO } from './utilidades.js';

export const ESTADOS_TAREA = ['a_confirmar', 'pendiente', 'en_progreso', 'completada'];

export const ETIQUETAS_ESTADO = {
  a_confirmar: 'A confirmar',
  pendiente: 'Pendiente',
  en_progreso: 'En progreso',
  completada: 'Completada',
};

export function crearCategoria({ nombre, color = '#4f7cff', orden = 0 }) {
  return { id: generarId(), nombre, color, orden };
}

export function crearSubcategoria({ nombre, categoria_id, color = '#4f7cff' }) {
  return { id: generarId(), nombre, categoria_id, color };
}

export function crearUbicacion({ nombre, latitud, longitud }) {
  return { id: generarId(), nombre, latitud, longitud };
}

export const PLAZOS_META = ['corto', 'mediano', 'largo'];

export const ETIQUETAS_PLAZO = {
  corto: 'Corto plazo',
  mediano: 'Mediano plazo',
  largo: 'Largo plazo',
};

export function crearMeta({ nombre, plazo = 'mediano', descripcion = '', fecha_objetivo = '' }) {
  return { id: generarId(), nombre, plazo, descripcion, fecha_objetivo, creada_en: ahoraISO() };
}

export const UNIDADES_MANTENIMIENTO = ['dias', 'semanas', 'meses'];

export const ETIQUETAS_UNIDAD_MANTENIMIENTO = {
  dias: 'día(s)',
  semanas: 'semana(s)',
  meses: 'mes(es)',
};

export function crearTarea({
  nombre,
  categoria_id = null,
  subcategoria_id = null,
  estado = 'pendiente',
  fecha_inicio_posible = '',
  fecha_limite = '',
  fecha_sugerida = '',
  fecha_hora_agendada = '',
  duracion_estimada_min = 30,
  notas = '',
  dependencias = [],
  mantenimiento = null,
  divisible = false,
  dias_habiles = [],
  ubicacion_id = null,
  requiere_clima_bueno = false,
  metas_ids = [],
}) {
  return {
    id: generarId(),
    nombre,
    categoria_id: categoria_id || null,
    subcategoria_id: subcategoria_id || null,
    estado,
    fecha_inicio_posible,
    fecha_limite,
    fecha_sugerida,
    fecha_hora_agendada,
    duracion_estimada_min,
    duracion_real_min: null,
    notas,
    motivo_incumplimiento: '',
    dependencias,
    mantenimiento,
    divisible,
    dias_habiles,
    ubicacion_id: ubicacion_id || null,
    requiere_clima_bueno,
    metas_ids,
    creada_en: ahoraISO(),
    completada_en: null,
  };
}
