import { estado, persistirYNotificar } from '../assets/js/almacenamiento.js';
import { crearPersona } from '../assets/js/modelos.js';
import { escaparHtml, formatearFecha, hoyISO, diasEntreFechas } from '../assets/js/utilidades.js';

function diasDesdeContacto(persona) {
  if (!persona.ultimo_contacto) return Infinity;
  return diasEntreFechas(persona.ultimo_contacto, hoyISO());
}

export function renderVistaPersonas(contenedor) {
  contenedor.innerHTML = `
    <h2>Personas</h2>
    <p class="ayuda">Hace cuánto no te reunís con cada persona, ordenado de mayor a menor tiempo — para no perder el contacto con quienes importan.</p>
    <form id="form-nueva-persona" class="formulario-en-linea">
      <input type="text" name="nombre" placeholder="Nombre" required />
      <label>Último contacto <input type="date" name="ultimo_contacto" /></label>
      <input type="text" name="notas" placeholder="Notas (opcional, ej. hermana)" />
      <button type="submit">Agregar persona</button>
    </form>
    <div id="lista-personas" class="lista-categorias"></div>
  `;

  contenedor.querySelector('#form-nueva-persona').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const formulario = evento.target;
    const nombre = formulario.nombre.value.trim();
    if (!nombre) return;
    estado.personas.push(
      crearPersona({
        nombre,
        ultimo_contacto: formulario.ultimo_contacto.value,
        notas: formulario.notas.value.trim(),
      })
    );
    await persistirYNotificar();
  });

  const listaPersonas = contenedor.querySelector('#lista-personas');
  if (estado.personas.length === 0) {
    listaPersonas.innerHTML = '<p class="mensaje-vacio">Todavía no agregaste ninguna persona.</p>';
    return;
  }

  estado.personas
    .slice()
    .sort((a, b) => diasDesdeContacto(b) - diasDesdeContacto(a))
    .forEach((persona) => listaPersonas.appendChild(renderPersona(persona)));
}

function renderPersona(persona) {
  const dias = diasDesdeContacto(persona);

  const tarjeta = document.createElement('article');
  tarjeta.className = 'tarjeta-categoria';
  tarjeta.innerHTML = `
    <div class="encabezado-categoria">
      <strong>${escaparHtml(persona.nombre)}</strong>
      <button type="button" data-accion="eliminar-persona" title="Eliminar persona">✕</button>
    </div>
    <span class="etiquetas">
      <span class="etiqueta-fecha">
        ${dias === Infinity ? 'Todavía no registraste un contacto' : `Hace ${dias} día(s)`}
      </span>
      ${persona.ultimo_contacto ? `<span class="etiqueta-fecha">Último: ${formatearFecha(persona.ultimo_contacto)}</span>` : ''}
    </span>
    ${persona.notas ? `<p class="notas-tarea">${escaparHtml(persona.notas)}</p>` : ''}
    <button type="button" data-accion="marcar-contacto" class="boton-primario">Marcar contacto hoy</button>
  `;

  tarjeta.querySelector('[data-accion="marcar-contacto"]').addEventListener('click', async () => {
    persona.ultimo_contacto = hoyISO();
    await persistirYNotificar();
  });

  tarjeta.querySelector('[data-accion="eliminar-persona"]').addEventListener('click', async () => {
    if (!confirm(`¿Eliminar a "${persona.nombre}"?`)) return;
    estado.personas = estado.personas.filter((p) => p.id !== persona.id);
    await persistirYNotificar();
  });

  return tarjeta;
}
