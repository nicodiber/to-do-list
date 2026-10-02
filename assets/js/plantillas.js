// Plantillas de cadenas (v0.99.0): un procedimiento típico guardado como grupo de tareas encadenadas. Se crea una vez
// (desde cero o a partir de una cadena que ya existe) y después se usa pidiendo solo la categoría y la fecha límite
// final: crea todas las tareas ya enlazadas, con sus atributos y con la hora sugerida asignada.

import { estado, persistirYNotificar } from './almacenamiento.js';
import { crearTarea, crearPlantilla, crearPasoPlantilla } from './modelos.js';
import { recalcularBloqueo } from './dependencias.js';
import { programarTareasSinFecha } from './programador.js';
import { abrirDialogoFormulario, conectarCrearNueva, activarMayusculaInicial } from './dialogo-formulario.js';
import { htmlOpcionesCategoria } from './formulario-tarea.js';
import { abrirDialogoCategoria } from './formularios-entidades.js';
import { capitalizarPrimera, diaLocal, fechaLocalISO, hoyISO } from './utilidades.js';
import { avisar, confirmar } from './avisos.js';

const MS_POR_DIA = 24 * 60 * 60 * 1000;

/** Resta `dias` a una fecha `AAAA-MM-DD`. */
function restarDias(fechaISO, dias) {
  const [a, m, d] = fechaISO.split('-').map(Number);
  return fechaLocalISO(new Date(a, m - 1, d - dias));
}

/** Días enteros de `desde` a `hasta` (ambas `AAAA-MM-DD`). */
function diasEntre(desde, hasta) {
  return Math.round((new Date(`${hasta}T00:00`) - new Date(`${desde}T00:00`)) / MS_POR_DIA);
}

/** La cadena completa de una tarea (sin tareas completadas), de la primera a la última. */
export function cadenaDeLaTarea(tarea, listaTareas = estado.tareas) {
  const activa = (t) => t && t.tarea_estado !== 'completada';
  let primera = tarea;
  const visitadas = new Set([tarea.tarea_id]);
  for (;;) {
    const previa = primera.tarea_dependiente ? listaTareas.find((t) => t.tarea_id === primera.tarea_dependiente) : null;
    if (!activa(previa) || visitadas.has(previa.tarea_id)) break;
    visitadas.add(previa.tarea_id);
    primera = previa;
  }
  const cadena = [primera];
  for (;;) {
    const ultima = cadena[cadena.length - 1];
    const proxima = listaTareas.find((t) => t.tarea_dependiente === ultima.tarea_id && activa(t));
    if (!proxima || cadena.includes(proxima)) break;
    cadena.push(proxima);
  }
  return cadena;
}

/** Pasos de plantilla a partir de una cadena: los días antes se miden contra la fecha límite de la última tarea. */
function pasosDesdeCadena(cadena) {
  const limiteFinal = diaLocal(cadena[cadena.length - 1].tarea_fecha_limite);
  return cadena.map((t) => {
    const limite = diaLocal(t.tarea_fecha_limite);
    return crearPasoPlantilla({
      paso_nombre: t.tarea_nombre,
      paso_duracion_min: t.tarea_duracion_min,
      paso_descripcion: t.tarea_descripcion,
      paso_dias_antes: limiteFinal && limite ? Math.max(0, diasEntre(limite, limiteFinal)) : 0,
      paso_dias_habiles: [...(t.tarea_dias_habiles || [])],
      paso_costo_estimado: t.tarea_costo_estimado,
      paso_disfrute: t.tarea_disfrute,
      paso_requiere_clima_bueno: t.tarea_requiere_clima_bueno,
      paso_urgente: t.tarea_urgente,
    });
  });
}

