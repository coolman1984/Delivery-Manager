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
        theme_color: '#08583b',
        background_color: '#f7f5f0',
        display: 'standalone',
        start_url: '/',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectManifest: {
        // الرسومات مش بتتحمل مع أول فتحة، بتتحمل لما تظهر وتتحفظ بعدها
        globIgnores: [
          'art/**',
          'assets/*vietnamese*',
          'assets/*latin-ext*',
          'assets/MapView*',
          'assets/leaflet*',
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
