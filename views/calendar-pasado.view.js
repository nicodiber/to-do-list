// Solapa «Calendar» de Estadísticas (v0.104.0): lo que realmente pasó en tu Google Calendar en los últimos días (eventos que
// ocuparon tiempo), no solo lo planificado en STDL. Se lee con la misma conexión de solo lectura de siempre; nada se guarda.

import { estado } from '../assets/js/almacenamiento.js';
import { hayConexionGoogleCalendar, obtenerEventosPasados } from '../assets/js/google-calendar.js';
import { hoyISO, fechaISOMasDias, formatearFecha, escaparHtml, diaLocal } from '../assets/js/utilidades.js';

const OPCIONES = [7, 30, 90];
let dias = 30;
const NOMBRES_DIA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function horas(minutos) {
  const h = minutos / 60;
  return h >= 10 ? `${Math.round(h)} h` : `${h.toFixed(1).replace('.0', '')} h`;
}

/** Minutos de `evento` que caen dentro de `[desdeMs, hastaMs)`. */
function minutosEn(evento, desdeMs, hastaMs) {
  const inicio = Math.max(new Date(evento.inicio).getTime(), desdeMs);
  const fin = Math.min(new Date(evento.fin).getTime(), hastaMs);
  return Math.max(0, (fin - inicio) / 60000);
}

function lunesDe(iso) {
  const fecha = new Date(`${iso}T00:00:00`);
  return fechaISOMasDias(-((fecha.getDay() + 6) % 7), iso);
}

