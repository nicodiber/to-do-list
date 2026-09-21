import { estado, persistirYNotificar } from '../assets/js/almacenamiento.js';
import { escaparHtml, arbolCategorias } from '../assets/js/utilidades.js';
import { abrirDialogoCategoria } from '../assets/js/formularios-entidades.js';

export function renderVistaCategorias(contenedor) {
  contenedor.innerHTML = `
    <h2>🗂️ Categorías</h2>
    <p class="ayuda">Las categorías representan áreas de tu vida (Personal, Facultad, Trabajo...). Pueden anidarse eligiendo una categoría padre, sin límite de niveles.</p>
    <div class="barra-acciones-vista"><button title="Crear una categoría nueva" type="button" id="boton-nueva-categoria" class="boton-primario">＋ Nueva categoría</button></div>
    <div id="lista-categorias" class="lista-categorias"></div>
  `;

  contenedor.querySelector('#boton-nueva-categoria').addEventListener('click', () => abrirDialogoCategoria());

  const listaCategorias = contenedor.querySelector('#lista-categorias');
  if (estado.categorias.length === 0) {
    listaCategorias.innerHTML = '<p class="mensaje-vacio">Todavía no creaste ninguna categoría.</p>';
    return;
  }

  arbolCategorias(estado.categorias).forEach(({ categoria, profundidad }) =>
    listaCategorias.appendChild(renderCategoria(categoria, profundidad))
  );
}

function renderCategoria(categoria, profundidad) {
  const hermanos = estado.categorias
    .filter((c) => (c.categoria_padre_id || null) === (categoria.categoria_padre_id || null))
    .sort((a, b) => a.categoria_prioridad - b.categoria_prioridad);
  const indice = hermanos.findIndex((c) => c.categoria_id === categoria.categoria_id);

  const tarjeta = document.createElement('article');
  tarjeta.className = 'tarjeta-categoria';
  tarjeta.style.borderLeftColor = categoria.categoria_color;
  tarjeta.style.marginLeft = `${profundidad * 1.5}rem`;
  tarjeta.innerHTML = `
    <div class="encabezado-categoria">
      <strong>${escaparHtml(categoria.categoria_nombre)}</strong>
      <span class="acciones-prioridad">
        <button type="button" data-accion="subir-prioridad" title="Subir prioridad" ${indice === 0 ? 'disabled' : ''}>▲</button>
        <button type="button" data-accion="bajar-prioridad" title="Bajar prioridad" ${indice === hermanos.length - 1 ? 'disabled' : ''}>▼</button>
        <button type="button" data-accion="editar-categoria" title="Editar categoría">✏️ Editar</button>
        <button type="button" data-accion="eliminar-categoria" title="Eliminar categoría">🗑️</button>
      </span>
    </div>
    ${categoria.categoria_descripcion ? `<p class="notas-tarea">${escaparHtml(categoria.categoria_descripcion)}</p>` : ''}
    <p class="notas-tarea" title="Cuánto disfrutás las tareas de esta categoría">${'⭐'.repeat(categoria.categoria_disfrute || 3)}</p>
  `;

  function intercambiarPrioridad(indiceAdyacente) {
    return async () => {
      const adyacente = hermanos[indiceAdyacente];
      if (!adyacente) return;
      const prioridadPropia = categoria.categoria_prioridad;
      categoria.categoria_prioridad = adyacente.categoria_prioridad;
      adyacente.categoria_prioridad = prioridadPropia;
      await persistirYNotificar();
    };
  }

  tarjeta.querySelector('[data-accion="subir-prioridad"]').addEventListener('click', intercambiarPrioridad(indice - 1));
  tarjeta.querySelector('[data-accion="bajar-prioridad"]').addEventListener('click', intercambiarPrioridad(indice + 1));

  tarjeta.querySelector('[data-accion="editar-categoria"]').addEventListener('click', () => abrirDialogoCategoria({ id: categoria.categoria_id }));

  tarjeta.querySelector('[data-accion="eliminar-categoria"]').addEventListener('click', async () => {
    if (
      !confirm(
        `¿Eliminar la categoría "${categoria.categoria_nombre}"? Sus categorías hijas quedan promovidas (sin categoría padre) y las tareas asociadas quedan sin categoría.`
      )
    ) {
      return;
    }
    estado.categorias.forEach((c) => {
      if (c.categoria_padre_id === categoria.categoria_id) c.categoria_padre_id = null;
    });
    estado.tareas.forEach((tarea) => {
      if (tarea.categoria_id === categoria.categoria_id) tarea.categoria_id = null;
    });
    estado.categorias = estado.categorias.filter((c) => c.categoria_id !== categoria.categoria_id);
    await persistirYNotificar();
  });

  return tarjeta;
}
