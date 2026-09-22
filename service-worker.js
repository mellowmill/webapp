const CACHE_NAME = 'mellowmill-shell-v1.4.0-16';
const PRECACHE_URLS = [
    '/index.html',
    '/workspace.html',
    '/menu.html',
    '/editor.html',
    '/settings.html',
    '/privacy.html',
    '/terms.html',
    '/benefits.html',
    '/app.html',
    '/manifest.webmanifest',
    '/icon_recreated_macos.png',
    '/mellow-mill-icon.png',
    '/icon-192.png',
    '/icon-512.png',
    '/common.css',
    '/common.js',
    '/editor.css',
    '/license.js',
    '/margin-converter.js',
    '/margin-renderer.css',
    '/margin-renderer.js',
    '/menu-content.html',
    '/menu.js',
    '/platform-web.js',
    '/publish.js',
    '/settings-content.html',
    '/settings.js',
    '/wasm/mellowmill_web.js',
    '/wasm/mellowmill_web_bg.wasm',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => Promise.all(PRECACHE_URLS.map(async (url) => {
                const response = await fetch(new Request(url, { cache: 'no-store' }));
                if (!response.ok) {
                    throw new Error(`Failed to precache ${url}: ${response.status}`);
                }
                await cache.put(url, response);
            })))
            .then(() => console.info(`[MellowMill] service worker installed ${CACHE_NAME}`))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(
                keys
                    .filter((key) => key.startsWith('mellowmill-shell-') && key !== CACHE_NAME)
                    .map((key) => caches.delete(key))
            ))
            .then(() => console.info(`[MellowMill] service worker active ${CACHE_NAME}`))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);

    if (request.method !== 'GET' || url.origin !== self.location.origin) return;

    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(new Request(request, { cache: 'no-store' }))
                .then((response) => {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
                    return response;
                })
                .catch(() => caches.match(request).then((cached) => cached || caches.match('/index.html')))
        );
        return;
    }

    event.respondWith(
        caches.match(request).then((cached) => {
            if (cached) return cached;

            return fetch(request).then((response) => {
                if (!response || response.status !== 200) return response;
                const copy = response.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
                return response;
            });
        })
    );
});
