import { soportaGoogle, hayToken, tieneScope, obtenerTokenAcceso, invalidarToken } from './google-auth.js';

const DURACION_CACHE_MS = 5 * 60 * 1000;

let cacheEventos = { fecha: '', eventos: [], timestamp: 0 };

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

/**
 * Devuelve los eventos de hoy del calendario principal (con horario, se
 * excluyen los eventos de todo el día). Cachea el resultado en memoria
 * por unos minutos para no repetir el fetch por cada tarea evaluada en
 * el mismo render.
 */
export async function obtenerEventosDeHoy() {
  const accessToken = obtenerTokenAcceso();
  if (!accessToken || !tieneScope('calendar')) return [];

  const hoy = new Date();
  const claveHoy = hoy.toISOString().slice(0, 10);
  if (cacheEventos.fecha === claveHoy && Date.now() - cacheEventos.timestamp < DURACION_CACHE_MS) {
    return cacheEventos.eventos;
  }

  const inicioDia = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 0, 0, 0).toISOString();
  const finDia = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 23, 59, 59).toISOString();
  const params = new URLSearchParams({
    timeMin: inicioDia,
    timeMax: finDia,
    singleEvents: 'true',
    orderBy: 'startTime',
  });

  const respuesta = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!respuesta.ok) {
    if (respuesta.status === 401) invalidarToken();
    throw new Error('No se pudieron obtener los eventos de Google Calendar.');
  }

  const datos = await respuesta.json();
  const eventos = (datos.items || [])
    .filter((item) => item.start && item.start.dateTime)
    .map((item) => ({
      resumen: item.summary || '(sin título)',
      inicio: item.start.dateTime,
      fin: item.end.dateTime,
    }));

  cacheEventos = { fecha: claveHoy, eventos, timestamp: Date.now() };
  return eventos;
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
