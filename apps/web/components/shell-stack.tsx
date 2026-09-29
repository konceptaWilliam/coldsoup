"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useMobileSidebar } from "@/lib/mobile-sidebar-context";
import { consumeInternalBack, navigateBack } from "@/lib/shell-route";
import { shouldCommitSwipe, SWIPE_EDGE_PX, SWIPE_LOCK_PX } from "@/lib/swipe";

const DURATION_MS = 300;
const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";
const LIST_PARALLAX_PCT = 25;
const DIM_OPACITY = 0.1;

const mq = (q: string) => typeof window !== "undefined" && window.matchMedia(q).matches;
const isMobileLayout = () => !mq("(min-width: 768px)");
const isStandalone = () => mq("(display-mode: standalone), (display-mode: fullscreen)");
const reducedMotion = () => mq("(prefers-reduced-motion: reduce)");

type Drag = {
  startX: number;
  startY: number;
  locked: "x" | "none" | null;
  samples: { x: number; t: number }[];
};

// Mobile: thread list and thread pane are stacked layers; the pane slides in
// over the list (iOS-style push) and can be dragged back from the left edge.
// Desktop (md+): plain side-by-side row, no transforms (md:!transform-none).
export function ShellStack({
  groupId,
  threadId,
  list,
  empty,
  renderPane,
}: {
  groupId: string | null;
  threadId: string | null;
  list: ReactNode;
  empty: ReactNode;
  renderPane: (threadId: string) => ReactNode;
}) {
  const { open: openSidebar, isOpen: sidebarOpen } = useMobileSidebar();
  // The pane keeps rendering the last thread while it slides out.
  const [renderedThreadId, setRenderedThreadId] = useState<string | null>(threadId);
  const [animating, setAnimating] = useState(false);
  const paneRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const dimRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const sidebarSwipeRef = useRef<{ x: number; y: number } | null>(null);
  const prevThreadIdRef = useRef<string | null>(threadId);
  // Last applied progress; lets a pop that arrives after the swipe already
  // finished sliding end at once instead of waiting for a transitionend that
  // an unchanged transform will never fire.
  const progressRef = useRef(threadId ? 0 : 1);
  // A close is under way: clear the rendered thread when it ends.
  const closingRef = useRef(false);
  // Fallback in case transitionend never arrives (cancelled, backgrounded).
  const fallbackTimerRef = useRef<number | null>(null);

  function clearFallback() {
    if (fallbackTimerRef.current !== null) {
      window.clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
  }

  function finishTransition() {
    clearFallback();
    setAnimating(false);
    if (closingRef.current) {
      closingRef.current = false;
      setRenderedThreadId(null);
    }
    if (paneRef.current) paneRef.current.style.willChange = "";
  }

  useEffect(() => clearFallback, []);

  // progress: 0 = pane fully open, 1 = pane fully closed.
  function apply(progress: number, withTransition: boolean) {
    const pane = paneRef.current;
    const listEl = listRef.current;
    const dim = dimRef.current;
    if (!pane || !listEl || !dim) return;
    const unchanged = progress === progressRef.current;
    progressRef.current = progress;
    if (withTransition && unchanged) {
      // Already there, or already sliding there: let that transition end, or
      // end now if nothing is running (no transitionend would fire).
      if (fallbackTimerRef.current === null) finishTransition();
      return;
    }
    clearFallback();
    const transition = withTransition
      ? `transform ${DURATION_MS}ms ${EASE}, opacity ${DURATION_MS}ms ${EASE}`
      : "none";
    pane.style.transition = transition;
    listEl.style.transition = transition;
    dim.style.transition = transition;
    pane.style.transform = `translateX(${progress * 100}%)`;
    listEl.style.transform = `translateX(${-LIST_PARALLAX_PCT * (1 - progress)}%)`;
    dim.style.opacity = String(DIM_OPACITY * (1 - progress));
    if (withTransition) {
      fallbackTimerRef.current = window.setTimeout(finishTransition, DURATION_MS + 100);
    }
  }

  // Initial position (deep link into a thread renders open, no slide).
  useLayoutEffect(() => {
    apply(threadId ? 0 : 1, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    const prev = prevThreadIdRef.current;
    prevThreadIdRef.current = threadId;
    if (prev === threadId) return;
    const motion = isMobileLayout() && !reducedMotion();

    if (threadId) {
      // Push (or thread→thread swap while open: no slide). Opening during a
      // close cancels the close.
      setRenderedThreadId(threadId);
      if (!prev) {
        closingRef.current = false;
        setAnimating(motion);
        apply(0, motion);
      }
      return;
    }

    // Pop. In a browser tab, Safari/Chrome may already have animated their own
    // swipe-back, so only animate pops we started or that happen in the PWA.
    const internal = consumeInternalBack();
    const animate = motion && (isStandalone() || internal);
    closingRef.current = true;
    if (animate) {
      setAnimating(true);
      apply(1, true);
    } else {
      apply(1, false);
      finishTransition();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  function onTransitionEnd(e: React.TransitionEvent) {
    if (e.target !== paneRef.current || e.propertyName !== "transform") return;
    finishTransition();
  }

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    if (!t || e.touches.length > 1) return;
    if (!threadId) {
      // List view: left-edge swipe opens the sidebar (unchanged behaviour).
      if (!sidebarOpen) sidebarSwipeRef.current = { x: t.clientX, y: t.clientY };
      return;
    }
    if (!isMobileLayout() || !isStandalone() || animating) return;
    if (t.clientX >= SWIPE_EDGE_PX) return;
    dragRef.current = {
      startX: t.clientX,
      startY: t.clientY,
      locked: null,
      samples: [{ x: t.clientX, t: e.timeStamp }],
    };
  }

  function onTouchMove(e: React.TouchEvent) {
    const d = dragRef.current;
    const t = e.touches[0];
    if (!d || !t) return;
    if (e.touches.length > 1) return cancelDrag();
    const dx = t.clientX - d.startX;
    const dy = t.clientY - d.startY;
    if (d.locked === null) {
      if (Math.abs(dx) < SWIPE_LOCK_PX && Math.abs(dy) < SWIPE_LOCK_PX) return;
      d.locked = dx > 0 && Math.abs(dx) > Math.abs(dy) ? "x" : "none";
      if (d.locked === "none") {
        dragRef.current = null;
        return;
      }
      // Close the keyboard so it doesn't ride along with the pane.
      (document.activeElement as HTMLElement | null)?.blur?.();
      if (paneRef.current) paneRef.current.style.willChange = "transform";
    }
    const width = paneRef.current?.offsetWidth || window.innerWidth;
    apply(Math.min(1, Math.max(0, dx / width)), false);
    d.samples.push({ x: t.clientX, t: e.timeStamp });
    while (d.samples.length > 2 && e.timeStamp - d.samples[0].t > 100) d.samples.shift();
  }

  function cancelDrag() {
    if (!dragRef.current) return;
    dragRef.current = null;
    apply(0, true);
  }

  function onTouchEnd(e: React.TouchEvent) {
    const sw = sidebarSwipeRef.current;
    sidebarSwipeRef.current = null;
    if (sw) {
      const t = e.changedTouches[0];
      if (t) {
        const dx = t.clientX - sw.x;
        const dy = Math.abs(t.clientY - sw.y);
        if (dx > 60 && dy < dx && sw.x < 80) openSidebar();
      }
      return;
    }

    const d = dragRef.current;
    dragRef.current = null;
    if (!d || d.locked !== "x") return;
    const t = e.changedTouches[0];
    const x = t?.clientX ?? d.samples[d.samples.length - 1].x;
    const dx = x - d.startX;
    const first = d.samples[0];
    const dt = Math.max(1, e.timeStamp - first.t);
    const velocity = (x - first.x) / dt;
    const width = paneRef.current?.offsetWidth || window.innerWidth;

    if (shouldCommitSwipe({ dx, width, velocity })) {
      closingRef.current = true;
      setAnimating(true);
      apply(1, true);
      if (groupId) navigateBack(`/g/${groupId}`);
    } else {
      apply(0, true);
    }
  }

  return (
    <main
      // overflow-clip (not hidden): children's scrollIntoView can't scroll it
      // sideways and expose the off-screen pane.
      className="relative flex-1 flex overflow-clip min-w-0"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={cancelDrag}
    >
      <div
        ref={listRef}
        className="absolute inset-0 flex md:static md:inset-auto md:w-auto md:flex-shrink-0 md:!transform-none md:!transition-none"
      >
        {list}
      </div>
      <div
        ref={dimRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-black opacity-0 md:hidden"
      />
      <div
        ref={paneRef}
        onTransitionEnd={onTransitionEnd}
        className="absolute inset-0 flex bg-surface shadow-[-8px_0_24px_rgba(0,0,0,0.08)] md:shadow-none md:static md:inset-auto md:flex-1 md:min-w-0 md:!transform-none md:!transition-none"
        style={{ transform: threadId ? "translateX(0%)" : "translateX(100%)" }}
      >
        {renderedThreadId ? renderPane(renderedThreadId) : empty}
      </div>
    </main>
  );
}
