import { estado, persistirYNotificar } from '../assets/js/almacenamiento.js';
import { ETIQUETAS_ESTADO, ETIQUETAS_IMPORTANCIA, ICONOS_IMPORTANCIA } from '../assets/js/modelos.js';
import { formatearFechaOFechaHora, esVencida, esHoy, noPuedeEmpezarTodavia, escaparHtml, tieneHora } from '../assets/js/utilidades.js';
import { crearPanelReprogramar } from '../assets/js/reprogramar.js';
import {
  completarTarea,
  reprogramarTareaConCascada,
  desbloquearDependientes,
  compararPorPrioridad,
  calcularEnfoque8020,
  calcularHolguraDias,
  mejorTareaPorCategoria,
} from '../assets/js/tareas-logica.js';
import { iniciarRevisionDia } from '../assets/js/revision-dia.js';
import { ofrecerExportarACalendar } from '../assets/js/exportar-calendar.js';
import { evaluarClimaTarea } from '../assets/js/clima.js';
import { sugerirTareaDeAltoDisfrute } from '../assets/js/disfrute.js';
import {
  soportaGoogleCalendar,
  hayConexionGoogleCalendar,
  conectarGoogleCalendar,
  obtenerEventosDeHoy,
  calcularSolapamiento,
} from '../assets/js/google-calendar.js';
import { obtenerUbicacionActual, establecerUbicacionActual } from '../assets/js/ubicacion-actual.js';

