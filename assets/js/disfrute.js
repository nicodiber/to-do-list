import { estado } from './almacenamiento.js';
import { noPuedeEmpezarTodavia } from './utilidades.js';
import { tareaEstaBloqueada } from './tareas-logica.js';

const ESTADOS_ACCIONABLES = ['a_confirmar', 'pendiente', 'en_progreso'];
const UMBRAL_BAJO = 2;
const UMBRAL_ALTO = 4;

function esAccionable(tarea) {
  if (!ESTADOS_ACCIONABLES.includes(tarea.estado)) return false;
  if (noPuedeEmpezarTodavia(tarea.fecha_inicio_posible)) return false;
  return !tareaEstaBloqueada(tarea, estado.tareas).bloqueada;
}

/**
 * Si la tarea recién completada pertenece a una categoría de bajo disfrute,
 * busca una tarea accionable de una categoría de alto disfrute y la sugiere
 * como "autorecompensa" (principio de Premack aplicado a nivel categoría).
 * No hace nada si no hay categoría, si no es de bajo disfrute, o si no hay
 * ninguna candidata disponible — para no generar ruido innecesario.
 */
export function sugerirTareaDeAltoDisfrute(tareaCompletada) {
  const categoriaCompletada = estado.categorias.find((c) => c.id === tareaCompletada.categoria_id);
  if (!categoriaCompletada || categoriaCompletada.disfrute > UMBRAL_BAJO) return;

  const candidata = estado.tareas.find((t) => {
    if (t.id === tareaCompletada.id || !esAccionable(t)) return false;
    const categoria = estado.categorias.find((c) => c.id === t.categoria_id);
    return categoria && categoria.disfrute >= UMBRAL_ALTO;
  });
  if (!candidata) return;

  const categoriaCandidata = estado.categorias.find((c) => c.id === candidata.categoria_id);
  alert(
    `🙂 Ya que cumpliste algo que no disfrutás tanto, ¿por qué no seguís con "${candidata.nombre}" (${categoriaCandidata.nombre}), que sí te gusta?`
  );
}
