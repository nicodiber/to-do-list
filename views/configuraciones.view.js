import { exportarJSON, importarJSON, borrarTodosLosDatos } from '../assets/js/almacenamiento.js';

const PALABRA_CONFIRMACION = 'BORRAR';

export function renderVistaConfiguraciones(contenedor) {
  contenedor.innerHTML = `
    <h2>Configuraciones</h2>

    <section class="seccion-config">
      <h3>Copia de seguridad</h3>
      <p class="ayuda">Tus datos viven en tu Google Drive. Exportar descarga una copia en un archivo JSON; importar reemplaza todo lo que hay por el contenido de un archivo (también en Drive).</p>
      <div class="acciones-config">
        <button type="button" id="boton-exportar">Exportar JSON</button>
        <label class="boton-archivo">
          Importar JSON
          <input type="file" id="input-importar" accept="application/json" hidden />
        </label>
      </div>
    </section>

    <section class="seccion-config seccion-peligro">
      <h3>Borrar todos los datos</h3>
      <p class="ayuda">Elimina <strong>todas</strong> tus tareas, categorías, ubicaciones, metas, personas, notas de mejora y registros de cumplimiento. También se borran en Google Drive y en tus otros dispositivos. Conviene exportar antes una copia.</p>
      <div class="acciones-config">
        <button type="button" id="boton-borrar-todo" class="boton-peligro">Borrar todos los datos</button>
      </div>
    </section>
  `;

  contenedor.querySelector('#boton-exportar').addEventListener('click', exportarJSON);

  contenedor.querySelector('#input-importar').addEventListener('change', async (evento) => {
    const archivo = evento.target.files[0];
    if (!archivo) return;
    try {
      await importarJSON(archivo);
    } catch (error) {
      alert('No se pudo importar el archivo: ' + error.message);
    } finally {
      evento.target.value = '';
    }
  });

  contenedor.querySelector('#boton-borrar-todo').addEventListener('click', async () => {
    const seguro = confirm(
      'Vas a borrar TODOS tus datos (tareas, categorías, ubicaciones, metas, personas, mejoras y cumplimientos), también en Google Drive y en tus otros dispositivos. Esto no se puede deshacer. ¿Querés continuar?'
    );
    if (!seguro) return;
    const escrito = prompt(`Para confirmar, escribí ${PALABRA_CONFIRMACION}:`);
    if (escrito === null || escrito.trim().toUpperCase() !== PALABRA_CONFIRMACION) {
      alert('No se borró nada.');
      return;
    }
    await borrarTodosLosDatos();
    alert('Se borraron todos los datos.');
  });
}
