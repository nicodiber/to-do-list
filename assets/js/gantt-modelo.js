// Lógica pura (sin DOM) del Gantt: dónde cae cada tarea en el tiempo, qué filas se muestran y qué flechas
// las unen. Todo en días locales (`YYYY-MM-DD`, ver `diaLocal`). La vista (`views/gantt.view.js`) solo dibuja.

import { diaLocal, hoyISO, fechaISOMasDias, arbolCategorias, categoriaRaiz, descendientesDeCategoria } from './utilidades.js';
import { compararPorPrioridad } from './tareas-logica.js';

export const AGRUPACIONES = ['categoria', 'meta', 'nada'];
export const FILTROS_ESTADO = ['activas', 'pendientes', 'bloqueadas', 'completadas', 'todas'];

/**
 * El día de `tarea_fecha_inicio_habilitada` solo si el usuario lo cargó: por defecto vale la fecha de
 * creación, que no cuenta como una fecha real (mismo criterio que `esTareaSoloConNombre`). Vacío si no.
 */
export function habilitadaReal(tarea) {
  const habilitada = tarea.tarea_fecha_inicio_habilitada;
  if (!habilitada || habilitada === tarea.tarea_creada_en) return '';
  return diaLocal(habilitada);
}

function maximo(...dias) {
  return dias.filter(Boolean).sort().pop();
}

/** El carril de una tarea según la agrupación: `{ clave, nombre, color }`. */
export function carrilDe(tarea, estado, agruparPor) {
  if (agruparPor === 'nada') return { clave: 'todas', nombre: '', color: null };
  if (agruparPor === 'meta') {
    const meta = (estado.metas || []).find((m) => m.meta_id === tarea.meta_id);
    return meta ? { clave: meta.meta_id, nombre: meta.meta_nombre, color: null } : { clave: '', nombre: 'Sin meta', color: null };
  }
  const categorias = estado.categorias || [];
  const categoria = categorias.find((c) => c.categoria_id === tarea.categoria_id);
  const raiz = categoria ? categoriaRaiz(categoria, categorias) : null;
  return raiz ? { clave: raiz.categoria_id, nombre: raiz.categoria_nombre, color: raiz.categoria_color } : { clave: '', nombre: 'Sin categoría', color: null };
}

/** Las claves de carril en el orden en que se muestran (los "sin ..." al final). */
function ordenDeCarriles(estado, agruparPor) {
  if (agruparPor === 'nada') return ['todas'];
  if (agruparPor === 'meta') return [...(estado.metas || []).map((m) => m.meta_id), ''];
  return [...arbolCategorias(estado.categorias || []).filter((n) => n.profundidad === 0).map((n) => n.categoria.categoria_id), ''];
}

/**
 * Dónde cae cada tarea en el tiempo (`Map(tarea_id → { dia, virtual, completada })`):
 * 1. Con `tarea_fecha_sugerida`: ese día (real).
 * 2. Sin sugerida y sin previa: **posición estimada** en la cola de su carril, ordenada por prioridad, una por día
 *    desde hoy (y no antes de su fecha habilitada, si la cargaste). No se guarda: es solo para dibujar.
 * 3. Sin sugerida y con previa: el día siguiente al de su previa (real o estimado), como mínimo hoy.
 * Las completadas van en el día en que se completaron. Nunca se usa la fecha de creación. Se calcula sobre
 * todas las tareas, antes de filtrar, para que filtrar no mueva las posiciones.
 */
export function calcularPosiciones(estado, { hoy = hoyISO(), agruparPor = 'categoria' } = {}) {
  const tareas = estado.tareas || [];
  const porId = new Map(tareas.map((t) => [t.tarea_id, t]));
  const posiciones = new Map();

  tareas
    .filter((t) => t.tarea_estado === 'completada')
    .forEach((t) => posiciones.set(t.tarea_id, { dia: t.tarea_fecha_fin ? diaLocal(t.tarea_fecha_fin) : hoy, virtual: false, completada: true }));

  const pendientes = tareas.filter((t) => t.tarea_estado !== 'completada');
  pendientes.filter((t) => t.tarea_fecha_sugerida).forEach((t) => posiciones.set(t.tarea_id, { dia: diaLocal(t.tarea_fecha_sugerida), virtual: false, completada: false }));

  const tienePrevia = (t) => !!t.tarea_dependiente && porId.has(t.tarea_dependiente);
  const colas = new Map();
  pendientes
    .filter((t) => !t.tarea_fecha_sugerida && !tienePrevia(t))
    .forEach((t) => {
      const clave = carrilDe(t, estado, agruparPor).clave;
      colas.set(clave, [...(colas.get(clave) || []), t]);
    });
  colas.forEach((cola) => {
    cola.sort((a, b) => compararPorPrioridad(a, b, estado.categorias || []));
    cola.forEach((t, n) => posiciones.set(t.tarea_id, { dia: maximo(fechaISOMasDias(n, hoy), habilitadaReal(t)), virtual: true, completada: false }));
  });

  const enCurso = new Set();
  const diaDeEncadenada = (t) => {
    const ya = posiciones.get(t.tarea_id);
    if (ya) return ya.dia;
    if (enCurso.has(t.tarea_id)) return hoy;
    enCurso.add(t.tarea_id);
    const previa = porId.get(t.tarea_dependiente);
    const diaPrevia = previa ? diaDeEncadenada(previa) : hoy;
    const dia = maximo(hoy, fechaISOMasDias(1, diaPrevia), habilitadaReal(t));
    posiciones.set(t.tarea_id, { dia, virtual: true, completada: false });
    return dia;
  };
  pendientes.filter((t) => !posiciones.has(t.tarea_id)).forEach(diaDeEncadenada);

  return posiciones;
}

