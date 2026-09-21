// Plantillas de preparación (por ejemplo para un examen) y su generador. Lógica pura, sin DOM: arma la cadena de
// tareas atómicas, les asigna fecha **hacia adelante** (empezar lo antes posible, para tener más tiempo de práctica) y
// crea las tareas. La ventana que lo usa es `asistente-examen.js`.

import { crearTarea } from './modelos.js';
import { generarId, fechaISOMasDias, diasEntreFechas, hoyISO, diaLocal } from './utilidades.js';
import { recalcularBloqueo } from './dependencias.js';

export const FASES = ['preparar', 'unidad', 'ciclo', 'consolidar', 'habito'];
export const ETIQUETAS_FASE = {
  preparar: '🧭 Preparar (una vez)',
  unidad: '📖 Por unidad del temario',
  ciclo: '🔁 Por ciclo de práctica',
  consolidar: '🎯 Consolidar (antes o después del examen)',
  habito: '📆 Hábito diario',
};
export const MAXIMO_CICLOS = 8;

/**
 * Plantilla base para preparar un examen (vive en el código, no se sincroniza; se duplica para editarla). Cada
 * paso es atómico: dura como máximo 60 minutos (salvo el simulacro) y dice cuándo está hecho. En `nombre` se
 * reemplazan {examen}, {instancia}, {unidad} y {ciclo}. En los pasos "consolidar", `dias_antes` es cuántos días
 * antes de la instancia se hace (un valor negativo = después del último examen).
 */
export const PLANTILLA_EXAMEN = {
  plantilla_id: 'base-examen',
  plantilla_nombre: 'Examen (por defecto)',
  base: true,
  plantilla_pasos: [
    { clave: 'contenido', fase: 'preparar', nombre: 'Averiguar qué contenido se evalúa y cómo es el examen de {examen}', duracion_min: 30, hecho_cuando: 'Temario, modalidad (escrito u oral), duración y materiales permitidos anotados en esta tarea' },
    { clave: 'inscripcion', fase: 'preparar', nombre: 'Inscribirme al examen de {examen}', duracion_min: 15, hecho_cuando: 'Inscripción confirmada (guardá el comprobante)' },
    { clave: 'material', fase: 'preparar', nombre: 'Reunir el material de {examen}: programa, apuntes, bibliografía y exámenes anteriores', duracion_min: 60, hecho_cuando: 'Todo el material reunido en un solo lugar' },
    { clave: 'unidades', fase: 'preparar', nombre: 'Dividir el temario de {examen} en unidades', duracion_min: 30, hecho_cuando: 'Lista de unidades con una estimación de cuánto lleva cada una' },
    { clave: 'leer', fase: 'unidad', nombre: 'Leer {unidad}', duracion_min: 60, hecho_cuando: 'Leída completa, con las dudas anotadas' },
    { clave: 'resumir', fase: 'unidad', nombre: 'Resumir {unidad}', duracion_min: 45, hecho_cuando: 'Resumen de la unidad terminado (una página o un esquema)' },
    { clave: 'tarjetas', fase: 'unidad', nombre: 'Crear las tarjetas de {unidad} en RemNote', duracion_min: 30, hecho_cuando: 'Al menos 15 tarjetas de la unidad creadas en RemNote' },
    { clave: 'repaso', fase: 'habito', nombre: 'Repasar las tarjetas de {examen} en RemNote', duracion_min: 20, hecho_cuando: 'Todas las tarjetas del día repasadas', despues_de: 'tarjetas' },
    { clave: 'practica', fase: 'ciclo', nombre: '{instancia} · ciclo {ciclo}: practicar', duracion_min: 60, hecho_cuando: 'Ejercicios o un examen anterior resueltos sin mirar el material' },
    { clave: 'autoevaluar', fase: 'ciclo', nombre: '{instancia} · ciclo {ciclo}: autoevaluar la práctica', duracion_min: 30, hecho_cuando: 'Práctica corregida con el material y resultado anotado' },
    { clave: 'diagnostico', fase: 'ciclo', nombre: '{instancia} · ciclo {ciclo}: diagnosticar qué sé, qué no sé y qué sé mal', duracion_min: 30, hecho_cuando: 'Tres listas hechas: lo que sé, lo que no sé y lo que sé mal' },
    { clave: 'correccion', fase: 'ciclo', nombre: '{instancia} · ciclo {ciclo}: corregir resumen y tarjetas', duracion_min: 45, hecho_cuando: 'Resumen corregido y tarjetas nuevas o ajustadas en RemNote' },
    { clave: 'simulacro', fase: 'consolidar', nombre: 'Simulacro completo de {instancia}', duracion_min: 120, dias_antes: 3, hecho_cuando: 'Examen completo resuelto con el tiempo real y sin material' },
    { clave: 'errores', fase: 'consolidar', nombre: 'Repasar los errores frecuentes de {instancia}', duracion_min: 45, dias_antes: 2, hecho_cuando: 'Los errores del simulacro repasados uno por uno' },
    { clave: 'previo', fase: 'consolidar', nombre: 'Día previo a {instancia}: repaso liviano y logística', duracion_min: 30, dias_antes: 1, hecho_cuando: 'Documentos, lugar y horario confirmados y repaso liviano hecho' },
    { clave: 'retrospectiva', fase: 'consolidar', nombre: 'Después de {examen}: anotar qué mejorar', duracion_min: 20, dias_antes: -1, hecho_cuando: 'Anotado en la descripción de esta tarea qué cambiarías para el próximo examen' },
  ],
};

