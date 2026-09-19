import { crearTarea, crearMejora, crearCumplimiento, ORDEN_IMPORTANCIA } from './modelos.js';
import { ahoraISO, hoyISO, noPuedeEmpezarTodavia, desplazarFecha, tieneHora, categoriaRaiz, combinarFechaYHora } from './utilidades.js';
import { siguienteDiaHabil } from './reprogramar.js';
import { recalcularBloqueo, puedeAgregarDependencia, proximasActivas, reconectarAlEliminar } from './dependencias.js';

// Las dependencias viven en `dependencias.js`; se reexportan para no cambiar los imports de las vistas.
export { recalcularBloqueo, puedeAgregarDependencia };

/**
 * Calcula la próxima fecha límite (YYYY-MM-DD) de una tarea de mantenimiento,
 * a partir de la fecha real en que se completó (no de una fecha teórica).
 */
export function calcularProximaFechaMantenimiento(desdeISODatetime, intervalo) {
  const fecha = new Date(desdeISODatetime);
  const cantidad = intervalo.cantidad || 1;
  if (intervalo.unidad === 'meses') {
    fecha.setMonth(fecha.getMonth() + cantidad);
  } else if (intervalo.unidad === 'semanas') {
    fecha.setDate(fecha.getDate() + cantidad * 7);
  } else {
    fecha.setDate(fecha.getDate() + cantidad);
  }
  return fecha.toISOString().slice(0, 10);
}

/**
 * Marca una tarea como completada (`tarea_fecha_fin` = ahora). Si es una
 * tarea de mantenimiento, además clona una nueva instancia pendiente con la
 * fecha límite recalculada desde la fecha real de finalización, dejando la
 * instancia actual como historial. Devuelve la nueva tarea clonada, o null
 * si no aplica mantenimiento. No desbloquea dependientes — eso lo hace
 * `desbloquearDependientes`, que hay que llamar aparte con la lista completa.
 */
export function completarTarea(tarea, listaTareas, { notaMejora = '' } = {}) {
  const ahora = ahoraISO();
  tarea.tarea_estado = 'completada';
  tarea.tarea_fecha_fin = ahora;

  if (!tarea.tarea_mantenimiento) return null;

  const descripcion = notaMejora
    ? `${tarea.tarea_descripcion ? tarea.tarea_descripcion + '\n\n' : ''}Mejora sugerida la vez anterior: ${notaMejora}`
    : tarea.tarea_descripcion;

  const nueva = crearTarea({
    tarea_nombre: tarea.tarea_nombre,
    categoria_id: tarea.categoria_id,
    tarea_estado: 'pendiente',
    tarea_fecha_limite: calcularProximaFechaMantenimiento(ahora, tarea.tarea_mantenimiento_intervalo),
    tarea_duracion_min: tarea.tarea_duracion_min,
    tarea_descripcion: descripcion,
    tarea_mantenimiento: tarea.tarea_mantenimiento,
    tarea_mantenimiento_intervalo: tarea.tarea_mantenimiento_intervalo,
    tarea_costo_estimado: tarea.tarea_costo_estimado,
    tarea_disfrute: tarea.tarea_disfrute,
    tarea_importancia: tarea.tarea_importancia,
    ubicacion_id: tarea.ubicacion_id,
    tarea_dias_habiles: [...(tarea.tarea_dias_habiles || [])],
    tarea_requiere_clima_bueno: tarea.tarea_requiere_clima_bueno,
    meta_id: tarea.meta_id,
    tarea_checklist: (tarea.tarea_checklist || []).map((item) => ({ texto: item.texto, hecho: false })),
    tarea_desencadenante: tarea.tarea_desencadenante || null,
  });
  listaTareas.push(nueva);
  return nueva;
}

/**
 * Al completar una tarea, desbloquea en cadena a las que dependían de ella:
 * cada dependiente pasa su `tarea_fecha_inicio_habilitada` a tomar el
 * `tarea_fecha_fin` de la recién completada, y se recalcula su bloqueo
 * (queda `pendiente`, ya que su única dependencia se acaba de completar).
 */
export function desbloquearDependientes(tareaCompletada, listaTareas) {
  listaTareas
    .filter((t) => t.tarea_dependiente === tareaCompletada.tarea_id)
    .forEach((dependiente) => {
      dependiente.tarea_fecha_inicio_habilitada = tareaCompletada.tarea_fecha_fin;
      recalcularBloqueo(dependiente, listaTareas);
    });
}