/**
 * La ventana (holgura) de una tarea: de hoy (o de su fecha habilitada, si la cargaste) a su fecha límite.
 * Si el límite ya pasó, va del límite a hoy y `vencida` es `true`. Sin límite no hay ventana (`null`).
 */
export function calcularVentana(tarea, hoy = hoyISO()) {
  if (!tarea.tarea_fecha_limite || tarea.tarea_estado === 'completada') return null;
  const limite = diaLocal(tarea.tarea_fecha_limite);
  if (limite < hoy) return { inicio: limite, fin: hoy, vencida: true };
  const habilitada = habilitadaReal(tarea);
  const inicio = habilitada && habilitada > hoy ? habilitada : hoy;
  return { inicio: inicio > limite ? limite : inicio, fin: limite, vencida: false };
}

function sinAcentos(texto) {
  return String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Filtros: categoría (con sus subcategorías), meta, estado y texto en el nombre. */
export function aplicarFiltros(tareas, filtros, estado) {
  const { categoria = '', meta = '', estado: filtroEstado = 'activas', texto = '' } = filtros || {};
  const categoriaIds = categoria ? new Set([categoria, ...descendientesDeCategoria(categoria, estado.categorias || [])]) : null;
  const buscado = sinAcentos(texto.trim());
  return tareas.filter((t) => {
    if (categoriaIds && !categoriaIds.has(t.categoria_id)) return false;
    if (meta && t.meta_id !== meta) return false;
    if (buscado && !sinAcentos(t.tarea_nombre).includes(buscado)) return false;
    if (filtroEstado === 'activas') return t.tarea_estado !== 'completada';
    if (filtroEstado === 'pendientes') return t.tarea_estado === 'pendiente';
    if (filtroEstado === 'bloqueadas') return t.tarea_estado === 'bloqueada';
    if (filtroEstado === 'completadas') return t.tarea_estado === 'completada';
    return true;
  });
}

/**
 * Las filas del Gantt: un separador `{ carril }` por carril con tareas y, debajo, una fila `{ tarea, plan, ventana,
 * limite, noLlega }` por tarea (ordenadas por día y prioridad). `noLlega` indica que el día plan cae después
 * del límite. Con la agrupación "nada" no hay separadores.
 */
export function construirFilas(estado, { filtros = {}, agruparPor = 'categoria', hoy = hoyISO() } = {}) {
  const posiciones = calcularPosiciones(estado, { hoy, agruparPor });
  const visibles = aplicarFiltros(estado.tareas || [], filtros, estado);
  const porCarril = new Map();
  visibles.forEach((t) => {
    const carril = carrilDe(t, estado, agruparPor);
    if (!porCarril.has(carril.clave)) porCarril.set(carril.clave, { carril, tareas: [] });
    porCarril.get(carril.clave).tareas.push(t);
  });

  const filas = [];
  ordenDeCarriles(estado, agruparPor).forEach((clave) => {
    const grupo = porCarril.get(clave);
    if (!grupo) return;
    if (agruparPor !== 'nada') filas.push({ carril: grupo.carril });
    grupo.tareas
      .slice()
      .sort((a, b) => posiciones.get(a.tarea_id).dia.localeCompare(posiciones.get(b.tarea_id).dia) || compararPorPrioridad(a, b, estado.categorias || []))
      .forEach((tarea) => {
        const plan = posiciones.get(tarea.tarea_id);
        const limite = tarea.tarea_fecha_limite ? diaLocal(tarea.tarea_fecha_limite) : '';
        filas.push({ tarea, plan, ventana: calcularVentana(tarea, hoy), limite, noLlega: !plan.completada && !!limite && plan.dia > limite });
      });
  });
  return filas;
}

/**
 * Las flechas entre las tareas visibles: `cadena` (de la previa a la próxima; `invertida` si la próxima cae antes
 * que su previa) y `anillo` (del desencadenante a la tarea que activa, cuando todavía no hay una copia enlazada).
 */
export function calcularConexiones(filas, estado) {
  const porId = new Map(filas.filter((f) => f.tarea).map((f) => [f.tarea.tarea_id, f]));
  const conexiones = [];
  porId.forEach((fila, id) => {
    const previa = fila.tarea.tarea_dependiente;
    if (previa && porId.has(previa)) {
      conexiones.push({ tipo: 'cadena', desde: previa, hasta: id, invertida: fila.plan.dia < porId.get(previa).plan.dia });
    }
    const desencadenante = fila.tarea.tarea_desencadenante;
    if (desencadenante) {
      // El desencadenante puede estar ya completado: la instancia vigente es su copia pendiente con el mismo nombre.
      const original = (estado.tareas || []).find((t) => t.tarea_id === desencadenante);
      const vigente =
        original && original.tarea_estado === 'completada'
          ? (estado.tareas || []).find((t) => t.tarea_mantenimiento && t.tarea_estado !== 'completada' && t.tarea_nombre === original.tarea_nombre) || original
          : original;
      if (vigente && porId.has(vigente.tarea_id) && vigente.tarea_id !== id && fila.tarea.tarea_dependiente !== vigente.tarea_id) {
        conexiones.push({ tipo: 'anillo', desde: vigente.tarea_id, hasta: id, invertida: false });
      }
    }
  });
  return conexiones;
}
