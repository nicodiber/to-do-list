// Atajos de teclado de la app y su ventana de ayuda. Son teclas solas (sin Ctrl/Alt), que solo actúan con el foco
// fuera de un campo y sin una ventana abierta: Ctrl+1…9 lo usa el navegador para cambiar de pestaña del navegador,
// Alt+Shift cambia el idioma del teclado y Ctrl+Alt es AltGr en los teclados latinoamericanos.
// La tabla de abajo es la única fuente: la usan el listener, la ventana de ayuda y los `title` de las pestañas.

/** Atajos que no dependen del orden de las pestañas. `grupo` ordena la ventana de ayuda. */
export const ATAJOS_FIJOS = [
  { tecla: 'N', descripcion: 'Nueva tarea', grupo: 'Tareas' },
  { tecla: 'Enter', descripcion: 'En el nombre de una tarea nueva: agregar y cargar otra', grupo: 'Tareas' },
  { tecla: 'Ctrl + Enter', descripcion: 'Guardar o agregar desde cualquier ventana de formulario', grupo: 'Tareas' },
  { tecla: 'Ctrl + Z', descripcion: 'Deshacer el último cambio', grupo: 'Tareas' },
  { tecla: 'Ctrl + Shift + Z', descripcion: 'Rehacer', grupo: 'Tareas' },
  { tecla: 'F', descripcion: 'Ir al buscador o al filtro de la vista', grupo: 'Vistas' },
  { tecla: 'Esc', descripcion: 'Cerrar la ventana abierta', grupo: 'Ventanas' },
  { tecla: '?', descripcion: 'Mostrar esta ayuda', grupo: 'Ayuda' },
];

/** La tecla de una pestaña: `1`…`9` para las nueve primeras y `0` para la décima; `null` si no tiene. */
export function teclaDeVista(clave, vistas) {
  const indice = vistas.indexOf(clave);
  return indice >= 0 && indice < 10 ? String((indice + 1) % 10) : null;
}

/** Título con la tecla, para el `title` de la pestaña ("Hoy (tecla 1)"). */
export function tituloConTecla(etiqueta, tecla) {
  return tecla ? `${etiqueta} (tecla ${tecla})` : etiqueta;
}

const SELECTOR_FILTRO = '#vista input[type="search"], #vista select[id^="filtro"], #vista .filtros select';

let contexto = null;

function enCampoEditable(objetivo) {
  return (
    objetivo instanceof HTMLElement &&
    (objetivo.tagName === 'INPUT' || objetivo.tagName === 'TEXTAREA' || objetivo.tagName === 'SELECT' || objetivo.isContentEditable)
  );
}

/** Ventana con la lista de atajos (la abren "?" y el botón ⌨️). */
export function abrirAyudaAtajos() {
  if (!contexto || document.querySelector('dialog[open]')) return;
  document.querySelectorAll('dialog.dialogo-ayuda').forEach((viejo) => viejo.remove()); // restos de una ayuda ya cerrada
  const { vistas, etiquetas } = contexto;
  const filasVistas = vistas
    .map((clave) => ({ clave, tecla: teclaDeVista(clave, vistas) }))
    .filter((v) => v.tecla)
    .map((v) => `<tr><th scope="row"><kbd>${v.tecla}</kbd></th><td>${etiquetas[v.clave]}</td></tr>`)
    .join('');
  const sinTecla = vistas.filter((clave) => !teclaDeVista(clave, vistas)).map((clave) => etiquetas[clave]);
  const grupos = [...new Set(ATAJOS_FIJOS.map((a) => a.grupo))];
  const dialogo = document.createElement('dialog');
  dialogo.className = 'dialogo-tarea dialogo-ayuda';
  dialogo.innerHTML = `
    <h3>⌨️ Atajos de teclado</h3>
    <p class="ayuda">Son teclas solas: funcionan con el cursor fuera de un campo y sin ninguna ventana abierta.</p>
    <h4>🧭 Ir a una pestaña</h4>
    <table class="tabla-atajos"><tbody>${filasVistas}</tbody></table>
    ${sinTecla.length > 0 ? `<p class="ayuda">Sin tecla (solo con el mouse): ${sinTecla.join(', ')}.</p>` : ''}
    ${grupos
      .map(
        (grupo) => `
      <h4>${grupo}</h4>
      <table class="tabla-atajos"><tbody>${ATAJOS_FIJOS.filter((a) => a.grupo === grupo)
        .map((a) => `<tr><th scope="row"><kbd>${a.tecla}</kbd></th><td>${a.descripcion}</td></tr>`)
        .join('')}</tbody></table>`
      )
      .join('')}
    <div class="acciones-modal"><button type="button" data-accion="cerrar-ayuda" class="boton-primario" title="Cerrar (Esc)">✖️ Cerrar</button></div>
  `;
  document.body.appendChild(dialogo);
  const cerrar = () => {
    if (dialogo.open) dialogo.close();
    dialogo.remove();
  };
  dialogo.querySelector('[data-accion="cerrar-ayuda"]').addEventListener('click', cerrar);
  dialogo.addEventListener('close', cerrar);
  dialogo.addEventListener('click', (evento) => {
    if (evento.target === dialogo) cerrar();
  });
  dialogo.showModal();
}

/**
 * Registra el listener global de teclado. `vistas` es el orden de las pestañas (las diez primeras llevan
 * las teclas 1…9 y 0), `etiquetas` sus nombres, `irAVista(clave)` navega, `abrirNuevaTarea()` abre el alta,
 * `puedeUsarse()` dice si la app tiene datos listos y no está en solo lectura, y `deshacer()`/`rehacer()` (con
 * `puedeDeshacer()`/`puedeRehacer()`) son Ctrl+Z / Ctrl+Shift+Z.
 */
export function configurarAtajos({ vistas, etiquetas, irAVista, abrirNuevaTarea, puedeUsarse, deshacer, rehacer, puedeDeshacer, puedeRehacer }) {
  contexto = { vistas, etiquetas };
  window.addEventListener('keydown', (evento) => {
    // Ctrl+Z / Ctrl+Shift+Z: mismas guardas que el resto (fuera de un campo, sin ventana abierta), para no pisar
    // el deshacer nativo del navegador mientras se edita texto.
    if ((evento.ctrlKey || evento.metaKey) && !evento.altKey && !evento.repeat && (evento.key === 'z' || evento.key === 'Z')) {
      if (enCampoEditable(evento.target) || document.querySelector('dialog[open]') || !puedeUsarse()) return;
      evento.preventDefault();
      if (evento.shiftKey) {
        if (puedeRehacer()) rehacer();
      } else if (puedeDeshacer()) {
        deshacer();
      }
      return;
    }
    if (evento.ctrlKey || evento.altKey || evento.metaKey || evento.repeat) return;
    if (enCampoEditable(evento.target) || document.querySelector('dialog[open]')) return;

    if (evento.key === '?') {
      evento.preventDefault();
      abrirAyudaAtajos();
      return;
    }
    if (!puedeUsarse()) return;

    if (/^[0-9]$/.test(evento.key)) {
      const indice = (Number(evento.key) + 9) % 10;
      if (indice < vistas.length) {
        evento.preventDefault();
        irAVista(vistas[indice]);
      }
      return;
    }
    if (evento.key === 'n' || evento.key === 'N') {
      evento.preventDefault();
      abrirNuevaTarea();
      return;
    }
    if (evento.key === 'f' || evento.key === 'F') {
      const control = document.querySelector(SELECTOR_FILTRO);
      if (control) {
        evento.preventDefault();
        control.focus();
      }
    }
  });
}
