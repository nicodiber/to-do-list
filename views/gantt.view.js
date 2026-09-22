import { estado, persistirYNotificar } from '../assets/js/almacenamiento.js';
import { escaparHtml, formatearFecha, fechaISOMasDias, diasEntreFechas, hoyISO, tieneHora, combinarFechaYHora, formatearHora, arbolCategorias } from '../assets/js/utilidades.js';
import { reprogramarTareaConCascada } from '../assets/js/tareas-logica.js';
import { abrirEdicionTarea } from '../assets/js/modal-tarea.js';
import { construirFilas, calcularPosiciones, calcularConexiones, AGRUPACIONES } from '../assets/js/gantt-modelo.js';

// Preferencias de UI (no datos de la app): zoom, modo y agrupación se recuerdan en este dispositivo.
const PREFIJO = 'super-todo-list:gantt-';
const SEMANAS = [2, 4, 12];
const MODOS = ['plan', 'ventana'];
const ETIQUETAS_AGRUPACION = { categoria: 'Categoría principal', meta: 'Meta', nada: 'Nada' };
const ETIQUETAS_ESTADO = { activas: 'Pendientes y bloqueadas', pendientes: 'Solo pendientes', bloqueadas: 'Solo bloqueadas', completadas: 'Completadas', todas: 'Todas' };

const ALTO_FILA = 34;
const ALTO_CARRIL = 28;
const ALTO_CABECERA = 44;
const DIAS_ANTES = 7;
const DIAS_MAXIMOS = 365;
const ANCHO_DIA_MINIMO = 6;
const UMBRAL_ARRASTRE_PX = 4;
const SVG_NS = 'http://www.w3.org/2000/svg';

// Los filtros viven mientras la página está abierta; el desplazamiento se conserva entre redibujados.
let filtros = { categoria: '', meta: '', estado: 'activas', texto: '' };
let scrollGuardado = { left: 0, top: 0 };
let centrarEnHoy = true;

function leerPref(clave, validos, porDefecto) {
  try {
    const guardado = localStorage.getItem(PREFIJO + clave);
    const valor = typeof validos[0] === 'number' ? Number(guardado) : guardado;
    return validos.includes(valor) ? valor : porDefecto;
  } catch {
    return porDefecto;
  }
}

function guardarPref(clave, valor) {
  try {
    localStorage.setItem(PREFIJO + clave, String(valor));
  } catch {
    // Solo es una preferencia: sin almacenamiento local se vuelve a la opción por defecto.
  }
}

const anchoNombres = () => (window.matchMedia('(max-width: 640px)').matches ? 112 : 190);

