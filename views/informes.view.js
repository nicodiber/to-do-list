import { estado } from '../assets/js/almacenamiento.js';
import { hoyISO, fechaISOMasDias, formatearFecha, escaparHtml } from '../assets/js/utilidades.js';
import { ICONOS_IMPORTANCIA } from '../assets/js/modelos.js';
import { calcularEnfoque8020 } from '../assets/js/tareas-logica.js';

const DIAS_VENTANA = 7;
const ESTADOS_ACTIVOS = ['a_confirmar', 'pendiente', 'en_progreso'];

function seCompletoEnVentana(tarea, desde) {
  if (tarea.tarea_estado !== 'completada' || !tarea.tarea_completada_en) return false;
  return tarea.tarea_completada_en.slice(0, 10) >= desde;
}

function calcularPorCategoria(desde) {
  const filas = estado.categorias.map((categoria) => {
    const tareasCategoria = estado.tareas.filter((t) => t.categoria_id === categoria.categoria_id);
    return {
      nombre: categoria.categoria_nombre,
      color: categoria.categoria_color,
      completadas: tareasCategoria.filter((t) => seCompletoEnVentana(t, desde)).length,
      pendientes: tareasCategoria.filter((t) => ESTADOS_ACTIVOS.includes(t.tarea_estado)).length,
    };
  });

  const sinCategoria = estado.tareas.filter((t) => !t.categoria_id);
  filas.push({
    nombre: 'Sin categoría',
    color: '#9ca3af',
    completadas: sinCategoria.filter((t) => seCompletoEnVentana(t, desde)).length,
    pendientes: sinCategoria.filter((t) => ESTADOS_ACTIVOS.includes(t.tarea_estado)).length,
  });

  return filas.filter((f) => f.completadas > 0 || f.pendientes > 0);
}

function calcularDuraciones() {
  const conAmbasDuraciones = estado.tareas.filter(
    (t) => t.tarea_estado === 'completada' && t.tarea_duracion_estimada_min && t.tarea_duracion_real_min != null
  );
  if (conAmbasDuraciones.length === 0) return null;

  const totalEstimado = conAmbasDuraciones.reduce((suma, t) => suma + t.tarea_duracion_estimada_min, 0);
  const totalReal = conAmbasDuraciones.reduce((suma, t) => suma + t.tarea_duracion_real_min, 0);
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

function calcularProyeccionCostos() {
  const pendientesConCosto = estado.tareas.filter((t) => ESTADOS_ACTIVOS.includes(t.tarea_estado) && t.tarea_costo_estimado);
  const total = pendientesConCosto.reduce((suma, t) => suma + t.tarea_costo_estimado, 0);
  return { cantidad: pendientesConCosto.length, total };
}

function calcularCostosRealVsEstimado() {
  const conAmbosCostos = estado.tareas.filter(
    (t) => t.tarea_estado === 'completada' && t.tarea_costo_estimado && t.tarea_costo_real != null
  );
  if (conAmbosCostos.length === 0) return null;

  const totalEstimado = conAmbosCostos.reduce((suma, t) => suma + t.tarea_costo_estimado, 0);
  const totalReal = conAmbosCostos.reduce((suma, t) => suma + t.tarea_costo_real, 0);
  const diferenciaPorcentual = Math.round(((totalReal - totalEstimado) / totalEstimado) * 100);

  return { cantidad: conAmbosCostos.length, totalEstimado, totalReal, diferenciaPorcentual };
}

const SEMANAS_THROUGHPUT = 8;

function calcularThroughputSemanal() {
  const hoy = hoyISO();
  const semanas = [];
  for (let i = SEMANAS_THROUGHPUT - 1; i >= 0; i--) {
    const fin = fechaISOMasDias(-7 * i, hoy);
    const inicio = fechaISOMasDias(-7 * i - 6, hoy);
    const cantidad = estado.tareas.filter(
      (t) =>
        t.tarea_estado === 'completada' &&
        t.tarea_completada_en &&
        t.tarea_completada_en.slice(0, 10) >= inicio &&
        t.tarea_completada_en.slice(0, 10) <= fin
    ).length;
    semanas.push({ inicio, fin, cantidad });
  }
  return semanas;
}

export function renderVistaInformes(contenedor) {
  const desde = fechaISOMasDias(-(DIAS_VENTANA - 1), hoyISO());
  const porCategoria = calcularPorCategoria(desde);
  const duraciones = calcularDuraciones();
  const enfoque8020 = calcularEnfoque8020(estado.tareas, estado.categorias);
  const proyeccionCostos = calcularProyeccionCostos();
  const costos = calcularCostosRealVsEstimado();
  const throughput = calcularThroughputSemanal();
  const maxThroughput = Math.max(1, ...throughput.map((s) => s.cantidad));
  const totalThroughput = throughput.reduce((suma, s) => suma + s.cantidad, 0);

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
      <h3>Enfoque 80/20 (Pareto)</h3>
      ${
        enfoque8020.length === 0
          ? '<p class="mensaje-vacio">No hay tareas pendientes accionables para priorizar.</p>'
          : `<p class="ayuda">El ~20% de tus tareas pendientes accionables que más conviene priorizar ahora, según importancia y prioridad de categoría.</p>
              <ol class="lista-enfoque-8020">
                ${enfoque8020
                  .map((t) => {
                    const categoria = estado.categorias.find((c) => c.categoria_id === t.categoria_id);
                    return `<li>
                        ${categoria ? `<span class="punto-color" style="background:${categoria.categoria_color}"></span>` : ''}
                        ${ICONOS_IMPORTANCIA[t.tarea_importancia] || ICONOS_IMPORTANCIA.media} ${escaparHtml(t.tarea_nombre)}
                      </li>`;
                  })
                  .join('')}
              </ol>`
      }
    </section>

    <section>
      <h3>Costos</h3>
      ${
        proyeccionCostos.cantidad === 0
          ? '<p class="mensaje-vacio">No hay tareas pendientes con costo estimado cargado.</p>'
          : `<p class="notas-tarea">
              Costo estimado de tus tareas pendientes: <strong>$${proyeccionCostos.total}</strong>
              (sobre ${proyeccionCostos.cantidad} tarea(s) con costo cargado).
            </p>`
      }
      ${
        costos === null
          ? ''
          : `<p class="notas-tarea">
              Sobre ${costos.cantidad} tarea(s) completada(s) con ambos costos: total estimado
              <strong>$${costos.totalEstimado}</strong>, total real <strong>$${costos.totalReal}</strong>
              (${costos.diferenciaPorcentual > 0 ? '+' : ''}${costos.diferenciaPorcentual}% respecto a lo estimado).
            </p>`
      }
    </section>

    <section>
      <h3>Throughput semanal</h3>
      ${
        totalThroughput === 0
          ? '<p class="mensaje-vacio">Todavía no hay tareas completadas para mostrar una tendencia.</p>'
          : `<div class="throughput-semanal">
              ${throughput
                .map(
                  (s) => `
                    <div class="barra-throughput-item">
                      <span class="barra-throughput-valor">${s.cantidad}</span>
                      <div class="barra-throughput" style="height:${(s.cantidad / maxThroughput) * 100}%"></div>
                      <span class="barra-throughput-etiqueta">${formatearFecha(s.inicio)}</span>
                    </div>`
                )
                .join('')}
            </div>
            <p class="ayuda">Promedio: ${(totalThroughput / SEMANAS_THROUGHPUT).toFixed(1)} tarea(s)/semana en las últimas ${SEMANAS_THROUGHPUT} semanas.</p>`
      }
    </section>
  `;
}
