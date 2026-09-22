import { estado, persistirYNotificar } from '../assets/js/almacenamiento.js';
import { escaparHtml } from '../assets/js/utilidades.js';
import { abrirDialogoUbicacion } from '../assets/js/formularios-entidades.js';
import { agregarBotonFlotante } from '../assets/js/boton-flotante.js';

export function renderVistaUbicaciones(contenedor) {
  contenedor.innerHTML = `
    <h2>📍 Ubicaciones</h2>
    <p class="ayuda">Cada ubicación tiene una latitud/longitud asociada, para poder chequear el clima real de las tareas que la usan (ej. "Casa", "Facultad").</p>
    <div id="lista-ubicaciones" class="lista-categorias"></div>
  `;

  agregarBotonFlotante(contenedor, { titulo: 'Crear una ubicación nueva', alClic: () => abrirDialogoUbicacion() });

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
      <span class="acciones-prioridad">
        <button type="button" data-accion="editar-ubicacion" title="Editar ubicación">✏️ Editar</button>
        <button type="button" data-accion="eliminar-ubicacion" title="Eliminar ubicación">🗑️</button>
      </span>
    </div>
    <p class="notas-tarea">Lat: ${ubicacion.ubicacion_latitud}, Lon: ${ubicacion.ubicacion_longitud}</p>
  `;

  tarjeta.querySelector('[data-accion="editar-ubicacion"]').addEventListener('click', () => abrirDialogoUbicacion({ id: ubicacion.ubicacion_id }));

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