/** Gantt: todas las tareas en el tiempo, en modo Plan (día sugerido) o Ventana (margen entre habilitada y límite). */
export function renderVistaGantt(contenedor) {
  // En celular la ventana por defecto es de 2 semanas: con 4 los días quedan demasiado angostos.
  const semanas = leerPref('semanas', SEMANAS, window.matchMedia('(max-width: 640px)').matches ? 2 : 4);
  const modo = leerPref('modo', MODOS, 'plan');
  const agruparPor = leerPref('agrupar', AGRUPACIONES, 'nada');

  contenedor.innerHTML = `
    <h2>📊 Gantt</h2>
    <div class="controles-gantt">
      <div class="selector-rango" role="group" aria-label="Modo">
        <button type="button" data-modo="plan" class="${modo === 'plan' ? 'activo' : ''}" title="Cada tarea en su día sugerido">📅 Plan</button>
        <button type="button" data-modo="ventana" class="${modo === 'ventana' ? 'activo' : ''}" title="El margen (holgura) entre habilitada y límite">↔️ Ventana</button>
      </div>
      <div class="selector-rango" role="group" aria-label="Escala">
        ${SEMANAS.map((n) => `<button type="button" data-semanas="${n}" class="${n === semanas ? 'activo' : ''}" title="Ver ${n} semanas a la vez">${n} sem.</button>`).join('')}
        <button title="Volver a hoy" type="button" data-accion="hoy">Hoy</button>
      </div>
    </div>
    <div class="filtros filtros-gantt">
      <label title="Cómo se separan las filas en carriles">🧩 Agrupar por
        <select id="gantt-agrupar">${AGRUPACIONES.map((a) => `<option value="${a}" ${a === agruparPor ? 'selected' : ''}>${ETIQUETAS_AGRUPACION[a]}</option>`).join('')}</select>
      </label>
      <label title="Mostrar solo las tareas de esta categoría (y sus subcategorías)">🗂️ Categoría
        <select id="gantt-categoria">
          <option value="">Todas</option>
          ${arbolCategorias(estado.categorias)
            .map(({ categoria, profundidad }) => `<option value="${categoria.categoria_id}" ${filtros.categoria === categoria.categoria_id ? 'selected' : ''}>${'— '.repeat(profundidad)}${escaparHtml(categoria.categoria_nombre)}</option>`)
            .join('')}
        </select>
      </label>
      <label title="Mostrar solo las tareas de esta meta">🏁 Meta
        <select id="gantt-meta">
          <option value="">Todas</option>
          ${estado.metas.map((m) => `<option value="${m.meta_id}" ${filtros.meta === m.meta_id ? 'selected' : ''}>${escaparHtml(m.meta_nombre)}</option>`).join('')}
        </select>
      </label>
      <label title="Mostrar solo las tareas en este estado">🚦 Estado
        <select id="gantt-estado">${Object.entries(ETIQUETAS_ESTADO).map(([clave, texto]) => `<option value="${clave}" ${filtros.estado === clave ? 'selected' : ''}>${texto}</option>`).join('')}</select>
      </label>
      <label>🔎 Buscar
        <input type="search" id="gantt-texto" title="Buscar por nombre (tecla F)" placeholder="Nombre de la tarea" value="${escaparHtml(filtros.texto)}" />
      </label>
    </div>
    <p class="ayuda leyenda-gantt">${
      modo === 'plan'
        ? '▮ Cada barra es el día sugerido de la tarea (punteada: posición estimada por prioridad, todavía sin fecha; “📌 Fijar” la guarda). ⚑ es la fecha límite (roja si vence antes del día plan o ya venció). La línea vertical es hoy. Las flechas unen las cadenas (roja: queda antes de su previa; punteada 🔁: cierre del anillo). Arrastrá una barra para cambiar su fecha sugerida; tocá una tarea para editarla.'
        : '▬ Cada barra es el margen para hacerla: desde hoy (o su fecha habilitada) hasta su límite (rayada y roja si ya venció). ◆ marca el día plan. Arrastrá los bordes para cambiar la fecha habilitada o el límite; tocá una tarea para editarla.'
    }</p>
    <div class="gantt-desplazable"></div>
  `;

  const desplazable = contenedor.querySelector('.gantt-desplazable');
  desplazable.addEventListener('scroll', () => {
    scrollGuardado = { left: desplazable.scrollLeft, top: desplazable.scrollTop };
  });
  const redibujar = () => dibujarGrilla(desplazable, { semanas, modo, agruparPor });

  contenedor.querySelectorAll('[data-modo]').forEach((boton) =>
    boton.addEventListener('click', () => {
      guardarPref('modo', boton.dataset.modo);
      renderVistaGantt(contenedor);
    })
  );
  contenedor.querySelectorAll('[data-semanas]').forEach((boton) =>
    boton.addEventListener('click', () => {
      guardarPref('semanas', boton.dataset.semanas);
      centrarEnHoy = true;
      renderVistaGantt(contenedor);
    })
  );
  contenedor.querySelector('[data-accion="hoy"]').addEventListener('click', () => {
    centrarEnHoy = true;
    redibujar();
  });
  contenedor.querySelector('#gantt-agrupar').addEventListener('change', (evento) => {
    guardarPref('agrupar', evento.target.value);
    renderVistaGantt(contenedor);
  });
  [['#gantt-categoria', 'categoria'], ['#gantt-meta', 'meta'], ['#gantt-estado', 'estado']].forEach(([selector, clave]) =>
    contenedor.querySelector(selector).addEventListener('change', (evento) => {
      filtros[clave] = evento.target.value;
      redibujar();
    })
  );
  contenedor.querySelector('#gantt-texto').addEventListener('input', (evento) => {
    filtros.texto = evento.target.value;
    redibujar();
  });

  redibujar();
}

