import { estado, persistirYNotificar } from '../assets/js/almacenamiento.js';
import { hoyISO, diaLocal, fechaISOMasDias, formatearFecha, formatearHora, escaparHtml, combinarFechaYHora, tieneHora, minutosDeHHMM } from '../assets/js/utilidades.js';
import { esTareaAccionable, compararPorPrioridad, ordenarConCadenas, fechaFijaVigente } from '../assets/js/tareas-logica.js';
import { abrirEdicionTarea } from '../assets/js/modal-tarea.js';
import { abrirDialogoFormulario } from '../assets/js/dialogo-formulario.js';
import { obtenerPreferencias, guardarCapacidadDeFecha } from '../assets/js/preferencias.js';
import { obtenerFranjaHoraria } from '../assets/js/preferencias-horario.js';
import { bloquesDeSemana, tramosFueraDeBloques } from '../assets/js/bloques-horarios.js';
import { crearCalculadoraCapacidad } from '../assets/js/capacidad.js';
import { hayConexionGoogleCalendar, obtenerEventos, obtenerEventosParaMostrar } from '../assets/js/google-calendar.js';
import { obtenerPronosticoDiario, iconoClima, obtenerCoordenadasClima } from '../assets/js/clima.js';
import { pedirEnfocarDiaAgenda } from '../assets/js/vista-agenda.js';
import {
  OPCIONES_DIAS_SEMANA,
  leerDiasSemana,
  guardarDiasSemana,
  leerMostrarSol,
  guardarMostrarSol,
  leerFiltroClima,
  guardarFiltroClima,
  FILTROS_CLIMA,
} from '../assets/js/vista-semana-preferencias.js';

const ETIQUETAS_FILTRO_CLIMA = { ninguno: 'Ninguno', temperatura: '🌡️ Temperatura', lluvia: '🌧️ Lluvia' };

const NOMBRES_DIA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

// Reactivos a la franja horaria de Configuraciones (`pref_franja`), reasignados al principio de cada
// `renderVistaSemana` — mismo patrón que `offsetDias`/`ultimoContenedor` (variables de módulo que el resto
// de las funciones de este archivo leen sin que se les pase por parámetro). Los valores de acá son solo el
// default hasta el primer render.
let HORA_INICIO = 7;
let HORA_FIN = 23;
const ALTO_HORA_PX = 48;
let MINUTOS_VISIBLES = (HORA_FIN - HORA_INICIO) * 60;
// Bloques disponibles de cada día de la semana (v0.105.0), reasignados en cada `renderVistaSemana`.
let BLOQUES_SEMANA = bloquesDeSemana({});

/** hex "#rrggbb" → "rgba(r, g, b, alpha)", para el fondo tintado de un bloque de evento. */
function hexARgba(hex, alpha) {
  const limpio = String(hex || '').replace('#', '');
  const completo = limpio.length === 3 ? limpio.split('').map((c) => c + c).join('') : limpio;
  const bigint = parseInt(completo, 16);
  if (Number.isNaN(bigint)) return `rgba(148, 163, 184, ${alpha})`;
  return `rgba(${(bigint >> 16) & 255}, ${(bigint >> 8) & 255}, ${bigint & 255}, ${alpha})`;
}

function fechaDeReferenciaProyectada(tarea) {
  const fecha = tarea.tarea_fecha_sugerida || tarea.tarea_fecha_limite || null;
  return fecha ? diaLocal(fecha) : null;
}

// Escala de color para el degradé de temperatura (frío → calor), en tramos [°C, [r,g,b]].
// v0.103.0: la escala va de 0 °C a 35 °C (por debajo de 0 queda el primer color y por encima de 35 el último).
const ESCALA_TEMPERATURA = [
  [0, [56, 189, 248]],
  [15, [74, 222, 128]],
  [25, [250, 204, 21]],
  [35, [239, 68, 68]],
];

/** Color de fondo (tenue) para un valor de temperatura en °C, interpolando `ESCALA_TEMPERATURA`. */
function colorTemperatura(celsius) {
  if (celsius == null) return 'transparent';
  if (celsius <= ESCALA_TEMPERATURA[0][0]) return `rgba(${ESCALA_TEMPERATURA[0][1].join(',')}, 0.35)`;
  for (let i = 1; i < ESCALA_TEMPERATURA.length; i += 1) {
    const [t1, c1] = ESCALA_TEMPERATURA[i];
    if (celsius <= t1) {
      const [t0, c0] = ESCALA_TEMPERATURA[i - 1];
      const f = (celsius - t0) / (t1 - t0);
      const c = c0.map((v, idx) => Math.round(v + (c1[idx] - v) * f));
      return `rgba(${c.join(',')}, 0.35)`;
    }
  }
  return `rgba(${ESCALA_TEMPERATURA[ESCALA_TEMPERATURA.length - 1][1].join(',')}, 0.35)`;
}

