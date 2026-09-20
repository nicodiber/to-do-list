import { estado, persistirYNotificar } from '../assets/js/almacenamiento.js';
import { ETIQUETAS_ESTADO, ETIQUETAS_IMPORTANCIA, ICONOS_IMPORTANCIA } from '../assets/js/modelos.js';
import { formatearFechaOFechaHora, esVencida, esHoy, noPuedeEmpezarTodavia, escaparHtml, tieneHora, textoHolgura, caminoCategoria, formatearHora, diaLocal, hoyISO } from '../assets/js/utilidades.js';
import { crearPanelReprogramar } from '../assets/js/reprogramar.js';
import {
  cumplirTarea,
  reprogramarTareaConCascada,
  compararPorPrioridad,
  calcularHolguraDias,
  mejorTareaPorCategoria,
} from '../assets/js/tareas-logica.js';
import { iniciarRevisionDia } from '../assets/js/revision-dia.js';
import { ofrecerExportarACalendar } from '../assets/js/exportar-calendar.js';
import { evaluarClimaTarea } from '../assets/js/clima.js';
import { hayConexionGoogleCalendar, obtenerEventosDelHorizonte, calcularSolapamiento, buscarHuecoLibre } from '../assets/js/google-calendar.js';
import { obtenerFranjaHoraria } from '../assets/js/preferencias-horario.js';
import { htmlChecklistTarjeta, conectarChecklistTarjeta } from '../assets/js/checklist-tarjeta.js';
import { obtenerUbicacionActual, establecerUbicacionActual } from '../assets/js/ubicacion-actual.js';

// Preferencia de UI (no un dato de la app): con el enfoque encendido, Hoy oculta lo ya completado.
const CLAVE_ENFOQUE = 'super-todo-list:hoy-enfoque';

function leerEnfoque() {
  try {
    return localStorage.getItem(CLAVE_ENFOQUE) === '1';
  } catch {
    return false;
  }
}

function guardarEnfoque(activo) {
  try {
    localStorage.setItem(CLAVE_ENFOQUE, activo ? '1' : '0');
  } catch {
    // Solo es una preferencia: sin almacenamiento local vuelve a estar apagado.
  }
}

/** ¿Se completó en el día de hoy (hora local)? */
function seCompletoHoy(tarea) {
  return !!tarea.tarea_fecha_fin && diaLocal(tarea.tarea_fecha_fin) === hoyISO();
}

