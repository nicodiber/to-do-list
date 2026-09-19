// Ventana modal genérica para un formulario (editar o crear una tarea, una
// categoría, una ubicación...). Cada llamada crea su propio <dialog> en
// document.body: así se puede abrir uno encima de otro (por ejemplo crear una
// categoría mientras se edita una tarea) y sobrevive a los redibujados de la vista.

/** Texto que identifica el contenido de un formulario, para saber si el usuario cambió algo. */
export function firmaFormulario(formulario) {
  return JSON.stringify([...new FormData(formulario).entries()].map(([clave, valor]) => [clave, typeof valor === 'string' ? valor : '']));
}

/**
 * Abre la ventana. `alGuardar(formulario)` (puede ser async) devuelve `true` para
 * cerrarla o `false` para dejarla abierta (quien la usa avisa por su cuenta qué
 * pasó). Esc, el clic afuera y "Cancelar" preguntan "¿Descartar los cambios?"
 * solo si el formulario cambió desde que se abrió. Devuelve el `<dialog>`.
 */
export function abrirDialogoFormulario({ titulo, cuerpoHtml, textoGuardar = 'Guardar cambios', conectar = () => {}, alGuardar, alCerrar = () => {} }) {
  const dialogo = document.createElement('dialog');
  dialogo.className = 'dialogo-tarea';
  dialogo.innerHTML = `
    <h3></h3>
    <form class="formulario-tarea formulario-modal">
      ${cuerpoHtml}
      <div class="acciones-modal">
        <button type="submit" class="boton-primario"></button>
        <button type="button" data-accion="cancelar-dialogo">Cancelar</button>
      </div>
    </form>
  `;
  dialogo.querySelector('h3').textContent = titulo;
  dialogo.querySelector('button[type="submit"]').textContent = textoGuardar;
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
    if (await alGuardar(formulario)) cerrar();
  });

  dialogo.showModal();
  firmaInicial = firmaFormulario(formulario);
  const primerCampo = formulario.querySelector('input:not([type="hidden"]), select, textarea');
  if (primerCampo) primerCampo.focus();
  return dialogo;
}
