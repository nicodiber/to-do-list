// Aviso cuando, al agendar, una tarea no encontró hueco antes de su fecha límite (v0.101.0): queda agendada después del
// límite (ver Resumen → «Sin hueco antes del límite») y se le dice al usuario en el momento, con los nombres, para que la
// revise y ajuste en vez de enterarse más tarde.

import { estado } from './almacenamiento.js';
import { avisar } from './avisos.js';
import { nombrarConCategoria, tieneHora, diaLocal, hoyISO, esVencida } from './utilidades.js';
import { superaLimite } from './programador.js';

/**
 * De las tareas que algún proceso de agendado informó «sin hueco», deja solo las que **siguen** sin lugar a tiempo según
 * el estado final (v0.102.0). Los procesos corren en secuencia y uno posterior suele acomodar lo que uno anterior no
 * pudo (por ejemplo el reordenado), así que avisar con la lista cruda daba falsas alarmas: la tarea ya estaba bien
 * ubicada antes de su límite al ir a mirarla. Sigue sin lugar si no tiene hora, si su hora supera el límite o si su
 * hora ya pasó (no se pudo reprogramar).
 */
export function filtrarSinHuecoVigente(lista) {
  const vistos = new Set();
  const hoy = hoyISO();
  return lista
    .map((t) => estado.tareas.find((x) => x.tarea_id === t.tarea_id))
    .filter((t) => {
      if (!t || t.tarea_estado === 'completada' || vistos.has(t.tarea_id)) return false;
      vistos.add(t.tarea_id);
      // Con el límite ya vencido (v0.106.1) no hay «antes del límite»: está en Resumen → Vencidas, no en «Sin hueco».
      if (esVencida(t.tarea_fecha_limite)) return false;
      if (!tieneHora(t.tarea_fecha_sugerida)) return true;
      return superaLimite(t.tarea_fecha_sugerida, t.tarea_fecha_limite) || diaLocal(t.tarea_fecha_sugerida) < hoy;
    });
}

/** `resultado` es lo que devuelve `programarTareasSinFecha` (usa su lista `sinHueco`). No hace nada si está vacía. */
export async function avisarSiSinHueco(resultado) {
  const lista = filtrarSinHuecoVigente((resultado && resultado.sinHueco) || []);
  if (lista.length === 0) return;
  // Si el usuario está en medio de otro formulario (por ejemplo «Agregar y cargar otra»), se espera a que lo cierre.
  while (document.querySelector('dialog[open]')) await new Promise((resolver) => setTimeout(resolver, 1000));
  const nombres = lista.map((t) => nombrarConCategoria(t, estado.categorias)).join(', ');
  await avisar(
    `No hay hueco libre antes de la fecha límite para: ${nombres}.\n\nQuedaron agendadas después del límite (las ves en Resumen → «Sin hueco antes del límite»). Revisalas: podés cambiarles el límite, liberar tiempo en tu Calendar o eliminarlas.`,
    { titulo: 'Sin hueco antes del límite' }
  );
}
