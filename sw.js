/* eslint-disable no-restricted-globals */
import { clientsClaim, setCacheNameDetails } from "workbox-core";
import {
    addRoute,
    cleanupOutdatedCaches,
    createHandlerBoundToURL,
    precache,
} from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { CacheFirst, NetworkFirst } from "workbox-strategies";

/**
 * Service worker for the Web Arpeggiator PWA.
 *
 * Workbox owns generated-asset precaching, stale Workbox precache cleanup, and
 * request routing. The small message API is retained for the app's cache
 * controls and browser tests.
 */
const CACHE_PREFIX = "web-arpeggiator-";
const LEGACY_CACHE_NAME = /^web-arpeggiator-(?:dev|[a-f0-9-]+)$/;
const MUTABLE_PATHS = ["/index.html", "/manifest.json", "/manifest.webmanifest"];

setCacheNameDetails({ prefix: "web-arpeggiator" });

// `self.__WB_MANIFEST` is injected by vite-plugin-pwa during the production build.
// Register routes below only after adding the entries, so the app-shell fallback
// can resolve the precached document.
precache(self.__WB_MANIFEST);

const appShellHandler = createHandlerBoundToURL("./index.html");
const navigationStrategy = new NetworkFirst({
    cacheName: `${CACHE_PREFIX}navigation`,
    plugins: [
        {
            handlerDidError: async ({ event }) => appShellHandler({ event }),
        },
    ],
});
const mutableAssetStrategy = new NetworkFirst({ cacheName: `${CACHE_PREFIX}mutable` });
const crossOriginAssetStrategy = new CacheFirst({ cacheName: `${CACHE_PREFIX}cross-origin` });
const localAssetStrategy = new CacheFirst({ cacheName: `${CACHE_PREFIX}runtime` });

// Keep the document and manifest fresh when online, while falling back to the
// Workbox app-shell precache when a navigation is made offline.
registerRoute(new NavigationRoute(navigationStrategy, { denylist: [/\/sw\.js$/] }));
registerRoute(
    ({ request, url }) =>
        request.method === "GET" &&
        url.origin === self.location.origin &&
        MUTABLE_PATHS.some((path) => url.pathname.endsWith(path)),
    mutableAssetStrategy,
);

// Register the precache after the mutable routes so those resources retain their
// network-first behavior instead of being intercepted by the precache route.
addRoute();

registerRoute(
    ({ request, url }) => request.method === "GET" && url.origin !== self.location.origin,
    crossOriginAssetStrategy,
);
registerRoute(
    ({ request, url }) =>
        request.method === "GET" &&
        url.origin === self.location.origin &&
        !url.pathname.endsWith("/sw.js"),
    localAssetStrategy,
);

// Preserve the existing immediate-update behavior. Workbox manages the
// precache lifecycle, and this only deletes caches created by the pre-Workbox
// worker during the transition.
self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();
self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((cacheNames) =>
                Promise.all(
                    cacheNames
                        .filter((cacheName) => LEGACY_CACHE_NAME.test(cacheName))
                        .map((cacheName) => caches.delete(cacheName)),
                ),
            ),
    );
});

/**
 * Sends a structured response back to the client that posted a service worker message.
 *
 * @param {ExtendableMessageEvent} event - Message event from the controlled page.
 * @param {object} payload - Response payload to post back to the page.
 * @returns {Promise<void>} Resolves after the response attempt completes.
 */
async function postMessageResponse(event, payload) {
    if (event.source && typeof event.source.postMessage === "function") {
        event.source.postMessage(payload);
    }
}

// Dev/test message API for cache inspection, cache clearing, and immediate activation.
self.addEventListener("message", (event) => {
    const message = event.data || {};
    const messageId = message.messageId || null;

    event.waitUntil(
        (async () => {
            try {
                if (message.type === "SKIP_WAITING") {
                    await self.skipWaiting();
                    await postMessageResponse(event, {
                        messageId,
                        ok: true,
                        type: "SKIP_WAITING_COMPLETE",
                    });
                    return;
                }

                if (message.type === "listCaches") {
                    const cacheNames = await caches.keys();
                    await postMessageResponse(event, {
                        messageId,
                        ok: true,
                        type: "listCachesResult",
                        caches: cacheNames.filter((cacheName) =>
                            cacheName.startsWith(CACHE_PREFIX),
                        ),
                    });
                    return;
                }

                if (message.type === "clearCaches") {
                    const cacheNames = await caches.keys();
                    const deletedCaches = [];
                    await Promise.all(
                        cacheNames.map(async (cacheName) => {
                            if (!cacheName.startsWith(CACHE_PREFIX)) {
                                return;
                            }

                            const deleted = await caches.delete(cacheName);
                            if (deleted) {
                                deletedCaches.push(cacheName);
                            }
                        }),
                    );

                    await postMessageResponse(event, {
                        messageId,
                        ok: true,
                        type: "clearCachesResult",
                        caches: deletedCaches,
                    });
                }
            } catch (error) {
                await postMessageResponse(event, {
                    messageId,
                    ok: false,
                    type: "serviceWorkerMessageError",
                    error: error?.message || String(error),
                });
            }
        })(),
    );
});