/** Las plantillas que se pueden elegir: la base y las del usuario (ordenadas por nombre). */
export function plantillasDisponibles(estado) {
  return [PLANTILLA_EXAMEN, ...(estado.plantillas || []).slice().sort((a, b) => a.plantilla_nombre.localeCompare(b.plantilla_nombre, 'es'))];
}

function reemplazar(texto, valores) {
  return String(texto || '').replace(/\{(\w+)\}/g, (coincidencia, clave) => (valores[clave] != null ? valores[clave] : coincidencia));
}

const AL_MENOS_UNA = (lista) => (lista && lista.length > 0 ? lista : ['el temario completo']);

/**
 * Convierte una plantilla en la lista ordenada de pasos concretos de toda la cadena: los de preparar una vez; por
 * cada instancia sus unidades, ciclos y pasos de consolidar (con su ancla) y el hito "Rendir …"; y al final los pasos
 * posteriores al examen. `ciclosPorInstancia` da cuántos ciclos tiene cada una. Devuelve `{ pasos, habitos }`.
 * Cada paso: `{ uid, clave, fase, nombre, duracion_min, hecho_cuando, instancia, ciclo, ancla, hito, fechaFija }`.
 */
export function expandirPlantilla(plantilla, { examen, instancias, ciclosPorInstancia }) {
  const definidos = plantilla.plantilla_pasos;
  const de = (fase) => definidos.filter((p) => p.fase === fase);
  const nuevo = (base, extra) => ({ uid: generarId(), clave: base.clave, fase: base.fase, duracion_min: base.duracion_min, hecho_cuando: base.hecho_cuando || '', ancla: '', hito: false, fechaFija: '', ciclo: null, unidad: '', separacion: 0, ...extra });
  const pasos = [];
  const varios = instancias.length > 1;
  const valores = (inst, extra = {}) => ({ examen, instancia: inst ? inst.nombre : '', ...extra });

  de('preparar').forEach((p) => pasos.push(nuevo(p, { nombre: reemplazar(p.nombre, valores(null)), instancia: '' })));

  instancias.forEach((inst, indice) => {
    AL_MENOS_UNA(inst.unidades).forEach((unidad) => {
      de('unidad').forEach((p) => pasos.push(nuevo(p, { nombre: reemplazar(p.nombre, valores(inst, { unidad })), instancia: inst.nombre, unidad })));
    });
    const ciclos = ciclosPorInstancia[indice] || 0;
    for (let c = 1; c <= ciclos; c += 1) {
      de('ciclo').forEach((p) => pasos.push(nuevo(p, { nombre: reemplazar(p.nombre, valores(inst, { ciclo: c })), instancia: inst.nombre, ciclo: c })));
    }
    de('consolidar')
      .filter((p) => (p.dias_antes || 0) > 0)
      .sort((a, b) => b.dias_antes - a.dias_antes)
      .forEach((p) => pasos.push(nuevo(p, { nombre: reemplazar(p.nombre, valores(inst)), instancia: inst.nombre, ancla: fechaISOMasDias(-p.dias_antes, diaLocal(inst.fecha)) })));
    pasos.push(
      nuevo(
        { clave: 'rendir', fase: 'consolidar', duracion_min: inst.duracion_min || 120, hecho_cuando: '' },
        { nombre: varios ? `Rendir ${examen} — ${inst.nombre}` : `Rendir ${examen}`, instancia: inst.nombre, hito: true, fechaFija: diaLocal(inst.fecha), tareaExistenteId: inst.tareaExistenteId || null, fechaHora: inst.fecha }
      )
    );
  });

  const ultima = instancias[instancias.length - 1];
  de('consolidar')
    .filter((p) => (p.dias_antes || 0) < 0)
    .forEach((p) => pasos.push(nuevo(p, { nombre: reemplazar(p.nombre, valores(ultima)), instancia: ultima.nombre, ancla: fechaISOMasDias(-p.dias_antes, diaLocal(ultima.fecha)) })));

  const habitos = de('habito').map((p) => nuevo(p, { nombre: reemplazar(p.nombre, valores(null)), despues_de: p.despues_de || 'tarjetas' }));
  return { pasos, habitos };
}

