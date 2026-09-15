import { estado, persistirYNotificar } from '../assets/js/almacenamiento.js';
import {
  hoyISO,
  fechaISOMasDias,
  formatearFecha,
  noPuedeEmpezarTodavia,
  escaparHtml,
  combinarFechaYHora,
} from '../assets/js/utilidades.js';
import { tareaEstaBloqueada, compararPorPrioridad } from '../assets/js/tareas-logica.js';
import { abrirEdicionAlEntrar } from './tareas.view.js';

const NOMBRES_DIA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

const HORA_INICIO = 7;
const HORA_FIN = 23;
const ALTO_HORA_PX = 48;
const MINUTOS_VISIBLES = (HORA_FIN - HORA_INICIO) * 60;

function fechaDeReferenciaProyectada(tarea) {
  return tarea.fecha_sugerida || tarea.fecha_limite || null;
}

function esAccionable(tarea) {
  if (tarea.estado === 'completada') return false;
  if (noPuedeEmpezarTodavia(tarea.fecha_inicio_posible)) return false;
  return !tareaEstaBloqueada(tarea, estado.tareas).bloqueada;
}

export function renderVistaSemana(contenedor) {
  const hoy = hoyISO();
  const dias = Array.from({ length: 7 }, (_, i) => fechaISOMasDias(i, hoy));

  contenedor.innerHTML = `
    <h2>Semana</h2>
    <p class="ayuda">Tareas fijas (con horario agendado) y proyección de las pendientes según su fecha sugerida o límite. Hacé clic en una tarea para editarla.</p>
    <div class="grilla-semana-contenedor">
      <div class="grilla-semana"></div>
    </div>
  `;

  const grilla = contenedor.querySelector('.grilla-semana');
  grilla.style.setProperty('--alto-hora', `${ALTO_HORA_PX}px`);
  grilla.appendChild(renderColumnaHoras());
  dias.forEach((fechaDia) => grilla.appendChild(renderColumnaDia(fechaDia, hoy)));
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
  const fechaObj = new Date(fechaDia + 'T00:00:00');
  const nombreDia = fechaDia === hoy ? 'Hoy' : NOMBRES_DIA[fechaObj.getDay()];

  columna.innerHTML = `
    <div class="dia-semana-encabezado">${nombreDia}<br /><span class="fecha-columna">${formatearFecha(fechaDia)}</span></div>
    <div class="dia-semana-cuerpo" style="height:${(HORA_FIN - HORA_INICIO) * ALTO_HORA_PX}px"></div>
  `;

  const cuerpo = columna.querySelector('.dia-semana-cuerpo');

  const pendientesActivas = estado.tareas.filter((t) => t.estado !== 'completada');

  const fijas = pendientesActivas.filter(
    (t) => t.fecha_hora_agendada && t.fecha_hora_agendada.slice(0, 10) === fechaDia
  );
  fijas.forEach((tarea) => {
    const fecha = new Date(tarea.fecha_hora_agendada);
    const minutosDesdeInicio = (fecha.getHours() - HORA_INICIO) * 60 + fecha.getMinutes();
    cuerpo.appendChild(renderBloqueTarea(tarea, minutosDesdeInicio, tarea.duracion_estimada_min || 30, false, fechaDia));
  });

  const proyectadas = pendientesActivas
    .filter((t) => !t.fecha_hora_agendada && esAccionable(t))
    .filter((t) => fechaDeReferenciaProyectada(t) === fechaDia)
    .sort((a, b) => compararPorPrioridad(a, b, estado.categorias));

  let cursorMinutos = 0;
  proyectadas.forEach((tarea) => {
    const duracion = tarea.duracion_estimada_min || 30;
    cuerpo.appendChild(renderBloqueTarea(tarea, cursorMinutos, duracion, true, fechaDia));
    cursorMinutos += duracion;
  });

  if (fijas.length === 0 && proyectadas.length === 0) {
    cuerpo.insertAdjacentHTML('beforeend', '<p class="mensaje-vacio-semana">Sin tareas</p>');
  }

  return columna;
}

function renderBloqueTarea(tarea, minutosDesdeInicio, duracionMin, proyectada, fechaDia) {
  const categoria = estado.categorias.find((c) => c.id === tarea.categoria_id);
  const subcategoria = estado.subcategorias.find((s) => s.id === tarea.subcategoria_id);
  const color = subcategoria?.color ?? categoria?.color ?? '#9ca3af';

  const offsetMin = Math.max(0, Math.min(minutosDesdeInicio, MINUTOS_VISIBLES));
  const alturaMin = Math.max(15, Math.min(duracionMin, MINUTOS_VISIBLES - offsetMin || duracionMin));

  const bloque = document.createElement('div');
  bloque.className = 'bloque-tarea-semana' + (proyectada ? ' proyectada' : '');
  bloque.style.top = `${(offsetMin / 60) * ALTO_HORA_PX}px`;
  bloque.style.height = `${(alturaMin / 60) * ALTO_HORA_PX}px`;
  bloque.style.borderColor = color;
  bloque.style.background = proyectada ? 'transparent' : color;
  bloque.innerHTML = `<span class="bloque-tarea-semana-nombre">${escaparHtml(tarea.nombre)}</span>`;
  bloque.title = `${tarea.nombre} (${duracionMin} min)`;

  bloque.addEventListener('click', () => {
    abrirEdicionAlEntrar(tarea.id);
    location.hash = '#/tareas';
  });

  if (!proyectada) {
    agregarAsasArrastre(bloque, tarea, fechaDia, offsetMin, alturaMin);
  }

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

function agregarAsasArrastre(bloque, tarea, fechaDia, offsetMinInicial, alturaMinInicial) {
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

        if (esSuperior) {
          tarea.fecha_hora_agendada = combinarFechaYHora(fechaDia, minutosAHoraHHMM(nuevoTop));
        }
        tarea.duracion_estimada_min = nuevaAltura;
        await persistirYNotificar();
      }

      asa.addEventListener('pointermove', onMove);
      asa.addEventListener('pointerup', onUp);
    });
  }

  iniciarArrastre(asaSuperior, true);
  iniciarArrastre(asaInferior, false);
}
