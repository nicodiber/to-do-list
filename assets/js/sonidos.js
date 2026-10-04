// Sonidos de la app (v0.104.0), sintetizados con la Web Audio API: no hay archivos de audio. Se pueden desactivar y regular
// desde Configuraciones; la preferencia es de cada dispositivo (`localStorage`), no se sincroniza con Drive.
// Los navegadores solo dejan sonar audio después de un gesto del usuario: como todo sonido sale de un clic o una tecla,
// el contexto de audio se crea recién la primera vez que hace falta.

const CLAVE = 'super-todo-list:sonidos';
const POR_DEFECTO = { activo: true, volumen: 0.5 };

export function leerPreferenciaSonidos() {
  try {
    const guardado = JSON.parse(localStorage.getItem(CLAVE));
    if (guardado && typeof guardado === 'object') {
      return {
        activo: guardado.activo !== false,
        volumen: Math.min(1, Math.max(0, Number.isFinite(guardado.volumen) ? guardado.volumen : POR_DEFECTO.volumen)),
      };
    }
  } catch {
    // Sin almacenamiento o ilegible: valores por defecto.
  }
  return { ...POR_DEFECTO };
}

export function guardarPreferenciaSonidos(preferencia) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify({ activo: !!preferencia.activo, volumen: preferencia.volumen }));
  } catch {
    // Es solo una preferencia: sin almacenamiento local vuelve a los valores por defecto.
  }
}

let contexto = null;

function obtenerContexto() {
  if (contexto) return contexto;
  const Constructor = typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null;
  if (!Constructor) return null;
  try {
    contexto = new Constructor();
  } catch {
    contexto = null;
  }
  return contexto;
}

/** Una nota: oscilador con ataque corto y caída exponencial. `desde` está en segundos desde ahora. */
function nota(ctx, salida, { frecuencia, hasta = frecuencia, desde = 0, duracion = 0.15, tipo = 'sine', volumen = 0.5 }) {
  const inicio = ctx.currentTime + desde;
  const oscilador = ctx.createOscillator();
  const ganancia = ctx.createGain();
  oscilador.type = tipo;
  oscilador.frequency.setValueAtTime(frecuencia, inicio);
  if (hasta !== frecuencia) oscilador.frequency.exponentialRampToValueAtTime(hasta, inicio + duracion);
  ganancia.gain.setValueAtTime(0.0001, inicio);
  ganancia.gain.exponentialRampToValueAtTime(Math.max(volumen, 0.0002), inicio + 0.012);
  ganancia.gain.exponentialRampToValueAtTime(0.0001, inicio + duracion);
  oscilador.connect(ganancia);
  ganancia.connect(salida);
  oscilador.start(inicio);
  oscilador.stop(inicio + duracion + 0.03);
}

// Notas (Hz) de una escala mayor de do, para que todo suene consonante.
const DO5 = 523.25;
const MI5 = 659.25;
const SOL5 = 783.99;
const DO6 = 1046.5;

const SONIDOS = {
  /** Toque casi imperceptible al apretar un botón. */
  clic: (ctx, s) => nota(ctx, s, { frecuencia: 1500, hasta: 1100, duracion: 0.035, tipo: 'triangle', volumen: 0.07 }),
  /** Tarea agregada: dos notas que suben. */
  agregar: (ctx, s) => {
    nota(ctx, s, { frecuencia: SOL5, duracion: 0.11, volumen: 0.22 });
    nota(ctx, s, { frecuencia: DO6, desde: 0.08, duracion: 0.2, volumen: 0.22 });
  },
  /** Tarea cumplida: arpegio ascendente con un destello final (el sonido de satisfacción). */
  completar: (ctx, s) => {
    [DO5, MI5, SOL5, DO6].forEach((frecuencia, i) => nota(ctx, s, { frecuencia, desde: i * 0.075, duracion: 0.22, volumen: 0.24 }));
    nota(ctx, s, { frecuencia: DO6 * 2, desde: 0.3, duracion: 0.4, tipo: 'triangle', volumen: 0.12 });
    nota(ctx, s, { frecuencia: SOL5, desde: 0.3, duracion: 0.45, volumen: 0.14 });
  },
  /** Eliminar: dos notas graves que bajan, suaves. */
  eliminar: (ctx, s) => {
    nota(ctx, s, { frecuencia: MI5 / 2, duracion: 0.12, tipo: 'triangle', volumen: 0.2 });
    nota(ctx, s, { frecuencia: DO5 / 2, desde: 0.09, duracion: 0.2, tipo: 'triangle', volumen: 0.2 });
  },
  /** Deshacer / rehacer: un barrido corto. */
  deshacer: (ctx, s) => nota(ctx, s, { frecuencia: 700, hasta: 330, duracion: 0.14, tipo: 'sine', volumen: 0.16 }),
  rehacer: (ctx, s) => nota(ctx, s, { frecuencia: 330, hasta: 700, duracion: 0.14, tipo: 'sine', volumen: 0.16 }),
  /** Un aviso o una pregunta: una campanita. */
  aviso: (ctx, s) => {
    nota(ctx, s, { frecuencia: 880, duracion: 0.35, volumen: 0.2 });
    nota(ctx, s, { frecuencia: 1320, duracion: 0.25, tipo: 'triangle', volumen: 0.06 });
  },
};

export const TIPOS_DE_SONIDO = Object.keys(SONIDOS);

/** Reproduce un sonido (si están activados). `forzar` lo reproduce igual, para el botón «Probar» de Configuraciones. */
const ultimaVez = new Map();

export function sonar(tipo, { forzar = false } = {}) {
  const preferencia = leerPreferenciaSonidos();
  if (!forzar && !preferencia.activo) return;
  // Una acción en bloque (eliminar varias tareas) no apila el mismo sonido diez veces.
  const ahora = Date.now();
  if (!forzar && ahora - (ultimaVez.get(tipo) || 0) < 150) return;
  ultimaVez.set(tipo, ahora);
  const sonido = SONIDOS[tipo];
  const ctx = obtenerContexto();
  if (!sonido || !ctx) return;
  try {
    if (ctx.state === 'suspended') ctx.resume();
    const salida = ctx.createGain();
    salida.gain.value = preferencia.volumen;
    salida.connect(ctx.destination);
    sonido(ctx, salida);
  } catch {
    // Un navegador sin audio no debe romper la app.
  }
}

/**
 * Sonido de «clic» global (v0.104.0): un toque casi imperceptible al apretar cualquier botón o módulo del menú.
 * Los botones que ya tienen su propio sonido (agregar, completar, eliminar…) lo marcan con `data-sin-clic`.
 */
export function activarSonidoDeClic() {
  document.addEventListener(
    'click',
    (evento) => {
      const objetivo = evento.target.closest && evento.target.closest('button, summary, .enlace-nav, [role="button"]');
      if (!objetivo || objetivo.disabled || objetivo.closest('[data-sin-clic]') || objetivo.dataset.sinClic !== undefined) return;
      sonar('clic');
    },
    true
  );
}
