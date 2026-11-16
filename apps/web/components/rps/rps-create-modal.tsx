"use client";

import { useState } from "react";
import type { RpsMove } from "@/lib/rps";
import { RpsPicker } from "./rps-picker";
import { RpsButton, RpsSheet, RpsWaiting } from "./rps-sheet";

type Member = { id: string; display_name: string };

export function OpponentList({ members, onPick }: { members: Member[]; onPick: (m: Member) => void }) {
  if (members.length === 0) {
    return (
      <p className="font-mono text-sm text-neutral-600 py-8 text-center">No one else in this group to challenge.</p>
    );
  }
  return (
    <div>
      <p className="font-mono text-[11px] font-bold text-neutral-600 uppercase tracking-wider mb-3">
        Who do you challenge?
      </p>
      <div className="grid gap-2">
        {members.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => onPick(m)}
            className="text-left border-2 border-black bg-white px-3 py-3 font-mono text-[14px] font-extrabold text-black shadow-[3px_3px_0_black] hover:shadow-[1px_1px_0_black] hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
          >
            {m.display_name}
          </button>
        ))}
      </div>
    </div>
  );
}

// Opponent → move → waiting. onSubmit resolves once the challenge is stored.
export function RpsCreateModal({
  members,
  meId,
  onSubmit,
  onClose,
}: {
  members: Member[];
  meId: string;
  onSubmit: (opponentId: string, move: RpsMove) => Promise<unknown>;
  onClose: () => void;
}) {
  const others = members.filter((m) => m.id !== meId);
  const [opponent, setOpponent] = useState<Member | null>(null);
  const [step, setStep] = useState<"opponent" | "move" | "waiting">("opponent");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(move: RpsMove) {
    if (!opponent) return;
    setPending(true);
    setError(null);
    try {
      await onSubmit(opponent.id, move);
      setStep("waiting");
    } catch {
      setError("Couldn't send the challenge. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <RpsSheet title="Rock, paper, scissors.." onClose={onClose}>
      {step === "opponent" && (
        <OpponentList
          members={others}
          onPick={(m) => {
            setOpponent(m);
            setStep("move");
          }}
        />
      )}
      {step === "move" && opponent && (
        <>
          <button
            type="button"
            onClick={() => setStep("opponent")}
            className="font-mono text-[12px] font-bold text-neutral-600 hover:text-black mb-3"
          >
            ← Change opponent
          </button>
          <RpsPicker onPick={pick} disabled={pending} prompt={`Your move against ${opponent.display_name}`} />
          {error && <p className="mt-3 font-mono text-[12px] font-bold text-red-600">{error}</p>}
        </>
      )}
      {step === "waiting" && opponent && (
        <>
          <RpsWaiting name={opponent.display_name} />
          <RpsButton onClick={onClose}>Close</RpsButton>
        </>
      )}
    </RpsSheet>
  );
}
