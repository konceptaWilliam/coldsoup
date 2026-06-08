"use client";

import { useCallback, useEffect, useState } from "react";
import { trpc } from "@/lib/trpc/client";

// Single source of truth for "can / should we nudge about notifications".
//   loading       — still checking
//   unsupported   — browser can't do web push at all
//   needs-install — iOS Safari tab: push only works once added to home screen
//   blocked       — permission denied (unrecoverable in-app; don't nudge to enable)
//   off           — supported + not denied, but no active subscription
//   on            — active subscription present
export type NotifStatus =
  | "loading"
  | "unsupported"
  | "needs-install"
  | "blocked"
  | "off"
  | "on";

function isIos(): boolean {
  if (typeof window === "undefined") return false;
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function useNotificationStatus() {
  const [status, setStatus] = useState<NotifStatus>("loading");
  const subscribeMut = trpc.notifications.subscribeWebPush.useMutation();

  const refresh = useCallback(async () => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("Notification" in window)
    ) {
      setStatus("unsupported");
      return;
    }
    // iOS only exposes PushManager inside the installed PWA. In a Safari tab,
    // installing is the prerequisite, so steer there instead of "unsupported".
    if (isIos() && !isStandalone()) {
      setStatus("needs-install");
      return;
    }
    if (!("PushManager" in window)) {
      setStatus("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setStatus("blocked");
      return;
    }
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setStatus(sub ? "on" : "off");
    } catch {
      setStatus("off");
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Runs the real permission + subscribe flow. Returns true on success.
  // Caller is responsible for showing a soft pre-prompt BEFORE this — never
  // call it cold, a hard deny is permanent.
  const enable = useCallback(async (): Promise<boolean> => {
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setStatus(perm === "denied" ? "blocked" : "off");
        return false;
      }
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!key) return false;
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });
      const json = sub.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false;
      await subscribeMut.mutateAsync({
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
        userAgent: navigator.userAgent,
      });
      setStatus("on");
      return true;
    } catch {
      return false;
    }
  }, [subscribeMut]);

  return { status, enable, refresh };
}
