import { estado, persistirYNotificar } from '../assets/js/almacenamiento.js';
import { escaparHtml, arbolCategorias } from '../assets/js/utilidades.js';
import { abrirDialogoCategoria } from '../assets/js/formularios-entidades.js';
import { agregarBotonFlotante } from '../assets/js/boton-flotante.js';

// Categorías colapsadas (ocultan a sus hijas): preferencia de esta pestaña mientras dura la sesión, no un dato de
// la app. Expandido por defecto.
let colapsados = new Set();

export function renderVistaCategorias(contenedor) {
  contenedor.innerHTML = `
    <h2>🗂️ Categorías</h2>
    <p class="ayuda">Las categorías representan áreas de tu vida (Personal, Facultad, Trabajo...). Pueden anidarse eligiendo una categoría padre, sin límite de niveles.</p>
    <div id="lista-categorias" class="lista-categorias"></div>
  `;

  agregarBotonFlotante(contenedor, { titulo: 'Crear una categoría nueva', alClic: () => abrirDialogoCategoria() });

  const listaCategorias = contenedor.querySelector('#lista-categorias');
  if (estado.categorias.length === 0) {
    listaCategorias.innerHTML = '<p class="mensaje-vacio">Todavía no creaste ninguna categoría.</p>';
    return;
  }

  const redibujar = () => renderVistaCategorias(contenedor);

  // Lista plana en preorden (arbolCategorias): una rama colapsada se salta mientras la profundidad siga siendo
  // mayor a la de la categoría que la ocultó.
  let profundidadOculta = null;
  arbolCategorias(estado.categorias).forEach(({ categoria, profundidad }) => {
    if (profundidadOculta !== null) {
      if (profundidad > profundidadOculta) return;
      profundidadOculta = null;
    }
    const tieneHijas = estado.categorias.some((c) => c.categoria_padre_id === categoria.categoria_id);
    const colapsada = tieneHijas && colapsados.has(categoria.categoria_id);
    listaCategorias.appendChild(renderCategoria(categoria, profundidad, tieneHijas, colapsada, redibujar));
    if (colapsada) profundidadOculta = profundidad;
  });
}

function renderCategoria(categoria, profundidad, tieneHijas, colapsada, redibujar) {
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
      <strong>
        ${tieneHijas ? `<button type="button" class="boton-colapsar" data-accion="colapsar" title="${colapsada ? 'Mostrar' : 'Ocultar'} las categorías hijas" aria-label="${colapsada ? 'Mostrar' : 'Ocultar'} las categorías hijas">${colapsada ? '▸' : '▾'}</button>` : ''}
        ${escaparHtml(categoria.categoria_nombre)}
      </strong>
      <span class="acciones-prioridad">
        <button type="button" data-accion="subir-prioridad" title="Subir prioridad" ${indice === 0 ? 'disabled' : ''}>▲</button>
        <button type="button" data-accion="bajar-prioridad" title="Bajar prioridad" ${indice === hermanos.length - 1 ? 'disabled' : ''}>▼</button>
        <button type="button" data-accion="agregar-hija" title="Crear una categoría hija de esta">➕ Agregar categoría hija</button>
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

  tarjeta.querySelector('[data-accion="colapsar"]')?.addEventListener('click', () => {
    if (colapsados.has(categoria.categoria_id)) colapsados.delete(categoria.categoria_id);
    else colapsados.add(categoria.categoria_id);
    redibujar();
  });

  tarjeta.querySelector('[data-accion="agregar-hija"]').addEventListener('click', () => abrirDialogoCategoria({ padreIdInicial: categoria.categoria_id }));

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
