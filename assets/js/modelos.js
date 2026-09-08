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

export function crearSubcategoria({ nombre, categoria_id }) {
  return { id: generarId(), nombre, categoria_id };
}

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
    creada_en: ahoraISO(),
    completada_en: null,
  };
}
