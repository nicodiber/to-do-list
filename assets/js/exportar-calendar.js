import { estado, persistirYNotificar } from './almacenamiento.js';
import { abrirDialogoFormulario } from './dialogo-formulario.js';
import { escaparHtml } from './utilidades.js';

function formatoUTCGoogleCalendar(fecha) {
  return fecha.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

/**
 * Arma la URL de "calendar.google.com/render" con los datos de la tarea
 * precargados, para que el usuario la guarde como registro histórico con
 * un clic desde su sesión de Google ya logueada. No requiere OAuth ni API key.
 */
export function construirUrlExportarGoogleCalendar(tarea) {
  const duracionMin = tarea.tarea_duracion_min || 30;
  const fin = new Date(tarea.tarea_fecha_fin || Date.now());
  const inicio = new Date(fin.getTime() - duracionMin * 60000);

  const categoria = estado.categorias.find((c) => c.categoria_id === tarea.categoria_id);

  let detalles = '';
  if (categoria) {
    detalles += `Categoría: ${categoria.categoria_nombre}\n`;
  }
  detalles += `Duración: ${duracionMin} min`;
  if (tarea.tarea_descripcion) detalles += `\n\n${tarea.tarea_descripcion}`;
  detalles += '\n\nCreada con Super To-Do List';

  const parametros = new URLSearchParams({
    action: 'TEMPLATE',
    text: tarea.tarea_nombre,
    dates: `${formatoUTCGoogleCalendar(inicio)}/${formatoUTCGoogleCalendar(fin)}`,
    details: detalles,
  });

  return `https://calendar.google.com/calendar/render?${parametros.toString()}`;
}

/**
 * Ofrece abrir la tarea completada en Google Calendar. Es una ventana de la propia
 * página (no un `confirm()` del navegador): el clic en "Abrir en Calendar" es un gesto
 * del usuario y el navegador no bloquea la pestaña nueva, cosa que sí pasaba con
 * `confirm()` + `window.open()`.
 */
export function ofrecerExportarACalendar(tarea) {
  abrirDialogoFormulario({
    titulo: 'Guardar en Google Calendar',
    textoGuardar: 'Abrir en Calendar',
    cuerpoHtml: `<p class="ayuda ayuda-formulario">¿Abrir «${escaparHtml(tarea.tarea_nombre)}» en Google Calendar para guardarla como registro histórico? Se abre una pestaña con el evento ya cargado y lo guardás vos.</p>`,
    alGuardar: () => {
      const ventana = window.open(construirUrlExportarGoogleCalendar(tarea), '_blank');
      if (!ventana) {
        alert('El navegador bloqueó la pestaña nueva. Permití las ventanas emergentes para este sitio (ícono en la barra de direcciones) y volvé a intentarlo.');
        return false;
      }
      ventana.opener = null;
      // Se marca al abrir Calendar (no se puede verificar que el usuario haya guardado el evento).
      tarea.tarea_exportada_calendar = true;
      persistirYNotificar();
      return true;
    },
  });
}
