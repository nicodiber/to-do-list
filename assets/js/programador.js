// Programación automática: a las tareas activas sin `tarea_fecha_sugerida` (y sin ser de mantenimiento, que tienen
// su propio ritmo) les asigna un día y una hora reales, respetando el tope de minutos por día, lo ocupado en Google
// Calendar (si está conectado) y las cadenas de dependencia. `programarTareasSinFecha`/`reubicarTareasSolapadas`
// se llaman una sola vez por sesión desde `app.js` (`reprogramarSiCorresponde`), igual que
// `reprogramarFechasSugeridasVencidas` ya hace con las vencidas; `reprogramarTareaInmediataSiVencio` además se
// repite cada 1-2 minutos mientras la app sigue abierta (ver `app.js`).

import { diaLocal, hoyISO, fechaISOMasDias, tieneHora, diasEntreFechas } from './utilidades.js';
import { obtenerPreferencias } from './preferencias.js';
import { crearCalculadoraCapacidad } from './capacidad.js';
import { hayConexionGoogleCalendar, obtenerEventosDelHorizonte, diasHorizonteCalendar, buscarHuecoLibre, calcularSolapamiento } from './google-calendar.js';
import { habilitadaReal } from './gantt-modelo.js';
import { reprogramarTareaConCascada } from './tareas-logica.js';

/** ¿`fechaISO` pasa (o iguala) `limiteISO`? Con hora, compara el instante exacto; sin hora, el día calendario
 * (mismo criterio que ya usaba la app). `false` sin límite cargado. */
function superaLimite(fechaISO, limiteISO) {
  if (!limiteISO) return false;
  if (tieneHora(limiteISO)) return new Date(fechaISO).getTime() > new Date(limiteISO).getTime();
  return diaLocal(fechaISO) > limiteISO;
}

function maximo(...dias) {
  return dias.filter(Boolean).sort().pop();
}

/**
 * Asigna `tarea_fecha_sugerida` (día y hora reales) a toda tarea activa que no tenga una: primero un día con
 * capacidad libre (`crearCalculadoraCapacidad`, desde hoy o desde que la cadena lo permite), después un hueco
 * horario real dentro de ese día (`buscarHuecoLibre`) que no choque con Calendar ni con otras tareas ya asignadas.
 * Sin conexión con Calendar, solo mira el tope de minutos (sin buscar eventos). Devuelve `{ asignadas, sinHueco }`
 * — `sinHueco` son las que no encontraron día antes de su horizonte o de su fecha límite (quedan sin programar
 * por ahora, para que el usuario las revise a mano; se reintenta en la próxima sesión).
 */
export async function programarTareasSinFecha(estado) {
  const todas = estado.tareas || [];
  const candidatas = todas.filter((t) => t.tarea_estado !== 'completada' && !t.tarea_fecha_sugerida && !t.tarea_mantenimiento);
  if (candidatas.length === 0) return { asignadas: [], sinHueco: [] };

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
  const sinHueco = [];
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

    const diaLimite = tarea.tarea_fecha_limite ? diaLocal(tarea.tarea_fecha_limite) : null;

    let diaElegido = null;
    for (let i = 0; i < horizonteDias; i += 1) {
      const candidato = fechaISOMasDias(i, diaMinimo);
      if (diaLimite && candidato > diaLimite) break; // La sugerida nunca supera la fecha límite.
      if (diasHabiles.length > 0 && !diasHabiles.includes(new Date(`${candidato}T00:00:00`).getDay())) continue;
      if (restanteDelDia(candidato) >= duracion) {
        diaElegido = candidato;
        break;
      }
    }
    if (!diaElegido) {
      sinHueco.push(tarea); // No entra en el horizonte configurado (o antes de su límite): queda sin programar por ahora.
      return;
    }

    const eventosDelDia = [...(conCalendar ? eventosCalendar.filter((e) => diaLocal(e.inicio) === diaElegido) : []), ...(horariosPorDia.get(diaElegido) || [])];
    const desde = diaElegido === hoy && ahora > new Date(`${diaElegido}T00:00:00`) ? ahora : new Date(`${diaElegido}T00:00:00`);
    const hueco = buscarHuecoLibre(eventosDelDia, duracion, { desde, dias: 1, franja: preferencias.pref_franja, diasHabiles });
    if (!hueco) {
      sinHueco.push(tarea); // El día tenía minutos libres pero no un hueco contiguo: queda sin programar por ahora.
      return;
    }

    tarea.tarea_fecha_sugerida = hueco;
    marcarUso(diaElegido, duracion);
    agregarHorario(diaElegido, hueco, duracion);
    asignadas.push(tarea);
  }

  candidatas.forEach(programarUna);
  return { asignadas, sinHueco };
}

