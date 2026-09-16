// Client ID de una app OAuth pública (no es secreto, a diferencia de un
// Client Secret) creada en Google Cloud Console, con
// http://localhost:5173 como origen de JavaScript autorizado.
const CLIENT_ID = '688334428961-v8beno5ekn6i9uvn18m6rkccq0f0hnui.apps.googleusercontent.com';
const SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';
const DURACION_CACHE_MS = 5 * 60 * 1000;

let tokenActual = null;
let clienteToken = null;
let manejarRespuestaToken = null;
let cacheEventos = { fecha: '', eventos: [], timestamp: 0 };

export function soportaGoogleCalendar() {
  return typeof google !== 'undefined' && !!google.accounts;
}

export function hayConexionGoogleCalendar() {
  return !!tokenActual;
}

/**
 * Pide un token de acceso de solo lectura al calendario del usuario vía
 * Google Identity Services (popup). El token queda en memoria (no se
 * persiste): es de corta duración (~1h) y no hace falta backend para
 * refrescarlo, alcanza con volver a conectar cuando expire.
 *
 * El `TokenClient` de Google es un singleton (`initTokenClient` se llama
 * una sola vez): su `callback` no puede cerrar directamente sobre el
 * `resolve`/`reject` de ESTA promesa, porque en una reconexión posterior
 * (mismo objeto `clienteToken` reusado) seguiría resolviendo la promesa de
 * la primera llamada y esta nueva quedaría colgada para siempre. Por eso
 * el `callback` real solo delega a `manejarRespuestaToken`, que cada
 * llamada reasigna a su propio resolve/reject.
 */
export function conectarGoogleCalendar() {
  return new Promise((resolve, reject) => {
    if (!soportaGoogleCalendar()) {
      reject(new Error('No se pudo cargar Google Identity Services. Revisá tu conexión e intentá de nuevo.'));
      return;
    }

    manejarRespuestaToken = (respuesta) => {
      if (respuesta.error) {
        reject(new Error('No se pudo conectar con Google Calendar.'));
        return;
      }
      tokenActual = respuesta.access_token;
      resolve();
    };

    if (!clienteToken) {
      clienteToken = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPE,
        callback: (respuesta) => manejarRespuestaToken(respuesta),
      });
    }

    clienteToken.requestAccessToken();
  });
}

/**
 * Devuelve los eventos de hoy del calendario principal (con horario, se
 * excluyen los eventos de todo el día). Cachea el resultado en memoria
 * por unos minutos para no repetir el fetch por cada tarea evaluada en
 * el mismo render.
 */
export async function obtenerEventosDeHoy() {
  if (!tokenActual) return [];

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
    headers: { Authorization: `Bearer ${tokenActual}` },
  });

  if (!respuesta.ok) {
    if (respuesta.status === 401) tokenActual = null;
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
 * Compara la ventana [fecha_hora_agendada, +duracion_estimada_min] de la
 * tarea contra el rango de cada evento y devuelve el primero que se
 * superpone, o null. Función pura, sin llamadas de red.
 */
export function calcularSolapamiento(tarea, eventos) {
  if (!tarea.fecha_hora_agendada) return null;

  const inicioTarea = new Date(tarea.fecha_hora_agendada).getTime();
  const finTarea = inicioTarea + (tarea.duracion_estimada_min || 30) * 60000;

  return (
    eventos.find((evento) => {
      const inicioEvento = new Date(evento.inicio).getTime();
      const finEvento = new Date(evento.fin).getTime();
      return inicioTarea < finEvento && finTarea > inicioEvento;
    }) || null
  );
}
