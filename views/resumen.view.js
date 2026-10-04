import { estado, persistirYNotificar } from '../assets/js/almacenamiento.js';
import { ETIQUETAS_ESTADO } from '../assets/js/modelos.js';
import {
  esVencida,
  esHoy,
  noPuedeEmpezarTodavia,
  escaparHtml,
  tieneHora,
  textoHolgura,
  caminoCategoria,
  formatearHora,
  diaLocal,
  hoyISO,
  fechaISOMasDias,
  fechaLocalISO,
  diasEntreFechas,
  textoFechaHumana,
} from '../assets/js/utilidades.js';
import { crearPanelReprogramar } from '../assets/js/reprogramar.js';
import {
  cumplirTarea,
  reabrirTarea,
  eliminarTarea,
  reprogramarTareaConCascada,
  avisoInconsistentes,
  compararPorPrioridad,
  calcularHolguraDias,
  mejorTareaPorCategoria,
  ordenarConCadenas,
} from '../assets/js/tareas-logica.js';
import { iniciarRevisionDia } from '../assets/js/revision-dia.js';
import { ofrecerExportarACalendar } from '../assets/js/exportar-calendar.js';
import { preguntarTiempoReal } from '../assets/js/tiempo-real.js';
import { ofrecerCrearTareaSeguimiento, abrirDetalleTarea } from '../assets/js/modal-tarea.js';
import { evaluarClimaTarea } from '../assets/js/clima.js';
import { hayConexionGoogleCalendar, obtenerEventosDelHorizonte, calcularSolapamiento, buscarHuecoLibre, diasHorizonteCalendar } from '../assets/js/google-calendar.js';
import { obtenerFranjaHoraria } from '../assets/js/preferencias-horario.js';
import { htmlChecklistTarjeta, conectarChecklistTarjeta } from '../assets/js/checklist-tarjeta.js';
import { superaLimite } from '../assets/js/programador.js';
import { avisar, confirmar } from '../assets/js/avisos.js';

/** ¿Se completó en el día de hoy (hora local)? */
function seCompletoHoy(tarea) {
  return !!tarea.tarea_fecha_fin && diaLocal(tarea.tarea_fecha_fin) === hoyISO();
}

/** Texto "⏳ Quedan Xh Ym" para una fecha límite de hoy, con hora, todavía no vencida. */
function textoCuentaRegresiva(fechaLimiteISO) {
  const restanteMs = new Date(fechaLimiteISO).getTime() - Date.now();
  if (restanteMs <= 0) return '⏳ Venciendo…';
  const minutos = Math.floor(restanteMs / 60000);
  const horas = Math.floor(minutos / 60);
  const minutosRestantes = minutos % 60;
  if (minutos < 1) return '⏳ Queda menos de 1 min';
  return `⏳ Quedan ${horas > 0 ? `${horas}h ` : ''}${minutosRestantes}min`;
}

// Actualiza los temporizadores de cuenta regresiva de las tarjetas visibles cada 60 s, sin
// redibujar la vista entera (mismo patrón que la línea de "ahora" de views/semana.view.js).
setInterval(() => {
  document.querySelectorAll('.temporizador-urgente').forEach((el) => {
    el.textContent = textoCuentaRegresiva(el.dataset.limite);
  });
}, 60 * 1000);

