// Detección de links en texto libre (H03-A). Lógica pura, sin DOM: se prueba en pruebas/links.test.js.

const PATRON_LINK = /(?:https?:\/\/|www\.)[^\s<>"'`]+/gi;
const PUNTUACION_FINAL = /[.,;:!?'"»”’\]}]$/;

/** Saca del final del link la puntuación que es del texto (`.`, `,`, `)` sin su `(`…), no del link. */
function recortarFinal(candidato) {
  let link = candidato;
  for (;;) {
    if (PUNTUACION_FINAL.test(link)) {
      link = link.slice(0, -1);
    } else if (link.endsWith(')') && (link.match(/\)/g) || []).length > (link.match(/\(/g) || []).length) {
      link = link.slice(0, -1);
    } else {
      return link;
    }
  }
}

/** Texto corto para mostrar en el chip: dominio (sin www.) + ruta, recortada si es muy larga. */
export function etiquetaLink(href, maximo = 40) {
  let url;
  try {
    url = new URL(href);
  } catch {
    return href;
  }
  const ruta = (url.pathname === '/' ? '' : url.pathname) + url.search;
  const completo = url.hostname.replace(/^www\./i, '') + ruta;
  return completo.length > maximo ? `${completo.slice(0, maximo - 1)}…` : completo;
}

/**
 * Devuelve los links http/https (y `www.`) del texto, en orden y sin repetir:
 * `[{ href, etiqueta }]`. Los `www.` quedan con `https://` al frente en el `href`.
 */
export function extraerLinks(texto) {
  const vistos = new Set();
  const links = [];
  for (const coincidencia of String(texto ?? '').matchAll(PATRON_LINK)) {
    const limpio = recortarFinal(coincidencia[0]);
    const href = /^www\./i.test(limpio) ? `https://${limpio}` : limpio;
    let url;
    try {
      url = new URL(href);
    } catch {
      continue;
    }
    if (!url.hostname.includes('.') || vistos.has(href)) continue;
    vistos.add(href);
    links.push({ href, etiqueta: etiquetaLink(href) });
  }
  return links;
}
