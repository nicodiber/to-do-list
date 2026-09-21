import { soportaGoogle, hayToken, tieneScope, obtenerTokenAcceso, invalidarToken } from './google-auth.js';
import { fechaLocalISO } from './utilidades.js';
import { obtenerPreferencias } from './preferencias.js';

const DURACION_CACHE_MS = 5 * 60 * 1000;
const EVENTOS_POR_PAGINA = 250;
const PASO_HUECO_MS = 15 * 60 * 1000;

/** Cuántos días hacia adelante se leen los eventos de Calendar (hoy incluido): es una preferencia (`pref_horizonte_dias`). */
export function diasHorizonteCalendar() {
  return obtenerPreferencias().pref_horizonte_dias || 90;
}

// Caché en memoria por rango de fechas y calendarios: clave "desde|hasta|calendarios" -> { promesa, timestamp }.
// Se guarda la promesa (no el resultado) para que las tarjetas de un mismo dibujo compartan una sola consulta.
// Los eventos se guardan completos: los filtros de las preferencias (todo el día, rechazados, "Disponible") se
// aplican al leer, así que cambiarlos no obliga a volver a consultar.
const cacheEventos = new Map();
let cacheCalendarios = null;

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

async function pedirJSON(url, accessToken) {
  const respuesta = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!respuesta.ok) {
    if (respuesta.status === 401) invalidarToken();
    const error = new Error('No se pudieron obtener los datos de Google Calendar.');
    error.status = respuesta.status;
    throw error;
  }
  return respuesta.json();
}

/**
 * Los calendarios del usuario (`{ id, nombre, color, principal }`), con el principal primero. El permiso es el mismo
 * de solo lectura que ya se pidió. Sin conexión con Calendar o si falla la consulta devuelve `[]`.
 */
export function listarCalendarios() {
  if (cacheCalendarios && Date.now() - cacheCalendarios.timestamp < DURACION_CACHE_MS) return cacheCalendarios.promesa;
  const accessToken = obtenerTokenAcceso();
  if (!accessToken || !tieneScope('calendar')) return Promise.resolve([]);
  const promesa = (async () => {
    const calendarios = [];
    let pagina = '';
    do {
      const params = new URLSearchParams({ minAccessRole: 'reader', maxResults: '250' });
      if (pagina) params.set('pageToken', pagina);
      const datos = await pedirJSON(`https://www.googleapis.com/calendar/v3/users/me/calendarList?${params}`, accessToken);
      (datos.items || []).forEach((c) => calendarios.push({ id: c.id, nombre: c.summaryOverride || c.summary || c.id, color: c.backgroundColor || '#9ca3af', principal: !!c.primary }));
      pagina = datos.nextPageToken || '';
    } while (pagina);
    return calendarios.sort((a, b) => Number(b.principal) - Number(a.principal) || a.nombre.localeCompare(b.nombre, 'es'));
  })().catch(() => []);
  cacheCalendarios = { promesa, timestamp: Date.now() };
  return promesa;
}

/** Los calendarios a leer: los elegidos en las preferencias o, sin elección, todos (y si no se puede listar, el principal). */
async function calendariosALeer() {
  const todos = await listarCalendarios();
  if (todos.length === 0) return [{ id: 'primary', nombre: 'Calendario principal', color: '#9ca3af' }];
  const elegidos = obtenerPreferencias().pref_calendarios;
  return elegidos ? todos.filter((c) => elegidos.includes(c.id)) : todos;
}

// Los eventos de todo el día traen solo la fecha: se pasan a instantes (medianoche local) para tratarlos como el resto.
function aInstante(campo) {
  return campo.dateTime || new Date(`${campo.date}T00:00:00`).toISOString();
}

