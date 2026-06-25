"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { SearchDialog } from "./search-dialog";
import { useMobileSidebar } from "@/lib/mobile-sidebar-context";
import { trpc } from "@/lib/trpc/client";
import { createClient, setRealtimeAuth } from "@/lib/supabase/client";

type Group = { id: string; name: string };

export function CreateGroupModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [name, setName] = useState("");
  const [emails, setEmails] = useState("");
  const [step, setStep] = useState<"form" | "done">("form");
  const [inviteLinks, setInviteLinks] = useState<
    { email: string; url: string }[]
  >([]);
  const [copied, setCopied] = useState<string | null>(null);

  const createGroup = trpc.groups.create.useMutation();
  const sendInvite = trpc.invites.send.useMutation();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    const group = await createGroup.mutateAsync({ name: name.trim() });
    utils.groups.list.invalidate();

    const emailList = emails
      .split(/[\s,;]+/)
      .map((e) => e.trim())
      .filter((e) => e.includes("@"));

    const links: { email: string; url: string }[] = [];
    for (const email of emailList) {
      try {
        const result = await sendInvite.mutateAsync({
          email,
          groupId: group.id,
        });
        links.push({
          email,
          url: (result as unknown as { inviteUrl: string }).inviteUrl,
        });
      } catch {
        // best-effort
      }
    }

    if (links.length > 0) {
      setInviteLinks(links);
      setStep("done");
    } else {
      onClose();
      router.push(`/g/${group.id}`);
    }
  }

  function copyLink(url: string) {
    navigator.clipboard.writeText(url);
    setCopied(url);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-border max-w-sm w-full mx-4 p-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {step === "form" ? (
          <>
            <div className="flex items-center justify-between mb-4">
              <p className="font-mono text-sm font-semibold text-ink">
                New group
              </p>
              <button
                onClick={onClose}
                className="font-mono text-[14px] text-muted hover:text-ink"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="font-mono text-[10px] text-muted uppercase tracking-wider block mb-1">
                  Group name
                </label>
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value.replace(/ /g, "_"))}
                  maxLength={80}
                  placeholder="e.g. Design"
                  className="w-full border border-border bg-surface-2 px-3 py-2 font-mono text-sm text-ink placeholder:text-muted focus:outline-none focus:border-ink"
                />
              </div>
              <div>
                <label className="font-mono text-[10px] text-muted uppercase tracking-wider block mb-1">
                  Invite by email{" "}
                  <span className="normal-case">
                    (optional, comma-separated)
                  </span>
                </label>
                <input
                  value={emails}
                  onChange={(e) => setEmails(e.target.value)}
                  placeholder="alice@example.com, bob@example.com"
                  className="w-full border border-border bg-surface-2 px-3 py-2 font-mono text-sm text-ink placeholder:text-muted focus:outline-none focus:border-ink"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={
                    !name.trim() ||
                    createGroup.isPending ||
                    sendInvite.isPending
                  }
                  className="flex-1 bg-ink text-surface font-mono text-sm py-2 disabled:opacity-40"
                >
                  {createGroup.isPending || sendInvite.isPending
                    ? "Creating…"
                    : "Create group"}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="font-mono text-sm text-muted hover:text-ink px-3 py-2"
                >
                  Cancel
                </button>
              </div>
            </form>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <p className="font-mono text-sm font-semibold text-ink">
                Group created
              </p>
              <button
                onClick={onClose}
                className="font-mono text-[14px] text-muted hover:text-ink"
              >
                ×
              </button>
            </div>
            <p className="font-mono text-[11px] text-muted mb-3">
              Share these invite links — email delivery may be delayed.
            </p>
            <div className="space-y-2">
              {inviteLinks.map(({ email, url }) => (
                <div key={email} className="border border-border p-2">
                  <p className="font-mono text-[11px] text-ink mb-1">{email}</p>
                  <div className="flex gap-2 items-center">
                    <span className="font-mono text-[10px] text-muted truncate flex-1">
                      {url}
                    </span>
                    <button
                      onClick={() => copyLink(url)}
                      className="font-mono text-[10px] text-muted hover:text-ink flex-shrink-0"
                    >
                      {copied === url ? "Copied!" : "Copy"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={onClose}
              className="mt-3 w-full bg-ink text-surface font-mono text-sm py-2"
            >
              Done
            </button>
          </>
        )}
      </div>
    </div>
  );
}

type UnreadMap = Record<string, { unread: number; urgent: number }>;

// Group list with hold-to-drag reordering. Long-press a row to pick it up, drag
// to a new slot, release to drop. Order persists per-user via groups.reorder.
function GroupNav({
  groups,
  unread,
  pathname,
  onNavigate,
}: {
  groups: Group[];
  unread: UnreadMap;
  pathname: string;
  onNavigate: () => void;
}) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const reorder = trpc.groups.reorder.useMutation({
    onError: () => utils.groups.list.invalidate(),
  });

  const [items, setItems] = useState<Group[]>(groups);
  const [dragId, setDragId] = useState<string | null>(null);

  const itemsRef = useRef<Group[]>(groups);
  const dragIdRef = useRef<string | null>(null);
  const didDragRef = useRef(false);
  const cancelTapRef = useRef(false);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const lpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rowRefs = useRef<Map<string, HTMLElement | null>>(new Map());
  const orderAtDragStart = useRef<string>("");

  itemsRef.current = items;

  // Reconcile with the server membership set without clobbering the user's
  // chosen order. The `groups` prop is SSR'd once and keeps the original DB
  // order, so re-seeding from it directly would snap a just-dropped reorder
  // back. Instead: keep the current order, refresh names, append any new groups
  // at the end, drop any the user left. (Mid-drag the prop never changes, so no
  // guard against `dragId` is needed.)
  useEffect(() => {
    setItems((prev) => {
      const byId = new Map(groups.map((g) => [g.id, g]));
      const kept = prev
        .filter((p) => byId.has(p.id))
        .map((p) => byId.get(p.id)!);
      const keptIds = new Set(kept.map((g) => g.id));
      const added = groups.filter((g) => !keptIds.has(g.id));
      const merged = [...kept, ...added];
      const same =
        merged.length === prev.length &&
        merged.every((g, i) => g.id === prev[i].id && g.name === prev[i].name);
      return same ? prev : merged;
    });
  }, [groups]);

  function clearLongPress() {
    if (lpTimer.current) {
      clearTimeout(lpTimer.current);
      lpTimer.current = null;
    }
  }

  function beginDrag(id: string) {
    dragIdRef.current = id;
    didDragRef.current = true;
    orderAtDragStart.current = itemsRef.current.map((g) => g.id).join(",");
    setDragId(id);
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10);
  }

  // While dragging, listen on the window so the gesture survives the pointer
  // leaving a row (and so the rows reorder live under the finger/cursor).
  useEffect(() => {
    if (!dragId) return;

    function onMove(e: PointerEvent) {
      if (!dragIdRef.current) return;
      e.preventDefault();
      const y = e.clientY;
      const list = itemsRef.current;
      let target = -1;
      for (let i = 0; i < list.length; i++) {
        const el = rowRefs.current.get(list[i].id);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (y >= r.top && y <= r.bottom) {
          target = i;
          break;
        }
      }
      if (target === -1) return;
      const from = list.findIndex((g) => g.id === dragIdRef.current);
      if (from === -1 || from === target) return;
      const next = [...list];
      const [moved] = next.splice(from, 1);
      next.splice(target, 0, moved);
      setItems(next);
    }

    function onUp() {
      dragIdRef.current = null;
      setDragId(null);
      const ids = itemsRef.current.map((g) => g.id);
      // Only persist when the order actually changed.
      if (ids.join(",") !== orderAtDragStart.current) {
        reorder.mutate({ groupIds: ids });
      }
    }

    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [dragId, reorder]);

  function onPointerDown(e: React.PointerEvent, id: string) {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    startRef.current = { x: e.clientX, y: e.clientY };
    didDragRef.current = false;
    cancelTapRef.current = false;
    clearLongPress();
    lpTimer.current = setTimeout(() => beginDrag(id), 250);
  }

  function onPointerMove(e: React.PointerEvent) {
    const start = startRef.current;
    if (!start || dragIdRef.current) return;
    // Moved before the long-press fired → it's a scroll/tap-cancel, not a drag.
    if (Math.abs(e.clientX - start.x) > 8 || Math.abs(e.clientY - start.y) > 8) {
      clearLongPress();
      startRef.current = null;
      cancelTapRef.current = true;
    }
  }

  function onPointerUp(id: string) {
    clearLongPress();
    startRef.current = null;
    // The window handler persists/ends an actual drag; here we only resolve a
    // plain tap into navigation.
    if (!didDragRef.current && !cancelTapRef.current) {
      router.push(`/g/${id}`);
      onNavigate();
    }
  }

  if (groups.length === 0) {
    return (
      <nav className="flex-1 overflow-y-auto px-2">
        <p className="px-3 text-xs text-muted">No groups yet</p>
      </nav>
    );
  }

  return (
    <nav
      className="flex-1 overflow-y-auto px-2"
      style={{ touchAction: dragId ? "none" : undefined }}
    >
      {items.map((group) => {
        const href = `/g/${group.id}`;
        const isActive = pathname.startsWith(href);
        const isDragging = dragId === group.id;
        return (
          <div
            key={group.id}
            ref={(el) => {
              rowRefs.current.set(group.id, el);
            }}
            role="link"
            tabIndex={0}
            onPointerDown={(e) => onPointerDown(e, group.id)}
            onPointerMove={onPointerMove}
            onPointerUp={() => onPointerUp(group.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                router.push(href);
                onNavigate();
              }
            }}
            className={`group/row flex items-center justify-between w-full px-2.5 py-[11px] md:py-[7px] my-px font-mono text-[13px] select-none cursor-pointer transition-all duration-150 ${
              isActive
                ? "bg-pastel-tint text-pastel-ink border border-pastel-deep font-semibold"
                : "text-ink border border-transparent hover:bg-border/50"
            } ${isDragging ? "opacity-80 bg-border/60 border-border-strong shadow-sm scale-[1.01]" : ""}`}
            style={{ touchAction: dragId ? "none" : "manipulation" }}
          >
            <span className="flex items-center gap-2 min-w-0">
              {/* Drag-handle affordance — signals the row is reorderable. */}
              <span
                aria-hidden
                title="Hold and drag to reorder"
                className={`flex-shrink-0 leading-none text-[10px] tracking-[-1px] transition-opacity ${
                  isDragging
                    ? "text-pastel-deep opacity-100"
                    : "text-muted-2 opacity-40 group-hover/row:opacity-100"
                }`}
              >
                ⠿
              </span>
              <span className="lowercase truncate">{group.name}</span>
            </span>
            {(unread[group.id]?.unread ?? 0) > 0 && (
              <span
                className="inline-block w-2 h-2 flex-shrink-0"
                style={{
                  background:
                    (unread[group.id]?.urgent ?? 0) > 0
                      ? "hsl(0 75% 52%)"
                      : "hsl(0 70% 78%)",
                  border: `1px solid ${(unread[group.id]?.urgent ?? 0) > 0 ? "hsl(0 65% 38%)" : "hsl(0 50% 62%)"}`,
                  transform: "rotate(45deg)",
                }}
              />
            )}
          </div>
        );
      })}
    </nav>
  );
}

