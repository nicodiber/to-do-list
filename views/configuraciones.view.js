import { exportarJSON, importarJSON, borrarTodosLosDatos } from '../assets/js/almacenamiento.js';
import { obtenerFranjaHoraria, establecerFranjaHoraria, HORAS_FRANJA } from '../assets/js/preferencias-horario.js';

const PALABRA_CONFIRMACION = 'BORRAR';

export function renderVistaConfiguraciones(contenedor) {
  const franja = obtenerFranjaHoraria();
  contenedor.innerHTML = `
    <h2>⚙️ Configuraciones</h2>

    <section class="seccion-config">
      <h3>🗓️ Agenda y Calendar</h3>
      <p class="ayuda">Al buscar «el próximo hueco libre» de una tarea (botón que aparece cuando se superpone con un evento de Calendar), solo se proponen horarios dentro de esta franja del día. Se guarda en este dispositivo.</p>
      <div class="acciones-config franja-horaria">
        <label title="Primera hora del día en que se pueden proponer horarios">🌅 Desde
          <select id="franja-inicio">${HORAS_FRANJA.slice(0, -1).map((h) => `<option value="${h}" ${h === franja.inicio ? 'selected' : ''}>${h}</option>`).join('')}</select>
        </label>
        <label title="Última hora del día en que se pueden proponer horarios">🌇 Hasta
          <select id="franja-fin">${HORAS_FRANJA.slice(1).map((h) => `<option value="${h}" ${h === franja.fin ? 'selected' : ''}>${h}</option>`).join('')}</select>
        </label>
      </div>
      <p class="ayuda" id="mensaje-franja" hidden></p>
    </section>

    <section class="seccion-config">
      <h3>💾 Copia de seguridad</h3>
      <p class="ayuda">Tus datos viven en tu Google Drive. Exportar descarga una copia en un archivo JSON; importar reemplaza todo lo que hay por el contenido de un archivo (también en Drive).</p>
      <div class="acciones-config">
        <button title="Descargar una copia de tus datos en un archivo JSON" type="button" id="boton-exportar">⬇️ Exportar JSON</button>
        <label class="boton-archivo">
          ⬆️ Importar JSON
          <input type="file" id="input-importar" accept="application/json" hidden />
        </label>
      </div>
    </section>

    <section class="seccion-config seccion-peligro">
      <h3>🗑️ Borrar todos los datos</h3>
      <p class="ayuda">Elimina <strong>todas</strong> tus tareas, categorías, ubicaciones, metas, personas, notas de mejora y registros de cumplimiento. También se borran en Google Drive y en tus otros dispositivos. Conviene exportar antes una copia.</p>
      <div class="acciones-config">
        <button title="Borrar todos tus datos (pide doble confirmación)" type="button" id="boton-borrar-todo" class="boton-peligro">🗑️ Borrar todos los datos</button>
      </div>
    </section>
  `;

  const campoInicio = contenedor.querySelector('#franja-inicio');
  const campoFin = contenedor.querySelector('#franja-fin');
  const mensajeFranja = contenedor.querySelector('#mensaje-franja');
  const guardarFranja = () => {
    const guardada = establecerFranjaHoraria({ inicio: campoInicio.value, fin: campoFin.value });
    mensajeFranja.textContent = guardada ? '✓ Guardado en este dispositivo.' : 'El «Desde» tiene que ser anterior al «Hasta»: no se guardó.';
    mensajeFranja.hidden = false;
  };
  campoInicio.addEventListener('change', guardarFranja);
  campoFin.addEventListener('change', guardarFranja);

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
    if (escrito === null) {
      alert('No se borró nada.');
      return;
    }
    if (escrito.trim().toUpperCase() !== PALABRA_CONFIRMACION) {
      alert('Palabra incorrecta. No se borró nada.');
      return;
    }
    await borrarTodosLosDatos();
    alert('Se borraron todos los datos.');
  });
}