/**
 * Tareas activas con `tarea_fecha_sugerida` (con hora) que quedó tapada por un evento de Calendar cargado
 * después de asignarla (por ejemplo, una reunión nueva): las reubica solas en el próximo hueco libre, sin
 * pasar de `tarea_fecha_limite` si la tiene. Sin conexión a Calendar no hace nada. Devuelve `{ movidas,
 * sinHueco }` — `sinHueco` son las que chocan pero no tienen hueco libre antes de su límite (quedan como
 * estaban, para que el usuario las revise a mano).
 */
export async function reubicarTareasSolapadas(estado) {
  if (!hayConexionGoogleCalendar()) return { movidas: [], sinHueco: [] };

  const candidatas = (estado.tareas || []).filter((t) => t.tarea_estado !== 'completada' && tieneHora(t.tarea_fecha_sugerida));
  if (candidatas.length === 0) return { movidas: [], sinHueco: [] };

  let eventos = [];
  try {
    eventos = await obtenerEventosDelHorizonte();
  } catch {
    return { movidas: [], sinHueco: [] }; // Falla momentánea de red: se reintenta en la próxima sesión.
  }

  const preferencias = obtenerPreferencias();
  const movidas = [];
  const sinHueco = [];

  candidatas.forEach((tarea) => {
    const choque = calcularSolapamiento(tarea, eventos);
    if (!choque) return;

    const duracion = tarea.tarea_duracion_min || 30;
    const diasHabiles = tarea.tarea_dias_habiles || [];
    const desde = new Date(tarea.tarea_fecha_sugerida);
    const diaLimite = tarea.tarea_fecha_limite ? diaLocal(tarea.tarea_fecha_limite) : null;
    const dias = diaLimite ? Math.max(1, diasEntreFechas(diaLocal(tarea.tarea_fecha_sugerida), diaLimite) + 1) : diasHorizonteCalendar();

    const hueco = buscarHuecoLibre(eventos, duracion, { desde, dias, franja: preferencias.pref_franja, diasHabiles });
    if (hueco && !superaLimite(hueco, tarea.tarea_fecha_limite)) {
      tarea.tarea_fecha_sugerida = hueco;
      movidas.push(tarea);
    } else {
      sinHueco.push(tarea);
    }
  });

  return { movidas, sinHueco };
}

/**
 * La tarea más inmediata (la de `tarea_fecha_sugerida` con hora más próxima entre las activas, sin importar si
 * ya pasó): mientras "ahora" está dentro de su ventana estimada (`[sugerida, sugerida + duración]`), no se toca
 * — son los casos en que el usuario todavía no la empezó o la está haciendo en este momento, y no tiene sentido
 * reprogramarla (arrastrando en cascada al resto de la cadena). Recién cuando "ahora" supera esa ventana sin
 * completarse, se busca el próximo hueco real desde ahora (respetando `tarea_fecha_limite` como techo, igual
 * que `reubicarTareasSolapadas`) y se reprograma con `reprogramarTareaConCascada`. Se llama una vez al iniciar
 * la app y, mientras sigue abierta, cada 1-2 minutos (`app.js`), para que la reprogramación pase apenas
 * corresponde. Devuelve `null` si no había nada que evaluar o la ventana no venció todavía; si venció,
 * `{ tarea, sinHueco, inconsistentes }` (`sinHueco` true si no hay hueco libre antes de su fecha límite —
 * queda como estaba; `inconsistentes` son dependientes que quedaron con la sugerida después de su propia
 * fecha límite, ver `avisoInconsistentes` en `tareas-logica.js`).
 */
