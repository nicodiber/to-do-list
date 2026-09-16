import { estado, persistirYNotificar } from '../assets/js/almacenamiento.js';
import { crearUbicacion } from '../assets/js/modelos.js';
import { escaparHtml } from '../assets/js/utilidades.js';

export function renderVistaUbicaciones(contenedor) {
  contenedor.innerHTML = `
    <h2>Ubicaciones</h2>
    <p class="ayuda">Cada ubicación tiene una latitud/longitud asociada, para poder chequear el clima real de las tareas que la usan (ej. "Casa", "Facultad").</p>
    <form id="form-nueva-ubicacion" class="formulario-en-linea">
      <input type="text" name="ubicacion_nombre" placeholder="Nombre (ej. Casa)" required />
      <input type="number" name="ubicacion_latitud" placeholder="Latitud" step="any" min="-90" max="90" required />
      <input type="number" name="ubicacion_longitud" placeholder="Longitud" step="any" min="-180" max="180" required />
      <button type="submit">Agregar ubicación</button>
    </form>
    <div id="lista-ubicaciones" class="lista-categorias"></div>
  `;

  contenedor.querySelector('#form-nueva-ubicacion').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const formulario = evento.target;
    const nombre = formulario.ubicacion_nombre.value.trim();
    const latitud = Number(formulario.ubicacion_latitud.value);
    const longitud = Number(formulario.ubicacion_longitud.value);
    if (!nombre || Number.isNaN(latitud) || Number.isNaN(longitud)) return;
    estado.ubicaciones.push(crearUbicacion({ ubicacion_nombre: nombre, ubicacion_latitud: latitud, ubicacion_longitud: longitud }));
    await persistirYNotificar();
  });

  const listaUbicaciones = contenedor.querySelector('#lista-ubicaciones');
  if (estado.ubicaciones.length === 0) {
    listaUbicaciones.innerHTML = '<p class="mensaje-vacio">Todavía no creaste ninguna ubicación.</p>';
    return;
  }

  estado.ubicaciones.forEach((ubicacion) => listaUbicaciones.appendChild(renderUbicacion(ubicacion)));
}

function renderUbicacion(ubicacion) {
  const tarjeta = document.createElement('article');
  tarjeta.className = 'tarjeta-categoria';
  tarjeta.innerHTML = `
    <div class="encabezado-categoria">
      <strong>${escaparHtml(ubicacion.ubicacion_nombre)}</strong>
      <button type="button" data-accion="eliminar-ubicacion" title="Eliminar ubicación">✕</button>
    </div>
    <p class="notas-tarea">Lat: ${ubicacion.ubicacion_latitud}, Lon: ${ubicacion.ubicacion_longitud}</p>
  `;

  tarjeta.querySelector('[data-accion="eliminar-ubicacion"]').addEventListener('click', async () => {
    if (!confirm(`¿Eliminar la ubicación "${ubicacion.ubicacion_nombre}"? Las tareas asociadas quedan sin ubicación.`)) return;
    estado.tareas.forEach((tarea) => {
      if (tarea.ubicacion_id === ubicacion.ubicacion_id) tarea.ubicacion_id = null;
    });
    estado.ubicaciones = estado.ubicaciones.filter((u) => u.ubicacion_id !== ubicacion.ubicacion_id);
    await persistirYNotificar();
  });

  return tarjeta;
}