function esDiaDeEstudio(dia, diasDeEstudio) {
  if (!diasDeEstudio || diasDeEstudio.length === 0) return true;
  return diasDeEstudio.includes(new Date(dia + 'T00:00:00').getDay());
}

const MAXIMO_DIAS_DE_BUSQUEDA = 400;

/** El primer día desde `dia` que es de estudio y tiene tiempo disponible (`capacidadDe(dia) > 0`). */
function siguienteDiaDeEstudio(dia, diasDeEstudio, capacidadDe = () => 1) {
  let actual = dia;
  for (let i = 0; i < MAXIMO_DIAS_DE_BUSQUEDA && (!esDiaDeEstudio(actual, diasDeEstudio) || capacidadDe(actual) <= 0); i += 1) actual = fechaISOMasDias(1, actual);
  return actual;
}

/**
 * Asigna la fecha (`paso.fecha`) de cada paso **hacia adelante**: desde `desde`, llenando cada día de estudio hasta
 * su capacidad: `capacidadDia(dia)` (los minutos disponibles ese día, ver `capacidad.js`; un día sin tiempo se salta) o,
 * si no se pasa, `minutosPorDia` para todos los días (un paso más largo que el tope ocupa el día solo). Los pasos con ancla se hacen en su día y los
 * hitos (Rendir…) en la fecha de su examen. Devuelve los avisos (`no-alcanza`: cuántos días faltan para poder
 * llegar a una fecha fija). Modifica los pasos.
 */
export function asignarFechas(pasos, { desde = hoyISO(), minutosPorDia = 120, diasDeEstudio = [], capacidadDia = null } = {}) {
  const avisos = [];
  const capacidadDe = (dia) => (capacidadDia ? capacidadDia(dia) : minutosPorDia);
  const siguiente = (dia) => siguienteDiaDeEstudio(dia, diasDeEstudio, capacidadDe);
  let puntero = siguiente(desde);
  let usados = 0;
  pasos.forEach((paso) => {
    if (paso.hito) {
      if (puntero > paso.fechaFija) avisos.push({ tipo: 'no-alcanza', instancia: paso.instancia, dias: diasEntreFechas(paso.fechaFija, puntero) });
      paso.fecha = paso.fechaFija;
      puntero = paso.fechaFija > puntero ? paso.fechaFija : puntero;
      usados = 0;
      return;
    }
    if (paso.ancla) {
      if (paso.ancla < puntero) {
        avisos.push({ tipo: 'no-alcanza', instancia: paso.instancia, dias: diasEntreFechas(paso.ancla, puntero), paso: paso.nombre });
        paso.fecha = puntero;
      } else {
        paso.fecha = paso.ancla;
        puntero = paso.ancla;
        usados = 0;
      }
      usados += paso.duracion_min;
      return;
    }
    if (paso.separacion > 0) {
      // Días libres antes de este paso (para espaciar los ciclos de práctica).
      puntero = siguiente(fechaISOMasDias(paso.separacion, puntero));
      usados = 0;
    }
    let dia = puntero;
    if (usados + paso.duracion_min > capacidadDe(dia) && usados > 0) {
      dia = siguiente(fechaISOMasDias(1, puntero));
      usados = 0;
    }
    paso.fecha = dia;
    puntero = dia;
    usados += paso.duracion_min;
  });

  // Los pasos de estudio de una instancia tienen que terminar antes de su primer paso de consolidar.
  const porInstancia = new Map();
  pasos.forEach((p) => {
    if (p.ancla && p.instancia) {
      const actual = porInstancia.get(p.instancia);
      if (!actual || p.ancla < actual) porInstancia.set(p.instancia, p.ancla);
    }
  });
  porInstancia.forEach((primerAncla, instancia) => {
    const pasados = pasos.filter((p) => p.instancia === instancia && !p.ancla && !p.hito && p.fecha >= primerAncla);
    if (pasados.length > 0 && !avisos.some((a) => a.instancia === instancia)) {
      const ultimo = pasados.reduce((max, p) => (p.fecha > max ? p.fecha : max), primerAncla);
      avisos.push({ tipo: 'no-alcanza', instancia, dias: diasEntreFechas(primerAncla, ultimo) + 1 });
    }
  });
  return avisos;
}

