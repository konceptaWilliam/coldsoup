"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import {
  EVOLUTION,
  ODDS,
  REROLL_EVERY,
  formLook,
  formShape,
  rerollPool,
  rerollProgress,
  rerollReady,
  type Form,
} from "@/lib/blob-evolution";
import { baseShapeOf } from "@/lib/blob-base";
import { BlobForm } from "@/components/blob-form";
import { EvolveModal, rerollSpec, type RevealSpec } from "@/components/evolve-modal";

const UNLOCK: Record<Form, string> = { 1: "", 2: "50 msgs", 3: "500 msgs" };

export function BlobSettings({ userId }: { userId: string }) {
  const utils = trpc.useUtils();
  const { data: me } = trpc.profile.myBlob.useQuery();
  const refresh = () => {
    void utils.profile.myBlob.invalidate();
    void utils.profile.blobs.invalidate();
  };
  const setForm = trpc.profile.setBlobForm.useMutation({ onSuccess: refresh });
  const keep = trpc.profile.keepLv3Shape.useMutation({ onSuccess: refresh });
  const reroll = trpc.profile.rerollLv3.useMutation({
    onSuccess: (r) => {
      refresh();
      setReveal({ spec: rerollSpec(userId, r.previous, r.shape, r.shiny), shiny: r.shiny });
    },
  });
  const [reveal, setReveal] = useState<{ spec: RevealSpec; shiny: boolean } | null>(null);

  if (!me) return <div className="h-40 bg-border/40 animate-pulse" />;

  const base = baseShapeOf(userId);
  const ready = rerollReady(me);
  const progress = rerollProgress(me.xp, me.rerollXp);
  const current = formShape(base, 3, me.lv3Shape);
  const pool = me.level === 3 && !me.shiny3 ? rerollPool(base, EVOLUTION[base][0], current) : [];
  const poolTotal = pool.reduce((a, s) => a + ODDS[s], 0);

  return (
    <div>
      <h2 className="font-mono text-xs text-muted uppercase tracking-wider mb-3">Your blob</h2>
      <div className="border border-border p-4 space-y-5">
        <div className="grid grid-cols-3 gap-2">
          {([1, 2, 3] as const).map((f) => {
            const locked = f > me.level;
            const look = formLook(base, f, me);
            const shiny = look.finish === "shiny";
            return (
              <button
                key={f}
                type="button"
                disabled={locked || setForm.isPending}
                onClick={() => setForm.mutate({ form: f })}
                aria-pressed={me.form === f}
                className={`flex flex-col items-center gap-1.5 border px-2 py-3 ${
                  me.form === f ? "border-ink" : "border-border"
                } ${locked ? "cursor-not-allowed" : "hover:border-border-strong"}`}
              >
                <BlobForm name={userId} look={look} size={64} silhouette={locked} title={`Lv${f}`} />
                <span className="font-mono text-[11px] text-ink">Lv{f}</span>
                <span className="font-mono text-[10px] text-muted">
                  {locked ? "???" : `${look.shape ?? base}${shiny ? " ✦ shiny" : ""}`}
                </span>
                <span className="font-mono text-[10px] text-muted min-h-[14px]">
                  {locked ? UNLOCK[f] : me.form === f ? "Equipped" : ""}
                </span>
              </button>
            );
          })}
        </div>

        <div className="border-t border-border pt-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-ink">Reroll Lv3</p>
              <p className="text-xs text-muted">
                Pulls a new rare shape, with a 1 in 4 shiny chance. One charge per {REROLL_EVERY} messages.
              </p>
            </div>
            <button
              type="button"
              disabled={!ready || reroll.isPending}
              onClick={() => reroll.mutate()}
              className="bg-ink text-surface font-mono text-xs px-4 py-2 disabled:opacity-40 shrink-0"
            >
              🎲 Reroll
            </button>
          </div>
          <p className={`font-mono text-[11px] ${me.shiny3 ? "text-accent" : "text-muted"}`}>
            {me.level < 3
              ? "Unlocks at Lv3."
              : me.shiny3
                ? "✦ Your Lv3 is shiny. Rerolls are off."
                : ready
                  ? "Charge ready. Charges don't stack."
                  : `${progress} / ${REROLL_EVERY} messages · ready in ${REROLL_EVERY - progress}`}
          </p>
          {reroll.error && <p className="font-mono text-[11px] text-urgent-ink">{reroll.error.message}</p>}
          {pool.length > 0 && (
            <div className="flex flex-wrap gap-3" aria-label="Possible shapes">
              {pool.map((s) => (
                <div key={s} className="flex flex-col items-center gap-0.5 font-mono text-[10px] text-muted">
                  <BlobForm name={userId} look={{ shape: s, finish: "holo" }} size={36} title={s} />
                  {s} · {Math.round((ODDS[s] / poolTotal) * 100)}%
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {reveal && (
        <EvolveModal
          spec={reveal.spec}
          onPrimary={() => {
            if (reveal.shiny) setForm.mutate({ form: 3 });
            else keep.mutate();
            setReveal(null);
          }}
          onSecondary={() => setReveal(null)}
        />
      )}
    </div>
  );
}