/** Escribe el día `YYYY-MM-DD` en un campo de fecha de la tarea, conservando la hora si el campo ya tenía una. */
function conservandoHora(valorAnterior, dia) {
  return tieneHora(valorAnterior) ? combinarFechaYHora(dia, formatearHora(valorAnterior)) : dia;
}

function diaSemana(dia) {
  return new Date(dia + 'T00:00:00').getDay();
}

function dibujarGrilla(desplazable, { semanas, modo, agruparPor }) {
  const hoy = hoyISO();
  const filas = construirFilas(estado, { filtros, agruparPor, hoy });
  const tareasFilas = filas.filter((f) => f.tarea);
  if (tareasFilas.length === 0) {
    desplazable.innerHTML = `<p class="mensaje-vacio">${
      estado.tareas.length === 0 ? 'Todavía no hay tareas para mostrar.' : 'Ninguna tarea coincide con los filtros.'
    }</p>`;
    return;
  }

  const nombresAncho = anchoNombres();
  const anchoVisible = Math.max(desplazable.clientWidth - nombresAncho, 120);
  const anchoDia = Math.max(ANCHO_DIA_MINIMO, anchoVisible / (semanas * 7));

  // Rango: desde una semana antes de hoy hasta lo más lejano que se muestra (12 semanas como mínimo, con tope de un año).
  const inicioRango = fechaISOMasDias(-DIAS_ANTES, hoy);
  const ultimos = tareasFilas.flatMap((f) => [f.plan.dia, f.limite, f.ventana ? f.ventana.fin : '']).filter(Boolean);
  const topeRango = fechaISOMasDias(DIAS_MAXIMOS, hoy);
  let finRango = [fechaISOMasDias(12 * 7, hoy), ...ultimos].sort().pop();
  finRango = fechaISOMasDias(3, finRango > topeRango ? topeRango : finRango);
  const totalDias = diasEntreFechas(inicioRango, finRango) + 1;
  const anchoPista = totalDias * anchoDia;
  const desplazamiento = (dia) => diasEntreFechas(inicioRango, dia);
  const izquierdaDe = (dia) => Math.max(0, desplazamiento(dia)) * anchoDia;

  // Líneas verticales cada lunes (semana) y encabezado con los días o las semanas según el zoom.
  let primerLunes = 0;
  while (diaSemana(fechaISOMasDias(primerLunes, inicioRango)) !== 1) primerLunes += 1;
  const mostrarDias = anchoDia >= 26;
  let marcas = '';
  for (let i = 0; i < totalDias; i += 1) {
    const dia = fechaISOMasDias(i, inicioRango);
    const [, mes, numero] = dia.split('-');
    if (mostrarDias) {
      marcas += `<span class="gantt-marca ${dia === hoy ? 'hoy' : ''}" style="left:${i * anchoDia}px;width:${anchoDia}px">${'DLMMJVS'[diaSemana(dia)]}<small>${numero}</small></span>`;
    } else if (diaSemana(dia) === 1) {
      marcas += `<span class="gantt-marca semana" style="left:${i * anchoDia}px">${numero}/${mes}</span>`;
    }
  }

  // Geometría de cada fila (todo en píxeles, sin medir el DOM).
  let y = 0;
  const geometria = new Map();
  let filasHtml = '';
  filas.forEach((fila) => {
    if (fila.carril) {
      filasHtml += `<div class="gantt-carril" style="height:${ALTO_CARRIL}px"><span style="border-left-color:${fila.carril.color || 'var(--color-borde)'}">${escaparHtml(fila.carril.nombre)}</span></div>`;
      y += ALTO_CARRIL;
      return;
    }
    const g = calcularGeometriaFila(fila, modo, { anchoDia, desplazamiento, izquierdaDe });
    geometria.set(fila.tarea.tarea_id, { ...g, centroY: y + ALTO_FILA / 2 });
    filasHtml += htmlFila(fila, modo, g, anchoDia, nombresAncho, anchoPista);
    y += ALTO_FILA;
  });
  const altoFilas = y;

  desplazable.innerHTML = `
    <div class="gantt-lienzo" style="width:${nombresAncho + anchoPista}px">
      <div class="gantt-cabecera" style="height:${ALTO_CABECERA}px">
        <div class="gantt-esquina" style="width:${nombresAncho}px"></div>
        <div class="gantt-fechas" style="width:${anchoPista}px;background-size:${7 * anchoDia}px 100%;background-position:${primerLunes * anchoDia}px 0">${marcas}</div>
      </div>
      <div class="gantt-cuerpo" style="--ancho-nombres:${nombresAncho}px;--ancho-pista:${anchoPista}px;--ancho-semana:${7 * anchoDia}px;--desfase-semana:${primerLunes * anchoDia}px">${filasHtml}</div>
      <div class="gantt-superposicion" style="left:${nombresAncho}px;top:${ALTO_CABECERA}px;width:${anchoPista}px;height:${altoFilas}px">
        <div class="gantt-linea-hoy" style="left:${desplazamiento(hoy) * anchoDia + anchoDia / 2}px"></div>
      </div>
    </div>
  `;

  const superposicion = desplazable.querySelector('.gantt-superposicion');
  dibujarFlechas(superposicion, calcularConexiones(filas, estado), geometria, anchoPista, altoFilas);
  conectarInteracciones(desplazable, filas, modo, { anchoDia, agruparPor });

  if (centrarEnHoy) {
    desplazable.scrollLeft = Math.max(0, (desplazamiento(hoy) - 1) * anchoDia);
    desplazable.scrollTop = 0;
    scrollGuardado = { left: desplazable.scrollLeft, top: 0 };
    centrarEnHoy = false;
  } else {
    desplazable.scrollLeft = scrollGuardado.left;
    desplazable.scrollTop = scrollGuardado.top;
  }
}

