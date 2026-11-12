"use client";

import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc/client";
import {
  EVOLUTION,
  formLook,
  formShape,
  rerollPool,
  rerollReady,
  type BlobState,
  type FormLook,
} from "@/lib/blob-evolution";
import { baseShapeOf } from "@/lib/blob-base";
import { BlobForm } from "@/components/blob-form";
import { EvolveModal, rerollSpec, type RevealSpec } from "@/components/evolve-modal";
import { useLv3Reroll } from "@/components/use-lv3-reroll";

// Dismissing hides the banner for the current charge only. The key stores the
// charge's blob_reroll_xp; the next charge has a different value and shows again.
const DISMISS_KEY = "rerollBanner:dismissedAt";

export function RerollBannerView({
  userId,
  look,
  busy,
  error,
  onReroll,
  onDismiss,
}: {
  userId: string;
  look: FormLook;
  busy: boolean;
  error?: string | null;
  onReroll: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      className="fixed top-0 left-0 right-0 z-50 border-b border-accent bg-accent-light pt-safe px-safe"
      role="dialog"
      aria-label="Lv3 reroll ready"
    >
      <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
        <BlobForm name={userId} look={look} size={36} animate="always" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-ink">✦ Reroll ready</p>
          <p className="font-mono text-[11px] text-muted">
            {error ?? "Roll your Lv3 for a 1 in 4 shot at a shiny."}
          </p>
        </div>
        <button
          type="button"
          onClick={onReroll}
          disabled={busy}
          className="bg-ink px-3 py-2 font-mono text-xs text-surface disabled:opacity-40 shrink-0"
        >
          {busy ? "…" : "🎲 Reroll"}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="px-2 py-2 font-mono text-xs text-muted shrink-0"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

export function RerollBanner({ userId }: { userId: string }) {
  const [preview, setPreview] = useState<"miss" | "hit" | null>(null);

  // Dev-only test hook: /g?rerollPreview=miss or =hit shows the banner and a
  // fake reveal without a real charge. Touches no data.
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const p = new URLSearchParams(window.location.search).get("rerollPreview");
    if (p === "miss" || p === "hit") setPreview(p);
  }, []);

  if (preview) return <RerollBannerPreview userId={userId} outcome={preview} />;
  return <RerollBannerLive userId={userId} />;
}

function RerollBannerLive({ userId }: { userId: string }) {
  const { data: me, isFetchedAfterMount } = trpc.profile.myBlob.useQuery();
  const [hidden, setHidden] = useState(false);
  const [dismissedAt, setDismissedAt] = useState<string | null>(null);
  const { reroll, modal } = useLv3Reroll(userId);

  useEffect(() => {
    try {
      setDismissedAt(localStorage.getItem(DISMISS_KEY));
    } catch {}
  }, []);

  // Persisted cache can be stale; only trust a fresh fetch from this session.
  const show =
    !hidden && !!me && isFetchedAfterMount && rerollReady(me) && dismissedAt !== String(me.rerollXp);

  const dismiss = () => {
    setHidden(true);
    if (!me) return;
    try {
      localStorage.setItem(DISMISS_KEY, String(me.rerollXp));
    } catch {}
  };

  return (
    <>
      {show && (
        <RerollBannerView
          userId={userId}
          look={lv3Look(userId, me)}
          busy={reroll.isPending}
          error={reroll.error?.message}
          onReroll={() => reroll.mutate(undefined, { onSuccess: () => setHidden(true) })}
          onDismiss={dismiss}
        />
      )}
      {modal}
    </>
  );
}

function RerollBannerPreview({ userId, outcome }: { userId: string; outcome: "miss" | "hit" }) {
  const [visible, setVisible] = useState(true);
  const [spec, setSpec] = useState<RevealSpec | null>(null);
  const base = baseShapeOf(userId);
  const previous = formShape(base, 3, null);
  const next = rerollPool(base, EVOLUTION[base][0], previous)[0];

  return (
    <>
      {visible && (
        <RerollBannerView
          userId={userId}
          look={{ shape: previous, finish: "holo" }}
          busy={false}
          onReroll={() => {
            setVisible(false);
            setSpec(rerollSpec(userId, previous, next, outcome === "hit"));
          }}
          onDismiss={() => setVisible(false)}
        />
      )}
      {spec && <EvolveModal spec={spec} onPrimary={() => setSpec(null)} onSecondary={() => setSpec(null)} />}
    </>
  );
}

function lv3Look(userId: string, me: BlobState): FormLook {
  return formLook(baseShapeOf(userId), 3, me);
}
