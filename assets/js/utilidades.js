export function generarId() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

export function hoyISO() {
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

export function formatearFechaHora(fechaHoraISO) {
  if (!fechaHoraISO) return '';
  const fecha = new Date(fechaHoraISO);
  if (Number.isNaN(fecha.getTime())) return fechaHoraISO;
  const dia = String(fecha.getDate()).padStart(2, '0');
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const anio = fecha.getFullYear();
  const horas = String(fecha.getHours()).padStart(2, '0');
  const minutos = String(fecha.getMinutes()).padStart(2, '0');
  return `${dia}/${mes}/${anio} ${horas}:${minutos}`;
}

export function fechaISOMasDias(dias, desdeISODate) {
  const base = desdeISODate ? new Date(desdeISODate + 'T00:00:00') : new Date();
  base.setDate(base.getDate() + dias);
  return base.toISOString().slice(0, 10);
}

export function combinarFechaYHora(fechaISODate, horaHHMM) {
  const [horas, minutos] = horaHHMM.split(':').map(Number);
  const fecha = new Date(fechaISODate + 'T00:00:00');
  fecha.setHours(horas, minutos, 0, 0);
  return fecha.toISOString();
}

export function noPuedeEmpezarTodavia(fechaInicioPosibleISO) {
  if (!fechaInicioPosibleISO) return false;
  return fechaInicioPosibleISO > hoyISO();
}

export function diasEntreFechas(fechaISO1, fechaISO2) {
  const fecha1 = new Date(fechaISO1 + 'T00:00:00');
  const fecha2 = new Date(fechaISO2 + 'T00:00:00');
  return Math.round((fecha2 - fecha1) / (24 * 60 * 60 * 1000));
}
