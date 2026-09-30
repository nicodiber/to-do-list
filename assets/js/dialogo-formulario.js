// Ventana modal genérica para un formulario (editar o crear una tarea, una
// categoría, una ubicación...). Cada llamada crea su propio <dialog> en
// document.body: así se puede abrir uno encima de otro (por ejemplo crear una
// categoría mientras se edita una tarea) y sobrevive a los redibujados de la vista.

/** Texto que identifica el contenido de un formulario, para saber si el usuario cambió algo. */
export function firmaFormulario(formulario) {
  return JSON.stringify([...new FormData(formulario).entries()].map(([clave, valor]) => [clave, typeof valor === 'string' ? valor : '']));
}

/**
 * Hace que la primera letra de un campo de texto se escriba siempre en mayúscula,
 * sin mover el cursor (para nombres de tareas, categorías, ubicaciones, metas y personas).
 */
export function activarMayusculaInicial(campo) {
  campo.addEventListener('input', () => {
    const coincidencia = campo.value.match(/^(\s*)(\p{Ll})/u);
    if (!coincidencia) return;
    const posicion = campo.selectionStart;
    const inicio = coincidencia[1].length;
    campo.value = campo.value.slice(0, inicio) + coincidencia[2].toLocaleUpperCase('es') + campo.value.slice(inicio + 1);
    campo.setSelectionRange(posicion, posicion);
  });
}

/**
 * Abre la ventana. `alGuardar(formulario, { valor, reiniciarFirma })` (puede ser async)
 * devuelve `true` para cerrarla o `false` para dejarla abierta (quien la usa avisa
 * por su cuenta qué pasó). Esc, el clic afuera y "Cancelar" preguntan "¿Descartar los
 * cambios?" solo si el formulario cambió desde que se abrió. Devuelve el `<dialog>`.
 *
 * Con `botonesGuardar` (`[{ texto, valor, orden }]`) hay varios botones de guardado y
 * `valor` dice cuál se apretó. Enter dispara el principal (`.boton-primario`, el último
 * de la lista); Ctrl+Enter (o Cmd+Enter) dispara el primero (v0.88.0 — antes al revés).
 * `orden` (CSS `order`) cambia cómo se muestran. `reiniciarFirma()` toma el estado actual del
 * formulario como "sin cambios" (por ejemplo después de vaciarlo para cargar otra tarea).
 */
