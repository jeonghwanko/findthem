/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst, CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

declare const self: ServiceWorkerGlobalScope;

// Workbox precache (빌드 시 자동 주입)
precacheAndRoute(self.__WB_MANIFEST);

// API 캐싱 (NetworkFirst)
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/'),
  new NetworkFirst({
    cacheName: 'api-cache',
    plugins: [
      new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 60 * 60 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  }),
);

// 업로드 이미지 캐싱 (CacheFirst)
registerRoute(
  ({ url }) => url.pathname.startsWith('/uploads/'),
  new CacheFirst({
    cacheName: 'uploads-cache',
    plugins: [
      new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  }),
);

// ── Web Push 이벤트 ──

interface PushPayload {
  title: string;
  body: string;
  url?: string;
  icon?: string;
}

self.addEventListener('push', (event) => {
  if (!event.data) return;

  const data = event.data.json() as PushPayload;

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon ?? '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      data: { url: data.url ?? '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data as { url: string })?.url ?? '/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        const existing = clientList.find((c) => c.url.includes(url));
        if (existing) return existing.focus();
        return self.clients.openWindow(url);
      }),
  );
});