export function renderVistaHoy(contenedor) {
  const filtroUbicacion = obtenerUbicacionActual();
  const enfoqueIds = new Set(calcularEnfoque8020(estado.tareas, estado.categorias).map((t) => t.tarea_id));
  const pendientesActivas = estado.tareas
    .filter((t) => t.tarea_estado !== 'completada')
    .filter((t) => !filtroUbicacion || t.ubicacion_id === filtroUbicacion);

  const bloqueadas = pendientesActivas.filter((t) => t.tarea_estado === 'bloqueada');
  const accionables = pendientesActivas.filter((t) => t.tarea_estado === 'pendiente');
  const disponibles = accionables.filter((t) => !noPuedeEmpezarTodavia(t.tarea_fecha_inicio_habilitada));
  const aunNoDisponibles = accionables.filter((t) => noPuedeEmpezarTodavia(t.tarea_fecha_inicio_habilitada));

  const urgentes = disponibles
    .filter((t) => esVencida(t.tarea_fecha_limite) || esHoy(t.tarea_fecha_limite))
    .sort((a, b) => compararPorPrioridad(a, b, estado.categorias));
  const idsUrgentes = new Set(urgentes.map((t) => t.tarea_id));
  const resto = disponibles
    .filter((t) => !idsUrgentes.has(t.tarea_id))
    .sort((a, b) => compararPorPrioridad(a, b, estado.categorias));
  const mejoresPorCategoria = mejorTareaPorCategoria(resto, estado.categorias);

  contenedor.innerHTML = `
    <h2>Hoy</h2>
    <p class="ayuda">Lo urgente primero: tareas vencidas o con fecha límite hoy. Así no hace falta reprogramar nada para saber por dónde arrancar.</p>
    ${
      estado.ubicaciones.length > 0
        ? `<label class="filtro-ubicacion-hoy">¿Dónde estás?
            <select id="filtro-ubicacion-hoy">
              <option value="">Cualquier ubicación</option>
              ${estado.ubicaciones
                .map((u) => `<option value="${u.ubicacion_id}" ${filtroUbicacion === u.ubicacion_id ? 'selected' : ''}>${escaparHtml(u.ubicacion_nombre)}</option>`)
                .join('')}
            </select>
          </label>`
        : ''
    }
    <button type="button" id="boton-revisar-dia" class="boton-primario">Revisar mi día</button>
    ${
      soportaGoogleCalendar()
        ? `<button type="button" id="boton-conectar-calendar">${
            hayConexionGoogleCalendar() ? 'Conectado a Google Calendar ✓' : 'Conectar con Google Calendar'
          }</button>`
        : ''
    }
    <section>
      <h3>Urgentes</h3>
      <ul id="lista-urgentes" class="lista-tareas"></ul>
    </section>
    <section>
      <h3>Resto de tus pendientes</h3>
      <ul id="lista-resto" class="lista-tareas"></ul>
      ${
        mejoresPorCategoria.length > 0
          ? `<h4>Elegí por categoría</h4>
             <p class="ayuda">¿Tenés un rato libre y no hay nada urgente? Acá tenés la tarea que más conviene de cada categoría, para elegir vos.</p>
             <ul id="lista-por-categoria" class="lista-tareas"></ul>`
          : ''
      }
    </section>
    ${
      aunNoDisponibles.length > 0
        ? `<section>
            <h3>Todavía no pueden empezar</h3>
            <ul id="lista-no-disponibles" class="lista-tareas"></ul>
          </section>`
        : ''
    }
    ${
      bloqueadas.length > 0
        ? `<section>
            <h3>Bloqueadas por otras tareas</h3>
            <ul id="lista-bloqueadas" class="lista-tareas"></ul>
          </section>`
        : ''
    }
  `;

  contenedor.querySelector('#boton-revisar-dia').addEventListener('click', () => {
    iniciarRevisionDia([...urgentes, ...resto]);
  });

  const botonConectarCalendar = contenedor.querySelector('#boton-conectar-calendar');
  if (botonConectarCalendar) {
    botonConectarCalendar.addEventListener('click', async () => {
      try {
        await conectarGoogleCalendar();
        renderVistaHoy(contenedor);
      } catch (error) {
        alert(error.message);
      }
    });
  }

  const selectFiltroUbicacion = contenedor.querySelector('#filtro-ubicacion-hoy');
  if (selectFiltroUbicacion) {
    selectFiltroUbicacion.addEventListener('change', (evento) => {
      establecerUbicacionActual(evento.target.value);
      renderVistaHoy(contenedor);
    });
  }

  const listaUrgentes = contenedor.querySelector('#lista-urgentes');
  if (urgentes.length === 0) {
    listaUrgentes.innerHTML = '<p class="mensaje-vacio">No tenés tareas vencidas ni con fecha límite hoy.</p>';
  } else {
    urgentes.forEach((tarea) => listaUrgentes.appendChild(renderItem(tarea, { enfoqueIds })));
  }

  const listaResto = contenedor.querySelector('#lista-resto');
  if (resto.length === 0) {
    listaResto.innerHTML = '<p class="mensaje-vacio">No hay más tareas pendientes disponibles.</p>';
  } else {
    resto.forEach((tarea) => listaResto.appendChild(renderItem(tarea, { enfoqueIds })));
  }

  const listaPorCategoria = contenedor.querySelector('#lista-por-categoria');
  if (listaPorCategoria) {
    mejoresPorCategoria.forEach(({ tarea }) => listaPorCategoria.appendChild(renderItem(tarea, { enfoqueIds })));
  }

  const listaNoDisponibles = contenedor.querySelector('#lista-no-disponibles');
  if (listaNoDisponibles) {
    aunNoDisponibles
      .sort((a, b) => a.tarea_fecha_inicio_habilitada.localeCompare(b.tarea_fecha_inicio_habilitada))
      .forEach((tarea) => listaNoDisponibles.appendChild(renderItem(tarea, { soloInfo: true, enfoqueIds })));
  }

  const listaBloqueadas = contenedor.querySelector('#lista-bloqueadas');
  if (listaBloqueadas) {
    bloqueadas.forEach((tarea) => listaBloqueadas.appendChild(renderItem(tarea, { soloInfo: true, enfoqueIds })));
  }
}

/**
 * Texto de la holgura (ver `calcularHolguraDias` en tareas-logica.js) para
 * mostrar junto a cada tarea con fecha límite: cuánto margen le queda antes
 * de vencer, o hace cuánto que venció.
 */
