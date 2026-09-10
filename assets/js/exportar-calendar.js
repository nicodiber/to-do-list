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
  const duracionMin = tarea.duracion_real_min ?? tarea.duracion_estimada_min ?? 30;
  const fin = new Date(tarea.completada_en || Date.now());
  const inicio = new Date(fin.getTime() - duracionMin * 60000);

  const categoria = estado.categorias.find((c) => c.id === tarea.categoria_id);
  const subcategoria = estado.subcategorias.find((s) => s.id === tarea.subcategoria_id);

  let detalles = '';
  if (categoria) {
    detalles += `Categoría: ${categoria.nombre}${subcategoria ? ' / ' + subcategoria.nombre : ''}\n`;
  }
  detalles += `Duración real: ${duracionMin} min`;
  if (tarea.notas) detalles += `\n\n${tarea.notas}`;
  detalles += '\n\nCreada con Super To-Do List';

  const parametros = new URLSearchParams({
    action: 'TEMPLATE',
    text: tarea.nombre,
    dates: `${formatoUTCGoogleCalendar(inicio)}/${formatoUTCGoogleCalendar(fin)}`,
    details: detalles,
  });

  return `https://calendar.google.com/calendar/render?${parametros.toString()}`;
}

export function ofrecerExportarACalendar(tarea) {
  const quiereExportar = confirm(
    `¿Abrir "${tarea.nombre}" en Google Calendar para guardarla como registro histórico?`
  );
  if (!quiereExportar) return;
  window.open(construirUrlExportarGoogleCalendar(tarea), '_blank', 'noopener');
}
