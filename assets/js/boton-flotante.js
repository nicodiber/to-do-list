// Botón "＋" flotante para las vistas de ABM (Categorías, Ubicaciones, Metas, Tareas, Personas): siempre visible,
// aunque la lista sea larga y haya que scrollear para llegar al final. Reemplaza al botón "＋ Nueva…" de la barra de
// acciones de cada vista.

/** Agrega el botón flotante a `contenedor` (uno solo por vista; se recrea en cada redibujado). */
export function agregarBotonFlotante(contenedor, { titulo, alClic }) {
  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'boton-flotante';
  boton.title = titulo;
  boton.setAttribute('aria-label', titulo);
  boton.textContent = '＋';
  boton.addEventListener('click', alClic);
  contenedor.appendChild(boton);
  return boton;
}
