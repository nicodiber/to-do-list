// Programación automática: a las tareas activas sin hora real en `tarea_fecha_sugerida` (sin ninguna fecha, o con
// fecha cargada pero sin hora — "proyectadas" en Semana; y sin ser de mantenimiento, que tienen su propio ritmo)
// les asigna un día y una hora reales, respetando el tope de minutos por día, lo ocupado en Google Calendar (si
// está conectado) y las cadenas de dependencia (por orden y duración real, no un salto fijo de un día).
// `reprogramarVencidas` se llama una sola vez por sesión desde `app.js` (`reprogramarSiCorresponde`);
// `reprogramarTareaInmediataSiVencio` además se repite cada 1-2 minutos mientras la app sigue abierta, y
// `programarTareasSinFecha`/`reubicarTareasSolapadas`/`adelantarTareasSiHayHuecoMejor` cada vez que se refresca la
// lectura de Calendar (`refrescarCalendar`, ver `app.js`), no solo al iniciar sesión (v0.81.0).

import { diaLocal, hoyISO, fechaLocalISO, fechaISOMasDias, tieneHora, diasEntreFechas } from './utilidades.js';
import { obtenerPreferencias } from './preferencias.js';
import { crearCalculadoraCapacidad } from './capacidad.js';
import { hayConexionGoogleCalendar, obtenerEventosDelHorizonte, diasHorizonteCalendar, buscarHuecoLibre, calcularSolapamiento } from './google-calendar.js';
import { habilitadaReal } from './gantt-modelo.js';
import { reprogramarTareaConCascada, compararPorPrioridad } from './tareas-logica.js';

/** ¿`fechaISO` pasa (o iguala) `limiteISO`? Con hora, compara el instante exacto; sin hora, el día calendario
 * (mismo criterio que ya usaba la app). `false` sin límite cargado. Exportada (v0.89.0) para que
 * `views/resumen.view.js` la reutilice sin duplicar la comparación con/sin hora. */
export function superaLimite(fechaISO, limiteISO) {
  if (!limiteISO) return false;
  if (tieneHora(limiteISO)) return new Date(fechaISO).getTime() > new Date(limiteISO).getTime();
  return diaLocal(fechaISO) > limiteISO;
}

/** Los huecos que ya ocupan otras tareas activas con hora real en `tarea_fecha_sugerida`, como eventos
 * `{ inicio, fin }` — para que `buscarHuecoLibre` no haga chocar dos tareas de STDL entre sí (mismo criterio
 * que ya usan `programarTareasSinFecha`/`adelantarTareasSiHayHuecoMejor`, extraído acá para reusarlo también en
 * `programarParaHoy`, `reprogramarTareaInmediataSiVencio`, `reubicarTareasSolapadas` y `reprogramarVencidas`,
 * v0.92.0 — antes solo miraban Calendar y podían asignarle a dos tareas el mismo horario). */
function otrasTareasComoEventos(todas, excluirId) {
  return todas
    .filter((t) => t.tarea_id !== excluirId && t.tarea_estado !== 'completada' && tieneHora(t.tarea_fecha_sugerida))
    .map((t) => ({ inicio: t.tarea_fecha_sugerida, fin: new Date(new Date(t.tarea_fecha_sugerida).getTime() + (t.tarea_duracion_min || 30) * 60000).toISOString() }));
}

/**
 * Asigna `tarea_fecha_sugerida` (día y hora reales) a toda tarea activa sin hora real todavía — sin ninguna fecha
 * sugerida, o con una fecha cargada a mano pero sin hora (v0.81.0: antes solo la primera): primero un día con
 * capacidad libre (`crearCalculadoraCapacidad`, desde ahora, desde la fecha que ya tenía o desde que la cadena lo
 * permite), después un hueco horario real dentro de ese día (`buscarHuecoLibre`) que no choque con Calendar ni con
 * otras tareas ya asignadas. Sin conexión con Calendar, solo mira el tope de minutos (sin buscar eventos). Devuelve
 * `{ asignadas, sinHueco }` — `sinHueco` son las que no encontraron día antes de su horizonte o de su fecha límite
 * (quedan sin programar por ahora, para que el usuario las revise a mano; se reintenta en el próximo refresco).
 */