/** Color de fondo (azul, más opaco cuanto más probable) para una probabilidad de lluvia (0-100). */
function colorLluvia(porcentaje) {
  if (porcentaje == null) return 'transparent';
  const alpha = Math.min(0.6, (porcentaje / 100) * 0.6);
  return `rgba(56, 132, 255, ${alpha.toFixed(2)})`;
}

/**
 * Leyenda de los colores del fondo (v0.100.0): una barra con el mismo degradé y los valores de referencia. La
 * temperatura va en °C; para la lluvia el dato que da el pronóstico es la **probabilidad** (%), no los milímetros.
 */
function htmlLeyendaClima(filtroClima) {
  if (filtroClima === 'temperatura') {
    const minimo = ESCALA_TEMPERATURA[0][0];
    const maximo = ESCALA_TEMPERATURA[ESCALA_TEMPERATURA.length - 1][0];
    const paradas = ESCALA_TEMPERATURA.map(([c, rgb]) => `rgb(${rgb.join(',')}) ${((c - minimo) / (maximo - minimo)) * 100}%`).join(', ');
    const marcas = ESCALA_TEMPERATURA.map(([c]) => `<span style="left:${((c - minimo) / (maximo - minimo)) * 100}%">${c} °C</span>`).join('');
    return `<div class="leyenda-clima" title="Color de fondo según la temperatura prevista"><div class="leyenda-clima-barra" style="background:linear-gradient(to right, ${paradas})"></div><div class="leyenda-clima-marcas">${marcas}</div></div>`;
  }
  if (filtroClima === 'lluvia') {
    const marcas = [0, 50, 100].map((p) => `<span style="left:${p}%">${p} %</span>`).join('');
    return `<div class="leyenda-clima" title="Color de fondo según la probabilidad de lluvia prevista, en % (el pronóstico no informa milímetros)"><div class="leyenda-clima-barra" style="background:linear-gradient(to right, rgba(56,132,255,0), rgba(56,132,255,0.6))"></div><div class="leyenda-clima-marcas">${marcas}</div></div>`;
  }
  return '';
}

/** El dato horario de `pronostico` para un día y una hora en punto (`YYYY-MM-DDTHH:00`). */
function datosDeHora(pronostico, fechaDia, hora) {
  const prefijo = `${fechaDia}T${String(hora).padStart(2, '0')}:00`;
  return pronostico.horas.find((h) => h.fechaHora.startsWith(prefijo)) || null;
}

/** `linear-gradient` de tramos duros, uno por hora en punto que cae dentro de la franja visible, para el fondo
 * de un día. El pronóstico de Open-Meteo solo tiene datos por hora en punto, así que con una franja que no
 * arranca/termina en una (ej. 07:30) el primer/último tramo se recorta a `[0, 100]%` en vez de salirse del
 * degradé. */
function construirGradienteClima(pronostico, fechaDia, filtroClima) {
  const totalHoras = HORA_FIN - HORA_INICIO;
  const tramos = [];
  for (let hora = Math.floor(HORA_INICIO); hora < Math.ceil(HORA_FIN); hora += 1) {
    const datos = datosDeHora(pronostico, fechaDia, hora);
    const color = !datos ? 'transparent' : filtroClima === 'temperatura' ? colorTemperatura(datos.temperatura) : colorLluvia(datos.probabilidadLluvia);
    const desde = Math.max(0, ((hora - HORA_INICIO) / totalHoras) * 100);
    const hasta = Math.min(100, ((hora + 1 - HORA_INICIO) / totalHoras) * 100);
    tramos.push(`${color} ${desde}%`, `${color} ${hasta}%`);
  }
  return `linear-gradient(to bottom, ${tramos.join(', ')})`;
}

