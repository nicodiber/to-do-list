// Asistente "📚 Nuevo examen": pide los datos del examen (instancias con su fecha, unidades del temario, tiempo de
// estudio), muestra una vista previa editable de la cadena de tareas que genera la plantilla y las crea de una vez.
// La lógica de armado y de fechas está en `plantillas.js`; acá solo está la ventana.

import { estado, persistirYNotificar } from './almacenamiento.js';
import { escaparHtml, arbolCategorias, hoyISO, diaLocal, formatearFecha, tieneHora } from './utilidades.js';
import { ICONOS_IMPORTANCIA, ETIQUETAS_IMPORTANCIA, NIVELES_IMPORTANCIA } from './modelos.js';
import { plantillasDisponibles, planificarExamen, replanificar, crearTareasDeExamen, MAXIMO_CICLOS } from './plantillas.js';
import { htmlDiasHabiles } from './formulario-tarea.js';

let abierto = false;

function htmlOpcionesCategoriaSimple(seleccionada = '') {
  return ['<option value="">Sin categoría</option>', ...arbolCategorias(estado.categorias).map(({ categoria, profundidad }) => `<option value="${categoria.categoria_id}" ${categoria.categoria_id === seleccionada ? 'selected' : ''}>${'　'.repeat(profundidad)}${escaparHtml(categoria.categoria_nombre)}</option>`)].join('');
}

function htmlInstancia(inst, indice, hayVarias) {
  return `
    <fieldset class="seccion-form instancia-examen" data-instancia>
      <legend>🎓 Instancia ${indice + 1}</legend>
      <label class="campo" title="Cómo se llama esta parte del examen (por ejemplo Práctica o Teórica)"><span class="campo-titulo">📝 Nombre</span>
        <input type="text" name="inst_nombre" value="${escaparHtml(inst.nombre)}" list="lista-instancias" autocomplete="off" />
      </label>
      <label class="campo" title="El día del examen y, si querés, la hora"><span class="campo-titulo">📅 Fecha (y hora opcional)</span>
        <span class="par-fecha-hora"><input type="date" name="inst_fecha" value="${escaparHtml(inst.fecha)}" required /><input type="time" name="inst_hora" value="${escaparHtml(inst.hora || '')}" /></span>
      </label>
      <label class="campo ancho-completo" title="Una unidad o tema por línea: por cada una se generan las tareas de leer, resumir y crear las tarjetas"><span class="campo-titulo">📖 Unidades del temario (una por línea; vacío = todo el temario junto)</span>
        <textarea name="inst_unidades" rows="3" placeholder="Unidad 1: Límites&#10;Unidad 2: Derivadas">${escaparHtml(inst.unidades)}</textarea>
      </label>
      <label class="campo" title="Cuántas vueltas de práctica, autoevaluación, diagnóstico y corrección; automático usa las que entran en el tiempo (hasta ${MAXIMO_CICLOS})"><span class="campo-titulo">🔁 Ciclos de práctica</span>
        <select name="inst_ciclos"><option value="auto" ${inst.ciclos === 'auto' ? 'selected' : ''}>Automático (los que entren)</option>${Array.from({ length: MAXIMO_CICLOS + 1 }, (_, n) => `<option value="${n}" ${String(inst.ciclos) === String(n) ? 'selected' : ''}>${n}</option>`).join('')}</select>
      </label>
      ${hayVarias ? '<div class="ancho-completo"><button type="button" data-accion="quitar-instancia" title="Quitar esta instancia">🗑️ Quitar instancia</button></div>' : ''}
    </fieldset>`;
}

function instanciaInicial(tareaExamen) {
  const fecha = tareaExamen ? tareaExamen.tarea_fecha_limite || tareaExamen.tarea_fecha_sugerida || '' : '';
  return {
    nombre: 'Examen',
    fecha: fecha ? diaLocal(fecha) : '',
    hora: tareaExamen && tieneHora(fecha) ? new Date(fecha).toTimeString().slice(0, 5) : '',
    unidades: '',
    ciclos: 'auto',
    tareaExistenteId: tareaExamen && !tareaExamen.tarea_dependiente ? tareaExamen.tarea_id : null,
  };
}

