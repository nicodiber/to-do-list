// Avisos y preguntas dentro de la app (v0.100.0), en lugar de los `alert()`, `confirm()` y `prompt()` del navegador
// ("nicodiber.github.io dice…"). Cada llamada abre su propio <dialog> modal en document.body, así que se puede abrir
// encima de otra ventana (por ejemplo un aviso de validación sobre el formulario de una tarea) y sobrevive a los
// redibujados de la vista. Las tres devuelven una promesa: hay que esperarla con `await` donde antes el navegador
// frenaba el código hasta que el usuario respondía.

import { sonar } from './sonidos.js';

/**
 * Crea y muestra el diálogo. `construirCuerpo(dialogo)` agrega los campos; `botones` es `[{ texto, valor, clase }]`;
 * `valorAlCancelar` es lo que devuelve Esc. Resuelve con `{ valor, dialogo }` y lo limpia.
 */
function abrirDialogoAviso({ titulo, mensaje, botones, foco, valorAlCancelar, cuerpoExtra = null, leerExtra = null }) {
  return new Promise((resolve) => {
    const anterior = document.activeElement;
    const dialogo = document.createElement('dialog');
    dialogo.className = 'dialogo-tarea dialogo-aviso';
    dialogo.setAttribute('role', 'alertdialog');
    const encabezado = document.createElement('h3');
    encabezado.textContent = titulo;
    const texto = document.createElement('div');
    texto.className = 'aviso-mensaje';
    texto.textContent = mensaje;
    const acciones = document.createElement('div');
    acciones.className = 'acciones-modal';
    dialogo.append(encabezado, texto);
    if (cuerpoExtra) dialogo.appendChild(cuerpoExtra);
    dialogo.appendChild(acciones);

    let terminado = false;
    const terminar = (valor) => {
      if (terminado) return;
      terminado = true;
      const extra = leerExtra ? leerExtra() : undefined;
      if (dialogo.open) dialogo.close();
      dialogo.remove();
      if (anterior && typeof anterior.focus === 'function' && document.contains(anterior)) anterior.focus();
      resolve({ valor, extra });
    };

    botones.forEach((b) => {
      const boton = document.createElement('button');
      boton.type = 'button';
      boton.className = b.clase || '';
      boton.textContent = b.texto;
      boton.dataset.valor = String(b.valor);
      boton.addEventListener('click', () => terminar(b.valor));
      acciones.appendChild(boton);
    });
    dialogo.addEventListener('cancel', (evento) => {
      evento.preventDefault();
      terminar(valorAlCancelar);
    });
    // Enter acepta (salvo dentro de un texto largo o sobre un botón, que ya actúa por su cuenta).
    dialogo.addEventListener('keydown', (evento) => {
      if (evento.key !== 'Enter' || evento.target.tagName === 'BUTTON' || evento.target.tagName === 'TEXTAREA') return;
      evento.preventDefault();
      const principal = acciones.querySelector('.boton-primario, .boton-peligro') || acciones.lastElementChild;
      principal.click();
    });

    document.body.appendChild(dialogo);
    dialogo.showModal();
    (foco ? foco(dialogo) : acciones.lastElementChild).focus();
  });
}

/** Un mensaje con un botón "Entendido". Espera con `await` si lo que sigue depende de que el usuario lo haya leído. */
export async function avisar(mensaje, { titulo = 'Aviso', textoAceptar = 'Entendido' } = {}) {
  sonar('aviso');
  await abrirDialogoAviso({
    titulo,
    mensaje,
    botones: [{ texto: textoAceptar, valor: true, clase: 'boton-primario' }],
    valorAlCancelar: true,
  });
}

/**
 * Pregunta Sí/No: devuelve `true` si el usuario aceptó y `false` si canceló (botón, Esc). Con `peligro: true` el botón
 * de aceptar va en rojo (eliminar, descartar).
 */
export async function confirmar(mensaje, { titulo = 'Confirmar', textoAceptar = 'Aceptar', textoCancelar = 'Cancelar', peligro = false } = {}) {
  const { valor } = await abrirDialogoAviso({
    titulo,
    mensaje,
    botones: [
      { texto: textoCancelar, valor: false, clase: '' },
      { texto: textoAceptar, valor: true, clase: peligro ? 'boton-peligro' : 'boton-primario' },
    ],
    valorAlCancelar: false,
  });
  return valor === true;
}

/** Pide un texto corto: devuelve lo escrito, o `null` si el usuario canceló. */
export async function pedirTexto(mensaje, { titulo = 'Escribí un texto', textoAceptar = 'Aceptar', textoCancelar = 'Cancelar', placeholder = '' } = {}) {
  const campo = document.createElement('input');
  campo.type = 'text';
  campo.className = 'aviso-campo';
  campo.placeholder = placeholder;
  const { valor, extra } = await abrirDialogoAviso({
    titulo,
    mensaje,
    cuerpoExtra: campo,
    leerExtra: () => campo.value,
    foco: () => campo,
    botones: [
      { texto: textoCancelar, valor: false, clase: '' },
      { texto: textoAceptar, valor: true, clase: 'boton-primario' },
    ],
    valorAlCancelar: false,
  });
  return valor === true ? extra : null;
}

/**
 * Un aviso con botones de acción extra (v0.101.0), por ejemplo «✏️ Editar esta tarea». `acciones` es
 * `[{ texto, alClic }]`: al tocar una se cierra el aviso y se ejecuta su `alClic`.
 */
export async function avisarConAcciones(mensaje, { titulo = 'Aviso', textoAceptar = 'Entendido', acciones = [] } = {}) {
  const contenedor = document.createElement('div');
  contenedor.className = 'aviso-acciones';
  let elegida = null;
  acciones.forEach((accion) => {
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.textContent = accion.texto;
    // `datos` (opcional) pone atributos `data-*` en el botón (por ejemplo `data-reconectar`, que la reconexión silenciosa ignora).
    Object.entries(accion.datos || {}).forEach(([clave, valor]) => {
      boton.dataset[clave] = valor;
    });
    boton.addEventListener('click', () => {
      elegida = accion;
      contenedor.closest('dialog').querySelector('.acciones-modal .boton-primario').click();
    });
    contenedor.appendChild(boton);
  });
  await abrirDialogoAviso({
    titulo,
    mensaje,
    cuerpoExtra: contenedor,
    botones: [{ texto: textoAceptar, valor: true, clase: 'boton-primario' }],
    valorAlCancelar: true,
  });
  if (elegida) await elegida.alClic();
}
