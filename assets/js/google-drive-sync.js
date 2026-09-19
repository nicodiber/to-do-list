import { obtenerTokenAcceso, invalidarToken } from './google-auth.js';

const NOMBRE_ARCHIVO = 'super-todo-list-datos.json';

let idArchivoCacheado = null;

/**
 * Error de comunicación con Drive con un `codigo` que el resto de la app usa
 * para decidir qué mostrar: `sin-sesion` (no hay token), `sesion-vencida`
 * (Google respondió 401), `sin-conexion` (no hubo red), `no-encontrado`
 * (404) u `otro`.
 */
export class ErrorDrive extends Error {
  constructor(codigo, mensaje) {
    super(mensaje);
    this.codigo = codigo;
  }
}

async function pedirDrive(url, opciones = {}) {
  const accessToken = obtenerTokenAcceso();
  if (!accessToken) throw new ErrorDrive('sin-sesion', 'No hay una sesión de Google activa.');

  let respuesta;
  try {
    respuesta = await fetch(url, {
      ...opciones,
      headers: { ...opciones.headers, Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    throw new ErrorDrive('sin-conexion', 'No hay conexión con Google Drive.');
  }

  if (!respuesta.ok) {
    if (respuesta.status === 401) {
      invalidarToken();
      throw new ErrorDrive('sesion-vencida', 'La sesión de Google venció.');
    }
    if (respuesta.status === 404) throw new ErrorDrive('no-encontrado', 'No se encontró el archivo en Drive.');
    throw new ErrorDrive('otro', 'No se pudo comunicar con Google Drive.');
  }
  return respuesta;
}

/**
 * Busca (o reusa de la sesión) el archivo de datos que la app ya haya creado
 * en Drive (scope drive.file: la app solo ve lo que ella misma creó, desde
 * cualquier dispositivo). Devuelve `{ id, modifiedTime, createdTime,
 * duplicados }` o `null` si todavía no existe. Si hay más de uno con el mismo
 * nombre (dos dispositivos lo crearon a la vez la primera vez), usa el más
 * antiguo y lo informa en `duplicados` para poder avisar.
 */
export async function buscarArchivoRemoto() {
  const campos = 'id,modifiedTime,createdTime';

  if (idArchivoCacheado) {
    try {
      const respuesta = await pedirDrive(`https://www.googleapis.com/drive/v3/files/${idArchivoCacheado}?fields=${campos}`);
      return { ...(await respuesta.json()), duplicados: 0 };
    } catch (error) {
      if (error.codigo !== 'no-encontrado') throw error;
      idArchivoCacheado = null;
    }
  }

  const params = new URLSearchParams({
    q: `name='${NOMBRE_ARCHIVO}' and trashed=false`,
    fields: `files(${campos})`,
    orderBy: 'createdTime',
    spaces: 'drive',
  });
  const respuesta = await pedirDrive(`https://www.googleapis.com/drive/v3/files?${params}`);
  const datos = await respuesta.json();
  const archivos = datos.files || [];
  if (archivos.length === 0) return null;
  idArchivoCacheado = archivos[0].id;
  return { ...archivos[0], duplicados: archivos.length - 1 };
}

export async function leerArchivoRemoto(id) {
  const respuesta = await pedirDrive(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`);
  return respuesta.json();
}

/**
 * Crea (primera vez) o actualiza el archivo de datos en Drive. Devuelve
 * `{ id, modifiedTime, desfaseRelojMs }`: el `modifiedTime` que Drive asignó a
 * esta escritura (para saber luego si el archivo remoto sigue siendo "el que
 * yo escribí") y cuánto se adelanta (+) o atrasa (−) el reloj de este
 * dispositivo respecto del de Drive, medido contra esa hora del servidor.
 */
export async function guardarArchivoRemoto(datos) {
  const contenido = JSON.stringify(datos, null, 2);
  let resultado;

  if (idArchivoCacheado) {
    const respuesta = await pedirDrive(
      `https://www.googleapis.com/upload/drive/v3/files/${idArchivoCacheado}?uploadType=media&fields=id,modifiedTime`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: contenido,
      }
    );
    resultado = await respuesta.json();
  } else {
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
    resultado = await respuesta.json();
    idArchivoCacheado = resultado.id;
  }

  return { ...resultado, desfaseRelojMs: Date.now() - new Date(resultado.modifiedTime).getTime() };
}
