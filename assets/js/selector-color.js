// Selector de color propio, parecido al selector nativo del navegador (área de saturación/valor + barra de tono),
// pero con lo que a ese le falta: botones "Aplicar"/"Cancelar" para confirmar el cambio, y un dado que sortea un
// color. Hoy lo usa solo el color de una categoría (`formularios-entidades.js`); si hace falta en otro campo, se
// puede reusar tal cual.

// ---------------------------------------------------------------------------
// Conversión de color (pura)
// ---------------------------------------------------------------------------

/** HSV (h: 0-360, s/v: 0-100) → hex "#rrggbb". */
export function hsvAHex(h, s, v) {
  const sN = s / 100;
  const vN = v / 100;
  const k = (n) => (n + h / 60) % 6;
  const f = (n) => vN - vN * sN * Math.max(0, Math.min(k(n), 4 - k(n), 1));
  const aByte = (n) => Math.round(f(n) * 255);
  const hex = (n) => aByte(n).toString(16).padStart(2, '0');
  return `#${hex(5)}${hex(3)}${hex(1)}`;
}

/** hex "#rrggbb" (o "#rgb") → { h, s, v }. Un hex inválido cae en un azul por defecto. */
export function hexAHsv(hexColor) {
  const limpio = String(hexColor || '').trim();
  const m3 = /^#?([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(limpio);
  const m6 = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(limpio);
  let r;
  let g;
  let b;
  if (m6) {
    [r, g, b] = [m6[1], m6[2], m6[3]].map((x) => parseInt(x, 16));
  } else if (m3) {
    [r, g, b] = [m3[1], m3[2], m3[3]].map((x) => parseInt(x + x, 16));
  } else {
    return { h: 220, s: 65, v: 95 };
  }
  const rN = r / 255;
  const gN = g / 255;
  const bN = b / 255;
  const max = Math.max(rN, gN, bN);
  const min = Math.min(rN, gN, bN);
  const delta = max - min;
  let h = 0;
  if (delta !== 0) {
    if (max === rN) h = 60 * (((gN - bN) / delta) % 6);
    else if (max === gN) h = 60 * ((bN - rN) / delta + 2);
    else h = 60 * ((rN - gN) / delta + 4);
  }
  if (h < 0) h += 360;
  const s = max === 0 ? 0 : (delta / max) * 100;
  const v = max * 100;
  return { h, s, v };
}

// ---------------------------------------------------------------------------
// Widget
// ---------------------------------------------------------------------------

/**
 * Arma el selector dentro de `contenedor` (un campo del formulario): un botón con la muestra del color actual que
 * abre un popover con el área de saturación/valor, la barra de tono, un campo de hex, el dado y Aplicar/Cancelar.
 * El valor confirmado queda en un `<input type="hidden" name="${nombreCampo}">` (lo lee `FormData` como cualquier
 * otro campo). Devuelve `{ obtenerValor, setValor }`; `setValor` es silencioso (no cuenta como "editado a mano"),
 * para poder precargar el color heredado de una categoría padre sin que tape una elección manual futura.
 */
