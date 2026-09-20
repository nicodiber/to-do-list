import { estado } from '../assets/js/almacenamiento.js';
import { hoyISO, fechaISOMasDias, formatearFecha, escaparHtml } from '../assets/js/utilidades.js';
import { ICONOS_IMPORTANCIA } from '../assets/js/modelos.js';
import { fechaDeReferencia } from '../assets/js/vista-agenda.js';

const DIAS_VENTANA = 7;
const ESTADOS_ACTIVOS = ['bloqueada', 'pendiente'];

function seCompletoEnVentana(tarea, desde) {
  if (tarea.tarea_estado !== 'completada' || !tarea.tarea_fecha_fin) return false;
  return tarea.tarea_fecha_fin.slice(0, 10) >= desde;
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

function calcularProyeccionCostos() {
  const pendientesConCosto = estado.tareas.filter((t) => ESTADOS_ACTIVOS.includes(t.tarea_estado) && t.tarea_costo_estimado);
  const total = pendientesConCosto.reduce((suma, t) => suma + t.tarea_costo_estimado, 0);
  return { cantidad: pendientesConCosto.length, total };
}

const SEMANAS_HECHAS = 2;
const SEMANAS_PLANIFICADAS = 6;

/**
 * Throughput semanal: las últimas `SEMANAS_HECHAS` semanas (bloques de 7 días que terminan hoy)
 * con las tareas completadas en cada una, y las próximas `SEMANAS_PLANIFICADAS` (bloques de 7
 * días desde mañana) con las tareas sin completar cuya fecha sugerida o, si no tiene, su
 * fecha límite cae en ese bloque.
 */
function calcularThroughputSemanal() {
  const hoy = hoyISO();
  const semanas = [];
  for (let i = SEMANAS_HECHAS - 1; i >= 0; i--) {
    const fin = fechaISOMasDias(-7 * i, hoy);
    const inicio = fechaISOMasDias(-7 * i - 6, hoy);
    const cantidad = estado.tareas.filter(
      (t) =>
        t.tarea_estado === 'completada' &&
        t.tarea_fecha_fin &&
        t.tarea_fecha_fin.slice(0, 10) >= inicio &&
        t.tarea_fecha_fin.slice(0, 10) <= fin
    ).length;
    semanas.push({ inicio, fin, cantidad, planificada: false });
  }
  for (let i = 0; i < SEMANAS_PLANIFICADAS; i++) {
    const inicio = fechaISOMasDias(1 + 7 * i, hoy);
    const fin = fechaISOMasDias(7 + 7 * i, hoy);
    const cantidad = estado.tareas.filter((t) => {
      if (!ESTADOS_ACTIVOS.includes(t.tarea_estado)) return false;
      const fecha = fechaDeReferencia(t);
      return fecha && fecha >= inicio && fecha <= fin;
    }).length;
    semanas.push({ inicio, fin, cantidad, planificada: true });
  }
  return semanas;
}

/** Fecha corta (dd/mm) para el eje del gráfico. */
function fechaCorta(iso) {
  return formatearFecha(iso).slice(0, 5);
}

export function renderVistaEstadisticas(contenedor) {
  const desde = fechaISOMasDias(-(DIAS_VENTANA - 1), hoyISO());
  const porCategoria = calcularPorCategoria(desde);
  const proyeccionCostos = calcularProyeccionCostos();
  const throughput = calcularThroughputSemanal();
  const maxThroughput = Math.max(1, ...throughput.map((s) => s.cantidad));
  const totalHechas = throughput.filter((s) => !s.planificada).reduce((suma, s) => suma + s.cantidad, 0);
  const totalPlanificadas = throughput.filter((s) => s.planificada).reduce((suma, s) => suma + s.cantidad, 0);

  contenedor.innerHTML = `
    <h2>Estadísticas</h2>
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
      <h3>Costos</h3>
      ${
        proyeccionCostos.cantidad === 0
          ? '<p class="mensaje-vacio">No hay tareas pendientes con costo estimado cargado.</p>'
          : `<p class="notas-tarea">
              Costo estimado de tus tareas pendientes: <strong>$${proyeccionCostos.total}</strong>
              (sobre ${proyeccionCostos.cantidad} tarea(s) con costo cargado).
            </p>`
      }
    </section>

    <section>
      <h3>Throughput semanal</h3>
      ${
        totalHechas === 0 && totalPlanificadas === 0
          ? '<p class="mensaje-vacio">Todavía no hay tareas completadas ni planificadas para mostrar.</p>'
          : `<div class="throughput-semanal">
              ${throughput
                .map(
                  (s) => `
                    <div class="barra-throughput-item">
                      <span class="barra-throughput-valor">${s.cantidad}</span>
                      <div class="barra-throughput${s.planificada ? ' planificada' : ''}" style="height:${(s.cantidad / maxThroughput) * 100}%" title="${s.planificada ? 'Planificadas' : 'Completadas'} del ${formatearFecha(s.inicio)} al ${formatearFecha(s.fin)}"></div>
                      <span class="barra-throughput-etiqueta">${fechaCorta(s.inicio)}</span>
                    </div>`
                )
                .join('')}
            </div>
            <p class="ayuda leyenda-throughput"><span class="muestra-throughput"></span> completadas (últimas ${SEMANAS_HECHAS} semanas) · <span class="muestra-throughput planificada"></span> planificadas (próximas ${SEMANAS_PLANIFICADAS} semanas, por fecha sugerida o límite). Cada barra es una semana y se rotula con su primer día.</p>
            <p class="ayuda">Completadas: ${(totalHechas / SEMANAS_HECHAS).toFixed(1)} tarea(s)/semana en las últimas ${SEMANAS_HECHAS} semanas. Planificadas: ${(totalPlanificadas / SEMANAS_PLANIFICADAS).toFixed(1)} tarea(s)/semana en las próximas ${SEMANAS_PLANIFICADAS}.</p>`
      }
    </section>
  `;
}
