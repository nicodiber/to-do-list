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
const CLAVE_CONECTADO_ALGUNA_VEZ = 'super-todo-list:google-conectado';
const MARGEN_VENCIMIENTO_MS = 60 * 1000;

let token = null; // { accessToken, venceEn, respuesta }
let clienteToken = null;
let manejarRespuestaToken = null;
let manejarErrorToken = null;
let rechazarPendiente = null;
let alPerderSesionCallback = null;

export function soportaGoogle() {
  return typeof google !== 'undefined' && !!google.accounts && !!google.accounts.oauth2;
}

/**
 * El script de Google Identity Services (index.html) carga async: al arrancar
 * puede no estar listo todavía. Espera hasta `timeoutMs` a que aparezca.
 */
export function esperarGoogle(timeoutMs = 8000) {
  return new Promise((resolve) => {
    if (soportaGoogle()) {
      resolve(true);
      return;
    }
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

export function hayToken() {
  return !!token && Date.now() < token.venceEn;
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
export function invalidarToken() {
  const teniaToken = !!token;
  token = null;
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
export function conectar({ silencioso = false } = {}) {
  return new Promise((resolve, reject) => {
    if (!soportaGoogle()) {
      reject(new Error('No se pudo cargar Google Identity Services. Revisá tu conexión e intentá de nuevo.'));
      return;
    }

    // Si quedó otra solicitud en curso, se cancela: sus callbacks se reasignan
    // acá y, si no, esa promesa quedaría colgada para siempre.
    if (rechazarPendiente) rechazarPendiente(new Error('Se pidió una nueva conexión mientras había otra en curso.'));
    rechazarPendiente = reject;
    const terminar = () => {
      if (rechazarPendiente === reject) rechazarPendiente = null;
    };

    manejarRespuestaToken = (respuesta) => {
      terminar();
      if (respuesta.error) {
        reject(new Error(silencioso ? 'Hace falta volver a autorizar el acceso a Google.' : 'No se pudo conectar con Google.'));
        return;
      }
      token = {
        accessToken: respuesta.access_token,
        venceEn: Date.now() + (Number(respuesta.expires_in) || 3600) * 1000 - MARGEN_VENCIMIENTO_MS,
        respuesta,
      };
      recordarConexion();
      resolve();
    };
    manejarErrorToken = (error) => {
      terminar();
      const cerrado = error && error.type === 'popup_closed';
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

    clienteToken.requestAccessToken({ prompt: silencioso ? 'none' : '' });
  });
}
