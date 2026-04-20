import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  // Exposed at compile time so both the driver PWA and the admin SPA can
  // render the same version string without importing package.json into the
  // bundle. Bump `version` in package.json on every release.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version)
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // The driver PWA is the only entry we want registered as an installable
      // offline-first app. The admin bundle is desktop-only, so keep the SW
      // focused on `/` and explicitly skip the /admin entry so the Workbox
      // navigation handler never falls back to index.html for /admin routes.
      filename: 'sw.js',
      includeAssets: [
        'favicon.ico',
        'favicon-16x16.png',
        'favicon-32x32.png',
        'favicon-96x96.png',
        'apple-icon*.png',
        'android-icon-*.png',
        'ms-icon-*.png',
        'browserconfig.xml',
        'manifest.json'
      ],
      manifest: {
        name: 'Pack Delivery',
        short_name: 'PackDel',
        description: 'Driver-side barcode delivery for Soft1 ERP',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: '/android-icon-36x36.png', sizes: '36x36', type: 'image/png' },
          { src: '/android-icon-48x48.png', sizes: '48x48', type: 'image/png' },
          { src: '/android-icon-72x72.png', sizes: '72x72', type: 'image/png' },
          { src: '/android-icon-96x96.png', sizes: '96x96', type: 'image/png' },
          { src: '/android-icon-144x144.png', sizes: '144x144', type: 'image/png' },
          { src: '/android-icon-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/apple-icon-180x180.png', sizes: '180x180', type: 'image/png' },
          {
            src: '/android-icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,xml,webmanifest,woff2}'],
        // Don't let the driver PWA's SW intercept admin.html navigations:
        // those should always hit the Worker, which serves the admin SPA.
        navigateFallbackDenylist: [/^\/api\//, /^\/admin(\/|$)/]
      }
    })
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') }
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        admin: path.resolve(__dirname, 'admin.html')
      }
    }
  },
  server: {
    port: 5173,
    host: true,
    // Forward `/api/*` to the deployed Worker during local dev so the PWA
    // can talk to a real Soft1 tenant without running wrangler locally.
    proxy: {
      '/api': {
        target: 'https://pack-delivery.kkourentzes.workers.dev',
        changeOrigin: true,
        secure: true
      }
    }
  }
});