/** Ofrece guardar la cadena de `tarea` como plantilla: abre el editor con los pasos ya cargados para ponerle nombre. */
export async function abrirGuardarCadenaComoPlantilla(tarea) {
  const cadena = cadenaDeLaTarea(tarea);
  if (cadena.length < 2) {
    await avisar('Esta tarea no está encadenada con otras: una plantilla necesita al menos dos pasos.');
    return;
  }
  abrirEditorPlantilla({ borrador: { plantilla_nombre: '', plantilla_descripcion: '', plantilla_pasos: pasosDesdeCadena(cadena) } });
}

// ---------------------------------------------------------------------------
// Lista de plantillas
// ---------------------------------------------------------------------------

let listaAbierta = false;

export function abrirListaPlantillas() {
  if (listaAbierta) return;
  listaAbierta = true;
  const dialogo = abrirDialogoFormulario({
    titulo: '📋 Plantillas de cadenas',
    cuerpoHtml: '<div class="lista-plantillas"></div>',
    textoGuardar: '✔️ Cerrar',
    conectar: (formulario) => dibujarLista(formulario, () => dialogo),
    alGuardar: () => true,
    alCerrar: () => {
      listaAbierta = false;
    },
  });
}

function dibujarLista(formulario, obtenerDialogo) {
  const contenedor = formulario.querySelector('.lista-plantillas');
  contenedor.innerHTML = '';
  const nueva = document.createElement('button');
  nueva.type = 'button';
  nueva.className = 'boton-primario';
  nueva.textContent = '＋ Nueva plantilla';
  nueva.addEventListener('click', () => reabrirDespues(obtenerDialogo, (opciones) => abrirEditorPlantilla(opciones)));
  contenedor.appendChild(nueva);

  if (estado.plantillas.length === 0) {
    const vacio = document.createElement('p');
    vacio.className = 'ayuda';
    vacio.textContent =
      'Todavía no hay plantillas. Creá una desde cero o, más rápido, armá una cadena de tareas una vez y usá "📋 Guardar cadena como plantilla" en la tarjeta de cualquiera de sus tareas.';
    contenedor.appendChild(vacio);
    return;
  }
  const lista = document.createElement('ul');
  lista.className = 'lista-plantillas-items';
  estado.plantillas
    .slice()
    .sort((a, b) => a.plantilla_nombre.localeCompare(b.plantilla_nombre, 'es'))
    .forEach((plantilla) => {
      const li = document.createElement('li');
      li.className = 'item-plantilla';
      const info = document.createElement('div');
      info.className = 'item-plantilla-info';
      const titulo = document.createElement('strong');
      titulo.textContent = plantilla.plantilla_nombre;
      const detalle = document.createElement('span');
      detalle.className = 'ayuda';
      detalle.textContent = `${plantilla.plantilla_pasos.length} pasos: ${plantilla.plantilla_pasos.map((p) => p.paso_nombre).join(' → ')}`;
      info.append(titulo, detalle);
      li.appendChild(info);
      const acciones = document.createElement('div');
      acciones.className = 'item-plantilla-acciones';
      [
        ['▶️ Usar', 'Crear las tareas de esta plantilla', () => reabrirDespues(obtenerDialogo, (opciones) => abrirUsoPlantilla(plantilla, opciones)), 'boton-primario'],
        ['✏️ Editar', 'Editar los pasos de la plantilla', () => reabrirDespues(obtenerDialogo, (opciones) => abrirEditorPlantilla({ plantilla, ...opciones })), ''],
        [
          '🗑️ Eliminar',
          'Eliminar la plantilla (las tareas ya creadas con ella no se tocan)',
          async () => {
            if (!await confirmar(`¿Eliminar la plantilla «${plantilla.plantilla_nombre}»? Las tareas ya creadas con ella no se tocan.`, { peligro: true, textoAceptar: 'Eliminar' })) return;
            estado.plantillas = estado.plantillas.filter((p) => p.plantilla_id !== plantilla.plantilla_id);
            await persistirYNotificar();
            dibujarLista(formulario, obtenerDialogo);
          },
          '',
        ],
      ].forEach(([texto, ayuda, alClic, clase]) => {
        const boton = document.createElement('button');
        boton.type = 'button';
        boton.className = clase;
        boton.textContent = texto;
        boton.title = ayuda;
        boton.addEventListener('click', alClic);
        acciones.appendChild(boton);
      });
      li.appendChild(acciones);
      lista.appendChild(li);
    });
  contenedor.appendChild(lista);
}

