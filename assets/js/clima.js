import { estado } from './almacenamiento.js';
import { hoyISO, diaLocal, fechaISOMasDias, tieneHora } from './utilidades.js';
import { obtenerPreferencias } from './preferencias.js';

const DIAS_MAX_PRONOSTICO = 16;
const UMBRAL_PROBABILIDAD_LLUVIA = 50;

const cachePronosticos = new Map();

// ---------------------------------------------------------------------------
// Ubicación del dispositivo (v0.104.0): con «Usar la ubicación de este dispositivo» el clima sigue a la persona cuando
// viaja. Es una preferencia de cada dispositivo (`localStorage`): la posición de uno no tiene sentido en otro. Solo se
// piden las coordenadas al navegador (con su permiso), redondeadas a 2 decimales (~1 km), y únicamente se envían a
// Open-Meteo para pedir el pronóstico.
// ---------------------------------------------------------------------------
const CLAVE_AUTOMATICO = 'super-todo-list:clima-automatico';
const CLAVE_COORDENADAS = 'super-todo-list:clima-coordenadas';
const VIGENCIA_COORDENADAS_MS = 30 * 60 * 1000;

export function climaAutomaticoActivado() {
  try {
    return localStorage.getItem(CLAVE_AUTOMATICO) === '1';
  } catch {
    return false;
  }
}

export function guardarClimaAutomatico(activo) {
  try {
    localStorage.setItem(CLAVE_AUTOMATICO, activo ? '1' : '0');
  } catch {
    // Es solo una preferencia de este dispositivo.
  }
}

/** Las últimas coordenadas detectadas (`{ latitud, longitud, en }`) o `null`. */
export function ultimasCoordenadasDetectadas() {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_COORDENADAS));
  } catch {
    return null;
  }
}

/**
 * Pide la posición actual al navegador. Reusa la última si tiene menos de 30 minutos. Rechaza con un `Error` de mensaje
 * legible si el navegador no la ofrece, el usuario no dio permiso o no se pudo obtener a tiempo.
 */
export function detectarCoordenadasDelDispositivo({ forzar = false } = {}) {
  const guardadas = ultimasCoordenadasDetectadas();
  if (!forzar && guardadas && Date.now() - guardadas.en < VIGENCIA_COORDENADAS_MS) return Promise.resolve(guardadas);
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.reject(new Error('Este navegador no puede decir dónde estás.'));
  return new Promise((resolver, rechazar) => {
    navigator.geolocation.getCurrentPosition(
      (posicion) => {
        const coordenadas = {
          latitud: Math.round(posicion.coords.latitude * 100) / 100,
          longitud: Math.round(posicion.coords.longitude * 100) / 100,
          en: Date.now(),
        };
        try {
          localStorage.setItem(CLAVE_COORDENADAS, JSON.stringify(coordenadas));
        } catch {
          // Sin almacenamiento local se vuelve a pedir cuando haga falta.
        }
        resolver(coordenadas);
      },
      (error) => rechazar(new Error(error && error.code === 1 ? 'No diste permiso para usar tu ubicación (se puede cambiar en el candado de la barra de direcciones).' : 'No se pudo obtener tu ubicación ahora.')),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: VIGENCIA_COORDENADAS_MS }
    );
  });
}

/**
 * Las coordenadas que se usan para el clima: las del dispositivo si está activada esa opción (y, si falla, las de la
 * ubicación fija de Configuraciones) o, si no, las de la ubicación fija. `null` si no hay ninguna.
 */
export async function obtenerCoordenadasClima() {
  if (climaAutomaticoActivado()) {
    try {
      const { latitud, longitud } = await detectarCoordenadasDelDispositivo();
      return { latitud, longitud, origen: 'dispositivo' };
    } catch {
      // Se usa la ubicación fija como respaldo.
    }
  }
  const fija = estado.ubicaciones.find((u) => u.ubicacion_id === obtenerPreferencias().pref_ubicacion_clima);
  if (fija && fija.ubicacion_latitud != null && fija.ubicacion_longitud != null) {
    return { latitud: fija.ubicacion_latitud, longitud: fija.ubicacion_longitud, origen: 'fija' };
  }
  return null;
}

function fechaDeReferencia(tarea) {
  if (tarea.tarea_fecha_sugerida) {
    return tieneHora(tarea.tarea_fecha_sugerida)
      ? { fecha: diaLocal(tarea.tarea_fecha_sugerida), hora: new Date(tarea.tarea_fecha_sugerida).getHours() }
      : { fecha: tarea.tarea_fecha_sugerida, hora: 12 };
  }
  if (tarea.tarea_fecha_limite) {
    return tieneHora(tarea.tarea_fecha_limite)
      ? { fecha: diaLocal(tarea.tarea_fecha_limite), hora: new Date(tarea.tarea_fecha_limite).getHours() }
      : { fecha: tarea.tarea_fecha_limite, hora: 12 };
  }
  return null;
}

