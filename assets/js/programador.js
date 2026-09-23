// Programación automática: a las tareas activas sin `tarea_fecha_sugerida` (y sin ser de mantenimiento, que tienen
// su propio ritmo) les asigna un día y una hora reales, respetando el tope de minutos por día, lo ocupado en Google
// Calendar (si está conectado) y las cadenas de dependencia. Se llama una sola vez por sesión desde `app.js`
// (`reprogramarSiCorresponde`), igual que `reprogramarFechasSugeridasVencidas` ya hace con las vencidas.

import { diaLocal, hoyISO, fechaISOMasDias, tieneHora } from './utilidades.js';
import { obtenerPreferencias } from './preferencias.js';
import { crearCalculadoraCapacidad } from './capacidad.js';
import { hayConexionGoogleCalendar, obtenerEventosDelHorizonte, diasHorizonteCalendar, buscarHuecoLibre } from './google-calendar.js';
import { habilitadaReal } from './gantt-modelo.js';

function maximo(...dias) {
  return dias.filter(Boolean).sort().pop();
}

/**
 * Asigna `tarea_fecha_sugerida` (día y hora reales) a toda tarea activa que no tenga una: primero un día con
 * capacidad libre (`crearCalculadoraCapacidad`, desde hoy o desde que la cadena lo permite), después un hueco
 * horario real dentro de ese día (`buscarHuecoLibre`) que no choque con Calendar ni con otras tareas ya asignadas.
 * Sin conexión con Calendar, solo mira el tope de minutos (sin buscar eventos). Devuelve las tareas programadas.
 */
export async function programarTareasSinFecha(estado) {
  const todas = estado.tareas || [];
  const candidatas = todas.filter((t) => t.tarea_estado !== 'completada' && !t.tarea_fecha_sugerida && !t.tarea_mantenimiento);
  if (candidatas.length === 0) return [];

  const preferencias = obtenerPreferencias();
  const hoy = hoyISO();
  const ahora = new Date();
  const conCalendar = hayConexionGoogleCalendar();
  const horizonteDias = diasHorizonteCalendar();
  let eventosCalendar = [];
  if (conCalendar) {
    try {
      eventosCalendar = await obtenerEventosDelHorizonte();
    } catch {
      // Sin eventos (por ejemplo, falla momentánea de red): se programa igual, solo con el tope de minutos.
      eventosCalendar = [];
    }
  }

  const porId = new Map(todas.map((t) => [t.tarea_id, t]));
  const calcularCapacidad = crearCalculadoraCapacidad({ preferencias, eventos: eventosCalendar, tareas: todas, hoy, ahora });

  // `crearCalculadoraCapacidad` calcula la carga de cada día una sola vez, con una foto de `estado.tareas` de antes
  // de esta pasada: no se entera de las tareas que esta misma función va asignando. Por eso la carga por día se
  // acumula acá aparte, arrancando del valor que dio la calculadora la primera vez que se consulta ese día.
  const cargaAcumulada = new Map();
  const restanteDelDia = (dia) => {
    const cap = calcularCapacidad(dia);
    const usados = cargaAcumulada.has(dia) ? cargaAcumulada.get(dia) : cap.carga;
    return Math.max(0, cap.capacidad - usados);
  };
  const marcarUso = (dia, minutos) => {
    cargaAcumulada.set(dia, (cargaAcumulada.has(dia) ? cargaAcumulada.get(dia) : calcularCapacidad(dia).carga) + minutos);
  };

  // Horarios ya ocupados por otras tareas ese día (las que ya tenían hora, más las que se van asignando en esta
  // pasada): para que la búsqueda de hueco horario tampoco haga chocar dos tareas de STDL entre sí.
  const horariosPorDia = new Map();
  const agregarHorario = (dia, inicioISO, duracionMin) => {
    const inicio = new Date(inicioISO).getTime();
    const fin = inicio + (duracionMin || 30) * 60000;
    horariosPorDia.set(dia, [...(horariosPorDia.get(dia) || []), { inicio: new Date(inicio).toISOString(), fin: new Date(fin).toISOString() }]);
  };
  todas
    .filter((t) => t.tarea_estado !== 'completada' && tieneHora(t.tarea_fecha_sugerida))
    .forEach((t) => agregarHorario(diaLocal(t.tarea_fecha_sugerida), t.tarea_fecha_sugerida, t.tarea_duracion_min));

  const asignadas = [];
  const enCurso = new Set();

  function diaMinimoDe(tarea) {
    let dm = hoy;
    const habilitada = habilitadaReal(tarea);
    if (habilitada) dm = maximo(dm, habilitada);
    const previa = tarea.tarea_dependiente ? porId.get(tarea.tarea_dependiente) : null;
    if (!previa) return dm;
    if (previa.tarea_estado !== 'completada' && !previa.tarea_fecha_sugerida && !previa.tarea_mantenimiento) programarUna(previa);
    if (previa.tarea_fecha_sugerida) dm = maximo(dm, fechaISOMasDias(1, diaLocal(previa.tarea_fecha_sugerida)));
    return dm;
  }

  function programarUna(tarea) {
    if (tarea.tarea_fecha_sugerida || enCurso.has(tarea.tarea_id)) return;
    enCurso.add(tarea.tarea_id);

    const diaMinimo = diaMinimoDe(tarea);
    const diasHabiles = tarea.tarea_dias_habiles || [];
    const duracion = tarea.tarea_duracion_min || 30;

    let diaElegido = null;
    for (let i = 0; i < horizonteDias; i += 1) {
      const candidato = fechaISOMasDias(i, diaMinimo);
      if (diasHabiles.length > 0 && !diasHabiles.includes(new Date(`${candidato}T00:00:00`).getDay())) continue;
      if (restanteDelDia(candidato) >= duracion) {
        diaElegido = candidato;
        break;
      }
    }
    if (!diaElegido) return; // No entra en el horizonte configurado: queda sin programar por ahora.

    const eventosDelDia = [...(conCalendar ? eventosCalendar.filter((e) => diaLocal(e.inicio) === diaElegido) : []), ...(horariosPorDia.get(diaElegido) || [])];
    const desde = diaElegido === hoy && ahora > new Date(`${diaElegido}T00:00:00`) ? ahora : new Date(`${diaElegido}T00:00:00`);
    const hueco = buscarHuecoLibre(eventosDelDia, duracion, { desde, dias: 1, franja: preferencias.pref_franja, diasHabiles });
    if (!hueco) return; // El día tenía minutos libres pero no un hueco contiguo: queda sin programar por ahora.

    tarea.tarea_fecha_sugerida = hueco;
    marcarUso(diaElegido, duracion);
    agregarHorario(diaElegido, hueco, duracion);
    asignadas.push(tarea);
  }

  candidatas.forEach(programarUna);
  return asignadas;
}