export async function programarTareasSinFecha(estado) {
  const todas = estado.tareas || [];
  const candidatas = todas.filter((t) => t.tarea_estado !== 'completada' && !tieneHora(t.tarea_fecha_sugerida) && !t.tarea_mantenimiento);
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

  // Instante a partir del cual puede empezar (no un día: ahora, la habilitación, la fecha que ya tenía cargada
  // sin hora, o el fin real de su previa — orden de la cadena por duración, no un salto fijo de un día).
  function pisoDe(tarea) {
    let piso = ahora;
    const habilitada = habilitadaReal(tarea);
    if (habilitada) piso = new Date(Math.max(piso.getTime(), new Date(`${habilitada}T00:00:00`).getTime()));
    if (tarea.tarea_fecha_sugerida && !tieneHora(tarea.tarea_fecha_sugerida)) {
      piso = new Date(Math.max(piso.getTime(), new Date(`${tarea.tarea_fecha_sugerida}T00:00:00`).getTime()));
    }
    const previa = tarea.tarea_dependiente ? porId.get(tarea.tarea_dependiente) : null;
    if (!previa) return piso;
    if (previa.tarea_estado !== 'completada' && !tieneHora(previa.tarea_fecha_sugerida) && !previa.tarea_mantenimiento) programarUna(previa);
    if (tieneHora(previa.tarea_fecha_sugerida)) {
      const finPrevia = new Date(previa.tarea_fecha_sugerida).getTime() + (previa.tarea_duracion_min || 30) * 60000;
      if (finPrevia > piso.getTime()) piso = new Date(finPrevia);
    }
    return piso;
  }

  function programarUna(tarea) {
    if (tieneHora(tarea.tarea_fecha_sugerida) || enCurso.has(tarea.tarea_id)) return;
    enCurso.add(tarea.tarea_id);

    const piso = pisoDe(tarea);
    const diaMinimo = fechaLocalISO(piso);
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
    const desde = diaElegido === diaMinimo ? piso : new Date(`${diaElegido}T00:00:00`);
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
 * Tras un corrimiento en cascada, revalida cada dependiente de `cabeza` (recorriendo la cadena por
 * `tarea_dependiente` — la regla 1 a 1 del modelo garantiza que es lineal, sin ramas) contra Calendar y contra
 * el resto de las tareas ya ocupadas, algo que `reprogramarTareaConCascada` no hace (solo suma el mismo delta
 * de tiempo a cada uno — ver `tareas-logica.js`; no se tocó esa función para evitar un ciclo de imports con
 * `google-calendar.js` y porque tiene otros ~8 usos, de acciones directas del usuario, que quedan fuera de
 * esta ronda). El objetivo de una cadena es marcar orden, no una separación exacta (decisión del usuario,
 * v0.84.0): si un dependiente queda solapado, se le busca un hueco real más adelante (respetando que siga
 * después del fin de su propia previa, ya resuelta) en vez de dejarlo así — y se sigue por la cadena con la
 * posición final de cada uno, no con el delta original. También dispara si el corrimiento plano dejó al
 * dependiente después de **su propia** `tarea_fecha_limite`, aunque no colisione con nada (v0.89.0 — antes
 * este caso solo se marcaba "inconsistente" para un aviso, sin corregirse nunca). Sin hueco disponible antes
 * de su fecha límite (caso raro), queda con el corrimiento de la cascada tal cual: se revisa en la nueva
 * sección de Resumen y se reintenta en el próximo refresco.
 */
function resolverColisionesEnCadena(cabeza, todas, eventos, preferencias) {
  // El resto de la cadena (todavía sin procesar) queda afuera de "otras": todavía tiene la posición vieja del
  // corrimiento plano y está a punto de moverse — contarla como ocupada empujaría a los eslabones anteriores
  // más de lo necesario.
  const idsCadena = new Set([cabeza.tarea_id]);
  for (let t = todas.find((x) => x.tarea_dependiente === cabeza.tarea_id); t; t = todas.find((x) => x.tarea_dependiente === t.tarea_id)) {
    idsCadena.add(t.tarea_id);
  }

  let previa = cabeza;
  let actual = todas.find((t) => t.tarea_dependiente === previa.tarea_id && t.tarea_estado !== 'completada');

  while (actual) {
    if (tieneHora(actual.tarea_fecha_sugerida)) {
      const duracion = actual.tarea_duracion_min || 30;
      const otras = todas
        .filter((t) => !idsCadena.has(t.tarea_id) && t.tarea_estado !== 'completada' && tieneHora(t.tarea_fecha_sugerida))
        .map((t) => ({ inicio: t.tarea_fecha_sugerida, fin: new Date(new Date(t.tarea_fecha_sugerida).getTime() + (t.tarea_duracion_min || 30) * 60000).toISOString() }));

      const finPrevia = tieneHora(previa.tarea_fecha_sugerida)
        ? new Date(previa.tarea_fecha_sugerida).getTime() + (previa.tarea_duracion_min || 30) * 60000
        : null;
      // El corrimiento plano puede dejarla sin chocar con nada y aun así antes de que su propia previa
      // termine (por ejemplo, si la previa tuvo que correrse más de lo que le tocaba a esta por otro choque).
      const antesDeSuPrevia = finPrevia != null && new Date(actual.tarea_fecha_sugerida).getTime() < finPrevia;
      const colisionCalendar = calcularSolapamiento(actual, eventos);
      const colisionOtras = calcularSolapamiento(actual, otras);
      // O el corrimiento plano la dejó después de su propia fecha límite, sin colisionar con nada (v0.89.0).
      const superaSuLimite = superaLimite(actual.tarea_fecha_sugerida, actual.tarea_fecha_limite);

      if (antesDeSuPrevia || superaSuLimite || colisionCalendar || colisionOtras) {
        // Si el único motivo es haber superado su propio límite, la posición actual ya es inválida por estar
        // demasiado tarde: no sirve de piso para buscar (buscar "hacia adelante" desde ahí nunca encontraría
        // nada antes del límite). Se busca desde ahora en su lugar.
        const soloSuperaLimite = superaSuLimite && !antesDeSuPrevia && !colisionCalendar && !colisionOtras;
        let desde = soloSuperaLimite ? new Date() : new Date(actual.tarea_fecha_sugerida);
        if (finPrevia != null && finPrevia > desde.getTime()) desde = new Date(finPrevia);
        const diaLimite = actual.tarea_fecha_limite ? diaLocal(actual.tarea_fecha_limite) : null;
        const dias = diaLimite ? Math.max(1, diasEntreFechas(fechaLocalISO(desde), diaLimite) + 1) : diasHorizonteCalendar();
        const hueco = buscarHuecoLibre([...eventos, ...otras], duracion, { desde, dias, franja: preferencias.pref_franja, diasHabiles: actual.tarea_dias_habiles || [] });
        if (hueco && !superaLimite(hueco, actual.tarea_fecha_limite)) actual.tarea_fecha_sugerida = hueco;
      }
    }
    previa = actual;
    actual = todas.find((t) => t.tarea_dependiente === previa.tarea_id && t.tarea_estado !== 'completada');
  }
}

/**
 * Tarea activa cuya `tarea_fecha_sugerida` (con hora) ya venció (el día quedó en el pasado): le busca el primer
 * hueco real desde **hoy**, con el mismo criterio de capacidad diaria que `programarTareasSinFecha`
 * (`crearCalculadoraCapacidad`, `tarea_dias_habiles`, sin superar `tarea_fecha_limite`) y sin chocar con
 * Calendar ni con otras tareas ya asignadas (`otrasTareasComoEventos`) — v0.92.0, reemplaza a
 * `calcularProximaFechaSugerida`/`reprogramarFechasSugeridasVencidas` (`tareas-logica.js`), que solo saltaba al
 * próximo día hábil conservando la misma hora, sin mirar Calendar ni si ese día ya estaba lleno (backlog:
 * "revisar reprogramar a hueco libre anterior..." / "Adoptar la capacidad... en la reprogramación de fechas
 * vencidas"). A diferencia de `programarTareasSinFecha` (pensada para tareas sin cadena previa agendada), acá
 * sí hace falta arrastrar a los dependientes ya agendados: usa `reprogramarTareaConCascada` +
 * `resolverColisionesEnCadena`, igual que `reubicarTareasSolapadas`. Se llama una sola vez por sesión desde
 * `app.js` (`reprogramarSiCorresponde`). Devuelve `{ reprogramadas, sinHueco, inconsistentes }` — `sinHueco`
 * son las que no encontraron ningún hueco real antes de su fecha límite (quedan como estaban, para que el
 * usuario las revise a mano, igual que el resto de las funciones de este archivo).
 */
export async function reprogramarVencidas(estado) {
  const todas = estado.tareas || [];
  const hoy = hoyISO();
  const candidatas = todas.filter((t) => t.tarea_estado !== 'completada' && tieneHora(t.tarea_fecha_sugerida) && diaLocal(t.tarea_fecha_sugerida) < hoy);
  if (candidatas.length === 0) return { reprogramadas: [], sinHueco: [], inconsistentes: [] };

  const preferencias = obtenerPreferencias();
  const ahora = new Date();
  const conCalendar = hayConexionGoogleCalendar();
  const horizonteDias = diasHorizonteCalendar();
  let eventosCalendar = [];
  if (conCalendar) {
    try {
      eventosCalendar = await obtenerEventosDelHorizonte();
    } catch {
      eventosCalendar = []; // Falla momentánea de red: se programa igual, solo con el tope de minutos.
    }
  }

  const calcularCapacidad = crearCalculadoraCapacidad({ preferencias, eventos: eventosCalendar, tareas: todas, hoy, ahora });
  // Mismo motivo que en `programarTareasSinFecha`: la calculadora no se entera de lo que esta misma función va
  // reprogramando, así que la carga por día se acumula acá aparte.
  const cargaAcumulada = new Map();
  const restanteDelDia = (dia) => {
    const cap = calcularCapacidad(dia);
    const usados = cargaAcumulada.has(dia) ? cargaAcumulada.get(dia) : cap.carga;
    return Math.max(0, cap.capacidad - usados);
  };
  const marcarUso = (dia, minutos) => {
    cargaAcumulada.set(dia, (cargaAcumulada.has(dia) ? cargaAcumulada.get(dia) : calcularCapacidad(dia).carga) + minutos);
  };

  const reprogramadas = [];
  const sinHueco = [];
  const inconsistentes = [];

  candidatas.forEach((tarea) => {
    const duracion = tarea.tarea_duracion_min || 30;
    const diasHabiles = tarea.tarea_dias_habiles || [];
    const diaLimite = tarea.tarea_fecha_limite ? diaLocal(tarea.tarea_fecha_limite) : null;

    let diaElegido = null;
    for (let i = 0; i < horizonteDias; i += 1) {
      const candidato = fechaISOMasDias(i, hoy);
      if (diaLimite && candidato > diaLimite) break; // La sugerida nunca supera la fecha límite.
      if (diasHabiles.length > 0 && !diasHabiles.includes(new Date(`${candidato}T00:00:00`).getDay())) continue;
      if (restanteDelDia(candidato) >= duracion) {
        diaElegido = candidato;
        break;
      }
    }
    if (!diaElegido) {
      sinHueco.push(tarea); // Ningún día antes de su horizonte/límite tiene capacidad real: queda como estaba.
      return;
    }

    const eventosDelDia = conCalendar ? eventosCalendar.filter((e) => diaLocal(e.inicio) === diaElegido) : [];
    const otras = otrasTareasComoEventos(todas, tarea.tarea_id);
    const desde = diaElegido === hoy ? ahora : new Date(`${diaElegido}T00:00:00`);
    const hueco = buscarHuecoLibre([...eventosDelDia, ...otras], duracion, { desde, dias: 1, franja: preferencias.pref_franja, diasHabiles });
    if (!hueco) {
      sinHueco.push(tarea); // El día tenía minutos libres pero no un hueco contiguo: queda como estaba.
      return;
    }

    marcarUso(diaElegido, duracion);
    inconsistentes.push(...reprogramarTareaConCascada(tarea, hueco, todas));
    resolverColisionesEnCadena(tarea, todas, eventosCalendar, preferencias);
    reprogramadas.push(tarea);
  });

  return { reprogramadas, sinHueco, inconsistentes };
}

/**
 * Tareas activas con `tarea_fecha_sugerida` (con hora) que quedó tapada por un evento de Calendar cargado
 * después de asignarla (por ejemplo, una reunión nueva): las reubica solas en el próximo hueco libre, sin
 * pasar de `tarea_fecha_limite` si la tiene, arrastrando a sus dependientes en cascada (v0.82.0, con
 * `reprogramarTareaConCascada` — antes asignaba la fecha directo, sin correr a la tarea siguiente en la
 * cadena; era la única de las cuatro funciones de esta sección que no la usaba, por ser anterior a esa
 * utilidad). Sin conexión a Calendar no hace nada. Devuelve `{ movidas, sinHueco, inconsistentes }` —
 * `sinHueco` son las que chocan pero no tienen hueco libre antes de su límite (quedan como estaban, para
 * que el usuario las revise a mano); `inconsistentes` son dependientes que quedaron con la sugerida después
 * de su propia fecha límite tras el corrimiento (ver `avisoInconsistentes` en `tareas-logica.js`).
 */
export async function reubicarTareasSolapadas(estado) {
  if (!hayConexionGoogleCalendar()) return { movidas: [], sinHueco: [], inconsistentes: [] };

  const candidatas = (estado.tareas || []).filter((t) => t.tarea_estado !== 'completada' && tieneHora(t.tarea_fecha_sugerida));
  if (candidatas.length === 0) return { movidas: [], sinHueco: [], inconsistentes: [] };

  let eventos = [];
  try {
    eventos = await obtenerEventosDelHorizonte();
  } catch {
    return { movidas: [], sinHueco: [], inconsistentes: [] }; // Falla momentánea de red: se reintenta en la próxima sesión.
  }

  const preferencias = obtenerPreferencias();
  const movidas = [];
  const sinHueco = [];
  const inconsistentes = [];

  candidatas.forEach((tarea) => {
    const choque = calcularSolapamiento(tarea, eventos);
    if (!choque) return;

    const duracion = tarea.tarea_duracion_min || 30;
    const diasHabiles = tarea.tarea_dias_habiles || [];
    const desde = new Date(tarea.tarea_fecha_sugerida);
    const diaLimite = tarea.tarea_fecha_limite ? diaLocal(tarea.tarea_fecha_limite) : null;
    const dias = diaLimite ? Math.max(1, diasEntreFechas(diaLocal(tarea.tarea_fecha_sugerida), diaLimite) + 1) : diasHorizonteCalendar();

    const otras = otrasTareasComoEventos(estado.tareas, tarea.tarea_id);
    const hueco = buscarHuecoLibre([...eventos, ...otras], duracion, { desde, dias, franja: preferencias.pref_franja, diasHabiles });
    if (hueco && !superaLimite(hueco, tarea.tarea_fecha_limite)) {
      inconsistentes.push(...reprogramarTareaConCascada(tarea, hueco, estado.tareas));
      resolverColisionesEnCadena(tarea, estado.tareas, eventos, preferencias);
      movidas.push(tarea);
    } else {
      sinHueco.push(tarea);
    }
  });

  return { movidas, sinHueco, inconsistentes };
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

  const otras = otrasTareasComoEventos(estado.tareas, tarea.tarea_id);
  const hueco = buscarHuecoLibre([...eventos, ...otras], duracion, { desde, dias, franja: preferencias.pref_franja, diasHabiles });
  if (!hueco || superaLimite(hueco, tarea.tarea_fecha_limite)) return { tarea, sinHueco: true, inconsistentes: [] };

  const inconsistentes = reprogramarTareaConCascada(tarea, hueco, estado.tareas);
  resolverColisionesEnCadena(tarea, estado.tareas, eventos, preferencias);
  return { tarea, sinHueco: false, inconsistentes };
}

/**
 * Le asigna a `tarea` un hueco real hoy (respetando Calendar, otras tareas ya asignadas y `tarea_fecha_limite`);
 * si no entra hoy, sigue buscando hacia adelante dentro del horizonte configurado en vez de dejarla sin fecha.
 * La usa el formulario de tarea, la edición masiva y "Reestructurar prioridades con IA" al marcar
 * `tarea_urgente = true` (v0.75.0), y `reasignarUrgentesAHoy` en loop para varias tareas seguidas — como lee
 * `estado.tareas` en cada llamada, cada una ve ya ocupado el hueco que le tocó a la anterior del mismo lote
 * (v0.92.0 — antes solo miraba Calendar, así que dos urgentes del mismo lote podían terminar con el mismo
 * horario; `reubicarTareasSolapadas` tampoco lo resolvía después, porque igual solo mira Calendar). Devuelve
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

  const otras = otrasTareasComoEventos(estado.tareas || [], tarea.tarea_id);
  const hueco = buscarHuecoLibre([...eventos, ...otras], duracion, { desde: new Date(), dias, franja: preferencias.pref_franja, diasHabiles });
  if (!hueco || superaLimite(hueco, tarea.tarea_fecha_limite)) return { tarea, sinHueco: true, inconsistentes: [] };

  const inconsistentes = reprogramarTareaConCascada(tarea, hueco, estado.tareas);
  resolverColisionesEnCadena(tarea, estado.tareas, eventos, preferencias);
  return { tarea, sinHueco: false, inconsistentes };
}

/**
 * Una tarea `tarea_urgente` recupera `tarea_fecha_sugerida = hoy` todos los días mientras siga pendiente y sin
 * completar (v0.90.0 — antes solo se agendaba una vez, al marcarla urgente): candidatas, toda `pendiente` con
 * `tarea_urgente` cuya sugerida no sea ya hoy (o no tenga ninguna). Reusa `programarParaHoy` (arriba) por cada
 * una — mismo respeto por Calendar, capacidad y `tarea_fecha_limite` si la tiene. Silenciosa: el cambio se ve
 * solo en la tarjeta, sin `alert()` (mismo criterio que el resto de las correcciones automáticas de rutina).
 */
export async function reasignarUrgentesAHoy(estado) {
  const hoy = hoyISO();
  const candidatas = (estado.tareas || []).filter(
    (t) => t.tarea_estado === 'pendiente' && t.tarea_urgente && (!t.tarea_fecha_sugerida || diaLocal(t.tarea_fecha_sugerida) !== hoy)
  );
  for (const tarea of candidatas) {
    await programarParaHoy(tarea, estado);
  }
  return candidatas;
}

/**
 * Tareas activas con `tarea_fecha_sugerida` (con hora) que podrían adelantarse a un hueco mejor que quedó libre
 * en Calendar (por ejemplo, se movió o se borró un evento) — a diferencia de `reubicarTareasSolapadas`, que solo
 * reacciona cuando el horario actual choca, esta es oportunista: adelanta aunque no haya conflicto, si aparece
 * un hueco real más temprano. No hace falta excluir la tarea "en curso": `buscarHuecoLibre` nunca devuelve un
 * hueco anterior a "ahora", así que si la tarea ya empezó ningún hueco puede salir "mejor" y la comparación la
 * descarta sola. Respeta la fecha de habilitación y el fin de su previa en la cadena (no la adelanta antes de
 * que la previa termine). Se llama junto con `reubicarTareasSolapadas` cada vez que se refresca la lectura de
 * Calendar (`refrescarCalendar`, `app.js`), en silencio (sin `alert()`, mismo criterio que el intervalo de 90 s
 * de `reprogramarTareaInmediataSiVencio`). Devuelve `{ movidas }`.
 */
export async function adelantarTareasSiHayHuecoMejor(estado) {
  if (!hayConexionGoogleCalendar()) return { movidas: [] };

  const todas = estado.tareas || [];
  const porId = new Map(todas.map((t) => [t.tarea_id, t]));
  const candidatas = todas
    .filter((t) => t.tarea_estado !== 'completada' && tieneHora(t.tarea_fecha_sugerida))
    .sort(compararPorPrioridad); // la de más prioridad se queda con el hueco si dos compiten por el mismo

  if (candidatas.length === 0) return { movidas: [] };

  let eventos = [];
  try {
    eventos = await obtenerEventosDelHorizonte();
  } catch {
    return { movidas: [] }; // falla momentánea de red: se reintenta en el próximo refresco
  }

  const preferencias = obtenerPreferencias();
  const movidas = [];
  const ocupados = []; // lo que ya se resolvió en esta pasada, para que dos tareas no se peleen el mismo hueco

  candidatas.forEach((tarea) => {
    const duracion = tarea.tarea_duracion_min || 30;
    const diasHabiles = tarea.tarea_dias_habiles || [];
    const diaLimite = tarea.tarea_fecha_limite ? diaLocal(tarea.tarea_fecha_limite) : null;
    const dias = diaLimite ? Math.max(1, diasEntreFechas(hoyISO(), diaLimite) + 1) : diasHorizonteCalendar();

    // Piso: ahora, la fecha de habilitación (si es futura) y el fin de su previa en la cadena (si tiene una con
    // fecha propia) — para no adelantarla antes de que pueda empezar de verdad.
    let desde = new Date();
    const habilitada = habilitadaReal(tarea);
    if (habilitada && habilitada > hoyISO()) desde = new Date(`${habilitada}T00:00:00`);
    const previa = tarea.tarea_dependiente ? porId.get(tarea.tarea_dependiente) : null;
    if (previa && previa.tarea_fecha_sugerida) {
      const finPrevia = new Date(previa.tarea_fecha_sugerida).getTime() + (previa.tarea_duracion_min || 30) * 60000;
      if (finPrevia > desde.getTime()) desde = new Date(finPrevia);
    }

    const hueco = buscarHuecoLibre([...eventos, ...ocupados], duracion, { desde, dias, franja: preferencias.pref_franja, diasHabiles });
    if (hueco && new Date(hueco).getTime() < new Date(tarea.tarea_fecha_sugerida).getTime() && !superaLimite(hueco, tarea.tarea_fecha_limite)) {
      reprogramarTareaConCascada(tarea, hueco, todas);
      resolverColisionesEnCadena(tarea, todas, eventos, preferencias);
      movidas.push(tarea);
    }

    // Reserva el horario final (nuevo o el que ya tenía) para la próxima tarea de esta misma pasada.
    const inicio = new Date(tarea.tarea_fecha_sugerida).getTime();
    ocupados.push({ inicio: tarea.tarea_fecha_sugerida, fin: new Date(inicio + duracion * 60000).toISOString() });
  });

  return { movidas };
}
