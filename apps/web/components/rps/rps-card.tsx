"use client";

import { useState } from "react";
import { bannerText, canOpen, cardState, type RpsSummary } from "@/lib/rps";
import { PaperHand, RockHand, ScissorsHand } from "./hands";
import { RpsModal } from "./rps-modal";

function bar(rps: RpsSummary): { text: string; color: string } {
  const opponent = rps.opponent?.display_name ?? "Someone";
  switch (cardState(rps)) {
    case "make_move":
      return { text: "Make a move →", color: "#FDE047" };
    case "waiting":
      return { text: `Waiting for ${opponent}…`, color: "#E5E5E5" };
    case "see_result":
      return { text: "See the result →", color: "#4ADE80" };
    case "view_results":
      return { text: "View results →", color: "#4ADE80" };
    case "won":
      return { text: "You won!", color: "#4ADE80" };
    case "lost":
      return { text: "You lost", color: "#E5E5E5" };
    case "tie":
      return { text: "Tie! · Rematch →", color: "#FDE047" };
    case "result":
      return { text: bannerText(rps), color: "#E5E5E5" };
  }
}

const FRAME = "mt-1 block w-full sm:max-w-[360px] text-left border-2 border-black bg-white shadow-[4px_4px_0_black] p-3";
const PRESSABLE = "hover:shadow-[2px_2px_0_black] hover:translate-x-[2px] hover:translate-y-[2px] transition-all";

// Presentational card; RpsCard adds the modal. Split so the dev preview can
// render every state without tRPC. A finished game the viewer already watched
// renders as a plain box — there is nothing to reopen (no replays).
export function RpsCardView({ rps, onOpen }: { rps: RpsSummary; onOpen?: () => void }) {
  const challenger = rps.challenger?.display_name ?? "Someone";
  const opponent = rps.opponent?.display_name ?? "Someone";
  const { text, color } = bar(rps);
  const body = (
    <>
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
    </>
  );
  if (!canOpen(rps)) return <div className={FRAME}>{body}</div>;
  return (
    <button type="button" onClick={onOpen} className={`${FRAME} ${PRESSABLE}`}>
      {body}
    </button>
  );
}

export function RpsCard({ rps, threadId }: { rps: RpsSummary; threadId: string }) {
  const [open, setOpen] = useState(false);
  // Flip to "seen" as soon as the battle starts, so closing the modal leaves
  // a result-only card even before the server refresh lands.
  const [seenHere, setSeenHere] = useState(false);
  const view = seenHere && !rps.seen ? { ...rps, seen: true } : rps;
  return (
    <>
      <RpsCardView rps={view} onOpen={() => setOpen(true)} />
      {open && (
        <RpsModal gameId={rps.id} threadId={threadId} onSeen={() => setSeenHere(true)} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
