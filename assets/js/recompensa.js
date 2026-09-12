export function mostrarRecompensaSiCorresponde(tarea) {
  if (!tarea.recompensa) return;
  alert(`🎉 ¡Completaste "${tarea.nombre}"! Te ganaste: ${tarea.recompensa}`);
}
