// Lógica pura (sin DOM) del mapa de hábitos de Estadísticas. Un hábito es una tarea de mantenimiento,
// identificada por su nombre; su historial son los `Cumplimiento` (uno por cada vez que se cumplió).
// El último día de la ventana (`hasta`, por defecto hoy) todavía está en curso: no cuenta como incumplido.

import { diaLocal, hoyISO, fechaISOMasDias, categoriaRaiz } from './utilidades.js';

export const ESTADOS_CELDA = { cumplido: 'cumplido', incumplido: 'incumplido', vence: 'vence', noAplica: 'no-aplica' };

function esDiario(intervalo) {
  return !!intervalo && intervalo.unidad === 'dias' && intervalo.cantidad === 1;
}

function esDiaHabil(dia, diasHabiles) {
  if (!diasHabiles || diasHabiles.length === 0) return true;
  return diasHabiles.includes(new Date(dia + 'T00:00:00').getDay());
}

/** Los cumplimientos de mantenimiento de un hábito, ordenados por fecha y ya con su día local. */
function registrosDe(nombre, cumplimientos) {
  return cumplimientos
    .filter((c) => c.cumplimiento_mantenimiento && c.cumplimiento_tarea_nombre === nombre)
    .map((c) => ({
      dia: diaLocal(c.cumplimiento_fecha),
      limite: c.cumplimiento_fecha_limite ? diaLocal(c.cumplimiento_fecha_limite) : '',
      intervalo: c.cumplimiento_intervalo || null,
      diasHabiles: c.cumplimiento_dias_habiles || [],
    }))
    .sort((a, b) => a.dia.localeCompare(b.dia));
}

/** La repetición abierta de un hábito (la sin completar con el vencimiento más cercano), si hay. */
function repeticionAbierta(nombre, tareas) {
  const abiertas = tareas
    .filter((t) => t.tarea_mantenimiento && t.tarea_estado !== 'completada' && t.tarea_nombre === nombre)
    .map((t) => ({
      limite: t.tarea_fecha_limite ? diaLocal(t.tarea_fecha_limite) : '',
      intervalo: t.tarea_mantenimiento_intervalo || null,
      diasHabiles: t.tarea_dias_habiles || [],
    }));
  abiertas.sort((a, b) => (a.limite || '9999').localeCompare(b.limite || '9999'));
  return abiertas[0] || null;
}

/**
 * Nombres de los hábitos: tareas de mantenimiento con algún cumplimiento, más las que todavía no se
 * cumplieron ninguna vez pero tienen su repetición abierta.
 */
function nombresDeHabitos(estado) {
  const nombres = new Set();
  (estado.cumplimientos || []).filter((c) => c.cumplimiento_mantenimiento).forEach((c) => nombres.add(c.cumplimiento_tarea_nombre));
  (estado.tareas || []).filter((t) => t.tarea_mantenimiento && t.tarea_estado !== 'completada').forEach((t) => nombres.add(t.tarea_nombre));
  return [...nombres].sort((a, b) => a.localeCompare(b, 'es'));
}

/**
 * Un hábito dentro de la ventana `dias` que termina en `hasta`. Cada celda es `{ dia, estado, titulo }`:
 * - **cumplido**: hay un cumplimiento ese día.
 * - **incumplido**: en un hábito diario, un día hábil posterior al primer registro y anterior a `hasta`
 *   sin cumplimiento; en uno no diario, el vencimiento esperado que se cumplió tarde o sigue vencido.
 * - **vence**: el último día de la ventana, cuando el hábito está pendiente ese mismo día.
 * - **no-aplica**: todo lo demás (días no hábiles, antes del primer registro, entre vencimientos).
 * Racha y porcentaje se calculan solo sobre los días que aplican (ver el detalle en cada parte).
 */
