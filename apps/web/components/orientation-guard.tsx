"use client";

import { useEffect, useState } from "react";

// The app is portrait-only on phones. The manifest's `orientation: "portrait"`
// covers installed Android PWAs; iOS ignores it, so when a phone is held
// sideways we cover the app with a "rotate back" screen.
//
// Uses screen orientation, not the viewport's aspect ratio: an open keyboard
// can make a portrait viewport wider than tall, which must not trigger this.
//
// The overlay alone isn't enough: iOS still rotates the page underneath, and
// the installed PWA comes back to portrait with the document scrolled (despite
// html/body overflow:hidden), pushing the whole shell up until a relaunch.
// So every orientation flip also snaps the document back to 0,0.

function isPhone(): boolean {
  if (!window.matchMedia("(pointer: coarse)").matches) return false;
  return Math.min(window.screen.width, window.screen.height) < 600;
}

function isLandscape(): boolean {
  const type = window.screen.orientation?.type;
  if (type) return type.startsWith("landscape");
  // Older iOS Safari (< 16.4) only has the legacy window.orientation.
  const legacy = (window as unknown as { orientation?: number }).orientation;
  return legacy === 90 || legacy === -90;
}

function resetDocumentScroll() {
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}

// iOS applies the new viewport over several frames, so a single reset can land
// before the offset does. Repeat across the settle window.
const SETTLE_MS = [0, 100, 300, 600, 1000];

export function OrientationGuard() {
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    if (!isPhone()) return;

    // Works in installed Android PWAs / fullscreen; rejects elsewhere.
    const orientation = window.screen.orientation as ScreenOrientation & {
      lock?: (o: "portrait") => Promise<void>;
    };
    orientation?.lock?.("portrait").catch(() => {});

    let landscape = isLandscape();
    let timers: ReturnType<typeof setTimeout>[] = [];
    setBlocked(landscape);

    // Fires on resize too, but only acts on a real orientation flip. Plain
    // resizes include the soft keyboard, where iOS scrolls the document on
    // purpose to keep the input visible; resetting then would hide it.
    const update = () => {
      const next = isLandscape();
      if (next === landscape) return;
      landscape = next;
      setBlocked(next);
      // The app can't be used sideways; drop the keyboard so it doesn't
      // carry a stale scroll offset back into portrait.
      if (next) (document.activeElement as HTMLElement | null)?.blur?.();
      timers.forEach(clearTimeout);
      timers = SETTLE_MS.map((ms) => setTimeout(resetDocumentScroll, ms));
    };
    window.screen.orientation?.addEventListener("change", update);
    window.addEventListener("orientationchange", update);
    window.addEventListener("resize", update);
    return () => {
      timers.forEach(clearTimeout);
      window.screen.orientation?.removeEventListener("change", update);
      window.removeEventListener("orientationchange", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  if (!blocked) return null;

  return (
    <div
      className="fixed inset-0 z-[1000] flex flex-col items-center justify-center bg-surface text-ink px-safe"
      role="alertdialog"
      aria-label="Rotate your device"
    >
      <p className="font-mono text-sm">Rotate your phone back to portrait.</p>
    </div>
  );
}
