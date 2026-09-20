import { estado } from '../assets/js/almacenamiento.js';
import { calcularProgresoPorCategoria } from '../assets/js/progreso-categorias.js';
import { escaparHtml, formatearFecha, diaLocal } from '../assets/js/utilidades.js';

/** "hoy", "mañana" o "en N días". */
function textoDias(dias) {
  if (dias === 0) return 'hoy';
  if (dias === 1) return 'mañana';
  return `en ${dias} días`;
}

function filaFecha(etiqueta, dato, campo) {
  if (!dato) return `<li><span class="metrica-etiqueta">${etiqueta}</span> <span class="metrica-valor">—</span></li>`;
  return `<li><span class="metrica-etiqueta">${etiqueta}</span> <span class="metrica-valor">${textoDias(dato.dias)}</span> <span class="metrica-detalle">(${formatearFecha(diaLocal(dato.tarea[campo]))} · ${escaparHtml(dato.tarea.tarea_nombre)})</span></li>`;
}

/** Las 4 métricas de un grupo de tareas (restantes vs. completadas y los tres tiempos). */
function htmlMetricas(m) {
  const porcentaje = m.total > 0 ? Math.round((m.completadas / m.total) * 100) : 0;
  return `
    <p class="progreso-resumen"><strong>${m.completadas}</strong> completada${m.completadas === 1 ? '' : 's'} de <strong>${m.total}</strong> (${porcentaje} %) · faltan <strong>${m.restantes}</strong>${m.vencidas > 0 ? ` · <span class="etiqueta-vencida">⚠️ ${m.vencidas} vencida${m.vencidas === 1 ? '' : 's'}</span>` : ''}</p>
    <div class="barra-progreso" role="progressbar" aria-valuenow="${porcentaje}" aria-valuemin="0" aria-valuemax="100"><div class="barra-progreso-relleno" style="width:${porcentaje}%"></div></div>
    <ul class="metricas-progreso">
      ${filaFecha('Próxima fecha límite:', m.proximaLimite, 'tarea_fecha_limite')}
      ${filaFecha('Próxima fecha sugerida:', m.proximaSugerida, 'tarea_fecha_sugerida')}
      ${filaFecha('Última fecha límite:', m.ultimaLimite, 'tarea_fecha_limite')}
    </ul>`;
}

/** Solapa "Progreso por categoría" de Estadísticas: una tarjeta por categoría raíz, con sus subcategorías desplegables. */
export function renderVistaProgreso(contenedor) {
  const tarjetas = calcularProgresoPorCategoria(estado);

  contenedor.innerHTML = `
    <p class="ayuda">Cuánto falta en cada categoría y cuándo vencen las tareas que quedan. Cada categoría principal suma todas sus subcategorías.</p>
    ${
      tarjetas.length === 0
        ? '<p class="mensaje-vacio">Todavía no hay tareas para mostrar el progreso.</p>'
        : `<div class="tarjetas-progreso">
            ${tarjetas
              .map(
                (t) => `
              <article class="tarjeta-progreso" style="--color-categoria:${t.categoria ? t.categoria.categoria_color : 'var(--color-borde)'}">
                <h3>${t.categoria ? escaparHtml(t.categoria.categoria_nombre) : 'Sin categoría'}</h3>
                ${htmlMetricas(t.metricas)}
                ${
                  t.subcategorias.length > 0
                    ? `<details class="subcategorias-progreso">
                        <summary>Ver subcategorías (${t.subcategorias.length})</summary>
                        ${t.subcategorias
                          .map(
                            (s) => `
                          <div class="subcategoria-progreso" style="margin-left:${(s.profundidad - 1) * 0.9}rem">
                            <h4><span class="punto-color" style="background:${s.categoria.categoria_color}"></span>${escaparHtml(s.categoria.categoria_nombre)}</h4>
                            ${s.metricas.total > 0 ? htmlMetricas(s.metricas) : '<p class="ayuda">Sin tareas.</p>'}
                          </div>`
                          )
                          .join('')}
                      </details>`
                    : ''
                }
              </article>`
              )
              .join('')}
          </div>`
    }
  `;
}
