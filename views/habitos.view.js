import { estado } from '../assets/js/almacenamiento.js';
import { calcularMapaHabitos, calcularMapaCategorias, calcularHabito, ESTADOS_CELDA } from '../assets/js/habitos.js';
import { escaparHtml, formatearFecha, hoyISO, fechaISOMasDias } from '../assets/js/utilidades.js';
import { obtenerPreferencias, guardarPreferencias } from '../assets/js/preferencias.js';
import { abrirDialogoFormulario } from '../assets/js/dialogo-formulario.js';

// Mostrar también los hábitos ocultos (estado de la sesión, no un dato de la app).
let mostrarOcultos = false;

// Preferencia de UI (no un dato de la app): cuántos días muestra el mapa de hábitos.
const CLAVE_LOCALSTORAGE = 'super-todo-list:habitos-dias';
const OPCIONES = [7, 30, 90];
const POR_DEFECTO = 30;

const SIMBOLOS = {
  [ESTADOS_CELDA.cumplido]: '✓',
  [ESTADOS_CELDA.incumplido]: '✗',
  [ESTADOS_CELDA.vence]: '▫',
  [ESTADOS_CELDA.noAplica]: '·',
};

function leerDias() {
  try {
    const guardado = Number(localStorage.getItem(CLAVE_LOCALSTORAGE));
    return OPCIONES.includes(guardado) ? guardado : POR_DEFECTO;
  } catch {
    return POR_DEFECTO;
  }
}

function guardarDias(dias) {
  try {
    localStorage.setItem(CLAVE_LOCALSTORAGE, String(dias));
  } catch {
    // Solo es una preferencia: sin almacenamiento local se vuelve a la opción por defecto.
  }
}

/** Encabezado de las columnas: el número del día (y `dd/mm` el día 1 y el primero de la ventana). */
function encabezadosDias(celdas) {
  return celdas
    .map((celda, indice) => {
      const [, mes, dia] = celda.dia.split('-');
      const etiqueta = indice === 0 || dia === '01' ? `${dia}/${mes}` : dia;
      return `<th class="dia-habito" title="${formatearFecha(celda.dia)}">${etiqueta}</th>`;
    })
    .join('');
}

function htmlMatrizHabitos(habitos, ocultos) {
  return `
    <div class="matriz-habitos-contenedor">
      <table class="matriz-habitos">
        <thead>
          <tr>
            <th class="nombre-habito">Hábito</th>
            <th title="Racha actual">🔥</th>
            <th title="Porcentaje de cumplimiento del período">%</th>
            ${encabezadosDias(habitos[0].celdas)}
          </tr>
        </thead>
        <tbody>
          ${habitos
            .map(
              (h) => `
            <tr>
              <th class="nombre-habito" scope="row"><button type="button" class="enlace-habito" data-calendario-habito="${escaparHtml(h.nombre)}" title="Ver el año completo de este hábito">${escaparHtml(h.nombre)}</button>${h.terminado ? ' <span class="etiqueta-fecha" title="Este hábito temporal ya llegó a su fin">✔ terminado</span>' : ''}
                ${
                  ocultos.has(h.nombre)
                    ? `<button type="button" class="boton-habito-ocultar" data-mostrar-habito="${escaparHtml(h.nombre)}" title="Volver a mostrar este hábito">↩️ Mostrar</button>`
                    : `<button type="button" class="boton-habito-ocultar" data-ocultar-habito="${escaparHtml(h.nombre)}" title="Ocultar este hábito de la matriz (no se borra nada)">🙈</button>`
                }</th>
              <td class="dato-habito">${h.racha}</td>
              <td class="dato-habito">${h.porcentaje == null ? '—' : `${h.porcentaje} %`}</td>
              ${h.celdas.map((c) => `<td class="celda-habito ${c.estado}" title="${formatearFecha(c.dia)} · ${c.titulo}">${SIMBOLOS[c.estado]}</td>`).join('')}
            </tr>`
            )
            .join('')}
        </tbody>
      </table>
    </div>`;
}

