"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { trpc } from "@/lib/trpc/client";

function OnboardingForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get("invite") ?? undefined;

  const [displayName, setDisplayName] = useState("");
  const [userEmail, setUserEmail] = useState("");

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.replace("/login");
        return;
      }
      setUserEmail(user.email ?? "");
    });
  }, [router]);

  const complete = trpc.onboarding.complete.useMutation({
    onSuccess: () => {
      router.replace("/");
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    complete.mutate({ displayName: displayName.trim(), inviteToken });
  }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-10">
          <h1 className="font-mono text-2xl font-semibold text-ink tracking-tight">
            coldsoup
          </h1>
          <p className="text-sm text-muted mt-1">Set up your account</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {userEmail && (
            <div className="border border-border px-3 py-2 bg-surface-2">
              <p className="font-mono text-xs text-muted uppercase tracking-wider">
                Signed in as
              </p>
              <p className="text-sm text-ink mt-0.5">{userEmail}</p>
            </div>
          )}

          <div>
            <label
              htmlFor="displayName"
              className="block font-mono text-xs font-medium text-muted uppercase tracking-wider mb-2"
            >
              Display name
            </label>
            <input
              id="displayName"
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
              maxLength={20}
              className="w-full border border-border bg-surface-2 px-3 py-2.5 text-sm text-ink placeholder:text-muted focus:outline-none focus:border-ink transition-colors"
            />
          </div>

          {complete.error && (
            <p className="text-sm text-red-600 border border-red-200 bg-red-50 px-3 py-2">
              {complete.error.message}
            </p>
          )}

          <button
            type="submit"
            disabled={complete.isPending || !displayName.trim()}
            className="w-full bg-ink text-surface font-mono text-sm font-medium py-2.5 px-4 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-ink/90 transition-colors"
          >
            {complete.isPending ? "Setting up..." : "Continue"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense>
      <OnboardingForm />
    </Suspense>
  );
}