/** Ícono de clima por día, marcas de amanecer/atardecer y degradé de fondo (temperatura o lluvia) — v0.79.0. */
function pintarClima(grilla, dias, pronostico, { mostrarSol, filtroClima }) {
  grilla.querySelectorAll('.dia-semana').forEach((columna) => {
    const fechaDia = columna.dataset.dia;
    const datosDia = pronostico.dias.find((d) => d.fecha === fechaDia);
    const cuerpo = columna.querySelector('.dia-semana-cuerpo');

    if (datosDia) {
      const contenedorNombre = columna.querySelector('.dia-semana-encabezado > div');
      let icono = contenedorNombre.querySelector('.icono-clima-dia');
      if (!icono) {
        icono = document.createElement('span');
        icono.className = 'icono-clima-dia';
        contenedorNombre.appendChild(icono);
      }
      icono.textContent = iconoClima(datosDia.weathercode);
    }

    cuerpo.querySelectorAll('.marca-sol').forEach((m) => m.remove());
    if (mostrarSol && datosDia) {
      [
        { fechaHora: datosDia.sunrise, clase: 'amanecer', emoji: '🌅', etiqueta: 'Amanecer' },
        { fechaHora: datosDia.sunset, clase: 'atardecer', emoji: '🌇', etiqueta: 'Atardecer' },
      ].forEach(({ fechaHora, clase, emoji, etiqueta }) => {
        if (!fechaHora) return;
        const fecha = new Date(fechaHora);
        const minutosDesdeInicio = (fecha.getHours() - HORA_INICIO) * 60 + fecha.getMinutes();
        if (minutosDesdeInicio < 0 || minutosDesdeInicio >= MINUTOS_VISIBLES) return;
        const marca = document.createElement('div');
        marca.className = `marca-sol ${clase}`;
        marca.style.top = `${(minutosDesdeInicio / 60) * ALTO_HORA_PX}px`;
        marca.title = `${etiqueta}: ${formatearHora(fechaHora)}`;
        marca.innerHTML = `<span class="marca-sol-icono">${emoji}</span>`;
        cuerpo.appendChild(marca);
      });
    }

    cuerpo.style.background = filtroClima !== 'ninguno' && datosDia ? construirGradienteClima(pronostico, fechaDia, filtroClima) : '';
  });
}

/** Una tarea sirve para "proyectarse" en Semana si está accionable o si está bloqueada (para verla igual, atenuada). */
function esProyectable(tarea) {
  return esTareaAccionable(tarea) || tarea.tarea_estado === 'bloqueada';
}

// Cuántos días atrás de "offsetDias" arranca el rango visible (avanza/retrocede de a `cantidadDias`, sin techo
// hacia adelante). Es de la sesión, no una preferencia guardada (a diferencia de la cantidad de días).
let offsetDias = 0;
let ultimoContenedor = null;