async function obtenerPronosticoUbicacion(latitud, longitud) {
  const clave = `${latitud},${longitud}`;
  if (cachePronosticos.has(clave)) return cachePronosticos.get(clave);

  const promesa = fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${latitud}&longitude=${longitud}&hourly=precipitation_probability,temperature_2m&daily=weathercode,sunrise,sunset&timezone=auto&forecast_days=${DIAS_MAX_PRONOSTICO}`
  )
    .then((respuesta) => (respuesta.ok ? respuesta.json() : null))
    .catch(() => null);

  cachePronosticos.set(clave, promesa);
  return promesa;
}

/**
 * Pronóstico diario y horario de una ubicación, en una forma lista para consumir (sin conocer el formato
 * crudo de Open-Meteo) — la usa `views/semana.view.js` para el ícono de clima, amanecer/atardecer y el
 * degradé de temperatura/lluvia. `null` sin datos (sin conexión o falla la consulta).
 */
export async function obtenerPronosticoDiario(latitud, longitud) {
  const datos = await obtenerPronosticoUbicacion(latitud, longitud);
  if (!datos || !datos.daily || !datos.hourly) return null;
  return {
    dias: datos.daily.time.map((fecha, i) => ({
      fecha,
      weathercode: datos.daily.weathercode[i],
      sunrise: datos.daily.sunrise[i],
      sunset: datos.daily.sunset[i],
    })),
    horas: datos.hourly.time.map((fechaHora, i) => ({
      fechaHora,
      temperatura: datos.hourly.temperature_2m[i],
      probabilidadLluvia: datos.hourly.precipitation_probability[i],
    })),
  };
}

// Códigos de tiempo WMO que devuelve Open-Meteo (`weathercode`), agrupados a un emoji representativo.
const ICONOS_POR_CODIGO = [
  { codigos: [0], icono: '☀️' },
  { codigos: [1, 2], icono: '🌤️' },
  { codigos: [3], icono: '☁️' },
  { codigos: [45, 48], icono: '🌫️' },
  { codigos: [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82], icono: '🌧️' },
  { codigos: [71, 73, 75, 77, 85, 86], icono: '❄️' },
  { codigos: [95, 96, 99], icono: '⛈️' },
];

/** Emoji representativo de un código de tiempo WMO (Open-Meteo `weathercode`); ☁️ si no está en la tabla. */
export function iconoClima(weathercode) {
  return ICONOS_POR_CODIGO.find((grupo) => grupo.codigos.includes(weathercode))?.icono || '☁️';
}

/**
 * Evalúa si el pronóstico acompaña para una tarea marcada como
 * "requiere_clima_bueno". Devuelve null si no hay nada que evaluar
 * (no requiere clima, sin ubicación con coordenadas, sin fecha resoluble,
 * fuera de la ventana gratuita de pronóstico, o falló la consulta).
 * Si hay datos, devuelve { favorable, probabilidadLluvia }.
 */
export async function evaluarClimaTarea(tarea) {
  if (!tarea.tarea_requiere_clima_bueno) return null;

  // La ubicación de la propia tarea; sin ella, la del clima general (la del dispositivo si está activada, v0.104.0).
  const ubicacion = estado.ubicaciones.find((u) => u.ubicacion_id === tarea.ubicacion_id);
  let latitud = ubicacion ? ubicacion.ubicacion_latitud : null;
  let longitud = ubicacion ? ubicacion.ubicacion_longitud : null;
  if (latitud == null || longitud == null) {
    if (ubicacion) return null;
    const general = await obtenerCoordenadasClima();
    if (!general) return null;
    ({ latitud, longitud } = general);
  }

  const referencia = fechaDeReferencia(tarea);
  if (!referencia) return null;

  const hoy = hoyISO();
  const limite = fechaISOMasDias(DIAS_MAX_PRONOSTICO - 1, hoy);
  if (referencia.fecha < hoy || referencia.fecha > limite) return null;

  const datos = await obtenerPronosticoUbicacion(latitud, longitud);
  if (!datos || !datos.hourly) return null;

  const indice = datos.hourly.time.findIndex((t) => t.startsWith(`${referencia.fecha}T${String(referencia.hora).padStart(2, '0')}:00`));
  if (indice === -1) return null;

  const probabilidadLluvia = datos.hourly.precipitation_probability[indice];
  if (probabilidadLluvia == null) return null;

  return { favorable: probabilidadLluvia <= UMBRAL_PROBABILIDAD_LLUVIA, probabilidadLluvia };
}