/**
 * La instancia "vigente" de una tarea: ella misma si todavía no se completó o,
 * si ya se completó, la copia de mantenimiento pendiente con el mismo
 * `tarea_nombre` (la identidad de una tarea que se repite es su nombre; si hay
 * más de una, la más antigua). `excluirIds` deja afuera instancias puntuales.
 */
export function instanciaPendiente(tarea, listaTareas, excluirIds = []) {
  if (tarea.tarea_estado !== 'completada') return tarea;
  return (
    listaTareas
      .filter(
        (t) =>
          t.tarea_id !== tarea.tarea_id &&
          !excluirIds.includes(t.tarea_id) &&
          t.tarea_mantenimiento &&
          t.tarea_estado !== 'completada' &&
          t.tarea_nombre === tarea.tarea_nombre
      )
      .sort((a, b) => (a.tarea_creada_en || '').localeCompare(b.tarea_creada_en || ''))[0] || null
  );
}

/**
 * Enlaza la copia de una tarea de mantenimiento recién completada: si la
 * original tenía tarea previa P, la copia depende de la instancia vigente de P
 * (así una cadena A→B→C se repite entera); si no tenía previa pero sí un
 * `tarea_desencadenante` D, la copia queda bloqueada por la instancia vigente
 * de D (así un anillo A→B→C→D→A se sostiene). Nunca crea un enlace que rompa
 * la regla 1 a 1 ni que forme un ciclo.
 */
function enlazarCopia(original, copia, listaTareas) {
  const referenciaId = original.tarea_dependiente || original.tarea_desencadenante;
  const referencia = referenciaId ? listaTareas.find((t) => t.tarea_id === referenciaId) : null;
  const objetivo = referencia ? instanciaPendiente(referencia, listaTareas, [original.tarea_id, copia.tarea_id]) : null;
  if (!objetivo) return;
  if (proximasActivas(objetivo.tarea_id, listaTareas).some((t) => t.tarea_id !== copia.tarea_id)) return;
  if (!puedeAgregarDependencia(copia.tarea_id, objetivo.tarea_id, listaTareas)) return;
  copia.tarea_dependiente = objetivo.tarea_id;
  recalcularBloqueo(copia, listaTareas);
}

/**
 * Cumple una tarea: la completa (y, si es de mantenimiento, crea su copia), la
 * enlaza (ver `enlazarCopia`), desbloquea a las que dependían de ella, registra
 * el cumplimiento (base del mapa de hábitos) y, si hay nota, crea la Mejora.
 * Reemplaza el par `completarTarea` + `desbloquearDependientes` que repetían
 * las vistas. `estado` es el objeto con las colecciones de la app. Devuelve la
 * copia creada, o `null`.
 */
export function cumplirTarea(tarea, estado, { notaMejora = '' } = {}) {
  const copia = completarTarea(tarea, estado.tareas, { notaMejora });
  if (!estado.cumplimientos) estado.cumplimientos = [];
  estado.cumplimientos.push(crearCumplimiento({ tarea, fecha: tarea.tarea_fecha_fin }));
  if (notaMejora) {
    if (!estado.mejoras) estado.mejoras = [];
    estado.mejoras.push(crearMejora({ mejora_tarea_nombre: tarea.tarea_nombre, mejora_texto: notaMejora }));
  }
  if (copia) enlazarCopia(tarea, copia, estado.tareas);
  desbloquearDependientes(tarea, estado.tareas);
  return copia;
}

const MS_COPIA_SIN_TOCAR = 10 * 1000;

/** ¿La copia se creó y no se volvió a modificar (su sello es de la misma guardada que la creó)? */
function copiaSinTocar(copia, estado) {
  if (!copia.tarea_modificado_en || !copia.tarea_creada_en) return false;
  const editadaDespues = Date.parse(copia.tarea_modificado_en) - Date.parse(copia.tarea_creada_en) > MS_COPIA_SIN_TOCAR;
  return !editadaDespues && !estado.tareas.some((t) => t.tarea_dependiente === copia.tarea_id);
}

/**
 * Reabre una tarea completada: vuelve a estar pendiente (o bloqueada, si su
 * previa no está completa), se deshace su cumplimiento y su marca de exportada
 * a Calendar, y las tareas que dependían de ella se recalculan. Si era de
 * mantenimiento y ya había generado su copia, la borra solo si sigue sin tocar
 * (sin completar, sin nadie que dependa de ella y sin ediciones); si se tocó
 * la conserva. La Mejora, si hubo, se conserva. Devuelve
 * `{ copiaEliminada, copiaConservada }` para que la vista pueda avisar.
 */
