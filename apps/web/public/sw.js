// Coldsoup service worker — app shell, static assets, media cache, push.

importScripts("/sw-routes.js");

const MEDIA_CACHE = "coldsoup-media-v1";
const STATIC_CACHE = "coldsoup-static-v1";
// lib/build-check.ts deletes SHELL_CACHE by name; rename both together.
const SHELL_CACHE = "coldsoup-shell-v1";
const CURRENT_CACHES = [MEDIA_CACHE, STATIC_CACHE, SHELL_CACHE];
const STATIC_MAX_ENTRIES = 400;
// Special key in SHELL_CACHE whose body is the URL of the last shell page.
const LAST_SHELL_KEY = "/__last-shell";
// next dev serves mutable /_next/static and pages — never cache them there.
const IS_DEV = self.location.hostname === "localhost" || self.location.hostname === "127.0.0.1";

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
      // Drop caches from older versions (and the shell cache if a future
      // version stops using it).
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith("coldsoup-") && CURRENT_CACHES.indexOf(k) === -1)
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

// Logout: the next user on this device must never see this user's shell.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "clear-shell") {
    event.waitUntil(caches.delete(SHELL_CACHE));
  }
});

async function trimCache(cache, max) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

// Cache-first for public storage objects (attachments/avatars). Files are
// immutable (uuid names; avatars are cache-busted with ?t=), so a repeat view
// is served from the device — no Supabase egress.
function handleMedia(event) {
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
}

// Cache-first for hashed build assets and icons (immutable per URL).
function handleStatic(event) {
  event.respondWith(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      const cached = await cache.match(event.request);
      if (cached) return cached;
      const res = await fetch(event.request);
      if (res.ok) {
        await cache.put(event.request, res.clone());
        trimCache(cache, STATIC_MAX_ENTRIES).catch(() => {});
      }
      return res;
    })()
  );
}

// Stale-while-revalidate for /g/** pages: answer instantly from the device,
// refresh the copy in the background for next time.
function handleShell(event, url) {
  const key = self.swRoutes.shellKey(url);
  // One network request serves both the response (on a miss) and the cache.
  const network = fetch(event.request).then((res) => ({ res, copy: res.clone() }));

  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      try {
        const { copy } = await network;
        if (copy.type === "opaqueredirect") {
          // Session gone (e.g. redirected to /login): stop serving this page.
          await cache.delete(key);
          return;
        }
        const cacheable = self.swRoutes.isCacheableShell({
          ok: copy.ok,
          type: copy.type,
          contentType: copy.headers.get("content-type") || "",
        });
        if (cacheable) {
          await cache.put(key, copy);
          await cache.put(LAST_SHELL_KEY, new Response(key));
        }
      } catch (e) {
        // Offline — keep the cached copy.
      }
    })()
  );

  event.respondWith(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      const cached = await cache.match(key);
      if (cached) return cached;
      try {
        const { res } = await network;
        return res;
      } catch (e) {
        return Response.error();
      }
    })()
  );
}

// start_url "/" is a server redirect; jump straight to the last shell page
// when it's cached so a cold launch never waits for the server.
function handleRoot(event) {
  event.respondWith(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      const last = await cache.match(LAST_SHELL_KEY);
      if (last) {
        const target = await last.text();
        if (target && (await cache.match(target))) return Response.redirect(target, 302);
      }
      return fetch(event.request);
    })()
  );
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  const kind = self.swRoutes.classify(url, event.request.mode, self.location.origin);
  if (kind === "media") return handleMedia(event);
  if (IS_DEV) return;
  if (kind === "static") return handleStatic(event);
  if (kind === "shell") return handleShell(event, url);
  if (kind === "root") return handleRoot(event);
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
