// Coldsoup service worker — push notifications only (no offline caching).

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
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