/** Cierra la lista, abre otro diálogo y, cuando ese se cierra, vuelve a abrir la lista (ya actualizada). */
function reabrirDespues(obtenerDialogo, abrir) {
  obtenerDialogo().cerrarYLimpiar();
  abrir({ alVolver: abrirListaPlantillas });
}

// ---------------------------------------------------------------------------
// Editor de plantilla
// ---------------------------------------------------------------------------

let editorAbierto = false;

/**
 * Crea (sin `plantilla` ni `borrador`), edita (`plantilla`) o termina de armar (`borrador`, por ejemplo con los pasos
 * sacados de una cadena) una plantilla. `alVolver` se llama al cerrar el editor (la lista de plantillas lo usa).
 */
export function abrirEditorPlantilla({ plantilla = null, borrador = null, alVolver = () => {} } = {}) {
  if (editorAbierto) return;
  editorAbierto = true;
  const origen = plantilla || borrador || { plantilla_nombre: '', plantilla_descripcion: '', plantilla_pasos: [crearPasoPlantilla({ paso_nombre: '' }), crearPasoPlantilla({ paso_nombre: '' })] };

  abrirDialogoFormulario({
    titulo: plantilla ? '✏️ Editar plantilla' : '📋 Nueva plantilla',
    cuerpoHtml: `
      <label class="campo"><span class="campo-titulo">📋 Nombre de la plantilla</span><input type="text" name="plantilla_nombre" maxlength="80" placeholder="Ej.: Tramitar el pasaporte" /></label>
      <label class="campo"><span class="campo-titulo">📝 Descripción (opcional)</span><input type="text" name="plantilla_descripcion" /></label>
      <p class="ayuda">Los pasos van en el orden en que se hacen: el primero se hace primero y el último es la tarea objetivo (la que lleva la fecha límite final al usar la plantilla). «Días antes» es cuántos días antes de esa fecha final tiene que estar listo cada paso.</p>
      <ol class="pasos-plantilla"></ol>
      <button type="button" data-accion="agregar-paso">＋ Agregar paso</button>
    `,
    textoGuardar: plantilla ? '💾 Guardar cambios' : '💾 Guardar plantilla',
    conectar: (formulario) => {
      formulario.plantilla_nombre.value = origen.plantilla_nombre;
      formulario.plantilla_descripcion.value = origen.plantilla_descripcion || '';
      activarMayusculaInicial(formulario.plantilla_nombre);
      const lista = formulario.querySelector('.pasos-plantilla');
      origen.plantilla_pasos.forEach((paso) => lista.appendChild(filaPaso(lista, paso)));
      numerarPasos(lista);
      formulario.querySelector('[data-accion="agregar-paso"]').addEventListener('click', () => {
        const fila = filaPaso(lista, crearPasoPlantilla({ paso_nombre: '' }));
        lista.appendChild(fila);
        numerarPasos(lista);
        fila.querySelector('[name="paso_nombre"]').focus();
      });
    },
    alCerrar: () => {
      editorAbierto = false;
      alVolver();
    },
    alGuardar: async (formulario) => {
      const nombre = formulario.plantilla_nombre.value.trim();
      if (!nombre) {
        await avisar('La plantilla necesita un nombre.');
        return false;
      }
      const filas = [...formulario.querySelectorAll('.pasos-plantilla > li')];
      if (filas.length < 2) {
        await avisar('Una plantilla necesita al menos dos pasos encadenados.');
        return false;
      }
      const pasos = [];
      for (const fila of filas) {
        const paso_nombre = fila.querySelector('[name="paso_nombre"]').value.trim();
        if (!paso_nombre) {
          await avisar('Todos los pasos necesitan un nombre (o quitá el paso vacío).');
          return false;
        }
        pasos.push(
          crearPasoPlantilla({
            ...fila._paso,
            paso_nombre,
            paso_duracion_min: Math.max(5, Number(fila.querySelector('[name="paso_duracion_min"]').value) || 15),
            paso_dias_antes: Math.max(0, Math.round(Number(fila.querySelector('[name="paso_dias_antes"]').value) || 0)),
            paso_descripcion: fila.querySelector('[name="paso_descripcion"]').value.trim(),
          })
        );
      }
      const descripcion = formulario.plantilla_descripcion.value.trim();
      if (plantilla) {
        plantilla.plantilla_nombre = capitalizarPrimera(nombre);
        plantilla.plantilla_descripcion = descripcion;
        plantilla.plantilla_pasos = pasos;
      } else {
        estado.plantillas.push(crearPlantilla({ plantilla_nombre: nombre, plantilla_descripcion: descripcion, plantilla_pasos: pasos }));
      }
      await persistirYNotificar();
      return true;
    },
  });
}