export function calcularHabito(nombre, estado, { dias = 30, hasta = hoyISO() } = {}) {
  const registros = registrosDe(nombre, estado.cumplimientos || []);
  const abierta = repeticionAbierta(nombre, estado.tareas || []);
  const primerDia = registros.length > 0 ? registros[0].dia : '';
  const ultimoRegistro = registros[registros.length - 1] || null;
  // Un hábito temporal que ya llegó a su fin (no queda ninguna repetición abierta) no espera nada después de su último cumplimiento.
  const terminado = registros.length > 0 && !abierta;

  // Qué intervalo y días hábiles regían un día: el del último cumplimiento hasta entonces; después del
  // último cumplimiento, el de la repetición abierta (que es la configuración actual de la tarea).
  const configEn = (dia) => {
    let vigente = null;
    for (const r of registros) {
      if (r.dia <= dia) vigente = r;
      else break;
    }
    if (vigente && vigente === ultimoRegistro && abierta) return abierta;
    return vigente || abierta || null;
  };

  const registrosPorDia = new Map();
  registros.forEach((r) => registrosPorDia.set(r.dia, [...(registrosPorDia.get(r.dia) || []), r]));

  const celdas = [];
  let aciertos = 0;
  let evaluados = 0;
  for (let i = dias - 1; i >= 0; i -= 1) {
    const dia = fechaISOMasDias(-i, hasta);
    if (terminado && dia > ultimoRegistro.dia) {
      celdas.push({ dia, estado: ESTADOS_CELDA.noAplica, titulo: 'Terminó: ya no se repite' });
      continue;
    }
    const config = configEn(dia);
    const diario = config ? esDiario(config.intervalo) : false;
    const delDia = registrosPorDia.get(dia) || [];
    let celdaEstado = ESTADOS_CELDA.noAplica;
    let detalle = 'No aplica';

    if (delDia.length > 0) {
      celdaEstado = ESTADOS_CELDA.cumplido;
      detalle = 'Cumplido';
    } else if (registros.some((r) => r.limite === dia && r.dia > dia && !esDiario(r.intervalo)) || (abierta && !esDiario(abierta.intervalo) && abierta.limite === dia && dia < hasta)) {
      celdaEstado = ESTADOS_CELDA.incumplido;
      detalle = 'Vencimiento sin cumplir a tiempo';
    } else if (diario && primerDia && dia > primerDia && dia < hasta && esDiaHabil(dia, config.diasHabiles)) {
      celdaEstado = ESTADOS_CELDA.incumplido;
      detalle = 'No se cumplió';
    } else if (dia === hasta && abierta && (abierta.limite === dia || (esDiario(abierta.intervalo) && esDiaHabil(dia, abierta.diasHabiles)))) {
      celdaEstado = ESTADOS_CELDA.vence;
      detalle = 'Pendiente hoy';
    }
    celdas.push({ dia, estado: celdaEstado, titulo: detalle });

    // Porcentaje: por día en hábitos diarios; por vencimiento (cumplimiento o vencimiento perdido) en los demás.
    if (diario) {
      if (celdaEstado === ESTADOS_CELDA.cumplido) {
        aciertos += 1;
        evaluados += 1;
      } else if (celdaEstado === ESTADOS_CELDA.incumplido) {
        evaluados += 1;
      }
    } else {
      delDia.forEach((r) => {
        evaluados += 1;
        if (!r.limite || r.dia <= r.limite) aciertos += 1;
      });
      if (celdaEstado === ESTADOS_CELDA.incumplido && delDia.length === 0 && abierta && abierta.limite === dia) evaluados += 1;
    }
  }

  const hastaRacha = terminado && ultimoRegistro.dia < hasta ? ultimoRegistro.dia : hasta;
  return { nombre, terminado, celdas, racha: calcularRacha(registros, abierta, hastaRacha, configEn), porcentaje: evaluados > 0 ? Math.round((aciertos / evaluados) * 100) : null, cumplidos: aciertos, evaluados };
}

/**
 * Racha actual. Hábito diario: días hábiles seguidos cumplidos hasta hoy (hoy sin cumplir todavía no la
 * corta). Los demás: cumplimientos seguidos a tiempo, contando desde el más reciente; si la repetición
 * abierta ya venció, la racha se corta.
 */
function calcularRacha(registros, abierta, hasta, configEn) {
  if (registros.length === 0) return 0;
  const config = configEn(hasta);
  if (config && esDiario(config.intervalo)) {
    const dias = new Set(registros.map((r) => r.dia));
    let racha = 0;
    let dia = hasta;
    const primerDia = registros[0].dia;
    while (dia >= primerDia) {
      const cfg = configEn(dia);
      if (cfg && !esDiaHabil(dia, cfg.diasHabiles)) {
        dia = fechaISOMasDias(-1, dia);
        continue;
      }
      if (dias.has(dia)) racha += 1;
      else if (dia !== hasta) break;
      dia = fechaISOMasDias(-1, dia);
    }
    return racha;
  }
  if (abierta && abierta.limite && abierta.limite < hasta) return 0;
  let racha = 0;
  for (let i = registros.length - 1; i >= 0; i -= 1) {
    const r = registros[i];
    if (r.limite && r.dia > r.limite) break;
    racha += 1;
  }
  return racha;
}

/** Los hábitos de las tareas de mantenimiento, cada uno con su fila del mapa. */
export function calcularMapaHabitos(estado, opciones = {}) {
  return nombresDeHabitos(estado).map((nombre) => calcularHabito(nombre, estado, opciones));
}

/**
 * Mapa por categoría raíz: un día cuenta como activo si se cumplió al menos una tarea (de mantenimiento o no)
 * de la categoría o de cualquiera de sus descendientes. Los días sin nada quedan en blanco, nunca "incumplidos".
 * Solo aparecen las categorías raíz con algún cumplimiento.
 */
export function calcularMapaCategorias(estado, { dias = 30, hasta = hoyISO() } = {}) {
  const categorias = estado.categorias || [];
  const diasPorRaiz = new Map();
  (estado.cumplimientos || []).forEach((c) => {
    const categoria = categorias.find((x) => x.categoria_id === c.categoria_id);
    const raiz = categoria ? categoriaRaiz(categoria, categorias) : null;
    if (!raiz) return;
    if (!diasPorRaiz.has(raiz.categoria_id)) diasPorRaiz.set(raiz.categoria_id, new Map());
    const cuenta = diasPorRaiz.get(raiz.categoria_id);
    const dia = diaLocal(c.cumplimiento_fecha);
    cuenta.set(dia, (cuenta.get(dia) || 0) + 1);
  });

  return categorias
    .filter((c) => diasPorRaiz.has(c.categoria_id))
    .map((categoria) => {
      const cuenta = diasPorRaiz.get(categoria.categoria_id);
      const celdas = [];
      for (let i = dias - 1; i >= 0; i -= 1) {
        const dia = fechaISOMasDias(-i, hasta);
        celdas.push({ dia, cantidad: cuenta.get(dia) || 0 });
      }
      return { categoria, celdas, diasActivos: celdas.filter((x) => x.cantidad > 0).length };
    })
    .sort((a, b) => a.categoria.categoria_nombre.localeCompare(b.categoria.categoria_nombre, 'es'));
}
