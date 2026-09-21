// Administrador de plantillas de preparación (sección de Configuraciones): lista la base y las del usuario, y abre el
// editor de pasos. La plantilla base vive en el código y solo se puede duplicar; las propias se guardan en Drive.

import { estado, persistirYNotificar } from './almacenamiento.js';
import { crearPlantilla } from './modelos.js';
import { escaparHtml } from './utilidades.js';
import { abrirDialogoFormulario } from './dialogo-formulario.js';
import { FASES, ETIQUETAS_FASE, plantillasDisponibles } from './plantillas.js';

const copiaDePasos = (pasos) => pasos.map((p) => ({ ...p }));

/** HTML de la sección "Plantillas de preparación" de Configuraciones. */
export function htmlSeccionPlantillas() {
  return `
    <section class="seccion-config">
      <h3>📋 Plantillas de preparación</h3>
      <p class="ayuda">Son los pasos que genera el asistente «📚 Nuevo examen». La plantilla por defecto no se edita, pero se puede duplicar y adaptar (por ejemplo para un examen que no necesita tantos pasos). Se guardan en tu Drive.</p>
      <ul class="lista-plantillas">
        ${plantillasDisponibles(estado)
          .map(
            (p) => `
          <li data-plantilla="${p.plantilla_id}">
            <span><strong>${escaparHtml(p.plantilla_nombre)}</strong> <span class="etiqueta-fecha">${p.plantilla_pasos.length} pasos</span></span>
            <span class="acciones-config">
              ${p.base ? '' : '<button type="button" data-accion="editar-plantilla" title="Editar los pasos de esta plantilla">✏️ Editar</button>'}
              <button type="button" data-accion="duplicar-plantilla" title="Crear una copia editable de esta plantilla">📄 Duplicar</button>
              ${p.base ? '' : '<button type="button" data-accion="eliminar-plantilla" title="Eliminar esta plantilla (pide confirmación)">🗑️ Eliminar</button>'}
            </span>
          </li>`
          )
          .join('')}
      </ul>
      <div class="acciones-config"><button type="button" id="boton-nueva-plantilla" title="Crear una plantilla propia partiendo de cero">➕ Nueva plantilla vacía</button></div>
    </section>`;
}

/** Conecta los botones de la sección (al guardar, la vista se redibuja sola con los datos). */
export function conectarSeccionPlantillas(contenedor) {
  contenedor.querySelector('#boton-nueva-plantilla').addEventListener('click', () => abrirEditorPlantilla(null));
  contenedor.querySelectorAll('[data-plantilla]').forEach((fila) => {
    const id = fila.dataset.plantilla;
    const plantilla = plantillasDisponibles(estado).find((p) => p.plantilla_id === id);
    fila.querySelector('[data-accion="editar-plantilla"]')?.addEventListener('click', () => abrirEditorPlantilla(plantilla));
    fila.querySelector('[data-accion="duplicar-plantilla"]').addEventListener('click', async () => {
      estado.plantillas.push(crearPlantilla({ plantilla_nombre: `${plantilla.plantilla_nombre.replace(' (por defecto)', '')} (copia)`, plantilla_pasos: copiaDePasos(plantilla.plantilla_pasos) }));
      await persistirYNotificar();
    });
    fila.querySelector('[data-accion="eliminar-plantilla"]')?.addEventListener('click', async () => {
      if (!confirm(`¿Eliminar la plantilla «${plantilla.plantilla_nombre}»?`)) return;
      estado.plantillas = estado.plantillas.filter((p) => p.plantilla_id !== id);
      await persistirYNotificar();
    });
  });
}

let contadorClaves = 0;

