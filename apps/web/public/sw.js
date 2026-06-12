// Coldsoup service worker — push notifications + media cache.

const MEDIA_CACHE = "coldsoup-media-v1";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

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
  // `renotify: true` REQUIRES a non-empty tag — otherwise showNotification
  // rejects with a TypeError and NOTHING shows (this silently broke the test
  // notification, which carries no tag). Always supply a fallback tag.
  const tag =
    payload.tag || (payload.data && payload.data.threadId) || "coldsoup";
  const options = {
    body: payload.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag,
    renotify: true,
    data: payload.data || {},
  };

  event.waitUntil(
    (async () => {
      try {
        await self.registration.showNotification(title, options);
      } catch (e) {
        // Last-resort fallback so a malformed option never swallows the notice.
        await self.registration.showNotification(title, {
          body: options.body,
          icon: options.icon,
          tag,
        });
      }
      // App-icon badge = real server-computed unread-thread count when the
      // payload carries it; otherwise fall back to undismissed notifications.
      if (self.navigator.setAppBadge) {
        try {
          const badge =
            payload.data && typeof payload.data.badge === "number"
              ? payload.data.badge
              : (await self.registration.getNotifications()).length;
          if (badge > 0) await self.navigator.setAppBadge(badge);
          else if (self.navigator.clearAppBadge) await self.navigator.clearAppBadge();
        } catch (e) {
          // Badging unsupported / failed — ignore.
        }
      }
    })()
  );
});

// The push service rotates/expires subscriptions on its own. Without handling
// this, getSubscription() silently returns null and the user's toggle flips to
// OFF until they manually re-enable. Re-subscribe and tell the server.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const oldEndpoint = event.oldSubscription && event.oldSubscription.endpoint;

      // Prefer the old subscription's key; fall back to the server-provided
      // VAPID public key (some browsers don't expose oldSubscription).
      let applicationServerKey =
        event.oldSubscription &&
        event.oldSubscription.options &&
        event.oldSubscription.options.applicationServerKey;
      if (!applicationServerKey) {
        try {
          const res = await fetch("/api/push/key");
          const key = (await res.text()).trim();
          if (!key) return;
          applicationServerKey = urlBase64ToUint8Array(key);
        } catch (e) {
          return;
        }
      }

      let sub;
      try {
        sub = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });
      } catch (e) {
        return;
      }

      const json = sub.toJSON();
      try {
        await fetch("/api/push/resubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            endpoint: json.endpoint,
            keys: json.keys,
            oldEndpoint,
          }),
        });
      } catch (e) {
        // Server unreachable — the local subscription still exists; a later
        // app open will reconcile.
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
      // An app is already open: focus it and tell it to navigate client-side.
      // (client.navigate() is unreliable in iOS standalone PWAs — postMessage +
      // the app's router is robust.)
      for (const client of clientList) {
        if ("focus" in client) {
          try { client.postMessage({ type: "navigate", url }); } catch (e) { /* ignore */ }
          await client.focus();
          return;
        }
      }
      // No window open: open one at the target URL.
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })()
  );
});
