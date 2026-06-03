"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { createClient } from "@/lib/supabase/client";

export default function InvitePage({
  params,
}: {
  params: { token: string };
}) {
  const { token } = params;
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [isSignedIn, setIsSignedIn] = useState(false);

  const { data: invite, error, isLoading } = trpc.invites.getByToken.useQuery({ token });
  const acceptInvite = trpc.invites.accept.useMutation({
    onSuccess: () => router.replace("/"),
  });

  // Check if user is already signed in
  useEffect(() => {
    createClient().auth.getUser().then(({ data: { user } }) => {
      setIsSignedIn(!!user);
    });
  }, []);

  async function handleAccept() {
    setLoading(true);

    if (isSignedIn) {
      // Already authenticated — accept directly, no magic link needed
      acceptInvite.mutate({ token });
      return;
    }

    // Not signed in — send magic link
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: invite?.email ?? "",
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?inviteToken=${token}`,
      },
    });

    if (!error) {
      setSent(true);
    }
    setLoading(false);
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="h-7 w-32 bg-border animate-pulse mb-4" />
          <div className="border border-border p-6 space-y-3">
            <div className="h-4 w-40 bg-border animate-pulse" />
            <div className="h-3 w-56 bg-border/60 animate-pulse" />
            <div className="h-9 w-full bg-border/60 animate-pulse mt-4" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !invite) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <h1 className="font-mono text-2xl font-semibold text-ink mb-4">
            coldsoup
          </h1>
          <div className="border border-border p-6">
            <p className="font-mono text-sm font-medium text-ink mb-1">
              Invite not found
            </p>
            <p className="text-sm text-muted">
              This invite link may have expired or already been used.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const inviterName =
    (invite.profiles as { display_name: string } | null)?.display_name ??
    "Someone";

  if (sent) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <h1 className="font-mono text-2xl font-semibold text-ink mb-8">
            coldsoup
          </h1>
          <div className="border border-border p-6">
            <p className="font-mono text-sm font-medium text-ink mb-1">
              Check your email
            </p>
            <p className="text-sm text-muted">
              We sent a magic link to <strong>{invite.email}</strong>. Click it
              to join <strong>coldsoup</strong>.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-10">
          <h1 className="font-mono text-2xl font-semibold text-ink tracking-tight">
            coldsoup
          </h1>
        </div>

        <div className="border border-border p-6 mb-4">
          <p className="font-mono text-xs text-muted uppercase tracking-wider mb-3">
            You&apos;re invited
          </p>
          <p className="text-sm text-ink mb-1">
            <strong>{inviterName}</strong> has invited you to join
          </p>
          <p className="font-mono text-lg font-semibold text-ink">
            coldsoup
          </p>
        </div>

        <button
          onClick={handleAccept}
          disabled={loading || acceptInvite.isPending}
          className="w-full bg-ink text-surface font-mono text-sm font-medium py-2.5 px-4 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-ink/90 transition-colors"
        >
          {loading || acceptInvite.isPending ? "Joining..." : "Accept & join"}
        </button>

        {!isSignedIn && (
          <p className="mt-3 text-xs text-muted text-center">
            We&apos;ll send a magic link to <strong>{invite.email}</strong>
          </p>
        )}

        {acceptInvite.error && (
          <p className="mt-3 text-xs text-red-600 text-center">
            {acceptInvite.error.message}
          </p>
        )}
      </div>
    </div>
  );
}
