// Dependencias entre tareas (lógica pura, sin DOM). Regla 1 a 1: cada tarea
// bloquea a como máximo una tarea activa y es bloqueada por como máximo una
// (`tarea_dependiente` = la tarea previa que la bloquea). Solo cuentan las tareas
// sin completar: una tarea completada ya no ocupa un lugar en la cadena.

/**
 * Recalcula `tarea_estado` de una tarea según su `tarea_dependiente`: si
 * apunta a otra tarea que todavía no está `completada`, queda `bloqueada`;
 * si no, `pendiente`. No toca tareas ya `completada`. Se llama al crear una
 * tarea, al editar/quitar su dependencia, y (en cascada) al completar la
 * tarea de la que depende.
 */
export function recalcularBloqueo(tarea, listaTareas) {
  if (tarea.tarea_estado === 'completada') return;
  const previa = tarea.tarea_dependiente ? listaTareas.find((t) => t.tarea_id === tarea.tarea_dependiente) : null;
  tarea.tarea_estado = previa && previa.tarea_estado !== 'completada' ? 'bloqueada' : 'pendiente';
}

/**
 * Valida que se pueda agregar `candidatoId` como `tarea_dependiente` de
 * `tareaId`: ni auto-referencia, ni que agregar ese enlace cierre un ciclo
 * (A depende de B depende de C depende de A, etc.) recorriendo la cadena de
 * `tarea_dependiente` hacia atrás desde `candidatoId`.
 */
export function puedeAgregarDependencia(tareaId, candidatoId, listaTareas) {
  if (tareaId === candidatoId) return false;
  return !existeCaminoDeDependencias(candidatoId, tareaId, listaTareas);
}

function existeCaminoDeDependencias(desdeId, hastaId, listaTareas) {
  let actual = desdeId;
  const visitados = new Set();
  while (actual && !visitados.has(actual)) {
    if (actual === hastaId) return true;
    visitados.add(actual);
    const tarea = listaTareas.find((t) => t.tarea_id === actual);
    actual = tarea ? tarea.tarea_dependiente : null;
  }
  return false;
}

function porId(listaTareas, id) {
  return id ? listaTareas.find((t) => t.tarea_id === id) || null : null;
}

/** Tareas activas (sin completar) bloqueadas directamente por `tareaId`. */
export function proximasActivas(tareaId, listaTareas) {
  return listaTareas.filter((t) => t.tarea_dependiente === tareaId && t.tarea_estado !== 'completada');
}

/** La tarea que `tareaId` bloquea (regla 1 a 1: a lo sumo una), o `null`. */
export function tareaProxima(tareaId, listaTareas) {
  return proximasActivas(tareaId, listaTareas)[0] || null;
}

/** ¿Hay un ciclo de dependencias siguiendo la cadena hacia atrás desde `desdeId`? */
function hayCiclo(mapa, desdeId) {
  const visitados = new Set();
  let actual = desdeId;
  while (actual) {
    if (visitados.has(actual)) return true;
    visitados.add(actual);
    actual = mapa.get(actual) || null;
  }
  return false;
}

const nombre = (t) => `«${t.tarea_nombre}»`;

/**
 * Evalúa el lugar de `tareaId` en la cadena: `previaId` = tarea que la bloquea
 * y `proximaId` = tarea a la que bloquea. Cada uno puede ser un id, `null`
 * (quitar el enlace) o `undefined` (dejarlo como está). No modifica nada:
 * devuelve `{ ok: true, cambios: [{ tarea, previaId }], insertaEnMedio }` o
 * `{ ok: false, motivo }` con el conflicto explicado para el usuario.
 *
 * Al enlazar con una tarea que ya está enlazada, la tarea se **inserta en
 * medio** (P→A→N): elegir solo la previa P (que ya bloquea a N) o solo la
 * próxima N (que ya depende de P) da el mismo resultado. Si se eligen las dos
 * y no son consecutivas se rechaza, para que el usuario reajuste.
 */