export function renderVistaHoy(contenedor) {
  const filtroUbicacion = obtenerUbicacionActual();
  const enfoque = leerEnfoque();
  const coincideUbicacion = (t) => !filtroUbicacion || t.ubicacion_id === filtroUbicacion;
  const pendientesActivas = estado.tareas.filter((t) => t.tarea_estado !== 'completada').filter(coincideUbicacion);

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
  // "Próximos por categoría" va primero y "Resto" muestra lo que queda sin repetirlos.
  const proximosPorCategoria = mejorTareaPorCategoria(resto, estado.categorias);
  const idsProximos = new Set(proximosPorCategoria.map(({ tarea }) => tarea.tarea_id));
  const restoSinProximos = resto.filter((t) => !idsProximos.has(t.tarea_id));
  const completadasHoy = enfoque
    ? []
    : estado.tareas
        .filter((t) => t.tarea_estado === 'completada' && seCompletoHoy(t))
        .filter(coincideUbicacion)
        .sort((a, b) => b.tarea_fecha_fin.localeCompare(a.tarea_fecha_fin));

  contenedor.innerHTML = `
    <h2>Hoy</h2>
    <p class="ayuda">Lo urgente primero: tareas vencidas o con fecha límite hoy. Así no hace falta reprogramar nada para saber por dónde arrancar.</p>
    <div class="controles-hoy">
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
      <button type="button" id="boton-enfoque-hoy" class="boton-enfoque" aria-pressed="${enfoque}" title="Con el enfoque encendido se ocultan las tareas que ya completaste hoy">🎯 Enfoque</button>
      <button type="button" id="boton-revisar-dia" class="boton-primario">Revisar mi día</button>
    </div>
    <section>
      <h3>Urgentes</h3>
      <ul id="lista-urgentes" class="lista-tareas"></ul>
    </section>
    ${
      proximosPorCategoria.length > 0
        ? `<section>
            <h3>Próximos por categoría</h3>
            <p class="ayuda">¿Tenés un rato libre y no hay nada urgente? Acá tenés la tarea que más conviene de cada categoría, para elegir vos.</p>
            <ul id="lista-por-categoria" class="lista-tareas"></ul>
          </section>`
        : ''
    }
    ${
      restoSinProximos.length > 0 || proximosPorCategoria.length === 0
        ? `<section>
            <h3>Resto de tus pendientes</h3>
            <ul id="lista-resto" class="lista-tareas"></ul>
          </section>`
        : ''
    }
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
    ${
      completadasHoy.length > 0
        ? `<section>
            <h3>Completadas hoy (${completadasHoy.length})</h3>
            <ul id="lista-completadas-hoy" class="lista-tareas"></ul>
          </section>`
        : ''
    }
  `;

  contenedor.querySelector('#boton-revisar-dia').addEventListener('click', () => {
    iniciarRevisionDia([...urgentes, ...resto]);
  });

  contenedor.querySelector('#boton-enfoque-hoy').addEventListener('click', () => {
    guardarEnfoque(!enfoque);
    renderVistaHoy(contenedor);
  });

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
    urgentes.forEach((tarea) => listaUrgentes.appendChild(renderItem(tarea)));
  }

  const listaPorCategoria = contenedor.querySelector('#lista-por-categoria');
  if (listaPorCategoria) {
    proximosPorCategoria.forEach(({ tarea }) => listaPorCategoria.appendChild(renderItem(tarea, { caminoCompleto: true })));
  }

  const listaResto = contenedor.querySelector('#lista-resto');
  if (listaResto) {
    if (restoSinProximos.length === 0) {
      listaResto.innerHTML = '<p class="mensaje-vacio">No hay más tareas pendientes disponibles.</p>';
    } else {
      restoSinProximos.forEach((tarea) => listaResto.appendChild(renderItem(tarea)));
    }
  }

  const listaNoDisponibles = contenedor.querySelector('#lista-no-disponibles');
  if (listaNoDisponibles) {
    aunNoDisponibles
      .sort((a, b) => a.tarea_fecha_inicio_habilitada.localeCompare(b.tarea_fecha_inicio_habilitada))
      .forEach((tarea) => listaNoDisponibles.appendChild(renderItem(tarea, { soloInfo: true })));
  }

  const listaBloqueadas = contenedor.querySelector('#lista-bloqueadas');
  if (listaBloqueadas) {
    bloqueadas.forEach((tarea) => listaBloqueadas.appendChild(renderItem(tarea, { soloInfo: true })));
  }

  const listaCompletadasHoy = contenedor.querySelector('#lista-completadas-hoy');
  if (listaCompletadasHoy) {
    completadasHoy.forEach((tarea) => listaCompletadasHoy.appendChild(renderCompletada(tarea)));
  }
}

/**
 * Texto de la holgura (ver `calcularHolguraDias` en tareas-logica.js) para
 * mostrar junto a cada tarea con fecha límite: cuánto margen le queda antes
 * de vencer, o hace cuánto que venció.
 */
function etiquetaHolgura(tarea) {
  if (!tarea.tarea_fecha_limite) return '';
  return textoHolgura(calcularHolguraDias(tarea));
}

/** Muestra el panel de reprogramar dentro de `contenedorPanel`; `alConfirmar` recibe la fecha elegida. */
function abrirPanelReprogramar(contenedorPanel, tarea, alConfirmar) {
  const cerrar = () => {
    contenedorPanel.hidden = true;
    contenedorPanel.innerHTML = '';
  };
  const panel = crearPanelReprogramar({
    diasHabiles: tarea.tarea_dias_habiles,
    onConfirmar: async (fechaISO) => {
      cerrar();
      await alConfirmar(fechaISO);
    },
    onCancelar: cerrar,
  });
  contenedorPanel.innerHTML = '';
  contenedorPanel.appendChild(panel);
  contenedorPanel.hidden = false;
}

