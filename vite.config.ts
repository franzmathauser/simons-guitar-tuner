import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig({
  // GitHub Pages serves this as a *project site* from a subpath, so every
  // asset/manifest/service-worker URL is prefixed with it. Applied consistently
  // to build, dev and preview (so preview matches the deployed layout) — dev/preview
  // therefore run at http://localhost:<port>/simons-guitar-tuner/.
  // Must match the GitHub repo name exactly: rename the repo → change this.
  base: '/simons-guitar-tuner/',
  plugins: [
    svelte(),
    // PWA: real manifest + icons + full offline precache (AC-11 offline, AC-12 installable).
    VitePWA({
      registerType: 'autoUpdate',
      // Do not inject the registration/sw during dev so the skeleton stays simple.
      devOptions: { enabled: false },
      // Static assets in public/ that aren't referenced by the bundle graph, so they
      // are picked up as PWA assets (favicon + iOS home-screen icon).
      includeAssets: ['favicon.ico', 'favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Ton-Gemetzel',
        short_name: 'Ton-Gemetzel',
        description:
          'Gitarren-Stimmgerät & Metronom — offline nutzbar, komplett ohne Server.',
        lang: 'de',
        theme_color: '#0d9488',
        background_color: '#eef2f7',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '.',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: 'maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Precache the full app shell so the app runs fully offline (AC-11).
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest,woff2}'],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
  },
});