export function evaluarEnlace(tareaId, { previaId, proximaId }, listaTareas) {
  const tarea = porId(listaTareas, tareaId);
  if (!tarea) return { ok: false, motivo: 'La tarea ya no existe.' };

  const previaActual = tarea.tarea_dependiente || null;
  const proximaActual = tareaProxima(tareaId, listaTareas);
  const previaDeseada = previaId === undefined ? previaActual : previaId;
  const proximaDeseadaId = proximaId === undefined ? (proximaActual ? proximaActual.tarea_id : null) : proximaId;

  if (previaDeseada === tareaId || proximaDeseadaId === tareaId) {
    return { ok: false, motivo: 'Una tarea no puede depender de sí misma.' };
  }
  if (previaDeseada && proximaDeseadaId && previaDeseada === proximaDeseadaId) {
    return { ok: false, motivo: 'La tarea previa y la próxima no pueden ser la misma: crearía un ciclo.' };
  }

  const previa = porId(listaTareas, previaDeseada);
  const proxima = porId(listaTareas, proximaDeseadaId);
  if (previaDeseada && !previa) return { ok: false, motivo: 'La tarea previa elegida ya no existe.' };
  if (proximaDeseadaId && !proxima) return { ok: false, motivo: 'La tarea próxima elegida ya no existe.' };

  if (previaDeseada !== previaActual && previa && previa.tarea_estado === 'completada') {
    return { ok: false, motivo: `${nombre(previa)} ya está completada: no puede ser la tarea previa.` };
  }
  if (proxima && proxima.tarea_estado === 'completada') {
    return { ok: false, motivo: `${nombre(proxima)} ya está completada: no se la puede bloquear.` };
  }
  // La copia de una tarea con desencadenante nace bloqueada por él (ver `enlazarCopia`): ese enlace
  // existente no cuenta como conflicto, solo un enlace nuevo con otra tarea previa.
  if (previaDeseada && previaDeseada !== previaActual && tarea.tarea_desencadenante) {
    return { ok: false, motivo: `${nombre(tarea)} tiene un desencadenante: no puede tener también una tarea previa. Quitá el desencadenante primero.` };
  }
  if (proxima && proxima.tarea_desencadenante && proxima.tarea_dependiente !== tareaId) {
    return { ok: false, motivo: `${nombre(proxima)} tiene un desencadenante: no puede tener también una tarea previa.` };
  }

  // Quién ocupa hoy los lugares que se piden.
  const siguienteDePrevia = previa ? proximasActivas(previa.tarea_id, listaTareas).find((t) => t.tarea_id !== tareaId) || null : null;
  const previaDeProxima = proxima && proxima.tarea_dependiente !== tareaId ? porId(listaTareas, proxima.tarea_dependiente) : null;
  const previaOcupante = previaDeProxima && previaDeProxima.tarea_estado !== 'completada' ? previaDeProxima : null;

  let previaFinal = previaDeseada;
  let insertaEnMedio = null;
  const cambios = new Map(); // id → nuevo tarea_dependiente

  if (previa && proxima) {
    const consecutivas = siguienteDePrevia && siguienteDePrevia.tarea_id === proxima.tarea_id && previaOcupante && previaOcupante.tarea_id === previa.tarea_id;
    const ambasLibres = !siguienteDePrevia && !previaOcupante;
    if (!consecutivas && !ambasLibres) {
      const detalles = [];
      if (siguienteDePrevia) detalles.push(`${nombre(previa)} ya bloquea a ${nombre(siguienteDePrevia)}`);
      if (previaOcupante) detalles.push(`${nombre(proxima)} ya depende de ${nombre(previaOcupante)}`);
      return {
        ok: false,
        motivo: `No se puede poner ${nombre(tarea)} entre ${nombre(previa)} y ${nombre(proxima)}: ${detalles.join(' y ')}, y no son consecutivas. Reajustá las dependencias existentes y volvé a intentarlo.`,
      };
    }
    if (consecutivas) insertaEnMedio = { previa, proxima };
  } else if (previa) {
    if (siguienteDePrevia) {
      cambios.set(siguienteDePrevia.tarea_id, tareaId);
      insertaEnMedio = { previa, proxima: siguienteDePrevia };
    }
  } else if (proxima) {
    if (previaOcupante) {
      previaFinal = previaOcupante.tarea_id;
      insertaEnMedio = { previa: previaOcupante, proxima };
    }
  }

  if (previaFinal && previaFinal !== previaActual && tarea.tarea_desencadenante) {
    return { ok: false, motivo: `${nombre(tarea)} tiene un desencadenante: no puede tener también una tarea previa.` };
  }

  cambios.set(tareaId, previaFinal || null);
  if (proxima) cambios.set(proxima.tarea_id, tareaId);
  // La próxima que tenía antes y ya no es la elegida queda libre.
  if (proximaActual && proximaActual.tarea_id !== proximaDeseadaId && !cambios.has(proximaActual.tarea_id)) {
    cambios.set(proximaActual.tarea_id, null);
  }

  // Ciclos: se simula el mapa completo con los cambios aplicados.
  const mapa = new Map(listaTareas.map((t) => [t.tarea_id, t.tarea_dependiente || null]));
  cambios.forEach((dep, id) => mapa.set(id, dep));
  for (const id of cambios.keys()) {
    if (hayCiclo(mapa, id)) {
      return { ok: false, motivo: 'No se puede agregar esa dependencia: crearía un ciclo (directo o indirecto) entre tareas.' };
    }
  }

  const efectivos = [];
  cambios.forEach((dep, id) => {
    const t = porId(listaTareas, id);
    if (t && (t.tarea_dependiente || null) !== dep) efectivos.push({ tarea: t, previaId: dep });
  });
  return { ok: true, cambios: efectivos, insertaEnMedio };
}

