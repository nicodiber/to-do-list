import { estado } from '../assets/js/almacenamiento.js';
import { hoyISO, fechaISOMasDias, formatearFecha, escaparHtml } from '../assets/js/utilidades.js';
import { ICONOS_IMPORTANCIA } from '../assets/js/modelos.js';

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
        t.tarea_fecha_fin &&
        t.tarea_fecha_fin.slice(0, 10) >= inicio &&
        t.tarea_fecha_fin.slice(0, 10) <= fin
    ).length;
    semanas.push({ inicio, fin, cantidad });
  }
  return semanas;
}

export function renderVistaInformes(contenedor) {
  const desde = fechaISOMasDias(-(DIAS_VENTANA - 1), hoyISO());
  const porCategoria = calcularPorCategoria(desde);
  const proyeccionCostos = calcularProyeccionCostos();
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