export async function reprogramarTareaInmediataSiVencio(estado) {
  const activas = (estado.tareas || []).filter((t) => t.tarea_estado !== 'completada' && tieneHora(t.tarea_fecha_sugerida));
  if (activas.length === 0) return null;

  const tarea = activas.reduce((a, b) => (a.tarea_fecha_sugerida < b.tarea_fecha_sugerida ? a : b));
  const duracion = tarea.tarea_duracion_min || 30;
  const finEstimado = new Date(tarea.tarea_fecha_sugerida).getTime() + duracion * 60000;
  if (Date.now() < finEstimado) return null; // todavía no le tocaba, o el usuario la está haciendo: no se toca.

  let eventos = [];
  if (hayConexionGoogleCalendar()) {
    try {
      eventos = await obtenerEventosDelHorizonte();
    } catch {
      eventos = []; // Falla momentánea de red: se reintenta en el próximo chequeo.
    }
  }

  const preferencias = obtenerPreferencias();
  const diasHabiles = tarea.tarea_dias_habiles || [];
  const diaLimite = tarea.tarea_fecha_limite ? diaLocal(tarea.tarea_fecha_limite) : null;
  const desde = new Date();
  const dias = diaLimite ? Math.max(1, diasEntreFechas(hoyISO(), diaLimite) + 1) : diasHorizonteCalendar();

  const hueco = buscarHuecoLibre(eventos, duracion, { desde, dias, franja: preferencias.pref_franja, diasHabiles });
  if (!hueco || superaLimite(hueco, tarea.tarea_fecha_limite)) return { tarea, sinHueco: true, inconsistentes: [] };

  const inconsistentes = reprogramarTareaConCascada(tarea, hueco, estado.tareas);
  return { tarea, sinHueco: false, inconsistentes };
}

/**
 * Le asigna a `tarea` un hueco real hoy (respetando Calendar y `tarea_fecha_limite`); si no entra hoy, sigue
 * buscando hacia adelante dentro del horizonte configurado en vez de dejarla sin fecha. La usa el formulario
 * de tarea, la edición masiva y "Reestructurar prioridades con IA" al marcar `tarea_urgente = true` (v0.75.0).
 * No evita chocar con otras tareas del mismo lote que se estén marcando urgentes a la vez (si dos quedan
 * pisadas entre sí, `reubicarTareasSolapadas` las reacomoda sola en el próximo chequeo). Devuelve
 * `{ tarea, sinHueco, inconsistentes }` — `sinHueco` true si no hay hueco libre antes de su fecha límite
 * (queda como estaba); `inconsistentes` ver `reprogramarTareaInmediataSiVencio`.
 */
export async function programarParaHoy(tarea, estado) {
  const duracion = tarea.tarea_duracion_min || 30;
  const diasHabiles = tarea.tarea_dias_habiles || [];

  let eventos = [];
  if (hayConexionGoogleCalendar()) {
    try {
      eventos = await obtenerEventosDelHorizonte();
    } catch {
      eventos = [];
    }
  }

  const preferencias = obtenerPreferencias();
  const diaLimite = tarea.tarea_fecha_limite ? diaLocal(tarea.tarea_fecha_limite) : null;
  const dias = diaLimite ? Math.max(1, diasEntreFechas(hoyISO(), diaLimite) + 1) : diasHorizonteCalendar();

  const hueco = buscarHuecoLibre(eventos, duracion, { desde: new Date(), dias, franja: preferencias.pref_franja, diasHabiles });
  if (!hueco || superaLimite(hueco, tarea.tarea_fecha_limite)) return { tarea, sinHueco: true, inconsistentes: [] };

  const inconsistentes = reprogramarTareaConCascada(tarea, hueco, estado.tareas);
  return { tarea, sinHueco: false, inconsistentes };
}