function htmlMatrizCategorias(filas) {
  return `
    <div class="matriz-habitos-contenedor">
      <table class="matriz-habitos">
        <thead>
          <tr>
            <th class="nombre-habito">Categoría</th>
            <th title="Días con al menos una tarea cumplida en el período">Días</th>
            ${encabezadosDias(filas[0].celdas)}
          </tr>
        </thead>
        <tbody>
          ${filas
            .map(
              (f) => `
            <tr>
              <th class="nombre-habito" scope="row"><span class="punto-color" style="background:${f.categoria.categoria_color}"></span>${escaparHtml(f.categoria.categoria_nombre)}</th>
              <td class="dato-habito">${f.diasActivos}</td>
              ${f.celdas
                .map(
                  (c) =>
                    `<td class="celda-habito ${c.cantidad > 0 ? ESTADOS_CELDA.cumplido : ESTADOS_CELDA.noAplica}" title="${formatearFecha(c.dia)} · ${c.cantidad > 0 ? `${c.cantidad} tarea${c.cantidad === 1 ? '' : 's'} cumplida${c.cantidad === 1 ? '' : 's'}` : 'Sin actividad'}">${c.cantidad > 0 ? '✓' : '·'}</td>`
                )
                .join('')}
            </tr>`
            )
            .join('')}
        </tbody>
      </table>
    </div>`;
}

/** Solapa "Hábitos" de Estadísticas: matriz de hábitos (tareas de mantenimiento) y actividad por categoría. */
export function renderVistaHabitos(contenedor) {
  const dias = leerDias();
  const todosLosHabitos = calcularMapaHabitos(estado, { dias });
  const ocultos = new Set(obtenerPreferencias().pref_habitos_ocultos || []);
  const cantidadOcultos = todosLosHabitos.filter((h) => ocultos.has(h.nombre)).length;
  const habitos = mostrarOcultos ? todosLosHabitos : todosLosHabitos.filter((h) => !ocultos.has(h.nombre));
  const categorias = calcularMapaCategorias(estado, { dias });

  contenedor.innerHTML = `
    <blockquote class="cita-habitos">Lo que no se mide no se mejora.</blockquote>
    <blockquote class="cita-habitos">La maldición de la disciplina es que todos los días parecen iguales. La maldición de la indisciplina es que todos los años parecen iguales.</blockquote>
    <p class="ayuda">Cada fila es una tarea con repetición (un hábito) y cada columna un día; hoy es la última.</p>
    <div class="selector-rango" role="group" aria-label="Período">
      ${OPCIONES.map((n) => `<button type="button" data-dias="${n}" title="Ver los últimos ${n} días" class="${n === dias ? 'activo' : ''}">${n} días</button>`).join('')}
    </div>

    <section>
      <h3>🔥 Hábitos</h3>
      ${
        habitos.length === 0
          ? `<p class="mensaje-vacio">${cantidadOcultos > 0 ? 'Todos los hábitos están ocultos.' : 'Todavía no hay hábitos: aparecen cuando cumplís una tarea con repetición (una tarea que se repite).'}</p>`
          : htmlMatrizHabitos(habitos, ocultos)
      }
      ${
        cantidadOcultos > 0
          ? `<p class="ayuda"><button type="button" id="boton-ver-ocultos-habitos">${mostrarOcultos ? '🙈 Volver a ocultarlos' : `👁️ Mostrar los ${cantidadOcultos} hábito${cantidadOcultos === 1 ? '' : 's'} oculto${cantidadOcultos === 1 ? '' : 's'}`}</button> Un hábito oculto no se borra ni pierde su historial: solo deja de aparecer en la matriz.</p>`
          : ''
      }
      <p class="ayuda leyenda-habitos"><strong>✓</strong> cumplido — <strong>✗</strong> incumplido (día hábil sin hacer, o vencimiento que se cumplió tarde o sigue vencido) — <strong>▫</strong> pendiente hoy — <strong>·</strong> no aplica (día no hábil o sin vencimiento). 🔥 racha: días hábiles seguidos cumplidos (en hábitos que no son diarios, veces seguidas a tiempo). % = cumplimientos a tiempo sobre los que tocaban en el período.</p>
    </section>

    <section>
      <h3>🗂️ Actividad por categoría</h3>
      ${
        categorias.length === 0
          ? '<p class="mensaje-vacio">Todavía no hay tareas cumplidas con categoría para mostrar.</p>'
          : `${htmlMatrizCategorias(categorias)}
             <p class="ayuda leyenda-habitos">✓ = ese día se cumplió al menos una tarea de la categoría o de sus subcategorías. Los días sin actividad quedan en blanco: no se consideran incumplidos.</p>`
      }
    </section>
  `;

  // Hoy es la última columna: la matriz arranca desplazada al final para que se vea lo más reciente.
  contenedor.querySelectorAll('.matriz-habitos-contenedor').forEach((matriz) => {
    matriz.scrollLeft = matriz.scrollWidth;
  });

  contenedor.querySelectorAll('[data-ocultar-habito]').forEach((boton) =>
    boton.addEventListener('click', async () => {
      const lista = new Set(obtenerPreferencias().pref_habitos_ocultos || []);
      lista.add(boton.dataset.ocultarHabito);
      await guardarPreferencias({ pref_habitos_ocultos: [...lista] });
    })
  );
  contenedor.querySelectorAll('[data-mostrar-habito]').forEach((boton) =>
    boton.addEventListener('click', async () => {
      const lista = new Set(obtenerPreferencias().pref_habitos_ocultos || []);
      lista.delete(boton.dataset.mostrarHabito);
      await guardarPreferencias({ pref_habitos_ocultos: [...lista] });
    })
  );
  contenedor.querySelector('#boton-ver-ocultos-habitos')?.addEventListener('click', () => {
    mostrarOcultos = !mostrarOcultos;
    renderVistaHabitos(contenedor);
  });
  contenedor.querySelectorAll('[data-calendario-habito]').forEach((boton) => boton.addEventListener('click', () => abrirCalendarioHabito(boton.dataset.calendarioHabito)));

  contenedor.querySelectorAll('.selector-rango button').forEach((boton) => {
    boton.addEventListener('click', () => {
      guardarDias(Number(boton.dataset.dias));
      renderVistaHabitos(contenedor);
    });
  });
}

