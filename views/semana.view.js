import { estado, persistirYNotificar } from '../assets/js/almacenamiento.js';
import { hoyISO, diaLocal, fechaISOMasDias, formatearFecha, formatearHora, escaparHtml, combinarFechaYHora, tieneHora } from '../assets/js/utilidades.js';
import { esTareaAccionable, compararPorPrioridad, ordenarConCadenas } from '../assets/js/tareas-logica.js';
import { abrirEdicionTarea } from '../assets/js/modal-tarea.js';
import { abrirDialogoFormulario } from '../assets/js/dialogo-formulario.js';
import { obtenerPreferencias, guardarCapacidadDeFecha } from '../assets/js/preferencias.js';
import { crearCalculadoraCapacidad } from '../assets/js/capacidad.js';
import { hayConexionGoogleCalendar, obtenerEventos, obtenerEventosParaMostrar } from '../assets/js/google-calendar.js';
import { OPCIONES_DIAS_SEMANA, leerDiasSemana, guardarDiasSemana } from '../assets/js/vista-semana-preferencias.js';

const NOMBRES_DIA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

const HORA_INICIO = 7;
const HORA_FIN = 23;
const ALTO_HORA_PX = 48;
const MINUTOS_VISIBLES = (HORA_FIN - HORA_INICIO) * 60;

function fechaDeReferenciaProyectada(tarea) {
  const fecha = tarea.tarea_fecha_sugerida || tarea.tarea_fecha_limite || null;
  return fecha ? diaLocal(fecha) : null;
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
  const hoy = hoyISO();
  const cantidadDias = leerDiasSemana();
  offsetDias = Math.max(0, offsetDias);
  const dias = Array.from({ length: cantidadDias }, (_, i) => fechaISOMasDias(offsetDias + i, hoy));

  contenedor.innerHTML = `
    <h2>📆 Semana</h2>
    <p class="ayuda">Tareas fijas (con horario agendado), proyección de las pendientes y bloqueadas 🔒 según su fecha sugerida o límite y, en gris, tus eventos de Google Calendar (se editan desde Calendar). Debajo de cada día, cuánto tiempo llevás planificado contra el disponible: tocalo para ajustar la capacidad de ese día. Hacé clic en una tarea para editarla.</p>
    <div class="selector-rango" role="group" aria-label="Cantidad de días">
      ${OPCIONES_DIAS_SEMANA.map((n) => `<button type="button" data-dias="${n}" title="Ver ${n} día${n === 1 ? '' : 's'}" class="${n === cantidadDias ? 'activo' : ''}">${n} día${n === 1 ? '' : 's'}</button>`).join('')}
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

  contenedor.querySelectorAll('.selector-rango button').forEach((boton) => {
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
  let html = '<div class="dia-semana-encabezado"></div>';
  for (let hora = HORA_INICIO; hora < HORA_FIN; hora += 1) {
    html += `<div class="etiqueta-hora-semana">${String(hora).padStart(2, '0')}:00</div>`;
  }
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
      <div>${nombreDia}<br /><span class="fecha-columna">${formatearFecha(fechaDia)}</span></div>
      <button type="button" class="carga-dia" aria-label="Carga del día"></button>
      <div class="franja-todo-el-dia" hidden></div>
    </div>
    <div class="dia-semana-cuerpo" style="height:${(HORA_FIN - HORA_INICIO) * ALTO_HORA_PX}px">
      ${fechaDia === hoy ? '<div class="linea-ahora" hidden><span class="linea-ahora-punto"></span></div>' : ''}
    </div>
  `;

  const cuerpo = columna.querySelector('.dia-semana-cuerpo');

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
  bloque.className = 'bloque-tarea-semana' + (proyectada ? ' proyectada' : '') + (bloqueada ? ' bloqueada' : '');
  bloque.style.top = `${(offsetMin / 60) * ALTO_HORA_PX}px`;
  bloque.style.height = `${(alturaMin / 60) * ALTO_HORA_PX}px`;
  bloque.style.borderColor = color;
  bloque.style.background = proyectada ? 'transparent' : color;
  bloque.innerHTML = `<span class="bloque-tarea-semana-nombre">${bloqueada ? '🔒 ' : ''}${escaparHtml(tarea.tarea_nombre)}</span>`;
  bloque.title = `${bloqueada ? 'Bloqueada: ' : ''}${tarea.tarea_nombre} (${duracionMin} min)`;

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