function fechaHabito(pasos, clave) {
  const primera = pasos.find((p) => p.clave === clave);
  return primera ? fechaISOMasDias(1, primera.fecha) : '';
}

/**
 * El tiempo que sobra entre el fin del estudio de una instancia y su primer paso de consolidar se reparte como días
 * libres entre los ciclos de práctica (el primero va enseguida): así la práctica queda espaciada y no toda junta.
 * Se calcula sobre fechas ya asignadas; hay que volver a llamar a `asignarFechas` después.
 */
export function espaciarCiclos(pasos) {
  const instancias = [...new Set(pasos.filter((p) => p.ciclo).map((p) => p.instancia))];
  instancias.forEach((instancia) => {
    const propios = pasos.filter((p) => p.instancia === instancia);
    const primerAncla = propios.filter((p) => p.ancla).map((p) => p.ancla).sort()[0];
    const estudio = propios.filter((p) => !p.ancla && !p.hito);
    if (!primerAncla || estudio.length === 0) return;
    const ultimo = estudio.reduce((max, p) => (p.fecha > max ? p.fecha : max), estudio[0].fecha);
    const libres = diasEntreFechas(ultimo, primerAncla) - 1;
    const numeros = [...new Set(estudio.filter((p) => p.ciclo).map((p) => p.ciclo))].sort((a, b) => a - b);
    if (libres <= 0 || numeros.length < 2) return;
    const entre = Math.floor(libres / numeros.length);
    numeros.slice(1).forEach((n) => {
      const primero = estudio.find((p) => p.ciclo === n);
      if (primero) primero.separacion = entre;
    });
  });
}

/**
 * Asigna las fechas de una lista de pasos ya armada y espacia los ciclos con el tiempo que sobra. La usa el
 * asistente cada vez que el usuario quita, renombra o reordena pasos en la vista previa. Devuelve los avisos.
 */
export function replanificar(pasos, opciones) {
  pasos.forEach((p) => {
    p.separacion = 0;
  });
  asignarFechas(pasos, opciones);
  espaciarCiclos(pasos);
  return asignarFechas(pasos, opciones);
}

/**
 * Arma el plan completo de un examen: expande la plantilla, elige los ciclos de cada instancia (los que caben en
 * el tiempo, entre 1 y `MAXIMO_CICLOS`, si son "auto") y asigna las fechas. `config`: `{ examen, instancias:
 * [{ nombre, tipo, fecha, unidades[], ciclos: 'auto' | número }], desde, minutosPorDia, diasDeEstudio }`.
 * Devuelve `{ pasos, habitos, avisos, ciclos }`; los hábitos traen `fecha` (el día siguiente a sus primeras tarjetas).
 */
export function planificarExamen(plantilla, config) {
  const opciones = { desde: config.desde || hoyISO(), minutosPorDia: config.minutosPorDia || 120, diasDeEstudio: config.diasDeEstudio || [], capacidadDia: config.capacidadDia || null };
  const ciclos = config.instancias.map((inst) => (typeof inst.ciclos === 'number' ? inst.ciclos : 1));
  config.instancias.forEach((inst, indice) => {
    if (typeof inst.ciclos === 'number') return;
    for (let n = MAXIMO_CICLOS; n >= 1; n -= 1) {
      ciclos[indice] = n;
      const { pasos } = expandirPlantilla(plantilla, { examen: config.examen, instancias: config.instancias, ciclosPorInstancia: ciclos });
      const avisos = asignarFechas(pasos, opciones);
      if (!avisos.some((a) => a.instancia === inst.nombre)) return;
    }
    ciclos[indice] = 1;
  });
  const { pasos, habitos } = expandirPlantilla(plantilla, { examen: config.examen, instancias: config.instancias, ciclosPorInstancia: ciclos });
  const avisos = replanificar(pasos, opciones);
  habitos.forEach((h) => {
    h.fecha = fechaHabito(pasos, h.despues_de);
  });
  return { pasos, habitos, avisos, ciclos };
}

