// service-worker.js
const CACHE_NAME = 'sim-pwa-v20';
const urlsToCache = [
  '/',
  '/index.html',
  '/style.css',
  '/manifest.json',
  '/js/main.js',
  '/js/ui.js',
  '/js/codeEditor.js',
  '/js/config.js',
  '/js/lapTimer.js',
  '/js/monaco-setup.js',
  '/js/pidController.js',
  '/js/robot.js',
  '/js/robotEditor.js',
  '/js/robotParts.js',
  '/js/simulation.js',
  '/js/track.js',
  '/js/trackEditor.js',
  '/js/utils.js',
  '/assets/Logo%20guaroduino.png',
  '/assets/robots/Codigo_Ejemplo.txt'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.filter(name => name !== CACHE_NAME).map(name => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Network-First strategy
self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});
