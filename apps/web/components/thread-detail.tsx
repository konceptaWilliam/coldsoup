"use client";

import { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from "react";
import Image from "next/image";

// useLayoutEffect on the client (positions scroll before paint), useEffect on
// the server to avoid the SSR warning.
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;
import { useRouter } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { trpc } from "@/lib/trpc/client";
import { createClient, setRealtimeAuth, getPresenceClient } from "@/lib/supabase/client";
import { useUnread } from "@/lib/unread-context";
import { useOnline } from "@/lib/presence-context";
import { validateFile, resizeImageIfNeeded, attachmentTypeFor } from "@/lib/file-utils";
import { haptic } from "@/lib/haptics";
import { SMeterCard, SMeterCreateModal, SMeterResultsLink, type SMeterSummary } from "@/components/smeter";
import { systemEventText, type SystemEvent } from "@/lib/system-event";

type ThreadStatus = "OPEN" | "URGENT" | "DONE";

type Attachment = {
  url: string;
  type: "image" | "audio" | "video" | "file";
  name: string;
};

type Reaction = {
  type: string;
  count: number;
  userReacted: boolean;
  users: string[];
};

type ReactionType = "👍" | "👎" | "❤️" | "🎉" | "😂" | "❓";
const REACTION_TYPES: ReactionType[] = ["👍", "👎", "❤️", "🎉", "😂", "❓"];

type ReplyTo = {
  id: string;
  body: string;
  author_name: string;
};

const REACTION_DEFAULTS: Reaction[] = REACTION_TYPES.map((type) => ({
  type,
  count: 0,
  userReacted: false,
  users: [],
}));

type PollVoter = {
  id: string;
  display_name: string;
  avatar_url: string | null;
};

type PollOption = {
  id: string;
  text: string;
  vote_count: number;
  user_voted: boolean;
  voters: PollVoter[];
};

type PollData = {
  id: string;
  question: string;
  options: PollOption[];
};

type Message = {
  id: string;
  body: string;
  created_at: string;
  edited_at: string | null;
  is_deleted: boolean;
  user_id: string | null;
  thread_id: string;
  client_id?: string | null;
  poll_id: string | null;
  poll: PollData | null;
  smeter_id: string | null;
  smeter: SMeterSummary | null;
  system_event: SystemEvent | null;
  attachments: Attachment[];
  reactions: Reaction[];
  reply_to_id: string | null;
  reply_to: ReplyTo | null;
  profiles: {
    id: string;
    display_name: string;
    avatar_url: string | null;
  } | null;
  delivery_status?: "sending" | "failed";
  fail_id?: string;
};

type FailedEntry = {
  failId: string;
  clientId: string;
  body: string;
  attachments: Attachment[];
  replyToId?: string;
  replyTo: ReplyTo | null;
  created_at: string;
};

type ProfileTarget = {
  id: string | null;
  name: string;
  avatarUrl: string | null;
};

const DRAFT_PREFIX = "coldsoup:draft:";
const OUTBOX_PREFIX = "coldsoup:outbox:";
const BOTTOM_THRESHOLD_PX = 120;

function isScrolledNearBottom(container: HTMLElement): boolean {
  return (
    container.scrollHeight - container.scrollTop - container.clientHeight <=
    BOTTOM_THRESHOLD_PX
  );
}

function draftKey(threadId: string) {
  return `${DRAFT_PREFIX}${threadId}`;
}

function outboxKey(threadId: string) {
  return `${OUTBOX_PREFIX}${threadId}`;
}

function readDraft(threadId: string): string {
  try {
    return localStorage.getItem(draftKey(threadId)) ?? "";
  } catch {
    return "";
  }
}

function writeDraft(threadId: string, value: string) {
  try {
    if (value.trim()) localStorage.setItem(draftKey(threadId), value);
    else localStorage.removeItem(draftKey(threadId));
  } catch {}
}

function clearDraft(threadId: string) {
  try {
    localStorage.removeItem(draftKey(threadId));
  } catch {}
}

function readOutbox(threadId: string): FailedEntry[] {
  try {
    const raw = localStorage.getItem(outboxKey(threadId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as FailedEntry[]) : [];
  } catch {
    return [];
  }
}

function writeOutbox(threadId: string, entries: FailedEntry[]) {
  try {
    if (entries.length === 0) localStorage.removeItem(outboxKey(threadId));
    else localStorage.setItem(outboxKey(threadId), JSON.stringify(entries));
  } catch {}
}

// Centered grey thread-event notice (no author bubble).
function SystemMessage({ event, threadId }: { event: SystemEvent; threadId: string }) {
  return (
    <div className="flex justify-center my-3 px-4">
      <span className="font-mono text-[11px] text-muted text-center leading-relaxed max-w-[85%]">
        {event.kind === "smeter_done" ? (
          <>
            The {event.smeterTitle ?? "S-meter"} s-meter is done.{" "}
            <SMeterResultsLink smeterId={event.smeterId} threadId={threadId} />
          </>
        ) : (
          systemEventText(event)
        )}
      </span>
    </div>
  );
}

function PollView({
  poll: initialPoll,
  threadId,
  myInfo,
}: {
  poll: PollData;
  threadId: string;
  myInfo: {
    id: string;
    display_name: string;
    avatar_url: string | null;
  } | null;
}) {
  const utils = trpc.useUtils();
  const [poll, setPoll] = useState(initialPoll);
  const [newOptionText, setNewOptionText] = useState("");
  const [showAddOption, setShowAddOption] = useState(false);

  // Sync local state when server data updates (after invalidation)
  useEffect(() => {
    setPoll(initialPoll);
  }, [initialPoll]);

  const vote = trpc.polls.vote.useMutation({
    onMutate: ({ pollOptionId }) => {
      const prev = poll;
      setPoll((p) => ({
        ...p,
        options: p.options.map((o) =>
          o.id !== pollOptionId
            ? o
            : {
                ...o,
                user_voted: !o.user_voted,
                vote_count: o.user_voted ? o.vote_count - 1 : o.vote_count + 1,
                voters: o.user_voted
                  ? o.voters.filter((v) => v.id !== myInfo?.id)
                  : myInfo
                    ? [
                        ...o.voters,
                        {
                          id: myInfo.id,
                          display_name: myInfo.display_name,
                          avatar_url: myInfo.avatar_url,
                        },
                      ]
                    : o.voters,
              },
        ),
      }));
      return { prev };
    },
    onError: (_, __, ctx) => {
      if (ctx?.prev) setPoll(ctx.prev);
    },
    onSuccess: () => utils.messages.list.invalidate({ threadId }),
  });

  const addOption = trpc.polls.addOption.useMutation({
    onSuccess: () => {
      setNewOptionText("");
      setShowAddOption(false);
      utils.messages.list.invalidate({ threadId });
    },
  });

  const totalVotes = poll.options.reduce((s, o) => s + o.vote_count, 0);

  return (
    <div className="mt-1 border border-border bg-surface p-3 w-full sm:max-w-[360px] shadow-lg">
      <p className="font-mono text-[12px] font-semibold text-ink mb-1">
        {poll.question}
      </p>
      <p className="font-mono text-[10px] text-muted mb-2">
        {totalVotes} vote{totalVotes !== 1 ? "s" : ""}
      </p>
      <div className="space-y-2">
        {poll.options.map((opt) => {
          const pct =
            totalVotes > 0
              ? Math.round((opt.vote_count / totalVotes) * 100)
              : 0;
          return (
            <div key={opt.id}>
              <button
                className="w-full text-left"
                onClick={() => vote.mutate({ pollOptionId: opt.id })}
              >
                <div className="flex items-center justify-between mb-0.5">
                  <span
                    className={`font-mono text-[11px] ${opt.user_voted ? "text-ink font-semibold" : "text-ink"}`}
                  >
                    {opt.text}
                  </span>
                  <span className="font-mono text-[10px] text-muted ml-2 flex-shrink-0">
                    {pct}%
                  </span>
                </div>
                <div className="h-1 bg-surface-2 border border-border mb-1">
                  <div
                    className={`h-full ${opt.user_voted ? "bg-pastel" : "bg-pastel/60"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </button>
              {opt.voters.length > 0 ? (
                <div className="flex flex-wrap gap-0.5">
                  {opt.voters.map((v) => (
                    <div
                      key={v.id}
                      title={v.display_name}
                      className="flex items-center gap-1 border border-border px-1 py-0.5 sm:px-1"
                    >
                      <div
                        className="w-4 h-4 flex-shrink-0 overflow-hidden flex items-center justify-center font-mono text-[8px] font-semibold"
                        style={{
                          background: "hsl(180 30% 92%)",
                          color: "hsl(180 40% 28%)",
                        }}
                      >
                        {v.avatar_url ? (
                          <img
                            src={v.avatar_url}
                            alt={v.display_name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          v.display_name.slice(0, 1).toUpperCase()
                        )}
                      </div>
                      <span className="font-mono text-[10px] text-ink sm:hidden">
                        {v.display_name}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <span className="font-mono text-[10px] text-muted-2">
                  No votes
                </span>
              )}
            </div>
          );
        })}
      </div>
      {showAddOption ? (
        <form
          className="flex gap-1.5 mt-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!newOptionText.trim()) return;
            addOption.mutate({ pollId: poll.id, text: newOptionText.trim() });
          }}
        >
          <input
            autoFocus
            value={newOptionText}
            onChange={(e) => setNewOptionText(e.target.value)}
            maxLength={200}
            placeholder="Option text…"
            className="flex-1 border border-border bg-surface px-2 py-1 font-mono text-[12px] text-ink placeholder:text-muted focus:outline-none focus:border-ink"
          />
          <button
            type="submit"
            disabled={!newOptionText.trim() || addOption.isPending}
            className="font-mono text-[10px] bg-ink text-surface px-2 py-1 disabled:opacity-40"
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => {
              setShowAddOption(false);
              setNewOptionText("");
            }}
            className="font-mono text-[10px] text-muted hover:text-ink px-1"
          >
            ×
          </button>
        </form>
      ) : (
        <button
          onClick={() => setShowAddOption(true)}
          className="mt-3 font-mono text-[10px] text-muted hover:text-ink transition-colors"
        >
          + add option
        </button>
      )}
    </div>
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

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("en", {
    hour: "2-digit",
    minute: "2-digit",
  });
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

const MENTION_SPECIALS = ["everyone", "here"];

function renderBody(
  body: string,
  members: { id: string; display_name: string }[],
  myId: string,
): React.ReactNode {
  if (!body) return body;

  const sorted = [...members].sort(
    (a, b) => b.display_name.length - a.display_name.length,
  );
  const escaped = sorted.map((m) =>
    m.display_name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  );
  const regex = new RegExp(`@(${[...escaped, ...MENTION_SPECIALS].join("|")})`, "g");

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;
  let key = 0;

  regex.lastIndex = 0;
  while ((match = regex.exec(body)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={key++}>{body.slice(lastIndex, match.index)}</span>);
    }
    const member = members.find((m) => m.display_name === match![1]);
    const isMe = member?.id === myId;
    parts.push(
      <span
        key={key++}
        className={`font-semibold px-0.5 rounded-sm ${
          isMe ? "bg-pastel-tint text-pastel-ink" : "bg-surface-2 text-ink"
        }`}
      >
        @{match[1]}
      </span>,
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < body.length) {
    parts.push(<span key={key++}>{body.slice(lastIndex)}</span>);
  }

  return parts.length ? <>{parts}</> : body;
}

// Long-press / hold actions for an attachment: download + resend to another
// thread. Opened by holding (or right-clicking) an image — the plain tap opens
// the zoomable lightbox instead.
function AttachmentActions({
  attachment,
  groupId,
  currentThreadId,
  onClose,
}: {
  attachment: Attachment;
  groupId: string;
  currentThreadId: string;
  onClose: () => void;
}) {
  const [view, setView] = useState<"actions" | "resend">("actions");
  const [sentToThread, setSentToThread] = useState<string | null>(null);

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

  const { data: threads } = trpc.threads.list.useQuery({ groupId });
  const send = trpc.messages.send.useMutation({
    onSuccess: (_, vars) => {
      setSentToThread(vars.threadId);
      setTimeout(onClose, 1200);
    },
  });

  async function handleDownload() {
    try {
      const res = await fetch(attachment.url);
      const blob = await res.blob();
      const file = new File([blob], attachment.name, { type: blob.type });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
        onClose();
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
    onClose();
  }

  const otherThreads = (threads ?? []).filter((t) => t.id !== currentThreadId);

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
          {view === "actions" ? (
            <div className="space-y-1">
              <button
                onClick={handleDownload}
                className="w-full text-left px-3 py-3 font-mono text-sm text-ink hover:bg-border/40 transition-colors"
              >
                Download
              </button>
              <button
                onClick={() => setView("resend")}
                className="w-full text-left px-3 py-3 font-mono text-sm text-ink hover:bg-border/40 transition-colors"
              >
                Resend to another thread
              </button>
            </div>
          ) : (
            <div className="p-2">
              <button
                onClick={() => setView("actions")}
                className="font-mono text-xs text-muted hover:text-ink transition-colors mb-3"
              >
                ← Back
              </button>
              <p className="font-mono text-[10px] text-muted uppercase tracking-wider mb-2">
                Send to thread
              </p>
              {sentToThread ? (
                <p className="font-mono text-sm text-ink px-1">Sent!</p>
              ) : otherThreads.length === 0 ? (
                <p className="text-xs text-muted px-1">
                  No other threads in this group.
                </p>
              ) : (
                <div className="space-y-1">
                  {otherThreads.map((thread) => (
                    <button
                      key={thread.id}
                      onClick={() =>
                        send.mutate({
                          threadId: thread.id,
                          body: "",
                          attachments: [attachment],
                        })
                      }
                      disabled={send.isPending}
                      className="w-full text-left px-3 py-2.5 font-mono text-sm text-ink hover:bg-border/40 transition-colors border border-transparent hover:border-border disabled:opacity-40"
                    >
                      # {(thread as unknown as { title: string }).title}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
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
  onClose,
}: {
  images: Attachment[];
  index: number;
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

      <button
        onClick={onClose}
        aria-label="Close"
        className="absolute top-3 right-3 z-10 font-mono text-2xl leading-none text-white/80 hover:text-white w-11 h-11 flex items-center justify-center"
      >
        ×
      </button>
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

// A single sent image rendered as the inline polaroid thumbnail. Tap → open the
// zoomable lightbox; hold / right-click → open the actions menu.
function ThreadImage({
  att,
  onOpen,
  onHold,
}: {
  att: Attachment;
  onOpen: () => void;
  onHold: () => void;
}) {
  const press = useImagePress(onOpen, onHold);
  return (
    <button
      {...press}
      className="text-left transition-all duration-150 hover:scale-[1.03]"
      style={{
        background: "var(--background)",
        padding: "8px 8px 28px 8px",
        boxShadow:
          "0 4px 12px rgba(0,0,0,0.18), 0 1px 3px rgba(0,0,0,0.10)",
        rotate: "1deg",
        width: "160px",
        display: "block",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={att.url}
        alt={att.name}
        draggable={false}
        className="w-full object-cover"
        style={{ aspectRatio: "1/1", display: "block" }}
        loading="lazy"
      />
      <span
        className="font-mono text-[10px] text-center truncate block mt-2"
        style={{ color: "#888" }}
      >
        {att.name}
      </span>
    </button>
  );
}

// A single staged (not-yet-sent) file in the composer. Images render as a
// thumbnail tile with a remove button; other files fall back to a name chip.
function PendingPreview({
  file,
  onRemove,
}: {
  file: File;
  onRemove: () => void;
}) {
  const isImage = file.type.startsWith("image/");
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!isImage) return;
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file, isImage]);

  if (isImage && url) {
    return (
      <div className="relative h-16 w-16 overflow-hidden border border-border bg-surface-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={file.name}
          className="h-full w-full object-cover"
        />
        <button
          onClick={onRemove}
          aria-label={`Remove ${file.name}`}
          className="absolute top-0.5 right-0.5 flex h-5 w-5 items-center justify-center bg-ink/70 text-surface text-sm leading-none hover:bg-ink transition-colors"
        >
          ×
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-16 items-center gap-1.5 border border-border bg-surface-2 px-2 text-xs text-ink">
      <span className="max-w-[120px] truncate font-mono">{file.name}</span>
      <button
        onClick={onRemove}
        aria-label={`Remove ${file.name}`}
        className="ml-0.5 text-muted hover:text-ink transition-colors"
      >
        ×
      </button>
    </div>
  );
}

// Tap vs. hold discrimination for images. A plain tap/click fires onTap; a
// 500ms hold or a right-click fires onHold (and suppresses the following tap).
// stopPropagation keeps the press off the message row's own long-press/menu.
function useImagePress(onTap: () => void, onHold: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const held = useRef(false);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    start.current = null;
  };

  return {
    onPointerDown: (e: React.PointerEvent) => {
      e.stopPropagation();
      held.current = false;
      start.current = { x: e.clientX, y: e.clientY };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        held.current = true;
        timer.current = null;
        onHold();
      }, 500);
    },
    onPointerMove: (e: React.PointerEvent) => {
      const s = start.current;
      if (!s) return;
      if (Math.abs(e.clientX - s.x) > 10 || Math.abs(e.clientY - s.y) > 10) {
        clear();
      }
    },
    onPointerUp: () => clear(),
    onPointerLeave: () => clear(),
    onClick: (e: React.MouseEvent) => {
      if (held.current) {
        e.preventDefault();
        e.stopPropagation();
        held.current = false;
        return;
      }
      onTap();
    },
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      clear();
      held.current = true;
      onHold();
    },
  };
}

function Avatar({
  name,
  avatarUrl,
  pulsing,
  size = 28,
  fontSize = 10,
}: {
  name: string;
  avatarUrl?: string | null;
  pulsing?: boolean;
  size?: number;
  fontSize?: number;
}) {
  const [imgError, setImgError] = useState(false);

  const initials = name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const hue = name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;

  if (avatarUrl && !imgError) {
    return (
      <Image
        src={avatarUrl}
        alt={name}
        width={size}
        height={size}
        className="rounded-sm object-cover flex-shrink-0"
        style={{
          width: size,
          height: size,
          animation: pulsing ? "breath 1.6s ease-out" : undefined,
        }}
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <div
      className="flex-shrink-0 flex items-center justify-center border border-border font-mono font-semibold"
      style={{
        width: size,
        height: size,
        fontSize,
        background: `hsl(${hue} 30% 92%)`,
        color: `hsl(${hue} 40% 28%)`,
        animation: pulsing ? "breath 1.6s ease-out" : undefined,
      }}
      title={name}
    >
      {initials}
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
          <Avatar name={target.name} avatarUrl={target.avatarUrl} size={96} fontSize={32} />
        </div>
        <p className="mt-4 text-base font-semibold text-ink break-words">
          {target.name}
        </p>
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

function LinkPreview({ url }: { url: string }) {
  const { data } = trpc.links.unfurl.useQuery(
    { url },
    { staleTime: 60 * 60 * 1000, retry: false },
  );
  if (!data || !data.title) return null;
  let domain = "";
  try { domain = new URL(url).hostname.replace(/^www\./, ""); } catch { /* ignore */ }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="block mt-2 max-w-sm border border-border bg-surface-2 hover:border-pastel-deep transition-colors overflow-hidden"
    >
      {data.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={data.image_url} alt="" className="w-full h-36 object-cover" />
      )}
      <div className="p-2">
        <p className="text-[13px] font-semibold text-ink line-clamp-2">{data.title}</p>
        {data.description && (
          <p className="text-[11px] text-muted line-clamp-2 mt-0.5">{data.description}</p>
        )}
        <p className="font-mono text-[10px] text-muted-2 mt-1 truncate">{domain}</p>
      </div>
    </a>
  );
}

// One cell in the multi-image mosaic. Tap → lightbox; hold/right-click → actions.
function GridTile({
  att,
  onOpen,
  onHold,
  overlay,
  style,
}: {
  att: Attachment;
  onOpen: (att: Attachment) => void;
  onHold: (att: Attachment) => void;
  overlay?: number;
  style?: React.CSSProperties;
}) {
  const press = useImagePress(() => onOpen(att), () => onHold(att));
  return (
    <button
      {...press}
      title={att.name}
      className="relative block w-full h-full overflow-hidden bg-surface-2 focus:outline-none"
      style={style}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={att.url}
        alt={att.name}
        draggable={false}
        loading="lazy"
        className="w-full h-full object-cover block"
      />
      {overlay != null && overlay > 0 && (
        <span className="absolute inset-0 flex items-center justify-center bg-ink/55 text-surface font-mono text-lg font-semibold pointer-events-none select-none">
          +{overlay}
        </span>
      )}
    </button>
  );
}

// Messenger-style image mosaic for messages with 2+ images. Tidy grid, no
// hover-fan / drag — tap any tile to open the lightbox.
function ImageGallery({
  attachments,
  onOpen,
  onHold,
}: {
  attachments: Attachment[];
  onOpen: (att: Attachment) => void;
  onHold: (att: Attachment) => void;
}) {
  const n = attachments.length;
  const shown = attachments.slice(0, 4);
  const extra = n - shown.length;
  const MAX_W = 272;

  if (n === 2) {
    return (
      <div
        className="grid gap-[2px] overflow-hidden"
        style={{ width: MAX_W, gridTemplateColumns: "1fr 1fr" }}
      >
        {shown.map((att, i) => (
          <GridTile
            key={i}
            att={att}
            onOpen={onOpen}
            onHold={onHold}
            style={{ aspectRatio: "1 / 1" }}
          />
        ))}
      </div>
    );
  }

  if (n === 3) {
    return (
      <div
        className="grid gap-[2px] overflow-hidden"
        style={{
          width: MAX_W,
          height: 180,
          gridTemplateColumns: "1fr 1fr",
          gridTemplateRows: "1fr 1fr",
        }}
      >
        <GridTile
          att={shown[0]}
          onOpen={onOpen}
          onHold={onHold}
          style={{ gridRow: "1 / span 2" }}
        />
        <GridTile att={shown[1]} onOpen={onOpen} onHold={onHold} />
        <GridTile att={shown[2]} onOpen={onOpen} onHold={onHold} />
      </div>
    );
  }

  // n >= 4: 2×2 grid, last tile shows "+N" overlay when more images exist.
  return (
    <div
      className="grid gap-[2px] overflow-hidden"
      style={{ width: MAX_W, gridTemplateColumns: "1fr 1fr" }}
    >
      {shown.map((att, i) => (
        <GridTile
          key={i}
          att={att}
          onOpen={onOpen}
          onHold={onHold}
          overlay={i === 3 ? extra : undefined}
          style={{ aspectRatio: "1 / 1" }}
        />
      ))}
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
  const router = useRouter();
  const utils = trpc.useUtils();
  const { data: meta, isLoading } = trpc.threads.get.useQuery({ threadId });
  const { data: notifPrefs } = trpc.notifications.prefs.useQuery();
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!meta) return;
    setDueDate((meta as { due_date: string | null }).due_date ?? null);
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
      router.push(`/g/${groupId}`);
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
                <p className="font-mono text-[10px] text-muted uppercase tracking-wider mb-2">
                  Assignee
                </p>
                {creator ? (
                  <div className="flex items-center gap-2">
                    <Avatar
                      name={creator.display_name}
                      avatarUrl={creator.avatar_url}
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
            disabled={updateStatus.isPending}
            className={`relative z-10 flex-1 min-w-0 flex items-center justify-center font-mono text-[10px] uppercase tracking-[0.12em] px-2.5 py-2.5 md:py-[5px] transition-colors duration-200 border-r last:border-r-0 border-border disabled:opacity-40 ${
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

export function ThreadDetail({
  threadId,
  groupId,
  initialTitle,
  initialStatus,
  highlightMessageId,
}: {
  threadId: string;
  groupId: string;
  initialTitle: string;
  initialStatus: ThreadStatus;
  highlightMessageId?: string;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  // Message ids present at load time — these render instantly (no fade). Only
  // messages that arrive later (realtime / sent) animate in.
  const noAnimateIds = useRef<Set<string>>(new Set());
  const [body, setBody] = useState("");
  // True while the soft keyboard is up — used to drop the composer's safe-area
  // bottom padding (otherwise it leaves a gap between the input and keyboard).
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [myInfo, setMyInfo] = useState<{
    id: string;
    display_name: string;
    avatar_url: string | null;
  } | null>(null);
  const presenceChannelRef = useRef<RealtimeChannel | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [threadStatus, setThreadStatus] = useState<ThreadStatus>(initialStatus);
  const [showDetails, setShowDetails] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordStreamRef = useRef<MediaStream | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [activeLightbox, setActiveLightbox] = useState<{
    images: Attachment[];
    index: number;
  } | null>(null);
  const [imageActions, setImageActions] = useState<Attachment | null>(null);
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);
  const tooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const outboxLoadedRef = useRef(false);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [showPollCreate, setShowPollCreate] = useState(false);
  const [showSMeterCreate, setShowSMeterCreate] = useState(false);
  const [failedSends, setFailedSends] = useState<FailedEntry[]>([]);
  const [profileTarget, setProfileTarget] = useState<ProfileTarget | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [activeMessageMenuId, setActiveMessageMenuId] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  // Flash highlight for jump-to-message (reply quotes, search deep-links).
  const [jumpFlashId, setJumpFlashId] = useState<string | null>(null);
  const jumpBusyRef = useRef(false);
  // Aggregate attachment upload progress, 0..1 (null = not uploading).
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
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
  // True once the realtime channel has joined at least once; lets us tell a
  // reconnect apart from the initial subscribe so we only backfill on reconnect.
  const hasSubscribedRef = useRef(false);
  // Throttle typing presence: only broadcast typing:true on the leading edge.
  const typingActiveRef = useRef(false);
  // Latest outbox + retry fn in refs so the "online" listener (bound once) can
  // flush without re-binding on every state change.
  const failedSendsRef = useRef<FailedEntry[]>([]);
  const retryFailedRef = useRef<(entry: FailedEntry) => void>(() => {});
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const composerTouchYRef = useRef<number | null>(null);
  const utils = trpc.useUtils();
  const router = useRouter();
  const { markRead } = useUnread();

  // Reply state
  const [replyingTo, setReplyingTo] = useState<{
    id: string;
    body: string;
    authorName: string;
  } | null>(null);

  // Edit state
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");

  // @mention state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);

  const markReadServer = trpc.threads.markRead.useMutation({
    onSuccess: () => {
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
  const { data: readReceipts = [] } = trpc.threads.reads.useQuery(
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
      document.activeElement === textareaRef.current
    ) {
      textareaRef.current?.blur();
    }

    const isNearBottom = isScrolledNearBottom(container);
    isNearBottomRef.current = isNearBottom;
    if (isNearBottom) setHasNewMessages(false);
  }, []);

  useEffect(() => {
    markRead(threadId, groupId);
  }, [threadId, groupId, markRead]);

  // Read receipts — mark on open and whenever new messages arrive while the
  // thread is open. Advances BOTH the client lastSeen marker (so the
  // thread-list unread dot clears for messages seen while viewing, including
  // your own just-sent message) and the server-side receipt (so others see
  // "seen").
  useEffect(() => {
    if (messages.length > 0) {
      markRead(threadId, groupId);
      markReadServer.mutate({ threadId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, groupId, messages.length]);

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

  // Detect the soft keyboard via the VisualViewport: when it shrinks the visual
  // viewport well below the layout viewport, the keyboard is up.
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) return;
    const onResize = () => setKeyboardOpen(window.innerHeight - vv.height > 120);
    vv.addEventListener("resize", onResize);
    onResize();
    return () => vv.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    setBody(readDraft(threadId));
    setReplyingTo(null);
    setEditingMessageId(null);
    setEditBody("");
    setPendingFiles([]);
    setMentionQuery(null);
  }, [threadId]);

  useEffect(() => {
    if (editingMessageId) return;
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => writeDraft(threadId, body), 400);
    return () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    };
  }, [body, editingMessageId, threadId]);

  useEffect(() => {
    outboxLoadedRef.current = false;
    setFailedSends(readOutbox(threadId));
    outboxLoadedRef.current = true;
  }, [threadId]);

  useEffect(() => {
    if (!outboxLoadedRef.current) return;
    writeOutbox(threadId, failedSends);
  }, [failedSends, threadId]);

  // Auto-flush the outbox when connectivity returns — local-first: queue while
  // offline, resend on reconnect (no manual retry needed).
  useEffect(() => {
    const onOnline = () => {
      const entries = failedSendsRef.current;
      entries.forEach((entry) => retryFailedRef.current(entry));
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  const createPoll = trpc.polls.create.useMutation({
    onSuccess: (msg) => {
      haptic("light");
      setMessages((prev) => [
        ...prev,
        {
          ...(msg as unknown as Message),
          poll_id:
            (msg as unknown as { poll_id: string | null }).poll_id ?? null,
          poll: null,
          smeter_id: null,
          smeter: null,
          system_event: null,
          reactions: REACTION_DEFAULTS.map((r) => ({ ...r })),
          reply_to: null,
        },
      ]);
      setShowPollCreate(false);
      utils.messages.list.invalidate({ threadId });
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
      // The await above lets the realtime INSERT echo land first, so dedupe by
      // id — otherwise the card flashes twice until the next refetch.
      const newId = (msg as unknown as { id: string }).id;
      setMessages((prev) =>
        prev.some((m) => m.id === newId)
          ? prev
          : [
              ...prev,
              {
                ...(msg as unknown as Message),
                poll_id: null,
                poll: null,
                smeter_id: smeterId,
                smeter,
                system_event: null,
                reactions: REACTION_DEFAULTS.map((r) => ({ ...r })),
                reply_to: null,
              },
            ]
      );
      setShowSMeterCreate(false);
      utils.messages.list.invalidate({ threadId });
    },
    onError: () => {
      forceScrollOnNextMessageRef.current = false;
    },
  });

  const toggleReaction = trpc.messages.toggleReaction.useMutation({
    onMutate: ({ messageId, type }) => {
      haptic("light");
      const myName = myInfo?.display_name ?? null;
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== messageId) return m;
          return {
            ...m,
            reactions: m.reactions.map((r) => {
              if (r.type !== type) return r;
              const adding = !r.userReacted;
              return {
                ...r,
                count: adding ? r.count + 1 : r.count - 1,
                userReacted: adding,
                users: myName
                  ? adding
                    ? [...r.users, myName]
                    : r.users.filter((n) => n !== myName)
                  : r.users,
              };
            }),
          };
        }),
      );
    },
    onError: () => {
      utils.messages.list.invalidate({ threadId });
    },
    // Optimistic state lives only in local `setMessages`; the query cache keeps
    // the pre-reaction load. With staleTime 30s, a quick leave/return serves
    // that stale cache and the reaction vanishes. Invalidate so the cache
    // re-reads the persisted reaction from the server.
    onSettled: () => {
      utils.messages.list.invalidate({ threadId });
    },
  });

  const deleteMessage = trpc.messages.deleteMessage.useMutation({
    onMutate: ({ messageId }) => {
      haptic("warning");
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, is_deleted: true } : m)),
      );
    },
    onError: () => {
      utils.messages.list.invalidate({ threadId });
    },
    // Local-only optimistic edit; sync the query cache so a quick leave/return
    // within staleTime doesn't resurrect the deleted message from stale cache.
    onSettled: () => {
      utils.messages.list.invalidate({ threadId });
    },
  });

  const editMessage = trpc.messages.edit.useMutation({
    onSuccess: (updated) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === updated.id
            ? { ...m, body: updated.body, edited_at: updated.edited_at }
            : m,
        ),
      );
      setEditingMessageId(null);
      setEditBody("");
    },
    // Sync the query cache so a quick leave/return within staleTime doesn't show
    // the pre-edit body from stale cache.
    onSettled: () => {
      utils.messages.list.invalidate({ threadId });
    },
  });

  const { data: workspaceMembers } = trpc.messages.groupMembers.useQuery(
    { groupId },
    { refetchOnWindowFocus: false, staleTime: 5 * 60 * 1000 },
  );

  // Latest members in a ref so the realtime INSERT handler can resolve a
  // sender's profile locally (no per-message DB round-trip) without re-binding
  // the channel on every member-list change.
  const membersRef = useRef(workspaceMembers);
  membersRef.current = workspaceMembers;

  const mentionSuggestions = useMemo(() => {
    if (mentionQuery === null || !workspaceMembers) return [];
    const q = mentionQuery.toLowerCase();
    const specials = MENTION_SPECIALS
      .filter((s) => mentionQuery === "" || s.includes(q))
      .map((s) => ({ id: `__special_${s}`, display_name: s, avatar_url: null }));
    const matched =
      mentionQuery === ""
        ? workspaceMembers
        : workspaceMembers.filter((m) => m.display_name.toLowerCase().includes(q));
    return [...specials, ...matched];
  }, [mentionQuery, workspaceMembers]);

  const { data: loadedMessages, isLoading } = trpc.messages.list.useQuery(
    { threadId },
    { refetchOnWindowFocus: false },
  );

  useEffect(() => {
    if (loadedMessages) {
      const { messages: msgs, hasMore: more } = loadedMessages as unknown as {
        messages: Message[];
        hasMore: boolean;
      };
      // Mark the loaded batch as no-animate so it renders instantly.
      for (const m of msgs) noAnimateIds.current.add(m.id);
      // Merge: keep any still-pending optimistic sends that the server batch
      // doesn't yet include (a refetch/backfill must not drop in-flight temps).
      setMessages((prev) => {
        const pending = prev.filter(
          (m) =>
            m.delivery_status === "sending" &&
            !msgs.some(
              (s) =>
                s.id === m.id ||
                (!!m.client_id && s.client_id === m.client_id),
            ),
        );
        return pending.length ? [...msgs, ...pending] : msgs;
      });
      setHasMore(more);
    }
  }, [loadedMessages]);

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

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name, avatar_url")
        .eq("id", user.id)
        .single();
      if (profile)
        setMyInfo({
          id: user.id,
          display_name: profile.display_name,
          avatar_url: profile.avatar_url ?? null,
        });
    });
  }, []);

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
      const names = Object.entries(state)
        .filter(([uid]) => uid !== myInfo.id)
        .map(([, presences]) => {
          const arr = presences as { display_name: string; typing: boolean; at?: number }[];
          if (arr.length === 0) return null;
          return arr.reduce((a, b) => ((b.at ?? 0) >= (a.at ?? 0) ? b : a));
        })
        .filter((p): p is { display_name: string; typing: boolean; at?: number } => !!p && p.typing)
        .map((p) => p.display_name);
      setTypingUsers(names);
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

  // Realtime: new messages + edits
  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    (async () => {
      // Ensure the realtime socket carries the user JWT BEFORE the channel
      // joins, otherwise postgres_changes joins as anon and RLS filters every
      // event (channel still reports SUBSCRIBED, just delivers nothing).
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (token) setRealtimeAuth(supabase, token);
      if (cancelled) return;

    // Re-fetch poll data for every poll in this thread and merge into state.
    // poll_votes/poll_options carry no thread_id, so refresh all thread polls.
    const refreshThreadPolls = async () => {
      let pollIds: string[] = [];
      setMessages((prev) => {
        pollIds = prev.filter((m) => m.poll_id).map((m) => m.poll_id as string);
        return prev;
      });
      if (pollIds.length === 0) return;
      // Bypass the query cache — staleTime would otherwise return the poll's
      // previous (pre-vote) data and the merge would be a no-op.
      const map = await utils.polls.getMany.fetch({ pollIds }, { staleTime: 0 });
      setMessages((prev) =>
        prev.map((m) =>
          m.poll_id && map[m.poll_id] ? { ...m, poll: map[m.poll_id] } : m,
        ),
      );
    };

    // Same idea for S-meters: votes land in smeter_responses (no thread_id),
    // so refresh every S-meter card's summary in this thread.
    const refreshThreadSmeters = async () => {
      let smeterIds: string[] = [];
      setMessages((prev) => {
        smeterIds = prev.filter((m) => m.smeter_id).map((m) => m.smeter_id as string);
        return prev;
      });
      if (smeterIds.length === 0) return;
      const map = await utils.smeters.getMany.fetch({ smeterIds }, { staleTime: 0 });
      setMessages((prev) =>
        prev.map((m) =>
          m.smeter_id && map[m.smeter_id] ? { ...m, smeter: map[m.smeter_id] } : m,
        ),
      );
    };

    channel = supabase
      .channel(`messages:thread:${threadId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `thread_id=eq.${threadId}`,
        },
        async (payload) => {
          const newMsg = payload.new as {
            id: string;
            body: string;
            created_at: string;
            edited_at: string | null;
            is_deleted: boolean;
            user_id: string;
            thread_id: string;
            client_id: string | null;
            attachments: Attachment[];
            reply_to_id: string | null;
            poll_id: string | null;
            smeter_id: string | null;
            system_event: SystemEvent | null;
          };

          // Defense-in-depth: the server-side filter already scopes to this
          // thread, but keep the guard in case the binding falls back to
          // table-wide delivery.
          if (newMsg.thread_id !== threadId) return;

          // Resolve the sender locally from the cached group members — avoids a
          // DB round-trip per incoming message (the previous hot path). Fall
          // back to a query only when the sender isn't in the cache yet.
          let profile:
            | { id: string; display_name: string; avatar_url: string | null }
            | null =
            membersRef.current?.find((m) => m.id === newMsg.user_id) ?? null;
          if (!profile) {
            const { data } = await supabase
              .from("profiles")
              .select("id, display_name, avatar_url")
              .eq("id", newMsg.user_id)
              .single();
            profile = data ?? null;
          }

          // Poll messages carry no poll payload in the row — fetch it so the
          // poll renders live instead of appearing blank until refresh.
          let poll = null;
          if (newMsg.poll_id) {
            const map = await utils.polls.getMany.fetch(
              { pollIds: [newMsg.poll_id] },
              { staleTime: 0 },
            );
            poll = map[newMsg.poll_id] ?? null;
          }

          // S-meter messages carry no summary in the row — fetch it.
          let smeter: SMeterSummary | null = null;
          if (newMsg.smeter_id) {
            const map = await utils.smeters.getMany.fetch(
              { smeterIds: [newMsg.smeter_id] },
              { staleTime: 0 },
            );
            smeter = map[newMsg.smeter_id] ?? null;
          }

          // Reply quote isn't in the row — fetch the replied-to message so the
          // quote renders live instead of only after a reload.
          let reply_to: ReplyTo | null = null;
          if (newMsg.reply_to_id) {
            const { data: replyMsg } = await supabase
              .from("messages")
              .select("id, body, profiles(display_name)")
              .eq("id", newMsg.reply_to_id)
              .single();
            if (replyMsg) {
              reply_to = {
                id: replyMsg.id as string,
                body: ((replyMsg.body as string) ?? "").slice(0, 120),
                author_name:
                  (replyMsg.profiles as unknown as { display_name: string } | null)
                    ?.display_name ?? "Unknown",
              };
            }
          }

          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            const reconciled = {
              ...newMsg,
              is_deleted: newMsg.is_deleted ?? false,
              poll_id: newMsg.poll_id ?? null,
              poll,
              smeter_id: newMsg.smeter_id ?? null,
              smeter,
              system_event: (newMsg.system_event ?? null) as SystemEvent | null,
              profiles: profile ?? null,
              reactions: REACTION_DEFAULTS.map((r) => ({ ...r })),
              reply_to,
            };
            // If this is the realtime echo of our own optimistic message,
            // replace the pending temp instead of appending a duplicate. Match
            // on the client_id (deterministic) and fall back to the old
            // body+user heuristic for messages sent before client_id existed.
            const tempIdx = prev.findIndex((m) =>
              m.delivery_status && newMsg.client_id
                ? m.client_id === newMsg.client_id
                : m.delivery_status &&
                  m.user_id === newMsg.user_id &&
                  m.body === newMsg.body &&
                  (m.reply_to_id ?? null) === (newMsg.reply_to_id ?? null),
            );
            if (tempIdx !== -1) {
              const copy = [...prev];
              copy[tempIdx] = reconciled;
              return copy;
            }
            return [...prev, reconciled];
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "poll_votes" },
        () => refreshThreadPolls(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "poll_options" },
        () => refreshThreadPolls(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "smeter_responses" },
        () => refreshThreadSmeters(),
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `thread_id=eq.${threadId}`,
        },
        (payload) => {
          const updated = payload.new as {
            id: string;
            body: string;
            edited_at: string | null;
            is_deleted: boolean;
            thread_id: string;
          };
          if (updated.thread_id !== threadId) return;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === updated.id
                ? {
                    ...m,
                    body: updated.body,
                    edited_at: updated.edited_at ?? null,
                    is_deleted: updated.is_deleted ?? false,
                  }
                : m,
            ),
          );
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "thread_reads",
        },
        (payload) => {
          const row = (payload.new ?? payload.old) as { thread_id?: string } | null;
          if (row?.thread_id !== threadId) return;
          utils.threads.reads.invalidate({ threadId });
        },
      )
      .subscribe((status) => {
        // On a reconnect (not the first SUBSCRIBED), refetch to backfill any
        // messages that landed while the socket was down. The merge in the
        // messages.list effect preserves still-pending optimistic sends.
        if (status === "SUBSCRIBED") {
          if (hasSubscribedRef.current) {
            utils.messages.list.invalidate({ threadId });
            utils.threads.reads.invalidate({ threadId });
          }
          hasSubscribedRef.current = true;
        }
      });
    })();

    // Returning to a backgrounded tab can miss realtime events; refetch on
    // visibility so the thread is never silently stale.
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        utils.messages.list.invalidate({ threadId });
        utils.threads.reads.invalidate({ threadId });
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      hasSubscribedRef.current = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, [threadId, utils.threads.reads]);

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
          const updated = payload.new as { status: ThreadStatus };
          setThreadStatus(updated.status);
          utils.threads.list.invalidate({ groupId });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [threadId, groupId, utils]);

  const sendMessage = trpc.messages.send.useMutation({
    onMutate: (vars) => {
      haptic("light");
      const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const clientId = vars.clientId ?? tempId;
      const messageBody = vars.body ?? "";
      const replyTo =
        vars.replyToId
          ? replyingTo?.id === vars.replyToId
            ? {
                id: replyingTo.id,
                body: replyingTo.body,
                author_name: replyingTo.authorName,
              }
            : (() => {
                const found = messages.find((m) => m.id === vars.replyToId);
                return found
                  ? {
                      id: found.id,
                      body: found.body.slice(0, 120),
                      author_name:
                        found.profiles?.display_name ?? "Unknown",
                    }
                  : null;
              })()
          : null;
      const tempMessage: Message = {
        id: tempId,
        body: messageBody,
        created_at: new Date().toISOString(),
        edited_at: null,
        is_deleted: false,
        user_id: myInfo?.id ?? null,
        thread_id: threadId,
        client_id: clientId,
        poll_id: null,
        poll: null,
        smeter_id: null,
        smeter: null,
        system_event: null,
        attachments: vars.attachments ?? [],
        reactions: REACTION_DEFAULTS.map((r) => ({ ...r })),
        reply_to_id: vars.replyToId ?? null,
        reply_to: replyTo,
        profiles: myInfo
          ? {
              id: myInfo.id,
              display_name: myInfo.display_name,
              avatar_url: myInfo.avatar_url,
            }
          : null,
        delivery_status: "sending",
      };
      const failed: FailedEntry = {
        failId: tempId,
        clientId,
        body: messageBody,
        attachments: vars.attachments ?? [],
        replyToId: vars.replyToId,
        replyTo,
        created_at: tempMessage.created_at,
      };
      setMessages((prev) => [...prev, tempMessage]);
      return { tempId, failed };
    },
    onSuccess: (msg, _vars, ctx) => {
      const m = msg as unknown as Message;
      setMessages((prev) => {
        if (ctx?.tempId && prev.some((x) => x.id === ctx.tempId)) {
          if (prev.some((x) => x.id === m.id)) {
            return prev.filter((x) => x.id !== ctx.tempId);
          }
          return prev.map((x) => (x.id === ctx.tempId ? m : x));
        }
        if (prev.some((x) => x.id === m.id)) return prev;
        return [...prev, m];
      });
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.tempId) {
        setMessages((prev) => prev.filter((m) => m.id !== ctx.tempId));
      }
      if (ctx?.failed) {
        setFailedSends((prev) =>
          prev.some((f) => f.failId === ctx.failed.failId)
            ? prev
            : [...prev, ctx.failed],
        );
      }
    },
    onSettled: () => {
      utils.threads.list.invalidate({ groupId });
    },
  });

  async function loadEarlier() {
    if (isLoadingMore || !hasMore || messages.length === 0) return;
    setIsLoadingMore(true);
    const container = scrollContainerRef.current;
    const prevScrollHeight = container?.scrollHeight ?? 0;
    try {
      const cursor = messages[0].created_at;
      const result = await utils.messages.list.fetch({ threadId, cursor });
      const { messages: older, hasMore: more } = result as unknown as {
        messages: Message[];
        hasMore: boolean;
      };
      setHasMore(more);
      for (const m of older) noAnimateIds.current.add(m.id);
      setMessages((prev) => [...older, ...prev]);
      requestAnimationFrame(() => {
        if (container) {
          container.scrollTop = container.scrollHeight - prevScrollHeight;
        }
      });
    } catch {
      // silently ignore — user can retry
    } finally {
      setIsLoadingMore(false);
    }
  }

  // Scroll a message into view, paging in older history when it isn't loaded
  // yet — reply quotes and search deep-links often point at old messages.
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
    setIsLoadingMore(true);
    try {
      let more = hasMore;
      let cursor: string | undefined = messages[0]?.created_at;
      let found = false;
      // Bounded: at most 20 pages (~1000 messages) per jump.
      for (let i = 0; i < 20 && more && cursor && !found; i++) {
        const result = (await utils.messages.list.fetch({ threadId, cursor })) as unknown as {
          messages: Message[];
          hasMore: boolean;
        };
        const older = result.messages;
        more = result.hasMore;
        if (older.length === 0) break;
        cursor = older[0].created_at;
        found = older.some((m) => m.id === messageId);
        for (const m of older) noAnimateIds.current.add(m.id);
        setMessages((prev) => [...older, ...prev]);
      }
      setHasMore(more);
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
      setIsLoadingMore(false);
      jumpBusyRef.current = false;
    }
  }

  // Raw XHR against the storage REST endpoint — supabase-js upload() exposes
  // no progress events, and a 100 MB video behind a bare spinner feels hung.
  function xhrUpload(
    url: string,
    file: File,
    headers: Record<string, string>,
    onProgress: (loadedBytes: number) => void,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", url);
      for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(e.loaded);
      };
      xhr.onload = () =>
        xhr.status >= 200 && xhr.status < 300
          ? resolve()
          : reject(new Error(`Upload failed (${xhr.status})`));
      xhr.onerror = () => reject(new Error("Upload failed"));
      xhr.send(file);
    });
  }

  async function uploadFiles(files: File[]): Promise<Attachment[]> {
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;
    if (!session || !user) throw new Error("Not authenticated");

    // Resize first so progress is measured against the bytes actually sent.
    const prepared = await Promise.all(
      files.map(async (raw) => ({ raw, file: await resizeImageIfNeeded(raw) })),
    );
    const totalBytes = prepared.reduce((s, p) => s + p.file.size, 0) || 1;
    const loadedBytes = prepared.map(() => 0);
    const report = () =>
      setUploadProgress(
        Math.min(0.99, loadedBytes.reduce((a, b) => a + b, 0) / totalBytes),
      );
    setUploadProgress(0);

    const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    try {
      return await Promise.all(
        prepared.map(async ({ raw, file }, i) => {
          const ext = file.name.split(".").pop() ?? "bin";
          const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
          await xhrUpload(
            `${baseUrl}/storage/v1/object/attachments/${path}`,
            file,
            {
              authorization: `Bearer ${session.access_token}`,
              apikey: anonKey,
              "content-type": file.type || "application/octet-stream",
              "cache-control": "max-age=3600",
              "x-upsert": "false",
            },
            (loaded) => {
              loadedBytes[i] = loaded;
              report();
            },
          );
          const {
            data: { publicUrl },
          } = supabase.storage.from("attachments").getPublicUrl(path);
          return {
            url: publicUrl,
            type: attachmentTypeFor(raw),
            name: raw.name,
          };
        }),
      );
    } finally {
      setUploadProgress(null);
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

  function insertMention(name: string) {
    const cursor = textareaRef.current?.selectionStart ?? body.length;
    const textBeforeCursor = body.slice(0, cursor);
    const lastAtIdx = textBeforeCursor.lastIndexOf("@");
    const newBody =
      body.slice(0, lastAtIdx) + "@" + name + " " + body.slice(cursor);
    setBody(newBody);
    setMentionQuery(null);
    setTimeout(() => {
      if (textareaRef.current) {
        const newCursor = lastAtIdx + name.length + 2;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newCursor, newCursor);
      }
    }, 0);
  }

  function handleBodyChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setBody(val);

    // Detect @mention
    const cursor = e.target.selectionStart ?? val.length;
    const textBeforeCursor = val.slice(0, cursor);
    const lastAtIdx = textBeforeCursor.lastIndexOf("@");
    if (lastAtIdx >= 0) {
      const partial = textBeforeCursor.slice(lastAtIdx + 1);
      if (
        partial.length <= 40 &&
        !partial.includes("\n") &&
        !partial.includes("@")
      ) {
        setMentionQuery(partial);
        setMentionIndex(0);
      } else {
        setMentionQuery(null);
      }
    } else {
      setMentionQuery(null);
    }

    if (presenceChannelRef.current && myInfo) {
      // Leading-edge only: broadcast typing:true once, then let the 3s timeout
      // clear it — instead of a presence update on every keystroke.
      if (!typingActiveRef.current) {
        typingActiveRef.current = true;
        presenceChannelRef.current.track({
          display_name: myInfo.display_name,
          typing: true,
          at: Date.now(),
        });
      }
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(stopTyping, 3000);
    }
  }

  function pickAudioMime(): { mime: string; ext: string } {
    const opts: [string, string][] = [
      ["audio/webm", "webm"],
      ["audio/mp4", "m4a"],
      ["audio/ogg", "ogg"],
    ];
    for (const [mime, ext] of opts) {
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(mime)) {
        return { mime, ext };
      }
    }
    return { mime: "audio/webm", ext: "webm" };
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordStreamRef.current = stream;
      const { mime, ext } = pickAudioMime();
      const rec = new MediaRecorder(stream, { mimeType: mime });
      recordChunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) recordChunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const blob = new Blob(recordChunksRef.current, { type: mime });
        const file = new File([blob], `voice-${Date.now()}.${ext}`, { type: mime });
        setPendingFiles((prev) => [...prev, file]);
        recordStreamRef.current?.getTracks().forEach((t) => t.stop());
        recordStreamRef.current = null;
      };
      mediaRecorderRef.current = rec;
      rec.start();
      setIsRecording(true);
      setRecordSeconds(0);
      recordTimerRef.current = setInterval(() => setRecordSeconds((s) => s + 1), 1000);
    } catch {
      // mic permission denied / unavailable — silently ignore
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    recordTimerRef.current = null;
    setIsRecording(false);
  }

  function fmtRec(s: number) {
    const m = Math.floor(s / 60);
    return `${m}:${(s % 60).toString().padStart(2, "0")}`;
  }

  async function handleSend() {
    if (
      (!body.trim() && pendingFiles.length === 0) ||
      sendMessage.isPending ||
      uploading
    )
      return;

    stopTyping();
    // Keep the keyboard up: ignore scroll-up dismiss during the send reflow.
    suppressKbDismissRef.current = Date.now() + 800;
    forceScrollOnNextMessageRef.current = true;
    scrollToBottom("smooth");
    setUploading(true);
    setUploadError(null);

    let attachments: Attachment[] = [];
    try {
      if (pendingFiles.length > 0) {
        attachments = await uploadFiles(pendingFiles);
      }
      sendMessage.mutate({
        threadId,
        body: body.trim(),
        attachments,
        replyToId: replyingTo?.id,
        clientId: crypto.randomUUID(),
      });
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
      clearDraft(threadId);
      setBody("");
      setPendingFiles([]);
      setReplyingTo(null);
      setMentionQuery(null);
      textareaRef.current?.focus();
    } catch {
      forceScrollOnNextMessageRef.current = false;
      setUploadError("Upload failed. Try again.");
    } finally {
      setUploading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (mentionSuggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((i) => Math.min(i + 1, mentionSuggestions.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertMention(mentionSuggestions[mentionIndex].display_name);
        return;
      }
      if (e.key === "Escape") {
        setMentionQuery(null);
        return;
      }
    }
    if (e.key === "Escape" && replyingTo) {
      e.preventDefault();
      setReplyingTo(null);
      return;
    }
    // ↑ in an empty composer edits your last message (standard chat idiom).
    if (e.key === "ArrowUp" && !e.shiftKey && body.trim() === "" && !editingMessageId) {
      const last = [...messages]
        .reverse()
        .find(
          (m) =>
            !!myInfo?.id &&
            m.user_id === myInfo.id &&
            !m.is_deleted &&
            !m.delivery_status &&
            !!m.body,
        );
      if (last) {
        e.preventDefault();
        setEditingMessageId(last.id);
        setEditBody(last.body);
        requestAnimationFrame(() =>
          document
            .getElementById(`message-${last.id}`)
            ?.scrollIntoView({ behavior: "smooth", block: "nearest" }),
        );
      }
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      // On touch devices, Enter inserts a newline; send via the button instead.
      if (window.matchMedia("(pointer: coarse)").matches) return;
      e.preventDefault();
      handleSend();
    }
  }

  function handleEditSubmit(messageId: string) {
    if (!editBody.trim() || editMessage.isPending) return;
    editMessage.mutate({ messageId, body: editBody.trim() });
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
    }, 480);
  }

  function moveMessageLongPress(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse" || !longPressStartRef.current) return;

    const dx = Math.abs(e.clientX - longPressStartRef.current.x);
    const dy = Math.abs(e.clientY - longPressStartRef.current.y);
    if (dx > 10 || dy > 10) clearLongPressTimer();
  }

  // --- Swipe-right-to-reply (touch) ---
  const SWIPE_MAX = 72;
  const SWIPE_TRIGGER = 48;

  function onMsgSwipeStart(
    e: React.TouchEvent<HTMLDivElement>,
    message: Message,
  ) {
    if (!window.matchMedia("(pointer: coarse)").matches) return;
    if (message.is_deleted || message.delivery_status) return;
    const t = e.touches[0];
    if (!t) return;
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
      setReplyingTo({ id: message.id, body: message.body, authorName: name });
      textareaRef.current?.focus();
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

  function showError(msg: string) {
    setUploadError(msg);
    setTimeout(() => setUploadError(null), 6000);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(e.target.files ?? []);
    e.target.value = "";

    const errors: string[] = [];
    const valid: File[] = [];
    for (const file of chosen) {
      const err = validateFile(file);
      if (err) errors.push(`${err.file}: ${err.reason}`);
      else valid.push(file);
    }

    if (errors.length > 0) showError(errors.join("\n"));
    if (valid.length > 0) setPendingFiles((prev) => [...prev, ...valid]);
  }

  function removePendingFile(index: number) {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function retryFailed(entry: FailedEntry) {
    forceScrollOnNextMessageRef.current = true;
    scrollToBottom("smooth");
    setFailedSends((prev) => prev.filter((f) => f.failId !== entry.failId));
    sendMessage.mutate({
      threadId,
      body: entry.body,
      attachments: entry.attachments,
      replyToId: entry.replyToId,
      // Reuse the original client_id so a retry that the server actually
      // persisted on the first (timed-out) attempt dedupes instead of doubling.
      clientId: entry.clientId,
    });
  }

  retryFailedRef.current = retryFailed;
  failedSendsRef.current = failedSends;

  function dismissFailed(failId: string) {
    setFailedSends((prev) => prev.filter((f) => f.failId !== failId));
  }

  async function copyMessage(messageId: string, text: string) {
    if (!text.trim()) return;
    try {
      await navigator.clipboard.writeText(text);
      haptic("success");
      setCopiedMessageId(messageId);
      setTimeout(() => setCopiedMessageId(null), 1600);
    } catch {
      setUploadError("Could not copy message.");
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer.files);
    const errors: string[] = [];
    const valid: File[] = [];
    for (const file of dropped) {
      const err = validateFile(file);
      if (err) errors.push(`${err.file}: ${err.reason}`);
      else valid.push(file);
    }
    if (errors.length > 0) showError(errors.join("\n"));
    if (valid.length > 0) setPendingFiles((prev) => [...prev, ...valid]);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
  }

  const failedMessages = useMemo<Message[]>(
    () =>
      failedSends.map((entry) => ({
        id: `failed-${entry.failId}`,
        body: entry.body,
        created_at: entry.created_at,
        edited_at: null,
        is_deleted: false,
        user_id: myInfo?.id ?? null,
        thread_id: threadId,
        poll_id: null,
        poll: null,
        smeter_id: null,
        smeter: null,
        system_event: null,
        attachments: entry.attachments,
        reactions: REACTION_DEFAULTS.map((r) => ({ ...r })),
        reply_to_id: entry.replyToId ?? null,
        reply_to: entry.replyTo,
        profiles: myInfo
          ? {
              id: myInfo.id,
              display_name: myInfo.display_name,
              avatar_url: myInfo.avatar_url,
            }
          : { id: "me", display_name: "You", avatar_url: null },
        delivery_status: "failed",
        fail_id: entry.failId,
      })),
    [failedSends, myInfo, threadId],
  );

  const displayMessages = useMemo(
    () =>
      [...messages, ...failedMessages].sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      ),
    [messages, failedMessages],
  );

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
      Array<{ id: string; name: string; avatarUrl: string | null }>
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
        avatarUrl: r.avatar_url,
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
  const canSend =
    !isDone &&
    (body.trim() || pendingFiles.length > 0) &&
    !sendMessage.isPending &&
    !uploading;

  const members = workspaceMembers ?? [];
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
            onClick={() => router.push(`/g/${groupId}`)}
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
                {initialTitle}
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
              threadTitle={initialTitle}
            />
          </div>
        </div>

        <div className="md:hidden px-3 pb-2">
          <StatusControl
            threadId={threadId}
            currentStatus={threadStatus}
            threadTitle={initialTitle}
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
        className="flex-1 overflow-y-auto px-4 md:px-6 py-3 md:py-4 flex flex-col"
      >
        {isLoading ? (
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
            {hasMore && (
              <div className="flex justify-center mb-4">
                <button
                  onClick={loadEarlier}
                  disabled={isLoadingMore}
                  className="font-mono text-[11px] text-muted hover:text-ink uppercase tracking-wider px-3 py-1.5 border border-border hover:border-ink/30 transition-colors disabled:opacity-40"
                >
                  {isLoadingMore ? "loading…" : "↑ load earlier messages"}
                </button>
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
                    const name = msg.profiles?.display_name ?? "Unknown";
                    const isOwnMessage = msg.user_id === myInfo?.id;
                    const isEditing = editingMessageId === msg.id;
                    const isLocalMessage = !!msg.delivery_status;
                    const failedEntry = msg.fail_id
                      ? failedSends.find((f) => f.failId === msg.fail_id)
                      : undefined;
                    const seenReaders = seenByMessage[msg.id] ?? [];

                    return (
                      <div
                        key={msg.id}
                        id={`message-${msg.id}`}
                        className="relative flex gap-3 group rounded-sm px-2 -mx-2 select-none md:select-text"
                        style={{
                          marginTop: isSameAuthor ? 2 : 14,
                          WebkitTouchCallout: "none",
                          // In long threads, let the browser skip layout/paint
                          // for off-screen rows (kept in the DOM, so reply-jump
                          // and highlight via getElementById still work).
                          contentVisibility:
                            bigThread ? "auto" : undefined,
                          containIntrinsicSize: bigThread ? "auto 56px" : undefined,
                          userSelect:
                            activeMessageMenuId === msg.id ? "none" : undefined,
                          animation: (() => {
                            const parts: string[] = [];
                            if (!noAnimateIds.current.has(msg.id)) {
                              parts.push("fadeUp 360ms ease-out both");
                            }
                            if (msg.id === highlightMessageId || msg.id === jumpFlashId) {
                              parts.push("messageHighlight 2.4s 400ms ease-out forwards");
                            }
                            return parts.length ? parts.join(", ") : undefined;
                          })(),
                        }}
                        onPointerDown={(e) => startMessageLongPress(e, msg)}
                        onPointerMove={moveMessageLongPress}
                        onPointerUp={clearLongPressTimer}
                        onPointerCancel={clearLongPressTimer}
                        onPointerLeave={clearLongPressTimer}
                        onContextMenu={(e) => openMessageMenuFromContext(e, msg)}
                        onTouchStart={(e) => onMsgSwipeStart(e, msg)}
                        onTouchMove={(e) => onMsgSwipeMove(e, msg)}
                        onTouchEnd={(e) => onMsgSwipeEnd(e, msg, name)}
                        onTouchCancel={(e) => onMsgSwipeEnd(e, msg, name)}
                        onMouseEnter={(e) => {
                          if (!window.matchMedia("(hover: hover)").matches) return;
                          const actions =
                            e.currentTarget.querySelector<HTMLElement>(
                              ".msg-actions",
                            );
                          if (actions) {
                            actions.style.opacity = "1";
                            actions.style.pointerEvents = "auto";
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!window.matchMedia("(hover: hover)").matches) return;
                          const actions =
                            e.currentTarget.querySelector<HTMLElement>(
                              ".msg-actions",
                            );
                          if (actions) {
                            actions.style.opacity = "0";
                            actions.style.pointerEvents = "none";
                          }
                        }}
                      >
                        {/* Avatar column */}
                        <div className="w-7 flex-shrink-0">
                          {!isSameAuthor && (
                            <button
                              type="button"
                              onClick={() =>
                                setProfileTarget({
                                  id: msg.user_id,
                                  name,
                                  avatarUrl: msg.profiles?.avatar_url ?? null,
                                })
                              }
                              className="block text-left hover:opacity-80 transition-opacity"
                              title={`Open ${name}`}
                            >
                              <Avatar
                                name={name}
                                avatarUrl={msg.profiles?.avatar_url}
                              />
                            </button>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          {!isSameAuthor && (
                            <div className="flex items-baseline gap-2 mb-0.5">
                              <span className="text-[15px] font-semibold text-ink">
                                {name}
                              </span>
                              <span className="font-mono text-[12px] text-muted">
                                {formatTime(msg.created_at)}
                              </span>
                            </div>
                          )}

                          <div className="relative">
                            {/* Reply quote */}
                            {msg.reply_to && !msg.is_deleted && (
                              <button
                                className="flex items-start gap-1.5 mb-1 border-l-2 border-border pl-2 text-left w-full hover:border-ink/40 transition-colors group/reply"
                                onClick={() => void jumpToMessage(msg.reply_to!.id)}
                              >
                                <div className="min-w-0">
                                  <span className="font-mono text-[12px] text-muted font-semibold">
                                    {msg.reply_to.author_name}
                                  </span>
                                  <p className="text-[13px] text-muted truncate leading-snug">
                                    {msg.reply_to.body}
                                  </p>
                                </div>
                              </button>
                            )}

                            {/* Deleted message tombstone */}
                            {msg.is_deleted ? (
                              <p className="text-[13px] text-muted italic font-mono">
                                message deleted
                              </p>
                            ) : isEditing ? (
                              <div className="mt-0.5">
                                <textarea
                                  value={editBody}
                                  onChange={(e) => setEditBody(e.target.value)}
                                  className="w-full border border-pastel-deep bg-surface-2 px-2.5 py-2 font-sans text-[13.5px] leading-[1.55] text-ink resize-none outline-none focus:ring-0"
                                  style={{
                                    boxShadow: "0 0 0 3px var(--pastel-tint)",
                                  }}
                                  rows={Math.max(
                                    2,
                                    editBody.split("\n").length,
                                  )}
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === "Escape") {
                                      setEditingMessageId(null);
                                      setEditBody("");
                                    }
                                    if (e.key === "Enter" && !e.shiftKey) {
                                      if (
                                        window.matchMedia("(pointer: coarse)")
                                          .matches
                                      )
                                        return;
                                      e.preventDefault();
                                      handleEditSubmit(msg.id);
                                    }
                                  }}
                                />
                                <div className="flex items-center gap-2 mt-1">
                                  <button
                                    onClick={() => handleEditSubmit(msg.id)}
                                    disabled={
                                      editMessage.isPending || !editBody.trim()
                                    }
                                    className="font-mono text-[10px] uppercase tracking-wider bg-ink text-surface px-2.5 py-1 hover:bg-ink/90 disabled:opacity-40 transition-colors"
                                  >
                                    {editMessage.isPending ? "…" : "save"}
                                  </button>
                                  <button
                                    onClick={() => {
                                      setEditingMessageId(null);
                                      setEditBody("");
                                    }}
                                    className="font-mono text-[10px] uppercase tracking-wider text-muted hover:text-ink transition-colors"
                                  >
                                    cancel
                                  </button>
                                  <span className="font-mono text-[10px] text-muted-2 ml-1">
                                    esc · ⏎ save
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <>
                                {msg.poll && (
                                  <PollView
                                    poll={msg.poll}
                                    threadId={threadId}
                                    myInfo={myInfo}
                                  />
                                )}
                                {msg.smeter && (
                                  <SMeterCard smeter={msg.smeter} threadId={threadId} />
                                )}
                                {msg.body && (
                                  <p className="text-[16px] leading-[1.5] text-ink whitespace-pre-wrap break-words">
                                    {renderBody(
                                      msg.body,
                                      members,
                                      myInfo?.id ?? "",
                                    )}
                                  </p>
                                )}
                                {!msg.is_deleted && (() => {
                                  const u = msg.body?.match(/https?:\/\/[^\s]+/i)?.[0];
                                  return u ? <LinkPreview url={u} /> : null;
                                })()}
                                {msg.edited_at && (
                                  <span className="font-mono text-[10px] text-muted-2 ml-0.5">
                                    (edited)
                                  </span>
                                )}
                              </>
                            )}

                            {/* Hover action bar */}
                            {!isEditing && !msg.is_deleted && !isLocalMessage && (
                              <div
                                className="msg-actions select-none absolute -top-[14px] right-0 flex gap-0.5 bg-surface-2 border border-border p-0.5"
                                style={{
                                  opacity: 0,
                                  // Invisible by default and only revealed on real
                                  // hover (desktop). pointer-events must track
                                  // opacity, otherwise on touch — where mouseenter
                                  // never fires — the hidden reaction/copy buttons
                                  // stay tappable and a stray tap fires a phantom
                                  // reaction.
                                  pointerEvents: "none",
                                  transition: "opacity 160ms ease",
                                }}
                              >
                                {msg.body.trim().length > 0 && (
                                  <button
                                    onClick={() => copyMessage(msg.id, msg.body)}
                                    title="Copy"
                                    className="px-1.5 py-0.5 font-mono text-[10px] text-muted hover:text-ink transition-all border-none bg-transparent cursor-pointer leading-none"
                                  >
                                    {copiedMessageId === msg.id ? "ok" : "copy"}
                                  </button>
                                )}

                                {/* Reply button */}
                                <button
                                  onClick={() => {
                                    setReplyingTo({
                                      id: msg.id,
                                      body: msg.body,
                                      authorName: name,
                                    });
                                    textareaRef.current?.focus();
                                  }}
                                  title="Reply"
                                  className="px-1.5 py-0.5 text-[13px] text-muted hover:text-ink hover:scale-110 transition-all border-none bg-transparent cursor-pointer leading-none"
                                >
                                  ↩
                                </button>

                                {/* Edit + delete — own messages only */}
                                {isOwnMessage && (
                                  <>
                                    <button
                                      onClick={() => {
                                        setEditingMessageId(msg.id);
                                        setEditBody(msg.body);
                                      }}
                                      title="Edit"
                                      className="px-1.5 py-0.5 text-[13px] text-muted hover:text-ink hover:scale-110 transition-all border-none bg-transparent cursor-pointer leading-none"
                                    >
                                      ✎
                                    </button>
                                    <button
                                      onClick={() =>
                                        deleteMessage.mutate({
                                          messageId: msg.id,
                                        })
                                      }
                                      title="Delete"
                                      className="px-1.5 py-0.5 text-[13px] text-muted hover:text-red-500 hover:scale-110 transition-all border-none bg-transparent cursor-pointer leading-none"
                                    >
                                      ×
                                    </button>
                                  </>
                                )}

                                {/* Reaction buttons */}
                                {REACTION_TYPES.map((emoji) => (
                                  <button
                                    key={emoji}
                                    onClick={() =>
                                      toggleReaction.mutate({
                                        messageId: msg.id,
                                        type: emoji,
                                      })
                                    }
                                    className="px-1.5 py-0.5 text-sm hover:scale-125 transition-transform border-none bg-transparent cursor-pointer"
                                  >
                                    {emoji}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Attachments */}
                          {!msg.is_deleted &&
                            (msg.attachments ?? []).length > 0 &&
                            (() => {
                              const imgAtts = msg.attachments.filter(
                                (a) => a.type === "image",
                              );
                              const audioAtts = msg.attachments.filter(
                                (a) => a.type === "audio",
                              );
                              const videoAtts = msg.attachments.filter(
                                (a) => a.type === "video",
                              );
                              const fileAtts = msg.attachments.filter(
                                (a) => a.type === "file",
                              );
                              return (
                                <div className="mt-2 space-y-2">
                                  {imgAtts.length === 1 && (
                                    <ThreadImage
                                      att={imgAtts[0]}
                                      onOpen={() =>
                                        setActiveLightbox({
                                          images: imgAtts,
                                          index: 0,
                                        })
                                      }
                                      onHold={() =>
                                        setImageActions(imgAtts[0])
                                      }
                                    />
                                  )}
                                  {imgAtts.length >= 2 && (
                                    <ImageGallery
                                      attachments={imgAtts}
                                      onOpen={(att) =>
                                        setActiveLightbox({
                                          images: imgAtts,
                                          index: Math.max(
                                            0,
                                            imgAtts.indexOf(att),
                                          ),
                                        })
                                      }
                                      onHold={setImageActions}
                                    />
                                  )}
                                  {videoAtts.length > 0 && (
                                    <div className="flex flex-col gap-2">
                                      {videoAtts.map((att, i) => (
                                        <video
                                          key={i}
                                          controls
                                          src={att.url}
                                          className="max-w-xs border border-border"
                                          style={{ maxHeight: 320 }}
                                        />
                                      ))}
                                    </div>
                                  )}
                                  {audioAtts.length > 0 && (
                                    <div className="flex flex-col gap-2">
                                      {audioAtts.map((att, i) => (
                                        <div
                                          key={i}
                                          className="border border-border bg-surface-2 px-2.5 py-2 max-w-xs"
                                        >
                                          <span className="font-mono text-[10px] text-muted block mb-1 truncate">
                                            {att.name}
                                          </span>
                                          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                                          <audio controls src={att.url} className="w-full h-8" />
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  {fileAtts.length > 0 && (
                                    <div className="flex flex-wrap gap-2">
                                      {fileAtts.map((att, i) => {
                                        const ext = (att.name.split(".").pop() ?? "").toUpperCase().slice(0, 4);
                                        return (
                                          <a
                                            key={i}
                                            href={att.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-2 border border-border px-3 py-2 hover:border-pastel-deep transition-colors"
                                          >
                                            <span className="w-8 h-8 flex items-center justify-center bg-ink text-surface font-mono text-[9px] font-semibold flex-shrink-0">
                                              {ext || "FILE"}
                                            </span>
                                            <span className="font-mono text-xs text-ink max-w-[160px] truncate">
                                              {att.name}
                                            </span>
                                          </a>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              );
                            })()}

                          {/* Reaction chips */}
                          {!msg.is_deleted &&
                            (msg.reactions ?? []).some((r) => r.count > 0) && (
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {msg.reactions
                                  .filter((r) => r.count > 0)
                                  .map((r) => {
                                    const tooltipKey = `${msg.id}:${r.type}`;
                                    const isTooltipVisible =
                                      activeTooltip === tooltipKey;
                                    return (
                                      <div key={r.type} className="relative">
                                        <button
                                          onClick={() => {
                                            // Swallow the click that ends a
                                            // long-press so it doesn't toggle.
                                            if (
                                              reactionLongPressedRef.current ===
                                              tooltipKey
                                            ) {
                                              reactionLongPressedRef.current =
                                                null;
                                              return;
                                            }
                                            toggleReaction.mutate({
                                              messageId: msg.id,
                                              type: r.type as ReactionType,
                                            });
                                          }}
                                          onMouseEnter={() =>
                                            setActiveTooltip(tooltipKey)
                                          }
                                          onMouseLeave={() =>
                                            setActiveTooltip(null)
                                          }
                                          onPointerDown={(e) =>
                                            startReactionPress(e, tooltipKey)
                                          }
                                          onPointerMove={moveReactionPress}
                                          onPointerUp={endReactionPress}
                                          onPointerCancel={endReactionPress}
                                          onPointerLeave={endReactionPress}
                                          onTouchStart={(e) => e.stopPropagation()}
                                          onContextMenu={(e) => {
                                            e.preventDefault();
                                            setActiveTooltip(tooltipKey);
                                            if (tooltipTimerRef.current)
                                              clearTimeout(
                                                tooltipTimerRef.current,
                                              );
                                            tooltipTimerRef.current =
                                              setTimeout(
                                                () => setActiveTooltip(null),
                                                2500,
                                              );
                                          }}
                                          className={`inline-flex items-center gap-1 font-mono text-[11px] px-[7px] py-0.5 border transition-all duration-150 ${
                                            r.userReacted
                                              ? "bg-pastel-tint text-pastel-ink border-pastel-deep"
                                              : "text-muted border-border hover:border-pastel-deep"
                                          }`}
                                          style={
                                            r.userReacted
                                              ? {
                                                  animation:
                                                    "pop 240ms ease-out",
                                                }
                                              : undefined
                                          }
                                        >
                                          <span className="text-[12px]">
                                            {r.type}
                                          </span>
                                          <span>{r.count}</span>
                                        </button>
                                        {isTooltipVisible &&
                                          r.users.length > 0 && (
                                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-30 max-h-40 overflow-y-auto bg-ink text-surface font-mono text-[10px] px-2.5 py-1.5 pointer-events-none min-w-max max-w-[180px] space-y-0.5">
                                              <div className="text-surface/50 uppercase tracking-[0.1em] mb-1">
                                                {r.type} {r.count}
                                              </div>
                                              {r.users.map((u, i) => (
                                                <div key={i} className="truncate">
                                                  {u}
                                                </div>
                                              ))}
                                            </div>
                                          )}
                                      </div>
                                    );
                                  })}
                              </div>
                            )}

                          {msg.delivery_status === "sending" && (
                            <p className="font-mono text-[10px] text-muted-2 mt-1">
                              sending...
                            </p>
                          )}

                          {msg.delivery_status === "failed" && (
                            <div className="flex items-center gap-2 mt-1">
                              <button
                                onClick={() => failedEntry && retryFailed(failedEntry)}
                                disabled={!failedEntry}
                                className="font-mono text-[10px] text-red-600 hover:text-red-700 disabled:opacity-40"
                              >
                                failed - retry
                              </button>
                              <button
                                onClick={() => msg.fail_id && dismissFailed(msg.fail_id)}
                                className="font-mono text-[13px] leading-none text-muted hover:text-ink"
                              >
                                x
                              </button>
                            </div>
                          )}

                          {seenReaders.length > 0 && (
                            <div className="absolute right-2 -bottom-2 z-10 flex items-center justify-end gap-0 pointer-events-none">
                              {seenReaders.slice(0, 5).map((reader, readerIndex) => (
                                <div
                                  key={reader.id}
                                  className="border border-surface rounded-sm"
                                  style={{ marginLeft: readerIndex === 0 ? 0 : -6 }}
                                  title={`Seen by ${reader.name}`}
                                >
                                  <Avatar
                                    name={reader.name}
                                    avatarUrl={reader.avatarUrl}
                                    size={16}
                                    fontSize={7}
                                  />
                                </div>
                              ))}
                              {seenReaders.length > 5 && (
                                <span className="font-mono text-[10px] text-muted-2 ml-1">
                                  +{seenReaders.length - 5}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
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
          onClose={() => setActiveLightbox(null)}
        />
      )}

      {/* Hold → download / resend actions */}
      {imageActions && (
        <AttachmentActions
          attachment={imageActions}
          groupId={groupId}
          currentThreadId={threadId}
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
                    toggleReaction.mutate({
                      messageId: activeMessageMenu.id,
                      type: reaction.type as Parameters<
                        typeof toggleReaction.mutate
                      >[0]["type"],
                    });
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
                    setReplyingTo({
                      id: activeMessageMenu.id,
                      body: activeMessageMenu.body,
                      authorName: activeMessageMenu.profiles?.display_name ?? "Unknown",
                    });
                    setActiveMessageMenuId(null);
                    textareaRef.current?.focus();
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
                    deleteMessage.mutate({ messageId: activeMessageMenu.id });
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

      {/* Composer */}
      <div
        className={`px-4 md:px-6 pt-3 md:pt-[14px] pb-4 border-t border-border flex-shrink-0 relative ${
          keyboardOpen ? "" : "pb-safe"
        }`}
        onTouchStart={(e) => {
          composerTouchYRef.current = e.touches[0]?.clientY ?? null;
        }}
        onTouchMove={(e) => {
          const start = composerTouchYRef.current;
          if (start == null) return;
          const dy = (e.touches[0]?.clientY ?? start) - start;
          // Swipe down on the input bar dismisses the keyboard.
          if (dy > 40 && document.activeElement === textareaRef.current) {
            textareaRef.current?.blur();
            composerTouchYRef.current = null;
          }
        }}
        onTouchEnd={() => {
          composerTouchYRef.current = null;
        }}
      >
        {hasNewMessages && (
          <button
            type="button"
            onClick={() => scrollToBottom("auto")}
            className="absolute bottom-full left-1/2 z-10 mb-3 -translate-x-1/2 border border-border-strong bg-ink px-3 py-2 font-mono text-[11px] uppercase tracking-[0.1em] text-surface shadow-lg transition-all duration-150 hover:-translate-y-px hover:bg-ink/90"
            aria-label="Jump to latest message"
          >
            new messages
          </button>
        )}

        {/* @mention suggestions dropdown */}
        {mentionSuggestions.length > 0 && (
          <div className="absolute bottom-full left-4 right-4 md:left-6 md:right-6 mb-1 bg-surface border border-border shadow-lg z-20">
            {mentionSuggestions.map((member, i) => (
              <button
                key={member.id}
                className={`w-full text-left px-3 py-2 font-mono text-[12px] text-ink transition-colors border-b border-border last:border-b-0 ${
                  i === mentionIndex ? "bg-surface-2" : "hover:bg-surface-2"
                }`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => insertMention(member.display_name)}
              >
                <span className="text-muted">@</span>
                {member.display_name}
              </button>
            ))}
          </div>
        )}

        {isDone && (
          <div className="flex items-center justify-center gap-3 py-2.5 mb-0 border border-done-tint bg-done-tint/50">
            <span className="font-mono text-[11px] text-done-ink uppercase tracking-[0.12em]">
              thread closed
            </span>
            <button
              onClick={() => {
                setThreadStatus("OPEN");
                reopenFromBanner.mutate({ threadId, status: "OPEN" });
                requestAnimationFrame(() => textareaRef.current?.focus());
              }}
              disabled={reopenFromBanner.isPending}
              className="font-mono text-[11px] uppercase tracking-[0.12em] px-2.5 py-1 border border-border-strong text-ink bg-surface hover:bg-border/40 transition-colors disabled:opacity-40"
            >
              reopen to reply
            </button>
          </div>
        )}
        {!isDone && (sendMessage.error || uploadError) && (
          <div className="flex items-start justify-between gap-3 mb-2 px-3 py-2 border border-red-200 bg-red-50">
            <p className="font-mono text-[11px] text-red-700 whitespace-pre-wrap leading-snug">
              {uploadError ?? sendMessage.error?.message}
            </p>
            <button
              onClick={() => setUploadError(null)}
              className="font-mono text-[13px] leading-none text-red-400 hover:text-red-700 transition-colors flex-shrink-0 mt-px"
            >
              ×
            </button>
          </div>
        )}

        {/* Reply banner */}
        {!isDone && replyingTo && (
          <div className="flex items-start gap-2 mb-2 pl-3 pr-2 py-2 border-l-2 border-pastel-deep bg-surface-2">
            <div className="flex-1 min-w-0">
              <span className="font-mono text-[10px] text-muted uppercase tracking-wider">
                replying to {replyingTo.authorName}
              </span>
              <p className="text-[12px] text-muted truncate mt-0.5 leading-snug">
                {replyingTo.body || "(attachment)"}
              </p>
            </div>
            <button
              onClick={() => setReplyingTo(null)}
              className="font-mono text-base leading-none text-muted hover:text-ink transition-colors flex-shrink-0 mt-0.5"
            >
              ×
            </button>
          </div>
        )}

        {/* Pending file previews */}
        {!isDone && pendingFiles.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {pendingFiles.map((file, i) => (
              <PendingPreview
                key={i}
                file={file}
                onRemove={() => removePendingFile(i)}
              />
            ))}
          </div>
        )}

        {/* Upload progress */}
        {!isDone && uploadProgress !== null && (
          <div className="mb-2 flex items-center gap-2">
            <div className="flex-1 h-1 bg-border overflow-hidden">
              <div
                className="h-full bg-ink transition-[width] duration-150 ease-out"
                style={{ width: `${Math.round(uploadProgress * 100)}%` }}
              />
            </div>
            <span className="font-mono text-[10px] text-muted tabular-nums w-9 text-right">
              {Math.round(uploadProgress * 100)}%
            </span>
          </div>
        )}

        {!isDone && (
          <div
            ref={composerRef}
            className="border border-border bg-surface-2 flex items-end gap-0 transition-all duration-200"
            onFocusCapture={(e) => {
              const el = e.currentTarget as HTMLElement;
              el.style.borderColor = "var(--pastel-deep)";
              el.style.boxShadow = "0 0 0 3px var(--pastel-tint)";
            }}
            onBlurCapture={(e) => {
              const el = e.currentTarget as HTMLElement;
              el.style.borderColor = "";
              el.style.boxShadow = "";
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
              multiple
              className="hidden"
              onChange={handleFileChange}
            />
            {/* "+" attach menu */}
            <div className="relative flex-shrink-0">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setAttachMenuOpen((o) => !o)}
                title="Attach or create poll"
                className="h-11 w-11 md:h-10 md:w-10 flex items-center justify-center text-muted hover:text-pastel-ink transition-colors font-mono text-lg leading-none"
              >
                +
              </button>
              {attachMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setAttachMenuOpen(false)}
                  />
                  <div className="absolute bottom-full left-0 mb-1 z-20 bg-surface border border-border shadow-lg min-w-[160px]">
                    <button
                      className="w-full text-left px-3 py-2 font-mono text-[12px] text-ink hover:bg-surface-2 border-b border-border"
                      onClick={() => {
                        setAttachMenuOpen(false);
                        fileInputRef.current?.click();
                      }}
                    >
                      Attach a file
                    </button>
                    <button
                      className="w-full text-left px-3 py-2 font-mono text-[12px] text-ink hover:bg-surface-2 border-b border-border"
                      onClick={() => {
                        setAttachMenuOpen(false);
                        setShowPollCreate(true);
                      }}
                    >
                      Create a poll
                    </button>
                    <button
                      className="w-full text-left px-3 py-2 font-mono text-[12px] text-ink hover:bg-surface-2"
                      onClick={() => {
                        setAttachMenuOpen(false);
                        setShowSMeterCreate(true);
                      }}
                    >
                      Create an S-meter
                    </button>
                  </div>
                </>
              )}
            </div>
            {/* Voice record */}
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={isRecording ? stopRecording : startRecording}
              title={isRecording ? "Stop recording" : "Record voice message"}
              className={`h-11 md:h-10 flex items-center justify-center flex-shrink-0 transition-colors ${
                isRecording ? "px-2.5 text-red-600" : "w-11 md:w-10 text-muted hover:text-pastel-ink"
              }`}
            >
              {isRecording ? (
                <span className="flex items-center gap-1.5 font-mono text-[11px]">
                  <span className="w-2.5 h-2.5 bg-red-600 inline-block" />
                  {fmtRec(recordSeconds)}
                </span>
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16" height="16" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round"
                >
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              )}
            </button>
            <textarea
              ref={textareaRef}
              value={body}
              onChange={handleBodyChange}
              onKeyDown={handleKeyDown}
              placeholder="message"
              rows={1}
              className="flex-1 min-h-[44px] md:min-h-[40px] max-h-[72px] border-none bg-transparent px-2.5 py-[10px] font-sans text-base md:text-[13.5px] leading-[1.45] text-ink placeholder:text-muted resize-none outline-none overflow-y-auto"
              onInput={(e) => {
                const t = e.currentTarget;
                t.style.height = "auto";
                t.style.height = `${Math.min(t.scrollHeight, 72)}px`;
              }}
            />
            <button
              // Keep the textarea focused so the mobile keyboard stays open.
              // iOS fires (and focuses on) mousedown/pointerdown — preventing
              // their default stops the button stealing focus, so the input
              // never blurs. (preventDefault here doesn't cancel the click.)
              onMouseDown={(e) => e.preventDefault()}
              onPointerDown={(e) => e.preventDefault()}
              onClick={handleSend}
              disabled={!canSend}
              className={`h-11 md:h-10 px-4 flex-shrink-0 font-mono text-[11px] uppercase tracking-[0.1em] border-none transition-all duration-200 ${
                canSend
                  ? "bg-ink text-surface cursor-pointer hover:-translate-y-px"
                  : "bg-border text-muted-2 cursor-not-allowed"
              }`}
            >
              {uploading
                ? uploadProgress !== null
                  ? `${Math.round(uploadProgress * 100)}%`
                  : "↑"
                : sendMessage.isPending
                  ? "…"
                  : "send"}
            </button>
          </div>
        )}

        {/* Typing indicator */}
        {typingUsers.length > 0 && (
          <p className="font-mono text-[10px] text-muted mt-1.5 h-3">
            {typingUsers.length === 1
              ? `${typingUsers[0]} is typing…`
              : `${typingUsers.slice(0, -1).join(", ")} and ${typingUsers.at(-1)} are typing…`}
          </p>
        )}

        {/* Composer hint */}
        {!isDone && (
          <div className="flex items-center justify-between mt-1.5">
            <span className="font-mono text-[10px] text-muted-2">
              ⏎ send · ⇧⏎ newline · @ mention
            </span>
            <span className="font-mono text-[10px] text-muted-2 flex items-center gap-1">
              <span
                className="w-[5px] h-[5px] rounded-full"
                style={{
                  background: "var(--pastel-deep)",
                  animation: "pulseDot 2s ease-in-out infinite",
                }}
              />
              live
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