/** Descripción de una tarea generada: el criterio de "hecho" y, en las tarjetas, el enlace al material de RemNote. */
function descripcionDe(paso, enlaceRemNote) {
  const partes = [];
  if (paso.hecho_cuando) partes.push(`Hecho cuando: ${paso.hecho_cuando}.`);
  if (enlaceRemNote && ['tarjetas', 'repaso', 'correccion'].includes(paso.clave)) partes.push(`Tarjetas: ${enlaceRemNote}`);
  return partes.join('\n');
}

/**
 * Crea las tareas de un plan (ver `planificarExamen`) en `estado.tareas`: la cadena de pasos, una detrás de otra (regla
 * 1 a 1), con la categoría y la importancia del examen, y el hábito diario de repaso que termina en el último examen.
 * Cada tarea de preparación tiene como fecha límite la de su examen (así sube sola en la prioridad a medida que se
 * acerca). Si una instancia ya tiene una tarea de examen (`tareaExistenteId`), se usa como su hito. Devuelve
 * `{ tareas, habitos }` con lo creado.
 */
export function crearTareasDeExamen(estado, plan, { categoriaId = null, importancia = null, enlaceRemNote = '' } = {}) {
  const grupo = generarId();
  const creadas = [];
  const cadena = [];
  // La fecha límite de un paso de preparación es la de su examen (los pasos comunes, la del primero).
  const fechaLimiteDe = (instancia) => {
    const hito = plan.pasos.find((p) => p.hito && p.instancia === instancia) || plan.pasos.find((p) => p.hito);
    return hito ? hito.fechaHora || hito.fechaFija : '';
  };
  plan.pasos.forEach((paso) => {
    if (paso.hito && paso.tareaExistenteId) {
      const existente = estado.tareas.find((t) => t.tarea_id === paso.tareaExistenteId);
      if (existente) {
        existente.tarea_tipo = 'examen';
        existente.tarea_origen = existente.tarea_origen || { grupo, instancia: paso.instancia, paso: 'rendir', ciclo: null };
        cadena.push(existente);
        return;
      }
    }
    const tarea = crearTarea({
      tarea_nombre: paso.nombre,
      categoria_id: categoriaId,
      tarea_importancia: importancia,
      tarea_duracion_min: paso.duracion_min,
      tarea_descripcion: paso.hito ? `Instancia: ${paso.instancia}.` : descripcionDe(paso, enlaceRemNote),
      tarea_fecha_sugerida: paso.hito ? paso.fechaHora || paso.fecha : paso.fecha,
      tarea_fecha_limite: paso.hito ? paso.fechaHora || paso.fechaFija : paso.clave === 'retrospectiva' ? '' : fechaLimiteDe(paso.instancia),
      tarea_tipo: paso.hito ? 'examen' : '',
      tarea_origen: { grupo, instancia: paso.instancia, paso: paso.clave, ciclo: paso.ciclo },
    });
    estado.tareas.push(tarea);
    creadas.push(tarea);
    cadena.push(tarea);
  });
  // Una detrás de otra. Una tarea de examen que ya tenía previa se deja como estaba (no se pisa su enlace).
  cadena.forEach((tarea, i) => {
    if (i === 0) return;
    if (tarea.tarea_dependiente && creadas.every((c) => c.tarea_id !== tarea.tarea_id)) return;
    tarea.tarea_dependiente = cadena[i - 1].tarea_id;
  });
  cadena.forEach((tarea) => recalcularBloqueo(tarea, estado.tareas));

  const ultimoHito = [...cadena].reverse().find((t) => t.tarea_tipo === 'examen');
  const habitos = plan.habitos
    .filter((h) => h.fecha)
    .map((h) => {
      const habito = crearTarea({
        tarea_nombre: h.nombre,
        categoria_id: categoriaId,
        tarea_importancia: importancia,
        tarea_duracion_min: h.duracion_min,
        tarea_descripcion: descripcionDe(h, enlaceRemNote),
        tarea_mantenimiento: true,
        tarea_mantenimiento_intervalo: { cantidad: 1, unidad: 'dias' },
        tarea_fecha_inicio_habilitada: h.fecha,
        tarea_fecha_sugerida: h.fecha,
        tarea_fecha_limite: h.fecha,
        tarea_repetir_hasta_tarea: ultimoHito ? ultimoHito.tarea_id : null,
        tarea_origen: { grupo, instancia: '', paso: h.clave, ciclo: null },
      });
      estado.tareas.push(habito);
      return habito;
    });
  return { tareas: creadas, habitos };
}
