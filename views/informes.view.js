import { estado } from '../assets/js/almacenamiento.js';
import { hoyISO, fechaISOMasDias, escaparHtml } from '../assets/js/utilidades.js';
import { ICONOS_IMPORTANCIA } from '../assets/js/modelos.js';
import { calcularEnfoque8020 } from '../assets/js/tareas-logica.js';

const DIAS_VENTANA = 7;
const ESTADOS_ACTIVOS = ['a_confirmar', 'pendiente', 'en_progreso'];

function seCompletoEnVentana(tarea, desde) {
  if (tarea.estado !== 'completada' || !tarea.completada_en) return false;
  return tarea.completada_en.slice(0, 10) >= desde;
}

function calcularPorCategoria(desde) {
  const filas = estado.categorias.map((categoria) => {
    const tareasCategoria = estado.tareas.filter((t) => t.categoria_id === categoria.id);
    return {
      nombre: categoria.nombre,
      color: categoria.color,
      completadas: tareasCategoria.filter((t) => seCompletoEnVentana(t, desde)).length,
      pendientes: tareasCategoria.filter((t) => ESTADOS_ACTIVOS.includes(t.estado)).length,
    };
  });

  const sinCategoria = estado.tareas.filter((t) => !t.categoria_id);
  filas.push({
    nombre: 'Sin categoría',
    color: '#9ca3af',
    completadas: sinCategoria.filter((t) => seCompletoEnVentana(t, desde)).length,
    pendientes: sinCategoria.filter((t) => ESTADOS_ACTIVOS.includes(t.estado)).length,
  });

  return filas.filter((f) => f.completadas > 0 || f.pendientes > 0);
}

function calcularDuraciones() {
  const conAmbasDuraciones = estado.tareas.filter(
    (t) => t.estado === 'completada' && t.duracion_estimada_min && t.duracion_real_min != null
  );
  if (conAmbasDuraciones.length === 0) return null;

  const totalEstimado = conAmbasDuraciones.reduce((suma, t) => suma + t.duracion_estimada_min, 0);
  const totalReal = conAmbasDuraciones.reduce((suma, t) => suma + t.duracion_real_min, 0);
  const promedioEstimado = totalEstimado / conAmbasDuraciones.length;
  const promedioReal = totalReal / conAmbasDuraciones.length;
  const diferenciaPorcentual = ((promedioReal - promedioEstimado) / promedioEstimado) * 100;

  return {
    cantidad: conAmbasDuraciones.length,
    promedioEstimado: Math.round(promedioEstimado),
    promedioReal: Math.round(promedioReal),
    diferenciaPorcentual: Math.round(diferenciaPorcentual),
  };
}

function calcularIndiceProcrastinacion(desde) {
  const procrastinadas = estado.tareas.filter(
    (t) => ESTADOS_ACTIVOS.includes(t.estado) && t.motivo_incumplimiento
  ).length;
  const completadasRecientes = estado.tareas.filter((t) => seCompletoEnVentana(t, desde)).length;
  const total = procrastinadas + completadasRecientes;
  const indice = total === 0 ? null : Math.round((procrastinadas / total) * 100);
  return { procrastinadas, completadasRecientes, indice };
}

export function renderVistaInformes(contenedor) {
  const desde = fechaISOMasDias(-(DIAS_VENTANA - 1), hoyISO());
  const porCategoria = calcularPorCategoria(desde);
  const duraciones = calcularDuraciones();
  const procrastinacion = calcularIndiceProcrastinacion(desde);
  const enfoque8020 = calcularEnfoque8020(estado.tareas, estado.categorias);

  contenedor.innerHTML = `
    <h2>Informes</h2>
    <p class="ayuda">Calculados sobre los últimos ${DIAS_VENTANA} días. Es un primer corte simple, no un histórico completo de eventos.</p>

    <section>
      <h3>Completadas vs. pendientes por categoría</h3>
      ${
        porCategoria.length === 0
          ? '<p class="mensaje-vacio">Todavía no hay tareas completadas ni pendientes para mostrar.</p>'
          : `<table class="tabla-informe">
              <thead>
                <tr><th>Categoría</th><th>Completadas (${DIAS_VENTANA}d)</th><th>Pendientes ahora</th></tr>
              </thead>
              <tbody>
                ${porCategoria
                  .map(
                    (f) => `
                      <tr>
                        <td><span class="punto-color" style="background:${f.color}"></span>${escaparHtml(f.nombre)}</td>
                        <td>${f.completadas}</td>
                        <td>${f.pendientes}</td>
                      </tr>`
                  )
                  .join('')}
              </tbody>
            </table>`
      }
    </section>

    <section>
      <h3>Duración estimada vs. real</h3>
      ${
        duraciones === null
          ? '<p class="mensaje-vacio">Todavía no hay tareas completadas con duración real cargada.</p>'
          : `<p class="notas-tarea">
              Sobre ${duraciones.cantidad} tarea(s) completada(s) con ambos datos: promedio estimado
              <strong>${duraciones.promedioEstimado} min</strong>, promedio real <strong>${duraciones.promedioReal} min</strong>
              (${duraciones.diferenciaPorcentual > 0 ? '+' : ''}${duraciones.diferenciaPorcentual}% respecto a lo estimado).
            </p>`
      }
    </section>

    <section>
      <h3>Índice de procrastinación</h3>
      ${
        procrastinacion.indice === null
          ? '<p class="mensaje-vacio">Todavía no hay datos suficientes.</p>'
          : `<p class="notas-tarea">
              <strong>${procrastinacion.indice}%</strong> — ${procrastinacion.procrastinadas} tarea(s) pospuesta(s) al menos una vez y sin completar,
              contra ${procrastinacion.completadasRecientes} completada(s) en los últimos ${DIAS_VENTANA} días.
            </p>`
      }
      <p class="ayuda">Es un proxy sobre el estado actual (no se guarda un historial de cuántas veces se pospuso cada tarea todavía).</p>
    </section>

    <section>
      <h3>Enfoque 80/20 (Pareto)</h3>
      ${
        enfoque8020.length === 0
          ? '<p class="mensaje-vacio">No hay tareas pendientes accionables para priorizar.</p>'
          : `<p class="ayuda">El ~20% de tus tareas pendientes accionables que más conviene priorizar ahora, según importancia y prioridad de categoría.</p>
              <ol class="lista-enfoque-8020">
                ${enfoque8020
                  .map((t) => {
                    const categoria = estado.categorias.find((c) => c.id === t.categoria_id);
                    return `<li>
                        ${categoria ? `<span class="punto-color" style="background:${categoria.color}"></span>` : ''}
                        ${ICONOS_IMPORTANCIA[t.importancia] || ICONOS_IMPORTANCIA.media} ${escaparHtml(t.nombre)}
                      </li>`;
                  })
                  .join('')}
              </ol>`
      }
    </section>
  `;
}
