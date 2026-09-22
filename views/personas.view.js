import { estado, persistirYNotificar } from '../assets/js/almacenamiento.js';
import { abrirDialogoPersona } from '../assets/js/formularios-entidades.js';
import { agregarBotonFlotante } from '../assets/js/boton-flotante.js';
import { escaparHtml, formatearFecha, hoyISO, diasEntreFechas } from '../assets/js/utilidades.js';

function diasDesdeContacto(persona) {
  if (!persona.persona_ultimo_contacto) return Infinity;
  return diasEntreFechas(persona.persona_ultimo_contacto, hoyISO());
}

export function renderVistaPersonas(contenedor) {
  contenedor.innerHTML = `
    <h2>👥 Personas</h2>
    <p class="ayuda">Hace cuánto no te reunís con cada persona, ordenado de mayor a menor tiempo — para no perder el contacto con quienes importan.</p>
    <div id="lista-personas" class="lista-categorias"></div>
  `;

  agregarBotonFlotante(contenedor, { titulo: 'Agregar una persona', alClic: () => abrirDialogoPersona() });

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
      <strong>${escaparHtml(persona.persona_nombre)}</strong>
      <span class="acciones-prioridad">
        <button type="button" data-accion="editar-persona" title="Editar persona y último contacto">✏️ Editar</button>
        <button type="button" data-accion="eliminar-persona" title="Eliminar persona">🗑️</button>
      </span>
    </div>
    <span class="etiquetas">
      <span class="etiqueta-fecha">
        ${dias === Infinity ? 'Todavía no registraste un contacto' : `Hace ${dias} día(s)`}
      </span>
      ${persona.persona_ultimo_contacto ? `<span class="etiqueta-fecha">Último: ${formatearFecha(persona.persona_ultimo_contacto)}</span>` : ''}
      ${persona.persona_proximo_contacto ? `<span class="etiqueta-fecha">📅 Próximo: ${formatearFecha(persona.persona_proximo_contacto)}</span>` : ''}
    </span>
    <button title="Anotar que hoy tuviste contacto con esta persona" type="button" data-accion="marcar-contacto" class="boton-primario">🤝 Marcar contacto hoy</button>
  `;

  tarjeta.querySelector('[data-accion="editar-persona"]').addEventListener('click', () => abrirDialogoPersona({ id: persona.persona_id }));

  tarjeta.querySelector('[data-accion="marcar-contacto"]').addEventListener('click', async () => {
    persona.persona_ultimo_contacto = hoyISO();
    await persistirYNotificar();
  });

  tarjeta.querySelector('[data-accion="eliminar-persona"]').addEventListener('click', async () => {
    if (!confirm(`¿Eliminar a "${persona.persona_nombre}"? Las tareas asociadas quedan sin persona.`)) return;
    estado.tareas.forEach((tarea) => {
      if (tarea.persona_id === persona.persona_id) tarea.persona_id = null;
    });
    estado.personas = estado.personas.filter((p) => p.persona_id !== persona.persona_id);
    await persistirYNotificar();
  });

  return tarjeta;
}
