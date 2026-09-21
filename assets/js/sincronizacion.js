// Lógica pura (sin DOM ni red) para sincronizar el estado entre dispositivos:
// sellar qué entidades cambiaron, y mezclar la copia local con la de Drive.
// Cada entidad lleva un `<entidad>_modificado_en` (ISO) y las eliminaciones se
// registran en una lista de "tombstones" para que lo borrado no reviva.

export const DIAS_RETENCION_ELIMINADOS = 90;
export const FORMATO_ARCHIVO = 3;

export const COLECCIONES = [
  { clave: 'categorias', id: 'categoria_id', modificado: 'categoria_modificado_en', nombre: 'categoria_nombre', etiqueta: 'categoría' },
  { clave: 'ubicaciones', id: 'ubicacion_id', modificado: 'ubicacion_modificado_en', nombre: 'ubicacion_nombre', etiqueta: 'ubicación' },
  { clave: 'metas', id: 'meta_id', modificado: 'meta_modificado_en', nombre: 'meta_nombre', etiqueta: 'meta' },
  { clave: 'personas', id: 'persona_id', modificado: 'persona_modificado_en', nombre: 'persona_nombre', etiqueta: 'persona' },
  { clave: 'tareas', id: 'tarea_id', modificado: 'tarea_modificado_en', nombre: 'tarea_nombre', etiqueta: 'tarea' },
  { clave: 'mejoras', id: 'mejora_id', modificado: 'mejora_modificado_en', nombre: 'mejora_tarea_nombre', etiqueta: 'nota de mejora' },
  { clave: 'cumplimientos', id: 'cumplimiento_id', modificado: 'cumplimiento_modificado_en', nombre: 'cumplimiento_tarea_nombre', etiqueta: 'marca de cumplimiento' },
  { clave: 'preferencias', id: 'preferencias_id', modificado: 'preferencias_modificado_en', nombre: 'preferencias_nombre', etiqueta: 'preferencia' },
];

/** Serialización con claves ordenadas, para comparar contenidos sin depender del orden de las claves. */
export function estable(valor) {
  if (Array.isArray(valor)) return `[${valor.map(estable).join(',')}]`;
  if (valor && typeof valor === 'object') {
    return `{${Object.keys(valor)
      .sort()
      .map((clave) => `${JSON.stringify(clave)}:${estable(valor[clave])}`)
      .join(',')}}`;
  }
  return JSON.stringify(valor === undefined ? null : valor);
}

/**
 * Contenido de una entidad sin su sello de modificación y sin los campos
 * vacíos (`null`/ausente son equivalentes), como texto comparable.
 */
function contenido(entidad, cfg) {
  const limpio = {};
  for (const [clave, valor] of Object.entries(entidad)) {
    if (clave === cfg.modificado || valor === null || valor === undefined) continue;
    limpio[clave] = valor;
  }
  return estable(limpio);
}

function sello(entidad, cfg) {
  return entidad[cfg.modificado] || '';
}

function mapaPorId(lista, cfg) {
  return new Map((lista || []).map((entidad) => [entidad[cfg.id], entidad]));
}

function claveTombstone(coleccion, id) {
  return `${coleccion}:${id}`;
}

function mapaTombstones(lista) {
  const mapa = new Map();
  for (const tombstone of lista || []) {
    const clave = claveTombstone(tombstone.coleccion, tombstone.id);
    const existente = mapa.get(clave);
    if (!existente || tombstone.eliminado_en > existente.eliminado_en) mapa.set(clave, tombstone);
  }
  return mapa;
}

export function purgarEliminados(lista, ahora) {
  const limite = new Date(new Date(ahora).getTime() - DIAS_RETENCION_ELIMINADOS * 24 * 60 * 60 * 1000).toISOString();
  return (lista || []).filter((tombstone) => tombstone.eliminado_en >= limite);
}

export function copiarProfundo(valor) {
  return JSON.parse(JSON.stringify(valor));
}

/** Foto de las colecciones de `estado`, para compararla luego con `sellarCambios`. */
export function fotoColecciones(estado) {
  const foto = {};
  for (const cfg of COLECCIONES) foto[cfg.clave] = copiarProfundo(estado[cfg.clave]);
  return foto;
}

/**
 * Compara `estado` contra `ultimo` (la foto tomada en el guardado anterior) y
 * sella con `ahora` cada entidad nueva o modificada. Las entidades que estaban
 * en la última copia sincronizada (`base`) y ya no están se registran como
 * eliminadas. Muta `estado` (los sellos) y devuelve la lista de eliminados
 * actualizada. No hace falta que las vistas avisen qué cambiaron.
 */
