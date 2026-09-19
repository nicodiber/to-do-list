// Las vistas se redibujan enteras cuando llegan cambios de otro dispositivo, lo
// que vaciaría los formularios a medio completar. Estas funciones guardan lo que
// el usuario ya escribió (solo los campos que tocó) y lo vuelven a poner después
// de redibujar, para que "nada se pierda en silencio".

const SELECTOR_CAMPOS = 'input, textarea, select';
const TIPOS_IGNORADOS = ['button', 'submit', 'reset', 'file', 'hidden', 'password'];

function esCasilla(campo) {
  return campo.type === 'checkbox' || campo.type === 'radio';
}

function fueTocado(campo) {
  if (esCasilla(campo)) return campo.checked !== campo.defaultChecked;
  if (campo.tagName === 'SELECT') {
    const porDefecto = Array.from(campo.options).findIndex((opcion) => opcion.defaultSelected);
    return campo.selectedIndex !== (porDefecto === -1 ? 0 : porDefecto);
  }
  return campo.value !== campo.defaultValue;
}

/** Recorre los campos dando a cada uno una clave estable: formulario + nombre + tipo + posición. */
function recorrerCampos(contenedor, accion) {
  const contadores = new Map();
  contenedor.querySelectorAll(SELECTOR_CAMPOS).forEach((campo) => {
    if (TIPOS_IGNORADOS.includes(campo.type) || (!campo.name && !campo.id)) return;
    const base = `${campo.form && campo.form.id ? campo.form.id : ''}|${campo.name || campo.id}|${campo.type}`;
    const posicion = contadores.get(base) || 0;
    contadores.set(base, posicion + 1);
    accion(campo, `${base}#${posicion}`);
  });
}

/** Guarda el valor de los campos que el usuario ya modificó (y cuál tenía el foco). */
export function capturarBorradores(contenedor) {
  const borradores = new Map();
  let claveEnfocado = null;
  let seleccion = null;
  recorrerCampos(contenedor, (campo, clave) => {
    if (campo === document.activeElement) {
      claveEnfocado = clave;
      seleccion = typeof campo.selectionStart === 'number' ? [campo.selectionStart, campo.selectionEnd] : null;
    }
    if (!fueTocado(campo)) return;
    borradores.set(clave, esCasilla(campo) ? { marcado: campo.checked } : { valor: campo.value });
  });
  return { borradores, claveEnfocado, seleccion };
}

/** Vuelve a poner lo capturado en los campos equivalentes del contenedor ya redibujado. */
export function restaurarBorradores(contenedor, captura) {
  if (!captura) return;
  recorrerCampos(contenedor, (campo, clave) => {
    const borrador = captura.borradores.get(clave);
    if (borrador) {
      if (esCasilla(campo)) {
        campo.checked = borrador.marcado;
        campo.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (campo.tagName !== 'SELECT' || Array.from(campo.options).some((o) => o.value === borrador.valor)) {
        campo.value = borrador.valor;
        campo.dispatchEvent(new Event(campo.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
      }
    }
    if (clave === captura.claveEnfocado) {
      campo.focus();
      if (captura.seleccion && typeof campo.setSelectionRange === 'function') {
        try {
          campo.setSelectionRange(captura.seleccion[0], captura.seleccion[1]);
        } catch {
          // Algunos tipos de campo no admiten selección.
        }
      }
    }
  });
}