function etiquetaHolgura(tarea) {
  if (!tarea.tarea_fecha_limite) return '';
  const dias = calcularHolguraDias(tarea);
  if (dias < 0) return `Vencida hace ${Math.abs(dias)} día${Math.abs(dias) === 1 ? '' : 's'}`;
  if (dias === 0) return 'Vence hoy';
  return `Quedan ${dias} día${dias === 1 ? '' : 's'}`;
}

function renderItem(tarea, { soloInfo = false, enfoqueIds = null } = {}) {
  const categoria = estado.categorias.find((c) => c.categoria_id === tarea.categoria_id);
  const ubicacion = estado.ubicaciones.find((u) => u.ubicacion_id === tarea.ubicacion_id);
  const dependeDe = tarea.tarea_dependiente ? estado.tareas.find((t) => t.tarea_id === tarea.tarea_dependiente) : null;
  const li = document.createElement('li');
  li.className = 'item-tarea' + (esVencida(tarea.tarea_fecha_limite) ? ' vencida' : '');
  li.innerHTML = `
    <div class="item-tarea-info">
      <strong>${escaparHtml(tarea.tarea_nombre)}</strong>
      <span class="etiquetas">
        ${tarea.tarea_importancia ? `<span class="etiqueta-fecha">${ICONOS_IMPORTANCIA[tarea.tarea_importancia]} ${ETIQUETAS_IMPORTANCIA[tarea.tarea_importancia]}</span>` : ''}
        ${enfoqueIds && enfoqueIds.has(tarea.tarea_id) ? `<span class="etiqueta-fecha etiqueta-enfoque">🎯 Foco 80/20</span>` : ''}
        ${categoria ? `<span class="etiqueta" style="background:${categoria.categoria_color}">${escaparHtml(categoria.categoria_nombre)}</span>` : ''}
        ${tarea.tarea_fecha_inicio_habilitada ? `<span class="etiqueta-fecha">Desde: ${formatearFechaOFechaHora(tarea.tarea_fecha_inicio_habilitada)}</span>` : ''}
        ${tarea.tarea_fecha_limite ? `<span class="etiqueta-fecha">Límite: ${formatearFechaOFechaHora(tarea.tarea_fecha_limite)}</span>` : ''}
        ${tarea.tarea_fecha_limite ? `<span class="etiqueta-fecha">${etiquetaHolgura(tarea)}</span>` : ''}
        ${tarea.tarea_fecha_sugerida ? `<span class="etiqueta-fecha etiqueta-agendada">Sugerida: ${formatearFechaOFechaHora(tarea.tarea_fecha_sugerida)}</span>` : ''}
        <span class="etiqueta-fecha">${ETIQUETAS_ESTADO[tarea.tarea_estado]}</span>
        ${ubicacion ? `<span class="etiqueta-fecha">📍 ${escaparHtml(ubicacion.ubicacion_nombre)}</span>` : ''}
        ${tarea.tarea_costo_estimado ? `<span class="etiqueta-fecha">💰 $${tarea.tarea_costo_estimado}</span>` : ''}
        <span class="etiqueta-fecha etiqueta-clima" hidden></span>
        <span class="etiqueta-fecha etiqueta-solapamiento-calendar" hidden></span>
      </span>
      ${dependeDe ? `<p class="aviso-bloqueada">Bloqueada por: ${escaparHtml(dependeDe.tarea_nombre)}</p>` : ''}
      <div class="contenedor-cierre" hidden></div>
      <div class="contenedor-panel-reprogramar" hidden></div>
    </div>
    <div class="item-tarea-acciones">
      ${
        soloInfo
          ? ''
          : `<button type="button" data-accion="cumplida">Cumplida ✓</button>
             <button type="button" data-accion="no-cumplida">No cumplida ✗</button>`
      }
    </div>
  `;

  const etiquetaClima = li.querySelector('.etiqueta-clima');
  evaluarClimaTarea(tarea).then((resultado) => {
    if (!resultado || resultado.favorable) return;
    etiquetaClima.textContent = `🌧️ Lluvia probable (${resultado.probabilidadLluvia}%) — considerá posponer`;
    etiquetaClima.hidden = false;
  });

  if (hayConexionGoogleCalendar() && tieneHora(tarea.tarea_fecha_sugerida)) {
    const etiquetaCalendar = li.querySelector('.etiqueta-solapamiento-calendar');
    obtenerEventosDeHoy()
      .then((eventos) => {
        const solapamiento = calcularSolapamiento(tarea, eventos);
        if (!solapamiento) return;
        const horaEvento = new Date(solapamiento.inicio).toLocaleTimeString('es-AR', {
          hour: '2-digit',
          minute: '2-digit',
        });
        etiquetaCalendar.textContent = `📅 Se superpone con "${solapamiento.resumen}" (${horaEvento})`;
        etiquetaCalendar.hidden = false;
      })
      .catch((error) => console.warn(error.message));
  }

  if (soloInfo) return li;

  const contenedorCierre = li.querySelector('.contenedor-cierre');
  const contenedorPanel = li.querySelector('.contenedor-panel-reprogramar');

  li.querySelector('[data-accion="cumplida"]').addEventListener('click', () => {
    contenedorPanel.hidden = true;
    contenedorPanel.innerHTML = '';
    contenedorCierre.innerHTML = `
      <div class="panel-cierre">
        ${
          tarea.tarea_mantenimiento
            ? `<label>¿Qué podrías mejorar la próxima vez? (opcional)
                <input type="text" data-campo="mejora" />
              </label>`
            : ''
        }
        <button type="button" data-accion="confirmar-cumplida" class="boton-primario">Confirmar</button>
        <button type="button" data-accion="cancelar-cierre">Cancelar</button>
      </div>
    `;
    contenedorCierre.hidden = false;

    contenedorCierre.querySelector('[data-accion="confirmar-cumplida"]').addEventListener('click', async () => {
      const campoMejora = contenedorCierre.querySelector('[data-campo="mejora"]');
      const notaMejora = campoMejora ? campoMejora.value.trim() : '';
      completarTarea(tarea, estado.tareas, { notaMejora });
      desbloquearDependientes(tarea, estado.tareas);
      await persistirYNotificar();
      sugerirTareaDeAltoDisfrute(tarea);
      ofrecerExportarACalendar(tarea);
    });
    contenedorCierre.querySelector('[data-accion="cancelar-cierre"]').addEventListener('click', () => {
      contenedorCierre.hidden = true;
      contenedorCierre.innerHTML = '';
    });
  });

  li.querySelector('[data-accion="no-cumplida"]').addEventListener('click', () => {
    contenedorPanel.hidden = true;
    contenedorPanel.innerHTML = '';
    contenedorCierre.innerHTML = `
      <div class="panel-cierre">
        <button type="button" data-accion="continuar-reprogramar" class="boton-primario">Reprogramar</button>
        <button type="button" data-accion="cancelar-cierre">Cancelar</button>
      </div>
    `;
    contenedorCierre.hidden = false;

    contenedorCierre.querySelector('[data-accion="cancelar-cierre"]').addEventListener('click', () => {
      contenedorCierre.hidden = true;
      contenedorCierre.innerHTML = '';
    });

    contenedorCierre.querySelector('[data-accion="continuar-reprogramar"]').addEventListener('click', () => {
      contenedorCierre.hidden = true;
      contenedorCierre.innerHTML = '';

      const panel = crearPanelReprogramar({
        diasHabiles: tarea.tarea_dias_habiles,
        onConfirmar: async (fechaSugeridaISO) => {
          reprogramarTareaConCascada(tarea, fechaSugeridaISO, estado.tareas);
          contenedorPanel.hidden = true;
          contenedorPanel.innerHTML = '';
          await persistirYNotificar();
        },
        onCancelar: () => {
          contenedorPanel.hidden = true;
          contenedorPanel.innerHTML = '';
        },
      });
      contenedorPanel.appendChild(panel);
      contenedorPanel.hidden = false;
    });
  });

  return li;
}
