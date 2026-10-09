// MD Studio — Service Worker v1.0
// Provides offline caching for all static assets

const CACHE_NAME = 'md-studio-v2';

// All static assets to cache for offline use
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/app.html',
    '/css/typography.css',
    '/css/landing.css',
    '/css/themes.css',
    '/js/app.js',
    '/js/githubLoader.js',
    '/js/markdownParser.js',
    '/js/tocGenerator.js',
    '/ui/laptop/layout.css',
    '/ui/laptop/laptopUI.js',
    '/ui/tablet/layout.css',
    '/ui/tablet/tabletUI.js',
    '/ui/mobile/layout.css',
    '/ui/mobile/mobileUI.js',
    '/manifest.json'
];

// Install: cache all static assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[SW] Caching static assets...');
            return cache.addAll(ASSETS_TO_CACHE);
        }).then(() => self.skipWaiting())
    );
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys
                    .filter(key => key !== CACHE_NAME)
                    .map(key => {
                        console.log('[SW] Deleting old cache:', key);
                        return caches.delete(key);
                    })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch: serve from cache first, fallback to network
self.addEventListener('fetch', (event) => {
    // Skip non-GET and cross-origin CDN requests
    if (event.request.method !== 'GET') return;
    const url = new URL(event.request.url);

    // For CDN resources (fonts, libraries): network first, then cache
    if (url.origin !== location.origin) {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    if (response.ok) {
                        const cloned = response.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(event.request, cloned));
                    }
                    return response;
                })
                .catch(() => caches.match(event.request))
        );
        return;
    }

    // For local assets: network first (so new deploys reach users), fallback to cache
    event.respondWith(
        fetch(event.request).then((response) => {
            if (response.ok) {
                const cloned = response.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(event.request, cloned));
            }
            return response;
        }).catch(() => caches.match(event.request))
    );
});
