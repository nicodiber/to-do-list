// Lógica pura del buscador (H02-B, paleta rápida): normalizar texto, buscar tareas y módulos, ordenar y partir el
// nombre para resaltar la coincidencia. No toca el DOM (la pantalla está en paleta-busqueda.js), así que se prueba sola.
import { diaLocal } from './utilidades.js';

/** Tope de tareas que muestra la paleta; el resto se resume como «y N más…». */
export const MAX_TAREAS_BUSCADOR = 20;

const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

/** Un carácter en minúscula y sin marca diacrítica («Á» → «a», «ñ» → «n»). */
function normalizarCaracter(caracter) {
  return caracter.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Minúsculas y sin acentos: «Categoría» → «categoria». */
export function normalizarTexto(texto) {
  let resultado = '';
  for (const caracter of String(texto == null ? '' : texto)) resultado += normalizarCaracter(caracter);
  return resultado;
}

/**
 * Texto normalizado más, por cada carácter normalizado, el índice del texto original del que sale. Hace falta porque
 * normalizar puede cambiar el largo (un carácter suelto puede dar 0 o varios), y el resaltado se pinta sobre el original.
 */
function normalizarConMapa(texto) {
  const original = String(texto == null ? '' : texto);
  let normalizado = '';
  const origen = [];
  let indice = 0;
  for (const caracter of original) {
    const n = normalizarCaracter(caracter);
    for (let i = 0; i < n.length; i += 1) origen.push(indice);
    normalizado += n;
    indice += caracter.length;
  }
  return { normalizado, origen, largo: original.length };
}

/**
 * Parte `texto` en tramos `{ texto, coincide }` para resaltar la primera coincidencia de `consulta` (sin distinguir
 * mayúsculas ni acentos). Sin consulta o sin coincidencia devuelve un solo tramo. Quien dibuja debe escapar cada tramo.
 */
export function partirResaltado(texto, consulta) {
  const original = String(texto == null ? '' : texto);
  const buscado = normalizarTexto(consulta).trim();
  if (!buscado) return [{ texto: original, coincide: false }];
  const { normalizado, origen } = normalizarConMapa(original);
  const posicion = normalizado.indexOf(buscado);
  if (posicion < 0) return [{ texto: original, coincide: false }];
  const desde = origen[posicion];
  const ultimo = origen[posicion + buscado.length - 1];
  // El tramo termina al final del carácter original que contiene el último carácter coincidente.
  let hasta = ultimo;
  const cp = original.codePointAt(ultimo);
  hasta += cp > 0xffff ? 2 : 1;
  const tramos = [];
  if (desde > 0) tramos.push({ texto: original.slice(0, desde), coincide: false });
  tramos.push({ texto: original.slice(desde, hasta), coincide: true });
  if (hasta < original.length) tramos.push({ texto: original.slice(hasta), coincide: false });
  return tramos;
}

/** Fecha corta para el resultado: «sáb 5/12» (día de la semana, día/mes) a partir de un día o un instante. */
export function fechaCorta(fechaISO) {
  if (!fechaISO) return '';
  const dia = diaLocal(fechaISO);
  const [anio, mes, diaMes] = String(dia).split('-').map(Number);
  if (!anio || !mes || !diaMes) return '';
  const fecha = new Date(anio, mes - 1, diaMes);
  return `${DIAS_CORTOS[fecha.getDay()]} ${diaMes}/${mes}`;
}

/**
 * Tareas cuyo nombre contiene `texto` (sin distinguir mayúsculas ni acentos), ordenadas: no completadas antes que
 * completadas; dentro de cada grupo, las que empiezan con el texto antes que las que solo lo contienen; después por
 * fecha sugerida más próxima (las que no tienen fecha, al final) y, por último, por nombre.
 * Devuelve `{ resultados, total, restantes }`: hasta `max` resultados `{ tarea, categoria, empieza }` y cuántas quedaron fuera.
 * Con texto vacío no devuelve tareas.
 */
export function buscarTareas(tareas, texto, categorias = [], max = MAX_TAREAS_BUSCADOR) {
  const buscado = normalizarTexto(texto).trim();
  if (!buscado) return { resultados: [], total: 0, restantes: 0 };
  const porId = new Map((categorias || []).map((c) => [c.categoria_id, c]));
  const coincidencias = [];
  for (const tarea of tareas || []) {
    const nombre = normalizarTexto(tarea.tarea_nombre);
    const posicion = nombre.indexOf(buscado);
    if (posicion < 0) continue;
    coincidencias.push({
      tarea,
      categoria: tarea.categoria_id ? porId.get(tarea.categoria_id) || null : null,
      empieza: posicion === 0,
      completada: tarea.tarea_estado === 'completada',
    });
  }
  coincidencias.sort((a, b) => {
    if (a.completada !== b.completada) return a.completada ? 1 : -1;
    if (a.empieza !== b.empieza) return a.empieza ? -1 : 1;
    const fa = a.tarea.tarea_fecha_sugerida ? new Date(a.tarea.tarea_fecha_sugerida).getTime() : Infinity;
    const fb = b.tarea.tarea_fecha_sugerida ? new Date(b.tarea.tarea_fecha_sugerida).getTime() : Infinity;
    const sinFechaA = !Number.isFinite(fa);
    const sinFechaB = !Number.isFinite(fb);
    if (sinFechaA !== sinFechaB) return sinFechaA ? 1 : -1;
    if (!sinFechaA && fa !== fb) return fa - fb;
    return String(a.tarea.tarea_nombre).localeCompare(String(b.tarea.tarea_nombre), 'es');
  });
  const limite = Math.max(0, max);
  return {
    resultados: coincidencias.slice(0, limite).map(({ tarea, categoria, empieza }) => ({ tarea, categoria, empieza })),
    total: coincidencias.length,
    restantes: Math.max(0, coincidencias.length - limite),
  };
}

/**
 * Módulos del menú cuyo nombre contiene `texto`; con texto vacío, todos. `modulos` es `[{ clave, etiqueta }]` con la
 * etiqueta tal como está en `VISTAS` («📌 Resumen»). Los que empiezan con el texto van primero (el resto conserva el
 * orden del menú). Devuelve `[{ clave, emoji, nombre }]`.
 */
export function buscarModulos(modulos, texto) {
  const buscado = normalizarTexto(texto).trim();
  const lista = (modulos || []).map(({ clave, etiqueta }) => {
    const [emoji, ...resto] = String(etiqueta).split(' ');
    return { clave, emoji, nombre: resto.join(' ') };
  });
  if (!buscado) return lista;
  return lista
    .map((m, orden) => ({ m, orden, posicion: normalizarTexto(m.nombre).indexOf(buscado) }))
    .filter((x) => x.posicion >= 0)
    .sort((a, b) => (a.posicion === 0 ? 0 : 1) - (b.posicion === 0 ? 0 : 1) || a.orden - b.orden)
    .map((x) => x.m);
}
