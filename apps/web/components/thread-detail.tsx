"use client";

import { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from "react";
import { Avatar } from "./avatar";
import type { Expression } from "blobatar";
import { happy, love, sad, thinking } from "blobatar/expression";
import { createGazeField, type GazeField } from "@/lib/gaze-field";

// useLayoutEffect on the client (positions scroll before paint), useEffect on
// the server to avoid the SSR warning.
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;
import { navigateBack } from "@/lib/shell-route";
import { SWIPE_EDGE_PX } from "@/lib/swipe";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { trpc } from "@/lib/trpc/client";
import { createClient, getPresenceClient } from "@/lib/supabase/client";
import { useUnreadActions } from "@/lib/unread-context";
import { useOnline } from "@/lib/presence-context";
import { haptic } from "@/lib/haptics";
import { playSend, playReceive } from "@/lib/sound";
import { SMeterCreateModal, type SMeterSummary } from "@/components/smeter";
import { useBlob } from "@/lib/use-blob";
import { BlobLevel } from "@/components/blob-level";
import { EvolveModal, evolveSpec, type RevealSpec } from "@/components/evolve-modal";
import {
  REACTION_DEFAULTS,
  type Attachment,
  type Message,
  type ReplyTo,
  type ThreadStatus,
} from "@/lib/thread-types";
import { useThreadMessages } from "@/lib/use-thread-messages";
import { flatten } from "@/lib/thread-cache";
import { formatTime, SystemMessage } from "@/components/thread/message-parts";
import { buildMentionMatcher, mentionsUser, MENTION_SPECIALS } from "@/lib/mentions";
import { MessageRow, type ReplyTarget, type RowActions } from "@/components/thread/message-row";
import { useStableActions } from "@/lib/use-stable-actions";
import { Composer, type ComposerHandle } from "@/components/thread/composer";
import { EMPTY_READERS } from "@/lib/row-props-equal";

type ProfileTarget = {
  id: string | null;
  name: string;
};

const BOTTOM_THRESHOLD_PX = 120;
// Stable empty defaults so memos keyed on them don't recompute every render.
const EMPTY_MEMBERS: { id: string; display_name: string; avatar_url: string | null; role: string }[] = [];
const EMPTY_RECEIPTS: never[] = [];

function isScrolledNearBottom(container: HTMLElement): boolean {
  return (
    container.scrollHeight - container.scrollTop - container.clientHeight <=
    BOTTOM_THRESHOLD_PX
  );
}

function PollCreateModal({
  onSubmit,
  onClose,
  isPending,
}: {
  onSubmit: (question: string, options: string[]) => void;
  onClose: () => void;
  isPending: boolean;
}) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>([""]);

  function setOption(i: number, val: string) {
    setOptions((prev) => prev.map((o, idx) => (idx === i ? val : o)));
  }

  function addOption() {
    setOptions((prev) => [...prev, ""]);
  }

  function removeOption(i: number) {
    setOptions((prev) => prev.filter((_, idx) => idx !== i));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;
    const validOptions = options.map((o) => o.trim()).filter(Boolean);
    onSubmit(question.trim(), validOptions);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/20"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-surface border border-border w-full max-w-[calc(100vw-16px)] sm:max-w-md mx-2 sm:mx-4 p-4 sm:p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="font-mono text-sm font-semibold text-ink mb-4">
          Create poll
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block font-mono text-xs text-muted uppercase tracking-wider mb-1.5">
              Question
            </label>
            <input
              autoFocus
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              maxLength={500}
              placeholder="What do you want to ask?"
              className="w-full border border-border bg-surface-2 px-3 py-2 text-base md:text-sm text-ink placeholder:text-muted focus:outline-none focus:border-ink transition-colors"
            />
          </div>
          <div>
            <label className="block font-mono text-xs text-muted uppercase tracking-wider mb-1.5">
              Options{" "}
              <span className="normal-case text-muted-2">
                (optional — anyone can add more later)
              </span>
            </label>
            <div className="space-y-1.5">
              {options.map((opt, i) => (
                <div key={i} className="flex gap-1.5">
                  <input
                    value={opt}
                    onChange={(e) => setOption(i, e.target.value)}
                    maxLength={200}
                    placeholder={`Option ${i + 1}`}
                    className="flex-1 border border-border bg-surface-2 px-3 py-1.5 text-base md:text-sm text-ink placeholder:text-muted focus:outline-none focus:border-ink transition-colors"
                  />
                  {options.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeOption(i)}
                      className="font-mono text-base text-muted hover:text-ink px-1"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addOption}
              className="mt-1.5 font-mono text-[11px] text-muted hover:text-ink transition-colors"
            >
              + add option
            </button>
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <button
              type="button"
              onClick={onClose}
              className="font-mono text-sm text-muted hover:text-ink px-4 py-2 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!question.trim() || isPending}
              className="bg-ink text-surface font-mono text-sm px-4 py-2 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-ink/90 transition-colors"
            >
              {isPending ? "Sending…" : "Send poll"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// Distinct haptic for an incoming @mention — a double pulse, clearly different
// from the single `light` tap fired on send.
const MENTION_HAPTIC: VibratePattern = [12, 30, 12];

// Download an attachment (or share it via the Web Share API on mobile when
// available). Falls back to opening the URL in a new tab on failure.
async function downloadAttachment(attachment: Attachment) {
  try {
    const res = await fetch(attachment.url);
    const blob = await res.blob();
    const file = new File([blob], attachment.name, { type: blob.type });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file] });
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = attachment.name;
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    window.open(attachment.url, "_blank");
  }
}

// Long-press / hold actions for an attachment: download + reply. Opened by
// holding (or right-clicking) an image — the plain tap opens the zoomable
// lightbox instead.
function AttachmentActions({
  attachment,
  onReply,
  onClose,
}: {
  attachment: Attachment;
  onReply: () => void;
  onClose: () => void;
}) {
  // Swipe-down-to-dismiss (mobile), matching the S-meter sheet.
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{ y: number; scroll: number } | null>(null);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);

  function onSheetTouchStart(e: React.TouchEvent) {
    dragStart.current = {
      y: e.touches[0].clientY,
      scroll: sheetRef.current?.scrollTop ?? 0,
    };
  }
  function onSheetTouchMove(e: React.TouchEvent) {
    const s = dragStart.current;
    if (!s) return;
    const dy = e.touches[0].clientY - s.y;
    if (s.scroll <= 0 && dy > 0) {
      setDragging(true);
      setDragY(dy);
    }
  }
  function onSheetTouchEnd() {
    if (dragStart.current && dragY > 110) onClose();
    else setDragY(0);
    setDragging(false);
    dragStart.current = null;
  }

  async function handleDownload() {
    await downloadAttachment(attachment);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-[60]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-surface w-full sm:max-w-sm max-h-[80vh] flex flex-col border border-border"
        onTouchStart={onSheetTouchStart}
        onTouchMove={onSheetTouchMove}
        onTouchEnd={onSheetTouchEnd}
        style={{
          transform: dragY ? `translateY(${dragY}px)` : undefined,
          transition: dragging ? "none" : "transform 0.2s ease",
        }}
      >
        {/* Drag handle (swipe-down-to-dismiss affordance, mobile only) */}
        <div className="sm:hidden flex justify-center pt-2 pb-1 flex-shrink-0">
          <div className="h-1 w-9 rounded-full bg-border-strong" />
        </div>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
          <span className="font-mono text-xs text-muted truncate flex-1 mr-4">
            {attachment.name}
          </span>
          <button
            onClick={onClose}
            className="font-mono text-xl leading-none text-muted hover:text-ink transition-colors w-10 h-10 flex items-center justify-center flex-shrink-0"
          >
            ×
          </button>
        </div>

        <div ref={sheetRef} className="flex-1 overflow-y-auto min-h-0 p-2">
          <div className="space-y-1">
            <button
              onClick={handleDownload}
              className="w-full text-left px-3 py-3 font-mono text-sm text-ink hover:bg-border/40 transition-colors"
            >
              Download
            </button>
            <button
              onClick={() => {
                onReply();
                onClose();
              }}
              className="w-full text-left px-3 py-3 font-mono text-sm text-ink hover:bg-border/40 transition-colors"
            >
              Reply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Fullscreen, zoomable image viewer. Plain tap on a sent image opens this;
// pinch / wheel / double-tap to zoom, drag to pan when zoomed. No frame, no
// action chrome — actions live in the hold menu (AttachmentActions).
function ImageLightbox({
  images,
  index,
  onDownload,
  onReply,
  onClose,
}: {
  images: Attachment[];
  index: number;
  onDownload: (att: Attachment) => void;
  onReply: (att: Attachment) => void;
  onClose: () => void;
}) {
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const [current, setCurrent] = useState(index);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(
    null,
  );
  const modeRef = useRef<"none" | "swipe" | "pan">("none");
  const pinchRef = useRef<{ dist: number; scale: number } | null>(null);
  const movedRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  // Synchronous mirror of {scale,tx,ty} so back-to-back wheel/pan events
  // compute off the latest values instead of a stale render closure.
  const viewRef = useRef({ scale: 1, tx: 0, ty: 0 });

  const MAX = 6;

  // Clamp pan so the scaled image always covers the viewport — no dragging it
  // into empty space. Max offset on each axis is half the overflow; if the
  // image is smaller than the viewport on that axis, it stays centered.
  const setView = useCallback(
    (v: { scale: number; tx: number; ty: number }) => {
      const img = imgRef.current;
      const vpW = window.innerWidth;
      const vpH = window.innerHeight;
      const bw = img?.offsetWidth ?? vpW;
      const bh = img?.offsetHeight ?? vpH;
      const maxX = Math.max(0, (bw * v.scale - vpW) / 2);
      const maxY = Math.max(0, (bh * v.scale - vpH) / 2);
      const nv = {
        scale: v.scale,
        tx: Math.min(maxX, Math.max(-maxX, v.tx)),
        ty: Math.min(maxY, Math.max(-maxY, v.ty)),
      };
      viewRef.current = nv;
      setScale(nv.scale);
      setTx(nv.tx);
      setTy(nv.ty);
    },
    [],
  );

  const resetView = useCallback(() => {
    setView({ scale: 1, tx: 0, ty: 0 });
  }, [setView]);

  const go = useCallback(
    (dir: 1 | -1) => {
      setCurrent((c) => {
        const next = c + dir;
        if (next < 0 || next >= images.length) return c;
        resetView();
        return next;
      });
      setDragX(0);
      setDragging(false);
    },
    [images.length, resetView],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, go]);

  // Scale about a screen point (cursor) so the pixel under the pointer stays
  // put. Reads the latest transform from viewRef (not the render closure).
  function zoomTo(next: number, clientX?: number, clientY?: number) {
    const { scale: s, tx: ctx, ty: cty } = viewRef.current;
    const ns = Math.min(MAX, Math.max(1, next));
    if (ns <= 1) {
      setView({ scale: 1, tx: 0, ty: 0 });
      return;
    }
    const el = containerRef.current;
    if (!el || clientX == null || clientY == null) {
      setView({ scale: ns, tx: ctx, ty: cty });
      return;
    }
    const r = el.getBoundingClientRect();
    const px = clientX - (r.left + r.width / 2);
    const py = clientY - (r.top + r.height / 2);
    const ratio = ns / s;
    setView({
      scale: ns,
      tx: px - (px - ctx) * ratio,
      ty: py - (py - cty) * ratio,
    });
  }

  // Pinch zoom about screen center (touch).
  const applyScale = useCallback(
    (next: number) => {
      const ns = Math.min(MAX, Math.max(1, next));
      const v = viewRef.current;
      setView(
        ns <= 1 ? { scale: 1, tx: 0, ty: 0 } : { scale: ns, tx: v.tx, ty: v.ty },
      );
    },
    [setView],
  );

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * 0.0025);
    zoomTo(viewRef.current.scale * factor, e.clientX, e.clientY);
  }

  function toggleZoom(e: React.MouseEvent) {
    if (viewRef.current.scale > 1) {
      setView({ scale: 1, tx: 0, ty: 0 });
    } else {
      zoomTo(2.5, e.clientX, e.clientY);
    }
  }

  function onPointerDown(e: React.PointerEvent) {
    if (pinchRef.current) return;
    movedRef.current = false;
    modeRef.current = "none";
    startRef.current = {
      x: e.clientX,
      y: e.clientY,
      tx: viewRef.current.tx,
      ty: viewRef.current.ty,
    };
  }

  function onPointerMove(e: React.PointerEvent) {
    const st = startRef.current;
    if (!st || pinchRef.current) return;
    const dx = e.clientX - st.x;
    const dy = e.clientY - st.y;

    if (modeRef.current === "none") {
      if (scale > 1) modeRef.current = "pan";
      else if (Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy))
        modeRef.current = "swipe";
      else return;
      // Capture only once an actual drag begins, so a plain tap still
      // delivers its click (and never hijacks the nav/close buttons).
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    }

    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) movedRef.current = true;
    setDragging(true);

    if (modeRef.current === "pan") {
      setView({ scale: viewRef.current.scale, tx: st.tx + dx, ty: st.ty + dy });
    } else {
      // Rubber-band against the ends of the gallery.
      const atEnd =
        (current === 0 && dx > 0) ||
        (current === images.length - 1 && dx < 0);
      setDragX(atEnd ? dx * 0.35 : dx);
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    const st = startRef.current;
    startRef.current = null;
    setDragging(false);

    if (modeRef.current === "swipe" && st) {
      const dx = e.clientX - st.x;
      const W = window.innerWidth;
      const threshold = Math.min(120, W * 0.18);
      if (dx <= -threshold && current < images.length - 1) {
        setCurrent(current + 1);
        resetView();
      } else if (dx >= threshold && current > 0) {
        setCurrent(current - 1);
        resetView();
      }
      setDragX(0);
    }
    modeRef.current = "none";
  }

  // Close on a stationary tap outside the image. Handled on `click` (not
  // pointerup) so unmounting can't leak the click to the page behind.
  function onClick(e: React.MouseEvent) {
    if (movedRef.current) return;
    const r = imgRef.current?.getBoundingClientRect();
    const outside =
      !r ||
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom;
    if (outside) onClose();
  }

  function onTouchMove(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      const [a, b] = [e.touches[0], e.touches[1]];
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      if (pinchRef.current) {
        applyScale(pinchRef.current.scale * (dist / pinchRef.current.dist));
      } else {
        pinchRef.current = { dist, scale };
      }
      movedRef.current = true;
    }
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (e.touches.length < 2) pinchRef.current = null;
  }

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[70] bg-black/90 overflow-hidden select-none"
      style={{ touchAction: "none", userSelect: "none", WebkitUserSelect: "none" }}
      onWheel={onWheel}
      // Keep swipes inside the lightbox — don't let them bubble to the
      // swipe-to-go-back gesture on <main> (would return to the thread list).
      onTouchStart={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
    >
      {/* Sliding gallery track — all slides in a row, translated into view. */}
      <div
        className="absolute inset-0 flex"
        style={{
          transform: `translateX(calc(${-current} * 100vw + ${dragX}px))`,
          transition: dragging
            ? "none"
            : "transform 0.32s cubic-bezier(0.22, 0.61, 0.36, 1)",
          cursor: scale > 1 ? "grab" : "default",
          touchAction: "none",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClick={onClick}
      >
        {images.map((att, i) => {
          const isCurrent = i === current;
          return (
            <div
              key={att.url}
              className="flex-none w-screen h-full flex items-center justify-center"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={(el) => {
                  if (isCurrent) imgRef.current = el;
                }}
                src={att.url}
                alt={att.name}
                draggable={false}
                onDragStart={(e) => e.preventDefault()}
                onDoubleClick={isCurrent ? toggleZoom : undefined}
                className="max-w-[96vw] max-h-[92vh] object-contain select-none"
                style={{
                  transform: isCurrent
                    ? `translate(${tx}px, ${ty}px) scale(${scale})`
                    : undefined,
                  transition:
                    dragging || pinchRef.current
                      ? "none"
                      : "transform 0.15s ease",
                  cursor: isCurrent && scale > 1 ? "grab" : "zoom-in",
                  touchAction: "none",
                  WebkitTouchCallout: "none",
                }}
                loading={isCurrent ? "eager" : "lazy"}
              />
            </div>
          );
        })}
      </div>

      {/* Per-image actions — reachable even for images hidden behind the +N
          tile in the grid, where the hold menu can't be opened. */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-1">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDownload(images[current]);
          }}
          aria-label="Download image"
          className="font-mono text-xs uppercase tracking-wider text-white/80 hover:text-white px-3 h-11 flex items-center justify-center"
        >
          Download
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onReply(images[current]);
            onClose();
          }}
          aria-label="Reply to image"
          className="font-mono text-xs uppercase tracking-wider text-white/80 hover:text-white px-3 h-11 flex items-center justify-center"
        >
          Reply
        </button>
        <button
          onClick={onClose}
          aria-label="Close"
          className="font-mono text-2xl leading-none text-white/80 hover:text-white w-11 h-11 flex items-center justify-center"
        >
          ×
        </button>
      </div>
      {images.length > 1 && (
        <>
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 font-mono text-xs text-white/80 tabular-nums pointer-events-none select-none">
            {current + 1} / {images.length}
          </div>
          {current > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                go(-1);
              }}
              aria-label="Previous image"
              className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-11 h-11 flex items-center justify-center font-mono text-3xl leading-none text-white/70 hover:text-white"
            >
              ‹
            </button>
          )}
          {current < images.length - 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                go(1);
              }}
              aria-label="Next image"
              className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-11 h-11 flex items-center justify-center font-mono text-3xl leading-none text-white/70 hover:text-white"
            >
              ›
            </button>
          )}
        </>
      )}
    </div>
  );
}

