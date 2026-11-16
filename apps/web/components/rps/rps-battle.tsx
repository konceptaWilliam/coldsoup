"use client";

import { useEffect, useState } from "react";
import type { RpsMove } from "@/lib/rps";
import { Hand } from "./hands";

export type BattlePhase = "shake" | "reveal" | "result";

const CHANT = ["Rock…", "paper…", "scissors!"];
const BEAT_MS = 500;
const REVEAL_MS = 700;

type Side = { name: string; move: RpsMove };

// Two fists shake three times to the chant, flip to the chosen moves, then the
// banner pops. `frozen` pins a phase without timers (dev preview). Reduced
// motion jumps straight to the result.
export function RpsBattle({
  left,
  right,
  banner,
  startAt = "shake",
  frozen = false,
}: {
  left: Side;
  right: Side;
  banner: string;
  startAt?: BattlePhase;
  frozen?: boolean;
}) {
  const [phase, setPhase] = useState<BattlePhase>(startAt);
  const [beat, setBeat] = useState(0);

  useEffect(() => {
    if (frozen || startAt !== "shake") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setPhase("result");
      return;
    }
    const timers = [
      setTimeout(() => setBeat(1), BEAT_MS),
      setTimeout(() => setBeat(2), BEAT_MS * 2),
      setTimeout(() => setPhase("reveal"), BEAT_MS * 3),
      setTimeout(() => setPhase("result"), BEAT_MS * 3 + REVEAL_MS),
    ];
    return () => timers.forEach(clearTimeout);
  }, [frozen, startAt]);

  const shaking = phase === "shake";

  return (
    <div className="select-none">
      <div className="flex items-center justify-between gap-2">
        <BattleHand side="left" move={shaking ? "rock" : left.move} animKey={shaking ? `s${beat}` : "r"} shaking={shaking} />
        <span className="font-mono text-[13px] font-extrabold text-black">VS</span>
        <BattleHand side="right" move={shaking ? "rock" : right.move} animKey={shaking ? `s${beat}` : "r"} shaking={shaking} />
      </div>
      <div className="flex justify-between font-mono text-[12px] font-bold text-neutral-600 mt-1">
        <span className="truncate max-w-[45%]">{left.name}</span>
        <span className="truncate max-w-[45%] text-right">{right.name}</span>
      </div>
      <div className="h-14 mt-3 flex items-center justify-center">
        {shaking ? (
          <span key={beat} className="rps-pop font-mono text-[22px] font-extrabold text-black">
            {CHANT[beat]}
          </span>
        ) : phase === "result" ? (
          <span className="rps-pop border-2 border-black bg-yellow-300 px-3 py-1 font-mono text-[18px] font-extrabold text-black shadow-[3px_3px_0_black]">
            {banner}
          </span>
        ) : null}
      </div>
    </div>
  );
}

// Hands are drawn pointing up; turn them to face each other. The right hand
// is mirrored first so its thumb sits on top like the left one.
function BattleHand({
  side,
  move,
  animKey,
  shaking,
}: {
  side: "left" | "right";
  move: RpsMove;
  animKey: string;
  shaking: boolean;
}) {
  const turn = side === "left" ? "rotate(90deg)" : "rotate(-90deg) scaleX(-1)";
  return (
    <div key={animKey} className={shaking ? "rps-shake" : "rps-pop"}>
      <div style={{ transform: turn }}>
        <Hand move={move} size={112} />
      </div>
    </div>
  );
}
