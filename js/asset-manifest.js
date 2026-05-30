/**
 * Editable asset manifest shared by the page and service worker.
 *
 * Bump `cacheVersion` whenever cached app-shell assets change so the service
 * worker installs a fresh versioned cache.
 */
(() => {
    const manifest = {
        cacheVersion: 'phase3-2026-05-30-2',
        appShell: './index.html',
        navigationFallback: './index.html',
        assets: [
            './index.html',
            './manifest.json',
            './js/asset-manifest.js',
            './js/app.js',
            './js/audio-engine.js',
            './js/audio-utils.js',
            './js/keyboard-controller.js',
            './js/pattern-generator.js',
            './js/presets-store.js',
            './js/pwa.js',
            './js/recorder.js',
            './js/settings-manager.js',
            './js/visualizer.js',
            './styles.css',
            './images/icons/pwa-icon.svg',
            './images/icons/pwa-icon-192.png',
            './images/icons/pwa-icon-512.png',
            './images/icons/pwa-icon-maskable.svg',
            './images/icons/pwa-icon-maskable-192.png',
            './images/icons/pwa-icon-maskable-512.png',
            'https://cdn.tailwindcss.com',
            'https://cdnjs.cloudflare.com/ajax/libs/tone/14.8.49/Tone.js',
            'https://cdnjs.cloudflare.com/ajax/libs/lamejs/1.2.1/lame.min.js',
            'https://cdn.jsdelivr.net/npm/tonal@6.4.2/browser/tonal.min.js'
        ]
    };

    const frozenManifest = Object.freeze(manifest);

    if (typeof self !== 'undefined') {
        self.__WEB_ARP_ASSET_MANIFEST__ = frozenManifest;
    }

    if (typeof window !== 'undefined') {
        window.__WEB_ARP_ASSET_MANIFEST__ = frozenManifest;
    }
})();
