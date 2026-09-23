// Geocoding (buscar una dirección o un lugar y obtener sus coordenadas): Nominatim de OpenStreetMap, gratis y sin
// API key, mismo criterio que Open-Meteo para el clima (`clima.js`). Se usa solo para completar latitud/longitud al
// cargar una Ubicación; la carga manual sigue siendo la alternativa siempre disponible.

const LARGO_MINIMO = 3;
const cacheResultados = new Map();

/**
 * Hasta 5 lugares que coinciden con `texto`, como `{ nombre, latitud, longitud }`. `[]` con texto muy corto, sin
 * resultados, sin conexión o si falla la consulta — nunca lanza, para no romper el formulario de Ubicación.
 */
export async function buscarLugares(texto) {
  const consulta = String(texto || '').trim();
  if (consulta.length < LARGO_MINIMO) return [];
  if (cacheResultados.has(consulta)) return cacheResultados.get(consulta);

  const params = new URLSearchParams({ format: 'jsonv2', limit: '5', q: consulta });
  const promesa = fetch(`https://nominatim.openstreetmap.org/search?${params}`)
    .then((respuesta) => (respuesta.ok ? respuesta.json() : []))
    .then((datos) => (Array.isArray(datos) ? datos.map((d) => ({ nombre: d.display_name, latitud: Number(d.lat), longitud: Number(d.lon) })) : []))
    .catch(() => []);

  cacheResultados.set(consulta, promesa);
  return promesa;
}