/** Dónde cae la barra de una fila en el modo actual: `{ x1, x2, ... }` en píxeles dentro de la pista. */
function calcularGeometriaFila(fila, modo, { anchoDia, desplazamiento, izquierdaDe }) {
  const xPlan = izquierdaDe(fila.plan.dia);
  const anchoPlan = Math.max(anchoDia, 10);
  const recortadaIzq = desplazamiento(fila.plan.dia) < 0;
  if (modo === 'ventana' && fila.ventana) {
    const x1 = izquierdaDe(fila.ventana.inicio);
    const x2 = (Math.max(0, desplazamiento(fila.ventana.fin)) + 1) * anchoDia;
    return { x1, x2, ancho: Math.max(x2 - x1, 10), xPlan, anchoPlan, recortadaIzq, conVentana: true };
  }
  return { x1: xPlan, x2: xPlan + anchoPlan, ancho: anchoPlan, xPlan, anchoPlan, recortadaIzq, conVentana: false };
}

function htmlFila(fila, modo, g, anchoDia, nombresAncho, anchoPista) {
  const { tarea, plan, ventana, limite, noLlega } = fila;
  const categoria = estado.categorias.find((c) => c.categoria_id === tarea.categoria_id);
  const color = categoria ? categoria.categoria_color : '#9ca3af';
  const completada = plan.completada;
  const clases = ['gantt-barra'];
  if (completada) clases.push('completada');
  else if (plan.virtual && !(modo === 'ventana' && g.conVentana)) clases.push('virtual');
  if (modo === 'ventana' && g.conVentana) clases.push('ventana');
  if (modo === 'ventana' && ventana && ventana.vencida) clases.push('vencida');
  const puedeArrastrarBordes = modo === 'ventana' && g.conVentana && !ventana.vencida && !completada;
  const titulo = `${tarea.tarea_nombre} · ${plan.virtual ? `día estimado ${formatearFecha(plan.dia)} (sin fecha sugerida)` : `día ${formatearFecha(plan.dia)}`}${limite ? ` · límite ${formatearFecha(limite)}` : ''}`;
  const mostrarNombre = g.ancho >= 70;
  // En modo Ventana el final de la barra ya es el límite: no se repite la bandera.
  const banderaIzq = limite && !g.conVentana ? izquierdaBandera(limite, plan.dia, g, anchoDia) : null;

  return `
    <div class="gantt-fila" style="height:${ALTO_FILA}px">
      <div class="gantt-nombre" style="width:${nombresAncho}px" data-abrir="${tarea.tarea_id}" title="${escaparHtml(tarea.tarea_nombre)}">
        <span class="gantt-nombre-texto">${tarea.tarea_estado === 'bloqueada' ? '🔒 ' : ''}${escaparHtml(tarea.tarea_nombre)}</span>
        ${plan.virtual ? `<button type="button" class="gantt-fijar" data-fijar="${tarea.tarea_id}" title="Guardar el día estimado como fecha sugerida">📌</button>` : ''}
      </div>
      <div class="gantt-pista" style="width:${anchoPista}px">
        <div class="${clases.join(' ')}" data-tarea-id="${tarea.tarea_id}" style="left:${g.x1}px;width:${g.ancho}px;--color-barra:${color}" title="${escaparHtml(titulo)}">
          ${g.recortadaIzq && modo === 'plan' ? '<span class="gantt-punta">◀</span>' : ''}
          ${mostrarNombre ? `<span class="gantt-barra-nombre">${escaparHtml(tarea.tarea_nombre)}</span>` : ''}
          ${puedeArrastrarBordes ? '<div class="gantt-asa izquierda" data-asa="izquierda"></div><div class="gantt-asa derecha" data-asa="derecha"></div>' : ''}
        </div>
        ${modo === 'ventana' && g.conVentana ? `<span class="gantt-rombo" style="left:${g.xPlan + g.anchoPlan / 2 - 6}px" title="Día plan: ${formatearFecha(plan.dia)}">◆</span>` : ''}
        ${banderaIzq !== null ? `<span class="gantt-limite ${limite < hoyISO() || noLlega ? 'roja' : ''}" style="left:${banderaIzq}px" title="Fecha límite: ${formatearFecha(limite)}">⚑</span>` : ''}
      </div>
    </div>`;
}

