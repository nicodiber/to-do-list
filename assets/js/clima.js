import { estado } from './almacenamiento.js';
import { hoyISO, fechaISOMasDias, tieneHora } from './utilidades.js';

const DIAS_MAX_PRONOSTICO = 16;
const UMBRAL_PROBABILIDAD_LLUVIA = 50;

const cachePronosticos = new Map();

function fechaDeReferencia(tarea) {
  if (tarea.tarea_fecha_sugerida) {
    return tieneHora(tarea.tarea_fecha_sugerida)
      ? { fecha: tarea.tarea_fecha_sugerida.slice(0, 10), hora: new Date(tarea.tarea_fecha_sugerida).getHours() }
      : { fecha: tarea.tarea_fecha_sugerida, hora: 12 };
  }
  if (tarea.tarea_fecha_limite) {
    return tieneHora(tarea.tarea_fecha_limite)
      ? { fecha: tarea.tarea_fecha_limite.slice(0, 10), hora: new Date(tarea.tarea_fecha_limite).getHours() }
      : { fecha: tarea.tarea_fecha_limite, hora: 12 };
  }
  return null;
}

async function obtenerPronosticoUbicacion(latitud, longitud) {
  const clave = `${latitud},${longitud}`;
  if (cachePronosticos.has(clave)) return cachePronosticos.get(clave);

  const promesa = fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${latitud}&longitude=${longitud}&hourly=precipitation_probability&timezone=auto&forecast_days=${DIAS_MAX_PRONOSTICO}`
  )
    .then((respuesta) => (respuesta.ok ? respuesta.json() : null))
    .catch(() => null);

  cachePronosticos.set(clave, promesa);
  return promesa;
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

  const ubicacion = estado.ubicaciones.find((u) => u.ubicacion_id === tarea.ubicacion_id);
  if (!ubicacion || ubicacion.ubicacion_latitud == null || ubicacion.ubicacion_longitud == null) return null;

  const referencia = fechaDeReferencia(tarea);
  if (!referencia) return null;

  const hoy = hoyISO();
  const limite = fechaISOMasDias(DIAS_MAX_PRONOSTICO - 1, hoy);
  if (referencia.fecha < hoy || referencia.fecha > limite) return null;

  const datos = await obtenerPronosticoUbicacion(ubicacion.ubicacion_latitud, ubicacion.ubicacion_longitud);
  if (!datos || !datos.hourly) return null;

  const indice = datos.hourly.time.findIndex((t) => t.startsWith(`${referencia.fecha}T${String(referencia.hora).padStart(2, '0')}:00`));
  if (indice === -1) return null;

  const probabilidadLluvia = datos.hourly.precipitation_probability[indice];
  if (probabilidadLluvia == null) return null;

  return { favorable: probabilidadLluvia <= UMBRAL_PROBABILIDAD_LLUVIA, probabilidadLluvia };
}