/** Aplica `evaluarEnlace` si es válido: cambia las dependencias y recalcula los bloqueos. */
export function aplicarEnlace(tareaId, enlaces, listaTareas) {
  const resultado = evaluarEnlace(tareaId, enlaces, listaTareas);
  if (!resultado.ok) return resultado;
  resultado.cambios.forEach(({ tarea, previaId }) => {
    tarea.tarea_dependiente = previaId;
  });
  resultado.cambios.forEach(({ tarea }) => recalcularBloqueo(tarea, listaTareas));
  return resultado;
}

/**
 * Opciones para el desplegable "depende de (tarea previa)" de `tarea`: las
 * tareas sin completar que no crean un ciclo. `ocupadaPor` es la tarea que
 * esa previa ya bloquea (si elige esa, `tarea` se inserta en medio).
 */
export function opcionesPrevia(tarea, listaTareas) {
  return listaTareas
    .filter((c) => c.tarea_id !== tarea.tarea_id && c.tarea_estado !== 'completada' && puedeAgregarDependencia(tarea.tarea_id, c.tarea_id, listaTareas))
    .map((c) => ({ tarea: c, ocupadaPor: proximasActivas(c.tarea_id, listaTareas).find((t) => t.tarea_id !== tarea.tarea_id) || null }));
}

/**
 * Opciones para el desplegable "bloquea a (tarea próxima)" de `tarea`: las
 * tareas sin completar que no son su antecesora. `ocupadaPor` es la tarea
 * que ya bloquea a esa próxima (si elige esa, `tarea` se inserta en medio).
 */
export function opcionesProxima(tarea, listaTareas) {
  return listaTareas
    .filter((c) => c.tarea_id !== tarea.tarea_id && c.tarea_estado !== 'completada' && puedeAgregarDependencia(c.tarea_id, tarea.tarea_id, listaTareas))
    .map((c) => {
      const previa = c.tarea_dependiente && c.tarea_dependiente !== tarea.tarea_id ? porId(listaTareas, c.tarea_dependiente) : null;
      return { tarea: c, ocupadaPor: previa && previa.tarea_estado !== 'completada' ? previa : null };
    });
}

/**
 * Al eliminar `tarea`, reconecta la cadena: las tareas que dependían de ella
 * pasan a depender de su previa (P→A→N queda P→N), y si alguna la tenía como
 * `tarea_desencadenante`, ese desencadenante pasa a su previa. Se llama con
 * la lista **ya sin** `tarea`.
 */
export function reconectarAlEliminar(tarea, listaTareas) {
  const previaId = tarea.tarea_dependiente || null;
  listaTareas.forEach((t) => {
    if (t.tarea_dependiente === tarea.tarea_id) {
      t.tarea_dependiente = previaId && previaId !== t.tarea_id ? previaId : null;
      recalcularBloqueo(t, listaTareas);
    }
    if (t.tarea_desencadenante === tarea.tarea_id) {
      t.tarea_desencadenante = previaId && previaId !== t.tarea_id ? previaId : null;
    }
  });
}

