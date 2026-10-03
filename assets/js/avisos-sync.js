// Avisos grandes de sincronización como ventanas modales (v0.102.0). Antes eran banners arriba de la pantalla (sesión de
// Google vencida, no se pudo leer Calendar, cambios de otro dispositivo, datos viejos, reloj desfasado, errores…). Ahora
// cada situación se muestra UNA vez en una ventana propia, apenas se puede (sin tapar lo que el usuario esté escribiendo ni
// otra ventana abierta), y no se repite mientras la situación siga igual; el estado permanente queda en el menú lateral.

import { hayTextoEnEdicion, descartarAviso, descartarTodosLosAvisos } from './almacenamiento.js';
import { avisar, confirmar, avisarConAcciones } from './avisos.js';
import { abrirDialogoFormulario } from './dialogo-formulario.js';
import { escaparHtml } from './utilidades.js';

function formatoCorto(iso) {
  if (!iso) return '—';
  const fecha = new Date(iso);
  const hora = `${String(fecha.getHours()).padStart(2, '0')}:${String(fecha.getMinutes()).padStart(2, '0')}`;
  if (fecha.toDateString() === new Date().toDateString()) return `hoy ${hora}`;
  return `${String(fecha.getDate()).padStart(2, '0')}/${String(fecha.getMonth() + 1).padStart(2, '0')} ${hora}`;
}

/** Ventana con la lista de avisos de sincronización (lo resuelto al mezclar cambios de varios dispositivos). */
export function abrirAvisosSync(obtenerAvisos) {
  if (document.querySelector('dialog.dialogo-avisos-sync')) return;
  const dibujar = (cuerpo) => {
    const avisos = obtenerAvisos();
    if (avisos.length === 0) {
      cuerpo.innerHTML = '<p class="mensaje-vacio">No hay avisos pendientes.</p>';
      return;
    }
    cuerpo.innerHTML = `
      <p class="ayuda">Nada se pierde en silencio: acá queda registrado lo que se resolvió al mezclar cambios de distintos dispositivos. Descartá cada aviso cuando lo hayas revisado.</p>
      <ul class="lista-avisos-sync">
        ${avisos
          .map(
            (aviso) => `
          <li>
            <p>${escaparHtml(aviso.mensaje)} <small>(${formatoCorto(aviso.creado_en)})</small></p>
            ${
              aviso.camposDescartados && aviso.camposDescartados.length > 0
                ? `<ul>${aviso.camposDescartados.map((c) => `<li>Se descartó <code>${escaparHtml(c.campo)}</code>: ${escaparHtml(c.valorDescartado)}</li>`).join('')}</ul>`
                : ''
            }
            <button type="button" data-descartar-aviso="${escaparHtml(aviso.id)}" title="Marcar este aviso como revisado">🗑️ Descartar</button>
          </li>`
          )
          .join('')}
      </ul>
      <button type="button" data-descartar-todos title="Marcar todos los avisos como revisados">🗑️ Descartar todos</button>`;
    cuerpo.querySelectorAll('[data-descartar-aviso]').forEach((boton) =>
      boton.addEventListener('click', async () => {
        await descartarAviso(boton.dataset.descartarAviso);
        dibujar(cuerpo);
      })
    );
    cuerpo.querySelector('[data-descartar-todos]').addEventListener('click', async () => {
      await descartarTodosLosAvisos();
      dibujar(cuerpo);
    });
  };
  const dialogo = abrirDialogoFormulario({
    titulo: '⚠️ Avisos de sincronización',
    cuerpoHtml: '<div class="cuerpo-avisos-sync"></div>',
    textoGuardar: '✔️ Cerrar',
    conectar: (formulario) => dibujar(formulario.querySelector('.cuerpo-avisos-sync')),
    alGuardar: () => true,
  });
  dialogo.classList.add('dialogo-avisos-sync');
}

/**
 * Crea el revisor de avisos. `obtenerEstado()` devuelve el estado de sincronización; `contexto` trae lo que hace falta
 * para actuar: `sinHorario()` (tareas sin hora), `errorCalendar()` (calendarios que no se pudieron leer),
 * `reconectar()`, `actualizar()`, `mezclarViejos()`, `descartarViejos()` y `obtenerAvisos()`.
 * Devuelve `revisar()`: se llama cada vez que cambia el estado.
 */