export function abrirDialogoFormulario({ titulo, cuerpoHtml, textoGuardar = '💾 Guardar cambios', botonesGuardar = null, conectar = () => {}, alGuardar, alCerrar = () => {} }) {
  const dialogo = document.createElement('dialog');
  dialogo.className = 'dialogo-tarea';
  dialogo.innerHTML = `
    <h3></h3>
    <form class="formulario-tarea formulario-modal">
      ${cuerpoHtml}
      <div class="acciones-modal">
        <button type="button" data-accion="cancelar-dialogo" title="Cerrar sin guardar (Esc)">↩️ Cancelar</button>
      </div>
    </form>
  `;
  dialogo.querySelector('h3').textContent = titulo;
  const botones = botonesGuardar || [{ texto: textoGuardar, valor: 'guardar', orden: 0 }];
  const contenedorBotones = dialogo.querySelector('.acciones-modal');
  const cancelar = contenedorBotones.querySelector('[data-accion="cancelar-dialogo"]');
  botones.forEach((b, indice) => {
    const boton = document.createElement('button');
    boton.type = 'submit';
    boton.className = indice === botones.length - 1 || botones.length === 1 ? 'boton-primario' : '';
    boton.dataset.valor = b.valor;
    boton.textContent = b.texto;
    // El botón principal es el que envía Enter; el primero de la lista (si no es el principal), Ctrl+Enter.
    if (boton.className) boton.title = `${b.texto.replace(/^\S+\s/, '')} (Enter)`;
    else if (indice === 0) boton.title = `${b.texto.replace(/^\S+\s/, '')} (Ctrl+Enter)`;
    if (b.orden !== undefined) boton.style.order = String(b.orden);
    contenedorBotones.insertBefore(boton, cancelar);
  });
  // Estandar de la app: Cancelar (o volver) a la izquierda, la accion principal a la derecha.
  cancelar.style.order = '-100';
  document.body.appendChild(dialogo);

  const formulario = dialogo.querySelector('form');
  conectar(formulario);
  let firmaInicial = '';
  const hayCambios = () => firmaFormulario(formulario) !== firmaInicial;
  // Cierra y limpia una sola vez, sin depender del evento `close` (que el navegador puede demorar).
  let finalizado = false;
  const cerrar = () => {
    if (dialogo.open) dialogo.close();
    if (finalizado) return;
    finalizado = true;
    dialogo.remove();
    alCerrar();
  };
  const intentarCerrar = () => {
    if (hayCambios() && !confirm('Hay cambios sin guardar. ¿Descartarlos?')) return;
    cerrar();
  };

  dialogo.addEventListener('cancel', (evento) => {
    evento.preventDefault();
    intentarCerrar();
  });
  // Enter (sin modificador, salvo en un textarea) envía con el botón principal; Ctrl+Enter (o Cmd+Enter) envía
  // con el primero de `botonesGuardar` (v0.88.0 — antes al revés: Enter disparaba el envío nativo del
  // navegador, que siempre manda al primero del DOM, y Ctrl+Enter al principal).
  dialogo.addEventListener('keydown', (evento) => {
    if (evento.key !== 'Enter' || evento.target.tagName === 'TEXTAREA') return;
    const enviables = [...formulario.querySelectorAll('button[type="submit"]')];
    const principal = formulario.querySelector('button.boton-primario[type="submit"]') || enviables[0];
    const boton = evento.ctrlKey || evento.metaKey ? enviables[0] : principal;
    if (!boton) return;
    evento.preventDefault();
    formulario.requestSubmit(boton);
  });
  // Clic afuera: solo si el clic empezó y terminó fuera (arrastrar desde un campo hacia afuera no cierra). Se mide
  // por contención en el DOM (no por coordenadas): un popover propio del formulario (por ejemplo el selector de
  // color) puede dibujarse con `position: fixed` fuera del rectángulo visual del diálogo y aun así seguir "adentro".
  const fuera = (evento) => !dialogo.contains(evento.target);
  let empezoAfuera = false;
  dialogo.addEventListener('mousedown', (evento) => {
    empezoAfuera = fuera(evento);
  });
  dialogo.addEventListener('click', (evento) => {
    if (empezoAfuera && fuera(evento)) intentarCerrar();
    empezoAfuera = false;
  });
  dialogo.addEventListener('close', cerrar);
  formulario.querySelector('[data-accion="cancelar-dialogo"]').addEventListener('click', intentarCerrar);
  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const valor = (evento.submitter && evento.submitter.dataset.valor) || botones[0].valor;
    if (await alGuardar(formulario, { valor, reiniciarFirma: () => { firmaInicial = firmaFormulario(formulario); } })) cerrar();
  });

  dialogo.showModal();
  firmaInicial = firmaFormulario(formulario);
  const primerCampo = formulario.querySelector('input:not([type="hidden"]), select, textarea');
  if (primerCampo) {
    primerCampo.focus();
    // En un campo de texto con contenido (al editar) el cursor queda al final, no al principio.
    if (typeof primerCampo.setSelectionRange === 'function' && primerCampo.type === 'text') {
      const fin = primerCampo.value.length;
      primerCampo.setSelectionRange(fin, fin);
    }
  } else {
    formulario.querySelector('button[type="submit"]').focus();
  }
  return dialogo;
}

/** Valor de la opción "＋ Crear nueva…" de los desplegables de categoría, ubicación, meta, persona o etiqueta. */
export const CREAR_NUEVA = '__nueva__';

/**
 * Conecta un desplegable de referencia (categoría/ubicación/meta/persona/etiqueta, o cualquier otro con el
 * mismo patrón "＋ Crear nueva…") para que, al elegir esa opción, abra el diálogo de alta de esa entidad y,
 * al guardarla, reconstruya las opciones con la nueva ya seleccionada. `extraerId(nueva)` saca el id de la
 * entidad recién creada; `alCambiar(id)` (opcional) se dispara con cualquier cambio de valor real (una ya
 * existente o la recién creada) — la usa `views/configuraciones.view.js` para guardar al toque. (v0.91.0:
 * movida acá desde `formulario-tarea.js`, que la tenía — `formularios-entidades.js` también la necesita para
 * el desplegable de Etiqueta en Persona, y como `formulario-tarea.js` ya importa de `formularios-entidades.js`,
 * importar en sentido contrario crearía un ciclo. Este archivo no importa de ninguno de los dos.)
 */
export function conectarCrearNueva(select, htmlOpciones, abrirDialogo, extraerId, alCambiar) {
  select.dataset.previo = select.value;
  select.addEventListener('focus', () => {
    if (select.value !== CREAR_NUEVA) select.dataset.previo = select.value;
  });
  select.addEventListener('change', () => {
    if (select.value !== CREAR_NUEVA) {
      select.dataset.previo = select.value;
      if (alCambiar) alCambiar(select.value);
      return;
    }
    // Se vuelve al valor anterior: así un borrador nunca guarda "Crear nueva…".
    select.value = select.dataset.previo || '';
    abrirDialogo({
      alCrear: (nueva) => {
        const id = extraerId(nueva);
        // Se selecciona por propiedad (no por el atributo `selected`): así cuenta como un cambio del usuario y el
        // borrador del alta lo conserva cuando la vista se redibuja al guardar la entidad.
        select.innerHTML = htmlOpciones('');
        select.value = id;
        select.dataset.previo = id;
        if (alCambiar) alCambiar(id);
      },
    });
  });
}