/**
 * Repara los enlaces que la mezcla de cambios de dos dispositivos pudo dejar
 * inconsistentes: una previa con más de una tarea activa detrás (se conserva
 * el enlace de la tarea más antigua y se sueltan las demás) o un ciclo (se
 * corta por la tarea más nueva). Muta las tareas y devuelve las reparaciones
 * (`{ tarea, previa, tipo }`) para poder avisarle al usuario.
 */
export function repararEnlaces(listaTareas) {
  const reparaciones = [];
  const masAntigua = (a, b) => (a.tarea_creada_en || '').localeCompare(b.tarea_creada_en || '') || a.tarea_id.localeCompare(b.tarea_id);

  const grupos = new Map();
  listaTareas
    .filter((t) => t.tarea_dependiente && t.tarea_estado !== 'completada')
    .forEach((t) => grupos.set(t.tarea_dependiente, [...(grupos.get(t.tarea_dependiente) || []), t]));
  grupos.forEach((tareas, previaId) => {
    if (tareas.length < 2) return;
    tareas.sort(masAntigua);
    tareas.slice(1).forEach((t) => {
      t.tarea_dependiente = null;
      recalcularBloqueo(t, listaTareas);
      reparaciones.push({ tarea: t, previa: porId(listaTareas, previaId), tipo: 'previa-ocupada' });
    });
  });

  const mapa = () => new Map(listaTareas.map((t) => [t.tarea_id, t.tarea_dependiente || null]));
  for (const t of listaTareas) {
    if (!t.tarea_dependiente) continue;
    const m = mapa();
    const visitados = [];
    let actual = t.tarea_id;
    while (actual && !visitados.includes(actual)) {
      visitados.push(actual);
      actual = m.get(actual) || null;
    }
    if (!actual) continue;
    const ciclo = visitados.slice(visitados.indexOf(actual)).map((id) => porId(listaTareas, id)).filter(Boolean);
    const cortar = ciclo.sort((a, b) => masAntigua(b, a))[0];
    if (cortar) {
      const previa = porId(listaTareas, cortar.tarea_dependiente);
      cortar.tarea_dependiente = null;
      recalcularBloqueo(cortar, listaTareas);
      reparaciones.push({ tarea: cortar, previa, tipo: 'ciclo' });
    }
  }
  return reparaciones;
}

/**
 * Para que un anillo de mantenimiento se sostenga (A→B→C→D y D vuelve a activar
 * a A) **todas** las tareas de la cadena deben ser de mantenimiento: cada copia se
 * enlaza a la copia anterior. Devuelve las tareas que, siguiendo las próximas de
 * `tarea` hasta su `tarea_desencadenante`, no son de mantenimiento. Si la tarea no
 * es de mantenimiento, no tiene desencadenante o su cadena no llega hasta él,
 * devuelve `[]`.
 */
export function tareasDeLaCadenaNoRepetibles(tarea, listaTareas) {
  if (!tarea.tarea_mantenimiento || !tarea.tarea_desencadenante) return [];
  const desencadenante = porId(listaTareas, tarea.tarea_desencadenante);
  if (!desencadenante) return [];

  const cadena = [];
  const visitados = new Set([tarea.tarea_id]);
  let actual = tarea;
  for (;;) {
    const proxima = tareaProxima(actual.tarea_id, listaTareas);
    if (!proxima || visitados.has(proxima.tarea_id)) return [];
    cadena.push(proxima);
    visitados.add(proxima.tarea_id);
    // El desencadenante puede ser una instancia ya completada: cuenta también su copia vigente (mismo nombre).
    const esElDesencadenante =
      proxima.tarea_id === desencadenante.tarea_id ||
      (desencadenante.tarea_estado === 'completada' && proxima.tarea_mantenimiento && proxima.tarea_nombre === desencadenante.tarea_nombre);
    if (esElDesencadenante) break;
    actual = proxima;
  }
  return cadena.filter((t) => !t.tarea_mantenimiento);
}
