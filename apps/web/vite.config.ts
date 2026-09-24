import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // تطبيق ويب يتثبت على الموبايل ويشتغل حتى لو النت ضعيف
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'توصيل',
        short_name: 'توصيل',
        description: 'اطلب من مطاعم وصيدليات وبقالة محافظتك',
        lang: 'ar',
        dir: 'rtl',
        theme_color: '#0f766e',
        background_color: '#f8fafc',
        display: 'standalone',
        start_url: '/',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
      workbox: {
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // صفحات المحلات والمنتجات: بنعرض آخر نسخة محفوظة لو النت فصل
            urlPattern: ({ url }) => url.pathname.startsWith('/api/v1/catalog/'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'catalog',
              expiration: { maxEntries: 100, maxAgeSeconds: 86_400 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3000', ws: true, changeOrigin: false },
    },
  },
  build: {
    target: 'es2020',
    cssMinify: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (/node_modules\/(react|react-dom|react-router|scheduler)\//.test(id)) return 'react';
          if (id.includes('node_modules/@tanstack/')) return 'query';
          if (/node_modules\/(socket\.io|engine\.io|@socket\.io)/.test(id)) return 'realtime';
          return undefined;
        },
      },
    },
  },
});