export function reabrirTarea(tarea, estado) {
  const finAnterior = tarea.tarea_fecha_fin;
  tarea.tarea_estado = 'pendiente';
  tarea.tarea_fecha_fin = null;
  tarea.tarea_exportada_calendar = false;
  recalcularBloqueo(tarea, estado.tareas);
  estado.cumplimientos = (estado.cumplimientos || []).filter((c) => c.cumplimiento_tarea_id !== tarea.tarea_id);
  estado.tareas.filter((t) => t.tarea_dependiente === tarea.tarea_id).forEach((dependiente) => recalcularBloqueo(dependiente, estado.tareas));

  const resultado = { copiaEliminada: null, copiaConservada: null };
  if (!tarea.tarea_mantenimiento || !finAnterior) return resultado;

  const copia = estado.tareas
    .filter(
      (t) =>
        t.tarea_id !== tarea.tarea_id &&
        t.tarea_mantenimiento &&
        t.tarea_estado !== 'completada' &&
        t.tarea_nombre === tarea.tarea_nombre &&
        (t.tarea_creada_en || '') >= finAnterior
    )
    .sort((a, b) => (a.tarea_creada_en || '').localeCompare(b.tarea_creada_en || ''))[0];
  if (!copia) return resultado;

  if (copiaSinTocar(copia, estado)) {
    eliminarTarea(copia, estado);
    resultado.copiaEliminada = copia;
  } else {
    resultado.copiaConservada = copia;
  }
  return resultado;
}

/**
 * Elimina una tarea. Si estaba en el medio de una cadena, la reconecta
 * (P→A→N queda P→N) y el desencadenante que la apuntaba pasa a su previa.
 * No toca cumplimientos ni mejoras: son historial.
 */
export function eliminarTarea(tarea, estado) {
  estado.tareas = estado.tareas.filter((t) => t.tarea_id !== tarea.tarea_id);
  reconectarAlEliminar(tarea, estado.tareas);
}

/**
 * Reprograma `tarea_fecha_sugerida` y desplaza en cascada a las tareas que
 * dependen de ella (`tarea_dependiente === tarea.tarea_id`), por el mismo
 * delta de tiempo. Si la tarea no tenía una fecha sugerida previa, no hay
 * delta que propagar.
 */
export function reprogramarTareaConCascada(tarea, nuevaFechaSugeridaISO, listaTareas) {
  const anteriorISO = tarea.tarea_fecha_sugerida;
  tarea.tarea_fecha_sugerida = nuevaFechaSugeridaISO;

  if (!anteriorISO) return;

  const deltaMs = new Date(nuevaFechaSugeridaISO).getTime() - new Date(anteriorISO).getTime();
  if (!deltaMs) return;

  desplazarDependientes(tarea.tarea_id, deltaMs, listaTareas, new Set([tarea.tarea_id]));
}

function desplazarDependientes(idTarea, deltaMs, listaTareas, visitados) {
  listaTareas
    .filter((t) => t.tarea_dependiente === idTarea && !visitados.has(t.tarea_id))
    .forEach((dependiente) => {
      visitados.add(dependiente.tarea_id);

      if (dependiente.tarea_fecha_sugerida) {
        dependiente.tarea_fecha_sugerida = desplazarFecha(dependiente.tarea_fecha_sugerida, deltaMs);
      }
      if (dependiente.tarea_fecha_limite) {
        dependiente.tarea_fecha_limite = desplazarFecha(dependiente.tarea_fecha_limite, deltaMs);
      }

      desplazarDependientes(dependiente.tarea_id, deltaMs, listaTareas, visitados);
    });
}

/**
 * Próxima `tarea_fecha_sugerida` para una tarea cuya fecha sugerida venció
 * sin completarse: hoy (o el próximo día hábil según `tarea_dias_habiles`),
 * preservando la hora si tenía, y sin superar `tarea_fecha_limite` si existe.
 */
function calcularProximaFechaSugerida(tarea) {
  let dia = siguienteDiaHabil(hoyISO(), tarea.tarea_dias_habiles);
  if (tarea.tarea_fecha_limite && dia > tarea.tarea_fecha_limite.slice(0, 10)) {
    dia = tarea.tarea_fecha_limite.slice(0, 10);
  }
  if (!tieneHora(tarea.tarea_fecha_sugerida)) return dia;

  // La hora se extrae en horario local (igual que `partesFechaHora` en
  // tareas.view.js), no recortando el string ISO crudo (que está en UTC) —
  // `combinarFechaYHora` espera una hora local para volver a armar el ISO.
  const fechaVieja = new Date(tarea.tarea_fecha_sugerida);
  const hora = `${String(fechaVieja.getHours()).padStart(2, '0')}:${String(fechaVieja.getMinutes()).padStart(2, '0')}`;
  return combinarFechaYHora(dia, hora);
}

