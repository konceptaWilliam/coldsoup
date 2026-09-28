"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { createClient } from "@/lib/supabase/client";
import { CreateGroupModal } from "@/components/sidebar";
import { Avatar } from "@/components/avatar";
import { WebPushToggle } from "@/components/web-push-toggle";
import { useTheme, type ThemeMode } from "@/lib/theme-context";
import { isSoundEnabled, setSoundEnabled, playReceive } from "@/lib/sound";

function ProfileSection() {
  const utils = trpc.useUtils();
  const { data: profile, isLoading } = trpc.profile.get.useQuery();
  const updateProfile = trpc.profile.update.useMutation({
    onSuccess: () => utils.profile.get.invalidate(),
  });

  const [editingName, setEditingName] = useState(false);
  const [displayName, setDisplayName] = useState("");

  if (isLoading) return <div className="h-20 bg-border/40 animate-pulse" />;

  return (
    <div>
      <h2 className="font-mono text-xs text-muted uppercase tracking-wider mb-3">
        Profile
      </h2>
      <div className="border border-border p-4 space-y-4">
        {/* Avatar */}
        <div className="flex items-center gap-4">
          <Avatar
            userId={profile?.id}
            name={profile?.display_name ?? ""}
            size={56}
            animate="always"
          />
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink">
              {profile?.display_name}
            </p>
            <p className="text-xs text-muted">{profile?.email}</p>
          </div>
        </div>

        {/* Display name */}
        {editingName ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              updateProfile.mutate({ displayName: displayName.trim() });
              setEditingName(false);
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={20}
              className="flex-1 border border-border bg-surface-2 px-3 py-2 text-base md:text-sm text-ink focus:outline-none focus:border-ink"
              autoFocus
            />
            <button
              type="submit"
              disabled={!displayName.trim() || updateProfile.isPending}
              className="bg-ink text-surface font-mono text-xs px-4 py-2 disabled:opacity-40"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setEditingName(false)}
              className="font-mono text-xs text-muted hover:text-ink px-3 py-2"
            >
              Cancel
            </button>
          </form>
        ) : (
          <button
            onClick={() => {
              setDisplayName(profile?.display_name ?? "");
              setEditingName(true);
            }}
            className="font-mono text-xs text-muted hover:text-ink transition-colors"
          >
            Change display name
          </button>
        )}
      </div>
    </div>
  );
}