async function pedirEventosDeCalendario(calendario, inicio, fin, accessToken) {
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
    const datos = await pedirJSON(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendario.id)}/events?${params}`, accessToken);
    (datos.items || [])
      .filter((item) => item.start && (item.start.dateTime || item.start.date) && item.end)
      .forEach((item) =>
        eventos.push({
          id: item.id,
          resumen: item.summary || '(sin título)',
          inicio: aInstante(item.start),
          fin: aInstante(item.end),
          todoElDia: !item.start.dateTime,
          rechazado: (item.attendees || []).some((a) => a.self && a.responseStatus === 'declined'),
          disponible: item.transparency === 'transparent',
          calendarioId: calendario.id,
          calendarioNombre: calendario.nombre,
          color: calendario.color,
          enlace: item.htmlLink || '',
        })
      );
    pagina = datos.nextPageToken || '';
  } while (pagina);
  return eventos;
}

async function pedirEventos(desdeISODate, hastaISODate) {
  const accessToken = obtenerTokenAcceso();
  if (!accessToken || !tieneScope('calendar')) return [];

  const inicio = inicioDelDia(desdeISODate);
  const fin = inicioDelDia(hastaISODate);
  fin.setDate(fin.getDate() + 1);

  const calendarios = await calendariosALeer();
  const resultados = await Promise.allSettled(calendarios.map((c) => pedirEventosDeCalendario(c, inicio, fin, accessToken)));
  // Si falla la lectura de un calendario (por ejemplo uno compartido sin permiso), los demás siguen; si fallan todos, es un error.
  if (resultados.length > 0 && resultados.every((r) => r.status === 'rejected')) throw new Error('No se pudieron obtener los eventos de Google Calendar.');
  return resultados
    .filter((r) => r.status === 'fulfilled')
    .flatMap((r) => r.value)
    .sort((a, b) => new Date(a.inicio) - new Date(b.inicio));
}

/** Todos los eventos (con y sin horario) entre dos fechas locales `YYYY-MM-DD`, ambas incluidas, con la caché por rango. */
function eventosCompletos(desdeISODate, hastaISODate) {
  const elegidos = obtenerPreferencias().pref_calendarios;
  const clave = `${desdeISODate}|${hastaISODate}|${elegidos ? [...elegidos].sort().join(',') : '*'}`;
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

/** ¿Este evento ocupa tiempo, según las preferencias (todo el día, rechazados y "Disponible" se pueden ignorar)? */
export function ocupaTiempo(evento, preferencias = obtenerPreferencias()) {
  if (evento.todoElDia && preferencias.pref_ignorar_todo_el_dia) return false;
  if (evento.rechazado && preferencias.pref_ignorar_rechazados) return false;
  if (evento.disponible && preferencias.pref_ignorar_disponible) return false;
  return true;
}

/**
 * Los eventos que ocupan tiempo entre dos fechas locales (`YYYY-MM-DD`, ambas incluidas): con ellos se avisa de las
 * superposiciones, se busca el próximo hueco y se calcula el tiempo libre de cada día. Sin conexión con Calendar
 * devuelve `[]`.
 */
export async function obtenerEventos(desdeISODate, hastaISODate) {
  const preferencias = obtenerPreferencias();
  return (await eventosCompletos(desdeISODate, hastaISODate)).filter((e) => ocupaTiempo(e, preferencias));
}

/** Para mostrar (vista Semana): todos los eventos salvo los rechazados; incluye los de todo el día y los "Disponible". */
export async function obtenerEventosParaMostrar(desdeISODate, hastaISODate) {
  return (await eventosCompletos(desdeISODate, hastaISODate)).filter((e) => !e.rechazado);
}

/** Eventos de hoy (atajo de `obtenerEventos`). */
export function obtenerEventosDeHoy() {
  const hoy = fechaLocalISO(new Date());
  return obtenerEventos(hoy, hoy);
}

/** Eventos desde hoy hasta el horizonte configurado (`pref_horizonte_dias`) hacia adelante. */
export function obtenerEventosDelHorizonte() {
  const hoy = new Date();
  const ultimo = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + diasHorizonteCalendar() - 1);
  return obtenerEventos(fechaLocalISO(hoy), fechaLocalISO(ultimo));
}

/** Olvida los eventos guardados: la próxima lectura vuelve a consultar Calendar (al sincronizar o volver a la pestaña). */
export function invalidarCacheEventos() {
  cacheEventos.clear();
  cacheCalendarios = null;
}

/**
 * Compara la ventana [tarea_fecha_sugerida (con hora), +tarea_duracion_min]
 * de la tarea contra el rango de cada evento y devuelve el primero que se
 * superpone, o null. Función pura, sin llamadas de red.
 */
export function calcularSolapamiento(tarea, eventos) {
  if (!tarea.tarea_fecha_sugerida) return null;

  const inicioTarea = new Date(tarea.tarea_fecha_sugerida).getTime();
  const finTarea = inicioTarea + (tarea.tarea_duracion_min || 30) * 60000;

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
 * @param {number} duracionMin Duración de la tarea (30 si falta).
 * @param {{desde?: Date, dias?: number, franja?: {inicio: string, fin: string}, diasHabiles?: number[]}} [opciones]
 *   `franja` como "HH:MM" (el fin puede ser "24:00"); `diasHabiles` como índices de día de la semana (vacío = todos).
 */
export function buscarHuecoLibre(eventos, duracionMin, { desde = new Date(), dias = diasHorizonteCalendar(), franja = { inicio: '00:00', fin: '24:00' }, diasHabiles = [] } = {}) {
  const duracionMs = (duracionMin || 30) * 60000;
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
