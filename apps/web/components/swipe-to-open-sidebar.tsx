"use client";

import { useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useMobileSidebar } from "@/lib/mobile-sidebar-context";

export function SwipeToOpenSidebar({ children }: { children: React.ReactNode }) {
  const { open, isOpen } = useMobileSidebar();
  const pathname = usePathname();
  const router = useRouter();
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);

  const isOnThread = /\/t\//.test(pathname);

  function onTouchStart(e: React.TouchEvent) {
    if (isOpen) return;
    const touch = e.touches[0];
    startX.current = touch.clientX;
    startY.current = touch.clientY;
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (startX.current === null || startY.current === null) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - startX.current;
    const dy = Math.abs(touch.clientY - startY.current);
    const sx = startX.current;
    startX.current = null;
    startY.current = null;

    if (dx > 60 && dy < dx) {
      if (isOnThread) {
        // Edge-only: a mid-screen right-swipe is the swipe-to-reply gesture on a
        // message. Restricting back to a left-edge start (past the avatar column)
        // keeps the two from firing together.
        if (sx < 44) router.back();
      } else if (sx < 80) {
        open();
      }
    }
  }

  return (
    <main
      className="flex-1 flex overflow-hidden min-w-0"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {children}
    </main>
  );
}
