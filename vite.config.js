import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
    plugins: [
        tailwindcss(),
        VitePWA({
            strategies: 'injectManifest',
            srcDir: '.',
            filename: 'sw.js',
            injectRegister: false, // Registered manually in js/pwa.js
            manifest: {
                name: 'Web Arpeggiator',
                short_name: 'Arpeggiator',
                description: 'A browser-based musical arpeggiator application.',
                theme_color: '#0f172a',
                background_color: '#0f172a',
                display: 'standalone',
                orientation: 'portrait',
                scope: './',
                start_url: './index.html',
                icons: [
                    {
                        src: 'images/icons/pwa-icon-192.png',
                        sizes: '192x192',
                        type: 'image/png'
                    },
                    {
                        src: 'images/icons/pwa-icon-512.png',
                        sizes: '512x512',
                        type: 'image/png'
                    },
                    {
                        src: 'images/icons/pwa-icon-maskable.svg',
                        sizes: '512x512',
                        type: 'image/svg+xml',
                        purpose: 'maskable'
                    },
                    {
                        src: 'images/icons/pwa-icon-maskable-192.png',
                        sizes: '192x192',
                        type: 'image/png',
                        purpose: 'maskable'
                    },
                    {
                        src: 'images/icons/pwa-icon-maskable-512.png',
                        sizes: '512x512',
                        type: 'image/png',
                        purpose: 'maskable'
                    }
                ]
            },
            injectManifest: {
                globPatterns: ['**/*.{js,css,html,ico,png,svg,json}']
            }
        })
    ],
    server: {
        hmr: {
            host: 'localhost',
            protocol: 'ws'
        }
    },
    build: {
        rollupOptions: {
            input: {
                main: 'index.html'
            }
        }
    }
});
