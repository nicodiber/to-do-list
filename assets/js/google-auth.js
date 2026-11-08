import { PREFIJO_APP } from './entorno.js';
// Client ID de una app OAuth pública (no es secreto, a diferencia de un
// Client Secret) creada en Google Cloud Console. Un solo token client pide
// los permisos de Drive y de Calendar (solo lectura) juntos, para que haya un
// único popup por sesión en vez de uno por servicio.
const CLIENT_ID = '688334428961-v8beno5ekn6i9uvn18m6rkccq0f0hnui.apps.googleusercontent.com';

const SCOPES = {
  drive: 'https://www.googleapis.com/auth/drive.file',
  calendar: 'https://www.googleapis.com/auth/calendar.readonly',
};
const SCOPES_TODOS = `${SCOPES.drive} ${SCOPES.calendar}`;
const CLAVE_CONECTADO_ALGUNA_VEZ = `${PREFIJO_APP}:google-conectado`;
const MARGEN_VENCIMIENTO_MS = 60 * 1000;
const CLAVE_REGISTRO = `${PREFIJO_APP}:google-registro`;
const MAX_REGISTRO = 30;
// v0.107.3 (H14): la cuenta con la que se conectó (solo en este navegador), como pista para Google.
const CLAVE_CUENTA = `${PREFIJO_APP}:google-cuenta`;

let token = null; // { accessToken, venceEn, respuesta }
let clienteToken = null;
let manejarRespuestaToken = null;
let manejarErrorToken = null;
let rechazarPendiente = null;
let alPerderSesionCallback = null;

export function soportaGoogle() {
  return typeof google !== 'undefined' && !!google.accounts && !!google.accounts.oauth2;
}

const URL_SCRIPT_GOOGLE = 'https://accounts.google.com/gsi/client';
let cargandoScript = null;
let yaEsperoAlOriginal = false;

/**
 * Vuelve a pedir el script de Google Identity Services. El `<script>` de
 * index.html se carga una sola vez al abrir la página: si en ese momento no
 * había conexión falla para siempre, aunque después vuelva internet. Por eso se
 * reintenta cargándolo de nuevo.
 */
function cargarScriptGoogle() {
  if (soportaGoogle()) return Promise.resolve(true);
  if (cargandoScript) return cargandoScript;
  cargandoScript = new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = URL_SCRIPT_GOOGLE;
    script.async = true;
    script.onload = () => {
      cargandoScript = null;
      resolve(soportaGoogle());
    };
    script.onerror = () => {
      cargandoScript = null;
      script.remove();
      resolve(false);
    };
    document.head.appendChild(script);
  });
  return cargandoScript;
}

function esperarAparicion(timeoutMs) {
  return new Promise((resolve) => {
    const inicio = Date.now();
    const intervalo = setInterval(() => {
      if (soportaGoogle()) {
        clearInterval(intervalo);
        resolve(true);
      } else if (Date.now() - inicio > timeoutMs) {
        clearInterval(intervalo);
        resolve(false);
      }
    }, 200);
  });
}

/**
 * El script de Google Identity Services (index.html) carga async: al arrancar
 * puede no estar listo todavía. Espera hasta `timeoutMs` a que aparezca (solo la
 * primera vez) y, si no llegó, lo vuelve a cargar por su cuenta.
 */
export async function esperarGoogle(timeoutMs = 8000) {
  if (soportaGoogle()) return true;
  if (!yaEsperoAlOriginal) {
    yaEsperoAlOriginal = true;
    if (await esperarAparicion(timeoutMs)) return true;
  }
  return cargarScriptGoogle();
}

export function hayToken() {
  return !!token && Date.now() < token.venceEn;
}

/** Milisegundos que le quedan al token (0 si no hay o ya venció). */
export function msHastaVencer() {
  return token ? Math.max(0, token.venceEn - Date.now()) : 0;
}

