const CACHE_NAME = 'myplanner-v1';
const CACHE_PREFIX = 'myplanner-';

const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './mobile.html',
    './checklist.html',
    './calendar.html',
    './events.html',
    './stats.html',
    './timer.html',
    './app.js',
    './db.js',
    './algorithm.js',
    './styles-desktop.css',
    './styles-mobile.css',
    './styles-pages.css',
    './manifest.json',
    './img/MyPlanner.png'
];

// Install: cache tutti gli asset
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Caching assets...');
                return cache.addAll(ASSETS_TO_CACHE);
            })
            .then(() => {
                console.log('[SW] Assets cached, activating immediately');
                return self.skipWaiting();
            })
            .catch((error) => {
                console.error('[SW] Cache failed:', error);
            })
    );
});

// Activate: elimina SOLO le cache vecchie di questa app
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        // Elimina solo cache che iniziano con 'myplanner-' ma non quella attuale
                        if (cacheName.startsWith(CACHE_PREFIX) && cacheName !== CACHE_NAME) {
                            console.log('[SW] Deleting old cache:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .then(() => {
                console.log('[SW] Activated, taking control');
                return self.clients.claim();
            })
    );
});

// Fetch: Network first, fallback to cache
self.addEventListener('fetch', (event) => {
    // Skip non-GET requests
    if (event.request.method !== 'GET') return;
    
    // Skip chrome-extension and other non-http requests
    if (!event.request.url.startsWith('http')) return;

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // Se la risposta è ok, aggiorna la cache
                if (response.ok) {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME)
                        .then((cache) => {
                            cache.put(event.request, responseClone);
                        });
                }
                return response;
            })
            .catch(() => {
                // Offline: prova dalla cache
                return caches.match(event.request)
                    .then((cachedResponse) => {
                        if (cachedResponse) {
                            return cachedResponse;
                        }
                        // Se è una pagina HTML, ritorna index.html
                        if (event.request.headers.get('accept')?.includes('text/html')) {
                            return caches.match('./index.html');
                        }
                    });
            })
    );
});

// Ascolta messaggi per forzare aggiornamento
self.addEventListener('message', (event) => {
    if (event.data === 'skipWaiting') {
        self.skipWaiting();
    }
});
