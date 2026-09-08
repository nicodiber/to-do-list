export function generarId() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

export function ahoraISO() {
  return new Date().toISOString();
}

export function formatearFecha(fechaISO) {
  if (!fechaISO) return '';
  const [anio, mes, dia] = fechaISO.split('-');
  if (!anio || !mes || !dia) return fechaISO;
  return `${dia}/${mes}/${anio}`;
}

export function esVencida(fechaLimiteISO) {
  if (!fechaLimiteISO) return false;
  return fechaLimiteISO < hoyISO();
}

export function esHoy(fechaISO) {
  if (!fechaISO) return false;
  return fechaISO === hoyISO();
}

export function escaparHtml(texto) {
  const div = document.createElement('div');
  div.textContent = texto == null ? '' : String(texto);
  return div.innerHTML;
}