export function renderVistaResumen(contenedor) {
  const pendientesActivas = estado.tareas.filter((t) => t.tarea_estado !== 'completada');
  const manana = fechaISOMasDias(1, hoyISO());

  // Tareas cuya fecha sugerida quedó después de su propia fecha límite (un corrimiento en cascada, sin hueco
  // real disponible, la dejó así) — se muestran aparte (v0.89.0), no en su sección habitual.
  const sinHuecoAntesDelLimite = ordenarConCadenas(
    pendientesActivas
      .filter((t) => t.tarea_fecha_sugerida && superaLimite(t.tarea_fecha_sugerida, t.tarea_fecha_limite))
      .sort((a, b) => compararPorPrioridad(a, b, estado.categorias))
  );
  const idsSinHueco = new Set(sinHuecoAntesDelLimite.map((t) => t.tarea_id));
  const activasRestantes = pendientesActivas.filter((t) => !idsSinHueco.has(t.tarea_id));

  const bloqueadasTodas = activasRestantes.filter((t) => t.tarea_estado === 'bloqueada');
  // Una bloqueada con límite vencido/hoy también es urgente: se muestra ahí (de solo lectura, no se puede
  // completar todavía) en vez de perderse en "Bloqueadas por otras tareas". Mismo criterio para "Hoy"/"Mañana".
  const bloqueadasHoy = bloqueadasTodas
    .filter((t) => esVencida(t.tarea_fecha_limite) || esHoy(t.tarea_fecha_limite) || diaLocal(t.tarea_fecha_limite) === manana)
    .sort((a, b) => compararPorPrioridad(a, b, estado.categorias));
  const idsBloqueadasHoy = new Set(bloqueadasHoy.map((t) => t.tarea_id));
  const bloqueadasHoyNueva = bloqueadasTodas
    .filter((t) => !idsBloqueadasHoy.has(t.tarea_id) && esHoy(t.tarea_fecha_sugerida))
    .sort((a, b) => compararPorPrioridad(a, b, estado.categorias));
  const idsBloqueadasHastaHoy = new Set([...idsBloqueadasHoy, ...bloqueadasHoyNueva.map((t) => t.tarea_id)]);
  const bloqueadasManana = bloqueadasTodas
    .filter((t) => !idsBloqueadasHastaHoy.has(t.tarea_id) && (diaLocal(t.tarea_fecha_limite) === manana || diaLocal(t.tarea_fecha_sugerida) === manana))
    .sort((a, b) => compararPorPrioridad(a, b, estado.categorias));
  const idsBloqueadasMostradas = new Set([...idsBloqueadasHastaHoy, ...bloqueadasManana.map((t) => t.tarea_id)]);
  const bloqueadas = bloqueadasTodas.filter((t) => !idsBloqueadasMostradas.has(t.tarea_id));
  const accionables = activasRestantes.filter((t) => t.tarea_estado === 'pendiente');
  const disponibles = accionables.filter((t) => !noPuedeEmpezarTodavia(t.tarea_fecha_inicio_habilitada));
  const aunNoDisponibles = accionables.filter((t) => noPuedeEmpezarTodavia(t.tarea_fecha_inicio_habilitada));

  const vencidas = ordenarConCadenas(disponibles.filter((t) => esVencida(t.tarea_fecha_limite)).sort((a, b) => compararPorPrioridad(a, b, estado.categorias)));
  const idsVencidas = new Set(vencidas.map((t) => t.tarea_id));
  const urgentes = ordenarConCadenas(
    disponibles.filter((t) => !idsVencidas.has(t.tarea_id) && (esHoy(t.tarea_fecha_limite) || diaLocal(t.tarea_fecha_limite) === manana)).sort((a, b) => compararPorPrioridad(a, b, estado.categorias))
  );
  const idsUrgentes = new Set([...idsVencidas, ...urgentes.map((t) => t.tarea_id)]);
  const hoyNueva = ordenarConCadenas(
    disponibles.filter((t) => !idsUrgentes.has(t.tarea_id) && esHoy(t.tarea_fecha_sugerida)).sort((a, b) => compararPorPrioridad(a, b, estado.categorias))
  );
  const idsHoyNueva = new Set(hoyNueva.map((t) => t.tarea_id));
  const idsHasta = new Set([...idsUrgentes, ...idsHoyNueva]);
  const tareasManana = ordenarConCadenas(
    disponibles
      .filter((t) => !idsHasta.has(t.tarea_id) && (diaLocal(t.tarea_fecha_limite) === manana || diaLocal(t.tarea_fecha_sugerida) === manana))
      .sort((a, b) => compararPorPrioridad(a, b, estado.categorias))
  );
  const idsManana = new Set(tareasManana.map((t) => t.tarea_id));
  const idsHastaManana = new Set([...idsHasta, ...idsManana]);
  const resto = disponibles.filter((t) => !idsHastaManana.has(t.tarea_id)).sort((a, b) => compararPorPrioridad(a, b, estado.categorias));
  // "Próximos por categoría" va primero y "Resto" muestra lo que queda sin repetirlos.
  const proximosPorCategoria = mejorTareaPorCategoria(resto, estado.categorias);
  const idsProximos = new Set(proximosPorCategoria.map(({ tarea }) => tarea.tarea_id));
  const restoSinProximos = ordenarConCadenas(resto.filter((t) => !idsProximos.has(t.tarea_id)));
  const completadasHoy = estado.tareas
    .filter((t) => t.tarea_estado === 'completada' && seCompletoHoy(t))
    .sort((a, b) => b.tarea_fecha_fin.localeCompare(a.tarea_fecha_fin));

  contenedor.innerHTML = `
    <h2 title="Lo urgente primero: tareas vencidas o con fecha límite hoy. Así no hace falta reprogramar nada para saber por dónde arrancar.">📌 Resumen</h2>
    <div class="controles-hoy">
      <button title="Ver los eventos reales de tu Calendar y agregar las tareas de continuidad que hayan surgido" type="button" id="boton-revisar-dia" class="boton-primario">👀 Revisar mi día</button>
      <div class="contenedor-selector-dia-revision" hidden></div>
    </div>
    <details class="completadas-plegadas">
      <summary title="Tareas accionables cuya fecha límite ya venció">🔴 Vencidas (${vencidas.length})</summary>
      <ul id="lista-vencidas" class="lista-tareas"></ul>
    </details>
    ${
      sinHuecoAntesDelLimite.length > 0
        ? `<section>
            <h3 title="Tareas cuya fecha sugerida quedó después de su fecha límite: no se encontró un hueco real a tiempo (por ejemplo, por falta de disponibilidad en tu Calendar). Revisalas para reprogramarlas a mano, cambiar el límite o eliminarlas.">⚠️ Sin hueco antes del límite (${sinHuecoAntesDelLimite.length})</h3>
            <ul id="lista-sin-hueco" class="lista-tareas"></ul>
          </section>`
        : ''
    }
    <section>
      <h3 title="Tareas accionables (y bloqueadas de solo lectura) con fecha límite hoy o mañana">🚨 Urgentes (${urgentes.length + bloqueadasHoy.length})</h3>
      <ul id="lista-urgentes" class="lista-tareas"></ul>
    </section>
    ${
      hoyNueva.length > 0 || bloqueadasHoyNueva.length > 0
        ? `<section>
            <h3 title="Tareas con fecha sugerida hoy, cuya fecha límite no es hoy">📌 Hoy (${hoyNueva.length + bloqueadasHoyNueva.length})</h3>
            <ul id="lista-hoy-nueva" class="lista-tareas"></ul>
          </section>`
        : ''
    }
    ${
      proximosPorCategoria.length > 0
        ? `<section>
            <h3 title="¿Tenés un rato libre y no hay nada urgente? Acá tenés la tarea que más conviene de cada categoría, para elegir vos.">🧭 Próximos por categoría</h3>
            <ul id="lista-por-categoria" class="lista-tareas"></ul>
          </section>`
        : ''
    }
    ${
      tareasManana.length > 0 || bloqueadasManana.length > 0
        ? `<details class="completadas-plegadas">
            <summary title="Tareas con fecha límite o sugerida mañana">🌅 Mañana (${tareasManana.length + bloqueadasManana.length})</summary>
            <ul id="lista-manana" class="lista-tareas"></ul>
          </details>`
        : ''
    }
    ${
      restoSinProximos.length > 0 || proximosPorCategoria.length === 0
        ? `<details class="completadas-plegadas">
            <summary title="El resto de tus tareas accionables, sin fecha urgente">📋 Resto de tus pendientes (${restoSinProximos.length})</summary>
            <ul id="lista-resto" class="lista-tareas"></ul>
          </details>`
        : ''
    }
    ${
      aunNoDisponibles.length > 0
        ? `<details class="completadas-plegadas">
            <summary title="Tareas cuya fecha de inicio habilitada todavía no llegó">⏳ Todavía no pueden empezar (${aunNoDisponibles.length})</summary>
            <ul id="lista-no-disponibles" class="lista-tareas"></ul>
          </details>`
        : ''
    }
    ${
      bloqueadas.length > 0
        ? `<details class="completadas-plegadas">
            <summary title="Tareas bloqueadas por otra que todavía no se completó">🔒 Bloqueadas por otras tareas (${bloqueadas.length})</summary>
            <ul id="lista-bloqueadas" class="lista-tareas"></ul>
          </details>`
        : ''
    }
    ${
      completadasHoy.length > 0
        ? `<details open class="completadas-plegadas">
            <summary title="Tareas que completaste hoy">✅ Completadas hoy (${completadasHoy.length})</summary>
            <ul id="lista-completadas-hoy" class="lista-tareas"></ul>
          </details>`
        : ''
    }
  `;

  const contenedorSelectorDia = contenedor.querySelector('.contenedor-selector-dia-revision');
  contenedor.querySelector('#boton-revisar-dia').addEventListener('click', () => {
    const yaAbierto = !contenedorSelectorDia.hidden;
    contenedorSelectorDia.innerHTML = '';
    contenedorSelectorDia.hidden = true;
    if (yaAbierto) return;
    contenedorSelectorDia.appendChild(
      crearSelectorDiaRevision((diaCalendario) => {
        contenedorSelectorDia.hidden = true;
        contenedorSelectorDia.innerHTML = '';
        iniciarRevisionDia({ diaCalendario });
      })
    );
    contenedorSelectorDia.hidden = false;
  });

  const listaVencidas = contenedor.querySelector('#lista-vencidas');
  if (vencidas.length === 0) {
    listaVencidas.innerHTML = '<p class="mensaje-vacio">No tenés tareas vencidas 🎉</p>';
  } else {
    vencidas.forEach((tarea) => listaVencidas.appendChild(renderItem(tarea)));
  }

  const listaSinHueco = contenedor.querySelector('#lista-sin-hueco');
  if (listaSinHueco) {
    sinHuecoAntesDelLimite.forEach((tarea) => listaSinHueco.appendChild(renderItem(tarea, { soloInfo: tarea.tarea_estado === 'bloqueada' })));
  }

  const listaUrgentes = contenedor.querySelector('#lista-urgentes');
  if (urgentes.length === 0 && bloqueadasHoy.length === 0) {
    listaUrgentes.innerHTML = '<p class="mensaje-vacio">No tenés tareas con fecha límite hoy ni mañana 🎉</p>';
  } else {
    urgentes.forEach((tarea) => listaUrgentes.appendChild(renderItem(tarea)));
    bloqueadasHoy.forEach((tarea) => listaUrgentes.appendChild(renderItem(tarea, { soloInfo: true })));
  }

  const listaHoyNueva = contenedor.querySelector('#lista-hoy-nueva');
  if (listaHoyNueva) {
    hoyNueva.forEach((tarea) => listaHoyNueva.appendChild(renderItem(tarea)));
    bloqueadasHoyNueva.forEach((tarea) => listaHoyNueva.appendChild(renderItem(tarea, { soloInfo: true })));
  }

  const listaManana = contenedor.querySelector('#lista-manana');
  if (listaManana) {
    tareasManana.forEach((tarea) => listaManana.appendChild(renderItem(tarea)));
    bloqueadasManana.forEach((tarea) => listaManana.appendChild(renderItem(tarea, { soloInfo: true })));
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

/** Panel chico con atajos de día (para elegir qué día de Calendar leer al final de "Revisar mi día"). */
function crearSelectorDiaRevision(alElegir) {
  const panel = document.createElement('div');
  panel.className = 'panel-reprogramar';
  const hoy = hoyISO();
  const atajos = [
    { etiqueta: 'Hoy', dia: hoy },
    { etiqueta: 'Ayer', dia: fechaISOMasDias(-1, hoy) },
    { etiqueta: 'Anteayer', dia: fechaISOMasDias(-2, hoy) },
  ];
  panel.innerHTML = `
    <p class="panel-reprogramar-etiqueta">¿Qué día de tu Calendar querés revisar al final del repaso?</p>
    <div class="panel-reprogramar-fila">
      ${atajos.map((a) => `<button type="button" data-dia="${a.dia}" title="Revisar el Calendar de: ${a.etiqueta}">${a.etiqueta}</button>`).join('')}
      <input type="date" data-campo="fecha-revision" value="${hoy}" max="${hoy}" />
      <button type="button" data-accion="empezar-repaso" class="boton-primario">🔍 Empezar repaso</button>
    </div>
  `;
  const campoFecha = panel.querySelector('[data-campo="fecha-revision"]');
  panel.querySelectorAll('[data-dia]').forEach((boton) => {
    boton.addEventListener('click', () => {
      campoFecha.value = boton.dataset.dia;
    });
  });
  panel.querySelector('[data-accion="empezar-repaso"]').addEventListener('click', () => {
    alElegir(campoFecha.value || hoy);
  });
  return panel;
}

/**
 * Texto de la holgura (ver `calcularHolguraDias` en tareas-logica.js) para
 * mostrar junto a cada tarea con fecha límite: cuánto margen le queda antes
 * de vencer, o hace cuánto que venció.
 */
function etiquetaHolgura(tarea) {
  if (!tarea.tarea_fecha_limite) return '';
  // El margen en horas (calcularHolguraDias) puede dar "0 días" para una tarea que vence mañana a primera hora, si
  // ya pasó esa hora hoy: acá se compara por día calendario para que el texto diga lo que corresponde.
  const diasCalendario = diasEntreFechas(hoyISO(), diaLocal(tarea.tarea_fecha_limite));
  if (diasCalendario === 0) return esVencida(tarea.tarea_fecha_limite) ? 'Vencida hoy' : 'Vence hoy';
  if (diasCalendario === 1 && !esVencida(tarea.tarea_fecha_limite)) return 'Vence mañana';
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
      <button title="Volver a marcarla como pendiente (por si se completó por error)" type="button" data-accion="reabrir">↩️ Reabrir</button>
      <button title="Abrir Google Calendar con la tarea cargada para guardarla como registro" type="button" data-accion="exportar-calendar">${tarea.tarea_exportada_calendar ? '📅 Exportar de nuevo' : '📅 Exportar a Calendar'}</button>
    </div>
  `;
  li.querySelector('[data-accion="exportar-calendar"]').addEventListener('click', () => ofrecerExportarACalendar(tarea));
  li.querySelector('[data-accion="reabrir"]').addEventListener('click', async () => {
    const { copiaConservada } = reabrirTarea(tarea, estado);
    await persistirYNotificar();
    if (copiaConservada) {
      await avisar(`Se reabrió «${tarea.tarea_nombre}». La copia que se había generado al completarla no se borró porque ya se modificó o hay tareas que dependen de ella: revisá que no quede duplicada.`);
    }
  });
  return li;
}

/** Las notas de mejora pendientes de una tarea de mantenimiento (hasta 2, las más recientes), para tenerlas presentes al hacerla. */
function htmlMejorasPendientes(tarea) {
  if (!tarea.tarea_mantenimiento) return '';
  const pendientes = (estado.mejoras || [])
    .filter((m) => m.mejora_tarea_nombre === tarea.tarea_nombre && !m.mejora_aplicada)
    .sort((a, b) => b.mejora_fecha.localeCompare(a.mejora_fecha))
    .slice(0, 2);
  return pendientes
    .map(
      (m) =>
        `<p class="mejora-pendiente-hoy">💡 Mejora pendiente: «${escaparHtml(m.mejora_texto)}» <button title="Marcar esta mejora como aplicada" type="button" data-accion="marcar-mejora-aplicada" data-mejora="${m.mejora_id}">✅ Marcar aplicada</button></p>`
    )
    .join('');
}

/** Conecta los botones "Marcar aplicada" que arma `htmlMejorasPendientes` dentro de `li`. */
function conectarMejorasPendientes(li) {
  li.querySelectorAll('[data-accion="marcar-mejora-aplicada"]').forEach((boton) => {
    boton.addEventListener('click', async () => {
      const mejora = (estado.mejoras || []).find((m) => m.mejora_id === boton.dataset.mejora);
      if (!mejora) return;
      mejora.mejora_aplicada = true;
      await persistirYNotificar();
    });
  });
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
        ${tarea.tarea_urgente ? '<span class="etiqueta-fecha">🔴 Urgente</span>' : ''}
        ${categoria ? `<span class="etiqueta" style="background:${categoria.categoria_color}">${escaparHtml(caminoCompleto ? caminoCategoria(categoria, estado.categorias) : categoria.categoria_nombre)}</span>` : ''}
        ${tarea.tarea_fecha_limite ? `<span class="etiqueta-fecha">Límite: ${textoFechaHumana(tarea.tarea_fecha_limite)}</span>` : ''}
        ${tarea.tarea_fecha_limite ? `<span class="etiqueta-fecha">${etiquetaHolgura(tarea)}</span>` : ''}
        ${
          tieneHora(tarea.tarea_fecha_limite) && esHoy(tarea.tarea_fecha_limite) && !esVencida(tarea.tarea_fecha_limite)
            ? `<span class="etiqueta-fecha temporizador-urgente" data-limite="${tarea.tarea_fecha_limite}">${textoCuentaRegresiva(tarea.tarea_fecha_limite)}</span>`
            : ''
        }
        ${tarea.tarea_fecha_sugerida ? `<span class="etiqueta-fecha etiqueta-agendada">Sugerida: ${textoFechaHumana(tarea.tarea_fecha_sugerida)}</span>` : ''}
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
            : `<button title="Elegir otra fecha porque se superpone con un evento" type="button" data-accion="posponer-solapamiento">⏭️ Posponer</button>
               <button title="Mover la tarea al primer horario libre de tu Calendar" type="button" data-accion="proximo-hueco">🕒 Al próximo hueco libre</button>`
        }
      </div>
      ${tarea.tarea_estado === 'bloqueada' && dependeDe ? `<p class="aviso-bloqueada">Bloqueada por: ${escaparHtml(dependeDe.tarea_nombre)}</p>` : ''}
      ${htmlMejorasPendientes(tarea)}
      ${htmlChecklistTarjeta(tarea)}
      <div class="contenedor-cierre" hidden></div>
      <div class="contenedor-panel-reprogramar" hidden></div>
    </div>
    <div class="item-tarea-acciones">
      ${
        soloInfo
          ? ''
          : `<button title="No se hizo: elegir una nueva fecha para la tarea" type="button" data-accion="no-cumplida">❌ No cumplida</button>
             <button title="Marcar la tarea como cumplida" type="button" data-accion="cumplida">✅ Cumplida</button>
             ${esVencida(tarea.tarea_fecha_limite) ? `<button title="Cambiar la fecha límite de esta tarea vencida" type="button" data-accion="revalorizar-limite">📅 Revalorizar fecha límite</button>` : ''}`
      }
    </div>
  `;

  conectarChecklistTarjeta(li, tarea);
  conectarMejorasPendientes(li);

  li.addEventListener('dblclick', (evento) => {
    if (evento.target.closest('button, a, input, select')) return;
    const contenidoTarjeta = renderItem(tarea, { soloInfo: true, caminoCompleto: true }).querySelector('.item-tarea-info');
    abrirDetalleTarea(tarea, contenidoTarjeta);
  });

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
      const inconsistentes = reprogramarTareaConCascada(tarea, fechaISO, estado.tareas);
      await persistirYNotificar();
      const aviso = avisoInconsistentes(inconsistentes);
      if (aviso) await avisar(aviso);
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
          // No pasar de la fecha límite (v0.89.0 — antes buscaba en todo el horizonte configurado, pudiendo
          // asignar de un clic una fecha después del límite).
          const diaLimite = tarea.tarea_fecha_limite ? diaLocal(tarea.tarea_fecha_limite) : null;
          const dias = diaLimite ? Math.max(1, diasEntreFechas(fechaLocalISO(desde), diaLimite) + 1) : diasHorizonteCalendar();
          const hueco = buscarHuecoLibre(eventos, tarea.tarea_duracion_min, {
            desde,
            dias,
            franja: obtenerFranjaHoraria(),
            diasHabiles: tarea.tarea_dias_habiles || [],
          });
          if (!hueco || superaLimite(hueco, tarea.tarea_fecha_limite)) {
            await avisar(
              diaLimite
                ? 'No hay hueco libre antes de tu fecha límite. Elegí vos la fecha.'
                : 'No encontré un hueco libre en los próximos días con esa franja horaria. Elegí vos la fecha.'
            );
            abrirPanelReprogramar(contenedorPanel, tarea, reprogramar);
            return;
          }
          await reprogramar(hueco);
        } catch (error) {
          await avisar(error.message);
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
            ? `<label>💡 ¿Qué podrías mejorar la próxima vez? (opcional)
                <input type="text" data-campo="mejora" />
              </label>`
            : ''
        }
        <button title="Confirmar que la tarea se cumplió" type="button" data-accion="confirmar-cumplida" class="boton-primario">✔️ Confirmar</button>
        <button title="Cancelar y volver a la tarea" type="button" data-accion="cancelar-cierre">↩️ Cancelar</button>
      </div>
    `;
    contenedorCierre.hidden = false;

    contenedorCierre.querySelector('[data-accion="confirmar-cumplida"]').addEventListener('click', async () => {
      const campoMejora = contenedorCierre.querySelector('[data-campo="mejora"]');
      const notaMejora = campoMejora ? campoMejora.value.trim() : '';
      cumplirTarea(tarea, estado, { notaMejora });
      await persistirYNotificar();
      await preguntarTiempoReal(tarea);
      ofrecerExportarACalendar(tarea);
      ofrecerCrearTareaSeguimiento(tarea);
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
        <button title="Seguir y elegir la nueva fecha" type="button" data-accion="continuar-reprogramar" class="boton-primario">📅 Reprogramar</button>
        <button title="Eliminar esta tarea (pide confirmación)" type="button" data-accion="eliminar-tarea">🗑️ Eliminar</button>
        <button title="Cancelar y volver a la tarea" type="button" data-accion="cancelar-cierre">↩️ Cancelar</button>
      </div>
    `;
    contenedorCierre.hidden = false;

    contenedorCierre.querySelector('[data-accion="cancelar-cierre"]').addEventListener('click', () => {
      contenedorCierre.hidden = true;
      contenedorCierre.innerHTML = '';
    });

    contenedorCierre.querySelector('[data-accion="eliminar-tarea"]').addEventListener('click', async () => {
      if (!await confirmar(`¿Eliminar la tarea "${tarea.tarea_nombre}"?`, { peligro: true, textoAceptar: 'Eliminar' })) return;
      eliminarTarea(tarea, estado);
      await persistirYNotificar();
    });

    contenedorCierre.querySelector('[data-accion="continuar-reprogramar"]').addEventListener('click', () => {
      contenedorCierre.hidden = true;
      contenedorCierre.innerHTML = '';
      abrirPanelReprogramar(contenedorPanel, tarea, async (fechaSugeridaISO) => {
        const inconsistentes = reprogramarTareaConCascada(tarea, fechaSugeridaISO, estado.tareas);
        await persistirYNotificar();
        const aviso = avisoInconsistentes(inconsistentes);
        if (aviso) await avisar(aviso);
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