export async function renderVistaCalendarPasado(contenedor) {
  if (!hayConexionGoogleCalendar()) {
    contenedor.innerHTML = '<p class="mensaje-vacio">Esta solapa necesita la conexión con Google Calendar (iniciá sesión con Google y concedé el permiso de Calendar).</p>';
    return;
  }
  contenedor.innerHTML = `
    <div class="selector-rango" role="group" aria-label="Período">
      ${OPCIONES.map((n) => `<button type="button" data-dias="${n}" class="${n === dias ? 'activo' : ''}" title="Últimos ${n} días">${n} días</button>`).join('')}
    </div>
    <p class="ayuda">Eventos de tu Google Calendar que ocuparon tiempo (según lo que elegiste ignorar en Configuraciones), sin los de todo el día. Cargando…</p>
    <div class="cuerpo-calendar-pasado"></div>`;
  contenedor.querySelectorAll('.selector-rango button').forEach((boton) =>
    boton.addEventListener('click', () => {
      dias = Number(boton.dataset.dias);
      renderVistaCalendarPasado(contenedor);
    })
  );
  const cuerpo = contenedor.querySelector('.cuerpo-calendar-pasado');
  const ayuda = contenedor.querySelector('.ayuda');

  let eventos;
  try {
    eventos = await obtenerEventosPasados(dias);
  } catch {
    ayuda.textContent = 'No se pudieron leer los eventos de Google Calendar ahora. Probá de nuevo en un rato.';
    return;
  }
  if (!cuerpo.isConnected) return;
  ayuda.textContent = `Eventos de tu Google Calendar que ocuparon tiempo en los últimos ${dias} días (según lo que elegiste ignorar en Configuraciones), sin los de todo el día.`;

  const hoy = hoyISO();
  const desde = fechaISOMasDias(-(dias - 1), hoy);
  const desdeMs = new Date(`${desde}T00:00:00`).getTime();
  const hastaMs = Math.min(Date.now(), new Date(`${fechaISOMasDias(1, hoy)}T00:00:00`).getTime());
  const conTiempo = eventos.map((e) => ({ evento: e, minutos: minutosEn(e, desdeMs, hastaMs) })).filter((x) => x.minutos > 0);
  const totalMin = conTiempo.reduce((s, x) => s + x.minutos, 0);

  if (conTiempo.length === 0) {
    cuerpo.innerHTML = '<p class="mensaje-vacio">No hay eventos con horario en ese período.</p>';
    return;
  }

  // Por calendario.
  const porCalendario = new Map();
  conTiempo.forEach(({ evento, minutos }) => {
    const actual = porCalendario.get(evento.calendarioNombre) || { minutos: 0, cantidad: 0, color: evento.color };
    actual.minutos += minutos;
    actual.cantidad += 1;
    porCalendario.set(evento.calendarioNombre, actual);
  });
  const filasCalendario = [...porCalendario.entries()].sort((a, b) => b[1].minutos - a[1].minutos);
  const maxCalendario = Math.max(...filasCalendario.map(([, v]) => v.minutos));

  // Por semana (lunes a domingo).
  const porSemana = new Map();
  conTiempo.forEach(({ evento, minutos }) => {
    const lunes = lunesDe(diaLocal(evento.inicio) < desde ? desde : diaLocal(evento.inicio));
    porSemana.set(lunes, (porSemana.get(lunes) || 0) + minutos);
  });
  const semanas = [...porSemana.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const maxSemana = Math.max(...semanas.map(([, m]) => m));

  // Por día de la semana: promedio de horas por día (contando todos los días del período que caen en ese día).
  const minPorDiaSemana = Array(7).fill(0);
  const cantidadDiasSemana = Array(7).fill(0);
  for (let i = 0; i < dias; i += 1) cantidadDiasSemana[new Date(`${fechaISOMasDias(i, desde)}T00:00:00`).getDay()] += 1;
  conTiempo.forEach(({ evento, minutos }) => {
    minPorDiaSemana[new Date(evento.inicio).getDay()] += minutos;
  });
  const promedios = minPorDiaSemana.map((m, i) => (cantidadDiasSemana[i] > 0 ? m / cantidadDiasSemana[i] : 0));
  const maxPromedio = Math.max(1, ...promedios);

  // Comparación con lo que se cumplió en STDL en el mismo período.
  const cumplidas = estado.tareas.filter((t) => t.tarea_estado === 'completada' && t.tarea_fecha_fin && diaLocal(t.tarea_fecha_fin) >= desde);
  const minTareas = cumplidas.reduce((s, t) => s + (t.tarea_duracion_min || 0), 0);

  cuerpo.innerHTML = `
    <section>
      <h3>📅 Resumen</h3>
      <p><strong>${conTiempo.length}</strong> evento${conTiempo.length === 1 ? '' : 's'} · <strong>${horas(totalMin)}</strong> ocupadas en total · promedio <strong>${horas(totalMin / dias)}</strong> por día.</p>
      <p class="ayuda">En el mismo período cumpliste <strong>${cumplidas.length}</strong> tarea${cumplidas.length === 1 ? '' : 's'} de STDL (<strong>${horas(minTareas)}</strong> según su duración estimada).</p>
    </section>
    <section>
      <h3>🗓️ Por calendario</h3>
      <ul class="barras-calendar-pasado">
        ${filasCalendario
          .map(
            ([nombre, v]) => `<li><span class="barra-calendar-etiqueta"><span class="punto-calendario" style="background:${escaparHtml(v.color)}"></span>${escaparHtml(nombre)}</span><span class="barra-calendar" style="width:${(v.minutos / maxCalendario) * 100}%;background:${escaparHtml(v.color)}"></span><span class="barra-calendar-valor">${horas(v.minutos)} · ${v.cantidad}</span></li>`
          )
          .join('')}
      </ul>
    </section>
    <section>
      <h3>📆 Por semana</h3>
      <ul class="barras-calendar-pasado">
        ${semanas
          .map(([lunes, m]) => `<li><span class="barra-calendar-etiqueta">${formatearFecha(lunes)}</span><span class="barra-calendar" style="width:${(m / maxSemana) * 100}%"></span><span class="barra-calendar-valor">${horas(m)}</span></li>`)
          .join('')}
      </ul>
      <p class="ayuda">Cada fila es una semana (de lunes a domingo), rotulada con su primer día.</p>
    </section>
    <section>
      <h3>🧭 Promedio por día de la semana</h3>
      <ul class="barras-calendar-pasado">
        ${[1, 2, 3, 4, 5, 6, 0]
          .map((d) => `<li><span class="barra-calendar-etiqueta">${NOMBRES_DIA[d]}</span><span class="barra-calendar" style="width:${(promedios[d] / maxPromedio) * 100}%"></span><span class="barra-calendar-valor">${horas(promedios[d])}</span></li>`)
          .join('')}
      </ul>
    </section>`;
}
