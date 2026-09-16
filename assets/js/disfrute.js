import { estado } from './almacenamiento.js';
import { esTareaAccionable } from './tareas-logica.js';

const UMBRAL_BAJO = 2;
const UMBRAL_ALTO = 4;

/**
 * Si la tarea recién completada pertenece a una categoría de bajo disfrute,
 * busca una tarea accionable de una categoría de alto disfrute y la sugiere
 * como "autorecompensa" (principio de Premack aplicado a nivel categoría).
 * No hace nada si no hay categoría, si no es de bajo disfrute, o si no hay
 * ninguna candidata disponible — para no generar ruido innecesario.
 */
export function sugerirTareaDeAltoDisfrute(tareaCompletada) {
  const categoriaCompletada = estado.categorias.find((c) => c.categoria_id === tareaCompletada.categoria_id);
  if (!categoriaCompletada || categoriaCompletada.categoria_disfrute > UMBRAL_BAJO) return;

  const candidata = estado.tareas.find((t) => {
    if (t.tarea_id === tareaCompletada.tarea_id || !esTareaAccionable(t, estado.tareas)) return false;
    const categoria = estado.categorias.find((c) => c.categoria_id === t.categoria_id);
    return categoria && categoria.categoria_disfrute >= UMBRAL_ALTO;
  });
  if (!candidata) return;

  const categoriaCandidata = estado.categorias.find((c) => c.categoria_id === candidata.categoria_id);
  alert(
    `🙂 Ya que cumpliste algo que no disfrutás tanto, ¿por qué no seguís con "${candidata.tarea_nombre}" (${categoriaCandidata.categoria_nombre}), que sí te gusta?`
  );
}
