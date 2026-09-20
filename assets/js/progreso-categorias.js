// Lógica pura (sin DOM) de "Progreso por categoría" en Estadísticas: por cada categoría raíz (sumando toda
// su rama) y por cada subcategoría, cuánto falta y cuándo vencen las tareas que quedan.

import { diaLocal, hoyISO, diasEntreFechas, arbolCategorias, descendientesDeCategoria } from './utilidades.js';

const ESTADOS_RESTANTES = ['pendiente', 'bloqueada'];

/** La tarea con la fecha (`campo`) más cercana o más lejana, y los días que faltan desde `hoy` (negativo = ya pasó). */
function extremo(tareas, campo, hoy, cual) {
  const conFecha = tareas.filter((t) => t[campo]).map((t) => ({ tarea: t, dia: diaLocal(t[campo]) }));
  if (conFecha.length === 0) return null;
  conFecha.sort((a, b) => a.dia.localeCompare(b.dia));
  const elegida = cual === 'primera' ? conFecha[0] : conFecha[conFecha.length - 1];
  return { tarea: elegida.tarea, dias: diasEntreFechas(hoy, elegida.dia) };
}

/**
 * Métricas de un grupo de tareas: (1) restantes vs. completadas, (2) tiempo a la próxima fecha límite,
 * (3) tiempo a la próxima fecha sugerida y (4) tiempo a la última fecha límite. Las fechas ya vencidas no
 * cuentan como "próximas": se informan aparte en `vencidas`.
 */
export function calcularMetricas(tareas, hoy = hoyISO()) {
  const completadas = tareas.filter((t) => t.tarea_estado === 'completada').length;
  const restantes = tareas.filter((t) => ESTADOS_RESTANTES.includes(t.tarea_estado));
  const vigentes = (campo) => restantes.filter((t) => t[campo] && diaLocal(t[campo]) >= hoy);
  return {
    restantes: restantes.length,
    completadas,
    total: restantes.length + completadas,
    vencidas: restantes.filter((t) => t.tarea_fecha_limite && diaLocal(t.tarea_fecha_limite) < hoy).length,
    proximaLimite: extremo(vigentes('tarea_fecha_limite'), 'tarea_fecha_limite', hoy, 'primera'),
    proximaSugerida: extremo(vigentes('tarea_fecha_sugerida'), 'tarea_fecha_sugerida', hoy, 'primera'),
    ultimaLimite: extremo(vigentes('tarea_fecha_limite'), 'tarea_fecha_limite', hoy, 'ultima'),
  };
}

/**
 * Una tarjeta por categoría raíz con las métricas de toda su rama y, dentro, una entrada por subcategoría
 * (con su propia rama). Las tareas sin categoría van en una tarjeta aparte al final.
 */
export function calcularProgresoPorCategoria(estado, hoy = hoyISO()) {
  const categorias = estado.categorias || [];
  const tareas = estado.tareas || [];
  const tareasDeRama = (categoriaId) => {
    const ids = new Set([categoriaId, ...descendientesDeCategoria(categoriaId, categorias)]);
    return tareas.filter((t) => ids.has(t.categoria_id));
  };

  const arbol = arbolCategorias(categorias);
  const tarjetas = arbol
    .filter((n) => n.profundidad === 0)
    .map((raiz) => ({
      categoria: raiz.categoria,
      metricas: calcularMetricas(tareasDeRama(raiz.categoria.categoria_id), hoy),
      subcategorias: arbolCategorias(categorias, raiz.categoria.categoria_id, 1).map((n) => ({
        categoria: n.categoria,
        profundidad: n.profundidad,
        metricas: calcularMetricas(tareasDeRama(n.categoria.categoria_id), hoy),
      })),
    }));

  const idsCategorias = new Set(categorias.map((c) => c.categoria_id));
  const sinCategoria = tareas.filter((t) => !t.categoria_id || !idsCategorias.has(t.categoria_id));
  if (sinCategoria.length > 0) tarjetas.push({ categoria: null, metricas: calcularMetricas(sinCategoria, hoy), subcategorias: [] });

  return tarjetas.filter((t) => t.metricas.total > 0);
}
