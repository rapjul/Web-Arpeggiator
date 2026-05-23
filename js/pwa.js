/**
 * Browser-side PWA helper for registering and controlling the Web Arpeggiator
 * service worker.
 */
(() => {
    const manifest = window.__WEB_ARP_ASSET_MANIFEST__ || {
        cacheVersion: 'dev',
        appShell: './Web Arpeggiator.html',
        navigationFallback: './Web Arpeggiator.html',
        assets: []
    };

    const state = window.__WEB_ARP_PWA_STATE__ = window.__WEB_ARP_PWA_STATE__ || {
        cacheVersion: manifest.cacheVersion || 'dev',
        serviceWorkerRegistered: false,
        serviceWorkerUrl: null,
        serviceWorkerError: null,
        hasWaitingWorker: false
    };

    let registration = null;
    let messageCounter = 0;

    /**
     * Returns the service worker script URL.
     *
     * @returns {string} Relative service worker URL.
     */
    function getServiceWorkerUrl() {
        return './sw.js';
    }

    /**
     * Registers the app service worker and updates the shared PWA status object.
     *
     * @returns {Promise<ServiceWorkerRegistration|null>} Active registration or null.
     */
    async function registerServiceWorker() {
        if (!('serviceWorker' in navigator)) {
            state.serviceWorkerRegistered = false;
            state.serviceWorkerError = 'unsupported';
            return null;
        }

        try {
            const swUrl = getServiceWorkerUrl();
            registration = await navigator.serviceWorker.register(swUrl, { scope: './' });
            state.serviceWorkerRegistered = true;
            state.serviceWorkerUrl = swUrl;
            state.serviceWorkerError = null;

            registration.addEventListener('updatefound', () => {
                const installingWorker = registration.installing;
                if (!installingWorker) {
                    return;
                }

                installingWorker.addEventListener('statechange', () => {
                    if (installingWorker.state === 'installed' && navigator.serviceWorker.controller && typeof showToast === 'function') {
                        state.hasWaitingWorker = Boolean(registration.waiting);
                        showToast('App cache updated. Reload to use the latest assets.', 'info');
                    }
                });
            });

            await registration.update();
            state.hasWaitingWorker = Boolean(registration.waiting);
            return registration;
        } catch (error) {
            state.serviceWorkerRegistered = false;
            state.serviceWorkerError = error?.message || String(error);
            console.warn('Failed to register service worker:', error);
            return null;
        }
    }

    /**
     * Checks for service worker updates and refreshes waiting-worker state.
     *
     * @returns {Promise<ServiceWorkerRegistration|null>} Updated registration or null.
     */
    async function refreshServiceWorker() {
        if (registration && typeof registration.update === 'function') {
            const updatedRegistration = await registration.update();
            state.hasWaitingWorker = Boolean(updatedRegistration?.waiting || registration.waiting);
            return updatedRegistration;
        }

        return registerServiceWorker();
    }

    /**
     * Finds the current service worker registration, waiting for readiness if needed.
     *
     * @returns {Promise<ServiceWorkerRegistration|null>} Ready registration or null.
     */
    async function getReadyRegistration() {
        if (registration) {
            return registration;
        }

        if (!('serviceWorker' in navigator)) {
            return null;
        }

        registration = await navigator.serviceWorker.getRegistration('./') || await navigator.serviceWorker.ready;
        return registration;
    }

    /**
     * Sends a request/response-style message to the active or waiting service worker.
     *
     * @param {string} type - Message command name handled by `sw.js`.
     * @param {object} [payload={}] - Extra serializable command data.
     * @param {ServiceWorker|null} [preferredWorker=null] - Specific worker to target.
     * @returns {Promise<object>} Structured response posted back by the service worker.
     */
    async function sendServiceWorkerMessage(type, payload = {}, preferredWorker = null) {
        if (!('serviceWorker' in navigator)) {
            throw new Error('Service workers are not supported.');
        }

        const readyRegistration = await getReadyRegistration();

        return new Promise((resolve, reject) => {
            if (!('serviceWorker' in navigator)) {
                reject(new Error('Service workers are not supported.'));
                return;
            }

            const worker = preferredWorker
                || readyRegistration?.waiting
                || readyRegistration?.active
                || navigator.serviceWorker.controller;

            if (!worker) {
                reject(new Error('No active service worker is available.'));
                return;
            }

            const messageId = `web-arp-${Date.now()}-${messageCounter += 1}`;
            const timeoutId = window.setTimeout(() => {
                navigator.serviceWorker.removeEventListener('message', onMessage);
                reject(new Error(`Timed out waiting for service worker response: ${type}`));
            }, 5000);

            /**
             * Resolves the pending command when the matching service worker reply arrives.
             *
             * @param {MessageEvent} event - Message event from the service worker.
             * @returns {void}
             */
            function onMessage(event) {
                if (event.data?.messageId !== messageId) {
                    return;
                }

                window.clearTimeout(timeoutId);
                navigator.serviceWorker.removeEventListener('message', onMessage);

                if (event.data.ok === false) {
                    reject(new Error(event.data.error || `Service worker message failed: ${type}`));
                    return;
                }

                resolve(event.data);
            }

            navigator.serviceWorker.addEventListener('message', onMessage);
            worker.postMessage({ ...payload, type, messageId });
        });
    }

    /**
     * Tells a waiting worker to skip the waiting phase when an update is available.
     *
     * @returns {Promise<object>} Activation response or skipped status.
     */
    async function activateWaitingWorker() {
        const readyRegistration = await getReadyRegistration();
        const waitingWorker = readyRegistration?.waiting;
        if (!waitingWorker) {
            state.hasWaitingWorker = false;
            return { ok: true, skipped: true, reason: 'no-waiting-worker' };
        }

        const result = await sendServiceWorkerMessage('SKIP_WAITING', {}, waitingWorker);
        state.hasWaitingWorker = false;
        return result;
    }

    /**
     * Lists Web Arpeggiator cache names known to the service worker.
     *
     * @returns {Promise<string[]>} Versioned cache names.
     */
    async function listCaches() {
        const result = await sendServiceWorkerMessage('listCaches');
        return result.caches || [];
    }

    /**
     * Clears Web Arpeggiator caches through the service worker dev/test API.
     *
     * @returns {Promise<string[]>} Cache names removed by the worker.
     */
    async function clearCaches() {
        const result = await sendServiceWorkerMessage('clearCaches');
        return result.caches || [];
    }

    /**
     * Starts service worker registration after the page has loaded.
     *
     * @returns {void}
     */
    function init() {
        if (document.readyState === 'complete') {
            void registerServiceWorker();
            return;
        }

        window.addEventListener('load', () => {
            void registerServiceWorker();
        }, { once: true });
    }

    // Public PWA control API used by the app UI and browser automation checks.
    window.WebArpPWA = {
        registerServiceWorker,
        refreshServiceWorker,
        activateWaitingWorker,
        clearCaches,
        listCaches,
        /**
         * Returns the registration cached by this helper.
         *
         * @returns {ServiceWorkerRegistration|null} Current registration or null.
         */
        getRegistration: () => registration,
        /**
         * Returns a shallow copy of PWA registration/update state.
         *
         * @returns {object} Current PWA state snapshot.
         */
        getState: () => ({ ...state })
    };

    // Test hooks intentionally mirror public helpers for headless browser checks.
    window.__WEB_ARP_TEST__ = window.__WEB_ARP_TEST__ || {};
    Object.assign(window.__WEB_ARP_TEST__, {
        /**
         * Returns a shallow copy of PWA state for browser automation.
         *
         * @returns {object} Current PWA state snapshot.
         */
        getPwaState: () => ({ ...state }),
        refreshServiceWorker,
        activateWaitingWorker,
        clearCaches,
        listCaches
    });

    init();
})();
