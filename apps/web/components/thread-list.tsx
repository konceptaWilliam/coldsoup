"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { createClient } from "@/lib/supabase/client";
import { StatusBadge } from "./status-badge";
import { NewThreadDialog } from "./new-thread-dialog";
import { GroupCalendar } from "./group-calendar";
import { useUnread, getLastSeen, setLastSeen } from "@/lib/unread-context";
import { useMobileSidebar } from "@/lib/mobile-sidebar-context";

type Thread = {
  id: string;
  title: string;
  status: "OPEN" | "URGENT" | "DONE";
  updated_at: string;
  group_id: string;
  due_date?: string | null;
  creator?: {
    id: string;
    display_name: string;
    avatar_url: string | null;
  } | null;
  messages?: Array<{
    body: string;
    attachments?: Array<{ type: string; name?: string }> | null;
    poll_id?: string | null;
    smeter_id?: string | null;
    smeters?: { title: string | null } | null;
    is_deleted?: boolean;
    created_at: string;
    user_id: string;
    profiles: { display_name: string } | null;
  }>;
};

// Preview text for the last message. Falls back to a media-type label when the
// message has no text body (poll / image / video / audio / file).
function lastMessagePreview(m: NonNullable<Thread["messages"]>[number]): {
  text: string;
  media: boolean;
} {
  const body = (m.body ?? "").trim();
  if (body) return { text: body, media: false };
  if (m.smeter_id) return { text: m.smeters?.title ? `S-meter: ${m.smeters.title}` : "S-meter", media: true };
  if (m.poll_id) return { text: "Poll", media: true };
  const att = m.attachments?.[0];
  if (att) {
    switch (att.type) {
      case "image":
        return { text: "Photo", media: true };
      case "video":
        return { text: "Video", media: true };
      case "audio":
        return { text: "Voice message", media: true };
      default:
        return { text: att.name || "Attachment", media: true };
    }
  }
  return { text: "", media: false };
}

type ThreadFilter = "ALL" | Thread["status"];

function formatRelative(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString("en", { month: "short", day: "numeric" });
}

function sortThreads(threads: Thread[]): Thread[] {
  return [...threads].sort((a, b) => {
    const aDone = a.status === "DONE" ? 1 : 0;
    const bDone = b.status === "DONE" ? 1 : 0;
    if (aDone !== bDone) return aDone - bDone;
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });
}

function isOverdue(ymd: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(`${ymd}T00:00:00`).getTime() < today.getTime();
}

function formatDue(ymd: string): string {
  return new Date(`${ymd}T00:00:00`).toLocaleDateString("en", {
    month: "short",
    day: "numeric",
  });
}

function MemberAvatar({ member }: { member: { display_name: string; avatar_url: string | null } }) {
  return (
    <div
      className="w-5 h-5 flex-shrink-0 overflow-hidden flex items-center justify-center font-mono text-[8px] font-semibold"
      style={{ background: "hsl(180 30% 92%)", color: "hsl(180 40% 28%)" }}
    >
      {member.avatar_url
        ? <img src={member.avatar_url} alt={member.display_name} className="w-full h-full object-cover" />
        : member.display_name.slice(0, 1).toUpperCase()}
    </div>
  );
}

function BellOffIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      <path d="M18.63 13A17.9 17.9 0 0 0 18 8" />
      <path d="M6.26 6.26A6 6 0 0 0 6 8c0 7-3 9-3 9h14" />
      <path d="M18 8a6 6 0 0 0-9.33-5" />
      <path d="m1 1 22 22" />
    </svg>
  );
}

