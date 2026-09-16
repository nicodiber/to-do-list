import { estado } from './almacenamiento.js';

function formatoUTCGoogleCalendar(fecha) {
  return fecha.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

/**
 * Arma la URL de "calendar.google.com/render" con los datos de la tarea
 * precargados, para que el usuario la guarde como registro histórico con
 * un clic desde su sesión de Google ya logueada. No requiere OAuth ni API key.
 */
export function construirUrlExportarGoogleCalendar(tarea) {
  const duracionMin = tarea.tarea_duracion_real_min ?? tarea.tarea_duracion_estimada_min ?? 30;
  const fin = new Date(tarea.tarea_completada_en || Date.now());
  const inicio = new Date(fin.getTime() - duracionMin * 60000);

  const categoria = estado.categorias.find((c) => c.categoria_id === tarea.categoria_id);
  const subcategoria = estado.subcategorias.find((s) => s.subcategoria_id === tarea.subcategoria_id);

  let detalles = '';
  if (categoria) {
    detalles += `Categoría: ${categoria.categoria_nombre}${subcategoria ? ' / ' + subcategoria.subcategoria_nombre : ''}\n`;
  }
  detalles += `Duración real: ${duracionMin} min`;
  if (tarea.tarea_notas) detalles += `\n\n${tarea.tarea_notas}`;
  detalles += '\n\nCreada con Super To-Do List';

  const parametros = new URLSearchParams({
    action: 'TEMPLATE',
    text: tarea.tarea_nombre,
    dates: `${formatoUTCGoogleCalendar(inicio)}/${formatoUTCGoogleCalendar(fin)}`,
    details: detalles,
  });

  return `https://calendar.google.com/calendar/render?${parametros.toString()}`;
}

export function ofrecerExportarACalendar(tarea) {
  const quiereExportar = confirm(
    `¿Abrir "${tarea.tarea_nombre}" en Google Calendar para guardarla como registro histórico?`
  );
  if (!quiereExportar) return;
  window.open(construirUrlExportarGoogleCalendar(tarea), '_blank', 'noopener');
}
