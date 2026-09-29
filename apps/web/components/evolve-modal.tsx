"use client";

import { useEffect, useState } from "react";
import { happy, surprised } from "blobatar/expression";
import {
  EVOLUTION,
  ODDS,
  REROLL_EVERY,
  formLook,
  type BlobState,
  type Finish,
  type FormLook,
  type Shape,
} from "@/lib/blob-evolution";
import { baseShapeOf } from "@/lib/blob-base";
import { BlobForm } from "@/components/blob-form";

export type RevealSpec = {
  userId: string;
  /** Form to equip when the user accepts. */
  level: 2 | 3;
  from: FormLook;
  /** Final look. If its finish is "shiny", the two-stage reveal plays. */
  to: FormLook;
  /** What `to` looks like before the shiny turns (stage one). */
  toPlainFinish: Finish;
  title: string;
  fromTo: string;
  sub: string;
  finalFromTo: string;
  finalSub: string;
  primaryLabel: string;
  secondaryLabel: string;
};

type Phase = "evolve" | "tease" | "flip" | "done";

/** Spec for an evolution to `level`, from the form the user is wearing now. */
export function evolveSpec(
  userId: string,
  current: BlobState,
  level: 2 | 3,
  shiny: boolean,
): RevealSpec {
  const base = baseShapeOf(userId);
  const from = formLook(base, current.form, current);
  const shape = EVOLUTION[base][level - 2];
  const plain: Finish = level === 3 ? "holo" : "plain";
  const inherited = level === 3 && shiny && current.shiny2;
  return {
    userId,
    level,
    from,
    to: { shape, finish: shiny ? "shiny" : plain },
    toPlainFinish: plain,
    title: level === 3 ? "Final form unlocked!" : "Your blob evolved!",
    fromTo: `${from.shape ?? base} → ${shape} · Lv${level}`,
    sub: "Equip it now or switch any time in Settings.",
    finalFromTo: `${shape} · Lv${level} · shiny`,
    finalSub:
      level === 2
        ? "1 in 16 Lv2s are shiny. Shiny Lv2s always evolve shiny."
        : inherited
          ? "Your shiny Lv2 carried over. Shiny all the way up."
          : "1 in 4 Lv3s are shiny. Yours is one of them.",
    primaryLabel: shiny ? "Equip shiny form" : "Equip new form",
    secondaryLabel: "Keep current look",
  };
}

/** Spec for a Lv3 reroll result. */
export function rerollSpec(userId: string, previous: Shape, shape: Shape, shiny: boolean): RevealSpec {
  return {
    userId,
    level: 3,
    from: { shape: previous, finish: "holo" },
    to: { shape, finish: shiny ? "shiny" : "holo" },
    toPlainFinish: "holo",
    title: `New form: ${shape}`,
    fromTo: `${previous} → ${shape} · ${ODDS[shape]}% base odds`,
    sub: `No shiny this time 😭 Next reroll in ${REROLL_EVERY} messages.`,
    finalFromTo: `${shape} · Lv3 · shiny`,
    finalSub: "Rerolled into a shiny. Rerolls are off now; you won.",
    primaryLabel: shiny ? "Equip shiny form" : `Keep ${shape}`,
    secondaryLabel: shiny ? "Keep current look" : `Back to ${previous}`,
  };
}

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function EvolveModal({
  spec,
  onPrimary,
  onSecondary,
}: {
  spec: RevealSpec;
  onPrimary: () => void;
  onSecondary: () => void;
}) {
  const shiny = spec.to.finish === "shiny";
  const [phase, setPhase] = useState<Phase>("evolve");

  useEffect(() => {
    setPhase("evolve");
    if (!shiny) return;
    const r = reducedMotion();
    const timers = [
      setTimeout(() => setPhase("tease"), r ? 600 : 3000),
      setTimeout(() => setPhase("flip"), r ? 1200 : 3900),
      setTimeout(() => setPhase("done"), r ? 1400 : 4600),
    ];
    return () => timers.forEach(clearTimeout);
  }, [spec, shiny]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onSecondary();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSecondary]);

  const turned = phase === "flip" || phase === "done";
  const title = phase === "done" ? "✨ It's a shiny!" : phase === "tease" || phase === "flip" ? "wait… something's different 👀" : spec.title;
  const fromTo = phase === "done" ? spec.finalFromTo : phase === "evolve" ? spec.fromTo : "";
  const sub = phase === "done" ? spec.finalSub : phase === "evolve" ? spec.sub : "";
  const showActions = !shiny || phase === "done";
  const size = 150;

  return (
    <div
      className="fixed inset-0 z-50 bg-ink/25 flex items-center justify-center p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onSecondary();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="evo-title"
        className="w-full max-w-xs bg-surface border border-border p-6 shadow-lg text-center flex flex-col items-center gap-3"
      >
        <div className="evo-stage" key={`${spec.from.shape}-${spec.to.shape}-${spec.to.finish}`}>
          <div className="evo-slot evo-old">
            <BlobForm name={spec.userId} look={spec.from} size={size} animate="always" expression={surprised} />
          </div>
          <div className={`evo-slot evo-new${turned ? " evo-gone" : ""}`}>
            <BlobForm
              name={spec.userId}
              look={{ shape: spec.to.shape, finish: spec.toPlainFinish }}
              size={size}
              animate="always"
              expression={happy}
            />
          </div>
          {shiny && (
            <div className={`evo-slot evo-shiny${turned ? " evo-in" : ""}`}>
              <BlobForm name={spec.userId} look={spec.to} size={size} animate="always" expression={happy} />
            </div>
          )}
          <div className="evo-flash" />
          <div className={`evo-flash-gold${turned ? " evo-in" : ""}`} />
          {turned && (
            <div className="evo-burst" aria-hidden>
              {Array.from({ length: 10 }, (_, i) => (
                <span key={i} style={{ ["--a" as string]: `${i * 36}deg`, ["--d" as string]: `${(i % 3) * 60}ms` }}>
                  ✦
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="evo-text flex flex-col items-center gap-1.5 w-full">
          <h3 id="evo-title" className={`text-lg font-semibold ${phase === "done" ? "text-accent" : "text-ink"}`}>
            {title}
          </h3>
          {fromTo && <p className="font-mono text-xs text-ink-soft">{fromTo}</p>}
          {sub && <p className="text-sm text-muted">{sub}</p>}
          {showActions && (
            <div className="flex flex-col gap-2 w-full mt-2">
              <button onClick={onPrimary} className="bg-ink text-surface font-mono text-xs px-4 py-2" autoFocus>
                {spec.primaryLabel}
              </button>
              <button onClick={onSecondary} className="font-mono text-xs text-muted hover:text-ink px-4 py-2">
                {spec.secondaryLabel}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
