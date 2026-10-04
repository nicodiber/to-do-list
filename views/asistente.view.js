// Asistente de IA (v0.106.0, etapa 1): chat con un modelo de Claude (con TU clave de API) que lee tus tareas y propone
// cambios. Nunca cambia nada solo: cada propuesta aparece como una tarjeta con los cambios resaltados, se puede ajustar a
// mano y se aprueba o rechaza una por una. La conversación vive en este módulo (no en el DOM) porque la app redibuja la vista
// cada vez que cambian los datos —por ejemplo, al aplicar una propuesta— y no puede perder lo que se estaba hablando.

import { estado } from '../assets/js/almacenamiento.js';
import { escaparHtml, arbolCategorias, caminoCategoria, formatearFechaOFechaHora } from '../assets/js/utilidades.js';
import {
  MODELOS_ASISTENTE,
  leerClaveAsistente,
  guardarClaveAsistente,
  leerModeloAsistente,
  guardarModeloAsistente,
  conversar,
  ErrorAsistente,
} from '../assets/js/asistente.js';
import { avisar, confirmar } from '../assets/js/avisos.js';

const CLAVE_VOZ = 'super-todo-list:asistente-voz';

const conv = {
  visibles: [], // {rol: 'usuario'|'asistente'|'sistema'|'error'|'propuesta', texto?, propuesta?}
  mensajes: [], // lo que se le manda a la API
  pensando: false,
  borrador: '',
  generacion: 0, // sube al reiniciar la conversación: lo que llega tarde de una anterior se ignora
  mostrarConfig: false,
  abortador: null,
};

function leerVoz() {
  try {
    return localStorage.getItem(CLAVE_VOZ) === '1';
  } catch {
    return false;
  }
}

function guardarVoz(activa) {
  try {
    localStorage.setItem(CLAVE_VOZ, activa ? '1' : '0');
  } catch {
    // Es solo una preferencia de este dispositivo.
  }
}