/**
 * Registro de diagnóstico (v0.100.0): las últimas veces que se conectó, renovó o falló la sesión de Google y por qué
 * (`tipo`: `conexion` | `renovacion` | `fallo`; `detalle`: el motivo que informó Google). Solo se guarda en este navegador
 * (no en Drive) y sirve para entender por qué una cuenta o un navegador pierde la sesión más seguido que otro.
 */
export function registroSesionGoogle() {
  try {
    const guardado = JSON.parse(localStorage.getItem(CLAVE_REGISTRO));
    return Array.isArray(guardado) ? guardado : [];
  } catch {
    return [];
  }
}

function registrarSesion(tipo, detalle = '') {
  try {
    const lista = registroSesionGoogle();
    lista.push({ cuando: new Date().toISOString(), tipo, detalle, visible: typeof document !== 'undefined' ? document.visibilityState : '' });
    localStorage.setItem(CLAVE_REGISTRO, JSON.stringify(lista.slice(-MAX_REGISTRO)));
  } catch {
    // Es solo un diagnóstico.
  }
}

export function obtenerTokenAcceso() {
  return hayToken() ? token.accessToken : null;
}

/**
 * `true` si el usuario concedió ese permiso. Con el consentimiento granular de
 * Google puede haber desmarcado alguno, así que no alcanza con tener token.
 */
export function tieneScope(nombre) {
  if (!hayToken() || !SCOPES[nombre]) return false;
  try {
    return google.accounts.oauth2.hasGrantedAllScopes(token.respuesta, SCOPES[nombre]);
  } catch {
    return false;
  }
}

export function conectadoAlgunaVez() {
  try {
    return localStorage.getItem(CLAVE_CONECTADO_ALGUNA_VEZ) === '1';
  } catch {
    return false;
  }
}

function recordarConexion() {
  try {
    localStorage.setItem(CLAVE_CONECTADO_ALGUNA_VEZ, '1');
  } catch {
    // Solo es una preferencia para intentar la reconexión silenciosa.
  }
}

export function alPerderSesion(callback) {
  alPerderSesionCallback = callback;
}

/**
 * Descarta el token (ej. Google respondió 401) y avisa a quien se suscribió
 * con `alPerderSesion`.
 */
export function invalidarToken(motivo = 'rechazado') {
  const teniaToken = !!token;
  token = null;
  if (teniaToken) registrarSesion('fallo', `El token dejó de servir (${motivo})`);
  if (teniaToken && alPerderSesionCallback) alPerderSesionCallback();
}

/**
 * Pide un token de acceso con los dos permisos vía Google Identity Services.
 * El token queda en memoria (no se persiste): dura ~1 hora y hay que volver a
 * pedirlo. Con `silencioso: true` no muestra ningún popup (`prompt: 'none'`) y
 * falla si Google necesita interacción — pensado para intentar reconectar al
 * abrir la app sin molestar; si falla, el usuario reconecta con un clic.
 *
 * El `TokenClient` de Google es un singleton (`initTokenClient` se llama una
 * sola vez): sus callbacks no pueden cerrar directamente sobre el
 * `resolve`/`reject` de ESTA promesa, porque en una reconexión posterior
 * (mismo objeto reusado) seguirían resolviendo la promesa de la primera
 * llamada y esta nueva quedaría colgada para siempre. Por eso los callbacks
 * reales solo delegan a `manejarRespuestaToken`/`manejarErrorToken`, que cada
 * llamada reasigna a su propio resolve/reject.
 */
export async function conectar({ silencioso = false } = {}) {
  if (!soportaGoogle() && !(await cargarScriptGoogle())) {
    throw new Error('No se pudo cargar Google Identity Services. Revisá tu conexión e intentá de nuevo.');
  }
  return pedirToken({ silencioso });
}

