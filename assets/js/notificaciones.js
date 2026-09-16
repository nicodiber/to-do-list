import { persistirYNotificar } from './almacenamiento.js';

const VENTANA_AVISO_MIN = 10;
const TOLERANCIA_ATRASO_MIN = 2;
const INTERVALO_REVISION_MS = 60 * 1000;

export function soportaNotificaciones() {
  return 'Notification' in window;
}

export function permisoNotificacionesConcedido() {
  return soportaNotificaciones() && Notification.permission === 'granted';
}

export function permisoNotificacionesDenegado() {
  return soportaNotificaciones() && Notification.permission === 'denied';
}

export async function solicitarPermisoNotificaciones() {
  if (!soportaNotificaciones()) return false;
  const resultado = await Notification.requestPermission();
  return resultado === 'granted';
}

function minutosHasta(fechaHoraISO) {
  return (new Date(fechaHoraISO).getTime() - Date.now()) / 60000;
}

async function revisarTareasProximas(estado, registroSW) {
  if (!permisoNotificacionesConcedido()) return;

  const candidatas = estado.tareas.filter((tarea) => {
    if (tarea.tarea_estado === 'completada') return false;
    if (!tarea.tarea_fecha_hora_agendada) return false;
    if (tarea.tarea_notificada_en_para === tarea.tarea_fecha_hora_agendada) return false;
    const minutos = minutosHasta(tarea.tarea_fecha_hora_agendada);
    return minutos <= VENTANA_AVISO_MIN && minutos >= -TOLERANCIA_ATRASO_MIN;
  });

  if (candidatas.length === 0) return;

  candidatas.forEach((tarea) => {
    const hora = new Date(tarea.tarea_fecha_hora_agendada).toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit',
    });
    const opciones = {
      body: `Agendada para las ${hora}`,
      tag: `tarea-${tarea.tarea_id}`,
      icon: 'assets/icons/icon.svg',
      data: { url: './#/tareas' },
    };
    if (registroSW) {
      registroSW.showNotification(tarea.tarea_nombre, opciones);
    } else {
      new Notification(tarea.tarea_nombre, opciones);
    }
    tarea.tarea_notificada_en_para = tarea.tarea_fecha_hora_agendada;
  });

  await persistirYNotificar();
}

export function iniciarRevisionNotificaciones(estado, registroSW) {
  revisarTareasProximas(estado, registroSW);
  setInterval(() => revisarTareasProximas(estado, registroSW), INTERVALO_REVISION_MS);
}
