export function generarId() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

export function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

export function ahoraISO() {
  return new Date().toISOString();
}

export function formatearFecha(fechaISO) {
  if (!fechaISO) return '';
  const [anio, mes, dia] = fechaISO.split('-');
  if (!anio || !mes || !dia) return fechaISO;
  return `${dia}/${mes}/${anio}`;
}

export function esVencida(fechaLimiteISO) {
  if (!fechaLimiteISO) return false;
  return fechaLimiteISO < hoyISO();
}

export function esHoy(fechaISO) {
  if (!fechaISO) return false;
  return fechaISO.slice(0, 10) === hoyISO();
}

/**
 * Convención de fecha±hora usada en toda la app: un string de 10 caracteres
 * (`YYYY-MM-DD`) significa "sin hora específica"; más de 10 significa
 * datetime ISO completo con hora.
 */
export function tieneHora(fechaISO) {
  return !!fechaISO && fechaISO.length > 10;
}

/** Pone en mayúscula la primera letra de un texto (el resto queda como está). */
export function capitalizarPrimera(texto) {
  const t = String(texto == null ? '' : texto);
  return t.charAt(0).toLocaleUpperCase('es') + t.slice(1);
}

export function escaparHtml(texto) {
  const div = document.createElement('div');
  div.textContent = texto == null ? '' : String(texto);
  return div.innerHTML;
}

export function formatearFechaHora(fechaHoraISO) {
  if (!fechaHoraISO) return '';
  const fecha = new Date(fechaHoraISO);
  if (Number.isNaN(fecha.getTime())) return fechaHoraISO;
  const dia = String(fecha.getDate()).padStart(2, '0');
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const anio = fecha.getFullYear();
  const horas = String(fecha.getHours()).padStart(2, '0');
  const minutos = String(fecha.getMinutes()).padStart(2, '0');
  return `${dia}/${mes}/${anio} ${horas}:${minutos}`;
}

/**
 * Formatea una fecha de Tarea (`tarea_fecha_*`) según lleve hora o no,
 * eligiendo automáticamente entre formatearFecha/formatearFechaHora.
 */
export function formatearFechaOFechaHora(fechaISO) {
  return tieneHora(fechaISO) ? formatearFechaHora(fechaISO) : formatearFecha(fechaISO);
}

export function fechaISOMasDias(dias, desdeISODate) {
  const base = desdeISODate ? new Date(desdeISODate + 'T00:00:00') : new Date();
  base.setDate(base.getDate() + dias);
  return base.toISOString().slice(0, 10);
}

export function combinarFechaYHora(fechaISODate, horaHHMM) {
  const [horas, minutos] = horaHHMM.split(':').map(Number);
  const fecha = new Date(fechaISODate + 'T00:00:00');
  fecha.setHours(horas, minutos, 0, 0);
  return fecha.toISOString();
}

export function noPuedeEmpezarTodavia(fechaInicioHabilitadaISO) {
  if (!fechaInicioHabilitadaISO) return false;
  if (tieneHora(fechaInicioHabilitadaISO)) {
    return new Date(fechaInicioHabilitadaISO) > new Date();
  }
  return fechaInicioHabilitadaISO > hoyISO();
}

export function diasEntreFechas(fechaISO1, fechaISO2) {
  const fecha1 = new Date(fechaISO1 + 'T00:00:00');
  const fecha2 = new Date(fechaISO2 + 'T00:00:00');
  return Math.round((fecha2 - fecha1) / (24 * 60 * 60 * 1000));
}

/**
 * Desplaza una fecha±hora de Tarea por un delta en milisegundos, preservando
 * si el valor queda con hora (datetime completo) o sin ella (solo fecha) —
 * usado por la cascada de reprogramación en tareas-logica.js.
 */
export function desplazarFecha(fechaISO, deltaMs) {
  if (!fechaISO) return fechaISO;
  if (tieneHora(fechaISO)) {
    return new Date(new Date(fechaISO).getTime() + deltaMs).toISOString();
  }
  const deltaDias = Math.round(deltaMs / (24 * 60 * 60 * 1000));
  const fecha = new Date(fechaISO + 'T00:00:00');
  fecha.setDate(fecha.getDate() + deltaDias);
  return fecha.toISOString().slice(0, 10);
}

/**
 * Aplana el árbol de categorías (vía `categoria_padre_id`) en orden DFS,
 * cada entrada con su `profundidad` (0 = raíz) — para renderizar listas/
 * selects indentados. Los hermanos se ordenan por `categoria_prioridad`.
 */
export function arbolCategorias(categorias, padreId = null, profundidad = 0) {
  return categorias
    .filter((c) => (c.categoria_padre_id || null) === padreId)
    .sort((a, b) => a.categoria_prioridad - b.categoria_prioridad)
    .flatMap((c) => [
      { categoria: c, profundidad },
      ...arbolCategorias(categorias, c.categoria_id, profundidad + 1),
    ]);
}

/**
 * Arma el "camino" de nombres de una categoría hasta su raíz, recorriendo
 * `categoria_padre_id` (ej. "Facultad / IR"). Con protección ante ciclos
 * (no debería haberlos, pero evita un loop infinito si los datos están mal).
 */
/**
 * Sube por `categoria_padre_id` hasta la categoría raíz (sin padre). Usado
 * por `compararPorPrioridad` para que dos tareas de categorías distintas
 * pero con la misma raíz (ej. dos materias de "Facultad") compitan primero
 * por la prioridad de esa raíz. Con protección ante ciclos.
 */
export function categoriaRaiz(categoria, todasLasCategorias) {
  if (!categoria) return null;
  let actual = categoria;
  const visitados = new Set();
  while (actual.categoria_padre_id && !visitados.has(actual.categoria_id)) {
    visitados.add(actual.categoria_id);
    const padre = todasLasCategorias.find((c) => c.categoria_id === actual.categoria_padre_id);
    if (!padre) break;
    actual = padre;
  }
  return actual;
}

/**
 * Texto legible de una holgura en días (ver `calcularHolguraDias` en
 * tareas-logica.js): cuánto margen queda antes de vencer, o hace cuánto que
 * venció. Recibe el número ya calculado, no la tarea.
 */
export function textoHolgura(dias) {
  if (dias === Infinity) return '';
  if (dias < 0) return `Vencida hace ${Math.abs(dias)} día${Math.abs(dias) === 1 ? '' : 's'}`;
  if (dias === 0) return 'Vence hoy';
  return `Quedan ${dias} día${dias === 1 ? '' : 's'}`;
}

export function caminoCategoria(categoria, todasLasCategorias) {
  if (!categoria) return '';
  const nombres = [];
  let actual = categoria;
  const visitados = new Set();
  while (actual && !visitados.has(actual.categoria_id)) {
    nombres.unshift(actual.categoria_nombre);
    visitados.add(actual.categoria_id);
    actual = actual.categoria_padre_id
      ? todasLasCategorias.find((c) => c.categoria_id === actual.categoria_padre_id)
      : null;
  }
  return nombres.join(' / ');
}
