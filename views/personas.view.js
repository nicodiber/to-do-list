import { estado, persistirYNotificar } from '../assets/js/almacenamiento.js';
import { abrirDialogoPersona } from '../assets/js/formularios-entidades.js';
import { escaparHtml, formatearFecha, hoyISO, diasEntreFechas } from '../assets/js/utilidades.js';

function diasDesdeContacto(persona) {
  if (!persona.persona_ultimo_contacto) return Infinity;
  return diasEntreFechas(persona.persona_ultimo_contacto, hoyISO());
}

export function renderVistaPersonas(contenedor) {
  contenedor.innerHTML = `
    <h2>👥 Personas</h2>
    <p class="ayuda">Hace cuánto no te reunís con cada persona, ordenado de mayor a menor tiempo — para no perder el contacto con quienes importan.</p>
    <div class="barra-acciones-vista"><button type="button" id="boton-nueva-persona" class="boton-primario">＋ Nueva persona</button></div>
    <div id="lista-personas" class="lista-categorias"></div>
  `;

  contenedor.querySelector('#boton-nueva-persona').addEventListener('click', () => abrirDialogoPersona());

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
    </span>
    <button type="button" data-accion="marcar-contacto" class="boton-primario">🤝 Marcar contacto hoy</button>
  `;

  tarjeta.querySelector('[data-accion="editar-persona"]').addEventListener('click', () => abrirDialogoPersona({ id: persona.persona_id }));

  tarjeta.querySelector('[data-accion="marcar-contacto"]').addEventListener('click', async () => {
    persona.persona_ultimo_contacto = hoyISO();
    await persistirYNotificar();
  });

  tarjeta.querySelector('[data-accion="eliminar-persona"]').addEventListener('click', async () => {
    if (!confirm(`¿Eliminar a "${persona.persona_nombre}"?`)) return;
    estado.personas = estado.personas.filter((p) => p.persona_id !== persona.persona_id);
    await persistirYNotificar();
  });

  return tarjeta;
}
