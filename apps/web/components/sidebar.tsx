"use client";

import { useState, useEffect } from "react";
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
  const [inviteLinks, setInviteLinks] = useState<{ email: string; url: string }[]>([]);
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
        const result = await sendInvite.mutateAsync({ email, groupId: group.id });
        links.push({ email, url: (result as unknown as { inviteUrl: string }).inviteUrl });
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-surface border border-border max-w-sm w-full mx-4 p-4 shadow-lg" onClick={(e) => e.stopPropagation()}>
        {step === "form" ? (
          <>
            <div className="flex items-center justify-between mb-4">
              <p className="font-mono text-sm font-semibold text-ink">New group</p>
              <button onClick={onClose} className="font-mono text-[14px] text-muted hover:text-ink">×</button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="font-mono text-[10px] text-muted uppercase tracking-wider block mb-1">Group name</label>
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
                <label className="font-mono text-[10px] text-muted uppercase tracking-wider block mb-1">Invite by email <span className="normal-case">(optional, comma-separated)</span></label>
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
                  disabled={!name.trim() || createGroup.isPending || sendInvite.isPending}
                  className="flex-1 bg-ink text-surface font-mono text-sm py-2 disabled:opacity-40"
                >
                  {createGroup.isPending || sendInvite.isPending ? "Creating…" : "Create group"}
                </button>
                <button type="button" onClick={onClose} className="font-mono text-sm text-muted hover:text-ink px-3 py-2">
                  Cancel
                </button>
              </div>
            </form>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <p className="font-mono text-sm font-semibold text-ink">Group created</p>
              <button onClick={onClose} className="font-mono text-[14px] text-muted hover:text-ink">×</button>
            </div>
            <p className="font-mono text-[11px] text-muted mb-3">Share these invite links — email delivery may be delayed.</p>
            <div className="space-y-2">
              {inviteLinks.map(({ email, url }) => (
                <div key={email} className="border border-border p-2">
                  <p className="font-mono text-[11px] text-ink mb-1">{email}</p>
                  <div className="flex gap-2 items-center">
                    <span className="font-mono text-[10px] text-muted truncate flex-1">{url}</span>
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
            <button onClick={onClose} className="mt-3 w-full bg-ink text-surface font-mono text-sm py-2">
              Done
            </button>
          </>
        )}
      </div>
    </div>
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
  const { data: unread = {} } = trpc.groups.unread.useQuery(undefined, { staleTime: 30_000 });
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
        .on("postgres_changes", { event: "*", schema: "public", table: "threads" }, () =>
          utils.groups.unread.invalidate()
        )
        .on("postgres_changes", { event: "*", schema: "public", table: "thread_reads" }, () =>
          utils.groups.unread.invalidate()
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
          <span
            className="w-2.5 h-2.5 inline-block border border-pastel-deep flex-shrink-0"
            style={{
              background: "var(--pastel)",
              transform: "rotate(45deg)",
            }}
          />
          <span className="font-mono text-sm font-semibold text-ink tracking-[-0.01em]">
            coldsoup
          </span>
        </div>

        {/* Search */}
        <button
          onClick={() => setSearchOpen(true)}
          className="mx-3 mb-3 flex items-center gap-2 px-2.5 py-1.5 border border-border text-muted hover:text-ink hover:border-border-strong transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <span className="font-mono text-[11px] flex-1 text-left">search</span>
        </button>

        {/* Group list header */}
        <div className="px-[18px] pb-2 flex items-center justify-between">
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

        <nav className="flex-1 overflow-y-auto px-2">
          {groups.length === 0 ? (
            <p className="px-3 text-xs text-muted">No groups yet</p>
          ) : (
            groups.map((group) => {
              const href = `/g/${group.id}`;
              const isActive = pathname.startsWith(href);
              return (
                <Link
                  key={group.id}
                  href={href}
                  onClick={close}
                  className={`flex items-center justify-between w-full px-2.5 py-[11px] md:py-[7px] my-px font-mono text-[13px] transition-all duration-150 ${
                    isActive
                      ? "bg-pastel-tint text-pastel-ink border border-pastel-deep font-semibold"
                      : "text-ink border border-transparent hover:bg-border/50"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className={isActive ? "text-pastel-deep" : "text-muted-2"}>·</span>
                    <span className="lowercase">{group.name}</span>
                  </span>
                  {(unread[group.id]?.unread ?? 0) > 0 && (
                    <span
                      className="inline-block w-2 h-2 flex-shrink-0"
                      style={{
                        background: (unread[group.id]?.urgent ?? 0) > 0 ? "hsl(0 75% 52%)" : "hsl(0 70% 78%)",
                        border: `1px solid ${(unread[group.id]?.urgent ?? 0) > 0 ? "hsl(0 65% 38%)" : "hsl(0 50% 62%)"}`,
                        transform: "rotate(45deg)",
                      }}
                    />
                  )}
                </Link>
              );
            })
          )}
        </nav>

        {/* Bottom user area */}
        <div className="border-t border-border p-3">
          <Link
            href="/settings"
            onClick={close}
            className={`block px-2 py-1.5 font-mono text-xs mb-2 transition-colors ${
              pathname === "/settings" ? "text-ink" : "text-muted hover:text-ink"
            }`}
          >
            settings
          </Link>
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 flex-shrink-0 border border-border overflow-hidden flex items-center justify-center font-mono text-[10px] font-semibold"
              style={{ background: "hsl(180 30% 92%)", color: "hsl(180 40% 28%)" }}
            >
              {avatarUrl && !avatarError ? (
                <img
                  src={avatarUrl}
                  alt={userDisplayName}
                  className="w-full h-full object-cover"
                  onError={() => setAvatarError(true)}
                />
              ) : initials}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-ink truncate leading-tight">{userDisplayName}</p>
              <p className="font-mono text-[10px] text-muted leading-tight flex items-center gap-1">
                online
                <span
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ background: "var(--pastel-deep)", animation: "pulseDot 2s ease-in-out infinite" }}
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
