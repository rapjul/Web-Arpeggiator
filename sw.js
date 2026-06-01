/* eslint-disable no-restricted-globals */
/**
 * Service worker for the Web Arpeggiator PWA.
 *
 * It precaches the app shell, handles cache-first/static and network-first/navigation
 * requests, and exposes small message-based utilities for development tests.
 */
// self.__WB_MANIFEST is injected by Workbox during build
const precachedEntries = self.__WB_MANIFEST || [];
const manifest = {
    cacheVersion: precachedEntries.length > 0 
        ? precachedEntries.map(e => e.revision || '').join('-').slice(0, 16)
        : 'dev',
    appShell: './index.html',
    navigationFallback: './index.html',
    assets: precachedEntries.map(entry => typeof entry === 'string' ? entry : entry.url)
};

const CACHE_NAME = `web-arpeggiator-${manifest.cacheVersion || 'dev'}`;
const CACHE_PREFIX = 'web-arpeggiator-';
const FALLBACK_URL = manifest.navigationFallback || manifest.appShell || './index.html';
const MUTABLE_PATHS = [
    '/index.html',
    '/manifest.json',
    '/js/asset-manifest.js'
];

/**
 * Adds each configured URL to the active cache without failing the whole install
 * when one optional or third-party asset is unavailable.
 *
 * @param {Cache} cache - The cache object opened for the active cache version.
 * @param {string[]} urls - URLs to precache during service worker installation.
 * @returns {Promise<void>} Resolves after all cache attempts have settled.
 */
async function cacheResources(cache, urls) {
    await Promise.allSettled(urls.map(async (url) => {
        try {
            await cache.add(new Request(url, { cache: 'reload' }));
        } catch (error) {
            console.warn('Failed to cache resource:', url, error);
        }
    }));
}

/**
 * Serves a request from cache first, then fetches and stores a fresh network copy.
 *
 * @param {Request} request - The GET request to resolve.
 * @returns {Promise<Response>} Cached, network, or error response.
 */
async function cacheFirst(request) {
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
        return cachedResponse;
    }

    try {
        const networkResponse = await fetch(request);
        if (networkResponse && (networkResponse.ok || networkResponse.type === 'opaque')) {
            cache.put(request, networkResponse.clone()).catch(() => { });
        }

        return networkResponse;
    } catch (error) {
        return cachedResponse || Response.error();
    }
}

/**
 * Serves a request from network first, falling back to a cached request or app shell.
 *
 * @param {Request} request - The navigation or mutable-asset request to resolve.
 * @param {string} [fallbackUrl=FALLBACK_URL] - Cached app-shell URL to use offline.
 * @returns {Promise<Response>} Network, cached, fallback, or error response.
 */
async function networkFirst(request, fallbackUrl = FALLBACK_URL) {
    const cache = await caches.open(CACHE_NAME);

    try {
        const networkResponse = await fetch(request);
        if (networkResponse && (networkResponse.ok || networkResponse.type === 'opaque')) {
            cache.put(request, networkResponse.clone()).catch(() => { });
        }

        return networkResponse;
    } catch (error) {
        const cachedResponse = await cache.match(request) || await cache.match(fallbackUrl);
        if (cachedResponse) {
            return cachedResponse;
        }

        return Response.error();
    }
}

// Precache the current app shell and static dependencies as soon as the worker installs.
self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);
        await cacheResources(cache, manifest.assets || []);
        await self.skipWaiting();
    })());
});

// Claim clients immediately and remove stale Web Arpeggiator cache versions only.
self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map((cacheName) => {
            if (cacheName.startsWith(CACHE_PREFIX) && cacheName !== CACHE_NAME) {
                return caches.delete(cacheName);
            }

            return Promise.resolve();
        }));
        await self.clients.claim();
    })());
});

/**
 * Sends a structured response back to the client that posted a service worker message.
 *
 * @param {ExtendableMessageEvent} event - Message event from the controlled page.
 * @param {object} payload - Response payload to post back to the page.
 * @returns {Promise<void>} Resolves after the response attempt completes.
 */
async function postMessageResponse(event, payload) {
    if (event.source && typeof event.source.postMessage === 'function') {
        event.source.postMessage(payload);
    }
}

// Dev/test message API for cache inspection, cache clearing, and immediate activation.
self.addEventListener('message', (event) => {
    const message = event.data || {};
    const messageId = message.messageId || null;

    event.waitUntil((async () => {
        try {
            if (message.type === 'SKIP_WAITING') {
                await self.skipWaiting();
                await postMessageResponse(event, {
                    messageId,
                    ok: true,
                    type: 'SKIP_WAITING_COMPLETE'
                });
                return;
            }

            if (message.type === 'listCaches') {
                const cacheNames = await caches.keys();
                await postMessageResponse(event, {
                    messageId,
                    ok: true,
                    type: 'listCachesResult',
                    caches: cacheNames.filter((cacheName) => cacheName.startsWith(CACHE_PREFIX))
                });
                return;
            }

            if (message.type === 'clearCaches') {
                const cacheNames = await caches.keys();
                const deletedCaches = [];
                await Promise.all(cacheNames.map(async (cacheName) => {
                    if (!cacheName.startsWith(CACHE_PREFIX)) {
                        return;
                    }

                    const deleted = await caches.delete(cacheName);
                    if (deleted) {
                        deletedCaches.push(cacheName);
                    }
                }));

                await postMessageResponse(event, {
                    messageId,
                    ok: true,
                    type: 'clearCachesResult',
                    caches: deletedCaches
                });
            }
        } catch (error) {
            await postMessageResponse(event, {
                messageId,
                ok: false,
                type: 'serviceWorkerMessageError',
                error: error?.message || String(error)
            });
        }
    })());
});

// Route page navigations, CDN dependencies, mutable assets, and static assets.
self.addEventListener('fetch', (event) => {
    const { request } = event;

    if (request.method !== 'GET') {
        return;
    }

    const requestUrl = new URL(request.url);

    // Bypass caching for the service worker itself to avoid update check failures
    if (requestUrl.pathname.endsWith('/sw.js')) {
        return;
    }

    if (request.mode === 'navigate') {
        event.respondWith(networkFirst(request, FALLBACK_URL));
        return;
    }

    if (requestUrl.origin !== self.location.origin) {
        event.respondWith(cacheFirst(request));
        return;
    }

    if (MUTABLE_PATHS.some(path => requestUrl.pathname.endsWith(path)) || requestUrl.pathname.endsWith('/manifest.json')) {
        event.respondWith(networkFirst(request));
        return;
    }

    event.respondWith(cacheFirst(request));
});
