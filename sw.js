const CACHE_NAME = 'super-todo-list-v23';

// Archivos del app shell para que la primera carga offline (sin visitas
// previas) también funcione. Si agregás un archivo assets/js/*.js o
// views/*.js nuevo, sumalo también acá (ver AGENTS.md).
const ARCHIVOS_PRECACHE = [
  '.',
  'index.html',
  'manifest.json',
  'assets/css/main.css',
  'assets/icons/icon.svg',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/icons/icon-maskable-512.png',
  'assets/icons/apple-touch-icon.png',
  'assets/js/app.js',
  'assets/js/almacenamiento.js',
  'assets/js/modelos.js',
  'assets/js/utilidades.js',
  'assets/js/reprogramar.js',
  'assets/js/tareas-logica.js',
  'assets/js/revision-dia.js',
  'assets/js/exportar-calendar.js',
  'assets/js/clima.js',
  'assets/js/vista-agenda.js',
  'assets/js/ia-conectable.js',
  'assets/js/google-calendar.js',
  'assets/js/google-auth.js',
  'assets/js/google-drive-sync.js',
  'assets/js/sincronizacion.js',
  'assets/js/almacenamiento-local.js',
  'assets/js/borradores.js',
  'assets/js/dependencias.js',
  'assets/js/formulario-tarea.js',
  'assets/js/modal-tarea.js',
  'assets/js/carga-tareas.js',
  'assets/js/dialogo-formulario.js',
  'assets/js/formularios-entidades.js',
  'assets/js/ubicacion-actual.js',
  'assets/js/preferencias-horario.js',
  'assets/js/checklist-tarjeta.js',
  'assets/js/atajos.js',
  'assets/js/preferencias.js',
  'assets/js/capacidad.js',
  'assets/js/habitos.js',
  'assets/js/gantt-modelo.js',
  'assets/js/progreso-categorias.js',
  'views/hoy.view.js',
  'views/agenda.view.js',
  'views/semana.view.js',
  'views/tareas.view.js',
  'views/tabla.view.js',
  'views/categorias.view.js',
  'views/ubicaciones.view.js',
  'views/metas.view.js',
  'views/gantt.view.js',
  'views/personas.view.js',
  'views/estadisticas.view.js',
  'views/habitos.view.js',
  'views/progreso.view.js',
  'views/mejoras.view.js',
  'views/configuraciones.view.js',
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(ARCHIVOS_PRECACHE.map((url) => new Request(url, { cache: 'reload' }))))
      .catch((error) => console.warn('No se pudo precachear todo el app shell:', error))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((claves) => Promise.all(claves.filter((clave) => clave !== CACHE_NAME).map((clave) => caches.delete(clave))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (evento) => {
  if (evento.request.method !== 'GET') return;

  const url = new URL(evento.request.url);
  if (url.origin !== self.location.origin) return;

  evento.respondWith(
    fetch(evento.request, { cache: 'reload' })
      .then((respuesta) => {
        if (respuesta.ok) {
          const copia = respuesta.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(evento.request, copia));
        }
        return respuesta;
      })
      .catch(() => caches.match(evento.request))
  );
});
