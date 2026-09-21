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
 * `valor` dice cuál se apretó. El primero **en el DOM** es el que dispara Enter; `orden`
 * (CSS `order`) cambia cómo se muestran. `reiniciarFirma()` toma el estado actual del
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
        <button type="button" data-accion="cancelar-dialogo">↩️ Cancelar</button>
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
    if (b.orden !== undefined) boton.style.order = String(b.orden);
    contenedorBotones.insertBefore(boton, cancelar);
  });
  cancelar.style.order = '99';
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
  // Clic afuera: solo si el clic empezó y terminó fuera (arrastrar desde un campo hacia afuera no cierra).
  const fuera = (evento) => {
    const r = dialogo.getBoundingClientRect();
    return evento.clientX < r.left || evento.clientX > r.right || evento.clientY < r.top || evento.clientY > r.bottom;
  };
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