export function Sidebar({
  groups,
  userDisplayName,
  avatarUrl,
}: {
  groups: Group[];
  userDisplayName: string;
  avatarUrl: string | null;
}) {
  const pathname = usePathname();
  const [searchOpen, setSearchOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const utils = trpc.useUtils();
  const { data: unread = {} } = trpc.groups.unread.useQuery(undefined, {
    staleTime: 30_000,
  });
  const { isOpen, close } = useMobileSidebar();

  // Keep the per-group unread dots live: any thread change (new message bumps
  // updated_at) or read-marker change refreshes the counts — across all groups,
  // not just the one currently open.
  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) setRealtimeAuth(supabase, data.session.access_token);
      if (cancelled) return;
      channel = supabase
        .channel("sidebar:unread")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "threads" },
          () => utils.groups.unread.invalidate(),
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "thread_reads" },
          () => utils.groups.unread.invalidate(),
        )
        .subscribe();
    })();
    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [utils]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const initials = userDisplayName
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className={`fixed inset-0 z-30 bg-black/40 md:hidden transition-opacity duration-200 ${
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={close}
        aria-hidden="true"
      />

      <aside
        className={`
          w-[232px] flex-shrink-0 border-r border-border flex flex-col bg-surface
          fixed inset-y-0 left-0 z-40
          transition-transform duration-200 ease-in-out
          md:relative md:z-auto md:translate-x-0
          ${isOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        {/* Logo */}
        <div className="px-[18px] py-[18px] flex items-center gap-2">
          <span className="font-mono text-sm font-semibold text-ink tracking-[-0.01em]">
            coldsoup
          </span>
        </div>

        {/* Search */}
        <button
          onClick={() => setSearchOpen(true)}
          className="mx-3 mb-3 flex items-center gap-2 px-2.5 py-1.5 border border-border text-muted hover:text-ink hover:border-border-strong transition-colors"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="flex-shrink-0"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <span className="font-mono text-[11px] flex-1 text-left">search</span>
        </button>

        {/* Group list header */}
        <div className="px-[18px] pb-0.5 flex items-center justify-between">
          <span className="font-mono text-[10px] text-muted-2 uppercase tracking-[0.18em]">
            Groups
          </span>
          <button
            onClick={() => setCreateOpen(true)}
            className="font-mono text-[14px] text-muted-2 hover:text-ink transition-colors leading-none"
            title="New group"
          >
            +
          </button>
        </div>
        <GroupNav groups={groups} unread={unread} pathname={pathname} onNavigate={close} />

        {/* Bottom user area */}
        <div className="border-t border-border p-3">
          <Link
            href="/settings"
            onClick={close}
            className={`block px-2 py-1.5 font-mono text-xs mb-2 transition-colors ${
              pathname === "/settings"
                ? "text-ink"
                : "text-muted hover:text-ink"
            }`}
          >
            settings
          </Link>
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="w-7 h-7 flex-shrink-0 border border-border overflow-hidden flex items-center justify-center font-mono text-[10px] font-semibold"
              style={{
                background: "hsl(180 30% 92%)",
                color: "hsl(180 40% 28%)",
              }}
            >
              {avatarUrl && !avatarError ? (
                <img
                  src={avatarUrl}
                  alt={userDisplayName}
                  className="w-full h-full object-cover"
                  onError={() => setAvatarError(true)}
                />
              ) : (
                initials
              )}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-ink truncate leading-tight">
                {userDisplayName}
              </p>
              <p className="font-mono text-[10px] text-muted leading-tight flex items-center gap-1">
                online
                <span
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{
                    background: "var(--pastel-deep)",
                    animation: "pulseDot 2s ease-in-out infinite",
                  }}
                />
              </p>
            </div>
          </div>
        </div>
      </aside>

      {searchOpen && <SearchDialog onClose={() => setSearchOpen(false)} />}
      {createOpen && <CreateGroupModal onClose={() => setCreateOpen(false)} />}
    </>
  );
}
