# AGENTS.md

Convenciones para quien (humano o agente de IA) trabaje en este repositorio.

## Idioma

- Documentación, UI y textos visibles: **español castellano**.
- Nombres de campos de datos (JSON), variables y funciones en el código JS: **español castellano**, para minimizar la fricción de traducción cuando el usuario lea o edite el código directamente. Excepción: palabras reservadas/API del navegador (`addEventListener`, `fetch`, etc.) se mantienen en inglés porque son parte del lenguaje/plataforma.
- Campos propios de una entidad siguen el patrón `entidad_atributo` (ej. `Tarea.nombre` → `tarea_nombre`, `Categoria.color` → `categoria_color`), para evitar ambigüedad entre entidades. Los campos que ya son una referencia a otra entidad (`categoria_id`, `ubicacion_id`, `tarea_dependiente`, `meta_id`) quedan sin ese prefijo, porque ya son inequívocos.

## Arquitectura

- Sitio 100% cliente: HTML/CSS/JS vanilla, **sin backend, sin build tools, sin frameworks**. No agregar `npm`, bundlers ni dependencias externas salvo que se discuta explícitamente con el usuario — es una decisión de simplicidad tomada a propósito, no un descuido.
- Persistencia: `assets/js/almacenamiento.js` centraliza el estado en memoria y su guardado en `localStorage` + carpeta local vía File System Access API. Las vistas (`views/*.view.js`) importan `estado` y `persistirYNotificar()` desde ahí; no duplicar lógica de guardado en las vistas.
- Cada vista expone una única función `renderVistaX(contenedor)` que redibuja su contenido en el contenedor recibido. El router en `assets/js/app.js` decide qué vista renderizar según el hash de la URL.

## Estructura de carpetas

- `assets/css/` — estilos.
- `assets/js/` — motor de la app: estado, persistencia, modelos de datos, utilidades, router.
- `views/` — un archivo por vista/pantalla (lógica de UI y eventos de esa vista).
- `datos/` — esquema JSON y datos de ejemplo versionados. Los datos reales del usuario (`categorias.json`, `tareas.json`) nunca se commitean.

## Cómo agregar cosas

- **Nuevo campo al modelo de datos:** actualizarlo en `assets/js/modelos.js` (factory correspondiente), en `datos/esquema.json`, y documentarlo en `DICCIONARIO_DE_DATOS.md` con la fase a la que pertenece.
- **Nueva función o cambio de lógica no trivial:** documentarlo en `LOGICA_FUNCIONES.md` (qué hace, en lenguaje natural). Si afecta el orden/prioridad de las tareas, actualizar también `REGLAS_DE_PRIORIDAD.md`. Si el sistema hace algo solo, sin acción directa del usuario (ej. un desbloqueo en cascada, una migración, un clonado), documentarlo también en `PROCESOS_AUTOMATICOS.md`.
- **Nuevo flujo de usuario, o cambio a uno existente:** actualizar la entrada correspondiente en `CASOS_DE_USO.md` (o agregar una nueva, con el mismo formato objetivo/disparador/pasos/vistas-funciones/resultado/fricciones).
- **Nueva vista:** crear `views/nombre.view.js` exportando `renderVistaNombre(contenedor)`, registrarla en el objeto `VISTAS` de `assets/js/app.js`.
- **Archivo nuevo en `assets/js/` o `views/`:** sumarlo también a `ARCHIVOS_PRECACHE` en `sw.js`, para que la primera carga offline (sin visitas previas) lo incluya.
- **Nueva funcionalidad grande:** primero registrarla como ítem en `BACKLOG.md` bajo la fase que corresponda (ver `SPEC.md` para la definición de fases), salvo que el usuario ya la haya pedido explícitamente para la iteración actual.

## Versionado

- Esquema `vMayor.Menor.Parche` (semver). Cada entrega funcional nueva suma una entrada en `CHANGELOG.md`.
- La versión también se muestra en la cabecera de la app (constante `VERSION` en `assets/js/app.js`) — actualizarla junto con `CHANGELOG.md` en cada entrega.

## Flujo de Git

- **Todo el trabajo de un agente se hace sobre la rama `develop`.** Nunca commitear ni hacer push directo a `main`.
- El merge de `develop` a `main` y el push a `main` solo se hacen cuando el usuario lo confirma explícitamente en la conversación.
- Mensajes de commit: cortos, en español, describiendo el "por qué" del cambio más que el "qué" (el diff ya muestra el qué).

## Antes de dar por terminada una tarea

- Verificar manualmente en el navegador que el flujo afectado funciona (crear/editar/eliminar, filtros, persistencia tras recargar la página).
- Actualizar `BACKLOG.md` (marcar ítems como hechos) y `CHANGELOG.md` cuando se cierre una entrega.