/**
 * Reprograma automáticamente (sin intervención del usuario, a diferencia de
 * `tarea_fecha_limite`) la `tarea_fecha_sugerida` de toda tarea activa (no
 * completada) que quedó vencida, a la próxima fecha disponible
 * (`calcularProximaFechaSugerida`), en cascada sobre sus dependientes vía
 * `reprogramarTareaConCascada`. Se llama una vez al iniciar la app. Devuelve
 * las tareas afectadas, para poder avisarle al usuario.
 */
export function reprogramarFechasSugeridasVencidas(listaTareas) {
  const afectadas = [];
  listaTareas
    .filter((t) => t.tarea_estado !== 'completada' && t.tarea_fecha_sugerida && t.tarea_fecha_sugerida.slice(0, 10) < hoyISO())
    .forEach((tarea) => {
      reprogramarTareaConCascada(tarea, calcularProximaFechaSugerida(tarea), listaTareas);
      afectadas.push(tarea);
    });
  return afectadas;
}

const MS_POR_DIA = 24 * 60 * 60 * 1000;

/**
 * Calcula cuántos días de margen le quedan a una tarea antes de que sea
 * imposible cumplir su `tarea_fecha_limite`, contados desde hoy (no desde
 * que se creó): `tarea_fecha_limite − max(ahora, tarea_fecha_inicio_habilitada)`.
 * Sin fecha límite, devuelve `Infinity` (sin apuro). Negativo = vencida.
 * Una fecha sin hora se interpreta como el límite del día (fin de día para
 * `tarea_fecha_limite`, inicio de día para `tarea_fecha_inicio_habilitada`),
 * para que una tarea que vence "hoy" no aparezca vencida a la mañana.
 */
export function calcularHolguraDias(tarea) {
  if (!tarea.tarea_fecha_limite) return Infinity;

  const limite = new Date(tieneHora(tarea.tarea_fecha_limite) ? tarea.tarea_fecha_limite : tarea.tarea_fecha_limite + 'T23:59:59');

  const ahora = new Date();
  let desde = ahora;
  if (tarea.tarea_fecha_inicio_habilitada) {
    const inicio = new Date(
      tieneHora(tarea.tarea_fecha_inicio_habilitada) ? tarea.tarea_fecha_inicio_habilitada : tarea.tarea_fecha_inicio_habilitada + 'T00:00:00'
    );
    if (inicio > desde) desde = inicio;
  }

  return Math.floor((limite.getTime() - desde.getTime()) / MS_POR_DIA);
}

/**
 * Agrupa la holgura (ver `calcularHolguraDias`) en bandas, de más a menos
 * urgente. Definidas junto al usuario en la Ronda 2 para que una diferencia
 * de días chica no tape la prioridad real de categorías (ver
 * REGLAS_DE_PRIORIDAD.md).
 */
function bandaHolgura(dias) {
  if (dias < 0) return 0;
  if (dias <= 3) return 1;
  if (dias <= 7) return 2;
  if (dias <= 15) return 3;
  if (dias <= 30) return 4;
  return 5;
}

/**
 * Compara dos tareas por los niveles 1-4 de prioridad (ver
 * REGLAS_DE_PRIORIDAD.md para el detalle y los ejemplos): 1) banda de
 * holgura (`calcularHolguraDias`) — el criterio dominante; 2)
 * `categoria_prioridad` de la categoría raíz de cada tarea (`categoriaRaiz`);
 * 3) `categoria_prioridad` de la categoría directa, como desempate entre
 * categorías con la misma raíz; 4) `tarea_importancia` (urgente > importante
 * > sin definir). Sin categoría, o categoría inexistente, queda siempre al
 * final en los niveles 2 y 3. Devuelve 0 si empatan en los 4 niveles —
 * usado tanto por `compararPorPrioridad` como por `tareasEmpatadas`.
 */