function ThemeSection() {
  const { mode, setMode } = useTheme();
  const options: Array<{ key: ThemeMode; label: string }> = [
    { key: "system", label: "System" },
    { key: "light", label: "Light" },
    { key: "dark", label: "Dark" },
  ];

  return (
    <div>
      <h2 className="font-mono text-xs text-muted uppercase tracking-wider mb-3">
        Appearance
      </h2>
      <div className="border border-border p-4">
        <div className="grid grid-cols-3 gap-2">
          {options.map((opt) => {
            const active = mode === opt.key;
            return (
              <button
                key={opt.key}
                onClick={() => setMode(opt.key)}
                className={`border px-3 py-2 font-mono text-xs uppercase tracking-[0.08em] transition-colors ${
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
      </div>
    </div>
  );
}

function ChangePasswordSection() {
  const { data: profile } = trpc.profile.get.useQuery();
  const sendNotification = trpc.profile.sendPasswordChangedEmail.useMutation();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match");
      return;
    }
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (!profile?.email) return;

    setLoading(true);
    setError(null);

    const supabase = createClient();

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: profile.email,
      password: currentPassword,
    });

    if (signInError) {
      setError("Incorrect current password");
      setLoading(false);
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    await sendNotification.mutateAsync();

    setSuccess(true);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setLoading(false);
    setTimeout(() => setSuccess(false), 4000);
  }

  return (
    <div>
      <h2 className="font-mono text-xs text-muted uppercase tracking-wider mb-3">
        Change password
      </h2>
      <form
        onSubmit={handleSubmit}
        className="border border-border p-4 space-y-4"
      >
        <div>
          <label className="block font-mono text-xs text-muted uppercase tracking-wider mb-2">
            Current password
          </label>
          <input
            type="password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full border border-border bg-surface-2 px-3 py-2 text-base md:text-sm text-ink placeholder:text-muted focus:outline-none focus:border-ink"
          />
        </div>

        <div>
          <label className="block font-mono text-xs text-muted uppercase tracking-wider mb-2">
            New password
          </label>
          <input
            type="password"
            required
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full border border-border bg-surface-2 px-3 py-2 text-base md:text-sm text-ink placeholder:text-muted focus:outline-none focus:border-ink"
          />
        </div>

        <div>
          <label className="block font-mono text-xs text-muted uppercase tracking-wider mb-2">
            Confirm new password
          </label>
          <input
            type="password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full border border-border bg-surface-2 px-3 py-2 text-base md:text-sm text-ink placeholder:text-muted focus:outline-none focus:border-ink"
          />
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}
        {success && (
          <p className="text-xs text-green-700">
            Password changed. A confirmation email has been sent.
          </p>
        )}

        <button
          type="submit"
          disabled={
            loading || !currentPassword || !newPassword || !confirmPassword
          }
          className="bg-ink text-surface font-mono text-sm px-4 py-2 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-ink/90 transition-colors"
        >
          {loading ? "Updating..." : "Change password"}
        </button>
      </form>
    </div>
  );
}

function MyGroupsSection() {
  const utils = trpc.useUtils();
  const { data: groups, isLoading } = trpc.groups.list.useQuery();
  const leaveGroup = trpc.groups.leave.useMutation({
    onSuccess: () => utils.groups.list.invalidate(),
  });
  const [createOpen, setCreateOpen] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState<string | null>(null);

  return (
    <div>
      {createOpen && <CreateGroupModal onClose={() => setCreateOpen(false)} />}
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-mono text-xs text-muted uppercase tracking-wider">
          My groups
        </h2>
        <button
          onClick={() => setCreateOpen(true)}
          className="font-mono text-xs text-muted hover:text-ink transition-colors"
        >
          + New group
        </button>
      </div>
      {isLoading ? (
        <div className="h-10 bg-border/40 animate-pulse" />
      ) : (groups ?? []).length === 0 ? (
        <p className="text-xs text-muted border border-border px-4 py-3">
          You&apos;re not in any groups yet.
        </p>
      ) : (
        <div className="border border-border divide-y divide-border">
          {(groups ?? []).map((group) => (
            <div
              key={group.id}
              className="px-4 py-3 flex items-center justify-between gap-4"
            >
              <span className="font-mono text-sm text-ink lowercase">. {group.name}</span>
              {confirmLeave === group.id ? (
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted">Sure?</span>
                  <button
                    onClick={() => {
                      leaveGroup.mutate({ groupId: group.id });
                      setConfirmLeave(null);
                    }}
                    disabled={leaveGroup.isPending}
                    className="font-mono text-xs text-red-600 hover:text-red-700 transition-colors"
                  >
                    Yes.
                  </button>
                  <button
                    onClick={() => setConfirmLeave(null)}
                    className="font-mono text-xs text-muted hover:text-ink transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmLeave(group.id)}
                  className="font-mono text-xs text-muted hover:text-red-600 transition-colors"
                >
                  Leave
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NotificationsSection() {
  const utils = trpc.useUtils();
  const { data: prefs, isLoading } = trpc.notifications.prefs.useQuery();
  const { data: groups = [] } = trpc.groups.list.useQuery();

  // Device-local sound preference (localStorage), read after mount to avoid an
  // SSR/client mismatch.
  const [sound, setSound] = useState(false);
  useEffect(() => setSound(isSoundEnabled()), []);
  const toggleSound = () => {
    const next = !sound;
    setSoundEnabled(next);
    setSound(next);
    if (next) playReceive(); // let the user hear what they just enabled
  };

  const setPaused = trpc.notifications.setPaused.useMutation({
    onMutate: async ({ paused }) => {
      await utils.notifications.prefs.cancel();
      const prev = utils.notifications.prefs.getData();
      utils.notifications.prefs.setData(undefined, (old) =>
        old ? { ...old, paused } : old,
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) utils.notifications.prefs.setData(undefined, ctx.prev);
    },
    onSettled: () => utils.notifications.prefs.invalidate(),
  });

  const setMute = trpc.notifications.setMute.useMutation({
    onMutate: async ({ targetId, muted }) => {
      await utils.notifications.prefs.cancel();
      const prev = utils.notifications.prefs.getData();
      utils.notifications.prefs.setData(undefined, (old) => {
        if (!old) return old;
        const set = new Set(old.groupIds);
        if (muted) set.add(targetId);
        else set.delete(targetId);
        return { ...old, groupIds: Array.from(set) };
      });
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) utils.notifications.prefs.setData(undefined, ctx.prev);
    },
    onSettled: () => utils.notifications.prefs.invalidate(),
  });

  const mutedGroups = groups.filter((group) => prefs?.groupIds.includes(group.id));

  return (
    <div>
      <h2 className="font-mono text-xs text-muted uppercase tracking-wider mb-3">
        Notifications
      </h2>
      <div className="border border-border p-4 space-y-4">
        {isLoading ? (
          <div className="h-16 bg-border/40 animate-pulse" />
        ) : (
          <>
            <WebPushToggle />

            <div className="flex items-center justify-between gap-4 border-t border-border pt-4">
              <div>
                <p className="text-sm text-ink">Pause all notifications</p>
                <p className="text-xs text-muted mt-0.5">
                  Stops push notifications until you turn them back on.
                </p>
              </div>
              <button
                onClick={() => setPaused.mutate({ paused: !prefs?.paused })}
                disabled={setPaused.isPending}
                className={`min-w-16 border px-3 py-2 font-mono text-xs uppercase tracking-[0.08em] disabled:opacity-40 ${
                  prefs?.paused
                    ? "bg-ink text-surface border-ink"
                    : "bg-surface-2 text-muted border-border hover:text-ink"
                }`}
              >
                {prefs?.paused ? "On" : "Off"}
              </button>
            </div>

            <div className="flex items-center justify-between gap-4 border-t border-border pt-4">
              <div>
                <p className="text-sm text-ink">Sounds</p>
                <p className="text-xs text-muted mt-0.5">
                  Subtle blip on send and on new messages. This device only.
                </p>
              </div>
              <button
                onClick={toggleSound}
                aria-pressed={sound}
                className={`min-w-16 border px-3 py-2 font-mono text-xs uppercase tracking-[0.08em] ${
                  sound
                    ? "bg-ink text-surface border-ink"
                    : "bg-surface-2 text-muted border-border hover:text-ink"
                }`}
              >
                {sound ? "On" : "Off"}
              </button>
            </div>

            <div className="border-t border-border pt-4">
              <p className="font-mono text-[10px] text-muted-2 uppercase tracking-wider mb-2">
                Muted groups
              </p>
              {mutedGroups.length === 0 ? (
                <p className="text-xs text-muted">No muted groups.</p>
              ) : (
                <div className="space-y-2">
                  {mutedGroups.map((group) => (
                    <div
                      key={group.id}
                      className="flex items-center justify-between gap-3 border border-border px-3 py-2"
                    >
                      <span className="font-mono text-xs text-ink lowercase truncate">
                        . {group.name}
                      </span>
                      <button
                        onClick={() =>
                          setMute.mutate({
                            targetType: "group",
                            targetId: group.id,
                            muted: false,
                          })
                        }
                        disabled={setMute.isPending}
                        className="font-mono text-xs text-muted hover:text-ink disabled:opacity-40"
                      >
                        Unmute
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {(prefs?.threadIds.length ?? 0) > 0 && (
                <p className="font-mono text-[10px] text-muted mt-3">
                  {prefs?.threadIds.length} muted thread
                  {prefs?.threadIds.length === 1 ? "" : "s"}
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function LogOutSection() {
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.replace("/login");
  }

  return (
    <div>
      <h2 className="font-mono text-xs text-muted uppercase tracking-wider mb-3">
        Account
      </h2>
      <div className="border border-border px-4 py-3">
        <button
          onClick={handleSignOut}
          disabled={signingOut}
          className="font-mono text-sm text-red-600 hover:text-red-700 transition-colors disabled:opacity-40"
        >
          {signingOut ? "Signing out…" : "Log out"}
        </button>
      </div>
    </div>
  );
}

function DeleteAccountSection() {
  const deleteAccount = trpc.profile.deleteAccount.useMutation({
    onSuccess: async () => {
      const supabase = createClient();
      await supabase.auth.signOut();
      window.location.replace("/login");
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Could not delete account"),
  });
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <h2 className="font-mono text-xs text-muted uppercase tracking-wider mb-3">
        Delete account
      </h2>
      <div className="border border-red-300 px-4 py-3 space-y-3">
        {!open ? (
          <button
            onClick={() => { setConfirm(""); setError(null); setOpen(true); }}
            className="font-mono text-sm text-red-600 hover:text-red-700 transition-colors"
          >
            Delete account
          </button>
        ) : (
          <>
            <p className="text-xs text-muted leading-relaxed">
              This permanently deletes your account. Your messages stay but show no author. Type{" "}
              <span className="font-mono text-ink">DELETE</span> to confirm.
            </p>
            <input
              type="text"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Type DELETE"
              className="w-full border border-border bg-surface-2 px-3 py-2 text-base md:text-sm text-ink placeholder:text-muted focus:outline-none focus:border-ink"
            />
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex items-center gap-2">
              <button
                onClick={() => deleteAccount.mutate()}
                disabled={confirm !== "DELETE" || deleteAccount.isPending}
                className="font-mono text-xs bg-red-600 text-white px-4 py-2 disabled:opacity-40 hover:bg-red-700 transition-colors"
              >
                {deleteAccount.isPending ? "Deleting…" : "Delete account"}
              </button>
              <button
                onClick={() => setOpen(false)}
                className="font-mono text-xs text-muted hover:text-ink px-3 py-2"
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <div className="flex h-screen-dynamic bg-surface">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 md:px-6 pt-8 pb-[calc(env(safe-area-inset-bottom)+6rem)]">
          <div className="mb-8 flex items-center gap-4">
            <Link
              href="/"
              className="font-mono text-xs text-muted hover:text-ink transition-colors"
            >
              ← Back
            </Link>
            <h1 className="font-mono text-lg font-semibold text-ink">
              Settings
            </h1>
          </div>

          <div className="space-y-10">
            <ProfileSection />
            <ThemeSection />
            <ChangePasswordSection />
            <MyGroupsSection />
            <NotificationsSection />
            <LogOutSection />
            <DeleteAccountSection />
          </div>
        </div>
      </div>
    </div>
  );
}