function formatLastSeen(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en", { month: "short", day: "numeric" });
}

function ProfileCard({
  target,
  onClose,
}: {
  target: ProfileTarget | null;
  onClose: () => void;
}) {
  const { isOnline } = useOnline();
  const online = isOnline(target?.id);
  const { data: lastSeen } = trpc.profile.lastSeen.useQuery(
    { userId: target?.id ?? "" },
    { enabled: !!target?.id && !online },
  );
  if (!target) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-ink/25 flex items-center justify-center p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-xs bg-surface border border-border p-6 shadow-lg text-center">
        <div className="flex justify-end -mt-2 -mr-2">
          <button
            onClick={onClose}
            className="font-mono text-lg leading-none text-muted hover:text-ink"
          >
            x
          </button>
        </div>
        <div className="flex justify-center">
          <Avatar
            userId={target.id}
            name={target.name}
            size={96}
            animate="always"
            followPointer
          />
        </div>
        <p className="mt-4 text-base font-semibold text-ink break-words">
          {target.name}
        </p>
        {target.id && <BlobLevel userId={target.id} />}
        {online ? (
          <p className="mt-2 inline-flex items-center gap-1.5 font-mono text-[11px] text-online uppercase tracking-[0.08em]">
            <span className="w-2 h-2 rounded-full bg-online" />
            online
          </p>
        ) : lastSeen?.lastSeenAt ? (
          <p className="mt-2 font-mono text-[11px] text-muted uppercase tracking-[0.08em]">
            last seen {formatLastSeen(lastSeen.lastSeenAt)}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function formatDueDate(ymd: string): string {
  return new Date(`${ymd}T00:00:00`).toLocaleDateString("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function ThreadDetailsPanel({
  threadId,
  groupId,
  onClose,
}: {
  threadId: string;
  groupId: string;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const { data: meta, isLoading } = trpc.threads.get.useQuery({ threadId });
  const { data: notifPrefs } = trpc.notifications.prefs.useQuery();
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!meta) return;
    setDueDate((meta as { due_date: string | null }).due_date ?? null);
    setTitle((meta as { title?: string }).title ?? "");
  }, [meta]);

  const creator =
    (meta as
      | {
          creator?: {
            id: string;
            display_name: string;
            avatar_url: string | null;
          } | null;
        }
      | undefined)?.creator ?? null;
  const isMuted = !!notifPrefs?.threadIds.includes(threadId);

  const setMeta = trpc.threads.setMeta.useMutation({
    onSuccess: () => {
      utils.threads.get.invalidate({ threadId });
      utils.threads.list.invalidate({ groupId });
      onClose();
    },
    onError: (err) => setError(err.message),
  });

  const rename = trpc.threads.rename.useMutation({
    onSuccess: () => {
      utils.threads.get.invalidate({ threadId });
      utils.threads.list.invalidate({ groupId });
    },
    onError: (err) => setError(err.message),
  });

  const metaTitle = (meta as { title?: string } | undefined)?.title ?? "";
  const trimmedTitle = title.trim();
  const titleChanged = trimmedTitle.length > 0 && trimmedTitle !== metaTitle;

  const setMute = trpc.notifications.setMute.useMutation({
    onMutate: async ({ targetId, muted }) => {
      await utils.notifications.prefs.cancel();
      const prev = utils.notifications.prefs.getData();
      utils.notifications.prefs.setData(undefined, (old) => {
        if (!old) return old;
        const set = new Set(old.threadIds);
        if (muted) set.add(targetId);
        else set.delete(targetId);
        return { ...old, threadIds: Array.from(set) };
      });
      return { prev };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) utils.notifications.prefs.setData(undefined, ctx.prev);
      setError(err.message);
    },
    onSettled: () => utils.notifications.prefs.invalidate(),
  });

  const deleteThread = trpc.threads.delete.useMutation({
    onSuccess: () => {
      utils.threads.list.invalidate({ groupId });
      onClose();
      navigateBack(`/g/${groupId}`);
    },
    onError: (err) => setError(err.message),
  });

  return (
    <div
      className="fixed inset-0 z-50 bg-ink/25 flex items-end md:items-stretch md:justify-end"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full md:w-[360px] max-h-[88vh] md:max-h-none bg-surface border-t md:border-t-0 md:border-l border-border overflow-y-auto shadow-lg">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h2 className="font-mono text-sm font-semibold text-ink">
            Thread details
          </h2>
          <button
            onClick={onClose}
            className="font-mono text-lg leading-none text-muted hover:text-ink transition-colors"
          >
            x
          </button>
        </div>

        <div className="p-4 space-y-6">
          {isLoading ? (
            <div className="space-y-6">
              <div>
                <div className="h-2.5 w-16 bg-border animate-pulse mb-2" />
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 bg-border animate-pulse" />
                  <div className="h-3.5 w-28 bg-border animate-pulse" />
                </div>
              </div>
              <div>
                <div className="h-2.5 w-16 bg-border animate-pulse mb-2" />
                <div className="h-9 w-full bg-border/60 animate-pulse" />
              </div>
              <div className="h-9 w-full bg-border/60 animate-pulse" />
              <div className="h-9 w-full bg-border/40 animate-pulse" />
            </div>
          ) : (
            <>
              <div>
                <label
                  htmlFor="thread-detail-title"
                  className="block font-mono text-[10px] text-muted uppercase tracking-wider mb-2"
                >
                  Thread name
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="thread-detail-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value.replace(/ /g, "_"))}
                    maxLength={200}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && titleChanged && !rename.isPending) {
                        rename.mutate({ threadId, title: trimmedTitle });
                      }
                    }}
                    className="flex-1 min-w-0 border border-border bg-surface-2 px-3 py-2 font-mono text-sm text-ink lowercase focus:outline-none focus:border-ink"
                  />
                  <button
                    type="button"
                    onClick={() => rename.mutate({ threadId, title: trimmedTitle })}
                    disabled={!titleChanged || rename.isPending}
                    className="font-mono text-xs text-ink border border-border bg-surface-2 px-3 py-2 hover:border-border-strong transition-colors disabled:opacity-40"
                  >
                    {rename.isPending ? "…" : "Rename"}
                  </button>
                </div>
              </div>

              <div>
                <p className="font-mono text-[10px] text-muted uppercase tracking-wider mb-2">
                  Assignee
                </p>
                {creator ? (
                  <div className="flex items-center gap-2">
                    <Avatar
                      userId={creator.id}
                      name={creator.display_name}
                      animate="hover"
                    />
                    <span className="text-sm text-ink">
                      {creator.display_name}
                    </span>
                  </div>
                ) : (
                  <p className="text-sm text-muted">Unassigned</p>
                )}
              </div>

              <div>
                <label
                  htmlFor="thread-detail-due-date"
                  className="block font-mono text-[10px] text-muted uppercase tracking-wider mb-2"
                >
                  Due date
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="thread-detail-due-date"
                    type="date"
                    value={dueDate ?? ""}
                    onChange={(e) => setDueDate(e.target.value || null)}
                    className="flex-1 border border-border bg-surface-2 px-3 py-2 text-sm text-ink focus:outline-none focus:border-ink"
                  />
                  {dueDate && (
                    <button
                      type="button"
                      onClick={() => setDueDate(null)}
                      className="font-mono text-xs text-muted hover:text-ink px-2 py-2"
                    >
                      Clear
                    </button>
                  )}
                </div>
                {dueDate && (
                  <p className="font-mono text-[10px] text-muted mt-1">
                    {formatDueDate(dueDate)}
                  </p>
                )}
              </div>

              {error && (
                <p className="text-xs text-red-600 whitespace-pre-wrap">
                  {error}
                </p>
              )}

              <button
                onClick={() => setMeta.mutate({ threadId, dueDate })}
                disabled={setMeta.isPending}
                className="w-full bg-ink text-surface font-mono text-sm py-2.5 disabled:opacity-40 hover:bg-ink/90 transition-colors"
              >
                {setMeta.isPending ? "Saving..." : "Save details"}
              </button>

              <div className="border-t border-border pt-4 space-y-2">
                <button
                  onClick={() =>
                    setMute.mutate({
                      targetType: "thread",
                      targetId: threadId,
                      muted: !isMuted,
                    })
                  }
                  disabled={setMute.isPending}
                  className="w-full border border-border bg-surface-2 text-ink font-mono text-xs py-2.5 hover:border-border-strong transition-colors disabled:opacity-40"
                >
                  {isMuted ? "Unmute thread" : "Mute thread"}
                </button>

                {confirmDelete ? (
                  <div className="border border-red-300 p-3 space-y-2">
                    <p className="font-mono text-[11px] text-red-600">
                      Delete this thread and all messages?
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => deleteThread.mutate({ threadId })}
                        disabled={deleteThread.isPending}
                        className="flex-1 bg-red-600 text-white font-mono text-xs py-2 disabled:opacity-40"
                      >
                        {deleteThread.isPending ? "Deleting..." : "Delete"}
                      </button>
                      <button
                        onClick={() => setConfirmDelete(false)}
                        className="font-mono text-xs text-muted hover:text-ink px-3 py-2"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="w-full border border-red-300 text-red-600 font-mono text-xs py-2.5 hover:bg-red-50 transition-colors"
                  >
                    Delete thread
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusControl({
  threadId,
  currentStatus,
  threadTitle,
}: {
  threadId: string;
  currentStatus: ThreadStatus;
  threadTitle: string;
}) {
  const [optimisticStatus, setOptimisticStatus] = useState<ThreadStatus | null>(
    null,
  );
  const [confirmReopen, setConfirmReopen] = useState<ThreadStatus | null>(null);
  // Ignore status clicks briefly after confirming — clicking "yes" swaps the
  // confirm bar back to the segmented control under the cursor, and the same
  // click would otherwise fall through and re-open the confirm.
  const clickLockUntil = useRef(0);
  const displayStatus = optimisticStatus ?? currentStatus;

  useEffect(() => {
    if (optimisticStatus === currentStatus) setOptimisticStatus(null);
  }, [currentStatus, optimisticStatus]);

  const utils = trpc.useUtils();
  const updateStatus = trpc.threads.updateStatus.useMutation({
    onMutate: async () => {
      await utils.threads.list.cancel();
    },
    onSettled: () => {
      utils.threads.list.invalidate();
    },
    onError: () => {
      setOptimisticStatus(null);
    },
  });

  const statuses: ThreadStatus[] = ["OPEN", "URGENT", "DONE"];

  function handleClick(s: ThreadStatus) {
    if (Date.now() < clickLockUntil.current) return;
    if (s === displayStatus) return;
    if (displayStatus === "DONE") {
      setConfirmReopen(s);
      return;
    }
    setOptimisticStatus(s);
    updateStatus.mutate({ threadId, status: s });
  }

  function confirmReopenTo(s: ThreadStatus) {
    clickLockUntil.current = Date.now() + 400;
    setConfirmReopen(null);
    setOptimisticStatus(s);
    updateStatus.mutate({ threadId, status: s });
  }

  const activeStyle = (s: ThreadStatus) => {
    if (s === "URGENT") return { background: "#F6E6D4", color: "#8A4B1F" };
    if (s === "DONE") return { background: "#ECEBE4", color: "#5A5954" };
    return { background: "var(--pastel)", color: "var(--pastel-ink)" };
  };

  const activeIdx = statuses.indexOf(displayStatus);

  if (confirmReopen) {
    return (
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] text-muted uppercase tracking-wider">
          reopen {threadTitle}?
        </span>
        <button
          onClick={() => confirmReopenTo(confirmReopen)}
          className="font-mono text-[10px] uppercase tracking-wider px-2 py-[3px] border border-border text-ink hover:bg-border/40 transition-colors"
        >
          yes
        </button>
        <button
          onClick={() => setConfirmReopen(null)}
          className="font-mono text-[10px] uppercase tracking-wider px-2 py-[3px] text-muted hover:text-ink transition-colors"
        >
          cancel
        </button>
      </div>
    );
  }

  return (
    <div className="relative flex items-center border border-border bg-surface-2 overflow-hidden">
      <div
        className="absolute top-0 bottom-0 w-1/3 transition-transform duration-200 ease-in-out"
        style={{
          transform: `translateX(${activeIdx * 100}%)`,
          ...activeStyle(displayStatus),
        }}
      />
      {statuses.map((s) => {
        const active = s === displayStatus;
        return (
          <button
            key={s}
            onClick={() => handleClick(s)}
            className={`relative z-10 flex-1 min-w-0 flex items-center justify-center font-mono text-[10px] uppercase tracking-[0.12em] px-2.5 py-2.5 md:py-[5px] transition-colors duration-200 border-r last:border-r-0 border-border ${
              active ? "" : "text-muted hover:text-ink"
            }`}
            style={active ? { color: activeStyle(s).color } : undefined}
          >
            {s.toLowerCase()}
          </button>
        );
      })}
    </div>
  );
}

// Swipe-right-to-reply distances.
const SWIPE_MAX = 72;
const SWIPE_TRIGGER = 48;

export function ThreadDetail({
  threadId,
  groupId,
  initialTitle,
  initialStatus,
  highlightMessageId,
  me,
}: {
  threadId: string;
  groupId: string;
  initialTitle: string;
  initialStatus: ThreadStatus;
  highlightMessageId?: string;
  me: { id: string; display_name: string; avatar_url: string | null };
}) {
  // Row keys that should play the enter animation: messages that arrive while
  // the thread is open (realtime or sent here). Everything else renders still.
  const animateKeys = useRef<Set<string>>(new Set());
  const [typingUsers, setTypingUsers] = useState<{ id: string; name: string }[]>([]);
  // Short-lived blobatar poses keyed by message id (happy on delivery, love
  // when someone hearts your message).
  const [blobMoods, setBlobMoods] = useState<Record<string, Expression>>({});
  const flashMood = useCallback((messageId: string, pose: Expression, ms: number) => {
    setBlobMoods((prev) => ({ ...prev, [messageId]: pose }));
    setTimeout(() => {
      setBlobMoods((prev) => {
        if (prev[messageId] !== pose) return prev;
        const next = { ...prev };
        delete next[messageId];
        return next;
      });
    }, ms);
  }, []);
  // Provided by the shell (server-fetched once per app load) — no auth or
  // profile round trip before realtime channels and own-message UI work.
  const myInfo = me;

  const { data: workspaceMembers } = trpc.messages.groupMembers.useQuery(
    { groupId },
    { refetchOnWindowFocus: false, staleTime: 5 * 60 * 1000 },
  );

  const thread = useThreadMessages({
    threadId,
    groupId,
    me,
    members: workspaceMembers,
    callbacks: {
      onIncoming: (m) => {
        animateKeys.current.add(m.client_id ?? m.id);
        playReceive();
        if (mentionsUser(m.body, me.display_name)) haptic(MENTION_HAPTIC);
      },
      onDelivered: (m) => flashMood(m.id, happy, 1200),
      onLovedMine: (id) => flashMood(id, love, 2000),
      onLevelUp: (up) => {
        void utils.profile.blobs.invalidate();
        setReveal(evolveSpec(me.id, myBlob, up.level, up.shiny));
      },
    },
  });
  const messages = thread.messages;
  const presenceChannelRef = useRef<RealtimeChannel | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [threadStatus, setThreadStatus] = useState<ThreadStatus>(initialStatus);
  const [threadTitle, setThreadTitle] = useState(initialTitle);
  // Header starts from the thread-list cache (instant); threads.get refines it
  // (and covers cold deep links where the list isn't cached).
  const { data: threadMeta } = trpc.threads.get.useQuery({ threadId });
  useEffect(() => {
    if (!threadMeta) return;
    setThreadTitle(threadMeta.title as string);
    setThreadStatus(threadMeta.status as ThreadStatus);
  }, [threadMeta?.title, threadMeta?.status]); // eslint-disable-line react-hooks/exhaustive-deps
  const [showDetails, setShowDetails] = useState(false);
  const [activeLightbox, setActiveLightbox] = useState<{
    images: Attachment[];
    index: number;
    reply: ReplyTarget;
  } | null>(null);
  const [imageActions, setImageActions] = useState<{
    attachment: Attachment;
    reply: ReplyTarget;
  } | null>(null);
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);
  const tooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showPollCreate, setShowPollCreate] = useState(false);
  const [showSMeterCreate, setShowSMeterCreate] = useState(false);
  const [profileTarget, setProfileTarget] = useState<ProfileTarget | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [activeMessageMenuId, setActiveMessageMenuId] = useState<string | null>(null);
  // Flash highlight for jump-to-message (reply quotes, search deep-links).
  const [jumpFlashId, setJumpFlashId] = useState<string | null>(null);
  const jumpBusyRef = useRef(false);
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const composerApi = useRef<ComposerHandle>(null);
  const prevMsgCountRef = useRef(0);
  const prevLatestMessageIdRef = useRef<string | null>(null);
  const handledHighlightRef = useRef<string | null>(null);
  const isNearBottomRef = useRef(true);
  const lastScrollTopRef = useRef(0);
  const forceScrollOnNextMessageRef = useRef(false);
  // Suppress the scroll-up keyboard-dismiss briefly after sending, so the
  // optimistic insert + auto-scroll reflow doesn't blur the input (closing the
  // keyboard) on touch devices.
  const suppressKbDismissRef = useRef(0);
  const isInitialLoad = useRef(true);
  // Throttle typing presence: only broadcast typing:true on the leading edge.
  const typingActiveRef = useRef(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressStartRef = useRef<{ x: number; y: number } | null>(null);
  // True while a programmatic (auto/smooth) scroll is settling. Scroll events it
  // emits must NOT be read as a user scroll-up (which would blur the composer and
  // close the soft keyboard right after sending).
  const isProgrammaticScrollRef = useRef(false);
  const programmaticScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  // True only while the user is physically dragging the message list (finger
  // down + a short momentum tail). Layout-induced scrolls (keyboard show,
  // reflow after send) have no touch, so they must never dismiss the keyboard.
  const userScrollingRef = useRef(false);
  const userScrollClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Long-press on a reaction chip → show who reacted (touch reliable, vs. the
  // hover tooltip / contextmenu which don't fire dependably on mobile).
  const reactionPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reactionPressStartRef = useRef<{ x: number; y: number } | null>(null);
  const reactionLongPressedRef = useRef<string | null>(null);
  // Swipe-right-to-reply gesture state (touch only).
  const swipeRef = useRef<{
    id: string;
    x: number;
    y: number;
    locked: number;
    el: HTMLElement;
  } | null>(null);
  const utils = trpc.useUtils();
  const { markRead } = useUnreadActions();
  const [reveal, setReveal] = useState<RevealSpec | null>(null);
  const myBlob = useBlob(myInfo?.id);
  const setBlobForm = trpc.profile.setBlobForm.useMutation({
    onSuccess: () => utils.profile.blobs.invalidate(),
  });

  // Edit state
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");


  const markReadServer = trpc.threads.markRead.useMutation({
    onSuccess: (res) => {
      if (!res.changed) return;
      utils.groups.unread.invalidate();
      utils.threads.unreadCounts.invalidate({ groupId });
    },
  });

  // One-tap reopen from the closed-thread banner (optimistic; the status
  // control reflects threadStatus so it follows along).
  const reopenFromBanner = trpc.threads.updateStatus.useMutation({
    onError: () => setThreadStatus("DONE"),
    onSettled: () => utils.threads.list.invalidate({ groupId }),
  });
  const { data: readReceipts = EMPTY_RECEIPTS } = trpc.threads.reads.useQuery(
    { threadId },
    { enabled: !!threadId },
  );

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    // Flag the scroll as programmatic so updateScrollState ignores the events it
    // produces. Cleared when the scroll settles (timeout — `scrollend` isn't
    // universal); "auto" jumps are near-instant, "smooth" needs longer.
    isProgrammaticScrollRef.current = true;
    if (programmaticScrollTimerRef.current) {
      clearTimeout(programmaticScrollTimerRef.current);
    }
    bottomRef.current?.scrollIntoView({ behavior });
    isNearBottomRef.current = true;
    setHasNewMessages(false);
    programmaticScrollTimerRef.current = setTimeout(
      () => {
        isProgrammaticScrollRef.current = false;
      },
      behavior === "auto" ? 120 : 700,
    );
  }, []);

  // Older history: load ~600px before the top, keep the viewport anchored.
  const olderSentinelRef = useRef<HTMLDivElement>(null);
  const preLoadScrollHeight = useRef<number | null>(null);
  const loadOlderRef = useRef(thread.loadOlder);
  loadOlderRef.current = thread.loadOlder;
  const canLoadOlder = thread.hasMore && !thread.isLoadingOlder && !thread.olderError;
  useEffect(() => {
    const root = scrollContainerRef.current;
    const target = olderSentinelRef.current;
    if (!root || !target || !canLoadOlder) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        preLoadScrollHeight.current = root.scrollHeight;
        void loadOlderRef.current();
      },
      { root, rootMargin: "600px 0px 0px 0px" },
    );
    io.observe(target);
    return () => io.disconnect();
  }, [canLoadOlder]);
  useIsoLayoutEffect(() => {
    const root = scrollContainerRef.current;
    if (!root || preLoadScrollHeight.current === null) return;
    root.scrollTop += root.scrollHeight - preLoadScrollHeight.current;
    preLoadScrollHeight.current = null;
  }, [thread.pageCount]);

  const updateScrollState = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    // Dismiss the soft keyboard when scrolling up (toward older messages) on
    // touch devices, matching native chat behaviour.
    const top = container.scrollTop;
    const scrolledUp = top < lastScrollTopRef.current - 8;
    lastScrollTopRef.current = top;
    if (
      scrolledUp &&
      // Only a real finger-drag dismisses the keyboard. Programmatic scrolls
      // and layout-induced scrolls (keyboard show / post-send reflow) have no
      // active touch, so they're excluded here.
      userScrollingRef.current &&
      !isProgrammaticScrollRef.current &&
      Date.now() >= suppressKbDismissRef.current &&
      typeof window !== "undefined" &&
      window.matchMedia("(pointer: coarse)").matches &&
      composerApi.current?.isFocused()
    ) {
      composerApi.current?.blur();
    }

    const isNearBottom = isScrolledNearBottom(container);
    isNearBottomRef.current = isNearBottom;
    if (isNearBottom) setHasNewMessages(false);
  }, []);

  useEffect(() => {
    markRead(threadId, groupId);
  }, [threadId, groupId, markRead]);

  // Read receipts — mark on open and whenever a new *server* message arrives
  // while the thread is open (optimistic temp rows don't count). Advances BOTH
  // the client lastSeen marker (so the thread-list unread dot clears for
  // messages seen while viewing, including your own just-sent message) and the
  // server-side receipt (so others see "seen"). The server receipt is debounced
  // 1s and flushed on unmount so leaving quickly still records the read.
  const newestServerMessageId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (!m.delivery_status && !m.id.startsWith("temp-")) return m.id;
    }
    return null;
  }, [messages]);
  const flushReadRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!newestServerMessageId) return;
    markRead(threadId, groupId);
    const fire = () => {
      flushReadRef.current = null;
      markReadServer.mutate({ threadId });
    };
    flushReadRef.current = fire;
    const t = setTimeout(fire, 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, groupId, newestServerMessageId]);
  useEffect(() => () => flushReadRef.current?.(), []);

  useEffect(() => {
    isInitialLoad.current = true;
    prevMsgCountRef.current = 0;
    prevLatestMessageIdRef.current = null;
    handledHighlightRef.current = null;
    isNearBottomRef.current = true;
    forceScrollOnNextMessageRef.current = false;
    setHasNewMessages(false);
    setActiveMessageMenuId(null);
  }, [threadId]);

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
      if (programmaticScrollTimerRef.current) {
        clearTimeout(programmaticScrollTimerRef.current);
      }
      if (userScrollClearRef.current) clearTimeout(userScrollClearRef.current);
      if (reactionPressTimerRef.current) clearTimeout(reactionPressTimerRef.current);
    };
  }, []);

  const createPoll = trpc.polls.create.useMutation({
    onSuccess: (msg) => {
      haptic("light");
      thread.addServerMessage({
        ...(msg as unknown as Message),
        poll_id: (msg as unknown as { poll_id: string | null }).poll_id ?? null,
        reactions: REACTION_DEFAULTS.map((r) => ({ ...r })),
      });
      // The realtime INSERT echo fetches the poll payload and upserts it.
      setShowPollCreate(false);
    },
    onError: () => {
      forceScrollOnNextMessageRef.current = false;
    },
  });

  const createSmeter = trpc.smeters.create.useMutation({
    onSuccess: async (msg) => {
      haptic("light");
      const smeterId = (msg as unknown as { smeter_id: string | null }).smeter_id ?? null;
      let smeter: SMeterSummary | null = null;
      if (smeterId) {
        const map = await utils.smeters.getMany.fetch({ smeterIds: [smeterId] }, { staleTime: 0 });
        smeter = map[smeterId] ?? null;
      }
      thread.addServerMessage({
        ...(msg as unknown as Message),
        smeter_id: smeterId,
        smeter,
        reactions: REACTION_DEFAULTS.map((r) => ({ ...r })),
      });
      setShowSMeterCreate(false);
    },
    onError: () => {
      forceScrollOnNextMessageRef.current = false;
    },
  });



  useIsoLayoutEffect(() => {
    const count = messages.length;
    const latestMessage = messages[count - 1] ?? null;

    if (!latestMessage) {
      prevMsgCountRef.current = 0;
      prevLatestMessageIdRef.current = null;
      setHasNewMessages(false);
      return;
    }

    if (
      highlightMessageId &&
      handledHighlightRef.current !== highlightMessageId
    ) {
      const el = document.getElementById(`message-${highlightMessageId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        handledHighlightRef.current = highlightMessageId;
        isNearBottomRef.current = latestMessage.id === highlightMessageId;
        prevMsgCountRef.current = count;
        prevLatestMessageIdRef.current = latestMessage.id;
        isInitialLoad.current = false;
        return;
      }
      // Target lives in an older, not-yet-loaded page (search results often
      // do) — page history in until it appears instead of silently giving up.
      handledHighlightRef.current = highlightMessageId;
      isNearBottomRef.current = false;
      prevMsgCountRef.current = count;
      prevLatestMessageIdRef.current = latestMessage.id;
      isInitialLoad.current = false;
      void jumpToMessage(highlightMessageId);
      return;
    }

    if (isInitialLoad.current) {
      scrollToBottom("auto");
      isInitialLoad.current = false;
      prevMsgCountRef.current = count;
      prevLatestMessageIdRef.current = latestMessage.id;
      return;
    }

    const appendedLatestMessage =
      count > prevMsgCountRef.current &&
      latestMessage.id !== prevLatestMessageIdRef.current;

    if (appendedLatestMessage) {
      const isOwnMessage =
        !!myInfo?.id && latestMessage.user_id === myInfo.id;
      const isLocalMessage = !!latestMessage.delivery_status;
      const shouldScrollToBottom =
        forceScrollOnNextMessageRef.current ||
        isNearBottomRef.current ||
        isOwnMessage ||
        isLocalMessage;

      if (shouldScrollToBottom) {
        requestAnimationFrame(() => scrollToBottom("smooth"));
      } else {
        setHasNewMessages(true);
      }

      forceScrollOnNextMessageRef.current = false;
    }

    prevMsgCountRef.current = count;
    prevLatestMessageIdRef.current = latestMessage.id;
  }, [messages, highlightMessageId, myInfo?.id, scrollToBottom]);

  // Blobs in the thread turn to look at the composer while you type. The
  // composer only exists while the thread isn't DONE, hence threadStatus.
  const gazeFieldRef = useRef<GazeField | null>(null);
  useEffect(() => {
    const root = scrollContainerRef.current;
    const target = composerApi.current?.inputBox() ?? null;
    if (!root || !target) return;
    const field = createGazeField(root, target);
    gazeFieldRef.current = field;
    const onScroll = () => field.refresh();
    root.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      root.removeEventListener("scroll", onScroll);
      field.stop();
      gazeFieldRef.current = null;
    };
  }, [threadStatus]);

  useEffect(() => {
    gazeFieldRef.current?.refresh();
  }, [messages]);



  useEffect(() => {
    if (!myInfo) return;
    const supabase = getPresenceClient();

    const channel = supabase.channel(`typing:${threadId}`, {
      config: { presence: { key: myInfo.id } },
    });

    // Recompute the typing list from the full presence state. Bound to
    // sync/join/leave because the `sync` event alone does not reliably fire on
    // an already-joined client when a remote peer joins or updates its meta.
    const recompute = () => {
      const state = channel.presenceState<{
        display_name: string;
        typing: boolean;
        at?: number;
      }>();
      // A peer can briefly hold multiple presence entries. Use the most recent
      // (highest `at`) so a later typing:false wins over a stale typing:true —
      // otherwise the indicator never clears.
      // Presence is keyed by user id, which also seeds each typer's blobatar.
      const typers = Object.entries(state)
        .filter(([uid]) => uid !== myInfo.id)
        .map(([uid, presences]) => {
          const arr = presences as { display_name: string; typing: boolean; at?: number }[];
          if (arr.length === 0) return null;
          const latest = arr.reduce((a, b) => ((b.at ?? 0) >= (a.at ?? 0) ? b : a));
          return latest.typing ? { id: uid, name: latest.display_name } : null;
        })
        .filter((t): t is { id: string; name: string } => !!t);
      setTypingUsers(typers);
    };

    channel
      .on("presence", { event: "sync" }, recompute)
      .on("presence", { event: "join" }, recompute)
      .on("presence", { event: "leave" }, recompute)
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            display_name: myInfo.display_name,
            typing: false,
            at: Date.now(),
          });
        }
      });

    presenceChannelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      presenceChannelRef.current = null;
    };
  }, [threadId, myInfo]);


  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`thread-status:${threadId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "threads",
          filter: `id=eq.${threadId}`,
        },
        (payload) => {
          const updated = payload.new as { status: ThreadStatus; title: string };
          setThreadStatus(updated.status);
          if (updated.title) setThreadTitle(updated.title);
          utils.threads.list.invalidate({ groupId });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [threadId, groupId, utils]);

  // Scroll a message into view, paging in older history when it isn't loaded
  // yet — reply quotes and search deep-links often point at old messages.
  // Open the replied-to image in the lightbox. Prefer the target message's full
  // image set (so swipe/gallery works) when it's loaded; otherwise fall back to
  // a single synthetic slide built from the stored url.
  function openReplyImage(replyTo: ReplyTo) {
    if (!replyTo.image_url) return;
    const target = messages.find((m) => m.id === replyTo.id);
    const imgs =
      target?.attachments?.filter((a) => a.type === "image") ?? [];
    const reply: ReplyTarget = {
      id: replyTo.id,
      body: replyTo.body,
      authorName: replyTo.author_name,
    };
    if (imgs.length > 0) {
      const idx = imgs.findIndex((a) => a.url === replyTo.image_url);
      setActiveLightbox({ images: imgs, index: Math.max(0, idx), reply });
    } else {
      setActiveLightbox({
        images: [{ url: replyTo.image_url, type: "image", name: "" }],
        index: 0,
        reply,
      });
    }
  }

  async function jumpToMessage(messageId: string) {
    const flash = () => {
      setJumpFlashId(messageId);
      window.setTimeout(
        () => setJumpFlashId((cur) => (cur === messageId ? null : cur)),
        3000,
      );
    };
    const el = document.getElementById(`message-${messageId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      flash();
      return;
    }
    if (jumpBusyRef.current || messages.length === 0) return;
    jumpBusyRef.current = true;
    try {
      let found = false;
      // Bounded: at most 20 pages (~1000 messages) per jump.
      for (let i = 0; i < 20 && !found; i++) {
        const res = await thread.loadOlder();
        const all = flatten(res.data as unknown as Parameters<typeof flatten>[0]);
        found = all.some((m) => m.id === messageId);
        if (!res.hasNextPage) break;
      }
      if (found) {
        // Two frames: let React commit the prepended rows first.
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            document
              .getElementById(`message-${messageId}`)
              ?.scrollIntoView({ behavior: "smooth", block: "center" });
            flash();
          }),
        );
      }
    } catch {
      // network hiccup — user can tap the quote again
    } finally {
      jumpBusyRef.current = false;
    }
  }

  function stopTyping() {
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingActiveRef.current = false;
    if (presenceChannelRef.current && myInfo) {
      presenceChannelRef.current.track({
        display_name: myInfo.display_name,
        typing: false,
        at: Date.now(),
      });
    }
  }

  function handleEditSubmit(messageId: string) {
    if (!editBody.trim()) return;
    thread.editMessage(messageId, editBody.trim());
    setEditingMessageId(null);
    setEditBody("");
  }

  function clearLongPressTimer() {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
    longPressStartRef.current = null;
  }

  function canShowMessageMenu(message: Message): boolean {
    return !message.is_deleted && !message.delivery_status;
  }

  function startMessageLongPress(
    e: React.PointerEvent<HTMLDivElement>,
    message: Message,
  ) {
    if (e.pointerType === "mouse" || !canShowMessageMenu(message)) return;

    const target = e.target as HTMLElement;
    if (target.closest("input, textarea, select, audio, video")) return;

    clearLongPressTimer();
    longPressStartRef.current = { x: e.clientX, y: e.clientY };
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null;
      longPressStartRef.current = null;
      haptic("medium");
      setActiveMessageMenuId(message.id);
    }, 350);
  }

  function moveMessageLongPress(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse" || !longPressStartRef.current) return;

    const dx = Math.abs(e.clientX - longPressStartRef.current.x);
    const dy = Math.abs(e.clientY - longPressStartRef.current.y);
    if (dx > 10 || dy > 10) clearLongPressTimer();
  }

  // --- Swipe-right-to-reply (touch) ---

  function onMsgSwipeStart(
    e: React.TouchEvent<HTMLDivElement>,
    message: Message,
  ) {
    if (!window.matchMedia("(pointer: coarse)").matches) return;
    if (message.is_deleted || message.delivery_status) return;
    const t = e.touches[0];
    if (!t) return;
    // Left-edge starts belong to the swipe-back gesture (shell-stack).
    if (t.clientX < SWIPE_EDGE_PX) return;
    swipeRef.current = {
      id: message.id,
      x: t.clientX,
      y: t.clientY,
      locked: 0,
      el: e.currentTarget,
    };
  }

  function onMsgSwipeMove(
    e: React.TouchEvent<HTMLDivElement>,
    message: Message,
  ) {
    const s = swipeRef.current;
    if (!s || s.id !== message.id) return;
    const t = e.touches[0];
    if (!t) return;
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (s.locked === 0) {
      // Decide axis on first meaningful move; vertical => let the list scroll.
      if (Math.abs(dy) > Math.abs(dx)) {
        swipeRef.current = null;
        return;
      }
      if (Math.abs(dx) > 8) s.locked = dx > 0 ? 1 : -1;
      else return;
    }
    if (s.locked === 1) {
      const off = Math.max(0, Math.min(dx, SWIPE_MAX));
      s.el.style.transition = "none";
      s.el.style.transform = `translateX(${off}px)`;
    }
  }

  function onMsgSwipeEnd(
    e: React.TouchEvent<HTMLDivElement>,
    message: Message,
    name: string,
  ) {
    const s = swipeRef.current;
    swipeRef.current = null;
    if (!s || s.id !== message.id) return;
    const el = s.el;
    const match = /translateX\(([0-9.]+)px\)/.exec(el.style.transform);
    const off = match ? parseFloat(match[1]) : 0;
    el.style.transition = "transform 180ms ease";
    el.style.transform = "";
    if (s.locked === 1 && off >= SWIPE_TRIGGER) {
      haptic("light");
      composerApi.current?.startReply({ id: message.id, body: message.body, authorName: name, imageUrl: null });
    }
  }

  // --- Long-press a reaction chip to reveal who reacted ---
  function startReactionPress(
    e: React.PointerEvent<HTMLButtonElement>,
    tooltipKey: string,
  ) {
    // Don't let the press bubble to the row's long-press / swipe handlers.
    e.stopPropagation();
    if (e.pointerType === "mouse") return;
    reactionPressStartRef.current = { x: e.clientX, y: e.clientY };
    if (reactionPressTimerRef.current) clearTimeout(reactionPressTimerRef.current);
    reactionPressTimerRef.current = setTimeout(() => {
      reactionLongPressedRef.current = tooltipKey;
      haptic("light");
      setActiveTooltip(tooltipKey);
      if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current);
      tooltipTimerRef.current = setTimeout(() => setActiveTooltip(null), 3000);
    }, 400);
  }

  function moveReactionPress(e: React.PointerEvent<HTMLButtonElement>) {
    const s = reactionPressStartRef.current;
    if (!s) return;
    if (Math.abs(e.clientX - s.x) > 10 || Math.abs(e.clientY - s.y) > 10) {
      if (reactionPressTimerRef.current) clearTimeout(reactionPressTimerRef.current);
    }
  }

  function endReactionPress() {
    if (reactionPressTimerRef.current) clearTimeout(reactionPressTimerRef.current);
    reactionPressStartRef.current = null;
  }

  function openMessageMenuFromContext(
    e: React.MouseEvent<HTMLDivElement>,
    message: Message,
  ) {
    if (!canShowMessageMenu(message)) return;
    if (!window.matchMedia("(pointer: coarse)").matches) return;

    e.preventDefault();
    clearLongPressTimer();
    haptic("medium");
    setActiveMessageMenuId(message.id);
  }

  async function copyMessage(messageId: string, text: string) {
    if (!text.trim()) return;
    try {
      await navigator.clipboard.writeText(text);
      haptic("success");
      setCopiedMessageId(messageId);
      setTimeout(() => setCopiedMessageId(null), 1600);
    } catch {
      composerApi.current?.showError("Could not copy message.");
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    composerApi.current?.addFiles(Array.from(e.dataTransfer.files));
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
  }

  function noteTyping() {
    if (!presenceChannelRef.current) return;
    // Leading-edge only: broadcast typing:true once, then let the 3s timeout
    // clear it — instead of a presence update on every keystroke.
    if (!typingActiveRef.current) {
      typingActiveRef.current = true;
      presenceChannelRef.current.track({ display_name: me.display_name, typing: true, at: Date.now() });
    }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(stopTyping, 3000);
  }

  function editLastOwn(): boolean {
    if (editingMessageId) return false;
    const last = [...messages]
      .reverse()
      .find((m) => m.user_id === me.id && !m.is_deleted && !m.delivery_status && !!m.body);
    if (!last) return false;
    setEditingMessageId(last.id);
    setEditBody(last.body);
    requestAnimationFrame(() =>
      document.getElementById(`message-${last.id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" }),
    );
    return true;
  }

  const composerActions = useStableActions({
    onSend: (input: { body: string; files: File[]; replyTo: ReplyTo | null; replyToAttachmentUrl: string | null }) => {
      stopTyping();
      // Keep the keyboard up: ignore scroll-up dismiss during the send reflow.
      suppressKbDismissRef.current = Date.now() + 800;
      forceScrollOnNextMessageRef.current = true;
      haptic("light");
      playSend();
      const key = thread.send(input);
      animateKeys.current.add(key);
      // Own send: jump, don't glide.
      requestAnimationFrame(() => scrollToBottom("auto"));
    },
    onTyping: noteTyping,
    onGaze: (active: boolean) => {
      gazeFieldRef.current?.setActive(active);
      gazeFieldRef.current?.refresh();
    },
    onEditLastOwn: editLastOwn,
    onOpenPoll: () => setShowPollCreate(true),
    onOpenSmeter: () => setShowSMeterCreate(true),
    onReopen: () => {
      setThreadStatus("OPEN");
      reopenFromBanner.mutate({ threadId, status: "OPEN" });
      requestAnimationFrame(() => composerApi.current?.focus());
    },
  });

  function showTooltipBriefly(key: string) {
    setActiveTooltip(key);
    if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current);
    tooltipTimerRef.current = setTimeout(() => setActiveTooltip(null), 2500);
  }

  const rowActions: RowActions = useStableActions({
    longPressStart: startMessageLongPress,
    longPressMove: moveMessageLongPress,
    longPressClear: clearLongPressTimer,
    openMenu: openMessageMenuFromContext,
    swipeStart: onMsgSwipeStart,
    swipeMove: onMsgSwipeMove,
    swipeEnd: onMsgSwipeEnd,
    openProfile: (target: ProfileTarget) => setProfileTarget(target),
    openReplyImage,
    jumpTo: jumpToMessage,
    startEdit: (id: string, text: string) => {
      setEditingMessageId(id);
      setEditBody(text);
    },
    setEditBody: (value: string) => setEditBody(value),
    submitEdit: handleEditSubmit,
    cancelEdit: () => {
      setEditingMessageId(null);
      setEditBody("");
    },
    copy: (id: string, text: string) => void copyMessage(id, text),
    reply: (target: { id: string; body: string; authorName: string; imageUrl: string | null }) => {
      composerApi.current?.startReply(target);
    },
    openLightbox: (payload: { images: Attachment[]; index: number; reply: ReplyTarget }) => setActiveLightbox(payload),
    holdImage: (payload: { attachment: Attachment; reply: ReplyTarget }) => setImageActions(payload),
    react: (id: string, type: string) => thread.toggleReaction(id, type),
    remove: (id: string) => thread.deleteMessage(id),
    retry: (key: string) => thread.retry(key),
    discard: (key: string) => thread.discard(key),
    reactionPressStart: startReactionPress,
    reactionPressMove: moveReactionPress,
    reactionPressEnd: endReactionPress,
    setTooltip: (key: string | null) => setActiveTooltip(key),
    showTooltipBriefly,
    consumeReactionLongPress: (key: string) => {
      if (reactionLongPressedRef.current !== key) return false;
      reactionLongPressedRef.current = null;
      return true;
    },
  });

  // Server rows + pending sends, already ordered (pending last).
  const displayMessages = messages;

  const activeMessageMenu = useMemo(
    () =>
      displayMessages.find((msg) => msg.id === activeMessageMenuId) ?? null,
    [activeMessageMenuId, displayMessages],
  );

  // Map each of my messages → the readers whose read position lands on it.
  // A reader is placed on the LATEST of my messages they've actually read past
  // (created_at <= their last_read_at), so readers who are "behind" still show
  // on their real position instead of vanishing when someone reads further.
  const seenByMessage = useMemo(() => {
    const result: Record<
      string,
      Array<{ id: string; name: string }>
    > = {};
    if (!myInfo) return result;
    const rows = readReceipts as Array<{
      user_id: string;
      last_read_at: string;
      display_name: string;
      avatar_url: string | null;
    }>;
    const ownMessages = messages.filter(
      (m) => m.user_id === myInfo.id && !m.delivery_status,
    );
    if (ownMessages.length === 0) return result;

    for (const r of rows) {
      if (r.user_id === myInfo.id) continue;
      const readTime = new Date(r.last_read_at).getTime();
      let target: (typeof ownMessages)[number] | null = null;
      for (let i = ownMessages.length - 1; i >= 0; i -= 1) {
        if (new Date(ownMessages[i].created_at).getTime() <= readTime) {
          target = ownMessages[i];
          break;
        }
      }
      if (!target) continue;
      (result[target.id] ??= []).push({
        id: r.user_id,
        name: r.display_name,
      });
    }
    return result;
  }, [messages, myInfo, readReceipts]);

  const messagesByDate = useMemo(() => {
    const groups: Array<{ date: string; messages: Message[] }> = [];
    for (const msg of displayMessages) {
      const dateLabel = formatDate(msg.created_at);
      const last = groups[groups.length - 1];
      if (last && last.date === dateLabel) {
        last.messages.push(msg);
      } else {
        groups.push({ date: dateLabel, messages: [msg] });
      }
    }
    return groups;
  }, [displayMessages]);

  const isDone = threadStatus === "DONE";

  const members = workspaceMembers ?? EMPTY_MEMBERS;
  const mentions = useMemo(() => buildMentionMatcher(members, MENTION_SPECIALS), [members]);
  // Past this size, enable content-visibility windowing on message rows.
  const bigThread = displayMessages.length > 60;

  return (
    <div
      className="flex-1 flex flex-col h-full min-w-0 bg-surface"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      {/* Thread header */}
      <header className="border-b border-border flex-shrink-0">
        <div className="px-3 md:px-6 flex items-center gap-2 md:gap-4 h-12 md:h-auto md:py-[14px]">
          <button
            onClick={() => navigateBack(`/g/${groupId}`)}
            className="md:hidden w-11 h-full flex items-center justify-center -ml-1 flex-shrink-0 text-muted hover:text-ink transition-colors"
            aria-label="Back to threads"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>

          <div className="flex-1 min-w-0">
            <button
              onClick={() => setShowDetails(true)}
              title="Thread details"
              className="flex items-center gap-1.5 min-w-0 max-w-full group"
            >
              <h1 className="font-mono text-sm font-semibold text-ink truncate lowercase">
                <span className="text-muted-2 normal-case"># </span>
                {threadTitle}
              </h1>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14" height="14" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round"
                className="text-muted group-hover:text-ink transition-colors flex-shrink-0"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          </div>

          <div className="hidden md:flex items-center gap-3 flex-shrink-0">
            <StatusControl
              threadId={threadId}
              currentStatus={threadStatus}
              threadTitle={threadTitle}
            />
          </div>
        </div>

        <div className="md:hidden px-3 pb-2">
          <StatusControl
            threadId={threadId}
            currentStatus={threadStatus}
            threadTitle={threadTitle}
          />
        </div>
      </header>

      {/* Messages */}
      <div
        ref={scrollContainerRef}
        onScroll={updateScrollState}
        onTouchStart={() => {
          if (userScrollClearRef.current) clearTimeout(userScrollClearRef.current);
          userScrollingRef.current = true;
        }}
        onTouchEnd={() => {
          // Keep it true through iOS momentum scrolling, then release.
          if (userScrollClearRef.current) clearTimeout(userScrollClearRef.current);
          userScrollClearRef.current = setTimeout(() => {
            userScrollingRef.current = false;
          }, 350);
        }}
        className="flex-1 overflow-y-auto overflow-x-hidden px-4 md:px-6 py-3 md:py-4 flex flex-col"
        // pan-y: the browser only owns vertical scroll here; horizontal drags
        // are the swipe-to-reply gesture (handled in JS), so iOS can't rubber-
        // band / shift the whole window sideways on a message swipe.
        style={{ touchAction: "pan-y" }}
      >
        {thread.isLoading && messages.length === 0 ? (
          <div className="flex flex-col justify-end min-h-full space-y-4">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex gap-3">
                <div className="w-7 h-7 bg-border animate-pulse" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-24 bg-border animate-pulse" />
                  <div className="h-4 bg-border animate-pulse" style={{ width: `${45 + ((i * 23) % 45)}%` }} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-auto">
          {displayMessages.length === 0 ? (
            <div className="flex items-center justify-center h-32">
              <p className="font-mono text-sm text-muted">
                No messages yet. Start the conversation.
              </p>
            </div>
          ) : (
          <>
            {thread.hasMore && (
              <div ref={olderSentinelRef} className="flex justify-center mb-4 min-h-[20px]">
                {thread.olderError ? (
                  <button
                    onClick={() => void thread.loadOlder()}
                    className="font-mono text-[11px] text-muted hover:text-ink"
                  >
                    couldn&apos;t load older messages — tap to retry
                  </button>
                ) : thread.isLoadingOlder ? (
                  <span className="font-mono text-[11px] text-muted">loading…</span>
                ) : null}
              </div>
            )}
            {messagesByDate.map(({ date, messages: dayMessages }) => {
              return (
                <div key={date}>
                  <div className="flex items-center gap-3 my-4">
                    <div className="flex-1 h-px bg-border" />
                    <span className="font-mono text-[10px] text-muted uppercase tracking-[0.14em]">
                      {date}
                    </span>
                    <div className="flex-1 h-px bg-border" />
                  </div>

                  {dayMessages.map((msg, idx) => {
                    if (msg.system_event) {
                      return <SystemMessage key={msg.id} event={msg.system_event} threadId={threadId} />;
                    }
                    const prevMsg = idx > 0 ? dayMessages[idx - 1] : null;
                    const isSameAuthor =
                      prevMsg?.user_id === msg.user_id &&
                      new Date(msg.created_at).getTime() -
                        new Date(prevMsg.created_at).getTime() <
                        5 * 60_000;
                    const isEditing = editingMessageId === msg.id;
                    const tooltipPrefix = `${msg.id}:`;
                    return (
                      <MessageRow
                        key={msg.client_id ?? msg.id}
                        msg={msg}
                        isOwn={msg.user_id === me.id}
                        isSameAuthor={isSameAuthor}
                        mood={
                          msg.delivery_status === "sending"
                            ? thinking
                            : msg.delivery_status === "failed"
                              ? sad
                              : blobMoods[msg.id]
                        }
                        animate={animateKeys.current.has(msg.client_id ?? msg.id)}
                        flash={msg.id === highlightMessageId || msg.id === jumpFlashId}
                        menuOpen={activeMessageMenuId === msg.id}
                        isEditing={isEditing}
                        editBody={isEditing ? editBody : undefined}
                        tooltipType={
                          activeTooltip?.startsWith(tooltipPrefix)
                            ? activeTooltip.slice(tooltipPrefix.length)
                            : null
                        }
                        copied={copiedMessageId === msg.id}
                        rowError={thread.rowErrors[msg.id]}
                        seenReaders={seenByMessage[msg.id] ?? EMPTY_READERS}
                        bigThread={bigThread}
                        threadId={threadId}
                        me={me}
                        mentions={mentions}
                        actions={rowActions}
                      />
                    );
                  })}
                </div>
              );
            })}
          </>
          )}
          <div ref={bottomRef} />
          </div>
        )}
      </div>

      {showDetails && (
        <ThreadDetailsPanel
          threadId={threadId}
          groupId={groupId}
          onClose={() => setShowDetails(false)}
        />
      )}

      <ProfileCard
        target={profileTarget}
        onClose={() => setProfileTarget(null)}
      />

      {reveal && (
        <EvolveModal
          spec={reveal}
          onPrimary={() => {
            setBlobForm.mutate({ form: reveal.level });
            setReveal(null);
          }}
          onSecondary={() => setReveal(null)}
        />
      )}

      {/* Poll create modal */}
      {showPollCreate && (
        <PollCreateModal
          onSubmit={(question, options) => {
            forceScrollOnNextMessageRef.current = true;
            scrollToBottom("smooth");
            createPoll.mutate({ threadId, question, options });
          }}
          onClose={() => setShowPollCreate(false)}
          isPending={createPoll.isPending}
        />
      )}

      {/* S-meter create modal */}
      {showSMeterCreate && (
        <SMeterCreateModal
          members={members}
          onSubmit={(mode, customDates, customLabels, title, participantIds) => {
            forceScrollOnNextMessageRef.current = true;
            scrollToBottom("smooth");
            createSmeter.mutate({ threadId, mode, customDates, customLabels, title, participantIds });
          }}
          onClose={() => setShowSMeterCreate(false)}
          isPending={createSmeter.isPending}
        />
      )}

      {/* Tap → zoomable fullscreen image */}
      {activeLightbox && (
        <ImageLightbox
          images={activeLightbox.images}
          index={activeLightbox.index}
          onDownload={(att) => void downloadAttachment(att)}
          onReply={(att) => {
            composerApi.current?.startReply({ ...activeLightbox.reply, imageUrl: att.url });
          }}
          onClose={() => setActiveLightbox(null)}
        />
      )}

      {/* Hold → download / reply actions */}
      {imageActions && (
        <AttachmentActions
          attachment={imageActions.attachment}
          onReply={() => {
            composerApi.current?.startReply({ ...imageActions.reply, imageUrl: imageActions.attachment.url });
          }}
          onClose={() => setImageActions(null)}
        />
      )}

      {activeMessageMenu && canShowMessageMenu(activeMessageMenu) && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-30 bg-ink/10"
            aria-label="Close message actions"
            onClick={() => setActiveMessageMenuId(null)}
          />
          <div
            className="fixed left-3 right-3 z-40 mx-auto max-w-sm border border-border-strong bg-surface p-3 shadow-2xl"
            style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 92px)" }}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="min-w-0 truncate font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                {activeMessageMenu.profiles?.display_name ?? "Unknown"} ·{" "}
                {formatTime(activeMessageMenu.created_at)}
              </span>
              <button
                type="button"
                onClick={() => setActiveMessageMenuId(null)}
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center font-mono text-base leading-none text-muted transition-colors hover:text-ink"
                aria-label="Close message actions"
              >
                ×
              </button>
            </div>

            <div className="mb-3 border border-border bg-surface-2 p-3">
              {activeMessageMenu.poll && (
                <div className="mb-2 border-l-2 border-pastel-deep pl-2">
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
                    poll
                  </span>
                  <p className="mt-0.5 text-[13px] leading-snug text-ink">
                    {activeMessageMenu.poll.question}
                  </p>
                </div>
              )}

              {activeMessageMenu.body.trim().length > 0 && (
                <p className="max-h-28 overflow-y-auto whitespace-pre-wrap break-words text-[13px] leading-[1.45] text-ink">
                  {activeMessageMenu.body}
                </p>
              )}

              {(activeMessageMenu.attachments ?? []).length > 0 && (
                <div
                  className={
                    activeMessageMenu.body.trim().length > 0 ||
                    activeMessageMenu.poll
                      ? "mt-2 flex flex-wrap gap-1.5"
                      : "flex flex-wrap gap-1.5"
                  }
                >
                  {activeMessageMenu.attachments.map((attachment, index) => (
                    <span
                      key={`${attachment.url}-${index}`}
                      className="max-w-full truncate border border-border bg-surface px-2 py-1 font-mono text-[10px] text-muted"
                    >
                      {attachment.type}: {attachment.name}
                    </span>
                  ))}
                </div>
              )}

              {!activeMessageMenu.poll &&
                !activeMessageMenu.body.trim() &&
                (activeMessageMenu.attachments ?? []).length === 0 && (
                  <p className="font-mono text-[11px] text-muted">
                    empty message
                  </p>
                )}
            </div>

            <div className="grid grid-cols-3 gap-2">
              {REACTION_DEFAULTS.map((reaction) => (
                <button
                  key={reaction.type}
                  type="button"
                  onClick={() => {
                    setActiveMessageMenuId(null);
                    thread.toggleReaction(activeMessageMenu.id, reaction.type);
                  }}
                  className="flex h-12 items-center justify-center border border-border bg-surface-2 text-xl transition-colors active:bg-pastel-tint"
                  aria-label={`React with ${reaction.type}`}
                >
                  {reaction.type}
                </button>
              ))}
            </div>

            <div className="mt-2 flex gap-2">
              {!activeMessageMenu.is_deleted && (
                <button
                  type="button"
                  onClick={() => {
                    composerApi.current?.startReply({
                      id: activeMessageMenu.id,
                      body: activeMessageMenu.body,
                      authorName: activeMessageMenu.profiles?.display_name ?? "Unknown",
                      imageUrl: null,
                    });
                    setActiveMessageMenuId(null);
                  }}
                  className="flex h-11 flex-1 items-center justify-center border border-border bg-surface-2 px-3 font-mono text-[11px] uppercase tracking-[0.1em] text-ink transition-colors active:bg-pastel-tint"
                >
                  reply
                </button>
              )}
              {activeMessageMenu.body.trim().length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    void copyMessage(activeMessageMenu.id, activeMessageMenu.body);
                    setActiveMessageMenuId(null);
                  }}
                  className="flex h-11 flex-1 items-center justify-center border border-border bg-surface-2 px-3 font-mono text-[11px] uppercase tracking-[0.1em] text-ink transition-colors active:bg-pastel-tint"
                >
                  copy
                </button>
              )}
              {activeMessageMenu.user_id === myInfo?.id && !activeMessageMenu.is_deleted && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingMessageId(activeMessageMenu.id);
                    setEditBody(activeMessageMenu.body);
                    setActiveMessageMenuId(null);
                  }}
                  className="flex h-11 flex-1 items-center justify-center border border-border bg-surface-2 px-3 font-mono text-[11px] uppercase tracking-[0.1em] text-ink transition-colors active:bg-pastel-tint"
                >
                  edit
                </button>
              )}
              {activeMessageMenu.user_id === myInfo?.id && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveMessageMenuId(null);
                    thread.deleteMessage(activeMessageMenu.id);
                  }}
                  className="flex h-11 flex-1 items-center justify-center border border-red-200 bg-red-50 px-3 font-mono text-[11px] uppercase tracking-[0.1em] text-red-700 transition-colors active:bg-red-100"
                >
                  delete
                </button>
              )}
            </div>
          </div>
        </>
      )}

      <Composer
        ref={composerApi}
        threadId={threadId}
        isDone={isDone}
        reopenPending={reopenFromBanner.isPending}
        members={members}
        onSend={composerActions.onSend}
        onTyping={composerActions.onTyping}
        onGaze={composerActions.onGaze}
        onEditLastOwn={composerActions.onEditLastOwn}
        onOpenPoll={composerActions.onOpenPoll}
        onOpenSmeter={composerActions.onOpenSmeter}
        onReopen={composerActions.onReopen}
        overlay={
          hasNewMessages ? (
            <button
              type="button"
              onClick={() => scrollToBottom("auto")}
              className="absolute bottom-full left-1/2 z-10 mb-3 -translate-x-1/2 border border-border-strong bg-ink px-3 py-2 font-mono text-[11px] uppercase tracking-[0.1em] text-surface shadow-lg transition-all duration-150 hover:-translate-y-px hover:bg-ink/90"
              aria-label="Jump to latest message"
            >
              new messages
            </button>
          ) : null
        }
        footer={
          typingUsers.length > 0 ? (
            <div className="flex items-center gap-1.5 mt-1.5 h-5">
              <div className="flex">
                {typingUsers.slice(0, 3).map((t, i) => (
                  <Avatar key={t.id} userId={t.id} name={t.name} size={20} expression={thinking} className={i === 0 ? "" : "-ml-1.5"} />
                ))}
              </div>
              <p className="font-mono text-[10px] text-muted">
                {typingUsers.length === 1
                  ? `${typingUsers[0].name} is typing…`
                  : `${typingUsers.slice(0, -1).map((t) => t.name).join(", ")} and ${typingUsers.at(-1)?.name} are typing…`}
              </p>
            </div>
          ) : null
        }
      />
    </div>
  );
}
