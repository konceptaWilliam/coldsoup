"use client";

import { useEffect } from "react";
import { InstallPrompt } from "./install-prompt";

export function PwaManager() {
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

  return <InstallPrompt />;
}