function filaPaso(lista, paso) {
  const fila = document.createElement('li');
  fila.className = 'paso-plantilla';
  fila._paso = paso;
  fila.innerHTML = `
    <span class="paso-plantilla-numero"></span>
    <input type="text" name="paso_nombre" placeholder="Nombre del paso" />
    <label title="Duración de la tarea">⏱️ <input type="number" name="paso_duracion_min" min="5" step="5" /> min</label>
    <label title="Cuántos días antes de la fecha límite final tiene que estar listo este paso">📆 <input type="number" name="paso_dias_antes" min="0" step="1" /> días antes</label>
    <input type="text" name="paso_descripcion" placeholder="Descripción (opcional)" />
    <span class="paso-plantilla-acciones">
      <button type="button" data-accion="subir" title="Subir el paso">▲</button>
      <button type="button" data-accion="bajar" title="Bajar el paso">▼</button>
      <button type="button" data-accion="quitar" title="Quitar el paso">🗑️</button>
    </span>
  `;
  fila.querySelector('[name="paso_nombre"]').value = paso.paso_nombre;
  activarMayusculaInicial(fila.querySelector('[name="paso_nombre"]'));
  fila.querySelector('[name="paso_duracion_min"]').value = paso.paso_duracion_min;
  fila.querySelector('[name="paso_dias_antes"]').value = paso.paso_dias_antes;
  fila.querySelector('[name="paso_descripcion"]').value = paso.paso_descripcion || '';
  fila.querySelector('[data-accion="subir"]').addEventListener('click', () => {
    if (fila.previousElementSibling) lista.insertBefore(fila, fila.previousElementSibling);
    numerarPasos(lista);
  });
  fila.querySelector('[data-accion="bajar"]').addEventListener('click', () => {
    if (fila.nextElementSibling) lista.insertBefore(fila.nextElementSibling, fila);
    numerarPasos(lista);
  });
  fila.querySelector('[data-accion="quitar"]').addEventListener('click', () => {
    fila.remove();
    numerarPasos(lista);
  });
  return fila;
}

function numerarPasos(lista) {
  [...lista.children].forEach((fila, indice) => {
    fila.querySelector('.paso-plantilla-numero').textContent = `${indice + 1}.`;
  });
}

// ---------------------------------------------------------------------------
// Usar una plantilla
// ---------------------------------------------------------------------------

let usoAbierto = false;

