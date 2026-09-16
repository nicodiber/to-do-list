import { ETIQUETAS_PLAZO, NIVELES_IMPORTANCIA, ETIQUETAS_IMPORTANCIA } from './modelos.js';
import { formatearFecha } from './utilidades.js';

/**
 * Arma un prompt en texto plano para pegar en un asistente de IA externo
 * (ChatGPT, Claude, etc.) y pedirle que proponga tareas concretas para
 * avanzar hacia una meta. El "core" de la app nunca llama a ningún LLM
 * directamente — es un flujo manual de copiar/pegar, offline-first.
 */
export function construirPromptSubtareas(meta) {
  const partes = [
    `Estoy planificando cómo lograr el siguiente objetivo personal: "${meta.nombre}".`,
    `Plazo: ${ETIQUETAS_PLAZO[meta.plazo] || meta.plazo}.`,
  ];
  if (meta.fecha_objetivo) partes.push(`Fecha objetivo: ${formatearFecha(meta.fecha_objetivo)}.`);
  if (meta.descripcion) partes.push(`Descripción: ${meta.descripcion}`);

  partes.push(
    '',
    'Proponeme una lista de tareas concretas y accionables para avanzar hacia este objetivo, en un orden razonable.',
    'Devolveme SOLO un JSON (sin texto adicional antes ni después) con este formato exacto:',
    '',
    '[',
    '  { "nombre": "...", "duracion_estimada_min": 30, "dias_desde_hoy": 3, "notas": "..." }',
    ']',
    '',
    '- "duracion_estimada_min": duración estimada en minutos, múltiplo de 15.',
    '- "dias_desde_hoy": en cuántos días conviene hacer esta tarea a partir de hoy (0 = hoy).',
    '- "notas": opcional, breve.'
  );

  return partes.join('\n');
}

/**
 * Parsea y normaliza el JSON que el usuario pega de vuelta con la
 * respuesta del LLM. Lanza un Error con un mensaje legible si el texto
 * no es JSON válido o no tiene la forma esperada.
 */
export function parsearRespuestaSubtareas(texto) {
  let datos;
  try {
    datos = JSON.parse(texto);
  } catch {
    throw new Error('No se pudo interpretar como JSON válido. Revisá que hayas pegado solo el JSON de la respuesta.');
  }

  if (!Array.isArray(datos)) {
    throw new Error('El JSON debe ser una lista (array) de tareas.');
  }

  const normalizadas = datos
    .filter((item) => item && typeof item.nombre === 'string' && item.nombre.trim())
    .map((item) => ({
      nombre: item.nombre.trim(),
      duracion_estimada_min: Number.isFinite(item.duracion_estimada_min) ? item.duracion_estimada_min : 30,
      dias_desde_hoy: Number.isFinite(item.dias_desde_hoy) ? item.dias_desde_hoy : 0,
      notas: typeof item.notas === 'string' ? item.notas.trim() : '',
    }));

  if (normalizadas.length === 0) {
    throw new Error('No se encontró ninguna tarea válida (con "nombre") en el JSON.');
  }

  return normalizadas;
}

/**
 * Arma un prompt para pedirle a un LLM externo que sugiera una nueva
 * importancia (baja/media/alta) para cada tarea accionable actual, según
 * urgencia/impacto. Mismo flujo manual de copiar/pegar que las subtareas.
 */
export function construirPromptPrioridades(tareas, categorias) {
  const filas = tareas.map((tarea) => {
    const categoria = categorias.find((c) => c.id === tarea.categoria_id);
    return [
      `id: ${tarea.id}`,
      `nombre: ${tarea.nombre}`,
      `categoría: ${categoria ? categoria.nombre : 'sin categoría'}`,
      `fecha límite: ${tarea.fecha_limite ? formatearFecha(tarea.fecha_limite) : 'sin fecha'}`,
      `importancia actual: ${ETIQUETAS_IMPORTANCIA[tarea.importancia] || ETIQUETAS_IMPORTANCIA.media}`,
    ].join(', ');
  });

  return [
    'Esta es la lista de mis tareas pendientes accionables ahora mismo:',
    '',
    ...filas.map((f) => `- ${f}`),
    '',
    'Revisala y sugerime una importancia (baja, media o alta) para cada una, según qué tan urgente/impactante te parece cada tarea (podés dejar la misma importancia si ya te parece correcta).',
    'Devolveme SOLO un JSON (sin texto adicional antes ni después) con este formato exacto, usando el "id" de cada tarea:',
    '',
    '[',
    '  { "id": "...", "importancia": "alta" }',
    ']',
  ].join('\n');
}

/**
 * Parsea y normaliza el JSON con las importancias sugeridas, y devuelve
 * solo los cambios reales (donde la sugerida difiere de la actual) contra
 * `tareasDisponibles`. Lanza un Error con mensaje legible si el formato
 * es inválido.
 */
export function parsearRespuestaPrioridades(texto, tareasDisponibles) {
  let datos;
  try {
    datos = JSON.parse(texto);
  } catch {
    throw new Error('No se pudo interpretar como JSON válido. Revisá que hayas pegado solo el JSON de la respuesta.');
  }

  if (!Array.isArray(datos)) {
    throw new Error('El JSON debe ser una lista (array) de sugerencias.');
  }

  const cambios = [];
  datos.forEach((item) => {
    if (!item || typeof item.id !== 'string' || !NIVELES_IMPORTANCIA.includes(item.importancia)) return;
    const tarea = tareasDisponibles.find((t) => t.id === item.id);
    if (!tarea) return;
    if (tarea.importancia === item.importancia) return;
    cambios.push({ tarea, importanciaSugerida: item.importancia });
  });

  if (cambios.length === 0) {
    throw new Error('No se encontró ningún cambio de importancia válido (revisá los "id" y que "importancia" sea baja/media/alta).');
  }

  return cambios;
}