export function sellarCambios(estado, ultimo, base, eliminados, ahora) {
  let nuevosEliminados = [...(eliminados || [])];

  for (const cfg of COLECCIONES) {
    const previas = mapaPorId(ultimo?.[cfg.clave], cfg);
    const enBase = mapaPorId(base?.[cfg.clave], cfg);
    const idsActuales = new Set();

    for (const entidad of estado[cfg.clave]) {
      idsActuales.add(entidad[cfg.id]);
      const previa = previas.get(entidad[cfg.id]);
      if (!previa || contenido(previa, cfg) !== contenido(entidad, cfg)) {
        entidad[cfg.modificado] = ahora;
      } else if (!entidad[cfg.modificado] && previa[cfg.modificado]) {
        entidad[cfg.modificado] = previa[cfg.modificado];
      }
    }

    for (const id of previas.keys()) {
      if (idsActuales.has(id) || !enBase.has(id)) continue;
      const clave = claveTombstone(cfg.clave, id);
      if (!nuevosEliminados.some((t) => claveTombstone(t.coleccion, t.id) === clave)) {
        nuevosEliminados.push({ coleccion: cfg.clave, id, eliminado_en: ahora });
      }
    }

    // Si una entidad reaparece con el mismo id, su tombstone ya no corresponde.
    nuevosEliminados = nuevosEliminados.filter((t) => t.coleccion !== cfg.clave || !idsActuales.has(t.id));
  }

  return purgarEliminados(nuevosEliminados, ahora);
}

/** Estructura del archivo que se guarda en Drive. */
export function datosParaArchivo(estado, eliminados, ahora) {
  const datos = { formato: FORMATO_ARCHIVO, guardado_en: ahora };
  for (const cfg of COLECCIONES) datos[cfg.clave] = estado[cfg.clave];
  datos.eliminados = eliminados || [];
  return datos;
}

function textoValor(valor) {
  if (valor === null || valor === undefined || valor === '') return '(vacío)';
  const texto = typeof valor === 'string' ? valor : JSON.stringify(valor);
  return texto.length > 60 ? `${texto.slice(0, 57)}…` : texto;
}

function camposDistintos(descartada, conservada, cfg) {
  const claves = new Set([...Object.keys(descartada), ...Object.keys(conservada)]);
  claves.delete(cfg.modificado);
  const distintos = [];
  for (const campo of claves) {
    if (estable(descartada[campo] ?? null) !== estable(conservada[campo] ?? null)) {
      distintos.push({ campo, valorDescartado: textoValor(descartada[campo]) });
    }
  }
  return distintos;
}

let contadorAvisos = 0;
function crearAviso(ahora, cfg, entidad, tipo, mensaje, camposDescartados = []) {
  contadorAvisos += 1;
  return {
    id: `${ahora}-${contadorAvisos}`,
    creado_en: ahora,
    tipo,
    coleccion: cfg.etiqueta,
    nombre: entidad[cfg.nombre] || '(sin nombre)',
    mensaje,
    camposDescartados,
  };
}

/**
 * Mezcla la copia local con la remota, entidad por entidad (por id). `base` es
 * la última copia sincronizada (el ancestro común). Reglas:
 * - En ambos lados: si solo uno la cambió desde `base`, gana ese; si los dos
 *   la cambiaron (conflicto), gana el sello más nuevo (empate: el remoto) y se
 *   genera un aviso con los campos descartados.
 * - Solo de un lado: se conserva, salvo que el otro lado tenga un tombstone
 *   más nuevo que la última edición (fue eliminada allá).
 * Devuelve `{ datos, avisos }`, con `datos` en la forma del archivo de Drive.
 */
