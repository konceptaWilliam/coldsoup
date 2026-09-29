"use client";

import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Avatar } from "@/components/avatar";
import { BlobForm } from "@/components/blob-form";
import { SMeterResultsLink } from "@/components/smeter";
import { systemEventText, type SystemEvent } from "@/lib/system-event";
import { isShape } from "@/lib/blob-evolution";
import { localPreview } from "@/lib/local-previews";
import { aspectStyle } from "@/lib/media";
import type { MentionMatcher } from "@/lib/mentions";
import type { Attachment, PollData } from "@/lib/thread-types";

// Centered grey thread-event notice (no author bubble).
export function SystemMessage({ event, threadId }: { event: SystemEvent; threadId: string }) {
  if (event.kind === "blob_evolved") {
    const shiny = event.shiny;
    return (
      <div className="flex justify-center my-3 px-4">
        <span
          className={`inline-flex items-center gap-2 border px-2 py-1 font-mono text-[11px] leading-relaxed max-w-[85%] ${
            shiny ? "border-accent text-ink bg-accent-light" : "border-dashed border-border-strong text-muted"
          }`}
        >
          <BlobForm
            name={event.userId}
            look={{
              shape: isShape(event.shape) ? event.shape : null,
              finish: shiny ? "shiny" : event.level === 3 ? "holo" : "plain",
            }}
            size={22}
          />
          {systemEventText(event)}
        </span>
      </div>
    );
  }
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

export function PollView({
  poll: initialPoll,
  myInfo,
}: {
  poll: PollData;
  myInfo: {
    id: string;
    display_name: string;
    avatar_url: string | null;
  } | null;
}) {
  const [poll, setPoll] = useState(initialPoll);
  const [newOptionText, setNewOptionText] = useState("");
  const [showAddOption, setShowAddOption] = useState(false);

  // Sync local state when the cached poll is patched (realtime refresh)
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
  });

  const addOption = trpc.polls.addOption.useMutation({
    onSuccess: () => {
      setNewOptionText("");
      setShowAddOption(false);
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
                      <Avatar
                        userId={v.id}
                        name={v.display_name}
                        size={16}
                      />
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

export function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

const URL_RE = /https?:\/\/[^\s<]+/g;

// Split a plain-text run into text + clickable <a> nodes for any http(s) URLs.
// `keyBase` must be unique per run so the returned nodes get stable sibling keys.
export function linkify(text: string, keyBase: number): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let i = 0;
  let m: RegExpExecArray | null;
  URL_RE.lastIndex = 0;
  while ((m = URL_RE.exec(text)) !== null) {
    let url = m[0];
    // Don't let trailing sentence punctuation get pulled into the href.
    const trail = url.match(/[.,!?;:)\]]+$/);
    const trailing = trail ? trail[0] : "";
    if (trailing) url = url.slice(0, url.length - trailing.length);
    if (m.index > last) {
      nodes.push(<span key={`${keyBase}-t${i++}`}>{text.slice(last, m.index)}</span>);
    }
    nodes.push(
      <a
        key={`${keyBase}-l${i++}`}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="underline text-ink hover:opacity-70 break-all"
        onClick={(e) => e.stopPropagation()}
      >
        {url}
      </a>,
    );
    if (trailing) {
      nodes.push(<span key={`${keyBase}-p${i++}`}>{trailing}</span>);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    nodes.push(<span key={`${keyBase}-t${i++}`}>{text.slice(last)}</span>);
  }
  return nodes;
}

export function renderBody(body: string, mentions: MentionMatcher, myId: string): React.ReactNode {
  if (!body || !mentions.regex) return body ? <>{linkify(body, 0)}</> : body;
  const regex = mentions.regex;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  let match: RegExpExecArray | null;
  regex.lastIndex = 0;
  while ((match = regex.exec(body)) !== null) {
    if (match.index > lastIndex) parts.push(...linkify(body.slice(lastIndex, match.index), key++));
    const member = mentions.byName.get(match[1].toLowerCase());
    const isMe = member?.id === myId;
    parts.push(
      <span
        key={key++}
        className={`font-semibold px-0.5 rounded-sm ${isMe ? "bg-pastel-tint text-pastel-ink" : "bg-surface-2 text-ink"}`}
      >
        @{match[1]}
      </span>,
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < body.length) parts.push(...linkify(body.slice(lastIndex), key++));
  return parts.length ? <>{parts}</> : body;
}

// First http(s) link in a body, with trailing sentence punctuation trimmed
// exactly like linkify, for the link preview card.
export function firstLink(body: string): string | null {
  URL_RE.lastIndex = 0;
  const m = URL_RE.exec(body ?? "");
  URL_RE.lastIndex = 0;
  if (!m) return null;
  return m[0].replace(/[.,!?;:)\]]+$/, "");
}

// A single sent image, rendered clean (no frame/caption). Tap → open the
// zoomable lightbox; hold / right-click → open the actions menu.
export function ThreadImage({
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
      className="block overflow-hidden border border-border bg-surface-2 transition-opacity duration-150 hover:opacity-90"
      style={{ maxWidth: 272, lineHeight: 0 }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={localPreview(att.url) ?? att.url}
        alt={att.name}
        draggable={false}
        className="block h-auto w-full"
        style={{ width: "100%", maxHeight: 360, objectFit: "cover", ...aspectStyle(att) }}
        loading="lazy"
      />
    </button>
  );
}

// Tap vs. hold discrimination for images. A plain tap/click fires onTap; a
// 350ms hold or a right-click fires onHold (and suppresses the following tap).
// stopPropagation keeps the press off the message row's own long-press/menu.
export function useImagePress(onTap: () => void, onHold: () => void) {
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
      }, 350);
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

export function LinkPreview({ url }: { url: string }) {
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
export function GridTile({
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
export function ImageGallery({
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