export function renderVistaSemana(contenedor) {
  ultimoContenedor = contenedor;
  const franja = obtenerFranjaHoraria();
  HORA_INICIO = minutosDeHHMM(franja.inicio) / 60;
  HORA_FIN = minutosDeHHMM(franja.fin) / 60;
  MINUTOS_VISIBLES = (HORA_FIN - HORA_INICIO) * 60;
  BLOQUES_SEMANA = bloquesDeSemana(obtenerPreferencias());
  const hoy = hoyISO();
  const cantidadDias = leerDiasSemana();
  const mostrarSol = leerMostrarSol();
  const filtroClima = leerFiltroClima();
  offsetDias = Math.max(0, offsetDias);
  const dias = Array.from({ length: cantidadDias }, (_, i) => fechaISOMasDias(offsetDias + i, hoy));

  contenedor.innerHTML = `
    <div class="barra-semana">
      <div class="barra-semana-izquierda">
        <h2 title="Tareas fijas (con horario agendado), proyección de las pendientes y bloqueadas 🔒 según su fecha sugerida o límite y, en gris, tus eventos de Google Calendar (se editan desde Calendar). Debajo de cada día, cuánto tiempo llevás planificado contra el disponible: tocalo para ajustar la capacidad de ese día. Hacé clic en una tarea para editarla.">📆 Semana</h2>
        <div class="selector-rango" role="group" aria-label="Cantidad de días">
          ${OPCIONES_DIAS_SEMANA.map((n) => `<button type="button" data-dias="${n}" title="Ver ${n} día${n === 1 ? '' : 's'}" class="${n === cantidadDias ? 'activo' : ''}">${n} día${n === 1 ? '' : 's'}</button>`).join('')}
        </div>
      </div>
      <div class="barra-semana-derecha">
        ${htmlLeyendaClima(filtroClima)}
        <div class="selector-rango" role="group" aria-label="Clima de fondo">
          <button type="button" id="boton-sol-semana" aria-pressed="${mostrarSol}" class="${mostrarSol ? 'activo' : ''}" title="Mostrar marcas de amanecer y atardecer (necesita una ubicación de clima en Configuraciones)">🌅 Sol</button>
          ${['temperatura', 'lluvia']
            .map((f) => `<button type="button" data-filtro-clima="${f}" aria-pressed="${f === filtroClima}" title="${f === filtroClima ? 'Quitar el' : 'Pintar el'} fondo por hora según ${ETIQUETAS_FILTRO_CLIMA[f].replace(/^\S+\s/, '').toLowerCase()}" class="${f === filtroClima ? 'activo' : ''}">${ETIQUETAS_FILTRO_CLIMA[f]}</button>`)
            .join('')}
        </div>
      </div>
    </div>
    <div class="navegacion-semana">
      <button type="button" data-paso="-1" aria-label="Días anteriores" title="Ver los días anteriores" ${offsetDias === 0 ? 'disabled' : ''}>‹</button>
      <span>${formatearFecha(dias[0])}${dias.length > 1 ? ` – ${formatearFecha(dias[dias.length - 1])}` : ''}</span>
      <button type="button" data-paso="1" aria-label="Días siguientes" title="Ver los días siguientes">›</button>
    </div>
    <div class="grilla-semana-contenedor">
      <div class="grilla-semana"></div>
    </div>
  `;

  contenedor.querySelectorAll('.selector-rango button[data-dias]').forEach((boton) => {
    boton.addEventListener('click', () => {
      guardarDiasSemana(Number(boton.dataset.dias));
      offsetDias = 0;
      renderVistaSemana(contenedor);
    });
  });
  contenedor.querySelectorAll('.navegacion-semana button').forEach((boton) => {
    boton.addEventListener('click', () => {
      offsetDias = Math.max(0, offsetDias + Number(boton.dataset.paso) * cantidadDias);
      renderVistaSemana(contenedor);
    });
  });
  contenedor.querySelector('#boton-sol-semana').addEventListener('click', () => {
    guardarMostrarSol(!mostrarSol);
    renderVistaSemana(contenedor);
  });
  contenedor.querySelectorAll('.selector-rango button[data-filtro-clima]').forEach((boton) => {
    boton.addEventListener('click', () => {
      // Temperatura y lluvia son excluyentes: tocar el activo lo apaga (queda «ninguno»), tocar el otro cambia.
      guardarFiltroClima(boton.dataset.filtroClima === filtroClima ? 'ninguno' : boton.dataset.filtroClima);
      renderVistaSemana(contenedor);
    });
  });

  const grilla = contenedor.querySelector('.grilla-semana');
  grilla.style.setProperty('--alto-hora', `${ALTO_HORA_PX}px`);
  grilla.style.setProperty('--dias-visibles', String(dias.length));
  grilla.appendChild(renderColumnaHoras());
  dias.forEach((fechaDia) => grilla.appendChild(renderColumnaDia(fechaDia, hoy)));
  actualizarLineaAhora();

  // Primero se dibuja la carga sin eventos (no espera a la red); cuando llega Calendar se agregan los eventos y se recalcula.
  pintarCargas(grilla, []);
  if (hayConexionGoogleCalendar()) {
    Promise.all([obtenerEventosParaMostrar(dias[0], dias[dias.length - 1]), obtenerEventos(dias[0], dias[dias.length - 1])])
      .then(([paraMostrar, ocupan]) => {
        if (!grilla.isConnected) return;
        pintarEventos(grilla, paraMostrar);
        pintarCargas(grilla, ocupan);
      })
      .catch((error) => console.warn(error.message));
  }

  // El ícono de clima por día se muestra siempre que haya ubicación configurada; "Sol" y el degradé son aparte.
  obtenerCoordenadasClima()
    .then((coordenadas) => (coordenadas ? obtenerPronosticoDiario(coordenadas.latitud, coordenadas.longitud) : null))
    .then((pronostico) => {
      if (!grilla.isConnected || !pronostico) return;
      pintarClima(grilla, dias, pronostico, { mostrarSol, filtroClima });
    })
    .catch((error) => console.warn(error.message));
}