/** Tarjeta de una tarea ya completada hoy: apagada, con la hora y el botón para exportarla a Calendar. */
function renderCompletada(tarea) {
  const categoria = estado.categorias.find((c) => c.categoria_id === tarea.categoria_id);
  const hora = formatearHora(tarea.tarea_fecha_fin);
  const li = document.createElement('li');
  li.className = 'item-tarea completada-hoy';
  li.innerHTML = `
    <div class="item-tarea-info">
      <strong>${escaparHtml(tarea.tarea_nombre)}</strong>
      <span class="etiquetas">
        ${categoria ? `<span class="etiqueta" style="background:${categoria.categoria_color}">${escaparHtml(categoria.categoria_nombre)}</span>` : ''}
        <span class="etiqueta-fecha">✓ Completada ${hora}</span>
        ${tarea.tarea_exportada_calendar ? '<span class="etiqueta-fecha etiqueta-exportada">📅 Exportada</span>' : ''}
      </span>
    </div>
    <div class="item-tarea-acciones">
      <button type="button" data-accion="exportar-calendar">${tarea.tarea_exportada_calendar ? '📅 Exportar de nuevo' : '📅 Exportar a Calendar'}</button>
    </div>
  `;
  li.querySelector('[data-accion="exportar-calendar"]').addEventListener('click', () => ofrecerExportarACalendar(tarea));
  return li;
}

/** Las notas de mejora pendientes de una tarea de mantenimiento (hasta 2, las más recientes), para tenerlas presentes al hacerla. */
function htmlMejorasPendientes(tarea) {
  if (!tarea.tarea_mantenimiento) return '';
  const pendientes = (estado.mejoras || [])
    .filter((m) => m.mejora_tarea_nombre === tarea.tarea_nombre && !m.mejora_aplicada)
    .sort((a, b) => b.mejora_fecha.localeCompare(a.mejora_fecha))
    .slice(0, 2);
  return pendientes.map((m) => `<p class="mejora-pendiente-hoy">💡 Mejora pendiente: «${escaparHtml(m.mejora_texto)}»</p>`).join('');
}