/** Abre el asistente. Con `tareaExamen` (una tarea de tipo examen ya creada) se usa como el hito de la primera instancia. */
export function abrirAsistenteExamen({ tareaExamen = null } = {}) {
  if (abierto) return;
  abierto = true;
  const plantillas = plantillasDisponibles(estado);
  const dialogo = document.createElement('dialog');
  dialogo.className = 'dialogo-tarea dialogo-asistente';
  document.body.appendChild(dialogo);

  let instancias = [instanciaInicial(tareaExamen)];
  let plan = null;
  let configuracion = null;

  const cerrar = () => {
    if (dialogo.open) dialogo.close();
    dialogo.remove();
    abierto = false;
  };
  dialogo.addEventListener('cancel', (evento) => {
    evento.preventDefault();
    if (confirm('¿Cerrar el asistente sin crear nada?')) cerrar();
  });

  function leerInstancias(formulario) {
    return [...formulario.querySelectorAll('[data-instancia]')].map((fs, i) => ({
      nombre: fs.querySelector('[name="inst_nombre"]').value.trim(),
      fecha: fs.querySelector('[name="inst_fecha"]').value,
      hora: fs.querySelector('[name="inst_hora"]').value,
      unidades: fs.querySelector('[name="inst_unidades"]').value,
      ciclos: fs.querySelector('[name="inst_ciclos"]').value === 'auto' ? 'auto' : Number(fs.querySelector('[name="inst_ciclos"]').value),
      tareaExistenteId: (instancias[i] && instancias[i].tareaExistenteId) || null,
    }));
  }

  function pantallaDatos() {
    dialogo.innerHTML = `
      <h3>📚 Nuevo examen</h3>
      <p class="ayuda">Armo la cadena de tareas para prepararlo, empezando lo antes posible y dejando el mayor tiempo para los ciclos de práctica. Antes de crear nada vas a ver una vista previa que podés editar.</p>
      <form class="formulario-tarea formulario-modal" novalidate>
        <div class="fila-nombre-tarea"><input type="text" name="examen" value="${escaparHtml(tareaExamen ? tareaExamen.tarea_nombre : '')}" placeholder="📝 Nombre del examen (por ejemplo la materia)" aria-label="Nombre del examen" required /></div>
        <fieldset class="seccion-form">
          <legend>📋 Datos generales</legend>
          <label class="campo" title="La categoría de todas las tareas que se generen (define su prioridad)"><span class="campo-titulo">🗂️ Categoría</span><select name="categoria_id">${htmlOpcionesCategoriaSimple(tareaExamen ? tareaExamen.categoria_id || '' : '')}</select></label>
          <label class="campo" title="La importancia de todas las tareas que se generen"><span class="campo-titulo">❗ Importancia</span><select name="importancia"><option value="">Sin definir</option>${NIVELES_IMPORTANCIA.map((n) => `<option value="${n}" ${tareaExamen && tareaExamen.tarea_importancia === n ? 'selected' : ''}>${ICONOS_IMPORTANCIA[n]} ${ETIQUETAS_IMPORTANCIA[n]}</option>`).join('')}</select></label>
          <label class="campo ancho-completo" title="Los pasos que se generan; las tuyas se editan en Configuraciones"><span class="campo-titulo">📋 Plantilla</span><select name="plantilla">${plantillas.map((p) => `<option value="${p.plantilla_id}">${escaparHtml(p.plantilla_nombre)}</option>`).join('')}</select></label>
        </fieldset>
        <datalist id="lista-instancias"><option value="Práctica"></option><option value="Teórica"></option><option value="Parcial"></option><option value="Final"></option></datalist>
        <div class="instancias-examen">${instancias.map((inst, i) => htmlInstancia(inst, i, instancias.length > 1)).join('')}</div>
        <div class="ancho-completo"><button type="button" data-accion="agregar-instancia" title="Si el examen tiene más de una parte (por ejemplo práctica y después teórica)">➕ Agregar instancia</button></div>
        <fieldset class="seccion-form">
          <legend>⏱️ Tiempo y material</legend>
          <label class="campo" title="Cuántos minutos por día dedicás a estudiar (después se va a leer de tu Calendar)"><span class="campo-titulo">⏱️ Minutos de estudio por día</span><input type="number" name="minutos" min="15" step="15" value="120" /></label>
          <label class="campo" title="Desde qué día se empieza a planificar"><span class="campo-titulo">📅 Empezar desde</span><input type="date" name="desde" value="${hoyISO()}" /></label>
          <div class="campo ancho-completo" title="Los días de la semana en que estudiás; sin marcar, todos"><span class="campo-titulo">🗓️ Días de estudio (sin marcar = todos)</span>${htmlDiasHabiles([])}</div>
          <label class="campo ancho-completo" title="Se agrega a las tareas de crear, repasar y corregir tarjetas"><span class="campo-titulo">🔗 Enlace de RemNote (opcional)</span><input type="text" name="remnote" placeholder="https://www.remnote.com/…" /></label>
        </fieldset>
        <div class="acciones-modal">
          <button type="submit" class="boton-primario" title="Ver las tareas que se van a crear, con sus fechas">👁️ Vista previa</button>
          <button type="button" data-accion="cancelar-asistente" title="Cerrar sin crear nada">↩️ Cancelar</button>
        </div>
      </form>`;
    const formulario = dialogo.querySelector('form');
    dialogo.querySelector('[data-accion="cancelar-asistente"]').addEventListener('click', () => {
      if (confirm('¿Cerrar el asistente sin crear nada?')) cerrar();
    });
    // Agregar o quitar una instancia vuelve a dibujar la pantalla; lo demás que se escribió se conserva.
    const conservarYRedibujar = (cambiarInstancias) => {
      instancias = leerInstancias(formulario);
      const datos = new FormData(formulario);
      const previos = { examen: datos.get('examen'), minutos: datos.get('minutos'), desde: datos.get('desde'), remnote: datos.get('remnote'), categoria: datos.get('categoria_id'), importancia: datos.get('importancia'), plantilla: datos.get('plantilla'), dias: datos.getAll('tarea_dias_habiles') };
      cambiarInstancias();
      pantallaDatos();
      const nuevo = dialogo.querySelector('form');
      nuevo.examen.value = previos.examen;
      nuevo.minutos.value = previos.minutos;
      nuevo.desde.value = previos.desde;
      nuevo.remnote.value = previos.remnote;
      nuevo.categoria_id.value = previos.categoria;
      nuevo.importancia.value = previos.importancia;
      nuevo.plantilla.value = previos.plantilla;
      nuevo.querySelectorAll('input[name="tarea_dias_habiles"]').forEach((c) => (c.checked = previos.dias.includes(c.value)));
    };
    dialogo.querySelector('[data-accion="agregar-instancia"]').addEventListener('click', () => {
      conservarYRedibujar(() => instancias.push({ nombre: '', fecha: '', hora: '', unidades: '', ciclos: 'auto', tareaExistenteId: null }));
      const nombres = dialogo.querySelectorAll('[data-instancia] [name="inst_nombre"]');
      nombres[nombres.length - 1].focus();
    });
    formulario.addEventListener('click', (evento) => {
      const quitar = evento.target.closest('[data-accion="quitar-instancia"]');
      if (!quitar) return;
      const indice = [...formulario.querySelectorAll('[data-instancia]')].indexOf(quitar.closest('[data-instancia]'));
      conservarYRedibujar(() => instancias.splice(indice, 1));
    });
    formulario.addEventListener('submit', (evento) => {
      evento.preventDefault();
      const datos = new FormData(formulario);
      const examen = String(datos.get('examen') || '').trim();
      if (!examen) {
        alert('El examen necesita un nombre.');
        return;
      }
      instancias = leerInstancias(formulario);
      const varias = instancias.length > 1;
      const nombres = new Set();
      for (const inst of instancias) {
        if (!inst.fecha) {
          alert('Cada instancia necesita su fecha.');
          return;
        }
        if (varias && !inst.nombre) {
          alert('Cuando hay más de una instancia, cada una necesita un nombre (por ejemplo Práctica y Teórica).');
          return;
        }
        if (varias && nombres.has(inst.nombre)) {
          alert('Los nombres de las instancias tienen que ser distintos.');
          return;
        }
        nombres.add(inst.nombre);
      }
      const ordenadas = instancias.map((i) => i.fecha);
      if (ordenadas.some((f, i) => i > 0 && f < ordenadas[i - 1])) {
        alert('Poné las instancias en el orden de sus fechas: la cadena las recorre una detrás de otra.');
        return;
      }
      const desde = datos.get('desde') || hoyISO();
      if (ordenadas[0] <= desde) {
        alert('La fecha del primer examen tiene que ser posterior al día en que empezás a estudiar.');
        return;
      }
      configuracion = {
        examen,
        categoriaId: datos.get('categoria_id') || null,
        importancia: datos.get('importancia') || null,
        plantillaId: datos.get('plantilla'),
        enlaceRemNote: String(datos.get('remnote') || '').trim(),
        opciones: { desde, minutosPorDia: Number(datos.get('minutos')) || 120, diasDeEstudio: datos.getAll('tarea_dias_habiles').map(Number) },
        instancias: instancias.map((inst) => ({
          nombre: inst.nombre || 'Examen',
          fecha: inst.hora ? new Date(`${inst.fecha}T${inst.hora}`).toISOString() : inst.fecha,
          unidades: inst.unidades.split('\n').map((u) => u.trim()).filter(Boolean),
          ciclos: inst.ciclos,
          tareaExistenteId: inst.tareaExistenteId,
        })),
      };
      const plantilla = plantillas.find((p) => p.plantilla_id === configuracion.plantillaId) || plantillas[0];
      plan = planificarExamen(plantilla, { examen, instancias: configuracion.instancias, ...configuracion.opciones });
      pantallaVistaPrevia();
    });
  }

  /** Un aviso por instancia (el más grande) cuando no alcanza el tiempo. */
  function avisosAgrupados() {
    const porInstancia = new Map();
    plan.avisos.forEach((a) => porInstancia.set(a.instancia, Math.max(porInstancia.get(a.instancia) || 0, a.dias)));
    return [...porInstancia.entries()];
  }

  function pantallaVistaPrevia() {
    const avisos = avisosAgrupados();
    dialogo.innerHTML = `
      <h3>👁️ Vista previa: ${escaparHtml(configuracion.examen)}</h3>
      <p class="ayuda">Revisá las tareas. Podés renombrarlas, cambiarles la duración, moverlas o quitarlas; las fechas se recalculan solas. Ciclos de práctica: ${plan.ciclos.join(' · ')}.</p>
      ${avisos.map(([inst, dias]) => `<p class="aviso-bloqueada">⚠️ En «${escaparHtml(inst)}» no alcanza el tiempo: faltan ${dias} día${dias === 1 ? '' : 's'}. Probá con más minutos por día, menos ciclos o empezando antes.</p>`).join('')}
      <ol class="vista-previa-examen"></ol>
      <h4>📆 Hábito diario</h4>
      <ul class="vista-previa-habitos">${plan.habitos.filter((h) => h.fecha).map((h) => `<li>${escaparHtml(h.nombre)} <span class="etiqueta-fecha">todos los días desde ${formatearFecha(h.fecha)} hasta el examen (${h.duracion_min} min)</span></li>`).join('') || '<li class="mensaje-vacio">Esta plantilla no genera hábito diario.</li>'}</ul>
      <div class="acciones-modal">
        <button type="button" class="boton-primario" data-accion="crear-examen" title="Crear las tareas y el hábito">✅ Crear ${plan.pasos.length} tareas${plan.habitos.length ? ` y ${plan.habitos.length} hábito` : ''}</button>
        <button type="button" data-accion="volver-datos" title="Volver a los datos del examen">↩️ Volver</button>
      </div>`;
    const lista = dialogo.querySelector('.vista-previa-examen');
    plan.pasos.forEach((paso, i) => {
      const li = document.createElement('li');
      li.className = 'item-vista-previa' + (paso.hito ? ' hito' : '');
      li.innerHTML = `
        <span class="fecha-vista-previa">${formatearFecha(paso.fecha)}</span>
        ${paso.hito ? `<strong class="nombre-vista-previa">🎓 ${escaparHtml(paso.nombre)}</strong>` : `<input type="text" class="nombre-vista-previa" value="${escaparHtml(paso.nombre)}" aria-label="Nombre de la tarea" />`}
        ${paso.hito ? '' : `<input type="number" class="duracion-vista-previa" min="5" step="5" value="${paso.duracion_min}" aria-label="Duración en minutos" title="Minutos" /><span class="ayuda">min</span>`}
        <span class="acciones-vista-previa">
          ${paso.hito || paso.ancla ? '' : `<button type="button" data-mover="-1" title="Subir esta tarea" ${i === 0 ? 'disabled' : ''}>↑</button><button type="button" data-mover="1" title="Bajar esta tarea">↓</button>`}
          ${paso.hito ? '' : '<button type="button" data-quitar title="Quitar esta tarea">🗑️</button>'}
        </span>`;
      lista.appendChild(li);
      const nombre = li.querySelector('input.nombre-vista-previa');
      if (nombre) nombre.addEventListener('input', () => (paso.nombre = nombre.value));
      const duracion = li.querySelector('.duracion-vista-previa');
      if (duracion) {
        duracion.addEventListener('change', () => {
          paso.duracion_min = Math.max(5, Number(duracion.value) || paso.duracion_min);
          recalcular();
        });
      }
      li.querySelectorAll('[data-mover]').forEach((boton) =>
        boton.addEventListener('click', () => {
          const destino = i + Number(boton.dataset.mover);
          const vecino = plan.pasos[destino];
          if (!vecino || vecino.hito || vecino.ancla) return;
          [plan.pasos[i], plan.pasos[destino]] = [plan.pasos[destino], plan.pasos[i]];
          recalcular(true);
        })
      );
      const quitar = li.querySelector('[data-quitar]');
      if (quitar) {
        quitar.addEventListener('click', () => {
          plan.pasos.splice(i, 1);
          recalcular(true);
        });
      }
    });

    function recalcular(redibujar = false) {
      plan.avisos = replanificar(plan.pasos, configuracion.opciones);
      plan.habitos.forEach((h) => {
        const primera = plan.pasos.find((p) => p.clave === h.despues_de);
        h.fecha = primera ? diaSiguiente(primera.fecha) : '';
      });
      if (redibujar) {
        pantallaVistaPrevia();
        return;
      }
      lista.querySelectorAll('.fecha-vista-previa').forEach((celda, k) => (celda.textContent = formatearFecha(plan.pasos[k].fecha)));
    }

    dialogo.querySelector('[data-accion="volver-datos"]').addEventListener('click', pantallaDatos);
    dialogo.querySelector('[data-accion="crear-examen"]').addEventListener('click', async () => {
      if (plan.pasos.filter((p) => p.hito).length === 0) {
        alert('No puede quedar un plan sin la tarea de rendir el examen.');
        return;
      }
      const creado = crearTareasDeExamen(estado, plan, { categoriaId: configuracion.categoriaId, importancia: configuracion.importancia, enlaceRemNote: configuracion.enlaceRemNote });
      await persistirYNotificar();
      cerrar();
      alert(`Se crearon ${creado.tareas.length} tarea${creado.tareas.length === 1 ? '' : 's'}${creado.habitos.length ? ` y ${creado.habitos.length} hábito diario` : ''}. Están encadenadas: solo la primera queda pendiente y las demás se van habilitando a medida que las cumplís. Las ves en Tareas, en el Gantt y, día a día, en Hoy.`);
    });
  }

  pantallaDatos();
  dialogo.showModal();
  dialogo.querySelector('form').examen.focus();
}

function diaSiguiente(fecha) {
  const d = new Date(`${fecha}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
