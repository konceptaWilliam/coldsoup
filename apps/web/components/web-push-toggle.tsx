"use client";

import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc/client";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

type State = "loading" | "unsupported" | "denied" | "off" | "on" | "busy";

export function WebPushToggle() {
  const [state, setState] = useState<State>("loading");
  const [testResult, setTestResult] = useState<string | null>(null);
  const subscribeMut = trpc.notifications.subscribeWebPush.useMutation();
  const unsubscribeMut = trpc.notifications.unsubscribeWebPush.useMutation();
  const testMut = trpc.notifications.testPush.useMutation();

  const runTest = async () => {
    setTestResult("sending…");
    try {
      const r = await testMut.mutateAsync();
      setTestResult(JSON.stringify(r));
    } catch (e) {
      setTestResult("error: " + (e as Error).message);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (
        typeof window === "undefined" ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)
      ) {
        if (!cancelled) setState("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setState("denied");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (cancelled) return;
      setState(sub ? "on" : "off");
      // Reconcile: make sure the server still knows this browser's current
      // subscription. Covers the case where the push service rotated the sub
      // and the SW's re-register POST didn't reach the server.
      if (sub) {
        const json = sub.toJSON();
        if (json.endpoint && json.keys?.p256dh && json.keys?.auth) {
          subscribeMut
            .mutateAsync({
              endpoint: json.endpoint,
              keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
              userAgent: navigator.userAgent,
            })
            .catch(() => null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const enable = async () => {
    setState("busy");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState(perm === "denied" ? "denied" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!key) throw new Error("Missing NEXT_PUBLIC_VAPID_PUBLIC_KEY");
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });
      const json = sub.toJSON();
      await subscribeMut.mutateAsync({
        endpoint: json.endpoint!,
        keys: { p256dh: json.keys!.p256dh, auth: json.keys!.auth },
        userAgent: navigator.userAgent,
      });
      setState("on");
    } catch (err) {
      console.error("enable web push failed", err);
      setState("off");
    }
  };

  const disable = async () => {
    setState("busy");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await unsubscribeMut.mutateAsync({ endpoint: sub.endpoint }).catch(() => null);
        await sub.unsubscribe();
      }
      setState("off");
    } catch (err) {
      console.error("disable web push failed", err);
      setState("on");
    }
  };

  let label = "Off";
  let onClick: (() => void) | undefined = enable;
  let disabled = false;
  let active = false;

  if (state === "loading") {
    label = "…";
    disabled = true;
  } else if (state === "unsupported") {
    label = "N/A";
    disabled = true;
  } else if (state === "denied") {
    label = "Blocked";
    disabled = true;
  } else if (state === "busy") {
    label = "…";
    disabled = true;
  } else if (state === "on") {
    label = "On";
    active = true;
    onClick = disable;
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-ink">Push notifications on this device</p>
          <p className="text-xs text-muted mt-0.5">
            {state === "unsupported"
              ? "This browser doesn't support push. Install the app to enable it."
              : state === "denied"
                ? "Blocked in browser settings. Re-allow notifications for this site."
                : "Get notified of new messages even when the app is closed."}
          </p>
        </div>
        <button
          onClick={onClick}
          disabled={disabled}
          className={`min-w-16 border px-3 py-2 font-mono text-xs uppercase tracking-[0.08em] disabled:opacity-40 ${
            active
              ? "bg-ink text-surface border-ink"
              : "bg-surface-2 text-muted border-border hover:text-ink"
          }`}
        >
          {label}
        </button>
      </div>
      {state === "on" && (
        <div className="mt-2">
          <button
            onClick={runTest}
            disabled={testMut.isPending}
            className="border border-border bg-surface-2 px-3 py-2 font-mono text-xs text-muted hover:text-ink disabled:opacity-40"
          >
            Send test notification
          </button>
          {testResult && (
            <pre className="mt-2 max-w-full overflow-x-auto whitespace-pre-wrap break-all border border-border bg-surface-2 p-2 font-mono text-[10px] text-ink">
              {testResult}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
