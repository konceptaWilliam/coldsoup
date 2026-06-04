"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { InstallPrompt } from "./install-prompt";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function PwaManager() {
  const router = useRouter();
  const subscribeWebPush = trpc.notifications.subscribeWebPush.useMutation();

  // Deep-link from a tapped push notification: the service worker focuses the
  // app and posts the target URL; navigate to it client-side.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const onMessage = (e: MessageEvent) => {
      const data = e.data as { type?: string; url?: string } | null;
      if (data?.type === "navigate" && data.url) router.push(data.url);
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [router]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.error("SW registration failed", err);
      });
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  // Clear the app-icon badge (and stale notifications) when the app is opened
  // or brought to the foreground.
  useEffect(() => {
    if (typeof window === "undefined") return;

    const clearBadge = async () => {
      const nav = navigator as Navigator & { clearAppBadge?: () => Promise<void> };
      if (nav.clearAppBadge) {
        try {
          await nav.clearAppBadge();
        } catch {
          /* ignore */
        }
      }
      if ("serviceWorker" in navigator) {
        try {
          const reg = await navigator.serviceWorker.ready;
          const notes = await reg.getNotifications();
          notes.forEach((n) => n.close());
        } catch {
          /* ignore */
        }
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") clearBadge();
    };

    clearBadge();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", clearBadge);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", clearBadge);
    };
  }, []);

  // Refresh the push subscription whenever the app opens / returns to the
  // foreground. iOS expires PWA push subscriptions when unused — getSubscription
  // then returns null, so we re-subscribe and upsert a fresh endpoint, keeping
  // notifications working instead of going silent until manually re-enabled.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return;
    const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!key) return;

    let running = false;
    const ensureSubscription = async () => {
      if (running) return;
      if (Notification.permission !== "granted") return;
      running = true;
      try {
        const reg = await navigator.serviceWorker.ready;
        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(key),
          });
        }
        const json = sub.toJSON();
        if (json.endpoint && json.keys) {
          await subscribeWebPush.mutateAsync({
            endpoint: json.endpoint,
            keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
            userAgent: navigator.userAgent,
          });
        }
      } catch {
        /* best-effort */
      } finally {
        running = false;
      }
    };

    ensureSubscription();
    const onVisible = () => {
      if (document.visibilityState === "visible") ensureSubscription();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <InstallPrompt />;
}
