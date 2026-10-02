// Aviso cuando, al agendar, una tarea no encontró hueco antes de su fecha límite (v0.101.0): queda agendada después del
// límite (ver Resumen → «Sin hueco antes del límite») y se le dice al usuario en el momento, con los nombres, para que la
// revise y ajuste en vez de enterarse más tarde.

import { estado } from './almacenamiento.js';
import { avisar } from './avisos.js';
import { nombrarConCategoria } from './utilidades.js';

/** `resultado` es lo que devuelve `programarTareasSinFecha` (usa su lista `sinHueco`). No hace nada si está vacía. */
export async function avisarSiSinHueco(resultado) {
  const lista = (resultado && resultado.sinHueco) || [];
  if (lista.length === 0) return;
  const nombres = lista.map((t) => nombrarConCategoria(t, estado.categorias)).join(', ');
  await avisar(
    `No hay hueco libre antes de la fecha límite para: ${nombres}.\n\nQuedaron agendadas después del límite (las ves en Resumen → «Sin hueco antes del límite»). Revisalas: podés cambiarles el límite, liberar tiempo en tu Calendar o eliminarlas.`,
    { titulo: 'Sin hueco antes del límite' }
  );
}
