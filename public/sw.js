// Service worker: only two jobs — make the app installable as a PWA, and turn incoming
// Web Push messages into a visible notification. No offline cache/asset strategy on
// purpose — this dashboard is useless without a live connection to the DB anyway, so a
// cache layer would just be complexity that never pays for itself.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Installability on Chrome/Android still checks for a fetch handler — pass everything
// straight through the network, no caching.
self.addEventListener("fetch", () => {});

self.addEventListener("push", (event) => {
  let data = { title: "Flux Track", body: "Nova notificação" };
  try {
    data = event.data.json();
  } catch {
    // no-op: keep the fallback above
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: data.tag ?? "flux-track",
      data: { url: data.url ?? "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
