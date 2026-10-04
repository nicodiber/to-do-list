// Exportar a CSV (v0.106.0): descarga las tareas o los cumplimientos como planilla, para abrirlos en Excel / Google Sheets
// y analizarlos aparte. Separador «;» y BOM UTF-8 (así Excel en español abre bien las columnas y los acentos). Solo
// lectura: no cambia nada de los datos. La copia completa y restaurable sigue siendo «Exportar JSON».

import { estado } from './almacenamiento.js';
import { caminoCategoria, fechaLocalISO } from './utilidades.js';

const SEPARADOR = ';';

/** Una celda CSV: entre comillas si lleva separador, comillas o saltos de línea (las comillas se duplican). */
export function celdaCSV(valor) {
  if (valor === null || valor === undefined) return '';
  const texto = typeof valor === 'boolean' ? (valor ? 'sí' : 'no') : String(valor);
  // Evita que una celda que empiece con = + - @ se interprete como fórmula al abrirla en una planilla.
  const segura = /^[=+\-@]/.test(texto) && Number.isNaN(Number(texto)) ? `'${texto}` : texto;
  return /[";\n\r]/.test(segura) ? `"${segura.replace(/"/g, '""')}"` : segura;
}

/** Arma el texto CSV de unas filas (arreglos) con su encabezado. */
export function armarCSV(encabezado, filas) {
  return [encabezado, ...filas].map((fila) => fila.map(celdaCSV).join(SEPARADOR)).join('\r\n');
}

function nombreDe(lista, id, campo) {
  return (lista || []).find((x) => x[`${campo}_id`] === id)?.[`${campo}_nombre`] || '';
}

/** CSV de todas las tareas (activas y completadas). */
export function csvDeTareas(datos = estado) {
  const encabezado = [
    'Nombre', 'Estado', 'Categoría', 'Ubicación', 'Meta', 'Persona', 'Delegada a', 'Descripción', 'Duración (min)', 'Costo estimado',
    'Disfrute', 'Urgente', 'Habilitada desde', 'Sugerida', 'Horario fijado', 'Límite', 'Fin', 'Mantenimiento', 'Tiempo medido (min)',
  ];
  const filas = (datos.tareas || []).map((t) => [
    t.tarea_nombre,
    t.tarea_estado,
    caminoCategoria((datos.categorias || []).find((c) => c.categoria_id === t.categoria_id), datos.categorias || []),
    nombreDe(datos.ubicaciones, t.ubicacion_id, 'ubicacion'),
    nombreDe(datos.metas, t.meta_id, 'meta'),
    nombreDe(datos.personas, t.persona_id, 'persona'),
    nombreDe(datos.personas, t.tarea_delegada_a, 'persona'),
    t.tarea_descripcion,
    t.tarea_duracion_min,
    t.tarea_costo_estimado,
    t.tarea_disfrute,
    !!t.tarea_urgente,
    t.tarea_fecha_inicio_habilitada,
    t.tarea_fecha_sugerida,
    !!t.tarea_fecha_fija,
    t.tarea_fecha_limite,
    t.tarea_fecha_fin,
    !!t.tarea_mantenimiento,
    t.tarea_tiempo_acumulado_min ? Math.round(t.tarea_tiempo_acumulado_min) : '',
  ]);
  return armarCSV(encabezado, filas);
}

/** CSV del historial de cumplimientos (lo que se fue completando), con el tiempo estimado y el real. */
export function csvDeCumplimientos(datos = estado) {
  const encabezado = ['Fecha', 'Tarea', 'Categoría', 'Límite', 'Mantenimiento', 'Estimado (min)', 'Real (min)'];
  const filas = [...(datos.cumplimientos || [])]
    .sort((a, b) => String(a.cumplimiento_fecha).localeCompare(String(b.cumplimiento_fecha)))
    .map((c) => [
      c.cumplimiento_fecha,
      c.cumplimiento_tarea_nombre,
      caminoCategoria((datos.categorias || []).find((x) => x.categoria_id === c.categoria_id), datos.categorias || []),
      c.cumplimiento_fecha_limite,
      !!c.cumplimiento_mantenimiento,
      c.cumplimiento_duracion_estimada,
      c.cumplimiento_duracion_real,
    ]);
  return armarCSV(encabezado, filas);
}

/** Descarga `texto` como archivo CSV. */
export function descargarCSV(texto, nombreBase) {
  const blob = new Blob(['﻿', texto], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = `super-todo-list-${nombreBase}-${fechaLocalISO()}.csv`;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  URL.revokeObjectURL(url);
}