/** Reposiciona (o, si hoy no está en el rango visible o cayó fuera de horario, esconde) la línea de "ahora". */
function actualizarLineaAhora() {
  if (!ultimoContenedor || !ultimoContenedor.isConnected) return;
  const columna = ultimoContenedor.querySelector('.dia-semana.es-hoy');
  const linea = columna?.querySelector('.linea-ahora');
  if (!linea) return;
  const ahora = new Date();
  const minutosDesdeInicio = (ahora.getHours() - HORA_INICIO) * 60 + ahora.getMinutes();
  const visible = minutosDesdeInicio >= 0 && minutosDesdeInicio < MINUTOS_VISIBLES;
  linea.hidden = !visible;
  if (visible) linea.style.top = `${(minutosDesdeInicio / 60) * ALTO_HORA_PX}px`;
}

// A nivel de módulo (como el resto de las preferencias de UI de esta vista): sigue viva mientras la pestaña esté
// abierta y no hace nada si la grilla no está montada.
setInterval(actualizarLineaAhora, 60000);

const MINUTOS_DEL_DIA = 24 * 60;

function inicioDeDia(dia) {
  return new Date(`${dia}T00:00:00`).getTime();
}

/** Los eventos de Calendar en cada columna: los de todo el día en la franja de arriba, los demás como bloques (solo lectura). */
function pintarEventos(grilla, eventos) {
  grilla.querySelectorAll('.dia-semana').forEach((columna) => {
    const dia = columna.dataset.dia;
    const inicioDia = inicioDeDia(dia);
    const finDia = inicioDia + MINUTOS_DEL_DIA * 60000;
    columna.querySelectorAll('.bloque-evento-semana').forEach((b) => b.remove());

    const delDia = eventos.filter((e) => new Date(e.inicio).getTime() < finDia && new Date(e.fin).getTime() > inicioDia);
    const todoElDia = delDia.filter((e) => e.todoElDia);
    const franja = columna.querySelector('.franja-todo-el-dia');
    franja.hidden = todoElDia.length === 0;
    franja.textContent = todoElDia.length === 1 ? `📅 ${todoElDia[0].resumen}` : `📅 ${todoElDia.length} eventos`;
    franja.title = todoElDia.map((e) => `${e.resumen} (${e.calendarioNombre})`).join('\n');

    // Los que se pisan entre sí se reparten en carriles lado a lado.
    const conHorario = delDia
      .filter((e) => !e.todoElDia)
      .map((e) => ({ e, desde: Math.max(inicioDia, new Date(e.inicio).getTime()), hasta: Math.min(finDia, new Date(e.fin).getTime()) }))
      .sort((a, b) => a.desde - b.desde);
    const carriles = [];
    conHorario.forEach((x) => {
      let carril = carriles.findIndex((finCarril) => finCarril <= x.desde);
      if (carril === -1) carril = carriles.length;
      carriles[carril] = x.hasta;
      x.carril = carril;
    });
    const cuerpo = columna.querySelector('.dia-semana-cuerpo');
    conHorario.forEach((x) => {
      const minutosDesde = (x.desde - inicioDia) / 60000 - HORA_INICIO * 60;
      const minutosHasta = (x.hasta - inicioDia) / 60000 - HORA_INICIO * 60;
      const top = Math.max(0, minutosDesde);
      const alto = Math.min(MINUTOS_VISIBLES, minutosHasta) - top;
      if (alto <= 0) return;
      const bloque = document.createElement('a');
      bloque.className = 'bloque-evento-semana' + (x.e.disponible ? ' disponible' : '');
      bloque.href = x.e.enlace || '#';
      bloque.target = '_blank';
      bloque.rel = 'noopener noreferrer';
      bloque.style.top = `${(top / 60) * ALTO_HORA_PX}px`;
      bloque.style.height = `${Math.max(14, (alto / 60) * ALTO_HORA_PX)}px`;
      bloque.style.left = `${(x.carril / carriles.length) * 100}%`;
      bloque.style.width = `${100 / carriles.length}%`;
      bloque.style.borderLeftColor = x.e.color;
      if (!x.e.disponible) bloque.style.background = hexARgba(x.e.color, 0.55);
      bloque.title = `${x.e.resumen} — ${formatearHora(x.e.inicio)} a ${formatearHora(x.e.fin)} (${x.e.calendarioNombre}${x.e.disponible ? ', disponible' : ''}). Se edita desde Google Calendar: hacé clic para abrirlo.`;
      bloque.innerHTML = `<span class="bloque-tarea-semana-nombre">${escaparHtml(x.e.resumen)}</span>`;
      bloque.addEventListener('click', (evento) => {
        if (!x.e.enlace) evento.preventDefault();
      });
      cuerpo.prepend(bloque);
    });
  });
}

