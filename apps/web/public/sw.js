// Coldsoup service worker — push notifications + media cache.

const MEDIA_CACHE = "coldsoup-media-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Drop old media cache versions.
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k.startsWith("coldsoup-media-") && k !== MEDIA_CACHE).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

// Cache-first for public storage objects (attachments/avatars). Files are
// immutable (uuid names; avatars are cache-busted with ?t=), so a repeat view
// is served from the device — no Supabase egress.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (!url.pathname.includes("/storage/v1/object/public/")) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(MEDIA_CACHE);
      const cached = await cache.match(event.request);
      if (cached) return cached;
      try {
        const res = await fetch(event.request);
        if (res.ok) cache.put(event.request, res.clone());
        return res;
      } catch (e) {
        return cached || Response.error();
      }
    })()
  );
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = { title: "Coldsoup", body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "Coldsoup";
  const options = {
    body: payload.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: payload.tag || (payload.data && payload.data.threadId) || undefined,
    renotify: true,
    data: payload.data || {},
  };

  event.waitUntil(
    (async () => {
      await self.registration.showNotification(title, options);
      // App-icon badge = number of undismissed notifications.
      if (self.navigator.setAppBadge) {
        try {
          const notes = await self.registration.getNotifications();
          await self.navigator.setAppBadge(notes.length);
        } catch (e) {
          // Badging unsupported / failed — ignore.
        }
      }
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const threadId = event.notification.data && event.notification.data.threadId;
  const groupId = event.notification.data && event.notification.data.groupId;
  let url = "/";
  if (threadId && groupId) url = `/g/${groupId}/t/${threadId}`;
  else if (threadId) url = `/?thread=${threadId}`;

  event.waitUntil(
    (async () => {
      if (self.navigator.clearAppBadge) {
        try {
          await self.navigator.clearAppBadge();
        } catch (e) {
          /* ignore */
        }
      }
      const clientList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })()
  );
});
