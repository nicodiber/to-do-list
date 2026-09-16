export function mostrarRecompensaSiCorresponde(tarea) {
  if (!tarea.tarea_recompensa) return;
  alert(`🎉 ¡Completaste "${tarea.tarea_nombre}"! Te ganaste: ${tarea.tarea_recompensa}`);
}