/** Posición de la bandera del límite; se corre a la derecha si cae justo sobre la barra. `null` si queda a la izquierda del rango. */
function izquierdaBandera(limite, diaPlan, g, anchoDia) {
  const desplazamientoLimite = diasEntreFechas(diaPlan, limite);
  const base = g.xPlan + desplazamientoLimite * anchoDia;
  if (base + anchoDia < 0) return null;
  return desplazamientoLimite === 0 ? g.xPlan + g.anchoPlan + 1 : Math.max(0, base + anchoDia / 2 - 5);
}

function dibujarFlechas(superposicion, conexiones, geometria, anchoPista, altoFilas) {
  if (conexiones.length === 0) return;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.classList.add('gantt-flechas');
  svg.setAttribute('width', anchoPista);
  svg.setAttribute('height', altoFilas);
  svg.innerHTML = `
    <defs>
      <marker id="gantt-punta" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path class="gantt-punta-flecha" d="M0,0 L6,3 L0,6 Z" /></marker>
      <marker id="gantt-punta-roja" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path class="gantt-punta-flecha roja" d="M0,0 L6,3 L0,6 Z" /></marker>
    </defs>
  `;
  conexiones.forEach(({ tipo, desde, hasta, invertida }) => {
    const origen = geometria.get(desde);
    const destino = geometria.get(hasta);
    if (!origen || !destino) return;
    const x1 = origen.x2;
    const y1 = origen.centroY;
    const x2 = destino.x1;
    const y2 = destino.centroY;
    let trazo;
    if (tipo === 'anillo') {
      const curva = Math.max(30, Math.abs(x2 - x1) / 3);
      trazo = `M${x1},${y1} C${x1 + curva},${y1 + 18} ${x2 - curva},${y2 - 18} ${x2},${y2}`;
    } else if (x2 - x1 >= 14) {
      const medio = x1 + (x2 - x1) / 2;
      trazo = `M${x1},${y1} H${medio} V${y2} H${x2}`;
    } else {
      const medioY = y1 + (y2 - y1) / 2;
      trazo = `M${x1},${y1} H${x1 + 6} V${medioY} H${x2 - 6} V${y2} H${x2}`;
    }
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', trazo);
    path.setAttribute('class', `gantt-flecha${tipo === 'anillo' ? ' anillo' : ''}${invertida ? ' invertida' : ''}`);
    path.setAttribute('marker-end', `url(#${invertida ? 'gantt-punta-roja' : 'gantt-punta'})`);
    svg.appendChild(path);
  });
  superposicion.appendChild(svg);
}