/** La barra de carga de cada día: minutos planificados contra minutos disponibles (ver `capacidad.js`). */
function pintarCargas(grilla, eventosQueOcupan) {
  const preferencias = obtenerPreferencias();
  const calcular = crearCalculadoraCapacidad({ preferencias, eventos: eventosQueOcupan, tareas: estado.tareas });
  grilla.querySelectorAll('.dia-semana').forEach((columna) => {
    const dia = columna.dataset.dia;
    const c = calcular(dia);
    const boton = columna.querySelector('.carga-dia');
    boton.classList.toggle('sobrecarga', c.sobrecarga);
    boton.style.setProperty('--llenado', `${c.capacidad > 0 ? Math.min(100, Math.round((c.carga / c.capacidad) * 100)) : c.carga > 0 ? 100 : 0}%`);
    boton.textContent = `${c.carga}/${c.capacidad}`;
    boton.title =
      `Planificado ${c.carga} min de ${c.capacidad} min disponibles` +
      (c.fija ? ' (capacidad fijada por vos para este día)' : ` (tu tope es ${c.tope} min; según Calendar quedan ${c.libreCalendar} min libres)`) +
      (c.sobrecarga ? '. ⚠️ Hay más tareas que tiempo.' : '') +
      '. Tocá para ajustar la capacidad de este día.';
    boton.onclick = () => abrirCapacidadDelDia(dia, c);
  });
}

function abrirCapacidadDelDia(dia, c) {
  abrirDialogoFormulario({
    titulo: `⏱️ Capacidad del ${formatearFecha(dia)}`,
    textoGuardar: '💾 Guardar',
    cuerpoHtml: `
      <p class="ayuda ayuda-formulario">Planificado: <strong>${c.carga} min</strong>. Disponible: <strong>${c.capacidad} min</strong> (tu tope es ${c.tope} min y, según Calendar, quedan ${c.libreCalendar} min libres). Si ese día tenés más o menos tiempo que el habitual (un viaje, un día libre), indicalo acá.</p>
      <label class="campo ancho-completo" title="Vacío: se usa tu tope habitual y lo que diga Calendar. 0: ningún tiempo para tareas ese día."><span class="campo-titulo">⏱️ Minutos para tareas ese día</span><input type="number" name="minutos" min="0" step="15" value="${c.fija ? c.tope : ''}" placeholder="Automático" /></label>`,
    alGuardar: async (formulario) => {
      const valor = formulario.minutos.value.trim();
      await guardarCapacidadDeFecha(dia, valor === '' ? null : Number(valor));
      return true;
    },
  });
}

function renderColumnaHoras() {
  const columna = document.createElement('div');
  columna.className = 'columna-horas-semana';
  // Posición absoluta (no apiladas): con una franja que no arranca en una hora en punto (ej. 07:30) no hay
  // una etiqueta exactamente en el borde, así que cada una se ubica por su propio `top` en vez de asumir
  // que ocupa exactamente una fila de `ALTO_HORA_PX`.
  let html = `<div class="dia-semana-encabezado"></div><div class="horas-semana-cuerpo" style="height:${MINUTOS_VISIBLES / 60 * ALTO_HORA_PX}px">`;
  for (let hora = Math.ceil(HORA_INICIO); hora < HORA_FIN; hora += 1) {
    html += `<div class="etiqueta-hora-semana" style="top:${(hora - HORA_INICIO) * ALTO_HORA_PX}px">${String(hora).padStart(2, '0')}:00</div>`;
  }
  html += '</div>';
  columna.innerHTML = html;
  return columna;
}

