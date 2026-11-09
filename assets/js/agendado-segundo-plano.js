// Agendado en segundo plano (v0.102.0): al crear o editar una tarea, primero se guarda (inmediato) y recién después se
// calcula el horario sugerido (leer Calendar, buscar huecos y reordenar puede tardar varios segundos). Antes el botón
// «Agregar» esperaba todo eso y parecía colgado. Las corridas se encolan: si llega otro pedido mientras una está en
// curso, se vuelve a correr una vez más al terminar.

import { estado, persistirYNotificar } from './almacenamiento.js';
import { programarTareasSinFecha } from './programador.js';
import { avisarSiSinHueco } from './aviso-sin-hueco.js';
import { iniciarReorganizacion } from './estado-agenda.js';

let corriendo = false;
let pedidoPendiente = false;

export async function agendarEnSegundoPlano() {
  if (corriendo) {
    pedidoPendiente = true;
    return;
  }
  corriendo = true;
  const terminarReorganizacion = iniciarReorganizacion(); // v0.108.0 (H15-B)
  try {
    do {
      pedidoPendiente = false;
      const resultado = await programarTareasSinFecha(estado);
      const huboCambios = resultado.asignadas.length > 0 || (resultado.reordenadas || []).length > 0;
      // El cambio ya tiene su paso de deshacer (el de crear o editar la tarea): este guardado no suma otro.
      if (huboCambios) await persistirYNotificar({ deshacer: false });
      if (!pedidoPendiente) terminarReorganizacion(); // antes del aviso, que puede esperar al usuario
      await avisarSiSinHueco(resultado);
    } while (pedidoPendiente);
  } catch {
    // Falla momentánea (por ejemplo sin red): lo retoma la red de seguridad de app.js o el próximo refresco de Calendar.
  } finally {
    terminarReorganizacion();
    corriendo = false;
  }
}
