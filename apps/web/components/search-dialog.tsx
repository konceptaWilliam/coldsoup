"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { navigate as shellNavigate } from "@/lib/shell-route";
import { trpc } from "@/lib/trpc/client";
import { StatusBadge } from "./status-badge";

function highlight(text: string, q: string): React.ReactNode {
  if (!q) return text;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-pastel-tint text-pastel-ink rounded-none">
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </>
  );
}

function excerpt(body: string, q: string, radius = 60): string {
  const idx = body.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return body.slice(0, radius * 2);
  const start = Math.max(0, idx - radius);
  const end = Math.min(body.length, idx + q.length + radius);
  return (start > 0 ? "…" : "") + body.slice(start, end) + (end < body.length ? "…" : "");
}

const SELECT_CLASS =
  "font-mono text-[11px] text-ink bg-surface-2 border border-border px-2 py-1 outline-none cursor-pointer hover:border-border-strong transition-colors appearance-none pr-5";

export function SearchDialog({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const [selectedThreadId, setSelectedThreadId] = useState<string>("");
  const [focused, setFocused] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  // Debounce query
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(id);
  }, [q]);

  // Reset thread when group changes
  useEffect(() => { setSelectedThreadId(""); }, [selectedGroupId]);

  // Fetch user's groups for the filter
  const { data: groups = [] } = trpc.groups.list.useQuery(undefined, {
    staleTime: 60_000,
  });

  // Fetch threads for selected group
  const { data: groupThreads = [] } = trpc.threads.list.useQuery(
    { groupId: selectedGroupId },
    { enabled: !!selectedGroupId, staleTime: 30_000 }
  ) as { data: Array<{ id: string; title: string }> };

  const { data, isFetching } = trpc.search.query.useQuery(
    {
      q: debouncedQ,
      groupId: selectedGroupId || undefined,
      threadId: selectedThreadId || undefined,
    },
    { enabled: debouncedQ.length >= 2 }
  );

  const threads = data?.threads ?? [];
  const messages = data?.messages ?? [];
  const totalResults = threads.length + messages.length;

  const items: Array<{ groupId: string; threadId: string; messageId?: string }> = [
    ...threads.map((t) => ({ groupId: t.groupId, threadId: t.id })),
    ...messages.map((m) => ({ groupId: m.groupId, threadId: m.threadId, messageId: m.id })),
  ];

  const navigate = useCallback(
    (idx: number) => {
      const item = items[idx];
      if (!item) return;
      const url = `/g/${item.groupId}/t/${item.threadId}${item.messageId ? `?highlight=${item.messageId}` : ""}`;
      shellNavigate(url);
      onClose();
    },
    [items, onClose]
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setFocused((f) => Math.min(f + 1, items.length - 1)); }
      if (e.key === "ArrowUp") { e.preventDefault(); setFocused((f) => Math.max(f - 1, 0)); }
      if (e.key === "Enter") { e.preventDefault(); navigate(focused); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focused, items.length, navigate, onClose]);

  useEffect(() => { setFocused(0); }, [debouncedQ, selectedGroupId, selectedThreadId]);

  const showResults = debouncedQ.length >= 2;
  const noResults = showResults && !isFetching && totalResults === 0;

  let globalIdx = 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4"
      style={{ background: "rgba(26,26,24,0.45)", backdropFilter: "blur(2px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-[560px] bg-surface-2 border border-border-strong flex flex-col overflow-hidden"
        style={{ animation: "fadeUp 200ms ease-out both", boxShadow: "0 24px 60px -12px rgba(0,0,0,0.3)" }}
      >
        {/* Input row */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <svg
            width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            className="text-muted flex-shrink-0"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search threads and messages…"
            className="flex-1 bg-transparent text-[13.5px] text-ink placeholder:text-muted outline-none font-sans"
          />
          {isFetching && (
            <span className="font-mono text-[10px] text-muted-2 animate-pulse">searching</span>
          )}
          <kbd
            onClick={onClose}
            className="font-mono text-[10px] text-muted border border-border px-1.5 py-0.5 cursor-pointer hover:text-ink transition-colors"
          >
            esc
          </kbd>
        </div>

        {/* Filter row */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-border bg-surface">
          <span className="font-mono text-[10px] text-muted-2 uppercase tracking-[0.12em] flex-shrink-0">in</span>

          {/* Group selector */}
          <div className="relative">
            <select
              value={selectedGroupId}
              onChange={(e) => setSelectedGroupId(e.target.value)}
              className={SELECT_CLASS}
            >
              <option value="">all groups</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>· {g.name}</option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-muted text-[9px]">▾</span>
          </div>

          {/* Thread selector — only when a group is selected */}
          {selectedGroupId && groupThreads.length > 0 && (
            <>
              <span className="font-mono text-[10px] text-muted-2">/</span>
              <div className="relative">
                <select
                  value={selectedThreadId}
                  onChange={(e) => setSelectedThreadId(e.target.value)}
                  className={SELECT_CLASS}
                >
                  <option value="">all threads</option>
                  {groupThreads.map((t) => (
                    <option key={t.id} value={t.id}># {t.title}</option>
                  ))}
                </select>
                <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-muted text-[9px]">▾</span>
              </div>
            </>
          )}
        </div>

        {/* Results */}
        {showResults && (
          <div className="overflow-y-auto max-h-[400px]" style={{ maxHeight: 'min(400px, calc(100vh - 200px))' }}>
            {noResults ? (
              <p className="font-mono text-[12px] text-muted px-4 py-6 text-center">
                no results for &ldquo;{debouncedQ}&rdquo;
              </p>
            ) : (
              <>
                {threads.length > 0 && (
                  <div>
                    <div className="px-4 pt-3 pb-1.5">
                      <span className="font-mono text-[10px] text-muted-2 uppercase tracking-[0.14em]">Threads</span>
                    </div>
                    {threads.map((t) => {
                      const idx = globalIdx++;
                      const isFoc = focused === idx;
                      return (
                        <button
                          key={t.id}
                          onClick={() => navigate(idx)}
                          onMouseEnter={() => setFocused(idx)}
                          className={`w-full text-left flex items-center gap-3 px-4 py-2.5 transition-colors ${isFoc ? "bg-pastel-tint/70" : "hover:bg-border/30"}`}
                        >
                          <span className="font-mono text-muted-2 text-xs flex-shrink-0">· {t.groupName}</span>
                          <span className="font-mono text-[13px] text-ink flex-1 truncate">
                            {highlight(t.title, debouncedQ)}
                          </span>
                          <StatusBadge status={t.status} />
                        </button>
                      );
                    })}
                  </div>
                )}

                {messages.length > 0 && (
                  <div>
                    <div className={`px-4 pb-1.5 ${threads.length > 0 ? "pt-3 border-t border-border" : "pt-3"}`}>
                      <span className="font-mono text-[10px] text-muted-2 uppercase tracking-[0.14em]">Messages</span>
                    </div>
                    {messages.map((m) => {
                      const idx = globalIdx++;
                      const isFoc = focused === idx;
                      const snip = excerpt(m.body, debouncedQ);
                      return (
                        <button
                          key={m.id}
                          onClick={() => navigate(idx)}
                          onMouseEnter={() => setFocused(idx)}
                          className={`w-full text-left flex flex-col gap-0.5 px-4 py-2.5 transition-colors ${isFoc ? "bg-pastel-tint/70" : "hover:bg-border/30"}`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[10px] text-muted-2 flex-shrink-0">· {m.groupName}</span>
                            <span className="font-mono text-[11px] text-muted truncate">{m.threadTitle}</span>
                          </div>
                          <p className="text-[12.5px] text-ink-soft leading-snug line-clamp-2">
                            {highlight(snip, debouncedQ)}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {totalResults > 0 && (
              <div className="border-t border-border px-4 py-2 flex items-center gap-3">
                <span className="font-mono text-[10px] text-muted-2">↑↓ navigate</span>
                <span className="font-mono text-[10px] text-muted-2">⏎ open</span>
              </div>
            )}
          </div>
        )}

        {!showResults && (
          <p className="font-mono text-[11px] text-muted-2 px-4 py-4">
            type at least 2 characters
          </p>
        )}
      </div>
    </div>
  );
}