function renderItem(tarea, { soloInfo = false, caminoCompleto = false } = {}) {
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
        ${categoria ? `<span class="etiqueta" style="background:${categoria.categoria_color}">${escaparHtml(caminoCompleto ? caminoCategoria(categoria, estado.categorias) : categoria.categoria_nombre)}</span>` : ''}
        ${tarea.tarea_fecha_inicio_habilitada ? `<span class="etiqueta-fecha">Desde: ${formatearFechaOFechaHora(tarea.tarea_fecha_inicio_habilitada)}</span>` : ''}
        ${tarea.tarea_fecha_limite ? `<span class="etiqueta-fecha">Límite: ${formatearFechaOFechaHora(tarea.tarea_fecha_limite)}</span>` : ''}
        ${tarea.tarea_fecha_limite ? `<span class="etiqueta-fecha">${etiquetaHolgura(tarea)}</span>` : ''}
        ${tarea.tarea_fecha_sugerida ? `<span class="etiqueta-fecha etiqueta-agendada">Sugerida: ${formatearFechaOFechaHora(tarea.tarea_fecha_sugerida)}</span>` : ''}
        <span class="etiqueta-fecha">${ETIQUETAS_ESTADO[tarea.tarea_estado]}</span>
        ${ubicacion ? `<span class="etiqueta-fecha">📍 ${escaparHtml(ubicacion.ubicacion_nombre)}</span>` : ''}
        ${tarea.tarea_costo_estimado ? `<span class="etiqueta-fecha">💰 $${tarea.tarea_costo_estimado}</span>` : ''}
        <span class="etiqueta-fecha etiqueta-clima" hidden></span>
      </span>
      <div class="aviso-solapamiento-calendar" hidden>
        <span class="texto-solapamiento"></span>
        ${
          soloInfo
            ? ''
            : `<button type="button" data-accion="posponer-solapamiento">Posponer</button>
               <button type="button" data-accion="proximo-hueco">Al próximo hueco libre</button>`
        }
      </div>
      ${dependeDe ? `<p class="aviso-bloqueada">Bloqueada por: ${escaparHtml(dependeDe.tarea_nombre)}</p>` : ''}
      ${htmlMejorasPendientes(tarea)}
      ${htmlChecklistTarjeta(tarea)}
      <div class="contenedor-cierre" hidden></div>
      <div class="contenedor-panel-reprogramar" hidden></div>
    </div>
    <div class="item-tarea-acciones">
      ${
        soloInfo
          ? ''
          : `<button type="button" data-accion="cumplida">Cumplida ✓</button>
             <button type="button" data-accion="no-cumplida">No cumplida ✗</button>
             ${esVencida(tarea.tarea_fecha_limite) ? `<button type="button" data-accion="revalorizar-limite">📅 Revalorizar fecha límite</button>` : ''}`
      }
    </div>
  `;

  conectarChecklistTarjeta(li, tarea);

  // Clima: aviso de lluvia si el pronóstico no acompaña, o "☀️" si acompaña (solo en tareas que piden buen clima).
  const etiquetaClima = li.querySelector('.etiqueta-clima');
  evaluarClimaTarea(tarea).then((resultado) => {
    if (!resultado) return;
    if (resultado.favorable) {
      etiquetaClima.textContent = `☀️ Buen clima previsto (${resultado.probabilidadLluvia}% de lluvia)`;
      etiquetaClima.classList.add('etiqueta-clima-favorable');
    } else {
      etiquetaClima.textContent = `🌧️ Lluvia probable (${resultado.probabilidadLluvia}%) — considerá posponer`;
    }
    etiquetaClima.hidden = false;
  });

  const contenedorCierre = li.querySelector('.contenedor-cierre');
  const contenedorPanel = li.querySelector('.contenedor-panel-reprogramar');

  // Calendar: aviso de superposición con un evento (de hoy o de los próximos días), con opciones para moverla.
  if (hayConexionGoogleCalendar() && tieneHora(tarea.tarea_fecha_sugerida)) {
    const avisoCalendar = li.querySelector('.aviso-solapamiento-calendar');
    obtenerEventosDelHorizonte()
      .then((eventos) => {
        const solapamiento = calcularSolapamiento(tarea, eventos);
        if (!solapamiento) return;
        const inicioEvento = new Date(solapamiento.inicio);
        const horaEvento = formatearHora(solapamiento.inicio);
        const diaEvento = diaLocal(solapamiento.inicio) === hoyISO() ? '' : `${inicioEvento.toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: '2-digit' })} `;
        avisoCalendar.querySelector('.texto-solapamiento').textContent = `📅 Se superpone con "${solapamiento.resumen}" (${diaEvento}${horaEvento})`;
        avisoCalendar.hidden = false;
      })
      .catch((error) => console.warn(error.message));

    const botonPosponer = li.querySelector('[data-accion="posponer-solapamiento"]');
    const botonHueco = li.querySelector('[data-accion="proximo-hueco"]');
    const reprogramar = async (fechaISO) => {
      reprogramarTareaConCascada(tarea, fechaISO, estado.tareas);
      await persistirYNotificar();
    };
    if (botonPosponer) {
      botonPosponer.addEventListener('click', () => {
        contenedorCierre.hidden = true;
        contenedorCierre.innerHTML = '';
        abrirPanelReprogramar(contenedorPanel, tarea, reprogramar);
      });
    }
    if (botonHueco) {
      botonHueco.addEventListener('click', async () => {
        botonHueco.disabled = true;
        try {
          const eventos = await obtenerEventosDelHorizonte();
          // "Próximo" = después de la hora sugerida actual (nunca antes de ahora).
          const desde = new Date(Math.max(Date.now(), new Date(tarea.tarea_fecha_sugerida).getTime()));
          const hueco = buscarHuecoLibre(eventos, tarea.tarea_duracion_min, {
            desde,
            franja: obtenerFranjaHoraria(),
            diasHabiles: tarea.tarea_dias_habiles || [],
          });
          if (!hueco) {
            alert('No encontré un hueco libre en los próximos días con esa franja horaria. Elegí vos la fecha.');
            abrirPanelReprogramar(contenedorPanel, tarea, reprogramar);
            return;
          }
          await reprogramar(hueco);
        } catch (error) {
          alert(error.message);
        } finally {
          botonHueco.disabled = false;
        }
      });
    }
  }

  if (soloInfo) return li;

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
      cumplirTarea(tarea, estado, { notaMejora });
      await persistirYNotificar();
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
      abrirPanelReprogramar(contenedorPanel, tarea, async (fechaSugeridaISO) => {
        reprogramarTareaConCascada(tarea, fechaSugeridaISO, estado.tareas);
        await persistirYNotificar();
      });
    });
  });

  const botonRevalorizarLimite = li.querySelector('[data-accion="revalorizar-limite"]');
  if (botonRevalorizarLimite) {
    botonRevalorizarLimite.addEventListener('click', () => {
      contenedorCierre.hidden = true;
      contenedorCierre.innerHTML = '';
      abrirPanelReprogramar(contenedorPanel, tarea, async (fechaLimiteISO) => {
        tarea.tarea_fecha_limite = fechaLimiteISO;
        await persistirYNotificar();
      });
    });
  }

  return li;
}