function leerEnVozAlta(texto) {
  if (!leerVoz() || typeof speechSynthesis === 'undefined') return;
  speechSynthesis.cancel();
  const frase = new SpeechSynthesisUtterance(texto.replace(/[*_`#]/g, ''));
  frase.lang = 'es-AR';
  speechSynthesis.speak(frase);
}

/** Texto del asistente a HTML seguro: negritas, listas simples y saltos de línea. */
function htmlTexto(texto) {
  const seguro = escaparHtml(texto).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  return seguro
    .split('\n')
    .map((linea) => (/^\s*[-•]\s+/.test(linea) ? `<span class="item-chat">• ${linea.replace(/^\s*[-•]\s+/, '')}</span>` : linea))
    .join('<br>')
    .replace(/<\/span><br>/g, '</span>');
}

// ---------- Configuración (también se usa desde Configuraciones)

/** HTML del bloque de clave y modelo. */
export function htmlConfigAsistente() {
  const clave = leerClaveAsistente();
  const modelo = leerModeloAsistente();
  return `
    <div class="config-asistente">
      <p class="ayuda">El asistente usa <strong>tu propia clave de API de Anthropic</strong> (la creás en <code>console.anthropic.com</code>; el uso se cobra a tu cuenta de Anthropic, no a STDL). La clave se guarda <strong>solo en este navegador</strong> —nunca en tu Drive ni en el repositorio— y las consultas salen directo de tu navegador a Anthropic. Cuando le preguntás algo, el asistente recibe las tareas que necesita para responderte.</p>
      <div class="acciones-config">
        <label>🔑 Clave de API
          <input type="password" id="asistente-clave" autocomplete="off" spellcheck="false" placeholder="${clave ? '•••••••• (guardada en este navegador)' : 'sk-ant-…'}" style="min-width: 16rem" />
        </label>
        <label>🧠 Modelo
          <select id="asistente-modelo">${MODELOS_ASISTENTE.map((m) => `<option value="${m.id}" ${m.id === modelo ? 'selected' : ''}>${escaparHtml(m.etiqueta)}</option>`).join('')}</select>
        </label>
        <button type="button" id="asistente-guardar" class="boton-primario">💾 Guardar</button>
        ${clave ? '<button type="button" id="asistente-quitar" title="Borrar la clave de este navegador">🗑️ Quitar clave</button>' : ''}
      </div>
    </div>`;
}

/** Conecta el bloque de `htmlConfigAsistente` dentro de `raiz`; `alCambiar` se llama tras guardar o quitar. */
export function conectarConfigAsistente(raiz, alCambiar) {
  raiz.querySelector('#asistente-modelo')?.addEventListener('change', (evento) => guardarModeloAsistente(evento.target.value));
  raiz.querySelector('#asistente-guardar')?.addEventListener('click', async () => {
    const nueva = raiz.querySelector('#asistente-clave').value.trim();
    guardarModeloAsistente(raiz.querySelector('#asistente-modelo').value);
    if (nueva) {
      if (!/^sk-ant-/.test(nueva)) {
        await avisar('Esa clave no parece de Anthropic (empiezan con «sk-ant-»). Revisala en console.anthropic.com.');
        return;
      }
      guardarClaveAsistente(nueva);
    }
    alCambiar();
  });
  raiz.querySelector('#asistente-quitar')?.addEventListener('click', async () => {
    if (!(await confirmar('¿Borrar la clave de API de este navegador? Tendrás que cargarla de nuevo para usar el asistente.'))) return;
    guardarClaveAsistente('');
    alCambiar();
  });
}

// ---------- Propuestas

const TITULOS_PROPUESTA = { crear: '➕ Crear tarea', editar: '✏️ Editar tarea', completar: '✔️ Completar tarea', eliminar: '🗑️ Eliminar tarea' };

function partesFecha(valor) {
  const [fecha, hora] = String(valor || '').split('T');
  return { fecha: fecha || '', hora: hora || '' };
}

function textoValor(def, valor) {
  if (def.tipo === 'booleano') return valor ? 'sí' : 'no';
  if (def.tipo === 'categoria') {
    const c = (estado.categorias || []).find((x) => x.categoria_id === valor);
    return c ? caminoCategoria(c, estado.categorias) : '—';
  }
  if (def.tipo === 'numero') return valor ? String(valor) : '—';
  if (def.tipo === 'fecha') return valor ? formatearFechaOFechaHora(valor) : '—';
  return String(valor || '').trim() || '—';
}

function htmlEditor(def, valor, id) {
  const comun = `data-propuesta="${id}" data-clave="${def.clave}"`;
  if (def.tipo === 'textarea') return `<textarea ${comun} rows="2">${escaparHtml(valor)}</textarea>`;
  if (def.tipo === 'texto') return `<input type="text" ${comun} value="${escaparHtml(valor)}" />`;
  if (def.tipo === 'numero') return `<input type="number" ${comun} min="0" step="5" value="${valor || ''}" style="width: 5rem" />`;
  if (def.tipo === 'booleano') return `<input type="checkbox" ${comun} ${valor ? 'checked' : ''} />`;
  if (def.tipo === 'categoria') {
    const opciones = arbolCategorias(estado.categorias || []).map(({ categoria, profundidad }) => `<option value="${categoria.categoria_id}" ${categoria.categoria_id === valor ? 'selected' : ''}>${'— '.repeat(profundidad)}${escaparHtml(categoria.categoria_nombre)}</option>`);
    return `<select ${comun}><option value="">(sin categoría)</option>${opciones.join('')}</select>`;
  }
  const { fecha, hora } = partesFecha(valor);
  return `<span class="par-fecha-hora"><input type="date" ${comun} data-parte="fecha" value="${fecha}" /><input type="time" ${comun} data-parte="hora" value="${hora}" title="Hora (opcional)" /></span>`;
}

function htmlPropuesta(p) {
  const encabezado = `<header class="propuesta-titulo">${TITULOS_PROPUESTA[p.tipo]}${p.tareaNombre ? ` · «${escaparHtml(p.tareaNombre)}»` : ''}</header>`;
  const motivo = p.motivo ? `<p class="propuesta-motivo">${escaparHtml(p.motivo)}</p>` : '';
  const avisos = p.avisos.map((a) => `<p class="propuesta-aviso">⚠️ ${escaparHtml(a)}</p>`).join('');
  if (p.estado !== 'pendiente') {
    const etiqueta = p.estado === 'aplicada' ? '✅ Aplicada' : p.estado === 'rechazada' ? '✖ Rechazada' : '⚠️ No se pudo aplicar';
    const detalle = p.tipo === 'crear' || p.tipo === 'editar' ? p.campos.filter((c) => c.despues !== c.antes && (c.despues || c.despues === 0)).map((c) => `${c.def.etiqueta}: ${escaparHtml(textoValor(c.def, c.despues))}`).join(' · ') : '';
    return `<article class="propuesta-asistente ${p.estado}">${encabezado}<p class="propuesta-estado">${etiqueta}${p.resuelta ? ` — ${escaparHtml(p.resuelta)}` : ''}</p>${p.estado === 'aplicada' && detalle ? `<p class="propuesta-detalle">${detalle}</p>` : ''}</article>`;
  }
  const filas =
    p.tipo === 'crear' || p.tipo === 'editar'
      ? `<table class="tabla-propuesta"><thead><tr><th>Campo</th>${p.tipo === 'editar' ? '<th>Ahora</th>' : ''}<th>${p.tipo === 'editar' ? 'Propuesto (editable)' : 'Valor (editable)'}</th></tr></thead><tbody>${p.campos
          .map((c, i) => `<tr data-fila="${i}" class="${c.despues !== c.antes ? 'cambiada' : ''}"><th scope="row">${c.def.etiqueta}</th>${p.tipo === 'editar' ? `<td class="valor-antes">${escaparHtml(textoValor(c.def, c.antes))}</td>` : ''}<td class="valor-despues">${htmlEditor(c.def, c.despues, p.id)}</td></tr>`)
          .join('')}</tbody></table>`
      : '';
  const peligro = p.tipo === 'eliminar' ? '<p class="propuesta-aviso">Se podrá deshacer con Ctrl+Z.</p>' : '';
  const aplicarTexto = p.tipo === 'crear' ? '✔️ Crear' : p.tipo === 'editar' ? '✔️ Aplicar cambios' : p.tipo === 'completar' ? '✔️ Completar' : '🗑️ Eliminar';
  return `<article class="propuesta-asistente pendiente" data-id="${p.id}">${encabezado}${motivo}${avisos}${peligro}${filas}<div class="acciones-propuesta"><button type="button" class="${p.tipo === 'eliminar' ? 'boton-peligro' : 'boton-primario'}" data-decidir="aplicar" data-propuesta="${p.id}">${aplicarTexto}</button><button type="button" data-decidir="rechazar" data-propuesta="${p.id}">✖ Rechazar</button></div></article>`;
}

// ---------- Vista

const EJEMPLOS = [
  'Cargá estas tareas: comprar yerba, llamar al dentista y pagar el alquiler antes del viernes',
  '¿Qué tengo para hoy y qué es lo más urgente?',
  'Pasá para la semana que viene todo lo de la categoría Casa',
];

export function renderVistaAsistente(contenedor) {
  const hayClave = !!leerClaveAsistente();
  const Reconocimiento = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

  const mensajes = conv.visibles
    .map((m) => {
      if (m.rol === 'propuesta') return htmlPropuesta(m.propuesta);
      if (m.rol === 'usuario') return `<div class="burbuja-chat usuario">${htmlTexto(m.texto)}</div>`;
      if (m.rol === 'error') return `<div class="burbuja-chat error">⚠️ ${escaparHtml(m.texto)}</div>`;
      if (m.rol === 'sistema') return `<div class="burbuja-chat sistema">${escaparHtml(m.texto)}</div>`;
      return `<div class="burbuja-chat asistente">${htmlTexto(m.texto)}</div>`;
    })
    .join('');
  const pendiente = conv.visibles.some((m) => m.rol === 'propuesta' && m.propuesta.estado === 'pendiente');

  contenedor.innerHTML = `
    <h2>🤖 Asistente</h2>
    <p class="ayuda">Contale en lenguaje natural qué querés hacer con tus tareas (por texto o por voz). El asistente <strong>propone</strong> cambios y vos los revisás, los ajustás si querés y los aprobás o rechazás <strong>uno por uno</strong>: no cambia nada solo.</p>
    <div class="acciones-config">
      <button type="button" id="asistente-nueva" title="Empezar una conversación desde cero">🆕 Nueva conversación</button>
      <button type="button" id="asistente-config" title="Clave de API y modelo">⚙️ Clave y modelo</button>
      <label class="interruptor-simple" title="Leer en voz alta las respuestas del asistente"><input type="checkbox" id="asistente-voz" ${leerVoz() ? 'checked' : ''} /> 🔊 Leer en voz alta</label>
    </div>
    ${!hayClave || conv.mostrarConfig ? `<section class="seccion-config">${htmlConfigAsistente()}</section>` : ''}
    <div class="chat-asistente" id="chat-asistente" aria-live="polite">
      ${mensajes || `<p class="ayuda">Probá con:</p><div class="ejemplos-asistente">${EJEMPLOS.map((e) => `<button type="button" data-ejemplo="${escaparHtml(e)}">${escaparHtml(e)}</button>`).join('')}</div>`}
      ${conv.pensando && !pendiente ? '<div class="burbuja-chat sistema">⏳ Pensando…</div>' : ''}
    </div>
    <form class="entrada-chat" id="form-chat">
      <textarea id="entrada-asistente" rows="2" placeholder="${hayClave ? 'Escribí o dictá lo que necesitás…' : 'Primero cargá tu clave de API (arriba)'}" ${hayClave ? '' : 'disabled'}>${escaparHtml(conv.borrador)}</textarea>
      ${Reconocimiento ? '<button type="button" class="boton-microfono" id="asistente-mic" title="Dictar (el audio lo procesa el servicio de voz de tu navegador)" aria-label="Dictar">🎤</button>' : ''}
      <button type="submit" class="boton-primario" id="asistente-enviar" ${hayClave && !conv.pensando ? '' : 'disabled'}>Enviar ➤</button>
    </form>`;

  const chat = contenedor.querySelector('#chat-asistente');
  chat.scrollTop = chat.scrollHeight;
  conectarConfigAsistente(contenedor, () => {
    conv.mostrarConfig = false;
    renderVistaAsistente(contenedor);
  });

  contenedor.querySelector('#asistente-config').addEventListener('click', () => {
    conv.mostrarConfig = !conv.mostrarConfig;
    renderVistaAsistente(contenedor);
  });
  contenedor.querySelector('#asistente-voz').addEventListener('change', (evento) => {
    guardarVoz(evento.target.checked);
    if (!evento.target.checked && typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
  });
  contenedor.querySelector('#asistente-nueva').addEventListener('click', async () => {
    if (conv.visibles.length > 0 && !(await confirmar('¿Empezar una conversación nueva? Se pierde la actual (lo ya aplicado a tus tareas se queda).'))) return;
    reiniciar();
    renderVistaAsistente(contenedor);
  });
  contenedor.querySelectorAll('[data-ejemplo]').forEach((boton) =>
    boton.addEventListener('click', () => {
      const entrada = contenedor.querySelector('#entrada-asistente');
      entrada.value = boton.dataset.ejemplo;
      conv.borrador = entrada.value;
      entrada.focus();
    })
  );

  const entrada = contenedor.querySelector('#entrada-asistente');
  entrada.addEventListener('input', () => {
    conv.borrador = entrada.value;
  });
  entrada.addEventListener('keydown', (evento) => {
    if (evento.key === 'Enter' && !evento.shiftKey) {
      evento.preventDefault();
      contenedor.querySelector('#form-chat').requestSubmit();
    }
  });
  contenedor.querySelector('#form-chat').addEventListener('submit', (evento) => {
    evento.preventDefault();
    const texto = entrada.value.trim();
    if (!texto || conv.pensando || !hayClave) return;
    enviar(contenedor, texto);
  });
  conectarDictado(contenedor, entrada, Reconocimiento);

  // Edición en vivo de las propuestas: los valores se guardan en la propuesta y se resalta lo que difiere de «ahora».
  chat.addEventListener('input', (evento) => alEditarPropuesta(evento));
  chat.addEventListener('change', (evento) => alEditarPropuesta(evento));
  chat.addEventListener('click', (evento) => {
    const boton = evento.target.closest('[data-decidir]');
    if (!boton) return;
    const propuesta = conv.visibles.find((m) => m.rol === 'propuesta' && m.propuesta.id === boton.dataset.propuesta)?.propuesta;
    if (!propuesta || propuesta.estado !== 'pendiente' || !propuesta.decidir) return;
    boton.closest('.acciones-propuesta').querySelectorAll('button').forEach((b) => (b.disabled = true));
    propuesta.decidir(boton.dataset.decidir);
  });
}

function alEditarPropuesta(evento) {
  const campo = evento.target.closest('[data-propuesta][data-clave]');
  if (!campo) return;
  const propuesta = conv.visibles.find((m) => m.rol === 'propuesta' && m.propuesta.id === campo.dataset.propuesta)?.propuesta;
  const celda = propuesta && propuesta.campos.find((c) => c.def.clave === campo.dataset.clave);
  if (!celda) return;
  const def = celda.def;
  if (def.tipo === 'booleano') celda.despues = campo.checked;
  else if (def.tipo === 'numero') celda.despues = Math.max(0, Math.round(Number(campo.value)) || 0);
  else if (def.tipo === 'fecha') {
    const fila = campo.closest('td');
    const fecha = fila.querySelector('[data-parte="fecha"]').value;
    const hora = fila.querySelector('[data-parte="hora"]').value;
    celda.despues = fecha ? (hora ? `${fecha}T${hora}` : fecha) : '';
  } else celda.despues = campo.value;
  campo.closest('tr').classList.toggle('cambiada', celda.despues !== celda.antes);
}

function conectarDictado(contenedor, entrada, Reconocimiento) {
  const boton = contenedor.querySelector('#asistente-mic');
  if (!boton || !Reconocimiento) return;
  let reconocimiento = null;
  const terminar = () => {
    boton.classList.remove('escuchando');
    boton.textContent = '🎤';
    reconocimiento = null;
  };
  boton.addEventListener('click', () => {
    if (reconocimiento) {
      reconocimiento.stop();
      return;
    }
    reconocimiento = new Reconocimiento();
    reconocimiento.lang = 'es-AR';
    reconocimiento.interimResults = true;
    reconocimiento.continuous = true;
    const previo = entrada.value.trim();
    reconocimiento.onresult = (evento) => {
      const dicho = [...evento.results].map((r) => r[0].transcript).join(' ').trim();
      entrada.value = [previo, dicho].filter(Boolean).join(' ');
      conv.borrador = entrada.value;
    };
    reconocimiento.onerror = (evento) => {
      terminar();
      if (evento.error === 'not-allowed' || evento.error === 'service-not-allowed') boton.title = 'No diste permiso para usar el micrófono (se puede cambiar en el candado de la barra de direcciones).';
    };
    reconocimiento.onend = terminar;
    boton.classList.add('escuchando');
    boton.textContent = '⏹';
    reconocimiento.start();
  });
}

function reiniciar() {
  conv.generacion += 1;
  conv.abortador?.abort();
  conv.abortador = null;
  // Las propuestas pendientes de la conversación anterior se descartan.
  conv.visibles.forEach((m) => {
    if (m.rol === 'propuesta' && m.propuesta.estado === 'pendiente') m.propuesta.decidir?.('rechazar');
  });
  conv.visibles = [];
  conv.mensajes = [];
  conv.pensando = false;
  conv.borrador = '';
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
}

/** Redibuja la vista si todavía es la que está en pantalla. */
function redibujar() {
  const contenedor = document.getElementById('vista');
  if (contenedor && contenedor.querySelector('#chat-asistente')) renderVistaAsistente(contenedor);
}

async function enviar(contenedor, texto) {
  const generacion = conv.generacion;
  const vigente = () => conv.generacion === generacion;
  conv.visibles.push({ rol: 'usuario', texto });
  conv.mensajes.push({ role: 'user', content: texto });
  conv.borrador = '';
  conv.pensando = true;
  conv.abortador = new AbortController();
  renderVistaAsistente(contenedor);
  try {
    await conversar({
      mensajes: conv.mensajes,
      signal: conv.abortador.signal,
      estaVigente: vigente,
      alTexto: (t) => {
        if (!vigente()) return;
        conv.visibles.push({ rol: 'asistente', texto: t });
        leerEnVozAlta(t);
        redibujar();
      },
      alConsultar: (t) => {
        if (!vigente()) return;
        conv.visibles.push({ rol: 'sistema', texto: t });
        redibujar();
      },
      alCambiar: () => vigente() && redibujar(),
      pedirConfirmacion: (propuesta) =>
        new Promise((resolver) => {
          if (!vigente()) {
            resolver('rechazar');
            return;
          }
          propuesta.decidir = (decision) => {
            if (propuesta.estado !== 'pendiente') return;
            if (decision !== 'aplicar') propuesta.estado = 'rechazada';
            propuesta.decidir = null;
            resolver(decision);
            if (decision !== 'aplicar') redibujar();
          };
          conv.visibles.push({ rol: 'propuesta', propuesta });
          redibujar();
        }),
    });
  } catch (error) {
    if (vigente() && error.name !== 'AbortError') {
      conv.visibles.push({ rol: 'error', texto: error instanceof ErrorAsistente ? error.message : `Algo falló: ${error.message}` });
      // Los mensajes quedaron a mitad de un turno: se vuelve a antes del último mensaje de la persona y se le devuelve su texto
      // en el cuadro, para que pueda reintentar sin duplicar nada.
      while (conv.mensajes.length > 0) {
        const ultimo = conv.mensajes.pop();
        if (ultimo.role === 'user' && typeof ultimo.content === 'string') {
          conv.borrador = ultimo.content;
          break;
        }
      }
    }
  } finally {
    if (vigente()) {
      conv.pensando = false;
      conv.abortador = null;
      redibujar();
    }
  }
}