/** Editor de una plantilla propia (`plantilla` = `null` para crear una vacía). */
export function abrirEditorPlantilla(plantilla) {
  let pasos = plantilla ? copiaDePasos(plantilla.plantilla_pasos) : [];
  const id = plantilla ? plantilla.plantilla_id : null;

  abrirDialogoFormulario({
    titulo: plantilla ? '✏️ Editar plantilla' : '➕ Nueva plantilla',
    textoGuardar: '💾 Guardar plantilla',
    cuerpoHtml: `
      <label class="campo ancho-completo"><span class="campo-titulo">📝 Nombre de la plantilla</span><input type="text" name="plantilla_nombre" value="${escaparHtml(plantilla ? plantilla.plantilla_nombre : '')}" required /></label>
      <p class="ayuda ayuda-formulario">En los nombres podés usar {examen}, {instancia}, {unidad} y {ciclo}, que se reemplazan al generar. Una tarea atómica dura poco y dice cuándo está hecha.</p>
      <ol class="pasos-plantilla"></ol>
      <div class="ancho-completo"><button type="button" data-accion="agregar-paso" title="Sumar un paso a la plantilla">➕ Agregar paso</button></div>`,
    conectar: (formulario) => {
      const lista = formulario.querySelector('.pasos-plantilla');

      const leerFilas = () => {
        pasos = [...lista.querySelectorAll('[data-paso]')].map((li) => {
          const fase = li.querySelector('[name="fase"]').value;
          const paso = { clave: li.dataset.clave, fase, nombre: li.querySelector('[name="nombre"]').value.trim(), duracion_min: Number(li.querySelector('[name="duracion"]').value) || 30, hecho_cuando: li.querySelector('[name="hecho"]').value.trim() };
          if (fase === 'consolidar') paso.dias_antes = Number(li.querySelector('[name="dias_antes"]')?.value) || 1;
          if (fase === 'habito') paso.despues_de = li.querySelector('[name="despues_de"]')?.value || '';
          return paso;
        });
      };

      const dibujar = () => {
        const candidatos = pasos.filter((p) => p.fase !== 'habito');
        lista.innerHTML = pasos
          .map(
            (p, i) => `
          <li class="paso-plantilla" data-paso data-clave="${escaparHtml(p.clave)}">
            <div class="paso-plantilla-fila">
              <select name="fase" title="Cuándo se genera este paso">${FASES.map((f) => `<option value="${f}" ${f === p.fase ? 'selected' : ''}>${ETIQUETAS_FASE[f]}</option>`).join('')}</select>
              <input type="number" name="duracion" min="5" step="5" value="${p.duracion_min}" title="Duración en minutos" aria-label="Duración en minutos" /><span class="ayuda">min</span>
              <span class="acciones-vista-previa">
                <button type="button" data-mover="-1" title="Subir este paso" ${i === 0 ? 'disabled' : ''}>↑</button>
                <button type="button" data-mover="1" title="Bajar este paso" ${i === pasos.length - 1 ? 'disabled' : ''}>↓</button>
                <button type="button" data-quitar title="Quitar este paso">🗑️</button>
              </span>
            </div>
            <input type="text" name="nombre" value="${escaparHtml(p.nombre)}" placeholder="Nombre del paso" aria-label="Nombre del paso" />
            <input type="text" name="hecho" value="${escaparHtml(p.hecho_cuando || '')}" placeholder="Hecho cuando…" aria-label="Hecho cuando" title="El criterio que dice cuándo está hecho" />
            ${p.fase === 'consolidar' ? `<label class="campo" title="Cuántos días antes del examen (un número negativo lo pone después del último examen)"><span class="campo-titulo">📆 Días antes del examen</span><input type="number" name="dias_antes" value="${p.dias_antes ?? 1}" /></label>` : ''}
            ${p.fase === 'habito' ? `<label class="campo" title="El hábito empieza el día siguiente a la primera vez que se hace este paso"><span class="campo-titulo">📆 Empieza después de…</span><select name="despues_de">${candidatos.map((u) => `<option value="${escaparHtml(u.clave)}" ${u.clave === p.despues_de ? 'selected' : ''}>${escaparHtml(u.nombre || '(sin nombre)')}</option>`).join('') || '<option value="">(agregá otro paso antes)</option>'}</select></label>` : ''}
          </li>`
          )
          .join('');
      };

      lista.addEventListener('change', (evento) => {
        if (evento.target.name === 'fase') {
          leerFilas();
          dibujar();
        }
      });
      lista.addEventListener('click', (evento) => {
        const li = evento.target.closest('[data-paso]');
        if (!li) return;
        leerFilas();
        const indice = [...lista.querySelectorAll('[data-paso]')].indexOf(li);
        const mover = evento.target.closest('[data-mover]');
        if (mover) {
          const destino = indice + Number(mover.dataset.mover);
          if (destino >= 0 && destino < pasos.length) [pasos[indice], pasos[destino]] = [pasos[destino], pasos[indice]];
          dibujar();
        } else if (evento.target.closest('[data-quitar]')) {
          pasos.splice(indice, 1);
          dibujar();
        }
      });
      formulario.querySelector('[data-accion="agregar-paso"]').addEventListener('click', () => {
        leerFilas();
        contadorClaves += 1;
        pasos.push({ clave: `paso-${Date.now()}-${contadorClaves}`, fase: 'preparar', nombre: '', duracion_min: 30, hecho_cuando: '' });
        dibujar();
        lista.lastElementChild.querySelector('[name="nombre"]').focus();
      });
      dibujar();
    },
    alGuardar: async (formulario) => {
      pasos = [...formulario.querySelectorAll('[data-paso]')].map((li) => {
        const fase = li.querySelector('[name="fase"]').value;
        const paso = { clave: li.dataset.clave, fase, nombre: li.querySelector('[name="nombre"]').value.trim(), duracion_min: Number(li.querySelector('[name="duracion"]').value) || 0, hecho_cuando: li.querySelector('[name="hecho"]').value.trim() };
        if (fase === 'consolidar') paso.dias_antes = Number(li.querySelector('[name="dias_antes"]').value) || 0;
        if (fase === 'habito') paso.despues_de = li.querySelector('[name="despues_de"]').value;
        return paso;
      });
      const nombre = formulario.plantilla_nombre.value.trim();
      if (!nombre) {
        alert('La plantilla necesita un nombre.');
        return false;
      }
      if (pasos.length === 0) {
        alert('La plantilla necesita al menos un paso.');
        return false;
      }
      const invalido = pasos.find((p) => !p.nombre || p.duracion_min < 5 || (p.fase === 'consolidar' && p.dias_antes === 0) || (p.fase === 'habito' && !pasos.some((o) => o.fase !== 'habito' && o.clave === p.despues_de)));
      if (invalido) {
        alert(`Revisá el paso «${invalido.nombre || 'sin nombre'}»: necesita un nombre y una duración de al menos 5 minutos${invalido.fase === 'consolidar' ? ', y los días antes del examen (distintos de 0)' : invalido.fase === 'habito' ? ' y un paso existente después del cual empieza' : ''}.`);
        return false;
      }
      const existente = id ? estado.plantillas.find((p) => p.plantilla_id === id) : null;
      if (existente) {
        existente.plantilla_nombre = nombre;
        existente.plantilla_pasos = pasos;
      } else {
        estado.plantillas.push(crearPlantilla({ plantilla_nombre: nombre, plantilla_pasos: pasos }));
      }
      await persistirYNotificar();
      return true;
    },
  });
}
