import { ETIQUETAS_PLAZO, PLAZOS_META } from './modelos.js';
import { formatearFecha } from './utilidades.js';

/**
 * Arma un prompt en texto plano para pegar en un asistente de IA externo
 * (ChatGPT, Claude, etc.) y pedirle que proponga tareas concretas para
 * avanzar hacia una meta. El "core" de la app nunca llama a ningún LLM
 * directamente — es un flujo manual de copiar/pegar, offline-first.
 */
export function construirPromptSubtareas(meta) {
  const partes = [
    `Estoy planificando cómo lograr el siguiente objetivo personal: "${meta.meta_nombre}".`,
    `Plazo: ${ETIQUETAS_PLAZO[meta.meta_plazo] || meta.meta_plazo}.`,
  ];
  if (meta.meta_fecha_estimada) partes.push(`Fecha objetivo: ${formatearFecha(meta.meta_fecha_estimada)}.`);
  if (meta.meta_descripcion) partes.push(`Descripción: ${meta.meta_descripcion}`);

  partes.push(
    '',
    'Proponeme una lista de tareas concretas y accionables para avanzar hacia este objetivo, en un orden razonable.',
    'Devolveme SOLO un JSON (sin texto adicional antes ni después) con este formato exacto:',
    '',
    '[',
    '  { "tarea_nombre": "...", "tarea_duracion_min": 30, "dias_desde_hoy": 3, "tarea_descripcion": "..." }',
    ']',
    '',
    '- "tarea_duracion_min": duración estimada en minutos, múltiplo de 15.',
    '- "dias_desde_hoy": en cuántos días conviene hacer esta tarea a partir de hoy (0 = hoy).',
    '- "tarea_descripcion": opcional, breve.'
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
    .filter((item) => item && typeof item.tarea_nombre === 'string' && item.tarea_nombre.trim())
    .map((item) => ({
      tarea_nombre: item.tarea_nombre.trim(),
      tarea_duracion_min: Number.isFinite(item.tarea_duracion_min) ? item.tarea_duracion_min : 30,
      dias_desde_hoy: Number.isFinite(item.dias_desde_hoy) ? item.dias_desde_hoy : 0,
      tarea_descripcion: typeof item.tarea_descripcion === 'string' ? item.tarea_descripcion.trim() : '',
    }));

  if (normalizadas.length === 0) {
    throw new Error('No se encontró ninguna tarea válida (con "tarea_nombre") en el JSON.');
  }

  return normalizadas;
}

/**
 * Arma un prompt para pedirle a un LLM externo que sugiera si cada tarea accionable actual es urgente o no,
 * según urgencia/impacto. Mismo flujo manual de copiar/pegar que las subtareas.
 */
export function construirPromptPrioridades(tareas, categorias) {
  const filas = tareas.map((tarea) => {
    const categoria = categorias.find((c) => c.categoria_id === tarea.categoria_id);
    return [
      `id: ${tarea.tarea_id}`,
      `nombre: ${tarea.tarea_nombre}`,
      `categoría: ${categoria ? categoria.categoria_nombre : 'sin categoría'}`,
      `fecha límite: ${tarea.tarea_fecha_limite ? formatearFecha(tarea.tarea_fecha_limite) : 'sin fecha'}`,
      `urgente actualmente: ${tarea.tarea_urgente ? 'sí' : 'no'}`,
    ].join(', ');
  });

  return [
    'Esta es la lista de mis tareas pendientes accionables ahora mismo:',
    '',
    ...filas.map((f) => `- ${f}`),
    '',
    'Revisala y decime si cada una es urgente o no, según qué tan urgente/impactante te parece (podés dejarla igual si ya te parece correcta). Ojo: marcar una como urgente hace que se le asigne la fecha de hoy, así que usalo con criterio.',
    'Devolveme SOLO un JSON (sin texto adicional antes ni después) con este formato exacto, usando el "tarea_id" de cada tarea:',
    '',
    '[',
    '  { "tarea_id": "...", "tarea_urgente": true }',
    ']',
  ].join('\n');
}

/**
 * Parsea y normaliza el JSON con las urgencias sugeridas, y devuelve solo los cambios reales (donde la
 * sugerida difiere de la actual) contra `tareasDisponibles`. Lanza un Error con mensaje legible si el
 * formato es inválido.
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
    if (!item || typeof item.tarea_id !== 'string' || typeof item.tarea_urgente !== 'boolean') return;
    const tarea = tareasDisponibles.find((t) => t.tarea_id === item.tarea_id);
    if (!tarea) return;
    if (!!tarea.tarea_urgente === item.tarea_urgente) return;
    cambios.push({ tarea, urgenteSugerido: item.tarea_urgente });
  });

  if (cambios.length === 0) {
    throw new Error('No se encontró ningún cambio de urgencia válido (revisá los "tarea_id" y que "tarea_urgente" sea true/false).');
  }

  return cambios;
}

function formatearHistorial(historial) {
  return historial.map((turno) => `${turno.rol === 'usuario' ? 'Yo' : 'Vos'}: ${turno.texto}`).join('\n');
}

/**
 * Arma un prompt para dialogar con un LLM externo y definir una meta
 * personal a partir de una idea vaga. Como el LLM no tiene memoria entre
 * turnos (no hay backend ni llamadas directas), cada prompt reenvía el
 * historial completo de la conversación hasta el momento.
 */
export function construirPromptChatMeta(historial) {
  return [
    'Actuá como un coach de objetivos personales. Te voy a contar en qué estoy pensando y quiero que me ayudes, con preguntas y sugerencias, a definir una meta clara y accionable (con un plazo: corto, mediano o largo, y opcionalmente una fecha objetivo).',
    '',
    'Esta es la conversación hasta ahora:',
    '',
    formatearHistorial(historial),
    '',
    'Respondé en texto plano (no uses JSON), de forma conversacional: hacé las preguntas que hagan falta para aclarar la meta, o si ya te parece que quedó lo bastante clara decímelo explícitamente para poder cerrarla.',
  ].join('\n');
}

/**
 * Valida el texto que el usuario pega de vuelta con la respuesta
 * conversacional del LLM. No es JSON, es texto libre.
 */
export function parsearRespuestaChatMeta(texto) {
  const limpio = (texto || '').trim();
  if (!limpio) {
    throw new Error('Pegá la respuesta de tu asistente de IA antes de continuar.');
  }
  return limpio;
}

/**
 * Arma un prompt para pedirle al LLM que cierre la conversación con una
 * meta concreta, devolviendo SOLO un JSON con los campos que espera
 * `crearMeta` (assets/js/modelos.js).
 */
export function construirPromptFinalizarMeta(historial) {
  return [
    'Esta fue la conversación completa sobre mi objetivo:',
    '',
    formatearHistorial(historial),
    '',
    'Devolveme SOLO un JSON (sin texto adicional antes ni después) con la meta final, en este formato exacto:',
    '',
    '{',
    '  "meta_nombre": "...",',
    '  "meta_plazo": "corto",',
    '  "meta_fecha_estimada": "YYYY-MM-DD",',
    '  "meta_descripcion": "..."',
    '}',
    '',
    '- "meta_plazo": "corto", "mediano" o "largo".',
    '- "meta_fecha_estimada": opcional, dejalo como cadena vacía "" si no aplica.',
    '- "meta_descripcion": opcional, breve.',
  ].join('\n');
}

/**
 * Parsea y normaliza el JSON con la meta final propuesta por el LLM.
 * Lanza un Error con mensaje legible si el texto no es JSON válido o
 * no tiene un "nombre".
 */
export function parsearRespuestaFinalizarMeta(texto) {
  let datos;
  try {
    datos = JSON.parse(texto);
  } catch {
    throw new Error('No se pudo interpretar como JSON válido. Revisá que hayas pegado solo el JSON de la respuesta.');
  }

  if (!datos || typeof datos !== 'object' || Array.isArray(datos)) {
    throw new Error('El JSON debe ser un objeto (no una lista) con los datos de la meta.');
  }

  if (typeof datos.meta_nombre !== 'string' || !datos.meta_nombre.trim()) {
    throw new Error('El JSON debe incluir un "meta_nombre" para la meta.');
  }

  return {
    meta_nombre: datos.meta_nombre.trim(),
    meta_plazo: PLAZOS_META.includes(datos.meta_plazo) ? datos.meta_plazo : 'mediano',
    meta_fecha_estimada: typeof datos.meta_fecha_estimada === 'string' ? datos.meta_fecha_estimada.trim() : '',
    meta_descripcion: typeof datos.meta_descripcion === 'string' ? datos.meta_descripcion.trim() : '',
  };
}