/** Pide categoría y fecha límite final, y crea las tareas encadenadas de la plantilla (un solo paso de deshacer). */
export function abrirUsoPlantilla(plantilla, { alVolver = () => {} } = {}) {
  if (usoAbierto) return;
  usoAbierto = true;
  const pasos = plantilla.plantilla_pasos;

  abrirDialogoFormulario({
    titulo: `▶️ Usar «${plantilla.plantilla_nombre}»`,
    cuerpoHtml: `
      <p class="ayuda">Se van a crear ${pasos.length} tareas encadenadas, en el orden de la plantilla.</p>
      <label class="campo"><span class="campo-titulo">🗂️ Categoría (para todas las tareas)</span><select name="categoria_id">${htmlOpcionesCategoria('')}</select></label>
      <label class="campo"><span class="campo-titulo">⏳ Fecha límite final</span><input type="date" name="fecha_final" title="Fecha en la que tiene que estar hecho el último paso" /></label>
      <label class="campo"><span class="campo-titulo">🚦 Habilitada desde (opcional)</span><input type="date" name="fecha_desde" title="Desde cuándo se puede empezar el primer paso" /></label>
      <ol class="vista-previa-plantilla"></ol>
    `,
    textoGuardar: '✅ Crear tareas',
    conectar: (formulario) => {
      conectarCrearNueva(formulario.categoria_id, htmlOpcionesCategoria, abrirDialogoCategoria, (nueva) => nueva.categoria_id);
      const previa = formulario.querySelector('.vista-previa-plantilla');
      const dibujarPrevia = () => {
        previa.innerHTML = '';
        pasos.forEach((paso, indice) => {
          const li = document.createElement('li');
          const limite = formulario.fecha_final.value ? restarDias(formulario.fecha_final.value, paso.paso_dias_antes) : '';
          li.textContent = `${paso.paso_nombre}${limite ? ` — límite ${limite.split('-').reverse().join('/')}` : ''}`;
          if (indice === 0) li.title = 'Primer paso';
          previa.appendChild(li);
        });
      };
      formulario.fecha_final.addEventListener('input', dibujarPrevia);
      dibujarPrevia();
      formulario.fecha_final.focus();
    },
    alCerrar: () => {
      usoAbierto = false;
      alVolver();
    },
    alGuardar: async (formulario) => {
      const final = formulario.fecha_final.value;
      const desde = formulario.fecha_desde.value;
      if (!final && !await confirmar('No elegiste una fecha límite final: las tareas quedan sin fecha límite (se agendan igual, según su prioridad). ¿Crearlas así?')) return false;
      const limites = pasos.map((paso) => (final ? restarDias(final, paso.paso_dias_antes) : ''));
      if (limites.some((limite) => limite && limite < hoyISO()) && !await confirmar('Algunos pasos quedarían con fecha límite en el pasado (según los «días antes» de la plantilla). ¿Crearlos igual?')) return false;

      const categoria_id = formulario.categoria_id.value || null;
      let previaId = null;
      const creadas = pasos.map((paso, indice) => {
        const tarea = crearTarea({
          tarea_nombre: paso.paso_nombre,
          categoria_id,
          tarea_duracion_min: paso.paso_duracion_min,
          tarea_descripcion: paso.paso_descripcion,
          tarea_fecha_limite: limites[indice],
          tarea_fecha_inicio_habilitada: desde,
          tarea_dias_habiles: [...paso.paso_dias_habiles],
          tarea_costo_estimado: paso.paso_costo_estimado,
          tarea_disfrute: paso.paso_disfrute,
          tarea_requiere_clima_bueno: paso.paso_requiere_clima_bueno,
          tarea_urgente: paso.paso_urgente,
          tarea_dependiente: previaId,
        });
        previaId = tarea.tarea_id;
        return tarea;
      });
      creadas.forEach((tarea, indice) => {
        estado.tareas.push(tarea);
        recalcularBloqueo(tarea, estado.tareas);
        // Una bloqueada hereda la fecha "desde" de su previa si no se eligió una: no puede empezar antes que ella.
        if (indice > 0 && !desde) tarea.tarea_fecha_inicio_habilitada = creadas[indice - 1].tarea_fecha_inicio_habilitada;
      });
      await programarTareasSinFecha(estado);
      await persistirYNotificar();
      return true;
    },
  });
}
