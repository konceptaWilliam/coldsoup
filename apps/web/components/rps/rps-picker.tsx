"use client";

import { RPS_LABEL, RPS_MOVES, type RpsMove } from "@/lib/rps";
import { Hand } from "./hands";

export function RpsPicker({
  onPick,
  disabled = false,
  prompt = "Pick your move",
}: {
  onPick: (move: RpsMove) => void;
  disabled?: boolean;
  prompt?: string;
}) {
  return (
    <div>
      <p className="font-mono text-[11px] font-bold text-neutral-600 uppercase tracking-wider mb-3">{prompt}</p>
      <div className="grid grid-cols-3 gap-3">
        {RPS_MOVES.map((m) => (
          <button
            key={m}
            type="button"
            disabled={disabled}
            onClick={() => onPick(m)}
            className="flex flex-col items-center gap-1 border-2 border-black bg-white pt-3 pb-2 shadow-[4px_4px_0_black] hover:shadow-[2px_2px_0_black] hover:translate-x-[2px] hover:translate-y-[2px] active:bg-yellow-300 transition-all disabled:opacity-50 disabled:pointer-events-none"
          >
            <Hand move={m} size={72} />
            <span className="font-mono text-[13px] font-extrabold text-black">{RPS_LABEL[m]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