function renderColumnaDia(fechaDia, hoy) {
  const columna = document.createElement('div');
  columna.className = 'dia-semana' + (fechaDia === hoy ? ' es-hoy' : '');
  columna.dataset.dia = fechaDia;
  const fechaObj = new Date(fechaDia + 'T00:00:00');
  const nombreDia = fechaDia === hoy ? 'Hoy' : NOMBRES_DIA[fechaObj.getDay()];

  columna.innerHTML = `
    <div class="dia-semana-encabezado">
      <div class="nombre-dia-clic" role="link" tabindex="0" title="Ver este día en la Agenda">${nombreDia}<br /><span class="fecha-columna">${formatearFecha(fechaDia)}</span></div>
      <button type="button" class="carga-dia" aria-label="Carga del día"></button>
      <div class="franja-todo-el-dia" hidden></div>
    </div>
    <div class="dia-semana-cuerpo" style="height:${(HORA_FIN - HORA_INICIO) * ALTO_HORA_PX}px">
      ${fechaDia === hoy ? '<div class="linea-ahora" hidden><span class="linea-ahora-punto"></span></div>' : ''}
    </div>
  `;

  const cuerpo = columna.querySelector('.dia-semana-cuerpo');

  // Horas fuera de los bloques disponibles de ese día de la semana (v0.105.0): sombreadas, sin interacción.
  tramosFueraDeBloques(BLOQUES_SEMANA[fechaObj.getDay()], HORA_INICIO * 60, HORA_FIN * 60).forEach(([desdeMin, hastaMin]) => {
    const fuera = document.createElement('div');
    fuera.className = 'fuera-de-bloque';
    fuera.style.top = `${((desdeMin - HORA_INICIO * 60) / 60) * ALTO_HORA_PX}px`;
    fuera.style.height = `${((hastaMin - desdeMin) / 60) * ALTO_HORA_PX}px`;
    fuera.title = 'Fuera de tus horarios disponibles (Configuraciones → Horarios disponibles)';
    cuerpo.appendChild(fuera);
  });

  // v0.100.0: tocar el nombre del día lleva a la Agenda, desplazada hasta ese día.
  const nombreClic = columna.querySelector('.nombre-dia-clic');
  const irALaAgenda = () => {
    pedirEnfocarDiaAgenda(fechaDia);
    location.hash = '#/agenda';
  };
  nombreClic.addEventListener('click', irALaAgenda);
  nombreClic.addEventListener('keydown', (evento) => {
    if (evento.key === 'Enter' || evento.key === ' ') {
      evento.preventDefault();
      irALaAgenda();
    }
  });

  const pendientesActivas = estado.tareas.filter((t) => t.tarea_estado !== 'completada');

  const fijas = pendientesActivas.filter(
    (t) => tieneHora(t.tarea_fecha_sugerida) && diaLocal(t.tarea_fecha_sugerida) === fechaDia
  );
  fijas.forEach((tarea) => {
    const fecha = new Date(tarea.tarea_fecha_sugerida);
    const minutosDesdeInicio = (fecha.getHours() - HORA_INICIO) * 60 + fecha.getMinutes();
    cuerpo.appendChild(renderBloqueTarea(tarea, minutosDesdeInicio, tarea.tarea_duracion_min || 30, false, fechaDia));
  });

  // Las bloqueadas se ven igual que las pendientes (atenuadas, con 🔒): una cadena queda junta (`ordenarConCadenas`).
  const proyectadasSinOrden = pendientesActivas
    .filter((t) => !tieneHora(t.tarea_fecha_sugerida) && esProyectable(t))
    .filter((t) => fechaDeReferenciaProyectada(t) === fechaDia)
    .sort((a, b) => compararPorPrioridad(a, b, estado.categorias));
  const proyectadas = ordenarConCadenas(proyectadasSinOrden);

  let cursorMinutos = 0;
  proyectadas.forEach((tarea) => {
    const duracion = tarea.tarea_duracion_min || 30;
    cuerpo.appendChild(renderBloqueTarea(tarea, cursorMinutos, duracion, true, fechaDia));
    cursorMinutos += duracion;
  });

  if (fijas.length === 0 && proyectadas.length === 0) {
    cuerpo.insertAdjacentHTML('beforeend', '<p class="mensaje-vacio-semana">Sin tareas</p>');
  }

  return columna;
}

