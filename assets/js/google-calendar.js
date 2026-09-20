import { soportaGoogle, hayToken, tieneScope, obtenerTokenAcceso, invalidarToken } from './google-auth.js';
import { fechaLocalISO } from './utilidades.js';

const DURACION_CACHE_MS = 5 * 60 * 1000;
const EVENTOS_POR_PAGINA = 250;
const PASO_HUECO_MS = 15 * 60 * 1000;

/** Cuántos días hacia adelante se leen los eventos de Calendar (hoy incluido) para avisar superposiciones y buscar huecos. */
export const DIAS_HORIZONTE_CALENDAR = 15;

// Caché en memoria por rango de fechas: clave "desde|hasta" -> { promesa, timestamp }. Se guarda la
// promesa (no el resultado) para que las tarjetas de un mismo dibujo compartan una sola consulta.
const cacheEventos = new Map();

export function soportaGoogleCalendar() {
  return soportaGoogle();
}

/**
 * Calendar se conecta junto con Drive (un solo popup, ver google-auth.js):
 * hay conexión si hay sesión activa y el usuario no desmarcó el permiso de
 * Calendar en el consentimiento.
 */
export function hayConexionGoogleCalendar() {
  return hayToken() && tieneScope('calendar');
}

function inicioDelDia(fechaISODate) {
  const [anio, mes, dia] = fechaISODate.split('-').map(Number);
  return new Date(anio, mes - 1, dia, 0, 0, 0);
}

async function pedirEventos(desdeISODate, hastaISODate) {
  const accessToken = obtenerTokenAcceso();
  if (!accessToken || !tieneScope('calendar')) return [];

  const inicio = inicioDelDia(desdeISODate);
  const fin = inicioDelDia(hastaISODate);
  fin.setDate(fin.getDate() + 1);

  const eventos = [];
  let pagina = '';
  do {
    const params = new URLSearchParams({
      timeMin: inicio.toISOString(),
      timeMax: fin.toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: String(EVENTOS_POR_PAGINA),
    });
    if (pagina) params.set('pageToken', pagina);

    const respuesta = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!respuesta.ok) {
      if (respuesta.status === 401) invalidarToken();
      throw new Error('No se pudieron obtener los eventos de Google Calendar.');
    }

    const datos = await respuesta.json();
    // Se descartan los eventos de todo el día (no tienen horario que pueda chocar con una tarea).
    (datos.items || [])
      .filter((item) => item.start && item.start.dateTime)
      .forEach((item) => eventos.push({ resumen: item.summary || '(sin título)', inicio: item.start.dateTime, fin: item.end.dateTime }));
    pagina = datos.nextPageToken || '';
  } while (pagina);

  return eventos;
}

/**
 * Eventos con horario del calendario principal entre dos fechas locales (`YYYY-MM-DD`, ambas
 * incluidas). Cachea el resultado por rango unos minutos para no repetir la consulta por cada tarea
 * evaluada en el mismo dibujo. Sin conexión con Calendar devuelve `[]`.
 */
export function obtenerEventos(desdeISODate, hastaISODate) {
  const clave = `${desdeISODate}|${hastaISODate}`;
  const guardado = cacheEventos.get(clave);
  if (guardado && Date.now() - guardado.timestamp < DURACION_CACHE_MS) return guardado.promesa;

  const promesa = pedirEventos(desdeISODate, hastaISODate);
  cacheEventos.set(clave, { promesa, timestamp: Date.now() });
  // Un error no se cachea: el próximo dibujo vuelve a intentar.
  promesa.catch(() => {
    if (cacheEventos.get(clave)?.promesa === promesa) cacheEventos.delete(clave);
  });
  return promesa;
}

/** Eventos de hoy (atajo de `obtenerEventos`). */
export function obtenerEventosDeHoy() {
  const hoy = fechaLocalISO(new Date());
  return obtenerEventos(hoy, hoy);
}

/** Eventos desde hoy hasta `DIAS_HORIZONTE_CALENDAR` días hacia adelante. */
export function obtenerEventosDelHorizonte() {
  const hoy = new Date();
  const ultimo = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + DIAS_HORIZONTE_CALENDAR - 1);
  return obtenerEventos(fechaLocalISO(hoy), fechaLocalISO(ultimo));
}

/** Olvida los eventos guardados: la próxima lectura vuelve a consultar Calendar (al sincronizar o volver a la pestaña). */
export function invalidarCacheEventos() {
  cacheEventos.clear();
}

/**
 * Compara la ventana [tarea_fecha_sugerida (con hora), +tarea_duracion_min]
 * de la tarea contra el rango de cada evento y devuelve el primero que se
 * superpone, o null. Función pura, sin llamadas de red.
 */
export function calcularSolapamiento(tarea, eventos) {
  if (!tarea.tarea_fecha_sugerida) return null;

  const inicioTarea = new Date(tarea.tarea_fecha_sugerida).getTime();
  const finTarea = inicioTarea + (tarea.tarea_duracion_min || 15) * 60000;

  return (
    eventos.find((evento) => {
      const inicioEvento = new Date(evento.inicio).getTime();
      const finEvento = new Date(evento.fin).getTime();
      return inicioTarea < finEvento && finTarea > inicioEvento;
    }) || null
  );
}

function minutosDe(hhmm) {
  const [horas, minutos] = String(hhmm).split(':').map(Number);
  return horas * 60 + minutos;
}

/**
 * Primer momento libre para una tarea de `duracionMin` minutos: el primer inicio (en pasos de 15
 * min) cuya ventana entera cae dentro de la franja horaria del día, en un día hábil de la tarea, y
 * no choca con ningún evento. Busca desde `desde` durante `dias` días. Devuelve el inicio como
 * datetime ISO o `null` si no hay hueco. Función pura, sin llamadas de red.
 *
 * @param {{inicio: string, fin: string}[]} eventos Eventos con horario (`inicio`/`fin` ISO).
 * @param {number} duracionMin Duración de la tarea (15 si falta).
 * @param {{desde?: Date, dias?: number, franja?: {inicio: string, fin: string}, diasHabiles?: number[]}} [opciones]
 *   `franja` como "HH:MM" (el fin puede ser "24:00"); `diasHabiles` como índices de día de la semana (vacío = todos).
 */
export function buscarHuecoLibre(eventos, duracionMin, { desde = new Date(), dias = DIAS_HORIZONTE_CALENDAR, franja = { inicio: '00:00', fin: '24:00' }, diasHabiles = [] } = {}) {
  const duracionMs = (duracionMin || 15) * 60000;
  const ocupados = eventos.map((evento) => ({ inicio: new Date(evento.inicio).getTime(), fin: new Date(evento.fin).getTime() }));
  const minimo = Math.ceil(desde.getTime() / PASO_HUECO_MS) * PASO_HUECO_MS;

  for (let d = 0; d < dias; d += 1) {
    const dia = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate() + d);
    if (diasHabiles.length > 0 && !diasHabiles.includes(dia.getDay())) continue;

    const inicioFranja = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate(), 0, minutosDe(franja.inicio)).getTime();
    const finFranja = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate(), 0, minutosDe(franja.fin)).getTime();

    let candidato = Math.max(inicioFranja, minimo);
    while (candidato + duracionMs <= finFranja) {
      const choque = ocupados.find((o) => candidato < o.fin && candidato + duracionMs > o.inicio);
      if (!choque) return new Date(candidato).toISOString();
      // Se salta al final del evento que choca (redondeado al próximo paso de 15 min).
      candidato = Math.ceil(choque.fin / PASO_HUECO_MS) * PASO_HUECO_MS;
    }
  }
  return null;
}
