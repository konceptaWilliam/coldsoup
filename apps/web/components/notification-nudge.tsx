"use client";

import { useEffect, useState } from "react";
import { useNotificationStatus } from "@/lib/use-notification-status";

const DAY = 86_400_000;
// Days that must elapse before the Nth appearance (0-indexed). After the last
// slot we stop nudging — repeated asks burn goodwill faster than they convert.
const GAPS_DAYS = [1, 4, 14];

const FIRST_KEY = "notifNudge:firstAt";
const LAST_KEY = "notifNudge:lastAt";
const COUNT_KEY = "notifNudge:count";
const DONE_KEY = "notifNudge:done";

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isMobileBrowser() {
  if (typeof window === "undefined") return false;
  return /iphone|ipad|ipod|android/i.test(window.navigator.userAgent);
}

export function NotificationNudge() {
  const { status, enable } = useNotificationStatus();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status !== "off") return;
    // On a mobile browser that isn't installed, the install prompt is the right
    // nudge (installing is what unlocks reliable push) — don't double up here.
    if (isMobileBrowser() && !isStandalone()) return;

    try {
      if (localStorage.getItem(DONE_KEY)) return;
      const count = parseInt(localStorage.getItem(COUNT_KEY) || "0", 10) || 0;
      if (count >= GAPS_DAYS.length) return;

      const now = Date.now();
      let firstAt = parseInt(localStorage.getItem(FIRST_KEY) || "0", 10) || 0;
      if (!firstAt) {
        firstAt = now;
        localStorage.setItem(FIRST_KEY, String(now));
      }
      const lastAt = parseInt(localStorage.getItem(LAST_KEY) || "0", 10) || firstAt;
      const anchor = count === 0 ? firstAt : lastAt;
      if (now - anchor < GAPS_DAYS[count] * DAY) return;

      // Consume this slot up front so navigating away doesn't re-show it.
      localStorage.setItem(LAST_KEY, String(now));
      localStorage.setItem(COUNT_KEY, String(count + 1));
      setVisible(true);
    } catch {
      /* localStorage unavailable — skip the nudge */
    }
  }, [status]);

  const enableNow = async () => {
    setBusy(true);
    const ok = await enable();
    setBusy(false);
    setVisible(false);
    if (ok) {
      try {
        localStorage.setItem(DONE_KEY, "1");
      } catch {}
    }
  };

  const dismiss = () => setVisible(false);

  if (!visible || status !== "off") return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-surface-2 px-safe pb-safe"
      role="dialog"
      aria-label="Enable notifications"
    >
      <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
        <div className="flex-1 text-sm text-ink">
          <span className="font-mono">
            Turn on notifications so you don&rsquo;t miss replies.
          </span>
        </div>
        <button
          onClick={enableNow}
          disabled={busy}
          className="bg-ink px-3 py-2 font-mono text-xs uppercase tracking-[0.08em] text-surface disabled:opacity-40"
        >
          {busy ? "…" : "Enable"}
        </button>
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          className="px-2 py-2 font-mono text-xs text-muted"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