function compararEstructural(a, b, categorias) {
  const bandaA = bandaHolgura(calcularHolguraDias(a));
  const bandaB = bandaHolgura(calcularHolguraDias(b));
  if (bandaA !== bandaB) return bandaA - bandaB;

  const categoriaA = categorias.find((c) => c.categoria_id === a.categoria_id) ?? null;
  const categoriaB = categorias.find((c) => c.categoria_id === b.categoria_id) ?? null;

  const prioridadRaizA = categoriaA ? (categoriaRaiz(categoriaA, categorias)?.categoria_prioridad ?? Infinity) : Infinity;
  const prioridadRaizB = categoriaB ? (categoriaRaiz(categoriaB, categorias)?.categoria_prioridad ?? Infinity) : Infinity;
  if (prioridadRaizA !== prioridadRaizB) return prioridadRaizA - prioridadRaizB;

  const prioridadDirectaA = categoriaA?.categoria_prioridad ?? Infinity;
  const prioridadDirectaB = categoriaB?.categoria_prioridad ?? Infinity;
  if (prioridadDirectaA !== prioridadDirectaB) return prioridadDirectaA - prioridadDirectaB;

  const importanciaA = ORDEN_IMPORTANCIA[a.tarea_importancia] ?? 2;
  const importanciaB = ORDEN_IMPORTANCIA[b.tarea_importancia] ?? 2;
  return importanciaA - importanciaB;
}

/**
 * Compara dos tareas por prioridad, en 6 niveles (ver REGLAS_DE_PRIORIDAD.md):
 * los 4 de `compararEstructural`, después 5) `tarea_prioridad_manual`
 * (`?? Infinity`, menor = más prioritaria — resultado de la herramienta
 * "Versus"), y por último 6) `tarea_creada_en` ascendente (FIFO), para que
 * el orden sea siempre determinístico.
 */
export function compararPorPrioridad(a, b, categorias) {
  const estructural = compararEstructural(a, b, categorias);
  if (estructural !== 0) return estructural;

  const manualA = a.tarea_prioridad_manual ?? Infinity;
  const manualB = b.tarea_prioridad_manual ?? Infinity;
  if (manualA !== manualB) return manualA - manualB;

  return (a.tarea_creada_en || '').localeCompare(b.tarea_creada_en || '');
}

/**
 * `true` si dos tareas están empatadas en los 4 niveles estructurales de
 * prioridad (`compararEstructural`) y **ninguna** tiene todavía
 * `tarea_prioridad_manual` asignado — es decir, siguen siendo una
 * ambigüedad real que la herramienta "Versus" puede ofrecer para resolver.
 * Si alguna ya fue resuelta en una ronda anterior, no se vuelve a ofrecer.
 */
export function tareasEmpatadas(a, b, categorias) {
  if (a.tarea_prioridad_manual != null || b.tarea_prioridad_manual != null) return false;
  return compararEstructural(a, b, categorias) === 0;
}

/**
 * Para cada categoría raíz (sin `categoria_padre_id`), devuelve su tarea
 * accionable de mayor prioridad (misma lógica que `compararPorPrioridad`) —
 * "la tarea que bloquea al resto de esa categoría". Categorías raíz sin
 * ninguna tarea accionable se omiten. Pensada para elegir qué hacer en un
 * rato libre sin que la categoría de mayor prioridad general (ej. Facultad)
 * tape siempre a las demás.
 */
export function mejorTareaPorCategoria(tareas, categorias) {
  const raices = categorias.filter((c) => !c.categoria_padre_id);
  return raices
    .map((raiz) => {
      const candidatas = tareas.filter((t) => {
        if (!esTareaAccionable(t)) return false;
        const categoria = categorias.find((c) => c.categoria_id === t.categoria_id);
        return categoria && categoriaRaiz(categoria, categorias)?.categoria_id === raiz.categoria_id;
      });
      if (candidatas.length === 0) return null;
      candidatas.sort((a, b) => compararPorPrioridad(a, b, categorias));
      return { categoria: raiz, tarea: candidatas[0] };
    })
    .filter(Boolean);
}

/**
 * Indica si una tarea está en condiciones de actuarse ahora: `pendiente`
 * (ni `bloqueada` ni `completada`) y con `tarea_fecha_inicio_habilitada` ya
 * alcanzada.
 */
export function esTareaAccionable(tarea) {
  return tarea.tarea_estado === 'pendiente' && !noPuedeEmpezarTodavia(tarea.tarea_fecha_inicio_habilitada);
}

/**
 * Regla 80/20 (Pareto): de las tareas accionables, devuelve el 20% superior
 * (redondeado hacia arriba) según el orden de prioridad ya usado en la app
 * (`compararPorPrioridad`, que siempre termina en un orden determinístico) —
 * las "pocas vitales" en las que más conviene enfocarse ahora.
 */
export function calcularEnfoque8020(tareas, categorias) {
  const accionables = tareas.filter((t) => esTareaAccionable(t)).sort((a, b) => compararPorPrioridad(a, b, categorias));
  const cantidad = Math.ceil(accionables.length * 0.2);
  return accionables.slice(0, cantidad);
}