export function crearSelectorColor({ contenedor, nombreCampo, valorInicial = '#4f7cff' }) {
  contenedor.classList.add('selector-color');
  contenedor.innerHTML = `
    <input type="hidden" name="${nombreCampo}" value="${valorInicial}" />
    <button type="button" class="selector-color-disparador" title="Elegir un color" aria-haspopup="true">
      <span class="selector-color-muestra"></span>
      <span class="selector-color-hex-texto"></span>
    </button>
    <div class="popover-selector-color" hidden>
      <div class="selector-color-area" tabindex="0" role="slider" aria-label="Saturación y brillo">
        <div class="selector-color-area-handle"></div>
      </div>
      <div class="selector-color-tono" tabindex="0" role="slider" aria-label="Tono">
        <div class="selector-color-tono-handle"></div>
      </div>
      <div class="selector-color-fila">
        <input type="text" class="selector-color-hex-input" maxlength="7" aria-label="Color en hexadecimal" />
        <button type="button" class="selector-color-dado" title="Sortear un color">🎲</button>
      </div>
      <div class="selector-color-acciones">
        <button type="button" data-accion="cancelar">↩️ Cancelar</button>
        <button type="button" data-accion="aplicar" class="boton-primario">✅ Aplicar</button>
      </div>
    </div>
  `;

  const oculto = contenedor.querySelector(`[name="${nombreCampo}"]`);
  const disparador = contenedor.querySelector('.selector-color-disparador');
  const muestra = contenedor.querySelector('.selector-color-muestra');
  const hexTexto = contenedor.querySelector('.selector-color-hex-texto');
  const popover = contenedor.querySelector('.popover-selector-color');
  const area = contenedor.querySelector('.selector-color-area');
  const areaHandle = contenedor.querySelector('.selector-color-area-handle');
  const tono = contenedor.querySelector('.selector-color-tono');
  const tonoHandle = contenedor.querySelector('.selector-color-tono-handle');
  const hexInput = contenedor.querySelector('.selector-color-hex-input');

  // Vista previa en edición: no se confirma hasta "Aplicar".
  let previa = hexAHsv(oculto.value);

  function actualizarDisparador(hex) {
    muestra.style.background = hex;
    hexTexto.textContent = hex;
  }

  function repintar() {
    const hex = hsvAHex(previa.h, previa.s, previa.v);
    area.style.setProperty('--tono-area', `hsl(${previa.h}, 100%, 50%)`);
    areaHandle.style.left = `${previa.s}%`;
    areaHandle.style.top = `${100 - previa.v}%`;
    areaHandle.style.background = hex;
    tonoHandle.style.left = `${(previa.h / 360) * 100}%`;
    hexInput.value = hex;
  }

  actualizarDisparador(oculto.value);
  repintar();

  function posicionar() {
    // Fijo respecto de la ventana (no del formulario, que puede scrollear) para no quedar recortado por el
    // `overflow-y: auto` del diálogo.
    const r = disparador.getBoundingClientRect();
    const anchoPopover = popover.offsetWidth || 240;
    const altoPopover = popover.offsetHeight || 300;
    let left = r.left;
    let top = r.bottom + 6;
    if (left + anchoPopover > window.innerWidth - 8) left = Math.max(8, window.innerWidth - anchoPopover - 8);
    if (top + altoPopover > window.innerHeight - 8) top = Math.max(8, r.top - altoPopover - 6);
    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
  }

  function abrir() {
    previa = hexAHsv(oculto.value);
    repintar();
    popover.hidden = false;
    posicionar();
    disparador.setAttribute('aria-expanded', 'true');
  }

  function cerrar() {
    popover.hidden = true;
    disparador.setAttribute('aria-expanded', 'false');
  }

  disparador.addEventListener('click', () => (popover.hidden ? abrir() : cerrar()));

  // Arrastre en un elemento: `alMover(fraccionX, fraccionY)` recibe 0..1 según la posición del puntero.
  function conectarArrastre(elemento, alMover) {
    const mover = (evento) => {
      const r = elemento.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, (evento.clientX - r.left) / r.width));
      const y = Math.min(1, Math.max(0, (evento.clientY - r.top) / r.height));
      alMover(x, y);
      repintar();
    };
    elemento.addEventListener('pointerdown', (evento) => {
      evento.preventDefault();
      elemento.setPointerCapture(evento.pointerId);
      mover(evento);
      const onMove = (e) => mover(e);
      const onUp = (e) => {
        elemento.releasePointerCapture(e.pointerId);
        elemento.removeEventListener('pointermove', onMove);
        elemento.removeEventListener('pointerup', onUp);
      };
      elemento.addEventListener('pointermove', onMove);
      elemento.addEventListener('pointerup', onUp);
    });
  }

  conectarArrastre(area, (x, y) => {
    previa = { ...previa, s: x * 100, v: 100 - y * 100 };
  });
  conectarArrastre(tono, (x) => {
    previa = { ...previa, h: x * 360 };
  });

  hexInput.addEventListener('change', () => {
    previa = hexAHsv(hexInput.value);
    repintar();
  });

  contenedor.querySelector('.selector-color-dado').addEventListener('click', () => {
    // Saturación y brillo acotados para que el color aleatorio se vea bien (nada casi blanco ni casi negro).
    previa = { h: Math.random() * 360, s: 55 + Math.random() * 35, v: 60 + Math.random() * 30 };
    repintar();
  });

  contenedor.querySelector('[data-accion="cancelar"]').addEventListener('click', cerrar);
  contenedor.querySelector('[data-accion="aplicar"]').addEventListener('click', () => {
    const hex = hsvAHex(previa.h, previa.s, previa.v);
    oculto.value = hex;
    actualizarDisparador(hex);
    cerrar();
    // Distinto de "change" (silencioso, para la herencia del padre): este solo se dispara cuando el usuario confirma.
    oculto.dispatchEvent(new CustomEvent('color-aplicado', { bubbles: true, detail: { valor: hex } }));
  });

  document.addEventListener('click', (evento) => {
    if (!popover.hidden && !contenedor.contains(evento.target)) cerrar();
  });
  contenedor.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape' && !popover.hidden) {
      evento.stopPropagation();
      cerrar();
    }
  });

  return {
    obtenerValor: () => oculto.value,
    setValor: (hex) => {
      oculto.value = hex;
      actualizarDisparador(hex);
    },
  };
}