const NOMBRES_MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/**
 * Calendario de un hábito, estilo GitHub (v0.104.0): el último año en columnas de semanas (lunes a domingo, de arriba
 * abajo), con el mismo color por estado que la matriz.
 */
export function abrirCalendarioHabito(nombre) {
  const hasta = hoyISO();
  const habito = calcularHabito(nombre, estado, { dias: 365, hasta });
  const porDia = new Map(habito.celdas.map((c) => [c.dia, c]));
  // El primer día va a la columna de su semana: se rellena hacia atrás hasta el lunes.
  const primero = habito.celdas[0].dia;
  const diaSemanaLunes = (iso) => (new Date(`${iso}T00:00:00`).getDay() + 6) % 7;
  const inicio = fechaISOMasDias(-diaSemanaLunes(primero), primero);
  const semanas = [];
  for (let dia = inicio; dia <= hasta; dia = fechaISOMasDias(7, dia)) {
    semanas.push(Array.from({ length: 7 }, (_, i) => fechaISOMasDias(i, dia)));
  }
  const columnas = semanas
    .map((semana, indice) => {
      const [, mes, numero] = semana[0].split('-');
      const etiquetaMes = indice === 0 || Number(numero) <= 7 ? NOMBRES_MES[Number(mes) - 1] : '';
      return `<div class="semana-calendario-habito"><span class="mes-calendario-habito">${etiquetaMes}</span>${semana
        .map((dia) => {
          const celda = porDia.get(dia);
          if (!celda || dia > hasta) return '<span class="dia-calendario-habito vacio"></span>';
          return `<span class="dia-calendario-habito ${celda.estado}" title="${formatearFecha(dia)} · ${celda.titulo}"></span>`;
        })
        .join('')}</div>`;
    })
    .join('');
  const cumplidos = habito.celdas.filter((c) => c.estado === ESTADOS_CELDA.cumplido).length;
  const dialogo = abrirDialogoFormulario({
    titulo: `🔥 ${nombre}`,
    cuerpoHtml: `
      <p class="ayuda">Último año. Racha actual: <strong>${habito.racha}</strong> · Cumplido <strong>${cumplidos}</strong> día${cumplidos === 1 ? '' : 's'}${habito.porcentaje == null ? '' : ` · ${habito.porcentaje} % a tiempo`}.</p>
      <div class="calendario-habito">${columnas}</div>
      <p class="ayuda leyenda-habitos"><span class="dia-calendario-habito cumplido"></span> cumplido <span class="dia-calendario-habito incumplido"></span> incumplido <span class="dia-calendario-habito vence"></span> pendiente hoy <span class="dia-calendario-habito no-aplica"></span> no aplica</p>`,
    textoGuardar: '✖️ Cerrar',
    alGuardar: () => true,
  });
  dialogo.classList.add('dialogo-calendario-habito');
  const calendario = dialogo.querySelector('.calendario-habito');
  calendario.scrollLeft = calendario.scrollWidth;
}