function renderBloqueTarea(tarea, minutosDesdeInicio, duracionMin, proyectada, fechaDia) {
  const categoria = estado.categorias.find((c) => c.categoria_id === tarea.categoria_id);
  const color = categoria?.categoria_color ?? '#9ca3af';
  const bloqueada = tarea.tarea_estado === 'bloqueada';

  const offsetMin = Math.max(0, Math.min(minutosDesdeInicio, MINUTOS_VISIBLES));
  const alturaMin = Math.max(15, Math.min(duracionMin, MINUTOS_VISIBLES - offsetMin || duracionMin));

  const bloque = document.createElement('div');
  bloque.className =
    'bloque-tarea-semana' + (proyectada ? ' proyectada' : '') + (bloqueada ? ' bloqueada' : '') + (duracionMin <= 15 ? ' corto' : '');
  bloque.style.top = `${(offsetMin / 60) * ALTO_HORA_PX}px`;
  bloque.style.height = `${(alturaMin / 60) * ALTO_HORA_PX}px`;
  bloque.style.borderColor = color;
  bloque.style.background = proyectada ? 'transparent' : color;
  bloque.innerHTML = `<span class="bloque-tarea-semana-nombre">${bloqueada ? '🔒 ' : ''}${fechaFijaVigente(tarea) ? '📌 ' : ''}${escaparHtml(tarea.tarea_nombre)}</span>`;
  bloque.title = `${bloqueada ? 'Bloqueada: ' : ''}${fechaFijaVigente(tarea) ? 'Horario fijado: ' : ''}${tarea.tarea_nombre} (${duracionMin} min)`;

  bloque.addEventListener('click', () => {
    abrirEdicionTarea(tarea.tarea_id);
  });

  agregarAsasArrastre(bloque, tarea, fechaDia, offsetMin, alturaMin, proyectada);

  return bloque;
}

function agregarAsa(bloque, posicion) {
  const asa = document.createElement('div');
  asa.className = `asa-arrastre ${posicion}`;
  asa.addEventListener('click', (evento) => evento.stopPropagation());
  bloque.appendChild(asa);
  return asa;
}

function minutosAHoraHHMM(minutosDesdeInicio) {
  const totalMin = HORA_INICIO * 60 + minutosDesdeInicio;
  const horas = Math.floor(totalMin / 60);
  const minutos = totalMin % 60;
  return `${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')}`;
}

function agregarAsasArrastre(bloque, tarea, fechaDia, offsetMinInicial, alturaMinInicial, proyectada) {
  const asaSuperior = agregarAsa(bloque, 'superior');
  const asaInferior = agregarAsa(bloque, 'inferior');

  function iniciarArrastre(asa, esSuperior) {
    asa.addEventListener('pointerdown', (evento) => {
      evento.stopPropagation();
      evento.preventDefault();
      asa.setPointerCapture(evento.pointerId);

      const yInicial = evento.clientY;
      const topInicial = offsetMinInicial;
      const alturaInicial = alturaMinInicial;
      const finalFijo = topInicial + alturaInicial;

      function onMove(eventoMove) {
        const deltaPx = eventoMove.clientY - yInicial;
        const deltaMinCrudo = (deltaPx / ALTO_HORA_PX) * 60;
        const deltaMin = Math.round(deltaMinCrudo / 15) * 15;

        let nuevoTop = topInicial;
        let nuevaAltura = alturaInicial;

        if (esSuperior) {
          nuevoTop = Math.max(0, Math.min(topInicial + deltaMin, finalFijo - 15));
          nuevaAltura = finalFijo - nuevoTop;
        } else {
          nuevaAltura = Math.max(15, Math.min(alturaInicial + deltaMin, MINUTOS_VISIBLES - topInicial));
        }

        bloque.style.top = `${(nuevoTop / 60) * ALTO_HORA_PX}px`;
        bloque.style.height = `${(nuevaAltura / 60) * ALTO_HORA_PX}px`;
        bloque.dataset.topPendiente = String(nuevoTop);
        bloque.dataset.alturaPendiente = String(nuevaAltura);
      }

      async function onUp(eventoUp) {
        asa.releasePointerCapture(eventoUp.pointerId);
        asa.removeEventListener('pointermove', onMove);
        asa.removeEventListener('pointerup', onUp);

        const nuevoTop = bloque.dataset.topPendiente != null ? Number(bloque.dataset.topPendiente) : topInicial;
        const nuevaAltura = bloque.dataset.alturaPendiente != null ? Number(bloque.dataset.alturaPendiente) : alturaInicial;
        delete bloque.dataset.topPendiente;
        delete bloque.dataset.alturaPendiente;

        if (esSuperior || proyectada) {
          tarea.tarea_fecha_sugerida = combinarFechaYHora(fechaDia, minutosAHoraHHMM(nuevoTop));
        }
        tarea.tarea_duracion_min = nuevaAltura;
        await persistirYNotificar();
      }

      asa.addEventListener('pointermove', onMove);
      asa.addEventListener('pointerup', onUp);
    });
  }

  iniciarArrastre(asaSuperior, true);
  iniciarArrastre(asaInferior, false);
}
