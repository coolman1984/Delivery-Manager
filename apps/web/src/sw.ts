/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import { ExpirationPlugin } from 'workbox-expiration';
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst, StaleWhileRevalidate } from 'workbox-strategies';

declare const self: ServiceWorkerGlobalScope;

/**
 * عامل الخلفية: بيخلّي التطبيق يفتح بسرعة حتى لو النت ضعيف،
 * وبيستقبل الإشعارات حتى لو التطبيق مقفول.
 */
self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/api\//] }),
);

registerRoute(
  ({ url }) => url.pathname.startsWith('/art/') || url.pathname.startsWith('/api/v1/media/'),
  new CacheFirst({
    cacheName: 'images',
    plugins: [new ExpirationPlugin({ maxEntries: 300, maxAgeSeconds: 30 * 86_400 })],
  }),
);
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/v1/catalog/'),
  new StaleWhileRevalidate({
    cacheName: 'catalog',
    plugins: [new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 86_400 })],
  }),
);
registerRoute(
  ({ url }) => url.hostname.endsWith('tile.openstreetmap.org'),
  new CacheFirst({
    cacheName: 'map-tiles',
    plugins: [new ExpirationPlugin({ maxEntries: 500, maxAgeSeconds: 7 * 86_400 })],
  }),
);

self.addEventListener('push', (event) => {
  let data: { title?: string; body?: string; url?: string } = {};
  try {
    data = event.data?.json() ?? {};
  } catch {
    data = { title: 'إشعار جديد', body: event.data?.text() };
  }
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'توصيل', {
      body: data.body,
      icon: '/icon.svg',
      badge: '/icon.svg',
      dir: 'rtl',
      lang: 'ar',
      data: { url: data.url ?? '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string } | undefined)?.url ?? '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => 'focus' in c);
      if (open) {
        void (open as WindowClient).navigate(url);
        return (open as WindowClient).focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
