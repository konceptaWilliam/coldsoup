"use client";

import { useState } from "react";
import { cardState, type RpsCardState, type RpsSummary } from "@/lib/rps";
import { PaperHand, RockHand, ScissorsHand } from "./hands";
import { RpsModal } from "./rps-modal";

function bar(state: RpsCardState, opponent: string): { text: string; color: string } {
  switch (state) {
    case "make_move":
      return { text: "Make a move →", color: "#FDE047" };
    case "waiting":
      return { text: `Waiting for ${opponent}…`, color: "#E5E5E5" };
    case "won":
      return { text: "You won! · Replay →", color: "#4ADE80" };
    case "lost":
      return { text: "You lost · Replay →", color: "#E5E5E5" };
    case "tie":
      return { text: "Tie! · Rematch →", color: "#FDE047" };
    case "view_results":
      return { text: "View results →", color: "#4ADE80" };
  }
}

// Presentational card; RpsCard adds the modal. Split so the dev preview can
// render every state without tRPC.
export function RpsCardView({ rps, onOpen }: { rps: RpsSummary; onOpen?: () => void }) {
  const challenger = rps.challenger?.display_name ?? "Someone";
  const opponent = rps.opponent?.display_name ?? "Someone";
  const { text, color } = bar(cardState(rps), opponent);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="mt-1 block w-full sm:max-w-[360px] text-left border-2 border-black bg-white shadow-[4px_4px_0_black] p-3 hover:shadow-[2px_2px_0_black] hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono text-[10px] font-extrabold tracking-[0.15em] text-black">ROCK PAPER SCISSORS</span>
        <span className="border-2 border-black bg-yellow-300 px-1.5 py-px font-mono text-[9px] font-extrabold tracking-wider text-black">
          {rps.status === "done" ? "DONE" : "CHALLENGE"}
        </span>
      </div>
      <p className="font-mono text-[15px] font-extrabold text-black mb-2 truncate">
        {challenger} <span className="text-neutral-500">vs</span> {opponent}
      </p>
      <div className="flex justify-center gap-4 mb-2">
        <RockHand size={44} />
        <PaperHand size={44} />
        <ScissorsHand size={44} />
      </div>
      <div
        className="border-2 border-black py-1.5 text-center font-mono text-[13px] font-extrabold text-black"
        style={{ background: color }}
      >
        {text}
      </div>
    </button>
  );
}

export function RpsCard({ rps, threadId }: { rps: RpsSummary; threadId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <RpsCardView rps={rps} onOpen={() => setOpen(true)} />
      {open && <RpsModal gameId={rps.id} threadId={threadId} onClose={() => setOpen(false)} />}
    </>
  );
}
