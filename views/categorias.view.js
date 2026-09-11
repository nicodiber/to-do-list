import { estado, persistirYNotificar } from '../assets/js/almacenamiento.js';
import { crearCategoria, crearSubcategoria } from '../assets/js/modelos.js';
import { escaparHtml } from '../assets/js/utilidades.js';

export function renderVistaCategorias(contenedor) {
  contenedor.innerHTML = `
    <h2>Categorías</h2>
    <p class="ayuda">Las categorías representan áreas de tu vida (Personal, Facultad, Trabajo...). Cada una puede tener subcategorías.</p>
    <form id="form-nueva-categoria" class="formulario-en-linea">
      <input type="text" name="nombre" placeholder="Nueva categoría" required />
      <input type="color" name="color" value="#4f7cff" />
      <button type="submit">Agregar categoría</button>
    </form>
    <div id="lista-categorias" class="lista-categorias"></div>
  `;

  contenedor.querySelector('#form-nueva-categoria').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const formulario = evento.target;
    const nombre = formulario.nombre.value.trim();
    if (!nombre) return;
    estado.categorias.push(
      crearCategoria({ nombre, color: formulario.color.value, orden: estado.categorias.length })
    );
    await persistirYNotificar();
  });

  const listaCategorias = contenedor.querySelector('#lista-categorias');
  if (estado.categorias.length === 0) {
    listaCategorias.innerHTML = '<p class="mensaje-vacio">Todavía no creaste ninguna categoría.</p>';
    return;
  }

  const categoriasOrdenadas = estado.categorias.slice().sort((a, b) => a.orden - b.orden);
  categoriasOrdenadas.forEach((categoria, indice) =>
    listaCategorias.appendChild(renderCategoria(categoria, indice, categoriasOrdenadas))
  );
}

function renderCategoria(categoria, indice, categoriasOrdenadas) {
  const subcategorias = estado.subcategorias.filter((s) => s.categoria_id === categoria.id);

  const tarjeta = document.createElement('article');
  tarjeta.className = 'tarjeta-categoria';
  tarjeta.style.borderLeftColor = categoria.color;
  tarjeta.innerHTML = `
    <div class="encabezado-categoria">
      <strong>${escaparHtml(categoria.nombre)}</strong>
      <span class="acciones-prioridad">
        <button type="button" data-accion="subir-prioridad" title="Subir prioridad" ${indice === 0 ? 'disabled' : ''}>▲</button>
        <button type="button" data-accion="bajar-prioridad" title="Bajar prioridad" ${indice === categoriasOrdenadas.length - 1 ? 'disabled' : ''}>▼</button>
        <button type="button" data-accion="eliminar-categoria" title="Eliminar categoría">✕</button>
      </span>
    </div>
    <ul class="lista-subcategorias">
      ${subcategorias
        .map(
          (sub) => `
            <li>
              ${escaparHtml(sub.nombre)}
              <button type="button" data-accion="eliminar-subcategoria" data-id="${sub.id}" title="Eliminar subcategoría">✕</button>
            </li>`
        )
        .join('')}
    </ul>
    <form data-accion="nueva-subcategoria" class="formulario-en-linea">
      <input type="text" name="nombre" placeholder="Nueva subcategoría" required />
      <button type="submit">+</button>
    </form>
  `;

  function intercambiarPrioridad(indiceAdyacente) {
    return async () => {
      const adyacente = categoriasOrdenadas[indiceAdyacente];
      if (!adyacente) return;
      const ordenPropio = categoria.orden;
      categoria.orden = adyacente.orden;
      adyacente.orden = ordenPropio;
      await persistirYNotificar();
    };
  }

  tarjeta.querySelector('[data-accion="subir-prioridad"]').addEventListener('click', intercambiarPrioridad(indice - 1));
  tarjeta.querySelector('[data-accion="bajar-prioridad"]').addEventListener('click', intercambiarPrioridad(indice + 1));

  tarjeta.querySelector('[data-accion="eliminar-categoria"]').addEventListener('click', async () => {
    if (
      !confirm(
        `¿Eliminar la categoría "${categoria.nombre}" y sus subcategorías? Las tareas asociadas quedan sin categoría.`
      )
    ) {
      return;
    }
    estado.subcategorias = estado.subcategorias.filter((s) => s.categoria_id !== categoria.id);
    estado.tareas.forEach((tarea) => {
      if (tarea.categoria_id === categoria.id) {
        tarea.categoria_id = null;
        tarea.subcategoria_id = null;
      }
    });
    estado.categorias = estado.categorias.filter((c) => c.id !== categoria.id);
    await persistirYNotificar();
  });

  tarjeta.querySelectorAll('[data-accion="eliminar-subcategoria"]').forEach((boton) => {
    boton.addEventListener('click', async () => {
      const id = boton.dataset.id;
      estado.subcategorias = estado.subcategorias.filter((s) => s.id !== id);
      estado.tareas.forEach((tarea) => {
        if (tarea.subcategoria_id === id) tarea.subcategoria_id = null;
      });
      await persistirYNotificar();
    });
  });

  tarjeta.querySelector('[data-accion="nueva-subcategoria"]').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const nombre = evento.target.nombre.value.trim();
    if (!nombre) return;
    estado.subcategorias.push(crearSubcategoria({ nombre, categoria_id: categoria.id }));
    await persistirYNotificar();
  });

  return tarjeta;
}
