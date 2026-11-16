// Lógica pura del tema (H27): la elección del usuario puede ser 'claro', 'oscuro' o 'sistema' (seguir el tema del
// dispositivo). Sin elección guardada la app sigue abriéndose en oscuro, como siempre. El aplicado al documento y el
// guardado en `localStorage` viven en `app.js`.

export const ELECCIONES_TEMA = ['claro', 'oscuro', 'sistema'];

/** Cualquier valor guardado → 'claro' | 'oscuro' | 'sistema'. Lo desconocido o ausente es 'oscuro'. */
export function normalizarEleccionTema(valor) {
  return ELECCIONES_TEMA.includes(valor) ? valor : 'oscuro';
}

/** La elección + si el sistema está en oscuro → el tema que se aplica: 'claro' | 'oscuro'. */
export function resolverTema(eleccion, sistemaOscuro) {
  const normalizada = normalizarEleccionTema(eleccion);
  if (normalizada === 'sistema') return sistemaOscuro ? 'oscuro' : 'claro';
  return normalizada;
}