/** Aviso (y no bloqueo) cuando una tarea quedó antes de que termine su previa. */
function avisarSiQuedoAntesDeSuPrevia(tarea, agruparPor) {
  if (!tarea.tarea_dependiente) return;
  const posiciones = calcularPosiciones(estado, { hoy: hoyISO(), agruparPor });
  const propia = posiciones.get(tarea.tarea_id);
  const previa = estado.tareas.find((t) => t.tarea_id === tarea.tarea_dependiente);
  const dePrevia = previa && posiciones.get(previa.tarea_id);
  if (propia && dePrevia && propia.dia < dePrevia.dia) {
    alert(`«${tarea.tarea_nombre}» quedó antes de que termine su tarea previa «${previa.tarea_nombre}». Se guardó igual: la flecha roja del Gantt lo marca.`);
  }
}

function conectarInteracciones(desplazable, filas, modo, { anchoDia, agruparPor }) {
  const porId = new Map(filas.filter((f) => f.tarea).map((f) => [f.tarea.tarea_id, f]));

  // Clic en el nombre: editar; "📌": fijar el día estimado como fecha sugerida.
  desplazable.querySelectorAll('[data-abrir]').forEach((celda) =>
    celda.addEventListener('click', (evento) => {
      if (evento.target.closest('[data-fijar]')) return;
      abrirEdicionTarea(celda.dataset.abrir);
    })
  );
  desplazable.querySelectorAll('[data-fijar]').forEach((boton) =>
    boton.addEventListener('click', async () => {
      const fila = porId.get(boton.dataset.fijar);
      if (!fila) return;
      fila.tarea.tarea_fecha_sugerida = fila.plan.dia;
      await persistirYNotificar();
    })
  );

  desplazable.querySelectorAll('.gantt-barra').forEach((barra) => {
    const fila = porId.get(barra.dataset.tareaId);
    if (!fila) return;
    const tarea = fila.tarea;
    const completada = fila.plan.completada;

    // Sin mover: se abre la edición. Moviendo (más de unos píxeles): en Plan se cambia la fecha sugerida.
    barra.addEventListener('pointerdown', (evento) => {
      if (evento.target.closest('[data-asa]') || evento.button > 0) return;
      const xInicial = evento.clientX;
      let movio = false;
      let dias = 0;
      if (modo !== 'plan' || completada) {
        // Sin arrastre en este caso: un toque (sin desplazarse) abre la edición.
        barra.addEventListener('pointerup', (u) => {
          if (Math.abs(u.clientX - xInicial) < UMBRAL_ARRASTRE_PX) abrirEdicionTarea(tarea.tarea_id);
        }, { once: true });
        return;
      }
      evento.preventDefault();
      barra.setPointerCapture(evento.pointerId);
      const mover = (m) => {
        const delta = m.clientX - xInicial;
        if (!movio && Math.abs(delta) < UMBRAL_ARRASTRE_PX) return;
        movio = true;
        dias = Math.round(delta / anchoDia);
        barra.style.transform = `translateX(${dias * anchoDia}px)`;
        barra.classList.add('arrastrando');
      };
      const soltar = async (u) => {
        barra.releasePointerCapture(u.pointerId);
        barra.removeEventListener('pointermove', mover);
        barra.removeEventListener('pointerup', soltar);
        barra.removeEventListener('pointercancel', soltar);
        if (!movio) {
          abrirEdicionTarea(tarea.tarea_id);
          return;
        }
        barra.style.transform = '';
        barra.classList.remove('arrastrando');
        if (dias === 0) return;
        const nuevoDia = fechaISOMasDias(dias, fila.plan.dia);
        reprogramarTareaConCascada(tarea, conservandoHora(tarea.tarea_fecha_sugerida, nuevoDia), estado.tareas);
        await persistirYNotificar();
        avisarSiQuedoAntesDeSuPrevia(tarea, agruparPor);
      };
      barra.addEventListener('pointermove', mover);
      barra.addEventListener('pointerup', soltar);
      barra.addEventListener('pointercancel', soltar);
    });

    // Modo Ventana: los bordes cambian la fecha habilitada (izquierdo) y el límite (derecho).
    barra.querySelectorAll('[data-asa]').forEach((asa) => {
      const esIzquierda = asa.dataset.asa === 'izquierda';
      asa.addEventListener('pointerdown', (evento) => {
        evento.stopPropagation();
        evento.preventDefault();
        asa.setPointerCapture(evento.pointerId);
        const xInicial = evento.clientX;
        const izquierdaInicial = parseFloat(barra.style.left);
        const anchoInicial = parseFloat(barra.style.width);
        let dias = 0;
        const mover = (m) => {
          dias = Math.round((m.clientX - xInicial) / anchoDia);
          if (esIzquierda) {
            const nuevoAncho = Math.max(anchoDia, anchoInicial - dias * anchoDia);
            barra.style.left = `${izquierdaInicial + anchoInicial - nuevoAncho}px`;
            barra.style.width = `${nuevoAncho}px`;
          } else {
            barra.style.width = `${Math.max(anchoDia, anchoInicial + dias * anchoDia)}px`;
          }
        };
        const soltar = async (u) => {
          asa.releasePointerCapture(u.pointerId);
          asa.removeEventListener('pointermove', mover);
          asa.removeEventListener('pointerup', soltar);
          asa.removeEventListener('pointercancel', soltar);
          if (dias === 0) return;
          const { inicio, fin } = fila.ventana;
          if (esIzquierda) {
            const nuevo = fechaISOMasDias(dias, inicio);
            tarea.tarea_fecha_inicio_habilitada = nuevo > fin ? fin : nuevo;
          } else {
            const nuevo = fechaISOMasDias(dias, fin);
            tarea.tarea_fecha_limite = conservandoHora(tarea.tarea_fecha_limite, nuevo < inicio ? inicio : nuevo);
          }
          await persistirYNotificar();
        };
        asa.addEventListener('pointermove', mover);
        asa.addEventListener('pointerup', soltar);
        asa.addEventListener('pointercancel', soltar);
      });
      asa.addEventListener('click', (evento) => evento.stopPropagation());
    });
  });
}
