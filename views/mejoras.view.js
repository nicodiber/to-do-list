import { estado, persistirYNotificar } from '../assets/js/almacenamiento.js';
import { escaparHtml, formatearFecha, diaLocal } from '../assets/js/utilidades.js';
import { abrirDialogoFormulario } from '../assets/js/dialogo-formulario.js';

// Qué notas se ven: las que todavía no se aplicaron (por defecto), las aplicadas o todas.
let filtro = 'pendientes';

const FILTROS = [
  { clave: 'pendientes', etiqueta: '🕓 Pendientes', cuenta: (m) => !m.mejora_aplicada },
  { clave: 'aplicadas', etiqueta: '✅ Aplicadas', cuenta: (m) => m.mejora_aplicada },
  { clave: 'todas', etiqueta: '📋 Todas', cuenta: () => true },
];

/** Las notas de mejora de las tareas de mantenimiento, para repasarlas, marcarlas como aplicadas, corregirlas o borrarlas. */
export function renderVistaMejoras(contenedor) {
  const mejoras = estado.mejoras || [];
  const visibles = mejoras.filter(FILTROS.find((f) => f.clave === filtro).cuenta);
  const porTarea = new Map();
  visibles.forEach((m) => porTarea.set(m.mejora_tarea_nombre, [...(porTarea.get(m.mejora_tarea_nombre) || []), m]));
  const nombres = [...porTarea.keys()].sort((a, b) => a.localeCompare(b, 'es'));

  contenedor.innerHTML = `
    <h2>💡 Mejoras</h2>
    <p class="ayuda">Las notas que dejás al cumplir una tarea de mantenimiento ("¿qué podrías mejorar la próxima vez?"). Repasalas y marcalas como aplicadas cuando ya las incorporaste.</p>
    <div class="selector-rango" role="group" aria-label="Filtro">
      ${FILTROS.map((f) => `<button type="button" data-filtro="${f.clave}" title="Mostrar las notas ${f.etiqueta.toLowerCase()}" class="${f.clave === filtro ? 'activo' : ''}">${f.etiqueta} (${mejoras.filter(f.cuenta).length})</button>`).join('')}
    </div>
    <div class="lista-mejoras"></div>
  `;

  contenedor.querySelectorAll('.selector-rango button').forEach((boton) => {
    boton.addEventListener('click', () => {
      filtro = boton.dataset.filtro;
      renderVistaMejoras(contenedor);
    });
  });

  const lista = contenedor.querySelector('.lista-mejoras');
  if (nombres.length === 0) {
    lista.innerHTML = `<p class="mensaje-vacio">${
      mejoras.length === 0
        ? 'Todavía no hay notas de mejora: aparecen cuando cumplís una tarea de mantenimiento y anotás qué mejorar.'
        : 'No hay notas en este filtro.'
    }</p>`;
    return;
  }
  nombres.forEach((nombre) => {
    const seccion = document.createElement('section');
    seccion.innerHTML = `<h3>🔁 ${escaparHtml(nombre)}</h3><ul class="lista-tareas"></ul>`;
    const ul = seccion.querySelector('ul');
    porTarea
      .get(nombre)
      .sort((a, b) => b.mejora_fecha.localeCompare(a.mejora_fecha))
      .forEach((mejora) => ul.appendChild(renderMejora(mejora)));
    lista.appendChild(seccion);
  });
}

function renderMejora(mejora) {
  const li = document.createElement('li');
  li.className = 'item-tarea item-mejora' + (mejora.mejora_aplicada ? ' aplicada' : '');
  li.innerHTML = `
    <div class="item-tarea-info">
      <p class="texto-mejora">${escaparHtml(mejora.mejora_texto)}</p>
      <span class="etiquetas">
        <span class="etiqueta-fecha">${formatearFecha(diaLocal(mejora.mejora_fecha))}</span>
        ${mejora.mejora_aplicada ? '<span class="etiqueta-fecha etiqueta-exportada">✓ Aplicada</span>' : ''}
      </span>
    </div>
    <div class="item-tarea-acciones">
      <button title="Marcar la nota como aplicada o volver a dejarla pendiente" type="button" data-accion="alternar">${mejora.mejora_aplicada ? '↩️ Volver a pendiente' : '✅ Marcar aplicada'}</button>
      <button title="Editar la tarea" type="button" data-accion="editar">✏️ Editar</button>
      <button title="Eliminar (pide confirmación)" type="button" data-accion="eliminar">🗑️ Eliminar</button>
    </div>
  `;

  li.querySelector('[data-accion="alternar"]').addEventListener('click', async () => {
    mejora.mejora_aplicada = !mejora.mejora_aplicada;
    await persistirYNotificar();
  });
  li.querySelector('[data-accion="editar"]').addEventListener('click', () => abrirEdicionMejora(mejora.mejora_id));
  li.querySelector('[data-accion="eliminar"]').addEventListener('click', async () => {
    if (!confirm('¿Eliminar esta nota de mejora?')) return;
    estado.mejoras = estado.mejoras.filter((m) => m.mejora_id !== mejora.mejora_id);
    await persistirYNotificar();
  });
  return li;
}

function abrirEdicionMejora(id) {
  const mejora = estado.mejoras.find((m) => m.mejora_id === id);
  if (!mejora) return;
  abrirDialogoFormulario({
    titulo: `Mejora de «${mejora.mejora_tarea_nombre}»`,
    cuerpoHtml: `<label>¿Qué podrías mejorar la próxima vez?
      <textarea name="mejora_texto" rows="4"></textarea>
    </label>`,
    conectar: (formulario) => {
      formulario.mejora_texto.value = mejora.mejora_texto;
    },
    alGuardar: async (formulario) => {
      const texto = formulario.mejora_texto.value.trim();
      if (!texto) {
        alert('La nota no puede quedar vacía: si ya no sirve, eliminala.');
        return false;
      }
      // Se busca por id al guardar: si llegaron cambios de otro dispositivo, el objeto pudo haberse reemplazado.
      const actual = estado.mejoras.find((m) => m.mejora_id === id);
      if (!actual) {
        alert('Esta nota ya no existe (se eliminó mientras la editabas).');
        return true;
      }
      actual.mejora_texto = texto;
      await persistirYNotificar();
      return true;
    },
  });
}