export function crearRevisorDeAvisos({ obtenerEstado, contexto }) {
  const mostrados = new Set(); // situaciones ya avisadas que siguen vigentes
  let ocupado = false;
  let reintento = null;

  function situaciones(s) {
    const lista = new Map();
    if (s.estado === 'sesion-vencida' && s.reconexionManual) {
      lista.set('sesion', async () => {
        const sinHorario = contexto.sinHorario();
        await avisarConAcciones(
          `Falta reconectar con tu cuenta de Google.${s.hayPendiente ? ' Tus cambios quedan pendientes y se suben apenas reconectes.' : ''}${
            sinHorario > 0 ? `\n\n${sinHorario === 1 ? '1 tarea espera' : `${sinHorario} tareas esperan`} su horario sugerido: hasta reconectar no se asignan horarios, para no pisar tus eventos de Calendar.` : ''
          }\n\nTocá «Reconectar» y elegí tu cuenta (también tenés el botón en el menú lateral).`,
          {
            titulo: '🔑 Sesión de Google vencida',
            textoAceptar: 'Más tarde',
            acciones: [{ texto: '🔑 Reconectar', datos: { reconectar: '1' }, alClic: () => contexto.reconectar() }],
          }
        );
      });
    }
    const calendarios = contexto.errorCalendar();
    if (calendarios.length > 0) {
      lista.set(`calendar:${calendarios.join('|')}`, () =>
        avisar(
          `No pude leer ${calendarios.map((n) => `«${n}»`).join(', ')} de Google Calendar.\n\nHasta lograrlo no se asignan ni mueven horarios sugeridos (para no pisar tus eventos): se reintenta solo cada 5 minutos, o con «Sincronizar ahora». Si es un calendario que no querés leer, sacalo de «Calendarios que se leen» en Configuraciones.`,
          { titulo: '📅 No se pudo leer Google Calendar' }
        )
      );
    }
    if (s.cambiosRemotosDisponibles) {
      lista.set('remoto', async () => {
        if (await confirmar('Hay cambios hechos desde otro dispositivo. Actualizar trae esos cambios y puede reemplazar lo que estás viendo.', { titulo: '🔄 Cambios de otro dispositivo', textoAceptar: 'Actualizar', textoCancelar: 'Más tarde' })) {
          await contexto.actualizar();
        }
      });
    }
    if (s.datosViejosDisponibles && s.datosListos) {
      lista.set('viejos', () =>
        avisarConAcciones('Encontré datos de una versión anterior guardados en este navegador. Antes se guardaban acá; ahora todo vive en Drive.', {
          titulo: '📦 Datos de una versión anterior',
          textoAceptar: 'Más tarde',
          acciones: [
            { texto: '🔀 Mezclarlos con Drive', alClic: () => contexto.mezclarViejos() },
            { texto: '🗑️ Descartarlos', alClic: () => contexto.descartarViejos() },
          ],
        })
      );
    }
    if (s.relojDesfasado) {
      const minutos = Math.round(Math.abs(s.desfaseRelojMs) / 60000);
      lista.set('reloj', () =>
        avisar(`El reloj de este dispositivo está ${s.desfaseRelojMs > 0 ? 'adelantado' : 'atrasado'} unos ${minutos} min respecto de Google: puede afectar qué versión gana al mezclar cambios entre dispositivos.`, { titulo: '⏰ Reloj desfasado' })
      );
    }
    if (s.mensajeError) lista.set(`error:${s.mensajeError}`, () => avisar(s.mensajeError, { titulo: '⚠️ Error al sincronizar' }));
    if (s.almacenamientoLocalDisponible === false) {
      lista.set('local', () => avisar('Este navegador no permite guardar una copia temporal: si perdés la conexión, los cambios sin subir se perderían al cerrar la pestaña.', { titulo: '⚠️ Sin copia temporal' }));
    }
    const avisos = contexto.obtenerAvisos();
    if (avisos.length > 0) lista.set(`avisos:${avisos.map((a) => a.id).join(',')}`, () => abrirAvisosSync(contexto.obtenerAvisos));
    return lista;
  }

  function revisar() {
    clearTimeout(reintento);
    const activas = situaciones(obtenerEstado());
    for (const clave of [...mostrados]) if (!activas.has(clave)) mostrados.delete(clave);
    if (ocupado) return;
    const pendiente = [...activas.keys()].find((clave) => !mostrados.has(clave));
    if (!pendiente) return;
    // No se interrumpe una ventana abierta ni un texto a medio escribir: se reintenta en unos segundos.
    if (document.querySelector('dialog[open]') || hayTextoEnEdicion()) {
      reintento = setTimeout(revisar, 4000);
      return;
    }
    mostrados.add(pendiente);
    ocupado = true;
    Promise.resolve(activas.get(pendiente)())
      .catch(() => {})
      .finally(() => {
        ocupado = false;
        revisar();
      });
  }

  return revisar;
}