function pedirToken({ silencioso }) {
  return new Promise((resolve, reject) => {
    // Si quedó otra solicitud en curso, se cancela: sus callbacks se reasignan
    // acá y, si no, esa promesa quedaría colgada para siempre.
    if (rechazarPendiente) rechazarPendiente(new Error('Se pidió una nueva conexión mientras había otra en curso.'));
    rechazarPendiente = reject;
    // Un intento silencioso que Google nunca contesta (ventana bloqueada o cerrada) no puede quedar colgado para siempre:
    // sin esto la renovación y la reconexión automáticas quedaban trabadas hasta recargar la página.
    const espera = silencioso
      ? setTimeout(() => {
          if (rechazarPendiente !== reject) return;
          rechazarPendiente = null;
          registrarSesion('fallo', 'Silencioso: Google no respondió');
          reject(new Error('Hace falta volver a autorizar el acceso a Google.'));
        }, 20000)
      : null;
    const terminar = () => {
      if (espera) clearTimeout(espera);
      if (rechazarPendiente === reject) rechazarPendiente = null;
    };

    manejarRespuestaToken = (respuesta) => {
      terminar();
      if (respuesta.error) {
        registrarSesion('fallo', `${silencioso ? 'Silencioso' : 'Con ventana'}: ${respuesta.error}`);
        reject(new Error(silencioso ? 'Hace falta volver a autorizar el acceso a Google.' : 'No se pudo conectar con Google.'));
        return;
      }
      token = {
        accessToken: respuesta.access_token,
        venceEn: Date.now() + (Number(respuesta.expires_in) || 3600) * 1000 - MARGEN_VENCIMIENTO_MS,
        respuesta,
      };
      recordarConexion();
      registrarSesion(silencioso ? 'renovacion' : 'conexion');
      recordarCuenta(respuesta.access_token);
      resolve();
    };
    manejarErrorToken = (error) => {
      terminar();
      const cerrado = error && error.type === 'popup_closed';
      registrarSesion('fallo', `${silencioso ? 'Silencioso' : 'Con ventana'}: ${(error && error.type) || 'desconocido'}`);
      reject(new Error(cerrado ? 'Cerraste la ventana de Google antes de terminar.' : 'No se pudo abrir la ventana de Google.'));
    };

    if (!clienteToken) {
      clienteToken = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES_TODOS,
        callback: (respuesta) => manejarRespuestaToken(respuesta),
        error_callback: (error) => manejarErrorToken(error),
      });
    }

    // v0.107.3 (H14): con la pista de la cuenta (`hint`), Google sabe cuál renovar en silencio aunque haya varias
    // cuentas abiertas en el navegador; sin ella, con más de una cuenta, la renovación silenciosa fallaba y pedía
    // «Reconectar». La pista solo preselecciona: en la ventana se puede elegir otra cuenta igual.
    const cuenta = cuentaRecordada();
    clienteToken.requestAccessToken({ prompt: silencioso ? 'none' : '', ...(cuenta ? { hint: cuenta } : {}) });
  });
}

/** Email de la cuenta de Google con la que se conectó por última vez en este navegador (`''` si no se sabe). */
export function cuentaRecordada() {
  try {
    return localStorage.getItem(CLAVE_CUENTA) || '';
  } catch {
    return '';
  }
}

/**
 * Averigua el email de la cuenta recién conectada (Drive `about`, permitido con el permiso `drive.file` que ya
 * tiene la app) y lo guarda como pista para las próximas renovaciones. Falla en silencio: es solo una ayuda.
 */
async function recordarCuenta(accessToken) {
  try {
    const respuesta = await fetch('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!respuesta.ok) return;
    const email = (await respuesta.json())?.user?.emailAddress;
    if (email && email !== cuentaRecordada()) {
      localStorage.setItem(CLAVE_CUENTA, email);
      registrarSesion('cuenta', 'Se recordó la cuenta para renovar en silencio');
    }
  } catch {
    // Solo una ayuda para la renovación silenciosa.
  }
}