function GroupInfoModal({ groupId, groupName, onClose }: { groupId: string; groupName: string; onClose: () => void }) {
  const utils = trpc.useUtils();
  const { data: members = [], isLoading } = trpc.messages.groupMembers.useQuery({ groupId });
  const { data: pendingInvites = [] } = trpc.invites.list.useQuery({ groupId }, { retry: false });
  const { data: profile } = trpc.profile.get.useQuery();
  const { data: notifPrefs } = trpc.notifications.prefs.useQuery();

  const myMembership = members.find((m) => m.id === profile?.id);
  const isAdmin = myMembership?.role === "ADMIN";
  const groupLevel: "ALL" | "MENTIONS" | "NONE" = notifPrefs?.groupLevels?.[groupId] ?? "ALL";

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(groupName);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const rename = trpc.groups.rename.useMutation({
    onSuccess: () => { utils.groups.list.invalidate(); setEditing(false); },
  });

  const sendInvite = trpc.invites.send.useMutation({
    onSuccess: (data) => {
      utils.invites.list.invalidate({ groupId });
      setInviteEmail("");
      setInviteLink((data as unknown as { inviteUrl: string }).inviteUrl);
    },
  });

  const revokeInvite = trpc.invites.revoke.useMutation({
    onSuccess: () => utils.invites.list.invalidate({ groupId }),
  });

  const removeMember = trpc.groups.removeMember.useMutation({
    onSuccess: () => utils.messages.groupMembers.invalidate({ groupId }),
  });

  const transferAdmin = trpc.groups.transferAdmin.useMutation({
    onSuccess: () => { utils.messages.groupMembers.invalidate({ groupId }); onClose(); },
  });

  const setGroupLevel = trpc.notifications.setGroupLevel.useMutation({
    onMutate: async ({ groupId: gid, level }) => {
      await utils.notifications.prefs.cancel();
      const prev = utils.notifications.prefs.getData();
      utils.notifications.prefs.setData(undefined, (old) => {
        if (!old) return old;
        const groupLevels = { ...old.groupLevels };
        if (level === "ALL") delete groupLevels[gid];
        else groupLevels[gid] = level;
        const groupIds = Object.entries(groupLevels)
          .filter(([, lvl]) => lvl === "NONE")
          .map(([id]) => id);
        return { ...old, groupLevels, groupIds };
      });
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) utils.notifications.prefs.setData(undefined, ctx.prev);
    },
    onSettled: () => utils.notifications.prefs.invalidate(),
  });

  function copyLink() {
    if (!inviteLink) return;
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const admins = members.filter((m) => m.role === "ADMIN");
  const regularMembers = members.filter((m) => m.role !== "ADMIN");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-surface border border-border max-w-sm w-full mx-4 p-4 shadow-lg max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          {editing ? (
            <form className="flex gap-2 flex-1 mr-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) rename.mutate({ groupId, name: name.trim() }); }}>
              <input autoFocus value={name} onChange={(e) => setName(e.target.value.replace(/ /g, "_"))} maxLength={80}
                className="flex-1 border border-border bg-surface-2 px-2 py-1 font-mono text-sm text-ink focus:outline-none focus:border-ink" />
              <button type="submit" disabled={!name.trim() || rename.isPending} className="font-mono text-[10px] bg-ink text-surface px-2 py-1 disabled:opacity-40">Save</button>
              <button type="button" onClick={() => { setEditing(false); setName(groupName); }} className="font-mono text-[10px] text-muted hover:text-ink px-1">×</button>
            </form>
          ) : (
            <div className="flex items-center gap-2 flex-1 mr-2">
              <p className="font-mono text-sm font-semibold text-ink lowercase">{groupName}</p>
              {isAdmin && <button onClick={() => setEditing(true)} className="font-mono text-[10px] text-muted hover:text-ink">rename</button>}
            </div>
          )}
          <button onClick={onClose} className="font-mono text-[14px] text-muted hover:text-ink flex-shrink-0">×</button>
        </div>

        {isLoading ? <div className="h-16 bg-border/40 animate-pulse" /> : (
          <div className="space-y-4">
            <div>
              <p className="font-mono text-[10px] text-muted uppercase tracking-wider mb-2">Notifications</p>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    { key: "ALL", label: "All" },
                    { key: "MENTIONS", label: "Mentions" },
                    { key: "NONE", label: "None" },
                  ] as const
                ).map((opt) => {
                  const active = groupLevel === opt.key;
                  return (
                    <button
                      key={opt.key}
                      onClick={() => { if (!active) setGroupLevel.mutate({ groupId, level: opt.key }); }}
                      aria-pressed={active}
                      className={`min-h-8 border font-mono text-[10px] uppercase tracking-[0.12em] transition-colors ${
                        active
                          ? "bg-ink text-surface border-ink"
                          : "bg-surface-2 text-muted border-border hover:text-ink hover:border-border-strong"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-[11px] text-muted-2">
                Mentions = only @you, @everyone and @here notify.
              </p>
            </div>

            {/* Invite section (admin only) */}
            {isAdmin && (
              <div>
                <p className="font-mono text-[10px] text-muted uppercase tracking-wider mb-2">Invite</p>
                <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (inviteEmail.trim()) sendInvite.mutate({ email: inviteEmail.trim(), groupId }); }}>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="email@example.com"
                    className="flex-1 border border-border bg-surface-2 px-2 py-1 font-mono text-[11px] text-ink placeholder:text-muted focus:outline-none focus:border-ink"
                  />
                  <button type="submit" disabled={!inviteEmail.trim() || sendInvite.isPending} className="font-mono text-[10px] bg-ink text-surface px-2 py-1 disabled:opacity-40">
                    Send
                  </button>
                </form>
                {sendInvite.data && (sendInvite.data as unknown as { emailSent: boolean }).emailSent === false && (
                  <p className="mt-2 font-mono text-[10px] text-amber-700">
                    Email didn&apos;t send: {(sendInvite.data as unknown as { emailError: string | null }).emailError}. Share the link below manually.
                  </p>
                )}
                {sendInvite.error && (
                  <p className="mt-2 font-mono text-[10px] text-red-600">{sendInvite.error.message}</p>
                )}
                {inviteLink && (
                  <div className="mt-2 border border-border p-2 flex items-center gap-2">
                    <span className="font-mono text-[10px] text-muted flex-1 truncate">{inviteLink}</span>
                    <button onClick={copyLink} className="font-mono text-[10px] text-muted hover:text-ink flex-shrink-0">
                      {copied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                )}
                {/* Pending invites */}
                {(pendingInvites as { id: string; email: string }[]).length > 0 && (
                  <div className="mt-2 space-y-1">
                    {(pendingInvites as { id: string; email: string }[]).map((inv) => (
                      <div key={inv.id} className="flex items-center justify-between">
                        <span className="font-mono text-[10px] text-muted">{inv.email} · pending</span>
                        <button onClick={() => revokeInvite.mutate({ inviteId: inv.id })} className="font-mono text-[10px] text-muted hover:text-red-600">revoke</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Admins */}
            {admins.length > 0 && (
              <div>
                <p className="font-mono text-[10px] text-muted uppercase tracking-wider mb-2">Admins</p>
                <div className="space-y-1.5">
                  {admins.map((m) => (
                    <div key={m.id} className="flex items-center gap-2">
                      <MemberAvatar member={m} />
                      <span className="font-mono text-[12px] text-ink flex-1">{m.display_name}</span>
                      {isAdmin && m.id !== profile?.id && (
                        <button onClick={() => removeMember.mutate({ groupId, userId: m.id })} className="font-mono text-[10px] text-muted hover:text-red-600">remove</button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Members */}
            {regularMembers.length > 0 && (
              <div>
                <p className="font-mono text-[10px] text-muted uppercase tracking-wider mb-2">Members</p>
                <div className="space-y-1.5">
                  {regularMembers.map((m) => (
                    <div key={m.id} className="flex items-center gap-2">
                      <MemberAvatar member={m} />
                      <span className="font-mono text-[12px] text-ink flex-1">{m.display_name}</span>
                      {isAdmin && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => { if (confirm(`Transfer admin to ${m.display_name}? You will become a member.`)) transferAdmin.mutate({ groupId, newAdminId: m.id }); }}
                            className="font-mono text-[10px] text-muted hover:text-ink"
                          >
                            make admin
                          </button>
                          <button onClick={() => removeMember.mutate({ groupId, userId: m.id })} className="font-mono text-[10px] text-muted hover:text-red-600">remove</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function ThreadList({ groupId, groupName }: { groupId: string; groupName: string }) {
  const pathname = usePathname();
  const [showNewThread, setShowNewThread] = useState(false);
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [filter, setFilter] = useState<ThreadFilter>("ALL");
  const utils = trpc.useUtils();
  const { threadCounts, setThreadCount } = useUnread();
  const { open: openSidebar } = useMobileSidebar();

  // On mobile, hide thread list when a thread is open so the detail takes full width
  const isOnThread = /\/t\//.test(pathname);

  const { data: rawThreads = [], isLoading } = trpc.threads.list.useQuery(
    { groupId },
    { refetchOnWindowFocus: false }
  );
  const { data: notifPrefs } = trpc.notifications.prefs.useQuery();

  const threads = rawThreads as unknown as Thread[];
  const isGroupMuted = !!notifPrefs?.groupIds.includes(groupId);
  const sorted = useMemo(() => {
    const all = sortThreads(threads);
    return filter === "ALL" ? all : all.filter((thread) => thread.status === filter);
  }, [threads, filter]);

  const filterOptions: Array<{ key: ThreadFilter; label: string }> = [
    { key: "ALL", label: "All" },
    { key: "OPEN", label: "Open" },
    { key: "URGENT", label: "Urgent" },
    { key: "DONE", label: "Done" },
  ];

  // Initialise the lastSeen baseline for any never-seen thread to "now", so old
  // history isn't counted as unread the first time a thread appears.
  useEffect(() => {
    if (threads.length === 0) return;
    const now = Date.now();
    for (const thread of threads) {
      if (getLastSeen(thread.id) === 0) setLastSeen(thread.id, now);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawThreads]);

  // Client lastSeen baseline → server. Recomputed when the thread set changes or
  // on navigation (opening/closing a thread updates its lastSeen marker).
  const since = useMemo(() => {
    const s: Record<string, number> = {};
    for (const thread of threads) s[thread.id] = getLastSeen(thread.id) || Date.now();
    return s;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawThreads, pathname]);

  const { data: serverCounts } = trpc.threads.unreadCounts.useQuery(
    { groupId, since },
    { enabled: threads.length > 0 }
  );

  // Push real per-thread counts into the shared unread store (drives the badge
  // here and the group totals).
  useEffect(() => {
    if (!serverCounts) return;
    for (const thread of threads) {
      setThreadCount(
        thread.id,
        groupId,
        serverCounts[thread.id] ?? 0,
        thread.status === "URGENT"
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverCounts, groupId]);

  // Realtime: invalidate thread list on any change (new messages update thread.updated_at)
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`threads:group:${groupId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "threads", filter: `group_id=eq.${groupId}` },
        () => {
          utils.threads.list.invalidate({ groupId });
          utils.threads.unreadCounts.invalidate({ groupId });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [groupId, utils]);

  return (
    <section
      className={`${
        isOnThread ? "hidden md:flex" : "flex"
      } flex-col w-full md:w-[336px] flex-shrink-0 border-r border-border h-full`}
    >
      {showGroupInfo && <GroupInfoModal groupId={groupId} groupName={groupName} onClose={() => setShowGroupInfo(false)} />}
      {/* Header */}
      <header className="px-3 md:px-[18px] pt-2 md:pt-[14px] pb-2 md:pb-[10px] border-b border-border">
        <div className="flex items-center gap-1">
          {/* Hamburger - mobile only */}
          <button
            onClick={openSidebar}
            className="md:hidden -ml-1 w-11 h-11 flex items-center justify-center text-muted hover:text-ink transition-colors flex-shrink-0"
            aria-label="Open menu"
          >
            <svg width="18" height="14" viewBox="0 0 18 14" fill="currentColor" aria-hidden="true">
              <rect width="18" height="2" rx="1" />
              <rect y="6" width="18" height="2" rx="1" />
              <rect y="12" width="18" height="2" rx="1" />
            </svg>
          </button>

          <button
            onClick={() => setShowGroupInfo(true)}
            title={isGroupMuted ? "Group muted" : "Group options"}
            className="font-mono text-sm font-semibold text-ink flex-1 truncate min-w-0 text-left hover:text-muted transition-colors"
          >
            <span className="text-muted-2">· </span><span className="lowercase">{groupName}</span>
          </button>

          <button
            onClick={() => setShowCalendar(true)}
            aria-label="Group calendar"
            title="Group calendar"
            className="w-11 h-11 md:w-8 md:h-8 flex items-center justify-center text-muted hover:text-ink border border-border hover:border-border-strong transition-colors flex-shrink-0"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="4" width="18" height="18" rx="0" />
              <path d="M3 10h18" />
              <path d="M8 2v4" />
              <path d="M16 2v4" />
            </svg>
          </button>

          <button
            onClick={() => setShowNewThread(true)}
            className="font-mono text-[11px] px-2.5 py-2 md:py-1 border border-pastel-deep text-pastel-ink transition-all duration-150 hover:-translate-y-px flex-shrink-0 min-h-[44px] md:min-h-0 flex items-center"
            style={{ background: "var(--pastel)" }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.boxShadow = "0 2px 0 var(--pastel-deep)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.boxShadow = "none";
            }}
          >
            + new thread
          </button>
        </div>
      </header>

      {/* Filters */}
      <div className="grid grid-cols-4 gap-1.5 px-3 md:px-[18px] py-2 border-b border-border">
        {filterOptions.map((opt) => {
          const active = filter === opt.key;
          return (
            <button
              key={opt.key}
              onClick={() => setFilter(opt.key)}
              className={`min-h-8 border font-mono text-[10px] uppercase tracking-[0.12em] transition-colors ${
                active
                  ? "bg-ink text-surface border-ink"
                  : "bg-surface-2 text-muted border-border hover:text-ink hover:border-border-strong"
              }`}
              aria-pressed={active}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Thread items */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-[80px] bg-border/40 animate-pulse" />
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-sm text-muted font-mono">nothing here yet</p>
          </div>
        ) : (
          sorted.map((thread) => {
            const href = `/g/${groupId}/t/${thread.id}`;
            const isActive = pathname === href;
            const isDone = thread.status === "DONE";
            const lastMessage = thread.messages?.[thread.messages.length - 1];
            const lastAuthor = lastMessage?.profiles?.display_name?.split(" ")[0];
            const unread = isActive ? 0 : (threadCounts[thread.id] ?? 0);
            const isThreadMuted = !!notifPrefs?.threadIds.includes(thread.id);
            const overdue = thread.due_date ? isOverdue(thread.due_date) : false;

            // Unread threads get a bold left accent bar (amber when URGENT, ink
            // otherwise); read threads dim down so unread pops on a left-edge
            // scan. Active selection still wins the bar colour.
            const borderLeftColor = isActive
              ? "var(--pastel-deep)"
              : unread > 0
                ? thread.status === "URGENT"
                  ? "var(--accent)"
                  : "var(--ink)"
                : "transparent";
            const dimRead = !isActive && !isDone && unread === 0;

            return (
              <Link
                key={thread.id}
                href={href}
                className={`block py-3 border-b border-border transition-all duration-150 ${
                  isDone ? "opacity-35" : dimRead ? "opacity-60" : ""
                } ${isActive ? "bg-pastel-tint/60" : "[@media(hover:hover)]:hover:bg-border/30"}`}
                style={{
                  borderLeft: `${unread > 0 && !isActive ? "4px" : "3px"} solid ${borderLeftColor}`,
                  paddingLeft: unread > 0 && !isActive ? "14px" : "15px",
                  paddingRight: "18px",
                }}
              >
                {/* Title + unread badge + timestamp */}
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span
                    className={`font-mono text-[13px] leading-snug truncate ${
                      isDone ? "line-through decoration-muted-2 text-muted" : ""
                    } ${unread > 0 ? "font-semibold" : isActive ? "font-semibold" : "font-medium"}`}
                  >
                    <span className="text-muted-2"># </span>
                    <span className="lowercase">{thread.title}</span>
                  </span>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {unread > 0 && (
                      <span
                        className="font-mono text-[10px] font-semibold leading-none px-1.5 py-1 min-w-[18px] text-center tabular-nums"
                        style={{
                          background:
                            thread.status === "URGENT"
                              ? "var(--accent)"
                              : "var(--ink)",
                          color: "var(--surface)",
                        }}
                        title={`${unread} unread`}
                      >
                        {unread > 99 ? "99+" : unread}
                      </span>
                    )}
                    {isThreadMuted && (
                      <span className="text-muted-2" title="Muted">
                        <BellOffIcon />
                      </span>
                    )}
                    <span className="font-mono text-[10px] text-muted">
                      {formatRelative(thread.updated_at)}
                    </span>
                  </div>
                </div>

                {/* Status pill */}
                <div className="flex items-center gap-2 mb-1.5">
                  <StatusBadge status={thread.status} />
                </div>

                {/* Last message preview */}
                {lastMessage && (
                  <div className="flex items-center gap-1.5 min-w-0">
                    {lastMessage.is_deleted ? (
                      <span className="text-xs text-muted-2 italic">deleted message</span>
                    ) : (
                      <>
                        {lastAuthor && (
                          <span className="font-mono text-[10px] text-muted flex-shrink-0">
                            {lastAuthor}:
                          </span>
                        )}
                        {(() => {
                          const preview = lastMessagePreview(lastMessage);
                          return (
                            <span
                              className={`text-xs truncate ${preview.media ? "text-muted-2 italic" : "text-muted"}`}
                            >
                              {preview.text}
                            </span>
                          );
                        })()}
                      </>
                    )}
                  </div>
                )}

                {thread.due_date && (
                  <div className="flex items-center flex-wrap gap-1.5 mt-2">
                    <span
                      className={`font-mono text-[9px] uppercase tracking-[0.08em] px-1.5 py-0.5 border ${
                        overdue
                          ? "border-urgent-border bg-urgent-tint text-urgent-ink"
                          : "border-border bg-surface-2 text-muted"
                      }`}
                    >
                      {formatDue(thread.due_date)}
                    </span>
                  </div>
                )}
              </Link>
            );
          })
        )}
      </div>

      {showNewThread && (
        <NewThreadDialog groupId={groupId} onClose={() => setShowNewThread(false)} />
      )}

      {showCalendar && (
        <GroupCalendar groupId={groupId} groupName={groupName} onClose={() => setShowCalendar(false)} />
      )}
    </section>
  );
}
