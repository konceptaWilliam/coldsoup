"use client";

import { useEffect, useState } from "react";

// The app is portrait-only on phones. The manifest's `orientation: "portrait"`
// covers installed Android PWAs; iOS ignores it, so when a phone is held
// sideways we cover the app with a "rotate back" screen.
//
// Uses screen orientation, not the viewport's aspect ratio: an open keyboard
// can make a portrait viewport wider than tall, which must not trigger this.

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

export function OrientationGuard() {
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    if (!isPhone()) return;

    // Works in installed Android PWAs / fullscreen; rejects elsewhere.
    const orientation = window.screen.orientation as ScreenOrientation & {
      lock?: (o: "portrait") => Promise<void>;
    };
    orientation?.lock?.("portrait").catch(() => {});

    const update = () => setBlocked(isLandscape());
    update();
    window.screen.orientation?.addEventListener("change", update);
    window.addEventListener("orientationchange", update);
    window.addEventListener("resize", update);
    return () => {
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