export function mezclar(local, remoto, base, ahora) {
  const avisos = [];
  const tombLocal = mapaTombstones(local.eliminados);
  const tombRemoto = mapaTombstones(remoto.eliminados);
  const tombFinal = new Map();
  const datos = { formato: FORMATO_ARCHIVO, guardado_en: ahora };

  for (const cfg of COLECCIONES) {
    const L = mapaPorId(local[cfg.clave], cfg);
    const R = mapaPorId(remoto[cfg.clave], cfg);
    const B = mapaPorId(base?.[cfg.clave], cfg);
    const salida = [];

    for (const id of new Set([...L.keys(), ...R.keys()])) {
      const l = L.get(id);
      const r = R.get(id);
      const b = B.get(id);
      const clave = claveTombstone(cfg.clave, id);

      if (l && r) {
        if (contenido(l, cfg) === contenido(r, cfg)) {
          salida.push(sello(l, cfg) >= sello(r, cfg) ? l : r);
          continue;
        }
        const cambioLocal = !b || contenido(l, cfg) !== contenido(b, cfg);
        const cambioRemoto = !b || contenido(r, cfg) !== contenido(b, cfg);
        if (cambioLocal && !cambioRemoto) {
          salida.push(l);
        } else if (cambioRemoto && !cambioLocal) {
          salida.push(r);
        } else {
          const gananLocal = sello(l, cfg) > sello(r, cfg);
          const ganadora = gananLocal ? l : r;
          const perdedora = gananLocal ? r : l;
          salida.push(ganadora);
          const quien = gananLocal ? 'este dispositivo' : 'otro dispositivo';
          avisos.push(
            crearAviso(
              ahora,
              cfg,
              ganadora,
              'conflicto',
              `La ${cfg.etiqueta} «${ganadora[cfg.nombre]}» se editó en los dos dispositivos: se conservó la versión de ${quien} (la más reciente) y se descartó la otra.`,
              camposDistintos(perdedora, ganadora, cfg)
            )
          );
        }
      } else if (l) {
        const tomb = tombRemoto.get(clave);
        const editadaLocal = !!b && contenido(l, cfg) !== contenido(b, cfg);
        if (tomb && tomb.eliminado_en > sello(l, cfg)) {
          tombFinal.set(clave, tomb);
          if (editadaLocal) {
            avisos.push(crearAviso(ahora, cfg, l, 'eliminacion', `La ${cfg.etiqueta} «${l[cfg.nombre]}» se eliminó en otro dispositivo: se descartó tu cambio local sobre ella.`));
          }
        } else {
          salida.push(l);
          if (tomb && b) {
            avisos.push(crearAviso(ahora, cfg, l, 'eliminacion', `La ${cfg.etiqueta} «${l[cfg.nombre]}» se había eliminado en otro dispositivo, pero la editaste después: se conservó.`));
          }
        }
      } else if (r) {
        const tomb = tombLocal.get(clave);
        const editadaRemota = !!b && contenido(r, cfg) !== contenido(b, cfg);
        if (tomb && tomb.eliminado_en > sello(r, cfg)) {
          tombFinal.set(clave, tomb);
          if (editadaRemota) {
            avisos.push(crearAviso(ahora, cfg, r, 'eliminacion', `La ${cfg.etiqueta} «${r[cfg.nombre]}» la eliminaste acá, pero otro dispositivo la había editado antes: se aplicó tu eliminación.`));
          }
        } else {
          salida.push(r);
          if (tomb && b) {
            avisos.push(crearAviso(ahora, cfg, r, 'eliminacion', `La ${cfg.etiqueta} «${r[cfg.nombre]}» la habías eliminado acá, pero otro dispositivo la editó después: se conservó.`));
          }
        }
      }
    }

    datos[cfg.clave] = salida;
  }

  // Tombstones: los de ambos lados, quedándose con el más nuevo de cada id, y
  // solo mientras la entidad siga ausente del resultado.
  for (const [clave, tomb] of [...tombLocal, ...tombRemoto]) {
    const existente = tombFinal.get(clave);
    if (!existente || tomb.eliminado_en > existente.eliminado_en) tombFinal.set(clave, tomb);
  }
  const presentes = new Set();
  for (const cfg of COLECCIONES) for (const entidad of datos[cfg.clave]) presentes.add(claveTombstone(cfg.clave, entidad[cfg.id]));
  datos.eliminados = purgarEliminados(
    [...tombFinal.entries()].filter(([clave]) => !presentes.has(clave)).map(([, tomb]) => tomb),
    ahora
  );

  return { datos, avisos };
}

/** ¿Difieren dos estados (colecciones + eliminados) en algo más que la hora de guardado? */
export function difierenDatos(a, b) {
  const sinMeta = (datos) => {
    const limpio = {};
    for (const cfg of COLECCIONES) limpio[cfg.clave] = datos[cfg.clave] || [];
    limpio.eliminados = datos.eliminados || [];
    return estable(limpio);
  };
  return sinMeta(a) !== sinMeta(b);
}
