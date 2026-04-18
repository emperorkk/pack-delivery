import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
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
        navigateFallbackDenylist: [/^\/api\//]
      }
    })
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') }
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
