// Lo que se ofrece después de cumplir una tarea: agregar otro ciclo de práctica (si era el último de una preparación
// de examen) y exportar la tarea a Calendar. Lo usan Hoy, Tareas, Revisar mi día y la ventana de edición.

import { estado, persistirYNotificar } from './almacenamiento.js';
import { crearTarea } from './modelos.js';
import { hoyISO, diaLocal, fechaISOMasDias } from './utilidades.js';
import { recalcularBloqueo } from './dependencias.js';
import { reprogramarTareaConCascada } from './tareas-logica.js';
import { ofrecerExportarACalendar } from './exportar-calendar.js';

const PASOS_DEL_CICLO = ['practica', 'autoevaluar', 'diagnostico', 'correccion'];
const MINUTOS_POR_DIA_CICLO = 120;

/**
 * Si `tarea` es el último paso ("corregir") del último ciclo de práctica de una instancia, pregunta si hace falta
 * otro ciclo. Al aceptar, copia los pasos del ciclo que se acaba de cerrar (con lo que el usuario haya editado en
 * ellos), los inserta en la cadena a continuación y corre lo que sigue si hace falta. Devuelve `true` si agregó ciclo.
 */
export async function ofrecerOtroCiclo(tarea) {
  const origen = tarea.tarea_origen;
  if (!origen || origen.paso !== 'correccion' || !origen.ciclo) return false;
  const mismos = estado.tareas.filter((t) => t.tarea_origen && t.tarea_origen.grupo === origen.grupo && t.tarea_origen.instancia === origen.instancia);
  const maximo = Math.max(...mismos.filter((t) => t.tarea_origen.paso === 'correccion').map((t) => t.tarea_origen.ciclo));
  if (origen.ciclo < maximo) return false;
  const ciclo = mismos.filter((t) => t.tarea_origen.ciclo === origen.ciclo && PASOS_DEL_CICLO.includes(t.tarea_origen.paso));
  const modelo = PASOS_DEL_CICLO.map((paso) => ciclo.find((t) => t.tarea_origen.paso === paso)).filter(Boolean);
  if (modelo.length === 0) return false;
  const quiere = confirm(`Terminaste el ciclo ${origen.ciclo} de práctica${origen.instancia ? ` de «${origen.instancia}»` : ''}. ¿Agregar otro ciclo antes de lo que sigue?`);
  if (!quiere) return false;

  const siguiente = estado.tareas.find((t) => t.tarea_dependiente === tarea.tarea_id && t.tarea_estado !== 'completada');
  const nuevoNumero = origen.ciclo + 1;
  let dia = fechaISOMasDias(1, tarea.tarea_fecha_fin ? diaLocal(tarea.tarea_fecha_fin) : hoyISO());
  let usados = 0;
  const nuevas = modelo.map((t) => {
    if (usados + t.tarea_duracion_min > MINUTOS_POR_DIA_CICLO && usados > 0) {
      dia = fechaISOMasDias(1, dia);
      usados = 0;
    }
    usados += t.tarea_duracion_min;
    return crearTarea({
      tarea_nombre: t.tarea_nombre.replace(`ciclo ${origen.ciclo}`, `ciclo ${nuevoNumero}`),
      categoria_id: t.categoria_id,
      tarea_importancia: t.tarea_importancia,
      tarea_duracion_min: t.tarea_duracion_min,
      tarea_descripcion: t.tarea_descripcion,
      tarea_fecha_sugerida: dia,
      tarea_fecha_limite: t.tarea_fecha_limite,
      tarea_origen: { ...t.tarea_origen, ciclo: nuevoNumero },
    });
  });
  nuevas.forEach((n, i) => {
    n.tarea_dependiente = i === 0 ? tarea.tarea_id : nuevas[i - 1].tarea_id;
    estado.tareas.push(n);
  });
  if (siguiente) siguiente.tarea_dependiente = nuevas[nuevas.length - 1].tarea_id;
  [...nuevas, ...(siguiente ? [siguiente] : [])].forEach((t) => recalcularBloqueo(t, estado.tareas));

  // Lo que sigue (por ejemplo el simulacro) se corre si el ciclo nuevo lo pisa.
  const ultimoDia = nuevas[nuevas.length - 1].tarea_fecha_sugerida;
  if (siguiente && siguiente.tarea_fecha_sugerida && diaLocal(siguiente.tarea_fecha_sugerida) <= ultimoDia) {
    reprogramarTareaConCascada(siguiente, fechaISOMasDias(1, ultimoDia), estado.tareas);
  }
  const limite = nuevas[0].tarea_fecha_limite;
  await persistirYNotificar();
  if (limite && ultimoDia >= diaLocal(limite)) {
    alert(`Se agregó el ciclo ${nuevoNumero}, pero termina después de la fecha del examen (${limite.slice(0, 10)}). Revisá las fechas.`);
  }
  return true;
}

/** Lo que corresponde después de cumplir una tarea: otro ciclo de práctica (si aplica) y exportar a Calendar. */
export async function despuesDeCumplir(tarea) {
  await ofrecerOtroCiclo(tarea);
  ofrecerExportarACalendar(tarea);
}
