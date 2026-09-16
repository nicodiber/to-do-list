// Mismo Client ID público que assets/js/google-calendar.js (proyecto OAuth
// ya creado en Google Cloud Console), con su propio scope y token client:
// no se amplía el scope de Calendar para no pedirle acceso a Drive a quien
// solo quiere conectar el calendario.
const CLIENT_ID = '688334428961-v8beno5ekn6i9uvn18m6rkccq0f0hnui.apps.googleusercontent.com';
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const NOMBRE_ARCHIVO = 'super-todo-list-datos.json';

let tokenActual = null;
let clienteToken = null;
let manejarRespuestaToken = null;
let idArchivoCacheado = null;

export function soportaGoogleDrive() {
  return typeof google !== 'undefined' && !!google.accounts;
}

export function hayConexionDrive() {
  return !!tokenActual;
}

/**
 * Pide un token de acceso restringido a los archivos que esta app crea en
 * Drive (scope drive.file), vía Google Identity Services (popup). El token
 * queda en memoria (no se persiste): hay que reconectar cuando expire.
 *
 * El `TokenClient` de Google es un singleton (`initTokenClient` se llama
 * una sola vez): su `callback` no puede cerrar directamente sobre el
 * `resolve`/`reject` de ESTA promesa, porque en una reconexión posterior
 * (mismo objeto `clienteToken` reusado) seguiría resolviendo la promesa de
 * la primera llamada y esta nueva quedaría colgada para siempre. Por eso
 * el `callback` real solo delega a `manejarRespuestaToken`, que cada
 * llamada reasigna a su propio resolve/reject.
 */
export function conectarDriveOAuth() {
  return new Promise((resolve, reject) => {
    if (!soportaGoogleDrive()) {
      reject(new Error('No se pudo cargar Google Identity Services. Revisá tu conexión e intentá de nuevo.'));
      return;
    }

    manejarRespuestaToken = (respuesta) => {
      if (respuesta.error) {
        reject(new Error('No se pudo conectar con Google Drive.'));
        return;
      }
      tokenActual = respuesta.access_token;
      resolve();
    };

    if (!clienteToken) {
      clienteToken = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPE,
        callback: (respuesta) => manejarRespuestaToken(respuesta),
      });
    }

    clienteToken.requestAccessToken();
  });
}

async function pedirDrive(url, opciones = {}) {
  const respuesta = await fetch(url, {
    ...opciones,
    headers: { ...opciones.headers, Authorization: `Bearer ${tokenActual}` },
  });
  if (!respuesta.ok) {
    if (respuesta.status === 401) tokenActual = null;
    throw new Error('No se pudo comunicar con Google Drive.');
  }
  return respuesta;
}

/**
 * Busca (o reusa de la sesión) el archivo de datos que la app ya haya
 * creado en Drive. Devuelve { id, modifiedTime } o null si todavía no existe.
 */
export async function buscarArchivoRemoto() {
  if (idArchivoCacheado) {
    const respuesta = await pedirDrive(
      `https://www.googleapis.com/drive/v3/files/${idArchivoCacheado}?fields=id,modifiedTime`
    );
    return respuesta.json();
  }

  const params = new URLSearchParams({
    q: `name='${NOMBRE_ARCHIVO}' and trashed=false`,
    fields: 'files(id,modifiedTime)',
    spaces: 'drive',
  });
  const respuesta = await pedirDrive(`https://www.googleapis.com/drive/v3/files?${params}`);
  const datos = await respuesta.json();
  const archivo = (datos.files || [])[0];
  if (!archivo) return null;
  idArchivoCacheado = archivo.id;
  return archivo;
}

export async function leerArchivoRemoto(id) {
  const respuesta = await pedirDrive(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`);
  return respuesta.json();
}

/**
 * Crea (primera vez) o actualiza el archivo de datos en Drive con el
 * `estado` actual, usando el id ya encontrado/creado en esta sesión
 * (`buscarArchivoRemoto`/una llamada anterior). Devuelve { id, modifiedTime }
 * — el `modifiedTime` que Drive asignó a esta escritura, para que quien
 * llama pueda recordarlo y saber luego si el archivo remoto sigue siendo
 * "el mismo que yo escribí" o cambió por otro lado.
 */
export async function guardarArchivoRemoto(datos) {
  const contenido = JSON.stringify(datos, null, 2);

  if (idArchivoCacheado) {
    const respuesta = await pedirDrive(
      `https://www.googleapis.com/upload/drive/v3/files/${idArchivoCacheado}?uploadType=media&fields=id,modifiedTime`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: contenido,
      }
    );
    return respuesta.json();
  }

  const limite = 'super_todo_list_boundary';
  const metadata = JSON.stringify({ name: NOMBRE_ARCHIVO, mimeType: 'application/json' });
  const cuerpo =
    `--${limite}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
    `--${limite}\r\nContent-Type: application/json\r\n\r\n${contenido}\r\n--${limite}--`;

  const respuesta = await pedirDrive(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,modifiedTime',
    {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${limite}` },
      body: cuerpo,
    }
  );
  const creado = await respuesta.json();
  idArchivoCacheado = creado.id;
  return creado;
}
